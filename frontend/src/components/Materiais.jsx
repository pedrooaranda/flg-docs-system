import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, FileText, FileDown, Eye, Trash2, Upload, ChevronDown } from 'lucide-react'
import { api } from '../lib/api'
import { Avatar } from './ui/Avatar'
import { Spinner } from './ui/Spinner'
import { formatDate } from '../lib/utils'
import { useToast } from '../lib/toast'
import ChatAgente from './ChatAgente'

function ClienteSelector({ clientes, selectedId, onSelect }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = clientes.find(c => c.id === selectedId)
  const filtered = clientes.filter(c =>
    !search || c.nome?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-all cursor-pointer"
        style={{
          background: '#1a1a1a',
          border: '1px solid rgba(201,168,76,0.2)',
          color: selected ? '#FAFAF8' : 'rgba(250,250,248,0.35)',
          minWidth: 220,
        }}
      >
        {selected ? (
          <>
            <Avatar name={selected.nome} size="xs" />
            <span className="flex-1 text-left truncate">{selected.nome}</span>
          </>
        ) : (
          <span className="flex-1 text-left">Selecionar cliente…</span>
        )}
        <ChevronDown size={14} className="flex-shrink-0 text-white/30" />
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 left-0 z-50 w-72 rounded-lg overflow-hidden shadow-2xl"
          style={{ background: '#1a1a1a', border: '1px solid rgba(201,168,76,0.2)' }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded bg-white/5 border border-white/8 text-white/80 focus:outline-none focus:border-gold-mid/40"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => { onSelect(c.id); setOpen(false); setSearch('') }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors cursor-pointer text-left"
              >
                <Avatar name={c.nome} size="xs" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm">{c.nome}</p>
                  <p className="text-[10px] text-white/30 truncate">{c.empresa}</p>
                </div>
                <span className="text-[10px] text-gold-mid flex-shrink-0">E{c.encontro_atual || 1}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-xs text-white/30 text-center">Nenhum cliente encontrado</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function BibliotecaTab({ clienteId, activeTab, setActiveTab }) {
  const toast = useToast()
  const [slides, setSlides] = useState([])
  const [copies, setCopies] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!clienteId) return
    setLoading(true)
    Promise.all([
      api(`/encontros-realizados?cliente_id=${clienteId}`).catch(() => []),
      api(`/materiais-copy?cliente_id=${clienteId}`).catch(() => []),
    ]).then(([enc, cop]) => {
      setSlides(enc.filter(e => e.slides_url || e.pdf_url))
      setCopies(cop)
      setLoading(false)
    })
  }, [clienteId])

  const tabs = [
    { id: 'slides', label: 'Slides Gerados', count: slides.length },
    { id: 'copies', label: 'Copies', count: copies.length },
  ]

  async function deleteCopy(id) {
    try {
      await api(`/materiais-copy/${id}`, { method: 'DELETE' })
      setCopies(c => c.filter(x => x.id !== id))
      toast?.({ title: 'Removido', variant: 'success' })
    } catch {
      toast?.({ title: 'Erro ao remover', variant: 'error' })
    }
  }

  if (!clienteId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <FileText size={32} className="text-white/15 mx-auto mb-3" />
          <p className="text-sm text-white/30">Selecione um cliente para ver os materiais</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-1 p-3 border-b border-white/5 flex-shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all cursor-pointer"
            style={activeTab === t.id ? {
              background: 'rgba(201,168,76,0.12)',
              color: '#C9A84C',
              border: '1px solid rgba(201,168,76,0.25)',
            } : {
              color: 'rgba(250,250,248,0.4)',
              border: '1px solid transparent',
            }}
          >
            {t.label}
            <span className="px-1 rounded text-[9px]" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner size="md" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {activeTab === 'slides' && (
            slides.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-xs text-white/25">Nenhum slide gerado ainda</p>
              </div>
            ) : slides.map(s => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg"
                style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(201,168,76,0.1)' }}>
                  <FileText size={14} style={{ color: '#C9A84C' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/80 truncate">Encontro {s.encontro_numero}</p>
                  <p className="text-[10px] text-white/30">{formatDate(s.created_at)}</p>
                </div>
                <div className="flex gap-1">
                  {s.slides_url && (
                    <a href={s.slides_url} target="_blank" rel="noreferrer"
                      className="w-7 h-7 rounded flex items-center justify-center text-white/30 hover:text-white transition-colors border border-white/8 hover:border-white/20">
                      <Eye size={12} />
                    </a>
                  )}
                  {s.pdf_url && (
                    <a href={s.pdf_url} download
                      className="w-7 h-7 rounded flex items-center justify-center text-white/30 hover:text-white transition-colors border border-white/8 hover:border-white/20">
                      <FileDown size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))
          )}

          {activeTab === 'copies' && (
            copies.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-xs text-white/25">Nenhuma copy salva ainda</p>
              </div>
            ) : copies.map(c => (
              <div key={c.id} className="p-3 rounded-lg"
                style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm text-white/80 font-medium truncate">
                    {c.titulo || c.tipo_material}
                  </p>
                  <button onClick={() => deleteCopy(c.id)}
                    className="w-6 h-6 rounded flex items-center justify-center text-white/20 hover:text-red-400 transition-colors cursor-pointer flex-shrink-0">
                    <Trash2 size={11} />
                  </button>
                </div>
                <p className="text-[11px] text-white/35 line-clamp-2 leading-relaxed">{c.conteudo}</p>
                <p className="text-[10px] text-white/20 mt-2">{formatDate(c.created_at)}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function Materiais({ session }) {
  const [searchParams] = useSearchParams()
  const [clientes, setClientes] = useState([])
  const [selectedId, setSelectedId] = useState(searchParams.get('cliente') || '')
  const [activeTab, setActiveTab] = useState('slides')

  useEffect(() => {
    api('/clientes').then(setClientes).catch(() => {})
  }, [])

  const cliente = clientes.find(c => c.id === selectedId)

  return (
    <div className="flex flex-col h-full">
      {/* Header com seletor */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5 flex-shrink-0">
        <ClienteSelector
          clientes={clientes}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {cliente && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="h-4 w-px bg-white/10" />
            <p className="text-sm text-white/40">
              Encontro atual: <span className="text-gold-mid font-semibold">{cliente.encontro_atual || 1}</span>
            </p>
            <span className="text-white/20">·</span>
            <p className="text-sm text-white/40">{cliente.consultor_responsavel}</p>
          </motion.div>
        )}
      </div>

      {/* Layout duas colunas */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat */}
        <div className="flex flex-col border-r border-white/5" style={{ width: '55%' }}>
          {selectedId ? (
            <>
              <div className="px-4 py-2.5 border-b border-white/5 flex-shrink-0"
                style={{ background: '#111111' }}>
                <p className="text-xs text-white/30">
                  Agente de Materiais
                  {cliente && <span className="text-gold-mid ml-1">— {cliente.nome}</span>}
                </p>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatAgente
                  endpoint={`/chat-materiais/${selectedId}`}
                  sessionId={`materiais_${selectedId}`}
                  initialMessage={cliente
                    ? `Olá! Estou pronto para desenvolver materiais estratégicos para ${cliente.nome}. O que vamos criar hoje?`
                    : 'Olá! Selecione um cliente para começarmos.'
                  }
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8"
              style={{ background: '#141414' }}>
              <div className="text-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)' }}>
                  <FileText size={20} style={{ color: '#C9A84C' }} />
                </div>
                <p className="text-sm text-white/30 mb-1">Selecione um cliente acima</p>
                <p className="text-xs text-white/20">para iniciar o chat de materiais</p>
              </div>
            </div>
          )}
        </div>

        {/* Biblioteca */}
        <div className="flex flex-col" style={{ flex: 1, background: '#0e0e0e' }}>
          <div className="px-4 py-2.5 border-b border-white/5 flex-shrink-0"
            style={{ background: '#111111' }}>
            <p className="text-xs text-white/30">Biblioteca de Materiais</p>
          </div>
          <BibliotecaTab
            clienteId={selectedId}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        </div>
      </div>
    </div>
  )
}
