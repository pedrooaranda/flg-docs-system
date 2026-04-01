import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, useInView, animate } from 'framer-motion'
import {
  AreaChart, Area, LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Users, TrendingUp, Eye, Heart, Bookmark, MessageCircle, BarChart2, Wifi, WifiOff, Play, Share2, Target, Clock } from 'lucide-react'
import { api } from '../lib/api'
import { isAdmin as checkAdmin } from '../lib/utils'
import { useApp } from '../contexts/AppContext'
import { PageSpinner } from './ui/Spinner'

const GOLD = '#C9A84C'
const GOLD_DIM = 'rgba(201,168,76,0.5)'
const GOLD_FAINT = 'rgba(201,168,76,0.12)'

// ─── Platform config ──────────────────────────────────────────────────────────
const PLATFORMS = {
  instagram: {
    label: 'Instagram',
    color: '#E4405F',
    gradient: ['#833AB4', '#E4405F', '#FCAF45'],
  },
  linkedin: {
    label: 'LinkedIn',
    color: '#0A66C2',
    gradient: ['#0A66C2', '#0A66C2'],
  },
  youtube: {
    label: 'YouTube',
    color: '#FF0000',
    gradient: ['#FF0000', '#CC0000'],
  },
  tiktok: {
    label: 'TikTok',
    color: '#00F2EA',
    gradient: ['#00F2EA', '#FF0050'],
  },
}

// ─── Platform SVG icons ───────────────────────────────────────────────────────
function PlatformIcon({ platform, size = 18 }) {
  const s = size
  switch (platform) {
    case 'instagram':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="2"/>
          <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/>
          <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor"/>
        </svg>
      )
    case 'linkedin':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19a.66.66 0 000 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z"/>
        </svg>
      )
    case 'youtube':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 00.5 6.19 31.2 31.2 0 000 12a31.2 31.2 0 00.5 5.81 3.02 3.02 0 002.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 002.12-2.14A31.2 31.2 0 0024 12a31.2 31.2 0 00-.5-5.81zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/>
        </svg>
      )
    case 'tiktok':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.41a8.16 8.16 0 004.77 1.52V7.56a4.85 4.85 0 01-1-.87z"/>
        </svg>
      )
    default: return null
  }
}

// ─── KPI definitions per platform ─────────────────────────────────────────────
const PLATFORM_KPIS = {
  instagram: [
    { key: 'seguidores', label: 'Seguidores', icon: Users },
    { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%' },
    { key: 'alcance_medio', label: 'Alcance médio', icon: Eye },
    { key: 'impressoes_medias', label: 'Impressões', icon: Eye },
    { key: 'curtidas_total', label: 'Curtidas', icon: Heart },
    { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle },
    { key: 'salvamentos_total', label: 'Salvamentos', icon: Bookmark },
    { key: 'posts_publicados', label: 'Posts publicados', icon: BarChart2, noDelta: true },
  ],
  linkedin: [
    { key: 'seguidores', label: 'Seguidores', icon: Users },
    { key: 'conexoes', label: 'Conexões', icon: Users },
    { key: 'ssi_score', label: 'SSI Score', icon: Target, decimals: 1 },
    { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%' },
    { key: 'impressoes_posts', label: 'Impressões/post', icon: Eye },
    { key: 'visualizacoes_perfil', label: 'Views do perfil', icon: Eye },
    { key: 'reacoes_total', label: 'Reações', icon: Heart },
    { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle },
  ],
  youtube: [
    { key: 'inscritos', label: 'Inscritos', icon: Users },
    { key: 'visualizacoes', label: 'Visualizações', icon: Eye },
    { key: 'watch_time_horas', label: 'Watch Time (h)', icon: Clock, decimals: 1 },
    { key: 'ctr_pct', label: 'CTR', icon: Target, decimals: 1, suffix: '%' },
    { key: 'taxa_retencao_pct', label: 'Retenção', icon: TrendingUp, decimals: 1, suffix: '%' },
    { key: 'likes_total', label: 'Likes', icon: Heart },
    { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle },
    { key: 'videos_publicados', label: 'Vídeos', icon: Play, noDelta: true },
  ],
  tiktok: [
    { key: 'seguidores', label: 'Seguidores', icon: Users },
    { key: 'visualizacoes_video', label: 'Views de vídeo', icon: Eye },
    { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%' },
    { key: 'taxa_conclusao', label: 'Conclusão', icon: Clock, decimals: 1, suffix: '%' },
    { key: 'fyp_pct', label: 'FYP Reach', icon: Target, decimals: 1, suffix: '%' },
    { key: 'curtidas_total', label: 'Curtidas', icon: Heart },
    { key: 'compartilhamentos_total', label: 'Compartilhamentos', icon: Share2 },
    { key: 'videos_publicados', label: 'Vídeos', icon: Play, noDelta: true },
  ],
}

// Chart primary metric key per platform (for area chart)
const PLATFORM_CHART_PRIMARY = {
  instagram: { key: 'seguidores', label: 'Seguidores' },
  linkedin: { key: 'seguidores', label: 'Seguidores' },
  youtube: { key: 'inscritos', label: 'Inscritos' },
  tiktok: { key: 'seguidores', label: 'Seguidores' },
}

// Chart secondary lines per platform (for line chart)
const PLATFORM_CHART_LINES = {
  instagram: [
    { key: 'taxa_engajamento', label: 'Engajamento %', yAxis: 'left', color: GOLD, unit: '%' },
    { key: 'alcance_total', label: 'Alcance', yAxis: 'right', color: '#7C3AED' },
  ],
  linkedin: [
    { key: 'taxa_engajamento', label: 'Engajamento %', yAxis: 'left', color: GOLD, unit: '%' },
    { key: 'ssi_score', label: 'SSI Score', yAxis: 'right', color: '#0A66C2' },
  ],
  youtube: [
    { key: 'ctr_pct', label: 'CTR %', yAxis: 'left', color: GOLD, unit: '%' },
    { key: 'taxa_retencao_pct', label: 'Retenção %', yAxis: 'right', color: '#FF0000' },
  ],
  tiktok: [
    { key: 'taxa_engajamento', label: 'Engajamento %', yAxis: 'left', color: GOLD, unit: '%' },
    { key: 'fyp_pct', label: 'FYP %', yAxis: 'right', color: '#00F2EA' },
  ],
}

// Donut data builder per platform
function buildDonutData(kpis, platform) {
  if (!kpis) return []
  switch (platform) {
    case 'instagram': return [
      { name: 'Posts', value: kpis.posts_publicados?.valor || 0, color: GOLD },
      { name: 'Reels', value: kpis.reels_publicados?.valor || 0, color: '#7C3AED' },
      { name: 'Stories', value: kpis.stories_publicados?.valor || 0, color: '#0EA5E9' },
    ].filter(d => d.value > 0)
    case 'linkedin': return [
      { name: 'Posts', value: kpis.posts_publicados?.valor || 0, color: '#0A66C2' },
      { name: 'Artigos', value: kpis.artigos_publicados?.valor || 0, color: GOLD },
    ].filter(d => d.value > 0)
    case 'youtube': return [
      { name: 'Vídeos', value: kpis.videos_publicados?.valor || 0, color: '#FF0000' },
      { name: 'Shorts', value: kpis.shorts_publicados?.valor || 0, color: GOLD },
    ].filter(d => d.value > 0)
    case 'tiktok': return [
      { name: 'Vídeos', value: kpis.videos_publicados?.valor || 0, color: '#00F2EA' },
    ].filter(d => d.value > 0)
    default: return []
  }
}

// Post card metric labels per platform
function postMetrics(post, platform) {
  switch (platform) {
    case 'instagram': return [
      `❤ ${(post.curtidas || 0).toLocaleString('pt-BR')}`,
      `💬 ${post.comentarios || 0}`,
      `🔖 ${post.salvamentos || 0}`,
    ]
    case 'linkedin': return [
      `👍 ${(post.reacoes || 0).toLocaleString('pt-BR')}`,
      `💬 ${post.comentarios || 0}`,
      `🔁 ${post.compartilhamentos || 0}`,
    ]
    case 'youtube': return [
      `👁 ${(post.visualizacoes || 0).toLocaleString('pt-BR')}`,
      `👍 ${post.likes || 0}`,
      `⏱ ${post.taxa_retencao || 0}% ret.`,
    ]
    case 'tiktok': return [
      `👁 ${(post.visualizacoes || 0).toLocaleString('pt-BR')}`,
      `❤ ${(post.curtidas || 0).toLocaleString('pt-BR')}`,
      `🔁 ${post.compartilhamentos || 0}`,
    ]
    default: return []
  }
}

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
        if (ref.current) ref.current.textContent = prefix + v.toFixed(decimals) + suffix
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
      style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}
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

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-3">{children}</h2>
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--flg-bg-card)', border: '1px solid rgba(201,168,76,0.25)' }}>
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
function EngagementHeatmap({ data, accentColor = GOLD }) {
  if (!data?.length) return null
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const faixas = ['06-09h', '09-12h', '12-15h', '15-18h', '18-21h']
  const maxEng = Math.max(...data.map(d => d.engajamento))
  const minEng = Math.min(...data.map(d => d.engajamento))
  const range = maxEng - minEng || 1

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div className="grid mb-1" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
          <div />
          {dias.map(d => <div key={d} className="text-[10px] text-white/30 text-center font-medium">{d}</div>)}
        </div>
        {faixas.map((faixa, fi) => (
          <div key={faixa} className="grid mb-1" style={{ gridTemplateColumns: '64px repeat(7, 1fr)', gap: '3px' }}>
            <div className="text-[10px] text-white/30 flex items-center pr-2">{faixa}</div>
            {dias.map((_, di) => {
              const cell = data.find(d => d.faixa_idx === fi && d.dia_idx === di)
              if (!cell) return <div key={di} className="rounded h-8" style={{ background: 'var(--flg-bg-card)' }} />
              const alpha = 0.1 + ((cell.engajamento - minEng) / range) * 0.85
              return (
                <motion.div
                  key={di}
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: (fi * 7 + di) * 0.008 }}
                  className="rounded h-8 flex items-center justify-center cursor-default"
                  style={{ background: `${accentColor}${Math.round(alpha * 255).toString(16).padStart(2, '0')}` }}
                  title={`${cell.dia} ${cell.faixa}: ${cell.engajamento}%`}
                >
                  <span className="text-[9px] font-bold text-white/70">{cell.engajamento.toFixed(1)}</span>
                </motion.div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Post card ────────────────────────────────────────────────────────────────
function PostCard({ post, rank, platform }) {
  const typeColor = {
    REEL: '#7C3AED', IMAGE: GOLD, CAROUSEL: '#0EA5E9', VIDEO: '#EC4899',
    POST: '#0A66C2', ARTICLE: GOLD, POLL: '#34D399', DOCUMENT: '#F59E0B',
    SHORT: '#FF0000',
  }
  const metrics = postMetrics(post, platform)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.04 }}
      className="rounded-lg p-3 flex flex-col gap-2"
      style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: `${typeColor[post.tipo] || GOLD}22`, color: typeColor[post.tipo] || GOLD }}>
          {post.tipo}
        </span>
        <span className="text-[10px] font-bold" style={{ color: GOLD }}>{post.taxa_engajamento}% eng.</span>
      </div>
      <p className="text-xs text-white/60 line-clamp-2 leading-relaxed">{post.legenda}</p>
      <div className="grid grid-cols-3 gap-1 text-[10px] text-white/40">
        {metrics.map((m, i) => <span key={i}>{m}</span>)}
      </div>
      <p className="text-[9px] text-white/25">{post.publicado_em}</p>
    </motion.div>
  )
}

// ─── Ranking table ────────────────────────────────────────────────────────────
function RankingTable({ data, platform }) {
  if (!data?.length) return <p className="text-white/30 text-sm">Sem dados de ranking.</p>
  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--flg-border)' }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--flg-border)', background: 'var(--flg-bg-raised)' }}>
            {['#', 'Cliente', 'Audiência', 'Eng. %', 'Posts/mês'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-white/30 font-semibold uppercase tracking-wide text-[9px]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.cliente_id} style={{ borderBottom: '1px solid var(--flg-border)' }}
              className="hover:bg-white/[0.02] transition-colors">
              <td className="px-3 py-2 text-white/30 font-bold">{i + 1}</td>
              <td className="px-3 py-2">
                <p className="text-white/80 font-medium">{row.nome}</p>
                <p className="text-white/30 text-[9px]">{row.empresa}</p>
              </td>
              <td className="px-3 py-2 text-white/60">{(row.audiencia || 0).toLocaleString('pt-BR')}</td>
              <td className="px-3 py-2 font-bold" style={{ color: GOLD }}>{row.taxa_engajamento}%</td>
              <td className="px-3 py-2 text-white/60">{row.posts_mes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── AI Recommendations ────────────────────────────────────────────────────────
function AiRecommendations({ overview, historico, horarios, posts, platform }) {
  const kpis = overview?.kpis
  if (!kpis) return null
  const recs = []
  const pLabel = PLATFORMS[platform]?.label || platform

  if (horarios?.length) {
    const best = [...horarios].sort((a, b) => b.engajamento - a.engajamento)[0]
    recs.push({ icon: '🕐', title: 'Melhor horário',
      text: `No ${pLabel}, mais engajamento às ${best.faixa} (${best.dia}) — ${best.engajamento}%.` })
  }

  const eng = kpis.taxa_engajamento?.valor || 0
  const benchmarks = { instagram: [2, 4], linkedin: [3, 6], youtube: [3, 6], tiktok: [5, 8] }
  const [low, high] = benchmarks[platform] || [2, 4]
  if (eng < low) {
    recs.push({ icon: '⚠️', title: 'Engajamento abaixo',
      text: `${eng.toFixed(2)}% está abaixo do benchmark (${low}-${high}%). Teste novos formatos.` })
  } else if (eng >= high) {
    recs.push({ icon: '🔥', title: 'Engajamento excelente',
      text: `${eng.toFixed(2)}% está acima do benchmark. Continue replicando.` })
  }

  if (posts?.length) {
    const byType = {}
    posts.forEach(p => { if (!byType[p.tipo]) byType[p.tipo] = []; byType[p.tipo].push(p.taxa_engajamento) })
    let bestType = '', bestAvg = 0
    Object.entries(byType).forEach(([tipo, vals]) => {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      if (avg > bestAvg) { bestAvg = avg; bestType = tipo }
    })
    if (bestType) recs.push({ icon: '🎯', title: `${bestType} performa melhor`,
      text: `Média de ${bestAvg.toFixed(2)}% de engajamento. Aumente frequência.` })
  }

  // Platform-specific recommendations
  if (platform === 'tiktok' && kpis.fyp_pct) {
    const fyp = kpis.fyp_pct.valor
    if (fyp > 80) recs.push({ icon: '🚀', title: 'Algoritmo a favor',
      text: `${fyp.toFixed(1)}% do alcance vem do FYP — alto potencial viral.` })
  }
  if (platform === 'linkedin' && kpis.ssi_score) {
    const ssi = kpis.ssi_score.valor
    if (ssi < 60) recs.push({ icon: '📊', title: 'SSI Score baixo',
      text: `Score ${ssi.toFixed(0)}/100. Foque em engajar com insights e construir rede.` })
  }
  if (platform === 'youtube' && kpis.ctr_pct) {
    const ctr = kpis.ctr_pct.valor
    if (ctr < 4) recs.push({ icon: '🖼️', title: 'CTR precisa melhorar',
      text: `${ctr.toFixed(1)}% CTR — teste thumbnails mais chamativos.` })
  }

  if (!recs.length) return null
  return (
    <section>
      <SectionTitle>Recomendações IA — {pLabel}</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {recs.map((r, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="rounded-xl p-4 flex flex-col gap-2"
            style={{ background: GOLD_FAINT, border: `1px solid ${GOLD_DIM}` }}>
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

// ─── Connection Panel ─────────────────────────────────────────────────────────
function ConnectionPanel({ clienteId, platform, conexoes, onRefresh }) {
  const conn = conexoes.find(c => c.plataforma === platform)
  const status = conn?.status || 'nao_conectado'
  const oauthOk = conn?.oauth_configurado
  const platCfg = PLATFORMS[platform]
  const [syncing, setSyncing] = useState(false)

  const statusLabels = {
    ativo: { label: 'Conectado', color: '#34D399', bg: 'rgba(52,211,153,0.1)' },
    pendente: { label: 'Pendente', color: '#FBBF24', bg: 'rgba(251,191,36,0.1)' },
    expirado: { label: 'Token expirado', color: '#F87171', bg: 'rgba(248,113,113,0.1)' },
    erro: { label: 'Erro', color: '#F87171', bg: 'rgba(248,113,113,0.1)' },
    desconectado: { label: 'Desconectado', color: 'var(--flg-text-muted)', bg: 'rgba(255,255,255,0.03)' },
    nao_conectado: { label: 'Não conectado', color: 'var(--flg-text-muted)', bg: 'rgba(255,255,255,0.03)' },
  }
  const st = statusLabels[status] || statusLabels.nao_conectado

  async function handleConnect() {
    try {
      const res = await api(`/conexoes/${clienteId}/${platform}/connect`, { method: 'POST' })
      if (res.auth_url) window.location.href = res.auth_url
    } catch (e) {
      console.error('Erro ao conectar:', e)
    }
  }

  async function handleDisconnect() {
    try {
      await api(`/conexoes/${clienteId}/${platform}`, { method: 'DELETE' })
      onRefresh()
    } catch (e) {
      console.error('Erro ao desconectar:', e)
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await api(`/conexoes/${clienteId}/${platform}/sync`, { method: 'POST' })
      onRefresh()
    } catch (e) {
      console.error('Erro ao sincronizar:', e)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
      className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
      style={{ background: 'var(--flg-bg-secondary)', border: `1px solid ${platCfg.color}15` }}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: st.bg, color: st.color }}>
          <PlatformIcon platform={platform} size={16} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white/70">{platCfg.label}</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>
              {st.label}
            </span>
          </div>
          {conn?.platform_username && (
            <p className="text-[10px] text-white/30">@{conn.platform_username}</p>
          )}
          {conn?.ultima_sincronizacao && (
            <p className="text-[10px] text-white/20">
              Sync: {new Date(conn.ultima_sincronizacao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          {conn?.ultimo_erro && (
            <p className="text-[10px] text-red-400/60 max-w-xs truncate">{conn.ultimo_erro}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {status === 'ativo' && (
          <>
            <button onClick={handleSync} disabled={syncing}
              className="text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-40"
              style={{ background: `${platCfg.color}15`, color: platCfg.color, border: `1px solid ${platCfg.color}30` }}>
              {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
            </button>
            <button onClick={handleDisconnect}
              className="text-[10px] font-semibold px-3 py-1.5 rounded-lg text-red-400/60 transition-all cursor-pointer"
              style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)' }}>
              Desconectar
            </button>
          </>
        )}
        {(status === 'nao_conectado' || status === 'desconectado' || status === 'expirado') && (
          <button onClick={handleConnect} disabled={!oauthOk}
            className="text-[10px] font-semibold px-4 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: `${platCfg.color}20`, color: platCfg.color, border: `1px solid ${platCfg.color}40` }}>
            {oauthOk ? `Conectar ${platCfg.label}` : 'OAuth não configurado'}
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function Metricas({ session }) {
  const user = session?.user
  const admin = checkAdmin(user)
  const { clientes: allClientes } = useApp()
  const clientes = admin
    ? allClientes
    : allClientes.filter(c => c.consultor_responsavel?.toLowerCase().includes(user?.email?.split('@')[0] || ''))

  const [platform, setPlatform] = useState('instagram')
  const [clienteId, setClienteId] = useState('')
  const [periodo, setPeriodo] = useState(30)
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [historico, setHistorico] = useState([])
  const [posts, setPosts] = useState([])
  const [horarios, setHorarios] = useState([])
  const [ranking, setRanking] = useState([])
  const [conexoes, setConexoes] = useState([])
  const [showConnPanel, setShowConnPanel] = useState(false)

  useEffect(() => {
    if (clientes.length > 0 && !clienteId) setClienteId(clientes[0].id)
  }, [clientes])

  // Carregar conexões do cliente
  const loadConexoes = () => {
    if (!clienteId) return
    api(`/conexoes/${clienteId}`).then(d => setConexoes(d.conexoes || [])).catch(() => {})
  }
  useEffect(() => { loadConexoes() }, [clienteId])

  useEffect(() => {
    if (admin) {
      api(`/metricas/ranking?plataforma=${platform}`).then(d => setRanking(d.ranking || [])).catch(() => {})
    }
  }, [admin, platform])

  // Reset data and fetch when platform, client, or period changes
  useEffect(() => {
    if (!clienteId) return
    setLoading(true)
    setOverview(null)

    const p = platform
    Promise.all([
      api(`/metricas/${clienteId}/overview?plataforma=${p}`),
      api(`/metricas/${clienteId}/historico?plataforma=${p}&dias=${periodo}`),
      api(`/metricas/${clienteId}/posts?plataforma=${p}&limit=9`),
      api(`/metricas/${clienteId}/horarios?plataforma=${p}`),
    ]).then(([ov, hist, po, hor]) => {
      setOverview(ov)
      setHistorico(hist.dados || [])
      setPosts(po.posts || [])
      setHorarios(hor.horarios || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [clienteId, periodo, platform])

  const kpis = overview?.kpis
  const conectado = overview?.conectado
  const platConfig = PLATFORMS[platform]
  const kpiDefs = PLATFORM_KPIS[platform] || []
  const primaryChart = PLATFORM_CHART_PRIMARY[platform]
  const chartLines = PLATFORM_CHART_LINES[platform] || []
  const donutData = useMemo(() => buildDonutData(kpis, platform), [kpis, platform])

  function fmtDate(d) {
    if (!d) return ''
    const [, m, day] = d.split('-')
    return `${day}/${m}`
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-8">

      {/* ── Platform Selector ── */}
      <div className="flex items-center gap-1.5 rounded-xl p-1.5" style={{ background: 'var(--flg-bg-secondary)', border: '1px solid var(--flg-border)' }}>
        {Object.entries(PLATFORMS).map(([key, cfg]) => {
          const active = platform === key
          return (
            <button
              key={key}
              onClick={() => setPlatform(key)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer relative"
              style={active
                ? { background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}40` }
                : { color: 'var(--flg-text-muted)', border: '1px solid transparent' }
              }
            >
              <PlatformIcon platform={key} size={16} />
              <span className="hidden sm:inline">{cfg.label}</span>
              {active && (
                <motion.div
                  layoutId="platform-indicator"
                  className="absolute inset-0 rounded-lg"
                  style={{ background: `${cfg.color}08`, border: `1px solid ${cfg.color}25` }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* ── Header / Filters ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <select value={clienteId} onChange={e => setClienteId(e.target.value)}
            className="text-sm font-medium rounded-lg px-3 py-2 outline-none cursor-pointer"
            style={{ background: 'var(--flg-bg-raised)', border: `1px solid ${platConfig.color}40`, color: 'var(--flg-text)' }}>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.empresa}</option>)}
          </select>

          {overview && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-full"
              style={conectado
                ? { background: 'rgba(52,211,153,0.12)', color: '#34D399', border: '1px solid rgba(52,211,153,0.25)' }
                : { background: 'var(--flg-bg-hover)', color: 'var(--flg-text-muted)', border: '1px solid var(--flg-border)' }}>
              {conectado ? <Wifi size={11} /> : <WifiOff size={11} />}
              {conectado ? `${platConfig.label} conectado` : 'Dados mock'}
            </div>
          )}
        </div>

        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
          {[30, 90, 180].map(d => (
            <button key={d} onClick={() => setPeriodo(d)}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer"
              style={periodo === d
                ? { background: `${platConfig.color}18`, color: platConfig.color, border: `1px solid ${platConfig.color}40` }
                : { color: 'var(--flg-text-muted)', border: '1px solid transparent' }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* ── Connection Panel Toggle ── */}
      {clienteId && (
        <div className="flex items-center gap-3">
          <button onClick={() => setShowConnPanel(v => !v)}
            className="text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
            style={{ background: 'var(--flg-bg-hover)', color: 'var(--flg-text-muted)', border: '1px solid var(--flg-border)' }}>
            <Wifi size={11} />
            {showConnPanel ? 'Ocultar conexões' : 'Gerenciar conexões'}
          </button>
          {conexoes.filter(c => c.status === 'ativo').length > 0 && (
            <span className="text-[9px] text-emerald-400/60">
              {conexoes.filter(c => c.status === 'ativo').length} plataforma(s) conectada(s)
            </span>
          )}
        </div>
      )}

      {showConnPanel && clienteId && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          {Object.keys(PLATFORMS).map(p => (
            <ConnectionPanel key={p} clienteId={clienteId} platform={p} conexoes={conexoes} onRefresh={loadConexoes} />
          ))}
        </motion.div>
      )}

      {loading && <div className="flex justify-center py-12"><PageSpinner /></div>}

      {!loading && overview && (
        <>
          {/* ── KPI Grid ── */}
          <section>
            <SectionTitle>Visão Geral — {platConfig.label} — últimos 30 dias</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {kpiDefs.map((def) => {
                const kpi = kpis[def.key]
                if (!kpi) return null
                return (
                  <KpiCard
                    key={def.key}
                    icon={def.icon}
                    label={def.label}
                    value={kpi.valor || 0}
                    decimals={def.decimals || 0}
                    suffix={def.suffix || ''}
                    delta={def.noDelta ? undefined : kpi.delta_pct}
                    color={platConfig.color}
                  />
                )
              })}
            </div>
          </section>

          {/* ── Charts Row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Primary area chart */}
            <div className="lg:col-span-2 rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
              <SectionTitle>Crescimento de {primaryChart.label}</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={historico} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="primaryGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={platConfig.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={platConfig.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--flg-bg-hover)" />
                  <XAxis dataKey="data" tickFormatter={fmtDate} tick={{ fill: 'var(--flg-text-faint)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--flg-text-faint)', fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey={primaryChart.key} name={primaryChart.label}
                    stroke={platConfig.color} strokeWidth={2} fill="url(#primaryGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Content mix donut */}
            <div className="rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
              <SectionTitle>Mix de Conteúdo</SectionTitle>
              {donutData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                        {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
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
              ) : <p className="text-white/20 text-xs mt-6">Sem publicações no período.</p>}
            </div>
          </div>

          {/* ── Secondary Line Chart ── */}
          {chartLines.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
              <SectionTitle>{chartLines.map(l => l.label).join(' & ')}</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={historico} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--flg-bg-hover)" />
                  <XAxis dataKey="data" tickFormatter={fmtDate} tick={{ fill: 'var(--flg-text-faint)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" orientation="left" tick={{ fill: 'var(--flg-text-faint)', fontSize: 10 }} tickLine={false} axisLine={false} width={35}
                    unit={chartLines[0]?.unit || ''} />
                  {chartLines.length > 1 && (
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--flg-text-faint)', fontSize: 10 }} tickLine={false} axisLine={false} width={50} />
                  )}
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'var(--flg-text-muted)' }} />
                  {chartLines.map((line, i) => (
                    <Line key={line.key} yAxisId={line.yAxis} type="monotone" dataKey={line.key}
                      name={line.label} stroke={line.color} strokeWidth={i === 0 ? 2 : 1.5} dot={false}
                      strokeDasharray={i > 0 ? '4 2' : undefined} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Heatmap ── */}
          <div className="rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
            <SectionTitle>Melhores Horários — {platConfig.label}</SectionTitle>
            <EngagementHeatmap data={horarios} accentColor={platConfig.color} />
          </div>

          {/* ── Best posts ── */}
          <section>
            <SectionTitle>Melhores Posts — {platConfig.label}</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {posts.slice(0, 9).map((post, i) => <PostCard key={post.id} post={post} rank={i} platform={platform} />)}
            </div>
          </section>

          {/* ── AI Recommendations ── */}
          <AiRecommendations overview={overview} historico={historico} horarios={horarios} posts={posts} platform={platform} />
        </>
      )}

      {/* ── Admin Ranking ── */}
      {admin && ranking.length > 0 && (
        <section>
          <SectionTitle>Ranking — {platConfig.label} (Admin)</SectionTitle>
          <RankingTable data={ranking} platform={platform} />
        </section>
      )}

      {!loading && !overview && clienteId && (
        <div className="flex items-center justify-center py-20 text-white/20 text-sm">
          Sem dados disponíveis para este cliente no {platConfig.label}.
        </div>
      )}
    </div>
  )
}
