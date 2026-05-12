import { TIER_CONFIG } from './constants'

// Badge colorido pra tier (junior/pleno/senior/lead). Se tier não setado ou inválido,
// renderiza um dash discreto.
export default function TierBadge({ tier }) {
  if (!tier) return <span className="text-[11px] text-white/40">—</span>
  const cfg = TIER_CONFIG[tier]
  if (!cfg) return <span className="text-[11px] text-white/40 capitalize">{tier}</span>
  return (
    <span
      className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
    >
      {cfg.label}
    </span>
  )
}
