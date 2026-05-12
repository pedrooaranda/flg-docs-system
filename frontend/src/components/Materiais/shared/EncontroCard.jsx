/**
 * EncontroCard — célula visual de um encontro pra um cliente no grid.
 *
 * Quando `clienteId` é passado E o intelectual está pronto, vira link clicável
 * pro editor `/materiais/reunioes/:cid/:n`. Sem intelectual ainda → não navega.
 */

import { FileText, Layers } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ENCONTRO_STATUS, deriveStatus } from './constants'

export default function EncontroCard({ encontroBase, encontroPratica = null, clienteId = null }) {
  const status = deriveStatus(encontroBase, encontroPratica)
  const cfg = ENCONTRO_STATUS[status]
  const numSlides = encontroBase?.num_slides_intelecto || 0
  const numero = encontroBase?.numero
  const intelectualPronto = status !== 'intelectual_pendente'
  const clickable = !!(clienteId && intelectualPronto)

  const cardContent = (
    <>
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
        {encontroPratica?.slug && !encontroPratica?.slug_revogado_at && (
          <span className="flex items-center gap-1">
            <FileText size={10} /> prática
          </span>
        )}
      </div>
    </>
  )

  const cardStyle = {
    background: cfg.bg,
    border: `1px solid ${cfg.border}`,
    opacity: status === 'intelectual_pendente' ? 0.5 : 1,
  }

  if (clickable) {
    return (
      <Link
        to={`/materiais/reunioes/${clienteId}/${numero}`}
        className="rounded-lg p-3 transition-all block hover:scale-[1.02] cursor-pointer"
        style={cardStyle}
        title={`Encontro ${numero} — ${cfg.label} (click pra preparar prática)`}
      >
        {cardContent}
      </Link>
    )
  }

  return (
    <div
      className="rounded-lg p-3 transition-all"
      style={cardStyle}
      title={`Encontro ${numero} — ${cfg.label}${!intelectualPronto ? ' (admin precisa gerar HTML intelectual antes)' : ''}`}
    >
      {cardContent}
    </div>
  )
}
