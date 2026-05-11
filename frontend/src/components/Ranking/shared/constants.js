import { Flame, TrendingUp, Eye, Camera } from 'lucide-react'
import { formatCompact } from './formatters'

export const GOLD = '#C9A84C'

// Categorias de destaque do Pódio de Troféus (aba Clientes).
// Cada uma vira um DestaqueCard com top 3 (winner + #2 + #3).
export const CATEGORIAS = [
  {
    key: 'engajamento',
    label: 'Maior Engajamento',
    sortKey: 'taxa_engajamento',
    icon: Flame,
    color: '#EC4899',
    glow: 'rgba(236,72,153,0.30)',
    formatValue: v => `${(v || 0).toFixed(2)}%`,
    legendaUnidade: 'taxa média',
  },
  {
    key: 'crescimento',
    label: 'Maior Crescimento',
    sortKey: 'crescimento',
    icon: TrendingUp,
    color: '#34D399',
    glow: 'rgba(52,211,153,0.30)',
    formatValue: v => v >= 0 ? `+${v.toLocaleString('pt-BR')}` : v.toLocaleString('pt-BR'),
    legendaUnidade: 'novos seguidores em 30d',
    extraKey: 'crescimento_pct',
    extraFormat: v => `${v >= 0 ? '+' : ''}${(v || 0).toFixed(1)}%`,
  },
  {
    key: 'alcance',
    label: 'Maior Alcance',
    sortKey: 'alcance_medio',
    icon: Eye,
    color: '#60A5FA',
    glow: 'rgba(96,165,250,0.30)',
    formatValue: v => formatCompact(v),
    legendaUnidade: 'alcance médio diário',
  },
  {
    key: 'postagens',
    label: 'Mais Produtivo',
    sortKey: 'posts_mes',
    icon: Camera,
    color: '#A78BFA',
    glow: 'rgba(167,139,250,0.30)',
    formatValue: v => `${v || 0}`,
    legendaUnidade: 'posts no mês',
  },
]
