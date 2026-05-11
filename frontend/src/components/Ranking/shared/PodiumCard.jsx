import { motion } from 'framer-motion'
import { Crown, Trophy, Medal } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'
import { formatCompact } from './formatters'

// Card de pódio — 1º/2º/3º lugar com altura escalonada no desktop (1º normal,
// 2º empurrado pra baixo, 3º mais embaixo) pra criar visual de pódio físico.
// Usado pelo Pódio Geral (aba Clientes — top 3 por engajamento).
//
// `rank` é 0/1/2 (índice posicional, mapeia em config).
// `metricsRender(item)` é opcional — caller decide quais 3 métricas mostrar
// no footer. Default = eng/audiência/posts (perfil cliente).
export default function PodiumCard({ rank, item, onClick, metricsRender }) {
  const config = [
    { color: '#FACC15', bg: 'rgba(250,204,21,0.10)', border: 'rgba(250,204,21,0.35)', label: '1º LUGAR', icon: Crown, height: 'lg:mt-0' },
    { color: '#CBD5E1', bg: 'rgba(203,213,225,0.10)', border: 'rgba(203,213,225,0.30)', label: '2º LUGAR', icon: Trophy, height: 'lg:mt-6' },
    { color: '#D97706', bg: 'rgba(217,119,6,0.10)', border: 'rgba(217,119,6,0.30)', label: '3º LUGAR', icon: Medal, height: 'lg:mt-12' },
  ][rank]
  const Icon = config.icon
  const defaultMetrics = (it) => [
    { label: 'Eng.', value: `${(it.taxa_engajamento || 0).toFixed(2)}%`, color: config.color },
    { label: 'Audiência', value: formatCompact(it.audiencia), color: 'rgba(255,255,255,0.85)' },
    { label: 'Posts/mês', value: `${it.posts_mes || 0}`, color: 'rgba(255,255,255,0.85)' },
  ]
  const metrics = (metricsRender || defaultMetrics)(item)
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
      onClick={onClick}
      className={`rounded-2xl p-5 cursor-pointer transition-transform hover:scale-[1.02] ${config.height}`}
      style={{
        background: `linear-gradient(135deg, ${config.bg}, rgba(0,0,0,0.2))`,
        border: `1px solid ${config.border}`,
        boxShadow: `0 0 32px ${config.bg}`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: config.color }}>
          {config.label}
        </span>
        <Icon size={20} style={{ color: config.color }} />
      </div>
      <div className="flex items-center gap-3 mb-4">
        <Avatar name={item.nome} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-white truncate">{item.nome}</p>
          <p className="text-[11px] text-white/45 truncate">{item.empresa || item.subline || '—'}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-3" style={{ borderTop: `1px solid ${config.border}` }}>
        {metrics.map((m, i) => (
          <div key={i}>
            <p className="text-[9px] text-white/35 uppercase tracking-wider">{m.label}</p>
            <p className="text-sm font-bold mt-0.5" style={{ color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
