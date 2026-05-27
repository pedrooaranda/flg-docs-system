# ClickUp Sync + Soft Delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar `services/clickup_sync.py` pra arquivar (soft delete) clientes com status terminal no ClickUp (encerrado/renovado/inativo) e filtrar archived dos endpoints `/clientes` + `/metricas/ranking`. Frontend mínimo: badge pausado + botão sync admin.

**Architecture:** Função pura `evaluate_lifecycle(situacao_raw) → (status_db, should_archive)` testável isolada. `run_clickup_sync` aplica decisão por task (archive/reativa/atualiza status). Endpoints adicionam `WHERE archived_at IS NULL` por default + admin override via `?include_archived=true`. Novo endpoint admin `POST /admin/clickup/sync` pra trigger manual.

**Tech Stack:** Python 3.12 + FastAPI 0.115+ + supabase-py + pytest+pytest-asyncio. React 18 + Vite + Tailwind + lucide-react.

**Spec:** [docs/superpowers/specs/2026-05-26-clickup-sync-archived-design.md](../specs/2026-05-26-clickup-sync-archived-design.md)

**Pré-requisito externo:** migration `docs/migrations/010-clientes-archived-at.sql` aplicada no Supabase Dashboard ANTES de mergear Task 2. Schema additive, zero impacto até Task 2.

---

## Task 1: evaluate_lifecycle pure function (TDD)

**Files:**
- Modify: `backend/services/clickup_sync.py` (adiciona função no topo, antes de run_clickup_sync)
- Create: `backend/tests/test_clickup_sync_lifecycle.py`

- [ ] **Step 1: Escrever tests primeiro**

```python
"""Tests pra evaluate_lifecycle — função pura que mapeia SITUAÇÃO do ClickUp
pra decisão de status_db + should_archive.

Regras da spec Stream 7:
  encerrado/renovado/inativo → ('concluido', True)  → archive
  em encerramento → ('ativo', False)  → visível (transitório)
  pausado → ('pausado', False) → visível com badge
  resto → ('ativo', False) → visível
"""
import pytest

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
```

- [ ] **Step 2: Rodar tests pra ver falhando**

Run: `cd backend && python3 -m pytest tests/test_clickup_sync_lifecycle.py -v 2>&1 | tail -10`
Expected: `ImportError: cannot import name 'evaluate_lifecycle'` ou similar

- [ ] **Step 3: Implementar evaluate_lifecycle**

Adicionar no topo de `backend/services/clickup_sync.py`, antes de `def run_clickup_sync()`:

```python
# ─── Lifecycle evaluation ─────────────────────────────────────────────────────
# Mapeia o custom field SITUAÇÃO do ClickUp pra decisão de status_db +
# should_archive. Regras documentadas na spec Stream 7
# (docs/superpowers/specs/2026-05-26-clickup-sync-archived-design.md).

# Status terminais — disparam archive (soft delete). Pedro: "encerrado/renovado/inativo"
_STATUS_TERMINAIS = ("encerrado", "renovado", "inativo")
# Status pausado — mantém visível com badge. "em pausa" cobre variação comum
_STATUS_PAUSADO_KEYWORDS = ("pausado", "em pausa")
# "Em Encerramento" é transitório — Pedro pediu pra MANTER visível
_STATUS_EM_ENCERRAMENTO_KEYWORDS = ("em encerramento", "em encerramento próximo")


def evaluate_lifecycle(situacao_raw):
    """
    Mapeia SITUAÇÃO do ClickUp pra (status_db, should_archive).

    Args:
        situacao_raw: valor do custom field SITUAÇÃO (string ou None)

    Returns:
        tuple (status_db, should_archive) onde:
          status_db: 'ativo' | 'pausado' | 'concluido'
          should_archive: True se cliente deve ser soft-deleted

    Regras (em ordem de precedência):
        1. 'em encerramento' (transitório) → ('ativo', False)
        2. 'encerrado' | 'renovado' | 'inativo' → ('concluido', True)
        3. 'pausado' | 'em pausa' → ('pausado', False)
        4. fallback (vazio/desconhecido/ativo/normal/etc) → ('ativo', False)
    """
    if not situacao_raw:
        return ("ativo", False)
    s = situacao_raw.strip().lower()

    # Em encerramento (transitório) ANTES de encerrado pra match mais específico
    for kw in _STATUS_EM_ENCERRAMENTO_KEYWORDS:
        if kw in s:
            return ("ativo", False)

    # Terminais → archive. Match palavra inteira pra "encerrado" não bater em "em encerramento"
    # (já tratado acima, mas defensivo)
    for terminal in _STATUS_TERMINAIS:
        if terminal in s and "em encerramento" not in s:
            return ("concluido", True)

    # Pausado
    for kw in _STATUS_PAUSADO_KEYWORDS:
        if kw in s:
            return ("pausado", False)

    # Fallback seguro
    return ("ativo", False)
```

- [ ] **Step 4: Rodar tests, todos passam**

Run: `cd backend && python3 -m pytest tests/test_clickup_sync_lifecycle.py -v 2>&1 | tail -25`
Expected: `20 passed`

- [ ] **Step 5: Validar syntax**

Run: `cd backend && python3 -m py_compile services/clickup_sync.py && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/services/clickup_sync.py backend/tests/test_clickup_sync_lifecycle.py
git commit -m "feat(clickup-sync): evaluate_lifecycle puro mapeando SITUAÇÃO pra archive/status"
```

---

## Task 2: run_clickup_sync ampliado (archive + reactivate)

**Files:**
- Modify: `backend/services/clickup_sync.py` (função `run_clickup_sync`)
- Create: `backend/tests/test_clickup_sync_runner.py`

- [ ] **Step 1: Escrever tests primeiro**

```python
"""Tests pro run_clickup_sync ampliado:
  - aplica archived_at quando status terminal
  - reativa (archived_at=NULL) quando ClickUp volta pra ativo/pausado
  - retorna stats {archived, reactivated, paused, ativos, errors, total, duration_ms}
"""
from unittest.mock import MagicMock, patch


def _make_task(name, situacao, clickup_task_id="task-1"):
    """Helper: monta task ClickUp com SITUAÇÃO no custom field."""
    return {
        "id": clickup_task_id,
        "name": name,
        "status": {"status": "open"},
        "assignees": [{"username": "consultor1"}],
        "custom_fields": [
            {"name": "SITUAÇÃO", "type": "drop_down", "value": 0,
             "type_config": {"options": [{"orderindex": "0", "name": situacao}]}}
        ],
    }


def test_run_sync_archives_encerrado(mock_supabase):
    """Task com SITUAÇÃO='Encerrado' deve setar archived_at."""
    from services import clickup_sync

    # Mock list_all_tasks pra retornar 1 task encerrada
    with patch.object(clickup_sync, "list_all_tasks", return_value=[
        _make_task("João Silva", "Encerrado", "task-joao")
    ]):
        # Cliente já existe no DB (sem archived_at)
        mock_supabase.table().select().eq().execute.return_value = MagicMock(data=[
            {"id": "cliente-joao", "archived_at": None}
        ])
        mock_supabase.table().update().eq().execute.return_value = MagicMock(data=[{"id": "cliente-joao"}])

        with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
            stats = clickup_sync.run_clickup_sync()

    assert stats["archived"] == 1
    assert stats["total"] == 1

    # Confirma que update chamado com archived_at=non-null
    update_calls = mock_supabase.table().update.call_args_list
    archive_calls = [c for c in update_calls if c.args[0].get("archived_at") is not None]
    assert len(archive_calls) >= 1


def test_run_sync_reactivates_when_back_to_ativo(mock_supabase):
    """Cliente archived recebe archived_at=None quando ClickUp volta pra ativo."""
    from services import clickup_sync

    with patch.object(clickup_sync, "list_all_tasks", return_value=[
        _make_task("Maria Santos", "Indo Bem", "task-maria")
    ]):
        # Cliente já existe no DB COM archived_at (foi archived antes)
        mock_supabase.table().select().eq().execute.return_value = MagicMock(data=[
            {"id": "cliente-maria", "archived_at": "2026-05-20T10:00:00Z"}
        ])
        mock_supabase.table().update().eq().execute.return_value = MagicMock(data=[{"id": "cliente-maria"}])

        with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
            stats = clickup_sync.run_clickup_sync()

    assert stats["reactivated"] == 1

    # Confirma update com archived_at=None
    update_calls = mock_supabase.table().update.call_args_list
    reactivate_calls = [c for c in update_calls if c.args[0].get("archived_at") is None and "archived_at" in c.args[0]]
    assert len(reactivate_calls) >= 1


def test_run_sync_returns_full_stats(mock_supabase):
    """Stats retornados incluem archived, reactivated, paused, ativos, errors, total, duration_ms."""
    from services import clickup_sync

    with patch.object(clickup_sync, "list_all_tasks", return_value=[]):
        with patch.dict("os.environ", {"CLICKUP_API_TOKEN": "fake-token"}):
            stats = clickup_sync.run_clickup_sync()

    expected_keys = {"archived", "reactivated", "paused", "ativos", "errors", "total", "duration_ms"}
    assert expected_keys.issubset(set(stats.keys()))
    assert stats["total"] == 0
    assert stats["duration_ms"] >= 0


def test_run_sync_no_token_returns_zero_stats(mock_supabase):
    """Sem CLICKUP_API_TOKEN, retorna stats vazios sem erro."""
    from services import clickup_sync

    with patch.dict("os.environ", {"CLICKUP_API_TOKEN": ""}, clear=False):
        stats = clickup_sync.run_clickup_sync()
    assert stats["total"] == 0
    assert stats["errors"] == 0
```

- [ ] **Step 2: Rodar tests pra ver falhando**

Run: `cd backend && python3 -m pytest tests/test_clickup_sync_runner.py -v 2>&1 | tail -15`
Expected: tests falham (stats não retornados, archived não setado)

- [ ] **Step 3: Modificar run_clickup_sync**

Substituir a função `run_clickup_sync` em `backend/services/clickup_sync.py` INTEIRA por:

```python
def run_clickup_sync():
    """
    Sync completo — chamado pelo APScheduler, no startup e via /admin/clickup/sync.
    Busca todas as tasks da List BS e aplica lifecycle por cliente:
      - status terminal (encerrado/renovado/inativo) → archived_at=now()
      - reativação (archived volta pra ativo/pausado) → archived_at=NULL
      - upsert normal com status atualizado

    Returns:
        dict com stats: archived, reactivated, paused, ativos, errors, total, duration_ms
    """
    from datetime import datetime, timezone
    from time import perf_counter
    from deps import supabase_client as sb

    started = perf_counter()
    stats = {
        "archived": 0, "reactivated": 0, "paused": 0, "ativos": 0,
        "errors": 0, "total": 0, "duration_ms": 0
    }

    token = os.getenv("CLICKUP_API_TOKEN", "")
    if not token:
        logger.warning("⚠️ CLICKUP_API_TOKEN não configurado — sync pulado")
        return stats

    logger.info("🔄 ClickUp sync iniciando...")

    try:
        tasks = list_all_tasks(LIST_CLIENTES_BS)
    except Exception as e:
        logger.error(f"❌ Erro ao buscar tasks do ClickUp: {e}")
        stats["errors"] = 1
        return stats

    stats["total"] = len(tasks)
    if not tasks:
        logger.info("Nenhuma task encontrada na List BS")
        return stats

    now_iso = datetime.now(timezone.utc).isoformat()

    for task in tasks:
        try:
            data = task_to_cliente_data(task)
            if not data.get("nome"):
                continue
            if data["nome"] in CLICKUP_BLOCKLIST:
                continue

            # Lifecycle decision baseado em situacao_clickup (preservada pelo task_to_cliente_data)
            situacao = data.pop("situacao_clickup", None)
            status_db, should_archive = evaluate_lifecycle(situacao)
            data["status"] = status_db  # sobrescreve mapping antigo do task_to_cliente_data

            # Empresa NOT NULL no Supabase — fallback pra nome
            if not data.get("empresa"):
                data["empresa"] = data["nome"]

            # Busca cliente existente (precisamos saber se já está archived pra detectar reativação)
            existing = sb.table("clientes").select("id, archived_at").eq(
                "clickup_task_id", data["clickup_task_id"]
            ).execute()

            if existing.data:
                cliente_id = existing.data[0]["id"]
                currently_archived = existing.data[0].get("archived_at") is not None

                update_payload = {k: v for k, v in data.items() if k != "nome" and v is not None}
                update_payload["status"] = status_db  # garante mesmo se v is None

                if should_archive and not currently_archived:
                    update_payload["archived_at"] = now_iso
                    stats["archived"] += 1
                    logger.info(f"🗄️ archived: {data['nome']} (situação: {situacao})")
                elif not should_archive and currently_archived:
                    update_payload["archived_at"] = None
                    stats["reactivated"] += 1
                    logger.info(f"↩️ reactivated: {data['nome']}")
                elif status_db == "pausado":
                    stats["paused"] += 1
                elif status_db == "ativo":
                    stats["ativos"] += 1

                sb.table("clientes").update(update_payload).eq(
                    "clickup_task_id", data["clickup_task_id"]
                ).execute()
            else:
                # Novo cliente: insere com archived_at correspondente
                if should_archive:
                    data["archived_at"] = now_iso
                    stats["archived"] += 1
                    logger.info(f"🗄️ archived (new): {data['nome']} (situação: {situacao})")
                elif status_db == "pausado":
                    stats["paused"] += 1
                else:
                    stats["ativos"] += 1
                sb.table("clientes").insert(data).execute()

        except Exception as e:
            stats["errors"] += 1
            logger.error(f"  Erro sync task '{task.get('name', '?')}': {e}")

    stats["duration_ms"] = int((perf_counter() - started) * 1000)
    logger.info(
        f"✅ ClickUp sync concluído em {stats['duration_ms']}ms — "
        f"archived: {stats['archived']}, reactivated: {stats['reactivated']}, "
        f"paused: {stats['paused']}, ativos: {stats['ativos']}, errors: {stats['errors']} "
        f"(total: {stats['total']} tasks)"
    )
    return stats
```

- [ ] **Step 4: Rodar tests, todos passam**

Run: `cd backend && python3 -m pytest tests/test_clickup_sync_runner.py -v 2>&1 | tail -15`
Expected: `4 passed`

- [ ] **Step 5: Rodar suite completa pra confirmar zero regressão**

Run: `cd backend && python3 -m pytest tests/ 2>&1 | tail -5`
Expected: `53 passed` (29 anteriores + 20 lifecycle + 4 runner)

- [ ] **Step 6: Commit**

```bash
git add backend/services/clickup_sync.py backend/tests/test_clickup_sync_runner.py
git commit -m "feat(clickup-sync): run_sync aplica archive/reactivate + retorna stats"
```

---

## Task 3: Filtro archived em /clientes e /metricas/ranking

**Files:**
- Modify: `backend/main.py` (função `list_clientes`)
- Modify: `backend/routes/metricas.py` (função `get_ranking`)
- Modify: `backend/tests/test_clientes_auth.py` (adicionar tests pra include_archived)

- [ ] **Step 1: Escrever tests primeiro (anexar ao test_clientes_auth.py existente)**

Adicionar no fim de `backend/tests/test_clientes_auth.py`:

```python
def test_list_clientes_filtra_archived_por_default(mock_supabase):
    """GET /clientes sem ?include_archived retorna só clientes com archived_at IS NULL."""
    from main import app

    _setup_auth(mock_supabase, "admin@grupoguglielmi.com", {
        "id": "admin-id", "nome": "Admin", "email": "admin@grupoguglielmi.com",
        "categoria": "consultor", "role": "admin"
    }).__enter__()

    mock_supabase.table().select().is_().order().execute.return_value = MagicMock(data=[])

    client = TestClient(app)
    resp = client.get("/clientes", headers={"Authorization": "Bearer t"})
    assert resp.status_code == 200

    # Confirma que .is_("archived_at", "null") foi chamado
    is_calls = mock_supabase.table().select().is_.call_args_list
    archived_filter_calls = [c for c in is_calls if c.args[0] == "archived_at" and c.args[1] == "null"]
    assert len(archived_filter_calls) >= 1, "Esperado filtro WHERE archived_at IS NULL"


def test_list_clientes_admin_include_archived_true_traz_tudo(mock_supabase):
    """Admin com ?include_archived=true retorna todos (sem filtro de archived)."""
    from main import app

    _setup_auth(mock_supabase, "admin@grupoguglielmi.com", {
        "id": "admin-id", "nome": "Admin", "email": "admin@grupoguglielmi.com",
        "categoria": "consultor", "role": "admin"
    }).__enter__()

    mock_supabase.table().select().order().execute.return_value = MagicMock(data=[])

    client = TestClient(app)
    resp = client.get("/clientes?include_archived=true", headers={"Authorization": "Bearer t"})
    assert resp.status_code == 200

    # is_("archived_at", "null") NÃO deve ser chamado quando include_archived=true
    is_calls = mock_supabase.table().select().is_.call_args_list
    archived_filter_calls = [c for c in is_calls if c.args[0] == "archived_at"]
    assert len(archived_filter_calls) == 0


def test_list_clientes_consultor_nao_pode_include_archived(mock_supabase):
    """Consultor regular: ?include_archived=true é ignorado (sempre filtra archived)."""
    from main import app

    _setup_auth(mock_supabase, "lucasnery@grupoguglielmi.com", {
        "id": "lucas-id", "nome": "Lucas Nery", "email": "lucasnery@grupoguglielmi.com",
        "categoria": "consultor", "role": "member"
    }).__enter__()

    mock_supabase.table().select().eq().is_().order().execute.return_value = MagicMock(data=[])

    client = TestClient(app)
    resp = client.get("/clientes?include_archived=true", headers={"Authorization": "Bearer t"})
    assert resp.status_code == 200

    # Filtro de archived deve ter sido aplicado mesmo com flag (ignored)
    is_calls = mock_supabase.table().select().eq().is_.call_args_list
    archived_filter_calls = [c for c in is_calls if c.args[0] == "archived_at" and c.args[1] == "null"]
    assert len(archived_filter_calls) >= 1
```

- [ ] **Step 2: Rodar tests pra ver falhando**

Run: `cd backend && python3 -m pytest tests/test_clientes_auth.py -v 2>&1 | tail -15`
Expected: 3 novos tests falham

- [ ] **Step 3: Modificar list_clientes em main.py**

Localizar `async def list_clientes(...)` em `backend/main.py` (atualmente após auth_scope import). Substituir corpo INTEIRO:

```python
@app.get("/clientes")
async def list_clientes(
    consultor_id: Optional[str] = None,
    include_archived: bool = False,
    scope: UserScope = Depends(get_user_scope),
):
    """
    Lista clientes filtrando por scope + archived_at:
      - can_see_all=False (consultor regular): força consultor_id=self + archived_at IS NULL
      - can_see_all=True: aceita ?consultor_id=X e ?include_archived=true
    """
    query = _supabase.table("clientes").select(
        "id, nome, empresa, consultor_responsavel, consultor_id, "
        "encontro_atual, status, archived_at, updated_at, created_at"
    )

    if not scope.can_see_all:
        if scope.consultor_id is None:
            return []
        query = query.eq("consultor_id", scope.consultor_id)
        # Consultor regular SEMPRE filtra archived (ignora flag)
        query = query.is_("archived_at", "null")
    else:
        if consultor_id:
            query = query.eq("consultor_id", consultor_id)
        if not include_archived:
            query = query.is_("archived_at", "null")

    result = query.order("created_at", desc=True).execute()
    return result.data
```

- [ ] **Step 4: Modificar get_ranking em routes/metricas.py**

Localizar `async def get_ranking(...)` (linha ~295). Modificar bloco de query inicial dos clientes:

Localize:
```python
    clientes_query = _supabase.table("clientes").select(
        "id, nome, empresa, consultor_responsavel, consultor_id, encontro_atual"
    )
    if not scope.can_see_all:
        if scope.consultor_id is None:
            return {"ranking": [], "total": 0, "plataforma": plataforma}
        clientes_query = clientes_query.eq("consultor_id", scope.consultor_id)
    clientes = clientes_query.order("nome").execute()
```

Substituir por:

```python
    clientes_query = _supabase.table("clientes").select(
        "id, nome, empresa, consultor_responsavel, consultor_id, encontro_atual"
    )
    if not scope.can_see_all:
        if scope.consultor_id is None:
            return {"ranking": [], "total": 0, "plataforma": plataforma}
        clientes_query = clientes_query.eq("consultor_id", scope.consultor_id)
    # Ranking sempre esconde archived (mesmo admin) — não faz sentido rankear clientes mortos
    clientes_query = clientes_query.is_("archived_at", "null")
    clientes = clientes_query.order("nome").execute()
```

- [ ] **Step 5: Rodar tests, todos passam**

Run: `cd backend && python3 -m pytest tests/ 2>&1 | tail -5`
Expected: `56 passed` (53 anteriores + 3 novos)

- [ ] **Step 6: Validar syntax**

Run: `cd backend && python3 -m py_compile main.py routes/metricas.py && echo OK`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/routes/metricas.py backend/tests/test_clientes_auth.py
git commit -m "feat(clientes,metricas): filtra archived por default; admin override via include_archived"
```

---

## Task 4: Endpoint POST /admin/clickup/sync (trigger manual)

**Files:**
- Modify: `backend/main.py` (adicionar endpoint)
- Create: `backend/tests/test_admin_clickup_sync.py`

- [ ] **Step 1: Escrever tests primeiro**

```python
"""Tests pro POST /admin/clickup/sync (admin trigger manual)."""
from unittest.mock import MagicMock, patch


def _setup_auth(mock_supabase, user_email, colaborador_row):
    mock_supabase.table().select().eq().eq().maybe_single().execute.return_value = MagicMock(
        data=colaborador_row
    )
    return patch("deps.supabase_client.auth.get_user", return_value=MagicMock(
        user=MagicMock(id="user-id", email=user_email)
    ))


def test_admin_sync_admin_dispara_e_retorna_stats(mock_supabase):
    """Admin POST /admin/clickup/sync dispara run_clickup_sync e retorna stats."""
    from main import app
    from fastapi.testclient import TestClient

    _setup_auth(mock_supabase, "admin@grupoguglielmi.com", {
        "id": "admin-id", "nome": "Admin", "email": "admin@grupoguglielmi.com",
        "categoria": "consultor", "role": "admin"
    }).__enter__()

    fake_stats = {
        "archived": 5, "reactivated": 1, "paused": 3, "ativos": 50,
        "errors": 0, "total": 59, "duration_ms": 1234
    }
    with patch("services.clickup_sync.run_clickup_sync", return_value=fake_stats):
        client = TestClient(app)
        resp = client.post("/admin/clickup/sync", headers={"Authorization": "Bearer t"})

    assert resp.status_code == 200
    assert resp.json() == fake_stats


def test_admin_sync_consultor_regular_403(mock_supabase):
    """Consultor regular tentando POST /admin/clickup/sync → 403."""
    from main import app
    from fastapi.testclient import TestClient

    _setup_auth(mock_supabase, "lucasnery@grupoguglielmi.com", {
        "id": "lucas-id", "nome": "Lucas Nery", "email": "lucasnery@grupoguglielmi.com",
        "categoria": "consultor", "role": "member"
    }).__enter__()

    client = TestClient(app)
    resp = client.post("/admin/clickup/sync", headers={"Authorization": "Bearer t"})
    assert resp.status_code == 403
    assert "admin" in resp.json()["detail"].lower() or "permissão" in resp.json()["detail"].lower()
```

- [ ] **Step 2: Rodar tests pra ver falhando**

Run: `cd backend && python3 -m pytest tests/test_admin_clickup_sync.py -v 2>&1 | tail -10`
Expected: 404 (endpoint não existe)

- [ ] **Step 3: Adicionar endpoint em main.py**

Localize um bom lugar perto dos outros endpoints (após `/clientes`). Adicione:

```python
# ─── Admin: ClickUp sync trigger ──────────────────────────────────────────────
@app.post("/admin/clickup/sync")
async def trigger_clickup_sync(scope: UserScope = Depends(get_user_scope)):
    """
    Dispara ClickUp sync síncrono. Admin/diretor only.
    Retorna stats: {archived, reactivated, paused, ativos, errors, total, duration_ms}
    """
    if not scope.can_see_all:
        raise HTTPException(
            status_code=403,
            detail="Operação restrita a admin/diretor."
        )
    from services.clickup_sync import run_clickup_sync
    stats = run_clickup_sync()
    return stats
```

- [ ] **Step 4: Rodar tests, passam**

Run: `cd backend && python3 -m pytest tests/test_admin_clickup_sync.py -v 2>&1 | tail -10`
Expected: `2 passed`

- [ ] **Step 5: Suite completa**

Run: `cd backend && python3 -m pytest tests/ 2>&1 | tail -5`
Expected: `58 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/test_admin_clickup_sync.py
git commit -m "feat(admin): POST /admin/clickup/sync — trigger manual com stats (admin only)"
```

---

## Task 5: Frontend — badge Pausado + filtros de status + botão Sync ClickUp

**Files:**
- Modify: `frontend/src/components/Clientes.jsx`

- [ ] **Step 1: Localizar o componente StatusBadge atual**

Run: `grep -n "StatusBadge\|status === " frontend/src/components/Clientes.jsx | head -10`

Observa onde StatusBadge é definido/usado. Já existe rendering por status (linha 40 + 155).

- [ ] **Step 2: Atualizar opções do filtro de status**

Localize em `Clientes.jsx` (linhas 399-404):
```jsx
<select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-flg w-auto pr-8 cursor-pointer">
  <option value="todos">Todos os status</option>
  <option value="ativo">Ativos</option>
  <option value="pausado">Pausados</option>
  <option value="inativo">Inativos</option>
</select>
```

Substituir por (remove "Inativos" — agora archived sai do display; adiciona "Em Encerramento"):

```jsx
<select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-flg w-auto pr-8 cursor-pointer">
  <option value="todos">Todos os status</option>
  <option value="ativo">Ativos</option>
  <option value="pausado">Pausados</option>
</select>
```

- [ ] **Step 3: Remover seção `inativos` no agrupamento de cards**

Localize linhas 331-333:
```javascript
const ativos   = filtered.filter(c => (c.status || 'ativo') === 'ativo')
const pausados = filtered.filter(c => c.status === 'pausado')
const inativos = filtered.filter(c => c.status === 'inativo')
```

Substituir por:
```javascript
const ativos   = filtered.filter(c => (c.status || 'ativo') === 'ativo')
const pausados = filtered.filter(c => c.status === 'pausado')
```

E remover qualquer JSX que usa `inativos` (procurar `{inativos.length > 0 &&` ou similar — apagar a seção).

Run: `grep -n "inativos" frontend/src/components/Clientes.jsx`
Reporta as linhas; remova-as.

- [ ] **Step 4: Adicionar botão Sync ClickUp no header (admin only)**

Localize o botão "Novo Cliente" (linha ~367):

```jsx
{canSeeAll && (
  <button onClick={() => navigate('/clientes/novo')} className="btn-gold flex items-center gap-2">
    <Plus size={14} />
    Novo Cliente
  </button>
)}
```

Adicionar imports no topo (se não estiver já):
```jsx
import { Plus, RefreshCw, /* outros já existentes */ } from 'lucide-react'
import { useState as _useState } from 'react'  // já está importado, ignore
```

Adicionar state pro sync (perto dos outros useState):
```javascript
const [syncing, setSyncing] = useState(false)
const [syncToast, setSyncToast] = useState(null)
```

Adicionar handler:
```javascript
async function handleSyncClickUp() {
  setSyncing(true)
  setSyncToast(null)
  try {
    const stats = await api('/admin/clickup/sync', { method: 'POST' })
    setSyncToast({
      type: 'success',
      msg: `Sync OK — ${stats.archived} archived, ${stats.reactivated} reactivated, ${stats.paused} pausados, ${stats.ativos} ativos (${stats.duration_ms}ms)`,
    })
    // Recarrega clientes pra refletir mudanças
    window.location.reload()
  } catch (err) {
    setSyncToast({ type: 'error', msg: err?.message || 'Falha no sync' })
  } finally {
    setSyncing(false)
  }
}
```

Adicionar o botão ANTES de "Novo Cliente":
```jsx
{canSeeAll && (
  <button
    onClick={handleSyncClickUp}
    disabled={syncing}
    className="btn-gold-outline flex items-center gap-2 disabled:opacity-50 disabled:cursor-wait"
    title="Sincronizar status dos clientes com ClickUp"
  >
    <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
    {syncing ? 'Sincronizando...' : 'Sync ClickUp'}
  </button>
)}
```

E adicionar toast feedback (perto do header):
```jsx
{syncToast && (
  <div className={`px-3 py-2 rounded text-xs mb-3 ${
    syncToast.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
  }`}>
    {syncToast.msg}
  </div>
)}
```

- [ ] **Step 5: Garantir badge Pausado já existe**

Verifique se `StatusBadge` (componente referenciado nas linhas 40+155) já renderiza pausado com cor dourada/gold. Se sim, não faz nada. Se não:

Run: `grep -n "StatusBadge" frontend/src/components/Clientes.jsx`

Localize a definição (provavelmente no topo do arquivo ou em outro componente importado). Garanta que aceita `status="pausado"` e renderiza com classe `bg-gold-mid/20 text-gold-mid` (mesma palette do design system FLG).

Se já existe e funciona, OK. Se não existe ou usa outra cor, adicionar branch.

- [ ] **Step 6: Validar syntax**

Run: `cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Clientes.jsx > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Clientes.jsx
git commit -m "feat(clientes): badge pausado + botão Sync ClickUp + filtros atualizados"
```

---

## Task 6: Verificação manual end-to-end

**Files:** nenhum

- [ ] **Step 1: Aguardar deploy do último commit passar**

Run: `gh run list --workflow=deploy.yml --limit=1 --json status,headSha`
Expected: status=completed

- [ ] **Step 2: Confirmar migration 010 aplicada (Pedro)**

Pedro confirma no chat: rodou `010-clientes-archived-at.sql` no Supabase Dashboard? Se não, lembrar.

- [ ] **Step 3: Smoke test admin**

- [ ] Login como Pedro/admin em `/clientes`
- [ ] Botão "Sync ClickUp" aparece no header
- [ ] Click → spinner gira → toast verde com stats
- [ ] Após reload, clientes encerrados/inativos/renovados SUMIRAM
- [ ] Pausados aparecem com badge gold
- [ ] Filtro de status só tem "Todos / Ativos / Pausados"

- [ ] **Step 4: Smoke test consultor**

- [ ] Login como consultor não-admin
- [ ] Botão "Sync ClickUp" NÃO aparece
- [ ] POST direto via DevTools → 403

- [ ] **Step 5: Verificar SQL pós-sync (Pedro no Supabase)**

```sql
SELECT
  count(*) FILTER (WHERE archived_at IS NULL) AS visiveis,
  count(*) FILTER (WHERE archived_at IS NOT NULL) AS arquivados,
  count(*) AS total
FROM clientes;
```

Espera-se ver `arquivados > 0`. Confirma que os 23 órfãos do Stream 6 reduziram (rodar a query original de órfãos pra ver quantos sobraram).

---

## Verificação de cobertura da spec

| Spec section | Task(s) que cobre |
|---|---|
| 2 Schema (migration 010) | Pré-requisito externo |
| 3.1 evaluate_lifecycle | Task 1 |
| 3.2 run_clickup_sync ampliado | Task 2 |
| 3.3 Endpoints filtram archived | Task 3 |
| 3.3 POST /admin/clickup/sync | Task 4 |
| 3.4 Schedule (apscheduler/webhook existentes) | Sem mudanças — mantém |
| 4.1 Badge Pausado | Task 5 |
| 4.2 Botão Sync admin | Task 5 |
| 4.3 Filtros status sem Inativos | Task 5 |
| 6 Rollback plan | Documentado na spec; código atende |
| 7 Métricas de sucesso | Task 6 (smoke test) |
