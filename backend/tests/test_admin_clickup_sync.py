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

def _mock_request(headers=None):
    """Mock minimal de fastapi.Request com .headers.get(...)."""
    req = MagicMock()
    req.headers = headers or {}
    # Garante que .get(key, default) funciona como dict
    if hasattr(req.headers, "get") and not callable(req.headers.get):
        # Se MagicMock retornou MagicMock como .get, forçar dict-like
        actual = dict(req.headers) if headers else {}
        req.headers = actual
    return req


async def test_admin_sync_admin_dispara_e_retorna_stats(mock_main_supabase):
    """Admin POST /admin/clickup/sync dispara run_clickup_sync e retorna stats."""
    from main import trigger_clickup_sync

    fake_stats = {
        "archived": 5, "reactivated": 1, "paused": 3, "ativos": 50,
        "errors": 0, "total": 59, "duration_ms": 1234,
    }

    with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
        with patch("main.run_clickup_sync", return_value=fake_stats):
            result = await trigger_clickup_sync(
                request=_mock_request(),
                scope=_scope_admin(),
            )

    # Stats originais preservados + _diagnostico adicionado
    assert result["archived"] == 5
    assert result["ativos"] == 50
    assert result["duration_ms"] == 1234
    assert result["_diagnostico"]["token_configured"] is True
    assert result["_diagnostico"]["triggered_by"] == "admin_ui"


async def test_admin_sync_consultor_regular_403(mock_main_supabase):
    """Consultor regular tentando POST /admin/clickup/sync → 403."""
    from main import trigger_clickup_sync
    from fastapi import HTTPException

    with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
        with pytest.raises(HTTPException) as exc_info:
            await trigger_clickup_sync(
                request=_mock_request(),
                scope=_scope_consultor(),
            )

    assert exc_info.value.status_code == 403


async def test_admin_sync_diretor_allowed(mock_main_supabase):
    """Diretor com can_see_all=True consegue disparar sync."""
    from main import trigger_clickup_sync

    diretor_scope = UserScope(
        user_id="user-diretor",
        email="diretor@grupoguglielmi.com",
        can_see_all=True,
        consultor_id="diretor-id",
        consultor_nome="Diretor",
        categoria="diretor",
        role="member",
    )

    fake_stats = {
        "archived": 2, "reactivated": 0, "paused": 1, "ativos": 30,
        "errors": 0, "total": 33, "duration_ms": 500,
    }

    with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
        with patch("main.run_clickup_sync", return_value=fake_stats):
            result = await trigger_clickup_sync(
                request=_mock_request(),
                scope=diretor_scope,
            )

    assert result["archived"] == 2


async def test_admin_sync_cron_token_bypass_auth(mock_main_supabase):
    """Workflow cron com X-Cron-Token válido bypassa auth de admin."""
    from main import trigger_clickup_sync

    fake_stats = {"archived": 0, "ativos": 5, "total": 5, "duration_ms": 200}

    with patch.dict("os.environ", {
        "CLICKUP_API_TOKEN": "fake-token",
        "CRON_SHARED_SECRET": "supersecret123",
    }):
        with patch("main.run_clickup_sync", return_value=fake_stats):
            result = await trigger_clickup_sync(
                request=_mock_request({"X-Cron-Token": "supersecret123"}),
                scope=_scope_consultor(),  # Mesmo consultor regular passa via cron
            )

    assert result["archived"] == 0
    assert result["_diagnostico"]["triggered_by"] == "cron"


async def test_admin_sync_503_se_token_clickup_ausente(mock_main_supabase):
    """Sem CLICKUP_API_TOKEN → 503 explícito (não 0ms silencioso)."""
    from main import trigger_clickup_sync
    from fastapi import HTTPException

    # Limpa env do CLICKUP_API_TOKEN se houver
    env_sem_token = {k: v for k, v in __import__("os").environ.items() if k != "CLICKUP_API_TOKEN"}
    env_sem_token["CLICKUP_API_TOKEN"] = ""

    with patch.dict("os.environ", env_sem_token, clear=True):
        with pytest.raises(HTTPException) as exc_info:
            await trigger_clickup_sync(
                request=_mock_request(),
                scope=_scope_admin(),
            )

    assert exc_info.value.status_code == 503
    assert "CLICKUP_API_TOKEN" in exc_info.value.detail
