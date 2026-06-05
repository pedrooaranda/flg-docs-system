"""Tests do router /briefings-consultor (sub-projeto 3 Debriefings).

Endpoints:
  GET    /briefings-consultor/cliente/{id}/me   consultor lê o próprio briefing
  PATCH  /briefings-consultor/cliente/{id}/me   consultor escreve/atualiza (upsert)
  GET    /briefings-consultor/cliente/{id}      lista todos (comercial+diretor+owner)

Gating:
  - GET/PATCH /me: scope.consultor_id NOT NULL (qualquer consultor registrado)
  - GET lista: require_debriefings

Padrão de mock: routes.briefings_consultor é stubado no conftest (lista
_internal_mods). Aqui carregamos o módulo real via importlib.util e patchamos
o `_supabase` interno do módulo — mesmo padrão de test_debriefings_auth.py.
"""
import importlib.util
import os
import sys
import types
import pytest
from unittest.mock import MagicMock, patch

from lib.auth_scope import UserScope


# ─── Carrega routes/briefings_consultor.py como módulo real ───────────────────

def _identity_decorator(*args, **kwargs):
    """Decorator identity: @router.get("/path") preserva a função handler."""
    def _wrap(fn):
        return fn
    return _wrap


def _load_briefings_consultor_module():
    """Importa routes/briefings_consultor.py real, ignorando stubs do conftest."""
    sys.modules.pop("routes.briefings_consultor", None)

    # APIRouter stub com identity decorators (mesmo padrão de test_debriefings_auth)
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

    # pydantic.BaseModel stub é `object` no conftest — precisa de algo que aceite
    # kwargs e exponha como atributos pro BriefingPayload funcionar nos tests.
    _pydantic_stub = sys.modules["pydantic"]
    _orig_basemodel = getattr(_pydantic_stub, "BaseModel", None)

    class _PydanticBase:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

    _pydantic_stub.BaseModel = _PydanticBase

    try:
        _spec = importlib.util.spec_from_file_location(
            "routes.briefings_consultor",
            os.path.join(os.path.dirname(__file__), "..", "routes", "briefings_consultor.py"),
        )
        _mod = importlib.util.module_from_spec(_spec)
        sys.modules["routes.briefings_consultor"] = _mod
        _spec.loader.exec_module(_mod)
    finally:
        if _orig_apirouter is not None:
            _fastapi_stub.APIRouter = _orig_apirouter
        if _orig_basemodel is not None:
            _pydantic_stub.BaseModel = _orig_basemodel

    return _mod


_briefings_consultor_mod = _load_briefings_consultor_module()


# ─── Fixture pra patchar _supabase do módulo real ────────────────────────────

@pytest.fixture
def mock_briefings_supabase():
    """Patcha routes.briefings_consultor._supabase com chain chainable."""
    with patch.object(_briefings_consultor_mod, "_supabase") as mock_sb:
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.order.return_value = chain
        chain.single.return_value = chain
        chain.maybe_single.return_value = chain
        chain.insert.return_value = chain
        chain.update.return_value = chain
        chain.upsert.return_value = chain
        chain.execute.return_value = MagicMock(data=[])
        mock_sb.table.return_value = chain
        mock_sb.chain = chain
        yield mock_sb


def _make_scope(categoria, role, consultor_id=None):
    from lib.auth_scope import _compute_flags
    p, d, da = _compute_flags(categoria, role)
    return UserScope(
        user_id="u-1",
        email="x@grupoguglielmi.com",
        role=role,
        consultor_id=consultor_id,
        consultor_nome="Consultor X" if consultor_id else None,
        categoria=categoria,
        can_see_all=(categoria == "diretor") or role in ("owner", "admin"),
        can_see_principal=p,
        can_see_debriefings=d,
        can_see_debriefings_admin=da,
    )


@pytest.mark.asyncio
async def test_consultor_get_me_sem_briefing_retorna_vazio(mock_briefings_supabase):
    """GET /me quando não há row → retorna conteudo vazio, atualizado_em None."""
    get_my_briefing = _briefings_consultor_mod.get_my_briefing
    scope = _make_scope("consultor", "member", consultor_id="cons-1")
    mock_briefings_supabase.chain.execute.return_value = MagicMock(data=None)
    result = await get_my_briefing(cliente_id="cli-1", scope=scope)
    assert result == {"conteudo": "", "atualizado_em": None}


@pytest.mark.asyncio
async def test_consultor_patch_me_upsert(mock_briefings_supabase):
    """PATCH /me com conteudo → upsert e retorna o que foi salvo."""
    update_my_briefing = _briefings_consultor_mod.update_my_briefing
    BriefingPayload = _briefings_consultor_mod.BriefingPayload
    scope = _make_scope("consultor", "member", consultor_id="cons-1")
    saved = {"conteudo": "minha percepção", "atualizado_em": "2026-06-05T18:00:00Z"}
    mock_briefings_supabase.chain.execute.return_value = MagicMock(data=[saved])
    result = await update_my_briefing(
        cliente_id="cli-1",
        payload=BriefingPayload(conteudo="minha percepção"),
        scope=scope,
    )
    assert result == saved


@pytest.mark.asyncio
async def test_comercial_sem_consultor_id_recebe_403_em_me():
    """Comercial sem consultor_id → 403 em GET /me e PATCH /me."""
    from fastapi import HTTPException
    get_my_briefing = _briefings_consultor_mod.get_my_briefing
    update_my_briefing = _briefings_consultor_mod.update_my_briefing
    BriefingPayload = _briefings_consultor_mod.BriefingPayload
    scope = _make_scope("comercial", "member", consultor_id=None)
    with pytest.raises(HTTPException) as exc:
        await get_my_briefing(cliente_id="cli-1", scope=scope)
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as exc:
        await update_my_briefing(
            cliente_id="cli-1",
            payload=BriefingPayload(conteudo="x"),
            scope=scope,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_consultor_recebe_403_em_listagem():
    """Consultor sem canSeeDebriefings → 403 em GET lista."""
    from fastapi import HTTPException
    list_briefings = _briefings_consultor_mod.list_briefings
    scope = _make_scope("consultor", "member", consultor_id="cons-1")
    with pytest.raises(HTTPException) as exc:
        await list_briefings(cliente_id="cli-1", scope=scope)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_comercial_le_listagem(mock_briefings_supabase):
    """Comercial vê lista com consultor_nome resolvido."""
    list_briefings = _briefings_consultor_mod.list_briefings
    scope = _make_scope("comercial", "member")
    rows = [
        {"consultor_id": "c1", "conteudo": "p1", "atualizado_em": "2026-06-05T10:00:00Z",
         "colaboradores": {"nome": "Alice"}},
        {"consultor_id": "c2", "conteudo": "p2", "atualizado_em": "2026-06-04T10:00:00Z",
         "colaboradores": {"nome": "Bruno"}},
    ]
    mock_briefings_supabase.chain.execute.return_value = MagicMock(data=rows)
    result = await list_briefings(cliente_id="cli-1", scope=scope)
    assert len(result) == 2
    assert result[0]["consultor_nome"] == "Alice"
    assert result[1]["consultor_nome"] == "Bruno"


@pytest.mark.asyncio
async def test_diretor_le_listagem(mock_briefings_supabase):
    """Diretor vê lista igual ao comercial."""
    list_briefings = _briefings_consultor_mod.list_briefings
    scope = _make_scope("diretor", "member")
    mock_briefings_supabase.chain.execute.return_value = MagicMock(data=[])
    result = await list_briefings(cliente_id="cli-1", scope=scope)
    assert result == []


@pytest.mark.asyncio
async def test_owner_le_listagem(mock_briefings_supabase):
    """Owner sem categoria vê lista (via is_owner)."""
    list_briefings = _briefings_consultor_mod.list_briefings
    scope = _make_scope(None, "owner")
    mock_briefings_supabase.chain.execute.return_value = MagicMock(data=[])
    result = await list_briefings(cliente_id="cli-1", scope=scope)
    assert result == []
