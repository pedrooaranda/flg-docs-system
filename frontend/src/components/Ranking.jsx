/**
 * Ranking visual de clientes — pódio top 3, tabela com mini-bars, ranking de consultores.
 *
 * Filtros (semana/mês) controlam state local — backend ainda retorna últimos 30d.
 * Mini-bars são calculados client-side relativos ao top.
 */

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Crown, Trophy, Medal, ExternalLink, TrendingUp, Award, Users, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { Avatar } from './ui/Avatar'

function formatCompact(n) {
  const num = Number(n) || 0
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace('.0', '') + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace('.0', '') + 'K'
  return num.toLocaleString('pt-BR')
}

// Pódio: card grande pros 3 primeiros
function PodiumCard({ rank, item, onClick }) {
  const config = [
    { color: '#FACC15', bg: 'rgba(250,204,21,0.10)', border: 'rgba(250,204,21,0.35)', label: '1º LUGAR', icon: Crown, height: 'lg:mt-0' },
    { color: '#CBD5E1', bg: 'rgba(203,213,225,0.10)', border: 'rgba(203,213,225,0.30)', label: '2º LUGAR', icon: Trophy, height: 'lg:mt-6' },
    { color: '#D97706', bg: 'rgba(217,119,6,0.10)', border: 'rgba(217,119,6,0.30)', label: '3º LUGAR', icon: Medal, height: 'lg:mt-12' },
  ][rank]
  const Icon = config.icon
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
          <p className="text-[11px] text-white/45 truncate">{item.empresa || '—'}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-3" style={{ borderTop: `1px solid ${config.border}` }}>
        <div>
          <p className="text-[9px] text-white/35 uppercase tracking-wider">Eng.</p>
          <p className="text-sm font-bold mt-0.5" style={{ color: config.color }}>
            {(item.taxa_engajamento || 0).toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="text-[9px] text-white/35 uppercase tracking-wider">Audiência</p>
          <p className="text-sm font-bold text-white/85 mt-0.5">{formatCompact(item.audiencia)}</p>
        </div>
        <div>
          <p className="text-[9px] text-white/35 uppercase tracking-wider">Posts/mês</p>
          <p className="text-sm font-bold text-white/85 mt-0.5">{item.posts_mes || 0}</p>
        </div>
      </div>
    </motion.div>
  )
}

// Linha da tabela com mini-bars
function RankRow({ item, rank, max, onClick, delay }) {
  const engPct = max.eng > 0 ? (item.taxa_engajamento / max.eng) * 100 : 0
  const audPct = max.aud > 0 ? (item.audiencia / max.aud) * 100 : 0
  const postsPct = max.posts > 0 ? ((item.posts_mes || 0) / max.posts) * 100 : 0
  const gold = '#C9A84C'
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
            <div className="h-full rounded-full" style={{ width: `${audPct}%`, background: `linear-gradient(90deg, ${gold}60, ${gold})` }} />
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
        <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: gold }}>
          Ver <ExternalLink size={9} />
        </span>
      </td>
    </motion.tr>
  )
}

// Card de consultor agregado (funcionário do mês)
function ConsultorCard({ consultor, delay }) {
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

// ──────────────────────────────────────────────────────────────────────────────

export default function Ranking() {
  const navigate = useNavigate()
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

  // Maximums pra normalizar mini-bars
  const max = useMemo(() => {
    return ranking.reduce((acc, r) => ({
      eng: Math.max(acc.eng, r.taxa_engajamento || 0),
      aud: Math.max(acc.aud, r.audiencia || 0),
      posts: Math.max(acc.posts, r.posts_mes || 0),
    }), { eng: 0, aud: 0, posts: 0 })
  }, [ranking])

  // Agregar por consultor (funcionário do mês)
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
            <Trophy size={22} className="text-amber-400" /> Ranking de Clientes
          </h1>
          <p className="text-xs text-white/40 mt-1">
            Compilado das métricas do Instagram · ordenado por taxa de engajamento média
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

      {loading ? (
        <p className="text-white/40 text-sm">Carregando ranking…</p>
      ) : ranking.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
          <Sparkles size={28} className="mx-auto mb-3 text-white/30" />
          <p className="text-sm text-white/55">Nenhum cliente com dados de Instagram conectado.</p>
          <p className="text-xs text-white/35 mt-1">Conecte clientes e aguarde o sync pra ver o ranking.</p>
        </div>
      ) : (
        <>
          {/* Pódio top 3 */}
          {top3.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-white/65 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Crown size={13} className="text-amber-400" /> Pódio
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Reorder visual: 2nd, 1st, 3rd no desktop */}
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

          {/* Funcionário do mês — consultores top */}
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
        </>
      )}
    </div>
  )
}
