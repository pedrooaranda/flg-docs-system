/**
 * ChatGerador — chat consultor↔Claude pra produzir HTML prática.
 *
 * Streaming via apiStream (SSE). A cada turno completo, o backend já persistiu
 * a conversa_chat — recarregamos via onReloadPratica pra sincronizar.
 *
 * Pedido de geração de HTML é por outro botão (ActionsBar).
 */

import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { apiStream } from '../../../lib/api'
import { Avatar } from '../../ui/Avatar'

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 150, 300].map(d => (
        <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: '#C9A84C', animationDelay: `${d}ms` }} />
      ))}
    </span>
  )
}

function Bubble({ msg, isLast, streaming }) {
  const isUser = msg.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1 gold-gradient">
          <Sparkles size={12} className="text-[#080808]" />
        </div>
      )}
      <div
        className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl rounded-tl-sm'
        }`}
        style={isUser
          ? { background: 'rgba(201, 168, 76, 0.15)', border: '1px solid rgba(201,168,76,0.25)', color: 'var(--flg-text)' }
          : { background: 'var(--flg-bg-card)', border: '1px solid rgba(255,255,255,0.06)', color: '#e8e8e6' }
        }
      >
        {msg.content || (isLast && streaming ? <TypingDots /> : null)}
      </div>
      {isUser && <Avatar name="Você" size="sm" className="mt-1 flex-shrink-0" />}
    </motion.div>
  )
}

export default function ChatGerador({
  clienteId,
  encontroNumero,
  conversa,
  onPraticaChanged: _onPraticaChanged,  // not used directly here but reserved
  onReloadPratica,
}) {
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [pendingAssistant, setPendingAssistant] = useState('')
  // Optimistic user turn while waiting for backend reload
  const [optimisticUser, setOptimisticUser] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll on new message / stream tick
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [conversa, pendingAssistant, optimisticUser])

  async function handleSend() {
    const text = input.trim()
    if (!text || streaming) return

    setInput('')
    setOptimisticUser({ role: 'user', content: text })
    setPendingAssistant('')
    setStreaming(true)

    try {
      let acc = ''
      await apiStream(
        `/reunioes/${clienteId}/${encontroNumero}/chat`,
        { message: text },
        (delta) => {
          acc += delta
          setPendingAssistant(acc)
        },
        () => {
          // done event — backend já persistiu, vamos recarregar pra autoritativo
        },
      )
    } catch (e) {
      console.error('chat error:', e)
      setPendingAssistant((prev) => prev + `\n\n[Erro: ${e.message}]`)
    } finally {
      setStreaming(false)
      // Recarrega pratica pra pegar conversa_chat persistida no DB
      try { await onReloadPratica?.() } catch {}
      setOptimisticUser(null)
      setPendingAssistant('')
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Compose display list — backend turns + optimistic user + streaming assistant
  const display = []
  for (const turn of conversa) {
    if (turn.role === 'user' || turn.role === 'assistant') {
      display.push({ role: turn.role, content: turn.content })
    }
  }
  if (optimisticUser) display.push(optimisticUser)
  if (streaming || pendingAssistant) {
    display.push({ role: 'assistant', content: pendingAssistant })
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {display.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <Sparkles size={24} className="text-gold-mid/40 mx-auto mb-3" />
              <p className="text-sm text-white/60 mb-1">Comece descrevendo o caso</p>
              <p className="text-xs text-white/30">
                Conte pro Claude o contexto do cliente — qual o problema concreto, números relevantes,
                e ele faz perguntas pra construir os slides práticos.
              </p>
            </div>
          </div>
        ) : (
          display.map((m, i) => (
            <Bubble
              key={i}
              msg={m}
              isLast={i === display.length - 1}
              streaming={streaming && i === display.length - 1 && m.role === 'assistant'}
            />
          ))
        )}
      </div>

      <div className="px-4 py-3 border-t border-white/5 flex-shrink-0"
        style={{ background: 'var(--flg-bg-secondary)' }}>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={streaming ? 'Claude respondendo…' : 'Descreva o caso ou responda às perguntas… (Enter pra enviar)'}
            disabled={streaming}
            rows={2}
            className="flex-1 px-3 py-2 text-sm rounded-lg resize-none bg-white/5 border border-white/10 text-white/90 placeholder-white/30 focus:outline-none focus:border-gold-mid/40 disabled:opacity-50"
            style={{ maxHeight: 200 }}
          />
          <button
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className="px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition-all"
            style={{
              background: !input.trim() || streaming ? 'rgba(255,255,255,0.05)' : 'rgba(201,168,76,0.18)',
              border: '1px solid rgba(201,168,76,0.35)',
              color: !input.trim() || streaming ? 'rgba(255,255,255,0.3)' : '#C9A84C',
              cursor: !input.trim() || streaming ? 'not-allowed' : 'pointer',
            }}
          >
            <Send size={12} /> Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
