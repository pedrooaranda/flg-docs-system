"""Tests pro run_clickup_sync ampliado:
  - aplica archived_at quando status terminal
  - reativa (archived_at=NULL) quando ClickUp volta pra ativo/pausado
  - retorna stats {archived, reactivated, paused, ativos, errors, total, duration_ms}
"""
import os
import sys
import types
import importlib.util
from unittest.mock import MagicMock, patch



# ─── Setup de módulos necessários pra importar clickup_sync diretamente ────────
def _setup_packages():
    """Prepara packages e módulos pra importar services.clickup_sync."""
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # Remove stubs antigos que o conftest.py pode ter colocado
    for mod in ["services", "services.clickup_sync", "tools", "tools.clickup_tools"]:
        if mod in sys.modules:
            del sys.modules[mod]

    # services como package real
    _services = types.ModuleType("services")
    _services.__path__ = [os.path.join(backend_dir, "services")]
    sys.modules["services"] = _services

    # tools como package real
    _tools = types.ModuleType("tools")
    _tools.__path__ = [os.path.join(backend_dir, "tools")]
    sys.modules["tools"] = _tools

    # Stub pra tools.clickup_tools (não queremos hit real de rede)
    _clickup_tools = types.ModuleType("tools.clickup_tools")
    _clickup_tools.list_all_tasks = MagicMock()
    _clickup_tools.task_to_cliente_data = MagicMock()
    sys.modules["tools.clickup_tools"] = _clickup_tools
    sys.modules["tools"].clickup_tools = _clickup_tools

    # Carrega clickup_sync real
    spec = importlib.util.spec_from_file_location(
        "services.clickup_sync",
        os.path.join(backend_dir, "services", "clickup_sync.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules["services.clickup_sync"] = mod
    spec.loader.exec_module(mod)
    sys.modules["services"].clickup_sync = mod


_setup_packages()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_task(name, situacao, clickup_task_id="task-1"):
    """Helper: monta task ClickUp com SITUAÇÃO no custom field."""
    return {
        "id": clickup_task_id,
        "name": name,
        "status": {"status": "open"},
        "assignees": [{"username": "consultor1"}],
        "custom_fields": [
            {
                "name": "SITUAÇÃO",
                "type": "drop_down",
                "value": 0,
                "type_config": {
                    "options": [{"orderindex": "0", "name": situacao}]
                },
            }
        ],
    }


def _make_supabase_mock():
    """Cria um mock de supabase_client com chain completo.

    Retorna (mock_sb, chain) pra que os testes possam configurar
    side_effect em chain.execute quando precisam de múltiplas respostas.
    """
    mock_sb = MagicMock()
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.insert.return_value = chain
    chain.update.return_value = chain
    chain.execute.return_value = MagicMock(data=[])
    mock_sb.table.return_value = chain
    return mock_sb, chain


# ─── Tests ────────────────────────────────────────────────────────────────────

def test_run_sync_archives_encerrado():
    """Task com SITUAÇÃO='Encerrado' deve setar archived_at."""
    from services import clickup_sync

    mock_sb, chain = _make_supabase_mock()

    # Primeira execute() → select (cliente existe, sem archived_at)
    # Segunda execute() → update
    chain.execute.side_effect = [
        MagicMock(data=[{"id": "cliente-joao", "archived_at": None}]),
        MagicMock(data=[{"id": "cliente-joao"}]),
    ]

    # task_to_cliente_data deve retornar dict com situacao_clickup=Encerrado
    fake_data = {
        "nome": "João Silva",
        "clickup_task_id": "task-joao",
        "empresa": "Empresa João",
        "status": "concluido",
        "situacao_clickup": "Encerrado",
    }

    with patch.object(clickup_sync, "list_all_tasks", return_value=[
        _make_task("João Silva", "Encerrado", "task-joao")
    ]):
        with patch.object(clickup_sync, "task_to_cliente_data", return_value=dict(fake_data)):
            with patch("deps.supabase_client", mock_sb):
                with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
                    stats = clickup_sync.run_clickup_sync()

    assert stats["archived"] == 1
    assert stats["total"] == 1

    # Verifica que update foi chamado com archived_at preenchido
    update_calls = chain.update.call_args_list
    archive_calls = [c for c in update_calls if c.args[0].get("archived_at") is not None]
    assert len(archive_calls) >= 1


def test_run_sync_reactivates_when_back_to_ativo():
    """Cliente archived recebe archived_at=None quando ClickUp volta pra ativo."""
    from services import clickup_sync

    mock_sb, chain = _make_supabase_mock()

    chain.execute.side_effect = [
        MagicMock(data=[{"id": "cliente-maria", "archived_at": "2026-05-20T10:00:00Z"}]),
        MagicMock(data=[{"id": "cliente-maria"}]),
    ]

    fake_data = {
        "nome": "Maria Santos",
        "clickup_task_id": "task-maria",
        "empresa": "Empresa Maria",
        "status": "ativo",
        "situacao_clickup": "Indo Bem",
    }

    with patch.object(clickup_sync, "list_all_tasks", return_value=[
        _make_task("Maria Santos", "Indo Bem", "task-maria")
    ]):
        with patch.object(clickup_sync, "task_to_cliente_data", return_value=dict(fake_data)):
            with patch("deps.supabase_client", mock_sb):
                with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
                    stats = clickup_sync.run_clickup_sync()

    assert stats["reactivated"] == 1

    update_calls = chain.update.call_args_list
    reactivate_calls = [
        c for c in update_calls
        if "archived_at" in c.args[0] and c.args[0]["archived_at"] is None
    ]
    assert len(reactivate_calls) >= 1


def test_run_sync_returns_full_stats():
    """Stats retornados incluem archived, reactivated, paused, ativos, errors, total, duration_ms."""
    from services import clickup_sync

    mock_sb, chain = _make_supabase_mock()

    with patch.object(clickup_sync, "list_all_tasks", return_value=[]):
        with patch("deps.supabase_client", mock_sb):
            with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
                stats = clickup_sync.run_clickup_sync()

    expected_keys = {"archived", "reactivated", "paused", "ativos", "errors", "total", "duration_ms"}
    assert expected_keys.issubset(set(stats.keys()))
    assert stats["total"] == 0
    assert stats["duration_ms"] >= 0


def test_run_sync_no_token_returns_zero_stats():
    """Sem CLICKUP_API_TOKEN, retorna stats vazios sem erro."""
    from services import clickup_sync

    # Garante que token não está no ambiente
    env_without_token = {k: v for k, v in os.environ.items() if k != "CLICKUP_API_TOKEN"}
    env_without_token["CLICKUP_API_TOKEN"] = ""

    with patch.dict("os.environ", env_without_token, clear=True):
        stats = clickup_sync.run_clickup_sync()

    assert stats["total"] == 0
    assert stats["errors"] == 0
