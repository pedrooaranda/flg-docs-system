---
name: clickup-fetcher
version: 1
squad: source-squad
type: llm
description: |
  Extrai tasks, comentários e marcos da lista ClickUp do cliente, filtrados por
  janela temporal. Não interpreta, só estrutura.
when_to_invoke: |
  Fase 2 do pipeline, em paralelo com drive-fetcher. Orchestrator invoca via
  asyncio.gather(). Não invoca outros agentes.
owner: pedroaranda@grupoguglielmi.com
model: claude-haiku-4-5
temperature: 0.2
max_input_tokens: 20000
max_output_tokens: 4000
input_schema: backend/agents/debriefings/schemas/source_output.py:ClickUpFetcherInput
output_schema: backend/agents/debriefings/schemas/source_output.py:ClickUpFindings
tools:
  - list_all_tasks
  - read_clickup_comments
  - find_list_by_name
prompt_file: docs/agents/debriefings/prompts/clickup-fetcher/v1.md
implementation_file: backend/agents/debriefings/squads/source/clickup_fetcher.py
on_failure: continue_with_partial
max_retries: 1
timeout_soft_seconds: 30
timeout_hard_seconds: 60
max_cost_usd: 0.06
trace_tags: [debriefing, source, clickup]
metrics:
  - tokens_in
  - tokens_out
  - cost_usd
  - tasks_extracted
  - milestones_identified
  - duration_ms
maturity: validated
last_review: 2026-05-26
---

# ClickUp Fetcher

> Extrai tasks, comentários e marcos da lista ClickUp do cliente filtrados por janela temporal. Identifica marcos relevantes (decisões, entregas, pivots). Não interpreta valor estratégico.

## Papel

**Em escopo:**
- Listar tasks da `list_id`, filtradas por `date_created`, `date_updated` ou `date_closed` no período
- Pra cada task relevante: coletar título, status, assignees, tags, descrição (≤1500 chars), top N comentários
- Identificar marcos: tasks com tags "decisão"/"milestone", ou status "entregue", ou descrição contendo palavras-chave
- Listar comentários sem resposta há 7+ dias como `open_threads`
- Gerar sumário curto (3-5 bullets) do ciclo

**Fora de escopo:**
- Avaliar valor estratégico das tasks (cabe ao Synthesis Squad)
- Sugerir próximas ações
- Recomendar mudanças no fluxo do cliente

## Activation

Invocado por Orchestrator na Fase 2 quando:
- `state.request.clickup_list_id` presente OU `state.request.cliente_nome` + `CLICKUP_WORKSPACE_ID` válidos
- `CLICKUP_API_TOKEN` configurado no env

## Inputs / Outputs

```python
class ClickUpFetcherInput(BaseModel):
    debriefing_id: str
    cliente_id: str
    cliente_nome: str
    list_id: Optional[str] = None
    periodo_inicio: date
    periodo_fim: date
    workspace_id: Optional[str] = None
    max_tasks: int = 200
    max_comments_per_task: int = 20

class TaskFinding(BaseModel):
    id: str
    title: str
    status: str
    assignees: list[str]
    tags: list[str]
    date_created: datetime
    date_updated: datetime
    date_closed: Optional[datetime]
    description_excerpt: str
    top_comments: list[Comment]
    citation_uri: str                  # URL pública ClickUp

class MilestoneFinding(BaseModel):
    task_id: str
    type: Literal["decisao", "entrega", "alerta", "pivot"]
    description: str
    date: datetime
    citation_uri: str

class ClickUpFindings(BaseModel):
    tasks: list[TaskFinding]
    milestones: list[MilestoneFinding]
    open_threads: list[CommentThread]
    summary: str
    truncated: bool                  # True se excedeu max_tasks
    issues: list[Issue]
    metadata: AgentMetadata
```

## Tools / Capabilities

Reusa `backend/tools/clickup_tools.py` (já existente):

- `list_all_tasks(list_id) -> list[dict]` — paginação completa
- `read_clickup_comments(task_id, limit) -> str` — comentários recentes formatados
- `find_list_by_name(workspace_id, query) -> Optional[str]` — fallback search

## System Prompt

Versionado em [`../../prompts/clickup-fetcher/v1.md`](../../prompts/clickup-fetcher/v1.md). Resumo:

> "You are the ClickUp Fetcher agent for FLG debriefing pipeline. Read tasks in the given list filtered by date range. For each task: extract structured findings (title, status, dates, assignees, key comments). Identify milestones (decisions, deliveries, alerts, pivots). Output strict JSON matching ClickUpFindings schema. Be FACTUAL — do not interpret, judge or recommend. Every item MUST have citation_uri populated."

## Error handling

| Erro | Causa típica | Comportamento |
|---|---|---|
| ClickUp 429 (rate limit) | Burst | Backoff exponential 3 tentativas. Se falhar: parcial + issue |
| 401 (auth) | Token inválido/expirado | Abort imediato — issue "ClickUp auth failure" |
| 404 (list not found) | list_id inválido | Tenta `find_list_by_name`. Se falhar: `tasks=[]` + issue |
| 5xx | Server-side | Backoff + retry. Se falhar 3 vezes: parcial + issue |
| Timeout > 60s | Lista muito grande | Aborta com issue "list too large". Reduz max_tasks próximo run |

## Observability

**Métricas:**
- `flg_clickup_fetcher_tasks_extracted` (histogram)
- `flg_clickup_fetcher_milestones_identified` (histogram)
- `flg_clickup_fetcher_errors_total{type=...}` (counter)
- `flg_clickup_fetcher_cost_usd` (histogram)

**Logs:** `backend/logs/agents/clickup_fetcher.jsonl`

## Cost / Latency baseline

Com prompt caching ativo:

| Métrica | Esperado | P95 |
|---|---|---|
| Tokens in (cached) | 12k | 25k |
| Tokens out | 3k | 5k |
| Custo USD | $0,027 | $0,06 |
| Latência | 15s | 35s |

## Como testar localmente

```bash
cd backend
export CLICKUP_API_TOKEN=pk_xxx
export ANTHROPIC_API_KEY=sk_xxx
export CLICKUP_WORKSPACE_ID=9013123456

python -m agents.debriefings.squads.source.clickup_fetcher \
  --debriefing-id <uuid> \
  --cliente-id <uuid> \
  --cliente-nome "Cliente Teste" \
  --list-id 901812345678 \
  --periodo 2025-12-01..2026-05-30 \
  --output clickup_findings.json
```

Validar: `tasks > 0`, todos com `citation_uri` populado.

## Changelog

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-05-26 | v1 | Spec inicial — extraído de `clickup_debriefing.py` | Pedro Aranda |
