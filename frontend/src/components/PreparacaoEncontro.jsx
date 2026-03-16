import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Sparkles, LayoutPanelLeft, MessageSquare } from 'lucide-react'
import { api } from '../lib/api'
import { Spinner } from './ui/Spinner'
import { cn } from '../lib/utils'
import ChatAgente from './ChatAgente'
import SlidesPreview from './SlidesPreview'

export default function PreparacaoEncontro() {
  const { clientId, encontroNum } = useParams()
  const navigate = useNavigate()
  const [cliente, setCliente] = useState(null)
  const [encontro, setEncontro] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showSlides, setShowSlides] = useState(false)
  const [slidesReady, setSlidesReady] = useState(false)

  const num = parseInt(encontroNum)

  useEffect(() => {
    Promise.all([
      api(`/clientes/${clientId}`),
      api(`/encontros-base`),
    ]).then(([c, bases]) => {
      setCliente(c)
      setEncontro(bases.find(b => b.numero === num) || null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [clientId, num])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#080808]">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#080808] text-white overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-white/5 px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(`/clientes/${clientId}`)}
            className="w-8 h-8 rounded-lg border border-white/8 flex items-center justify-center text-white/40 hover:text-white hover:border-white/20 transition-all flex-shrink-0"
          >
            <ArrowLeft size={14} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white/60 text-sm truncate">{cliente?.nome}</span>
              <span className="text-white/15">·</span>
              <span className="text-gold-mid text-sm font-semibold">Encontro {num}</span>
              {encontro?.nome && (
                <span className="text-white/30 text-sm hidden sm:inline truncate">— {encontro.nome}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Toggle chat/slides */}
          {showSlides && (
            <button
              onClick={() => setShowSlides(false)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all',
                'border border-white/8 text-white/50 hover:text-white hover:border-white/20'
              )}
            >
              <MessageSquare size={12} />
              Chat
            </button>
          )}

          {/* Gerar slides CTA — pulsa quando pronto */}
          <AnimatePresence>
            {slidesReady && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => setShowSlides(true)}
                className={cn(
                  'btn-gold flex items-center gap-1.5 text-sm',
                  !showSlides && 'animate-pulse-gold'
                )}
              >
                <Sparkles size={13} />
                {showSlides ? 'Preview' : 'Gerar Slides'}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Conteúdo — layout adaptável */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat column */}
        <div className={cn(
          'flex flex-col transition-all duration-300',
          showSlides ? 'w-2/5 border-r border-white/5' : 'w-full'
        )}>
          {/* Objetivo do encontro */}
          {encontro?.objetivo_estrategico && (
            <div className="flex-shrink-0 px-5 py-3 border-b border-white/5 bg-white/[0.015]">
              <p className="text-[10px] tracking-widest uppercase text-white/25 mb-1">Objetivo</p>
              <p className="text-xs text-white/55 leading-relaxed line-clamp-2">
                {encontro.objetivo_estrategico}
              </p>
            </div>
          )}

          {/* Chat */}
          <div className="flex-1 overflow-hidden">
            <ChatAgente
              clientId={clientId}
              encontroNum={num}
              onSlidesReady={() => setSlidesReady(true)}
            />
          </div>
        </div>

        {/* Slides column */}
        <AnimatePresence>
          {showSlides && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 overflow-hidden"
            >
              <SlidesPreview
                clientId={clientId}
                encontroNum={num}
                conversationContext=""
                onConfirmed={() => navigate(`/clientes/${clientId}`)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
