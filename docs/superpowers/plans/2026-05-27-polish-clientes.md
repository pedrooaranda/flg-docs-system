# Polish UI Clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cards de cliente clicáveis com layout didático, métricas IG inline, skeletons que mimicam layout final, empty states ilustrados, micro-animações Framer Motion. Novo endpoint backend agrega métricas pra evitar N+1.

**Architecture:** Backend novo endpoint `/clientes/summary` faz 3 queries batch + 1 query base. Frontend extrai `ClientCard` inline pra arquivo próprio, adiciona `ClientCardSkeleton`/`EmptyClientes`/`useClientesSummary` hook. Refactor de `Clientes.jsx` orquestra tudo. Sem nova dependência (Framer já no projeto).

**Tech Stack:** Python 3.12 + FastAPI + supabase-py + pytest. React 18 + Vite + Tailwind + Framer Motion + lucide-react.

**Spec:** [docs/superpowers/specs/2026-05-27-polish-clientes-design.md](../specs/2026-05-27-polish-clientes-design.md)

---

## Task 1: Backend — endpoint /clientes/summary (TDD)

**Files:**
- Modify: `backend/main.py` (adiciona endpoint logo após `list_clientes`)
- Create: `backend/tests/test_clientes_summary.py`

- [ ] **Step 1: Escrever tests primeiro**

```python
"""Tests pro GET /clientes/summary — agrega métricas IG por cliente."""
import pytest
from unittest.mock import MagicMock, patch

from lib.auth_scope import UserScope


def _scope_admin():
    return UserScope(user_id="u-a", email="a@grupoguglielmi.com",
                     can_see_all=True, consultor_id="a-id", consultor_nome="Admin",
                     categoria="diretor", role="admin")


def _scope_consultor():
    return UserScope(user_id="u-l", email="lucas@grupoguglielmi.com",
                     can_see_all=False, consultor_id="lucas-id", consultor_nome="Lucas Nery",
                     categoria="consultor", role="member")


async def test_summary_admin_inclui_metricas_ig(mock_main_supabase):
    """Admin → recebe todos clientes + métricas IG agregadas inline."""
    from main import list_clientes_summary

    # Mock retorno de cada query
    def execute_side_effect():
        return None
    # 1ª chamada: lista de clientes
    # 2ª chamada: métricas IG (último seguidores + avg engajamento)
    # 3ª chamada: instagram_posts (último post)
    # 4ª chamada: instagram_conexoes (status='ativo')
    mock_main_supabase.table().select().is_().order().execute.return_value = MagicMock(
        data=[
            {"id": "c1", "nome": "Cliente A", "empresa": "E A", "consultor_id": "lucas-id",
             "consultor_responsavel": "Lucas Nery", "encontro_atual": 5, "status": "ativo",
             "archived_at": None, "updated_at": "2026-05-26T00:00:00Z",
             "created_at": "2026-05-01T00:00:00Z"}
        ]
    )

    result = await list_clientes_summary(
        consultor_id=None, include_archived=False, scope=_scope_admin()
    )

    assert isinstance(result, list)
    assert len(result) == 1
    c = result[0]
    # Campos básicos preservados
    assert c["id"] == "c1"
    assert c["nome"] == "Cliente A"
    # Campos novos de métricas presentes (mesmo se null)
    assert "seguidores_atual" in c
    assert "taxa_engajamento_pct" in c
    assert "dias_sem_postar" in c
    assert "instagram_conectado" in c


async def test_summary_consultor_filtra_por_scope(mock_main_supabase):
    """Consultor regular → só clientes onde consultor_id = self.id."""
    from main import list_clientes_summary

    mock_main_supabase.table().select().eq().is_().order().execute.return_value = MagicMock(data=[])

    result = await list_clientes_summary(
        consultor_id=None, include_archived=False, scope=_scope_consultor()
    )

    assert isinstance(result, list)
    # Confirma filtro WHERE consultor_id = lucas-id foi aplicado
    eq_calls = mock_main_supabase.table().select().eq.call_args_list
    consultor_filter = [c for c in eq_calls
                        if c.args[0] == "consultor_id" and c.args[1] == "lucas-id"]
    assert len(consultor_filter) >= 1


async def test_summary_consultor_sem_id_retorna_vazio(mock_main_supabase):
    """Consultor sem consultor_id (user externo sem ficha) → lista vazia."""
    from main import list_clientes_summary

    scope_sem_id = UserScope(user_id="u-x", email="x@example.com",
                              can_see_all=False, consultor_id=None,
                              consultor_nome=None, categoria=None, role=None)

    result = await list_clientes_summary(
        consultor_id=None, include_archived=False, scope=scope_sem_id
    )
    assert result == []


async def test_summary_admin_include_archived_true(mock_main_supabase):
    """Admin com ?include_archived=true não filtra archived."""
    from main import list_clientes_summary

    mock_main_supabase.table().select().order().execute.return_value = MagicMock(data=[])

    await list_clientes_summary(
        consultor_id=None, include_archived=True, scope=_scope_admin()
    )

    # NÃO deve ter chamado .is_("archived_at", "null")
    is_calls = mock_main_supabase.table().select().is_.call_args_list
    archived_filters = [c for c in is_calls if c.args[0] == "archived_at"]
    assert len(archived_filters) == 0
```

- [ ] **Step 2: Rodar test pra ver falhar**

Run: `cd backend && python3 -m pytest tests/test_clientes_summary.py -v 2>&1 | tail -15`
Expected: ImportError ou 404 — endpoint não existe

- [ ] **Step 3: Adicionar endpoint em main.py**

Localize `async def list_clientes(...)` em `backend/main.py`. Adicione LOGO APÓS a função:

```python
@app.get("/clientes/summary")
async def list_clientes_summary(
    consultor_id: Optional[str] = None,
    include_archived: bool = False,
    scope: UserScope = Depends(get_user_scope),
):
    """
    Lista clientes com métricas IG agregadas inline (último seguidores,
    taxa engajamento média 30d, dias sem postar, conectado).

    Endpoint separado de /clientes pra não onerar callers que só precisam
    dos campos básicos (AppContext, Dashboard, etc).

    Mesma regra de scope/archived que /clientes.
    """
    # 1. Query base: clientes filtrados
    query = _supabase.table("clientes").select(
        "id, nome, empresa, consultor_responsavel, consultor_id, "
        "encontro_atual, status, archived_at, updated_at, created_at"
    )

    if not scope.can_see_all:
        if scope.consultor_id is None:
            return []
        query = query.eq("consultor_id", scope.consultor_id)
        query = query.is_("archived_at", "null")
    else:
        if consultor_id:
            query = query.eq("consultor_id", consultor_id)
        if not include_archived:
            query = query.is_("archived_at", "null")

    clientes = (query.order("created_at", desc=True).execute().data) or []
    if not clientes:
        return []

    cliente_ids = [c["id"] for c in clientes]

    # 2. Últimas métricas IG por cliente (1 query batch)
    # Pega TODAS metricas_diarias dos clientes filtrados, depois agrupa em Python
    # pelo último data desc — mais simples que window function via Supabase REST
    try:
        metricas_resp = _supabase.table("metricas_diarias_instagram").select(
            "cliente_id, data, seguidores, taxa_engajamento"
        ).in_("cliente_id", cliente_ids).order("data", desc=True).execute()
        metricas_rows = metricas_resp.data or []
    except Exception:
        metricas_rows = []

    # Agrupa: por cliente_id, pega o mais recente + média de engajamento 30d
    metricas_por_cliente = {}
    for row in metricas_rows:
        cid = row["cliente_id"]
        if cid not in metricas_por_cliente:
            metricas_por_cliente[cid] = {
                "seguidores_atual": row.get("seguidores"),
                "engajamentos": [],
            }
        eng = row.get("taxa_engajamento")
        if eng is not None:
            metricas_por_cliente[cid]["engajamentos"].append(float(eng))

    # 3. Último post por cliente (pra dias_sem_postar)
    try:
        posts_resp = _supabase.table("instagram_posts").select(
            "cliente_id, posted_at"
        ).in_("cliente_id", cliente_ids).order("posted_at", desc=True).execute()
        posts_rows = posts_resp.data or []
    except Exception:
        posts_rows = []

    ultimo_post_por_cliente = {}
    for row in posts_rows:
        cid = row["cliente_id"]
        if cid not in ultimo_post_por_cliente:
            ultimo_post_por_cliente[cid] = row.get("posted_at")

    # 4. Quem está com IG conectado
    try:
        conex_resp = _supabase.table("instagram_conexoes").select(
            "cliente_id, status"
        ).in_("cliente_id", cliente_ids).eq("status", "ativo").execute()
        conectados = {row["cliente_id"] for row in (conex_resp.data or [])}
    except Exception:
        conectados = set()

    # 5. Compose
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    result = []
    for c in clientes:
        cid = c["id"]
        m = metricas_por_cliente.get(cid, {})
        engs = m.get("engajamentos", [])
        taxa_media = round(sum(engs) / len(engs), 2) if engs else None

        ultimo_post = ultimo_post_por_cliente.get(cid)
        dias_sem_postar = None
        if ultimo_post:
            try:
                last_dt = datetime.fromisoformat(ultimo_post.replace("Z", "+00:00"))
                dias_sem_postar = (now - last_dt).days
            except Exception:
                pass

        result.append({
            **c,
            "seguidores_atual": m.get("seguidores_atual"),
            "taxa_engajamento_pct": taxa_media,
            "dias_sem_postar": dias_sem_postar,
            "instagram_conectado": cid in conectados,
        })

    return result
```

Não esquecer: o import do `Optional` já existe se foi adicionado pra `list_clientes` Stream 6. Verifique.

- [ ] **Step 4: Rodar tests, todos passam**

Run: `cd backend && python3 -m pytest tests/test_clientes_summary.py -v 2>&1 | tail -10`
Expected: `4 passed`

- [ ] **Step 5: Suite completa**

Run: `cd backend && python3 -m pytest tests/ 2>&1 | tail -3`
Expected: `~70 passed` (66 baseline + 4 novos)

- [ ] **Step 6: Validar syntax**

Run: `cd backend && python3 -m py_compile main.py && echo OK`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/tests/test_clientes_summary.py
git commit -m "feat(backend): GET /clientes/summary agrega métricas IG inline"
```

---

## Task 2: Frontend — helper humanize-date.js

**Files:**
- Create: `frontend/src/lib/humanize-date.js`

- [ ] **Step 1: Criar arquivo**

```javascript
/**
 * Humaniza intervalos de tempo em pt-BR.
 *   humanizeDate('2026-05-27T00:00:00Z')  // → "hoje"
 *   humanizeDate(dateString_2_dias_atras)  // → "2 dias atrás"
 *   humanizeDate(dateString_15_dias)        // → "2 sem"
 *   humanizeDate(dateString_45_dias)        // → "1 mês"
 *
 * Retorna "" se input inválido (não estoura).
 */

export function humanizeDate(iso) {
  if (!iso) return ''
  let dt
  try {
    dt = new Date(iso)
    if (isNaN(dt.getTime())) return ''
  } catch {
    return ''
  }

  const now = new Date()
  const diffMs = now.getTime() - dt.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays < 0) return 'futuro'
  if (diffDays === 0) return 'hoje'
  if (diffDays === 1) return 'ontem'
  if (diffDays < 7) return `${diffDays} dias atrás`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return weeks === 1 ? '1 sem' : `${weeks} sem`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return months === 1 ? '1 mês' : `${months} meses`
  }
  const years = Math.floor(diffDays / 365)
  return years === 1 ? '1 ano' : `${years} anos`
}
```

- [ ] **Step 2: Validar esbuild**

Run: `cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/lib/humanize-date.js > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/humanize-date.js
git commit -m "feat(lib): humanize-date helper pra intervalos em pt-BR"
```

---

## Task 3: Frontend — hook useClientesSummary

**Files:**
- Create: `frontend/src/hooks/useClientesSummary.js`

- [ ] **Step 1: Criar hook**

```javascript
/**
 * useClientesSummary — fetch /clientes/summary com métricas IG agregadas.
 *
 * Usado pela tela /clientes pra ter cards ricos sem N+1 requests.
 * Outros lugares (Dashboard, AppContext) continuam usando GET /clientes
 * normal sem o overhead.
 *
 * Retorna: { clientes, isLoading, error, refetch }
 */
import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export function useClientesSummary({ consultorId, includeArchived = false } = {}) {
  const [state, setState] = useState({
    clientes: [],
    isLoading: true,
    error: null,
  })

  const fetchSummary = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }))
    try {
      const params = new URLSearchParams()
      if (consultorId) params.set('consultor_id', consultorId)
      if (includeArchived) params.set('include_archived', 'true')
      const qs = params.toString()
      const path = `/clientes/summary${qs ? `?${qs}` : ''}`
      const data = await api(path)
      setState({ clientes: Array.isArray(data) ? data : [], isLoading: false, error: null })
    } catch (err) {
      setState({ clientes: [], isLoading: false, error: err?.message || 'Falha ao carregar clientes' })
    }
  }, [consultorId, includeArchived])

  useEffect(() => {
    let cancelled = false
    fetchSummary().catch(() => {})
    return () => { cancelled = true }
  }, [fetchSummary])

  return { ...state, refetch: fetchSummary }
}
```

- [ ] **Step 2: Validar esbuild**

Run: `cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/hooks/useClientesSummary.js > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useClientesSummary.js
git commit -m "feat(frontend): hook useClientesSummary fetching /clientes/summary"
```

---

## Task 4: Frontend — componente ClientCardSkeleton

**Files:**
- Create: `frontend/src/components/Clientes/ClientCardSkeleton.jsx`

- [ ] **Step 1: Criar componente**

```jsx
/**
 * ClientCardSkeleton — placeholder visual durante load do /clientes/summary.
 * Mimica EXATAMENTE o layout do ClientCard final (zero layout shift / CLS).
 */
export default function ClientCardSkeleton() {
  return (
    <div className="card-flg p-5 animate-pulse">
      {/* Linha 1: status + encontro */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-20 rounded bg-white/10" />
        <div className="h-5 w-10 rounded-full bg-white/10" />
      </div>

      {/* Linha 2: avatar + nome + empresa */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded bg-white/10" />
          <div className="h-3 w-24 rounded bg-white/5" />
        </div>
      </div>

      {/* Linha 3: progresso */}
      <div className="space-y-2 mb-3">
        <div className="flex justify-between">
          <div className="h-3 w-16 rounded bg-white/5" />
          <div className="h-3 w-12 rounded bg-white/5" />
        </div>
        <div className="h-1.5 bg-white/5 rounded-full" />
      </div>

      {/* Linha 4: métricas IG (3 blocos) */}
      <div className="flex items-center gap-4 mb-3">
        <div className="h-3 w-14 rounded bg-white/5" />
        <div className="h-3 w-14 rounded bg-white/5" />
        <div className="h-3 w-14 rounded bg-white/5" />
      </div>

      {/* Linha 5: consultor + data */}
      <div className="flex justify-between">
        <div className="h-3 w-20 rounded bg-white/5" />
        <div className="h-3 w-16 rounded bg-white/5" />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Validar esbuild**

Run: `mkdir -p frontend/src/components/Clientes && cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Clientes/ClientCardSkeleton.jsx > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Clientes/ClientCardSkeleton.jsx
git commit -m "feat(clientes): ClientCardSkeleton mimica layout final (zero CLS)"
```

---

## Task 5: Frontend — componente EmptyClientes

**Files:**
- Create: `frontend/src/components/Clientes/EmptyClientes.jsx`

- [ ] **Step 1: Criar componente**

```jsx
/**
 * EmptyClientes — empty state ilustrado pra tela /clientes.
 *
 * 3 variantes (prop `variant`):
 *   'no_results' — filtros zeram resultado (busca + status + consultor)
 *   'empty'      — consultor sem clientes (ainda não foi atribuído)
 *   'error'      — fetch falhou (network/500)
 */
import { Search, UserPlus, AlertTriangle } from 'lucide-react'

const VARIANTS = {
  no_results: {
    icon: Search,
    iconColor: 'rgba(255,255,255,0.25)',
    title: 'Nenhum cliente encontrado',
    hint: 'Ajuste a busca ou troque o consultor selecionado',
  },
  empty: {
    icon: UserPlus,
    iconColor: '#C9A84C',
    title: 'Você ainda não tem clientes',
    hint: 'Peça pro admin atribuir clientes a você',
  },
  error: {
    icon: AlertTriangle,
    iconColor: '#EF4444',
    title: 'Erro ao carregar clientes',
    hint: '',  // preenchido via prop `errorMessage`
  },
}

export default function EmptyClientes({ variant = 'no_results', errorMessage, onAction, actionLabel }) {
  const cfg = VARIANTS[variant] || VARIANTS.no_results
  const Icon = cfg.icon
  const hint = variant === 'error' ? (errorMessage || cfg.hint) : cfg.hint

  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: `${cfg.iconColor}15`,
          border: `1px solid ${cfg.iconColor}30`,
        }}
      >
        <Icon size={28} style={{ color: cfg.iconColor }} />
      </div>
      <h3 className="text-white/85 text-sm font-semibold mb-1.5">{cfg.title}</h3>
      {hint && (
        <p className="text-white/35 text-xs max-w-sm mb-5">{hint}</p>
      )}
      {onAction && actionLabel && (
        <button onClick={onAction} className="btn-outline-gold text-xs px-4 py-2">
          {actionLabel}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Validar esbuild**

Run: `cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Clientes/EmptyClientes.jsx > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Clientes/EmptyClientes.jsx
git commit -m "feat(clientes): EmptyClientes ilustrado (no_results, empty, error)"
```

---

## Task 6: Frontend — ClientCard novo (extraído + redesenhado)

**Files:**
- Create: `frontend/src/components/Clientes/ClientCard.jsx`

- [ ] **Step 1: Criar componente**

```jsx
/**
 * ClientCard — card visual de cliente na tela /clientes.
 *
 * Layout: status semáforo + encontro | avatar + nome + empresa |
 * progresso jornada | métricas IG (se conectado) | consultor + última atividade.
 *
 * Click no card abre /clientes/:id. Sem overlay com botões (causava bug do click).
 * Hover lift -2px + gold-tinted shadow. Tap feedback brief.
 */
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Users, BarChart3 } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { humanizeDate } from '../../lib/humanize-date'
import { progressPercent } from '../../lib/utils'

// Status semáforo baseado em status + dias_sem_postar
function getSemaforoColor(cliente) {
  if (cliente.status === 'pausado') return { color: '#FBBF24', label: 'Pausado' }   // amber
  if (cliente.status === 'concluido') return { color: '#6B7280', label: 'Encerrado' } // gray (edge)
  if ((cliente.dias_sem_postar ?? 0) > 7) return { color: '#EF4444', label: 'Alerta' }  // red
  return { color: '#10B981', label: 'Ativo' }   // green
}

function formatNumber(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function ClientCard({ cliente, delay = 0 }) {
  const navigate = useNavigate()
  const pct = progressPercent(cliente.encontro_atual || 1, 15)
  const semaforo = getSemaforoColor(cliente)
  const hasIG = cliente.instagram_conectado === true

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => navigate(`/clientes/${cliente.id}`)}
      className="card-flg p-5 cursor-pointer transition-shadow hover:shadow-[0_8px_24px_rgba(201,168,76,0.15)]"
    >
      {/* Linha 1: status semáforo + encontro */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: semaforo.color, boxShadow: `0 0 8px ${semaforo.color}80` }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: semaforo.color }}>
            {semaforo.label}
          </span>
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{
            background: 'rgba(201,168,76,0.15)',
            color: '#C9A84C',
            border: '1px solid rgba(201,168,76,0.25)',
          }}
        >
          E{cliente.encontro_atual || 1}
        </span>
      </div>

      {/* Linha 2: avatar + nome + empresa */}
      <div className="flex items-start gap-3 mb-4">
        <Avatar name={cliente.nome} size="md" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white/90 text-sm truncate">{cliente.nome}</p>
          {cliente.empresa && cliente.empresa !== cliente.nome && (
            <p className="text-xs text-white/40 truncate mt-0.5">{cliente.empresa}</p>
          )}
        </div>
      </div>

      {/* Linha 3: progresso jornada */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-xs text-white/30">
          <span>Jornada</span>
          <span>{cliente.encontro_atual || 1} / 15</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, delay: delay + 0.2, ease: 'easeOut' }}
            className="h-full rounded-full gold-gradient"
          />
        </div>
      </div>

      {/* Linha 4: métricas IG (só se conectado) */}
      {hasIG && (
        <div className="flex items-center gap-4 mb-3 text-xs">
          <span className="flex items-center gap-1 text-white/50">
            <Users size={12} />
            {formatNumber(cliente.seguidores_atual)}
          </span>
          <span className="flex items-center gap-1 text-white/50">
            <BarChart3 size={12} />
            {cliente.taxa_engajamento_pct != null ? `${cliente.taxa_engajamento_pct}%` : '—'}
          </span>
          {cliente.dias_sem_postar != null && (
            <span
              className="flex items-center gap-1"
              style={{
                color: cliente.dias_sem_postar > 7 ? '#EF4444' : cliente.dias_sem_postar > 3 ? '#FBBF24' : 'rgba(255,255,255,0.5)'
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
              {cliente.dias_sem_postar === 0 ? 'hoje' : `${cliente.dias_sem_postar}d`}
            </span>
          )}
        </div>
      )}

      {/* Linha 5: consultor + última atividade */}
      <div className="flex items-center justify-between text-xs">
        <p className="text-white/35 truncate flex-1 mr-2">{cliente.consultor_responsavel || '—'}</p>
        {cliente.updated_at && (
          <p className="text-white/25 flex-shrink-0">{humanizeDate(cliente.updated_at)}</p>
        )}
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Validar esbuild**

Run: `cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Clientes/ClientCard.jsx > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Clientes/ClientCard.jsx
git commit -m "feat(clientes): ClientCard novo (clicável + status semáforo + métricas IG inline)"
```

---

## Task 7: Frontend — refactor Clientes.jsx pra usar novos componentes

**Files:**
- Modify: `frontend/src/components/Clientes.jsx`

- [ ] **Step 1: Backup mental do que está em Clientes.jsx**

Estrutura atual (linhas relevantes):
- Linha 22-92: `function ClientCard(...)` — vai SAIR (extraído pra arquivo próprio)
- Linha 94-113: `function StatusSection(...)` — mantém (mas usa ClientCard novo)
- Linha 452-482: bloco de render (loading skeleton, empty, table/cards)
- Linha 309+: hook `useApp().clientes` — vai trocar por `useClientesSummary()`

- [ ] **Step 2: Atualizar imports no topo**

Adicionar:
```jsx
import ClientCard from './Clientes/ClientCard'
import ClientCardSkeleton from './Clientes/ClientCardSkeleton'
import EmptyClientes from './Clientes/EmptyClientes'
import { useClientesSummary } from '../hooks/useClientesSummary'
import { AnimatePresence } from 'framer-motion'
```

Remover (se ainda no arquivo):
- `import { SkeletonCard } from './ui/Skeleton'` (vamos usar ClientCardSkeleton novo)
- Funções inline `function ClientCard` (linhas 22-92) — DELETAR inteiras

- [ ] **Step 3: Trocar source de dados**

Localize:
```jsx
const { clientes: allClientes, loading } = useApp()
```

Substituir por:
```jsx
const { clientes: allClientes, isLoading: loading, error } = useClientesSummary()
```

(Mantém variável `allClientes` pra resto do código continuar funcionando)

- [ ] **Step 4: Substituir bloco de render do conteúdo (linhas ~451-482)**

Localize o bloco que começa com `{/* Conteúdo */}` e vai até o `</div>` que fecha o `<div className="p-6 max-w-7xl mx-auto">`.

Substituir TODO o trecho de conteúdo (loading + empty + table/cards) por:

```jsx
      {/* Conteúdo */}
      {loading && allClientes.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <ClientCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <EmptyClientes
          variant="error"
          errorMessage={error}
          actionLabel="Tentar novamente"
          onAction={() => window.location.reload()}
        />
      ) : filtered.length === 0 ? (
        allClientes.length === 0 && !canSeeAll ? (
          <EmptyClientes
            variant="empty"
            actionLabel="Falar com admin"
            onAction={() => window.location.href = 'mailto:pedroaranda@grupoguglielmi.com'}
          />
        ) : (
          <EmptyClientes
            variant="no_results"
            actionLabel="Limpar filtros"
            onAction={() => {
              setSearch('')
              setFilterStatus('todos')
              setFilterConsultor('todos')
            }}
          />
        )
      ) : viewMode === 'table' ? (
        <ClientTable
          data={filtered}
          canSeeAll={canSeeAll}
          onPreparar={handlePreparar}
          onMateriais={handleMateriais}
        />
      ) : (
        /* Modo cards */
        filterStatus !== 'todos' ? (
          <AnimatePresence mode="popLayout">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((c, i) => (
                <ClientCard key={c.id} cliente={c} delay={i * 0.04} />
              ))}
            </div>
          </AnimatePresence>
        ) : (
          <>
            <StatusSection label="Ativos"   clientes={ativos}   />
            <StatusSection label="Pausados" clientes={pausados} />
          </>
        )
      )}
    </div>
  )
}
```

- [ ] **Step 5: Atualizar StatusSection pra novo ClientCard (sem props Preparar/Materiais)**

Localize `function StatusSection(...)` (linha ~94). Substituir corpo por:

```jsx
function StatusSection({ label, clientes }) {
  if (clientes.length === 0) return null
  return (
    <div className="mb-8">
      <h3 className="text-xs font-medium tracking-widest uppercase text-white/30 mb-4">{label} · {clientes.length}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {clientes.map((c, i) => (
          <ClientCard key={c.id} cliente={c} delay={i * 0.03} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Remover handlePreparar e handleMateriais se não mais usados**

Run: `grep -n "handlePreparar\|handleMateriais" frontend/src/components/Clientes.jsx`

Se aparecerem APENAS na definição (não usados em mais lugares) ou só em `ClientTable`, mantém os do ClientTable e remove os passados a StatusSection. Se aparecerem em outro lugar não relacionado, mantém.

- [ ] **Step 7: Validar esbuild**

Run: `cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Clientes.jsx > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 8: Commit + push (todos commits da feature vão juntos)**

```bash
git add frontend/src/components/Clientes.jsx
git commit -m "refactor(clientes): usa /clientes/summary + ClientCard novo + skeletons + empty"
git push
```

---

## Task 8: Smoke test manual (Pedro)

**Files:** nenhum

- [ ] **Step 1: Aguardar deploy passar**

Run: `gh run list --workflow=deploy.yml --limit=1 --json status,conclusion`
Expected: `success`

- [ ] **Step 2: Smoke checklist**

- [ ] Abrir `/clientes` (Ctrl+Shift+R pra bundle novo)
- [ ] Skeleton aparece durante load (efeito pulse)
- [ ] Cards renderizam com novo layout (status semáforo verde/amarelo/vermelho, métricas IG inline pra quem tem)
- [ ] Click em qualquer card → abre `/clientes/:id` (perfil)
- [ ] Hover: card lift suave + shadow gold
- [ ] Tap: scale brief
- [ ] Filtro vazio (busca por XYZ inexistente) → empty state ilustrado "Nenhum cliente encontrado" + botão "Limpar filtros"
- [ ] Botão "Limpar filtros" zera search/status/consultor
- [ ] Trocar consultor no ConsultorFilter → cards trocam suavemente (AnimatePresence)
- [ ] Modo tabela continua funcionando (botão LayoutGrid/List no header)

- [ ] **Step 3: DevTools Network**

- [ ] Verificar que `GET /clientes/summary` retorna 200 com array de objetos
- [ ] Cada objeto tem `seguidores_atual`, `taxa_engajamento_pct`, `dias_sem_postar`, `instagram_conectado`
- [ ] Latência razoável (<500ms)

---

## Verificação de cobertura da spec

| Spec section | Task(s) que cobre |
|---|---|
| 2 Endpoint /clientes/summary | Task 1 |
| 3.1 Click-through fix | Task 6 (sem overlay) + Task 7 (StatusSection sem props) |
| 3.2 Novo layout | Task 6 |
| 3.3 ClientCard extraído | Task 6 |
| 4.1 ClientCardSkeleton | Task 4 |
| 4.2 EmptyClientes 3 variantes | Task 5 |
| 4.3 Micro-animações Framer | Task 6 (whileHover/whileTap) + Task 7 (AnimatePresence) |
| humanizeDate | Task 2 |
| hook useClientesSummary | Task 3 |
| Refactor Clientes.jsx | Task 7 |
| Smoke manual | Task 8 |
