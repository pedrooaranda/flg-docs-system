import { cn } from '../../lib/utils'

const variants = {
  active:   'bg-green-500/15 text-green-400 border-green-500/20',
  paused:   'bg-amber-500/15 text-amber-400 border-amber-500/20',
  inactive: 'bg-white/8 text-white/40 border-white/10',
  gold:     'bg-gold-mid/15 text-gold-mid border-gold-mid/20',
  default:  'bg-white/8 text-white/60 border-white/10',
}

const labels = {
  ativo:   'Ativo',
  pausado: 'Pausado',
  inativo: 'Inativo',
}

export function StatusBadge({ status, className }) {
  const variant = status === 'ativo' ? 'active' : status === 'pausado' ? 'paused' : 'inactive'
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium', variants[variant], className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', {
        'bg-green-400': variant === 'active',
        'bg-amber-400': variant === 'paused',
        'bg-white/30':  variant === 'inactive',
      })} />
      {labels[status] || status}
    </span>
  )
}

export function Badge({ variant = 'default', children, className }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium', variants[variant], className)}>
      {children}
    </span>
  )
}
