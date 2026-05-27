/**
 * ClientCard — card visual de cliente na tela /clientes.
 *
 * Layout: status semáforo + encontro | avatar + nome + empresa |
 * progresso jornada | métricas IG (se conectado) | consultor + última atividade.
 *
 * Click no card abre /clientes/:id. Sem overlay com botões (causava bug do click).
 * Hover lift -2px + gold-tinted shadow. Tap feedback brief.
 */
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Users, BarChart3 } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { humanizeDate } from '../../lib/humanize-date'
import { progressPercent } from '../../lib/utils'

// Status semáforo baseado em status + dias_sem_postar
function getSemaforoColor(cliente) {
  if (cliente.status === 'pausado') return { color: '#FBBF24', label: 'Pausado' }   // amber
  if (cliente.status === 'concluido') return { color: '#6B7280', label: 'Encerrado' } // gray (edge)
  if ((cliente.dias_sem_postar ?? 0) > 7) return { color: '#EF4444', label: 'Alerta' }  // red
  return { color: '#10B981', label: 'Ativo' }   // green
}

function formatNumber(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function ClientCard({ cliente, delay = 0 }) {
  const navigate = useNavigate()
  const pct = progressPercent(cliente.encontro_atual || 1, 15)
  const semaforo = getSemaforoColor(cliente)
  const hasIG = cliente.instagram_conectado === true

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => navigate(`/clientes/${cliente.id}`)}
      className="card-flg p-5 cursor-pointer transition-shadow hover:shadow-[0_8px_24px_rgba(201,168,76,0.15)]"
    >
      {/* Linha 1: status semáforo + encontro */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: semaforo.color, boxShadow: `0 0 8px ${semaforo.color}80` }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: semaforo.color }}>
            {semaforo.label}
          </span>
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{
            background: 'rgba(201,168,76,0.15)',
            color: '#C9A84C',
            border: '1px solid rgba(201,168,76,0.25)',
          }}
        >
          E{cliente.encontro_atual || 1}
        </span>
      </div>

      {/* Linha 2: avatar + nome + empresa */}
      <div className="flex items-start gap-3 mb-4">
        <Avatar name={cliente.nome} size="md" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white/90 text-sm truncate">{cliente.nome}</p>
          {cliente.empresa && cliente.empresa !== cliente.nome && (
            <p className="text-xs text-white/40 truncate mt-0.5">{cliente.empresa}</p>
          )}
        </div>
      </div>

      {/* Linha 3: progresso jornada */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-xs text-white/30">
          <span>Jornada</span>
          <span>{cliente.encontro_atual || 1} / 15</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, delay: delay + 0.2, ease: 'easeOut' }}
            className="h-full rounded-full gold-gradient"
          />
        </div>
      </div>

      {/* Linha 4: métricas IG (só se conectado) */}
      {hasIG && (
        <div className="flex items-center gap-4 mb-3 text-xs">
          <span className="flex items-center gap-1 text-white/50">
            <Users size={12} />
            {formatNumber(cliente.seguidores_atual)}
          </span>
          <span className="flex items-center gap-1 text-white/50">
            <BarChart3 size={12} />
            {cliente.taxa_engajamento_pct != null ? `${cliente.taxa_engajamento_pct}%` : '—'}
          </span>
          {cliente.dias_sem_postar != null && (
            <span
              className="flex items-center gap-1"
              style={{
                color: cliente.dias_sem_postar > 7 ? '#EF4444' : cliente.dias_sem_postar > 3 ? '#FBBF24' : 'rgba(255,255,255,0.5)'
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
              {cliente.dias_sem_postar === 0 ? 'hoje' : `${cliente.dias_sem_postar}d`}
            </span>
          )}
        </div>
      )}

      {/* Linha 5: consultor + última atividade */}
      <div className="flex items-center justify-between text-xs">
        <p className="text-white/35 truncate flex-1 mr-2">{cliente.consultor_responsavel || '—'}</p>
        {cliente.updated_at && (
          <p className="text-white/25 flex-shrink-0">{humanizeDate(cliente.updated_at)}</p>
        )}
      </div>
    </motion.div>
  )
}
