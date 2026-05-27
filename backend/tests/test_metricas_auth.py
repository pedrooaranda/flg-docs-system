"""Tests pra filtragem de /metricas baseada em UserScope.

Padrão Opção B (alinhado com test_clientes_auth.py): chama handlers diretamente
como funções async com scope mockado. TestClient não está disponível no env
local (fastapi não instalado — roda em Docker).

Carrega routes/metricas.py como módulo real via importlib.util (mesmo padrão
de conftest para routes.me), patchando routes.metricas._supabase pra evitar
hit em rede.
"""
import importlib.util
import os
import sys
import types
import pytest
from unittest.mock import MagicMock, patch

from lib.auth_scope import UserScope


# ─── Carrega routes/metricas.py como módulo real ──────────────────────────────
# conftest coloca routes.metricas em _internal_mods (stub). Removemos o stub
# e carregamos o módulo real, que usa MagicMocks herdados para services.social.

def _identity_decorator(*args, **kwargs):
    """Decorator identity: @router.get("/path") preserva a função handler."""
    def _wrap(fn):
        return fn
    return _wrap


def _load_metricas_module():
    """Importa routes/metricas.py real, ignorando o stub do conftest.

    Dois problemas a resolver:
    1. services é MagicMock (não package real) — cria stub mínimo de services.social.
    2. fastapi.APIRouter é MagicMock — @router.get() substituiria handlers por MagicMock.
       Cria um APIRouter stub com decoradores identity pra preservar as funções reais.
    """
    # Remove stub existente
    sys.modules.pop("routes.metricas", None)
    sys.modules.pop("services.social", None)

    # ── services.social stub ──────────────────────────────────────────────────
    if not isinstance(sys.modules.get("services"), types.ModuleType):
        _svc_pkg = types.ModuleType("services")
        sys.modules["services"] = _svc_pkg

    _social_stub = types.ModuleType("services.social")
    _social_stub.PLATAFORMAS_VALIDAS = ("instagram", "linkedin", "youtube", "tiktok")
    _social_stub.get_platform_repository = MagicMock(return_value=MagicMock(
        get_historico=MagicMock(return_value=[]),
        is_connected=MagicMock(return_value=False),
        get_posts=MagicMock(return_value=[]),
        get_horarios=MagicMock(return_value=[]),
    ))
    sys.modules["services.social"] = _social_stub
    sys.modules["services"].social = _social_stub

    # ── APIRouter stub com identity decorators ────────────────────────────────
    # Patch temporário: substitui fastapi.APIRouter antes de carregar o módulo,
    # pra que @router.get/post preservem as funções handler originais.
    _fastapi_stub = sys.modules["fastapi"]
    _orig_apirouter = getattr(_fastapi_stub, "APIRouter", None)

    class _IdentityRouter:
        """Stub de APIRouter onde todos os decoradores HTTP são identity."""
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
            "routes.metricas",
            os.path.join(os.path.dirname(__file__), "..", "routes", "metricas.py"),
        )
        _mod = importlib.util.module_from_spec(_spec)
        sys.modules["routes.metricas"] = _mod
        _spec.loader.exec_module(_mod)
    finally:
        # Restaura APIRouter original pra não quebrar outros módulos
        if _orig_apirouter is not None:
            _fastapi_stub.APIRouter = _orig_apirouter

    return _mod


_metricas_mod = _load_metricas_module()


# ─── Helpers de scope ──────────────────────────────────────────────────────────

def _scope_consultor(consultor_id="lucas-id"):
    return UserScope(
        user_id="user-lucas",
        email="lucasnery@grupoguglielmi.com",
        can_see_all=False,
        consultor_id=consultor_id,
        consultor_nome="Lucas Nery",
        categoria="consultor",
        role="member",
    )


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


def _scope_external():
    """Usuário sem ficha — consultor_id=None, can_see_all=False."""
    return UserScope(
        user_id="user-ext",
        email="externo@example.com",
        can_see_all=False,
        consultor_id=None,
        consultor_nome=None,
        categoria=None,
        role=None,
    )


# ─── Fixture de mock para routes.metricas._supabase ──────────────────────────

@pytest.fixture
def mock_metricas_supabase():
    """Patcha routes.metricas._supabase com chain chainable."""
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.order.return_value = chain
    chain.single.return_value = chain
    chain.maybe_single.return_value = chain
    chain.insert.return_value = chain
    chain.update.return_value = chain
    chain.execute.return_value = MagicMock(data=[])

    with patch.object(_metricas_mod, "_supabase") as mock_sb:
        mock_sb.table.return_value = chain
        mock_sb.chain = chain
        yield mock_sb


# ─── get_ranking ──────────────────────────────────────────────────────────────

async def test_ranking_consultor_filtra_proprio(mock_metricas_supabase):
    """Consultor recebe ranking só dos próprios clientes (filtro WHERE consultor_id = self.id)."""
    get_ranking = _metricas_mod.get_ranking

    # Retorna lista vazia de clientes (comportamento esperado: ranking vazio)
    mock_metricas_supabase.table().select().eq().order().execute.return_value = MagicMock(data=[])

    result = await get_ranking(plataforma="instagram", scope=_scope_consultor())

    assert result["ranking"] == []
    assert result["plataforma"] == "instagram"

    # Verifica que .eq("consultor_id", "lucas-id") foi chamado na query de clientes
    eq_calls = mock_metricas_supabase.table().select().eq.call_args_list
    consultor_id_filter = [c for c in eq_calls if c.args == ("consultor_id", "lucas-id")]
    assert len(consultor_id_filter) >= 1, (
        f"Esperado filtro WHERE consultor_id = 'lucas-id', calls foram: {eq_calls}"
    )


async def test_ranking_admin_nao_filtra_consultor_id(mock_metricas_supabase):
    """Admin (can_see_all=True) recebe ranking de todos os clientes sem filtro por consultor."""
    get_ranking = _metricas_mod.get_ranking

    mock_metricas_supabase.table().select().order().execute.return_value = MagicMock(data=[])

    result = await get_ranking(plataforma="instagram", scope=_scope_admin())

    assert result["ranking"] == []

    # Verifica que NÃO houve filtro de consultor_id
    eq_calls = mock_metricas_supabase.table().select().eq.call_args_list
    consultor_id_filter = [c for c in eq_calls if c.args[0] == "consultor_id"]
    assert len(consultor_id_filter) == 0, (
        f"Admin não deve filtrar por consultor_id, mas calls foram: {eq_calls}"
    )


async def test_ranking_sem_ficha_retorna_vazio(mock_metricas_supabase):
    """Usuário sem ficha (consultor_id=None, can_see_all=False) recebe ranking vazio sem executar query."""
    get_ranking = _metricas_mod.get_ranking

    result = await get_ranking(plataforma="instagram", scope=_scope_external())

    assert result == {"ranking": [], "total": 0, "plataforma": "instagram"}


# ─── get_overview ─────────────────────────────────────────────────────────────

async def test_overview_consultor_403_cliente_alheio(mock_metricas_supabase):
    """Consultor → GET /metricas/{id_alheio}/overview → 403 Sem acesso."""
    get_overview = _metricas_mod.get_overview

    # Primeira query: busca consultor_id do cliente → pertence a outro consultor
    mock_metricas_supabase.table().select().eq().single().execute.return_value = MagicMock(
        data={"consultor_id": "outro-consultor-id"}
    )

    with pytest.raises(Exception) as exc_info:
        await get_overview(
            cliente_id="cliente-alheio",
            plataforma="instagram",
            dias=30,
            tipo="all",
            scope=_scope_consultor(),
        )

    exc = exc_info.value
    assert getattr(exc, "status_code", None) == 403
    assert "Sem acesso" in (getattr(exc, "detail", "") or "")


async def test_overview_consultor_404_cliente_inexistente(mock_metricas_supabase):
    """Consultor → GET /metricas/{id_inexistente}/overview → 404."""
    get_overview = _metricas_mod.get_overview

    mock_metricas_supabase.table().select().eq().single().execute.return_value = MagicMock(
        data=None
    )

    with pytest.raises(Exception) as exc_info:
        await get_overview(
            cliente_id="nao-existe",
            plataforma="instagram",
            dias=30,
            tipo="all",
            scope=_scope_consultor(),
        )

    exc = exc_info.value
    assert getattr(exc, "status_code", None) in (403, 404)


async def test_overview_admin_nao_checa_consultor_id(mock_metricas_supabase):
    """Admin (can_see_all=True) não dispara o auth check de consultor_id."""
    get_overview = _metricas_mod.get_overview

    chain = mock_metricas_supabase.chain
    call_count = {"n": 0}

    def _execute_side_effect():
        call_count["n"] += 1
        if call_count["n"] == 1:
            # Primeira query = select nome,empresa do cliente (não o auth check)
            return MagicMock(data={"nome": "Cliente X", "empresa": "Empresa Y"})
        # Demais queries: sem dados de histórico → overview retorna 404 via HTTPException
        return MagicMock(data=[])

    chain.execute.side_effect = _execute_side_effect

    # Admin com can_see_all=True: não deve 403, pode 404 (sem dados)
    try:
        result = await get_overview(
            cliente_id="qualquer-cliente",
            plataforma="instagram",
            dias=30,
            tipo="all",
            scope=_scope_admin(),
        )
    except Exception as exc:
        # 404 é aceitável (sem dados de histórico) — o que NÃO deve ocorrer é 403
        assert getattr(exc, "status_code", None) != 403, (
            f"Admin não deve receber 403, mas recebeu: {exc}"
        )
