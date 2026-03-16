import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export default function AdminPanel() {
  const navigate = useNavigate()
  const [encontros, setEncontros] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null) // { numero, campo, valor }
  const [saving, setSaving] = useState(false)

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

  async function saveEncontro(numero) {
    if (!editando || editando.numero !== numero) return
    setSaving(true)
    try {
      await api(`/encontros-base/${numero}`, {
        method: 'PATCH',
        body: JSON.stringify({ [editando.campo]: editando.valor }),
      })
      setEncontros(e => e.map(enc => enc.numero === numero ? { ...enc, [editando.campo]: editando.valor } : enc))
      setEditando(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center min-h-screen"><div className="w-8 h-8 border-2 border-gold-mid border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/5 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-white/40 hover:text-white text-sm transition-colors">← Dashboard</button>
          <span className="text-white/20">/</span>
          <span className="gold-text font-semibold">Admin</span>
        </div>
        <button
          onClick={() => navigate('/admin/conhecimento')}
          className="px-4 py-2 rounded text-xs font-semibold"
          style={{ background: 'linear-gradient(135deg, #F5D68A 0%, #C9A84C 50%, #8B6914 100%)', color: '#080808' }}
        >
          ✦ Base de Conhecimento
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-10">
        {/* Clientes */}
        <section className="mb-12">
          <h2 className="font-display text-2xl gold-text mb-6">Clientes ({clientes.length})</h2>
          <div className="card-flg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-3 text-white/40 font-normal tracking-widest uppercase text-xs">Nome</th>
                  <th className="text-left px-4 py-3 text-white/40 font-normal tracking-widest uppercase text-xs">Empresa</th>
                  <th className="text-left px-4 py-3 text-white/40 font-normal tracking-widest uppercase text-xs">Consultor</th>
                  <th className="text-left px-4 py-3 text-white/40 font-normal tracking-widest uppercase text-xs">Encontro</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map(c => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/2 cursor-pointer" onClick={() => navigate(`/clientes/${c.id}`)}>
                    <td className="px-4 py-3 text-white/80">{c.nome}</td>
                    <td className="px-4 py-3 text-white/50">{c.empresa}</td>
                    <td className="px-4 py-3 text-white/50">{c.consultor_responsavel}</td>
                    <td className="px-4 py-3 text-gold-mid">{c.encontro_atual}/15</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Encontros base */}
        <section>
          <h2 className="font-display text-2xl gold-text mb-6">Encontros Base</h2>
          <div className="space-y-3">
            {encontros.map(enc => (
              <div key={enc.numero} className="card-flg p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-xs text-gold-mid tracking-widest uppercase">Encontro {enc.numero}</span>
                    <h3 className="font-semibold text-white mt-0.5">{enc.nome}</h3>
                    <p className="text-xs text-white/40 mt-1">{enc.objetivo_estrategico}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded border ${enc.tem_slides ? 'border-gold-mid/40 text-gold-mid' : 'border-white/10 text-white/30'}`}>
                      {enc.tem_slides ? 'com slides' : 'sem slides'}
                    </span>
                    <button
                      onClick={() => setEditando({ numero: enc.numero, campo: 'intelecto_base', valor: enc.intelecto_base || '' })}
                      className="text-xs text-white/40 hover:text-white transition-colors"
                    >
                      Editar
                    </button>
                  </div>
                </div>

                {editando?.numero === enc.numero ? (
                  <div className="mt-3">
                    <textarea
                      rows={6}
                      value={editando.valor}
                      onChange={e => setEditando(ed => ({ ...ed, valor: e.target.value }))}
                      className="w-full bg-white/5 border border-gold-mid/30 rounded px-4 py-3 text-sm text-white focus:outline-none resize-none"
                    />
                    <div className="flex gap-3 mt-2">
                      <button
                        onClick={() => saveEncontro(enc.numero)}
                        disabled={saving}
                        className="px-4 py-1.5 rounded text-xs font-semibold disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #F5D68A 0%, #C9A84C 50%, #8B6914 100%)', color: '#080808' }}
                      >
                        {saving ? 'Salvando…' : 'Salvar'}
                      </button>
                      <button onClick={() => setEditando(null)} className="text-xs text-white/40 hover:text-white transition-colors">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-white/40 mt-2 line-clamp-3 leading-relaxed">
                    {enc.intelecto_base || <em>Sem linha intelectual definida</em>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
