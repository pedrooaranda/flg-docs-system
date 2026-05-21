/**
 * Viewer de um debriefing pronto.
 *
 * Mostra:
 *   - Breadcrumb "← Histórico"
 *   - Header com ciclo, período, custo, tokens
 *   - Render do markdown_content (via dangerouslySetInnerHTML após md→html)
 *   - Botão "Baixar PDF" → GET /debriefings/:id/pdf retorna signed_url
 *
 * Markdown render: usamos markdown-it se disponível, fallback simples regex
 * pra cabeçalhos e listas. Mantemos render simples — o PDF é o canal oficial,
 * o viewer in-app é referência rápida.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Download, Clock, FileText, Loader2, AlertCircle,
} from 'lucide-react'
import { api } from '../../lib/api'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}

/**
 * Markdown render minimalista (sem dependência extra no bundle).
 * Cobre: # ## ###, **bold**, *italic*, listas - / 1., tabelas |, hr, code.
 */
function renderMarkdown(md) {
  if (!md) return ''
  let html = md

  // Escape HTML inicial
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Blocos de código triplo
  html = html.replace(/```[\s\S]*?```/g, m => `<pre class="md-pre">${m.slice(3, -3).trim()}</pre>`)

  // Tabelas (simples — detecta linhas com pipes e separador --- na 2ª linha)
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

  // HRs
  html = html.replace(/^---+$/gm, '<hr class="md-hr">')

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="md-quote">$1</blockquote>')

  // Listas (- ou *)
  html = html.replace(/^(?:[-*] .+\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map(l => l.replace(/^[-*] /, ''))
    return '<ul class="md-ul">' + items.map(i => `<li>${i}</li>`).join('') + '</ul>'
  })

  // Listas numeradas (1. 2. ...)
  html = html.replace(/^(?:\d+\. .+\n?)+/gm, (block) => {
    const items = block.trim().split('\n').map(l => l.replace(/^\d+\. /, ''))
    return '<ol class="md-ol">' + items.map(i => `<li>${i}</li>`).join('') + '</ol>'
  })

  // Bold / italic / code inline
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')

  // Quebras de parágrafo (linhas duplas)
  html = html.split(/\n{2,}/).map(p => {
    if (/^<(h\d|ul|ol|table|hr|blockquote|pre)/.test(p)) return p
    return `<p class="md-p">${p.replace(/\n/g, '<br>')}</p>`
  }).join('\n')

  return html
}

export default function DebriefingViewer() {
  const { clientId, debriefingId } = useParams()
  const navigate = useNavigate()
  const [debriefing, setDebriefing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api(`/debriefings/${debriefingId}`)
      .then(d => { if (!cancelled) setDebriefing(d) })
      .catch(e => { if (!cancelled) setError(e.message || 'Erro ao carregar') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debriefingId])

  async function handleDownloadPdf() {
    setDownloading(true)
    try {
      const { signed_url } = await api(`/debriefings/${debriefingId}/pdf`)
      if (signed_url) window.open(signed_url, '_blank')
    } catch (e) {
      alert(`Erro ao gerar download: ${e.message}`)
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <Loader2 size={20} className="animate-spin text-gold-mid" />
      </div>
    )
  }

  if (error || !debriefing) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="rounded-xl p-6 text-center"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}>
          <AlertCircle size={20} className="text-red-400 mx-auto mb-2" />
          <p className="text-sm text-white/75">{error || 'Debriefing não encontrado'}</p>
        </div>
      </div>
    )
  }

  const html = renderMarkdown(debriefing.markdown_content || '')

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-8 space-y-6">
      {/* Breadcrumb */}
      <button
        type="button"
        onClick={() => navigate(`/clientes/${clientId}/debriefings`)}
        className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-gold-mid transition-colors cursor-pointer"
      >
        <ArrowLeft size={11} /> Histórico de Debriefings
      </button>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="pb-5 space-y-3"
        style={{ borderBottom: '1px solid var(--flg-border)' }}
      >
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-gold-mid" />
          <p className="text-[10px] tracking-[0.25em] uppercase text-gold-mid/70 font-monodeck">
            Debriefing · Ciclo {debriefing.ciclo_numero}
          </p>
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serifdeck text-3xl font-medium text-white leading-tight">
              {formatDate(debriefing.periodo_inicio)} → {formatDate(debriefing.periodo_fim)}
            </h1>
            <p className="text-xs text-white/45 mt-2 flex items-center gap-3 flex-wrap font-monodeck">
              <span className="inline-flex items-center gap-1"><Clock size={11} /> Gerado em {formatDate(debriefing.gerado_at)}</span>
              {debriefing.duracao_segundos != null && <span>· {debriefing.duracao_segundos}s</span>}
              {debriefing.custo_usd != null && <span>· ${Number(debriefing.custo_usd).toFixed(2)}</span>}
              {debriefing.num_tasks_clickup != null && <span>· {debriefing.num_tasks_clickup} tasks</span>}
              {debriefing.num_docs_drive != null && <span>· {debriefing.num_docs_drive} docs</span>}
            </p>
          </div>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading || !debriefing.pdf_storage_path}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
            style={{
              background: 'rgba(201,168,76,0.18)',
              color: '#C9A84C',
              border: '1px solid rgba(201,168,76,0.45)',
            }}
          >
            <Download size={12} />
            {downloading ? 'Gerando link…' : 'Baixar PDF'}
          </button>
        </div>
      </motion.div>

      {/* Markdown render */}
      <div
        className="debriefing-md text-sm text-white/80 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <style>{`
        .debriefing-md .md-h1 { font-family: var(--font-serifdeck, Fraunces, Georgia, serif); font-size: 1.7rem; font-weight: 500; color: rgba(255,255,255,0.95); margin: 1.5rem 0 0.8rem; padding-bottom: 0.6rem; border-bottom: 2px solid rgba(201,168,76,0.6); }
        .debriefing-md .md-h2 { font-family: var(--font-serifdeck, Fraunces, Georgia, serif); font-size: 1.25rem; font-weight: 500; color: #C9A84C; margin: 1.6rem 0 0.6rem; padding-bottom: 0.3rem; border-bottom: 1px solid rgba(201,168,76,0.2); }
        .debriefing-md .md-h3 { font-size: 0.95rem; font-weight: 600; color: rgba(255,255,255,0.85); margin: 1rem 0 0.3rem; text-transform: uppercase; letter-spacing: 0.04em; }
        .debriefing-md .md-p { margin: 0 0 0.7rem; }
        .debriefing-md .md-ul, .debriefing-md .md-ol { margin: 0 0 0.8rem 1.2rem; }
        .debriefing-md .md-ul li, .debriefing-md .md-ol li { margin-bottom: 0.2rem; }
        .debriefing-md .md-quote { border-left: 3px solid #C9A84C; padding: 0.6rem 1rem; background: rgba(201,168,76,0.06); margin: 0.5rem 0 1rem; color: rgba(255,255,255,0.75); }
        .debriefing-md .md-hr { border: none; border-top: 1px solid rgba(255,255,255,0.10); margin: 1.4rem 0; }
        .debriefing-md .md-code { background: rgba(255,255,255,0.05); padding: 0 0.3rem; border-radius: 3px; font-family: monospace; font-size: 0.85em; color: #C9A84C; }
        .debriefing-md .md-pre { background: rgba(255,255,255,0.03); padding: 0.8rem; border-radius: 6px; font-family: monospace; font-size: 0.85em; overflow-x: auto; white-space: pre-wrap; }
        .debriefing-md .md-table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1rem; font-size: 0.85rem; }
        .debriefing-md .md-table th { background: rgba(201,168,76,0.10); color: #C9A84C; padding: 0.4rem 0.6rem; text-align: left; font-weight: 600; border-bottom: 1px solid rgba(201,168,76,0.30); }
        .debriefing-md .md-table td { padding: 0.4rem 0.6rem; border-bottom: 1px solid rgba(255,255,255,0.06); }
      `}</style>
    </div>
  )
}
