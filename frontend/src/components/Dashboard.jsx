import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, Plus, Users, TrendingUp, Calendar, UserCheck, Filter } from 'lucide-react'
import { api } from '../lib/api'
import { Avatar } from './ui/Avatar'
import { StatusBadge, Badge } from './ui/Badge'
import { SkeletonCard } from './ui/Skeleton'
import { progressPercent, formatDate } from '../lib/utils'

function MetricCard({ icon: Icon, label, value, sub, delay = 0 }) {
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
        <div className="w-9 h-9 rounded-lg bg-gold-mid/10 border border-gold-mid/20 flex items-center justify-center">
          <Icon size={16} className="text-gold-mid" />
        </div>
      </div>
    </motion.div>
  )
}

function ClientCard({ cliente, onClick, delay = 0 }) {
  const pct = progressPercent(cliente.encontro_atual)
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      onClick={onClick}
      className="card-flg-hover p-5 text-left w-full"
    >
      <div className="flex items-start gap-3 mb-4">
        <Avatar name={cliente.nome} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white/90 text-sm truncate">{cliente.nome}</p>
            <StatusBadge status={cliente.status || 'ativo'} />
          </div>
          <p className="text-xs text-white/40 truncate mt-0.5">{cliente.empresa}</p>
        </div>
        <Badge variant="gold" className="flex-shrink-0 text-xs font-bold">
          E{cliente.encontro_atual || 1}
        </Badge>
      </div>

      <div className="space-y-2">
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

      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-white/25">{cliente.consultor_responsavel}</p>
        {cliente.updated_at && (
          <p className="text-[10px] text-white/20">{formatDate(cliente.updated_at)}</p>
        )}
      </div>
    </motion.button>
  )
}

export default function Dashboard({ session }) {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('todos')
  const [filterConsultor, setFilterConsultor] = useState('todos')
  const navigate = useNavigate()

  const isAdmin = session?.user?.email?.includes('pedro') || session?.user?.user_metadata?.role === 'admin'
  const userEmail = session?.user?.email

  useEffect(() => {
    api('/clientes').then(data => { setClientes(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const consultores = [...new Set(clientes.map(c => c.consultor_responsavel).filter(Boolean))]

  const filtered = clientes.filter(c => {
    const matchSearch = !search ||
      c.nome?.toLowerCase().includes(search.toLowerCase()) ||
      c.empresa?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'todos' || (c.status || 'ativo') === filterStatus
    const matchConsultor = filterConsultor === 'todos' || c.consultor_responsavel === filterConsultor
    const matchOwner = isAdmin || c.consultor_responsavel_email === userEmail || c.consultor_responsavel?.toLowerCase().includes(userEmail?.split('@')[0] || '')
    return matchSearch && matchStatus && matchConsultor && matchOwner
  })

  const ativos = clientes.filter(c => (c.status || 'ativo') === 'ativo').length
  const campanha = clientes.filter(c => c.encontro_atual >= 6 && c.encontro_atual <= 8).length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Metrics — admin only */}
      {isAdmin && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard icon={Users}     label="Clientes Ativos"  value={ativos}            sub={`${clientes.length} total`}            delay={0} />
          <MetricCard icon={TrendingUp} label="Em Campanha Piloto" value={campanha}         sub="Encontros 6–8"                         delay={0.05} />
          <MetricCard icon={UserCheck} label="Consultores"       value={consultores.length} sub="ativos"                               delay={0.1} />
          <MetricCard icon={Calendar}  label="Total Encontros"   value={clientes.reduce((a, c) => a + (c.encontro_atual || 1) - 1, 0)} sub="realizados" delay={0.15} />
        </div>
      )}

      {/* Header + actions */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">
            {isAdmin ? 'Todos os Clientes' : 'Meus Clientes'}
          </h2>
          <p className="text-sm text-white/30 mt-0.5">
            {filtered.length} founder{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => navigate('/clientes/novo')}
            className="btn-gold flex items-center gap-2"
          >
            <Plus size={14} />
            Novo Cliente
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou empresa…"
            className="input-flg pl-9"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="input-flg w-auto pr-8 cursor-pointer"
        >
          <option value="todos">Todos os status</option>
          <option value="ativo">Ativos</option>
          <option value="pausado">Pausados</option>
          <option value="inativo">Inativos</option>
        </select>
        {isAdmin && (
          <select
            value={filterConsultor}
            onChange={e => setFilterConsultor(e.target.value)}
            className="input-flg w-auto pr-8 cursor-pointer"
          >
            <option value="todos">Todos os consultores</option>
            {consultores.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-white/3 border border-white/8 flex items-center justify-center mb-4">
            <Users size={24} className="text-white/20" />
          </div>
          <p className="text-white/40 text-sm">Nenhum cliente encontrado</p>
          {search && <p className="text-white/20 text-xs mt-1">Tente ajustar a busca</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c, i) => (
            <ClientCard
              key={c.id}
              cliente={c}
              delay={i * 0.04}
              onClick={() => navigate(`/clientes/${c.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
