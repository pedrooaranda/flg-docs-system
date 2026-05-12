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
