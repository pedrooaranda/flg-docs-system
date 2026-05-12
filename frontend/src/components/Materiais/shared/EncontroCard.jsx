/**
 * EncontroCard — célula visual de um encontro pra um cliente no grid.
 *
 * Em Phase B é só leitura visual. Em Phase C ganha onClick → editor.
 */

import { FileText, Layers } from 'lucide-react'
import { ENCONTRO_STATUS, deriveStatus } from './constants'

export default function EncontroCard({ encontroBase, encontroPratica = null }) {
  const status = deriveStatus(encontroBase, encontroPratica)
  const cfg = ENCONTRO_STATUS[status]
  const numSlides = encontroBase?.num_slides_intelecto || 0
  const numero = encontroBase?.numero

  return (
    <div
      className="rounded-lg p-3 transition-all"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        opacity: status === 'intelectual_pendente' ? 0.5 : 1,
      }}
      title={`Encontro ${numero} — ${cfg.label}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] font-semibold tracking-wider uppercase"
          style={{ color: cfg.color }}>
          E{String(numero).padStart(2, '0')}
        </span>
        <span className="text-[9px]" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
      </div>

      <p className="text-xs text-white/70 line-clamp-2 leading-snug min-h-[2.25rem]">
        {encontroBase?.titulo || `Encontro ${numero}`}
      </p>

      <div className="flex items-center gap-3 mt-2 text-[10px] text-white/30">
        <span className="flex items-center gap-1">
          <Layers size={10} /> {numSlides} slides
        </span>
        {encontroPratica?.slug && (
          <span className="flex items-center gap-1">
            <FileText size={10} /> prática
          </span>
        )}
      </div>
    </div>
  )
}
