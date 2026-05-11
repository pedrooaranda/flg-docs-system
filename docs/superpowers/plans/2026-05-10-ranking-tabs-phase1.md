# Ranking Tabs — Phase 1: Refactor Estrutural

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-10-ranking-tabs-consultores-design.md](../specs/2026-05-10-ranking-tabs-consultores-design.md)

**Goal:** Extrair `frontend/src/components/Ranking.jsx` (722 linhas) numa pasta `Ranking/` com `index.jsx` (layout + tabs + URL query state) renderizando `RankingClientes.jsx` (lógica atual) ou `RankingConsultores.jsx` (stub "Em construção"). Zero feature nova, paridade visual e funcional completa com a tela atual.

**Architecture:** Pasta `Ranking/` espelhando o padrão `Metricas/` da Phase 2 V3 — `index.jsx` orquestra tabs e fetch compartilhado, abas são componentes-irmãos, componentes reutilizáveis em `shared/`. Tab default vem de `useSearchParams().get('tab') || 'clientes'`. Componentes de apresentação extraídos verbatim do `Ranking.jsx` atual.

**Tech Stack:** React 18, React Router v6 (`useSearchParams`), Framer Motion, Tailwind, lucide-react. Validação sem suite de testes — usa `frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx <arquivo>` pra syntax check + visual smoke test no browser.

**Não-objetivos:**
- Não muda layout/estilos
- Não adiciona conteúdo novo na aba Consultores (só stub)
- Não toca backend
- Não cria suite de testes (segue convenção da repo)

---

## File Structure

**Criar:**
- `frontend/src/components/Ranking/index.jsx` — layout + tabs + fetch compartilhado + roteamento entre abas
- `frontend/src/components/Ranking/RankingClientes.jsx` — UX atual (Atenção Master + Troféus + Pódio + Tabela + Consultores do mês)
- `frontend/src/components/Ranking/RankingConsultores.jsx` — stub "Em construção"
- `frontend/src/components/Ranking/shared/formatters.js` — `formatCompact`, `severidadeAtencao`
- `frontend/src/components/Ranking/shared/constants.js` — `GOLD`, `CATEGORIAS`
- `frontend/src/components/Ranking/shared/AtencaoMasterCard.jsx`
- `frontend/src/components/Ranking/shared/DestaqueCard.jsx`
- `frontend/src/components/Ranking/shared/PodiumCard.jsx`
- `frontend/src/components/Ranking/shared/RankRow.jsx`
- `frontend/src/components/Ranking/shared/ConsultorCard.jsx`

**Deletar:**
- `frontend/src/components/Ranking.jsx`

**App.jsx:** import `./components/Ranking` continua resolvendo (passa de `Ranking.jsx` pra `Ranking/index.jsx` automaticamente via Vite). Nenhuma mudança necessária em [App.jsx](../../../frontend/src/App.jsx).

---

## Tarefas

### Task 1: Criar estrutura de pastas + extrair `formatters.js`

**Files:**
- Create: `frontend/src/components/Ranking/shared/formatters.js`

- [ ] **Step 1: Criar pastas**

```bash
mkdir -p "frontend/src/components/Ranking/shared"
```

- [ ] **Step 2: Criar `formatters.js` com `formatCompact` e `severidadeAtencao`**

Conteúdo completo (copiado de `Ranking.jsx:18-32`):

```javascript
// Formatadores compartilhados entre RankingClientes e RankingConsultores.

export function formatCompact(n) {
  const num = Number(n) || 0
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace('.0', '') + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace('.0', '') + 'K'
  return num.toLocaleString('pt-BR')
}

// Atenção Master: severidade por dias sem postar.
// >=14 dias = CRÍTICO (vermelho), 7-13 = CRISE (laranja), 4-6 = ATENÇÃO (amarelo).
// Retorna null se não está em nenhum tier (ok).
export function severidadeAtencao(dias) {
  if (dias >= 14) return { tier: 'critical', label: 'CRÍTICO', color: '#EF4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.40)', glow: 'rgba(239,68,68,0.25)' }
  if (dias >= 7)  return { tier: 'high',     label: 'GESTÃO DE CRISE', color: '#F97316', bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.40)', glow: 'rgba(249,115,22,0.20)' }
  if (dias >= 4)  return { tier: 'med',      label: 'ATENÇÃO',  color: '#FBBF24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.35)', glow: 'rgba(251,191,36,0.18)' }
  return null
}
```

- [ ] **Step 3: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Ranking/shared/formatters.js > /dev/null
```

Expected: nenhum erro (exit code 0).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Ranking/shared/formatters.js
git commit -m "refactor(ranking): extrai formatters compartilhados para Ranking/shared/"
```

---

### Task 2: Extrair `constants.js` com `CATEGORIAS` e `GOLD`

**Files:**
- Create: `frontend/src/components/Ranking/shared/constants.js`

- [ ] **Step 1: Criar `constants.js`**

Conteúdo completo (copiado de `Ranking.jsx:120-165`, mais a constante GOLD definida implicitamente em `RankRow`):

```javascript
import { Flame, TrendingUp, Eye, Camera } from 'lucide-react'
import { formatCompact } from './formatters'

export const GOLD = '#C9A84C'

// Categorias de destaque do Pódio de Troféus (aba Clientes).
// Cada uma vira um DestaqueCard com top 3 (winner + #2 + #3).
export const CATEGORIAS = [
  {
    key: 'engajamento',
    label: 'Maior Engajamento',
    sortKey: 'taxa_engajamento',
    icon: Flame,
    color: '#EC4899',
    glow: 'rgba(236,72,153,0.30)',
    formatValue: v => `${(v || 0).toFixed(2)}%`,
    legendaUnidade: 'taxa média',
  },
  {
    key: 'crescimento',
    label: 'Maior Crescimento',
    sortKey: 'crescimento',
    icon: TrendingUp,
    color: '#34D399',
    glow: 'rgba(52,211,153,0.30)',
    formatValue: v => v >= 0 ? `+${v.toLocaleString('pt-BR')}` : v.toLocaleString('pt-BR'),
    legendaUnidade: 'novos seguidores em 30d',
    extraKey: 'crescimento_pct',
    extraFormat: v => `${v >= 0 ? '+' : ''}${(v || 0).toFixed(1)}%`,
  },
  {
    key: 'alcance',
    label: 'Maior Alcance',
    sortKey: 'alcance_medio',
    icon: Eye,
    color: '#60A5FA',
    glow: 'rgba(96,165,250,0.30)',
    formatValue: v => formatCompact(v),
    legendaUnidade: 'alcance médio diário',
  },
  {
    key: 'postagens',
    label: 'Mais Produtivo',
    sortKey: 'posts_mes',
    icon: Camera,
    color: '#A78BFA',
    glow: 'rgba(167,139,250,0.30)',
    formatValue: v => `${v || 0}`,
    legendaUnidade: 'posts no mês',
  },
]
```

Nota: `constants.js` importa de `./formatters` — não há ciclo porque `formatters.js` não importa de `constants.js`.

- [ ] **Step 2: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Ranking/shared/constants.js > /dev/null
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Ranking/shared/constants.js
git commit -m "refactor(ranking): extrai CATEGORIAS e GOLD para shared/constants.js"
```

---

### Task 3: Extrair `AtencaoMasterCard.jsx`

**Files:**
- Create: `frontend/src/components/Ranking/shared/AtencaoMasterCard.jsx`

- [ ] **Step 1: Criar `AtencaoMasterCard.jsx`**

Conteúdo (copiado de `Ranking.jsx:34-118`, com imports ajustados):

```jsx
import { motion } from 'framer-motion'
import { Zap, MessageCircle, ExternalLink, AlertTriangle, ShieldAlert } from 'lucide-react'
import { severidadeAtencao } from './formatters'

// Card individual da seção "Atenção Master" — cliente em crise.
// Recebe `item` (cliente do ranking), `delay` (anim stagger) e callbacks
// pros 3 botões (Resolver agora, Iniciar tratativa via WhatsApp, Ver perfil).
//
// `item._demo` é true se for cliente promovido visualmente pra demonstração
// (todos os tiers visíveis no all-hands mesmo sem crise real).
export default function AtencaoMasterCard({ item, onResolve, onWhats, onPerfil, delay }) {
  const sev = severidadeAtencao(item.dias_sem_postar || 0)
  if (!sev) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      className="rounded-xl p-4 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${sev.bg} 0%, rgba(0,0,0,0.25) 70%)`,
        border: `1px solid ${sev.border}`,
        boxShadow: `0 0 24px ${sev.glow}`,
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: sev.color, boxShadow: `0 0 8px ${sev.color}` }}
      />
      {item._demo && (
        <span className="absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest"
              style={{ background: 'rgba(234,179,8,0.18)', color: '#FACC15', border: '1px solid rgba(234,179,8,0.35)' }}>
          EXEMPLO
        </span>
      )}
      <div className="flex items-start gap-3 ml-1">
        <div
          className="rounded-lg flex items-center justify-center shrink-0"
          style={{
            width: 40, height: 40,
            background: `${sev.color}25`,
            border: `1px solid ${sev.color}50`,
          }}
        >
          {sev.tier === 'critical' ? <ShieldAlert size={18} style={{ color: sev.color }} /> : <AlertTriangle size={18} style={{ color: sev.color }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded uppercase" style={{ background: `${sev.color}25`, color: sev.color }}>
              {sev.label}
            </span>
            <span className="text-[10px] text-white/30">·</span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: sev.color }}>
              {item.dias_sem_postar} {item.dias_sem_postar === 1 ? 'dia' : 'dias'} sem postar
            </span>
          </div>
          <p className="text-sm font-bold text-white/95 truncate">{item.nome}</p>
          <div className="flex items-center gap-2 text-[11px] text-white/45 mt-0.5">
            {item.empresa && <span className="truncate">{item.empresa}</span>}
            {item.empresa && item.consultor && <span className="text-white/20">·</span>}
            {item.consultor && (
              <span className="truncate">
                Consultor: <span className="text-white/70 font-medium">{item.consultor}</span>
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        <button
          onClick={() => onResolve(item)}
          className="text-[10px] font-bold py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1"
          style={{ background: sev.color, color: '#080808' }}
        >
          <Zap size={11} /> Resolver agora
        </button>
        <button
          onClick={() => onWhats(item)}
          className="text-[10px] font-semibold py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1"
          style={{ background: 'rgba(52,211,153,0.18)', color: '#34D399', border: '1px solid rgba(52,211,153,0.35)' }}
        >
          <MessageCircle size={11} /> Iniciar tratativa
        </button>
        <button
          onClick={() => onPerfil(item)}
          className="text-[10px] font-semibold py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.65)', border: '1px solid var(--flg-border)' }}
        >
          <ExternalLink size={11} /> Ver perfil
        </button>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Ranking/shared/AtencaoMasterCard.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Ranking/shared/AtencaoMasterCard.jsx
git commit -m "refactor(ranking): extrai AtencaoMasterCard para shared/"
```

---

### Task 4: Extrair `DestaqueCard.jsx`

**Files:**
- Create: `frontend/src/components/Ranking/shared/DestaqueCard.jsx`

- [ ] **Step 1: Criar `DestaqueCard.jsx`**

Conteúdo (copiado de `Ranking.jsx:167-275`):

```jsx
import { motion } from 'framer-motion'
import { Trophy, Crown } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'

// Card de destaque por categoria — top 3 com #1 grande no topo + #2/#3 abaixo.
// Usado tanto pela aba Clientes (categoria.sortKey lê do cliente) quanto pela
// aba Consultores futuramente (com categorias de consultor).
//
// `categoria` shape: { key, label, sortKey, icon, color, glow, formatValue, legendaUnidade, extraKey?, extraFormat? }
// `ranking` é array de itens (clientes ou consultores) — ordenamos aqui dentro.
// `getDisplayInfo(item)` retorna { nome, subline } pra abstrair "cliente.nome/empresa"
//   vs "consultor.nome/clientes_count". Default: nome+empresa (aba clientes).
// `onClick(item)` recebe o item clicado (winner do card).
export default function DestaqueCard({ categoria, ranking, onClick, getDisplayInfo }) {
  const Icon = categoria.icon
  const sorted = [...ranking].sort((a, b) => (b[categoria.sortKey] || 0) - (a[categoria.sortKey] || 0)).slice(0, 3)
  if (sorted.length === 0) return null
  const winner = sorted[0]
  const others = sorted.slice(1)
  const display = getDisplayInfo || ((item) => ({ nome: item.nome, subline: item.empresa || '—' }))
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl p-5 cursor-pointer relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${categoria.color}10 0%, rgba(0,0,0,0.3) 60%)`,
        border: `1px solid ${categoria.color}40`,
        boxShadow: `0 0 32px ${categoria.glow}`,
      }}
      onClick={() => onClick(winner)}
    >
      <div
        className="absolute pointer-events-none"
        style={{
          top: -40,
          right: -40,
          width: 120,
          height: 120,
          background: `radial-gradient(circle, ${categoria.color}30 0%, transparent 70%)`,
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <div
            className="rounded-xl flex items-center justify-center shrink-0"
            style={{
              width: 36, height: 36,
              background: `${categoria.color}25`,
              border: `1px solid ${categoria.color}50`,
            }}
          >
            <Icon size={18} style={{ color: categoria.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-bold tracking-widest uppercase" style={{ color: categoria.color }}>
              Troféu
            </p>
            <p className="text-xs font-semibold text-white/85">{categoria.label}</p>
          </div>
          <Trophy size={14} style={{ color: categoria.color, opacity: 0.45 }} />
        </div>

        <div className="mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative">
              <Avatar name={display(winner).nome} size="md" />
              <div
                className="absolute -bottom-1 -right-1 rounded-full flex items-center justify-center"
                style={{
                  width: 18, height: 18,
                  background: categoria.color,
                  border: '2px solid var(--flg-bg-secondary)',
                }}
              >
                <Crown size={9} className="text-[#080808]" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{display(winner).nome}</p>
              <p className="text-[10px] text-white/40 truncate">{display(winner).subline}</p>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums" style={{ color: categoria.color }}>
              {categoria.formatValue(winner[categoria.sortKey])}
            </span>
            {categoria.extraKey && winner[categoria.extraKey] != null && (
              <span className="text-xs font-semibold" style={{ color: categoria.color, opacity: 0.7 }}>
                {categoria.extraFormat(winner[categoria.extraKey])}
              </span>
            )}
          </div>
          <p className="text-[10px] text-white/35 mt-0.5">{categoria.legendaUnidade}</p>
        </div>

        {others.length > 0 && (
          <div className="space-y-2 pt-3" style={{ borderTop: `1px solid ${categoria.color}20` }}>
            {others.map((c, i) => (
              <div key={c.cliente_id || c.nome} className="flex items-center gap-2">
                <span className="text-[10px] font-bold w-4 text-center" style={{ color: i === 0 ? '#CBD5E1' : '#D97706' }}>
                  #{i + 2}
                </span>
                <Avatar name={display(c).nome} size="sm" />
                <p className="flex-1 text-[11px] text-white/65 truncate">{display(c).nome}</p>
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: categoria.color, opacity: 0.85 }}>
                  {categoria.formatValue(c[categoria.sortKey])}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
```

**Mudanças vs versão original:**
1. Adicionado prop `getDisplayInfo(item)` opcional pra abstrair como o card mostra "nome/subline" (default = cliente.nome/empresa). Permite reuso futuro com consultores sem mudar o componente.
2. `onClick(winner)` em vez de `onClick(winner.cliente_id)` — caller decide o que fazer com o item (mais flexível pra consultores que não têm `cliente_id`).
3. Key da lista de outros usa `c.cliente_id || c.nome` (fallback pra consultor).

- [ ] **Step 2: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Ranking/shared/DestaqueCard.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Ranking/shared/DestaqueCard.jsx
git commit -m "refactor(ranking): extrai DestaqueCard para shared/ + getDisplayInfo opcional"
```

---

### Task 5: Extrair `PodiumCard.jsx`

**Files:**
- Create: `frontend/src/components/Ranking/shared/PodiumCard.jsx`

- [ ] **Step 1: Criar `PodiumCard.jsx`**

Conteúdo (copiado de `Ranking.jsx:277-329`):

```jsx
import { motion } from 'framer-motion'
import { Crown, Trophy, Medal } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'
import { formatCompact } from './formatters'

// Card de pódio — 1º/2º/3º lugar com altura escalonada no desktop (1º normal,
// 2º empurrado pra baixo, 3º mais embaixo) pra criar visual de pódio físico.
// Usado pelo Pódio Geral (aba Clientes — top 3 por engajamento).
//
// `rank` é 0/1/2 (índice posicional, mapeia em config).
// `metricsRender(item)` é opcional — caller decide quais 3 métricas mostrar
// no footer. Default = eng/audiência/posts (perfil cliente).
export default function PodiumCard({ rank, item, onClick, metricsRender }) {
  const config = [
    { color: '#FACC15', bg: 'rgba(250,204,21,0.10)', border: 'rgba(250,204,21,0.35)', label: '1º LUGAR', icon: Crown, height: 'lg:mt-0' },
    { color: '#CBD5E1', bg: 'rgba(203,213,225,0.10)', border: 'rgba(203,213,225,0.30)', label: '2º LUGAR', icon: Trophy, height: 'lg:mt-6' },
    { color: '#D97706', bg: 'rgba(217,119,6,0.10)', border: 'rgba(217,119,6,0.30)', label: '3º LUGAR', icon: Medal, height: 'lg:mt-12' },
  ][rank]
  const Icon = config.icon
  const defaultMetrics = (it) => [
    { label: 'Eng.', value: `${(it.taxa_engajamento || 0).toFixed(2)}%`, color: config.color },
    { label: 'Audiência', value: formatCompact(it.audiencia), color: 'rgba(255,255,255,0.85)' },
    { label: 'Posts/mês', value: `${it.posts_mes || 0}`, color: 'rgba(255,255,255,0.85)' },
  ]
  const metrics = (metricsRender || defaultMetrics)(item)
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
      onClick={onClick}
      className={`rounded-2xl p-5 cursor-pointer transition-transform hover:scale-[1.02] ${config.height}`}
      style={{
        background: `linear-gradient(135deg, ${config.bg}, rgba(0,0,0,0.2))`,
        border: `1px solid ${config.border}`,
        boxShadow: `0 0 32px ${config.bg}`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: config.color }}>
          {config.label}
        </span>
        <Icon size={20} style={{ color: config.color }} />
      </div>
      <div className="flex items-center gap-3 mb-4">
        <Avatar name={item.nome} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-white truncate">{item.nome}</p>
          <p className="text-[11px] text-white/45 truncate">{item.empresa || item.subline || '—'}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-3" style={{ borderTop: `1px solid ${config.border}` }}>
        {metrics.map((m, i) => (
          <div key={i}>
            <p className="text-[9px] text-white/35 uppercase tracking-wider">{m.label}</p>
            <p className="text-sm font-bold mt-0.5" style={{ color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
```

**Mudanças vs versão original:**
1. Adicionado prop `metricsRender(item)` opcional. Default = 3 métricas de cliente (eng/audiência/posts). Aba Consultores na Phase 3 vai passar metricsRender customizado (clientes_count/eng_medio/audiencia_total).
2. `item.subline` como segundo fallback no subline (depois de `empresa`) — permite consultor passar subline custom (ex: "12 clientes").

- [ ] **Step 2: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Ranking/shared/PodiumCard.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Ranking/shared/PodiumCard.jsx
git commit -m "refactor(ranking): extrai PodiumCard para shared/ + metricsRender prop"
```

---

### Task 6: Extrair `RankRow.jsx`

**Files:**
- Create: `frontend/src/components/Ranking/shared/RankRow.jsx`

- [ ] **Step 1: Criar `RankRow.jsx`**

Conteúdo (copiado de `Ranking.jsx:331-390`):

```jsx
import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'
import { formatCompact } from './formatters'
import { GOLD } from './constants'

// Linha da tabela "Ranking completo" — cliente com mini-bars de engajamento,
// audiência e posts/mês (normalizados pelo máximo do dataset).
//
// `max` é { eng, aud, posts } — calculado uma vez no parent via useMemo.
export default function RankRow({ item, rank, max, onClick, delay }) {
  const engPct = max.eng > 0 ? (item.taxa_engajamento / max.eng) * 100 : 0
  const audPct = max.aud > 0 ? (item.audiencia / max.aud) * 100 : 0
  const postsPct = max.posts > 0 ? ((item.posts_mes || 0) / max.posts) * 100 : 0
  return (
    <motion.tr
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      onClick={onClick}
      className="border-b last:border-0 transition-colors cursor-pointer hover:bg-white/[0.02]"
      style={{ borderColor: 'var(--flg-border)' }}
    >
      <td className="px-3 py-3 text-white/55 font-mono text-[11px] w-10">#{rank + 1}</td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar name={item.nome} size="sm" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white/90 truncate">{item.nome}</p>
            <p className="text-[10px] text-white/40 truncate">{item.empresa || '—'}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-white/55 text-[11px] hidden md:table-cell">{item.consultor || '—'}</td>
      <td className="px-3 py-3 text-right">
        <div className="flex items-center gap-2 justify-end">
          <div className="hidden lg:block w-16 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-full" style={{ width: `${engPct}%`, background: 'linear-gradient(90deg, #34D39960, #34D399)' }} />
          </div>
          <span className="text-[12px] font-semibold text-emerald-400 tabular-nums w-14 text-right">
            {(item.taxa_engajamento || 0).toFixed(2)}%
          </span>
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex items-center gap-2 justify-end">
          <div className="hidden lg:block w-16 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-full" style={{ width: `${audPct}%`, background: `linear-gradient(90deg, ${GOLD}60, ${GOLD})` }} />
          </div>
          <span className="text-[12px] text-white/80 tabular-nums w-14 text-right">{formatCompact(item.audiencia)}</span>
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex items-center gap-2 justify-end">
          <div className="hidden lg:block w-12 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-full" style={{ width: `${postsPct}%`, background: 'linear-gradient(90deg, #A855F760, #A855F7)' }} />
          </div>
          <span className="text-[12px] text-white/55 tabular-nums w-8 text-right">{item.posts_mes || 0}</span>
        </div>
      </td>
      <td className="px-3 py-3 text-right w-20">
        <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: GOLD }}>
          Ver <ExternalLink size={9} />
        </span>
      </td>
    </motion.tr>
  )
}
```

- [ ] **Step 2: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Ranking/shared/RankRow.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Ranking/shared/RankRow.jsx
git commit -m "refactor(ranking): extrai RankRow para shared/"
```

---

### Task 7: Extrair `ConsultorCard.jsx`

**Files:**
- Create: `frontend/src/components/Ranking/shared/ConsultorCard.jsx`

- [ ] **Step 1: Criar `ConsultorCard.jsx`**

Conteúdo (copiado de `Ranking.jsx:392-437`):

```jsx
import { motion } from 'framer-motion'
import { Crown, Trophy, Medal, Award } from 'lucide-react'
import { formatCompact } from './formatters'

// Card resumido do consultor — usado hoje na seção "Consultores do mês"
// (4 cards no rodapé da aba Clientes). Pode ser substituído na Phase 3 por
// um pódio + tabela full na aba Consultores; por ora mantemos a paridade.
//
// `consultor` shape (calculado client-side em RankingClientes): { nome, rank, numClientes, engMedio, audienciaTotal }.
export default function ConsultorCard({ consultor, delay }) {
  const palette = [
    { color: '#FACC15', icon: Crown },
    { color: '#CBD5E1', icon: Trophy },
    { color: '#D97706', icon: Medal },
    { color: '#60A5FA', icon: Award },
  ]
  const cfg = palette[consultor.rank] || palette[3]
  const Icon = cfg.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-xl p-4"
      style={{
        background: consultor.rank < 3
          ? `linear-gradient(135deg, ${cfg.color}15, rgba(0,0,0,0.2))`
          : 'var(--flg-bg-raised)',
        border: `1px solid ${consultor.rank < 3 ? cfg.color + '40' : 'var(--flg-border)'}`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: cfg.color }}>
          {consultor.rank === 0 ? 'CONSULTOR DESTAQUE' : `#${consultor.rank + 1}`}
        </span>
        <Icon size={16} style={{ color: cfg.color }} />
      </div>
      <p className="text-sm font-bold text-white/90 truncate mb-1">{consultor.nome}</p>
      <p className="text-[11px] text-white/45 mb-3">{consultor.numClientes} clientes</p>
      <div className="grid grid-cols-2 gap-2 pt-3" style={{ borderTop: `1px solid ${cfg.color}25` }}>
        <div>
          <p className="text-[9px] text-white/35 uppercase tracking-wider">Eng. médio</p>
          <p className="text-sm font-bold mt-0.5" style={{ color: cfg.color }}>
            {consultor.engMedio.toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="text-[9px] text-white/35 uppercase tracking-wider">Audiência total</p>
          <p className="text-sm font-bold text-white/85 mt-0.5">{formatCompact(consultor.audienciaTotal)}</p>
        </div>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Ranking/shared/ConsultorCard.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Ranking/shared/ConsultorCard.jsx
git commit -m "refactor(ranking): extrai ConsultorCard para shared/"
```

---

### Task 8: Criar `RankingClientes.jsx` consumindo os componentes extraídos

**Files:**
- Create: `frontend/src/components/Ranking/RankingClientes.jsx`

Esta tarefa monta a aba Clientes usando os componentes já extraídos. **Não muda nenhum comportamento** vs `Ranking.jsx` atual. Apenas reorganiza imports.

- [ ] **Step 1: Criar `RankingClientes.jsx`**

```jsx
/**
 * Aba Clientes do Ranking — UX atual preservada.
 * Pega `ranking` (array de clientes) e `loading` via props do parent `Ranking/index.jsx`.
 * Seções: Atenção Master, Sala dos Troféus, Pódio Geral, Tabela completa, Consultores do mês.
 *
 * Consultores agregados são calculados client-side aqui mesmo (lógica antiga).
 * Na Phase 3 essa seção será removida em favor da aba Consultores dedicada com
 * endpoint server-side `/ranking-consultores`.
 */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, Crown, TrendingUp, Award, Sparkles, ShieldAlert } from 'lucide-react'
import AtencaoMasterCard from './shared/AtencaoMasterCard'
import DestaqueCard from './shared/DestaqueCard'
import PodiumCard from './shared/PodiumCard'
import RankRow from './shared/RankRow'
import ConsultorCard from './shared/ConsultorCard'
import { CATEGORIAS } from './shared/constants'

export default function RankingClientes({ ranking, loading }) {
  const navigate = useNavigate()

  // Maximums pra normalizar mini-bars
  const max = useMemo(() => {
    return ranking.reduce((acc, r) => ({
      eng: Math.max(acc.eng, r.taxa_engajamento || 0),
      aud: Math.max(acc.aud, r.audiencia || 0),
      posts: Math.max(acc.posts, r.posts_mes || 0),
    }), { eng: 0, aud: 0, posts: 0 })
  }, [ranking])

  // Agregar por consultor (funcionário do mês) — client-side legado.
  const consultores = useMemo(() => {
    const byCons = {}
    ranking.forEach(r => {
      const nome = r.consultor || 'Sem consultor'
      if (!byCons[nome]) byCons[nome] = { nome, clientes: [], engSoma: 0, audTotal: 0 }
      byCons[nome].clientes.push(r)
      byCons[nome].engSoma += r.taxa_engajamento || 0
      byCons[nome].audTotal += r.audiencia || 0
    })
    return Object.values(byCons)
      .filter(c => c.nome !== 'Sem consultor')
      .map(c => ({
        nome: c.nome,
        numClientes: c.clientes.length,
        engMedio: c.engSoma / Math.max(c.clientes.length, 1),
        audienciaTotal: c.audTotal,
      }))
      .sort((a, b) => b.engMedio - a.engMedio)
      .slice(0, 4)
      .map((c, i) => ({ ...c, rank: i }))
  }, [ranking])

  const top3 = ranking.slice(0, 3)
  const resto = ranking.slice(3)

  if (loading) {
    return <p className="text-white/40 text-sm">Carregando ranking…</p>
  }

  if (ranking.length === 0) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
        <Sparkles size={28} className="mx-auto mb-3 text-white/30" />
        <p className="text-sm text-white/55">Nenhum cliente com dados de Instagram conectado.</p>
        <p className="text-xs text-white/35 mt-1">Conecte clientes e aguarde o sync pra ver o ranking.</p>
      </div>
    )
  }

  // ─── Atenção Master: clientes em crise (>= 4 dias sem postar) ───────────────
  // Lógica original mantida 100% — promoção visual de exemplos pros 3 tiers.
  let emCrise = ranking
    .filter(r => (r.dias_sem_postar || 0) >= 4)
    .sort((a, b) => (b.dias_sem_postar || 0) - (a.dias_sem_postar || 0))

  const hasCritical = emCrise.some(r => r.dias_sem_postar >= 14)
  const hasHigh = emCrise.some(r => r.dias_sem_postar >= 7 && r.dias_sem_postar < 14)
  const hasMed = emCrise.some(r => r.dias_sem_postar >= 4 && r.dias_sem_postar < 7)

  if (!hasCritical || !hasHigh || !hasMed) {
    const oks = ranking.filter(r => (r.dias_sem_postar || 0) < 4)
    let oksIdx = 0
    const pickNext = () => oks[oksIdx++ % Math.max(oks.length, 1)]
    const demos = []
    if (!hasCritical && oks.length > 0) {
      const c = pickNext()
      if (c) demos.push({ ...c, dias_sem_postar: 18, _demo: true })
    }
    if (!hasHigh && oks.length > 0) {
      const c = pickNext()
      if (c) demos.push({ ...c, dias_sem_postar: 9, _demo: true })
    }
    if (!hasMed && oks.length > 0) {
      const c = pickNext()
      if (c) demos.push({ ...c, dias_sem_postar: 5, _demo: true })
    }
    emCrise = [...emCrise, ...demos].sort((a, b) => (b.dias_sem_postar || 0) - (a.dias_sem_postar || 0))
  }

  emCrise = emCrise.slice(0, 8)

  const counts = {
    critical: emCrise.filter(r => r.dias_sem_postar >= 14).length,
    high:     emCrise.filter(r => r.dias_sem_postar >= 7 && r.dias_sem_postar < 14).length,
    med:      emCrise.filter(r => r.dias_sem_postar >= 4 && r.dias_sem_postar < 7).length,
  }
  const totalCrise = emCrise.length

  return (
    <div className="space-y-8">
      {/* Atenção Master */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h2 className="text-xs font-semibold text-white/85 uppercase tracking-widest flex items-center gap-2">
            <ShieldAlert size={14} className="text-red-400" /> Atenção Master · clientes sem produzir conteúdo
            {totalCrise > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase ml-1"
                    style={{ background: 'rgba(239,68,68,0.20)', color: '#F87171', border: '1px solid rgba(239,68,68,0.35)' }}>
                {totalCrise} em alerta
              </span>
            )}
          </h2>
          {totalCrise > 0 && (
            <div className="flex items-center gap-2 text-[10px]">
              {counts.critical > 0 && (
                <span className="px-2 py-0.5 rounded font-bold" style={{ background: 'rgba(239,68,68,0.18)', color: '#EF4444' }}>
                  {counts.critical} CRÍTICO
                </span>
              )}
              {counts.high > 0 && (
                <span className="px-2 py-0.5 rounded font-bold" style={{ background: 'rgba(249,115,22,0.18)', color: '#F97316' }}>
                  {counts.high} CRISE
                </span>
              )}
              {counts.med > 0 && (
                <span className="px-2 py-0.5 rounded font-bold" style={{ background: 'rgba(251,191,36,0.18)', color: '#FBBF24' }}>
                  {counts.med} ATENÇÃO
                </span>
              )}
            </div>
          )}
        </div>
        {totalCrise === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.20)' }}>
            <Sparkles size={24} className="mx-auto mb-2 text-emerald-400" />
            <p className="text-sm font-semibold text-white/80">Tudo em dia</p>
            <p className="text-xs text-white/45 mt-1">Todos os clientes postaram nos últimos 3 dias.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {emCrise.map((item, i) => (
              <AtencaoMasterCard
                key={item.cliente_id}
                item={item}
                delay={i * 0.04}
                onResolve={(r) => navigate(`/clientes/${r.cliente_id}`)}
                onWhats={(r) => alert(`Iniciar tratativa com ${r.nome} — integração WhatsApp/email em breve`)}
                onPerfil={(r) => navigate(`/metricas/${r.cliente_id}/geral`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Sala dos Troféus */}
      <section>
        <h2 className="text-xs font-semibold text-white/65 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Trophy size={13} className="text-amber-400" /> Sala dos Troféus · destaques por categoria
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {CATEGORIAS.map(cat => (
            <DestaqueCard
              key={cat.key}
              categoria={cat}
              ranking={ranking}
              onClick={(winner) => navigate(`/metricas/${winner.cliente_id}/geral`)}
            />
          ))}
        </div>
      </section>

      {/* Pódio Geral */}
      {top3.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-white/65 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Crown size={13} className="text-amber-400" /> Pódio Geral
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="order-2 lg:order-1">
              {top3[1] && <PodiumCard rank={1} item={top3[1]} onClick={() => navigate(`/metricas/${top3[1].cliente_id}/geral`)} />}
            </div>
            <div className="order-1 lg:order-2">
              {top3[0] && <PodiumCard rank={0} item={top3[0]} onClick={() => navigate(`/metricas/${top3[0].cliente_id}/geral`)} />}
            </div>
            <div className="order-3">
              {top3[2] && <PodiumCard rank={2} item={top3[2]} onClick={() => navigate(`/metricas/${top3[2].cliente_id}/geral`)} />}
            </div>
          </div>
        </section>
      )}

      {/* Tabela completa */}
      {resto.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-white/65 uppercase tracking-widest mb-3 flex items-center gap-2">
            <TrendingUp size={13} /> Ranking completo
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--flg-border)' }}>
                    <th className="text-left px-3 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">#</th>
                    <th className="text-left px-3 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Cliente</th>
                    <th className="text-left px-3 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal hidden md:table-cell">Consultor</th>
                    <th className="text-right px-3 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Engajamento</th>
                    <th className="text-right px-3 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Audiência</th>
                    <th className="text-right px-3 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Posts/mês</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {resto.map((r, i) => (
                    <RankRow
                      key={r.cliente_id}
                      item={r}
                      rank={i + 3}
                      max={max}
                      delay={i * 0.02}
                      onClick={() => navigate(`/metricas/${r.cliente_id}/geral`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Consultores do mês — legado client-side, removido na Phase 3 */}
      {consultores.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-white/65 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Award size={13} className="text-amber-400" /> Consultores do mês
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {consultores.map(c => (
              <ConsultorCard key={c.nome} consultor={c} delay={c.rank * 0.08} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Ranking/RankingClientes.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Ranking/RankingClientes.jsx
git commit -m "refactor(ranking): cria RankingClientes.jsx consumindo componentes extraídos"
```

---

### Task 9: Criar `RankingConsultores.jsx` stub

**Files:**
- Create: `frontend/src/components/Ranking/RankingConsultores.jsx`

- [ ] **Step 1: Criar stub "Em construção"**

```jsx
/**
 * Aba Consultores do Ranking — implementação completa nas Phases 2-5.
 * Phase 1 entrega só o stub pra validar o roteamento de tabs.
 */

import { Users, Hammer } from 'lucide-react'

export default function RankingConsultores({ ranking, loading }) {
  if (loading) {
    return <p className="text-white/40 text-sm">Carregando ranking…</p>
  }
  return (
    <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
      <div className="flex items-center justify-center gap-3 mb-4">
        <Users size={32} className="text-amber-400/60" />
        <Hammer size={20} className="text-white/30" />
      </div>
      <p className="text-base font-semibold text-white/80 mb-1">Ranking de Consultores</p>
      <p className="text-xs text-white/40 max-w-md mx-auto leading-relaxed">
        Em construção. Em breve aqui você verá pódio dos consultores, troféus por categoria,
        atenção operacional, tabela completa e drill-down com integração ClickUp + entregas.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Ranking/RankingConsultores.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Ranking/RankingConsultores.jsx
git commit -m "refactor(ranking): stub RankingConsultores.jsx (preenchido nas Phases 2-5)"
```

---

### Task 10: Criar `Ranking/index.jsx` — layout, tabs, fetch compartilhado

**Files:**
- Create: `frontend/src/components/Ranking/index.jsx`

Esse é o componente raiz que `App.jsx` importa via `'./components/Ranking'` (resolução automática de `index.jsx`).

- [ ] **Step 1: Criar `index.jsx`**

```jsx
/**
 * Ranking — orquestrador das abas Clientes / Consultores.
 *
 * Fetch é feito uma vez aqui; cada aba recebe o `ranking` via props.
 * Tab ativa controlada por `?tab=` na URL (bookmarkable).
 *
 * Header (título + período) é compartilhado pelas duas abas — período é
 * estado local por enquanto (não afeta backend ainda; flag pra Phase futura).
 */

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { api } from '../../lib/api'
import RankingClientes from './RankingClientes'
import RankingConsultores from './RankingConsultores'

const TABS = [
  { key: 'clientes',    label: 'Clientes' },
  { key: 'consultores', label: 'Consultores' },
]

export default function Ranking() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabAtiva = TABS.find(t => t.key === searchParams.get('tab'))?.key || 'clientes'

  const [ranking, setRanking] = useState([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState('mes')

  useEffect(() => {
    setLoading(true)
    api(`/metricas/ranking?plataforma=instagram`)
      .then(d => setRanking(d.ranking || []))
      .catch(() => setRanking([]))
      .finally(() => setLoading(false))
  }, [])

  function handleTabClick(key) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
            <Trophy size={22} className="text-amber-400" /> Ranking
          </h1>
          <p className="text-xs text-white/40 mt-1">
            {tabAtiva === 'clientes'
              ? 'Compilado das métricas do Instagram · ordenado por taxa de engajamento média'
              : 'Performance dos consultores · clientes geridos, engajamento agregado e volume de entregas'}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
          {[
            { key: 'semana', label: 'Semanal' },
            { key: 'mes', label: 'Mensal' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setPeriodo(opt.key)}
              className="px-3 py-1.5 rounded text-[11px] font-semibold transition-colors"
              style={periodo === opt.key
                ? { background: 'rgba(201,168,76,0.18)', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.35)' }
                : { color: 'rgba(255,255,255,0.50)', border: '1px solid transparent' }
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
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

      {/* Conteúdo da aba ativa */}
      {tabAtiva === 'clientes' && <RankingClientes ranking={ranking} loading={loading} />}
      {tabAtiva === 'consultores' && <RankingConsultores ranking={ranking} loading={loading} />}
    </div>
  )
}
```

- [ ] **Step 2: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Ranking/index.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Ranking/index.jsx
git commit -m "refactor(ranking): cria index.jsx com tabs Clientes/Consultores + URL ?tab="
```

---

### Task 11: Deletar `Ranking.jsx` legado

**Files:**
- Delete: `frontend/src/components/Ranking.jsx`

- [ ] **Step 1: Verificar que nada mais importa `./components/Ranking.jsx` diretamente (esperado: só `App.jsx`, que importa pelo path da pasta)**

```bash
cd frontend && grep -rn "components/Ranking" src/ --include="*.jsx" --include="*.js"
```

Expected: apenas matches em `src/App.jsx` linha 33 (`import('./components/Ranking')`) que resolve automaticamente pra `index.jsx`. Nenhum outro arquivo deve importar especificamente `Ranking.jsx`.

- [ ] **Step 2: Deletar o arquivo**

```bash
rm frontend/src/components/Ranking.jsx
```

- [ ] **Step 3: Bundle check completo (Vite resolve sem erros)**

```bash
cd frontend && node_modules/.bin/esbuild --bundle --loader:.jsx=jsx --jsx=automatic --external:react --external:react-dom --external:react-router-dom --external:framer-motion --external:lucide-react src/components/Ranking/index.jsx > /dev/null
```

Expected: exit 0 (bundle de todo o subtree de Ranking sem warnings).

- [ ] **Step 4: Commit**

```bash
git add -u frontend/src/components/Ranking.jsx
git commit -m "refactor(ranking): remove Ranking.jsx legado (substituído pela pasta Ranking/)"
```

---

### Task 12: Smoke test visual + push (deploy)

- [ ] **Step 1: Push pra main → deploy automático**

```bash
git push origin main
```

Expected: push aceito (Pedro autoriza pushes diretos pra main conforme [.github/AGENTE_DEPLOY.md](../../../.github/AGENTE_DEPLOY.md)).

- [ ] **Step 2: Esperar deploy completar**

```bash
DEPLOY_ID=$(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
until gh run view "$DEPLOY_ID" --json status -q '.status' 2>/dev/null | grep -q completed; do sleep 10; done
gh run view "$DEPLOY_ID" --json conclusion -q '.conclusion'
```

Expected: `success`.

- [ ] **Step 3: Verificar health do backend**

```bash
curl -s https://docs.foundersledgrowth.online/api/health
```

Expected: `{"status":"ok",...}`.

- [ ] **Step 4: Smoke test manual em produção (pelo Pedro)**

Critérios de aceite:
- Abre `https://docs.foundersledgrowth.online/ranking` → vê tabs "Clientes | Consultores" no topo, com "Clientes" ativa (sublinhado dourado)
- URL atualiza pra `?tab=clientes` ao clicar na tab (e `?tab=consultores` ao alternar)
- Aba "Clientes" mostra EXATAMENTE as 5 seções antigas: Atenção Master (com tiers), Sala dos Troféus (4 cards de troféu), Pódio Geral (1º-2º-3º), Ranking completo (tabela), Consultores do mês (4 cards)
- Aba "Consultores" mostra placeholder "Em construção"
- Recarregar com `?tab=consultores` mantém a aba selecionada
- Header continua mostrando "Ranking" + subtítulo + toggle Semanal/Mensal
- Botões "Resolver agora" / "Iniciar tratativa" / "Ver perfil" dos cards de Atenção Master funcionam (navegam ou abrem alert)
- Click em qualquer card de troféu ou linha da tabela navega pra `/metricas/:cid/geral`

Se algum item falhar, voltar e corrigir antes de marcar a phase concluída.

---

## Validação final da Phase 1

Phase 1 está completa quando todos esses critérios passam em produção:

- [x] Pasta `frontend/src/components/Ranking/` existe com 7 arquivos (`index.jsx`, `RankingClientes.jsx`, `RankingConsultores.jsx`, `shared/formatters.js`, `shared/constants.js`, e 5 componentes `.jsx` em `shared/`)
- [x] `frontend/src/components/Ranking.jsx` não existe mais
- [x] Aba "Clientes" é visualmente idêntica à tela antiga (todas as 5 seções presentes)
- [x] Aba "Consultores" mostra stub "Em construção"
- [x] URL `?tab=` funciona pra alternar abas e preservar estado em refresh
- [x] Deploy ok, health 200

Próximo passo: Phase 2 — backend endpoint `GET /metricas/ranking-consultores`. Plano separado, escrito quando esta Phase concluir.
