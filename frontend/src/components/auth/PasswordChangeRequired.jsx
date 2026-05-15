/**
 * PasswordChangeRequired — tela que bloqueia o app até o user trocar a senha temporária.
 *
 * Disparada quando `session.user.user_metadata.needs_password_change === true`
 * (flag setada pelo backend em /colaboradores POST com auto-provisioning).
 *
 * Fluxo:
 *   1. User digita nova senha + confirma
 *   2. Validação: mín 8 chars, ≥1 maiúscula, ≥1 minúscula, ≥1 dígito
 *   3. Supabase Auth updateUser({ password, data: { needs_password_change: false } })
 *   4. Em sucesso, o onAuthStateChange do App.jsx detecta novo metadata e libera nav
 */

import { useState } from 'react'
import { Eye, EyeOff, Lock, Check, AlertCircle, LogOut } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const MIN_LENGTH = 8

function validateStrength(password) {
  if (!password || password.length < MIN_LENGTH) return `mín ${MIN_LENGTH} caracteres`
  if (!/[a-z]/.test(password)) return 'precisa ≥1 letra minúscula'
  if (!/[A-Z]/.test(password)) return 'precisa ≥1 letra MAIÚSCULA'
  if (!/[0-9]/.test(password)) return 'precisa ≥1 dígito (0-9)'
  return null
}

export default function PasswordChangeRequired({ session }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const userEmail = session?.user?.email || ''
  const userName = session?.user?.user_metadata?.full_name || userEmail.split('@')[0]

  const strengthError = password ? validateStrength(password) : null
  const mismatch = password && confirm && password !== confirm
  const canSubmit = password && confirm && !strengthError && !mismatch && !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)
    try {
      const { error: updErr } = await supabase.auth.updateUser({
        password,
        data: { needs_password_change: false },
      })
      if (updErr) throw updErr
      // Supabase emite onAuthStateChange — o App.jsx re-detecta a sessão sem o flag.
    } catch (e) {
      setError(e?.message || 'Erro ao atualizar senha')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--flg-bg-secondary)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'var(--flg-bg-card)', border: '1px solid var(--flg-border)' }}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--flg-border)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.35)' }}>
              <Lock size={18} style={{ color: '#C9A84C' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] tracking-[0.2em] uppercase text-gold-mid/70 font-mono">
                Primeiro acesso
              </p>
              <h1 className="text-lg font-display font-medium text-white/95 truncate">
                Olá, {userName}
              </h1>
            </div>
          </div>
          <p className="text-xs text-white/55 leading-relaxed">
            Sua conta foi criada com uma <strong className="text-gold-mid">senha temporária</strong>.
            Pra continuar, defina uma nova senha agora.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={userEmail}
              disabled
              className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white/50 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
              Nova senha
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mín 8 chars · 1 maiúscula · 1 minúscula · 1 dígito"
                className="w-full pl-3 pr-10 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white/90 focus:outline-none focus:border-gold-mid/50"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPwd(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/40 hover:text-white/70 transition-colors"
                tabIndex={-1}
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {strengthError && (
              <p className="mt-1.5 text-[10px] text-amber-400/80 flex items-center gap-1">
                <AlertCircle size={10} /> {strengthError}
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-white/40 mb-1.5">
              Confirmar nova senha
            </label>
            <input
              type={showPwd ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repita a senha"
              className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white/90 focus:outline-none focus:border-gold-mid/50"
            />
            {mismatch && (
              <p className="mt-1.5 text-[10px] text-amber-400/80 flex items-center gap-1">
                <AlertCircle size={10} /> as senhas não batem
              </p>
            )}
            {!mismatch && confirm && password === confirm && !strengthError && (
              <p className="mt-1.5 text-[10px] text-emerald-400/90 flex items-center gap-1">
                <Check size={10} /> senhas conferem
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-lg p-2.5 text-xs"
              style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#FCA5A5' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: canSubmit ? '#C9A84C' : 'rgba(201,168,76,0.20)',
              color: canSubmit ? '#080808' : 'rgba(201,168,76,0.5)',
            }}
          >
            {submitting ? 'Atualizando…' : 'Definir nova senha'}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors flex items-center justify-center gap-1.5"
          >
            <LogOut size={11} /> Sair
          </button>
        </form>
      </div>
    </div>
  )
}
