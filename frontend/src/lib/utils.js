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

export function isAdmin(user) {
  return user?.email?.includes('pedro') || user?.user_metadata?.role === 'admin'
}

export function getUserDisplayName(user) {
  return user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário'
}
