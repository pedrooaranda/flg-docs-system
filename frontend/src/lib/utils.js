import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function initials(name) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function progressPercent(current, total = 15) {
  return Math.min(Math.round(((current || 1) / total) * 100), 100)
}

// Email exato do owner hardcoded (fallback caso `colaboradores.role` esteja vazio).
// Match exato — não 'includes' — pra impedir bypass por emails maliciosos.
const OWNER_FALLBACK_EMAIL = 'pedroaranda@grupoguglielmi.com'

function _isOwnerFallback(user) {
  return (user?.email || '').toLowerCase().trim() === OWNER_FALLBACK_EMAIL
}

export function isAdmin(user) {
  const role = user?.user_metadata?.role
  if (role === 'owner' || role === 'admin') return true
  return _isOwnerFallback(user)
}

export function isOwner(user) {
  const role = user?.user_metadata?.role
  if (role === 'owner') return true
  return _isOwnerFallback(user)
}

export function needsPasswordChange(user) {
  return user?.user_metadata?.needs_password_change === true
}

export function getUserDisplayName(user) {
  return user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário'
}
