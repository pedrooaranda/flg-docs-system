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
    """Task com status NATIVO='encerrado' (kanban) deve setar archived_at."""
    from services import clickup_sync

    mock_sb, chain = _make_supabase_mock()

    # Primeira execute() → select (cliente existe, sem archived_at)
    # Segunda execute() → update
    chain.execute.side_effect = [
        MagicMock(data=[{"id": "cliente-joao", "archived_at": None}]),
        MagicMock(data=[{"id": "cliente-joao"}]),
    ]

    # Decisão Pedro 2026-05-27: lifecycle vem do status NATIVO (kanban), não do
    # custom field. Task abaixo tem status:'encerrado'.
    fake_data = {
        "nome": "João Silva",
        "clickup_task_id": "task-joao",
        "empresa": "Empresa João",
        "status": "concluido",
    }
    task_encerrada = {
        "id": "task-joao",
        "name": "João Silva",
        "status": {"status": "encerrado"},
        "assignees": [{"username": "consultor1"}],
        "custom_fields": [],
    }

    with patch.object(clickup_sync, "list_all_tasks", return_value=[task_encerrada]):
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
    """Cliente archived recebe archived_at=None quando status NATIVO volta pra ativo."""
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
    }
    task_ativa = {
        "id": "task-maria",
        "name": "Maria Santos",
        "status": {"status": "ativo"},
        "assignees": [{"username": "consultor1"}],
        "custom_fields": [],
    }

    with patch.object(clickup_sync, "list_all_tasks", return_value=[task_ativa]):
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


def test_run_sync_archive_via_native_task_status_when_custom_field_empty():
    """REGRESSÃO: cliente com custom field SITUAÇÃO vazio E task.status='encerrado'
    nativo deve ser arquivado. Bug reportado pelo Pedro: Fernanda Prado e Melca
    tinham task.status='encerrado' mas custom field SITUAÇÃO vazio — sync ignorava
    como 'ativo' e não arquivava."""
    from services import clickup_sync

    mock_sb, chain = _make_supabase_mock()
    chain.execute.side_effect = [
        MagicMock(data=[{"id": "cliente-fernanda", "archived_at": None}]),
        MagicMock(data=[{"id": "cliente-fernanda"}]),
    ]

    # task_to_cliente_data retorna SEM situacao_clickup (custom field vazio)
    fake_data = {
        "nome": "FERNANDAPRADO",
        "clickup_task_id": "task-fernanda",
        "empresa": "FERNANDAPRADO",
        "status": "concluido",  # mapeado pelo fallback do task_to_cliente_data
        # situacao_clickup AUSENTE — esse é o cenário do bug
    }

    # Task com status nativo "encerrado" (kanban column do ClickUp)
    task_native_encerrada = {
        "id": "task-fernanda",
        "name": "FERNANDAPRADO",
        "status": {"status": "encerrado"},  # ← status NATIVO
        "assignees": [],
        "custom_fields": [],  # SITUAÇÃO custom field vazio
    }

    with patch.object(clickup_sync, "list_all_tasks", return_value=[task_native_encerrada]):
        with patch.object(clickup_sync, "task_to_cliente_data", return_value=dict(fake_data)):
            with patch("deps.supabase_client", mock_sb):
                with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
                    stats = clickup_sync.run_clickup_sync()

    assert stats["archived"] == 1, "Esperado archive via fallback pro status nativo encerrado"
