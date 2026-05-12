# Colaboradores — Phase 2: Frontend Skeleton

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-10-colaboradores-design.md](../specs/2026-05-10-colaboradores-design.md)

**Goal:** Adicionar item "Colaboradores" na sidebar (abaixo de Copywriter FLG, ícone `UserCog`), criar rota `/colaboradores` com tabs Consultores/Diretores (URL `?tab=`) e tabela read-only consumindo `GET /api/colaboradores`. Read-only — toda mutação (modal criar/editar/desativar) entra em Phase 3.

**Architecture:** Mesmo padrão da Phase 1 do Ranking entregue dia 10 — pasta `Colaboradores/` com `index.jsx` orquestrando fetch + tabs + roteamento por categoria. Phase 2 deliberadamente compacta tudo em **1 único arquivo** (`index.jsx` ~180 linhas) — Phase 3 vai extrair `ColaboradorRow`, `ColaboradorFormModal`, `TierBadge`, `RoleBadge` em `shared/` quando adicionar CRUD. YAGNI: não pré-otimizar split antes da divergência real entre abas.

**Tech Stack:** React 18, React Router v6 (`useSearchParams`), Tailwind, lucide-react (`UserCog`, `Users2`), helper `api()` de `lib/api.js` que injeta Bearer token automaticamente. Validação via `esbuild --bundle=false --loader:.jsx=jsx`.

**Não-objetivos:**
- Sem botões de criar/editar/desativar (Phase 3)
- Sem badges coloridos para tier/role (Phase 3)
- Sem filtros de busca ou checkbox "só admins" (Phase 3)
- Sem helper `isOwner()` (Phase 4)

---

## File Structure

**Criar:**
- `frontend/src/components/Colaboradores/index.jsx` — orquestrador completo (header + tabs + fetch + tabela inline)

**Modificar:**
- `frontend/src/components/layout/Sidebar.jsx` — adicionar `UserCog` ao import + item "Colaboradores" em `consultantNav` E `adminNav` na posição 7 (após "Copywriter FLG")
- `frontend/src/App.jsx` — adicionar `lazy()` import + `<Route path="/colaboradores">` na ordem do app (entre `/ranking` e `/materiais` ou onde fizer sentido — escolhemos entre `/copywriter` e `/admin` pra agrupar com features de operação interna)

---

## Tarefas

### Task 1: Adicionar "Colaboradores" na Sidebar

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Adicionar `UserCog` ao import do lucide-react**

Localizar o bloco de import no topo do arquivo:

```bash
grep -n "from 'lucide-react'" frontend/src/components/layout/Sidebar.jsx
```

Expected: linha tipo `from 'lucide-react'` que importa `LayoutDashboard, Users, FileText, PenTool, Brain, Bot, Settings, LogOut, ChevronLeft, ChevronRight, BarChart2, Trophy`.

Substituir o bloco de import atual:

```jsx
import {
  LayoutDashboard, Users, FileText, PenTool,
  Brain, Bot, Settings, LogOut,
  ChevronLeft, ChevronRight, BarChart2, Trophy,
} from 'lucide-react'
```

por:

```jsx
import {
  LayoutDashboard, Users, FileText, PenTool,
  Brain, Bot, Settings, LogOut,
  ChevronLeft, ChevronRight, BarChart2, Trophy, UserCog,
} from 'lucide-react'
```

- [ ] **Step 2: Adicionar item "Colaboradores" ao `consultantNav`**

Localizar a constante `consultantNav` e substituir:

```jsx
const consultantNav = [
  { icon: LayoutDashboard, label: 'Home',    path: '/' },
  { icon: Users,          label: 'Meus Clientes', path: '/clientes', matchPrefix: true },
  { icon: BarChart2,      label: 'Métricas',       path: '/metricas', matchPrefix: true },
  { icon: Trophy,         label: 'Ranking',        path: '/ranking' },
  { icon: FileText,       label: 'Materiais',      path: '/materiais' },
  { icon: PenTool,        label: 'Copywriter FLG', path: '/copywriter' },
]
```

por:

```jsx
const consultantNav = [
  { icon: LayoutDashboard, label: 'Home',    path: '/' },
  { icon: Users,          label: 'Meus Clientes', path: '/clientes', matchPrefix: true },
  { icon: BarChart2,      label: 'Métricas',       path: '/metricas', matchPrefix: true },
  { icon: Trophy,         label: 'Ranking',        path: '/ranking' },
  { icon: FileText,       label: 'Materiais',      path: '/materiais' },
  { icon: PenTool,        label: 'Copywriter FLG', path: '/copywriter' },
  { icon: UserCog,        label: 'Colaboradores',  path: '/colaboradores' },
]
```

- [ ] **Step 3: Adicionar item "Colaboradores" ao `adminNav`**

Localizar a constante `adminNav` e substituir:

```jsx
const adminNav = [
  { icon: LayoutDashboard, label: 'Home',  path: '/' },
  { icon: Users,          label: 'Clientes',     path: '/clientes', matchPrefix: true },
  { icon: BarChart2,      label: 'Métricas',      path: '/metricas', matchPrefix: true },
  { icon: Trophy,         label: 'Ranking',       path: '/ranking' },
  { icon: FileText,       label: 'Materiais',    path: '/materiais' },
  { icon: PenTool,        label: 'Copywriter FLG', path: '/copywriter' },
]
```

por:

```jsx
const adminNav = [
  { icon: LayoutDashboard, label: 'Home',  path: '/' },
  { icon: Users,          label: 'Clientes',     path: '/clientes', matchPrefix: true },
  { icon: BarChart2,      label: 'Métricas',      path: '/metricas', matchPrefix: true },
  { icon: Trophy,         label: 'Ranking',       path: '/ranking' },
  { icon: FileText,       label: 'Materiais',    path: '/materiais' },
  { icon: PenTool,        label: 'Copywriter FLG', path: '/copywriter' },
  { icon: UserCog,        label: 'Colaboradores',  path: '/colaboradores' },
]
```

- [ ] **Step 4: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/layout/Sidebar.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/Sidebar.jsx
git commit -m "feat(colaboradores): adiciona item Colaboradores na sidebar (ambos navs)"
```

---

### Task 2: Criar `Colaboradores/index.jsx`

**Files:**
- Create: `frontend/src/components/Colaboradores/index.jsx`

- [ ] **Step 1: Criar a pasta + arquivo**

```bash
mkdir -p frontend/src/components/Colaboradores
```

- [ ] **Step 2: Criar `index.jsx` com conteúdo completo**

```jsx
/**
 * Colaboradores — orquestrador das abas Consultores / Diretores.
 *
 * Phase 2 = read-only. Fetch único de `/colaboradores`, filtra por categoria
 * client-side por aba ativa. URL `?tab=consultores|diretores` (bookmarkable).
 *
 * Phase 3 vai adicionar:
 *   - Botão "+ Adicionar colaborador" (admin only) abrindo modal
 *   - Botões de edição/desativação inline na linha (admin only)
 *   - Badges coloridos pra tier e role
 *   - Filtros (busca, tier, só admins)
 *
 * Phase 4 vai adicionar:
 *   - Empty state mais rico
 *   - Loading skeletons
 *   - Helper isOwner() em lib/utils.js
 */

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { UserCog } from 'lucide-react'
import { api } from '../../lib/api'
import { Avatar } from '../ui/Avatar'

const TABS = [
  { key: 'consultores', label: 'Consultores', categoria: 'consultor' },
  { key: 'diretores',   label: 'Diretores',   categoria: 'diretor' },
]

export default function Colaboradores() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabAtiva = TABS.find(t => t.key === searchParams.get('tab'))?.key || 'consultores'
  const activeCategoria = TABS.find(t => t.key === tabAtiva).categoria

  const [colaboradores, setColaboradores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api('/colaboradores')
      .then(d => setColaboradores(d.colaboradores || []))
      .catch(e => {
        setColaboradores([])
        setError(e.message || 'Erro ao carregar colaboradores')
      })
      .finally(() => setLoading(false))
  }, [])

  function handleTabClick(key) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  // Filtra apenas colaboradores ATIVOS da categoria da aba.
  // O backend já retorna ativo=true por default (filtro opt-in via ?ativo=false),
  // mas re-filtramos client-side por segurança caso o default mude.
  const filtered = colaboradores.filter(
    c => c.categoria === activeCategoria && c.ativo !== false
  )

  // Mapa id → nome pra resolver o nome do manager sem n queries.
  const idToNome = Object.fromEntries(colaboradores.map(c => [c.id, c.nome]))

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
          <UserCog size={22} className="text-amber-400" /> Colaboradores
        </h1>
        <p className="text-xs text-white/40 mt-1">
          {tabAtiva === 'consultores'
            ? 'Equipe de consultores · gestão hierárquica e roles do sistema'
            : 'Diretoria · roles e hierarquia executiva'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b" style={{ borderColor: 'var(--flg-border)' }}>
        {TABS.map(t => {
          const ativa = tabAtiva === t.key
          return (
            <button
              key={t.key}
              onClick={() => handleTabClick(t.key)}
              className="relative py-3 text-sm font-semibold transition-colors"
              style={{ color: ativa ? '#C9A84C' : 'rgba(255,255,255,0.50)' }}
            >
              {t.label}
              {ativa && (
                <span
                  className="absolute left-0 right-0 -bottom-px h-0.5"
                  style={{ background: '#C9A84C', boxShadow: '0 0 8px rgba(201,168,76,0.40)' }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <p className="text-white/40 text-sm">Carregando colaboradores…</p>
      ) : error ? (
        <div className="rounded-xl p-6" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <p className="text-sm font-semibold text-red-400">Erro ao carregar</p>
          <p className="text-xs text-white/55 mt-1">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
          <UserCog size={28} className="mx-auto mb-3 text-white/30" />
          <p className="text-sm text-white/55">Nenhum {activeCategoria} cadastrado ainda.</p>
          <p className="text-xs text-white/35 mt-1">Admins poderão adicionar colaboradores na próxima fase.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--flg-border)' }}>
                  <th className="text-left px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Nome</th>
                  <th className="text-left px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal hidden md:table-cell">Cargo</th>
                  <th className="text-left px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Tier</th>
                  <th className="text-left px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Role</th>
                  <th className="text-left px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal hidden lg:table-cell">Manager</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b last:border-0" style={{ borderColor: 'var(--flg-border)' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.nome} size="sm" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-white/90 truncate">{c.nome}</p>
                          <p className="text-[10px] text-white/40 truncate">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-white/65 hidden md:table-cell">{c.cargo || '—'}</td>
                    <td className="px-4 py-3 text-[11px] text-white/65 capitalize">{c.tier || '—'}</td>
                    <td className="px-4 py-3 text-[11px] text-white/65 capitalize">{c.role}</td>
                    <td className="px-4 py-3 text-[11px] text-white/45 hidden lg:table-cell">
                      {idToNome[c.manager_id] || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Colaboradores/index.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Colaboradores/index.jsx
git commit -m "feat(colaboradores): cria index.jsx com tabs Consultores/Diretores + tabela read-only"
```

---

### Task 3: Adicionar rota `/colaboradores` no `App.jsx`

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Verificar a localização do bloco de imports lazy**

```bash
grep -n "lazy.*import.*Ranking\|lazy.*import.*Copywriter" frontend/src/App.jsx
```

Expected: pelo menos duas linhas, tipo `const Ranking = lazy(() => import('./components/Ranking'))` na linha 33 e `const Copywriter = lazy(() => import('./components/Copywriter'))` na linha 20.

- [ ] **Step 2: Adicionar o import lazy de `Colaboradores` após o de `Copywriter`**

Localizar a linha:

```jsx
const Copywriter       = lazy(() => import('./components/Copywriter'))
```

E inserir, **imediatamente abaixo**, a linha:

```jsx
const Colaboradores    = lazy(() => import('./components/Colaboradores'))
```

- [ ] **Step 3: Adicionar a `<Route>` em `App.jsx`**

Localizar a rota `/copywriter` (bloco que tem `<AuthGuard session={session} title="Copywriter FLG">`):

```jsx
          <Route path="/copywriter" element={
            <AuthGuard session={session} title="Copywriter FLG">
              <Copywriter />
            </AuthGuard>
          } />
```

E inserir, **imediatamente abaixo**, o bloco:

```jsx
          <Route path="/colaboradores" element={
            <AuthGuard session={session} title="Colaboradores">
              <Colaboradores />
            </AuthGuard>
          } />
```

- [ ] **Step 4: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/App.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 5: Bundle check da subtree de Colaboradores**

```bash
cd frontend && node_modules/.bin/esbuild --bundle --loader:.jsx=jsx --jsx=automatic --external:react --external:react-dom --external:react-router-dom --external:framer-motion --external:lucide-react src/components/Colaboradores/index.jsx > /dev/null
```

Expected: exit 0 (subtree completa compila com dependências externas).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(colaboradores): registra rota /colaboradores em App.jsx"
```

---

### Task 4: Smoke test em produção

- [ ] **Step 1: Push pra main**

```bash
git push origin main
```

Expected: push aceito (Pedro autoriza pushes diretos pra main).

- [ ] **Step 2: Aguardar deploy**

```bash
DEPLOY_ID=$(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
until gh run view "$DEPLOY_ID" --json status -q '.status' 2>/dev/null | grep -q completed; do sleep 10; done
gh run view "$DEPLOY_ID" --json conclusion -q '.conclusion'
```

Expected: `success`.

- [ ] **Step 3: Verificar bundle frontend rebuildou**

```bash
curl -s https://docs.foundersledgrowth.online/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1
```

Expected: hash NOVO (diferente do bundle anterior pré-Phase 2). Bundle de qualquer commit anterior estava em `index-B2S0S-xU.js` ou semelhante.

- [ ] **Step 4: Smoke test manual (executado pelo Pedro)**

Critérios de aceite:
- Abrir `https://docs.foundersledgrowth.online/` → na sidebar aparece "Colaboradores" como último item antes de "Administração" (ou último item se você não for admin)
- Click no item → navega pra `/colaboradores`, mostra título "Colaboradores", subtítulo "Equipe de consultores · gestão hierárquica e roles do sistema"
- Duas tabs "Consultores | Diretores" com underline dourado em Consultores (default)
- Aba "Consultores" mostra empty state ("Nenhum consultor cadastrado ainda.") — porque o Pedro está cadastrado como `diretor`
- Click em "Diretores" → URL muda pra `?tab=diretores`, tabela aparece com 1 linha: Avatar (PA) + Nome "Pedro Aranda" + email + Cargo "—" + Tier "—" + Role "owner" + Manager "—"
- Recarregar a página com `?tab=diretores` → continua na aba Diretores
- Recarregar com `?tab=consultores` → continua na aba Consultores
- O ícone na sidebar é `UserCog` (engrenagem sobre usuário)

Se algum item falhar, voltar e ajustar.

---

## Critérios de aceite Phase 2

Phase 2 completa quando:

- [x] Item "Colaboradores" aparece em ambos `consultantNav` e `adminNav` (logo após Copywriter FLG)
- [x] Rota `/colaboradores` registrada com `AuthGuard`
- [x] Pasta `frontend/src/components/Colaboradores/` existe com `index.jsx`
- [x] Página renderiza tabs com URL `?tab=` funcional
- [x] Tabela read-only mostra colaboradores filtrados por categoria
- [x] Pedro aparece na aba Diretores como owner
- [x] Empty state aparece na aba Consultores (sem consultores ainda)
- [x] Deploy ok, bundle frontend rebuildou

Próximo passo: Phase 3 — modal criar/editar + badges visuais (TierBadge, RoleBadge) + filtros (busca, tier, só admins). Plano separado.
