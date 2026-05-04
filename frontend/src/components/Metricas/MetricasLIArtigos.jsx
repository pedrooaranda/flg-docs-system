import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_LI_ARTIGOS, ORDER_OPTIONS_GENERIC } from './shared/constants'

export default function MetricasLIArtigos() {
  return (
    <MetricasTipoView
      tipoBackend="artigos"
      tipoFiltroPostFE={['ARTICLE']}
      kpisDef={KPIS_LI_ARTIGOS}
      kpiSkelCount={6}
      sectionTitle="Artigos do LinkedIn"
      listTitle="Lista de artigos"
      emptyMessage="Nenhum artigo no período."
      orderOptions={ORDER_OPTIONS_GENERIC}
      defaultOrdenar="recente"
    />
  )
}
