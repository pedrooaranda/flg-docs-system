import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Sparkles } from 'lucide-react'
import { apiStream } from '../lib/api'
import { Avatar } from './ui/Avatar'
import { cn } from '../lib/utils'

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 150, 300].map(delay => (
        <span
          key={delay}
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: '#C9A84C', animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}

function Message({ msg, isLast, streaming }) {
  const isUser = msg.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1 gold-gradient"
        >
          <Sparkles size={12} className="text-[#080808]" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[80%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
          isUser ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl rounded-tl-sm'
        )}
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
        {msg.content || (isLast && streaming ? <TypingDots /> : null)}
      </div>
      {isUser && <Avatar name="Você" size="sm" className="mt-1 flex-shrink-0" />}
    </motion.div>
  )
}

/**
 * ChatAgente — reutilizável para preparação, materiais e copywriter.
 *
 * Props:
 *   clientId, encontroNum — para preparação (/chat/{id}/{num})
 *   endpoint — override explícito do endpoint de POST
 *   sessionId — override do session_id
 *   initialMessage — mensagem inicial do agente
 *   onSlidesReady — callback quando trigger_slides = true
 */
export default function ChatAgente({
  clientId,
  encontroNum,
  endpoint,
  sessionId: sessionIdProp,
  initialMessage,
  onSlidesReady,
}) {
  const defaultMsg = initialMessage
    ?? `Olá! Estou pronto para preparar o Encontro ${encontroNum}. Vamos conversar sobre o cliente e o contexto deste encontro.`

  const [messages, setMessages] = useState([
    { role: 'assistant', content: defaultMsg }
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef()
  const textareaRef = useRef()
  const abortRef = useRef(null)

  const resolvedEndpoint = endpoint ?? `/chat/${clientId}/${encontroNum}`
  const sessionId = sessionIdProp ?? `${clientId}_${encontroNum}`

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

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
        resolvedEndpoint,
        { message: userMsg, session_id: sessionId },
        (chunk) => {
          setMessages(m => {
            const last = { ...m[m.length - 1], content: m[m.length - 1].content + chunk }
            return [...m.slice(0, -1), last]
          })
        },
        (done) => {
          if (done.trigger_slides) onSlidesReady?.()
        },
        controller.signal,
      )
    } catch (err) {
      if (err.name === 'AbortError') return
      setMessages(m => {
        const last = { ...m[m.length - 1], content: 'Erro ao conectar com o assistente.' }
        return [...m.slice(0, -1), last]
      })
    } finally {
      abortRef.current = null
      setStreaming(false)
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [input, streaming, resolvedEndpoint, sessionId, onSlidesReady])

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#141414' }}>
      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        style={{ background: '#141414' }}
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <Message
              key={i}
              msg={msg}
              isLast={i === messages.length - 1}
              streaming={streaming}
            />
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        className="p-4 flex-shrink-0"
        style={{ background: '#111111', borderTop: '1px solid rgba(201, 168, 76, 0.15)' }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={streaming}
            rows={2}
            placeholder="Escreva para o assistente… (Enter envia, Shift+Enter nova linha)"
            className="flex-1 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-all disabled:opacity-40"
            style={{
              background: '#1a1a1a',
              border: '1px solid rgba(201, 168, 76, 0.2)',
              color: '#FAFAF8',
              caretColor: '#C9A84C',
            }}
            onFocus={e => {
              e.target.style.borderColor = '#C9A84C'
              e.target.style.boxShadow = '0 0 0 2px rgba(201, 168, 76, 0.1)'
            }}
            onBlur={e => {
              e.target.style.borderColor = 'rgba(201, 168, 76, 0.2)'
              e.target.style.boxShadow = 'none'
            }}
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 gold-gradient transition-all active:scale-95 disabled:opacity-30 disabled:grayscale"
            style={{ cursor: 'pointer' }}
          >
            <Send size={15} className="text-[#080808]" />
          </button>
        </div>
      </div>
    </div>
  )
}
