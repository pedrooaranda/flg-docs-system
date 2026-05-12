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
import PasswordRevealModal from './shared/PasswordRevealModal'
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

  // Password reveal modal — aparece quando POST retorna temporary_password
  const [passwordReveal, setPasswordReveal] = useState(null)
  // shape: { password: string, email: string, nome: string } ou null

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

  function handleSaved(result) {
    // PATCH/POST atualizou DB — re-fetch pra puxar relações + ordering atualizados
    loadColaboradores()

    // Se o POST criou auth user novo, mostra modal de revelação da senha temporária.
    // result.temporary_password só vem em POST e só quando _create_auth_user retornou
    // um password novo. Em PATCH não vem.
    if (result?.temporary_password) {
      setPasswordReveal({
        password: result.temporary_password,
        email: result.email,
        nome: result.nome,
      })
    }
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

      <PasswordRevealModal
        open={passwordReveal !== null}
        password={passwordReveal?.password || ''}
        email={passwordReveal?.email || ''}
        nome={passwordReveal?.nome || ''}
        onClose={() => setPasswordReveal(null)}
      />
    </div>
  )
}
