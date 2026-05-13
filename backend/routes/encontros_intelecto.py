"""
Rotas REST de Encontros — parte Intelectual.

Endpoints:
  GET  /encontros/:numero                       — detalhe encontro (todos autenticados)
  POST /admin/encontros/:numero/intelecto       — salva intelecto_estrutura (admin+)
  POST /admin/encontros/:numero/gerar-html      — gera HTML via Claude (admin+)
"""

import logging
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_current_user, supabase_client
from services.claude_html_generator import generate_intelecto_html, normalize_asset_paths

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
