import { useState, useEffect, useRef } from 'react'
import { motion, useInView, animate } from 'framer-motion'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Users, TrendingUp, Eye, Heart, Bookmark, MessageCircle, Link2, BarChart2, Wifi, WifiOff } from 'lucide-react'
import { api } from '../lib/api'
import { isAdmin as checkAdmin } from '../lib/utils'
import { PageSpinner } from './ui/Spinner'

const GOLD = '#C9A84C'
const GOLD_DIM = 'rgba(201,168,76,0.5)'
const GOLD_FAINT = 'rgba(201,168,76,0.12)'

// ─── Animated counter ─────────────────────────────────────────────────────────
function AnimatedNumber({ value, decimals = 0, prefix = '', suffix = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  const prevRef = useRef(0)

  useEffect(() => {
    if (!inView) return
    const from = prevRef.current
    const to = value
    prevRef.current = to
    const ctrl = animate(from, to, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        if (ref.current) {
          ref.current.textContent = prefix + v.toFixed(decimals) + suffix
        }
      },
    })
    return () => ctrl.stop()
  }, [inView, value, decimals, prefix, suffix])

  return <span ref={ref}>{prefix}{(0).toFixed(decimals)}{suffix}</span>
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, decimals = 0, suffix = '', delta, prefix = '', color = GOLD }) {
  const positive = delta >= 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40 font-medium">{label}</span>
        <Icon size={14} style={{ color }} className="opacity-60" />
      </div>
      <div className="text-2xl font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
        <AnimatedNumber value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
      </div>
      {delta !== undefined && (
        <div className={`text-[11px] font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
          {positive ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs. mês anterior
        </div>
      )}
    </motion.div>
  )
}

// ─── Section header ────────────────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-3">
      {children}
    </h2>
  )
}

// ─── Custom chart tooltip ──────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{
      background: '#1a1a1a',
      border: '1px solid rgba(201,168,76,0.25)',
    }}>
      <p className="text-white/50 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || GOLD }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString('pt-BR') : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

// ─── CSS Heatmap ──────────────────────────────────────────────────────────────
function EngagementHeatmap({ data }) {
  if (!data?.length) return null

  const dias    = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const faixas  = ['06-09h', '09-12h', '12-15h', '15-18h', '18-21h']

  const maxEng = Math.max(...data.map(d => d.engajamento))
  const minEng = Math.min(...data.map(d => d.engajamento))

  function intensity(eng) {
    if (maxEng === minEng) return 0.5
    return (eng - minEng) / (maxEng - minEng)
  }

  function cellColor(eng) {
    const t = intensity(eng)
    const alpha = 0.1 + t * 0.85
    return `rgba(201, 168, 76, ${alpha.toFixed(2)})`
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        {/* Day headers */}
        <div className="grid mb-1" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
          <div />
          {dias.map(d => (
            <div key={d} className="text-[10px] text-white/30 text-center font-medium">{d}</div>
          ))}
        </div>

        {/* Rows */}
        {faixas.map((faixa, fIdx) => (
          <div key={faixa} className="grid mb-1" style={{ gridTemplateColumns: '64px repeat(7, 1fr)', gap: '3px' }}>
            <div className="text-[10px] text-white/30 flex items-center pr-2">{faixa}</div>
            {dias.map((_, dIdx) => {
              const cell = data.find(d => d.faixa_idx === fIdx && d.dia_idx === dIdx)
              if (!cell) return <div key={dIdx} className="rounded h-8" style={{ background: '#1a1a1a' }} />
              return (
                <motion.div
                  key={dIdx}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: (fIdx * 7 + dIdx) * 0.008 }}
                  className="rounded h-8 flex items-center justify-center cursor-default"
                  style={{ background: cellColor(cell.engajamento) }}
                  title={`${cell.dia} ${cell.faixa}: ${cell.engajamento}%`}
                >
                  <span className="text-[9px] font-bold text-white/70">{cell.engajamento.toFixed(1)}</span>
                </motion.div>
              )
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 justify-end">
          <span className="text-[9px] text-white/25">Menos</span>
          {[0.1, 0.3, 0.55, 0.75, 0.95].map((t, i) => (
            <div key={i} className="w-5 h-3 rounded" style={{ background: `rgba(201,168,76,${t})` }} />
          ))}
          <span className="text-[9px] text-white/25">Mais</span>
        </div>
      </div>
    </div>
  )
}

// ─── Post card ────────────────────────────────────────────────────────────────
function PostCard({ post, rank }) {
  const typeColor = {
    REEL: '#7C3AED', IMAGE: GOLD, CAROUSEL: '#0EA5E9', VIDEO: '#EC4899',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.04 }}
      className="rounded-lg p-3 flex flex-col gap-2"
      style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: `${typeColor[post.tipo] || GOLD}22`, color: typeColor[post.tipo] || GOLD }}
        >
          {post.tipo}
        </span>
        <span className="text-[10px] font-bold" style={{ color: GOLD }}>
          {post.taxa_engajamento}% eng.
        </span>
      </div>
      <p className="text-xs text-white/60 line-clamp-2 leading-relaxed">{post.legenda}</p>
      <div className="grid grid-cols-3 gap-1 text-[10px] text-white/40">
        <span>❤ {post.curtidas.toLocaleString('pt-BR')}</span>
        <span>💬 {post.comentarios}</span>
        <span>🔖 {post.salvamentos}</span>
      </div>
      <p className="text-[9px] text-white/25">{post.publicado_em}</p>
    </motion.div>
  )
}

// ─── Ranking table (admin) ────────────────────────────────────────────────────
function RankingTable({ data }) {
  if (!data?.length) return <p className="text-white/30 text-sm">Sem dados de ranking.</p>

  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0f0f0f' }}>
            {['#', 'Cliente', 'Seguidores', 'Eng. %', 'Alcance', 'Posts/mês', 'Reels/mês'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-white/30 font-semibold uppercase tracking-wide text-[9px]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={row.cliente_id}
              style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
              className="hover:bg-white/[0.02] transition-colors"
            >
              <td className="px-3 py-2 text-white/30 font-bold">{i + 1}</td>
              <td className="px-3 py-2">
                <p className="text-white/80 font-medium">{row.nome}</p>
                <p className="text-white/30 text-[9px]">{row.empresa}</p>
              </td>
              <td className="px-3 py-2 text-white/60">{row.seguidores.toLocaleString('pt-BR')}</td>
              <td className="px-3 py-2 font-bold" style={{ color: GOLD }}>{row.taxa_engajamento}%</td>
              <td className="px-3 py-2 text-white/60">{row.alcance_medio.toLocaleString('pt-BR')}</td>
              <td className="px-3 py-2 text-white/60">{row.posts_mes}</td>
              <td className="px-3 py-2 text-white/60">{row.reels_mes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function Metricas({ session }) {
  const user = session?.user
  const admin = checkAdmin(user)

  const [clientes, setClientes] = useState([])
  const [clienteId, setClienteId] = useState('')
  const [periodo, setPeriodo] = useState(30)
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [historico, setHistorico] = useState([])
  const [posts, setPosts] = useState([])
  const [horarios, setHorarios] = useState([])
  const [ranking, setRanking] = useState([])

  // Carregar lista de clientes
  useEffect(() => {
    api('/clientes').then(data => {
      const filtered = admin ? data : data.filter(c =>
        c.consultor_responsavel?.toLowerCase().includes(user?.email?.split('@')[0] || '')
      )
      setClientes(filtered)
      if (filtered.length > 0 && !clienteId) setClienteId(filtered[0].id)
    }).catch(() => {})

    if (admin) {
      api('/metricas/ranking').then(d => setRanking(d.ranking || [])).catch(() => {})
    }
  }, [admin])

  // Carregar dados quando cliente ou período mudar
  useEffect(() => {
    if (!clienteId) return

    setLoading(true)
    Promise.all([
      api(`/metricas/${clienteId}/overview`),
      api(`/metricas/${clienteId}/historico?dias=${periodo}`),
      api(`/metricas/${clienteId}/posts?limit=9`),
      api(`/metricas/${clienteId}/horarios`),
    ]).then(([ov, hist, p, hor]) => {
      setOverview(ov)
      setHistorico(hist.dados || [])
      setPosts(p.posts || [])
      setHorarios(hor.horarios || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [clienteId, periodo])

  const kpis = overview?.kpis
  const conectado = overview?.instagram_conectado

  // Donut: mix de conteúdo
  const donutData = kpis ? [
    { name: 'Posts', value: kpis.posts_publicados?.valor || 0, color: GOLD },
    { name: 'Reels', value: kpis.reels_publicados?.valor || 0, color: '#7C3AED' },
    { name: 'Stories', value: kpis.stories_publicados?.valor || 0, color: '#0EA5E9' },
  ].filter(d => d.value > 0) : []

  // Format date for axis
  function fmtDate(d) {
    if (!d) return ''
    const [, m, day] = d.split('-')
    return `${day}/${m}`
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-8">

      {/* ── Header / Filters ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          {/* Cliente selector */}
          <select
            value={clienteId}
            onChange={e => setClienteId(e.target.value)}
            className="text-sm font-medium rounded-lg px-3 py-2 outline-none cursor-pointer transition-colors"
            style={{
              background: '#0f0f0f',
              border: '1px solid rgba(201,168,76,0.25)',
              color: '#fff',
            }}
          >
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nome} — {c.empresa}</option>
            ))}
          </select>

          {/* Connection badge */}
          {overview && (
            <div
              className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-full"
              style={conectado
                ? { background: 'rgba(52,211,153,0.12)', color: '#34D399', border: '1px solid rgba(52,211,153,0.25)' }
                : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)' }
              }
            >
              {conectado ? <Wifi size={11} /> : <WifiOff size={11} />}
              {conectado ? 'Instagram conectado' : 'Dados mock'}
            </div>
          )}
        </div>

        {/* Period selector */}
        <div className="flex gap-1 rounded-lg p-1" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
          {[30, 90, 180].map(d => (
            <button
              key={d}
              onClick={() => setPeriodo(d)}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer"
              style={periodo === d
                ? { background: GOLD_FAINT, color: GOLD, border: `1px solid ${GOLD_DIM}` }
                : { color: 'rgba(255,255,255,0.3)', border: '1px solid transparent' }
              }
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12"><PageSpinner /></div>
      )}

      {!loading && overview && (
        <>
          {/* ── KPI Grid ── */}
          <section>
            <SectionTitle>Visão Geral — últimos 30 dias</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3">
              <KpiCard icon={Users}     label="Seguidores"       value={kpis.seguidores.valor}         delta={kpis.seguidores.delta_pct} />
              <KpiCard icon={TrendingUp} label="Engajamento"    value={kpis.taxa_engajamento.valor}    delta={kpis.taxa_engajamento.delta_pct} decimals={2} suffix="%" />
              <KpiCard icon={Eye}       label="Alcance médio"    value={kpis.alcance_medio.valor}       delta={kpis.alcance_medio.delta_pct} />
              <KpiCard icon={Eye}       label="Impressões médias" value={kpis.impressoes_medias.valor}  delta={kpis.impressoes_medias.delta_pct} />
              <KpiCard icon={Heart}     label="Curtidas total"   value={kpis.curtidas_total.valor}      delta={kpis.curtidas_total.delta_pct} />
              <KpiCard icon={MessageCircle} label="Comentários" value={kpis.comentarios_total.valor}   delta={kpis.comentarios_total.delta_pct} />
              <KpiCard icon={Bookmark}  label="Salvamentos"      value={kpis.salvamentos_total.valor}   delta={kpis.salvamentos_total.delta_pct} />
              <KpiCard icon={BarChart2} label="Posts publicados" value={kpis.posts_publicados.valor} />
            </div>
          </section>

          {/* ── Charts Row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Followers area chart */}
            <div className="lg:col-span-2 rounded-xl p-4" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
              <SectionTitle>Crescimento de Seguidores</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={historico} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="segGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={GOLD} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="data" tickFormatter={fmtDate} tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="seguidores" name="Seguidores" stroke={GOLD} strokeWidth={2} fill="url(#segGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Content mix donut */}
            <div className="rounded-xl p-4" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
              <SectionTitle>Mix de Conteúdo</SectionTitle>
              {donutData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                        {donutData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-1.5 mt-2">
                    {donutData.map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                          <span className="text-white/50">{d.name}</span>
                        </div>
                        <span className="font-semibold text-white/70">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-white/20 text-xs mt-6">Sem publicações no período.</p>
              )}
            </div>
          </div>

          {/* ── Engagement Line Chart ── */}
          <div className="rounded-xl p-4" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
            <SectionTitle>Taxa de Engajamento & Alcance</SectionTitle>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={historico} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="data" tickFormatter={fmtDate} tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="eng" orientation="left"  tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} tickLine={false} axisLine={false} width={35} unit="%" />
                <YAxis yAxisId="alc" orientation="right" tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} tickLine={false} axisLine={false} width={50} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }} />
                <Line yAxisId="eng" type="monotone" dataKey="taxa_engajamento" name="Engajamento %" stroke={GOLD} strokeWidth={2} dot={false} />
                <Line yAxisId="alc" type="monotone" dataKey="alcance_total"    name="Alcance"        stroke="#7C3AED"  strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── Heatmap ── */}
          <div className="rounded-xl p-4" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.06)' }}>
            <SectionTitle>Melhores Horários para Postar</SectionTitle>
            <EngagementHeatmap data={horarios} />
          </div>

          {/* ── Best posts ── */}
          <section>
            <SectionTitle>Melhores Posts (por engajamento)</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {posts.slice(0, 9).map((post, i) => (
                <PostCard key={post.id} post={post} rank={i} />
              ))}
            </div>
          </section>

          {/* ── AI Recommendations ── */}
          <AiRecommendations overview={overview} historico={historico} horarios={horarios} posts={posts} />
        </>
      )}

      {/* ── Admin Ranking ── */}
      {admin && ranking.length > 0 && (
        <section>
          <SectionTitle>Ranking de Clientes (Admin)</SectionTitle>
          <RankingTable data={ranking} />
        </section>
      )}

      {!loading && !overview && clienteId && (
        <div className="flex items-center justify-center py-20 text-white/20 text-sm">
          Sem dados disponíveis para este cliente.
        </div>
      )}
    </div>
  )
}

// ─── AI Recommendations ────────────────────────────────────────────────────────
function AiRecommendations({ overview, historico, horarios, posts }) {
  const kpis = overview?.kpis
  if (!kpis) return null

  const recs = []

  // Melhor faixa horária
  if (horarios?.length) {
    const best = [...horarios].sort((a, b) => b.engajamento - a.engajamento)[0]
    recs.push({
      icon: '🕐',
      title: 'Melhor horário',
      text: `Seus posts têm mais engajamento às ${best.faixa} (${best.dia}) com média de ${best.engajamento}%.`,
    })
  }

  // Engajamento vs. benchmark
  const eng = kpis.taxa_engajamento?.valor || 0
  if (eng < 2) {
    recs.push({
      icon: '⚠️',
      title: 'Engajamento abaixo da média',
      text: `${eng.toFixed(2)}% está abaixo do benchmark (2-3%). Priorize Reels e Carrosséis interativos.`,
    })
  } else if (eng >= 4) {
    recs.push({
      icon: '🔥',
      title: 'Engajamento excelente',
      text: `${eng.toFixed(2)}% está acima do benchmark. Continue replicando os formatos que funcionam.`,
    })
  }

  // Melhor tipo de post
  if (posts?.length) {
    const byType = {}
    posts.forEach(p => {
      if (!byType[p.tipo]) byType[p.tipo] = []
      byType[p.tipo].push(p.taxa_engajamento)
    })
    let bestType = '', bestAvg = 0
    Object.entries(byType).forEach(([tipo, vals]) => {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      if (avg > bestAvg) { bestAvg = avg; bestType = tipo }
    })
    if (bestType) {
      recs.push({
        icon: '🎯',
        title: `${bestType} performa melhor`,
        text: `Média de ${bestAvg.toFixed(2)}% de engajamento. Aumente a frequência desse formato.`,
      })
    }
  }

  // Crescimento de seguidores
  const segDelta = kpis.seguidores?.delta_pct || 0
  if (segDelta < 0) {
    recs.push({
      icon: '📉',
      title: 'Queda de seguidores',
      text: `${Math.abs(segDelta).toFixed(1)}% de queda vs. mês anterior. Reforce CTAs e parcerias estratégicas.`,
    })
  }

  if (!recs.length) return null

  return (
    <section>
      <SectionTitle>Recomendações IA</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {recs.map((r, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="rounded-xl p-4 flex flex-col gap-2"
            style={{ background: GOLD_FAINT, border: `1px solid ${GOLD_DIM}` }}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{r.icon}</span>
              <span className="text-xs font-bold text-white/80">{r.title}</span>
            </div>
            <p className="text-xs text-white/50 leading-relaxed">{r.text}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
