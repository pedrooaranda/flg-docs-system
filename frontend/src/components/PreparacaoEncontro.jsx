import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import ChatAgente from './ChatAgente'
import SlidesPreview from './SlidesPreview'

export default function PreparacaoEncontro() {
  const { clientId, encontroNum } = useParams()
  const navigate = useNavigate()
  const [cliente, setCliente] = useState(null)
  const [encontro, setEncontro] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showSlides, setShowSlides] = useState(false)
  const [slidesReady, setSlidesReady] = useState(false) // botão "Gerar Slides" ativado pelo agente
  const conversationRef = useRef([])

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

  function handleSlidesReady() {
    setSlidesReady(true)
  }

  function handleConfirmed() {
    navigate(`/clientes/${clientId}`)
  }

  if (loading) return <div className="flex justify-center items-center min-h-screen"><div className="w-8 h-8 border-2 border-gold-mid border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/clientes/${clientId}`)} className="text-white/40 hover:text-white text-sm transition-colors">←</button>
          <div>
            <span className="text-white/70 text-sm">{cliente?.nome}</span>
            <span className="text-white/20 mx-2">·</span>
            <span className="gold-text text-sm font-semibold">Encontro {num}</span>
            {encontro && <span className="text-white/30 text-sm ml-2">— {encontro.nome}</span>}
          </div>
        </div>

        {slidesReady && !showSlides && (
          <button
            onClick={() => setShowSlides(true)}
            className="px-5 py-2 rounded text-sm font-semibold animate-pulse"
            style={{ background: 'linear-gradient(135deg, #F5D68A 0%, #C9A84C 50%, #8B6914 100%)', color: '#080808' }}
          >
            ✦ Gerar Slides
          </button>
        )}
        {showSlides && (
          <button onClick={() => setShowSlides(false)} className="text-white/40 hover:text-white text-sm transition-colors">
            ← Chat
          </button>
        )}
      </header>

      {/* Layout 2 colunas */}
      <div className="flex-1 flex overflow-hidden">
        {/* Coluna esquerda: Chat */}
        <div className={`flex flex-col transition-all ${showSlides ? 'w-2/5 border-r border-white/5' : 'w-full'}`}>
          {/* Contexto do encontro */}
          {encontro && (
            <div className="px-5 py-3 border-b border-white/5 bg-white/2">
              <p className="text-xs tracking-widest uppercase text-white/30 mb-1">Objetivo</p>
              <p className="text-sm text-white/60 line-clamp-2">{encontro.objetivo_estrategico}</p>
            </div>
          )}

          {/* Chat */}
          <div className="flex-1 overflow-hidden">
            <ChatAgente
              clientId={clientId}
              encontroNum={num}
              onSlidesReady={handleSlidesReady}
            />
          </div>
        </div>

        {/* Coluna direita: Slides */}
        {showSlides && (
          <div className="flex-1 overflow-hidden">
            <SlidesPreview
              clientId={clientId}
              encontroNum={num}
              conversationContext=""
              onConfirmed={handleConfirmed}
            />
          </div>
        )}
      </div>
    </div>
  )
}
