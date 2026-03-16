import { useState } from 'react'
import { api } from '../lib/api'

export default function SlidesPreview({ clientId, encontroNum, conversationContext, onConfirmed }) {
  const [state, setState] = useState('idle') // idle | generating | ready | confirming
  const [slides, setSlides] = useState(null) // { html_url, pdf_url, html }
  const [error, setError] = useState('')

  async function handleGenerate() {
    setState('generating')
    setError('')
    try {
      const result = await api('/generate-slides', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          encontro_numero: encontroNum,
          conversation_context: conversationContext,
        }),
      })
      setSlides(result)
      setState('ready')
    } catch (err) {
      setError(err.message)
      setState('idle')
    }
  }

  async function handleConfirm() {
    setState('confirming')
    try {
      await api('/encontros-realizados', {
        method: 'POST',
        body: JSON.stringify({
          cliente_id: clientId,
          encontro_numero: encontroNum,
          slides_html_url: slides?.html_url,
          slides_pdf_url: slides?.pdf_url,
        }),
      })
      onConfirmed()
    } catch (err) {
      setError(err.message)
      setState('ready')
    }
  }

  if (state === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center p-8">
        <div className="w-12 h-12 border-2 border-gold-mid border-t-transparent rounded-full animate-spin" />
        <div>
          <p className="font-display text-xl gold-text">Gerando slides…</p>
          <p className="text-white/40 text-sm mt-2">Claude está criando a apresentação personalizada</p>
        </div>
      </div>
    )
  }

  if (state === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center p-8">
        <div className="w-16 h-16 rounded-full border border-gold-mid/30 flex items-center justify-center">
          <span className="text-2xl">✦</span>
        </div>
        <div>
          <p className="font-display text-xl gold-text">Slides Personalizados</p>
          <p className="text-white/40 text-sm mt-2 max-w-xs">
            Converse com o assistente até ter o contexto completo, depois gere os slides.
          </p>
        </div>
        {error && <p className="text-red-400 text-sm max-w-xs">{error}</p>}
        <button
          onClick={handleGenerate}
          className="px-8 py-3 rounded text-sm font-semibold tracking-wide"
          style={{ background: 'linear-gradient(135deg, #F5D68A 0%, #C9A84C 50%, #8B6914 100%)', color: '#080808' }}
        >
          Gerar Slides Agora
        </button>
      </div>
    )
  }

  // State: ready
  return (
    <div className="flex flex-col h-full">
      {/* Preview iframe */}
      <div className="flex-1 relative">
        {slides?.html ? (
          <iframe
            srcDoc={slides.html}
            className="w-full h-full border-0"
            title="Preview dos slides"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-white/30">
            Preview indisponível
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="p-4 border-t border-white/5 flex items-center justify-between gap-4">
        <div className="flex gap-3">
          {slides?.html_url && (
            <a
              href={slides.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm card-flg text-white/70 hover:text-white hover:border-gold-mid/50 transition-all rounded"
            >
              Abrir HTML
            </a>
          )}
          {slides?.pdf_url && (
            <a
              href={slides.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm card-flg text-white/70 hover:text-white hover:border-gold-mid/50 transition-all rounded"
            >
              Download PDF
            </a>
          )}
          <button
            onClick={() => setState('idle')}
            className="px-4 py-2 text-sm text-white/40 hover:text-white transition-colors"
          >
            Regenerar
          </button>
        </div>

        <button
          onClick={handleConfirm}
          disabled={state === 'confirming'}
          className="px-6 py-2 rounded text-sm font-semibold disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #F5D68A 0%, #C9A84C 50%, #8B6914 100%)', color: '#080808' }}
        >
          {state === 'confirming' ? 'Salvando…' : '✓ Confirmar Encontro Realizado'}
        </button>
      </div>
    </div>
  )
}
