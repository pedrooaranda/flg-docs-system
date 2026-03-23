import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import * as Tabs from '@radix-ui/react-tabs'
import { ExternalLink, FileText, BarChart2, CheckCircle2 } from 'lucide-react'
import { api, uploadPdf } from '../lib/api'
import { Avatar } from './ui/Avatar'
import { StatusBadge } from './ui/Badge'
import { Spinner, PageSpinner } from './ui/Spinner'
import { useToast } from '../lib/toast'
import { formatDate, progressPercent, cn } from '../lib/utils'

const CAMPOS_PERFIL = [
  { key: 'tom_de_voz',          label: 'Tom de Voz' },
  { key: 'pontos_fortes',       label: 'Pontos Fortes' },
  { key: 'travas_conhecidas',   label: 'Travas Conhecidas' },
  { key: 'ansiedades',          label: 'Ansiedades' },
  { key: 'situacao_atual',      label: 'Situação Atual' },
  { key: 'objetivo_em_6_meses', label: 'Objetivo em 6 Meses' },
  { key: 'principal_dor_hoje',  label: 'Principal Dor Hoje' },
]

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

export default function PerfilCliente() {
  const { clientId } = useParams()
  const toast = useToast()
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(null)
  const fileInputRef = useRef()
  const [pendingDocType, setPendingDocType] = useState(null)

  useEffect(() => {
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
              <div key={key} className="card-flg p-4">
                <p className="text-[10px] tracking-widest uppercase text-white/30 mb-2">{label}</p>
                <p className="text-sm text-white/75 leading-relaxed">
                  {cliente[key] || <span className="text-white/20 italic">Não informado</span>}
                </p>
              </div>
            ))}
          </div>
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
