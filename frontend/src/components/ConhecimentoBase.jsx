import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, Check, X, Circle, CheckCircle2, BookOpen } from 'lucide-react'
import { api } from '../lib/api'
import { Spinner, PageSpinner } from './ui/Spinner'
import { useToast } from '../lib/toast'
import { cn } from '../lib/utils'

const TIPOS = ['geral', 'metodologia', 'encontro', 'processo', 'filosofia']

const TIPO_STYLE = {
  geral:       'border-white/20 text-white/50',
  metodologia: 'border-blue-400/30 text-blue-400',
  encontro:    'border-gold-mid/30 text-gold-mid',
  processo:    'border-green-400/30 text-green-400',
  filosofia:   'border-purple-400/30 text-purple-400',
}

function ItemCard({ item, onUpdate, onDelete, delay }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...item })
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const updated = await api(`/conhecimento-base/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      })
      onUpdate(updated)
      setEditing(false)
      toast?.({ title: 'Salvo', description: `"${form.titulo}" atualizado.`, variant: 'success' })
    } catch (err) {
      toast?.({ title: 'Erro ao salvar', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function toggleAtivo() {
    setToggling(true)
    try {
      const updated = await api(`/conhecimento-base/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ativo: !item.ativo }),
      })
      onUpdate(updated)
    } catch (err) {
      toast?.({ title: 'Erro', description: err.message, variant: 'error' })
    } finally {
      setToggling(false)
    }
  }

  function cancelEdit() {
    setForm({ ...item })
    setEditing(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay }}
      className={cn('card-flg p-5 transition-opacity', !item.ativo && 'opacity-45')}
    >
      {editing ? (
        <div className="space-y-3">
          <input
            value={form.titulo}
            onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            placeholder="Título"
            className="input-flg w-full"
            autoFocus
          />
          <div className="flex gap-3">
            <select
              value={form.tipo}
              onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
              className="input-flg flex-1"
            >
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              type="number"
              value={form.ordem}
              onChange={e => setForm(f => ({ ...f, ordem: parseInt(e.target.value) || 0 }))}
              placeholder="Ordem"
              className="input-flg w-24"
            />
          </div>
          <textarea
            rows={8}
            value={form.conteudo}
            onChange={e => setForm(f => ({ ...f, conteudo: e.target.value }))}
            placeholder="Conteúdo em texto livre ou markdown…"
            className="input-flg w-full resize-y font-mono text-xs leading-relaxed"
          />
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="btn-gold flex items-center gap-1.5 text-xs disabled:opacity-50"
            >
              {saving ? <><Spinner size="sm" /> Salvando…</> : <><Check size={12} /> Salvar</>}
            </button>
            <button onClick={cancelEdit} className="btn-ghost text-xs">Cancelar</button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <span className={cn(
                'text-[10px] px-2 py-0.5 rounded border flex-shrink-0 mt-0.5',
                TIPO_STYLE[item.tipo] || TIPO_STYLE.geral
              )}>
                {item.tipo}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-white/90 text-sm truncate">{item.titulo}</h3>
                  <span className="text-[10px] text-white/20 flex-shrink-0">#{item.ordem}</span>
                </div>
                <p className="text-xs text-white/45 mt-1.5 leading-relaxed line-clamp-4 whitespace-pre-line">
                  {item.conteudo}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={toggleAtivo}
                disabled={toggling}
                className={cn(
                  'flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-all',
                  item.ativo
                    ? 'border-green-400/25 text-green-400/70 hover:bg-green-400/10'
                    : 'border-white/8 text-white/25 hover:text-white/50'
                )}
              >
                {toggling ? <Spinner size="sm" /> : item.ativo ? <CheckCircle2 size={10} /> : <Circle size={10} />}
                {item.ativo ? 'Ativo' : 'Inativo'}
              </button>
              <button
                onClick={() => setEditing(true)}
                className="w-7 h-7 rounded-lg border border-white/8 flex items-center justify-center text-white/30 hover:text-white hover:border-white/20 transition-all"
              >
                <Pencil size={11} />
              </button>
              <button
                onClick={() => onDelete(item.id)}
                className="w-7 h-7 rounded-lg border border-white/8 flex items-center justify-center text-red-400/40 hover:text-red-400 hover:border-red-400/20 transition-all"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

function NovoForm({ onCreated, onCancel }) {
  const toast = useToast()
  const [form, setForm] = useState({ titulo: '', tipo: 'metodologia', conteudo: '', ordem: 0, ativo: true })
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!form.titulo || !form.conteudo) return
    setSaving(true)
    try {
      const created = await api('/conhecimento-base', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      onCreated(created)
      toast?.({ title: 'Criado', description: `"${form.titulo}" adicionado.`, variant: 'success' })
    } catch (err) {
      toast?.({ title: 'Erro', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="card-flg p-5 border-gold-mid/25 mb-6"
    >
      <p className="text-[10px] tracking-widest uppercase text-gold-mid mb-4">Novo Conhecimento</p>
      <div className="space-y-3">
        <input
          value={form.titulo}
          onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
          placeholder="Título (ex: Metodologia dos 15 Encontros)"
          className="input-flg w-full"
          autoFocus
        />
        <div className="flex gap-3">
          <select
            value={form.tipo}
            onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
            className="input-flg flex-1"
          >
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            type="number"
            value={form.ordem}
            onChange={e => setForm(f => ({ ...f, ordem: parseInt(e.target.value) || 0 }))}
            placeholder="Ordem"
            className="input-flg w-24"
          />
        </div>
        <textarea
          rows={10}
          value={form.conteudo}
          onChange={e => setForm(f => ({ ...f, conteudo: e.target.value }))}
          placeholder="Cole o conteúdo aqui — texto livre, markdown, etc…"
          className="input-flg w-full resize-y font-mono text-xs leading-relaxed"
        />
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleCreate}
            disabled={saving || !form.titulo || !form.conteudo}
            className="btn-gold flex items-center gap-1.5 disabled:opacity-40 disabled:grayscale"
          >
            {saving ? <><Spinner size="sm" /> Criando…</> : <><Plus size={14} /> Criar</>}
          </button>
          <button onClick={onCancel} className="btn-ghost">Cancelar</button>
        </div>
      </div>
    </motion.div>
  )
}

export default function ConhecimentoBase() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    api('/conhecimento-base')
      .then(data => { setItems(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function handleUpdate(updated) {
    setItems(its => its.map(i => i.id === updated.id ? updated : i))
  }

  async function handleDelete(id) {
    try {
      await api(`/conhecimento-base/${id}`, { method: 'DELETE' })
      setItems(its => its.filter(i => i.id !== id))
      toast?.({ title: 'Item excluído', variant: 'success' })
    } catch (err) {
      toast?.({ title: 'Erro ao excluir', description: err.message, variant: 'error' })
    }
  }

  function handleCreated(created) {
    setItems(its => [...its, created])
    setAdding(false)
  }

  const ativos = items.filter(i => i.ativo).length

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-6 max-w-4xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen size={16} className="text-gold-mid" />
            <h1 className="font-display text-2xl font-bold text-white">Base de Conhecimento</h1>
          </div>
          <p className="text-sm text-white/30">
            {ativos} entrada{ativos !== 1 ? 's' : ''} ativa{ativos !== 1 ? 's' : ''} — injetada{ativos !== 1 ? 's' : ''} em todo agente
          </p>
        </div>
        <button
          onClick={() => setAdding(a => !a)}
          className={cn('btn-gold flex items-center gap-2', adding && 'opacity-60')}
        >
          {adding ? <><X size={14} /> Cancelar</> : <><Plus size={14} /> Novo</>}
        </button>
      </div>

      {/* Info card */}
      <div className="card-flg p-4 mb-6 border-gold-mid/20">
        <p className="text-sm text-white/65 leading-relaxed">
          <span className="text-gold-mid font-medium">Como funciona:</span> tudo que você adicionar aqui é injetado automaticamente no system prompt do agente antes de cada conversa.
          Use para ensinar a metodologia FLG, descrever a jornada, definir comportamentos.
        </p>
        <p className="text-xs text-white/30 mt-2">Dica: use Markdown — títulos, listas, negrito — o agente interpreta bem.</p>
      </div>

      {/* Form novo */}
      <AnimatePresence>
        {adding && (
          <NovoForm onCreated={handleCreated} onCancel={() => setAdding(false)} />
        )}
      </AnimatePresence>

      {/* Lista */}
      {loading ? (
        <PageSpinner />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-full bg-white/3 border border-white/8 flex items-center justify-center mb-4">
            <BookOpen size={22} className="text-white/20" />
          </div>
          <p className="text-white/40 text-sm">Nenhum conhecimento cadastrado</p>
          <p className="text-white/20 text-xs mt-1">Clique em "Novo" para adicionar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <ItemCard
              key={item.id}
              item={item}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              delay={i * 0.03}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}
