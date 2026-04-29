import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api } from '../../lib/api'
import { KpiGridSkeleton, PostsGridSkeleton, PostsTable, ViewToggle } from '../MetricasParts'
import KpiCard from './shared/KpiCard'
import PostCard from './shared/PostCard'
import { KPIS_FEED, KPI_WEIGHT } from './shared/constants'

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-3">{children}</h2>
}

export default function MetricasPosts() {
  const { clienteId, periodo, platform, platConfig } = useOutletContext()
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [posts, setPosts] = useState([])
  const [postsView, setPostsView] = useState('cards')

  useEffect(() => {
    if (!clienteId) return
    setLoading(true)
    setOverview(null)
    Promise.all([
      api(`/metricas/${clienteId}/overview?plataforma=${platform}&dias=${periodo}&tipo=feed`),
      api(`/metricas/${clienteId}/posts?plataforma=${platform}&limit=24`),
    ]).then(([ov, po]) => {
      setOverview(ov)
      // Filtra só FEED (a API hoje devolve todos os tipos)
      setPosts((po.posts || []).filter(p => p.tipo === 'IMAGE' || p.tipo === 'CAROUSEL' || p.tipo === 'VIDEO'))
    }).catch(console.error).finally(() => setLoading(false))
  }, [clienteId, periodo, platform])

  if (loading) {
    return (
      <div className="space-y-6">
        <KpiGridSkeleton count={7} />
        <PostsGridSkeleton />
      </div>
    )
  }
  if (!overview) return null

  const kpis = overview.kpis
  const winner = KPIS_FEED.reduce((best, d) => {
    if (d.noDelta) return best
    const dl = kpis[d.key]?.delta_pct
    if (dl == null || dl <= 0) return best
    const score = dl * (KPI_WEIGHT[d.key] || 1)
    if (!best || score > best.score) return { key: d.key, delta: dl, score }
    return best
  }, null)

  return (
    <>
      <section>
        <SectionTitle>Posts (Feed) — últimos {periodo} dias</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {KPIS_FEED.map((def) => {
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
                highlight={winner?.key === def.key}
              />
            )
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Lista de posts</SectionTitle>
          <ViewToggle value={postsView} onChange={setPostsView} accent={platConfig.color} />
        </div>
        {posts.length === 0 ? (
          <p className="text-white/40 text-xs">Nenhum post no período.</p>
        ) : postsView === 'cards' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.slice(0, 9).map((post, i) => <PostCard key={post.id} post={post} rank={i} platform={platform} />)}
          </div>
        ) : (
          <PostsTable posts={posts} accent={platConfig.color} />
        )}
      </section>
    </>
  )
}
