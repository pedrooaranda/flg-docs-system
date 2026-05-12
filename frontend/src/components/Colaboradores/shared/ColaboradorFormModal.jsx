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
