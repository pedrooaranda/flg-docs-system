import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_TT_VIDEOS, ORDER_OPTIONS_GENERIC } from './shared/constants'

export default function MetricasTTVideos() {
  return (
    <MetricasTipoView
      tipoBackend="videos"
      tipoFiltroPostFE={['VIDEO']}
      kpisDef={KPIS_TT_VIDEOS}
      kpiSkelCount={8}
      sectionTitle="Vídeos do TikTok"
      listTitle="Lista de vídeos"
      emptyMessage="Nenhum vídeo no período."
      orderOptions={ORDER_OPTIONS_GENERIC}
      defaultOrdenar="recente"
    />
  )
}
