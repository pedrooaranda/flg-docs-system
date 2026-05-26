---
name: orchestrator
version: 1
squad: n/a
type: process
description: |
  Entry-point determinístico Python do pipeline de debriefing. Coordena os 3 squads
  em sequência fixa (Source → Synthesis → Quality), gerencia barreiras de sync,
  checkpointing, retry policy e cost guard.
when_to_invoke: |
  POST /debriefings — invocado uma única vez por request via FastAPI BackgroundTasks.
  Não é invocado por outros agentes.
owner: pedroaranda@grupoguglielmi.com
model: n/a
implementation_file: backend/agents/debriefings/orchestrator.py
input_schema: schemas/state.py:DebriefingRequest
output_schema: schemas/state.py:DebriefingResult
tools:
  - dispatch_source_squad
  - dispatch_synthesis_squad
  - dispatch_quality_squad
  - persist_state_checkpoint
  - emit_sse_event
  - render_pdf
  - upload_to_storage
on_failure: persist_falhou_status
max_retries_overall: 0   # orchestrator não retentou ele mesmo; só compositor faz retry interno
timeout_seconds_total: 240
max_cost_usd_total: 5.00
trace_tags: [debriefing, orchestrator]
maturity: validated
last_review: 2026-05-26
---

# Orchestrator

> Coordenador top-level do pipeline. Python determinístico, não LLM. Sequência hardcoded das 10 fases. Single source of truth do estado.

## Papel

**Em escopo:**
- Receber `DebriefingRequest` validado, criar row em `debriefings` com `status='gerando'`
- Abrir SSE pro frontend
- Invocar squads em sequência fixa: Source (paralelo) → Checkpoint → Synthesis (sequencial) → Checkpoint → Quality (paralelo) → Decisão → PDF
- Gerenciar `DebriefingState` (state Pydantic compartilhado) através de todas as fases
- Aplicar retry policy do compositor quando Quality reportar fail (max 1)
- Aplicar cost guard ($5 cap) abortando se acumulado ultrapassar
- Renderizar PDF e fazer upload pro Supabase Storage
- Persistir resultado final + emitir SSE `done` ou `error`

**Fora de escopo:**
- Decidir qual squad chamar (sequência é fixa)
- Decisão estratégica sobre conteúdo (cabe ao Synthesis Squad)
- Validação de qualidade (cabe ao Quality Squad)
- Roteamento ambíguo (não há)

## Activation

Único ponto de entrada: `POST /debriefings` no router FastAPI. Background task dispara `run_debriefing(state)`.

## Inputs / Outputs

```python
# Input: state.DebriefingRequest (Pydantic)
class DebriefingRequest(BaseModel):
    cliente_id: str
    ciclo_numero: int
    periodo_inicio: date
    periodo_fim: date
    clickup_list_id: Optional[str] = None
    drive_folder_id: Optional[str] = None
    gerado_por_email: str
    use_opus: bool = False  # opt-in pra Opus 4.7 no synthesis squad

# Output: state.DebriefingResult (Pydantic)
class DebriefingResult(BaseModel):
    debriefing_id: str
    status: Literal["pronto", "falhou"]
    pdf_storage_path: Optional[str]
    markdown_content: Optional[str]
    accumulated_cost_usd: float
    accumulated_tokens: TokenCounters
    duration_seconds: int
    issues: list[Issue]
    erro: Optional[str]
```

## Tools / Capabilities

Tools nativas (todas Python, sem LLM):

- `dispatch_source_squad(state) -> SourceFindings` — gather(drive, clickup) + classifier
- `dispatch_synthesis_squad(state) -> SynthesisOutput` — sectionizer + compositor sequencial
- `dispatch_quality_squad(state) -> QualityVerdict` — gather(citation, style)
- `persist_state_checkpoint(state, field) -> None` — atualiza row do DB com campo específico
- `emit_sse_event(type, payload) -> None` — envia evento pro stream do frontend
- `render_pdf(markdown) -> bytes` — WeasyPrint pipeline
- `upload_to_storage(pdf_bytes, debriefing_id) -> storage_path` — Supabase Storage

## Pseudocódigo do flow

```python
async def run_debriefing(state: DebriefingState) -> DebriefingResult:
    # Fase 1: Init
    await persist_state_checkpoint(state, "status='gerando'")
    emit_sse_event("phase_start", {"phase": 1})

    # Fase 2-3: Source Squad (paralelo + classifier dentro)
    try:
        state.source_findings = await dispatch_source_squad(state)
    except Exception as e:
        return await abort(state, f"Source Squad falhou: {e}")

    # Cost guard
    if state.accumulated_cost_usd > 5.0:
        return await abort(state, "Cost cap exceeded at Source")

    # Fase 4: Checkpoint 1
    await persist_state_checkpoint(state, "findings_jsonb")

    # Fase 5: Synthesis Squad (sequencial)
    try:
        state.synthesis_output = await dispatch_synthesis_squad(state)
    except Exception as e:
        return await abort(state, f"Synthesis falhou: {e}")

    if state.accumulated_cost_usd > 5.0:
        return await abort(state, "Cost cap exceeded at Synthesis")

    # Fase 6: Checkpoint 2
    await persist_state_checkpoint(state, "markdown_content")

    # Fase 7-8: Quality Squad (paralelo) + decisão
    for attempt in range(2):  # max 1 retry
        state.quality_verdict = await dispatch_quality_squad(state)

        if state.quality_verdict.pass_:
            break  # OK, sai do loop

        if attempt == 1:  # já tentou 1 retry
            return await abort(state, "Quality fail após 1 retry")

        # Retry: devolve issues pro compositor
        state.retry_count = 1
        emit_sse_event("retry", {"retry_count": 1, "issues": state.quality_verdict.issues})
        state.synthesis_output = await dispatch_synthesis_squad(state, retry=True)

        if state.accumulated_cost_usd > 5.0:
            return await abort(state, "Cost cap exceeded at Synthesis retry")

    # Fase 9: PDF render + upload
    pdf_bytes = render_pdf(state.synthesis_output.markdown)
    storage_path = await upload_to_storage(pdf_bytes, state.debriefing_id)

    # Fase 10: Done
    return await finalize(state, storage_path)
```

## Error handling

| Erro | Comportamento |
|---|---|
| Source Squad falha total (drive + clickup ambos abortam) | Abort, status='falhou', razão "Nenhuma fonte disponível" |
| Source Squad falha parcial | Continua com nota nos findings |
| Synthesis falha (sectionizer ou compositor) | Abort, status='falhou' |
| Quality fail + retry exhausted | Abort, status='falhou', razão "Quality fail após 1 retry: <issues>" |
| Cost > $5 em qualquer ponto | Abort imediato, razão "cost cap" |
| Hard timeout 240s | Abort, razão "timeout total exceeded" |
| PDF render falha | Status='pronto' com markdown salvo, mas pdf_storage_path=null. Frontend pode oferecer download do markdown como fallback |

## Observability

**Métricas (Prometheus):**
- `flg_debriefing_total{status=pronto|falhou}` (counter)
- `flg_debriefing_duration_seconds` (histogram)
- `flg_debriefing_cost_usd` (histogram)
- `flg_debriefing_retries{count=0|1}` (counter)

**Logs:** `backend/logs/debriefings/orchestrator.jsonl`

**SSE events:** todos eventos da tabela em [`WORKFLOW.md`](../WORKFLOW.md#-eventos-sse-pro-frontend) emitidos pra stream.

## Cost / Latency baseline

| Métrica | Esperado | P95 |
|---|---|---|
| Custo USD total | $0,49 | $1,50 |
| Latência total | 90s | 180s |
| Retries | 0 (esperado) | 1 (raro) |

## Como testar localmente

```bash
cd backend
export ANTHROPIC_API_KEY=sk_xxx
export CLICKUP_API_TOKEN=pk_xxx
export GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON='{"type":...}'

python -m agents.debriefings.orchestrator \
  --cliente-id <uuid> \
  --periodo 2025-12-01..2026-05-30 \
  --ciclo 3 \
  --output result.json
```

Validar: `result.json` deve ter `status='pronto'`, `pdf_storage_path` preenchido, `accumulated_cost_usd < 5.0`.

## Changelog

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-05-26 | v1 | Spec inicial — substitui debriefing_generator.py original | Pedro Aranda |
