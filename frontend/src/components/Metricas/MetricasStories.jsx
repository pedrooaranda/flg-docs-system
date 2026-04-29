import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_STORIES, ORDER_OPTIONS_STORIES } from './shared/constants'

export default function MetricasStories() {
  return (
    <MetricasTipoView
      tipoBackend="story"
      tipoFiltroPostFE={['STORY']}
      kpisDef={KPIS_STORIES}
      kpiSkelCount={7}
      sectionTitle="Stories"
      listTitle="Stories ativas (24h) e recentes"
      emptyMessage="Nenhum Story no período."
      orderOptions={ORDER_OPTIONS_STORIES}
      defaultOrdenar="recente"
    />
  )
}
