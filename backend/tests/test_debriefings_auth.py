"""Tests de gating do subsistema de Debriefings (sub-projeto 1).

Regra:
  - Consultor recebe 403 em /debriefings/*
  - Diretor, Comercial e Owner passam

Carrega routes/debriefings.py como módulo real via importlib.util (mesmo padrão
de test_metricas_auth.py), patchando routes.debriefings._supabase pra evitar
hit em rede.
"""
import importlib.util
import os
import sys
import types
import pytest
from unittest.mock import MagicMock, patch

from lib.auth_scope import get_user_scope


# ─── Carrega routes/debriefings.py como módulo real ───────────────────────────
# conftest coloca routes.debriefings em _internal_mods (stub). Removemos o stub
# e carregamos o módulo real, stubando dependências externas (services.*).

def _identity_decorator(*args, **kwargs):
    """Decorator identity: @router.get("/path") preserva a função handler."""
    def _wrap(fn):
        return fn
    return _wrap


def _load_debriefings_module():
    """Importa routes/debriefings.py real, ignorando o stub do conftest."""
    # Remove stub existente
    sys.modules.pop("routes.debriefings", None)
    sys.modules.pop("services.debriefing_generator", None)
    sys.modules.pop("services.debriefing_pdf", None)

    # ── fastapi missing names ─────────────────────────────────────────────────
    # debriefings.py importa BackgroundTasks/Query/Request/UploadFile que o
    # stub minimal do conftest não expõe. Suplementa antes do carregamento.
    _fastapi_stub = sys.modules["fastapi"]
    if not hasattr(_fastapi_stub, "BackgroundTasks"):
        _fastapi_stub.BackgroundTasks = MagicMock
    if not hasattr(_fastapi_stub, "Query"):
        _fastapi_stub.Query = lambda *a, **kw: None

    # ── services package + sub-stubs ──────────────────────────────────────────
    if not isinstance(sys.modules.get("services"), types.ModuleType):
        _svc_pkg = types.ModuleType("services")
        sys.modules["services"] = _svc_pkg

    _gen_stub = types.ModuleType("services.debriefing_generator")
    _gen_stub.DebriefingRequest = MagicMock()
    _gen_stub.run_debriefing = MagicMock()
    sys.modules["services.debriefing_generator"] = _gen_stub
    sys.modules["services"].debriefing_generator = _gen_stub

    _pdf_stub = types.ModuleType("services.debriefing_pdf")
    _pdf_stub.get_signed_url = MagicMock(return_value="https://signed.example/x")
    _pdf_stub.upload_pdf = MagicMock()
    sys.modules["services.debriefing_pdf"] = _pdf_stub
    sys.modules["services"].debriefing_pdf = _pdf_stub

    # ── APIRouter stub com identity decorators ────────────────────────────────
    _fastapi_stub = sys.modules["fastapi"]
    _orig_apirouter = getattr(_fastapi_stub, "APIRouter", None)

    class _IdentityRouter:
        def __init__(self, **kwargs):
            self.prefix = kwargs.get("prefix", "")
            self.tags = kwargs.get("tags", [])

        def get(self, *args, **kwargs):
            return _identity_decorator(*args, **kwargs)

        def post(self, *args, **kwargs):
            return _identity_decorator(*args, **kwargs)

        def put(self, *args, **kwargs):
            return _identity_decorator(*args, **kwargs)

        def patch(self, *args, **kwargs):
            return _identity_decorator(*args, **kwargs)

        def delete(self, *args, **kwargs):
            return _identity_decorator(*args, **kwargs)

    _fastapi_stub.APIRouter = _IdentityRouter

    try:
        _spec = importlib.util.spec_from_file_location(
            "routes.debriefings",
            os.path.join(os.path.dirname(__file__), "..", "routes", "debriefings.py"),
        )
        _mod = importlib.util.module_from_spec(_spec)
        sys.modules["routes.debriefings"] = _mod
        _spec.loader.exec_module(_mod)
    finally:
        if _orig_apirouter is not None:
            _fastapi_stub.APIRouter = _orig_apirouter

    return _mod


_debriefings_mod = _load_debriefings_module()


# ─── Fixture pra patchar _supabase do módulo real ────────────────────────────

@pytest.fixture
def mock_debriefings_supabase():
    """Patcha routes.debriefings._supabase com chain chainable."""
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.order.return_value = chain
    chain.single.return_value = chain
    chain.maybe_single.return_value = chain
    chain.insert.return_value = chain
    chain.update.return_value = chain
    chain.execute.return_value = MagicMock(data=[])

    with patch.object(_debriefings_mod, "_supabase") as mock_sb:
        mock_sb.table.return_value = chain
        mock_sb.chain = chain
        yield mock_sb


# ─── Tests ────────────────────────────────────────────────────────────────────

async def test_consultor_acessa_list_debriefings(mock_supabase, mock_debriefings_supabase, fake_user_consultor):
    """Consultor regular passa em /debriefings (read-only, sub-projeto 3).

    Mudou em sub-projeto 3: GETs de leitura aceitam consultor via
    require_debriefings_or_consultor pra tela 'Briefing do Consultor'.
    POST/DELETE continuam restritos (require_debriefings).
    """
    list_debriefings = _debriefings_mod.list_debriefings

    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-c", "nome": "Lucas", "email": fake_user_consultor.email,
              "categoria": "consultor", "role": "member"}
    )
    mock_debriefings_supabase.chain.execute.return_value = MagicMock(data=[])

    scope = await get_user_scope(user=fake_user_consultor)
    result = await list_debriefings(scope=scope)
    assert "debriefings" in result and "total" in result


async def test_diretor_acessa_list_debriefings(mock_supabase, mock_debriefings_supabase, fake_user_diretor):
    """Diretor passa em /debriefings."""
    list_debriefings = _debriefings_mod.list_debriefings

    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-d", "nome": "Diretor", "email": fake_user_diretor.email,
              "categoria": "diretor", "role": "member"}
    )
    mock_debriefings_supabase.chain.execute.return_value = MagicMock(data=[])

    scope = await get_user_scope(user=fake_user_diretor)
    result = await list_debriefings(scope=scope)
    assert "debriefings" in result and "total" in result


async def test_comercial_acessa_list_debriefings(mock_supabase, mock_debriefings_supabase, fake_user_consultor):
    """Membro Comercial passa em /debriefings."""
    list_debriefings = _debriefings_mod.list_debriefings

    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-com", "nome": "Comercial", "email": fake_user_consultor.email,
              "categoria": "comercial", "role": "member"}
    )
    mock_debriefings_supabase.chain.execute.return_value = MagicMock(data=[])

    scope = await get_user_scope(user=fake_user_consultor)
    result = await list_debriefings(scope=scope)
    assert "debriefings" in result and "total" in result
