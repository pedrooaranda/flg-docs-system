"""Tests pra filtragem de /clientes baseada em UserScope.

Padrão Opção B (alinhado com test_me_scope.py): chama handlers diretamente
como funções async com scope mockado. TestClient não está disponível no env
local (fastapi não instalado — roda em Docker).

Usa `mock_main_supabase` (fixture do conftest) que patcha main._supabase
(usado pelos handlers) + deps.supabase_client (usado por get_user_scope).
"""
import pytest
from unittest.mock import MagicMock

from lib.auth_scope import UserScope


# ─── Helpers ──────────────────────────────────────────────────────────────────

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


# ─── list_clientes ─────────────────────────────────────────────────────────────

async def test_list_clientes_consultor_filtra_proprio(mock_main_supabase):
    """Consultor recebe só clientes onde consultor_id == self.id."""
    from main import list_clientes

    mock_main_supabase.table().select().eq().order().execute.return_value = MagicMock(data=[
        {"id": "c1", "nome": "Cliente do Lucas", "consultor_id": "lucas-id"},
    ])

    result = await list_clientes(consultor_id=None, scope=_scope_consultor())

    assert result == [{"id": "c1", "nome": "Cliente do Lucas", "consultor_id": "lucas-id"}]

    # Verifica que .eq("consultor_id", "lucas-id") foi chamado
    eq_calls = mock_main_supabase.table().select().eq.call_args_list
    consultor_filter = [c for c in eq_calls if c.args == ("consultor_id", "lucas-id")]
    assert len(consultor_filter) >= 1, "Esperado filtro WHERE consultor_id = lucas-id"


async def test_list_clientes_admin_ve_todos(mock_main_supabase):
    """Admin sem consultor_id retorna todos (sem filtro de consultor)."""
    from main import list_clientes

    mock_main_supabase.table().select().order().execute.return_value = MagicMock(data=[
        {"id": "c1", "nome": "A"},
        {"id": "c2", "nome": "B"},
    ])

    result = await list_clientes(consultor_id=None, scope=_scope_admin())

    assert len(result) == 2


async def test_list_clientes_admin_com_query_consultor_id_filtra(mock_main_supabase):
    """Admin com consultor_id=X filtra por esse consultor."""
    from main import list_clientes

    mock_main_supabase.table().select().eq().order().execute.return_value = MagicMock(data=[
        {"id": "c3", "nome": "C", "consultor_id": "lucas-id"},
    ])

    result = await list_clientes(consultor_id="lucas-id", scope=_scope_admin())

    eq_calls = mock_main_supabase.table().select().eq.call_args_list
    consultor_filter = [c for c in eq_calls if c.args == ("consultor_id", "lucas-id")]
    assert len(consultor_filter) >= 1, "Esperado filtro WHERE consultor_id = lucas-id"


async def test_list_clientes_sem_ficha_retorna_vazio(mock_main_supabase):
    """Usuário sem ficha (consultor_id=None, can_see_all=False) recebe [] sem execute."""
    from main import list_clientes

    result = await list_clientes(consultor_id=None, scope=_scope_external())

    assert result == []
    # execute() não deve ter sido chamado (retorno antecipado antes de executar a query)
    mock_main_supabase.table().select().eq().order().execute.assert_not_called()


# ─── get_cliente ───────────────────────────────────────────────────────────────

async def test_get_cliente_consultor_proprio_ok(mock_main_supabase):
    """Consultor acessa seu próprio cliente — deve retornar dados com encontros."""
    from main import get_cliente

    # get_cliente chama execute() duas vezes: primeiro busca o cliente (single),
    # depois busca encontros (order). Side-effect alterna os retornos.
    chain = mock_main_supabase.chain
    call_count = {"n": 0}

    def _execute_side_effect():
        call_count["n"] += 1
        if call_count["n"] == 1:
            return MagicMock(data={"id": "c1", "nome": "Meu Cliente", "consultor_id": "lucas-id"})
        return MagicMock(data=[])   # encontros vazios

    chain.execute.side_effect = _execute_side_effect

    result = await get_cliente(client_id="c1", scope=_scope_consultor())

    assert result["id"] == "c1"
    assert result["nome"] == "Meu Cliente"
    assert "encontros_realizados" in result


async def test_get_cliente_consultor_403_em_cliente_alheio(mock_main_supabase):
    """Consultor tentando GET /clientes/{id} de cliente alheio → levanta 403."""
    from main import get_cliente

    # Só a primeira chamada execute() importa (403 é levantado antes da segunda)
    mock_main_supabase.chain.execute.return_value = MagicMock(
        data={"id": "outro-cliente", "nome": "X", "consultor_id": "outro-consultor-id"}
    )

    with pytest.raises(Exception) as exc_info:
        await get_cliente(client_id="outro-cliente", scope=_scope_consultor())

    exc = exc_info.value
    assert getattr(exc, "status_code", None) == 403


async def test_get_cliente_admin_acessa_cliente_qualquer(mock_main_supabase):
    """Admin (can_see_all=True) acessa cliente de qualquer consultor sem 403."""
    from main import get_cliente

    chain = mock_main_supabase.chain
    call_count = {"n": 0}

    def _execute_side_effect():
        call_count["n"] += 1
        if call_count["n"] == 1:
            return MagicMock(data={"id": "c-outro", "nome": "Outro", "consultor_id": "lucas-id"})
        return MagicMock(data=[])

    chain.execute.side_effect = _execute_side_effect

    result = await get_cliente(client_id="c-outro", scope=_scope_admin())
    assert result["id"] == "c-outro"


# ─── create_cliente ────────────────────────────────────────────────────────────

async def test_post_cliente_consultor_forca_self_consultor_id(mock_main_supabase):
    """Consultor POSTando cliente com consultor_id=outro → insert usa self.id."""
    from main import create_cliente

    mock_main_supabase.table().insert().execute.return_value = MagicMock(data=[
        {"id": "new-id", "nome": "Novo Cliente", "consultor_id": "lucas-id"}
    ])

    result = await create_cliente(
        data={"nome": "Novo Cliente", "consultor_id": "outro-id"},
        scope=_scope_consultor(),
    )

    # Verifica que o insert foi chamado com consultor_id do scope, não do payload
    insert_call = mock_main_supabase.table().insert.call_args
    inserted_data = insert_call.args[0]
    assert inserted_data["consultor_id"] == "lucas-id", (
        f"Esperado lucas-id mas foi {inserted_data.get('consultor_id')}"
    )


async def test_post_cliente_sem_ficha_403(mock_main_supabase):
    """User sem ficha (consultor_id=None) → 403 ao criar cliente."""
    from main import create_cliente

    with pytest.raises(Exception):
        await create_cliente(
            data={"nome": "Algum Cliente"},
            scope=_scope_external(),
        )


async def test_post_cliente_admin_aceita_consultor_id_payload(mock_main_supabase):
    """Admin pode criar cliente atribuído a qualquer consultor_id do payload."""
    from main import create_cliente

    mock_main_supabase.table().insert().execute.return_value = MagicMock(data=[
        {"id": "new-id", "nome": "Cliente Admin", "consultor_id": "lucas-id"}
    ])

    result = await create_cliente(
        data={"nome": "Cliente Admin", "consultor_id": "lucas-id"},
        scope=_scope_admin(),
    )

    insert_call = mock_main_supabase.table().insert.call_args
    inserted_data = insert_call.args[0]
    # Admin não sobrescreve consultor_id — mantém o do payload
    assert inserted_data["consultor_id"] == "lucas-id"


# ─── update_cliente ────────────────────────────────────────────────────────────

async def test_patch_cliente_consultor_proprio_ok(mock_main_supabase):
    """Consultor pode editar seu próprio cliente."""
    from main import update_cliente

    # Configura o resultado do update (será sobrescrito pelo select abaixo, já que
    # a chain é compartilhada — define em ordem: update primeiro, select por último,
    # porque update_cliente chama select ANTES de update no handler)
    chain = mock_main_supabase.chain

    # O handler chama select().eq().single().execute() primeiro (ownership check)
    # e depois update().eq().execute() (o update de fato).
    # Como a chain é compartilhada, o return_value precisa funcionar para ambas.
    # Solução: usar side_effect pra alternar respostas em sequência.
    call_count = {"n": 0}
    ownership_response = MagicMock(data={"consultor_id": "lucas-id"})
    update_response = MagicMock(data=[{"id": "c1", "nome": "Atualizado", "consultor_id": "lucas-id"}])

    def _execute_side_effect():
        call_count["n"] += 1
        if call_count["n"] == 1:
            return ownership_response   # select ownership check
        return update_response          # update result

    chain.execute.side_effect = _execute_side_effect

    result = await update_cliente(
        client_id="c1",
        data={"nome": "Atualizado"},
        scope=_scope_consultor(),
    )

    assert result["nome"] == "Atualizado"


async def test_patch_cliente_consultor_403_em_alheio(mock_main_supabase):
    """Consultor tentando editar cliente de outro consultor → 403."""
    from main import update_cliente

    mock_main_supabase.table().select().eq().single().execute.return_value = MagicMock(
        data={"consultor_id": "outro-consultor-id"}
    )

    with pytest.raises(Exception):
        await update_cliente(
            client_id="c-alheio",
            data={"nome": "Hack"},
            scope=_scope_consultor(),
        )


async def test_patch_cliente_consultor_nao_pode_mudar_consultor_id(mock_main_supabase):
    """Consultor não pode trocar consultor_id no payload — campo é removido antes do update."""
    from main import update_cliente

    chain = mock_main_supabase.chain
    call_count = {"n": 0}

    def _execute_side_effect():
        call_count["n"] += 1
        if call_count["n"] == 1:
            return MagicMock(data={"consultor_id": "lucas-id"})   # ownership
        return MagicMock(data=[{"id": "c1", "nome": "OK", "consultor_id": "lucas-id"}])  # update

    chain.execute.side_effect = _execute_side_effect

    await update_cliente(
        client_id="c1",
        data={"nome": "OK", "consultor_id": "outro-id"},
        scope=_scope_consultor(),
    )

    update_call = mock_main_supabase.table().update.call_args
    updated_data = update_call.args[0]
    assert "consultor_id" not in updated_data, (
        f"consultor_id não deve estar no update, mas foi: {updated_data}"
    )


async def test_patch_cliente_admin_pode_mudar_consultor_id(mock_main_supabase):
    """Admin pode reatribuir cliente trocando consultor_id via PATCH."""
    from main import update_cliente

    chain = mock_main_supabase.chain
    call_count = {"n": 0}

    def _execute_side_effect():
        call_count["n"] += 1
        if call_count["n"] == 1:
            return MagicMock(data={"consultor_id": "lucas-id"})   # ownership
        return MagicMock(data=[{"id": "c1", "nome": "X", "consultor_id": "novo-consultor"}])

    chain.execute.side_effect = _execute_side_effect

    result = await update_cliente(
        client_id="c1",
        data={"consultor_id": "novo-consultor"},
        scope=_scope_admin(),
    )

    update_call = mock_main_supabase.table().update.call_args
    updated_data = update_call.args[0]
    assert updated_data.get("consultor_id") == "novo-consultor"
