# State Schema — DebriefingState

> Pydantic model que carrega o estado completo do pipeline. Cada agente recebe a fatia relevante e devolve uma fatia atualizada — Orchestrator é dono da consolidação.

**Implementação:** `backend/agents/debriefings/schemas/state.py`

---

## Hierarquia de schemas

```
DebriefingState (root)
├── request: DebriefingRequest
├── cliente_context: ClienteContext       (carregado do banco no Init)
├── source_findings: Optional[SourceFindings]
│   ├── clickup: ClickUpFindings
│   └── drive: DriveFindings (items classified)
├── synthesis_output: Optional[SynthesisOutput]
│   ├── outline: list[SectionOutline]
│   └── markdown: str
├── quality_verdict: Optional[QualityVerdict]
│   ├── citation_verdict: CitationVerdict
│   └── style_verdict: StyleVerdict
├── retry_count: int
├── accumulated_cost_usd: float
├── accumulated_tokens: TokenCounters
├── issues: list[Issue]
└── timing: dict[phase_name, duration_seconds]
```

---

## DebriefingRequest

```python
class DebriefingRequest(BaseModel):
    """Input do POST /debriefings."""
    cliente_id: str
    ciclo_numero: int = Field(ge=1)
    periodo_inicio: date
    periodo_fim: date
    clickup_list_id: Optional[str] = None
    drive_folder_id: Optional[str] = None
    gerado_por_email: str
    use_opus: bool = False             # opt-in pra Sonnet→Opus no synthesis squad

    @model_validator(mode='after')
    def validate_periodo(self):
        if self.periodo_fim < self.periodo_inicio:
            raise ValueError("periodo_fim deve ser >= periodo_inicio")
        return self
```

---

## ClienteContext

```python
class ClienteContext(BaseModel):
    """Snapshot do cliente carregado pelo Orchestrator no Init."""
    cliente_id: str
    nome: str
    empresa: str
    consultor_responsavel: str
    encontro_atual: int
    reunioes_contratadas: int = 15
    metadata_extra: dict = {}              # campos custom do CRM
```

---

## SourceFindings

Detalhe completo em [`source-output.schema.md`](source-output.schema.md). Resumo:

```python
class SourceFindings(BaseModel):
    debriefing_id: str
    clickup: ClickUpFindings
    drive: DriveFindings
    period: tuple[date, date]
    total_items: int
    issues: list[Issue]
    metadata: SquadMetadata
```

---

## SynthesisOutput

Detalhe em [`synthesis-output.schema.md`](synthesis-output.schema.md). Resumo:

```python
class SynthesisOutput(BaseModel):
    debriefing_id: str
    outline: list[SectionOutline]      # do sectionizer
    markdown: str                      # do compositor
    metadata: SquadMetadata
```

---

## QualityVerdict

Detalhe em [`quality-verdict.schema.md`](quality-verdict.schema.md). Resumo:

```python
class QualityVerdict(BaseModel):
    pass_: bool
    score_overall: int
    citation_verdict: SingleVerdict
    style_verdict: SingleVerdict
    issues: list[Issue]
    metadata: SquadMetadata
```

---

## Issue

Tipo universal pra errors/warnings reportados por qualquer agente:

```python
class Issue(BaseModel):
    severity: Literal["fatal", "high", "medium", "low", "warning"]
    section: Optional[str] = None      # ex: "7.3"
    agent: str                          # quem reportou
    issue: str                          # descrição
    suggested_fix: Optional[str] = None # se há sugestão
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

---

## TokenCounters

```python
class TokenCounters(BaseModel):
    """Acumulado por modelo + tipo."""
    haiku_in: int = 0
    haiku_in_cached: int = 0
    haiku_out: int = 0
    sonnet_in: int = 0
    sonnet_in_cached: int = 0
    sonnet_out: int = 0
    opus_in: int = 0
    opus_in_cached: int = 0
    opus_out: int = 0

    @property
    def total_cost_usd(self) -> float:
        # Sonnet 4.6: $3/M in, $15/M out; Haiku 4.5: $0.80/M in, $4/M out
        # Cache: $0.50/M read (95% off)
        return (
            self.haiku_in / 1_000_000 * 0.80 +
            self.haiku_in_cached / 1_000_000 * 0.04 +
            self.haiku_out / 1_000_000 * 4.0 +
            self.sonnet_in / 1_000_000 * 3.0 +
            self.sonnet_in_cached / 1_000_000 * 0.15 +
            self.sonnet_out / 1_000_000 * 15.0 +
            self.opus_in / 1_000_000 * 15.0 +
            self.opus_in_cached / 1_000_000 * 0.75 +
            self.opus_out / 1_000_000 * 75.0
        )
```

---

## AgentMetadata vs SquadMetadata

Cada agente reporta metadata individual; squads consolidam.

```python
class AgentMetadata(BaseModel):
    agent_name: str
    model_used: str                    # 'claude-haiku-4-5' etc.
    tokens_in: int
    tokens_in_cached: int = 0
    tokens_out: int
    cost_usd: float
    duration_ms: int
    prompt_hash: str                   # SHA-256 dos primeiros 1000 chars do prompt
    timestamp: datetime

class SquadMetadata(BaseModel):
    squad_name: str
    agents: list[AgentMetadata]
    total_cost_usd: float
    total_duration_ms: int
    parallelism: Literal["parallel", "sequential"]
```

---

## Estado vs Persistência

Mapeamento `DebriefingState` → tabela `debriefings`:

| Campo DebriefingState | Coluna debriefings |
|---|---|
| `request.cliente_id` | `cliente_id` |
| `request.ciclo_numero` | `ciclo_numero` |
| `request.periodo_inicio/fim` | `periodo_inicio/fim` |
| status atual | `status` |
| `source_findings` | `findings_jsonb` (após barreira fase 3) |
| `synthesis_output.markdown` | `markdown_content` (após fase 6) |
| `accumulated_cost_usd` | `custo_usd` (atualizado a cada fase) |
| `accumulated_tokens` totais | `tokens_input` + `tokens_output` |
| `timing` total | `duracao_segundos` |
| `request.gerado_por_email` | `gerado_por_email` |
| (final, após PDF) | `pdf_storage_path` |
| `issues` consolidados em fatal | `erro` (se houver fatal) |

**Coluna `findings_jsonb` é nova** — adicionar via migration 008.
