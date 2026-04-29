import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_REELS } from './shared/constants'

export default function MetricasReels() {
  return (
    <MetricasTipoView
      tipoBackend="reels"
      tipoFiltroPostFE={['REEL']}
      kpisDef={KPIS_REELS}
      kpiSkelCount={9}
      sectionTitle="Reels"
      listTitle="Lista de Reels"
      emptyMessage="Nenhum Reel no período."
    />
  )
}
