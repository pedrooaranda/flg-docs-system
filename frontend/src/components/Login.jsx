import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Spinner } from './ui/Spinner'

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
    if (error) setError('E-mail ou senha incorretos')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden transition-colors" style={{ background: 'var(--flg-bg)' }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #C9A84C 0%, transparent 70%)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gold-gradient mb-5">
            <span className="font-display font-bold text-2xl text-[#080808]">F</span>
          </div>
          <h1 className="font-display text-3xl font-bold gold-text">Jornada System</h1>
          <p className="text-xs text-white/25 mt-2 tracking-widest uppercase">Founders Led Growth</p>
        </div>

        <form onSubmit={handleSubmit} className="card-flg p-8 space-y-5">
          <div className="space-y-1.5">
            <label className="block text-[10px] tracking-widest uppercase text-white/35 font-medium">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="input-flg"
              placeholder="seu@email.com"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] tracking-widest uppercase text-white/35 font-medium">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="input-flg"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-400 text-xs text-center bg-red-500/8 border border-red-500/15 rounded py-2 px-3"
            >
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-gold w-full py-3 flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
          >
            {loading ? <><Spinner size="sm" /> Entrando…</> : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-[10px] text-white/12 mt-6 tracking-wide">
          Acesso restrito · Founders Led Growth
        </p>
      </motion.div>
    </div>
  )
}
