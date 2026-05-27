"""Fixtures pytest pro backend FLG.

Padrão: mocka supabase_client pra evitar hit em rede. Cada teste define o
shape dos retornos via fixture. Não usa real Supabase — testes unit.
"""
from dataclasses import dataclass
from unittest.mock import MagicMock, patch
import pytest


@dataclass
class FakeUser:
    """Mimics supabase auth user object."""
    id: str
    email: str


@pytest.fixture
def fake_user_consultor():
    return FakeUser(id="00000000-0000-0000-0000-000000000001",
                    email="lucasnery@grupoguglielmi.com")


@pytest.fixture
def fake_user_admin():
    return FakeUser(id="00000000-0000-0000-0000-000000000002",
                    email="adminuser@grupoguglielmi.com")


@pytest.fixture
def fake_user_diretor():
    return FakeUser(id="00000000-0000-0000-0000-000000000003",
                    email="diretor@grupoguglielmi.com")


@pytest.fixture
def fake_user_owner():
    return FakeUser(id="00000000-0000-0000-0000-000000000004",
                    email="pedroaranda@grupoguglielmi.com")


@pytest.fixture
def fake_user_external():
    """User autenticado SEM ficha em colaboradores."""
    return FakeUser(id="00000000-0000-0000-0000-000000000099",
                    email="externo@example.com")


@pytest.fixture
def mock_supabase():
    """Mock do supabase_client com chainable API (table().select().eq()...)."""
    with patch("deps.supabase_client") as mock_sb:
        # Define um chain helper — cada teste configura o `.execute().data` retornado
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.order.return_value = chain
        chain.single.return_value = chain
        chain.maybe_single.return_value = chain
        chain.insert.return_value = chain
        chain.update.return_value = chain
        mock_sb.table.return_value = chain
        # default execute retorna empty data; testes sobrescrevem
        chain.execute.return_value = MagicMock(data=[])
        yield mock_sb
