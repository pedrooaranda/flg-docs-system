import { useState, useEffect } from 'react'
import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../contexts/AppContext'
import { useUserScope } from '../../hooks/useUserScope'
import { useToast } from '../../lib/toast'
import { Spinner } from '../ui/Spinner'

export default function DebriefingLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [wrongDoor, setWrongDoor] = useState(false)

  const { session } = useApp()
  const { isLoading: scopeLoading, canSeeDebriefings } = useUserScope()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  // Lê toast da rota anterior (vindo de MainLayout redirect)
  useEffect(() => {
    const t = location.state?.toast
    if (t) {
      toast(t)
      // Limpa o state pra não disparar de novo em re-render
      window.history.replaceState({}, '')
    }
  }, [location.state, toast])

  // Detecta "porta errada" após login (canSeeDebriefings resolveu como false)
  useEffect(() => {
    if (session && !scopeLoading && canSeeDebriefings === false) {
      setWrongDoor(true)
    }
  }, [session, scopeLoading, canSeeDebriefings])

  // Já logado e pode ver Debriefings → manda pra /debriefings
  if (session && !scopeLoading && canSeeDebriefings) {
    return <Navigate to="/debriefings" replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setWrongDoor(false)
    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signErr) {
      setError('E-mail ou senha incorretos')
      setLoading(false)
      return
    }
    // Sessão é setada via onAuthStateChange (App.jsx). Polling pequeno até useUserScope resolver.
    // Se canSeeDebriefings vier false, mostra "porta errada" em vez de navegar.
    // Aqui só limpamos loading — o Navigate condicional acima cuida do redirect quando flag resolver.
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
          <img
            src="/logo-flg.png"
            alt="FLG"
            className="mx-auto mb-5"
            style={{ height: 80, width: 'auto', objectFit: 'contain' }}
          />
          <p className="text-[10px] tracking-widest uppercase font-bold mb-2" style={{ color: '#C9A84C' }}>
            FLG Brasil · Comercial
          </p>
          <h1 className="font-display text-3xl font-semibold text-white/90">FLG Comercial</h1>
          <p className="text-xs text-white/45 mt-2">Hub de Debriefings</p>
        </div>

        {wrongDoor ? (
          <div className="card-flg p-8 space-y-4 text-center">
            <p className="text-sm text-white/80">
              Esta entrada é do <span className="font-semibold" style={{ color: '#C9A84C' }}>time comercial</span>.
            </p>
            <p className="text-xs text-white/55">
              Sua conta acessa o sistema principal da FLG.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="btn-gold w-full py-3 uppercase tracking-widest text-xs"
            >
              Ir pro Login principal
            </button>
            <button
              type="button"
              onClick={async () => { await supabase.auth.signOut(); }}
              className="text-[10px] text-white/30 hover:text-white/60 mt-2"
            >
              Sair desta conta
            </button>
          </div>
        ) : (
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
              disabled={loading || scopeLoading}
              className="btn-gold w-full py-3 flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
            >
              {loading || scopeLoading ? <><Spinner size="sm" /> Entrando…</> : 'Entrar'}
            </button>
          </form>
        )}

        <p className="text-center text-[10px] text-white/12 mt-6 tracking-wide">
          Acesso restrito · FLG Brasil
        </p>
      </motion.div>
    </div>
  )
}
