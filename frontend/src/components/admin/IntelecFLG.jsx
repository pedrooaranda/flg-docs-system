import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Clock, Image, MessageSquare, ChevronRight, RotateCcw, Wand2, FileText, Code2, Sparkles, Loader2 } from 'lucide-react'
import { api, uploadImagemEncontro } from '../../lib/api'
import { Spinner, PageSpinner } from '../ui/Spinner'
import { useToast } from '../../lib/toast'
import { cn, formatDate } from '../../lib/utils'
import { useApp } from '../../contexts/AppContext'
import ChatAgente from '../ChatAgente'

const TABS = [
  { id: 'conteudo',   icon: MessageSquare, label: 'Conteúdo' },
  { id: 'estrutura',  icon: FileText,      label: 'Estrutura' },
  { id: 'html',       icon: Code2,         label: 'HTML' },
  { id: 'imagens',    icon: Image,         label: 'Imagens' },
  { id: 'chat',       icon: MessageSquare, label: 'Chat de Intelecto' },
]

function EncontroListItem({ enc, active, onClick }) {
  const hasIntelecto = !!enc.intelecto_base?.trim()
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-all cursor-pointer',
        active ? 'text-gold-mid' : 'text-white/50 hover:text-white/80 hover:bg-white/3'
      )}
      style={active ? { background: 'rgba(201,168,76,0.08)', borderLeft: '3px solid #C9A84C' } : {}}
    >
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold',
        enc.tem_slides ? 'gold-gradient text-[#080808]' : 'border border-white/15 text-white/40'
      )}>
        {enc.numero}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm truncate', active ? 'text-gold-mid font-medium' : 'text-white/70')}>
          {enc.nome || `Encontro ${enc.numero}`}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {hasIntelecto && <span className="text-[9px] text-green-400/70">✓ intelecto</span>}
          {enc.imagem_principal_url && <span className="text-[9px] text-blue-400/70">✓ imagem</span>}
        </div>
      </div>
      {active && <ChevronRight size={12} className="flex-shrink-0 text-gold-mid/50" />}
    </button>
  )
}

function ConteudoTab({ enc, onSaved }) {
  const toast = useToast()
  const { dispatch } = useApp()
  const [valor, setValor] = useState(enc.intelecto_base || '')
  const [saving, setSaving] = useState(false)
  const [historico, setHistorico] = useState([])
  const [showHistorico, setShowHistorico] = useState(false)
  const [loadingHist, setLoadingHist] = useState(false)
  // Sugestão recebida do chat (via Chat tab)
  const [pendingSugestao, setPendingSugestao] = useState(null)

  const versao = enc.intelecto_versao || 1

  // Sincronizar com enc quando o encontro muda
  useEffect(() => {
    setValor(enc.intelecto_base || '')
    setPendingSugestao(null)
  }, [enc.numero])

  // Expor setPendingSugestao via enc._onSugestao (padrão de callback via prop)
  useEffect(() => {
    if (enc._onSugestao) {
      enc._onSugestao(setPendingSugestao)
    }
  }, [enc])

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await api(`/encontros-base/${enc.numero}/com-historico`, {
        method: 'PATCH',
        body: JSON.stringify({ intelecto_base: valor }),
      })
      const novo = { ...enc, ...updated }
      onSaved(novo)
      dispatch({ type: 'ENCONTRO_UPDATE', payload: novo })
      toast?.({ title: 'Intelecto salvo', description: `Encontro ${enc.numero} — versão ${versao + 1}`, variant: 'success' })
    } catch (err) {
      toast?.({ title: 'Erro ao salvar', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function loadHistorico() {
    setLoadingHist(true)
    try {
      const data = await api(`/intelecto-historico?encontro_numero=${enc.numero}`)
      setHistorico(data)
    } catch { setHistorico([]) }
    finally { setLoadingHist(false) }
  }

  function toggleHistorico() {
    if (!showHistorico) loadHistorico()
    setShowHistorico(h => !h)
  }

  function restaurar(conteudo) {
    setValor(conteudo)
    setShowHistorico(false)
    toast?.({ title: 'Versão restaurada — salve para confirmar', variant: 'success' })
  }

  function aplicarSugestao() {
    if (!pendingSugestao) return
    setValor(pendingSugestao)
    setPendingSugestao(null)
    toast?.({ title: 'Sugestão aplicada — salve para confirmar', variant: 'success' })
  }

  const charCount = valor.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold text-white">
            {enc.nome || `Encontro ${enc.numero}`}
          </h3>
          {enc.objetivo_estrategico && (
            <p className="text-xs text-white/35 mt-0.5 line-clamp-1">{enc.objetivo_estrategico}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleHistorico} className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5">
            <Clock size={11} /> Ver histórico
          </button>
        </div>
      </div>

      {/* Versão + última edição */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] px-2 py-0.5 rounded"
          style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#C9A84C' }}>
          Versão {versao}
        </span>
        {enc.intelecto_updated_at && (
          <span className="text-[10px] text-white/25">salvo em {formatDate(enc.intelecto_updated_at)}</span>
        )}
      </div>

      {/* Banner de sugestão pendente */}
      <AnimatePresence>
        {pendingSugestao && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg"
            style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)' }}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Wand2 size={13} style={{ color: '#C9A84C' }} className="flex-shrink-0" />
              <p className="text-xs text-white/60 truncate">
                O agente gerou uma sugestão de intelecto
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={aplicarSugestao} className="btn-gold text-xs py-1.5 px-3 flex items-center gap-1.5">
                <Wand2 size={11} /> Aplicar
              </button>
              <button onClick={() => setPendingSugestao(null)}
                className="w-7 h-7 rounded flex items-center justify-center text-white/30 hover:text-white transition-colors cursor-pointer">
                <X size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Textarea principal */}
      <div>
        <textarea
          rows={16}
          value={valor}
          onChange={e => setValor(e.target.value)}
          className="input-flg font-mono text-xs leading-relaxed"
          style={{ minHeight: 400, resize: 'vertical' }}
          placeholder="Linha intelectual base para este encontro…"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-white/20">{charCount} caracteres</span>
          <button onClick={handleSave} disabled={saving} className="btn-gold flex items-center gap-2 text-xs py-2 px-4 disabled:opacity-50">
            {saving ? <Spinner size="sm" /> : <Check size={12} />}
            Salvar versão
          </button>
        </div>
      </div>

      {/* Histórico */}
      <AnimatePresence>
        {showHistorico && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="border rounded-lg overflow-hidden" style={{ background: 'var(--flg-bg-card)', borderColor: 'var(--flg-border)' }}>
              <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                <p className="text-xs text-white/50 font-medium">Versões anteriores</p>
                <button onClick={() => setShowHistorico(false)} className="text-white/25 hover:text-white transition-colors cursor-pointer"><X size={13} /></button>
              </div>
              {loadingHist ? (
                <div className="flex justify-center py-6"><Spinner size="sm" /></div>
              ) : historico.length === 0 ? (
                <p className="text-xs text-white/25 text-center py-6">Sem versões anteriores</p>
              ) : (
                <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
                  {historico.map(h => (
                    <div key={h.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-white/35 line-clamp-2 leading-relaxed mb-1">
                          {h.intelecto_conteudo.substring(0, 120)}…
                        </p>
                        <p className="text-[10px] text-white/20">
                          Versão {h.versao} · {formatDate(h.created_at)} · {h.editado_por || 'desconhecido'}
                        </p>
                      </div>
                      <button onClick={() => restaurar(h.intelecto_conteudo)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-white/40 hover:text-gold-mid border border-white/8 hover:border-gold-mid/30 transition-all cursor-pointer flex-shrink-0">
                        <RotateCcw size={10} /> Restaurar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EstruturaTab({ enc, onSaved }) {
  const toast = useToast()
  const [valor, setValor] = useState(enc.intelecto_estrutura || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await api(`/admin/encontros/${enc.numero}/intelecto`, {
        method: 'POST',
        body: JSON.stringify({ intelecto_estrutura: valor }),
      })
      toast({ title: 'Estrutura salva', variant: 'success' })
      onSaved && onSaved()
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const numSlides = (valor.match(/^SLIDE\s+\d+/gim) || []).length

  return (
    <div className="space-y-4">
      <div className="rounded-lg p-4" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.20)' }}>
        <p className="text-xs font-semibold text-amber-400 mb-2">Formato (simples)</p>
        <pre className="text-[11px] text-white/65 leading-relaxed whitespace-pre-wrap font-mono">{`SLIDE 1
Título do slide
Conteúdo: texto livre, ou
- bullet 1
- bullet 2
ou lista numerada:
1. Item um
2. Item dois

SLIDE 2
Próximo título
...`}</pre>
        <p className="text-[10px] text-white/40 mt-2">
          Sistema converte automaticamente em HTML do design system na aba HTML.
        </p>
      </div>

      <textarea
        value={valor}
        onChange={e => setValor(e.target.value)}
        rows={20}
        placeholder="SLIDE 1&#10;Título&#10;Conteúdo..."
        className="w-full px-4 py-3 rounded-lg text-sm font-mono bg-[var(--flg-bg-raised)] border border-[var(--flg-border)] text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A84C]/50 resize-y"
        style={{ minHeight: 400 }}
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-white/55">
          {numSlides} slide{numSlides === 1 ? '' : 's'} detectado{numSlides === 1 ? '' : 's'}
        </p>
        <button
          onClick={handleSave}
          disabled={saving || !valor.trim()}
          className="px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: '#C9A84C', color: '#080808' }}
        >
          {saving ? 'Salvando…' : 'Salvar estrutura'}
        </button>
      </div>
    </div>
  )
}

function HtmlTab({ enc, onSaved }) {
  const toast = useToast()
  const [html, setHtml] = useState(enc.html_intelecto || '')
  const [showRaw, setShowRaw] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [savingRaw, setSavingRaw] = useState(false)

  const hasEstrutura = !!(enc.intelecto_estrutura || '').trim()
  const hasHtml = !!(enc.html_intelecto || '').trim()

  async function handleGenerate() {
    if (!hasEstrutura) {
      toast({ title: 'Salve a estrutura primeiro', description: 'Aba Estrutura precisa estar preenchida', variant: 'error' })
      return
    }
    setGenerating(true)
    try {
      const r = await api(`/admin/encontros/${enc.numero}/gerar-html`, { method: 'POST' })
      setHtml(r.html_intelecto)
      toast({
        title: `${r.num_slides} slides gerados`,
        description: `Tokens: ${r.input_tokens} in (${r.cached_input_tokens} cached) + ${r.output_tokens} out`,
        variant: 'success',
      })
      onSaved && onSaved()
    } catch (e) {
      toast({ title: 'Erro ao gerar HTML', description: e.message, variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  async function handleSaveRaw() {
    setSavingRaw(true)
    try {
      await api(`/admin/encontros/${enc.numero}/html`, {
        method: 'POST',
        body: JSON.stringify({ html_intelecto: html }),
      })
      toast({ title: 'HTML salvo', variant: 'success' })
      onSaved && onSaved()
    } catch (e) {
      toast({ title: 'Erro ao salvar HTML', description: e.message, variant: 'error' })
    } finally {
      setSavingRaw(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating || !hasEstrutura}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#C9A84C', color: '#080808' }}
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {generating ? 'Gerando HTML…' : hasHtml ? 'Regerar HTML' : 'Gerar HTML do Design System'}
          </button>
          {enc.num_slides_intelecto > 0 && (
            <span className="text-xs text-white/55">
              {enc.num_slides_intelecto} slide{enc.num_slides_intelecto === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowRaw(s => !s)}
          className="text-xs text-white/55 hover:text-white/85 cursor-pointer transition-colors"
        >
          {showRaw ? '◄ Preview' : 'Editar HTML raw ►'}
        </button>
      </div>

      {!hasHtml && !generating && (
        <div className="rounded-lg p-6 text-center" style={{ background: 'var(--flg-bg-raised)', border: '1px dashed var(--flg-border)' }}>
          <Code2 size={24} className="mx-auto mb-2 text-white/30" />
          <p className="text-sm text-white/55">Nenhum HTML gerado ainda.</p>
          <p className="text-xs text-white/35 mt-1">
            {hasEstrutura
              ? 'Click em "Gerar HTML do Design System" pra Claude converter a estrutura.'
              : 'Salve a estrutura textual na aba Estrutura primeiro.'}
          </p>
        </div>
      )}

      {hasHtml && !showRaw && (
        <iframe
          srcDoc={`<!DOCTYPE html><html><head><link rel="stylesheet" href="/flg-design-system/css/flg.css"></head><body class="flg-deck" style="overflow:auto"><canvas id="stage-canvas"></canvas><div class="grain"></div><div class="deck">${html}</div></body></html>`}
          className="w-full rounded-lg"
          style={{ height: 600, border: '1px solid var(--flg-border)', background: 'var(--flg-bg-raised)' }}
          title="Preview do HTML intelectual"
        />
      )}

      {showRaw && (
        <>
          <textarea
            value={html}
            onChange={e => setHtml(e.target.value)}
            rows={25}
            className="w-full px-4 py-3 rounded-lg text-[11px] font-mono bg-[var(--flg-bg-raised)] border border-[var(--flg-border)] text-white/85 focus:outline-none focus:border-[#C9A84C]/50 resize-y"
            style={{ minHeight: 500 }}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setHtml(enc.html_intelecto || '')}
              className="px-3 py-2 rounded-lg text-xs text-white/65 hover:text-white cursor-pointer transition-colors"
            >
              Reverter
            </button>
            <button
              onClick={handleSaveRaw}
              disabled={savingRaw || !html.trim()}
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#C9A84C', color: '#080808' }}
            >
              {savingRaw ? 'Salvando…' : 'Salvar HTML editado'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ImagensTab({ enc, onSaved }) {
  const toast = useToast()
  const { dispatch } = useApp()
  const [uploading, setUploading] = useState(false)

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast?.({ title: 'Arquivo muito grande (máx 5MB)', variant: 'error' }); return }
    setUploading(true)
    try {
      const result = await uploadImagemEncontro(enc.numero, 'principal', file)
      const updated = { ...enc, imagem_principal_url: result.url }
      onSaved(updated)
      dispatch({ type: 'ENCONTRO_UPDATE', payload: updated })
      toast?.({ title: 'Imagem enviada', variant: 'success' })
    } catch { toast?.({ title: 'Erro ao enviar imagem', variant: 'error' }) }
    finally { setUploading(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-semibold text-white mb-1">Imagens do Encontro {enc.numero}</h3>
        <p className="text-xs text-white/35">Imagem principal para os slides. Formatos: jpg, png, webp — máx 5MB.</p>
      </div>
      <div>
        <p className="text-xs text-white/30 tracking-widest uppercase mb-3">Imagem principal</p>
        {enc.imagem_principal_url ? (
          <div className="relative w-full max-w-sm">
            <img src={enc.imagem_principal_url} alt={`Encontro ${enc.numero}`}
              className="w-full rounded-lg object-cover" style={{ border: '1px solid rgba(201,168,76,0.2)', maxHeight: 200 }} />
            <span className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded"
              style={{ background: 'rgba(0,0,0,0.7)', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.3)' }}>
              Imagem principal
            </span>
          </div>
        ) : (
          <div className="w-full max-w-sm h-36 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--flg-bg-card)', border: '2px dashed rgba(201,168,76,0.2)' }}>
            <p className="text-xs text-white/25">Sem imagem principal</p>
          </div>
        )}
        <label className="mt-3 inline-flex items-center gap-2 btn-ghost text-xs py-2 px-4 cursor-pointer">
          {uploading ? <Spinner size="sm" /> : <Image size={12} />}
          {enc.imagem_principal_url ? 'Substituir imagem' : 'Enviar imagem'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleUpload} />
        </label>
      </div>
    </div>
  )
}

export default function IntelecFLG() {
  const { encontrosBase, loading } = useApp()
  const [selectedNum, setSelectedNum] = useState(1)
  const [activeTab, setActiveTab] = useState('conteudo')
  // Sugestão do chat para o ConteudoTab
  const sugestaoSettersRef = useRef({})

  // Se AppContext ainda não carregou, usar fetch local
  const [localEncontros, setLocalEncontros] = useState([])
  useEffect(() => {
    if (encontrosBase.length === 0 && !loading) {
      api('/encontros-base').then(setLocalEncontros).catch(() => {})
    }
  }, [encontrosBase.length, loading])

  const encontros = encontrosBase.length > 0 ? encontrosBase : localEncontros

  if (loading && encontros.length === 0) return <PageSpinner />

  const enc = encontros.find(e => e.numero === selectedNum)

  function updateEncontro(updated) {
    // AppContext Realtime vai sincronizar automaticamente
    setLocalEncontros(prev => prev.map(e => e.numero === updated.numero ? updated : e))
  }

  // Callback do chat para enviar sugestão ao ConteudoTab
  function handleChatMessage(content) {
    // Só sugerir se tiver conteúdo substancial (> 200 chars)
    if (content && content.length > 200) {
      const setter = sugestaoSettersRef.current[selectedNum]
      if (setter) setter(content)
    }
  }

  // Registrar o setter do ConteudoTab
  const encWithCallback = enc ? {
    ...enc,
    _onSugestao: (setter) => {
      sugestaoSettersRef.current[selectedNum] = setter
    }
  } : null

  return (
    <div className="flex h-full overflow-hidden">
      {/* Lista lateral */}
      <div className="flex-shrink-0 overflow-y-auto"
        style={{ width: 240, borderRight: '1px solid var(--flg-border)', background: 'var(--flg-bg-raised)' }}>
        <div className="px-4 py-3 border-b border-white/5">
          <p className="text-xs tracking-widest uppercase text-white/25 font-semibold">15 Encontros</p>
        </div>
        {encontros.map(e => (
          <EncontroListItem
            key={e.numero}
            enc={e}
            active={e.numero === selectedNum}
            onClick={() => { setSelectedNum(e.numero); setActiveTab('conteudo') }}
          />
        ))}
      </div>

      {/* Painel principal */}
      {encWithCallback ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 py-2 flex-shrink-0"
            style={{ background: 'var(--flg-bg-secondary)', borderBottom: '1px solid var(--flg-border)' }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all cursor-pointer',
                  activeTab === tab.id ? 'text-gold-mid' : 'text-white/40 hover:text-white/70')}
                style={activeTab === tab.id ? { background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' } : {}}
              >
                <tab.icon size={12} />{tab.label}
              </button>
            ))}
            {activeTab === 'chat' && (
              <p className="ml-auto text-[10px] text-white/25">
                Respostas longas → banner "Aplicar" no conteúdo
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'conteudo' && (
              <ConteudoTab
                key={encWithCallback.numero}
                enc={encWithCallback}
                onSaved={updateEncontro}
                onSwitchToChat={() => setActiveTab('chat')}
              />
            )}
            {activeTab === 'estrutura' && (
              <EstruturaTab enc={encWithCallback} onSaved={updateEncontro} />
            )}
            {activeTab === 'html' && (
              <HtmlTab enc={encWithCallback} onSaved={updateEncontro} />
            )}
            {activeTab === 'imagens' && (
              <ImagensTab enc={encWithCallback} onSaved={updateEncontro} />
            )}
            {activeTab === 'chat' && (
              <div className="h-full min-h-[500px] rounded-xl overflow-hidden border border-white/5">
                <ChatAgente
                  endpoint={`/chat-intelecto/${encWithCallback.numero}`}
                  sessionId={`intelecto_${encWithCallback.numero}`}
                  initialMessage={`Vamos trabalhar no Encontro ${encWithCallback.numero}${encWithCallback.nome ? ` — ${encWithCallback.nome}` : ''}. O que você quer desenvolver? Posso gerar uma proposta de intelecto completa se você quiser.`}
                  onMessageComplete={handleChatMessage}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-white/20 text-sm">
          Selecione um encontro
        </div>
      )}
    </div>
  )
}
