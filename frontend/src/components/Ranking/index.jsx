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
