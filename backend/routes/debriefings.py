"""
Rotas de Debriefings Estratégicos — FLG Jornada System.

Endpoints (todos sob /debriefings):
  POST   /                         Cria + dispara geração assíncrona. Retorna debriefing_id.
  GET    /?cliente_id=X            Lista debriefings (filtra por cliente quando passado).
  GET    /{id}                     Detalhe de um debriefing.
  GET    /{id}/stream              SSE com progresso ao vivo da geração.
  GET    /{id}/pdf                 Redirect 302 pra URL assinada do PDF no Supabase Storage.
  DELETE /{id}                     Soft-delete (status='arquivado') — apenas admin/owner.

Estado da implementação:
  - Phase 1 (atual): endpoints estruturados, geração roda stubs (placeholders).
  - Phase 2-4: integrações reais (ClickUp/Drive/Claude/PDF).
"""

import asyncio
import json
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from deps import get_current_user, supabase_client
from services.debriefing_generator import DebriefingRequest, run_debriefing
from services import debriefing_pdf

router = APIRouter(prefix="/debriefings", tags=["debriefings"])
logger = logging.getLogger("flg.debriefings")
_supabase = supabase_client


# In-memory queue de eventos por debriefing_id (pra SSE).
# Cada entrada é uma asyncio.Queue de strings (eventos JSON).
# Vive enquanto a geração estiver rodando; descartada após 'complete' ou 'error'.
_event_queues: dict[str, asyncio.Queue] = {}


# ─── Schemas ──────────────────────────────────────────────────────────────────

class DebriefingCreate(BaseModel):
    cliente_id: str
    ciclo_numero: int = Field(ge=1)
    periodo_inicio: date
    periodo_fim: date
    clickup_list_id: Optional[str] = None
    drive_folder_id: Optional[str] = None


class DebriefingResponse(BaseModel):
    id: str
    cliente_id: str
    ciclo_numero: int
    periodo_inicio: str
    periodo_fim: str
    status: str
    markdown_content: Optional[str] = None
    pdf_storage_path: Optional[str] = None
    num_tasks_clickup: Optional[int] = None
    num_docs_drive: Optional[int] = None
    tokens_input: Optional[int] = None
    tokens_output: Optional[int] = None
    custo_usd: Optional[float] = None
    duracao_segundos: Optional[int] = None
    erro: Optional[str] = None
    gerado_por_email: str
    gerado_at: str


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _load_cliente(cliente_id: str) -> dict:
    row = _supabase.table("clientes").select("*").eq("id", cliente_id).single().execute()
    if not row.data:
        raise HTTPException(404, f"Cliente {cliente_id} não encontrado")
    return row.data


def _insert_debriefing(
    body: DebriefingCreate,
    gerado_por_email: str,
) -> str:
    """Insere row inicial com status='gerando' e retorna o id gerado."""
    payload = {
        "cliente_id": body.cliente_id,
        "ciclo_numero": body.ciclo_numero,
        "periodo_inicio": body.periodo_inicio.isoformat(),
        "periodo_fim": body.periodo_fim.isoformat(),
        "status": "gerando",
        "clickup_list_id": body.clickup_list_id,
        "drive_folder_id": body.drive_folder_id,
        "gerado_por_email": gerado_por_email,
    }
    result = _supabase.table("debriefings").insert(payload).execute()
    if not result.data:
        raise HTTPException(500, "Falha ao criar registro de debriefing")
    return result.data[0]["id"]


def _update_debriefing(debriefing_id: str, fields: dict) -> None:
    _supabase.table("debriefings").update(fields).eq("id", debriefing_id).execute()


# ─── Background job ───────────────────────────────────────────────────────────

def _run_debriefing_job(debriefing_id: str, cliente_row: dict, request: DebriefingRequest) -> None:
    """
    Roda a geração em thread separada (background task FastAPI).
    Emite eventos pra _event_queues[debriefing_id] enquanto roda.
    Persiste resultado final no banco.
    """
    queue = _event_queues.get(debriefing_id)

    def callback(event_type: str, payload: dict) -> None:
        if queue is None:
            return
        try:
            queue.put_nowait(json.dumps({"type": event_type, "data": payload}))
        except asyncio.QueueFull:
            logger.warning(f"[debriefings] SSE queue cheia pra {debriefing_id}")

    result = run_debriefing(request, cliente_row, callback=callback)

    # Persiste resultado
    update = {
        "status": result.status,
        "markdown_content": result.markdown_content,
        "pdf_storage_path": result.pdf_storage_path,
        "num_tasks_clickup": result.num_tasks_clickup,
        "num_docs_drive": result.num_docs_drive,
        "tokens_input": result.tokens_input,
        "tokens_output": result.tokens_output,
        "custo_usd": result.custo_usd,
        "duracao_segundos": result.duracao_segundos,
        "erro": result.erro,
    }
    _update_debriefing(debriefing_id, update)

    # Emite evento final + fecha queue
    if queue is not None:
        try:
            queue.put_nowait(json.dumps({
                "type": "done",
                "data": {"status": result.status, "debriefing_id": debriefing_id},
            }))
        except asyncio.QueueFull:
            pass


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", status_code=202)
async def create_debriefing(
    body: DebriefingCreate,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
):
    """
    Cria um debriefing e dispara a geração em background.
    Retorna 202 Accepted com o id pro frontend abrir o SSE stream.
    """
    if body.periodo_fim < body.periodo_inicio:
        raise HTTPException(400, "periodo_fim deve ser >= periodo_inicio")

    cliente = _load_cliente(body.cliente_id)
    gerado_por = getattr(user, "email", "") or ""

    debriefing_id = _insert_debriefing(body, gerado_por)

    # Prepara queue de eventos pra SSE
    _event_queues[debriefing_id] = asyncio.Queue(maxsize=100)

    request = DebriefingRequest(
        cliente_id=body.cliente_id,
        ciclo_numero=body.ciclo_numero,
        periodo_inicio=body.periodo_inicio.isoformat(),
        periodo_fim=body.periodo_fim.isoformat(),
        debriefing_id=debriefing_id,
        clickup_list_id=body.clickup_list_id,
        drive_folder_id=body.drive_folder_id,
        gerado_por_email=gerado_por,
    )

    background_tasks.add_task(_run_debriefing_job, debriefing_id, cliente, request)

    return {
        "id": debriefing_id,
        "status": "gerando",
        "stream_url": f"/api/debriefings/{debriefing_id}/stream",
    }


@router.get("")
async def list_debriefings(
    cliente_id: Optional[str] = Query(None),
    user=Depends(get_current_user),
):
    """Lista debriefings, opcionalmente filtrados por cliente. Mais recentes primeiro."""
    q = _supabase.table("debriefings").select("*").order("gerado_at", desc=True)
    if cliente_id:
        q = q.eq("cliente_id", cliente_id)
    result = q.execute()
    return {"debriefings": result.data or [], "total": len(result.data or [])}


@router.get("/{debriefing_id}")
async def get_debriefing(debriefing_id: str, user=Depends(get_current_user)):
    """Detalhe completo de um debriefing (inclui markdown_content)."""
    result = _supabase.table("debriefings").select("*").eq("id", debriefing_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Debriefing não encontrado")
    return result.data


@router.get("/{debriefing_id}/stream")
async def stream_debriefing(debriefing_id: str, user=Depends(get_current_user)):
    """
    SSE com progresso ao vivo. Cliente se inscreve, recebe eventos das fases até 'done'.
    Cada evento é uma linha "data: {json}\\n\\n".
    """
    queue = _event_queues.get(debriefing_id)
    if queue is None:
        # Job já terminou ou nunca existiu — devolve estado final em um evento
        row = _supabase.table("debriefings").select("status,erro").eq("id", debriefing_id).single().execute()
        if not row.data:
            raise HTTPException(404, "Debriefing não encontrado")

        async def empty_stream():
            yield f"data: {json.dumps({'type': 'done', 'data': row.data})}\n\n"

        return StreamingResponse(empty_stream(), media_type="text/event-stream")

    async def event_stream():
        try:
            while True:
                event = await queue.get()
                yield f"data: {event}\n\n"
                # Se 'done' ou 'error', encerra após emitir
                parsed = json.loads(event)
                if parsed.get("type") in ("done", "error"):
                    break
        finally:
            # Limpa a queue do registry após encerrar o stream
            _event_queues.pop(debriefing_id, None)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"},
    )


@router.get("/{debriefing_id}/pdf")
async def download_pdf(debriefing_id: str, user=Depends(get_current_user)):
    """
    Retorna URL assinada pro PDF no Supabase Storage (válida ~1h).
    Phase 4: implementação real.
    """
    row = _supabase.table("debriefings").select("pdf_storage_path,status").eq(
        "id", debriefing_id
    ).single().execute()
    if not row.data:
        raise HTTPException(404, "Debriefing não encontrado")
    if row.data["status"] != "pronto":
        raise HTTPException(409, f"Debriefing ainda em status '{row.data['status']}'")
    if not row.data["pdf_storage_path"]:
        raise HTTPException(404, "PDF não disponível")

    signed_url = debriefing_pdf.get_signed_url(row.data["pdf_storage_path"])
    if not signed_url:
        raise HTTPException(500, "Falha ao gerar signed URL do PDF")
    return {"pdf_storage_path": row.data["pdf_storage_path"], "signed_url": signed_url}
