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

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from deps import supabase_client
from lib.auth_scope import (
    UserScope,
    get_user_scope,
    require_debriefings,
    require_debriefings_or_consultor,
)
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
    # Perspectiva do consultor (input qualitativo complementar ao ClickUp/Drive).
    # Quando o usuário usa multipart com arquivo, este campo permanece None e o
    # backend popula consultor_perspectiva_text a partir do conteúdo extraído.
    consultor_perspectiva_text: Optional[str] = Field(default=None, max_length=50000)


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
    consultor_perspectiva_text: Optional[str] = None
    consultor_perspectiva_storage_path: Optional[str] = None


# ─── Perspectiva (upload) helpers ─────────────────────────────────────────────

# Limites e tipos aceitos para o arquivo de perspectiva do consultor.
_PERSPECTIVA_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
_PERSPECTIVA_MAX_TEXT_CHARS = 50_000
_PERSPECTIVA_ALLOWED_EXTS = {".pdf", ".docx", ".md", ".txt"}
_PERSPECTIVA_BUCKET = "debriefings"


def _perspectiva_ext(filename: str) -> str:
    """Retorna a extensão normalizada (com ponto, lowercase) ou string vazia."""
    if not filename or "." not in filename:
        return ""
    return "." + filename.rsplit(".", 1)[-1].lower()


def _extract_perspectiva_text(file_bytes: bytes, ext: str) -> str:
    """
    Extrai texto bruto do arquivo de perspectiva de acordo com a extensão.
    PDF/DOCX passa por Docling; MD/TXT é decodificado direto.
    """
    if ext in (".md", ".txt"):
        try:
            return file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return file_bytes.decode("utf-8", errors="replace")

    if ext in (".pdf", ".docx"):
        # Docling lida com PDF e DOCX (formato unificado). Reusa o wrapper já
        # existente pra PDF; pra DOCX, escreve em arquivo temporário e converte.
        if ext == ".pdf":
            from tools.docling_tools import extract_text_from_pdf
            return extract_text_from_pdf(file_bytes)

        # DOCX
        import tempfile
        from pathlib import Path
        try:
            from docling.document_converter import DocumentConverter
        except ImportError as e:
            raise RuntimeError("Docling não disponível para DOCX") from e

        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = Path(tmp.name)
        try:
            converter = DocumentConverter()
            result = converter.convert(str(tmp_path))
            return result.document.export_to_markdown()
        finally:
            tmp_path.unlink(missing_ok=True)

    # Defensivo — chamada após validação, mas evita comportamento implícito.
    raise HTTPException(400, f"Extensão '{ext}' não suportada para perspectiva")


def _upload_perspectiva_file(file_bytes: bytes, debriefing_id: str, ext: str) -> str:
    """
    Sobe o arquivo original de perspectiva pro bucket 'debriefings' sob
    perspectivas/<debriefing_id>.<ext>. Retorna o storage path no formato
    'bucket/path' pra coerência com debriefing_pdf.upload_pdf.
    """
    content_type_map = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".md": "text/markdown",
        ".txt": "text/plain",
    }
    path = f"perspectivas/{debriefing_id}{ext}"
    content_type = content_type_map.get(ext, "application/octet-stream")
    try:
        _supabase.storage.from_(_PERSPECTIVA_BUCKET).upload(
            path=path,
            file=file_bytes,
            file_options={"content-type": content_type, "upsert": "true"},
        )
    except Exception as e:
        logger.warning(f"[debriefings] upload perspectiva falhou ({e}); tentando criar bucket")
        try:
            _supabase.storage.create_bucket(_PERSPECTIVA_BUCKET, options={"public": False})
            _supabase.storage.from_(_PERSPECTIVA_BUCKET).upload(
                path=path,
                file=file_bytes,
                file_options={"content-type": content_type, "upsert": "true"},
            )
        except Exception as e2:
            raise HTTPException(500, f"Falha ao subir arquivo de perspectiva: {e2}")
    return f"{_PERSPECTIVA_BUCKET}/{path}"


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
    """
    Cria (ou substitui) a row do debriefing pra (cliente_id, ciclo_numero).

    Constraint UNIQUE(cliente_id, ciclo_numero) da migration 007 impede duplicatas.
    Comportamento: se já existe row pra esse cliente+ciclo, o INSERT NOVO falha;
    nós então UPDATE a row existente pra "reset" (status='gerando', limpa
    markdown/pdf/erro etc.) e retorna o id existente.

    Caso de uso: comercial gera debriefing falho, ajusta inputs, gera de novo
    — deve sobrescrever o anterior, não criar duplicado.

    Perspectiva: texto inline persistido aqui; arquivo é processado DEPOIS
    (precisa do debriefing_id pra montar storage path).
    """
    payload = {
        "cliente_id": body.cliente_id,
        "ciclo_numero": body.ciclo_numero,
        "periodo_inicio": body.periodo_inicio.isoformat(),
        "periodo_fim": body.periodo_fim.isoformat(),
        "status": "gerando",
        "clickup_list_id": body.clickup_list_id,
        "drive_folder_id": body.drive_folder_id,
        "gerado_por_email": gerado_por_email,
        "consultor_perspectiva_text": body.consultor_perspectiva_text,
    }

    # Tenta INSERT primeiro
    try:
        result = _supabase.table("debriefings").insert(payload).execute()
        if result.data:
            return result.data[0]["id"]
    except Exception as e:
        # Se for duplicate key, cai pro UPDATE; outros erros sobem
        err_msg = str(e).lower()
        if "duplicate" not in err_msg and "23505" not in err_msg:
            raise HTTPException(500, f"Falha ao criar debriefing: {e}")

    # Duplicate key — busca o id existente e "reseta" pra regeneração
    existing = _supabase.table("debriefings").select("id").eq(
        "cliente_id", body.cliente_id
    ).eq("ciclo_numero", body.ciclo_numero).single().execute()

    if not existing.data:
        raise HTTPException(500, "Conflito de constraint mas row existente não encontrada")

    existing_id = existing.data["id"]
    # Update completo — limpa output anterior, sobe nova metadata
    reset_payload = {
        **payload,
        "markdown_content": None,
        "pdf_storage_path": None,
        "num_tasks_clickup": None,
        "num_docs_drive": None,
        "tokens_input": None,
        "tokens_output": None,
        "custo_usd": None,
        "duracao_segundos": None,
        "erro": None,
        "consultor_perspectiva_storage_path": None,
    }
    _supabase.table("debriefings").update(reset_payload).eq("id", existing_id).execute()
    return existing_id


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

async def _parse_create_payload(request: Request) -> tuple[DebriefingCreate, Optional[UploadFile]]:
    """
    Detecta Content-Type e desempacota o body em (DebriefingCreate, UploadFile|None).

    - application/json (ou ausente) → JSON puro (campo opcional consultor_perspectiva_text).
    - multipart/form-data           → campos como Form fields + arquivo opcional 'file'.
    """
    content_type = (request.headers.get("content-type") or "").lower()

    if content_type.startswith("multipart/form-data"):
        form = await request.form()

        def _get(name: str) -> Optional[str]:
            raw = form.get(name)
            if raw is None:
                return None
            # No multipart, valores vêm como str ou UploadFile; só interessa str aqui.
            return str(raw) if not isinstance(raw, UploadFile) else None

        try:
            ciclo_raw = _get("ciclo_numero")
            payload_dict = {
                "cliente_id": _get("cliente_id"),
                "ciclo_numero": int(ciclo_raw) if ciclo_raw is not None else None,
                "periodo_inicio": _get("periodo_inicio"),
                "periodo_fim": _get("periodo_fim"),
                "clickup_list_id": _get("clickup_list_id"),
                "drive_folder_id": _get("drive_folder_id"),
                "consultor_perspectiva_text": _get("consultor_perspectiva_text"),
            }
        except (TypeError, ValueError) as e:
            raise HTTPException(400, f"Campos do form inválidos: {e}")

        # Pydantic valida os campos obrigatórios e tipos (date).
        body = DebriefingCreate(**{k: v for k, v in payload_dict.items() if v is not None})

        uploaded = form.get("file")
        if isinstance(uploaded, UploadFile):
            return body, uploaded
        return body, None

    # Default: JSON puro (preserva comportamento atual).
    try:
        json_body = await request.json()
    except Exception as e:
        raise HTTPException(400, f"JSON inválido: {e}")
    return DebriefingCreate(**json_body), None


@router.post("", status_code=202)
async def create_debriefing(
    request: Request,
    background_tasks: BackgroundTasks,
    scope: UserScope = Depends(get_user_scope),
):
    """
    Cria um debriefing e dispara a geração em background.
    Retorna 202 Accepted com o id pro frontend abrir o SSE stream.

    Aceita dois content-types:
      - application/json: body = DebriefingCreate; perspectiva opcional via
        campo `consultor_perspectiva_text` (texto inline, max 50k chars).
      - multipart/form-data: campos como form fields + opcional `file`
        (PDF/DOCX/MD/TXT, max 5MB) com a perspectiva extraída via Docling.
    """
    require_debriefings(scope)
    body, uploaded_file = await _parse_create_payload(request)

    if body.periodo_fim < body.periodo_inicio:
        raise HTTPException(400, "periodo_fim deve ser >= periodo_inicio")

    # Validação adicional do texto inline (Pydantic já cobre max_length, mas
    # vale defesa em profundidade caso a regra mude).
    if body.consultor_perspectiva_text and len(body.consultor_perspectiva_text) > _PERSPECTIVA_MAX_TEXT_CHARS:
        raise HTTPException(400, f"consultor_perspectiva_text excede {_PERSPECTIVA_MAX_TEXT_CHARS} chars")

    # Se o usuário mandou os dois (texto inline + arquivo), priorizamos o arquivo:
    # o texto extraído sobrescreve o inline ao persistir. Isso simplifica o
    # contrato com o frontend (T3 pode oferecer um campo OU outro mas se vier
    # arquivo a leitura final é dele).
    file_bytes: Optional[bytes] = None
    file_ext: Optional[str] = None
    if uploaded_file is not None:
        filename = uploaded_file.filename or ""
        file_ext = _perspectiva_ext(filename)
        if file_ext not in _PERSPECTIVA_ALLOWED_EXTS:
            raise HTTPException(
                400,
                f"Extensão '{file_ext or 'desconhecida'}' não aceita. "
                f"Use: {', '.join(sorted(_PERSPECTIVA_ALLOWED_EXTS))}.",
            )

        file_bytes = await uploaded_file.read()
        if len(file_bytes) > _PERSPECTIVA_MAX_BYTES:
            raise HTTPException(
                413,
                f"Arquivo de perspectiva excede {_PERSPECTIVA_MAX_BYTES // (1024 * 1024)} MB",
            )

    cliente = _load_cliente(body.cliente_id)
    gerado_por = (scope.email or "")

    debriefing_id = _insert_debriefing(body, gerado_por)

    # Processa arquivo de perspectiva (depois do insert, precisamos do id).
    if file_bytes is not None and file_ext is not None:
        try:
            extracted_text = _extract_perspectiva_text(file_bytes, file_ext)
        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"[debriefings] falha ao extrair perspectiva: {e}")
            raise HTTPException(500, f"Falha ao extrair texto da perspectiva: {e}")

        # Trunca texto extraído pra mesma cota do inline (proteção do prompt).
        if len(extracted_text) > _PERSPECTIVA_MAX_TEXT_CHARS:
            logger.warning(
                f"[debriefings] perspectiva extraída ({len(extracted_text)} chars) "
                f"truncada pra {_PERSPECTIVA_MAX_TEXT_CHARS}"
            )
            extracted_text = extracted_text[:_PERSPECTIVA_MAX_TEXT_CHARS]

        storage_path = _upload_perspectiva_file(file_bytes, debriefing_id, file_ext)
        _update_debriefing(debriefing_id, {
            "consultor_perspectiva_text": extracted_text,
            "consultor_perspectiva_storage_path": storage_path,
        })

    # Prepara queue de eventos pra SSE
    _event_queues[debriefing_id] = asyncio.Queue(maxsize=100)

    debriefing_req = DebriefingRequest(
        cliente_id=body.cliente_id,
        ciclo_numero=body.ciclo_numero,
        periodo_inicio=body.periodo_inicio.isoformat(),
        periodo_fim=body.periodo_fim.isoformat(),
        debriefing_id=debriefing_id,
        clickup_list_id=body.clickup_list_id,
        drive_folder_id=body.drive_folder_id,
        gerado_por_email=gerado_por,
    )

    background_tasks.add_task(_run_debriefing_job, debriefing_id, cliente, debriefing_req)

    return {
        "id": debriefing_id,
        "status": "gerando",
        "stream_url": f"/api/debriefings/{debriefing_id}/stream",
    }


@router.get("/clientes/{cliente_id}/ciclos")
async def list_ciclos_for_cliente(cliente_id: str, scope: UserScope = Depends(get_user_scope)):
    """
    Retorna os ciclos disponíveis no Drive pra um cliente, ordenados cronologicamente.

    Cada ciclo: {ciclo_numero, name, created_time, is_current, web_view_link}
    - is_current=True pra o mais recente (atual em andamento)
    - Default sugerido pra debriefing = penúltimo (ciclo concluído anterior)

    Se cliente não tem CICLO|* subfolders (padrão "novo"), retorna lista
    com 1 elemento marcado como ciclo único.
    """
    require_debriefings(scope)
    cliente = _load_cliente(cliente_id)
    cliente_nome = cliente.get("nome", "")

    from services import google_drive_service

    if not google_drive_service.is_configured():
        return {"ciclos": [], "warning": "Google Drive não configurado"}

    client_folder = google_drive_service.find_client_folder_in_master(cliente_nome)
    if not client_folder:
        return {
            "ciclos": [],
            "warning": f"Pasta do cliente '{cliente_nome}' não encontrada no Drive",
            "cliente_folder_searched": cliente_nome,
        }

    ciclos = google_drive_service.list_ciclos_for_client(client_folder["id"])

    # Se não houver CICLO|* subfolders, retorna ciclo único (a própria pasta)
    if not ciclos:
        return {
            "ciclos": [{
                "ciclo_numero": 1,
                "name": client_folder["name"],
                "created_time": client_folder.get("createdTime"),
                "is_current": True,
                "is_single_cycle": True,
                "web_view_link": client_folder.get("webViewLink"),
            }],
            "client_folder_name": client_folder["name"],
        }

    # Marca o último (mais recente) como atual
    for i, c in enumerate(ciclos):
        c["is_current"] = (i == len(ciclos) - 1)
        c["is_single_cycle"] = False

    return {
        "ciclos": ciclos,
        "client_folder_name": client_folder["name"],
    }


@router.get("")
async def list_debriefings(
    cliente_id: Optional[str] = Query(None),
    scope: UserScope = Depends(get_user_scope),
):
    """Lista debriefings, opcionalmente filtrados por cliente. Mais recentes primeiro."""
    require_debriefings_or_consultor(scope)
    q = _supabase.table("debriefings").select("*").order("gerado_at", desc=True)
    if cliente_id:
        q = q.eq("cliente_id", cliente_id)
    result = q.execute()
    return {"debriefings": result.data or [], "total": len(result.data or [])}


@router.get("/{debriefing_id}")
async def get_debriefing(debriefing_id: str, scope: UserScope = Depends(get_user_scope)):
    """Detalhe completo de um debriefing (inclui markdown_content)."""
    require_debriefings_or_consultor(scope)
    result = _supabase.table("debriefings").select("*").eq("id", debriefing_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Debriefing não encontrado")
    return result.data


@router.get("/{debriefing_id}/stream")
async def stream_debriefing(debriefing_id: str, scope: UserScope = Depends(get_user_scope)):
    """
    SSE com progresso ao vivo. Cliente se inscreve, recebe eventos das fases até 'done'.
    Cada evento é uma linha "data: {json}\\n\\n".
    """
    require_debriefings(scope)
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
async def download_pdf(debriefing_id: str, scope: UserScope = Depends(get_user_scope)):
    """
    Retorna URL assinada pro PDF no Supabase Storage (válida ~1h).
    Phase 4: implementação real.
    """
    require_debriefings_or_consultor(scope)
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
