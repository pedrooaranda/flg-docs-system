# Debriefings Sub-projeto 1: Identidade Comercial + Gating Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar categoria `comercial` em colaboradores, estender `UserScope` com flags de acesso (`can_see_principal`, `can_see_debriefings`, `can_see_debriefings_admin`), criar helpers `require_*` e aplicar nos endpoints existentes; aba "Comerciais" em `/colaboradores` + 3ª opção no modal. Sem UI do Debriefing — sub-projeto 2.

**Architecture:** Reusa toda a infra de `colaboradores` (modal, auto-provisioning, reset-password). Backend ganha 3 flags computadas no `UserScope` e 3 helpers `require_*` que viram `HTTPException(403)`. Endpoints do sistema principal e `/debriefings/*` aplicam o gate certo. Frontend só atualiza constants, useUserScope e Colaboradores/index.

**Tech Stack:** Backend Python 3.12 / FastAPI / supabase-py / pytest. Frontend React 18 / Vite / Tailwind / esbuild validation. Deploy automático via GH Actions em push pra `main`.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `docs/migrations/011-colaboradores-categoria-comercial.sql` | CHECK constraint da categoria aceita `'comercial'` | Criar |
| `backend/routes/colaboradores.py` | `CATEGORIAS_VALIDAS` aceita `'comercial'` | Modificar (linha 37) |
| `backend/lib/auth_scope.py` | `UserScope` ganha 3 flags + helpers `require_*` | Modificar |
| `backend/tests/test_auth_scope.py` | Testes das 3 flags + helpers | Modificar |
| `backend/main.py` | Endpoints do sistema principal aplicam `require_principal` | Modificar |
| `backend/routes/debriefings.py` | Todas as rotas aplicam `require_debriefings` | Modificar |
| `backend/tests/test_clientes_auth.py` | Testes de gating do sistema principal (comercial → 403) | Modificar |
| `backend/tests/test_debriefings_auth.py` | Testes de gating do debriefing (consultor → 403) | Criar |
| `frontend/src/components/Colaboradores/shared/constants.js` | `CATEGORIAS` e `CATEGORIA_CONFIG` ganham `'comercial'` | Modificar |
| `frontend/src/components/Colaboradores/index.jsx` | TABS ganha "Comerciais" | Modificar |
| `frontend/src/hooks/useUserScope.js` | Retorna `canSeePrincipal`, `canSeeDebriefings`, `canSeeDebriefingsAdmin` | Modificar |

---

## Task 1: Migration + backend categoria validation

**Files:**
- Create: `docs/migrations/011-colaboradores-categoria-comercial.sql`
- Modify: `backend/routes/colaboradores.py:37`

- [ ] **Step 1: Criar migration SQL**

Cria `docs/migrations/011-colaboradores-categoria-comercial.sql`:

```sql
-- Migration 011 — Categoria 'comercial' em colaboradores
-- A aplicar manualmente no Supabase Dashboard (VPS sem IPv6, padrão da repo).
-- Status: aguardando aplicação pelo Pedro.
--
-- Contexto: subsistema de Debriefings precisa de um time comercial separado
-- (Membros Comerciais e Diretores Comerciais) que não acessa o sistema principal.
-- Reusa tabela colaboradores adicionando 'comercial' no CHECK constraint da
-- coluna categoria. Membro Comercial = role='member'; Diretor Comercial = role='admin'.

ALTER TABLE colaboradores DROP CONSTRAINT IF EXISTS colaboradores_categoria_check;
ALTER TABLE colaboradores ADD CONSTRAINT colaboradores_categoria_check
  CHECK (categoria IN ('consultor', 'diretor', 'comercial'));

COMMENT ON COLUMN colaboradores.categoria IS
  'consultor (sistema principal), diretor (acesso transversal), comercial (só subsistema de Debriefings)';
```

- [ ] **Step 2: Adicionar `'comercial'` em `CATEGORIAS_VALIDAS`**

Substituir em `backend/routes/colaboradores.py` linha 37:

```python
CATEGORIAS_VALIDAS = ("consultor", "diretor", "comercial")
```

- [ ] **Step 3: Validar sintaxe Python**

Run: `python3 -c "import ast; ast.parse(open('backend/routes/colaboradores.py').read())" && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add docs/migrations/011-colaboradores-categoria-comercial.sql backend/routes/colaboradores.py
git commit -m "feat(colaboradores): adiciona categoria 'comercial' (sub-projeto 1)

Migration 011 amplia CHECK constraint pra aceitar comercial. CATEGORIAS_VALIDAS
no backend acompanha. Membro Comercial usa role='member', Diretor Comercial
usa role='admin'. Modal e CRUD funcionam sem mais nada porque toda lógica é
genérica por categoria.

Aplicar SQL no Supabase Dashboard antes de deploy."
```

---

## Task 2: UserScope estendido com 3 flags

**Files:**
- Modify: `backend/lib/auth_scope.py`
- Modify: `backend/tests/test_auth_scope.py`

- [ ] **Step 1: Escrever teste pra `can_see_principal`**

Adicionar em `backend/tests/test_auth_scope.py` (no fim do arquivo):

```python
# ─── Flags de scope estendido (sub-projeto 1 — Debriefings) ──────────────


async def test_consultor_can_see_principal_true(mock_supabase, fake_user_consultor):
    """Consultor regular → can_see_principal=True (é dono do sistema principal)."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-lucas", "nome": "Lucas", "email": fake_user_consultor.email,
              "categoria": "consultor", "role": "member"}
    )
    scope = await get_user_scope(user=fake_user_consultor)
    assert scope.can_see_principal is True
    assert scope.can_see_debriefings is False
    assert scope.can_see_debriefings_admin is False


async def test_diretor_ve_principal_e_debriefings(mock_supabase, fake_user_diretor):
    """Diretor → vê os dois sistemas e também o painel admin do debriefing."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-dir", "nome": "Diretor", "email": fake_user_diretor.email,
              "categoria": "diretor", "role": "member"}
    )
    scope = await get_user_scope(user=fake_user_diretor)
    assert scope.can_see_principal is True
    assert scope.can_see_debriefings is True
    assert scope.can_see_debriefings_admin is True


async def test_comercial_member_so_debriefings(mock_supabase, fake_user_consultor):
    """Membro Comercial → só debriefings, sem painel admin."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-com", "nome": "Comercial", "email": fake_user_consultor.email,
              "categoria": "comercial", "role": "member"}
    )
    scope = await get_user_scope(user=fake_user_consultor)
    assert scope.can_see_principal is False
    assert scope.can_see_debriefings is True
    assert scope.can_see_debriefings_admin is False


async def test_comercial_admin_ve_painel(mock_supabase, fake_user_admin):
    """Diretor Comercial (categoria=comercial, role=admin) → vê painel admin."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-dc", "nome": "Dir Com", "email": fake_user_admin.email,
              "categoria": "comercial", "role": "admin"}
    )
    scope = await get_user_scope(user=fake_user_admin)
    assert scope.can_see_principal is False
    assert scope.can_see_debriefings is True
    assert scope.can_see_debriefings_admin is True


async def test_owner_ve_tudo_independente_categoria(mock_supabase, fake_user_owner):
    """Owner vê tudo, em qualquer categoria."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-pedro", "nome": "Pedro", "email": fake_user_owner.email,
              "categoria": "comercial", "role": "owner"}
    )
    scope = await get_user_scope(user=fake_user_owner)
    assert scope.can_see_principal is True
    assert scope.can_see_debriefings is True
    assert scope.can_see_debriefings_admin is True


async def test_owner_fallback_pedro_ve_tudo(mock_supabase, fake_user_owner):
    """Pedro sem ficha em colaboradores ainda vê tudo via OWNER_FALLBACK_EMAILS."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(data=None)
    scope = await get_user_scope(user=fake_user_owner)
    assert scope.can_see_principal is True
    assert scope.can_see_debriefings is True
    assert scope.can_see_debriefings_admin is True


async def test_external_sem_ficha_nao_ve_nada(mock_supabase, fake_user_external):
    """User externo (sem ficha, sem fallback) → não vê nada."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(data=None)
    scope = await get_user_scope(user=fake_user_external)
    assert scope.can_see_principal is False
    assert scope.can_see_debriefings is False
    assert scope.can_see_debriefings_admin is False
```

- [ ] **Step 2: Rodar testes pra confirmar que falham**

Run: `cd backend && python -m pytest tests/test_auth_scope.py -v -k "can_see_principal or comercial or debriefings or external or owner_fallback_pedro" 2>&1 | tail -30`
Expected: FAIL com `AttributeError: 'UserScope' object has no attribute 'can_see_principal'` (ou similar).

- [ ] **Step 3: Adicionar campos no dataclass + cálculo**

Substituir em `backend/lib/auth_scope.py` o dataclass e o `get_user_scope`:

```python
@dataclass(frozen=True)
class UserScope:
    user_id: str
    email: str
    can_see_all: bool
    consultor_id: Optional[str]
    consultor_nome: Optional[str]
    categoria: Optional[str]                  # 'consultor' | 'diretor' | 'comercial' | None
    role: Optional[str]                        # 'owner' | 'admin' | 'member' | None
    can_see_principal: bool                    # sistema principal (Clientes, Métricas, etc.)
    can_see_debriefings: bool                  # subsistema Debriefings
    can_see_debriefings_admin: bool            # painel admin do Debriefing (KPIs, ranking)

    def to_dict(self) -> dict:
        return asdict(self)


def _compute_flags(categoria: Optional[str], role: Optional[str]) -> tuple[bool, bool, bool]:
    """Calcula (can_see_principal, can_see_debriefings, can_see_debriefings_admin)
    baseado em categoria + role. Owner sempre vê tudo."""
    is_owner = role == "owner"

    can_see_principal = is_owner or (categoria in ("consultor", "diretor"))
    can_see_debriefings = is_owner or (categoria in ("diretor", "comercial"))
    can_see_debriefings_admin = (
        is_owner
        or categoria == "diretor"
        or (categoria == "comercial" and role == "admin")
    )

    return can_see_principal, can_see_debriefings, can_see_debriefings_admin
```

E nas 3 `return UserScope(...)` dentro de `get_user_scope`:

**Linha do fallback owner (Pedro sem ficha) — substituir:**

```python
    if _is_owner_fallback(email):
        can_see_p, can_see_d, can_see_da = _compute_flags(None, "owner")
        return UserScope(
            user_id=user_id,
            email=email,
            can_see_all=True,
            consultor_id=None,
            consultor_nome=None,
            categoria=None,
            role="owner",
            can_see_principal=can_see_p,
            can_see_debriefings=can_see_d,
            can_see_debriefings_admin=can_see_da,
        )
```

**Linha do user externo (sem ficha, sem fallback) — substituir:**

```python
    # User externo / não cadastrado: não vê nada
    return UserScope(
        user_id=user_id,
        email=email,
        can_see_all=False,
        consultor_id=None,
        consultor_nome=None,
        categoria=None,
        role=None,
        can_see_principal=False,
        can_see_debriefings=False,
        can_see_debriefings_admin=False,
    )
```

**Linha do caminho normal (com ficha) — substituir:**

```python
    categoria = row.get("categoria")
    role = row.get("role") or "member"
    can_see_all = (categoria == "diretor") or (role in ("owner", "admin"))
    can_see_p, can_see_d, can_see_da = _compute_flags(categoria, role)

    return UserScope(
        user_id=user_id,
        email=email,
        can_see_all=can_see_all,
        consultor_id=row.get("id"),
        consultor_nome=row.get("nome"),
        categoria=categoria,
        role=role,
        can_see_principal=can_see_p,
        can_see_debriefings=can_see_d,
        can_see_debriefings_admin=can_see_da,
    )
```

- [ ] **Step 4: Rodar testes — devem passar**

Run: `cd backend && python -m pytest tests/test_auth_scope.py -v 2>&1 | tail -30`
Expected: todos os testes (antigos + 7 novos) passam.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/auth_scope.py backend/tests/test_auth_scope.py
git commit -m "feat(auth_scope): adiciona can_see_principal/debriefings/admin

UserScope ganha 3 flags computadas a partir de categoria + role:
- can_see_principal: consultor/diretor/owner (sistema principal)
- can_see_debriefings: diretor/comercial/owner (subsistema)
- can_see_debriefings_admin: diretor/dir comercial/owner (painel KPIs)

Helper _compute_flags centraliza a regra. Owner vê tudo sempre.
Tests cobrem matriz completa categoria × role + fallbacks."
```

---

## Task 3: Helpers require_*

**Files:**
- Modify: `backend/lib/auth_scope.py`
- Modify: `backend/tests/test_auth_scope.py`

- [ ] **Step 1: Escrever teste pra `require_principal`**

Adicionar em `backend/tests/test_auth_scope.py`:

```python
from fastapi import HTTPException
from lib.auth_scope import (
    require_principal, require_debriefings, require_debriefings_admin,
)


def _make_scope(can_p=False, can_d=False, can_da=False):
    """Helper pra montar UserScope mínimo só com as flags relevantes pros require_*."""
    return UserScope(
        user_id="u",
        email="x@example.com",
        can_see_all=False,
        consultor_id=None,
        consultor_nome=None,
        categoria=None,
        role=None,
        can_see_principal=can_p,
        can_see_debriefings=can_d,
        can_see_debriefings_admin=can_da,
    )


def test_require_principal_403_sem_flag():
    scope = _make_scope(can_p=False)
    with pytest.raises(HTTPException) as exc:
        require_principal(scope)
    assert exc.value.status_code == 403


def test_require_principal_passa_com_flag():
    require_principal(_make_scope(can_p=True))  # não levanta


def test_require_debriefings_403_sem_flag():
    scope = _make_scope(can_d=False)
    with pytest.raises(HTTPException) as exc:
        require_debriefings(scope)
    assert exc.value.status_code == 403


def test_require_debriefings_passa_com_flag():
    require_debriefings(_make_scope(can_d=True))


def test_require_debriefings_admin_403_sem_flag():
    scope = _make_scope(can_da=False)
    with pytest.raises(HTTPException) as exc:
        require_debriefings_admin(scope)
    assert exc.value.status_code == 403


def test_require_debriefings_admin_passa_com_flag():
    require_debriefings_admin(_make_scope(can_da=True))
```

- [ ] **Step 2: Rodar testes — devem falhar (import error)**

Run: `cd backend && python -m pytest tests/test_auth_scope.py -v -k "require_" 2>&1 | tail -20`
Expected: `ImportError: cannot import name 'require_principal' from 'lib.auth_scope'`.

- [ ] **Step 3: Implementar helpers em `backend/lib/auth_scope.py`**

Adicionar no fim do arquivo:

```python
# ─── Helpers de gating pra endpoints (FastAPI levanta HTTPException → 403) ────

from fastapi import HTTPException


def require_principal(scope: UserScope) -> None:
    """Bloqueia acesso ao sistema principal (Clientes, Métricas, etc.).
    Comerciais recebem 403."""
    if not scope.can_see_principal:
        raise HTTPException(
            status_code=403,
            detail="Acesso restrito ao sistema principal",
        )


def require_debriefings(scope: UserScope) -> None:
    """Bloqueia acesso ao subsistema de Debriefings.
    Consultores (não-diretores) recebem 403."""
    if not scope.can_see_debriefings:
        raise HTTPException(
            status_code=403,
            detail="Acesso restrito ao sistema de Debriefings",
        )


def require_debriefings_admin(scope: UserScope) -> None:
    """Bloqueia acesso ao painel admin de Debriefings (KPIs, ranking).
    Membros Comerciais regulares recebem 403."""
    if not scope.can_see_debriefings_admin:
        raise HTTPException(
            status_code=403,
            detail="Acesso restrito ao painel admin de Debriefings",
        )
```

- [ ] **Step 4: Rodar testes — passam**

Run: `cd backend && python -m pytest tests/test_auth_scope.py -v 2>&1 | tail -30`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add backend/lib/auth_scope.py backend/tests/test_auth_scope.py
git commit -m "feat(auth_scope): helpers require_principal/debriefings/admin

3 funções que levantam HTTPException(403) quando a flag correspondente
do UserScope é falsa. Mensagens curtas e claras pro frontend renderizar
o erro. Cada helper testado pelos dois lados (passa quando true,
levanta quando false)."
```

---

## Task 4: Aplicar `require_principal` no sistema principal

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/tests/test_clientes_auth.py`

- [ ] **Step 1: Escrever teste pra `/clientes-basic` com comercial → 403**

Adicionar em `backend/tests/test_clientes_auth.py` (no fim do arquivo):

```python
# ─── Sub-projeto 1: comercial não acessa sistema principal ───────────────


async def test_comercial_bloqueado_em_clientes_basic(mock_supabase, fake_user_consultor):
    """Categoria comercial recebe 403 em /clientes-basic."""
    from main import list_clientes_basic
    from fastapi import HTTPException

    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-com", "nome": "Com", "email": fake_user_consultor.email,
              "categoria": "comercial", "role": "member"}
    )
    scope = await get_user_scope(user=fake_user_consultor)
    with pytest.raises(HTTPException) as exc:
        await list_clientes_basic(scope=scope)
    assert exc.value.status_code == 403


async def test_consultor_passa_em_clientes_basic(mock_supabase, fake_user_consultor):
    """Consultor regular continua vendo /clientes-basic."""
    from main import list_clientes_basic

    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-c", "nome": "C", "email": fake_user_consultor.email,
              "categoria": "consultor", "role": "member"}
    )
    # mock_supabase.table('clientes') retorna lista
    chain = mock_supabase.table.return_value
    chain.execute.return_value = MagicMock(data=[{"id": "c1", "nome": "Cliente"}])

    scope = await get_user_scope(user=fake_user_consultor)
    result = await list_clientes_basic(scope=scope)
    assert isinstance(result, list)
```

(Adicionar os imports `from lib.auth_scope import get_user_scope` e `from unittest.mock import MagicMock` no topo se faltarem.)

- [ ] **Step 2: Rodar — devem falhar**

Run: `cd backend && python -m pytest tests/test_clientes_auth.py -v -k "comercial or basic" 2>&1 | tail -25`
Expected: FAIL — endpoint ainda não tem `require_principal`. Pode falhar com TypeError (parâmetro `scope` não aceito) ou retornar dados sem 403.

- [ ] **Step 3: Trocar `list_clientes_basic` pra usar `UserScope` + `require_principal`**

Substituir em `backend/main.py` (linha 430 aprox):

```python
@app.get("/clientes-basic")
async def list_clientes_basic(scope: UserScope = Depends(get_user_scope)):
    """
    Lista enxuta de clientes (id, nome, empresa) SEM filtro de scope por consultor.

    Caso de uso: consultor regular precisa selecionar qualquer cliente em fluxos
    pré-atribuição (ex: organização de mídias / onboarding IG acontece antes do
    consultor_id ser definido na entrega do Planejamento Estratégico). Aqui não
    cabe restrição por scope.

    Bloqueado pra categoria='comercial' (esse fluxo é do sistema principal).

    Filtra archived_at IS NULL pra evitar poluir UI com ex-clientes.
    """
    require_principal(scope)
    result = (
        _supabase.table("clientes")
        .select("id, nome, empresa")
        .is_("archived_at", "null")
        .order("nome")
        .execute()
    )
    return result.data
```

Adicionar o import no topo do `main.py` (linha ~43, ao lado do `from lib.auth_scope import UserScope, get_user_scope`):

```python
from lib.auth_scope import UserScope, get_user_scope, require_principal
```

- [ ] **Step 4: Rodar testes — passam**

Run: `cd backend && python -m pytest tests/test_clientes_auth.py -v 2>&1 | tail -25`
Expected: PASS.

- [ ] **Step 5: Aplicar `require_principal` nos demais endpoints do principal**

Os endpoints abaixo já usam `Depends(get_user_scope)` — só adicionar `require_principal(scope)` no início do handler:

- `backend/main.py` linha ~399 `list_clientes` (GET /clientes)
- `backend/main.py` linha ~456 `list_clientes_summary` (GET /clientes-summary)
- `backend/main.py` linha ~567 `get_cliente` (GET /clientes/{id})
- `backend/main.py` linha ~584 `create_cliente` (POST /clientes)
- `backend/main.py` linha ~599 `update_cliente` (PATCH /clientes/{id})
- `backend/main.py` linha ~1068 `delete_cliente` (DELETE /clientes/{id})

Pra cada um, adicionar como primeira linha do corpo:

```python
    require_principal(scope)
```

Em `backend/routes/me.py` linha ~22 (`get_scope_route`): **NÃO aplicar** require_principal — `/me/scope` precisa funcionar pra qualquer logado pra que o frontend saiba pra onde redirecionar.

Endpoints de Métricas (se houver em `backend/main.py` ou `backend/routes/*`): aplicar `require_principal(scope)` nos GETs de `/metricas/*`. Buscar com `grep -n "scope: UserScope" backend/main.py` pra confirmar — todos os que retornam dados de cliente/métrica devem ter o gate.

- [ ] **Step 6: Rodar suíte completa**

Run: `cd backend && python -m pytest tests/ -v 2>&1 | tail -15`
Expected: todos os testes existentes continuam passando + os novos passam. Se algum teste antigo quebra, é porque ele simulava comercial chamando endpoint do principal — ajustar pra usar categoria='consultor' ou 'diretor'.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/tests/test_clientes_auth.py
git commit -m "feat(main): aplica require_principal nos endpoints de Cliente

GET/POST/PATCH/DELETE /clientes, /clientes-summary, /clientes-basic,
/clientes/{id} agora levantam 403 pra categoria='comercial'.
Consultores e diretores continuam vendo normal.

Endpoint /me/scope permanece aberto pra qualquer logado, senão o
frontend não consegue saber pra onde redirecionar comercial mal-logado."
```

---

## Task 5: Aplicar `require_debriefings` em `/debriefings/*`

**Files:**
- Modify: `backend/routes/debriefings.py`
- Create: `backend/tests/test_debriefings_auth.py`

- [ ] **Step 1: Criar teste de gating do debriefing**

Cria `backend/tests/test_debriefings_auth.py`:

```python
"""Tests de gating do subsistema de Debriefings (sub-projeto 1).

Regra:
  - Consultor recebe 403 em /debriefings/*
  - Diretor, Comercial e Owner passam
"""
import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException

from lib.auth_scope import get_user_scope


async def test_consultor_recebe_403_em_list_debriefings(mock_supabase, fake_user_consultor):
    from routes.debriefings import list_debriefings

    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-c", "nome": "Lucas", "email": fake_user_consultor.email,
              "categoria": "consultor", "role": "member"}
    )
    scope = await get_user_scope(user=fake_user_consultor)
    with pytest.raises(HTTPException) as exc:
        await list_debriefings(scope=scope)
    assert exc.value.status_code == 403


async def test_diretor_acessa_list_debriefings(mock_supabase, fake_user_diretor):
    from routes.debriefings import list_debriefings

    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-d", "nome": "Diretor", "email": fake_user_diretor.email,
              "categoria": "diretor", "role": "member"}
    )
    chain = mock_supabase.table.return_value
    chain.execute.return_value = MagicMock(data=[])

    scope = await get_user_scope(user=fake_user_diretor)
    result = await list_debriefings(scope=scope)
    assert "debriefings" in result and "total" in result


async def test_comercial_acessa_list_debriefings(mock_supabase, fake_user_consultor):
    """Membro Comercial passa em /debriefings."""
    from routes.debriefings import list_debriefings

    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-com", "nome": "Comercial", "email": fake_user_consultor.email,
              "categoria": "comercial", "role": "member"}
    )
    chain = mock_supabase.table.return_value
    chain.execute.return_value = MagicMock(data=[])

    scope = await get_user_scope(user=fake_user_consultor)
    result = await list_debriefings(scope=scope)
    assert "debriefings" in result and "total" in result
```

- [ ] **Step 2: Rodar — devem falhar**

Run: `cd backend && python -m pytest tests/test_debriefings_auth.py -v 2>&1 | tail -25`
Expected: FAIL — handlers não recebem `scope` ainda ou não levantam 403.

- [ ] **Step 3: Aplicar `require_debriefings` em todas as rotas de `routes/debriefings.py`**

Adicionar no topo do arquivo (junto com imports existentes):

```python
from lib.auth_scope import UserScope, get_user_scope, require_debriefings
```

Em CADA handler do arquivo (POST `""` linha 355, GET `/clientes/{cliente_id}/ciclos` linha 456, GET `""` linha 511, GET `/{debriefing_id}` linha 524, GET `/{debriefing_id}/stream` linha 533, GET `/{debriefing_id}/pdf` linha 571):

1. Trocar `user=Depends(get_current_user)` por `scope: UserScope = Depends(get_user_scope)` na assinatura.
2. Adicionar `require_debriefings(scope)` como primeira linha do corpo.
3. Se o handler usa `user.email` / `user.id` internamente, trocar pra `scope.email` / `scope.user_id`. Se usa só pra autenticar, remover a referência.

**Exemplo concreto (`list_debriefings`, linha 511):**

```python
@router.get("")
async def list_debriefings(
    cliente_id: Optional[str] = Query(None),
    scope: UserScope = Depends(get_user_scope),
):
    require_debriefings(scope)
    """Lista debriefings, opcionalmente filtrados por cliente. Mais recentes primeiro."""
    q = _supabase.table("debriefings").select("*").order("gerado_at", desc=True)
    if cliente_id:
        q = q.eq("cliente_id", cliente_id)
    result = q.execute()
    return {"debriefings": result.data or [], "total": len(result.data or [])}
```

Replicar mesma transformação nos outros 5 handlers.

- [ ] **Step 4: Rodar testes**

Run: `cd backend && python -m pytest tests/test_debriefings_auth.py -v 2>&1 | tail -25`
Expected: PASS.

- [ ] **Step 5: Suíte completa de regressão**

Run: `cd backend && python -m pytest tests/ -v 2>&1 | tail -15`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/debriefings.py backend/tests/test_debriefings_auth.py
git commit -m "feat(debriefings): aplica require_debriefings em todas as rotas

Consultor agora recebe 403 ao tentar acessar qualquer endpoint de
/debriefings/*. Diretor, Comercial e Owner continuam acessando.

Tests cobrem matriz completa: consultor bloqueado + diretor e comercial
passando."
```

---

## Task 6: Frontend constants ganham `'comercial'`

**Files:**
- Modify: `frontend/src/components/Colaboradores/shared/constants.js`

- [ ] **Step 1: Adicionar `'comercial'` em `CATEGORIAS` e `CATEGORIA_CONFIG`**

Substituir em `frontend/src/components/Colaboradores/shared/constants.js`:

```js
export const CATEGORIA_CONFIG = {
  consultor: { label: 'Consultor' },
  diretor:   { label: 'Diretor' },
  comercial: { label: 'Comercial' },
}
```

E:

```js
export const CATEGORIAS = ['consultor', 'diretor', 'comercial']
```

- [ ] **Step 2: Validar build esbuild**

Run: `cd frontend && npx esbuild --bundle src/components/Colaboradores/shared/constants.js --loader:.js=jsx --jsx=automatic --target=es2020 --outfile=/tmp/flg-val-constants.js 2>&1 | tail -5 ; echo "exit=$?"`
Expected: `exit=0`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Colaboradores/shared/constants.js
git commit -m "feat(colaboradores): constants aceitam categoria 'comercial'

CATEGORIAS e CATEGORIA_CONFIG ganham 3ª opção. Modal de adicionar
colaborador automaticamente mostra Comercial no dropdown porque renderiza
direto de CATEGORIAS."
```

---

## Task 7: `useUserScope` retorna flags novas

**Files:**
- Modify: `frontend/src/hooks/useUserScope.js`

- [ ] **Step 1: Adicionar 3 flags no state e no parsing**

Substituir o componente em `frontend/src/hooks/useUserScope.js`:

```js
import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export function useUserScope() {
  const [state, setState] = useState({
    canSeeAll: false,
    canSeePrincipal: false,
    canSeeDebriefings: false,
    canSeeDebriefingsAdmin: false,
    myConsultorId: null,
    myConsultorNome: null,
    categoria: null,
    role: null,
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    api('/me/scope')
      .then((scope) => {
        if (cancelled) return
        setState({
          canSeeAll: scope.can_see_all === true,
          canSeePrincipal: scope.can_see_principal === true,
          canSeeDebriefings: scope.can_see_debriefings === true,
          canSeeDebriefingsAdmin: scope.can_see_debriefings_admin === true,
          myConsultorId: scope.consultor_id ?? null,
          myConsultorNome: scope.consultor_nome ?? null,
          categoria: scope.categoria ?? null,
          role: scope.role ?? null,
          isLoading: false,
          error: null,
        })
      })
      .catch((err) => {
        if (cancelled) return
        // Fail-safe: restritivo
        setState({
          canSeeAll: false,
          canSeePrincipal: false,
          canSeeDebriefings: false,
          canSeeDebriefingsAdmin: false,
          myConsultorId: null,
          myConsultorNome: null,
          categoria: null,
          role: null,
          isLoading: false,
          error: err?.message || 'Falha ao carregar permissões',
        })
      })
    return () => { cancelled = true }
  }, [])

  return state
}
```

- [ ] **Step 2: Validar build**

Run: `cd frontend && npx esbuild --bundle src/hooks/useUserScope.js --loader:.js=jsx --jsx=automatic --target=es2020 --outfile=/tmp/flg-val-scope.js 2>&1 | tail -5 ; echo "exit=$?"`
Expected: `exit=0`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useUserScope.js
git commit -m "feat(useUserScope): expõe canSeePrincipal/Debriefings/Admin

Hook lê 3 flags novas do /me/scope e expõe no estado. Sub-projeto 2 vai
consumir pra fazer gating de rota; aqui só preparamos a fonte de verdade
no frontend.

Fail-safe restritivo mantido (404/erro de rede → tudo false)."
```

---

## Task 8: Aba "Comerciais" em `/colaboradores`

**Files:**
- Modify: `frontend/src/components/Colaboradores/index.jsx`

- [ ] **Step 1: Adicionar `'comerciais'` em `TABS`**

Substituir em `frontend/src/components/Colaboradores/index.jsx` o array `TABS`:

```js
const TABS = [
  { key: 'consultores', label: 'Consultores', categoria: 'consultor' },
  { key: 'diretores',   label: 'Diretores',   categoria: 'diretor' },
  { key: 'comerciais',  label: 'Comerciais',  categoria: 'comercial' },
]
```

- [ ] **Step 2: Validar build esbuild**

Run: `cd frontend && npx esbuild --bundle src/components/Colaboradores/index.jsx --loader:.jsx=jsx --jsx=automatic --target=es2020 --outfile=/tmp/flg-val-colab.js 2>&1 | tail -5 ; echo "exit=$?"`
Expected: `exit=0`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Colaboradores/index.jsx
git commit -m "feat(colaboradores): aba Comerciais em /colaboradores

TABS ganha terceira aba. Toda lógica de filtro, badge e edição já é
genérica pela categoria — funciona sem mais mudanças."
```

---

## Task 9: Push + aplicação da migration + smoke

**Files:** nenhum

- [ ] **Step 1: Push pra main (dispara deploy automático)**

```bash
git push origin main
```

- [ ] **Step 2: Monitorar deploy GH Actions até verde**

```bash
sleep 5
RUN_ID=$(gh run list --workflow=deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --exit-status 2>&1 | tail -5
gh run list --workflow=deploy.yml --limit 1
```

Expected: `success` em 30-60s.

- [ ] **Step 3: Aplicar migration 011 manualmente no Supabase Dashboard**

Pedro abre Supabase Dashboard → SQL Editor → cola o conteúdo de `docs/migrations/011-colaboradores-categoria-comercial.sql` → Run. Espera-se 1 ALTER + 1 COMMENT, sem erro.

Validar:

```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname = 'colaboradores_categoria_check';
```

Resultado esperado: `CHECK (categoria = ANY (ARRAY['consultor'::text, 'diretor'::text, 'comercial'::text]))`.

- [ ] **Step 4: Smoke manual 1 — Owner cria Diretor Comercial**

Pedro logado em prod → /colaboradores → confirma que aparece a aba "Comerciais" → clica "+ Adicionar colaborador" → preenche dados de teste (email @grupoguglielmi.com, categoria=Comercial, role=admin) → submit. Esperado: senha temp aparece na modal de reveal. Validar com SELECT no Supabase que a linha tem `categoria='comercial' AND role='admin'`.

- [ ] **Step 5: Smoke manual 2 — Comercial recebe 403 em /clientes**

Pegar Bearer token do user comercial recém-criado (via login no app ou Supabase Dashboard → JWT). Rodar:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer <TOKEN_COMERCIAL>" \
  https://docs.foundersledgrowth.online/api/clientes-basic
```

Expected: `403`.

- [ ] **Step 6: Smoke manual 3 — Consultor recebe 403 em /debriefings**

Pegar Bearer token do Lucas Nery (consultor existente):

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer <TOKEN_LUCAS>" \
  https://docs.foundersledgrowth.online/api/debriefings
```

Expected: `403`.

- [ ] **Step 7: Smoke manual 4 — Owner continua vendo tudo**

Pedro logado → /clientes carrega normalmente; abre cliente qualquer → aba "Debriefings" carrega normalmente. Nada regrediu.

- [ ] **Step 8: Atualizar HANDOFF**

Adicionar entrada em `docs/superpowers/HANDOFF-metricas-v3.md` no topo da seção atual:

```markdown
## Sub-projeto 1 Debriefings — entregue (2026-06-02)

- Categoria 'comercial' em colaboradores via migration 011
- UserScope + 3 flags: can_see_principal/debriefings/debriefings_admin
- Helpers require_principal/debriefings/admin
- Gating aplicado: sistema principal bloqueia comercial, /debriefings/* bloqueia consultor
- Aba "Comerciais" em /colaboradores
- Próximo: sub-projeto 2 (tela /debriefings/login + layouts + migração da UI)
```

Commit:

```bash
git add docs/superpowers/HANDOFF-metricas-v3.md
git commit -m "docs(handoff): sub-projeto 1 Debriefings entregue"
git push origin main
```

---

## Self-Review (executado durante writing-plans)

**Spec coverage:**

| Requisito do spec | Tarefa que implementa |
|---|---|
| Migration 011 (categoria 'comercial') | Task 1 |
| CATEGORIAS_VALIDAS aceita 'comercial' | Task 1 |
| UserScope com can_see_principal/debriefings/admin | Task 2 |
| Helpers require_principal/debriefings/admin | Task 3 |
| Gating /clientes, /clientes-summary, /clientes-basic, /metricas | Task 4 |
| Gating /debriefings/* | Task 5 |
| Frontend CATEGORIAS + CATEGORIA_CONFIG ganham 'comercial' | Task 6 |
| useUserScope retorna flags novas | Task 7 |
| Aba "Comerciais" em /colaboradores | Task 8 |
| Validação smoke fim a fim | Task 9 |

Coverage 100%.

**Placeholder scan:** sem TBD/TODO/"implementar depois". Cada step tem código completo.

**Type consistency:**
- `can_see_principal` / `can_see_debriefings` / `can_see_debriefings_admin` mantém nome consistente backend↔frontend (snake_case no Python; camelCase `canSeePrincipal` etc. no JS — convenção da repo).
- Helpers `require_principal` / `require_debriefings` / `require_debriefings_admin` consistentes em todas as tasks.
- `_compute_flags` retorna tupla na mesma ordem em que é desempacotada nas 3 chamadas.
