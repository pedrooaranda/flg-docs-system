import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as Tabs from '@radix-ui/react-tabs'
import { ExternalLink, FileText, BarChart2, CheckCircle2, Pin, PinOff, Trash2, Send } from 'lucide-react'
import { api, uploadPdf } from '../lib/api'
import { Avatar } from './ui/Avatar'
import { StatusBadge } from './ui/Badge'
import { Spinner, PageSpinner } from './ui/Spinner'
import { useToast } from '../lib/toast'
import { formatDate, progressPercent, cn } from '../lib/utils'
import { useAutoSave, AutoSaveIndicator } from '../hooks/useAutoSave.jsx'

const CAMPOS_PERFIL = [
  { key: 'tom_de_voz',          label: 'Tom de Voz' },
  { key: 'pontos_fortes',       label: 'Pontos Fortes' },
  { key: 'travas_conhecidas',   label: 'Travas Conhecidas' },
  { key: 'ansiedades',          label: 'Ansiedades' },
  { key: 'situacao_atual',      label: 'Situação Atual' },
  { key: 'objetivo_em_6_meses', label: 'Objetivo em 6 Meses' },
  { key: 'principal_dor_hoje',  label: 'Principal Dor Hoje' },
]

function CampoPerfilCard({ clientId, fieldKey, label, initialValue }) {
  const [val, setVal] = useState(initialValue || '')
  const { status } = useAutoSave(`/clientes/${clientId}`, fieldKey, val)
  return (
    <div className="card-flg p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] tracking-widest uppercase text-white/30">{label}</p>
        <AutoSaveIndicator status={status} />
      </div>
      <textarea
        rows={3}
        value={val}
        onChange={e => setVal(e.target.value)}
        className="w-full bg-transparent text-sm text-white/75 leading-relaxed resize-none focus:outline-none placeholder:text-white/20"
        placeholder="Não informado"
      />
    </div>
  )
}

function JornadaTimeline({ encontros_realizados = [], encontroAtual, clientId }) {
  const navigate = useNavigate()
  return (
    <div className="space-y-2">
      {Array.from({ length: 15 }, (_, i) => i + 1).map(n => {
        const realizado = encontros_realizados.find(e => e.encontro_numero === n)
        const atual = n === encontroAtual
        return (
          <button
            key={n}
            onClick={() => navigate(`/clientes/${clientId}/encontro/${n}`)}
            className={cn(
              'w-full flex items-center gap-4 p-3 rounded-lg border transition-all text-left group',
              realizado ? 'border-gold-mid/20 bg-gold-mid/5 hover:border-gold-mid/40' :
              atual     ? 'border-gold-mid/50 bg-gold-mid/8 animate-pulse-gold' :
                          'border-white/5 hover:border-white/15 hover:bg-white/3'
            )}
          >
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold',
              realizado ? 'gold-gradient text-[#080808]' :
              atual     ? 'border-2 border-gold-mid text-gold-mid' :
                          'border border-white/15 text-white/25'
            )}>
              {realizado ? <CheckCircle2 size={14} /> : n}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-medium', realizado ? 'text-white/80' : atual ? 'text-white' : 'text-white/35')}>
                Encontro {n}
                {atual && <span className="ml-2 text-xs text-gold-mid font-normal">← atual</span>}
              </p>
              {realizado?.created_at && (
                <p className="text-xs text-white/25">{formatDate(realizado.created_at)}</p>
              )}
            </div>
            <span className="text-xs text-white/20 opacity-0 group-hover:opacity-100 transition-opacity">
              Preparar →
            </span>
          </button>
        )
      })}
    </div>
  )
}

const TIPOS_NOTA = [
  { value: 'geral',     label: 'Geral',     color: '#C9A84C' },
  { value: 'percepcao', label: 'Percepção',  color: '#60A5FA' },
  { value: 'trava',     label: 'Trava',      color: '#F87171' },
  { value: 'evolucao',  label: 'Evolução',   color: '#34D399' },
  { value: 'alerta',    label: 'Alerta',     color: '#FBBF24' },
  { value: 'tarefa',    label: 'Tarefa',     color: '#A78BFA' },
]

function NotasTab({ clientId }) {
  const [notas, setNotas] = useState([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('geral')
  const [sending, setSending] = useState(false)
  const inputRef = useRef(null)

  const loadNotas = useCallback(() => {
    api(`/notas/${clientId}`).then(d => setNotas(d.notas || [])).catch(() => {}).finally(() => setLoading(false))
  }, [clientId])

  useEffect(() => { loadNotas() }, [loadNotas])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!texto.trim()) return
    setSending(true)
    try {
      await api(`/notas/${clientId}`, {
        method: 'POST',
        body: JSON.stringify({ conteudo: texto.trim(), tipo }),
      })
      setTexto('')
      loadNotas()
    } catch (err) { console.error(err) }
    finally { setSending(false); inputRef.current?.focus() }
  }

  async function togglePin(nota) {
    await api(`/notas/${nota.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fixada: !nota.fixada }),
    })
    loadNotas()
  }

  async function deleteNota(id) {
    await api(`/notas/${id}`, { method: 'DELETE' })
    loadNotas()
  }

  const tipoInfo = (t) => TIPOS_NOTA.find(n => n.value === t) || TIPOS_NOTA[0]

  return (
    <div className="space-y-4">
      {/* Input */}
      <form onSubmit={handleSubmit} className="card-flg p-4 space-y-3">
        <div className="flex gap-1.5 flex-wrap">
          {TIPOS_NOTA.map(t => (
            <button type="button" key={t.value} onClick={() => setTipo(t.value)}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all cursor-pointer"
              style={tipo === t.value
                ? { background: `${t.color}20`, color: t.color, border: `1px solid ${t.color}40` }
                : { color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.06)' }
              }>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input ref={inputRef} value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Escreva uma nota sobre este cliente..."
            className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/20 outline-none"
            disabled={sending} />
          <button type="submit" disabled={sending || !texto.trim()}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer disabled:opacity-20"
            style={{ background: 'rgba(201,168,76,0.15)', color: '#C9A84C' }}>
            <Send size={14} />
          </button>
        </div>
      </form>

      {/* Timeline */}
      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : notas.length === 0 ? (
        <p className="text-center text-white/20 text-sm py-8">Nenhuma nota ainda. Adicione a primeira acima.</p>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {notas.map((nota, i) => {
              const ti = tipoInfo(nota.tipo)
              return (
                <motion.div key={nota.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: i * 0.03 }}
                  className="card-flg p-4 group"
                  style={nota.fixada ? { borderColor: 'rgba(201,168,76,0.2)' } : undefined}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-1 self-stretch rounded-full flex-shrink-0 mt-1" style={{ background: ti.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: `${ti.color}15`, color: ti.color }}>
                          {ti.label}
                        </span>
                        {nota.fixada && <Pin size={10} className="text-gold-mid" />}
                        <span className="text-[9px] text-white/20 ml-auto">
                          {nota.consultor_email?.split('@')[0]} · {new Date(nota.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{nota.conteudo}</p>
                    </div>
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => togglePin(nota)} className="p-1 rounded hover:bg-white/5 transition-colors cursor-pointer"
                        title={nota.fixada ? 'Desafixar' : 'Fixar'}>
                        {nota.fixada ? <PinOff size={12} className="text-white/30" /> : <Pin size={12} className="text-white/30" />}
                      </button>
                      <button onClick={() => deleteNota(nota.id)} className="p-1 rounded hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Deletar">
                        <Trash2 size={12} className="text-red-400/40" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

export default function PerfilCliente() {
  const { clientId } = useParams()
  const toast = useToast()
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(null)
  const fileInputRef = useRef()
  const [pendingDocType, setPendingDocType] = useState(null)

  useEffect(() => {
    setLoading(true)
    setCliente(null)
    api(`/clientes/${clientId}`)
      .then(data => { setCliente(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [clientId])

  async function handleUploadPdf(docType) {
    setPendingDocType(docType)
    fileInputRef.current.click()
  }

  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file || !pendingDocType) return
    e.target.value = ''
    setUploading(pendingDocType)
    try {
      await uploadPdf(clientId, pendingDocType, file)
      toast?.({ title: 'PDF processado', description: 'Texto extraído com sucesso.', variant: 'success' })
    } catch (err) {
      toast?.({ title: 'Erro no upload', description: err.message, variant: 'error' })
    } finally {
      setUploading(null)
      setPendingDocType(null)
    }
  }

  if (loading) return <PageSpinner />
  if (!cliente) return <div className="flex items-center justify-center h-64 text-white/30">Cliente não encontrado</div>

  const encontroAtual = cliente.encontro_atual || 1
  const pct = progressPercent(encontroAtual)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-6 max-w-5xl mx-auto"
    >
      {/* Client header */}
      <div className="card-flg p-6 mb-6">
        <div className="flex items-start gap-5">
          <Avatar name={cliente.nome} size="2xl" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="font-display text-3xl font-bold text-white">{cliente.nome}</h1>
                <p className="text-white/50 mt-1">{cliente.empresa}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <StatusBadge status={cliente.status || 'ativo'} />
                  {cliente.clickup_task_id && (
                    <a
                      href={`https://app.clickup.com/t/${cliente.clickup_task_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-white/30 hover:text-gold-mid transition-colors"
                    >
                      <ExternalLink size={11} />
                      ClickUp
                    </a>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-display text-4xl font-bold gold-text">E{encontroAtual}</div>
                <p className="text-xs text-white/30 mt-1">de 15 encontros</p>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <div className="flex justify-between text-xs text-white/25">
                <span>Progresso da Jornada</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full gold-gradient"
                />
              </div>
            </div>
            <p className="text-xs text-white/25 mt-2">Consultor: {cliente.consultor_responsavel}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs.Root defaultValue="perfil">
        <Tabs.List className="flex gap-1 p-1 rounded-lg bg-white/3 border border-white/5 mb-6 w-fit">
          {[
            { value: 'perfil',      label: 'Perfil' },
            { value: 'notas',       label: 'Notas' },
            { value: 'jornada',     label: 'Jornada' },
            { value: 'documentos',  label: 'Documentos' },
          ].map(tab => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-all',
                'text-white/40 hover:text-white/70',
                'data-[state=active]:bg-[#1A1A1A] data-[state=active]:text-white data-[state=active]:border data-[state=active]:border-white/10'
              )}
            >
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="perfil">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CAMPOS_PERFIL.map(({ key, label }) => (
              <CampoPerfilCard
                key={key}
                clientId={clientId}
                fieldKey={key}
                label={label}
                initialValue={cliente[key]}
              />
            ))}
          </div>
        </Tabs.Content>

        <Tabs.Content value="notas">
          <NotasTab clientId={clientId} />
        </Tabs.Content>

        <Tabs.Content value="jornada">
          <JornadaTimeline
            encontros_realizados={cliente.encontros_realizados || []}
            encontroAtual={encontroAtual}
            clientId={clientId}
          />
        </Tabs.Content>

        <Tabs.Content value="documentos">
          <div className="space-y-4">
            <p className="text-sm text-white/40">
              Faça upload dos PDFs do cliente. O texto será extraído automaticamente e ficará disponível para o agente.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => handleUploadPdf('planejamento')}
                disabled={!!uploading}
                className="card-flg-hover p-5 flex items-center gap-4 text-left disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                  {uploading === 'planejamento' ? <Spinner size="sm" /> : <FileText size={18} className="text-blue-400" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-white/80">Planejamento Estratégico</p>
                  <p className="text-xs text-white/35 mt-0.5">
                    {cliente.planejamento_estrategico_texto ? 'PDF processado ✓' : 'Clique para enviar PDF'}
                  </p>
                </div>
              </button>
              <button
                onClick={() => handleUploadPdf('estudo')}
                disabled={!!uploading}
                className="card-flg-hover p-5 flex items-center gap-4 text-left disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
                  {uploading === 'estudo' ? <Spinner size="sm" /> : <BarChart2 size={18} className="text-green-400" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-white/80">Estudo de Mercado</p>
                  <p className="text-xs text-white/35 mt-0.5">
                    {cliente.estudo_mercado_texto ? 'PDF processado ✓' : 'Clique para enviar PDF'}
                  </p>
                </div>
              </button>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
        </Tabs.Content>
      </Tabs.Root>
    </motion.div>
  )
}
