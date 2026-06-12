import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KpiGridSkeleton, PostsGridSkeleton, PostsTable, ViewToggle } from '../../MetricasParts'
import KpiCard from './KpiCard'
import PostCard from './PostCard'
import SortDropdown from './SortDropdown'
import { KPI_WEIGHT } from './constants'
import { useTipoMetricas } from './useTipoMetricas'
import { NaoConectadoBanner } from './banners'

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-3">{children}</h2>
}

/**
 * View compartilhada das abas Posts/Reels/Stories.
 *
 * Props:
 * - tipoBackend: 'feed' | 'reels' | 'story'
 * - tipoFiltroPostFE: array de tipos válidos pro filtro frontend de segurança
 * - kpisDef: lista de defs de KPI
 * - kpiSkelCount: quantos skeletons mostrar
 * - sectionTitle: título da seção de KPIs
 * - listTitle: título da lista de posts
 * - emptyMessage: texto quando não tem post
 * - orderOptions: array de { key, label } com opções de ordenação
 * - defaultOrdenar: chave default da ordenação (quando URL não tem ?ordenar=)
 */
export default function MetricasTipoView({
  tipoBackend,
  tipoFiltroPostFE,
  kpisDef,
  kpiSkelCount = 7,
  sectionTitle,
  listTitle,
  emptyMessage,
  orderOptions,
  defaultOrdenar = 'engajamento',
}) {
  const { clienteId, periodo, platform, platConfig, loading, overview, posts, ordenar, setOrdenar } = useTipoMetricas({
    tipoBackend,
    tipoFiltroPostFE,
    defaultOrdenar,
  })
  const [postsView, setPostsView] = useState('cards')
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="space-y-6">
        <KpiGridSkeleton count={kpiSkelCount} />
        <PostsGridSkeleton />
      </div>
    )
  }
  if (!overview) return null

  // Cliente não conectado → banner em tela cheia, sem KPIs/posts.
  if (overview.conectado === false) {
    return (
      <NaoConectadoBanner
        plataforma={platform}
        clienteNome={overview.cliente_nome}
        onConectar={platform === 'instagram' ? () => navigate(`/clientes/${clienteId}`) : null}
      />
    )
  }

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
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <SectionTitle>{listTitle}</SectionTitle>
          <div className="flex items-center gap-2">
            <SortDropdown
              value={ordenar}
              onChange={setOrdenar}
              options={orderOptions}
              accent={platConfig.color}
            />
            <ViewToggle value={postsView} onChange={setPostsView} accent={platConfig.color} />
          </div>
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
