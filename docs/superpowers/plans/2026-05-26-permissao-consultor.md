# Permissionamento por Consultor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover filtro de visibilidade de clientes/métricas do frontend (heurístico, contornável) pra backend autoritativo via novo `UserScope`, baseado em FK `clientes.consultor_id` (migration 009 já aplicada externamente).

**Architecture:** Backend FastAPI vira única source-of-truth via dependency `get_user_scope(user)` que lookup `colaboradores` por email. Frontend consome `GET /me/scope` em hook compartilhado `useUserScope()`. Endpoints `/clientes` e `/metricas/*` filtram dados conforme `scope.can_see_all`. Endpoints individuais retornam 403 quando consultor tenta acessar cliente alheio.

**Tech Stack:** FastAPI 0.115+, Pydantic v2, supabase-py 2.10+, pytest+pytest-asyncio (novos), React 18, useState+useEffect (sem React Query — projeto não usa).

**Spec:** [docs/superpowers/specs/2026-05-26-permissao-consultor-design.md](../specs/2026-05-26-permissao-consultor-design.md)

**Pré-requisito externo:** migration `docs/migrations/009-clientes-consultor-fk.sql` aplicada no Supabase Dashboard ANTES de mergear Task 4. Pedro reatribui órfãos pela UI atual (campo TEXT `consultor_responsavel` ainda funcional).

---

## Task 1: Setup pytest no backend (primeira suite de testes da repo)

**Files:**
- Create: `backend/requirements-dev.txt`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/pytest.ini`

- [ ] **Step 1: Criar requirements-dev.txt**

```text
pytest>=8.0.0
pytest-asyncio>=0.24.0
httpx>=0.27.0  # já no requirements.txt mas duplica pra dev clarity
```

- [ ] **Step 2: Criar pytest.ini**

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
addopts = -v --tb=short
```

- [ ] **Step 3: Criar tests/__init__.py vazio**

```python
```

- [ ] **Step 4: Criar tests/conftest.py com fixtures de usuários**

```python
"""Fixtures pytest pro backend FLG.

Padrão: mocka supabase_client pra evitar hit em rede. Cada teste define o
shape dos retornos via fixture. Não usa real Supabase — testes unit.
"""
from dataclasses import dataclass
from unittest.mock import MagicMock, patch
import pytest


@dataclass
class FakeUser:
    """Mimics supabase auth user object."""
    id: str
    email: str


@pytest.fixture
def fake_user_consultor():
    return FakeUser(id="00000000-0000-0000-0000-000000000001",
                    email="lucasnery@grupoguglielmi.com")


@pytest.fixture
def fake_user_admin():
    return FakeUser(id="00000000-0000-0000-0000-000000000002",
                    email="adminuser@grupoguglielmi.com")


@pytest.fixture
def fake_user_diretor():
    return FakeUser(id="00000000-0000-0000-0000-000000000003",
                    email="diretor@grupoguglielmi.com")


@pytest.fixture
def fake_user_owner():
    return FakeUser(id="00000000-0000-0000-0000-000000000004",
                    email="pedroaranda@grupoguglielmi.com")


@pytest.fixture
def fake_user_external():
    """User autenticado SEM ficha em colaboradores."""
    return FakeUser(id="00000000-0000-0000-0000-000000000099",
                    email="externo@example.com")


@pytest.fixture
def mock_supabase():
    """Mock do supabase_client com chainable API (table().select().eq()...)."""
    with patch("deps.supabase_client") as mock_sb:
        # Define um chain helper — cada teste configura o `.execute().data` retornado
        chain = MagicMock()
        chain.select.return_value = chain
        chain.eq.return_value = chain
        chain.order.return_value = chain
        chain.single.return_value = chain
        chain.maybe_single.return_value = chain
        chain.insert.return_value = chain
        chain.update.return_value = chain
        mock_sb.table.return_value = chain
        # default execute retorna empty data; testes sobrescrevem
        chain.execute.return_value = MagicMock(data=[])
        yield mock_sb
```

- [ ] **Step 5: Instalar deps localmente pra rodar testes**

Run: `cd backend && pip3 install -r requirements-dev.txt 2>&1 | tail -3`
Expected: `Successfully installed pytest...` ou "Requirement already satisfied"

- [ ] **Step 6: Verificar pytest descobre estrutura**

Run: `cd backend && python3 -m pytest --collect-only -q 2>&1 | tail -5`
Expected: `no tests ran` ou similar (sem erros de import)

- [ ] **Step 7: Commit**

```bash
git add backend/requirements-dev.txt backend/pytest.ini backend/tests/__init__.py backend/tests/conftest.py
git commit -m "test(backend): setup pytest + fixtures de usuários"
```

---

## Task 2: auth_scope module (UserScope + get_user_scope dependency) — TDD

**Files:**
- Create: `backend/lib/__init__.py`
- Create: `backend/lib/auth_scope.py`
- Create: `backend/tests/test_auth_scope.py`

- [ ] **Step 1: Criar backend/lib/__init__.py vazio**

```python
```

- [ ] **Step 2: Escrever tests primeiro (test_auth_scope.py)**

```python
"""Tests pro UserScope + get_user_scope dependency.

Regra:
  can_see_all = (categoria=='diretor') OR (role IN ('owner','admin'))
  Senão: vê só os próprios.
"""
import pytest
from unittest.mock import MagicMock

from lib.auth_scope import UserScope, get_user_scope


async def test_consultor_regular_nao_ve_tudo(mock_supabase, fake_user_consultor):
    """Consultor categoria=consultor, role=member → can_see_all=False."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-lucas", "nome": "Lucas Nery", "email": fake_user_consultor.email,
              "categoria": "consultor", "role": "member"}
    )
    scope = await get_user_scope(user=fake_user_consultor)
    assert scope.can_see_all is False
    assert scope.consultor_id == "id-lucas"
    assert scope.consultor_nome == "Lucas Nery"
    assert scope.categoria == "consultor"
    assert scope.role == "member"


async def test_diretor_ve_tudo_mesmo_com_role_member(mock_supabase, fake_user_diretor):
    """Diretor sempre vê tudo, mesmo role=member."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-dir", "nome": "Diretor X", "email": fake_user_diretor.email,
              "categoria": "diretor", "role": "member"}
    )
    scope = await get_user_scope(user=fake_user_diretor)
    assert scope.can_see_all is True
    assert scope.consultor_id == "id-dir"


async def test_admin_ve_tudo_mesmo_categoria_consultor(mock_supabase, fake_user_admin):
    """Admin (role=admin) sobe permissão técnica, mesmo categoria=consultor."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-admin", "nome": "Admin X", "email": fake_user_admin.email,
              "categoria": "consultor", "role": "admin"}
    )
    scope = await get_user_scope(user=fake_user_admin)
    assert scope.can_see_all is True


async def test_owner_ve_tudo(mock_supabase, fake_user_owner):
    """Owner sempre vê tudo."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-pedro", "nome": "Pedro Aranda", "email": fake_user_owner.email,
              "categoria": "diretor", "role": "owner"}
    )
    scope = await get_user_scope(user=fake_user_owner)
    assert scope.can_see_all is True


async def test_user_sem_ficha_fallback_owner_pedro(mock_supabase, fake_user_owner):
    """Pedro sem ficha colaboradores ainda é owner via OWNER_FALLBACK_EMAILS."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(data=None)
    scope = await get_user_scope(user=fake_user_owner)
    assert scope.can_see_all is True
    assert scope.consultor_id is None  # sem ficha → sem id
    assert scope.role == "owner"  # via fallback


async def test_user_externo_sem_ficha_nem_fallback(mock_supabase, fake_user_external):
    """User autenticado mas sem ficha e fora do fallback → can_see_all=False + consultor_id=None.

    Significa que VAI ver lista vazia (filtro WHERE consultor_id = None não bate nada).
    """
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(data=None)
    scope = await get_user_scope(user=fake_user_external)
    assert scope.can_see_all is False
    assert scope.consultor_id is None
```

- [ ] **Step 3: Rodar tests pra ver falhando**

Run: `cd backend && python3 -m pytest tests/test_auth_scope.py -v 2>&1 | tail -20`
Expected: `ModuleNotFoundError: No module named 'lib.auth_scope'` ou similar

- [ ] **Step 4: Implementar lib/auth_scope.py**

```python
"""
Permissionamento por consultor — single source-of-truth do scope do usuário.

Regra de visibilidade (alinhada com spec stream 6):
  can_see_all = (categoria == 'diretor') OR (role IN ('owner', 'admin'))

UserScope é usado como FastAPI Depends em endpoints que filtram clientes/métricas.
Frontend consome via GET /me/scope (endpoint que serializa este dataclass).

Fallback de owner: emails em OWNER_FALLBACK_EMAILS (definidos em routes/colaboradores.py
pra evitar drift) sobem pra owner mesmo sem ficha em `colaboradores` — protege Pedro
caso registro seja deletado por engano.
"""
from dataclasses import dataclass, asdict
from typing import Optional

from fastapi import Depends

from deps import get_current_user, supabase_client

# Espelha OWNER_FALLBACK_EMAILS de routes/colaboradores.py.
# Hardcoded de propósito — match exato (não substring) pra robustez.
OWNER_FALLBACK_EMAILS = {"pedroaranda@grupoguglielmi.com"}


@dataclass(frozen=True)
class UserScope:
    user_id: str
    email: str
    can_see_all: bool
    consultor_id: Optional[str]
    consultor_nome: Optional[str]
    categoria: Optional[str]   # 'consultor' | 'diretor' | None
    role: Optional[str]        # 'owner' | 'admin' | 'member' | None

    def to_dict(self) -> dict:
        return asdict(self)


def _is_owner_fallback(email: str) -> bool:
    """Pedro hardcoded como owner caso ficha tenha sido deletada."""
    return (email or "").strip().lower() in OWNER_FALLBACK_EMAILS


async def get_user_scope(user=Depends(get_current_user)) -> UserScope:
    """
    Resolve o scope de permissão do usuário autenticado.

    1. Lookup colaboradores por email (ativo=true)
    2. can_see_all = (categoria='diretor') OR (role IN ('owner', 'admin'))
    3. Edge case: sem ficha + email em OWNER_FALLBACK_EMAILS → owner
    4. Edge case: sem ficha + sem fallback → can_see_all=False, consultor_id=None
       (vê NADA — lista vazia em /clientes)
    """
    email = (user.email or "").strip().lower()
    user_id = getattr(user, "id", "") or ""

    # Lookup colaborador
    resp = (
        supabase_client.table("colaboradores")
        .select("id, nome, email, categoria, role")
        .eq("email", email)
        .eq("ativo", True)
        .maybe_single()
        .execute()
    )
    row = resp.data if resp else None

    if row is None:
        # Sem ficha — tenta fallback de owner
        if _is_owner_fallback(email):
            return UserScope(
                user_id=user_id,
                email=email,
                can_see_all=True,
                consultor_id=None,
                consultor_nome=None,
                categoria=None,
                role="owner",
            )
        # User externo / não cadastrado: não vê nada
        return UserScope(
            user_id=user_id,
            email=email,
            can_see_all=False,
            consultor_id=None,
            consultor_nome=None,
            categoria=None,
            role=None,
        )

    categoria = row.get("categoria")
    role = row.get("role") or "member"
    can_see_all = (categoria == "diretor") or (role in ("owner", "admin"))

    return UserScope(
        user_id=user_id,
        email=email,
        can_see_all=can_see_all,
        consultor_id=row.get("id"),
        consultor_nome=row.get("nome"),
        categoria=categoria,
        role=role,
    )
```

- [ ] **Step 5: Rodar tests, todos passam**

Run: `cd backend && python3 -m pytest tests/test_auth_scope.py -v 2>&1 | tail -15`
Expected: `6 passed`

- [ ] **Step 6: Validar syntax do backend completo**

Run: `cd backend && python3 -m py_compile lib/auth_scope.py && echo OK`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/lib/__init__.py backend/lib/auth_scope.py backend/tests/test_auth_scope.py
git commit -m "feat(backend): auth_scope module com UserScope + get_user_scope dependency"
```

---

## Task 3: Endpoint GET /me/scope (frontend consome via useUserScope)

**Files:**
- Create: `backend/routes/me.py`
- Modify: `backend/main.py` (registra router)
- Create: `backend/tests/test_me_scope.py`

- [ ] **Step 1: Escrever test primeiro**

```python
"""Tests pro endpoint GET /me/scope.

Endpoint serializa o UserScope pra frontend consumir via useUserScope hook.
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


def test_me_scope_consultor(mock_supabase):
    """Consultor regular recebe scope com can_see_all=False."""
    from main import app

    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-lucas", "nome": "Lucas Nery", "email": "lucasnery@grupoguglielmi.com",
              "categoria": "consultor", "role": "member"}
    )

    with patch("deps.supabase_client.auth.get_user") as mock_auth:
        mock_auth.return_value = MagicMock(user=MagicMock(
            id="00000000-0000-0000-0000-000000000001",
            email="lucasnery@grupoguglielmi.com"
        ))
        client = TestClient(app)
        resp = client.get("/me/scope", headers={"Authorization": "Bearer faketoken"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["can_see_all"] is False
    assert body["consultor_id"] == "id-lucas"
    assert body["consultor_nome"] == "Lucas Nery"
    assert body["categoria"] == "consultor"
    assert body["role"] == "member"


def test_me_scope_admin(mock_supabase):
    """Admin recebe scope com can_see_all=True."""
    from main import app

    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data={"id": "id-admin", "nome": "Admin", "email": "admin@grupoguglielmi.com",
              "categoria": "consultor", "role": "admin"}
    )

    with patch("deps.supabase_client.auth.get_user") as mock_auth:
        mock_auth.return_value = MagicMock(user=MagicMock(
            id="00000000-0000-0000-0000-000000000002",
            email="admin@grupoguglielmi.com"
        ))
        client = TestClient(app)
        resp = client.get("/me/scope", headers={"Authorization": "Bearer faketoken"})

    assert resp.status_code == 200
    assert resp.json()["can_see_all"] is True


def test_me_scope_unauthenticated():
    """Sem Authorization header → 422 (FastAPI required header)."""
    from main import app
    client = TestClient(app)
    resp = client.get("/me/scope")
    assert resp.status_code == 422  # missing Authorization header
```

- [ ] **Step 2: Rodar test, falha (rota não existe)**

Run: `cd backend && python3 -m pytest tests/test_me_scope.py -v 2>&1 | tail -20`
Expected: 404 Not Found ou ModuleNotFoundError

- [ ] **Step 3: Criar routes/me.py**

```python
"""
Endpoint /me/scope — frontend consome via useUserScope hook pra saber
canSeeAll + myConsultorId + myConsultorNome (single source-of-truth).
"""
from fastapi import APIRouter, Depends

from lib.auth_scope import UserScope, get_user_scope

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/scope")
async def get_scope(scope: UserScope = Depends(get_user_scope)) -> dict:
    """Retorna o UserScope serializado pro frontend."""
    return scope.to_dict()
```

- [ ] **Step 4: Registrar router em main.py**

Procure pelo bloco onde outros routers são incluídos (`app.include_router(...)`).

```python
# Adicionar no topo dos imports:
from routes import me as me_router_module

# Adicionar perto dos outros include_router (no mesmo bloco):
app.include_router(me_router_module.router)
```

Run: `cd backend && grep -n "include_router" main.py | head -5`
Use o output pra escolher local correto. Adicione `app.include_router(me_router_module.router)` na sequência dos outros.

- [ ] **Step 5: Rodar test**

Run: `cd backend && python3 -m pytest tests/test_me_scope.py -v 2>&1 | tail -15`
Expected: `3 passed`

- [ ] **Step 6: Validar imports do main.py**

Run: `cd backend && python3 -m py_compile main.py && echo OK`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/routes/me.py backend/main.py backend/tests/test_me_scope.py
git commit -m "feat(backend): endpoint GET /me/scope retornando UserScope serializado"
```

---

## Task 4: Filtros de auth em /clientes (list, get, create, update)

**Files:**
- Modify: `backend/main.py` (linhas ~371-407)
- Create: `backend/tests/test_clientes_auth.py`

- [ ] **Step 1: Escrever tests primeiro**

```python
"""Tests pra filtragem de /clientes baseada em UserScope."""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


def _setup_auth(mock_supabase, user_email, colaborador_row):
    """Helper pra mockar auth + lookup colaboradores."""
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data=colaborador_row
    )
    return patch("deps.supabase_client.auth.get_user", return_value=MagicMock(
        user=MagicMock(id="user-id", email=user_email)
    ))


def test_list_clientes_consultor_filtra_proprio(mock_supabase):
    """Consultor recebe só clientes onde consultor_id == self.id."""
    from main import app

    # Setup auth: Lucas é consultor
    _setup_auth(mock_supabase, "lucasnery@grupoguglielmi.com", {
        "id": "lucas-id", "nome": "Lucas Nery", "email": "lucasnery@grupoguglielmi.com",
        "categoria": "consultor", "role": "member"
    }).__enter__()

    # Setup retorno de clientes (configurado depois do auth-lookup)
    # Cada chamada execute() retorna o próximo MagicMock da lista
    mock_supabase.table().select().eq().order().execute.return_value = MagicMock(data=[
        {"id": "c1", "nome": "Cliente do Lucas", "consultor_id": "lucas-id"},
    ])

    client = TestClient(app)
    resp = client.get("/clientes", headers={"Authorization": "Bearer t"})

    assert resp.status_code == 200
    # Verifica que .eq("consultor_id", "lucas-id") foi chamado
    call_args_list = mock_supabase.table().select().eq.call_args_list
    consultor_id_eq_calls = [c for c in call_args_list if c.args[0] == "consultor_id" and c.args[1] == "lucas-id"]
    assert len(consultor_id_eq_calls) >= 1, "Esperado filtro WHERE consultor_id = lucas-id"


def test_list_clientes_admin_ve_todos(mock_supabase):
    """Admin sem ?consultor_id retorna todos."""
    from main import app

    _setup_auth(mock_supabase, "admin@grupoguglielmi.com", {
        "id": "admin-id", "nome": "Admin", "email": "admin@grupoguglielmi.com",
        "categoria": "consultor", "role": "admin"
    }).__enter__()

    mock_supabase.table().select().order().execute.return_value = MagicMock(data=[
        {"id": "c1", "nome": "A"}, {"id": "c2", "nome": "B"},
    ])

    client = TestClient(app)
    resp = client.get("/clientes", headers={"Authorization": "Bearer t"})
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_list_clientes_admin_com_query_consultor_id_filtra(mock_supabase):
    """Admin com ?consultor_id=X filtra por consultor."""
    from main import app

    _setup_auth(mock_supabase, "admin@grupoguglielmi.com", {
        "id": "admin-id", "nome": "Admin", "email": "admin@grupoguglielmi.com",
        "categoria": "consultor", "role": "admin"
    }).__enter__()

    mock_supabase.table().select().eq().order().execute.return_value = MagicMock(data=[])

    client = TestClient(app)
    resp = client.get("/clientes?consultor_id=lucas-id", headers={"Authorization": "Bearer t"})
    assert resp.status_code == 200
    # Confirma que .eq("consultor_id", "lucas-id") foi chamado
    call_args_list = mock_supabase.table().select().eq.call_args_list
    consultor_id_eq_calls = [c for c in call_args_list if c.args[0] == "consultor_id" and c.args[1] == "lucas-id"]
    assert len(consultor_id_eq_calls) >= 1


def test_get_cliente_consultor_403_em_cliente_alheio(mock_supabase):
    """Consultor tentando GET /clientes/{id} de cliente alheio → 403."""
    from main import app

    _setup_auth(mock_supabase, "lucasnery@grupoguglielmi.com", {
        "id": "lucas-id", "nome": "Lucas Nery", "email": "lucasnery@grupoguglielmi.com",
        "categoria": "consultor", "role": "member"
    }).__enter__()

    # Cliente alheio (consultor_id != lucas-id)
    mock_supabase.table().select().eq().single().execute.return_value = MagicMock(
        data={"id": "outro-cliente", "nome": "X", "consultor_id": "outro-consultor-id"}
    )

    client = TestClient(app)
    resp = client.get("/clientes/outro-cliente", headers={"Authorization": "Bearer t"})
    assert resp.status_code == 403


def test_post_cliente_consultor_forca_self_consultor_id(mock_supabase):
    """Consultor POSTando cliente com consultor_id=outro → cria com self."""
    from main import app

    _setup_auth(mock_supabase, "lucasnery@grupoguglielmi.com", {
        "id": "lucas-id", "nome": "Lucas Nery", "email": "lucasnery@grupoguglielmi.com",
        "categoria": "consultor", "role": "member"
    }).__enter__()

    mock_supabase.table().insert().execute.return_value = MagicMock(data=[
        {"id": "new-id", "nome": "Novo Cliente", "consultor_id": "lucas-id"}
    ])

    client = TestClient(app)
    resp = client.post("/clientes",
                       json={"nome": "Novo Cliente", "consultor_id": "outro-id"},
                       headers={"Authorization": "Bearer t"})
    assert resp.status_code == 200
    # Confirma que insert foi com consultor_id=lucas-id (não outro-id)
    insert_args = mock_supabase.table().insert.call_args
    assert insert_args.args[0]["consultor_id"] == "lucas-id"
```

- [ ] **Step 2: Rodar tests pra ver quais falham**

Run: `cd backend && python3 -m pytest tests/test_clientes_auth.py -v 2>&1 | tail -20`
Expected: maioria falha (endpoint atual não filtra)

- [ ] **Step 3: Substituir os endpoints /clientes em main.py**

Localize as funções `list_clientes`, `get_cliente`, `create_cliente`, `update_cliente` (em torno da linha 371). Substitua o bloco INTEIRO por:

```python
# ─── Clientes API ─────────────────────────────────────────────────────────────
@app.get("/clientes")
async def list_clientes(
    consultor_id: str | None = None,
    scope: UserScope = Depends(get_user_scope),
):
    """
    Lista clientes filtrando por scope:
      - can_see_all=True: retorna todos (admin/diretor/owner). Aceita ?consultor_id=X pra filtrar.
      - can_see_all=False: força WHERE consultor_id = scope.consultor_id (ignora query param).
    """
    query = _supabase.table("clientes").select(
        "id, nome, empresa, consultor_responsavel, consultor_id, "
        "encontro_atual, status, updated_at, created_at"
    )

    if not scope.can_see_all:
        # Consultor regular — força filtro pelo próprio id
        if scope.consultor_id is None:
            # User sem ficha + sem fallback → não vê nada
            return []
        query = query.eq("consultor_id", scope.consultor_id)
    elif consultor_id:
        # Admin/diretor com filtro explícito pelo dropdown
        query = query.eq("consultor_id", consultor_id)

    result = query.order("created_at", desc=True).execute()
    return result.data


@app.get("/clientes/{client_id}")
async def get_cliente(client_id: str, scope: UserScope = Depends(get_user_scope)):
    result = _supabase.table("clientes").select("*").eq("id", client_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    # Auth: consultor regular só acessa seus clientes
    if not scope.can_see_all and result.data.get("consultor_id") != scope.consultor_id:
        raise HTTPException(status_code=403, detail="Sem acesso a esse cliente")

    # Buscar encontros realizados
    encontros = _supabase.table("encontros_realizados").select("*").eq(
        "cliente_id", client_id
    ).order("encontro_numero").execute()
    result.data["encontros_realizados"] = encontros.data or []
    return result.data


@app.post("/clientes")
async def create_cliente(data: dict, scope: UserScope = Depends(get_user_scope)):
    # Consultor regular: força consultor_id = self (ignora payload pra evitar bypass)
    if not scope.can_see_all:
        if scope.consultor_id is None:
            raise HTTPException(status_code=403, detail="Usuário sem ficha de colaborador — peça pra um admin criar")
        data = {**data, "consultor_id": scope.consultor_id}
    # Admin/diretor: aceita consultor_id do payload (pode atribuir a qualquer um)
    result = _supabase.table("clientes").insert(data).execute()
    return result.data[0]


@app.patch("/clientes/{client_id}")
async def update_cliente(
    client_id: str,
    data: dict,
    scope: UserScope = Depends(get_user_scope),
):
    # Carrega cliente atual pra validar ownership
    existing = _supabase.table("clientes").select("consultor_id").eq("id", client_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    if not scope.can_see_all:
        # Consultor regular: só edita os seus + não pode mudar consultor_id
        if existing.data.get("consultor_id") != scope.consultor_id:
            raise HTTPException(status_code=403, detail="Sem acesso a esse cliente")
        data = {k: v for k, v in data.items() if k != "consultor_id"}

    try:
        result = _supabase.table("clientes").update(data).eq("id", client_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar cliente: {e}")
    if not result.data:
        raise HTTPException(status_code=404, detail="Cliente não encontrado ou sem permissão")
    return result.data[0]
```

Adicionar imports no topo do main.py (perto dos outros `from`):

```python
from lib.auth_scope import UserScope, get_user_scope
```

- [ ] **Step 4: Rodar tests, todos passam**

Run: `cd backend && python3 -m pytest tests/test_clientes_auth.py -v 2>&1 | tail -15`
Expected: `5 passed`

- [ ] **Step 5: Validar main.py syntax**

Run: `cd backend && python3 -m py_compile main.py && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/test_clientes_auth.py
git commit -m "feat(backend): filtros de auth em /clientes baseados em UserScope"
```

---

## Task 5: Filtros de auth em /metricas (ranking + overview)

**Files:**
- Modify: `backend/routes/metricas.py` (linhas ~294-376 e ~380-459)
- Create: `backend/tests/test_metricas_auth.py`

- [ ] **Step 1: Escrever tests primeiro**

```python
"""Tests pra filtragem de /metricas baseada em UserScope."""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


def _setup_auth(mock_supabase, user_email, colaborador_row):
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data=colaborador_row
    )
    return patch("deps.supabase_client.auth.get_user", return_value=MagicMock(
        user=MagicMock(id="user-id", email=user_email)
    ))


def test_ranking_consultor_filtra_proprio(mock_supabase):
    """Consultor recebe ranking só dos próprios clientes."""
    from main import app

    _setup_auth(mock_supabase, "lucasnery@grupoguglielmi.com", {
        "id": "lucas-id", "nome": "Lucas Nery", "email": "lucasnery@grupoguglielmi.com",
        "categoria": "consultor", "role": "member"
    }).__enter__()

    mock_supabase.table().select().eq().order().execute.return_value = MagicMock(data=[])

    client = TestClient(app)
    resp = client.get("/metricas/ranking?plataforma=instagram",
                      headers={"Authorization": "Bearer t"})
    assert resp.status_code == 200
    # Confirma que .eq("consultor_id", "lucas-id") foi chamado
    call_args_list = mock_supabase.table().select().eq.call_args_list
    consultor_id_eq_calls = [c for c in call_args_list if c.args[0] == "consultor_id" and c.args[1] == "lucas-id"]
    assert len(consultor_id_eq_calls) >= 1


def test_overview_consultor_403_cliente_alheio(mock_supabase):
    """Consultor → GET /metricas/{id_alheio}/overview → 403."""
    from main import app

    _setup_auth(mock_supabase, "lucasnery@grupoguglielmi.com", {
        "id": "lucas-id", "nome": "Lucas Nery", "email": "lucasnery@grupoguglielmi.com",
        "categoria": "consultor", "role": "member"
    }).__enter__()

    # Cliente alheio
    mock_supabase.table().select().eq().single().execute.return_value = MagicMock(
        data={"id": "outro", "nome": "Cliente Alheio", "consultor_id": "outro-id"}
    )

    client = TestClient(app)
    resp = client.get("/metricas/outro/overview", headers={"Authorization": "Bearer t"})
    assert resp.status_code == 403
    assert "Sem acesso" in resp.json()["detail"]
```

- [ ] **Step 2: Rodar tests pra ver falhar**

Run: `cd backend && python3 -m pytest tests/test_metricas_auth.py -v 2>&1 | tail -15`
Expected: tests falham (sem filtragem hoje)

- [ ] **Step 3: Modificar /metricas/ranking em routes/metricas.py**

Localize a função `get_ranking` (linha ~294). Adicione `scope` no `Depends`, e filtre query de clientes:

```python
# Adicionar import no topo do arquivo:
from lib.auth_scope import UserScope, get_user_scope

# Substituir a função get_ranking (mantém corpo, só muda assinatura + query inicial):
@router.get("/ranking")
async def get_ranking(
    plataforma: str = "instagram",
    scope: UserScope = Depends(get_user_scope),
):
    repo = _get_repo(plataforma, None)

    # Filtra clientes por scope: consultor regular só vê os seus
    clientes_query = _supabase.table("clientes").select(
        "id, nome, empresa, consultor_responsavel, consultor_id, encontro_atual"
    )
    if not scope.can_see_all:
        if scope.consultor_id is None:
            return {"ranking": [], "total": 0, "plataforma": plataforma}
        clientes_query = clientes_query.eq("consultor_id", scope.consultor_id)
    clientes = clientes_query.order("nome").execute()

    # (resto do corpo da função permanece IDÊNTICO — não tocar a partir daqui)
    # Última data de post por cliente (pra calcular dias_sem_postar)
    # ...
```

Mantenha TODO o resto da função inalterado.

- [ ] **Step 4: Modificar /metricas/{cliente_id}/overview**

Localize `get_overview` (linha ~380). Adicione scope check no topo:

```python
@router.get("/{cliente_id}/overview")
async def get_overview(
    cliente_id: str,
    plataforma: str = "instagram",
    dias: int = 30,
    tipo: str = "all",
    scope: UserScope = Depends(get_user_scope),
):
    # Auth: consultor regular só acessa overview dos próprios clientes
    if not scope.can_see_all:
        cliente_auth = _supabase.table("clientes").select("consultor_id").eq(
            "id", cliente_id
        ).single().execute()
        if not cliente_auth.data:
            raise HTTPException(404, "Cliente não encontrado")
        if cliente_auth.data.get("consultor_id") != scope.consultor_id:
            raise HTTPException(403, "Sem acesso a esse cliente")

    # (resto do corpo permanece IDÊNTICO)
    if dias < 1 or dias > 365:
        raise HTTPException(400, "dias deve estar entre 1 e 365")
    # ...
```

Mantenha TODO o resto da função.

- [ ] **Step 5: Rodar tests, todos passam**

Run: `cd backend && python3 -m pytest tests/test_metricas_auth.py -v 2>&1 | tail -15`
Expected: `2 passed`

- [ ] **Step 6: Validar syntax**

Run: `cd backend && python3 -m py_compile routes/metricas.py && echo OK`
Expected: `OK`

- [ ] **Step 7: Rodar suite completa de testes auth**

Run: `cd backend && python3 -m pytest tests/ -v 2>&1 | tail -15`
Expected: todos os testes anteriores + novos passam

- [ ] **Step 8: Commit**

```bash
git add backend/routes/metricas.py backend/tests/test_metricas_auth.py
git commit -m "feat(backend): filtros de auth em /metricas/ranking e /metricas/{id}/overview"
```

---

## Task 6: Hook frontend useUserScope

**Files:**
- Create: `frontend/src/hooks/useUserScope.js`

- [ ] **Step 1: Verificar se pasta hooks existe**

Run: `ls frontend/src/hooks/ 2>&1`
Expected: lista existente ou "No such file" (crie a pasta se preciso)

- [ ] **Step 2: Criar useUserScope.js**

```javascript
/**
 * useUserScope — single source-of-truth pra permissionamento no frontend.
 *
 * Chama GET /me/scope que retorna o UserScope autoritativo do backend
 * (categoria + role + consultor_id + can_see_all). Substitui chutes locais
 * tipo `email.split('@')[0]` que eram frágeis.
 *
 * Uso típico:
 *   const { canSeeAll, myConsultorId, myConsultorNome, isLoading } = useUserScope()
 *   if (isLoading) return <SkeletonDropdown />
 *   {canSeeAll && <ConsultorFilter ... />}
 *
 * Fail-safe: se /me/scope falha, retorna canSeeAll=false (modo restritivo)
 * pra não vazar acidentalmente.
 */
import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'

export function useUserScope() {
  const [state, setState] = useState({
    canSeeAll: false,
    myConsultorId: null,
    myConsultorNome: null,
    categoria: null,
    role: null,
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    apiGet('/me/scope')
      .then((scope) => {
        if (cancelled) return
        setState({
          canSeeAll: scope.can_see_all === true,
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

- [ ] **Step 3: Confirmar que apiGet existe em lib/api.js**

Run: `grep -n "export.*apiGet\|export.*async function apiGet" frontend/src/lib/api.js`
Expected: linha com `apiGet` export

Se não existir, ajustar import pra função equivalente que existe (provavelmente `api.get` ou similar). Em projeto FLG já existe `apiStreamGet` — `apiGet` deve estar lá perto.

- [ ] **Step 4: Validar JSX/JS syntax**

Run: `cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/hooks/useUserScope.js > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useUserScope.js
git commit -m "feat(frontend): hook useUserScope consumindo GET /me/scope"
```

---

## Task 7: Refactor Clientes.jsx (remove filtro client-side por email-split, usa hook)

**Files:**
- Modify: `frontend/src/components/Clientes.jsx` (linhas 300-324 + import)

- [ ] **Step 1: Adicionar import do hook**

No topo do `frontend/src/components/Clientes.jsx`, adicionar:

```javascript
import { useUserScope } from '../hooks/useUserScope'
```

- [ ] **Step 2: Substituir lógica de filtro (linhas 300-324)**

Localize o bloco `export default function Clientes({ session })`. Substituir o início inteiro (até o `useMemo` de `filtered`) por:

```javascript
export default function Clientes({ session }) {
  const { clientes: allClientes, loading } = useApp()
  const navigate = useNavigate()

  const [search, setSearch]                   = useState('')
  const [filterStatus, setFilterStatus]       = useState('todos')
  const [filterConsultor, setFilterConsultor] = useState('todos')
  const [viewMode, setViewMode]               = useState('cards') // 'cards' | 'table'

  // Permissionamento: source-of-truth vem do backend via /me/scope.
  // canSeeAll=true → vê todos + dropdown ativo; false → backend já filtrou pra mostrar só os seus.
  const { canSeeAll, myConsultorNome, isLoading: scopeLoading } = useUserScope()

  // Lista de consultores no dropdown — só clientes com consultor_responsavel definido.
  const consultores = useMemo(
    () => [...new Set(allClientes.map(c => c.consultor_responsavel).filter(Boolean))],
    [allClientes]
  )

  const filtered = useMemo(() => allClientes.filter(c => {
    const matchSearch    = !search || c.nome?.toLowerCase().includes(search.toLowerCase()) || c.empresa?.toLowerCase().includes(search.toLowerCase())
    const matchStatus    = filterStatus === 'todos' || (c.status || 'ativo') === filterStatus
    // Dropdown de consultor só é exposto pra canSeeAll, mas matchConsultor é
    // sempre aplicado pra não vazar caso 'todos' não esteja selecionado.
    const matchConsultor = filterConsultor === 'todos' || c.consultor_responsavel === filterConsultor
    // matchOwner REMOVIDO: backend já filtra. Frontend confia em allClientes.
    return matchSearch && matchStatus && matchConsultor
  }), [allClientes, search, filterStatus, filterConsultor])
```

- [ ] **Step 3: Substituir referências a `isAdmin` no JSX restante**

Procure por `isAdmin` no resto do arquivo:

Run: `grep -n "isAdmin" frontend/src/components/Clientes.jsx`

Substitua **cada ocorrência de `isAdmin`** por `canSeeAll`. Exemplos:
- Header: `{isAdmin ? 'Todos os Clientes' : 'Meus Clientes'}` → `{canSeeAll ? 'Todos os Clientes' : 'Meus Clientes'}`
- Botão Novo Cliente: `{isAdmin && (...)}` → `{canSeeAll && (...)}`
- Dropdown ConsultorFilter (se existir): só renderiza se `canSeeAll`

- [ ] **Step 4: Loading state pro scope**

No render, antes do return principal, adicionar:

```javascript
if (scopeLoading) {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="animate-pulse text-white/30 text-sm">Carregando permissões…</div>
    </div>
  )
}
```

- [ ] **Step 5: Remover import obsoleto se houver**

`checkAdmin` pode ainda estar importado — remove se não é mais usado.

Run: `grep -n "checkAdmin" frontend/src/components/Clientes.jsx`
Se vazio, remover o import correspondente no topo do arquivo.

- [ ] **Step 6: Validar syntax**

Run: `cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Clientes.jsx > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Clientes.jsx
git commit -m "refactor(clientes): usa useUserScope; remove filtro client-side por email-split"
```

---

## Task 8: Refactor telas Métricas pra usar useUserScope + handle 403

**Files:**
- Modify: `frontend/src/components/Ranking/RankingClientes.jsx` (ou similar — descobrir)
- Modify: telas que consomem `/metricas/{cliente_id}/overview`

- [ ] **Step 1: Localizar telas afetadas**

Run: `cd frontend/src/components && grep -rln "metricas/.*overview\|metricas/ranking" --include="*.jsx" | head`

Reporta paths exatos das telas que chamam essas rotas. Use os paths reais nos próximos steps.

- [ ] **Step 2: Em cada tela de ranking, adicionar useUserScope + esconder ConsultorFilter pra !canSeeAll**

Padrão:

```javascript
import { useUserScope } from '../../hooks/useUserScope'

// Dentro do componente:
const { canSeeAll, isLoading: scopeLoading } = useUserScope()

// Loading skeleton:
if (scopeLoading) return <div className="animate-pulse text-white/30 text-sm">Carregando…</div>

// JSX:
{canSeeAll && <ConsultorFilter ... />}
```

(Use caminhos reais dos imports baseado em onde a tela está aninhada.)

- [ ] **Step 3: Em tela de overview por cliente, handle 403 com EmptyState**

Quando a fetch de overview falhar com 403, mostrar mensagem amigável:

```javascript
// Onde a fetch é feita (provavelmente useEffect ou função async):
try {
  const data = await apiGet(`/metricas/${clienteId}/overview`)
  setOverview(data)
} catch (err) {
  if (err?.status === 403) {
    setForbidden(true)
  } else {
    setError(err.message)
  }
}

// No render:
if (forbidden) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <div className="text-white/40 text-sm">Você não tem acesso às métricas desse cliente.</div>
      <button onClick={() => navigate(-1)} className="btn-gold">Voltar</button>
    </div>
  )
}
```

(Adaptar ao padrão de error handling do componente real.)

- [ ] **Step 4: Validar syntax de cada arquivo modificado**

Run pra cada arquivo:
```
cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx <path> > /dev/null && echo OK
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/<paths modificados>
git commit -m "refactor(metricas): usa useUserScope; handle 403 com empty state"
```

---

## Task 9: Refactor Dashboard.jsx pra usar useUserScope (limpeza oportuna)

**Files:**
- Modify: `frontend/src/components/Dashboard.jsx` (linhas 56-69 + uso de myConsultorNome)

- [ ] **Step 1: Ler o bloco atual (linhas 56-69)**

Run: `sed -n '50,75p' frontend/src/components/Dashboard.jsx`

Observe a função `findMyConsultorName` ou similar.

- [ ] **Step 2: Substituir lógica local pelo hook**

Adicionar import:
```javascript
import { useUserScope } from '../hooks/useUserScope'
```

Remover o bloco que computa `myConsultorNome` localmente (linhas ~56-69). Substituir por:

```javascript
const { canSeeAll, myConsultorNome, isLoading: scopeLoading } = useUserScope()
```

Substituir referências a `isAdminFromSession(session)` por `canSeeAll` no restante do componente.

Substituir variável local antiga por `myConsultorNome` do hook (deve ter o mesmo nome — verifique).

- [ ] **Step 3: Loading state**

Antes do return principal:
```javascript
if (scopeLoading) {
  return <div className="p-6 animate-pulse text-white/30 text-sm">Carregando…</div>
}
```

- [ ] **Step 4: Validar syntax**

Run: `cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Dashboard.jsx > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard.jsx
git commit -m "refactor(dashboard): usa useUserScope (single source-of-truth de permissão)"
```

---

## Task 10: NovoCliente.jsx — campo consultor com select pra admin/diretor

**Files:**
- Modify: `frontend/src/components/NovoCliente.jsx`

- [ ] **Step 1: Ler o estado atual do componente**

Run: `wc -l frontend/src/components/NovoCliente.jsx && head -40 frontend/src/components/NovoCliente.jsx`

Identifica campo `consultor_responsavel` (provavelmente um input text livre).

- [ ] **Step 2: Adicionar fetch de colaboradores ativos**

No topo do componente:
```javascript
import { useUserScope } from '../hooks/useUserScope'
import { apiGet } from '../lib/api'
import { useEffect, useState } from 'react'

// Dentro do componente:
const { canSeeAll, myConsultorId, myConsultorNome } = useUserScope()
const [colaboradores, setColaboradores] = useState([])

useEffect(() => {
  if (!canSeeAll) return  // consultor regular não precisa da lista
  apiGet('/colaboradores?categoria=consultor&ativo=true')
    .then(setColaboradores)
    .catch(() => setColaboradores([]))
}, [canSeeAll])
```

- [ ] **Step 3: Trocar input text por select condicional**

Encontre o campo `consultor_responsavel`. Substituir por:

```jsx
{canSeeAll ? (
  <select
    value={form.consultor_id || ''}
    onChange={e => {
      const id = e.target.value
      const col = colaboradores.find(c => c.id === id)
      setForm({
        ...form,
        consultor_id: id || null,
        consultor_responsavel: col?.nome || '',  // mantém compat enquanto coluna não é dropada
      })
    }}
    className="..."  // mesma classe do input atual
  >
    <option value="">— Sem consultor —</option>
    {colaboradores.map(c => (
      <option key={c.id} value={c.id}>{c.nome}</option>
    ))}
  </select>
) : (
  // Consultor regular: campo readonly mostrando o próprio
  <input
    type="text"
    value={myConsultorNome || '(você)'}
    readOnly
    className="... opacity-60"
  />
)}
```

- [ ] **Step 4: No submit, garantir que consultor_id é enviado**

Confirma que o `apiPost('/clientes', form)` envia `consultor_id` no payload. Backend Task 4 já valida + força self pra consultor.

- [ ] **Step 5: Validar syntax**

Run: `cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/NovoCliente.jsx > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/NovoCliente.jsx
git commit -m "feat(clientes): campo consultor vira select pra admin; readonly pra consultor"
```

---

## Task 11: Verificação manual end-to-end

**Files:** nenhum

- [ ] **Step 1: Aguardar deploy do último commit passar**

Run: `gh run list --workflow=deploy.yml --limit=1 --json status,headSha`
Expected: status=completed, headSha=último commit

- [ ] **Step 2: Smoke test manual — consultor (peça pro Pedro logar como Lucas/outro consultor)**

Checklist:
- [ ] `/clientes` mostra só clientes do consultor logado
- [ ] Dropdown "Todos os consultores" NÃO aparece
- [ ] Tentar acessar `/clientes/{id_alheio}/metricas` direto na URL → tela "Sem acesso"
- [ ] Header diz "Meus Clientes" (não "Todos os Clientes")

- [ ] **Step 3: Smoke test manual — admin/Pedro**

Checklist:
- [ ] `/clientes` mostra TODOS
- [ ] Dropdown ConsultorFilter ativo
- [ ] Filtrar por consultor X → mostra só X
- [ ] Header diz "Todos os Clientes"
- [ ] Novo Cliente: select de colaboradores aparece

- [ ] **Step 4: Inspeção Storage Debug (opcional, valida observabilidade)**

Sem aplicar — só confirmar que página de métricas/ranking carrega rápido pros dois casos.

---

## Task 12: Cleanup — remove filtro client-side residual (defer ~1-2 semanas)

**NOTA:** Esta task é DEFER. Aguardar 1-2 semanas em produção estável antes de executar pra confirmar zero relatos de "sumiu meu cliente". Backend já é autoritativo desde Task 4; este step só remove código duplicado.

**Files:**
- Modify: `frontend/src/components/Clientes.jsx` (eventual outros lugares com `email?.split('@')[0]`)

- [ ] **Step 1: Buscar referências restantes**

Run: `cd frontend/src && grep -rn "email?\.split('@')\[0\]" --include="*.jsx"`

- [ ] **Step 2: Remover cada referência se ainda existir**

Substitui pela confiança no backend (dados já vêm filtrados). Cada caso é manual — analisar antes.

- [ ] **Step 3: Validar syntax + smoke test rápido**

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(frontend): remove filtro residual por email-split — backend é autoritativo"
```

---

## Verificação de cobertura da spec

| Spec section | Task(s) que cobre |
|---|---|
| 2.1 Schema (migration 009) | Pré-requisito externo — aplicada por Pedro |
| 2.2 Regra de autorização | Task 2 (auth_scope) |
| 3.1 auth_scope.py module | Task 2 |
| 3.2 GET /me/scope | Task 3 |
| 3.3 Endpoints alterados | Tasks 4 (clientes) + 5 (métricas) |
| 3.4 Estratégia de testes | Tasks 1 (setup) + 2/3/4/5 (TDD por endpoint) |
| 4.1 useUserScope hook | Task 6 |
| 4.2 Telas alteradas | Tasks 7 (Clientes) + 8 (Métricas) + 10 (NovoCliente) |
| 4.3 UX details (loading, 403, badge) | Tasks 7/8/9 (loading), 8 (403), badge órfão TODO futuro |
| 5.1 Etapa 1 (schema) | Pré-requisito externo |
| 5.2 Etapa 2 (backend) | Tasks 1-5 |
| 5.3 Etapa 3 (frontend) | Tasks 6-10 |
| 5.4 Etapa 4 (cleanup) | Task 12 (defer) |
| Refactor Dashboard | Task 9 |
| Verificação end-to-end | Task 11 |
