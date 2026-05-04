import { useState, useEffect, useMemo } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts'
import { api } from '../../lib/api'
import { ChartSkeleton, KpiGridSkeleton, HeatmapSkeleton, PostsGridSkeleton, DemographicsSection } from '../MetricasParts'
import KpiCard from './shared/KpiCard'
import { DadosZeradosBanner, AguardandoSyncBanner, MockDataBanner } from './shared/banners'
import { KPIS_GERAL, KPIS_YT_GERAL, KPIS_LI_GERAL, KPIS_TT_GERAL, KPI_WEIGHT, GOLD } from './shared/constants'

const KPIS_BY_PLATFORM = {
  instagram: KPIS_GERAL,
  youtube: KPIS_YT_GERAL,
  linkedin: KPIS_LI_GERAL,
  tiktok: KPIS_TT_GERAL,
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

function fmtDate(d) {
  if (!d) return ''
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

export default function MetricasGeral() {
  const navigate = useNavigate()
  const { clienteId, periodo, platform, platConfig } = useOutletContext()
  const kpisDef = KPIS_BY_PLATFORM[platform] || KPIS_GERAL
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [historico, setHistorico] = useState([])

  useEffect(() => {
    if (!clienteId) return
    setLoading(true)
    setOverview(null)
    Promise.all([
      api(`/metricas/${clienteId}/overview?plataforma=${platform}&dias=${periodo}&tipo=all`),
      api(`/metricas/${clienteId}/historico?plataforma=${platform}&dias=${periodo}`),
    ]).then(([ov, hist]) => {
      setOverview(ov)
      setHistorico(hist.dados || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [clienteId, periodo, platform])

  const kpis = overview?.kpis
  const conectado = overview?.conectado
  const aguardandoSync = overview?.aguardando_sync === true
  const diagnostico = overview?.diagnostico
  const mostrarDiagnostico = (
    conectado && !aguardandoSync && diagnostico && (
      (diagnostico.last_error?.errors?.length > 0) ||
      (diagnostico.posts_no_periodo === 0 && diagnostico.last_sync_at)
    )
  )

  const donutData = useMemo(() => {
    if (!kpis || platform !== 'instagram') return []
    const items = [
      { name: 'Posts', value: kpis.posts_publicados?.valor || 0, color: '#E4405F' },
      { name: 'Reels', value: kpis.reels_publicados?.valor || 0, color: '#A855F7' },
      { name: 'Stories', value: kpis.stories_publicados?.valor || 0, color: '#FACC15' },
    ].filter(x => x.value > 0)
    return items
  }, [kpis, platform])

  if (loading) {
    return (
      <div className="space-y-8">
        <section>
          <SectionTitle>Visão Geral — {platConfig.label} — últimos {periodo} dias</SectionTitle>
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
    )
  }

  if (!overview) return null

  return (
    <>
      {aguardandoSync && (
        <AguardandoSyncBanner clienteId={clienteId} accent={platConfig.color} onSynced={() => setLoading(true)} />
      )}

      {!aguardandoSync && (
        <>
          {!conectado && (
            <MockDataBanner onConectar={() => navigate('/admin')} />
          )}
          {mostrarDiagnostico && (
            <DadosZeradosBanner
              diagnostico={diagnostico}
              clienteId={clienteId}
              accent={platConfig.color}
              onSynced={() => setLoading(true)}
            />
          )}

          {/* ── KPI Grid ── */}
          <section>
            <SectionTitle>Visão Geral — {platConfig.label} — últimos {periodo} dias</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {(() => {
                const winner = kpisDef.reduce((best, d) => {
                  if (d.noDelta) return best
                  const dl = kpis[d.key]?.delta_pct
                  if (dl == null || dl <= 0) return best
                  const score = dl * (KPI_WEIGHT[d.key] || 1)
                  if (!best || score > best.score) return { key: d.key, delta: dl, score }
                  return best
                }, null)
                return kpisDef.map((def) => {
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
                      prefix={def.prefix || ''}
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

          {/* ── Crescimento de seguidores + Mix de conteúdo ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
              <SectionTitle>Crescimento de seguidores</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={historico} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="seguidoresGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={platConfig.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={platConfig.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--flg-bg-hover)" />
                  <XAxis dataKey="data" tickFormatter={fmtDate} tick={{ fill: 'var(--flg-text-faint)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--flg-text-faint)', fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="seguidores" name="Seguidores" stroke={platConfig.color} strokeWidth={2} fill="url(#seguidoresGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
              <SectionTitle>Mix de conteúdo</SectionTitle>
              {donutData.length === 0 ? (
                <p className="text-white/40 text-xs">Sem publicações no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                {donutData.map(d => (
                  <span key={d.name} className="flex items-center gap-1" style={{ color: d.color }}>
                    <span style={{ width: 8, height: 8, background: d.color, borderRadius: '50%', display: 'inline-block' }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── Demografia ── */}
          {platform === 'instagram' && conectado && !aguardandoSync && (
            <DemographicsSection clienteId={clienteId} accent={platConfig.color} />
          )}
        </>
      )}
    </>
  )
}
