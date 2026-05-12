# Reuniões da Jornada — Phase B (Refactor Materiais + Grid Reuniões)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans pra implementar.

**Goal:** Refatorar `Materiais.jsx` em pasta `Materiais/` com sub-rotas `/diarios` (UI atual migrada) e `/reunioes` (nova: grid clientes × encontros), preservando 100% do comportamento atual em "Diários".

**Architecture:** Padrão das pastas existentes (`Metricas/`, `Ranking/`). `Materiais/index.jsx` = layout com tabs (`NavLink` sub-rotas), `Outlet` renderiza filho. `Diarios.jsx` herda toda UI atual. `Reunioes.jsx` lista clientes na esquerda + grid de encontros à direita usando `encontrosBase` do `AppContext` pra detectar `html_intelecto`. Status em Phase B é só "intelectual pendente / pronto" (status `pratica` virá com Phase C quando `encontros_pratica` table existir).

**Tech Stack:** React 18 + React Router v6 (nested routes + Outlet + NavLink) + Tailwind + lucide-react + AppContext (`clientes`, `encontrosBase`).

---

## File Structure

```
frontend/src/components/
  Materiais.jsx                                # DELETAR no fim (substituído por Materiais/)
  Materiais/                                   # NOVO
    index.jsx                                  # MateriaisLayout (header + tabs + Outlet)
    Diarios.jsx                                # UI atual extraída (sem mudança comportamental)
    Reunioes.jsx                               # grid clientes × encontros
    shared/
      constants.js                             # STATUS_CONFIG + helpers
      EncontroCard.jsx                         # célula visual de um encontro

frontend/src/App.jsx                           # rota /materiais → nested routes
```

---

## Decisões importantes

1. **Range de encontros:** vem de `encontrosBase` do `AppContext` (DB-driven). Hoje DB tem 1-15. Sistema não hardcoda "5-15" da spec — itera o array.
2. **Status do encontro em Phase B (sem `encontros_pratica` ainda):**
   - `intelectual_pendente` (cinza) → `html_intelecto` nulo/vazio
   - `aguardando_pratica` (cinza claro) → `html_intelecto` existe, mas Phase C não rodou
   - Phase C vai expandir pra `rascunho` / `pronto` / `apresentado` quando `encontros_pratica` existir.
3. **Click no card do encontro:** em Phase B navega pra `/materiais/reunioes/:cid/:n`, mas a rota não existe ainda (Phase C adiciona). Pra UX consistente, **botão "Preparar" no card mostra tooltip "Editor em breve (Phase C)"** e NÃO navega. Cards exibem status + slides intelectuais existentes.
4. **Sidebar:** já tem `Materiais` com `path: '/materiais'`. Acrescentar `matchPrefix: true` pra ficar destacado em `/materiais/diarios` e `/materiais/reunioes`.
5. **Old `Materiais.jsx`:** após smoke test passar, deletar pra evitar imports incorretos. `App.jsx` lazy import muda pra `./components/Materiais` (resolve via `Materiais/index.jsx`).
6. **Não criar `Reuniao/` subfolder ainda** — escopo de Phase C2.

---

## Task 1: Criar `Materiais/index.jsx` (layout + sub-rotas)

**Files:**
- Create: `frontend/src/components/Materiais/index.jsx`

- [ ] **Step 1: Escrever o layout**

```jsx
/**
 * Materiais — orquestrador das sub-rotas Diários / Reuniões.
 *
 * Tabs como NavLinks (rotas reais, URL bookmarkable). Outlet renderiza filho.
 * Espelha o padrão de Metricas/MetricasLayout.jsx.
 */

import { Outlet, NavLink, Navigate, useLocation } from 'react-router-dom'
import { FileText, Presentation } from 'lucide-react'

const TABS = [
  { key: 'diarios',   label: 'Diários',  to: '/materiais/diarios',  Icon: FileText },
  { key: 'reunioes',  label: 'Reuniões', to: '/materiais/reunioes', Icon: Presentation },
]

export default function MateriaisLayout() {
  const { pathname } = useLocation()

  // /materiais sem sub-rota → redirect pra /materiais/diarios
  if (pathname === '/materiais' || pathname === '/materiais/') {
    return <Navigate to="/materiais/diarios" replace />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs header */}
      <div className="flex items-center gap-1 px-6 pt-4 border-b border-white/5 flex-shrink-0">
        {TABS.map(t => (
          <NavLink
            key={t.key}
            to={t.to}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors"
            style={({ isActive }) =>
              isActive
                ? { color: '#C9A84C', borderBottom: '2px solid #C9A84C', marginBottom: '-1px' }
                : { color: 'rgba(255,255,255,0.4)', borderBottom: '2px solid transparent', marginBottom: '-1px' }
            }
          >
            <t.Icon size={14} />
            {t.label}
          </NavLink>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Validar com esbuild**

Run:
```bash
cd "/Users/usuario/Documents/Pedro Aranda/Pedro Aranda FLG/documentos_oficiais"
frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx frontend/src/components/Materiais/index.jsx > /dev/null
```
Expected: nenhum erro (silent success).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Materiais/index.jsx
git commit -m "feat(materiais): cria MateriaisLayout com sub-rotas Diários/Reuniões"
```

---

## Task 2: Criar `Materiais/Diarios.jsx` (UI atual migrada)

**Files:**
- Create: `frontend/src/components/Materiais/Diarios.jsx`
- Reference (read-only): `frontend/src/components/Materiais.jsx` (será deletado em Task 6)

- [ ] **Step 1: Copiar conteúdo do `Materiais.jsx` atual**

Move o componente `ClienteSelector` (linhas 13-84), `BibliotecaTab` (linhas 86-223) e o `export default function Materiais()` (linhas 225-312) pra `Diarios.jsx`, **trocando o `export default function Materiais()`** pra `export default function MateriaisDiarios()`.

**Ajustes de import (paths +1 nível):**
- `from '../lib/api'` → `from '../../lib/api'`
- `from './ui/Avatar'` → `from '../ui/Avatar'`
- `from './ui/Spinner'` → `from '../ui/Spinner'`
- `from '../lib/utils'` → `from '../../lib/utils'`
- `from '../lib/toast'` → `from '../../lib/toast'`
- `from './ChatAgente'` → `from '../ChatAgente'`
- `from '../contexts/AppContext'` → `from '../../contexts/AppContext'`

Conteúdo final exato (cabeçalho):

```jsx
/**
 * MateriaisDiarios — UI clássica de materiais.
 *
 * Migrada de components/Materiais.jsx (idêntica em comportamento).
 * Mantém ClienteSelector + chat + biblioteca lado a lado.
 */

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, FileText, FileDown, Eye, Trash2, ChevronDown } from 'lucide-react'
import { api } from '../../lib/api'
import { Avatar } from '../ui/Avatar'
import { Spinner } from '../ui/Spinner'
import { formatDate } from '../../lib/utils'
import { useToast } from '../../lib/toast'
import ChatAgente from '../ChatAgente'
import { useApp } from '../../contexts/AppContext'

// ... ClienteSelector (sem mudanças no corpo)
// ... BibliotecaTab (sem mudanças no corpo)

export default function MateriaisDiarios() {
  // ... corpo idêntico ao Materiais atual
}
```

**Atenção:** remover import de `Upload` que está no arquivo original mas NÃO é usado (linha 4 do `Materiais.jsx` atual importa `Upload` sem uso — limpar agora).

- [ ] **Step 2: Validar com esbuild**

Run:
```bash
cd "/Users/usuario/Documents/Pedro Aranda/Pedro Aranda FLG/documentos_oficiais"
frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx frontend/src/components/Materiais/Diarios.jsx > /dev/null
```
Expected: nenhum erro.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Materiais/Diarios.jsx
git commit -m "feat(materiais): migra UI atual pra Diarios.jsx (sub-rota /materiais/diarios)"
```

---

## Task 3: Criar `Materiais/shared/constants.js`

**Files:**
- Create: `frontend/src/components/Materiais/shared/constants.js`

- [ ] **Step 1: Escrever constantes de status**

```js
/**
 * Constantes compartilhadas de Materiais/Reuniões.
 */

// Status de cada (cliente, encontro) no grid de reuniões.
// Em Phase B só usamos os 2 primeiros (sem encontros_pratica ainda).
// Phase C expande pra rascunho/pronto/apresentado quando essa tabela existir.
export const ENCONTRO_STATUS = {
  intelectual_pendente: {
    label: 'Intelectual pendente',
    color: 'rgba(255,255,255,0.30)',
    bg: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.10)',
  },
  aguardando_pratica: {
    label: 'Aguardando prática',
    color: 'rgba(250,250,248,0.55)',
    bg: 'rgba(201,168,76,0.05)',
    border: 'rgba(201,168,76,0.15)',
  },
  // Reservados pra Phase C (encontros_pratica)
  rascunho: {
    label: 'Rascunho',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.10)',
    border: 'rgba(245,158,11,0.30)',
  },
  pronto: {
    label: 'Pronto',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.10)',
    border: 'rgba(52,211,153,0.30)',
  },
  apresentado: {
    label: 'Apresentado',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.10)',
    border: 'rgba(96,165,250,0.30)',
  },
}

/**
 * Deriva o status visual do encontro a partir de:
 *   - `encontroBase` (linha de encontros_base): tem html_intelecto?
 *   - `encontroPratica` (nullable, futuro Phase C): status + slug
 *
 * Em Phase B, encontroPratica é sempre `null`.
 */
export function deriveStatus(encontroBase, encontroPratica) {
  if (encontroPratica) {
    if (encontroPratica.status === 'apresentado') return 'apresentado'
    if (encontroPratica.status === 'pronto')      return 'pronto'
    return 'rascunho'
  }
  if (!encontroBase?.html_intelecto || !encontroBase.html_intelecto.trim()) {
    return 'intelectual_pendente'
  }
  return 'aguardando_pratica'
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Materiais/shared/constants.js
git commit -m "feat(materiais): adiciona ENCONTRO_STATUS + deriveStatus helper"
```

---

## Task 4: Criar `Materiais/shared/EncontroCard.jsx`

**Files:**
- Create: `frontend/src/components/Materiais/shared/EncontroCard.jsx`

- [ ] **Step 1: Escrever o card**

```jsx
/**
 * EncontroCard — célula visual de um encontro pra um cliente no grid.
 *
 * Em Phase B é só leitura visual. Em Phase C ganha onClick → editor.
 */

import { FileText, Layers } from 'lucide-react'
import { ENCONTRO_STATUS, deriveStatus } from './constants'

export default function EncontroCard({ encontroBase, encontroPratica = null }) {
  const status = deriveStatus(encontroBase, encontroPratica)
  const cfg = ENCONTRO_STATUS[status]
  const numSlides = encontroBase?.num_slides_intelecto || 0
  const numero = encontroBase?.numero

  return (
    <div
      className="rounded-lg p-3 transition-all"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        opacity: status === 'intelectual_pendente' ? 0.5 : 1,
      }}
      title={`Encontro ${numero} — ${cfg.label}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] font-semibold tracking-wider uppercase"
          style={{ color: cfg.color }}>
          E{String(numero).padStart(2, '0')}
        </span>
        <span className="text-[9px]" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
      </div>

      <p className="text-xs text-white/70 line-clamp-2 leading-snug min-h-[2.25rem]">
        {encontroBase?.titulo || `Encontro ${numero}`}
      </p>

      <div className="flex items-center gap-3 mt-2 text-[10px] text-white/30">
        <span className="flex items-center gap-1">
          <Layers size={10} /> {numSlides} slides
        </span>
        {encontroPratica?.slug && (
          <span className="flex items-center gap-1">
            <FileText size={10} /> prática
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Validar com esbuild**

Run:
```bash
cd "/Users/usuario/Documents/Pedro Aranda/Pedro Aranda FLG/documentos_oficiais"
frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx frontend/src/components/Materiais/shared/EncontroCard.jsx > /dev/null
```
Expected: nenhum erro.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Materiais/shared/EncontroCard.jsx
git commit -m "feat(materiais): cria EncontroCard com status visual"
```

---

## Task 5: Criar `Materiais/Reunioes.jsx` (grid clientes × encontros)

**Files:**
- Create: `frontend/src/components/Materiais/Reunioes.jsx`

- [ ] **Step 1: Escrever o grid**

```jsx
/**
 * Reunioes — grid de clientes × encontros disponíveis (encontros_base).
 *
 * Em Phase B é exibição read-only. Phase C adiciona click → editor + status
 * de encontros_pratica.
 *
 * Filtro de clientes: consultor vê só seus clientes (mesmo padrão de Metricas);
 * admin vê todos.
 */

import { useState, useMemo } from 'react'
import { Search, Presentation, AlertCircle } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { Avatar } from '../ui/Avatar'
import EncontroCard from './shared/EncontroCard'

export default function MateriaisReunioes({ session }) {
  const { clientes: allClientes, encontrosBase } = useApp()
  const [busca, setBusca] = useState('')

  // encontros_base ordenados pelo número (1-15 hoje)
  const encontros = useMemo(
    () => [...(encontrosBase || [])].sort((a, b) => a.numero - b.numero),
    [encontrosBase]
  )

  // Filtro de clientes: admin vê todos, consultor só os seus
  const userEmail = session?.user?.email || ''
  const role = session?.user?.user_metadata?.role
  const isAdmin = role === 'owner' || role === 'admin' || userEmail.includes('pedro')

  const clientesVisiveis = useMemo(() => {
    const base = isAdmin
      ? allClientes
      : allClientes.filter(c =>
          c.consultor_responsavel?.toLowerCase().includes(userEmail.split('@')[0] || '')
        )
    if (!busca.trim()) return base
    const q = busca.toLowerCase()
    return base.filter(c =>
      c.nome?.toLowerCase().includes(q) || c.empresa?.toLowerCase().includes(q)
    )
  }, [allClientes, busca, isAdmin, userEmail])

  if (encontros.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <AlertCircle size={28} className="text-white/20 mx-auto mb-3" />
          <p className="text-sm text-white/40">
            Nenhum encontro cadastrado em <code className="text-white/60">encontros_base</code>.
          </p>
          <p className="text-xs text-white/25 mt-1">
            Admin precisa criar os encontros antes de aparecerem aqui.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header com busca */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Presentation size={16} className="text-gold-mid" />
          <p className="text-sm font-semibold text-white/80">Reuniões da Jornada</p>
          <span className="text-[10px] text-white/30">
            ({clientesVisiveis.length} clientes · {encontros.length} encontros)
          </span>
        </div>

        <div className="flex-1 max-w-xs ml-auto">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="search"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded bg-white/5 border border-white/8 text-white/80 focus:outline-none focus:border-gold-mid/40"
            />
          </div>
        </div>
      </div>

      {/* Grid scrollável */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {clientesVisiveis.length === 0 ? (
          <div className="text-center py-16 text-xs text-white/30">
            Nenhum cliente encontrado.
          </div>
        ) : (
          <div className="space-y-3">
            {clientesVisiveis.map(c => (
              <ClienteRow key={c.id} cliente={c} encontros={encontros} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ClienteRow({ cliente, encontros }) {
  const encontroAtual = cliente.encontro_atual || 1
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: 'var(--flg-bg-card)',
        border: '1px solid var(--flg-border)',
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <Avatar name={cliente.nome} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/85 font-medium truncate">{cliente.nome}</p>
          <p className="text-[10px] text-white/35 truncate">
            {cliente.empresa || '—'} · {cliente.consultor_responsavel || 'sem consultor'}
          </p>
        </div>
        <span className="text-[10px] text-gold-mid flex-shrink-0">
          E{encontroAtual} atual
        </span>
      </div>

      <div className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${Math.min(encontros.length, 5)}, minmax(0, 1fr))`,
        }}
      >
        {encontros.map(enc => (
          <EncontroCard
            key={enc.numero}
            encontroBase={enc}
            encontroPratica={null /* Phase C: vem de encontros_pratica */}
          />
        ))}
      </div>
    </div>
  )
}
```

**Nota sobre `grid-template-columns`:** Math.min(N,5) significa que até 5 encontros ficam numa linha; 10 encontros viram 2 linhas de 5. Tailwind não tem util pra "5 colunas dinâmicas" mantendo simples — uso style inline.

- [ ] **Step 2: Validar com esbuild**

Run:
```bash
cd "/Users/usuario/Documents/Pedro Aranda/Pedro Aranda FLG/documentos_oficiais"
frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx frontend/src/components/Materiais/Reunioes.jsx > /dev/null
```
Expected: nenhum erro.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Materiais/Reunioes.jsx
git commit -m "feat(materiais): grid clientes × encontros em /materiais/reunioes"
```

---

## Task 6: Atualizar `App.jsx` (rotas nested + remover Materiais.jsx antigo)

**Files:**
- Modify: `frontend/src/App.jsx`
- Delete: `frontend/src/components/Materiais.jsx`

- [ ] **Step 1: Atualizar lazy import**

No `App.jsx`, linha 19:

```jsx
const Materiais        = lazy(() => import('./components/Materiais'))
```

Permanece igual — `./components/Materiais` resolve `Materiais/index.jsx` automaticamente.

Adicionar abaixo:

```jsx
const MateriaisDiarios = lazy(() => import('./components/Materiais/Diarios'))
const MateriaisReunioes = lazy(() => import('./components/Materiais/Reunioes'))
```

- [ ] **Step 2: Substituir a rota `/materiais` por nested**

Trocar (linhas 149-153 do App.jsx atual):

```jsx
<Route path="/materiais" element={
  <AuthGuard session={session} title="Materiais">
    <Materiais />
  </AuthGuard>
} />
```

Por:

```jsx
<Route path="/materiais" element={
  <AuthGuard session={session} title="Materiais">
    <Materiais />
  </AuthGuard>
}>
  <Route index element={<Navigate to="diarios" replace />} />
  <Route path="diarios" element={<Suspense fallback={<PageSpinner />}><MateriaisDiarios /></Suspense>} />
  <Route path="reunioes" element={<Suspense fallback={<PageSpinner />}><MateriaisReunioes session={session} /></Suspense>} />
</Route>
```

- [ ] **Step 3: Deletar arquivo antigo**

```bash
git rm frontend/src/components/Materiais.jsx
```

- [ ] **Step 4: Validar build do App.jsx**

Run:
```bash
cd "/Users/usuario/Documents/Pedro Aranda/Pedro Aranda FLG/documentos_oficiais"
frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx frontend/src/App.jsx > /dev/null
```
Expected: nenhum erro.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(materiais): rotas nested /materiais/diarios + /materiais/reunioes + remove Materiais.jsx antigo"
```

---

## Task 7: Sidebar `matchPrefix` em `/materiais`

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Marcar item Materiais com `matchPrefix`**

Em `consultantNav` e `adminNav`, o item `{ icon: FileText, label: 'Materiais', path: '/materiais' }` precisa ganhar `matchPrefix: true` pra continuar destacado quando URL é `/materiais/diarios` ou `/materiais/reunioes`.

Aplicar em ambos arrays:

```jsx
{ icon: FileText,       label: 'Materiais',      path: '/materiais', matchPrefix: true },
```

- [ ] **Step 2: Validar**

Run:
```bash
cd "/Users/usuario/Documents/Pedro Aranda/Pedro Aranda FLG/documentos_oficiais"
frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx frontend/src/components/layout/Sidebar.jsx > /dev/null
```
Expected: nenhum erro.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/Sidebar.jsx
git commit -m "fix(sidebar): matchPrefix em /materiais (destaca em sub-rotas)"
```

---

## Task 8: Smoke test + push

- [ ] **Step 1: Verificar build do Vite (compila tudo junto)**

Run:
```bash
cd "/Users/usuario/Documents/Pedro Aranda/Pedro Aranda FLG/documentos_oficiais/frontend"
node_modules/.bin/vite build --logLevel error 2>&1 | tail -30
```
Expected: build success sem erros (warnings de chunk size são aceitáveis).

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Verificar deploy (aguardar workflow)**

```bash
gh run watch $(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
```
Expected: deploy success. Se SSH timeout, re-run:
```bash
gh workflow run deploy.yml -f force_rebuild=false
```

- [ ] **Step 4: UAT manual em produção**

Browser:
1. Login na app.
2. Sidebar → "Materiais". URL deve ir pra `/materiais/diarios` (redirect).
3. UI deve mostrar tabs "Diários" (ativa) e "Reuniões".
4. Aba "Diários" deve mostrar EXATAMENTE a UI atual (ClienteSelector + chat + biblioteca).
5. Click "Reuniões" → URL muda pra `/materiais/reunioes`, grid aparece com cards de clientes, cada um listando todos os encontros do DB.
6. Encontros sem `html_intelecto` → cinza/opaco. Encontros já gerados (5, 9) → "Aguardando prática".
7. Busca filtra clientes.
8. F5 em `/materiais/reunioes` mantém estado.
9. Sidebar mantém "Materiais" destacado em ambas sub-rotas.

---

## Self-review do plano

**Spec coverage (B1 + B2 da spec linha 381-383):**
- ✅ Refactor `Materiais.jsx` → `Materiais/` pasta (Task 1, 2, 6)
- ✅ Sub-rotas `/diarios` e `/reunioes` (Task 6)
- ✅ `Diarios.jsx` = UI atual migrada zero comportamento novo (Task 2)
- ✅ `Reunioes.jsx` grid clientes × encontros (Task 5)
- ✅ Status visual (Task 3 constants + Task 4 card)
- ✅ Range de encontros vem do DB (não hardcoded "5-15")

**Placeholder scan:** nenhum TODO/TBD. Códigos completos. Status `rascunho/pronto/apresentado` definidos em `ENCONTRO_STATUS` mas não usados em Phase B — intencional, marcados como "Reservados pra Phase C" no comentário.

**Type consistency:** `deriveStatus(encontroBase, encontroPratica)` retorna chave de `ENCONTRO_STATUS`. `EncontroCard` usa exatamente essa chave pra olhar `ENCONTRO_STATUS[status]`. Consistente.

**Riscos identificados:**
- Layout vertical (cliente como row + encontros como grid horizontal): pode ficar denso pra 11 clientes × 15 encontros. Aceito pra Phase B — Phase C adiciona drill-down e Phase E refina. Se ficar muito visual, é fácil ajustar `gridTemplateColumns` ou paginar.
- `MateriaisReunioes` recebe `session` por props pra detectar admin/consultor. Padrão diferente de `Materiais.jsx` atual (que não filtra por consultor). Decisão consciente — alinha com `/metricas` que já filtra.

---

## Pós-Phase B

Próximos passos sugeridos (não nessa entrega):

- Phase C1 (backend chat + encontros_pratica migration) + Phase C2 (editor split).
- Quando Phase C entregar, expandir o `useEffect` do `Reunioes.jsx` pra fetchar `GET /reunioes/:cid` que retorna lista de `encontros_pratica` daquele cliente, e passar `encontroPratica` correto pro `EncontroCard`.
