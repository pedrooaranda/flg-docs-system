/**
 * Dashboard do FLG Comercial (/debriefings).
 *
 * Mostra SÓ clientes com status ClickUp RENOVADO — esses são os que demandam
 * debriefing oficial pra renovação. Status puxado direto do ClickUp pelo
 * endpoint /clientes/dashboard-comercial (cache 5min no backend).
 *
 * Cada card tem: badge de status colorido, nome+empresa, consultor responsável,
 * contador de percepções dos consultores já preenchidas.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Users, ChevronRight, FileText, Check,
  RefreshCw, AlertCircle, Building2, User,
} from 'lucide-react'
import { api } from '../../lib/api'

function StatusBadge({ raw, color }) {
  const tone = color || '#888'
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full uppercase"
      style={{
        color: tone,
        background: `${tone}1A`,
        border: `1px solid ${tone}55`,
      }}
    >
      {raw}
    </span>
  )
}

function MetricChip({ icon: Icon, value, label, tone }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border"
      style={{
        background: 'rgba(255,255,255,0.025)',
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: `${tone}1A`, color: tone }}
      >
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-white leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-white/40 mt-0.5">{label}</div>
      </div>
    </div>
  )
}

function ClienteCard({ cliente, onClick }) {
  const briefings = cliente.briefings_count || 0
  const hasBriefings = briefings > 0
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="card-flg p-5 text-left transition-all hover:scale-[1.01] hover:border-[#C9A84C]/40 group block w-full"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-white font-semibold truncate text-base">{cliente.nome}</h3>
          {cliente.empresa && (
            <div className="flex items-center gap-1.5 mt-0.5 text-white/45 text-xs truncate">
              <Building2 size={11} className="flex-shrink-0" />
              <span className="truncate">{cliente.empresa}</span>
            </div>
          )}
        </div>
        <StatusBadge raw={cliente.clickup_status} color={cliente.clickup_status_color} />
      </div>

      {cliente.consultor_responsavel && (
        <div className="flex items-center gap-1.5 mb-3 text-white/55 text-xs">
          <User size={11} className="text-white/35" />
          <span className="truncate">{cliente.consultor_responsavel}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div
          className="flex items-center gap-1.5 text-xs"
          style={{ color: hasBriefings ? '#34D399' : 'rgba(255,255,255,0.35)' }}
        >
          {hasBriefings ? <Check size={12} /> : <FileText size={12} />}
          <span>
            {hasBriefings
              ? `${briefings} percepção${briefings > 1 ? 'es' : ''} preenchida${briefings > 1 ? 's' : ''}`
              : 'Sem percepções ainda'}
          </span>
        </div>
        <ChevronRight size={14} className="text-white/25 group-hover:text-[#C9A84C] transition-colors" />
      </div>
    </motion.button>
  )
}

function CardSkeleton() {
  return (
    <div className="card-flg p-5 animate-pulse">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1">
          <div className="h-4 bg-white/5 rounded w-2/3 mb-2" />
          <div className="h-3 bg-white/5 rounded w-1/2" />
        </div>
        <div className="h-6 bg-white/5 rounded-full w-20" />
      </div>
      <div className="h-3 bg-white/5 rounded w-1/3 mb-3" />
      <div className="pt-3 border-t border-white/5">
        <div className="h-3 bg-white/5 rounded w-2/5" />
      </div>
    </div>
  )
}

export default function DebriefingsHome() {
  const [clientes, setClientes] = useState(null)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const navigate = useNavigate()

  async function load() {
    setError(null)
    try {
      const data = await api('/clientes/dashboard-comercial')
      setClientes(data || [])
    } catch (err) {
      setError(err?.message || 'Falha ao carregar clientes')
      setClientes([])
    }
  }

  useEffect(() => { load() }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setTimeout(() => setRefreshing(false), 400)
  }

  const counts = useMemo(() => {
    let total = 0
    let briefings = 0
    let comPercepcao = 0
    for (const cl of (clientes || [])) {
      total += 1
      const b = cl.briefings_count || 0
      briefings += b
      if (b > 0) comPercepcao += 1
    }
    return { total, briefings, comPercepcao, semPercepcao: total - comPercepcao }
  }, [clientes])

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div>
          <p className="text-[10px] tracking-[0.25em] uppercase font-bold mb-2" style={{ color: '#C9A84C' }}>
            FLG Comercial
          </p>
          <h1 className="font-display text-3xl font-bold text-white">Clientes a renovar</h1>
          <p className="text-white/45 text-sm mt-1">
            Clientes com status ClickUp <span className="text-white/65">Renovado</span>.
            Use as percepções dos consultores como insumo pro debriefing.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || clientes === null}
          className="flex items-center gap-2 text-xs text-white/55 hover:text-white/90 disabled:opacity-50 transition-colors px-3 py-2 rounded-lg border border-white/10"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Métricas */}
      {clientes && clientes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <MetricChip icon={Users}    value={counts.total}        label="Total"            tone="#C9A84C" />
          <MetricChip icon={Check}    value={counts.comPercepcao} label="Com percepção"    tone="#34D399" />
          <MetricChip icon={AlertCircle} value={counts.semPercepcao} label="Sem percepção" tone="#F87171" />
          <MetricChip icon={FileText} value={counts.briefings}    label="Percepções tot."  tone="#60A5FA" />
        </div>
      )}

      {/* Grid */}
      {error ? (
        <div className="card-flg p-6 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      ) : clientes === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : clientes.length === 0 ? (
        <div className="card-flg p-12 text-center">
          <Users size={32} className="mx-auto text-white/20 mb-3" />
          <p className="text-white/55 text-sm">
            Nenhum cliente com status Renovado no ClickUp.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clientes.map(c => (
            <ClienteCard key={c.id} cliente={c} onClick={() => navigate(`/debriefings/cliente/${c.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}
