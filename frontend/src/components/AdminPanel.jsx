import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpen, Users, Layers, Pencil, Check, X, Download, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { api } from '../lib/api'
import { progressPercent } from '../lib/utils'
import { Avatar } from './ui/Avatar'
import { Spinner, PageSpinner } from './ui/Spinner'
import { useToast } from '../lib/toast'
import { cn } from '../lib/utils'

function EncontroCard({ enc, delay }) {
  const toast = useToast()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(enc.intelecto_base || '')
  const [saving, setSaving] = useState(false)
  const [local, setLocal] = useState(enc)

  async function save() {
    setSaving(true)
    try {
      await api(`/encontros-base/${enc.numero}`, {
        method: 'PATCH',
        body: JSON.stringify({ intelecto_base: valor }),
      })
      setLocal(l => ({ ...l, intelecto_base: valor }))
      setEditando(false)
      toast?.({ title: 'Salvo', description: `Encontro ${enc.numero} atualizado.`, variant: 'success' })
    } catch (err) {
      toast?.({ title: 'Erro', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay }}
      className="card-flg p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5',
            enc.tem_slides ? 'gold-gradient text-[#080808]' : 'border border-white/15 text-white/40'
          )}>
            {enc.numero}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-white/90 text-sm">{local.nome || `Encontro ${enc.numero}`}</p>
            {local.objetivo_estrategico && (
              <p className="text-xs text-white/40 mt-0.5 line-clamp-2 leading-relaxed">
                {local.objetivo_estrategico}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn(
            'text-[10px] px-2 py-0.5 rounded border',
            enc.tem_slides ? 'border-gold-mid/30 text-gold-mid/70' : 'border-white/8 text-white/25'
          )}>
            {enc.tem_slides ? 'slides' : 'sem slides'}
          </span>
          {!editando ? (
            <button
              onClick={() => { setValor(local.intelecto_base || ''); setEditando(true) }}
              className="w-7 h-7 rounded-lg border border-white/8 flex items-center justify-center text-white/30 hover:text-white hover:border-white/20 transition-all"
            >
              <Pencil size={12} />
            </button>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={save}
                disabled={saving}
                className="w-7 h-7 rounded-lg border border-gold-mid/40 flex items-center justify-center text-gold-mid hover:bg-gold-mid/10 transition-all disabled:opacity-50"
              >
                {saving ? <Spinner size="sm" /> : <Check size={12} />}
              </button>
              <button
                onClick={() => setEditando(false)}
                className="w-7 h-7 rounded-lg border border-white/8 flex items-center justify-center text-white/30 hover:text-white transition-all"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {editando ? (
        <div className="mt-4">
          <textarea
            rows={6}
            value={valor}
            onChange={e => setValor(e.target.value)}
            className="input-flg w-full resize-none font-mono text-xs leading-relaxed"
            placeholder="Linha intelectual base para este encontro…"
            autoFocus
          />
        </div>
      ) : local.intelecto_base ? (
        <p className="text-[11px] text-white/35 mt-3 line-clamp-3 leading-relaxed pl-11">
          {local.intelecto_base}
        </p>
      ) : (
        <p className="text-[11px] text-white/20 mt-3 italic pl-11">Sem linha intelectual definida</p>
      )}
    </motion.div>
  )
}

function ClickUpImportSection({ onImported }) {
  const toast = useToast()
  const [status, setStatus] = useState('idle') // idle, previewing, importing, done, error
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)

  async function handlePreview() {
    setStatus('previewing')
    setResult(null)
    try {
      const data = await api('/admin/clickup/preview')
      setPreview(data)
      setStatus('idle')
    } catch (e) {
      toast?.({ title: 'Erro ao buscar preview', description: e.message, variant: 'error' })
      setStatus('error')
    }
  }

  async function handleImport() {
    setStatus('importing')
    try {
      const data = await api('/admin/clickup/import', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setResult(data)
      setStatus('done')
      setPreview(null)
      toast?.({ title: 'Importação concluída', description: `${data.importados} novos, ${data.atualizados} atualizados`, variant: 'success' })
      onImported?.()
    } catch (e) {
      toast?.({ title: 'Erro na importação', description: e.message, variant: 'error' })
      setStatus('error')
    }
  }

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Download size={16} className="text-gold-mid/70" />
        <h2 className="font-display text-lg font-semibold text-white">Importar do ClickUp</h2>
      </div>
      <div className="card-flg p-5 space-y-4">
        <p className="text-xs text-white/40">
          Importa clientes da sua List no ClickUp para o sistema. Tasks existentes (por clickup_task_id) são atualizadas.
        </p>

        <div className="flex items-center gap-2">
          <button onClick={handlePreview} disabled={status === 'previewing' || status === 'importing'}
            className="text-xs font-semibold px-4 py-2 rounded-lg transition-all cursor-pointer disabled:opacity-40 flex items-center gap-2"
            style={{ background: 'var(--flg-bg-hover)', color: 'var(--flg-text-secondary)', border: '1px solid var(--flg-border)' }}>
            {status === 'previewing' ? <Spinner size="sm" /> : <RefreshCw size={12} />}
            Preview (dry-run)
          </button>
          <button onClick={handleImport} disabled={status === 'importing'}
            className="btn-gold text-xs flex items-center gap-2 disabled:opacity-40">
            {status === 'importing' ? <Spinner size="sm" /> : <Download size={12} />}
            Importar agora
          </button>
        </div>

        {/* Preview table */}
        {preview && preview.preview?.length > 0 && (
          <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--flg-border)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--flg-bg-secondary)', borderBottom: '1px solid var(--flg-border)' }}>
                  {['Nome', 'Empresa', 'Consultor', 'Etapa', 'Situação', 'Lista'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[9px] uppercase tracking-wide text-white/30">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--flg-border)' }}>
                    <td className="px-3 py-2 text-white/70 font-medium">{p.nome}</td>
                    <td className="px-3 py-2 text-white/40">{p.empresa || '—'}</td>
                    <td className="px-3 py-2 text-white/40">{p.consultor_responsavel || '—'}</td>
                    <td className="px-3 py-2 text-white/40">E{p.encontro_atual || '?'}</td>
                    <td className="px-3 py-2 text-white/40">{p.situacao_clickup || p.status || '—'}</td>
                    <td className="px-3 py-2 text-white/30 text-[9px]">{p._list || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-2 text-[10px] text-white/25" style={{ background: 'var(--flg-bg-secondary)' }}>
              {preview.total_tasks} tasks encontradas na List
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="flex items-center gap-3 text-xs p-3 rounded-lg" style={{
            background: result.erros > 0 ? 'rgba(248,113,113,0.06)' : 'rgba(52,211,153,0.06)',
            border: `1px solid ${result.erros > 0 ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)'}`,
          }}>
            {result.erros > 0 ? <AlertCircle size={14} className="text-red-400/60" /> : <CheckCircle2 size={14} className="text-emerald-400/60" />}
            <span className="text-white/60">
              <strong className="text-white/80">{result.importados}</strong> novos · <strong className="text-white/80">{result.atualizados}</strong> atualizados · <strong className={result.erros > 0 ? 'text-red-400' : 'text-white/80'}>{result.erros}</strong> erros
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

export default function AdminPanel() {
  const navigate = useNavigate()
  const [encontros, setEncontros] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api('/encontros-base'),
      api('/clientes'),
    ]).then(([e, c]) => {
      setEncontros(e)
      setClientes(c)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-6 max-w-5xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Painel Admin</h1>
          <p className="text-sm text-white/30 mt-0.5">Gerenciamento de encontros e clientes</p>
        </div>
        <button
          onClick={() => navigate('/admin/conhecimento')}
          className="btn-gold flex items-center gap-2"
        >
          <BookOpen size={14} />
          Base de Conhecimento
        </button>
      </div>

      {/* ClickUp Import */}
      <ClickUpImportSection onImported={() => api('/clientes').then(setClientes).catch(() => {})} />

      {/* Clientes */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} className="text-gold-mid/70" />
          <h2 className="font-display text-lg font-semibold text-white">
            Clientes
            <span className="ml-2 text-sm font-normal text-white/30">({clientes.length})</span>
          </h2>
        </div>
        <div className="card-flg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['Founder', 'Empresa', 'Consultor', 'Progresso'].map(col => (
                  <th key={col} className="text-left px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/clientes/${c.id}`)}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={c.nome} size="sm" />
                      <span className="text-white/80 font-medium">{c.nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/45">{c.empresa}</td>
                  <td className="px-4 py-3 text-white/45">{c.consultor_responsavel}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full gold-gradient"
                          style={{ width: `${progressPercent(c.encontro_atual)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gold-mid font-medium">
                        E{c.encontro_atual || 1}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Encontros base */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Layers size={16} className="text-gold-mid/70" />
          <h2 className="font-display text-lg font-semibold text-white">Encontros Base</h2>
        </div>
        <div className="space-y-3">
          {encontros.map((enc, i) => (
            <EncontroCard key={enc.numero} enc={enc} delay={i * 0.03} />
          ))}
        </div>
      </section>
    </motion.div>
  )
}
