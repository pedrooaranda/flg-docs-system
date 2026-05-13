"""
Rotas REST de Encontros — parte Intelectual.

Endpoints:
  GET  /encontros/:numero                       — detalhe encontro (todos autenticados)
  POST /admin/encontros/:numero/intelecto       — salva intelecto_estrutura (admin+)
  POST /admin/encontros/:numero/gerar-html      — gera HTML via Claude (admin+)
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from deps import get_current_user, supabase_client
from services.claude_html_generator import (
    generate_intelecto_html,
    normalize_asset_paths,
    stream_intelecto_html,
)

logger = logging.getLogger("flg.encontros_intelecto")
router = APIRouter(tags=["encontros-intelecto"])
_supabase = supabase_client


# ─── Helpers ─────────────────────────────────────────────────────────────────

from routes.colaboradores import _require_role as _require_role_shared


def _require_admin(user):
    """Garante caller tem role admin+. Reusa _require_role de colaboradores
    pra evitar drift do fallback (Pedro hardcoded como owner) e da lógica de RBAC."""
    _require_role_shared(user, "admin")


# ─── Modelos ─────────────────────────────────────────────────────────────────

class EstruturaInput(BaseModel):
    intelecto_estrutura: str


class HtmlInput(BaseModel):
    html_intelecto: str  # admin pode editar raw e salvar diretamente


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/encontros/{numero}")
async def get_encontro(numero: int, user=Depends(get_current_user)):
    """Detalhe do encontro. Todos autenticados podem ver."""
    r = (
        _supabase.table("encontros_base")
        .select("*")
        .eq("numero", numero)
        .maybe_single()
        .execute()
    )
    if not r or not r.data:
        raise HTTPException(status_code=404, detail=f"Encontro {numero} não encontrado")
    # Normaliza paths relativos em HTMLs antigos (../assets → /flg-design-system/assets).
    data = r.data
    if data.get("html_intelecto"):
        data["html_intelecto"] = normalize_asset_paths(data["html_intelecto"])
    return data


@router.post("/admin/encontros/{numero}/intelecto")
async def save_intelecto_estrutura(
    numero: int,
    payload: EstruturaInput,
    user=Depends(get_current_user),
):
    """Salva intelecto_estrutura (admin+). Não dispara geração HTML — admin
    precisa chamar /gerar-html separado pra recriar o HTML cacheado."""
    _require_admin(user)

    try:
        r = (
            _supabase.table("encontros_base")
            .update({
                "intelecto_estrutura": payload.intelecto_estrutura,
                "intelecto_updated_at": datetime.now(timezone.utc).isoformat(),
                "intelecto_updated_by": user.email,
            })
            .eq("numero", numero)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar estrutura: {e}")

    updated = (r.data or [None])[0]
    if not updated:
        raise HTTPException(status_code=404, detail=f"Encontro {numero} não encontrado")
    return updated


@router.post("/admin/encontros/{numero}/gerar-html")
async def gerar_html_intelecto(numero: int, user=Depends(get_current_user)):
    """Gera HTML via Claude a partir de intelecto_estrutura. Salva em html_intelecto."""
    _require_admin(user)

    # Buscar encontro pra pegar estrutura
    r = (
        _supabase.table("encontros_base")
        .select("numero, intelecto_estrutura")
        .eq("numero", numero)
        .maybe_single()
        .execute()
    )
    encontro = r.data if r else None
    if not encontro:
        raise HTTPException(status_code=404, detail=f"Encontro {numero} não encontrado")
    if not (encontro.get("intelecto_estrutura") or "").strip():
        raise HTTPException(status_code=400, detail="Encontro sem intelecto_estrutura — salve a estrutura textual primeiro")

    # Chamada Claude
    try:
        result = generate_intelecto_html(
            intelecto_estrutura=encontro["intelecto_estrutura"],
            encontro_numero=numero,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Salvar HTML + metadata
    try:
        upd = (
            _supabase.table("encontros_base")
            .update({
                "html_intelecto": result["html"],
                "num_slides_intelecto": result["num_slides"],
                "html_gerado_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("numero", numero)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar HTML: {e}")

    updated_record = (upd.data or [None])[0]
    if not updated_record:
        raise HTTPException(status_code=500, detail="Falha ao atualizar HTML no DB")

    return {
        **updated_record,                             # ← spread the full record FIRST
        "_telemetry": {                                # ← put generation metadata in a sub-key
            "num_slides": result["num_slides"],
            "input_tokens": result["input_tokens"],
            "cached_input_tokens": result["cached_input_tokens"],
            "output_tokens": result["output_tokens"],
        },
    }


@router.post("/admin/encontros/{numero}/gerar-html-stream")
async def gerar_html_intelecto_stream(numero: int, user=Depends(get_current_user)):
    """Stream SSE da geração de HTML via Claude. Mesma lógica do /gerar-html
    mas emite eventos em tempo real:
      - {type:'delta',  content:str}     — chunk de texto do Claude (preview live)
      - {type:'progress', slides_completed, estimated_total, output_chars}
      - {type:'progress', fallback:true, message:str}  — caiu pra Haiku
      - {type:'validating'}              — terminou stream, validando HTML
      - {type:'done', record, telemetry} — salvou no DB com sucesso
      - {type:'error', message:str}      — falha não-recuperável
    """
    _require_admin(user)

    r = (
        _supabase.table("encontros_base")
        .select("numero, intelecto_estrutura")
        .eq("numero", numero)
        .maybe_single()
        .execute()
    )
    encontro = r.data if r else None
    if not encontro:
        raise HTTPException(status_code=404, detail=f"Encontro {numero} não encontrado")
    estrutura = (encontro.get("intelecto_estrutura") or "").strip()
    if not estrutura:
        raise HTTPException(status_code=400, detail="Encontro sem intelecto_estrutura — salve a estrutura textual primeiro")

    # Conta `SLIDE N` na estrutura pra estimar total — usado pela progress bar
    estimated_total = len(re.findall(r"^SLIDE\s+\d+", estrutura, re.MULTILINE | re.IGNORECASE))

    def event_generator():
        try:
            for ev_type, payload in stream_intelecto_html(estrutura, numero, estimated_total):
                if ev_type == 'delta':
                    yield f"data: {json.dumps({'type': 'delta', 'content': payload})}\n\n"
                elif ev_type == 'progress':
                    yield f"data: {json.dumps({'type': 'progress', **(payload or {})})}\n\n"
                elif ev_type == 'validating':
                    yield f"data: {json.dumps({'type': 'validating'})}\n\n"
                elif ev_type == 'error':
                    yield f"data: {json.dumps({'type': 'error', **(payload or {})})}\n\n"
                    return
                elif ev_type == 'done':
                    # Salva no DB e emite evento final com o registro persistido
                    try:
                        upd = (
                            _supabase.table("encontros_base")
                            .update({
                                "html_intelecto": payload["html"],
                                "num_slides_intelecto": payload["num_slides"],
                                "html_gerado_at": datetime.now(timezone.utc).isoformat(),
                            })
                            .eq("numero", numero)
                            .execute()
                        )
                    except Exception as e:
                        yield f"data: {json.dumps({'type': 'error', 'message': f'Erro ao salvar HTML: {e}'})}\n\n"
                        return
                    updated_record = (upd.data or [None])[0]
                    if not updated_record:
                        yield f"data: {json.dumps({'type': 'error', 'message': 'Falha ao atualizar HTML no DB'})}\n\n"
                        return
                    yield f"data: {json.dumps({'type': 'done', 'record': updated_record, 'telemetry': {'num_slides': payload['num_slides'], 'model_used': payload.get('model_used'), 'input_tokens': payload['input_tokens'], 'cached_input_tokens': payload['cached_input_tokens'], 'output_tokens': payload['output_tokens']}})}\n\n"
        except Exception as e:
            logger.exception(f"gerar_html_intelecto_stream: erro inesperado: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'Erro inesperado: {e}'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/admin/encontros/{numero}/html")
async def save_html_intelecto_raw(
    numero: int,
    payload: HtmlInput,
    user=Depends(get_current_user),
):
    """Permite admin salvar HTML editado raw (após ajustes manuais no preview).
    Sobrescreve html_intelecto sem chamar Claude."""
    _require_admin(user)

    try:
        # Conta slides via regex simples (sem dep BeautifulSoup aqui — ok)
        num_slides = len(re.findall(r'<section[^>]*class=["\'][^"\']*\bslide\b', payload.html_intelecto))

        r = (
            _supabase.table("encontros_base")
            .update({
                "html_intelecto": payload.html_intelecto,
                "num_slides_intelecto": num_slides,
                "html_gerado_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("numero", numero)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar HTML: {e}")

    updated = (r.data or [None])[0]
    if not updated:
        raise HTTPException(status_code=404, detail=f"Encontro {numero} não encontrado")
    return updated
