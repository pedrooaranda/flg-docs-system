/**
 * ClienteArea/Diarios — chat de materiais + biblioteca de slides/copies do cliente.
 *
 * Cliente vem do contexto do Outlet (definido em ClienteArea/index.jsx).
 * Não tem ClienteSelector — cliente é o do path.
 */

import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { FileText, FileDown, Eye, Trash2 } from 'lucide-react'
import { api } from '../../../lib/api'
import { Spinner } from '../../ui/Spinner'
import { formatDate } from '../../../lib/utils'
import { useToast } from '../../../lib/toast'
import ChatAgente from '../../ChatAgente'

function BibliotecaTab({ clienteId }) {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('slides')
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
    { id: 'copies', label: 'Copies',         count: copies.length },
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

  return (
    <div className="flex flex-col h-full">
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
            <span className="px-1 rounded text-[9px] font-monodeck" style={{ background: 'var(--flg-bg-hover)' }}>
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
                style={{ background: 'var(--flg-bg-card)', border: '1px solid var(--flg-border)' }}>
                <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(201,168,76,0.1)' }}>
                  <FileText size={14} style={{ color: '#C9A84C' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/80 truncate">
                    <span className="font-monodeck text-[10px] text-gold-mid mr-2">
                      E{String(s.encontro_numero).padStart(2, '0')}
                    </span>
                    Encontro {s.encontro_numero}
                  </p>
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
                style={{ background: 'var(--flg-bg-card)', border: '1px solid var(--flg-border)' }}>
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

export default function ClienteDiarios() {
  const { cliente } = useOutletContext()

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col border-r border-white/5" style={{ width: '58%' }}>
        <div className="px-4 py-2 border-b border-white/5 flex-shrink-0"
          style={{ background: 'var(--flg-bg-secondary)' }}>
          <p className="text-[11px] uppercase tracking-wider text-white/40 font-monodeck">
            Agente de Materiais
          </p>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatAgente
            endpoint={`/chat-materiais/${cliente.id}`}
            sessionId={`materiais_${cliente.id}`}
            initialMessage={`Olá! Estou pronto para desenvolver materiais estratégicos para ${cliente.nome}. O que vamos criar hoje?`}
          />
        </div>
      </div>

      <div className="flex flex-col flex-1 min-w-0" style={{ background: 'var(--flg-bg-raised)' }}>
        <div className="px-4 py-2 border-b border-white/5 flex-shrink-0"
          style={{ background: 'var(--flg-bg-secondary)' }}>
          <p className="text-[11px] uppercase tracking-wider text-white/40 font-monodeck">
            Biblioteca
          </p>
        </div>
        <BibliotecaTab clienteId={cliente.id} />
      </div>
    </div>
  )
}
