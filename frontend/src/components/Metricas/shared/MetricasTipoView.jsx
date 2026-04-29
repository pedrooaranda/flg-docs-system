import { useState } from 'react'
import { KpiGridSkeleton, PostsGridSkeleton, PostsTable, ViewToggle } from '../../MetricasParts'
import KpiCard from './KpiCard'
import PostCard from './PostCard'
import { KPI_WEIGHT } from './constants'
import { useTipoMetricas } from './useTipoMetricas'

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-3">{children}</h2>
}

/**
 * View compartilhada das abas Posts/Reels/Stories.
 *
 * Props:
 * - tipoBackend: 'feed' | 'reels' | 'story'
 * - tipoFiltroPostFE: array de tipos válidos (ex: ['IMAGE','CAROUSEL','VIDEO'] pra Feed)
 * - kpisDef: lista de defs de KPI (KPIS_FEED, KPIS_REELS ou KPIS_STORIES)
 * - kpiSkelCount: quantos skeletons mostrar
 * - sectionTitle: título da seção de KPIs (ex: 'Posts (Feed)')
 * - listTitle: título da lista de posts (ex: 'Lista de posts')
 * - emptyMessage: texto quando não tem post
 */
export default function MetricasTipoView({
  tipoBackend,
  tipoFiltroPostFE,
  kpisDef,
  kpiSkelCount = 7,
  sectionTitle,
  listTitle,
  emptyMessage,
}) {
  const { periodo, platform, platConfig, loading, overview, posts } = useTipoMetricas({
    tipoBackend,
    tipoFiltroPostFE,
  })
  const [postsView, setPostsView] = useState('cards')

  if (loading) {
    return (
      <div className="space-y-6">
        <KpiGridSkeleton count={kpiSkelCount} />
        <PostsGridSkeleton />
      </div>
    )
  }
  if (!overview) return null

  const kpis = overview.kpis
  const winner = kpisDef.reduce((best, d) => {
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
        <SectionTitle>{sectionTitle} — últimos {periodo} dias</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {kpisDef.map((def) => {
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
          <SectionTitle>{listTitle}</SectionTitle>
          <ViewToggle value={postsView} onChange={setPostsView} accent={platConfig.color} />
        </div>
        {posts.length === 0 ? (
          <p className="text-white/40 text-xs">{emptyMessage}</p>
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
