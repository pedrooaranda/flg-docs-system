import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Crown } from 'lucide-react'
import { api } from '../lib/api'

export default function Ranking() {
  const navigate = useNavigate()
  const [ranking, setRanking] = useState([])
  const [loading, setLoading] = useState(true)
  const platform = 'instagram'

  useEffect(() => {
    setLoading(true)
    api(`/metricas/ranking?plataforma=${platform}`)
      .then(d => setRanking(d.ranking || []))
      .catch(() => setRanking([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
          Ranking de Clientes
        </h1>
        <p className="text-xs text-white/50 mt-1">
          Ordenado por taxa de engajamento média nos últimos 30 dias.
        </p>
      </div>

      {loading ? (
        <p className="text-white/40 text-sm">Carregando…</p>
      ) : ranking.length === 0 ? (
        <p className="text-white/40 text-sm">Nenhum cliente com dados de Instagram conectado.</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">#</th>
                <th className="text-left px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Cliente</th>
                <th className="text-left px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Consultor</th>
                <th className="text-right px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Encontro</th>
                <th className="text-right px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Audiência</th>
                <th className="text-right px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Engajamento</th>
                <th className="text-right px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Posts/mês</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => (
                <tr key={r.cliente_id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-white/60">
                    {i === 0 ? <Crown size={14} className="text-amber-400" /> : i + 1}
                  </td>
                  <td className="px-4 py-3 text-white/90 font-medium">{r.nome}</td>
                  <td className="px-4 py-3 text-white/55">{r.consultor || '—'}</td>
                  <td className="px-4 py-3 text-white/55 text-right">{r.encontro_atual}</td>
                  <td className="px-4 py-3 text-white/80 text-right">{(r.audiencia || 0).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-emerald-400 text-right font-semibold">
                    {(r.taxa_engajamento || 0).toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-white/55 text-right">{r.posts_mes || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => navigate(`/metricas/${r.cliente_id}/geral`)}
                      className="inline-flex items-center gap-1 text-[11px] hover:underline"
                      style={{ color: '#C9A84C' }}
                    >
                      Ver <ExternalLink size={10} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
