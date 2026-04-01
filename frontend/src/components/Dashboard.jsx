import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Users, TrendingUp, PauseCircle, UserCheck, ArrowRight, Sparkles } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { Avatar } from './ui/Avatar'
import { StatusBadge } from './ui/Badge'
import { SkeletonCard } from './ui/Skeleton'
import { progressPercent, formatDate, isAdmin as checkAdmin } from '../lib/utils'

function MetricCard({ icon: Icon, label, value, sub, color = 'gold', delay = 0 }) {
  const colorMap = {
    gold:   { bg: 'rgba(201,168,76,0.08)',  border: 'rgba(201,168,76,0.2)',  icon: '#C9A84C' },
    green:  { bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)', icon: '#34D399' },
    yellow: { bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)', icon: '#FBBF24' },
    blue:   { bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)', icon: '#60A5FA' },
  }
  const c = colorMap[color]
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="card-flg p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-white/35 tracking-widest uppercase mb-2">{label}</p>
          <p className="font-display text-3xl font-bold text-white">{value}</p>
          {sub && <p className="text-xs text-white/30 mt-1">{sub}</p>}
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: c.bg, border: `1px solid ${c.border}` }}>
          <Icon size={16} style={{ color: c.icon }} />
        </div>
      </div>
    </motion.div>
  )
}

function RecentClientRow({ cliente, delay = 0 }) {
  const navigate = useNavigate()
  const pct = progressPercent(cliente.encontro_atual)

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay }}
      className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-colors"
      style={{ border: '1px solid transparent' }}
      onClick={() => navigate(`/clientes/${cliente.id}`)}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--flg-bg-hover)'
        e.currentTarget.style.borderColor = 'var(--flg-border)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = ''
        e.currentTarget.style.borderColor = 'transparent'
      }}
    >
      <Avatar name={cliente.nome} size="sm" className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white/85 truncate">{cliente.nome}</p>
          <StatusBadge status={cliente.status || 'ativo'} />
        </div>
        <p className="text-xs text-white/35 truncate">{cliente.empresa}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right hidden sm:block">
          <p className="text-xs text-gold-mid font-medium">E{cliente.encontro_atual || 1}/15</p>
          <div className="w-16 h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
            <div className="h-full rounded-full gold-gradient" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {cliente.updated_at && (
          <p className="text-[10px] text-white/20 hidden md:block w-20 text-right">{formatDate(cliente.updated_at)}</p>
        )}
        <button
          onClick={e => { e.stopPropagation(); navigate(`/clientes/${cliente.id}/encontro/${cliente.encontro_atual || 1}`) }}
          className="btn-gold text-[10px] py-1 px-3 flex-shrink-0"
        >
          Preparar
        </button>
      </div>
    </motion.div>
  )
}

export default function Dashboard({ session }) {
  const { clientes: allClientes, loading } = useApp()
  const navigate = useNavigate()

  const isAdmin   = checkAdmin(session?.user)
  const userEmail = session?.user?.email

  const myClientes = allClientes.filter(c => {
    if (isAdmin) return true
    return c.consultor_responsavel?.toLowerCase().includes(userEmail?.split('@')[0] || '')
  })

  const ativos      = myClientes.filter(c => (c.status || 'ativo') === 'ativo').length
  const pausados    = myClientes.filter(c => c.status === 'pausado').length
  const campanha    = myClientes.filter(c => c.encontro_atual >= 6 && c.encontro_atual <= 8).length
  const consultores = [...new Set(allClientes.map(c => c.consultor_responsavel).filter(Boolean))].length

  const recentes = [...myClientes]
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
    .slice(0, 5)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Boas-vindas */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-8"
      >
        <div className="w-9 h-9 rounded-xl gold-gradient flex items-center justify-center flex-shrink-0">
          <Sparkles size={15} className="text-[#080808]" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-white">
            Jornada System
          </h2>
          <p className="text-xs text-white/30">Founders Led Growth · visão geral</p>
        </div>
      </motion.div>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard icon={Users}       label="Clientes Ativos"    value={ativos}     sub={`${myClientes.length} total`} color="green"  delay={0}    />
        <MetricCard icon={TrendingUp}  label="Em Campanha Piloto" value={campanha}   sub="Encontros 6–8"               color="gold"   delay={0.05} />
        <MetricCard icon={PauseCircle} label="Pausados"           value={pausados}   sub="aguardando retorno"          color="yellow" delay={0.1}  />
        {isAdmin && <MetricCard icon={UserCheck} label="Consultores" value={consultores} sub="ativos" color="blue" delay={0.15} />}
      </div>

      {/* Recentes */}
      <div className="card-flg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-medium tracking-widest uppercase text-white/35">Atualizados recentemente</h3>
          <button
            onClick={() => navigate('/clientes')}
            className="flex items-center gap-1 text-xs text-gold-mid/70 hover:text-gold-mid transition-colors cursor-pointer"
          >
            Ver todos <ArrowRight size={11} />
          </button>
        </div>

        {loading && myClientes.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} className="h-14" />)}
          </div>
        ) : recentes.length === 0 ? (
          <p className="text-sm text-white/25 text-center py-8">Nenhum cliente ainda</p>
        ) : (
          <div className="space-y-1">
            {recentes.map((c, i) => (
              <RecentClientRow key={c.id} cliente={c} delay={i * 0.04} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
