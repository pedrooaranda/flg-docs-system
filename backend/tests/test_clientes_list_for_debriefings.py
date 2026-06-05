"""Tests de gating do endpoint /clientes/list-for-debriefings.

Endpoint do sub-projeto 2 (Debriefings) — listagem enxuta pra home
/debriefings.

Regra:
  - Comercial passa (canSeeDebriefings=True)
  - Diretor passa
  - Owner passa
  - Consultor recebe 403 (canSeeDebriefings=False)
"""
import os
import sys
import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

from lib.auth_scope import UserScope


def _make_scope(categoria, role):
    """Helper: monta UserScope com flags computadas pelo _compute_flags real."""
    from lib.auth_scope import _compute_flags
    p, d, da = _compute_flags(categoria, role)
    return UserScope(
        user_id="u-1",
        email="x@grupoguglielmi.com",
        role=role,
        consultor_id=None,
        consultor_nome=None,
        categoria=categoria,
        can_see_all=True,
        can_see_principal=p,
        can_see_debriefings=d,
        can_see_debriefings_admin=da,
    )


@pytest.mark.asyncio
async def test_consultor_recebe_403():
    from main import list_clientes_for_debriefings
    scope = _make_scope("consultor", "member")
    with pytest.raises(HTTPException) as exc:
        await list_clientes_for_debriefings(scope=scope)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_comercial_passa(mock_main_supabase):
    from main import list_clientes_for_debriefings
    scope = _make_scope("comercial", "member")
    fake_data = [{"id": "c1", "nome": "Cliente A", "empresa": "Empresa A"}]
    mock_main_supabase.table.return_value.select.return_value.is_.return_value.order.return_value.execute.return_value = MagicMock(data=fake_data)
    result = await list_clientes_for_debriefings(scope=scope)
    assert result == fake_data


@pytest.mark.asyncio
async def test_diretor_passa(mock_main_supabase):
    from main import list_clientes_for_debriefings
    scope = _make_scope("diretor", "member")
    fake_data = [{"id": "c1", "nome": "X", "empresa": "Y"}]
    mock_main_supabase.table.return_value.select.return_value.is_.return_value.order.return_value.execute.return_value = MagicMock(data=fake_data)
    result = await list_clientes_for_debriefings(scope=scope)
    assert result == fake_data
