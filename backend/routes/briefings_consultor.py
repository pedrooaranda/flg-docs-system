"""
Rotas de Briefings do Consultor — Sub-projeto 3 Debriefings.

Endpoints (todos sob /briefings-consultor):
  GET    /cliente/{cliente_id}/me     consultor lê o próprio briefing
  PATCH  /cliente/{cliente_id}/me     consultor upsert do próprio
  GET    /cliente/{cliente_id}        lista todos (comercial+diretor+owner)

Gating:
  - /me (GET/PATCH): qualquer pessoa registrada como consultor (scope.consultor_id NOT NULL)
  - lista: require_debriefings (comercial, diretor, owner)
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import supabase_client
from lib.auth_scope import UserScope, get_user_scope, require_debriefings

_supabase = supabase_client

router = APIRouter(prefix="/briefings-consultor", tags=["briefings-consultor"])


class BriefingPayload(BaseModel):
    conteudo: str


def _require_consultor_id(scope: UserScope) -> str:
    """Bloqueia quem não tem consultor_id (ex: comercial sem ficha de consultor)."""
    if not scope.consultor_id:
        raise HTTPException(
            status_code=403,
            detail="Apenas consultores podem escrever briefings.",
        )
    return scope.consultor_id


@router.get("/cliente/{cliente_id}/me")
async def get_my_briefing(
    cliente_id: str,
    scope: UserScope = Depends(get_user_scope),
):
    """Retorna o briefing do consultor logado pra esse cliente.

    Se não existe ainda, retorna conteudo vazio + atualizado_em None.
    """
    consultor_id = _require_consultor_id(scope)
    row = (
        _supabase.table("briefings_consultor")
        .select("conteudo, atualizado_em")
        .eq("cliente_id", cliente_id)
        .eq("consultor_id", consultor_id)
        .maybe_single()
        .execute()
    )
    if not row.data:
        return {"conteudo": "", "atualizado_em": None}
    return {"conteudo": row.data["conteudo"], "atualizado_em": row.data["atualizado_em"]}


@router.patch("/cliente/{cliente_id}/me")
async def update_my_briefing(
    cliente_id: str,
    payload: BriefingPayload,
    scope: UserScope = Depends(get_user_scope),
):
    """Upsert do briefing do consultor logado pra esse cliente."""
    consultor_id = _require_consultor_id(scope)
    now_iso = datetime.now(timezone.utc).isoformat()
    result = (
        _supabase.table("briefings_consultor")
        .upsert(
            {
                "cliente_id": cliente_id,
                "consultor_id": consultor_id,
                "conteudo": payload.conteudo,
                "atualizado_em": now_iso,
            },
            on_conflict="cliente_id,consultor_id",
        )
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Falha ao salvar")
    saved = result.data[0]
    return {"conteudo": saved["conteudo"], "atualizado_em": saved["atualizado_em"]}


@router.get("/cliente/{cliente_id}")
async def list_briefings(
    cliente_id: str,
    scope: UserScope = Depends(get_user_scope),
):
    """Lista todos os briefings de consultor desse cliente.

    Cada item vem com consultor_nome resolvido via join.
    Ordenado por atualizado_em DESC (mais recente primeiro).
    """
    require_debriefings(scope)
    rows = (
        _supabase.table("briefings_consultor")
        .select("consultor_id, conteudo, atualizado_em, colaboradores(nome)")
        .eq("cliente_id", cliente_id)
        .order("atualizado_em", desc=True)
        .execute()
    )
    return [
        {
            "consultor_id": r["consultor_id"],
            "consultor_nome": (r.get("colaboradores") or {}).get("nome") or "Consultor",
            "conteudo": r["conteudo"],
            "atualizado_em": r["atualizado_em"],
        }
        for r in (rows.data or [])
    ]
