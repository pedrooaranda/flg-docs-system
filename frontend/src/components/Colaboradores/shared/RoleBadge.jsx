import { ROLE_CONFIG } from './constants'

// Badge com ícone pra role. Owner (coroa amarela), Admin (escudo dourado),
// Member (usuário cinza). Role nula/desconhecida cai pra dash ou texto capitalizado.
export default function RoleBadge({ role }) {
  const cfg = ROLE_CONFIG[role]
  if (!cfg) {
    if (!role) return <span className="text-[11px] text-white/40">—</span>
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
