import { motion } from 'framer-motion'
import { Trophy, Crown } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'

// Card de destaque por categoria — top 3 com #1 grande no topo + #2/#3 abaixo.
// Usado tanto pela aba Clientes (categoria.sortKey lê do cliente) quanto pela
// aba Consultores futuramente (com categorias de consultor).
//
// `categoria` shape: { key, label, sortKey, icon, color, glow, formatValue, legendaUnidade, extraKey?, extraFormat? }
// `ranking` é array de itens (clientes ou consultores) — ordenamos aqui dentro.
// `getDisplayInfo(item)` retorna { nome, subline } pra abstrair "cliente.nome/empresa"
//   vs "consultor.nome/clientes_count". Default: nome+empresa (aba clientes).
// `onClick(item)` recebe o item clicado (winner do card).
export default function DestaqueCard({ categoria, ranking, onClick, getDisplayInfo }) {
  const Icon = categoria.icon
  const sorted = [...ranking].sort((a, b) => (b[categoria.sortKey] || 0) - (a[categoria.sortKey] || 0)).slice(0, 3)
  if (sorted.length === 0) return null
  const winner = sorted[0]
  const others = sorted.slice(1)
  const display = getDisplayInfo || ((item) => ({ nome: item.nome, subline: item.empresa || '—' }))
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl p-5 cursor-pointer relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${categoria.color}10 0%, rgba(0,0,0,0.3) 60%)`,
        border: `1px solid ${categoria.color}40`,
        boxShadow: `0 0 32px ${categoria.glow}`,
      }}
      onClick={() => onClick(winner)}
    >
      <div
        className="absolute pointer-events-none"
        style={{
          top: -40,
          right: -40,
          width: 120,
          height: 120,
          background: `radial-gradient(circle, ${categoria.color}30 0%, transparent 70%)`,
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <div
            className="rounded-xl flex items-center justify-center shrink-0"
            style={{
              width: 36, height: 36,
              background: `${categoria.color}25`,
              border: `1px solid ${categoria.color}50`,
            }}
          >
            <Icon size={18} style={{ color: categoria.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-bold tracking-widest uppercase" style={{ color: categoria.color }}>
              Troféu
            </p>
            <p className="text-xs font-semibold text-white/85">{categoria.label}</p>
          </div>
          <Trophy size={14} style={{ color: categoria.color, opacity: 0.45 }} />
        </div>

        <div className="mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative">
              <Avatar name={display(winner).nome} size="md" />
              <div
                className="absolute -bottom-1 -right-1 rounded-full flex items-center justify-center"
                style={{
                  width: 18, height: 18,
                  background: categoria.color,
                  border: '2px solid var(--flg-bg-secondary)',
                }}
              >
                <Crown size={9} className="text-[#080808]" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{display(winner).nome}</p>
              <p className="text-[10px] text-white/40 truncate">{display(winner).subline}</p>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums" style={{ color: categoria.color }}>
              {categoria.formatValue(winner[categoria.sortKey])}
            </span>
            {categoria.extraKey && winner[categoria.extraKey] != null && (
              <span className="text-xs font-semibold" style={{ color: categoria.color, opacity: 0.7 }}>
                {categoria.extraFormat(winner[categoria.extraKey])}
              </span>
            )}
          </div>
          <p className="text-[10px] text-white/35 mt-0.5">{categoria.legendaUnidade}</p>
        </div>

        {others.length > 0 && (
          <div className="space-y-2 pt-3" style={{ borderTop: `1px solid ${categoria.color}20` }}>
            {others.map((c, i) => (
              <div key={c.cliente_id || c.nome} className="flex items-center gap-2">
                <span className="text-[10px] font-bold w-4 text-center" style={{ color: i === 0 ? '#CBD5E1' : '#D97706' }}>
                  #{i + 2}
                </span>
                <Avatar name={display(c).nome} size="sm" />
                <p className="flex-1 text-[11px] text-white/65 truncate">{display(c).nome}</p>
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: categoria.color, opacity: 0.85 }}>
                  {categoria.formatValue(c[categoria.sortKey])}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
