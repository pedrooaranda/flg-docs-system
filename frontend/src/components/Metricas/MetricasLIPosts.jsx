import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_LI_POSTS, ORDER_OPTIONS_GENERIC } from './shared/constants'

export default function MetricasLIPosts() {
  return (
    <MetricasTipoView
      tipoBackend="posts"
      tipoFiltroPostFE={['POST', 'POLL', 'DOCUMENT']}
      kpisDef={KPIS_LI_POSTS}
      kpiSkelCount={6}
      sectionTitle="Posts do LinkedIn"
      listTitle="Lista de posts"
      emptyMessage="Nenhum post no período."
      orderOptions={ORDER_OPTIONS_GENERIC}
      defaultOrdenar="recente"
    />
  )
}
