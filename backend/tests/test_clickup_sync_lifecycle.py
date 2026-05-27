"""Tests pra evaluate_lifecycle — função pura que mapeia SITUAÇÃO do ClickUp
pra decisão de status_db + should_archive.

Regras da spec Stream 7:
  encerrado/renovado/inativo → ('concluido', True)  → archive
  em encerramento → ('ativo', False)  → visível (transitório)
  pausado → ('pausado', False) → visível com badge
  resto → ('ativo', False) → visível

Nota: A função é definida em services/clickup_sync.py e testada aqui.
Pra evitar issues com mocks do conftest, importamos diretamente do módulo.
"""
import sys
import types
import importlib.util
import os
import pytest
from unittest.mock import MagicMock


# Setup: criar pacotes services e tools como tipos.ModuleType reais
def _setup_packages_for_clickup_sync():
    """Prepara os pacotes e módulos necessários pra importar clickup_sync."""
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # Remove stubs antigos
    for mod in ["services", "services.clickup_sync", "tools", "tools.clickup_tools"]:
        if mod in sys.modules:
            del sys.modules[mod]
    
    # Cria services como package real
    if "services" not in sys.modules:
        _services = types.ModuleType("services")
        _services.__path__ = [os.path.join(backend_dir, "services")]
        sys.modules["services"] = _services
    
    # Cria tools como package real
    if "tools" not in sys.modules:
        _tools = types.ModuleType("tools")
        _tools.__path__ = [os.path.join(backend_dir, "tools")]
        sys.modules["tools"] = _tools
    
    # Cria stubs para as dependências de clickup_sync
    if "tools.clickup_tools" not in sys.modules:
        _clickup_tools = types.ModuleType("tools.clickup_tools")
        _clickup_tools.list_all_tasks = MagicMock()
        _clickup_tools.task_to_cliente_data = MagicMock()
        sys.modules["tools.clickup_tools"] = _clickup_tools
        sys.modules["tools"].clickup_tools = _clickup_tools
    
    # Carrega o módulo clickup_sync de verdade
    if "services.clickup_sync" not in sys.modules:
        spec = importlib.util.spec_from_file_location(
            "services.clickup_sync",
            os.path.join(backend_dir, "services", "clickup_sync.py")
        )
        mod = importlib.util.module_from_spec(spec)
        sys.modules["services.clickup_sync"] = mod
        spec.loader.exec_module(mod)
        sys.modules["services"].clickup_sync = mod


# Executar setup antes de importar
_setup_packages_for_clickup_sync()

from services.clickup_sync import evaluate_lifecycle


@pytest.mark.parametrize("situacao,expected_status,expected_archive", [
    # Terminais → archive
    ("Encerrado", "concluido", True),
    ("encerrado", "concluido", True),
    ("ENCERRADO", "concluido", True),
    ("Renovado", "concluido", True),
    ("renovado", "concluido", True),
    ("Inativo", "concluido", True),
    ("inativo", "concluido", True),
    # Transitório (Em Encerramento) → NÃO archive
    ("Em Encerramento", "ativo", False),
    ("em encerramento", "ativo", False),
    # Pausado → mantém com tag
    ("Pausado", "pausado", False),
    ("pausado", "pausado", False),
    ("Em Pausa", "pausado", False),
    # Ativos / normais
    ("Indo Bem", "ativo", False),
    ("Excelente", "ativo", False),
    ("Normal", "ativo", False),
    ("Em Campanha", "ativo", False),
    ("Atenção", "ativo", False),
    ("Alerta", "ativo", False),
    # Fallback seguro
    ("", "ativo", False),
    (None, "ativo", False),
    ("status_desconhecido_novo", "ativo", False),
])
def test_evaluate_lifecycle(situacao, expected_status, expected_archive):
    status, should_archive = evaluate_lifecycle(situacao)
    assert status == expected_status
    assert should_archive == expected_archive
