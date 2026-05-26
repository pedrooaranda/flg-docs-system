/**
 * Modal pra criar novo debriefing. Comercial preenche:
 *   - ciclo_numero (sugerido)
 *   - periodo_inicio / periodo_fim (default: últimos 6 meses)
 *   - clickup_list_id (opcional — backend tenta achar por nome)
 *   - drive_folder_id (opcional — backend busca por nome)
 *   - Perspectiva do Consultor (opcional — texto OU arquivo PDF/DOCX/MD/TXT)
 *
 * Submit chama POST /debriefings (202 Accepted):
 *   - sem perspectiva ou só texto → JSON (api helper)
 *   - com arquivo                 → multipart/form-data (createDebriefingMultipart)
 * Dispara onCreated com id retornado.
 */

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, AlertCircle, Sparkles, PenTool, Type, Paperclip, Trash2, Calendar, Loader2 } from 'lucide-react'
import { api, createDebriefingMultipart } from '../../lib/api'

const INPUT_CLASS = "w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white/90 placeholder:text-white/30 focus:outline-none focus:border-gold-mid/50 transition-colors"

const PERSPECTIVA_MAX_TEXT_CHARS = 50000
const PERSPECTIVA_MAX_BYTES = 5 * 1024 * 1024 // 5MB
const PERSPECTIVA_ALLOWED_EXTS = ['pdf', 'docx', 'md', 'txt']

function sixMonthsAgo() {
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return d.toISOString().slice(0, 10)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function countWords(text) {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function fileExt(name) {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return name.slice(dot + 1).toLowerCase()
}

function formatCicloDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
  } catch {
    return iso.slice(0, 7)
  }
}

export default function NovoDebriefingModal({ cliente, cicloSugerido, onClose, onCreated }) {
  const [cicloNumero, setCicloNumero] = useState(cicloSugerido)
  const [periodoInicio, setPeriodoInicio] = useState(sixMonthsAgo())
  const [periodoFim, setPeriodoFim] = useState(today())
  const [clickupListId, setClickupListId] = useState('')
  const [driveFolderId, setDriveFolderId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Lista dinâmica de ciclos do Drive
  const [ciclos, setCiclos] = useState([])
  const [loadingCiclos, setLoadingCiclos] = useState(false)
  const [ciclosWarning, setCiclosWarning] = useState(null)

  // Perspectiva do Consultor (opcional)
  const [perspectivaMode, setPerspectivaMode] = useState(null) // null | 'text' | 'file'
  const [perspectivaText, setPerspectivaText] = useState('')
  const [perspectivaFile, setPerspectivaFile] = useState(null) // File object

  // Carrega ciclos do Drive ao montar
  useEffect(() => {
    if (!cliente?.id) return
    setLoadingCiclos(true)
    setCiclosWarning(null)
    api(`/debriefings/clientes/${cliente.id}/ciclos`)
      .then(resp => {
        setCiclos(resp.ciclos || [])
        if (resp.warning) setCiclosWarning(resp.warning)
        // Auto-seleciona o ciclo anterior (penúltimo) ou único se houver só 1
        const lista = resp.ciclos || []
        if (lista.length > 1) {
          // Default: ciclo concluído anterior ao atual (penúltimo cronológico)
          const anterior = lista[lista.length - 2]
          if (anterior) {
            setCicloNumero(anterior.ciclo_numero)
            // Preenche datas do ciclo (createdTime → ~6 meses depois)
            if (anterior.created_time) {
              const start = new Date(anterior.created_time)
              const end = new Date(start)
              end.setMonth(end.getMonth() + 6)
              setPeriodoInicio(start.toISOString().slice(0, 10))
              setPeriodoFim(end.toISOString().slice(0, 10))
            }
          }
        } else if (lista.length === 1) {
          setCicloNumero(lista[0].ciclo_numero)
        }
      })
      .catch(e => setCiclosWarning(e.message || 'Erro ao carregar ciclos'))
      .finally(() => setLoadingCiclos(false))
  }, [cliente?.id])

  function selectCiclo(c) {
    setCicloNumero(c.ciclo_numero)
    if (c.created_time) {
      const start = new Date(c.created_time)
      const end = new Date(start)
      end.setMonth(end.getMonth() + 6)
      setPeriodoInicio(start.toISOString().slice(0, 10))
      setPeriodoFim(end.toISOString().slice(0, 10))
    }
  }

  function selectPerspectivaMode(mode) {
    if (perspectivaMode === mode) {
      // Toggle off
      setPerspectivaMode(null)
      setPerspectivaText('')
      setPerspectivaFile(null)
      return
    }
    setPerspectivaMode(mode)
    // Limpa o estado do outro modo ao trocar
    if (mode === 'text') {
      setPerspectivaFile(null)
    } else if (mode === 'file') {
      setPerspectivaText('')
    }
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const ext = fileExt(f.name)
    if (!PERSPECTIVA_ALLOWED_EXTS.includes(ext)) {
      setError(`Extensão .${ext || '?'} não aceita. Use: ${PERSPECTIVA_ALLOWED_EXTS.map(x => '.' + x).join(', ')}.`)
      e.target.value = ''
      return
    }
    if (f.size > PERSPECTIVA_MAX_BYTES) {
      setError(`Arquivo excede 5MB (tem ${formatFileSize(f.size)}).`)
      e.target.value = ''
      return
    }
    setError(null)
    setPerspectivaFile(f)
  }

  function removePerspectivaFile() {
    setPerspectivaFile(null)
  }

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

    // Resolve perspectiva
    const trimmedText = perspectivaText.trim()
    const hasText = perspectivaMode === 'text' && trimmedText.length > 0
    const hasFile = perspectivaMode === 'file' && perspectivaFile != null

    if (hasText && trimmedText.length > PERSPECTIVA_MAX_TEXT_CHARS) {
      setError(`Perspectiva (texto) excede ${PERSPECTIVA_MAX_TEXT_CHARS} caracteres.`)
      return
    }

    setSubmitting(true)
    setError(null)

    const basePayload = {
      cliente_id: cliente.id,
      ciclo_numero: cicloNumero,
      periodo_inicio: periodoInicio,
      periodo_fim: periodoFim,
      clickup_list_id: clickupListId.trim() || null,
      drive_folder_id: driveFolderId.trim() || null,
    }

    try {
      let resp
      if (hasFile) {
        // multipart/form-data — backend extrai texto via Docling
        resp = await createDebriefingMultipart(basePayload, perspectivaFile)
      } else {
        // JSON puro — perspectiva opcional como campo de texto
        const payload = { ...basePayload }
        if (hasText) payload.consultor_perspectiva_text = trimmedText
        resp = await api('/debriefings', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }
      onCreated(resp.id)
    } catch (e) {
      setError(e.message || 'Erro ao criar debriefing')
      setSubmitting(false)
    }
  }

  const wordCount = countWords(perspectivaText)
  const charCount = perspectivaText.length

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
        className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
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
          {/* Ciclo — botões dinâmicos do Drive */}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-white/45 font-monodeck mb-1.5 block flex items-center gap-2">
              <Calendar size={11} />
              Ciclo
              {loadingCiclos && <Loader2 size={11} className="animate-spin text-gold-mid" />}
            </label>

            {loadingCiclos ? (
              <div className="text-xs text-white/40 py-2">Carregando ciclos do Drive…</div>
            ) : ciclos.length === 0 ? (
              <div className="space-y-2">
                <input
                  type="number"
                  min={1}
                  value={cicloNumero}
                  onChange={e => setCicloNumero(parseInt(e.target.value) || 1)}
                  className={INPUT_CLASS}
                  required
                />
                {ciclosWarning && (
                  <p className="text-[11px] text-orange-300">⚠ {ciclosWarning}</p>
                )}
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {ciclos.map(c => {
                  const ativo = c.ciclo_numero === cicloNumero
                  const label = `CICLO ${String(c.ciclo_numero).padStart(2, '0')}`
                  const sub = c.created_time ? formatCicloDate(c.created_time) : c.name
                  return (
                    <button
                      key={c.ciclo_numero}
                      type="button"
                      onClick={() => selectCiclo(c)}
                      className="inline-flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg text-left transition-all"
                      style={ativo ? {
                        background: 'rgba(201,168,76,0.18)',
                        border: '1px solid rgba(201,168,76,0.50)',
                        color: '#FACC15',
                      } : {
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        color: 'rgba(255,255,255,0.65)',
                      }}
                    >
                      <span className="text-[11px] font-bold font-monodeck flex items-center gap-1.5">
                        {label}
                        {c.is_current && (
                          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(52,211,153,0.15)', color: '#34D399' }}>
                            atual
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-white/45">{sub}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {ciclos.length > 1 && (
              <p className="text-[10px] text-white/40 mt-2 italic">
                Debriefing é gerado pro ciclo concluído (anterior ao atual). O ciclo
                ATUAL fica disponível mas use só pra debriefings mid-cycle.
              </p>
            )}
          </div>

          {/* Período (auto-preenche ao clicar num ciclo) */}
          <div className="grid grid-cols-2 gap-3">
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

          {/* Perspectiva do Consultor (opcional) */}
          <div
            className="rounded-lg p-4 space-y-3"
            style={{
              background: 'rgba(168,85,247,0.04)',
              border: '1px solid rgba(168,85,247,0.20)',
            }}
          >
            <div className="flex items-start gap-2">
              <PenTool size={14} style={{ color: '#A855F7' }} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] tracking-[0.25em] uppercase font-monodeck" style={{ color: 'rgba(168,85,247,0.85)' }}>
                  Perspectiva do Consultor <span className="text-white/30 normal-case tracking-normal text-[11px]">(opcional)</span>
                </p>
                <p className="text-[11px] text-white/55 mt-1 leading-relaxed">
                  Adicione contexto qualitativo. ClickUp e Drive capturam fatos; aqui você captura o feeling.
                </p>
              </div>
            </div>

            {/* Toggle de modo */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => selectPerspectivaMode('text')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                style={perspectivaMode === 'text' ? {
                  background: 'rgba(168,85,247,0.18)',
                  color: '#A855F7',
                  border: '1px solid rgba(168,85,247,0.45)',
                } : {
                  background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.55)',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
              >
                <Type size={11} /> Digitar texto
              </button>
              <button
                type="button"
                onClick={() => selectPerspectivaMode('file')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                style={perspectivaMode === 'file' ? {
                  background: 'rgba(168,85,247,0.18)',
                  color: '#A855F7',
                  border: '1px solid rgba(168,85,247,0.45)',
                } : {
                  background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.55)',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
              >
                <Paperclip size={11} /> Anexar arquivo
              </button>
            </div>

            {/* Conteúdo do modo selecionado */}
            {perspectivaMode === 'text' && (
              <div>
                <textarea
                  rows={5}
                  maxLength={PERSPECTIVA_MAX_TEXT_CHARS}
                  value={perspectivaText}
                  onChange={e => setPerspectivaText(e.target.value)}
                  placeholder="Adicione impressões, leituras estratégicas e percepções sobre o ciclo que ClickUp e Drive não capturam..."
                  className={`${INPUT_CLASS} resize-y leading-relaxed`}
                  style={{ fontFamily: 'inherit' }}
                />
                <div className="flex items-center justify-between mt-1.5 text-[10px] text-white/40 font-monodeck">
                  <span>{wordCount} palavras <span className="text-white/25">(recomenda 200-2000)</span></span>
                  <span className="tabular-nums">{charCount.toLocaleString('pt-BR')} / {PERSPECTIVA_MAX_TEXT_CHARS.toLocaleString('pt-BR')}</span>
                </div>
              </div>
            )}

            {perspectivaMode === 'file' && (
              <div>
                {!perspectivaFile ? (
                  <label
                    className="block rounded-lg px-3 py-4 text-center text-xs text-white/55 cursor-pointer transition-colors hover:bg-white/5"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px dashed rgba(168,85,247,0.35)',
                    }}
                  >
                    <Paperclip size={14} className="inline mr-1.5" style={{ color: 'rgba(168,85,247,0.75)' }} />
                    Clique para escolher arquivo
                    <span className="block text-[10px] text-white/35 mt-1">
                      PDF, DOCX, MD ou TXT · máx 5MB
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.docx,.md,.txt"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div
                    className="rounded-lg px-3 py-2.5 flex items-center justify-between gap-3"
                    style={{
                      background: 'rgba(168,85,247,0.08)',
                      border: '1px solid rgba(168,85,247,0.30)',
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip size={12} style={{ color: '#A855F7' }} className="flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-white/85 truncate">{perspectivaFile.name}</p>
                        <p className="text-[10px] text-white/45 font-monodeck">{formatFileSize(perspectivaFile.size)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removePerspectivaFile}
                      className="inline-flex items-center gap-1 text-[10px] text-white/55 hover:text-red-300 transition-colors flex-shrink-0"
                    >
                      <Trash2 size={11} /> Remover
                    </button>
                  </div>
                )}
              </div>
            )}
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
