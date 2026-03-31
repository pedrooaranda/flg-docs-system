"""
Rotas de Notas do Consultor — FLG Jornada System.

CRUD de notas por cliente. Cada nota tem tipo, conteúdo e flag de fixada.
Admin vê todas; consultor vê apenas as próprias.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_current_user, supabase_client

router = APIRouter(prefix="/notas", tags=["notas"])
_supabase = supabase_client

TIPOS_VALIDOS = ("geral", "percepcao", "trava", "evolucao", "alerta", "tarefa")


class NotaInput(BaseModel):
    conteudo: str
    tipo: str = "geral"
    fixada: bool = False


class NotaUpdate(BaseModel):
    conteudo: Optional[str] = None
    tipo: Optional[str] = None
    fixada: Optional[bool] = None


@router.get("/{cliente_id}")
async def list_notas(
    cliente_id: str,
    tipo: Optional[str] = None,
    user=Depends(get_current_user),
):
    """Listar notas do cliente. Fixadas aparecem primeiro, depois por data desc."""
    q = _supabase.table("notas_consultor").select("*").eq(
        "cliente_id", cliente_id
    ).order("fixada", desc=True).order("created_at", desc=True)

    if tipo and tipo in TIPOS_VALIDOS:
        q = q.eq("tipo", tipo)

    result = q.execute()
    return {"notas": result.data or [], "total": len(result.data or [])}


@router.post("/{cliente_id}")
async def create_nota(cliente_id: str, body: NotaInput, user=Depends(get_current_user)):
    """Criar nota para um cliente."""
    if body.tipo not in TIPOS_VALIDOS:
        raise HTTPException(400, f"Tipo inválido. Use: {', '.join(TIPOS_VALIDOS)}")

    if not body.conteudo.strip():
        raise HTTPException(400, "Conteúdo não pode ser vazio")

    payload = {
        "cliente_id": cliente_id,
        "consultor_email": user.email,
        "tipo": body.tipo,
        "conteudo": body.conteudo.strip(),
        "fixada": body.fixada,
    }

    try:
        result = _supabase.table("notas_consultor").insert(payload).execute()
        return result.data[0] if result.data else payload
    except Exception as e:
        raise HTTPException(500, f"Erro ao criar nota (tabela pode não existir — rode migration 005): {e}")


@router.patch("/{nota_id}")
async def update_nota(nota_id: str, body: NotaUpdate, user=Depends(get_current_user)):
    """Atualizar nota (conteúdo, tipo ou fixar/desafixar)."""
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if body.conteudo is not None:
        update_data["conteudo"] = body.conteudo.strip()
    if body.tipo is not None:
        if body.tipo not in TIPOS_VALIDOS:
            raise HTTPException(400, f"Tipo inválido. Use: {', '.join(TIPOS_VALIDOS)}")
        update_data["tipo"] = body.tipo
    if body.fixada is not None:
        update_data["fixada"] = body.fixada

    result = _supabase.table("notas_consultor").update(update_data).eq("id", nota_id).execute()
    if not result.data:
        raise HTTPException(404, "Nota não encontrada")
    return result.data[0]


@router.delete("/{nota_id}")
async def delete_nota(nota_id: str, user=Depends(get_current_user)):
    """Deletar nota."""
    _supabase.table("notas_consultor").delete().eq("id", nota_id).execute()
    return {"ok": True}


@router.get("/{cliente_id}/recentes")
async def notas_recentes(cliente_id: str, limit: int = 5, user=Depends(get_current_user)):
    """Retorna as últimas N notas — usado internamente pelo agente IA."""
    result = _supabase.table("notas_consultor").select(
        "tipo, conteudo, consultor_email, created_at"
    ).eq("cliente_id", cliente_id).order(
        "created_at", desc=True
    ).limit(limit).execute()
    return result.data or []
