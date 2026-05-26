---
name: drive-fetcher
version: 1
squad: source-squad
type: llm
description: |
  Lista a pasta do Drive do cliente, filtra por modifiedTime no período, baixa
  conteúdo dos docs relevantes (Google Docs, Sheets, PDFs, Slides) e devolve
  raw items pro classifier categorizar.
when_to_invoke: |
  Fase 2 do pipeline, em paralelo com clickup-fetcher. Orchestrator invoca via
  asyncio.gather(). Não invoca outros agentes.
owner: pedroaranda@grupoguglielmi.com
model: claude-haiku-4-5
temperature: 0.2
max_input_tokens: 30000
max_output_tokens: 4000
input_schema: backend/agents/debriefings/schemas/source_output.py:DriveFetcherInput
output_schema: backend/agents/debriefings/schemas/source_output.py:DriveRawItems
tools:
  - list_drive_folder
  - fetch_doc_content
  - fetch_sheet_content
  - fetch_slides_content
  - fetch_pdf_bytes
prompt_file: docs/agents/debriefings/prompts/drive-fetcher/v1.md
implementation_file: backend/agents/debriefings/squads/source/drive_fetcher.py
on_failure: continue_with_partial
max_retries: 1
timeout_soft_seconds: 30
timeout_hard_seconds: 60
max_cost_usd: 0.10
trace_tags: [debriefing, source, drive]
metrics:
  - tokens_in
  - tokens_out
  - cost_usd
  - items_fetched
  - duration_ms
  - drive_api_errors
maturity: validated
last_review: 2026-05-26
---

# Drive Fetcher

> Extrator de docs do Google Drive da pasta do cliente. Lista, filtra, baixa conteúdo, devolve items raw. **NÃO classifica** — isso é trabalho do classifier.

## Papel

**Em escopo:**
- Listar arquivos na pasta `folder_id` (ou buscar por `cliente_nome`/`empresa` se folder_id ausente)
- Filtrar por `modifiedTime` dentro do período do ciclo
- Pra cada arquivo: extrair conteúdo (export texto pra Docs/Sheets/Slides, download pra PDFs)
- Limitar volume (max 50 docs, max 4000 chars por preview)
- Devolver lista raw em `DriveRawItems` com metadados completos

**Fora de escopo:**
- Classificar tipo do doc (transcrição vs relatório etc.) — cabe ao classifier
- Extrair key points por tipo — cabe ao classifier
- Interpretar valor estratégico — cabe ao Synthesis Squad

## Activation

Invocado por Orchestrator na Fase 2 quando:
- `state.request.drive_folder_id` presente OU `state.cliente.nome/empresa` válidos
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` configurado no env

Se creds não configuradas, retorna `items=[]` + issue `"Drive não configurado"` — Orchestrator prossegue com nota.

## Inputs

```python
class DriveFetcherInput(BaseModel):
    debriefing_id: str
    folder_id: Optional[str] = None
    cliente_nome: str
    empresa_nome: Optional[str] = None
    periodo_inicio: date
    periodo_fim: date
    max_docs: int = 50
    max_chars_por_doc: int = 4000
```

## Outputs

```python
class DriveRawItem(BaseModel):
    id: str                          # Google Drive file_id
    name: str                        # filename
    mime_type: str                   # ex: application/vnd.google-apps.document
    modified_time: datetime
    web_view_link: str               # URL pública no Drive (citation_uri)
    content_preview: str             # primeiros max_chars_por_doc chars
    raw_metadata: dict               # outros campos do Drive API por se útil

class DriveRawItems(BaseModel):
    items: list[DriveRawItem]
    truncated: bool                  # True se excedeu max_docs
    issues: list[Issue]
    metadata: AgentMetadata
```

## Tools / Capabilities

Reusa `backend/services/google_drive_service.py` (já existente):

- `list_drive_folder(folder_id, query_filter) -> list[dict]` — lista arquivos paginada
- `fetch_doc_content(file_id) -> str` — export Google Doc → texto
- `fetch_sheet_content(file_id) -> str` — export Sheet primeira aba → CSV
- `fetch_slides_content(file_id) -> str` — export Slides → texto
- `fetch_pdf_bytes(file_id) -> bytes` — download PDF binário (text extraction fica pro classifier via docling se preciso)

## System Prompt

Versionado em [`../../prompts/drive-fetcher/v1.md`](../../prompts/drive-fetcher/v1.md). Resumo:

> "You are the Drive Fetcher agent for FLG debriefing pipeline. Your job is to list files in the client's Drive folder filtered by date range, fetch content excerpts, and return raw items. Do not classify or interpret — that is the classifier's and synthesizer's jobs respectively. Every item MUST have web_view_link populated. Output strict JSON matching DriveRawItems schema."

## Error handling

| Erro | Causa típica | Comportamento |
|---|---|---|
| 401/403 do Drive API | Service account sem acesso à pasta | Devolve `items=[]` + issue "Drive auth failure: <detail>". Orchestrator prossegue. |
| 404 (folder not found) | folder_id inválido | Tenta busca por `cliente_nome`/`empresa_nome`. Se falhar: `items=[]` + issue. |
| 429 (rate limit) | Burst de requests | Backoff exponential 3 tentativas. Se falhar: parcial + issue. |
| Timeout > 60s | Pasta muito grande | Reduz max_docs pra 25 e retentou 1 vez. Se ainda timeout: parcial + issue. |
| Export Doc falha em arquivo específico | Doc protegido ou tipo não suportado | Pula esse item, issue específico, continua com o resto |

## Observability

**Métricas:**
- `flg_drive_fetcher_items_total` (counter)
- `flg_drive_fetcher_bytes_downloaded_total` (counter)
- `flg_drive_fetcher_errors_total{type=...}` (counter)
- `flg_drive_fetcher_cost_usd` (histogram)

**Logs:** `backend/logs/agents/drive_fetcher.jsonl`

## Cost / Latency baseline

Com prompt caching ativo:

| Métrica | Esperado | P95 |
|---|---|---|
| Tokens in (cached) | 15k | 25k |
| Tokens out | 4k | 8k |
| Custo USD | $0,045 | $0,10 |
| Latência | 15-20s | 45s |
| Items fetched | 8-20 | 50 |

## Como testar localmente

```bash
cd backend
export GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON='{...}'
export ANTHROPIC_API_KEY=sk_xxx

python -m agents.debriefings.squads.source.drive_fetcher \
  --debriefing-id <uuid> \
  --folder-id <gdrive_folder_id> \
  --cliente-nome "Cliente Teste" \
  --periodo 2025-12-01..2026-05-30 \
  --output drive_raw.json
```

Validar: `drive_raw.json` tem `items > 0`, cada item com `web_view_link` válido.

## Changelog

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-05-26 | v1 | Spec inicial — agente extraído de `google_drive_service.py` | Pedro Aranda |
