import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Clock, Image, MessageSquare, ChevronRight, RotateCcw } from 'lucide-react'
import { api } from '../../lib/api'
import { Spinner, PageSpinner } from '../ui/Spinner'
import { useToast } from '../../lib/toast'
import { cn, formatDate } from '../../lib/utils'
import ChatAgente from '../ChatAgente'

const TABS = [
  { id: 'conteudo', icon: MessageSquare, label: 'Conteúdo' },
  { id: 'imagens',  icon: Image,         label: 'Imagens' },
  { id: 'chat',     icon: MessageSquare, label: 'Chat de Intelecto' },
]

function EncontroListItem({ enc, active, onClick }) {
  const hasIntelecto = !!enc.intelecto_base?.trim()
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left transition-all cursor-pointer relative',
        active ? 'text-gold-mid' : 'text-white/50 hover:text-white/80 hover:bg-white/3'
      )}
      style={active ? {
        background: 'rgba(201,168,76,0.08)',
        borderLeft: '3px solid #C9A84C',
      } : {}}
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
          {hasIntelecto && (
            <span className="text-[9px] text-green-400/70">✓ intelecto</span>
          )}
          {enc.imagem_principal_url && (
            <span className="text-[9px] text-blue-400/70">✓ imagem</span>
          )}
        </div>
      </div>
      {active && <ChevronRight size={12} className="flex-shrink-0 text-gold-mid/50" />}
    </button>
  )
}

function ConteudoTab({ enc, onSaved }) {
  const toast = useToast()
  const [valor, setValor] = useState(enc.intelecto_base || '')
  const [saving, setSaving] = useState(false)
  const [historico, setHistorico] = useState([])
  const [showHistorico, setShowHistorico] = useState(false)
  const [loadingHist, setLoadingHist] = useState(false)
  const versao = enc.intelecto_versao || 1

  async function handleSave() {
    setSaving(true)
    try {
      await api(`/encontros-base/${enc.numero}`, {
        method: 'PATCH',
        body: JSON.stringify({ intelecto_base: valor }),
      })
      onSaved({ ...enc, intelecto_base: valor })
      toast?.({ title: 'Intelecto salvo', description: `Encontro ${enc.numero} — versão ${versao}`, variant: 'success' })
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
    } catch {
      setHistorico([])
    } finally {
      setLoadingHist(false)
    }
  }

  function toggleHistorico() {
    if (!showHistorico) loadHistorico()
    setShowHistorico(h => !h)
  }

  function restaurar(versaoConteudo) {
    setValor(versaoConteudo)
    setShowHistorico(false)
    toast?.({ title: 'Versão restaurada — salve para confirmar', variant: 'success' })
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
          <button
            onClick={toggleHistorico}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all cursor-pointer btn-ghost"
          >
            <Clock size={11} />
            Ver histórico
          </button>
        </div>
      </div>

      {/* Versão badge */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] px-2 py-0.5 rounded"
          style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#C9A84C' }}>
          Versão {versao}
        </span>
        {enc.intelecto_updated_at && (
          <span className="text-[10px] text-white/25">
            salvo em {formatDate(enc.intelecto_updated_at)}
          </span>
        )}
      </div>

      {/* Textarea */}
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
          <button onClick={handleSave} disabled={saving}
            className="btn-gold flex items-center gap-2 text-xs py-2 px-4 disabled:opacity-50">
            {saving ? <Spinner size="sm" /> : <Check size={12} />}
            Salvar versão
          </button>
        </div>
      </div>

      {/* Histórico drawer */}
      <AnimatePresence>
        {showHistorico && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="border rounded-lg overflow-hidden"
              style={{ background: '#1a1a1a', borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                <p className="text-xs text-white/50 font-medium">Versões anteriores</p>
                <button onClick={() => setShowHistorico(false)}
                  className="text-white/25 hover:text-white transition-colors cursor-pointer">
                  <X size={13} />
                </button>
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
                        <RotateCcw size={10} />
                        Restaurar
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

function ImagensTab({ enc, onSaved }) {
  const toast = useToast()
  const [uploading, setUploading] = useState(false)

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast?.({ title: 'Arquivo muito grande (máx 5MB)', variant: 'error' })
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('encontro_numero', enc.numero)
      form.append('tipo', 'principal')
      const result = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/upload-imagem-encontro`, {
        method: 'POST',
        body: form,
      }).then(r => r.json())
      onSaved({ ...enc, imagem_principal_url: result.url })
      toast?.({ title: 'Imagem enviada com sucesso', variant: 'success' })
    } catch {
      toast?.({ title: 'Erro ao enviar imagem', variant: 'error' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-semibold text-white mb-1">
          Imagens do Encontro {enc.numero}
        </h3>
        <p className="text-xs text-white/35">Imagem principal usada nos slides gerados. Formatos: jpg, png, webp — máx 5MB.</p>
      </div>

      {/* Imagem principal */}
      <div>
        <p className="text-xs text-white/30 tracking-widest uppercase mb-3">Imagem principal</p>
        {enc.imagem_principal_url ? (
          <div className="relative w-full max-w-sm">
            <img src={enc.imagem_principal_url} alt={`Encontro ${enc.numero}`}
              className="w-full rounded-lg object-cover"
              style={{ border: '1px solid rgba(201,168,76,0.2)', maxHeight: 200 }}
            />
            <span className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded"
              style={{ background: 'rgba(0,0,0,0.7)', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.3)' }}>
              Imagem principal
            </span>
          </div>
        ) : (
          <div
            className="w-full max-w-sm h-36 rounded-lg flex items-center justify-center"
            style={{ background: '#1a1a1a', border: '2px dashed rgba(201,168,76,0.2)' }}
          >
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
  const [encontros, setEncontros] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedNum, setSelectedNum] = useState(1)
  const [activeTab, setActiveTab] = useState('conteudo')

  useEffect(() => {
    api('/encontros-base')
      .then(data => { setEncontros(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />

  const enc = encontros.find(e => e.numero === selectedNum)

  function updateEncontro(updated) {
    setEncontros(prev => prev.map(e => e.numero === updated.numero ? updated : e))
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Lista lateral */}
      <div
        className="flex-shrink-0 overflow-y-auto"
        style={{ width: 240, borderRight: '1px solid rgba(255,255,255,0.05)', background: '#0e0e0e' }}
      >
        <div className="px-4 py-3 border-b border-white/5">
          <p className="text-xs tracking-widest uppercase text-white/25 font-semibold">15 Encontros</p>
        </div>
        {encontros.map(e => (
          <EncontroListItem
            key={e.numero}
            enc={e}
            active={e.numero === selectedNum}
            onClick={() => setSelectedNum(e.numero)}
          />
        ))}
      </div>

      {/* Painel principal */}
      {enc ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div
            className="flex items-center gap-1 px-4 py-2 flex-shrink-0"
            style={{ background: '#111111', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all cursor-pointer',
                  activeTab === tab.id ? 'text-gold-mid' : 'text-white/40 hover:text-white/70'
                )}
                style={activeTab === tab.id ? {
                  background: 'rgba(201,168,76,0.1)',
                  border: '1px solid rgba(201,168,76,0.2)',
                } : {}}
              >
                <tab.icon size={12} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'conteudo' && (
              <ConteudoTab enc={enc} onSaved={updateEncontro} />
            )}
            {activeTab === 'imagens' && (
              <ImagensTab enc={enc} onSaved={updateEncontro} />
            )}
            {activeTab === 'chat' && (
              <div className="h-full min-h-[500px] rounded-xl overflow-hidden border border-white/5">
                <ChatAgente
                  endpoint={`/chat-intelecto/${enc.numero}`}
                  sessionId={`intelecto_${enc.numero}`}
                  initialMessage={`Vamos trabalhar no conteúdo intelectual do Encontro ${enc.numero}${enc.nome ? ` — ${enc.nome}` : ''}. O que você quer desenvolver?`}
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
