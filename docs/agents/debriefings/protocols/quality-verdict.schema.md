# Quality Verdict Schema

> Saída do Quality Squad. Orchestrator usa pra decidir accept / retry / abort.

**Implementação:** `backend/agents/debriefings/schemas/quality_verdict.py`

---

```python
class QualityVerdict(BaseModel):
    """Output consolidado do Quality Squad."""
    pass_: bool                            # Pydantic alias 'pass' (palavra reservada)
    score_overall: int                     # 0-100 (média dos sub-scores)
    citation_verdict: CitationVerdict
    style_verdict: StyleVerdict
    issues: list[Issue]                    # consolidado de ambos
    metadata: SquadMetadata
```

---

## CitationVerdict (do `citation-verifier`)

```python
class CitationVerdict(BaseModel):
    pass_: bool
    score: int                             # 0-100
    bullets_factuais_total: int
    bullets_with_citation: int
    citation_coverage_pct: float           # 0.0-1.0
    claims_sampled: int
    hallucinations_detected: int
    issues: list[Issue]
    metadata: AgentMetadata
```

**Regra pass:**
```python
citation_verdict.pass_ = (
    citation_coverage_pct >= 0.80 AND
    hallucinations_detected == 0 AND
    score >= 80
)
```

---

## StyleVerdict (do `style-reviewer`)

```python
class StyleIssue(BaseModel):
    severity: Literal["fatal", "warning"]
    section: Optional[str]
    excerpt: str                           # trecho problemático
    issue_type: Literal["ai_self_ref", "first_person_singular",
                          "giria", "coloquialismo", "outro"]
    suggested_fix: Optional[str]

class StyleVerdict(BaseModel):
    pass_: bool
    score: int
    fatal_violations: list[StyleIssue]
    warnings: list[StyleIssue]
    issues: list[Issue]                    # mapeamento pra Issue universal
    metadata: AgentMetadata
```

**Regra pass:**
```python
style_verdict.pass_ = (
    len(fatal_violations) == 0 AND
    score >= 70
)
```

---

## Verdict consolidado (Orchestrator)

```python
quality_verdict.pass_ = (
    citation_verdict.pass_ AND
    style_verdict.pass_ AND
    citation_verdict.score >= 80 AND
    style_verdict.score >= 70
)

quality_verdict.score_overall = int(
    (citation_verdict.score + style_verdict.score) / 2
)
```

---

## Issue (universal)

Tipo carregado em `quality_verdict.issues` (consolidado dos 2 sub-verdicts):

```python
class Issue(BaseModel):
    severity: Literal["fatal", "high", "medium", "low", "warning"]
    section: Optional[str] = None          # ex: "7.3"
    agent: str                              # quem reportou
    issue: str                              # descrição
    suggested_fix: Optional[str] = None
    timestamp: datetime
```

---

## Como Orchestrator usa o verdict

```python
if verdict.pass_:
    proceed_to_pdf_render(state)
elif state.retry_count < 1:
    # Filtra issues acionáveis pelo compositor
    actionable = [i for i in verdict.issues if i.severity in ("fatal", "high")]
    retry_compositor(state, actionable_issues=actionable)
else:
    abort(state, erro=f"Quality fail após 1 retry: {verdict.issues}")
```

---

## Exemplo de verdict (mini)

```json
{
  "pass_": false,
  "score_overall": 75,
  "citation_verdict": {
    "pass_": false,
    "score": 70,
    "bullets_factuais_total": 42,
    "bullets_with_citation": 30,
    "citation_coverage_pct": 0.71,
    "claims_sampled": 10,
    "hallucinations_detected": 0,
    "issues": [
      {
        "severity": "high",
        "section": "7.3",
        "agent": "citation-verifier",
        "issue": "Bullet 'aumento de 40% no engagement' não tem citation_uri inline",
        "suggested_fix": "Adicionar [fonte: gd_relatorio_abr] após o número"
      }
    ],
    "metadata": {...}
  },
  "style_verdict": {
    "pass_": true,
    "score": 85,
    "fatal_violations": [],
    "warnings": [
      {
        "severity": "warning",
        "section": "5",
        "excerpt": "...tudo tá bem alinhado...",
        "issue_type": "giria",
        "suggested_fix": "trocar 'tá' por 'está'"
      }
    ],
    "issues": [...],
    "metadata": {...}
  },
  "issues": [
    {"severity": "high", "section": "7.3", "agent": "citation-verifier", "issue": "..."},
    {"severity": "warning", "section": "5", "agent": "style-reviewer", "issue": "..."}
  ],
  "metadata": {
    "squad_name": "quality",
    "total_cost_usd": 0.04,
    "total_duration_ms": 18000,
    "parallelism": "parallel"
  }
}
```

Neste exemplo: `pass_=false` por causa do citation coverage <80%. Orchestrator dispara retry do compositor com `actionable_issues = [high]`.
