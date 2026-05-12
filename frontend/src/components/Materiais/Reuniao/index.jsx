/**
 * EditorReuniao — preparação da parte PRÁTICA de um encontro (por cliente).
 *
 * Rota: /materiais/reunioes/:cid/:n
 *
 * Layout split:
 *   ESQUERDA — Preview HTML (intelectual + prática) renderizado em iframe.
 *   DIREITA  — Chat consultor↔Claude (streaming) + barra de ações.
 *
 * Estado vem do backend (encontros_pratica). Cada turno do chat e cada
 * geração de HTML atualiza o registro no DB e refresca o local.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, AlertCircle } from 'lucide-react'
import { api } from '../../../lib/api'
import { useApp } from '../../../contexts/AppContext'
import { Spinner } from '../../ui/Spinner'
import { Avatar } from '../../ui/Avatar'
import PreviewIntelecto from './PreviewIntelecto'
import ChatGerador from './ChatGerador'
import ActionsBar from './ActionsBar'

export default function EditorReuniao({ session }) {
  const { cid, n } = useParams()
  const encontroNumero = parseInt(n, 10)
  const navigate = useNavigate()
  const { clientes, encontrosBase } = useApp()

  const cliente = clientes.find(c => c.id === cid)
  const encontro = encontrosBase.find(e => e.numero === encontroNumero)

  const [pratica, setPratica] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  const loadPratica = useCallback(async () => {
    if (!cid || !encontroNumero) return
    setLoading(true)
    setErro(null)
    try {
      const data = await api(`/reunioes/${cid}/${encontroNumero}`)
      setPratica(data)
    } catch (e) {
      setErro(e.message || 'Erro ao carregar prática')
    } finally {
      setLoading(false)
    }
  }, [cid, encontroNumero])

  useEffect(() => { loadPratica() }, [loadPratica])

  if (!cliente || !encontro) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-lg p-6 text-center"
          style={{ background: 'var(--flg-bg-card)', border: '1px solid var(--flg-border)' }}>
          <AlertCircle size={28} className="text-white/30 mx-auto mb-3" />
          <p className="text-sm text-white/70">
            {!cliente ? 'Cliente não encontrado.' : 'Encontro não encontrado.'}
          </p>
          <Link to="/materiais/reunioes"
            className="inline-flex items-center gap-1.5 mt-4 text-xs text-gold-mid hover:underline">
            <ChevronLeft size={12} /> Voltar pro grid
          </Link>
        </div>
      </div>
    )
  }

  if (!encontro.html_intelecto || !encontro.html_intelecto.trim()) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-lg p-6 text-center"
          style={{ background: 'var(--flg-bg-card)', border: '1px solid var(--flg-border)' }}>
          <AlertCircle size={28} className="text-amber-400/60 mx-auto mb-3" />
          <p className="text-sm text-white/80 mb-1">Parte intelectual ainda não gerada</p>
          <p className="text-xs text-white/40">
            Encontro {encontroNumero}: <span className="text-white/60">{encontro.titulo || `Encontro ${encontroNumero}`}</span>
          </p>
          <p className="text-xs text-white/30 mt-3">
            Admin precisa criar a estrutura + gerar HTML em <code>Intelecto FLG</code> antes de você preparar a prática.
          </p>
          <Link to="/materiais/reunioes"
            className="inline-flex items-center gap-1.5 mt-4 text-xs text-gold-mid hover:underline">
            <ChevronLeft size={12} /> Voltar pro grid
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (erro) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-lg p-6"
          style={{ background: 'var(--flg-bg-card)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <p className="text-sm text-red-400 mb-2">Erro ao carregar:</p>
          <p className="text-xs text-white/60">{erro}</p>
          <button onClick={loadPratica}
            className="mt-3 px-3 py-1.5 rounded text-xs text-white/80 hover:text-white"
            style={{ background: 'var(--flg-bg-hover)', border: '1px solid var(--flg-border)' }}>
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/5 flex-shrink-0">
        <Link to="/materiais/reunioes"
          className="flex items-center gap-1 text-xs text-white/40 hover:text-white/80 transition-colors">
          <ChevronLeft size={14} /> Reuniões
        </Link>
        <span className="text-white/20">/</span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar name={cliente.nome} size="xs" />
          <p className="text-sm text-white/85 font-medium truncate">{cliente.nome}</p>
          <span className="text-white/20">·</span>
          <p className="text-xs text-gold-mid font-semibold">
            E{String(encontroNumero).padStart(2, '0')}
          </p>
          <span className="text-white/20">·</span>
          <p className="text-xs text-white/50 truncate">
            {encontro.titulo || `Encontro ${encontroNumero}`}
          </p>
        </div>
        <ActionsBar
          pratica={pratica}
          onChanged={(updated) => setPratica(updated)}
          cliente={cliente}
          encontroNumero={encontroNumero}
        />
      </div>

      {/* Split */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex flex-col border-r border-white/5" style={{ width: '58%' }}>
          <div className="px-4 py-2 border-b border-white/5 flex-shrink-0 flex items-center justify-between"
            style={{ background: 'var(--flg-bg-secondary)' }}>
            <p className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">
              Preview
            </p>
            <p className="text-[10px] text-white/30">
              {(encontro.num_slides_intelecto || 0)} intelectuais · {(pratica?.num_slides_pratica || 0)} práticos
            </p>
          </div>
          <div className="flex-1 overflow-hidden bg-black">
            <PreviewIntelecto
              htmlIntelecto={encontro.html_intelecto}
              htmlPratica={pratica?.html_pratica}
            />
          </div>
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          <div className="px-4 py-2 border-b border-white/5 flex-shrink-0"
            style={{ background: 'var(--flg-bg-secondary)' }}>
            <p className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">
              Chat com Claude — preparação prática
            </p>
          </div>
          <ChatGerador
            clienteId={cid}
            encontroNumero={encontroNumero}
            conversa={pratica?.conversa_chat || []}
            onPraticaChanged={(updated) => setPratica(updated)}
            onReloadPratica={loadPratica}
          />
        </div>
      </div>
    </div>
  )
}
