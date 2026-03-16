import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

export default function Dashboard() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api('/clientes').then(data => { setClientes(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = clientes.filter(c =>
    c.nome?.toLowerCase().includes(search.toLowerCase()) ||
    c.empresa?.toLowerCase().includes(search.toLowerCase())
  )

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/5 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/api/assets/logo-flg.svg" alt="FLG" className="w-10 opacity-80" />
          <span className="font-display text-lg font-semibold gold-text">Jornada System</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin')} className="text-xs text-white/40 hover:text-white/70 tracking-widest uppercase transition-colors">Admin</button>
          <button onClick={handleLogout} className="text-xs text-white/40 hover:text-white/70 tracking-widest uppercase transition-colors">Sair</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-10">
        {/* Título + ações */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="font-display text-3xl font-bold gold-text">Clientes</h2>
            <p className="text-white/40 text-sm mt-1">{clientes.length} founder{clientes.length !== 1 ? 's' : ''} na jornada</p>
          </div>
          <button
            onClick={() => navigate('/clientes/novo')}
            className="px-5 py-2.5 rounded text-sm font-semibold tracking-wide"
            style={{ background: 'linear-gradient(135deg, #F5D68A 0%, #C9A84C 50%, #8B6914 100%)', color: '#080808' }}
          >
            + Novo Cliente
          </button>
        </div>

        {/* Busca */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou empresa…"
          className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold-mid transition-colors mb-6"
        />

        {/* Grid de clientes */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-gold-mid border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => navigate(`/clientes/${c.id}`)}
                className="card-flg p-5 text-left hover:border-gold-mid/50 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-white group-hover:text-gold-light transition-colors">{c.nome}</p>
                    <p className="text-sm text-white/50">{c.empresa}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full border border-gold-mid/30 text-gold-mid">
                    E{c.encontro_atual || 1}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(((c.encontro_atual || 1) / 15) * 100, 100)}%`,
                        background: 'linear-gradient(90deg, #F5D68A, #C9A84C)',
                      }}
                    />
                  </div>
                  <span className="text-xs text-white/30">{c.encontro_atual || 1}/15</span>
                </div>
                <p className="text-xs text-white/30 mt-3">{c.consultor_responsavel}</p>
              </button>
            ))}

            {filtered.length === 0 && !loading && (
              <div className="col-span-full text-center py-16 text-white/30">
                Nenhum cliente encontrado
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
