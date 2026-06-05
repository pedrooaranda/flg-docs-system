/**
 * Tela "Briefing do Consultor" (sub-projeto 3 Debriefings).
 *
 * Acessada via /clientes/:id/briefing-consultor (sob MainLayout).
 *
 * Consultor escreve percepção pessoal sobre o cliente — texto livre, auto-save.
 * Embaixo, cards de debriefings já gerados (expansíveis inline, read-only).
 */
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ChevronDown, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useAutoSave, AutoSaveIndicator } from '../hooks/useAutoSave.jsx'
import { PageSpinner } from './ui/Spinner'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

/**
 * Markdown render minimalista (sem dependência extra no bundle).
 * Mirror do renderMarkdown em Debriefings/Viewer.jsx — mantém visual consistente.
 */
function renderMarkdown(md) {
  if (!md) return ''
  let html = md
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  html = html.replace(/```[\s\S]*?```/g, m => `<pre class="md-pre">${m.slice(3, -3).trim()}</pre>`)
  html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (block) => {
    const lines = block.trim().split('\n')
    if (lines.length < 2) return block
    const sep = lines[1]
    if (!/^\|\s*-+/.test(sep)) return block
    const headers = lines[0].split('|').slice(1, -1).map(c => c.trim())
    const rows = lines.slice(2).map(l => l.split('|').slice(1, -1).map(c => c.trim()))
    return (
      '<table class="md-table"><thead><tr>'
      + headers.map(h => `<th>${h}</th>`).join('')
      + '</tr></thead><tbody>'
      + rows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('')
      + '</tbody></table>'
    )
  })
  html = html.replace(/^---+$/gm, '<hr class="md-hr">')
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="md-quote">$1</blockquote>')
  html = html.replace(/^(?:[-*] .+\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map(l => l.replace(/^[-*] /, ''))
    return '<ul class="md-ul">' + items.map(i => `<li>${i}</li>`).join('') + '</ul>'
  })
  html = html.replace(/^(?:\d+\. .+\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map(l => l.replace(/^\d+\. /, ''))
    return '<ol class="md-ol">' + items.map(i => `<li>${i}</li>`).join('') + '</ol>'
  })
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
  html = html.split(/\n{2,}/).map(p => {
    if (/^<(h\d|ul|ol|table|hr|blockquote|pre)/.test(p)) return p
    return `<p class="md-p">${p.replace(/\n/g, '<br>')}</p>`
  }).join('\n')
  return html
}

function StatusBadge({ status }) {
  const map = {
    gerando: { Icon: Loader2, color: '#FBBF24', label: 'Gerando', spin: true },
    pronto:  { Icon: CheckCircle2, color: '#34D399', label: 'Pronto' },
    falhou:  { Icon: AlertCircle, color: '#F87171', label: 'Falhou' },
  }
  const cfg = map[status] || { Icon: AlertCircle, color: '#888', label: status }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full uppercase"
          style={{ color: cfg.color, background: `${cfg.color}1A`, border: `1px solid ${cfg.color}50` }}>
      <cfg.Icon size={10} className={cfg.spin ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  )
}

function DebriefingCard({ debriefing }) {
  const [expanded, setExpanded] = useState(false)
  const [markdown, setMarkdown] = useState(null)
  const [downloading, setDownloading] = useState(false)

  async function toggle() {
    if (expanded) { setExpanded(false); return }
    if (markdown === null) {
      try {
        const data = await api(`/debriefings/${debriefing.id}`)
        setMarkdown(data?.markdown_content || '*(sem conteúdo)*')
      } catch (err) {
        setMarkdown(`*(falha ao carregar: ${err?.message || 'erro'})*`)
      }
    }
    setExpanded(true)
  }

  async function handleDownloadPdf(e) {
    e.preventDefault()
    e.stopPropagation()
    if (downloading) return
    setDownloading(true)
    try {
      const { signed_url } = await api(`/debriefings/${debriefing.id}/pdf`)
      if (signed_url) window.open(signed_url, '_blank')
    } catch (err) {
      alert(`Erro ao gerar download: ${err?.message || 'erro'}`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="card-flg p-4">
      <button onClick={toggle} className="w-full flex items-center justify-between text-left">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-semibold">Ciclo {debriefing.ciclo_numero}</span>
            <StatusBadge status={debriefing.status} />
          </div>
          <p className="text-xs text-white/50">{formatDate(debriefing.created_at)}</p>
        </div>
        <ChevronDown size={16} className={`text-white/40 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-white/10">
              {markdown === null ? (
                <p className="text-white/45 text-sm">Carregando…</p>
              ) : (
                <div
                  className="debriefing-markdown text-sm text-white/85"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
                />
              )}
            </div>
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="inline-block mt-3 text-xs text-[#C9A84C] hover:underline disabled:opacity-50"
            >
              {downloading ? 'Gerando…' : 'Baixar PDF →'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function BriefingConsultor() {
  const { id: clientId } = useParams()
  const navigate = useNavigate()

  const [cliente, setCliente] = useState(null)
  const [conteudo, setConteudo] = useState(null)  // null = loading, '' = empty, string = loaded
  const [debriefings, setDebriefings] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const { status: saveStatus } = useAutoSave(
    `/briefings-consultor/cliente/${clientId}/me`,
    'conteudo',
    conteudo,
  )

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api(`/clientes/${clientId}`),
      api(`/briefings-consultor/cliente/${clientId}/me`),
      api(`/debriefings?cliente_id=${clientId}`),
    ])
      .then(([cl, brief, debs]) => {
        if (cancelled) return
        setCliente(cl)
        setConteudo(brief?.conteudo || '')
        setDebriefings(debs || [])
      })
      .catch(err => { if (!cancelled) setLoadError(err?.message || 'Falha ao carregar') })
    return () => { cancelled = true }
  }, [clientId])

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="text-center text-red-400 text-sm">{loadError}</div>
      </div>
    )
  }

  if (cliente === null || conteudo === null) return <PageSpinner />

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <button
        onClick={() => navigate(`/clientes/${clientId}`)}
        className="flex items-center gap-2 text-xs text-white/50 hover:text-white/80 mb-6 transition-colors"
      >
        <ArrowLeft size={14} />
        Voltar pro cliente
      </button>

      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-white">Briefing do Consultor</h1>
        <p className="text-white/55 text-sm mt-1">{cliente.nome} · {cliente.empresa}</p>
      </div>

      <div className="card-flg p-5 mb-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] tracking-widest uppercase text-white/45 font-medium">Sua percepção</span>
          <AutoSaveIndicator status={saveStatus} />
        </div>
        <textarea
          value={conteudo}
          onChange={e => setConteudo(e.target.value)}
          rows={14}
          placeholder="Escreva o que considera importante o time comercial saber sobre esse cliente antes de gerar o debriefing oficial de renovação…"
          className="w-full bg-transparent text-white text-sm leading-relaxed resize-none focus:outline-none placeholder:text-white/25"
          autoFocus
        />
      </div>
      <p className="text-xs text-white/45 mb-10">
        Salva automaticamente. Vai aparecer pro time comercial no hub de Debriefings deste cliente.
      </p>

      <div className="border-t border-white/10 pt-6">
        <h2 className="font-display text-xl font-semibold text-white mb-4">Debriefings já gerados</h2>
        {debriefings === null ? (
          <p className="text-white/45 text-sm">Carregando…</p>
        ) : debriefings.length === 0 ? (
          <div className="card-flg p-8 text-center">
            <p className="text-white/55 text-sm">Nenhum debriefing gerado ainda pra esse cliente.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {debriefings.map(d => <DebriefingCard key={d.id} debriefing={d} />)}
          </div>
        )}
      </div>
    </div>
  )
}
