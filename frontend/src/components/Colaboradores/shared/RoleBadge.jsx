import { ROLE_CONFIG } from './constants'

// Badge com ícone pra role. Owner (coroa amarela), Admin (escudo dourado), Member sem badge
// (renderiza dash). Role desconhecida: texto capitalizado fallback.
export default function RoleBadge({ role }) {
  const cfg = ROLE_CONFIG[role]
  if (!cfg) {
    // role='member' ou desconhecida — dash discreto
    if (!role || role === 'member') {
      return <span className="text-[11px] text-white/40">—</span>
    }
    return <span className="text-[11px] text-white/40 capitalize">{role}</span>
  }
  const Icon = cfg.icon
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
    >
      {Icon && <Icon size={10} />}
      {cfg.label}
    </span>
  )
}
