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
import secrets
import string
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

# Domínio corporativo obrigatório pra novos colaboradores. Match case-insensitive
# pelo sufixo. Hardcoded — se a empresa adicionar mais domínios, virar env var ou
# tabela de configuração.
ALLOWED_EMAIL_DOMAIN = "@grupoguglielmi.com"

# Tamanho da senha temporária gerada quando o backend cria auth.user automaticamente.
TEMP_PASSWORD_LENGTH = 16


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


def _resolve_caller(user) -> Optional[dict]:
    """Resolve o colaborador ATIVO correspondente ao usuário autenticado pelo email.
    Retorna dict do colaborador ou None se não houver registro ativo.

    Filtra `ativo=true` intencionalmente — soft-deleted = sem privilégios.
    Caller deletado tenta operação → cai pra fallback (se for owner email) ou 403.
    """
    email = (user.email or "").strip().lower()
    r = _supabase.table("colaboradores").select("*").eq("email", email).eq("ativo", True).maybe_single().execute()
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
            return {"email": (user.email or "").strip().lower(), "role": "owner", "_fallback": True}
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


def _validate_email_domain(email: str):
    """Garante que o email termina com ALLOWED_EMAIL_DOMAIN. Case-insensitive."""
    if not (email or "").strip().lower().endswith(ALLOWED_EMAIL_DOMAIN):
        raise HTTPException(
            status_code=400,
            detail=f"Email deve usar o domínio corporativo {ALLOWED_EMAIL_DOMAIN}",
        )


def _generate_password(length: int = TEMP_PASSWORD_LENGTH) -> str:
    """
    Gera senha aleatória forte. Garante diversidade mínima (pelo menos 1 maiúscula,
    1 minúscula, 1 dígito). Usa `secrets.choice` (CSPRNG).
    """
    alphabet = string.ascii_letters + string.digits
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in password)
            and any(c.isupper() for c in password)
            and any(c.isdigit() for c in password)
        ):
            return password


def _create_auth_user(email: str, nome: str) -> tuple[bool, Optional[str]]:
    """
    Cria conta em auth.users com senha temporária e marca `needs_password_change=true`
    no user_metadata. Idempotente: se o user já existir, retorna (False, None) sem erro.

    Returns: (was_created: bool, temporary_password: Optional[str])
      - (True,  password) → criou agora, retorna senha pra revelar
      - (False, None)     → user já existia, fluxo normal

    Levanta HTTPException 500 se Supabase falhar de fato (não "já existe").
    """
    target = email.strip().lower()

    # Verifica se já existe
    try:
        users = _supabase.auth.admin.list_users(page=1, per_page=200)
        existing = any(
            (getattr(u, "email", "") or "").strip().lower() == target for u in users
        )
        if existing:
            return False, None
    except Exception as e:
        logger.error(f"_create_auth_user: list_users falhou pra {target}: {e}")
        # Não trava criação — tenta create_user mesmo assim; se já existe, retorna erro distinto.

    # Cria novo
    password = _generate_password()
    try:
        _supabase.auth.admin.create_user({
            "email": target,
            "password": password,
            "email_confirm": True,  # skip verification email — admin já validou
            "user_metadata": {
                "full_name": nome,
                "needs_password_change": True,
            },
        })
        logger.info(f"_create_auth_user: criada conta auth.users pra {target}")
        return True, password
    except Exception as e:
        msg = str(e)
        # Race: já existia mas list_users não retornou — trata como existente
        if "already" in msg.lower() or "exists" in msg.lower() or "duplicate" in msg.lower():
            logger.warning(f"_create_auth_user: {target} já existia (race com list_users)")
            return False, None
        logger.error(f"_create_auth_user: create_user falhou pra {target}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Falha ao criar conta no Supabase Auth: {msg[:200]}",
        )


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
    """
    Cria colaborador. Admin+ apenas. Promoção a 'owner' requer caller=owner.

    Auto-provisioning (Phase 3.1): se o email não tem conta em auth.users, o backend
    cria automaticamente com senha aleatória e retorna a senha temporária na resposta
    (campo `temporary_password`). Admin é responsável por transmitir a senha ao novo
    colaborador.

    Validação de domínio: email deve terminar em ALLOWED_EMAIL_DOMAIN
    (@grupoguglielmi.com). Retorna 400 caso contrário.
    """
    caller = _require_role(user, "admin")

    _validate_email_domain(payload.email)
    _validate_categoria(payload.categoria)
    _validate_tier(payload.tier)
    _validate_role(payload.role)

    # Apenas owner pode criar outro owner
    if payload.role == "owner" and caller.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Apenas Owner pode criar outro Owner")

    target_email = payload.email.strip().lower()

    # Auto-provisioning: cria auth user se ainda não existe
    auth_user_created, temporary_password = _create_auth_user(target_email, payload.nome)

    # Insert colaborador (sempre, independente de auth.user já existir ou ter sido criado)
    data = payload.model_dump(exclude_none=True)
    data["email"] = target_email  # normaliza pra lowercase
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_at"] = data["created_at"]

    try:
        r = _supabase.table("colaboradores").insert(data).execute()
    except Exception as e:
        msg = str(e)
        # Se criamos auth user agora MAS DB insert falhou, sobra órfão no Auth.
        # Loga ERROR pra cleanup manual. Não tenta rollback automático (risco maior
        # que orfão isolado).
        if auth_user_created:
            logger.error(
                f"create_colaborador: insert DB falhou DEPOIS de criar auth user pra "
                f"{target_email} — ÓRFÃO no auth.users, limpeza manual necessária. Erro: {msg}"
            )
        if "unique" in msg.lower() or "duplicate" in msg.lower():
            raise HTTPException(status_code=409, detail=f"Email {target_email} já cadastrado como colaborador")
        raise HTTPException(status_code=500, detail=f"Erro ao criar colaborador: {msg}")

    novo = (r.data or [None])[0]
    if not novo:
        raise HTTPException(status_code=500, detail="Colaborador não foi criado")

    # Sync role pra auth metadata
    sync_role_to_auth_metadata(_supabase, novo["email"], novo["role"])

    # Resposta: colaborador + (opcional) senha temporária
    response = {**novo}
    if temporary_password:
        response["temporary_password"] = temporary_password
        response["auth_user_created"] = True
    return response


# ─── Endpoint PATCH ──────────────────────────────────────────────────────────

# Campos que o próprio colaborador pode editar quando não é admin+
SELF_EDITABLE_FIELDS = {"nome", "cargo", "avatar_url"}


@router.patch("/{colab_id}")
async def update_colaborador(
    colab_id: str,
    payload: ColaboradorUpdate,
    user=Depends(get_current_user),
):
    """
    Edita colaborador. Regras:
    - Admin+: edita qualquer um, qualquer campo.
    - Member: edita só o próprio registro, apenas campos SELF_EDITABLE_FIELDS.
    - Promoção pra role='owner' requer caller=owner.
    """
    # Validar tabela
    target_resp = _supabase.table("colaboradores").select("*").eq("id", colab_id).maybe_single().execute()
    target = target_resp.data if target_resp else None
    if not target:
        raise HTTPException(status_code=404, detail="Colaborador não encontrado")

    # Resolver caller (qualquer role, mesmo member, passa). Pedro fallback exato.
    caller = _resolve_caller(user)
    is_owner_fb = caller is None and _is_owner_fallback(user)
    if caller is None and not is_owner_fb:
        raise HTTPException(status_code=403, detail="Sem registro de colaborador")
    if is_owner_fb:
        caller = {"email": (user.email or "").strip().lower(), "role": "owner", "_fallback": True}

    caller_level = ROLE_LEVEL.get(caller.get("role", "member"), 0)
    is_admin_plus = caller_level >= ROLE_LEVEL["admin"]
    is_self = caller.get("email") == target.get("email")

    if not is_admin_plus and not is_self:
        raise HTTPException(status_code=403, detail="Você só pode editar o próprio registro")

    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada pra atualizar")

    # Member auto-editando: filtra apenas campos permitidos
    if not is_admin_plus:
        invalid = [k for k in updates.keys() if k not in SELF_EDITABLE_FIELDS]
        if invalid:
            raise HTTPException(
                status_code=403,
                detail=f"Member só pode editar: {sorted(SELF_EDITABLE_FIELDS)}. Não permitido: {invalid}",
            )

    # Validar valores enum
    _validate_categoria(updates.get("categoria"))
    _validate_tier(updates.get("tier"))
    _validate_role(updates.get("role"))

    # Promoção a 'owner' só por outro owner
    new_role = updates.get("role")
    if new_role == "owner" and caller.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Apenas Owner pode promover alguém a Owner")

    # Rebaixamento de owner: também só owner pode rebaixar outro owner
    if target.get("role") == "owner" and new_role and new_role != "owner" and caller.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Apenas Owner pode rebaixar outro Owner")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        r = _supabase.table("colaboradores").update(updates).eq("id", colab_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar: {e}")

    updated = (r.data or [None])[0]
    if not updated:
        raise HTTPException(status_code=500, detail="Update não retornou registro")

    # Se role mudou, sincronizar com auth metadata
    if new_role and new_role != target.get("role"):
        sync_role_to_auth_metadata(_supabase, updated["email"], new_role)

    return updated


# ─── Endpoint DELETE ─────────────────────────────────────────────────────────

@router.delete("/{colab_id}")
async def delete_colaborador(colab_id: str, user=Depends(get_current_user)):
    """Soft-delete: marca ativo=false. Admin+. Owner não pode ser desativado por não-owner."""
    caller = _require_role(user, "admin")

    target_resp = _supabase.table("colaboradores").select("*").eq("id", colab_id).maybe_single().execute()
    target = target_resp.data if target_resp else None
    if not target:
        raise HTTPException(status_code=404, detail="Colaborador não encontrado")

    if target.get("role") == "owner" and caller.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Apenas Owner pode desativar outro Owner")

    # Auto-desativação: bloqueada (evita lockout acidental)
    if target.get("email") == caller.get("email"):
        raise HTTPException(status_code=400, detail="Você não pode desativar seu próprio registro")

    try:
        _supabase.table("colaboradores").update({
            "ativo": False,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", colab_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao desativar: {e}")

    return {"ok": True, "id": colab_id, "ativo": False}
