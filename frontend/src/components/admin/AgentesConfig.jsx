import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Bot, Check, Clock } from 'lucide-react'
import { api } from '../../lib/api'
import { Spinner, PageSpinner } from '../ui/Spinner'
import { useToast } from '../../lib/toast'
import { formatDate } from '../../lib/utils'

const AGENTES = [
  {
    tipo: 'preparacao_encontro',
    label: 'Agente de Preparação de Encontro',
    desc: 'Conversa com consultores para preparar encontros personalizados e gerar slides.',
  },
  {
    tipo: 'copywriter',
    label: 'Copywriter FLG',
    desc: 'Especialista em criação de materiais de copy e conteúdo estratégico para founders.',
  },
  {
    tipo: 'materiais',
    label: 'Agente de Materiais',
    desc: 'Auxilia na estruturação e desenvolvimento de materiais estratégicos para clientes.',
  },
]

function AgenteCard({ config, delay }) {
  const toast = useToast()
  const agente = AGENTES.find(a => a.tipo === config.agente_tipo)
  const [prompt, setPrompt] = useState(config.system_prompt_base || '')
  const [diretrizes, setDiretrizes] = useState(config.diretrizes || '')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  function handlePromptChange(v) { setPrompt(v); setDirty(true) }
  function handleDiretrizes(v) { setDiretrizes(v); setDirty(true) }

  async function handleSave() {
    setSaving(true)
    try {
      await api(`/agentes-config/${config.agente_tipo}`, {
        method: 'PATCH',
        body: JSON.stringify({ system_prompt_base: prompt, diretrizes }),
      })
      setDirty(false)
      toast?.({ title: `${agente?.label} atualizado`, variant: 'success' })
    } catch (err) {
      toast?.({ title: 'Erro ao salvar', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      className="card-flg p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>
            <Bot size={16} style={{ color: '#C9A84C' }} />
          </div>
          <div>
            <p className="font-semibold text-white/90 text-sm">{agente?.label}</p>
            <p className="text-xs text-white/35 mt-0.5 leading-relaxed">{agente?.desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {config.updated_at && (
            <div className="flex items-center gap-1 text-[10px] text-white/20">
              <Clock size={9} />
              {formatDate(config.updated_at)}
            </div>
          )}
          <span className="text-[9px] px-2 py-0.5 rounded font-bold"
            style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34D399' }}>
            v{config.versao || 1}
          </span>
        </div>
      </div>

      {/* System prompt */}
      <div>
        <label className="block text-[10px] tracking-widest uppercase text-white/25 mb-2">
          System Prompt Base
        </label>
        <textarea
          rows={8}
          value={prompt}
          onChange={e => handlePromptChange(e.target.value)}
          className="input-flg font-mono text-xs leading-relaxed"
          style={{ resize: 'vertical' }}
          placeholder="Você é o assistente FLG especializado em…"
        />
        <p className="text-[10px] text-white/20 mt-1">{prompt.length} caracteres</p>
      </div>

      {/* Diretrizes */}
      <div>
        <label className="block text-[10px] tracking-widest uppercase text-white/25 mb-2">
          Diretrizes de Comportamento
        </label>
        <textarea
          rows={4}
          value={diretrizes}
          onChange={e => handleDiretrizes(e.target.value)}
          className="input-flg text-xs leading-relaxed"
          style={{ resize: 'vertical' }}
          placeholder="Tom de voz, regras específicas, limitações…"
        />
      </div>

      {/* Save */}
      <div className="flex items-center justify-between pt-2">
        {dirty && (
          <p className="text-[10px] text-yellow-500/60">Alterações não salvas</p>
        )}
        <div className="ml-auto">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="btn-gold flex items-center gap-2 text-xs py-2 px-4 disabled:opacity-40"
          >
            {saving ? <Spinner size="sm" /> : <Check size={12} />}
            Salvar e publicar
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export default function AgentesConfig() {
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/agentes-config')
      .then(data => { setConfigs(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />

  // Garantir que todos os 3 agentes apareçam mesmo se não vierem do backend
  const allConfigs = AGENTES.map(a => {
    const found = configs.find(c => c.agente_tipo === a.tipo)
    return found || { agente_tipo: a.tipo, system_prompt_base: '', diretrizes: '', versao: 1 }
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-6 max-w-4xl mx-auto"
    >
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-white">Painel de Agentes</h1>
        <p className="text-sm text-white/30 mt-0.5">
          Configure os system prompts e diretrizes dos agentes FLG
        </p>
      </div>

      <div className="space-y-6">
        {allConfigs.map((config, i) => (
          <AgenteCard key={config.agente_tipo} config={config} delay={i * 0.08} />
        ))}
      </div>
    </motion.div>
  )
}
