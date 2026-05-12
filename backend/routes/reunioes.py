"""
Rotas REST de Reuniões — parte PRÁTICA por cliente (encontros_pratica).

Endpoints:
  GET  /reunioes/{cliente_id}                       — lista status de TODOS os encontros do cliente
  GET  /reunioes/{cliente_id}/{numero}              — pratica do encontro N (cria rascunho se não existe)
  POST /reunioes/{cliente_id}/{numero}/chat         — turno de chat com Claude (SSE streaming)
  POST /reunioes/{cliente_id}/{numero}/gerar        — pede pro Claude produzir HTML final
  POST /reunioes/{cliente_id}/{numero}/marcar-pronto — status=pronto + gera slug
  POST /reunioes/{cliente_id}/{numero}/revogar      — marca slug_revogado_at (mantém histórico)

Auth: requer usuário autenticado. Não há gate por consultor↔cliente — frontend filtra.
Writes carimbam `consultor_email` pra audit.
"""

import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from deps import get_current_user, supabase_client
from services.claude_chat_pratica import (
    stream_chat_turn,
    generate_pratica_html,
)

logger = logging.getLogger("flg.reunioes")
router = APIRouter(prefix="/reunioes", tags=["reunioes"])
_supabase = supabase_client

SLUG_BYTES = 9  # 12 chars base64 → ~72 bits de entropia
MAX_SLUG_RETRIES = 5


# ─── Modelos ─────────────────────────────────────────────────────────────────

class ChatTurnInput(BaseModel):
    message: str


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _get_cliente_or_404(cliente_id: str) -> dict:
    r = (
        _supabase.table("clientes")
        .select("*")
        .eq("id", cliente_id)
        .maybe_single()
        .execute()
    )
    if not r or not r.data:
        raise HTTPException(status_code=404, detail=f"Cliente {cliente_id} não encontrado")
    return r.data


def _get_encontro_or_404(numero: int) -> dict:
    r = (
        _supabase.table("encontros_base")
        .select("*")
        .eq("numero", numero)
        .maybe_single()
        .execute()
    )
    if not r or not r.data:
        raise HTTPException(status_code=404, detail=f"Encontro {numero} não encontrado")
    return r.data


def _get_or_create_pratica(cliente_id: str, numero: int, consultor_email: str) -> dict:
    """Busca a row de encontros_pratica. Cria rascunho vazio se não existir."""
    r = (
        _supabase.table("encontros_pratica")
        .select("*")
        .eq("cliente_id", cliente_id)
        .eq("encontro_numero", numero)
        .maybe_single()
        .execute()
    )
    if r and r.data:
        return r.data

    # Cria rascunho
    payload = {
        "cliente_id": cliente_id,
        "encontro_numero": numero,
        "conversa_chat": [],
        "status": "rascunho",
        "consultor_email": consultor_email,
    }
    try:
        ins = _supabase.table("encontros_pratica").insert(payload).execute()
    except Exception as e:
        # Pode ter colidido com inserção concorrente — re-busca
        logger.warning(f"_get_or_create_pratica: insert falhou ({e}), tentando re-buscar")
        r2 = (
            _supabase.table("encontros_pratica")
            .select("*")
            .eq("cliente_id", cliente_id)
            .eq("encontro_numero", numero)
            .maybe_single()
            .execute()
        )
        if r2 and r2.data:
            return r2.data
        raise HTTPException(status_code=500, detail=f"Erro ao criar pratica: {e}")

    if not ins.data:
        raise HTTPException(status_code=500, detail="Falha ao criar rascunho de prática")
    return ins.data[0]


def _generate_slug_unique() -> str:
    """Gera slug com retry em caso de colisão (UNIQUE constraint)."""
    for _ in range(MAX_SLUG_RETRIES):
        candidate = secrets.token_urlsafe(SLUG_BYTES)
        existing = (
            _supabase.table("encontros_pratica")
            .select("id")
            .eq("slug", candidate)
            .limit(1)
            .execute()
        )
        if not (existing.data or []):
            return candidate
    raise HTTPException(status_code=500, detail="Não foi possível gerar slug único após retries")


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/{cliente_id}")
async def list_praticas_do_cliente(cliente_id: str, user=Depends(get_current_user)):
    """Lista TODAS as práticas (uma por encontro) deste cliente.
    Retorna inclusive encontros que não tem prática ainda — com status null."""
    _get_cliente_or_404(cliente_id)

    encontros = (
        _supabase.table("encontros_base")
        .select("numero, titulo, html_intelecto, num_slides_intelecto")
        .order("numero")
        .execute()
    )

    praticas = (
        _supabase.table("encontros_pratica")
        .select("*")
        .eq("cliente_id", cliente_id)
        .execute()
    )
    pratica_por_numero = {p["encontro_numero"]: p for p in (praticas.data or [])}

    result = []
    for enc in (encontros.data or []):
        p = pratica_por_numero.get(enc["numero"])
        result.append({
            "encontro_numero": enc["numero"],
            "titulo": enc.get("titulo"),
            "intelectual_html_pronto": bool(enc.get("html_intelecto") and enc["html_intelecto"].strip()),
            "num_slides_intelecto": enc.get("num_slides_intelecto") or 0,
            "pratica": p,  # null se ainda não tem
        })
    return result


@router.get("/{cliente_id}/{numero}")
async def get_pratica(cliente_id: str, numero: int, user=Depends(get_current_user)):
    """Retorna a prática do encontro N pra este cliente. Cria rascunho se não existe."""
    _get_cliente_or_404(cliente_id)
    _get_encontro_or_404(numero)
    return _get_or_create_pratica(cliente_id, numero, user.email)


@router.post("/{cliente_id}/{numero}/chat")
async def chat_turn(
    cliente_id: str,
    numero: int,
    payload: ChatTurnInput,
    user=Depends(get_current_user),
):
    """Turno de chat com Claude, streaming SSE.
    Persiste a mensagem do user no início, e o assistant accumulado ao final."""
    if not (payload.message or "").strip():
        raise HTTPException(status_code=400, detail="Mensagem vazia")

    cliente = _get_cliente_or_404(cliente_id)
    encontro = _get_encontro_or_404(numero)
    pratica = _get_or_create_pratica(cliente_id, numero, user.email)

    # Append user turn ao histórico ANTES de chamar Claude (transparência mesmo se falhar)
    conversa = list(pratica.get("conversa_chat") or [])
    now_iso = datetime.now(timezone.utc).isoformat()
    user_turn = {"role": "user", "content": payload.message.strip(), "ts": now_iso}
    conversa.append(user_turn)

    try:
        _supabase.table("encontros_pratica").update({
            "conversa_chat": conversa,
            "ultima_atualizacao": now_iso,
        }).eq("id", pratica["id"]).execute()
    except Exception as e:
        logger.error(f"chat_turn: falha ao salvar user turn: {e}")
        # Continua mesmo assim — perda do user turn é melhor que travar o chat

    async def stream_generator():
        full_response = ""
        try:
            # claude_chat_pratica.stream_chat_turn é sync generator
            for delta in stream_chat_turn(
                conversa_anterior=conversa[:-1],  # tudo menos a última (que é o user atual)
                nova_mensagem_user=user_turn["content"],
                encontro=encontro,
                cliente=cliente,
            ):
                full_response += delta
                yield f"data: {json.dumps({'type': 'text_delta', 'content': delta})}\n\n"
        except Exception as e:
            logger.exception(f"chat_turn stream: erro Claude: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            return

        # Append assistant turn ao histórico
        if full_response.strip():
            conversa.append({
                "role": "assistant",
                "content": full_response,
                "ts": datetime.now(timezone.utc).isoformat(),
            })
            try:
                _supabase.table("encontros_pratica").update({
                    "conversa_chat": conversa,
                    "ultima_atualizacao": datetime.now(timezone.utc).isoformat(),
                }).eq("id", pratica["id"]).execute()
            except Exception as e:
                logger.error(f"chat_turn: falha ao salvar assistant turn: {e}")

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{cliente_id}/{numero}/gerar")
async def gerar_html_pratica(cliente_id: str, numero: int, user=Depends(get_current_user)):
    """Pede pro Claude produzir o HTML prática FINAL com base na conversa.
    Salva em encontros_pratica.html_pratica. Status volta pra 'rascunho' (consultor revisa)."""
    cliente = _get_cliente_or_404(cliente_id)
    encontro = _get_encontro_or_404(numero)
    pratica = _get_or_create_pratica(cliente_id, numero, user.email)

    conversa = pratica.get("conversa_chat") or []
    if not conversa:
        raise HTTPException(status_code=400, detail="Conversa vazia — converse com o assistente antes de gerar")

    try:
        result = generate_pratica_html(
            conversa=conversa,
            encontro=encontro,
            cliente=cliente,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        upd = _supabase.table("encontros_pratica").update({
            "html_pratica": result["html"],
            "num_slides_pratica": result["num_slides"],
            "status": "rascunho",
            "ultima_atualizacao": now_iso,
        }).eq("id", pratica["id"]).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar HTML prática: {e}")

    updated = (upd.data or [None])[0]
    if not updated:
        raise HTTPException(status_code=500, detail="Falha ao atualizar HTML prática no DB")

    return {
        **updated,
        "_telemetry": {
            "num_slides": result["num_slides"],
            "input_tokens": result["input_tokens"],
            "cached_input_tokens": result["cached_input_tokens"],
            "output_tokens": result["output_tokens"],
        },
    }


@router.post("/{cliente_id}/{numero}/marcar-pronto")
async def marcar_pronto(cliente_id: str, numero: int, user=Depends(get_current_user)):
    """Status=pronto + gera slug público pra apresentação. Idempotente:
    se já está pronto e tem slug ativo, retorna sem mudar.
    Se slug foi revogado, gera um novo."""
    _get_cliente_or_404(cliente_id)
    _get_encontro_or_404(numero)
    pratica = _get_or_create_pratica(cliente_id, numero, user.email)

    if not (pratica.get("html_pratica") or "").strip():
        raise HTTPException(status_code=400, detail="HTML prática vazio — gere o HTML antes de marcar como pronto")

    # Se já tá pronto E slug está ativo, no-op
    slug_atual = pratica.get("slug")
    slug_revogado = pratica.get("slug_revogado_at")
    if pratica.get("status") == "pronto" and slug_atual and not slug_revogado:
        return pratica

    # Caso contrário, gera (ou regenera) slug e marca pronto
    novo_slug = _generate_slug_unique()
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        upd = _supabase.table("encontros_pratica").update({
            "status": "pronto",
            "slug": novo_slug,
            "slug_gerado_at": now_iso,
            "slug_revogado_at": None,
            "ultima_atualizacao": now_iso,
        }).eq("id", pratica["id"]).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao marcar pronto: {e}")

    updated = (upd.data or [None])[0]
    if not updated:
        raise HTTPException(status_code=500, detail="Falha ao atualizar status no DB")
    return updated


@router.post("/{cliente_id}/{numero}/revogar")
async def revogar_slug(cliente_id: str, numero: int, user=Depends(get_current_user)):
    """Revoga slug atual — apresentação pública passa a retornar 404.
    Não muda status (slug ainda pode ser regerado via marcar-pronto)."""
    _get_cliente_or_404(cliente_id)
    _get_encontro_or_404(numero)
    pratica = _get_or_create_pratica(cliente_id, numero, user.email)

    if not pratica.get("slug"):
        raise HTTPException(status_code=400, detail="Sem slug pra revogar")

    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        upd = _supabase.table("encontros_pratica").update({
            "slug_revogado_at": now_iso,
            "ultima_atualizacao": now_iso,
        }).eq("id", pratica["id"]).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao revogar slug: {e}")

    updated = (upd.data or [None])[0]
    if not updated:
        raise HTTPException(status_code=500, detail="Falha ao revogar slug no DB")
    return updated
