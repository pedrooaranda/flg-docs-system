import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-sm">
        {/* Logo FLG */}
        <div className="text-center mb-10">
          <img src="/api/assets/logo-flg.svg" alt="FLG" className="w-20 mx-auto mb-6 opacity-90" />
          <h1 className="font-display text-3xl font-bold gold-text">Jornada System</h1>
          <p className="text-sm text-white/40 mt-2 tracking-widest uppercase">Founders Led Growth</p>
        </div>

        <form onSubmit={handleSubmit} className="card-flg p-8 space-y-5">
          <div>
            <label className="block text-xs tracking-widest uppercase text-white/50 mb-2">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold-mid transition-colors"
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <label className="block text-xs tracking-widest uppercase text-white/50 mb-2">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold-mid transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded text-sm font-semibold tracking-widest uppercase transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #F5D68A 0%, #C9A84C 50%, #8B6914 100%)', color: '#080808' }}
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
