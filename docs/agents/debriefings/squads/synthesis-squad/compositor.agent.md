---
name: compositor
version: 1
squad: synthesis-squad
type: llm
description: |
  Recebe outline do sectionizer + findings completos e redige prosa do Markdown
  final do debriefing seguindo o template FLG de ~20 páginas. Cada bullet do
  outline vira parágrafo(s) prosa estratégica com tom corporativo FLG.
when_to_invoke: |
  Fase 5b — APÓS sectionizer. Também invocado em retry (max 1) pelo Orchestrator
  se Quality Squad reportar issues fixáveis.
owner: pedroaranda@grupoguglielmi.com
model: claude-sonnet-4-6              # claude-opus-4-7 se USE_OPUS=true
temperature: 0.5
max_input_tokens: 100000
max_output_tokens: 16000
thinking_budget: 3000
input_schema: backend/agents/debriefings/schemas/synthesis_output.py:CompositorInput
output_schema: backend/agents/debriefings/schemas/synthesis_output.py:CompositorOutput
tools:
  - read_outline
  - read_findings
prompt_file: docs/agents/debriefings/prompts/compositor/v1.md
implementation_file: backend/agents/debriefings/squads/synthesis/compositor.py
on_failure: retry_once_then_abort
max_retries: 1                        # via Orchestrator quando Quality fail
timeout_soft_seconds: 90
timeout_hard_seconds: 180
max_cost_usd: 0.80
trace_tags: [debriefing, synthesis, compositor]
metrics:
  - tokens_in
  - tokens_out
  - cost_usd
  - markdown_chars_produced
  - sections_with_citations_pct
  - retries
maturity: validated
last_review: 2026-05-26
---

# Compositor

> Traduz outline + findings em prosa estratégica do Markdown final. Aplica tom corporativo FLG (primeira pessoa do plural, sem gírias). Cada claim factual cita o source_id correspondente. Quality Squad valida antes de virar PDF.

## Papel

**Em escopo:**
- Receber `outline` do sectionizer e `findings` completos
- Pra cada `SectionOutline` do outline, redigir prosa em Markdown:
  - Parágrafo introdutório curto da seção
  - Bullets factuais com citações inline (`[fonte: clickup.task_xyz]` ou `[fonte: drive.doc_abc]`)
  - Análise interpretativa baseada em metodologia FLG quando categoria sinalizar
- Aplicar tom corporativo FLG (primeira pessoa do plural "a FLG observa", "nossa equipe identificou", sem gírias, sem "como AI eu...")
- Preservar a estrutura das 11 seções do template (não inventar seção nova nem omitir)
- Em modo retry: receber `previous_markdown` + `quality_issues`, corrigir apenas os issues, manter resto idêntico

**Fora de escopo:**
- Decidir QUAIS bullets entram em QUAIS seções (sectionizer já decidiu)
- Inventar fatos que não estão em findings (Quality Squad falha)
- Validar próprio output (Quality Squad faz isso)

## Activation

Invocado por Orchestrator:
- **Primeira chamada (Fase 5b):** input = `outline` + `findings`
- **Retry (caso Quality Squad fail e retry_count<1):** input = `outline` + `findings` + `previous_markdown` + `quality_issues`

## Inputs / Outputs

```python
class CompositorInput(BaseModel):
    debriefing_id: str
    cliente_context: ClienteContext     # nome, empresa, consultor, ciclo, período
    outline: list[SectionOutline]
    findings: SourceFindings
    # Apenas em retry:
    previous_markdown: Optional[str] = None
    quality_issues: Optional[list[Issue]] = None

class CompositorOutput(BaseModel):
    markdown: str                       # Markdown completo, ~12-20k chars
    sections_count: int                 # esperado 11
    citations_count: int                # quantas citações inline
    metadata: AgentMetadata
```

## Template Markdown obrigatório

Seções fixas (sectionizer garante o outline com essas):

```
# Debriefing Estratégico — {Cliente} | {Empresa}

> Metadata (período, consultor, data)

## 1. Resumo Executivo                          (1 parágrafo denso 150-250 palavras)
## 2. Perfil Estratégico do Cliente
   ### 2.1 Identidade e Posicionamento
   ### 2.2 Tríade Comportamental
   ### 2.3 Schwartz (Níveis de Consciência)
## 3. Timeline de Execução                      (tabela cronológica)
## 4. Inventário de Entregáveis
## 5. Análise de Reuniões
## 6. Dinâmica Consultor↔Cliente
## 7. Resultados Documentados
   ### 7.1 Métricas Quantitativas (tabela)
   ### 7.2 Resultados Qualitativos
   ### 7.3 Resultados de Negócio
## 8. Avaliação Estratégica (Metodologia FLG)
   ### 8.1 Cadeira Vazia
   ### 8.2 Progressão de Autoridade
   ### 8.3 Consistência Narrativa
   ### 8.4 Aplicação das Tríades
## 9. Gaps e Pendências
## 10. Recomendações para o Próximo Ciclo
## 11. Anexo — Fontes Consultadas              (lista de URLs do Drive + ClickUp)
```

## Tools / Capabilities

Sem tools externas. Compositor trabalha 100% sobre `input`. (Reusa via Python: cliente.context, outline, findings.)

## System Prompt

Versionado em [`../../prompts/compositor/v1.md`](../../prompts/compositor/v1.md). Pontos-chave:

> "You are the Compositor for the FLG debriefing pipeline. Given an outline and consolidated findings, produce the final Markdown debriefing document following the FLG 11-section template EXACTLY. For each bullet in the outline, write 1-3 sentences of strategic prose with inline citations `[fonte: source_id]`. Apply FLG corporate tone: 'a FLG observa', 'nossa equipe identifica' — never first-person singular ('eu acho') nor AI self-reference ('como modelo...'). DO NOT invent facts not present in findings. DO NOT add sections beyond the 11 template sections. In retry mode, fix ONLY the listed issues — keep everything else identical to previous_markdown."

## Error handling

| Erro | Comportamento |
|---|---|
| Output excede 16k tokens | Trunca seções menos críticas (Anexo 11, Análise Reuniões), avisa via issue |
| Output não é Markdown válido | Retry 1 com correção. Se falhar: abort com erro |
| Output faltando seção do template | Retry 1. Se falhar: abort |
| Cost cap excedido | Abort com issue "cost cap at compositor" |
| Retry mode + issues sem solução clara | Devolve `previous_markdown` + warning "couldn't fix issue X" |

## Observability

**Métricas:**
- `flg_compositor_markdown_chars` (histogram; esperado 12k-20k)
- `flg_compositor_citations_inline` (histogram; alerta se <10)
- `flg_compositor_sections_count` (alerta se ≠11)
- `flg_compositor_retries` (counter; esperado 0; alerta se >0.1 média)

**Logs:** `backend/logs/agents/compositor.jsonl`

## Cost / Latency baseline

Com prompt caching (template + tom FLG cacheados):

| Métrica | Esperado (Sonnet) | Com Opus opt-in |
|---|---|---|
| Tokens in | 30k | 30k |
| Tokens out | 12k | 12k |
| Custo USD | $0,28 | $1,30 |
| Latência | 60-90s | 120-180s |

## Como testar localmente

```bash
cd backend
export ANTHROPIC_API_KEY=sk_xxx

python -m agents.debriefings.squads.synthesis.compositor \
  --outline outline.json \
  --findings findings.json \
  --cliente-context context.json \
  --output debriefing.md
```

Validar:
- `debriefing.md` tem todas as 11 seções
- Cada seção factual tem ≥1 citação inline
- Sem strings "como AI eu", "como modelo de linguagem", "sou um assistente"
- Sem gírias ("tá", "pra", "num")

## Changelog

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-05-26 | v1 | Spec inicial | Pedro Aranda |
