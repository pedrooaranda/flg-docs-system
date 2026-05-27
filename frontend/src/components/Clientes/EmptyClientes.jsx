/**
 * EmptyClientes — empty state ilustrado pra tela /clientes.
 *
 * 3 variantes (prop `variant`):
 *   'no_results' — filtros zeram resultado (busca + status + consultor)
 *   'empty'      — consultor sem clientes (ainda não foi atribuído)
 *   'error'      — fetch falhou (network/500)
 */
import { Search, UserPlus, AlertTriangle } from 'lucide-react'

const VARIANTS = {
  no_results: {
    icon: Search,
    iconColor: 'rgba(255,255,255,0.25)',
    title: 'Nenhum cliente encontrado',
    hint: 'Ajuste a busca ou troque o consultor selecionado',
  },
  empty: {
    icon: UserPlus,
    iconColor: '#C9A84C',
    title: 'Você ainda não tem clientes',
    hint: 'Peça pro admin atribuir clientes a você',
  },
  error: {
    icon: AlertTriangle,
    iconColor: '#EF4444',
    title: 'Erro ao carregar clientes',
    hint: '',
  },
}

export default function EmptyClientes({ variant = 'no_results', errorMessage, onAction, actionLabel }) {
  const cfg = VARIANTS[variant] || VARIANTS.no_results
  const Icon = cfg.icon
  const hint = variant === 'error' ? (errorMessage || cfg.hint) : cfg.hint

  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: `${cfg.iconColor}15`,
          border: `1px solid ${cfg.iconColor}30`,
        }}
      >
        <Icon size={28} style={{ color: cfg.iconColor }} />
      </div>
      <h3 className="text-white/85 text-sm font-semibold mb-1.5">{cfg.title}</h3>
      {hint && (
        <p className="text-white/35 text-xs max-w-sm mb-5">{hint}</p>
      )}
      {onAction && actionLabel && (
        <button onClick={onAction} className="btn-outline-gold text-xs px-4 py-2">
          {actionLabel}
        </button>
      )}
    </div>
  )
}
