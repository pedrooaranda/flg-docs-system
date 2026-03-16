import { useState, useRef, useEffect } from 'react'
import { apiStream } from '../lib/api'

export default function ChatAgente({ clientId, encontroNum, onSlidesReady }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `Olá! Estou pronto para preparar o Encontro ${encontroNum}. Como posso ajudar?` }
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef()
  const sessionId = `${clientId}_${encontroNum}`

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || streaming) return
    const userMsg = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', content: userMsg }])
    setStreaming(true)

    // Placeholder para resposta
    setMessages(m => [...m, { role: 'assistant', content: '' }])

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
          if (done.trigger_slides) {
            onSlidesReady()
          }
        }
      )
    } catch (err) {
      setMessages(m => {
        const last = { ...m[m.length - 1], content: `Erro: ${err.message}` }
        return [...m.slice(0, -1), last]
      })
    } finally {
      setStreaming(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-lg text-sm leading-relaxed whitespace-pre-wrap
              ${msg.role === 'user'
                ? 'bg-gold-mid/20 border border-gold-mid/30 text-white'
                : 'bg-white/5 border border-white/10 text-white/85'}`}>
              {msg.content || (streaming && i === messages.length - 1 ? (
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-gold-mid rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-gold-mid rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-gold-mid rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              ) : '')}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/5">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={streaming}
            rows={2}
            placeholder="Escreva para o assistente… (Enter para enviar)"
            className="flex-1 bg-white/5 border border-white/10 rounded px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold-mid transition-colors resize-none disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="px-5 rounded text-sm font-semibold disabled:opacity-30 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #F5D68A 0%, #C9A84C 50%, #8B6914 100%)', color: '#080808' }}
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}
