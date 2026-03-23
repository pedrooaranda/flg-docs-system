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
          className="w-1.5 h-1.5 bg-gold-mid/60 rounded-full animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
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
        <div className="w-7 h-7 rounded-full gold-gradient flex items-center justify-center flex-shrink-0 mt-1">
          <Sparkles size={12} className="text-[#080808]" />
        </div>
      )}
      <div className={cn(
        'max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
        isUser
          ? 'bg-gold-mid/15 border border-gold-mid/25 text-white rounded-tr-sm'
          : 'bg-white/5 border border-white/8 text-white/85 rounded-tl-sm'
      )}>
        {msg.content || (isLast && streaming ? <TypingDots /> : null)}
      </div>
      {isUser && <Avatar name="Você" size="sm" className="mt-1 flex-shrink-0" />}
    </motion.div>
  )
}

export default function ChatAgente({ clientId, encontroNum, onSlidesReady }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `Olá! Estou pronto para preparar o Encontro ${encontroNum}. Vamos conversar sobre o cliente e o contexto deste encontro.` }
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef()
  const textareaRef = useRef()
  const abortRef = useRef(null) // AbortController for in-flight stream
  const sessionId = `${clientId}_${encontroNum}`

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cancel any in-flight stream on unmount
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
        `/chat/${clientId}/${encontroNum}`,
        { message: userMsg, session_id: sessionId },
        (chunk) => {
          setMessages(m => {
            const last = { ...m[m.length - 1], content: m[m.length - 1].content + chunk }
            return [...m.slice(0, -1), last]
          })
        },
        (done) => {
          if (done.trigger_slides) onSlidesReady()
        },
        controller.signal,
      )
    } catch (err) {
      // Ignore abort errors (user navigated away)
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
  }, [input, streaming, clientId, encontroNum, sessionId, onSlidesReady])

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
      <div className="p-4 border-t border-white/5 flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={streaming}
            rows={2}
            placeholder="Escreva para o assistente… (Enter envia, Shift+Enter nova linha)"
            className={cn(
              'flex-1 bg-white/4 border border-white/8 rounded-xl px-4 py-3 text-sm text-white',
              'placeholder-white/20 focus:outline-none focus:border-gold-mid/40 transition-colors',
              'resize-none disabled:opacity-40'
            )}
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
              'gold-gradient text-[#080808] disabled:opacity-30 disabled:grayscale',
              'hover:opacity-90 active:scale-95'
            )}
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
