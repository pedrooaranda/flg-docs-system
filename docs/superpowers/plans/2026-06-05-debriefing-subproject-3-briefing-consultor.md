# Debriefings Sub-projeto 3 — Briefing do Consultor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao consultor um editor de "percepção pessoal" sobre cada cliente, com histórico read-only dos debriefings já gerados; e expor essas percepções como insumo no hub do comercial.

**Architecture:** Backend novo route `briefings_consultor` com 3 endpoints (GET/PATCH /me + GET lista), gateados por `consultor_id IS NOT NULL` (escrita) ou `require_debriefings` (leitura agregada). Ajuste no gate dos GETs de `/debriefings/*` pra também aceitar consultores (helper composto). Frontend tela `BriefingConsultor.jsx` sob MainLayout reusando `useAutoSave` existente + viewer inline dos debriefings. Botão no PerfilCliente muda copy/destino por persona.

**Tech Stack:** Python 3.12 / FastAPI / supabase-py / pytest backend; React 18 / Vite / Tailwind / esbuild frontend. Repo direto em `main`. Deploy auto via GH Actions.

---

## Mapa de arquivos

**Criar (backend):**
- `docs/migrations/012-briefings-consultor.sql` — arquivar SQL exato que Pedro rodou (pra versionamento)
- `backend/routes/briefings_consultor.py` — 3 endpoints novos
- `backend/tests/test_briefings_consultor.py` — 7 tests

**Modificar (backend):**
- `backend/lib/auth_scope.py` — adicionar helper `require_debriefings_or_consultor` + tests
- `backend/tests/test_auth_scope.py` — tests do novo helper
- `backend/routes/debriefings.py` — trocar `require_debriefings` por `require_debriefings_or_consultor` nos 3 GETs (lista, detalhe, PDF). Mantém `require_debriefings` em POST/DELETE/stream.
- `backend/main.py` — registrar `briefings_consultor_router`

**Criar (frontend):**
- `frontend/src/components/BriefingConsultor.jsx` — tela do consultor
- `frontend/src/components/Debriefings/BriefingPercepcoesCard.jsx` — seção no hub do comercial

**Modificar (frontend):**
- `frontend/src/App.jsx` — adicionar rota `/clientes/:id/briefing-consultor` sob `MainLayout`
- `frontend/src/components/PerfilCliente.jsx` — ajustar botão por persona (canSeeDebriefings vs myConsultorId)
- `frontend/src/components/Debriefings/ClienteHub.jsx` — integrar `<BriefingPercepcoesCard />` no topo

---

## Princípio: relaxamento cirúrgico do gate dos GETs

Sub-projeto 1 aplicou `require_debriefings` em todos os endpoints `/debriefings/*`. Sub-projeto 3 precisa que consultor leia debriefings (histórico read-only na tela dele). Solução cirúrgica: novo helper `require_debriefings_or_consultor` aplicado apenas nos 3 GETs de leitura. POST/DELETE/stream continuam `require_debriefings` (consultor não gera nem apaga).

---

## Task 1: Arquivar migration 012 no repo

**Files:**
- Create: `docs/migrations/012-briefings-consultor.sql`

**Contexto:** Pedro já rodou a migration 012 no Supabase Dashboard em 2026-06-05. Arquivar SQL exato no repo pra rastreabilidade (mesmo padrão das migrations 003-011).

- [ ] **Step 1: Criar arquivo SQL**

`docs/migrations/012-briefings-consultor.sql`:

```sql
-- Migration 012: tabela briefings_consultor (sub-projeto 3 Debriefings)
-- Aplicada manualmente por Pedro em 2026-06-05 via Supabase Dashboard.
-- VPS sem IPv6 não permite Postgres direto via migrations CLI.

CREATE TABLE briefings_consultor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  consultor_id UUID NOT NULL REFERENCES colaboradores(id),
  conteudo TEXT NOT NULL DEFAULT '',
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, consultor_id)
);
```

- [ ] **Step 2: Commit**

```bash
git add docs/migrations/012-briefings-consultor.sql
git commit -m "migration(012): arquiva briefings_consultor SQL no repo

Pedro rodou manualmente no Supabase Dashboard 2026-06-05. Arquivado pra
versionamento (mesmo padrão 003-011).

UNIQUE(cliente_id, consultor_id) cria índice composto que serve queries
por cliente_id — sem CREATE INDEX adicional."
```

---

## Task 2: Backend — helper `require_debriefings_or_consultor` + relaxa GETs de debriefings

**Files:**
- Modify: `backend/lib/auth_scope.py` — adiciona helper
- Modify: `backend/tests/test_auth_scope.py` — tests do helper
- Modify: `backend/routes/debriefings.py` — troca o gate nos 3 GETs

**Contexto:** Consultor (sem `canSeeDebriefings`) precisa ler debriefings (lista, detalhe, PDF) pra ver histórico na tela dele. Helper composto aceita comercial (via `canSeeDebriefings`) OU consultor (via `consultor_id`).

- [ ] **Step 1: Escrever tests do helper (vão falhar)**

Em `backend/tests/test_auth_scope.py`, adicionar no final do arquivo:

```python
def test_require_debriefings_or_consultor_aceita_comercial():
    """Comercial (canSeeDebriefings=True, sem consultor_id) passa."""
    from lib.auth_scope import require_debriefings_or_consultor
    scope = _make_scope(False, True, False)
    scope = UserScope(
        user_id="u-1", email="x@flg.com", role="member",
        consultor_id=None, consultor_nome=None, categoria="comercial",
        can_see_all=False,
        can_see_principal=False, can_see_debriefings=True, can_see_debriefings_admin=False,
    )
    require_debriefings_or_consultor(scope)  # não levanta


def test_require_debriefings_or_consultor_aceita_consultor():
    """Consultor (canSeeDebriefings=False, com consultor_id) passa."""
    from lib.auth_scope import require_debriefings_or_consultor
    scope = UserScope(
        user_id="u-1", email="c@flg.com", role="member",
        consultor_id="cons-1", consultor_nome="Consultor X", categoria="consultor",
        can_see_all=False,
        can_see_principal=True, can_see_debriefings=False, can_see_debriefings_admin=False,
    )
    require_debriefings_or_consultor(scope)  # não levanta


def test_require_debriefings_or_consultor_rejeita_nem_um_nem_outro():
    """Sem canSeeDebriefings E sem consultor_id → 403."""
    from lib.auth_scope import require_debriefings_or_consultor
    scope = UserScope(
        user_id="u-1", email="x@flg.com", role="member",
        consultor_id=None, consultor_nome=None, categoria="comercial",
        can_see_all=False,
        can_see_principal=False, can_see_debriefings=False, can_see_debriefings_admin=False,
    )
    with pytest.raises(HTTPException) as exc:
        require_debriefings_or_consultor(scope)
    assert exc.value.status_code == 403
```

- [ ] **Step 2: Rodar tests (esperado 3 falhas por ImportError)**

```bash
cd backend && python3 -m pytest tests/test_auth_scope.py -v 2>&1 | tail -10
```

Expected: 3 erros "cannot import name 'require_debriefings_or_consultor'".

- [ ] **Step 3: Adicionar helper em `backend/lib/auth_scope.py`**

Localizar a função `require_debriefings` (procurar `def require_debriefings(scope`). Adicionar **logo após ela**:

```python
def require_debriefings_or_consultor(scope: UserScope) -> None:
    """
    Aceita ou quem pode ver Debriefings (canSeeDebriefings) ou qualquer pessoa
    registrada como consultor (consultor_id NOT NULL).

    Usado nos 3 GETs de leitura de /debriefings/* (lista, detalhe, PDF) pra
    permitir consultor ler histórico de debriefings dos clientes — necessário
    pra tela "Briefing do Consultor" (sub-projeto 3).

    POST/DELETE/stream em /debriefings/* continuam com require_debriefings
    (consultor não gera nem apaga).
    """
    if scope.can_see_debriefings or scope.consultor_id is not None:
        return
    raise HTTPException(status_code=403, detail="Acesso restrito")
```

- [ ] **Step 4: Rodar tests (passar)**

```bash
cd backend && python3 -m pytest tests/test_auth_scope.py -v 2>&1 | tail -5
```

Expected: todos passam (3 novos + os existentes).

- [ ] **Step 5: Trocar gate nos 3 GETs de debriefings.py**

Em `backend/routes/debriefings.py`:

1. No import line `from lib.auth_scope import ...` adicionar `require_debriefings_or_consultor`.
2. Localizar os 3 handlers (procurar `@router.get`):
   - `list_debriefings` (~ linha 515) — trocar `require_debriefings(scope)` por `require_debriefings_or_consultor(scope)`
   - `get_debriefing` (~ linha 529) — idem
   - `download_pdf` (~ linha 578) — idem
3. **NÃO mexer** em: `create_debriefing` (POST), `stream_debriefing`, `list_ciclos_for_cliente`. Esses continuam `require_debriefings`.

- [ ] **Step 6: Rodar suite completa**

```bash
cd backend && python3 -m pytest tests/ 2>&1 | tail -3
```

Expected: `90 passed, 5 failed` (87 atual + 3 novos do helper = 90; os 5 failures continuam só em `test_admin_clickup_sync.py`).

- [ ] **Step 7: Commit**

```bash
git add backend/lib/auth_scope.py backend/tests/test_auth_scope.py backend/routes/debriefings.py
git commit -m "feat(auth): require_debriefings_or_consultor relaxa GETs de debriefings

Sub-projeto 3 precisa que consultor (sem canSeeDebriefings) leia histórico
de debriefings dos clientes na tela 'Briefing do Consultor'. Helper composto
aceita canSeeDebriefings OU consultor_id NOT NULL.

Aplicado em 3 GETs: list_debriefings, get_debriefing, download_pdf.
POST/DELETE/stream continuam com require_debriefings (mais restritivo) —
consultor não gera nem apaga.

3 tests novos cobrem matriz (comercial passa, consultor passa, sem nenhum
recebe 403)."
```

---

## Task 3: Backend — `briefings_consultor` router + tests + registro

**Files:**
- Create: `backend/routes/briefings_consultor.py`
- Create: `backend/tests/test_briefings_consultor.py`
- Modify: `backend/main.py` — registrar router

**Contexto:** 3 endpoints novos. Padrão herdado de `routes/colaboradores.py` (router com prefix). Conftest fornece `mock_main_supabase` pra patchar `_supabase`.

- [ ] **Step 1: Escrever tests (vão falhar)**

Criar `backend/tests/test_briefings_consultor.py`:

```python
"""Tests do router /briefings-consultor (sub-projeto 3 Debriefings).

Endpoints:
  GET    /briefings-consultor/cliente/{id}/me   consultor lê o próprio briefing
  PATCH  /briefings-consultor/cliente/{id}/me   consultor escreve/atualiza (upsert)
  GET    /briefings-consultor/cliente/{id}      lista todos (comercial+diretor+owner)

Gating:
  - GET/PATCH /me: scope.consultor_id NOT NULL (qualquer consultor registrado)
  - GET lista: require_debriefings
"""
import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException

from lib.auth_scope import UserScope


def _make_scope(categoria, role, consultor_id=None):
    from lib.auth_scope import _compute_flags
    p, d, da = _compute_flags(categoria, role)
    return UserScope(
        user_id="u-1",
        email="x@grupoguglielmi.com",
        role=role,
        consultor_id=consultor_id,
        consultor_nome="Consultor X" if consultor_id else None,
        categoria=categoria,
        can_see_all=(categoria == "diretor") or role in ("owner", "admin"),
        can_see_principal=p,
        can_see_debriefings=d,
        can_see_debriefings_admin=da,
    )


@pytest.mark.asyncio
async def test_consultor_get_me_sem_briefing_retorna_vazio(mock_main_supabase):
    """GET /me quando não há row → retorna conteudo vazio, atualizado_em None."""
    from routes.briefings_consultor import get_my_briefing
    scope = _make_scope("consultor", "member", consultor_id="cons-1")
    mock_main_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=None)
    result = await get_my_briefing(cliente_id="cli-1", scope=scope)
    assert result == {"conteudo": "", "atualizado_em": None}


@pytest.mark.asyncio
async def test_consultor_patch_me_upsert(mock_main_supabase):
    """PATCH /me com conteudo → upsert e retorna o que foi salvo."""
    from routes.briefings_consultor import update_my_briefing, BriefingPayload
    scope = _make_scope("consultor", "member", consultor_id="cons-1")
    saved = {"conteudo": "minha percepção", "atualizado_em": "2026-06-05T18:00:00Z"}
    mock_main_supabase.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[saved])
    result = await update_my_briefing(
        cliente_id="cli-1",
        payload=BriefingPayload(conteudo="minha percepção"),
        scope=scope,
    )
    assert result == saved


@pytest.mark.asyncio
async def test_comercial_sem_consultor_id_recebe_403_em_me():
    """Comercial sem consultor_id → 403 em GET /me e PATCH /me."""
    from routes.briefings_consultor import get_my_briefing, update_my_briefing, BriefingPayload
    scope = _make_scope("comercial", "member", consultor_id=None)
    with pytest.raises(HTTPException) as exc:
        await get_my_briefing(cliente_id="cli-1", scope=scope)
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as exc:
        await update_my_briefing(
            cliente_id="cli-1",
            payload=BriefingPayload(conteudo="x"),
            scope=scope,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_consultor_recebe_403_em_listagem():
    """Consultor sem canSeeDebriefings → 403 em GET lista."""
    from routes.briefings_consultor import list_briefings
    scope = _make_scope("consultor", "member", consultor_id="cons-1")
    with pytest.raises(HTTPException) as exc:
        await list_briefings(cliente_id="cli-1", scope=scope)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_comercial_le_listagem(mock_main_supabase):
    """Comercial vê lista com consultor_nome resolvido."""
    from routes.briefings_consultor import list_briefings
    scope = _make_scope("comercial", "member")
    rows = [
        {"consultor_id": "c1", "conteudo": "p1", "atualizado_em": "2026-06-05T10:00:00Z",
         "colaboradores": {"nome": "Alice"}},
        {"consultor_id": "c2", "conteudo": "p2", "atualizado_em": "2026-06-04T10:00:00Z",
         "colaboradores": {"nome": "Bruno"}},
    ]
    mock_main_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(data=rows)
    result = await list_briefings(cliente_id="cli-1", scope=scope)
    assert len(result) == 2
    assert result[0]["consultor_nome"] == "Alice"
    assert result[1]["consultor_nome"] == "Bruno"


@pytest.mark.asyncio
async def test_diretor_le_listagem(mock_main_supabase):
    """Diretor vê lista igual ao comercial."""
    from routes.briefings_consultor import list_briefings
    scope = _make_scope("diretor", "member")
    mock_main_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(data=[])
    result = await list_briefings(cliente_id="cli-1", scope=scope)
    assert result == []


@pytest.mark.asyncio
async def test_owner_le_listagem(mock_main_supabase):
    """Owner sem categoria vê lista (via is_owner)."""
    from routes.briefings_consultor import list_briefings
    scope = _make_scope(None, "owner")
    mock_main_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(data=[])
    result = await list_briefings(cliente_id="cli-1", scope=scope)
    assert result == []
```

- [ ] **Step 2: Rodar tests (vão falhar por ImportError)**

```bash
cd backend && python3 -m pytest tests/test_briefings_consultor.py -v 2>&1 | tail -10
```

Expected: 7 falhas tipo "cannot import name from 'routes.briefings_consultor'".

- [ ] **Step 3: Criar router**

`backend/routes/briefings_consultor.py`:

```python
"""
Rotas de Briefings do Consultor — Sub-projeto 3 Debriefings.

Endpoints (todos sob /briefings-consultor):
  GET    /cliente/{cliente_id}/me     consultor lê o próprio briefing
  PATCH  /cliente/{cliente_id}/me     consultor upsert do próprio
  GET    /cliente/{cliente_id}        lista todos (comercial+diretor+owner)

Gating:
  - /me (GET/PATCH): qualquer pessoa registrada como consultor (scope.consultor_id NOT NULL)
  - lista: require_debriefings (comercial, diretor, owner)
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import supabase_client
from lib.auth_scope import UserScope, get_user_scope, require_debriefings

_supabase = supabase_client

router = APIRouter(prefix="/briefings-consultor", tags=["briefings-consultor"])


class BriefingPayload(BaseModel):
    conteudo: str


def _require_consultor_id(scope: UserScope) -> str:
    """Bloqueia quem não tem consultor_id (ex: comercial sem ficha de consultor)."""
    if not scope.consultor_id:
        raise HTTPException(
            status_code=403,
            detail="Apenas consultores podem escrever briefings.",
        )
    return scope.consultor_id


@router.get("/cliente/{cliente_id}/me")
async def get_my_briefing(
    cliente_id: str,
    scope: UserScope = Depends(get_user_scope),
):
    """Retorna o briefing do consultor logado pra esse cliente.

    Se não existe ainda, retorna conteudo vazio + atualizado_em None.
    """
    consultor_id = _require_consultor_id(scope)
    row = (
        _supabase.table("briefings_consultor")
        .select("conteudo, atualizado_em")
        .eq("cliente_id", cliente_id)
        .eq("consultor_id", consultor_id)
        .maybe_single()
        .execute()
    )
    if not row.data:
        return {"conteudo": "", "atualizado_em": None}
    return {"conteudo": row.data["conteudo"], "atualizado_em": row.data["atualizado_em"]}


@router.patch("/cliente/{cliente_id}/me")
async def update_my_briefing(
    cliente_id: str,
    payload: BriefingPayload,
    scope: UserScope = Depends(get_user_scope),
):
    """Upsert do briefing do consultor logado pra esse cliente."""
    from datetime import datetime, timezone
    consultor_id = _require_consultor_id(scope)
    now_iso = datetime.now(timezone.utc).isoformat()
    result = (
        _supabase.table("briefings_consultor")
        .upsert(
            {
                "cliente_id": cliente_id,
                "consultor_id": consultor_id,
                "conteudo": payload.conteudo,
                "atualizado_em": now_iso,
            },
            on_conflict="cliente_id,consultor_id",
        )
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Falha ao salvar")
    saved = result.data[0]
    return {"conteudo": saved["conteudo"], "atualizado_em": saved["atualizado_em"]}


@router.get("/cliente/{cliente_id}")
async def list_briefings(
    cliente_id: str,
    scope: UserScope = Depends(get_user_scope),
):
    """Lista todos os briefings de consultor desse cliente.

    Cada item vem com consultor_nome resolvido via join.
    Ordenado por atualizado_em DESC (mais recente primeiro).
    """
    require_debriefings(scope)
    rows = (
        _supabase.table("briefings_consultor")
        .select("consultor_id, conteudo, atualizado_em, colaboradores(nome)")
        .eq("cliente_id", cliente_id)
        .order("atualizado_em", desc=True)
        .execute()
    )
    return [
        {
            "consultor_id": r["consultor_id"],
            "consultor_nome": (r.get("colaboradores") or {}).get("nome") or "Consultor",
            "conteudo": r["conteudo"],
            "atualizado_em": r["atualizado_em"],
        }
        for r in (rows.data or [])
    ]
```

- [ ] **Step 4: Registrar router em main.py**

Em `backend/main.py`, localizar bloco de imports `from routes.* import router as ..._router` (~ linha 30-39) e adicionar:

```python
from routes.briefings_consultor import router as briefings_consultor_router
```

Localizar bloco de `app.include_router(...)` (procurar por `app.include_router`) e adicionar:

```python
app.include_router(briefings_consultor_router)
```

(Mesmo padrão dos outros routers — manter agrupamento.)

- [ ] **Step 5: Rodar tests do novo módulo**

```bash
cd backend && python3 -m pytest tests/test_briefings_consultor.py -v 2>&1 | tail -10
```

Expected: 7 passed.

- [ ] **Step 6: Rodar suite completa**

```bash
cd backend && python3 -m pytest tests/ 2>&1 | tail -3
```

Expected: `97 passed, 5 failed` (90 da Task 2 + 7 novos da Task 3).

- [ ] **Step 7: Commit**

```bash
git add backend/routes/briefings_consultor.py backend/tests/test_briefings_consultor.py backend/main.py
git commit -m "feat(api): /briefings-consultor router (3 endpoints + 7 tests)

Sub-projeto 3 backend: tabela briefings_consultor (migration 012 Pedro
aplicou) ganha API.

Endpoints:
  GET    /cliente/:id/me   consultor lê próprio
  PATCH  /cliente/:id/me   consultor upsert próprio (auto-save do front)
  GET    /cliente/:id      lista todos (require_debriefings)

Gating das mutações: scope.consultor_id NOT NULL (qualquer consultor
registrado). Comercial sem consultor_id é bloqueado em /me — vê só a lista.

Lista usa join inline pra resolver consultor_nome (sem segundo round-trip).
Ordenado DESC por atualizado_em."
```

---

## Task 4: Frontend — `BriefingConsultor.jsx` (tela do consultor)

**Files:**
- Create: `frontend/src/components/BriefingConsultor.jsx`

**Contexto:** Tela do consultor pra escrever percepção sobre um cliente. Auto-save reusa `useAutoSave` existente (que usa PATCH com body `{[field]: val}` — aqui field é `'conteudo'`). Embaixo, cards de debriefings já gerados, expansíveis inline com markdown.

`useAutoSave` API (de `frontend/src/hooks/useAutoSave.jsx`):
```js
const { status } = useAutoSave(`/briefings-consultor/cliente/${id}/me`, 'conteudo', value)
// status: 'idle' | 'saving' | 'saved' | 'error'
```

Backend endpoint aceita PATCH com body `{conteudo: val}` — bate com o que `useAutoSave` envia.

`AutoSaveIndicator` componente também existe em `useAutoSave.jsx` (named export junto com o hook).

- [ ] **Step 1: Criar `BriefingConsultor.jsx`**

`frontend/src/components/BriefingConsultor.jsx`:

```jsx
/**
 * Tela "Briefing do Consultor" (sub-projeto 3 Debriefings).
 *
 * Acessada via /clientes/:id/briefing-consultor (sob MainLayout).
 *
 * Consultor escreve percepção pessoal sobre o cliente — texto livre, auto-save.
 * Embaixo, cards de debriefings já gerados (expansíveis inline, read-only).
 */
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ChevronDown, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { api } from '../lib/api'
import { useAutoSave, AutoSaveIndicator } from '../hooks/useAutoSave.jsx'
import { PageSpinner } from './ui/Spinner'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

function StatusBadge({ status }) {
  const map = {
    gerando: { Icon: Loader2, color: '#FBBF24', label: 'Gerando', spin: true },
    pronto:  { Icon: CheckCircle2, color: '#34D399', label: 'Pronto' },
    falhou:  { Icon: AlertCircle, color: '#F87171', label: 'Falhou' },
  }
  const cfg = map[status] || { Icon: AlertCircle, color: '#888', label: status }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full uppercase"
          style={{ color: cfg.color, background: `${cfg.color}1A`, border: `1px solid ${cfg.color}50` }}>
      <cfg.Icon size={10} className={cfg.spin ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  )
}

function DebriefingCard({ debriefing }) {
  const [expanded, setExpanded] = useState(false)
  const [markdown, setMarkdown] = useState(null)

  async function toggle() {
    if (expanded) { setExpanded(false); return }
    if (markdown === null) {
      try {
        const data = await api(`/debriefings/${debriefing.id}`)
        setMarkdown(data?.conteudo_markdown || '*(sem conteúdo)*')
      } catch (err) {
        setMarkdown(`*(falha ao carregar: ${err?.message || 'erro'})*`)
      }
    }
    setExpanded(true)
  }

  return (
    <div className="card-flg p-4">
      <button onClick={toggle} className="w-full flex items-center justify-between text-left">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-semibold">Ciclo {debriefing.ciclo_numero}</span>
            <StatusBadge status={debriefing.status} />
          </div>
          <p className="text-xs text-white/50">{formatDate(debriefing.created_at)}</p>
        </div>
        <ChevronDown size={16} className={`text-white/40 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-white/10 prose prose-invert prose-sm max-w-none">
              {markdown === null
                ? <p className="text-white/45 text-sm">Carregando…</p>
                : <ReactMarkdown>{markdown}</ReactMarkdown>}
            </div>
            <a
              href={`/api/debriefings/${debriefing.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-xs text-[#C9A84C] hover:underline"
            >
              Baixar PDF →
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function BriefingConsultor() {
  const { id: clientId } = useParams()
  const navigate = useNavigate()

  const [cliente, setCliente] = useState(null)
  const [conteudo, setConteudo] = useState(null)  // null = loading, '' = empty, string = loaded
  const [debriefings, setDebriefings] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const { status: saveStatus } = useAutoSave(
    `/briefings-consultor/cliente/${clientId}/me`,
    'conteudo',
    conteudo,
  )

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api(`/clientes/${clientId}`),
      api(`/briefings-consultor/cliente/${clientId}/me`),
      api(`/debriefings?cliente_id=${clientId}`),
    ])
      .then(([cl, brief, debs]) => {
        if (cancelled) return
        setCliente(cl)
        setConteudo(brief?.conteudo || '')
        setDebriefings(debs || [])
      })
      .catch(err => { if (!cancelled) setLoadError(err?.message || 'Falha ao carregar') })
    return () => { cancelled = true }
  }, [clientId])

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="text-center text-red-400 text-sm">{loadError}</div>
      </div>
    )
  }

  if (cliente === null || conteudo === null) return <PageSpinner />

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <button
        onClick={() => navigate(`/clientes/${clientId}`)}
        className="flex items-center gap-2 text-xs text-white/50 hover:text-white/80 mb-6 transition-colors"
      >
        <ArrowLeft size={14} />
        Voltar pro cliente
      </button>

      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-white">Briefing do Consultor</h1>
        <p className="text-white/55 text-sm mt-1">{cliente.nome} · {cliente.empresa}</p>
      </div>

      <div className="card-flg p-5 mb-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] tracking-widest uppercase text-white/45 font-medium">Sua percepção</span>
          <AutoSaveIndicator status={saveStatus} />
        </div>
        <textarea
          value={conteudo}
          onChange={e => setConteudo(e.target.value)}
          rows={14}
          placeholder="Escreva o que considera importante o time comercial saber sobre esse cliente antes de gerar o debriefing oficial de renovação…"
          className="w-full bg-transparent text-white text-sm leading-relaxed resize-none focus:outline-none placeholder:text-white/25"
          autoFocus
        />
      </div>
      <p className="text-xs text-white/45 mb-10">
        Salva automaticamente. Vai aparecer pro time comercial no hub de Debriefings deste cliente.
      </p>

      <div className="border-t border-white/10 pt-6">
        <h2 className="font-display text-xl font-semibold text-white mb-4">Debriefings já gerados</h2>
        {debriefings === null ? (
          <p className="text-white/45 text-sm">Carregando…</p>
        ) : debriefings.length === 0 ? (
          <div className="card-flg p-8 text-center">
            <p className="text-white/55 text-sm">Nenhum debriefing gerado ainda pra esse cliente.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {debriefings.map(d => <DebriefingCard key={d.id} debriefing={d} />)}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Validar build esbuild**

```bash
cd frontend && npx esbuild --bundle src/components/BriefingConsultor.jsx --loader:.jsx=jsx --jsx=automatic --target=es2020 --outfile=/tmp/flg-val-bc.js 2>&1 | tail -3 ; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BriefingConsultor.jsx
git commit -m "feat(briefing-consultor): tela /clientes/:id/briefing-consultor

Editor de percepção (texto livre, auto-save via useAutoSave existente)
+ lista de debriefings já gerados (expansíveis inline com markdown +
link Baixar PDF). Tudo em uma tela, sem rotear pra fora.

Reusa AutoSaveIndicator existente. Sub-projeto 2 task 2 relaxou GETs
de debriefings pra consultor ler — funciona aqui."
```

---

## Task 5: Frontend — rota em App.jsx + ajuste botão PerfilCliente

**Files:**
- Modify: `frontend/src/App.jsx` — adicionar rota
- Modify: `frontend/src/components/PerfilCliente.jsx` — botão por persona

**Contexto:** Rota `/clientes/:id/briefing-consultor` fica sob `MainLayout` (consultor tem `canSeePrincipal=true`, então acessa). Botão no PerfilCliente: hoje só renderiza pra quem tem `canSeeDebriefings`; vira condicional ternário pra consultor ver versão "Meu Briefing".

- [ ] **Step 1: Adicionar lazy import + rota em App.jsx**

Em `frontend/src/App.jsx`:

1. Localizar bloco `// Sub-projeto 2 Debriefings` (~ linha 48) e adicionar logo após:

```jsx
// Sub-projeto 3 Briefing do Consultor
const BriefingConsultor   = lazy(() => import('./components/BriefingConsultor'))
```

2. Localizar bloco `<Route element={<MainLayout />}>` e adicionar rota nova dentro do bloco, logo após a rota `/clientes/:clientId/encontro/:encontroNum`:

```jsx
<Route path="/clientes/:id/briefing-consultor" element={<BriefingConsultor />} />
```

- [ ] **Step 2: Ajustar botão em PerfilCliente.jsx**

Em `frontend/src/components/PerfilCliente.jsx`:

1. Confirmar que `useUserScope` já retorna `myConsultorId`:
```bash
grep -n "myConsultorId\|canSeeDebriefings" frontend/src/components/PerfilCliente.jsx
```
Deve ter `const { canSeeDebriefings } = useUserScope()`. Trocar por:

```jsx
const { canSeeDebriefings, myConsultorId } = useUserScope()
```

2. Localizar o bloco do botão atual (procurar `canSeeDebriefings && (`). Trocar **todo** o bloco `{canSeeDebriefings && ( ... )}` por:

```jsx
{canSeeDebriefings ? (
  <button
    onClick={() => navigate(`/debriefings/cliente/${cliente.id}`)}
    className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border transition-all hover:scale-[1.02]"
    style={{
      color: '#0a0a0a',
      background: 'linear-gradient(135deg, #D4B85E 0%, #C9A84C 100%)',
      borderColor: 'rgba(201,168,76,0.50)',
      boxShadow: '0 2px 12px rgba(201,168,76,0.25)',
    }}
    title="Abrir Debriefings deste cliente"
  >
    <FileText size={15} />
    Abrir Debriefings
  </button>
) : myConsultorId ? (
  <button
    onClick={() => navigate(`/clientes/${cliente.id}/briefing-consultor`)}
    className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border transition-all hover:scale-[1.02]"
    style={{
      color: '#0a0a0a',
      background: 'linear-gradient(135deg, #D4B85E 0%, #C9A84C 100%)',
      borderColor: 'rgba(201,168,76,0.50)',
      boxShadow: '0 2px 12px rgba(201,168,76,0.25)',
    }}
    title="Escrever percepção sobre esse cliente"
  >
    <FileText size={15} />
    Meu Briefing
  </button>
) : null}
```

- [ ] **Step 3: Validar build full (App.jsx inclui o componente novo via lazy)**

```bash
cd frontend && npx esbuild --bundle src/App.jsx --loader:.jsx=jsx --jsx=automatic --target=es2020 --outfile=/tmp/flg-val-app3.js 2>&1 | tail -3 ; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/PerfilCliente.jsx
git commit -m "feat(routes): rota /clientes/:id/briefing-consultor + botão por persona

Adiciona rota sob MainLayout (consultor tem canSeePrincipal=true).

PerfilCliente: botão no header agora bifurca por persona:
  - canSeeDebriefings (owner/diretor/comercial): 'Abrir Debriefings' → hub
  - myConsultorId só: 'Meu Briefing' → tela de percepção
  - nem um nem outro: oculto

Mesmo visual gold-gradient nos dois caminhos — só copy + destino mudam."
```

---

## Task 6: Frontend — `BriefingPercepcoesCard` + integração `ClienteHub`

**Files:**
- Create: `frontend/src/components/Debriefings/BriefingPercepcoesCard.jsx`
- Modify: `frontend/src/components/Debriefings/ClienteHub.jsx` — integrar card no topo

**Contexto:** Card destacado no topo do hub do comercial mostrando todas as percepções escritas por consultores.

- [ ] **Step 1: Criar `BriefingPercepcoesCard.jsx`**

`frontend/src/components/Debriefings/BriefingPercepcoesCard.jsx`:

```jsx
/**
 * Card "Percepções dos consultores" — sub-projeto 3 Debriefings.
 *
 * Renderizado no topo de ClienteHub (/debriefings/cliente/:id). Lista todas
 * as percepções escritas por consultores pra esse cliente. Cada item
 * expansível inline.
 */
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lightbulb, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { api } from '../../lib/api'

function relativeTime(iso) {
  if (!iso) return ''
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.max(0, now - then)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora há pouco'
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function PercepcaoCard({ item }) {
  const [expanded, setExpanded] = useState(false)
  const preview = (item.conteudo || '').slice(0, 200).trim() || '(vazio)'
  const hasMore = (item.conteudo || '').length > 200

  return (
    <div className="card-flg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white">{item.consultor_nome}</span>
        <span className="text-xs text-white/40">{relativeTime(item.atualizado_em)}</span>
      </div>
      {!expanded ? (
        <>
          <p className="text-sm text-white/70 leading-relaxed">{preview}{hasMore && '…'}</p>
          {hasMore && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-2 text-xs text-[#C9A84C] hover:underline flex items-center gap-1"
            >
              Ver completo <ChevronDown size={12} />
            </button>
          )}
        </>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{item.conteudo || '*(vazio)*'}</ReactMarkdown>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="mt-2 text-xs text-white/45 hover:text-white/70"
            >
              Recolher
            </button>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}

export default function BriefingPercepcoesCard({ clienteId }) {
  const [percepcoes, setPercepcoes] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    api(`/briefings-consultor/cliente/${clienteId}`)
      .then(data => { if (!cancelled) setPercepcoes(data || []) })
      .catch(err => { if (!cancelled) setError(err?.message || 'Falha ao carregar percepções') })
    return () => { cancelled = true }
  }, [clienteId])

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb size={16} className="text-[#C9A84C]" />
        <h3 className="text-sm font-semibold text-white">Percepções dos consultores</h3>
      </div>
      <p className="text-xs text-white/45 mb-4">
        Insumo escrito pelos consultores que tocaram esse cliente.
      </p>

      {error ? (
        <div className="card-flg p-4 text-red-400 text-sm">{error}</div>
      ) : percepcoes === null ? (
        <div className="card-flg p-4 text-white/45 text-sm">Carregando…</div>
      ) : percepcoes.length === 0 ? (
        <div className="card-flg p-6 text-center">
          <p className="text-white/55 text-sm">
            Nenhum consultor registrou percepção ainda. Você pode gerar o debriefing
            mesmo assim com os dados do ClickUp/Drive.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {percepcoes.map(p => <PercepcaoCard key={p.consultor_id} item={p} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Integrar no `ClienteHub.jsx`**

Em `frontend/src/components/Debriefings/ClienteHub.jsx`:

1. Adicionar import no topo do arquivo (junto com os outros do mesmo diretório):

```jsx
import BriefingPercepcoesCard from './BriefingPercepcoesCard'
```

2. Localizar o JSX que renderiza o conteúdo principal do hub (procurar onde aparece a lista de debriefings, geralmente após o header do cliente). Adicionar `<BriefingPercepcoesCard clienteId={clientId} />` **antes** da lista de debriefings:

```jsx
<BriefingPercepcoesCard clienteId={clientId} />
{/* lista de debriefings existente fica logo abaixo */}
```

Se o arquivo tiver várias seções dentro de fragment ou container, o componente fica como primeira seção dentro do main content (depois do header com nome do cliente, antes da lista de debriefings).

- [ ] **Step 3: Validar build**

```bash
cd frontend && npx esbuild --bundle src/components/Debriefings/ClienteHub.jsx --loader:.jsx=jsx --jsx=automatic --target=es2020 --outfile=/tmp/flg-val-ch3.js 2>&1 | tail -3 ; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Debriefings/BriefingPercepcoesCard.jsx frontend/src/components/Debriefings/ClienteHub.jsx
git commit -m "feat(debriefings): card 'Percepções dos consultores' no hub

Topo do /debriefings/cliente/:id ganha card destacado listando todas as
percepções escritas pelos consultores (assinadas + data relativa).
Expansível inline com markdown.

Empty state explica que comercial pode gerar debriefing sem precisar
das percepções — é insumo, não bloqueio."
```

---

## Task 7: Push + smoke matriz

**Files:** nenhum modificado. Só ops.

- [ ] **Step 1: Conferir commits locais**

```bash
git log --oneline origin/main..HEAD
```

Expected: 6 commits das Tasks 1-6.

- [ ] **Step 2: Suite backend completa**

```bash
cd backend && python3 -m pytest tests/ 2>&1 | tail -3
```

Expected: `97 passed, 5 failed` (os 5 são `test_admin_clickup_sync.py` pre-existentes).

- [ ] **Step 3: Build frontend full**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: `built in Xms` (sem erros). Pode levar ~10-14 min na primeira vez.

- [ ] **Step 4: Push**

```bash
git push origin main 2>&1 | tail -3
```

- [ ] **Step 5: Acompanhar deploy**

```bash
sleep 8
RUN_ID=$(gh run list --workflow=deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --exit-status 2>&1 | tail -3
gh run list --workflow=deploy.yml --limit 1
```

Expected: `completed success` em ~1-3 min. Se falhar com SSH timeout (já aconteceu várias vezes nessa sessão), aguardar ~90s e re-disparar via `gh workflow run deploy.yml --ref main`.

- [ ] **Step 6: Smoke baseline (sem auth)**

```bash
echo "=== sem auth ==="
curl -s -o /dev/null -w "/api/health                                : %{http_code}\n" https://docs.foundersledgrowth.online/api/health
curl -s -o /dev/null -w "/                                          : %{http_code}\n" https://docs.foundersledgrowth.online/
curl -s -o /dev/null -w "/clientes/abc/briefing-consultor (SPA)     : %{http_code}\n" https://docs.foundersledgrowth.online/clientes/abc/briefing-consultor
curl -s -o /dev/null -w "/api/briefings-consultor/cliente/abc/me    : %{http_code}\n" https://docs.foundersledgrowth.online/api/briefings-consultor/cliente/abc/me
curl -s -o /dev/null -w "/api/briefings-consultor/cliente/abc       : %{http_code}\n" https://docs.foundersledgrowth.online/api/briefings-consultor/cliente/abc
```

Expected:
- `/api/health` → 200
- `/` e `/clientes/abc/briefing-consultor` → 200 (SPA fallback HTML)
- Endpoints autenticados → 422 (FastAPI exige Authorization header)

- [ ] **Step 7: Smoke matriz manual do Pedro**

Pedido em texto pro Pedro:

> Matriz do sub-projeto 3:
>
> **Consultor** (sua sessão Pedro como consultor, se tiver, ou criar 1 de teste):
> 1. Abre `/clientes/<algum-id>` → no header vê botão pill gold **"Meu Briefing"** (não mais "Abrir Debriefings")
> 2. Click → cai em `/clientes/<id>/briefing-consultor` com header "Briefing do Consultor" + nome do cliente
> 3. Escreve um texto qualquer → vê "Salvando…" → "Salvo ✓"
> 4. Embaixo: vê cards de debriefings (se existirem pro cliente) → clica num card → expande inline com markdown + link "Baixar PDF"
> 5. Volta pro `/clientes/<id>` → o botão continua "Meu Briefing"
> 6. Recarrega `/clientes/<id>/briefing-consultor` → texto que escreveu está lá
>
> **Comercial** (cria um de teste ou usa existente):
> 1. Abre `/debriefings/cliente/<mesmo-id>` → no topo vê card "💡 Percepções dos consultores"
> 2. Vê o que o consultor escreveu (assinado, com tempo relativo)
> 3. Click "Ver completo" → expande
>
> **Diretor** (sua sessão Pedro):
> 1. Abre `/clientes/<id>` → vê botão pill gold "Abrir Debriefings" (NÃO "Meu Briefing", porque tem canSeeDebriefings)
> 2. Click → cai no hub do comercial → vê o card de percepções do consultor no topo
> 3. Pode digitar URL direta `/clientes/<id>/briefing-consultor` e escrever a percepção dele como consultor (porque diretor tem consultor_id também)
>
> **Owner** (Pedro pode confirmar): igual diretor.

- [ ] **Step 8: Atualizar HANDOFF**

Editar `docs/superpowers/HANDOFF-debriefings.md` movendo Sub-projeto 3 de "⏳ não iniciado" pra "✅ ENTREGUE em prod 2026-06-05" + listar commits do sprint.

```bash
git add docs/superpowers/HANDOFF-debriefings.md
git commit -m "docs(handoff): sub-projeto 3 do Subsistema Comercial entregue"
git push
```

---

## Self-review

**1. Spec coverage:**

| Spec section | Task | Status |
|---|---|---|
| §1 Objetivo | Tasks 2-6 | ✓ |
| §2 Contexto (sub-projetos 1+2 em prod) | n/a | ✓ |
| §3.1 Conteúdo livre + auto-save | Task 4 (useAutoSave) | ✓ |
| §3.2 PK (cliente_id, consultor_id), 1 por consultor por cliente | Tasks 1, 3 | ✓ |
| §3.3 Seção destacada no hub do comercial | Task 6 | ✓ |
| §3.4 Viewer inline (não rotear pra fora) | Task 4 (DebriefingCard) | ✓ |
| §3.5 Botão "Meu Briefing" mesma visual gold | Task 5 | ✓ |
| §4 Backend (migration + endpoints + gates) | Tasks 1, 2, 3 | ✓ |
| §5 Tela do consultor | Task 4 | ✓ |
| §6 Card no hub | Task 6 | ✓ |
| §7 Botão por persona | Task 5 | ✓ |
| §8 Out of scope | respeitado | ✓ |
| §9 Ordem de implementação | Tasks 1-7 seguem | ✓ |
| §10 Riscos | mitigados (auto-save concorrente aceito; SQL pedido em Task 1) | ✓ |
| §11 Critérios de aceitação | cobertos via tests + smoke matriz | ✓ |

Nenhuma gap detectada.

**2. Placeholder scan:** plano não contém "TBD", "TODO", "fill in details". Steps de código têm código completo. Step 2 da Task 6 (integrar `<BriefingPercepcoesCard />`) é descritivo do local — aceitável porque o local exato depende de como ClienteHub.jsx está estruturado e o implementer precisa decidir contextualmente. Posicionamento ("antes da lista de debriefings, depois do header") é específico o suficiente.

**3. Type consistency:**
- `useAutoSave(endpoint, field, value)` na Task 4 bate com signature do hook em `useAutoSave.jsx`
- PATCH `/briefings-consultor/cliente/:id/me` body `{conteudo: val}` (Task 4 chama via `useAutoSave` com `field='conteudo'` → body é `{conteudo: val}`) bate com `BriefingPayload(conteudo: str)` da Task 3
- `GET /briefings-consultor/cliente/:id` retorna `[{consultor_id, consultor_nome, conteudo, atualizado_em}]` (Task 3) — Task 6 usa esses campos corretamente
- `GET /briefings-consultor/cliente/:id/me` retorna `{conteudo, atualizado_em}` (Task 3) — Task 4 lê só `conteudo` (ignora atualizado_em após mount) ✓
- Helper `require_debriefings_or_consultor` (Task 2) usado em 3 GETs de debriefings; Task 4 frontend depende disso pra consultor ler `/debriefings/...` ✓
- `myConsultorId` da Task 5 bate com `consultor_id` do `useUserScope` exposto desde sub-projeto 1

Sem inconsistências.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-05-debriefing-subproject-3-briefing-consultor.md`.**
