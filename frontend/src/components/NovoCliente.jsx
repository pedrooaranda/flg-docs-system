import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

const CAMPOS = [
  { key: 'nome',                 label: 'Nome do Founder',        required: true },
  { key: 'empresa',              label: 'Empresa',                required: true },
  { key: 'consultor_responsavel',label: 'Consultor Responsável',  required: true },
  { key: 'estrategista',         label: 'Estrategista',           required: false },
  { key: 'clickup_task_id',      label: 'ClickUp Task ID',        required: false },
  { key: 'tom_de_voz',           label: 'Tom de Voz',             required: false, textarea: true },
  { key: 'pontos_fortes',        label: 'Pontos Fortes',          required: false, textarea: true },
  { key: 'travas_conhecidas',    label: 'Travas Conhecidas',      required: false, textarea: true },
  { key: 'situacao_atual',       label: 'Situação Atual',         required: false, textarea: true },
  { key: 'objetivo_em_6_meses',  label: 'Objetivo em 6 Meses',   required: false, textarea: true },
  { key: 'principal_dor_hoje',   label: 'Principal Dor Hoje',     required: false, textarea: true },
]

export default function NovoCliente() {
  const navigate = useNavigate()
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const c = await api('/clientes', { method: 'POST', body: JSON.stringify({ ...form, encontro_atual: 1 }) })
      navigate(`/clientes/${c.id}`)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/5 px-8 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="text-white/40 hover:text-white text-sm transition-colors">← Dashboard</button>
        <span className="text-white/20">/</span>
        <span className="text-white/70">Novo Cliente</span>
      </header>

      <main className="max-w-2xl mx-auto px-8 py-10">
        <h1 className="font-display text-3xl font-bold gold-text mb-8">Novo Cliente</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {CAMPOS.map(({ key, label, required, textarea }) => (
            <div key={key}>
              <label className="block text-xs tracking-widest uppercase text-white/40 mb-2">
                {label}{required && <span className="text-gold-mid ml-1">*</span>}
              </label>
              {textarea ? (
                <textarea
                  rows={3}
                  value={form[key] || ''}
                  onChange={e => set(key, e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold-mid transition-colors resize-none"
                />
              ) : (
                <input
                  type="text"
                  required={required}
                  value={form[key] || ''}
                  onChange={e => set(key, e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold-mid transition-colors"
                />
              )}
            </div>
          ))}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 rounded text-sm font-semibold tracking-wide disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #F5D68A 0%, #C9A84C 50%, #8B6914 100%)', color: '#080808' }}
            >
              {loading ? 'Criando…' : 'Criar Cliente'}
            </button>
            <button type="button" onClick={() => navigate('/')} className="px-8 py-3 rounded text-sm text-white/50 hover:text-white border border-white/10 transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
