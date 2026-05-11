"""
Rotas REST de Colaboradores — FLG Jornada System.

Endpoints:
  GET    /colaboradores              — lista (filtros: categoria, role, ativo, tier)
  GET    /colaboradores/me           — perfil do usuário logado (resolve por email)
  GET    /colaboradores/{id}         — detalhe por id
  POST   /colaboradores              — criar (admin+)
  PATCH  /colaboradores/{id}         — editar (member: self apenas; admin+: qualquer)
  DELETE /colaboradores/{id}         — soft-delete (admin+)

Permissões: hierarquia 'owner' > 'admin' > 'member'. Owner é o único que pode
promover alguém para owner. Admin pode promover member ↔ admin e editar qualquer
campo. Member só edita o próprio registro em campos limitados.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from deps import get_current_user, supabase_client
from services.colaboradores_sync import sync_role_to_auth_metadata

logger = logging.getLogger("flg.colaboradores")
router = APIRouter(prefix="/colaboradores", tags=["colaboradores"])
_supabase = supabase_client


# ─── Modelos ─────────────────────────────────────────────────────────────────

CATEGORIAS_VALIDAS = ("consultor", "diretor")
TIERS_VALIDOS = ("junior", "pleno", "senior", "lead")
ROLES_VALIDOS = ("owner", "admin", "member")
ROLE_LEVEL = {"member": 0, "admin": 1, "owner": 2}

# Email regex simples — validação real é no Supabase Auth no signup; aqui só rejeita
# input obviamente quebrado. Evita dep extra `email-validator` que `EmailStr` exigiria.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Fallback hardcoded pro owner — proteção se registro do Pedro for deletado por engano.
# Match EXATO (não substring) pra evitar que qualquer email com 'pedro' ganhe acesso.
OWNER_FALLBACK_EMAILS = {"pedroaranda@grupoguglielmi.com"}


class ColaboradorCreate(BaseModel):
    email: str
    nome: str = Field(min_length=1)
    categoria: str
    cargo: Optional[str] = None
    tier: Optional[str] = None
    role: str = "member"
    manager_id: Optional[str] = None
    avatar_url: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("Email inválido")
        return v


class ColaboradorUpdate(BaseModel):
    nome: Optional[str] = None
    categoria: Optional[str] = None
    cargo: Optional[str] = None
    tier: Optional[str] = None
    role: Optional[str] = None
    manager_id: Optional[str] = None
    avatar_url: Optional[str] = None
    ativo: Optional[bool] = None


# ─── Helpers de permissão ────────────────────────────────────────────────────

def _is_owner_fallback(user) -> bool:
    """Pedro hardcoded como owner caso registro tenha sido deletado.
    Match exato (não substring) — proteção robusta."""
    return (user.email or "").strip().lower() in OWNER_FALLBACK_EMAILS


def _resolve_caller(user) -> dict:
    """Resolve o colaborador correspondente ao usuário autenticado pelo email.
    Retorna dict do colaborador ou None se não houver registro."""
    email = (user.email or "").strip().lower()
    r = _supabase.table("colaboradores").select("*").eq("email", email).maybe_single().execute()
    return r.data if r else None


def _require_role(user, min_role: str) -> dict:
    """Garante que o caller tem pelo menos `min_role`. Retorna o colaborador do caller.
    Levanta HTTP 403 se não.

    Fallback: se Pedro (email exato) não tem registro, trata como owner —
    protege caso registro seja deletado por engano.
    """
    caller = _resolve_caller(user)
    if caller is None:
        if _is_owner_fallback(user):
            return {"email": user.email, "role": "owner", "_fallback": True}
        raise HTTPException(status_code=403, detail="Usuário sem registro de colaborador. Peça pra um admin criar.")

    caller_level = ROLE_LEVEL.get(caller.get("role", "member"), 0)
    required_level = ROLE_LEVEL[min_role]
    if caller_level < required_level:
        raise HTTPException(status_code=403, detail=f"Operação requer role {min_role}+")
    return caller


# ─── Validações de payload ───────────────────────────────────────────────────

def _validate_categoria(value: Optional[str], field: str = "categoria"):
    if value is not None and value not in CATEGORIAS_VALIDAS:
        raise HTTPException(status_code=400, detail=f"{field} deve ser uma de: {CATEGORIAS_VALIDAS}")


def _validate_tier(value: Optional[str]):
    if value is not None and value not in TIERS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"tier deve ser uma de: {TIERS_VALIDOS}")


def _validate_role(value: Optional[str]):
    if value is not None and value not in ROLES_VALIDOS:
        raise HTTPException(status_code=400, detail=f"role deve ser uma de: {ROLES_VALIDOS}")


# ─── Endpoints GET ───────────────────────────────────────────────────────────

@router.get("")
async def list_colaboradores(
    categoria: Optional[str] = None,
    role: Optional[str] = None,
    tier: Optional[str] = None,
    ativo: Optional[bool] = True,
    user=Depends(get_current_user),
):
    """Lista colaboradores. Default: só ativos. Qualquer logado pode chamar."""
    q = _supabase.table("colaboradores").select("*").order("nome")
    if categoria:
        _validate_categoria(categoria)
        q = q.eq("categoria", categoria)
    if role:
        _validate_role(role)
        q = q.eq("role", role)
    if tier:
        _validate_tier(tier)
        q = q.eq("tier", tier)
    if ativo is not None:
        q = q.eq("ativo", ativo)
    r = q.execute()
    return {"colaboradores": r.data or [], "total": len(r.data or [])}


@router.get("/me")
async def get_my_profile(user=Depends(get_current_user)):
    """Resolve o colaborador correspondente ao usuário logado pelo email."""
    caller = _resolve_caller(user)
    if caller is None:
        raise HTTPException(status_code=404, detail="Você não tem registro de colaborador. Peça pra um admin criar.")
    return caller


@router.get("/{colab_id}")
async def get_colaborador(colab_id: str, user=Depends(get_current_user)):
    r = _supabase.table("colaboradores").select("*").eq("id", colab_id).maybe_single().execute()
    if not r or not r.data:
        raise HTTPException(status_code=404, detail="Colaborador não encontrado")
    return r.data


# ─── Endpoint POST ───────────────────────────────────────────────────────────

@router.post("")
async def create_colaborador(payload: ColaboradorCreate, user=Depends(get_current_user)):
    """Cria colaborador. Admin+ apenas. Promoção a 'owner' requer caller=owner."""
    caller = _require_role(user, "admin")

    _validate_categoria(payload.categoria)
    _validate_tier(payload.tier)
    _validate_role(payload.role)

    # Apenas owner pode criar outro owner
    if payload.role == "owner" and caller.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Apenas Owner pode criar outro Owner")

    # Verificar que o email tem signup no Supabase Auth (evita registro órfão).
    # list_users() default per_page=50 — bumpamos pra 200 (cobre o workspace FLG por muito tempo).
    # Quando passarmos disso, refatorar pra paginação real ou cache de mapping email→user_id.
    try:
        users = _supabase.auth.admin.list_users(page=1, per_page=200)
        # supabase-py v2.10+: retorna List[User] (Pydantic User objects).
        target_email = payload.email.strip().lower()
        exists = any((getattr(u, "email", "") or "").strip().lower() == target_email for u in users)
        if not exists:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Email {payload.email} não tem conta no Supabase Auth. "
                    "Convide o usuário pelo dashboard Auth primeiro, depois crie o colaborador."
                ),
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"create_colaborador: falha ao verificar auth.users: {e}")
        # Continua mesmo assim — não quer travar criação por causa de erro no list_users

    # Insert
    data = payload.model_dump(exclude_none=True)
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_at"] = data["created_at"]

    try:
        r = _supabase.table("colaboradores").insert(data).execute()
    except Exception as e:
        msg = str(e)
        if "unique" in msg.lower() or "duplicate" in msg.lower():
            raise HTTPException(status_code=409, detail=f"Email {payload.email} já cadastrado")
        raise HTTPException(status_code=500, detail=f"Erro ao criar colaborador: {msg}")

    novo = (r.data or [None])[0]
    if not novo:
        raise HTTPException(status_code=500, detail="Colaborador não foi criado")

    # Sync role pra auth metadata (se role != default 'member' faz sentido sincronizar
    # imediatamente; pra 'member' também rodamos pra garantir consistência)
    sync_role_to_auth_metadata(_supabase, novo["email"], novo["role"])

    return novo
