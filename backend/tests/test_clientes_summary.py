"""Tests pro GET /clientes/summary — agrega métricas IG por cliente."""
import pytest
from unittest.mock import MagicMock, patch

from lib.auth_scope import UserScope


def _scope_admin():
    return UserScope(user_id="u-a", email="a@grupoguglielmi.com",
                     can_see_all=True, consultor_id="a-id", consultor_nome="Admin",
                     categoria="diretor", role="admin",
                     can_see_principal=True, can_see_debriefings=True,
                     can_see_debriefings_admin=True)


def _scope_consultor():
    return UserScope(user_id="u-l", email="lucas@grupoguglielmi.com",
                     can_see_all=False, consultor_id="lucas-id", consultor_nome="Lucas Nery",
                     categoria="consultor", role="member",
                     can_see_principal=True, can_see_debriefings=False,
                     can_see_debriefings_admin=False)


async def test_summary_admin_inclui_metricas_ig(mock_main_supabase):
    """Admin → recebe todos clientes + métricas IG agregadas inline."""
    from main import list_clientes_summary

    mock_main_supabase.table().select().is_().order().execute.return_value = MagicMock(
        data=[
            {"id": "c1", "nome": "Cliente A", "empresa": "E A", "consultor_id": "lucas-id",
             "consultor_responsavel": "Lucas Nery", "encontro_atual": 5, "status": "ativo",
             "archived_at": None, "updated_at": "2026-05-26T00:00:00Z",
             "created_at": "2026-05-01T00:00:00Z"}
        ]
    )

    result = await list_clientes_summary(
        consultor_id=None, include_archived=False, scope=_scope_admin()
    )

    assert isinstance(result, list)
    assert len(result) == 1
    c = result[0]
    assert c["id"] == "c1"
    assert c["nome"] == "Cliente A"
    assert "seguidores_atual" in c
    assert "taxa_engajamento_pct" in c
    assert "dias_sem_postar" in c
    assert "instagram_conectado" in c


async def test_summary_consultor_filtra_por_scope(mock_main_supabase):
    """Consultor regular → só clientes onde consultor_id = self.id."""
    from main import list_clientes_summary

    mock_main_supabase.table().select().eq().is_().order().execute.return_value = MagicMock(data=[])

    result = await list_clientes_summary(
        consultor_id=None, include_archived=False, scope=_scope_consultor()
    )

    assert isinstance(result, list)
    eq_calls = mock_main_supabase.table().select().eq.call_args_list
    consultor_filter = [c for c in eq_calls
                        if len(c.args) >= 2
                        and c.args[0] == "consultor_id" and c.args[1] == "lucas-id"]
    assert len(consultor_filter) >= 1


async def test_summary_consultor_sem_id_retorna_403(mock_main_supabase):
    """User externo sem ficha (can_see_principal=False) → 403 do require_principal."""
    from main import list_clientes_summary
    from fastapi import HTTPException

    scope_sem_id = UserScope(user_id="u-x", email="x@example.com",
                              can_see_all=False, consultor_id=None,
                              consultor_nome=None, categoria=None, role=None,
                              can_see_principal=False, can_see_debriefings=False,
                              can_see_debriefings_admin=False)

    with pytest.raises(HTTPException) as exc:
        await list_clientes_summary(
            consultor_id=None, include_archived=False, scope=scope_sem_id
        )
    assert exc.value.status_code == 403


async def test_summary_admin_include_archived_true(mock_main_supabase):
    """Admin com ?include_archived=true não filtra archived."""
    from main import list_clientes_summary

    mock_main_supabase.table().select().order().execute.return_value = MagicMock(data=[])

    await list_clientes_summary(
        consultor_id=None, include_archived=True, scope=_scope_admin()
    )

    is_calls = mock_main_supabase.table().select().is_.call_args_list
    archived_filters = [c for c in is_calls if c.args[0] == "archived_at"]
    assert len(archived_filters) == 0
