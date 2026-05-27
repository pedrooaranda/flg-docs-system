"""Tests pro endpoint GET /me/scope.

Endpoint serializa o UserScope pra frontend consumir via useUserScope hook.

Nota: fastapi não está instalado no env local (roda em Docker) — TestClient não
disponível. Usamos Opção B: chamar get_scope() diretamente com scope mockado.
Isso cobre a lógica do handler; routing é testado em integração no Docker.
"""
import pytest
from unittest.mock import MagicMock

from lib.auth_scope import UserScope


async def test_me_scope_consultor(mock_supabase):
    """Consultor regular recebe scope com can_see_all=False."""
    from routes.me import get_scope

    scope = UserScope(
        user_id="00000000-0000-0000-0000-000000000001",
        email="lucasnery@grupoguglielmi.com",
        can_see_all=False,
        consultor_id="id-lucas",
        consultor_nome="Lucas Nery",
        categoria="consultor",
        role="member",
    )

    body = await get_scope(scope=scope)

    assert body["can_see_all"] is False
    assert body["consultor_id"] == "id-lucas"
    assert body["consultor_nome"] == "Lucas Nery"
    assert body["categoria"] == "consultor"
    assert body["role"] == "member"


async def test_me_scope_admin(mock_supabase):
    """Admin recebe scope com can_see_all=True."""
    from routes.me import get_scope

    scope = UserScope(
        user_id="00000000-0000-0000-0000-000000000002",
        email="admin@grupoguglielmi.com",
        can_see_all=True,
        consultor_id="id-admin",
        consultor_nome="Admin",
        categoria="consultor",
        role="admin",
    )

    body = await get_scope(scope=scope)

    assert body["can_see_all"] is True
    assert body["role"] == "admin"


async def test_me_scope_serializa_todos_campos():
    """to_dict() serializa todos os campos do UserScope sem perda."""
    from routes.me import get_scope

    scope = UserScope(
        user_id="uid-x",
        email="test@grupoguglielmi.com",
        can_see_all=True,
        consultor_id=None,
        consultor_nome=None,
        categoria="diretor",
        role="owner",
    )

    body = await get_scope(scope=scope)

    # Todos os campos do dataclass devem estar presentes
    assert set(body.keys()) == {
        "user_id", "email", "can_see_all", "consultor_id",
        "consultor_nome", "categoria", "role",
    }
    assert body["user_id"] == "uid-x"
    assert body["email"] == "test@grupoguglielmi.com"
    assert body["consultor_id"] is None
    assert body["consultor_nome"] is None
    assert body["categoria"] == "diretor"
