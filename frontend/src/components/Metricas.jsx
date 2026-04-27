import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, useInView, animate } from 'framer-motion'
import {
  AreaChart, Area, LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Users, TrendingUp, Eye, Heart, Bookmark, MessageCircle, BarChart2, Wifi, WifiOff, Play, Share2, Target, Clock, RefreshCw, Crown } from 'lucide-react'
import { api } from '../lib/api'
import { isAdmin as checkAdmin } from '../lib/utils'
import { useApp } from '../contexts/AppContext'
import {
  DateRangePicker,
  KpiGridSkeleton, ChartSkeleton, HeatmapSkeleton, PostsGridSkeleton,
  PostsTable, ViewToggle, DemographicsSection,
} from './MetricasParts'

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
    { key: 'seguidores', label: 'Seguidores', icon: Users, histKey: 'seguidores' },
    { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%', histKey: 'taxa_engajamento' },
    { key: 'alcance_medio', label: 'Alcance médio', icon: Eye, histKey: 'alcance_total' },
    { key: 'impressoes_medias', label: 'Impressões', icon: Eye, histKey: 'impressoes_total' },
    { key: 'curtidas_total', label: 'Curtidas', icon: Heart, histKey: 'curtidas_total' },
    { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle, histKey: 'comentarios_total' },
    { key: 'salvamentos_total', label: 'Salvamentos', icon: Bookmark, histKey: 'salvamentos_total' },
    { key: 'posts_publicados', label: 'Posts publicados', icon: BarChart2, noDelta: true, histKey: 'posts_publicados' },
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

// ─── Sparkline (mini SVG inline) ──────────────────────────────────────────────
function Sparkline({ data, color = GOLD, width = 100, height = 28 }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)
  const points = data.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const lastX = (data.length - 1) * stepX
  const lastY = height - ((data[data.length - 1] - min) / range) * (height - 4) - 2
  const gradId = `spark-${color.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${height} ${points} ${lastX},${height}`}
        fill={`url(#${gradId})`}
      />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
      <circle cx={lastX} cy={lastY} r="4.5" fill={color} fillOpacity="0.25" />
    </svg>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, decimals = 0, suffix = '', delta, prefix = '', color = GOLD, history, highlight = false }) {
  const positive = delta >= 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden group ${highlight ? 'kpi-pulse' : ''}`}
      style={{
        background: 'var(--flg-bg-raised)',
        border: highlight ? `1px solid ${color}55` : '1px solid var(--flg-border)',
        boxShadow: highlight ? `0 0 0 1px ${color}10` : undefined,
      }}
    >
      {highlight && (
        <div
          className="absolute top-2 right-2 flex items-center justify-center rounded-full crown-pulse"
          style={{
            width: 22,
            height: 22,
            background: `linear-gradient(135deg, #F5D68A, #C9A84C 50%, #8B6914)`,
            boxShadow: '0 0 10px rgba(245,214,138,0.45)',
          }}
          title="KPI com maior alta vs. mês anterior"
        >
          <Crown size={11} strokeWidth={2.2} color="#1a1300" />
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40 font-medium">{label}</span>
        <Icon size={14} style={{ color }} className="opacity-60" />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="text-2xl font-bold text-white leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
          <AnimatedNumber value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
        </div>
        {history && history.length > 1 && (
          <div className="opacity-70 group-hover:opacity-100 transition-opacity">
            <Sparkline data={history} color={color} width={70} height={24} />
          </div>
        )}
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

// ─── Engagement Heatmap (CSS Grid, resolução nativa, sem distorção) ──────────
function EngagementHeatmap({ data, accentColor = GOLD }) {
  const [hover, setHover] = useState(null)
  if (!data?.length) return null

  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const faixas = ['06-09h', '09-12h', '12-15h', '15-18h', '18-21h']
  const maxEng = Math.max(...data.map(d => d.engajamento))
  const minEng = Math.min(...data.map(d => d.engajamento))
  const range = maxEng - minEng || 1
  const best = data.reduce((a, b) => (b.engajamento > a.engajamento ? b : a), data[0])

  const intensity = (eng) => 0.05 + ((eng - minEng) / range) * 0.85
  const gridCols = '52px repeat(7, 1fr)'

  return (
    <div className="space-y-3 relative">
      <div className="overflow-x-auto">
        <div className="min-w-[440px]">
          {/* axis: dias */}
          <div className="grid mb-1.5" style={{ gridTemplateColumns: gridCols, gap: '4px' }}>
            <div />
            {dias.map(d => (
              <div key={d} className="text-[10px] text-white/30 text-center font-normal tracking-wider">{d}</div>
            ))}
          </div>
          {/* rows */}
          {faixas.map((faixa, fi) => (
            <div key={faixa} className="grid mb-1" style={{ gridTemplateColumns: gridCols, gap: '4px' }}>
              <div className="text-[10px] text-white/30 flex items-center justify-end pr-1">{faixa}</div>
              {dias.map((_, di) => {
                const cell = data.find(d => d.faixa_idx === fi && d.dia_idx === di)
                if (!cell) return <div key={di} className="rounded-md" style={{ height: 26, background: 'rgba(255,255,255,0.02)' }} />
                const alpha = intensity(cell.engajamento)
                const isBest = best && cell.dia_idx === best.dia_idx && cell.faixa_idx === best.faixa_idx
                return (
                  <div
                    key={di}
                    onMouseEnter={() => setHover(cell)}
                    onMouseLeave={() => setHover(null)}
                    className={`rounded-md flex items-center justify-center transition-transform hover:scale-105 ${isBest ? 'heatmap-best' : ''}`}
                    style={{
                      height: 26,
                      background: `${accentColor}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`,
                      border: isBest ? `1px solid ${accentColor}` : '1px solid rgba(255,255,255,0.03)',
                      cursor: 'default',
                    }}
                  >
                    <span
                      className="text-[10px] font-medium"
                      style={{
                        color: alpha > 0.55 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.45)',
                      }}
                    >
                      {cell.engajamento.toFixed(1)}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      {hover && (
        <div className="absolute pointer-events-none z-10 rounded-md px-2.5 py-1.5 text-[11px] -translate-x-1/2"
          style={{
            background: 'var(--flg-bg-card)',
            border: `1px solid ${accentColor}30`,
            left: '50%', top: -8,
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)'
          }}>
          <span className="text-white/40">{hover.dia} · {hover.faixa} · </span>
          <span style={{ color: accentColor }} className="font-semibold">{hover.engajamento.toFixed(2)}%</span>
        </div>
      )}
      <div className="flex items-center justify-between text-[10px] text-white/40">
        {best && (
          <div>
            <span className="text-white/25">Melhor janela:</span>{' '}
            <span style={{ color: accentColor }} className="font-medium">
              {best.dia} · {best.faixa} · {best.engajamento.toFixed(2)}%
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-white/25">Menos</span>
          <div className="h-1.5 w-24 rounded-full" style={{
            background: `linear-gradient(to right, ${accentColor}10, ${accentColor})`
          }} />
          <span className="text-white/25">Mais</span>
        </div>
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

// ─── Cliente Combobox (busca inteligente) ────────────────────────────────────
function ClienteCombobox({ clientes, value, onChange, accent = GOLD }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapperRef = useRef(null)

  const selected = clientes.find(c => c.id === value)

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? clientes.filter(c =>
          (c.nome || '').toLowerCase().includes(q) ||
          (c.empresa || '').toLowerCase().includes(q)
        )
      : clientes
    return [...list].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
  }, [clientes, query])

  return (
    <div ref={wrapperRef} className="relative" style={{ minWidth: 280 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 text-sm font-medium rounded-lg px-3 py-2 outline-none cursor-pointer"
        style={{ background: 'var(--flg-bg-raised)', border: `1px solid ${accent}40`, color: 'var(--flg-text)' }}
      >
        <span className="truncate">
          {selected ? `${selected.nome}${selected.empresa ? ' — ' + selected.empresa : ''}` : 'Selecionar cliente…'}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" className="opacity-60 shrink-0">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-1 rounded-lg shadow-2xl z-50 overflow-hidden"
          style={{ background: 'var(--flg-bg-raised)', border: `1px solid ${accent}40` }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--flg-border)' }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por nome ou empresa…"
              className="w-full px-2 py-1.5 text-sm rounded outline-none"
              style={{ background: 'var(--flg-bg-secondary)', border: '1px solid var(--flg-border)', color: 'var(--flg-text)' }}
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--flg-text-muted)' }}>
                Nenhum cliente encontrado
              </div>
            ) : (
              filtered.map(c => {
                const active = c.id === value
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { onChange(c.id); setOpen(false); setQuery('') }}
                    className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2"
                    style={active
                      ? { background: `${accent}18`, color: accent }
                      : { color: 'var(--flg-text)' }
                    }
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--flg-bg-hover)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span className="truncate">
                      <span className="font-medium">{c.nome}</span>
                      {c.empresa && <span className="opacity-60"> — {c.empresa}</span>}
                    </span>
                    {active && (
                      <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
                        <path d="M2 7l3.5 3.5L12 4" stroke="currentColor" strokeWidth="2" fill="none" />
                      </svg>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sync button + última sincronização ──────────────────────────────────────
function SyncButton({ clienteId, onSynced, accent = GOLD }) {
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(null)

  useEffect(() => {
    if (!clienteId) return
    api(`/instagram/oauth/status/${clienteId}`)
      .then(d => setLastSync(d?.last_sync_at || null))
      .catch(() => {})
  }, [clienteId])

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    try {
      const r = await api(`/instagram/sync/${clienteId}`, { method: 'POST' })
      setLastSync(new Date().toISOString())
      if (onSynced) onSynced(r)
    } catch (err) {
      console.error('Sync error', err)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-full transition-all"
      style={{
        background: 'var(--flg-bg-hover)',
        color: syncing ? 'var(--flg-text-muted)' : accent,
        border: `1px solid ${accent}30`,
        cursor: syncing ? 'wait' : 'pointer',
      }}
      title={lastSync ? `Última sync: ${formatRelative(lastSync)}` : 'Nunca sincronizado'}
    >
      <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
      {syncing ? 'Sincronizando…' : (lastSync ? `Sync ${formatRelative(lastSync)}` : 'Atualizar agora')}
    </button>
  )
}

function formatRelative(iso) {
  const dt = new Date(iso)
  const diff = Date.now() - dt.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `há ${d}d`
  return dt.toLocaleDateString('pt-BR')
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
  const [postsView, setPostsView] = useState('cards') // 'cards' | 'table'

  useEffect(() => {
    if (clientes.length > 0 && !clienteId) setClienteId(clientes[0].id)
  }, [clientes])

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

      {/* ── Platform Selector — desabilitado: foco apenas em Instagram nessa fase ── */}

      {/* ── Header / Filters ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <ClienteCombobox
            clientes={clientes}
            value={clienteId}
            onChange={setClienteId}
            accent={platConfig.color}
          />

          {overview && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-full"
              style={conectado
                ? { background: 'rgba(52,211,153,0.12)', color: '#34D399', border: '1px solid rgba(52,211,153,0.25)' }
                : { background: 'var(--flg-bg-hover)', color: 'var(--flg-text-muted)', border: '1px solid var(--flg-border)' }}>
              {conectado ? <Wifi size={11} /> : <WifiOff size={11} />}
              {conectado ? `${platConfig.label} conectado` : 'Dados mock'}
            </div>
          )}

          {conectado && platform === 'instagram' && (
            <SyncButton clienteId={clienteId} onSynced={() => setLoading(true)} accent={platConfig.color} />
          )}
        </div>

        <DateRangePicker
          periodo={periodo}
          onChange={(dias) => setPeriodo(dias)}
          accent={platConfig.color}
        />
      </div>

      {/* Conexões gerenciadas no Admin → Configurações. Status de Instagram aparece no badge ao lado do seletor. */}

      {loading && (
        <div className="space-y-8">
          <section>
            <SectionTitle>Visão Geral — {platConfig.label}</SectionTitle>
            <KpiGridSkeleton />
          </section>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2"><ChartSkeleton h={260} /></div>
            <ChartSkeleton h={260} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartSkeleton h={200} />
            <HeatmapSkeleton />
          </div>
          <section>
            <SectionTitle>Melhores Posts — {platConfig.label}</SectionTitle>
            <PostsGridSkeleton />
          </section>
        </div>
      )}

      {!loading && overview && (
        <>
          {/* ── KPI Grid ── */}
          <section>
            <SectionTitle>Visão Geral — {platConfig.label} — últimos 30 dias</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {(() => {
                // Peso por KPI: métricas que importam mais valem 2x na disputa pela coroa.
                // Engajamento e Alcance > Volume de interações > Vaidade (curtidas).
                const KPI_WEIGHT = {
                  taxa_engajamento: 2.0,
                  alcance_medio: 2.0,
                  impressoes_medias: 1.5,
                  seguidores: 1.2,
                  salvamentos_total: 1.2,
                  comentarios_total: 1.0,
                  curtidas_total: 0.8,
                }
                const winner = kpiDefs.reduce((best, d) => {
                  if (d.noDelta) return best
                  const dl = kpis[d.key]?.delta_pct
                  if (dl == null || dl <= 0) return best
                  const score = dl * (KPI_WEIGHT[d.key] || 1)
                  if (!best || score > best.score) return { key: d.key, delta: dl, score }
                  return best
                }, null)
                return kpiDefs.map((def) => {
                  const kpi = kpis[def.key]
                  if (!kpi) return null
                  const series = def.histKey
                    ? historico.map(h => Number(h[def.histKey]) || 0)
                    : null
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
                      history={series}
                      highlight={winner?.key === def.key}
                    />
                  )
                })
              })()}
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
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>Melhores Posts — {platConfig.label}</SectionTitle>
              <ViewToggle value={postsView} onChange={setPostsView} accent={platConfig.color} />
            </div>
            {postsView === 'cards' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {posts.slice(0, 9).map((post, i) => <PostCard key={post.id} post={post} rank={i} platform={platform} />)}
              </div>
            ) : (
              <PostsTable posts={posts} accent={platConfig.color} />
            )}
          </section>

          {/* ── Demografia (Instagram) ── */}
          {platform === 'instagram' && (
            <DemographicsSection clienteId={clienteId} accent={platConfig.color} />
          )}

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
