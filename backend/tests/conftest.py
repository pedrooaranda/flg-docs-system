"""Fixtures pytest pro backend FLG.

Padrão: mocka supabase_client pra evitar hit em rede. Cada teste define o
shape dos retornos via fixture. Não usa real Supabase — testes unit.
"""
import sys
import types
from dataclasses import dataclass
from unittest.mock import MagicMock, patch
import pytest


# ─── Stubs de módulos externos (fastapi, supabase, config) ────────────────────
# Necessário pra importar deps.py + lib/auth_scope.py + main.py sem instalar o
# stack completo no ambiente local (que roda em Docker Python 3.12 com requirements.txt).
# Cada stub expõe só o mínimo que os módulos importam.

def _identity_decorator(*args, **kwargs):
    """Decorator factory que preserva a função original (identity)."""
    def _wrap(fn):
        return fn
    return _wrap


def _make_app_stub():
    """Cria um stub de FastAPI.app onde @app.get/post/patch/delete são identity.

    Garante que quando main.py faz @app.get("/clientes") etc., a função handler
    é preservada (não substituída por MagicMock).
    """
    stub = MagicMock()
    stub.get = _identity_decorator
    stub.post = _identity_decorator
    stub.patch = _identity_decorator
    stub.delete = _identity_decorator
    stub.put = _identity_decorator
    stub.add_middleware = MagicMock()
    stub.include_router = MagicMock()
    stub.on_event = _identity_decorator
    return stub


def _ensure_stubs():
    """Registra stubs em sys.modules antes do pytest coletar os testes."""
    # ── fastapi ────────────────────────────────────────────────────────────────
    # Precisa ser um package real (com submodules) pra evitar:
    # "fastapi.middleware.cors — fastapi is not a package"
    if "fastapi" not in sys.modules:
        _fastapi = types.ModuleType("fastapi")
        _fastapi.Depends = lambda fn: fn   # Depends(x) → x (no-op no teste)
        _fastapi.Header = MagicMock()
        # HTTPException stub que aceita status_code/detail como kwargs
        class _HTTPException(Exception):
            def __init__(self, status_code=None, detail=None, **kw):
                self.status_code = status_code
                self.detail = detail
                super().__init__(status_code, detail)
        _fastapi.HTTPException = _HTTPException
        # FastAPI() → retorna app stub com decoradores identity pra preservar handlers
        _fastapi.FastAPI = lambda **kw: _make_app_stub()
        _fastapi.APIRouter = MagicMock()
        _fastapi.UploadFile = MagicMock()
        _fastapi.File = MagicMock()
        _fastapi.Form = MagicMock()
        _fastapi.Request = MagicMock()
        sys.modules["fastapi"] = _fastapi

        # fastapi.middleware.cors
        _fastapi_middleware = types.ModuleType("fastapi.middleware")
        _fastapi_middleware_cors = types.ModuleType("fastapi.middleware.cors")
        _fastapi_middleware_cors.CORSMiddleware = MagicMock()
        sys.modules["fastapi.middleware"] = _fastapi_middleware
        sys.modules["fastapi.middleware.cors"] = _fastapi_middleware_cors

        # fastapi.responses
        _fastapi_responses = types.ModuleType("fastapi.responses")
        _fastapi_responses.StreamingResponse = MagicMock()
        sys.modules["fastapi.responses"] = _fastapi_responses

    # ── supabase ───────────────────────────────────────────────────────────────
    if "supabase" not in sys.modules:
        _supabase = MagicMock()
        _supabase.create_client = MagicMock(return_value=MagicMock())
        sys.modules["supabase"] = _supabase

    # ── config ─────────────────────────────────────────────────────────────────
    # (pydantic-settings baseado — só precisa de settings.supabase_url/key)
    if "config" not in sys.modules:
        _config = MagicMock()
        _config.settings.supabase_url = "http://localhost"
        _config.settings.supabase_key = "fake-key"
        sys.modules["config"] = _config

    # ── pydantic ───────────────────────────────────────────────────────────────
    if "pydantic" not in sys.modules:
        _pydantic = MagicMock()
        _pydantic.BaseModel = object   # simples — evita conflito com dataclass
        sys.modules["pydantic"] = _pydantic

    # ── apscheduler ────────────────────────────────────────────────────────────
    for _mod_name in [
        "apscheduler",
        "apscheduler.schedulers",
        "apscheduler.schedulers.asyncio",
    ]:
        if _mod_name not in sys.modules:
            sys.modules[_mod_name] = MagicMock()

    # ── agents.agent_os — build_agent_os() deve retornar app stub com identity decorators ──
    # main.py faz: app = build_agent_os().get_app()
    # Sem isso, app vira MagicMock e @app.get(...)def fn → fn fica MagicMock (não o handler real).
    if "agents.agent_os" not in sys.modules:
        _agent_os_mod = MagicMock()
        _app_stub = _make_app_stub()
        _agent_os_instance = MagicMock()
        _agent_os_instance.get_app.return_value = _app_stub
        _agent_os_mod.build_agent_os.return_value = _agent_os_instance
        sys.modules["agents.agent_os"] = _agent_os_mod

    # ── internal packages que main.py importa ──────────────────────────────────
    _internal_mods = [
        "agents", "agents.agente_flg", "agents.agente_rotina",
        "services", "services.ingestion", "services.clickup_sync",
        "services.instagram_token_refresh", "services.instagram_sync",
        "prompts", "prompts.system_prompt",
        "tools", "tools.client_tools",
        "routes.uploads", "routes.metricas", "routes.conexoes", "routes.notas",
        "routes.admin_clickup", "routes.instagram_oauth", "routes.colaboradores",
        "routes.encontros_intelecto", "routes.reunioes", "routes.apresentar",
        "routes.meta_callbacks", "routes.debriefings", "routes.briefings_consultor",
        # routes.me NÃO é stubado aqui — é um módulo real importado por test_me_scope.py
    ]
    for _mod_name in _internal_mods:
        if _mod_name not in sys.modules:
            sys.modules[_mod_name] = MagicMock()

    # ── routes package (precisa existir como package antes dos submodules) ─────
    if "routes" not in sys.modules:
        _routes_pkg = types.ModuleType("routes")
        sys.modules["routes"] = _routes_pkg

    # ── routes.me — importa o módulo real pra test_me_scope.py funcionar ───────
    # main.py faz `from routes import me as me_router_module`; precisa que
    # routes.me exista como módulo real (com get_scope e router) e que o
    # pacote routes tenha o atributo `me` apontando pra ele.
    if "routes.me" not in sys.modules:
        import importlib
        _routes_pkg_real = sys.modules["routes"]
        # Importa routes/me.py sem passar por routes/__init__.py (que não existe)
        import importlib.util as _ilu
        import os as _os
        _me_spec = _ilu.spec_from_file_location(
            "routes.me",
            _os.path.join(_os.path.dirname(__file__), "..", "routes", "me.py"),
        )
        _me_mod = _ilu.module_from_spec(_me_spec)
        sys.modules["routes.me"] = _me_mod
        _me_spec.loader.exec_module(_me_mod)
        # Expõe como atributo do pacote routes (pra `from routes import me`)
        _routes_pkg_real.me = _me_mod


_ensure_stubs()


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


def _make_chain(mock_sb):
    """Cria um chain MagicMock chainable e registra em mock_sb.table."""
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.is_.return_value = chain
    chain.order.return_value = chain
    chain.single.return_value = chain
    chain.maybe_single.return_value = chain
    chain.insert.return_value = chain
    chain.update.return_value = chain
    mock_sb.table.return_value = chain
    chain.execute.return_value = MagicMock(data=[])
    return chain


@pytest.fixture
def mock_supabase():
    """Mock do supabase_client com chainable API (table().select().eq()...).

    Patcha deps.supabase_client (usado por lib/auth_scope.py e routes/).
    Para testes de main.py use mock_main_supabase que também patcha main._supabase.
    """
    with patch("deps.supabase_client") as mock_sb:
        _make_chain(mock_sb)
        yield mock_sb


@pytest.fixture
def mock_main_supabase():
    """Mock que patcha tanto deps.supabase_client quanto main._supabase.

    Necessário porque os handlers em main.py usam `_supabase` (alias local),
    não `deps.supabase_client`. Ambos precisam apontar pro mesmo mock pra que
    os asserts de call_args funcionem.
    """
    import importlib
    # Garante que main está importado (com os stubs em vigor)
    import main as _main_mod

    with patch("deps.supabase_client") as mock_deps_sb, \
         patch.object(_main_mod, "_supabase") as mock_main_sb:

        # Cria chain compartilhado — aplica em ambos os mocks
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.is_.return_value = chain
        chain.order.return_value = chain
        chain.single.return_value = chain
        chain.maybe_single.return_value = chain
        chain.insert.return_value = chain
        chain.update.return_value = chain
        chain.execute.return_value = MagicMock(data=[])

        mock_deps_sb.table.return_value = chain
        mock_main_sb.table.return_value = chain

        # Expõe o mock_main_sb como principal (handlers usam _supabase)
        # mas também tem deps mock pra get_user_scope queries
        mock_main_sb.chain = chain
        mock_main_sb._deps = mock_deps_sb
        yield mock_main_sb
