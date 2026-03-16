import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

const TIPOS = ['geral', 'metodologia', 'encontro', 'processo', 'filosofia']

const TIPO_COLORS = {
  geral:       'text-white/50 border-white/20',
  metodologia: 'text-blue-400 border-blue-400/30',
  encontro:    'text-gold-mid border-gold-mid/30',
  processo:    'text-green-400 border-green-400/30',
  filosofia:   'text-purple-400 border-purple-400/30',
}

function ItemCard({ item, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(item)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const updated = await api(`/conhecimento-base/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      })
      onUpdate(updated)
      setEditing(false)
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleAtivo() {
    const updated = await api(`/conhecimento-base/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ativo: !item.ativo }),
    })
    onUpdate(updated)
  }

  return (
    <div className={`card-flg p-5 transition-opacity ${!item.ativo ? 'opacity-40' : ''}`}>
      {editing ? (
        <div className="space-y-3">
          <input
            value={form.titulo}
            onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gold-mid"
            placeholder="Título"
          />
          <div className="flex gap-3">
            <select
              value={form.tipo}
              onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gold-mid"
            >
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              type="number"
              value={form.ordem}
              onChange={e => setForm(f => ({ ...f, ordem: parseInt(e.target.value) }))}
              className="w-20 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gold-mid"
              placeholder="Ordem"
            />
          </div>
          <textarea
            rows={8}
            value={form.conteudo}
            onChange={e => setForm(f => ({ ...f, conteudo: e.target.value }))}
            className="w-full bg-white/5 border border-gold-mid/30 rounded px-3 py-2 text-sm text-white focus:outline-none resize-y font-mono leading-relaxed"
            placeholder="Conteúdo em texto livre ou markdown…"
          />
          <div className="flex gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 rounded text-xs font-semibold disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #F5D68A 0%, #C9A84C 50%, #8B6914 100%)', color: '#080808' }}
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button onClick={() => { setEditing(false); setForm(item) }} className="text-xs text-white/40 hover:text-white transition-colors">Cancelar</button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-start justify-between mb-2">
            <div>
              <span className={`text-xs px-2 py-0.5 rounded border mr-2 ${TIPO_COLORS[item.tipo] || TIPO_COLORS.geral}`}>{item.tipo}</span>
              <span className="text-xs text-white/30">#{item.ordem}</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={toggleAtivo} className={`text-xs transition-colors ${item.ativo ? 'text-green-400 hover:text-green-300' : 'text-white/30 hover:text-white/60'}`}>
                {item.ativo ? '● Ativo' : '○ Inativo'}
              </button>
              <button onClick={() => setEditing(true)} className="text-xs text-white/40 hover:text-white transition-colors">Editar</button>
              <button onClick={() => onDelete(item.id)} className="text-xs text-red-400/60 hover:text-red-400 transition-colors">Excluir</button>
            </div>
          </div>
          <h3 className="font-semibold text-white mb-2">{item.titulo}</h3>
          <p className="text-xs text-white/50 leading-relaxed whitespace-pre-line line-clamp-4">{item.conteudo}</p>
        </div>
      )}
    </div>
  )
}

export default function ConhecimentoBase() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newForm, setNewForm] = useState({ titulo: '', tipo: 'metodologia', conteudo: '', ordem: 0, ativo: true })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api('/conhecimento-base').then(data => { setItems(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function handleUpdate(updated) {
    setItems(its => its.map(i => i.id === updated.id ? updated : i))
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este conhecimento?')) return
    await api(`/conhecimento-base/${id}`, { method: 'DELETE' })
    setItems(its => its.filter(i => i.id !== id))
  }

  async function handleCreate() {
    if (!newForm.titulo || !newForm.conteudo) return
    setSaving(true)
    try {
      const created = await api('/conhecimento-base', {
        method: 'POST',
        body: JSON.stringify(newForm),
      })
      setItems(its => [...its, created])
      setNewForm({ titulo: '', tipo: 'metodologia', conteudo: '', ordem: 0, ativo: true })
      setAdding(false)
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  const ativos = items.filter(i => i.ativo).length

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/5 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin')} className="text-white/40 hover:text-white text-sm transition-colors">← Admin</button>
          <span className="text-white/20">/</span>
          <span className="gold-text font-semibold">Base de Conhecimento</span>
        </div>
        <p className="text-xs text-white/30">{ativos} entrada{ativos !== 1 ? 's' : ''} ativa{ativos !== 1 ? 's' : ''} — injetada{ativos !== 1 ? 's' : ''} em todo agente</p>
      </header>

      <main className="max-w-4xl mx-auto px-8 py-10">
        {/* Explicação */}
        <div className="card-flg p-5 mb-8 border-gold-mid/30">
          <p className="text-sm text-white/70 leading-relaxed">
            <span className="gold-text font-semibold">O que é isso:</span> tudo que você adicionar aqui é injetado automaticamente no system prompt do agente antes de cada conversa.
            Use para ensinar a metodologia FLG, descrever a jornada, definir como o agente deve se comportar, etc.
            <br />
            <span className="text-white/40 text-xs mt-1 block">Dica: use Markdown — títulos, listas, negrito — o agente interpreta bem.</span>
          </p>
        </div>

        {/* Botão novo */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-2xl gold-text">
            {items.length} entrada{items.length !== 1 ? 's' : ''}
          </h2>
          <button
            onClick={() => setAdding(a => !a)}
            className="px-5 py-2 rounded text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg, #F5D68A 0%, #C9A84C 50%, #8B6914 100%)', color: '#080808' }}
          >
            {adding ? '✕ Cancelar' : '+ Novo Conhecimento'}
          </button>
        </div>

        {/* Form de novo */}
        {adding && (
          <div className="card-flg p-5 mb-6 border-gold-mid/40">
            <p className="text-xs tracking-widest uppercase text-gold-mid mb-4">Novo Conhecimento</p>
            <div className="space-y-3">
              <input
                value={newForm.titulo}
                onChange={e => setNewForm(f => ({ ...f, titulo: e.target.value }))}
                placeholder="Título (ex: Metodologia dos 15 Encontros)"
                className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold-mid"
              />
              <div className="flex gap-3">
                <select
                  value={newForm.tipo}
                  onChange={e => setNewForm(f => ({ ...f, tipo: e.target.value }))}
                  className="bg-white/5 border border-white/10 rounded px-4 py-3 text-sm text-white focus:outline-none focus:border-gold-mid"
                >
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  type="number"
                  value={newForm.ordem}
                  onChange={e => setNewForm(f => ({ ...f, ordem: parseInt(e.target.value) || 0 }))}
                  placeholder="Ordem"
                  className="w-24 bg-white/5 border border-white/10 rounded px-4 py-3 text-sm text-white focus:outline-none focus:border-gold-mid"
                />
              </div>
              <textarea
                rows={10}
                value={newForm.conteudo}
                onChange={e => setNewForm(f => ({ ...f, conteudo: e.target.value }))}
                placeholder="Cole o conteúdo aqui — texto livre, markdown, etc…"
                className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold-mid resize-y font-mono leading-relaxed"
              />
              <button
                onClick={handleCreate}
                disabled={saving || !newForm.titulo || !newForm.conteudo}
                className="px-8 py-3 rounded text-sm font-semibold disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #F5D68A 0%, #C9A84C 50%, #8B6914 100%)', color: '#080808' }}
              >
                {saving ? 'Criando…' : 'Criar'}
              </button>
            </div>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-gold-mid border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <ItemCard key={item.id} item={item} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
