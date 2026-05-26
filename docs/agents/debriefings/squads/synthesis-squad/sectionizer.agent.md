---
name: sectionizer
version: 1
squad: synthesis-squad
type: llm
description: |
  Recebe findings consolidados do Source Squad e cria outline estruturado das
  11 seções do template FLG, com 3-7 bullets prioritários por seção e source_refs
  apontando aos findings que embasam cada bullet.
when_to_invoke: |
  Fase 5a do pipeline, primeira ação do Synthesis Squad. Orchestrator invoca
  após Checkpoint 1 (findings persistidos). Compositor invoca depois.
owner: pedroaranda@grupoguglielmi.com
model: claude-sonnet-4-6              # claude-opus-4-7 se USE_OPUS=true
temperature: 0.3
max_input_tokens: 80000
max_output_tokens: 4000
thinking_budget: 2000
input_schema: backend/agents/debriefings/schemas/synthesis_output.py:SectionizerInput
output_schema: backend/agents/debriefings/schemas/synthesis_output.py:SectionizerOutput
tools:
  - read_findings
prompt_file: docs/agents/debriefings/prompts/sectionizer/v1.md
implementation_file: backend/agents/debriefings/squads/synthesis/sectionizer.py
on_failure: abort_squad
max_retries: 1
timeout_soft_seconds: 30
timeout_hard_seconds: 60
max_cost_usd: 0.20
trace_tags: [debriefing, synthesis, sectionizer]
metrics:
  - tokens_in
  - tokens_out
  - cost_usd
  - sections_produced
  - bullets_per_section_avg
maturity: validated
last_review: 2026-05-26
---

# Sectionizer

> Decide o ESQUELETO do debriefing antes da prosa. Pega findings, decide quais bullets vão em quais das 11 seções FLG, mapeia source_refs. Não escreve prosa — só estrutura.

## Papel

**Em escopo:**
- Receber `SourceFindings` completos (clickup + drive classificados)
- Distribuir os findings nas 11 seções fixas do template FLG (Resumo Executivo, Perfil Estratégico, Timeline, Inventário Entregáveis, Análise Reuniões, Dinâmica Consultor↔Cliente, Resultados Documentados, Avaliação Estratégica FLG, Gaps e Pendências, Recomendações Próximo Ciclo, Anexo Fontes)
- Pra cada seção: definir 3-7 bullets prioritários (curtos, factuais, com source_refs)
- Aplicar metodologia FLG: identificar elementos de Cadeira Vazia, Tríades, Schwartz quando dados sustentam

**Fora de escopo:**
- Redigir prosa final (cabe ao compositor)
- Inventar bullets sem source_refs (Quality Squad falha)
- Avaliar qualidade dos próprios findings (cabe ao Source Squad anterior)

## Activation

Invocado por Orchestrator na Fase 5a quando:
- `state.source_findings` populado E persistido em checkpoint
- `state.accumulated_cost_usd < 5.0`

## Inputs / Outputs

```python
class SectionizerInput(BaseModel):
    debriefing_id: str
    cliente_nome: str
    cliente_empresa: str
    consultor: str
    ciclo_numero: int
    periodo_inicio: date
    periodo_fim: date
    findings: SourceFindings        # do Source Squad

class SectionOutline(BaseModel):
    section_num: str                # "1", "2.1", "7.3"
    section_title: str
    bullets_prioritarios: list[BulletWithRefs]
    source_refs: list[str]          # IDs únicos dos findings usados (consolidado)

class BulletWithRefs(BaseModel):
    text: str                       # curto, factual, ≤200 chars
    source_refs: list[str]          # IDs específicos pra ESTE bullet
    flg_category: Optional[Literal["cadeira_vazia", "triade", "schwartz", "progressao_autoridade", "fato_geral"]]

class SectionizerOutput(BaseModel):
    outline: list[SectionOutline]   # 11 seções, sempre nessa ordem fixa
    metadata: AgentMetadata
```

## Tools / Capabilities

- `read_findings(findings: SourceFindings) -> structured_dict` — Python puro, sem LLM. Reorganiza findings por tipo pro prompt.

(Não há ferramentas externas — sectionizer trabalha 100% sobre o input.)

## System Prompt

Versionado em [`../../prompts/sectionizer/v1.md`](../../prompts/sectionizer/v1.md). Pontos-chave:

> "You are the Sectionizer for the FLG debriefing pipeline. Given consolidated findings from ClickUp tasks and Drive documents, produce a structured outline mapping each finding to one of the 11 mandatory sections of the FLG template. Each bullet must reference specific source IDs. Apply FLG methodology categorization where supported by data: cadeira_vazia, triade_comportamental, schwartz_consciousness_level, progressao_autoridade. Output strict JSON matching SectionizerOutput schema. DO NOT write prose — only structured outline."

## Error handling

| Erro | Comportamento |
|---|---|
| Findings vazios (Source Squad falhou tudo) | Abort com erro acionável — não é possível sectionar sem fontes |
| Schema violation no output | Retry 1 vez com correção no prompt. Se falhar de novo: abort |
| Cost cap excedido | Abort — não chega no compositor |
| Timeout > 60s | Abort com issue |

## Observability

**Métricas:**
- `flg_sectionizer_sections_produced` (sempre 11 idealmente; alerta se ≠11)
- `flg_sectionizer_bullets_per_section` (histogram; média esperada 4-5)
- `flg_sectionizer_source_refs_per_bullet` (alerta se 0)
- `flg_sectionizer_flg_categories_distribution` — quantos bullets categorizados em cada framework FLG

**Logs:** `backend/logs/agents/sectionizer.jsonl`

## Cost / Latency baseline

Com prompt caching (template + metodologia FLG cacheados):

| Métrica | Esperado (Sonnet) | Com Opus opt-in |
|---|---|---|
| Tokens in | 25k | 25k |
| Tokens out | 3k | 3k |
| Custo USD | $0,08 | $0,25 |
| Latência | 20-30s | 40-50s |

## Como testar localmente

```bash
cd backend
export ANTHROPIC_API_KEY=sk_xxx

python -m agents.debriefings.squads.synthesis.sectionizer \
  --findings findings.json \
  --cliente-nome "Cliente Teste" \
  --output outline.json
```

Validar: `outline.json` tem 11 seções, cada uma com ≥3 bullets, todos com source_refs não-vazios.

## Changelog

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-05-26 | v1 | Spec inicial | Pedro Aranda |
