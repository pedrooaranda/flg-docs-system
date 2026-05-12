/**
 * ClienteArea/Reunioes — grid dos 15 encontros do cliente.
 *
 * Cliente vem do Outlet context. Faz fetch /reunioes/:cid pra preencher
 * o status de cada encontro (intelectual_html_pronto, num_slides, pratica).
 *
 * Click no encontro card → /materiais/cliente/:cid/reunioes/:n (editor).
 *
 * Design tokens: tipografia Fraunces no título do encontro, JetBrains Mono no E0N.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { AlertCircle, Layers, Sparkles, CheckCircle2, Eye, Link2Off, Clock } from 'lucide-react'
import { api } from '../../../lib/api'
import { useApp } from '../../../contexts/AppContext'
import { Spinner } from '../../ui/Spinner'

const STATUS_VISUAL = {
  intelectual_pendente: {
    label: 'Intelectual pendente',
    color: 'rgba(255,255,255,0.30)',
    bg: 'rgba(255,255,255,0.03)',
    border: 'rgba(255,255,255,0.08)',
    Icon: Clock,
  },
  aguardando_pratica: {
    label: 'Aguardando prática',
    color: 'rgba(250,250,248,0.55)',
    bg: 'rgba(201,168,76,0.04)',
    border: 'rgba(201,168,76,0.18)',
    Icon: Sparkles,
  },
  rascunho: {
    label: 'Rascunho',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.30)',
    Icon: Sparkles,
  },
  pronto: {
    label: 'Pronto',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.08)',
    border: 'rgba(52,211,153,0.30)',
    Icon: CheckCircle2,
  },
  apresentado: {
    label: 'Apresentado',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.08)',
    border: 'rgba(96,165,250,0.30)',
    Icon: Eye,
  },
  slug_revogado: {
    label: 'Slug revogado',
    color: '#F87171',
    bg: 'rgba(248,113,113,0.06)',
    border: 'rgba(248,113,113,0.25)',
    Icon: Link2Off,
  },
}

function deriveStatus(row) {
  const p = row.pratica
  if (!row.intelectual_html_pronto) return 'intelectual_pendente'
  if (!p) return 'aguardando_pratica'
  if (p.slug_revogado_at) return 'slug_revogado'
  if (p.status === 'apresentado') return 'apresentado'
  if (p.status === 'pronto') return 'pronto'
  return 'rascunho'
}

export default function ClienteReunioes() {
  const { cliente } = useOutletContext()
  const { encontrosBase } = useApp()
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  const loadRows = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const data = await api(`/reunioes/${cliente.id}`)
      setRows(data || [])
    } catch (e) {
      setErro(e.message || 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }, [cliente.id])

  useEffect(() => { loadRows() }, [loadRows])

  // Merge com encontros_base (do AppContext, atualizado via Supabase Realtime).
  // Dados de encontros_base no AppContext são source of truth — quando admin
  // regenera o HTML em /admin/intelecto, o realtime atualiza encontrosBase aqui
  // imediatamente sem precisar refetch do endpoint /reunioes/:cid.
  const encontrosOrdenados = useMemo(() => {
    if (!rows) return []
    const baseByNum = new Map((encontrosBase || []).map(e => [e.numero, e]))
    return [...rows]
      .sort((a, b) => a.encontro_numero - b.encontro_numero)
      .map(r => {
        const base = baseByNum.get(r.encontro_numero) || null
        const intelectoHtmlBase = (base?.html_intelecto || '').trim()
        return {
          ...r,
          base,
          // Prefere dados do AppContext (realtime) sobre os do endpoint (cached)
          num_slides_intelecto: base?.num_slides_intelecto ?? r.num_slides_intelecto ?? 0,
          intelectual_html_pronto: !!intelectoHtmlBase || r.intelectual_html_pronto,
          titulo: base?.nome || r.titulo,
        }
      })
  }, [rows, encontrosBase])

  if (loading) {
    return <div className="h-full flex items-center justify-center"><Spinner size="lg" /></div>
  }

  if (erro) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-lg p-6"
          style={{ background: 'var(--flg-bg-card)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <p className="text-sm text-red-400 mb-2">Erro ao carregar:</p>
          <p className="text-xs text-white/60">{erro}</p>
          <button onClick={loadRows}
            className="mt-3 px-3 py-1.5 rounded text-xs text-white/80 hover:text-white"
            style={{ background: 'var(--flg-bg-hover)', border: '1px solid var(--flg-border)' }}>
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }

  if (encontrosOrdenados.length === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-lg p-6 text-center"
          style={{ background: 'var(--flg-bg-card)', border: '1px solid var(--flg-border)' }}>
          <AlertCircle size={28} className="text-white/20 mx-auto mb-3" />
          <p className="text-sm text-white/40">Nenhum encontro cadastrado ainda.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto px-6 py-6">
      <div className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
      >
        {encontrosOrdenados.map(row => (
          <EncontroBigCard
            key={row.encontro_numero}
            row={row}
            clienteId={cliente.id}
          />
        ))}
      </div>
    </div>
  )
}

function EncontroBigCard({ row, clienteId }) {
  const status = deriveStatus(row)
  const cfg = STATUS_VISUAL[status]
  const numero = row.encontro_numero
  const titulo = row.base?.titulo || row.titulo || `Encontro ${numero}`
  const numSlidesIntelecto = row.num_slides_intelecto || 0
  const numSlidesPratica = row.pratica?.num_slides_pratica || 0
  const slugAtivo = row.pratica?.slug && !row.pratica?.slug_revogado_at
  const clickable = row.intelectual_html_pronto

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[10px] font-semibold tracking-[0.2em] font-monodeck"
          style={{ color: cfg.color }}>
          E{String(numero).padStart(2, '0')}
        </span>
        <div className="flex items-center gap-1 text-[9px] font-monodeck tracking-wider uppercase"
          style={{ color: cfg.color }}>
          <cfg.Icon size={10} />
          {cfg.label}
        </div>
      </div>

      <p className="text-sm font-serifdeck font-medium text-white/90 line-clamp-2 leading-snug min-h-[2.5rem]">
        {titulo}
      </p>

      <div className="h-px mt-3 mb-2"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.18), transparent)' }} />

      <div className="flex items-center justify-between text-[10px] text-white/40 font-monodeck">
        <span className="flex items-center gap-1">
          <Layers size={10} /> {numSlidesIntelecto + numSlidesPratica}
          {numSlidesPratica > 0 && (
            <span className="text-gold-mid/70 ml-0.5">
              ({numSlidesIntelecto}+{numSlidesPratica})
            </span>
          )}
        </span>
        {slugAtivo && (
          <span className="text-[9px] uppercase tracking-widest text-gold-mid/70">
            link ativo
          </span>
        )}
      </div>
    </>
  )

  const cardStyle = {
    background: cfg.bg,
    border: `1px solid ${cfg.border}`,
    opacity: status === 'intelectual_pendente' ? 0.55 : 1,
  }

  if (clickable) {
    return (
      <Link
        to={`/materiais/cliente/${clienteId}/reunioes/${numero}`}
        className="rounded-xl p-4 transition-all block hover:scale-[1.015] cursor-pointer"
        style={cardStyle}
      >
        {inner}
      </Link>
    )
  }

  return (
    <div
      className="rounded-xl p-4"
      style={cardStyle}
      title="Admin precisa gerar o intelectual antes de você preparar a prática"
    >
      {inner}
    </div>
  )
}
