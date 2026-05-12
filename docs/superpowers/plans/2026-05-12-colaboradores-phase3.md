# Colaboradores — Phase 3: CRUD UI + Badges + Filtros

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-10-colaboradores-design.md](../specs/2026-05-10-colaboradores-design.md)

**Goal:** Adicionar CRUD via UI na página `/colaboradores` — modal de criar/editar (admin+ ou self para member), badges visuais coloridos pra tier e role, filtros (busca por nome/email, dropdown de tier, checkbox "só admins/owners"), botão "+ Adicionar colaborador" (admin only) e ações inline (Editar/Desativar) na tabela com permissões corretas.

**Architecture:** Phase 3 extrai `shared/` da `Colaboradores/index.jsx` (~158 linhas hoje) seguindo o padrão validado em `Ranking/shared/`. Cada arquivo tem responsabilidade única: constantes/configs em `constants.js`, badges atômicos (`TierBadge`, `RoleBadge`), row com lógica de permissões (`ColaboradorRow`), modal com formulário e validação (`ColaboradorFormModal`). `index.jsx` vira orquestrador de fetch + filtros + estado de modal + handlers. Permissões UI derivadas de `user.user_metadata.role` via helpers `isAdmin`/`isOwner` em `lib/utils.js`.

**Tech Stack:** React 18, Tailwind, lucide-react (`Pencil`, `UserX`, `X`, `Crown`, `Shield`, `Search`), helper `api()` de `lib/api.js`, `useToast()` de `lib/toast.jsx` pra feedback. Sem Radix Dialog (modal próprio simples — backdrop click + esc fecham). Validação via `esbuild --bundle=false --loader:.jsx=jsx`.

**Não-objetivos:**
- Sem helper `isOwner()` separado em `lib/utils.js` — feito inline via `user.user_metadata.role === 'owner'` por enquanto. Phase 4 extrai se necessário.
- Sem botão "Convidar via Auth" (fora de escopo)
- Sem foto upload — apenas URL externa
- Sem auditoria de quem editou o quê
- Sem confirmação modal pra desativar (window.confirm simples)
- Sem virtualização de tabela (workspace pequeno)

---

## File Structure

**Criar:**
- `frontend/src/components/Colaboradores/shared/constants.js` — `TIER_CONFIG`, `ROLE_CONFIG`, `CATEGORIA_CONFIG`, `TIERS`, `ROLES`, `CATEGORIAS`, `SELF_EDITABLE_FIELDS`
- `frontend/src/components/Colaboradores/shared/TierBadge.jsx` — badge colorido pro tier
- `frontend/src/components/Colaboradores/shared/RoleBadge.jsx` — badge Owner (coroa) / Admin (escudo) / Member (sem badge)
- `frontend/src/components/Colaboradores/shared/ColaboradorRow.jsx` — `<tr>` com avatar/nome/cargo/badges/manager + botões editar/desativar com permissões
- `frontend/src/components/Colaboradores/shared/ColaboradorFormModal.jsx` — modal de criar/editar com formulário, validação inline e POST/PATCH

**Modificar:**
- `frontend/src/lib/utils.js` — `isAdmin()` agora considera role `'owner'` (não só `'admin'`)
- `frontend/src/components/Colaboradores/index.jsx` — adicionar filtros, botão "+", integração modal, usar `ColaboradorRow`
- `frontend/src/App.jsx` — passar `session={session}` para `<Colaboradores>`

---

## Tarefas

### Task 1: Atualizar `lib/utils.js` para que `isAdmin()` reconheça `'owner'`

**Files:**
- Modify: `frontend/src/lib/utils.js`

Hoje `isAdmin()` só checa `role === 'admin'`. Como Pedro tem `role='owner'` no `user_metadata` após Phase 1, sem essa atualização ele perderia capacidades de admin no UI (depende do fallback `email.includes('pedro')` ainda). Owners devem ter TODAS as capacidades de admin + extras (promoção a owner etc.).

- [ ] **Step 1: Localizar a função `isAdmin` atual**

```bash
grep -n "export function isAdmin" frontend/src/lib/utils.js
```

Expected: linha tipo `export function isAdmin(user) {`.

- [ ] **Step 2: Substituir o bloco completo**

Substituir:

```javascript
export function isAdmin(user) {
  return user?.email?.includes('pedro') || user?.user_metadata?.role === 'admin'
}
```

Por:

```javascript
export function isAdmin(user) {
  const role = user?.user_metadata?.role
  return role === 'owner' || role === 'admin' || user?.email?.includes('pedro')
}
```

Mudança: agora `owner` também conta como admin pra propósitos do UI legado (que decide visibilidade de itens admin-only na sidebar etc.). O fallback `email.includes('pedro')` continua como rede de segurança.

- [ ] **Step 3: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/lib/utils.js > /dev/null
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/utils.js
git commit -m "feat(utils): isAdmin() agora reconhece role='owner' (Phase 1 colaboradores)"
```

---

### Task 2: Criar `shared/constants.js`

**Files:**
- Create: `frontend/src/components/Colaboradores/shared/constants.js`

- [ ] **Step 1: Criar a pasta `shared/`**

```bash
mkdir -p frontend/src/components/Colaboradores/shared
```

- [ ] **Step 2: Criar `constants.js`**

```javascript
import { Crown, Shield } from 'lucide-react'

// Tier (seniority) — cores escolhidas pra hierarquia visual: cinza → azul → dourado FLG → roxo.
export const TIER_CONFIG = {
  junior: { label: 'Junior', color: 'rgba(255,255,255,0.65)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.18)' },
  pleno:  { label: 'Pleno',  color: '#60A5FA',                 bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.30)' },
  senior: { label: 'Sênior', color: '#C9A84C',                 bg: 'rgba(201,168,76,0.12)',  border: 'rgba(201,168,76,0.35)' },
  lead:   { label: 'Lead',   color: '#A78BFA',                 bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.35)' },
}

// Role (permissão) — owner usa amarelo dourado (coroa), admin usa dourado FLG (escudo), member sem badge.
export const ROLE_CONFIG = {
  owner:  { label: 'Owner',  color: '#FACC15', bg: 'rgba(250,204,21,0.12)', border: 'rgba(250,204,21,0.35)', icon: Crown },
  admin:  { label: 'Admin',  color: '#C9A84C', bg: 'rgba(201,168,76,0.12)', border: 'rgba(201,168,76,0.35)', icon: Shield },
  member: null,
}

export const CATEGORIA_CONFIG = {
  consultor: { label: 'Consultor' },
  diretor:   { label: 'Diretor' },
}

// Enums em arrays — usados em dropdowns de formulário e validação.
export const TIERS      = ['junior', 'pleno', 'senior', 'lead']
export const ROLES      = ['owner', 'admin', 'member']
export const CATEGORIAS = ['consultor', 'diretor']

// Campos que member pode editar do próprio registro. Espelha SELF_EDITABLE_FIELDS
// no backend (backend/routes/colaboradores.py) — manter sincronizado.
export const SELF_EDITABLE_FIELDS = new Set(['nome', 'cargo', 'avatar_url'])

// Classe utilitária pra inputs do modal (form fields).
export const INPUT_CLASS = "w-full px-3 py-2 rounded-lg text-sm bg-[var(--flg-bg-raised)] border border-[var(--flg-border)] text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A84C]/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
```

- [ ] **Step 3: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Colaboradores/shared/constants.js > /dev/null
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Colaboradores/shared/constants.js
git commit -m "feat(colaboradores): cria shared/constants.js (TIER_CONFIG, ROLE_CONFIG, enums)"
```

---

### Task 3: Criar `shared/TierBadge.jsx` + `shared/RoleBadge.jsx`

**Files:**
- Create: `frontend/src/components/Colaboradores/shared/TierBadge.jsx`
- Create: `frontend/src/components/Colaboradores/shared/RoleBadge.jsx`

- [ ] **Step 1: Criar `TierBadge.jsx`**

```jsx
import { TIER_CONFIG } from './constants'

// Badge colorido pra tier (junior/pleno/senior/lead). Se tier não setado ou inválido,
// renderiza um dash discreto.
export default function TierBadge({ tier }) {
  if (!tier) return <span className="text-[11px] text-white/40">—</span>
  const cfg = TIER_CONFIG[tier]
  if (!cfg) return <span className="text-[11px] text-white/40 capitalize">{tier}</span>
  return (
    <span
      className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
    >
      {cfg.label}
    </span>
  )
}
```

- [ ] **Step 2: Criar `RoleBadge.jsx`**

```jsx
import { ROLE_CONFIG } from './constants'

// Badge com ícone pra role. Owner (coroa amarela), Admin (escudo dourado), Member sem badge
// (renderiza dash). Role desconhecida: texto capitalizado fallback.
export default function RoleBadge({ role }) {
  const cfg = ROLE_CONFIG[role]
  if (!cfg) {
    // role='member' ou desconhecida — dash discreto
    if (!role || role === 'member') {
      return <span className="text-[11px] text-white/40">—</span>
    }
    return <span className="text-[11px] text-white/40 capitalize">{role}</span>
  }
  const Icon = cfg.icon
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
    >
      {Icon && <Icon size={10} />}
      {cfg.label}
    </span>
  )
}
```

- [ ] **Step 3: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Colaboradores/shared/TierBadge.jsx src/components/Colaboradores/shared/RoleBadge.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Colaboradores/shared/TierBadge.jsx frontend/src/components/Colaboradores/shared/RoleBadge.jsx
git commit -m "feat(colaboradores): cria badges visuais (TierBadge + RoleBadge)"
```

---

### Task 4: Criar `shared/ColaboradorRow.jsx`

**Files:**
- Create: `frontend/src/components/Colaboradores/shared/ColaboradorRow.jsx`

Extrai o `<tr>` inline do `index.jsx` adicionando botões Editar/Desativar com lógica de permissões espelhando o backend (`backend/routes/colaboradores.py`).

- [ ] **Step 1: Criar `ColaboradorRow.jsx`**

```jsx
import { Pencil, UserX } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'
import TierBadge from './TierBadge'
import RoleBadge from './RoleBadge'

/**
 * Row da tabela de colaboradores com botões condicionais por permissão.
 *
 * Regras de permissão (espelha backend):
 * - Botão Editar visível se admin+ OU se for o próprio registro do caller (self-edit).
 * - Botão Desativar visível se admin+ E não for self E (caller é owner OU target não é owner).
 *
 * @param colaborador - dict completo do colaborador
 * @param managerNome - nome do manager pré-resolvido (string ou null)
 * @param isAdminPlus - boolean: caller tem role admin ou owner
 * @param isOwner - boolean: caller tem role owner (permite desativar outros owners)
 * @param currentUserEmail - email do caller pra detectar self
 * @param onEdit(colaborador) - callback ao clicar editar
 * @param onDeactivate(colaborador) - callback ao clicar desativar
 */
export default function ColaboradorRow({
  colaborador,
  managerNome,
  isAdminPlus,
  isOwner,
  currentUserEmail,
  onEdit,
  onDeactivate,
}) {
  const isSelf = colaborador.email === currentUserEmail
  const canEdit = isAdminPlus || isSelf
  const targetIsOwner = colaborador.role === 'owner'
  const canDeactivate = isAdminPlus && !isSelf && (isOwner || !targetIsOwner)

  return (
    <tr className="border-b last:border-0" style={{ borderColor: 'var(--flg-border)' }}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={colaborador.nome} size="sm" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white/90 truncate">{colaborador.nome}</p>
            <p className="text-[10px] text-white/40 truncate">{colaborador.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-[11px] text-white/65 hidden md:table-cell">{colaborador.cargo || '—'}</td>
      <td className="px-4 py-3"><TierBadge tier={colaborador.tier} /></td>
      <td className="px-4 py-3"><RoleBadge role={colaborador.role} /></td>
      <td className="px-4 py-3 text-[11px] text-white/45 hidden lg:table-cell">{managerNome || '—'}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {canEdit && (
            <button
              onClick={() => onEdit(colaborador)}
              className="p-1.5 rounded hover:bg-white/5 text-white/55 hover:text-white/90 transition-colors cursor-pointer"
              title={isSelf && !isAdminPlus ? 'Editar meu perfil' : 'Editar'}
            >
              <Pencil size={13} />
            </button>
          )}
          {canDeactivate && (
            <button
              onClick={() => onDeactivate(colaborador)}
              className="p-1.5 rounded hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors cursor-pointer"
              title="Desativar"
            >
              <UserX size={13} />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
```

- [ ] **Step 2: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Colaboradores/shared/ColaboradorRow.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Colaboradores/shared/ColaboradorRow.jsx
git commit -m "feat(colaboradores): extrai ColaboradorRow com botões editar/desativar (permission-aware)"
```

---

### Task 5: Criar `shared/ColaboradorFormModal.jsx`

**Files:**
- Create: `frontend/src/components/Colaboradores/shared/ColaboradorFormModal.jsx`

Modal de criar/editar. Sem Radix Dialog — modal custom simples (backdrop click fecha, ESC fecha). Formulário com todos os campos, validação client-side mínima (required), desabilita campos conforme permissão (member: só `SELF_EDITABLE_FIELDS`). Submit chama `POST` ou `PATCH` e dispara toast.

- [ ] **Step 1: Criar `ColaboradorFormModal.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { api } from '../../../lib/api'
import { useToast } from '../../../lib/toast'
import {
  TIERS, ROLES, CATEGORIAS, CATEGORIA_CONFIG,
  SELF_EDITABLE_FIELDS, INPUT_CLASS,
} from './constants'

/**
 * Modal de criar/editar colaborador.
 *
 * @param open - boolean visibilidade
 * @param mode - 'create' | 'edit'
 * @param initialData - colaborador completo (edit) ou null (create)
 * @param isAdminPlus - caller pode editar tudo (admin ou owner)
 * @param isOwner - caller pode promover/rebaixar role='owner'
 * @param allColaboradores - array pra popular dropdown de manager
 * @param onClose - callback fechar modal
 * @param onSaved(colaborador) - callback após POST/PATCH bem-sucedido
 */
export default function ColaboradorFormModal({
  open, mode, initialData,
  isAdminPlus, isOwner,
  allColaboradores,
  onClose, onSaved,
}) {
  const toast = useToast()
  const [form, setForm] = useState({
    email: '', nome: '', categoria: 'consultor', cargo: '',
    tier: '', role: 'member', manager_id: '', avatar_url: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Reset / hydrate quando modal abre
  useEffect(() => {
    if (!open) return
    setError(null)
    if (mode === 'edit' && initialData) {
      setForm({
        email: initialData.email || '',
        nome: initialData.nome || '',
        categoria: initialData.categoria || 'consultor',
        cargo: initialData.cargo || '',
        tier: initialData.tier || '',
        role: initialData.role || 'member',
        manager_id: initialData.manager_id || '',
        avatar_url: initialData.avatar_url || '',
      })
    } else {
      setForm({
        email: '', nome: '', categoria: 'consultor', cargo: '',
        tier: '', role: 'member', manager_id: '', avatar_url: '',
      })
    }
  }, [open, mode, initialData])

  // ESC fecha o modal
  useEffect(() => {
    if (!open) return
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function fieldDisabled(field) {
    // Member auto-editando: só SELF_EDITABLE_FIELDS
    if (mode === 'edit' && !isAdminPlus) {
      return !SELF_EDITABLE_FIELDS.has(field)
    }
    // Email não editável em edit (chave de junção com auth.users)
    if (mode === 'edit' && field === 'email') return true
    return false
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      // Limpa strings vazias pra não mandar campos opcionais como ""
      const payload = { ...form }
      const optionalFields = ['cargo', 'tier', 'manager_id', 'avatar_url']
      for (const f of optionalFields) {
        if (payload[f] === '') delete payload[f]
      }

      let result
      if (mode === 'create') {
        result = await api('/colaboradores', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        toast({ title: 'Colaborador criado', description: result.nome, variant: 'success' })
      } else {
        // PATCH não envia email (read-only no edit)
        delete payload.email
        result = await api(`/colaboradores/${initialData.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        toast({ title: 'Alterações salvas', description: result.nome, variant: 'success' })
      }
      onSaved(result)
      onClose()
    } catch (err) {
      setError(err.message || 'Erro ao salvar')
    } finally {
      setSubmitting(false)
    }
  }

  // Manager dropdown: todos ativos exceto o próprio (evita ciclo trivial)
  const managerOptions = (allColaboradores || []).filter(
    c => c.ativo !== false && c.id !== initialData?.id
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--flg-bg-secondary)', border: '1px solid var(--flg-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div
            className="flex items-center justify-between p-5 border-b"
            style={{ borderColor: 'var(--flg-border)' }}
          >
            <h2 className="font-display text-lg font-bold text-white">
              {mode === 'create' ? 'Adicionar colaborador' : 'Editar colaborador'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-white/40 hover:text-white cursor-pointer transition-colors"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <FormField label="E-mail" required>
              <input
                type="email"
                value={form.email}
                onChange={e => update('email', e.target.value)}
                disabled={fieldDisabled('email')}
                required={mode === 'create'}
                className={INPUT_CLASS}
                placeholder="usuario@grupoguglielmi.com"
              />
              {mode === 'create' && (
                <p className="text-[10px] text-white/35 mt-1">
                  O usuário precisa existir no Supabase Auth antes — convide pelo dashboard se ainda não tiver conta.
                </p>
              )}
            </FormField>

            <FormField label="Nome" required>
              <input
                type="text"
                value={form.nome}
                onChange={e => update('nome', e.target.value)}
                disabled={fieldDisabled('nome')}
                required
                className={INPUT_CLASS}
                placeholder="Nome completo"
              />
            </FormField>

            <FormField label="Categoria">
              <select
                value={form.categoria}
                onChange={e => update('categoria', e.target.value)}
                disabled={fieldDisabled('categoria')}
                className={INPUT_CLASS}
              >
                {CATEGORIAS.map(c => (
                  <option key={c} value={c}>{CATEGORIA_CONFIG[c].label}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Cargo">
              <input
                type="text"
                value={form.cargo}
                onChange={e => update('cargo', e.target.value)}
                disabled={fieldDisabled('cargo')}
                className={INPUT_CLASS}
                placeholder="Ex: Consultora de Performance"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Tier">
                <select
                  value={form.tier}
                  onChange={e => update('tier', e.target.value)}
                  disabled={fieldDisabled('tier')}
                  className={INPUT_CLASS}
                >
                  <option value="">— sem tier —</option>
                  {TIERS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Role">
                <select
                  value={form.role}
                  onChange={e => update('role', e.target.value)}
                  disabled={fieldDisabled('role')}
                  className={INPUT_CLASS}
                >
                  {ROLES.map(r => {
                    const ownerDisabled = r === 'owner' && !isOwner
                    return (
                      <option key={r} value={r} disabled={ownerDisabled}>
                        {r}{ownerDisabled ? ' (só owner atribui)' : ''}
                      </option>
                    )
                  })}
                </select>
              </FormField>
            </div>

            <FormField label="Manager (opcional)">
              <select
                value={form.manager_id}
                onChange={e => update('manager_id', e.target.value)}
                disabled={fieldDisabled('manager_id')}
                className={INPUT_CLASS}
              >
                <option value="">— sem manager —</option>
                {managerOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.nome} · {c.role}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Avatar URL (opcional)">
              <input
                type="url"
                value={form.avatar_url}
                onChange={e => update('avatar_url', e.target.value)}
                disabled={fieldDisabled('avatar_url')}
                className={INPUT_CLASS}
                placeholder="https://..."
              />
            </FormField>

            {error && (
              <div
                className="rounded-lg p-3"
                style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)' }}
              >
                <p className="text-xs font-semibold text-red-400">Erro</p>
                <p className="text-xs text-white/70 mt-0.5">{error}</p>
              </div>
            )}
          </div>

          <div
            className="flex items-center justify-end gap-2 p-5 border-t"
            style={{ borderColor: 'var(--flg-border)' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white/65 hover:text-white transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#C9A84C', color: '#080808' }}
            >
              {submitting ? 'Salvando…' : mode === 'create' ? 'Criar' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FormField({ label, required, children }) {
  return (
    <div>
      <label className="block text-[10px] tracking-widest uppercase text-white/45 font-semibold mb-1.5">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Colaboradores/shared/ColaboradorFormModal.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Colaboradores/shared/ColaboradorFormModal.jsx
git commit -m "feat(colaboradores): cria ColaboradorFormModal (criar/editar com permission-aware fields)"
```

---

### Task 6: Refatorar `Colaboradores/index.jsx` — filtros + botão "+" + integração modal

**Files:**
- Modify: `frontend/src/components/Colaboradores/index.jsx`

Substituição completa do arquivo. Conteúdo novo abaixo.

- [ ] **Step 1: Substituir o `index.jsx` completo**

Substituir o conteúdo atual de `frontend/src/components/Colaboradores/index.jsx` por:

```jsx
/**
 * Colaboradores — orquestrador das abas Consultores / Diretores.
 *
 * Phase 3 adiciona:
 *   - Botão "+ Adicionar" (admin+ only) abrindo modal
 *   - Edição inline via ColaboradorRow + modal
 *   - Badges visuais (TierBadge, RoleBadge)
 *   - Filtros (busca por nome/email, dropdown tier, checkbox "só admins/owners")
 *   - Soft-delete com window.confirm
 *
 * Phase 4 vai polir: empty states ricos, loading skeletons, isOwner() helper extraído.
 */

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { UserCog, Plus, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { isAdmin } from '../../lib/utils'
import { useToast } from '../../lib/toast'
import ColaboradorRow from './shared/ColaboradorRow'
import ColaboradorFormModal from './shared/ColaboradorFormModal'
import { TIERS, INPUT_CLASS } from './shared/constants'

const TABS = [
  { key: 'consultores', label: 'Consultores', categoria: 'consultor' },
  { key: 'diretores',   label: 'Diretores',   categoria: 'diretor' },
]

export default function Colaboradores({ session }) {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabAtiva = TABS.find(t => t.key === searchParams.get('tab'))?.key || 'consultores'
  const activeCategoria = TABS.find(t => t.key === tabAtiva).categoria

  const [colaboradores, setColaboradores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filtros
  const [search, setSearch] = useState('')
  const [filterTier, setFilterTier] = useState('')
  const [onlyAdmins, setOnlyAdmins] = useState(false)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('create')
  const [editingColaborador, setEditingColaborador] = useState(null)

  // Permissões UI derivadas
  const user = session?.user
  const isAdminPlus = isAdmin(user)
  const isOwner = user?.user_metadata?.role === 'owner' || user?.email?.includes('pedro')
  const currentUserEmail = user?.email

  function loadColaboradores() {
    setLoading(true)
    setError(null)
    return api('/colaboradores')
      .then(d => setColaboradores(d.colaboradores || []))
      .catch(e => {
        setColaboradores([])
        setError(e.message || 'Erro ao carregar colaboradores')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadColaboradores()
  }, [])

  function handleTabClick(key) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  function handleAdd() {
    setModalMode('create')
    setEditingColaborador(null)
    setModalOpen(true)
  }

  function handleEdit(colaborador) {
    setModalMode('edit')
    setEditingColaborador(colaborador)
    setModalOpen(true)
  }

  async function handleDeactivate(colaborador) {
    const ok = window.confirm(`Desativar ${colaborador.nome}? O registro continua no banco mas some das listas.`)
    if (!ok) return
    try {
      await api(`/colaboradores/${colaborador.id}`, { method: 'DELETE' })
      toast({ title: 'Colaborador desativado', description: colaborador.nome, variant: 'success' })
      loadColaboradores()
    } catch (err) {
      toast({ title: 'Erro ao desativar', description: err.message, variant: 'error' })
    }
  }

  function handleSaved() {
    // PATCH/POST atualizou DB — re-fetch pra puxar relações + ordering atualizados
    loadColaboradores()
  }

  // Filtro aplicado: categoria da aba + ativo + busca + tier + role admin/owner
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return colaboradores.filter(c => {
      if (c.categoria !== activeCategoria) return false
      if (c.ativo === false) return false
      if (q && !c.nome.toLowerCase().includes(q) && !c.email.toLowerCase().includes(q)) return false
      if (filterTier && c.tier !== filterTier) return false
      if (onlyAdmins && c.role !== 'admin' && c.role !== 'owner') return false
      return true
    })
  }, [colaboradores, activeCategoria, search, filterTier, onlyAdmins])

  const idToNome = useMemo(
    () => Object.fromEntries(colaboradores.map(c => [c.id, c.nome])),
    [colaboradores]
  )

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
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
        {isAdminPlus && (
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer hover:opacity-90"
            style={{ background: '#C9A84C', color: '#080808' }}
          >
            <Plus size={14} /> Adicionar colaborador
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b" style={{ borderColor: 'var(--flg-border)' }}>
        {TABS.map(t => {
          const ativa = tabAtiva === t.key
          return (
            <button
              key={t.key}
              onClick={() => handleTabClick(t.key)}
              className="relative py-3 text-sm font-semibold transition-colors cursor-pointer"
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

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className={INPUT_CLASS + " pl-9"}
          />
        </div>
        <select
          value={filterTier}
          onChange={e => setFilterTier(e.target.value)}
          className={INPUT_CLASS + " max-w-[160px]"}
        >
          <option value="">Todos os tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-2 cursor-pointer text-xs text-white/65 select-none">
          <input
            type="checkbox"
            checked={onlyAdmins}
            onChange={e => setOnlyAdmins(e.target.checked)}
            className="accent-[#C9A84C]"
          />
          Só admins/owners
        </label>
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
          <p className="text-sm text-white/55">
            {search || filterTier || onlyAdmins
              ? 'Nenhum colaborador bate com os filtros.'
              : `Nenhum ${activeCategoria} cadastrado ainda.`}
          </p>
          {isAdminPlus && !search && !filterTier && !onlyAdmins && (
            <p className="text-xs text-white/35 mt-1">
              Clique em <span className="text-amber-400">+ Adicionar colaborador</span> pra começar.
            </p>
          )}
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <ColaboradorRow
                    key={c.id}
                    colaborador={c}
                    managerNome={idToNome[c.manager_id]}
                    isAdminPlus={isAdminPlus}
                    isOwner={isOwner}
                    currentUserEmail={currentUserEmail}
                    onEdit={handleEdit}
                    onDeactivate={handleDeactivate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ColaboradorFormModal
        open={modalOpen}
        mode={modalMode}
        initialData={editingColaborador}
        isAdminPlus={isAdminPlus}
        isOwner={isOwner}
        allColaboradores={colaboradores}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  )
}
```

- [ ] **Step 2: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Colaboradores/index.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 3: Bundle check completo**

```bash
cd frontend && node_modules/.bin/esbuild --bundle --loader:.jsx=jsx --jsx=automatic --external:react --external:react-dom --external:react-router-dom --external:framer-motion --external:lucide-react --external:@radix-ui/react-toast src/components/Colaboradores/index.jsx > /dev/null
```

Expected: exit 0 (subtree completa compila com deps externas — `@radix-ui/react-toast` aparece via `lib/toast.jsx`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Colaboradores/index.jsx
git commit -m "feat(colaboradores): index.jsx integra filtros + botão + modal + ColaboradorRow"
```

---

### Task 7: Passar `session` para `<Colaboradores>` em `App.jsx`

**Files:**
- Modify: `frontend/src/App.jsx`

Hoje a rota `/colaboradores` não passa `session={session}` — Colaboradores Phase 3 precisa do session pra derivar `isAdmin`/`isOwner` e `currentUserEmail`.

- [ ] **Step 1: Localizar a Route `/colaboradores` em `App.jsx`**

```bash
grep -n "colaboradores" frontend/src/App.jsx
```

Expected: tem pelo menos 3 hits — o `lazy(() => import('./components/Colaboradores'))`, o `<Route path="/colaboradores">` e o `<Colaboradores />` dentro do AuthGuard.

- [ ] **Step 2: Adicionar prop `session={session}` ao componente**

Localizar o bloco:

```jsx
          <Route path="/colaboradores" element={
            <AuthGuard session={session} title="Colaboradores">
              <Colaboradores />
            </AuthGuard>
          } />
```

Substituir o `<Colaboradores />` por:

```jsx
              <Colaboradores session={session} />
```

Bloco final:

```jsx
          <Route path="/colaboradores" element={
            <AuthGuard session={session} title="Colaboradores">
              <Colaboradores session={session} />
            </AuthGuard>
          } />
```

- [ ] **Step 3: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/App.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(colaboradores): passa session={session} pra Colaboradores em App.jsx"
```

---

### Task 8: Deploy + smoke test em produção

- [ ] **Step 1: Push**

```bash
git push origin main
```

Expected: push aceito.

- [ ] **Step 2: Aguardar deploy**

```bash
DEPLOY_ID=$(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
until gh run view "$DEPLOY_ID" --json status -q '.status' 2>/dev/null | grep -q completed; do sleep 10; done
gh run view "$DEPLOY_ID" --json conclusion -q '.conclusion'
```

Expected: `success`.

- [ ] **Step 3: Bundle frontend rebuildou**

```bash
curl -s https://docs.foundersledgrowth.online/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1
```

Expected: hash NOVO (diferente do bundle Phase 2 `index-Cra3D_XF.js`).

- [ ] **Step 4: Health check**

```bash
curl -s https://docs.foundersledgrowth.online/api/health
```

Expected: `{"status":"ok",...}`.

- [ ] **Step 5: Smoke test manual (executado pelo Pedro)**

Critérios de aceite:
- **Cmd+Shift+R** em `/colaboradores` pra cache fresco
- Aba "Diretores" mostra Pedro com badge **Owner** (coroa amarela) ao lado do nome
- Filtros aparecem no topo: busca, dropdown de tier, checkbox "só admins/owners"
- Botão **+ Adicionar colaborador** (dourado) visível no header
- Click no botão **+ Adicionar** → modal abre, formulário em branco, primeiro campo é E-mail
- Testar criação: tenta com email inventado (ex `teste123@grupoguglielmi.com`) → erro "Email teste123... não tem conta no Supabase Auth..."
- Convidar um user de teste no Supabase Auth Dashboard primeiro, depois testar criação com esse email + categoria=consultor + cargo="Teste" + tier=pleno + role=member → toast verde "Colaborador criado", aba Consultores agora mostra essa pessoa com badge **Pleno** (azul) e role badge ausente (member)
- Testar edição: ícone Pencil ao lado do colaborador teste → modal abre preenchido, mudar tier pra senior, salvar → toast "Alterações salvas", badge muda pra **Sênior** (dourado)
- Testar promoção a admin: editar colaborador teste, role=admin, salvar → badge **Admin** (escudo dourado) aparece
- Tentar promover a owner: dropdown role mostra "owner (só owner atribui)" mas DESABILITADO porque Pedro É owner — então owner deve aparecer SELECIONÁVEL. Promover, salvar → badge **Owner** (coroa) aparece
- Filtro busca: digitar parte do nome → tabela filtra. Limpar → volta tudo
- Filtro tier: selecionar "senior" → só sênior aparece
- Checkbox "só admins/owners": ativar → só Pedro (owner) + colaborador teste (se admin) aparecem
- Testar desativação: clicar UserX → confirm "Desativar X?" → Sim → toast verde, colaborador some da lista
- Tentar desativar você mesmo (Pedro) → NÃO deve aparecer o botão UserX na sua linha (bloqueado pelo `!isSelf`)

Se qualquer item falhar, voltar e corrigir antes de marcar Phase 3 completa.

---

## Critérios de aceite Phase 3

Phase 3 completa quando:

- [x] Tabela `frontend/src/components/Colaboradores/shared/` existe com 5 arquivos: constants.js, TierBadge.jsx, RoleBadge.jsx, ColaboradorRow.jsx, ColaboradorFormModal.jsx
- [x] `isAdmin()` em `lib/utils.js` reconhece `role='owner'`
- [x] Página `/colaboradores` mostra badges visuais coloridos pra tier e role
- [x] Botão "+ Adicionar" aparece só pra admin+
- [x] Modal de criar funciona com validação de email no Supabase Auth
- [x] Modal de editar respeita permissões (member só edita SELF_EDITABLE_FIELDS do próprio registro)
- [x] Soft-delete via UserX funciona com confirm + toast
- [x] Filtros (busca + tier + só admins) funcionam combinados
- [x] Owner pode promover/rebaixar outro owner; admin não consegue
- [x] Self-deactivation bloqueada na UI (botão UserX não aparece)
- [x] Deploy ok, bundle frontend rebuildou

Próximo passo: Phase 4 — polish (empty states ricos, loading skeletons, responsive mobile, extração de `isOwner()` helper).
