---
name: citation-verifier
version: 1
squad: quality-squad
type: llm
description: |
  Audita o markdown do compositor: cada claim factual tem citation_uri inline?
  Números (%, R$, datas) batem com findings? Há invenções? Reporta issues
  estruturados pro Orchestrator decidir retry/abort/pass.
when_to_invoke: |
  Fase 7a do pipeline, em paralelo com style-reviewer. Orchestrator invoca via
  asyncio.gather(). Não invoca outros agentes.
owner: pedroaranda@grupoguglielmi.com
model: claude-haiku-4-5
temperature: 0.1
max_input_tokens: 40000
max_output_tokens: 2000
input_schema: backend/agents/debriefings/schemas/quality_verdict.py:CitationVerifierInput
output_schema: backend/agents/debriefings/schemas/quality_verdict.py:CitationVerdict
tools:
  - sample_claims_from_markdown
  - lookup_finding_by_source_ref
prompt_file: docs/agents/debriefings/prompts/citation-verifier/v1.md
implementation_file: backend/agents/debriefings/squads/quality/citation_verifier.py
on_failure: return_warning_not_fatal
max_retries: 0
timeout_soft_seconds: 30
timeout_hard_seconds: 60
max_cost_usd: 0.05
trace_tags: [debriefing, quality, citation]
metrics:
  - tokens_in
  - tokens_out
  - cost_usd
  - claims_sampled
  - hallucinations_detected
  - score
maturity: validated
last_review: 2026-05-26
---

# Citation Verifier

> Audita o markdown do compositor pra garantir que cada claim factual tem citation rastreável + zero invenções. Anti-hallucination de produção.

## Papel

**Em escopo:**
- Receber `markdown` + `findings` completos
- Identificar bullets factuais no markdown (linhas começando com `-` ou `*` que contêm números, datas, nomes próprios, métricas)
- Pra cada bullet factual: verificar se contém citation inline (`[fonte: source_id]`) E se o source_id existe nos findings
- Sample 10 claims aleatórios e validar contra findings:
  - Número/data citados batem com algum finding?
  - Não há invenção (claim sem suporte em finding)?
- Reportar score (0-100) e issues estruturados

**Fora de escopo:**
- Validar tom/estilo (cabe ao style-reviewer)
- Avaliar QUALIDADE da síntese (subjetivo, fica pro Pedro revisar manual)
- Corrigir o markdown (só reporta — quem corrige é o compositor em retry)

## Activation

Invocado por Orchestrator na Fase 7a quando:
- `state.synthesis_output.markdown` populado
- `state.source_findings` ainda disponível (pra cross-check)

## Inputs / Outputs

```python
class CitationVerifierInput(BaseModel):
    debriefing_id: str
    markdown: str
    findings: SourceFindings
    sample_size: int = 10

class CitationVerdict(BaseModel):
    pass_: bool
    score: int                              # 0-100
    bullets_factuais_total: int
    bullets_with_citation: int
    citation_coverage_pct: float            # bullets_with_citation / bullets_factuais_total
    claims_sampled: int
    hallucinations_detected: int            # claims sem suporte em findings
    issues: list[Issue]
    metadata: AgentMetadata
```

## Regra de pass/fail

```python
verdict.pass_ = (
    citation_coverage_pct >= 0.80 AND        # ≥80% bullets factuais com citation
    hallucinations_detected == 0 AND
    score >= 80
)

# score calculation:
score = (
    0.5 * citation_coverage_pct * 100 +     # peso 50% pra coverage
    0.4 * (1 - hallucinations_detected / claims_sampled) * 100 +  # 40% pra honestidade
    0.1 * (todos_numbers_match_findings)    # 10% pra precisão numérica
)
```

## Tools / Capabilities

- `sample_claims_from_markdown(md, n=10) -> list[Claim]` — Python regex, identifica linhas com números/datas/nomes próprios
- `lookup_finding_by_source_ref(ref, findings) -> Optional[Finding]` — Python lookup

(Sem tools externas. Verifier trabalha sobre input direto.)

## System Prompt

Versionado em [`../../prompts/citation-verifier/v1.md`](../../prompts/citation-verifier/v1.md). Pontos-chave:

> "You are the Citation Verifier for the FLG debriefing pipeline. Audit the markdown for: (1) every factual bullet has inline citation [fonte: source_id], (2) sampled claims (n=10) match findings exactly — no hallucinated numbers, dates, names. Output strict JSON matching CitationVerdict. Be PRECISE — false positive (rejecting OK markdown) is acceptable; false negative (passing markdown with hallucinations) is NOT."

## Error handling

| Erro | Comportamento |
|---|---|
| Cost cap excedido | Retorna verdict com `pass_=true` mas score=0 e issue "cost cap — review skipped". Orchestrator decide se aceita. |
| Timeout > 60s | Idem (review skipped, score=0) |
| Schema violation | Retorna fallback verdict com `pass_=false, score=50, issue="verifier output invalid"` — força retry conservador |
| Markdown vazio | `pass_=false, score=0, issue="empty markdown"` |

## Observability

**Métricas:**
- `flg_citation_verifier_score` (histogram, esperado mediana 85-95)
- `flg_citation_verifier_hallucinations_total` (counter — esperado próximo de 0)
- `flg_citation_verifier_pass_rate` (esperado >90%)

**Logs:** `backend/logs/agents/citation_verifier.jsonl`

## Cost / Latency baseline

| Métrica | Esperado | P95 |
|---|---|---|
| Tokens in | 18k | 30k |
| Tokens out | 1k | 2k |
| Custo USD | $0,025 | $0,05 |
| Latência | 10-15s | 30s |

## Como testar localmente

```bash
cd backend
python -m agents.debriefings.squads.quality.citation_verifier \
  --markdown debriefing.md \
  --findings findings.json \
  --output verdict.json
```

Validar: `verdict.json` tem `score`, `issues` populado se houver problemas.

## Changelog

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-05-26 | v1 | Spec inicial | Pedro Aranda |
