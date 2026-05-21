/**
 * Painel de progresso ao vivo (SSE) durante a geração de um debriefing.
 *
 * Recebe debriefingId, abre o stream GET /debriefings/:id/stream, mostra
 * cada fase com seu status (pendente / em andamento / concluída / erro).
 * Quando recebe evento 'done' ou 'error', dispara onDone.
 */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Loader2, CheckCircle2, Circle, AlertCircle, Sparkles, X,
} from 'lucide-react'
import { apiStreamGet } from '../../lib/api'

const FASES = [
  { num: 1, label: 'Extraindo ClickUp', detalhe: 'tasks + comentários + status' },
  { num: 2, label: 'Extraindo Google Drive', detalhe: 'PEs, scripts, manifestos, relatórios' },
  { num: 3, label: 'Analisando com Claude', detalhe: 'reconstrução estratégica + recomendações' },
  { num: 4, label: 'Gerando PDF', detalhe: 'render + upload Supabase Storage' },
]

function FaseRow({ fase, status, detalhe, extraInfo }) {
  const IconByStatus = {
    pendente: Circle,
    rodando: Loader2,
    pronto: CheckCircle2,
    erro: AlertCircle,
  }[status] || Circle

  const colorByStatus = {
    pendente: 'rgba(255,255,255,0.25)',
    rodando: '#FBBF24',
    pronto: '#34D399',
    erro: '#F87171',
  }[status] || 'rgba(255,255,255,0.25)'

  return (
    <div className="flex items-center gap-3 py-2">
      <IconByStatus
        size={14}
        className={status === 'rodando' ? 'animate-spin flex-shrink-0' : 'flex-shrink-0'}
        style={{ color: colorByStatus }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white/85">{fase.label}</p>
        <p className="text-[10px] text-white/35">{detalhe || fase.detalhe}</p>
      </div>
      {extraInfo && (
        <span className="text-[10px] text-gold-mid/70 font-monodeck tabular-nums">{extraInfo}</span>
      )}
    </div>
  )
}

export default function StreamPanel({ debriefingId, onDone, onCancel }) {
  const [faseStatus, setFaseStatus] = useState({ 1: 'pendente', 2: 'pendente', 3: 'pendente', 4: 'pendente' })
  const [faseInfo, setFaseInfo] = useState({})
  const [erro, setErro] = useState(null)
  const [completo, setCompleto] = useState(false)
  const abortRef = useRef(new AbortController())

  useEffect(() => {
    let cancelled = false

    apiStreamGet(
      `/debriefings/${debriefingId}/stream`,
      (event) => {
        if (cancelled) return
        const { type, data } = event
        const phase = data?.phase

        if (type === 'phase_start' && phase) {
          setFaseStatus(prev => ({ ...prev, [phase]: 'rodando' }))
        } else if (type === 'phase_progress' && phase) {
          if (data?.chars) {
            setFaseInfo(prev => ({ ...prev, [phase]: `${(data.chars / 1024).toFixed(1)}KB` }))
          }
        } else if (type === 'phase_done' && phase) {
          setFaseStatus(prev => ({ ...prev, [phase]: 'pronto' }))
          const info = []
          if (data?.num_tasks != null) info.push(`${data.num_tasks} tasks`)
          if (data?.num_docs != null) info.push(`${data.num_docs} docs`)
          if (data?.tokens_input) info.push(`${(data.tokens_input / 1000).toFixed(1)}K in`)
          if (data?.tokens_output) info.push(`${(data.tokens_output / 1000).toFixed(1)}K out`)
          if (info.length) setFaseInfo(prev => ({ ...prev, [phase]: info.join(' · ') }))
        } else if (type === 'error') {
          setErro(data?.erro || 'Erro desconhecido')
          // Marca fase em rodando como erro
          setFaseStatus(prev => {
            const next = { ...prev }
            for (const k of Object.keys(next)) {
              if (next[k] === 'rodando') next[k] = 'erro'
            }
            return next
          })
        } else if (type === 'done' || type === 'complete') {
          setCompleto(true)
          setTimeout(() => onDone?.(), 800)
        }
      },
      abortRef.current.signal,
    ).catch(e => {
      if (!cancelled && e.name !== 'AbortError') {
        setErro(e.message || 'Conexão SSE caiu')
      }
    })

    return () => {
      cancelled = true
      abortRef.current.abort()
    }
  }, [debriefingId])

  function handleClose() {
    abortRef.current.abort()
    onCancel?.()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-5"
      style={{
        background: completo ? 'rgba(52,211,153,0.06)' : 'rgba(201,168,76,0.06)',
        border: `1px solid ${completo ? 'rgba(52,211,153,0.30)' : 'rgba(201,168,76,0.30)'}`,
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              width: 40, height: 40,
              background: 'rgba(201,168,76,0.15)',
              border: '1px solid rgba(201,168,76,0.35)',
            }}
          >
            <Sparkles size={16} className={completo ? 'text-emerald-400' : 'text-gold-mid animate-pulse'} />
          </div>
          <div>
            <p className="text-[10px] tracking-[0.25em] uppercase text-gold-mid/70 font-monodeck">
              {erro ? 'Falhou' : completo ? 'Concluído' : 'Gerando debriefing'}
            </p>
            <h3 className="font-serifdeck text-base text-white/95">
              {erro ? 'Algo deu errado durante a geração' : completo ? 'Debriefing pronto' : 'Acompanhando progresso...'}
            </h3>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="text-white/40 hover:text-white/85 transition-colors"
          type="button"
        >
          <X size={16} />
        </button>
      </div>

      {/* Fases */}
      <div className="space-y-1 pl-1">
        {FASES.map(fase => (
          <FaseRow
            key={fase.num}
            fase={fase}
            status={faseStatus[fase.num]}
            extraInfo={faseInfo[fase.num]}
          />
        ))}
      </div>

      {erro && (
        <div className="mt-3 rounded-lg p-3 text-xs text-red-300"
          style={{ background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)' }}>
          {erro}
        </div>
      )}
    </motion.div>
  )
}
