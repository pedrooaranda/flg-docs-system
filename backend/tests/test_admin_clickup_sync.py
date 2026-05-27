"""Tests pro POST /admin/clickup/sync (admin trigger manual).

Padrão: chama handler diretamente como função async com scope mockado.
Não usa TestClient (fastapi não instalado localmente — roda em Docker).

Usa `mock_main_supabase` que patcha main._supabase e deps.supabase_client.
"""
import pytest
from unittest.mock import MagicMock, patch

from lib.auth_scope import UserScope


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _scope_admin():
    return UserScope(
        user_id="user-admin",
        email="admin@grupoguglielmi.com",
        can_see_all=True,
        consultor_id="admin-id",
        consultor_nome="Admin",
        categoria="consultor",
        role="admin",
    )


def _scope_consultor():
    return UserScope(
        user_id="user-lucas",
        email="lucasnery@grupoguglielmi.com",
        can_see_all=False,
        consultor_id="lucas-id",
        consultor_nome="Lucas Nery",
        categoria="consultor",
        role="member",
    )


# ─── Tests ────────────────────────────────────────────────────────────────────

async def test_admin_sync_admin_dispara_e_retorna_stats(mock_main_supabase):
    """Admin POST /admin/clickup/sync dispara run_clickup_sync e retorna stats."""
    from main import trigger_clickup_sync

    fake_stats = {
        "archived": 5,
        "reactivated": 1,
        "paused": 3,
        "ativos": 50,
        "errors": 0,
        "total": 59,
        "duration_ms": 1234,
    }

    # Patch onde a funcao eh importada (main.trigger_clickup_sync -> from services.clickup_sync import)
    with patch("main.run_clickup_sync", return_value=fake_stats):
        result = await trigger_clickup_sync(scope=_scope_admin())

    assert result == fake_stats
    assert result["archived"] == 5
    assert result["ativos"] == 50
    assert result["duration_ms"] == 1234


async def test_admin_sync_consultor_regular_403(mock_main_supabase):
    """Consultor regular tentando POST /admin/clickup/sync → 403."""
    from main import trigger_clickup_sync
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await trigger_clickup_sync(scope=_scope_consultor())

    assert exc_info.value.status_code == 403
    assert "admin" in exc_info.value.detail.lower() or "permissão" in exc_info.value.detail.lower()


async def test_admin_sync_diretor_allowed(mock_main_supabase):
    """Diretor com can_see_all=True consegue disparar sync."""
    from main import trigger_clickup_sync

    diretor_scope = UserScope(
        user_id="user-diretor",
        email="diretor@grupoguglielmi.com",
        can_see_all=True,  # Diretor tem permissão total
        consultor_id="diretor-id",
        consultor_nome="Diretor",
        categoria="consultor",
        role="diretor",
    )

    fake_stats = {
        "archived": 2,
        "reactivated": 0,
        "paused": 1,
        "ativos": 30,
        "errors": 0,
        "total": 33,
        "duration_ms": 500,
    }

    with patch("main.run_clickup_sync", return_value=fake_stats):
        result = await trigger_clickup_sync(scope=diretor_scope)

    assert result == fake_stats
