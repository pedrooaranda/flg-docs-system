"""
Endpoint /me/scope — frontend consome via useUserScope hook pra saber
canSeeAll + myConsultorId + myConsultorNome (single source-of-truth).
"""
from fastapi import APIRouter, Depends

from lib.auth_scope import UserScope, get_user_scope

router = APIRouter(prefix="/me", tags=["me"])


async def _get_scope_handler(scope: UserScope) -> dict:
    """Lógica pura do handler — testável sem router decorator."""
    return scope.to_dict()


# Alias público para os testes importarem sem passar pelo decorator do router
get_scope = _get_scope_handler


@router.get("/scope")
async def get_scope_route(scope: UserScope = Depends(get_user_scope)) -> dict:
    """Retorna o UserScope serializado pro frontend."""
    return await _get_scope_handler(scope)
