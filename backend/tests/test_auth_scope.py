"""Tests pro UserScope + get_user_scope dependency.

Regra:
  can_see_all = (categoria=='diretor') OR (role IN ('owner','admin'))
  Senão: vê só os próprios.
"""
import pytest
from unittest.mock import MagicMock

from lib.auth_scope import UserScope, get_user_scope


async def test_consultor_regular_nao_ve_tudo(mock_supabase, fake_user_consultor):
    """Consultor categoria=consultor, role=member → can_see_all=False."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-lucas", "nome": "Lucas Nery", "email": fake_user_consultor.email,
              "categoria": "consultor", "role": "member"}
    )
    scope = await get_user_scope(user=fake_user_consultor)
    assert scope.can_see_all is False
    assert scope.consultor_id == "id-lucas"
    assert scope.consultor_nome == "Lucas Nery"
    assert scope.categoria == "consultor"
    assert scope.role == "member"


async def test_diretor_ve_tudo_mesmo_com_role_member(mock_supabase, fake_user_diretor):
    """Diretor sempre vê tudo, mesmo role=member."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-dir", "nome": "Diretor X", "email": fake_user_diretor.email,
              "categoria": "diretor", "role": "member"}
    )
    scope = await get_user_scope(user=fake_user_diretor)
    assert scope.can_see_all is True
    assert scope.consultor_id == "id-dir"


async def test_admin_ve_tudo_mesmo_categoria_consultor(mock_supabase, fake_user_admin):
    """Admin (role=admin) sobe permissão técnica, mesmo categoria=consultor."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-admin", "nome": "Admin X", "email": fake_user_admin.email,
              "categoria": "consultor", "role": "admin"}
    )
    scope = await get_user_scope(user=fake_user_admin)
    assert scope.can_see_all is True


async def test_owner_ve_tudo(mock_supabase, fake_user_owner):
    """Owner sempre vê tudo."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-pedro", "nome": "Pedro Aranda", "email": fake_user_owner.email,
              "categoria": "diretor", "role": "owner"}
    )
    scope = await get_user_scope(user=fake_user_owner)
    assert scope.can_see_all is True


async def test_user_sem_ficha_fallback_owner_pedro(mock_supabase, fake_user_owner):
    """Pedro sem ficha colaboradores ainda é owner via OWNER_FALLBACK_EMAILS."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(data=None)
    scope = await get_user_scope(user=fake_user_owner)
    assert scope.can_see_all is True
    assert scope.consultor_id is None  # sem ficha → sem id
    assert scope.role == "owner"  # via fallback


async def test_user_externo_sem_ficha_nem_fallback(mock_supabase, fake_user_external):
    """User autenticado mas sem ficha e fora do fallback → can_see_all=False + consultor_id=None.

    Significa que VAI ver lista vazia (filtro WHERE consultor_id = None não bate nada).
    """
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(data=None)
    scope = await get_user_scope(user=fake_user_external)
    assert scope.can_see_all is False
    assert scope.consultor_id is None


# ─── Flags de scope estendido (sub-projeto 1 — Debriefings) ──────────────


async def test_consultor_can_see_principal_true(mock_supabase, fake_user_consultor):
    """Consultor regular → can_see_principal=True (é dono do sistema principal)."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-lucas", "nome": "Lucas", "email": fake_user_consultor.email,
              "categoria": "consultor", "role": "member"}
    )
    scope = await get_user_scope(user=fake_user_consultor)
    assert scope.can_see_principal is True
    assert scope.can_see_debriefings is False
    assert scope.can_see_debriefings_admin is False


async def test_diretor_ve_principal_e_debriefings(mock_supabase, fake_user_diretor):
    """Diretor → vê os dois sistemas e também o painel admin do debriefing."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-dir", "nome": "Diretor", "email": fake_user_diretor.email,
              "categoria": "diretor", "role": "member"}
    )
    scope = await get_user_scope(user=fake_user_diretor)
    assert scope.can_see_principal is True
    assert scope.can_see_debriefings is True
    assert scope.can_see_debriefings_admin is True


async def test_comercial_member_so_debriefings(mock_supabase, fake_user_consultor):
    """Membro Comercial → só debriefings, sem painel admin."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-com", "nome": "Comercial", "email": fake_user_consultor.email,
              "categoria": "comercial", "role": "member"}
    )
    scope = await get_user_scope(user=fake_user_consultor)
    assert scope.can_see_principal is False
    assert scope.can_see_debriefings is True
    assert scope.can_see_debriefings_admin is False


async def test_comercial_admin_ve_painel(mock_supabase, fake_user_admin):
    """Diretor Comercial (categoria=comercial, role=admin) → vê painel admin."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-dc", "nome": "Dir Com", "email": fake_user_admin.email,
              "categoria": "comercial", "role": "admin"}
    )
    scope = await get_user_scope(user=fake_user_admin)
    assert scope.can_see_principal is False
    assert scope.can_see_debriefings is True
    assert scope.can_see_debriefings_admin is True


async def test_owner_ve_tudo_independente_categoria(mock_supabase, fake_user_owner):
    """Owner vê tudo, em qualquer categoria."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-pedro", "nome": "Pedro", "email": fake_user_owner.email,
              "categoria": "comercial", "role": "owner"}
    )
    scope = await get_user_scope(user=fake_user_owner)
    assert scope.can_see_principal is True
    assert scope.can_see_debriefings is True
    assert scope.can_see_debriefings_admin is True


async def test_owner_fallback_pedro_ve_tudo(mock_supabase, fake_user_owner):
    """Pedro sem ficha em colaboradores ainda vê tudo via OWNER_FALLBACK_EMAILS."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(data=None)
    scope = await get_user_scope(user=fake_user_owner)
    assert scope.can_see_principal is True
    assert scope.can_see_debriefings is True
    assert scope.can_see_debriefings_admin is True


async def test_external_sem_ficha_nao_ve_nada(mock_supabase, fake_user_external):
    """User externo (sem ficha, sem fallback) → não vê nada."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(data=None)
    scope = await get_user_scope(user=fake_user_external)
    assert scope.can_see_principal is False
    assert scope.can_see_debriefings is False
    assert scope.can_see_debriefings_admin is False
