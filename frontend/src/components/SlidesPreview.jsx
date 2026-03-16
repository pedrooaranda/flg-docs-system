import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ExternalLink, Download, RefreshCw, CheckCircle2 } from 'lucide-react'
import { api } from '../lib/api'
import { Spinner } from './ui/Spinner'
import { cn } from '../lib/utils'

export default function SlidesPreview({ clientId, encontroNum, conversationContext, onConfirmed }) {
  const [state, setState] = useState('idle') // idle | generating | ready | confirming
  const [slides, setSlides] = useState(null)
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
        <div className="relative">
          <div className="w-16 h-16 rounded-full border border-gold-mid/20 flex items-center justify-center">
            <Sparkles size={22} className="text-gold-mid animate-pulse" />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-gold-mid/40 border-t-transparent animate-spin" />
        </div>
        <div>
          <p className="font-display text-xl gold-text">Gerando slides…</p>
          <p className="text-white/40 text-sm mt-2 max-w-xs">Claude está criando a apresentação personalizada para este encontro</p>
        </div>
      </div>
    )
  }

  if (state === 'idle') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center h-full gap-6 text-center p-8"
      >
        <div className="w-16 h-16 rounded-full border border-gold-mid/25 bg-gold-mid/5 flex items-center justify-center">
          <Sparkles size={22} className="text-gold-mid/60" />
        </div>
        <div>
          <p className="font-display text-xl gold-text">Slides Personalizados</p>
          <p className="text-white/40 text-sm mt-2 max-w-xs leading-relaxed">
            Converse com o assistente até ter o contexto completo, depois gere os slides.
          </p>
        </div>
        {error && (
          <p className="text-red-400 text-sm max-w-xs bg-red-400/10 border border-red-400/20 px-4 py-2 rounded-lg">
            {error}
          </p>
        )}
        <button onClick={handleGenerate} className="btn-gold px-8 py-3 text-sm">
          <Sparkles size={14} />
          Gerar Slides Agora
        </button>
      </motion.div>
    )
  }

  // State: ready or confirming
  return (
    <div className="flex flex-col h-full">
      {/* Preview iframe */}
      <div className="flex-1 relative bg-white/2">
        {slides?.html ? (
          <iframe
            srcDoc={slides.html}
            className="w-full h-full border-0"
            title="Preview dos slides"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-white/30 text-sm">
            Preview indisponível
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="p-4 border-t border-white/5 bg-black/20 flex-shrink-0">
        {error && (
          <p className="text-red-400 text-xs mb-3 px-2">{error}</p>
        )}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2">
            {slides?.html_url && (
              <a
                href={slides.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg',
                  'border border-white/10 text-white/60 hover:text-white hover:border-white/25 transition-all'
                )}
              >
                <ExternalLink size={12} />
                HTML
              </a>
            )}
            {slides?.pdf_url && (
              <a
                href={slides.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg',
                  'border border-white/10 text-white/60 hover:text-white hover:border-white/25 transition-all'
                )}
              >
                <Download size={12} />
                PDF
              </a>
            )}
            <button
              onClick={() => setState('idle')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg',
                'border border-white/8 text-white/40 hover:text-white/70 transition-all'
              )}
            >
              <RefreshCw size={12} />
              Regenerar
            </button>
          </div>

          <button
            onClick={handleConfirm}
            disabled={state === 'confirming'}
            className="btn-gold flex items-center gap-2 text-sm disabled:opacity-50 disabled:grayscale"
          >
            {state === 'confirming' ? (
              <><Spinner size="sm" /> Salvando…</>
            ) : (
              <><CheckCircle2 size={15} /> Confirmar Encontro</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
