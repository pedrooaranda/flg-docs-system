/**
 * Hub de Debriefings de um cliente.
 *
 * Lista histórico (Ciclo 1, 2, 3...) + botão "Novo debriefing" que abre modal.
 * Cards mostram status (gerando / pronto / falhou), data, consultor responsável.
 *
 * Click num debriefing pronto → /clientes/:id/debriefings/:debriefingId (viewer).
 * Click num "gerando" → modal de progresso SSE.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  FileText, Plus, Sparkles, Clock, CheckCircle2, AlertCircle, ChevronRight,
  Download, Loader2, PenTool,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../contexts/AppContext'
import NovoDebriefingModal from './NovoDebriefingModal'
import StreamPanel from './StreamPanel'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}

function formatPeriodo(inicio, fim) {
  return `${formatDate(inicio)} → ${formatDate(fim)}`
}

function StatusBadge({ status }) {
  const config = {
    gerando: { Icon: Loader2, color: '#FBBF24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.30)', label: 'Gerando', spin: true },
    pronto:  { Icon: CheckCircle2, color: '#34D399', bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.30)', label: 'Pronto' },
    falhou:  { Icon: AlertCircle, color: '#F87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.30)', label: 'Falhou' },
  }[status] || { Icon: AlertCircle, color: '#888', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.10)', label: status }

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full uppercase font-monodeck"
      style={{ background: config.bg, color: config.color, border: `1px solid ${config.border}` }}
    >
      <config.Icon size={11} className={config.spin ? 'animate-spin' : ''} />
      {config.label}
    </span>
  )
}

function DebriefingCard({ debriefing, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={() => onClick(debriefing)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="text-left rounded-xl p-5 transition-all w-full group"
      style={{
        background: 'var(--flg-bg-raised)',
        border: '1px solid var(--flg-border)',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.4)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--flg-border)' }}
    >
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="rounded-xl flex flex-col items-center justify-center flex-shrink-0"
            style={{
              width: 48, height: 48,
              background: 'rgba(201,168,76,0.10)',
              border: '1px solid rgba(201,168,76,0.30)',
            }}
          >
            <span className="text-[8px] font-bold tracking-wider uppercase font-monodeck" style={{ color: '#C9A84C' }}>
              Ciclo
            </span>
            <span className="text-lg font-bold leading-none font-monodeck" style={{ color: '#FACC15' }}>
              {debriefing.ciclo_numero}
            </span>
          </div>
          <div className="min-w-0">
            <h3 className="font-serifdeck text-base font-medium text-white/95 truncate">
              Ciclo {debriefing.ciclo_numero}
            </h3>
            <p className="text-[11px] text-white/45 truncate">
              {formatPeriodo(debriefing.periodo_inicio, debriefing.periodo_fim)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <StatusBadge status={debriefing.status} />
          {(debriefing.consultor_perspectiva_text || debriefing.consultor_perspectiva_storage_path) && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full uppercase font-monodeck"
              style={{
                background: 'rgba(168,85,247,0.10)',
                color: '#A855F7',
                border: '1px solid rgba(168,85,247,0.30)',
              }}
            >
              <PenTool size={10} /> com perspectiva
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-3" style={{ borderTop: '1px solid var(--flg-border)' }}>
        <div>
          <p className="text-[9px] text-white/35 uppercase tracking-wider">Tasks</p>
          <p className="text-sm font-bold text-white/85 mt-0.5 tabular-nums">{debriefing.num_tasks_clickup ?? '—'}</p>
        </div>
        <div>
          <p className="text-[9px] text-white/35 uppercase tracking-wider">Docs</p>
          <p className="text-sm font-bold text-white/85 mt-0.5 tabular-nums">{debriefing.num_docs_drive ?? '—'}</p>
        </div>
        <div>
          <p className="text-[9px] text-white/35 uppercase tracking-wider">Custo</p>
          <p className="text-sm font-bold text-gold-mid mt-0.5 tabular-nums">
            {debriefing.custo_usd != null ? `$${Number(debriefing.custo_usd).toFixed(2)}` : '—'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 text-[10px] text-white/40">
        <span>Gerado em {formatDate(debriefing.gerado_at)} · {debriefing.gerado_por_email || '—'}</span>
        <ChevronRight size={12} className="opacity-50 group-hover:opacity-100 group-hover:text-gold-mid transition-all" />
      </div>
    </motion.button>
  )
}

export default function DebriefingsHub() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const { clientes } = useApp()
  const cliente = clientes?.find(c => c.id === clientId)

  const [debriefings, setDebriefings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [streamingId, setStreamingId] = useState(null)

  async function loadDebriefings() {
    setLoading(true)
    setError(null)
    try {
      const { debriefings: lista } = await api(`/debriefings?cliente_id=${clientId}`)
      setDebriefings(lista || [])
    } catch (e) {
      setError(e.message || 'Erro ao carregar debriefings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDebriefings()
  }, [clientId])

  function handleNovoDebriefingCreated(novoId) {
    setModalOpen(false)
    setStreamingId(novoId)
    loadDebriefings()
  }

  function handleStreamDone() {
    setStreamingId(null)
    loadDebriefings()
  }

  function handleClick(debriefing) {
    if (debriefing.status === 'gerando') {
      setStreamingId(debriefing.id)
    } else {
      navigate(`/clientes/${clientId}/debriefings/${debriefing.id}`)
    }
  }

  const nextCiclo = (debriefings.reduce((max, d) => Math.max(max, d.ciclo_numero || 0), 0)) + 1

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="pb-5 space-y-3"
        style={{ borderBottom: '1px solid var(--flg-border)' }}
      >
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-gold-mid" />
          <p className="text-[10px] tracking-[0.25em] uppercase text-gold-mid/70 font-monodeck">
            Debriefings Estratégicos · {cliente?.nome || 'Cliente'}
          </p>
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serifdeck text-3xl lg:text-4xl font-medium text-white leading-tight">
              Histórico de Ciclos
            </h1>
            <p className="text-sm text-white/55 mt-2 max-w-xl">
              Compilados estratégicos automáticos do ciclo anterior, gerados a partir de ClickUp + Google Drive.
              Use ao renovar contrato pra alinhar o próximo ciclo.
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            disabled={!cliente}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(201,168,76,0.18)',
              color: '#C9A84C',
              border: '1px solid rgba(201,168,76,0.45)',
            }}
          >
            <Plus size={12} /> Novo Debriefing
          </button>
        </div>
      </motion.div>

      {/* Stream panel ativo quando há debriefing gerando */}
      {streamingId && (
        <StreamPanel
          debriefingId={streamingId}
          onDone={handleStreamDone}
          onCancel={() => setStreamingId(null)}
        />
      )}

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl h-32 animate-pulse"
              style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }} />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl p-6 text-center"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}>
          <AlertCircle size={20} className="text-red-400 mx-auto mb-2" />
          <p className="text-sm text-white/75">{error}</p>
        </div>
      ) : debriefings.length === 0 ? (
        <div className="rounded-xl p-12 text-center"
          style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
          <Sparkles size={28} className="text-gold-mid/60 mx-auto mb-3" />
          <h3 className="font-serifdeck text-lg text-white/85 mb-2">Nenhum debriefing ainda</h3>
          <p className="text-sm text-white/50 max-w-md mx-auto">
            Quando este cliente renovar, gere o debriefing do ciclo anterior aqui pra compilar tudo
            que foi entregue, conversado e produzido em ClickUp e Google Drive.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {debriefings.map(d => (
            <DebriefingCard key={d.id} debriefing={d} onClick={handleClick} />
          ))}
        </div>
      )}

      {/* Modal de criação */}
      {modalOpen && (
        <NovoDebriefingModal
          cliente={cliente}
          cicloSugerido={nextCiclo}
          onClose={() => setModalOpen(false)}
          onCreated={handleNovoDebriefingCreated}
        />
      )}
    </div>
  )
}
