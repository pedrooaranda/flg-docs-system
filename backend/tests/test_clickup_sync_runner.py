"""Tests pro run_clickup_sync refatorado:
  - matching híbrido (clickup_task_id → nome normalizado → insert)
  - update explícito de TODOS os campos (encontro_atual, consultor, status, etc)
  - logging granular [sync] ACTION | NOME | ...
  - stats completos (archived, reactivated, paused, ativos, created, updated, errors, total, duration_ms)
"""
import os
import sys
import types
import importlib.util
from unittest.mock import MagicMock, patch


# ─── Setup de módulos pra importar clickup_sync direto ────────────────────────
def _setup_packages():
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    for mod in ["services", "services.clickup_sync", "tools", "tools.clickup_tools"]:
        if mod in sys.modules:
            del sys.modules[mod]

    _services = types.ModuleType("services")
    _services.__path__ = [os.path.join(backend_dir, "services")]
    sys.modules["services"] = _services

    _tools = types.ModuleType("tools")
    _tools.__path__ = [os.path.join(backend_dir, "tools")]
    sys.modules["tools"] = _tools

    _clickup_tools = types.ModuleType("tools.clickup_tools")
    _clickup_tools.list_all_tasks = MagicMock()
    _clickup_tools.task_to_cliente_data = MagicMock()
    sys.modules["tools.clickup_tools"] = _clickup_tools
    sys.modules["tools"].clickup_tools = _clickup_tools

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

def _make_task(name, native_status, task_id="task-1"):
    """Task minimalista com status NATIVO setado."""
    return {
        "id": task_id,
        "name": name,
        "status": {"status": native_status},
        "assignees": [{"username": "consultor1"}],
        "custom_fields": [],
    }


def _make_supabase_mock(initial_clientes=None):
    """
    Mock do supabase_client.

    `initial_clientes` é a lista que `_load_clientes_lookup` recebe quando faz
    select inicial dos clientes. Os UPDATE/INSERT subsequentes são mockados via
    chain mas não persistem — testes inspecionam call_args.
    """
    mock_sb = MagicMock()
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.insert.return_value = chain
    chain.update.return_value = chain
    chain.execute.return_value = MagicMock(data=initial_clientes or [])
    mock_sb.table.return_value = chain
    return mock_sb, chain


def _make_task_to_cliente_data_fn(extra_fields=None):
    """Retorna função-substituta de task_to_cliente_data que constrói data
    a partir da task (mais realista que return_value fixo)."""
    def fn(task):
        data = {
            "nome": task.get("name", "").strip(),
            "clickup_task_id": task.get("id", ""),
            "empresa": task.get("name", ""),
        }
        if extra_fields:
            data.update(extra_fields)
        return data
    return fn


# ─── Tests ────────────────────────────────────────────────────────────────────

def test_archive_by_native_status_match_by_task_id():
    """Status nativo='encerrado' + match por task_id → ARCHIVED."""
    from services import clickup_sync

    initial = [
        {"id": "cliente-joao", "nome": "João Silva", "clickup_task_id": "task-joao",
         "archived_at": None, "status": "ativo", "encontro_atual": 5,
         "consultor_responsavel": "Lucas Nery"}
    ]
    mock_sb, chain = _make_supabase_mock(initial)
    task = _make_task("João Silva", "encerrado", "task-joao")

    with patch.object(clickup_sync, "list_all_tasks", return_value=[task]):
        with patch.object(clickup_sync, "task_to_cliente_data",
                          side_effect=_make_task_to_cliente_data_fn()):
            with patch("deps.supabase_client", mock_sb):
                with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
                    stats = clickup_sync.run_clickup_sync()

    assert stats["archived"] == 1
    assert stats["updated"] == 1
    assert stats["created"] == 0

    # Update foi chamado com archived_at preenchido
    update_calls = chain.update.call_args_list
    archive_calls = [c for c in update_calls if c.args[0].get("archived_at") is not None]
    assert len(archive_calls) == 1


def test_reactivate_when_back_to_ativo():
    """Cliente archived volta pra ativo → REACTIVATED + archived_at=None."""
    from services import clickup_sync

    initial = [
        {"id": "cliente-maria", "nome": "Maria Santos", "clickup_task_id": "task-maria",
         "archived_at": "2026-05-20T10:00:00Z", "status": "concluido"}
    ]
    mock_sb, chain = _make_supabase_mock(initial)
    task = _make_task("Maria Santos", "ativo", "task-maria")

    with patch.object(clickup_sync, "list_all_tasks", return_value=[task]):
        with patch.object(clickup_sync, "task_to_cliente_data",
                          side_effect=_make_task_to_cliente_data_fn()):
            with patch("deps.supabase_client", mock_sb):
                with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
                    stats = clickup_sync.run_clickup_sync()

    assert stats["reactivated"] == 1
    update_calls = chain.update.call_args_list
    reactivate = [c for c in update_calls
                  if "archived_at" in c.args[0] and c.args[0]["archived_at"] is None]
    assert len(reactivate) == 1


def test_match_by_nome_when_task_id_missing_in_db():
    """Cliente criado manualmente (sem clickup_task_id) é encontrado por NOME
    normalizado e atualizado SEM duplicar. Também cura clickup_task_id."""
    from services import clickup_sync

    # Cliente manual no DB (sem clickup_task_id)
    initial = [
        {"id": "cliente-manual", "nome": "Fernanda Prado", "clickup_task_id": None,
         "archived_at": None, "status": "ativo", "encontro_atual": 14}
    ]
    mock_sb, chain = _make_supabase_mock(initial)
    # Task no ClickUp com nome igual (normalizado) mas task_id desconhecido pro DB
    task = _make_task("FERNANDAPRADO", "encerrado", "task-fernanda-new")

    with patch.object(clickup_sync, "list_all_tasks", return_value=[task]):
        with patch.object(clickup_sync, "task_to_cliente_data",
                          side_effect=_make_task_to_cliente_data_fn()):
            with patch("deps.supabase_client", mock_sb):
                with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
                    stats = clickup_sync.run_clickup_sync()

    # Match por nome — UPDATE, não INSERT (evita duplicata)
    assert stats["updated"] == 1
    assert stats["created"] == 0
    assert stats["archived"] == 1

    # Update payload deve incluir clickup_task_id (cura) + archived_at
    update_calls = chain.update.call_args_list
    cure_calls = [c for c in update_calls
                  if c.args[0].get("clickup_task_id") == "task-fernanda-new"
                  and c.args[0].get("archived_at") is not None]
    assert len(cure_calls) == 1


def test_update_includes_encontro_atual_change():
    """Encontro atual mudou no ClickUp (E14→E15) → UPDATE persiste novo valor."""
    from services import clickup_sync

    initial = [
        {"id": "c1", "nome": "Cliente X", "clickup_task_id": "task-x",
         "archived_at": None, "status": "ativo", "encontro_atual": 14}
    ]
    mock_sb, chain = _make_supabase_mock(initial)
    task = _make_task("Cliente X", "ativo", "task-x")

    # task_to_cliente_data retorna encontro_atual=15 (refletindo mudança no ClickUp)
    with patch.object(clickup_sync, "list_all_tasks", return_value=[task]):
        with patch.object(clickup_sync, "task_to_cliente_data",
                          side_effect=_make_task_to_cliente_data_fn({"encontro_atual": 15})):
            with patch("deps.supabase_client", mock_sb):
                with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
                    clickup_sync.run_clickup_sync()

    # Confirma que UPDATE foi chamado com encontro_atual=15
    update_calls = chain.update.call_args_list
    encontro_updates = [c for c in update_calls if c.args[0].get("encontro_atual") == 15]
    assert len(encontro_updates) == 1


def test_update_includes_consultor_change():
    """Consultor mudou no ClickUp → UPDATE persiste novo nome."""
    from services import clickup_sync

    initial = [
        {"id": "c1", "nome": "Cliente Y", "clickup_task_id": "task-y",
         "archived_at": None, "status": "ativo",
         "consultor_responsavel": "Lucas Nery"}
    ]
    mock_sb, chain = _make_supabase_mock(initial)
    task = _make_task("Cliente Y", "ativo", "task-y")

    with patch.object(clickup_sync, "list_all_tasks", return_value=[task]):
        with patch.object(clickup_sync, "task_to_cliente_data",
                          side_effect=_make_task_to_cliente_data_fn(
                              {"consultor_responsavel": "Pedro Aranda"})):
            with patch("deps.supabase_client", mock_sb):
                with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
                    clickup_sync.run_clickup_sync()

    update_calls = chain.update.call_args_list
    consultor_updates = [c for c in update_calls
                         if c.args[0].get("consultor_responsavel") == "Pedro Aranda"]
    assert len(consultor_updates) == 1


def test_insert_when_no_match():
    """Task nova (sem match no DB nem por task_id nem por nome) → INSERT."""
    from services import clickup_sync

    initial = []  # DB vazio
    mock_sb, chain = _make_supabase_mock(initial)
    task = _make_task("Novo Cliente", "ativo", "task-novo")

    with patch.object(clickup_sync, "list_all_tasks", return_value=[task]):
        with patch.object(clickup_sync, "task_to_cliente_data",
                          side_effect=_make_task_to_cliente_data_fn()):
            with patch("deps.supabase_client", mock_sb):
                with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
                    stats = clickup_sync.run_clickup_sync()

    assert stats["created"] == 1
    assert stats["updated"] == 0
    assert stats["ativos"] == 1
    assert chain.insert.called


def test_stats_keys_complete():
    """Stats inclui todas as chaves esperadas pro frontend."""
    from services import clickup_sync

    mock_sb, _ = _make_supabase_mock([])
    with patch.object(clickup_sync, "list_all_tasks", return_value=[]):
        with patch("deps.supabase_client", mock_sb):
            with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
                stats = clickup_sync.run_clickup_sync()

    expected = {"archived", "reactivated", "paused", "ativos",
                "created", "updated", "no_change", "errors", "total", "duration_ms"}
    assert expected.issubset(set(stats.keys()))


def test_no_token_returns_zero_stats():
    """Sem CLICKUP_API_TOKEN, retorna stats vazios sem erro."""
    from services import clickup_sync

    env_without_token = {k: v for k, v in os.environ.items() if k != "CLICKUP_API_TOKEN"}
    env_without_token["CLICKUP_API_TOKEN"] = ""

    with patch.dict("os.environ", env_without_token, clear=True):
        stats = clickup_sync.run_clickup_sync()

    assert stats["total"] == 0
    assert stats["errors"] == 0
