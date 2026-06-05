"""
Permissionamento por consultor — single source-of-truth do scope do usuário.

Regra de visibilidade (alinhada com spec stream 6):
  can_see_all = (categoria == 'diretor') OR (role IN ('owner', 'admin'))

UserScope é usado como FastAPI Depends em endpoints que filtram clientes/métricas.
Frontend consome via GET /me/scope (endpoint que serializa este dataclass).

Fallback de owner: emails em OWNER_FALLBACK_EMAILS (definidos em routes/colaboradores.py
pra evitar drift) sobem pra owner mesmo sem ficha em `colaboradores` — protege Pedro
caso registro seja deletado por engano.

Nota de import: supabase_client é acessado via `deps.supabase_client` (não capturado
com `from deps import supabase_client`) pra que o patch("deps.supabase_client") dos
testes funcione corretamente.
"""
from dataclasses import dataclass, asdict
from typing import Optional

import deps
from fastapi import Depends, HTTPException

from deps import get_current_user

# Espelha OWNER_FALLBACK_EMAILS de routes/colaboradores.py.
# Hardcoded de propósito — match exato (não substring) pra robustez.
OWNER_FALLBACK_EMAILS = {"pedroaranda@grupoguglielmi.com"}


@dataclass(frozen=True)
class UserScope:
    user_id: str
    email: str
    can_see_all: bool
    consultor_id: Optional[str]
    consultor_nome: Optional[str]
    categoria: Optional[str]                  # 'consultor' | 'diretor' | 'comercial' | None
    role: Optional[str]                        # 'owner' | 'admin' | 'member' | None
    can_see_principal: bool                    # sistema principal (Clientes, Métricas, etc.)
    can_see_debriefings: bool                  # subsistema Debriefings
    can_see_debriefings_admin: bool            # painel admin do Debriefing (KPIs, ranking)

    def to_dict(self) -> dict:
        return asdict(self)


def _is_owner_fallback(email: str) -> bool:
    """Pedro hardcoded como owner caso ficha tenha sido deletada."""
    return (email or "").strip().lower() in OWNER_FALLBACK_EMAILS


def _compute_flags(categoria: Optional[str], role: Optional[str]) -> tuple[bool, bool, bool]:
    """Calcula (can_see_principal, can_see_debriefings, can_see_debriefings_admin)
    baseado em categoria + role. Owner sempre vê tudo."""
    is_owner = role == "owner"

    can_see_principal = is_owner or (categoria in ("consultor", "diretor"))
    can_see_debriefings = is_owner or (categoria in ("diretor", "comercial"))
    can_see_debriefings_admin = (
        is_owner
        or categoria == "diretor"
        or (categoria == "comercial" and role == "admin")
    )

    return can_see_principal, can_see_debriefings, can_see_debriefings_admin


async def get_user_scope(user=Depends(get_current_user)) -> UserScope:
    """
    Resolve o scope de permissão do usuário autenticado.

    1. Lookup colaboradores por email (ativo=true)
    2. can_see_all = (categoria='diretor') OR (role IN ('owner', 'admin'))
    3. Edge case: sem ficha + email em OWNER_FALLBACK_EMAILS → owner
    4. Edge case: sem ficha + sem fallback → can_see_all=False, consultor_id=None
       (vê NADA — lista vazia em /clientes)

    Usa deps.supabase_client (não importado diretamente) pra compatibilidade
    com patch("deps.supabase_client") nos testes.
    """
    email = (user.email or "").strip().lower()
    user_id = getattr(user, "id", "") or ""

    # Lookup colaborador — acessa via deps para permitir mock em testes
    resp = (
        deps.supabase_client.table("colaboradores")
        .select("id, nome, email, categoria, role")
        .eq("email", email)
        .eq("ativo", True)
        .maybe_single()
        .execute()
    )
    row = resp.data if resp else None

    if row is None:
        # Sem ficha — tenta fallback de owner
        if _is_owner_fallback(email):
            can_see_p, can_see_d, can_see_da = _compute_flags(None, "owner")
            return UserScope(
                user_id=user_id,
                email=email,
                can_see_all=True,
                consultor_id=None,
                consultor_nome=None,
                categoria=None,
                role="owner",
                can_see_principal=can_see_p,
                can_see_debriefings=can_see_d,
                can_see_debriefings_admin=can_see_da,
            )
        # User externo / não cadastrado: não vê nada
        return UserScope(
            user_id=user_id,
            email=email,
            can_see_all=False,
            consultor_id=None,
            consultor_nome=None,
            categoria=None,
            role=None,
            can_see_principal=False,
            can_see_debriefings=False,
            can_see_debriefings_admin=False,
        )

    categoria = row.get("categoria")
    role = row.get("role") or "member"
    can_see_all = (categoria == "diretor") or (role in ("owner", "admin"))
    can_see_p, can_see_d, can_see_da = _compute_flags(categoria, role)

    return UserScope(
        user_id=user_id,
        email=email,
        can_see_all=can_see_all,
        consultor_id=row.get("id"),
        consultor_nome=row.get("nome"),
        categoria=categoria,
        role=role,
        can_see_principal=can_see_p,
        can_see_debriefings=can_see_d,
        can_see_debriefings_admin=can_see_da,
    )


# ─── Helpers de gating pra endpoints (FastAPI levanta HTTPException → 403) ────


def require_principal(scope: UserScope) -> None:
    """Bloqueia acesso ao sistema principal (Clientes, Métricas, etc.).
    Comerciais recebem 403."""
    if not scope.can_see_principal:
        raise HTTPException(
            status_code=403,
            detail="Acesso restrito ao sistema principal",
        )


def require_debriefings(scope: UserScope) -> None:
    """Bloqueia acesso ao subsistema de Debriefings.
    Consultores (não-diretores) recebem 403."""
    if not scope.can_see_debriefings:
        raise HTTPException(
            status_code=403,
            detail="Acesso restrito ao sistema de Debriefings",
        )


def require_debriefings_or_consultor(scope: UserScope) -> None:
    """
    Aceita ou quem pode ver Debriefings (canSeeDebriefings) ou qualquer pessoa
    registrada como consultor (consultor_id NOT NULL).

    Usado nos 3 GETs de leitura de /debriefings/* (lista, detalhe, PDF) pra
    permitir consultor ler histórico de debriefings dos clientes — necessário
    pra tela "Briefing do Consultor" (sub-projeto 3).

    POST/DELETE/stream em /debriefings/* continuam com require_debriefings
    (consultor não gera nem apaga).
    """
    if scope.can_see_debriefings or scope.consultor_id is not None:
        return
    raise HTTPException(status_code=403, detail="Acesso restrito")


def require_debriefings_admin(scope: UserScope) -> None:
    """Bloqueia acesso ao painel admin de Debriefings (KPIs, ranking).
    Membros Comerciais regulares recebem 403."""
    if not scope.can_see_debriefings_admin:
        raise HTTPException(
            status_code=403,
            detail="Acesso restrito ao painel admin de Debriefings",
        )
