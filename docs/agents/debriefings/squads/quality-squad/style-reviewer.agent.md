---
name: style-reviewer
version: 1
squad: quality-squad
type: llm
description: |
  Audita o markdown do compositor pra tom corporativo FLG: sem gírias, sem
  primeira pessoa singular ("eu acho"), sem AI self-reference, primeira
  pessoa do plural preferida ("a FLG observa", "nossa equipe identifica").
when_to_invoke: |
  Fase 7b do pipeline, em paralelo com citation-verifier. Orchestrator invoca
  via asyncio.gather(). Não invoca outros agentes.
owner: pedroaranda@grupoguglielmi.com
model: claude-haiku-4-5
temperature: 0.1
max_input_tokens: 30000
max_output_tokens: 1500
input_schema: backend/agents/debriefings/schemas/quality_verdict.py:StyleReviewerInput
output_schema: backend/agents/debriefings/schemas/quality_verdict.py:StyleVerdict
tools:
  - regex_check_styling
prompt_file: docs/agents/debriefings/prompts/style-reviewer/v1.md
implementation_file: backend/agents/debriefings/squads/quality/style_reviewer.py
on_failure: return_warning_not_fatal
max_retries: 0
timeout_soft_seconds: 20
timeout_hard_seconds: 45
max_cost_usd: 0.03
trace_tags: [debriefing, quality, style]
metrics:
  - tokens_in
  - tokens_out
  - cost_usd
  - style_violations_total
  - score
maturity: validated
last_review: 2026-05-26
---

# Style Reviewer

> Audita tom corporativo FLG no markdown. Híbrido: regex Python pega 90% das violações (gírias, self-reference), LLM Haiku avalia nuances (formalidade, fluxo).

## Papel

**Em escopo:**
- Buscar violações de estilo no markdown:
  - 🔴 **Fatal**: "como AI", "como modelo de linguagem", "sou um assistente", "I am Claude"
  - 🔴 **Fatal**: primeira pessoa singular em contexto FLG ("eu acho", "eu identifico" sem "nós")
  - 🟡 **Warning**: gírias ("tá", "pra", "num", "numa", "vai", "manda")
  - 🟡 **Warning**: tom coloquial excessivo ("né", "ai", "tipo assim")
- Reportar score (0-100) e issues estruturados
- Sugerir correção quando trivial (ex: "tá" → "está")

**Fora de escopo:**
- Validar fatos/citations (cabe ao citation-verifier)
- Reescrever o markdown (só reporta — compositor corrige em retry)
- Decisão estética subjetiva (cor, formatação) — focado em tom verbal

## Activation

Invocado por Orchestrator na Fase 7b. Independente do citation-verifier.

## Inputs / Outputs

```python
class StyleReviewerInput(BaseModel):
    debriefing_id: str
    markdown: str

class StyleVerdict(BaseModel):
    pass_: bool
    score: int                              # 0-100
    fatal_violations: list[StyleIssue]      # AI self-ref, 1ª pessoa singular
    warnings: list[StyleIssue]              # gírias, coloquialismos
    issues: list[Issue]                     # consolidado pro Orchestrator
    metadata: AgentMetadata

class StyleIssue(BaseModel):
    severity: Literal["fatal", "warning"]
    section: Optional[str]                  # "7.3" se identificável
    excerpt: str                            # trecho problemático
    issue_type: Literal["ai_self_ref", "first_person_singular", "giria", "coloquialismo", "outro"]
    suggested_fix: Optional[str]
```

## Regra de pass/fail

```python
verdict.pass_ = (
    len(fatal_violations) == 0 AND
    score >= 70
)

# score calculation:
score = 100 - (len(fatal_violations) * 25) - (len(warnings) * 5)
score = max(0, min(100, score))
```

## Tools / Capabilities

**Camada Python (regex, free):**
- `regex_check_styling(md) -> list[StyleIssue]` — pega gírias e AI self-ref via patterns:

  ```python
  PATTERNS_FATAL = [
      (r"\b(como\s+AI|como\s+modelo|sou\s+um?\s+assistente|I\s+am\s+Claude)\b", "ai_self_ref"),
  ]
  PATTERNS_WARNING = [
      (r"\b(tá|pra|num|numa)\b", "giria"),
      (r"\b(né|tipo\s+assim|ai\s+)", "coloquialismo"),
  ]
  ```

**Camada LLM (avalia nuance):**
- Recebe o markdown completo + lista de violations regex
- Avalia primeira pessoa singular (regex difícil distinguir "eu" pessoal vs "eu" do narrador)
- Avalia fluxo geral (qualitativo)
- Sugere correções pra issues sem fix óbvio

## System Prompt

Versionado em [`../../prompts/style-reviewer/v1.md`](../../prompts/style-reviewer/v1.md). Pontos-chave:

> "You are the Style Reviewer for the FLG debriefing pipeline. Audit the markdown for FLG corporate tone violations: AI self-reference (fatal), first-person singular without 'nós' context (fatal), gírias informais (warning), coloquialismos (warning). FLG preferred tone: 'a FLG observa', 'nossa equipe identifica', primeira pessoa do plural. Output strict JSON matching StyleVerdict. For each issue, provide section reference and suggested_fix when trivial."

## Error handling

| Erro | Comportamento |
|---|---|
| Cost cap excedido | Retorna `pass_=true, score=70, issue="cost cap — review skipped"` |
| Timeout > 45s | Idem |
| Schema violation | Fallback `pass_=true, warning="reviewer output invalid"` (mais permissivo que citation-verifier — style é menos crítico) |

## Observability

**Métricas:**
- `flg_style_reviewer_score` (histogram, esperado mediana 80-95)
- `flg_style_reviewer_fatal_violations_total` (counter — esperado 0)
- `flg_style_reviewer_warnings_total` (histogram, esperado 0-3)

**Logs:** `backend/logs/agents/style_reviewer.jsonl`

## Cost / Latency baseline

| Métrica | Esperado | P95 |
|---|---|---|
| Tokens in | 12k | 20k |
| Tokens out | 800 | 1500 |
| Custo USD | $0,015 | $0,03 |
| Latência | 8-12s | 25s |

## Como testar localmente

```bash
cd backend
python -m agents.debriefings.squads.quality.style_reviewer \
  --markdown debriefing.md \
  --output style_verdict.json
```

Validar: `style_verdict.json` tem `fatal_violations=[]` e `warnings` pequenos pra debriefing bem composto.

## Changelog

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-05-26 | v1 | Spec inicial | Pedro Aranda |
