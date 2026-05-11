import { motion } from 'framer-motion'
import { Crown, Trophy, Medal, Award } from 'lucide-react'
import { formatCompact } from './formatters'

// Card resumido do consultor — usado hoje na seção "Consultores do mês"
// (4 cards no rodapé da aba Clientes). Pode ser substituído na Phase 3 por
// um pódio + tabela full na aba Consultores; por ora mantemos a paridade.
//
// `consultor` shape (calculado client-side em RankingClientes): { nome, rank, numClientes, engMedio, audienciaTotal }.
export default function ConsultorCard({ consultor, delay }) {
  const palette = [
    { color: '#FACC15', icon: Crown },
    { color: '#CBD5E1', icon: Trophy },
    { color: '#D97706', icon: Medal },
    { color: '#60A5FA', icon: Award },
  ]
  const cfg = palette[consultor.rank] || palette[3]
  const Icon = cfg.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-xl p-4"
      style={{
        background: consultor.rank < 3
          ? `linear-gradient(135deg, ${cfg.color}15, rgba(0,0,0,0.2))`
          : 'var(--flg-bg-raised)',
        border: `1px solid ${consultor.rank < 3 ? cfg.color + '40' : 'var(--flg-border)'}`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: cfg.color }}>
          {consultor.rank === 0 ? 'CONSULTOR DESTAQUE' : `#${consultor.rank + 1}`}
        </span>
        <Icon size={16} style={{ color: cfg.color }} />
      </div>
      <p className="text-sm font-bold text-white/90 truncate mb-1">{consultor.nome}</p>
      <p className="text-[11px] text-white/45 mb-3">{consultor.numClientes} clientes</p>
      <div className="grid grid-cols-2 gap-2 pt-3" style={{ borderTop: `1px solid ${cfg.color}25` }}>
        <div>
          <p className="text-[9px] text-white/35 uppercase tracking-wider">Eng. médio</p>
          <p className="text-sm font-bold mt-0.5" style={{ color: cfg.color }}>
            {consultor.engMedio.toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="text-[9px] text-white/35 uppercase tracking-wider">Audiência total</p>
          <p className="text-sm font-bold text-white/85 mt-0.5">{formatCompact(consultor.audienciaTotal)}</p>
        </div>
      </div>
    </motion.div>
  )
}
