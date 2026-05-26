# Quality Squad

**Missão:** auditar o output do Synthesis Squad antes do PDF. Generator-Verifier pattern (Anthropic oficial). Sem este squad, multi-agent é mais ruidoso que single-agent (CLEAR Framework: pass@k 60% → 25%). Squad é **OBRIGATÓRIO**, não opcional.

## Agentes deste squad (2)

| Agente | Tipo | Modelo | Spec |
|---|---|---|---|
| `citation-verifier` | LLM | Haiku 4.5 | [`citation-verifier.agent.md`](citation-verifier.agent.md) |
| `style-reviewer` | LLM | Haiku 4.5 | [`style-reviewer.agent.md`](style-reviewer.agent.md) |

## Schema de output do squad

Implementado em `backend/agents/debriefings/schemas/quality_verdict.py`. Detalhado em [`../../protocols/quality-verdict.schema.md`](../../protocols/quality-verdict.schema.md).

```python
class QualityVerdict(BaseModel):
    """Output consolidado do Quality Squad."""
    pass_: bool                                # alias 'pass' do Pydantic
    score_overall: int                         # 0-100
    citation_verdict: SingleVerdict
    style_verdict: SingleVerdict
    issues: list[Issue]                        # consolidado de ambos
    metadata: SquadMetadata

class SingleVerdict(BaseModel):
    agent: str                                 # "citation-verifier" | "style-reviewer"
    pass_: bool
    score: int                                 # 0-100
    issues: list[Issue]

class Issue(BaseModel):
    severity: Literal["fatal", "high", "medium", "low"]
    section: Optional[str]                     # ex: "7.3"
    agent: str                                 # quem reportou
    issue: str                                 # descrição
    suggested_fix: Optional[str]               # se tem sugestão de correção
```

## Princípios

1. **Paralelos.** `citation-verifier` e `style-reviewer` independentes, rodam via `asyncio.gather()` no Orchestrator.
2. **Verdict consolidado pelo Orchestrator.** Cada agente reporta seu verdict; orchestrator combina:

   ```python
   verdict.pass_ = (
       citation_verdict.pass_ AND
       style_verdict.pass_ AND
       citation_verdict.score >= 80 AND
       style_verdict.score >= 70
   )
   ```

3. **Falhas dispararam retry do compositor, não da quality.** Quality não retentou ele mesmo — se Quality tem bug, é problema do prompt do verifier, não problema do markdown.
4. **Modelos baratos.** Haiku 4.5 — verifier tasks são alto volume + baixa complexidade. Sonnet só se Pedro reportar que Haiku confunde.

## Fluxo interno

```
        ┌──────────────────┐
        │  Orchestrator    │
        │ dispatch_qual()  │
        └────────┬─────────┘
                 │
       ┌─────────┴─────────┐
       │                   │
   asyncio.gather          │
       │                   │
┌──────▼─────────┐ ┌──────▼─────────┐
│ citation-      │ │ style-reviewer │
│   verifier     │ │ (Haiku 4.5)    │
│ (Haiku 4.5)    │ │ tom corporativo│
│ claims vs      │ │ FLG            │
│ findings       │ │                │
└──────┬─────────┘ └──────┬─────────┘
       │                   │
       └────────┬──────────┘
                │
       ┌────────▼──────────┐
       │ QualityVerdict    │
       │ consolidado       │
       │ pelo Orchestrator │
       └───────────────────┘
```

## Cost / Latency baseline do squad

| Métrica | Esperado | P95 |
|---|---|---|
| Custo USD | $0,04 | $0,08 |
| Latência (paralelo) | 15-25s | 45s |

## Owner

`pedroaranda@grupoguglielmi.com`
