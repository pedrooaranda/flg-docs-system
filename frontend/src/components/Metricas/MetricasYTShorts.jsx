import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_YT_SHORTS, ORDER_OPTIONS_GENERIC } from './shared/constants'

export default function MetricasYTShorts() {
  return (
    <MetricasTipoView
      tipoBackend="shorts"
      tipoFiltroPostFE={['SHORT']}
      kpisDef={KPIS_YT_SHORTS}
      kpiSkelCount={6}
      sectionTitle="Shorts do YouTube"
      listTitle="Lista de Shorts"
      emptyMessage="Nenhum Short no período."
      orderOptions={ORDER_OPTIONS_GENERIC}
      defaultOrdenar="recente"
    />
  )
}
