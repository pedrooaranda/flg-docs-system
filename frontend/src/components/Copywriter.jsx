import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, LayoutTemplate, PieChart, Megaphone,
  MessageSquare, Mic, ArrowLeft, Copy, Save, Check,
  Sparkles, Send,
} from 'lucide-react'
import { api, apiStream } from '../lib/api'
import { Avatar } from './ui/Avatar'
import { Spinner } from './ui/Spinner'
import { formatDate } from '../lib/utils'
import { useToast } from '../lib/toast'
import { useApp } from '../contexts/AppContext'

const MATERIAL_TYPES = [
  { id: 'roteiro_conteudo',    icon: FileText,       label: 'Roteiros de Conteúdo',    desc: 'Posts, threads e artigos estratégicos' },
  { id: 'pagina_captura',      icon: LayoutTemplate, label: 'Página de Captura/Vendas', desc: 'Landing pages e copy de conversão' },
  { id: 'pdf_apresentacao',    icon: PieChart,        label: 'PDF de Apresentação',      desc: 'Decks e materiais visuais' },
  { id: 'criativo_anuncio',    icon: Megaphone,      label: 'Criativos (Anúncios)',     desc: 'Copy para Facebook, Instagram e Google' },
  { id: 'sequencia_mensagens', icon: MessageSquare,  label: 'Sequência de Mensagens',   desc: 'WhatsApp, e-mail e DMs' },
  { id: 'script_audio_video',  icon: Mic,            label: 'Script de Áudio/Vídeo',   desc: 'Roteiros para reels, VSLs e podcasts' },
]

function TypeCard({ type, onSelect }) {
  const [hovered, setHovered] = useState(false)
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(type)}
      className="p-5 rounded-xl text-left transition-all cursor-pointer"
      style={{
        background: hovered ? 'rgba(201,168,76,0.06)' : '#141414',
        border: hovered ? '1px solid rgba(201,168,76,0.35)' : '1px solid rgba(255,255,255,0.06)',
        boxShadow: hovered ? '0 4px 20px rgba(201,168,76,0.08)' : 'none',
      }}
    >
      <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
        style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>
        <type.icon size={18} style={{ color: '#C9A84C' }} />
      </div>
      <p className="font-semibold text-white/90 text-sm mb-1">{type.label}</p>
      <p className="text-xs text-white/40 leading-relaxed">{type.desc}</p>
    </motion.button>
  )
}

function CopyChat({ clienteId, cliente, tipoMaterial, onBack, onSave }) {
  const toast = useToast()
  const tipo = MATERIAL_TYPES.find(t => t.id === tipoMaterial)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `Olá! Vou criar ${tipo?.label} para ${cliente?.nome}. Qual é o objetivo principal deste material? Conte-me sobre o público-alvo e a mensagem central.` }
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [savedContent, setSavedContent] = useState(null)
  const [copied, setCopied] = useState(false)
  const bottomRef = useRef()
  const abortRef = useRef(null)
  const sessionId = `copy_${clienteId}_${tipoMaterial}`

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const lastAssistantContent = [...messages].reverse().find(m => m.role === 'assistant')?.content || ''
  const hasSubstantialContent = lastAssistantContent.length > 200

  const send = useCallback(async () => {
    if (!input.trim() || streaming) return
    const userMsg = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', content: userMsg }])
    setStreaming(true)
    setMessages(m => [...m, { role: 'assistant', content: '' }])
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await apiStream(
        `/chat-copywriter/${clienteId}`,
        { message: userMsg, session_id: sessionId, tipo_material: tipoMaterial },
        (chunk) => {
          setMessages(m => {
            const last = { ...m[m.length - 1], content: m[m.length - 1].content + chunk }
            return [...m.slice(0, -1), last]
          })
        },
        () => {},
        controller.signal,
      )
    } catch (err) {
      if (err.name === 'AbortError') return
      setMessages(m => {
        const last = { ...m[m.length - 1], content: 'Erro ao conectar.' }
        return [...m.slice(0, -1), last]
      })
    } finally {
      abortRef.current = null
      setStreaming(false)
    }
  }, [input, streaming, clienteId, sessionId, tipoMaterial])

  async function handleSave() {
    try {
      const saved = await api('/materiais-copy', {
        method: 'POST',
        body: JSON.stringify({
          cliente_id: clienteId,
          tipo_material: tipoMaterial,
          titulo: tipo?.label,
          conteudo: lastAssistantContent,
        }),
      })
      setSavedContent(saved)
      onSave?.(saved)
      toast?.({ title: 'Copy salva com sucesso!', variant: 'success' })
    } catch {
      toast?.({ title: 'Erro ao salvar copy', variant: 'error' })
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(lastAssistantContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast?.({ title: 'Copiado para a área de transferência', variant: 'success' })
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#141414' }}>
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ background: '#111111', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>
        <button onClick={onBack}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white transition-colors cursor-pointer border border-white/8 hover:border-white/20">
          <ArrowLeft size={13} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar name={cliente?.nome} size="xs" />
          <p className="text-sm text-white/70 truncate">{cliente?.nome}</p>
          <span className="text-white/20">·</span>
          <p className="text-sm font-medium text-gold-mid truncate">{tipo?.label}</p>
        </div>
        {hasSubstantialContent && !savedContent && (
          <div className="flex gap-1.5 flex-shrink-0">
            <button onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer btn-ghost">
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs btn-gold">
              <Save size={12} />
              Salvar Copy
            </button>
          </div>
        )}
        {savedContent && (
          <span className="text-xs text-green-400 flex items-center gap-1 flex-shrink-0">
            <Check size={12} /> Salvo
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ background: '#141414' }}>
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1 gold-gradient">
                  <Sparkles size={12} className="text-[#080808]" />
                </div>
              )}
              <div
                className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${isUser ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl rounded-tl-sm'}`}
                style={isUser ? {
                  background: 'rgba(201, 168, 76, 0.15)',
                  border: '1px solid rgba(201, 168, 76, 0.25)',
                  color: '#FAFAF8',
                } : {
                  background: '#1a1a1a',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#e8e8e6',
                }}
              >
                {msg.content || (i === messages.length - 1 && streaming
                  ? <span className="inline-flex gap-1">{[0,150,300].map(d =>
                      <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{ background: '#C9A84C', animationDelay: `${d}ms` }} />
                    )}</span>
                  : null)}
              </div>
              {isUser && <Avatar name="Você" size="sm" className="mt-1 flex-shrink-0" />}
            </motion.div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 flex-shrink-0"
        style={{ background: '#111111', borderTop: '1px solid rgba(201, 168, 76, 0.15)' }}>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            disabled={streaming}
            rows={2}
            placeholder="Descreva o que precisa… (Enter envia)"
            className="flex-1 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-all disabled:opacity-40"
            style={{ background: '#1a1a1a', border: '1px solid rgba(201,168,76,0.2)', color: '#FAFAF8', caretColor: '#C9A84C' }}
            onFocus={e => { e.target.style.borderColor = '#C9A84C'; e.target.style.boxShadow = '0 0 0 2px rgba(201,168,76,0.1)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(201,168,76,0.2)'; e.target.style.boxShadow = 'none' }}
          />
          <button onClick={send} disabled={streaming || !input.trim()}
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 gold-gradient active:scale-95 disabled:opacity-30 disabled:grayscale cursor-pointer">
            <Send size={15} className="text-[#080808]" />
          </button>
        </div>
      </div>
    </div>
  )
}

function HistoricoCopies({ clienteId, cliente }) {
  const [copies, setCopies] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!clienteId) return
    setLoading(true)
    api(`/materiais-copy?cliente_id=${clienteId}`)
      .then(data => { setCopies(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [clienteId])

  if (!clienteId) return null

  return (
    <div className="flex flex-col h-full border-l border-white/5" style={{ background: '#0e0e0e', width: '35%' }}>
      <div className="px-4 py-3 border-b border-white/5 flex-shrink-0" style={{ background: '#111111' }}>
        <p className="text-xs text-white/40">
          Histórico de <span className="text-gold-mid">{cliente?.nome}</span>
        </p>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner size="sm" />
        </div>
      ) : copies.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <p className="text-xs text-white/25">Nenhuma copy anterior</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {copies.map(c => (
            <div key={c.id} className="p-3 rounded-lg cursor-pointer transition-all"
              style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-xs font-medium text-white/70 mb-1">{c.titulo || c.tipo_material}</p>
              <p className="text-[11px] text-white/35 line-clamp-2 leading-relaxed">{c.conteudo}</p>
              <p className="text-[10px] text-white/20 mt-2">{formatDate(c.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Copywriter() {
  const { clientes } = useApp()
  const [stage, setStage] = useState('select') // 'select' | 'chat'
  const [selectedId, setSelectedId] = useState('')
  const [tipoMaterial, setTipoMaterial] = useState('')

  const cliente = clientes.find(c => c.id === selectedId)

  function startChat(tipo) {
    setTipoMaterial(tipo.id)
    setStage('chat')
  }

  if (stage === 'chat' && selectedId) {
    return (
      <div className="flex h-full overflow-hidden">
        <div style={{ flex: 1 }}>
          <CopyChat
            clienteId={selectedId}
            cliente={cliente}
            tipoMaterial={tipoMaterial}
            onBack={() => setStage('select')}
          />
        </div>
        <HistoricoCopies clienteId={selectedId} cliente={cliente} />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-12 px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-3xl"
      >
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl font-bold gold-text mb-2">Copywriter FLG</h1>
          <p className="text-white/40 text-sm">Selecione o cliente e o tipo de material para começar</p>
        </div>

        {/* Passo 1 — selecionar cliente */}
        <div className="mb-8">
          <p className="text-xs tracking-widest uppercase text-white/30 mb-3">Passo 1 — Cliente</p>
          <div className="flex flex-wrap gap-2">
            {clientes.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-all cursor-pointer"
                style={{
                  background: selectedId === c.id ? 'rgba(201,168,76,0.12)' : '#141414',
                  border: selectedId === c.id ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.06)',
                  color: selectedId === c.id ? '#C9A84C' : 'rgba(250,250,248,0.6)',
                }}
              >
                <Avatar name={c.nome} size="xs" />
                <span>{c.nome}</span>
                <span className="text-[10px] opacity-50">E{c.encontro_atual || 1}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Passo 2 — tipo de material */}
        <AnimatePresence>
          {selectedId && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
            >
              <p className="text-xs tracking-widest uppercase text-white/30 mb-3">Passo 2 — Tipo de Material</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {MATERIAL_TYPES.map(type => (
                  <TypeCard key={type.id} type={type} onSelect={startChat} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
