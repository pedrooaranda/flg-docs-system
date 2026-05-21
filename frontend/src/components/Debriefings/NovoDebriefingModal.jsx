/**
 * Modal pra criar novo debriefing. Comercial preenche:
 *   - ciclo_numero (sugerido)
 *   - periodo_inicio / periodo_fim (default: últimos 6 meses)
 *   - clickup_list_id (opcional — backend tenta achar por nome)
 *   - drive_folder_id (opcional — backend busca por nome)
 *
 * Submit chama POST /debriefings (202 Accepted), dispara onCreated com id retornado.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, AlertCircle, Sparkles } from 'lucide-react'
import { api } from '../../lib/api'

const INPUT_CLASS = "w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white/90 placeholder:text-white/30 focus:outline-none focus:border-gold-mid/50 transition-colors"

function sixMonthsAgo() {
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return d.toISOString().slice(0, 10)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function NovoDebriefingModal({ cliente, cicloSugerido, onClose, onCreated }) {
  const [cicloNumero, setCicloNumero] = useState(cicloSugerido)
  const [periodoInicio, setPeriodoInicio] = useState(sixMonthsAgo())
  const [periodoFim, setPeriodoFim] = useState(today())
  const [clickupListId, setClickupListId] = useState('')
  const [driveFolderId, setDriveFolderId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!cliente?.id) {
      setError('Cliente não selecionado')
      return
    }
    if (new Date(periodoFim) < new Date(periodoInicio)) {
      setError('Período fim deve ser >= período início')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const resp = await api('/debriefings', {
        method: 'POST',
        body: JSON.stringify({
          cliente_id: cliente.id,
          ciclo_numero: cicloNumero,
          periodo_inicio: periodoInicio,
          periodo_fim: periodoFim,
          clickup_list_id: clickupListId.trim() || null,
          drive_folder_id: driveFolderId.trim() || null,
        }),
      })
      onCreated(resp.id)
    } catch (e) {
      setError(e.message || 'Erro ao criar debriefing')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl p-6"
        style={{
          background: 'var(--flg-bg-primary)',
          border: '1px solid var(--flg-border)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={14} className="text-gold-mid" />
              <p className="text-[10px] tracking-[0.25em] uppercase text-gold-mid/70 font-monodeck">
                Novo Debriefing
              </p>
            </div>
            <h2 className="font-serifdeck text-2xl text-white/95 leading-tight">
              Ciclo {cicloNumero} — {cliente?.nome}
            </h2>
            <p className="text-xs text-white/45 mt-1">
              {cliente?.empresa || '—'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/45 hover:text-white/85 transition-colors"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Ciclo + Período */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-white/45 font-monodeck mb-1.5 block">
                Ciclo
              </label>
              <input
                type="number"
                min={1}
                value={cicloNumero}
                onChange={e => setCicloNumero(parseInt(e.target.value) || 1)}
                className={INPUT_CLASS}
                required
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-white/45 font-monodeck mb-1.5 block">
                Início
              </label>
              <input
                type="date"
                value={periodoInicio}
                onChange={e => setPeriodoInicio(e.target.value)}
                className={INPUT_CLASS}
                required
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-white/45 font-monodeck mb-1.5 block">
                Fim
              </label>
              <input
                type="date"
                value={periodoFim}
                onChange={e => setPeriodoFim(e.target.value)}
                className={INPUT_CLASS}
                required
              />
            </div>
          </div>

          {/* ClickUp + Drive (opcionais) */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/45 font-monodeck mb-1.5 block">
              ClickUp List ID <span className="text-white/30 normal-case tracking-normal text-[11px]">(opcional — backend busca por nome)</span>
            </label>
            <input
              type="text"
              value={clickupListId}
              onChange={e => setClickupListId(e.target.value)}
              placeholder="ex: 901812345678"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/45 font-monodeck mb-1.5 block">
              Google Drive Folder ID <span className="text-white/30 normal-case tracking-normal text-[11px]">(opcional — busca por nome do cliente/empresa)</span>
            </label>
            <input
              type="text"
              value={driveFolderId}
              onChange={e => setDriveFolderId(e.target.value)}
              placeholder="ex: 1AbCdEfGhIjKlMnOpQ..."
              className={INPUT_CLASS}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg p-3 flex gap-2"
              style={{ background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)' }}>
              <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* Info */}
          <div className="rounded-lg p-3 text-xs text-white/55 leading-relaxed"
            style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.20)' }}>
            A geração leva ~60-90 segundos e consome cerca de R$3-12 em API. Você poderá acompanhar
            o progresso ao vivo após confirmar.
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white/60 hover:text-white/90 transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
              style={{
                background: 'rgba(201,168,76,0.18)',
                color: '#C9A84C',
                border: '1px solid rgba(201,168,76,0.45)',
              }}
            >
              {submitting ? 'Disparando…' : 'Gerar Debriefing'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
