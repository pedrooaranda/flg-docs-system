import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_FEED, ORDER_OPTIONS_FEED } from './shared/constants'

export default function MetricasPosts() {
  return (
    <MetricasTipoView
      tipoBackend="feed"
      tipoFiltroPostFE={['IMAGE', 'CAROUSEL', 'VIDEO']}
      kpisDef={KPIS_FEED}
      kpiSkelCount={7}
      sectionTitle="Posts (Feed)"
      listTitle="Lista de posts"
      emptyMessage="Nenhum post no período."
      orderOptions={ORDER_OPTIONS_FEED}
      defaultOrdenar="engajamento"
    />
  )
}
