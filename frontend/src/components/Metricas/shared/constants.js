// Constantes compartilhadas pelo Dashboard de Métricas.
// Extraídas do Metricas.jsx original.

import { Users, UserPlus, TrendingUp, Eye, Heart, Bookmark, MessageCircle, BarChart2, Play, Share2, Target, Clock, Film, Camera } from 'lucide-react'

export const GOLD = '#C9A84C'

export const PLATFORMS = {
  instagram: { label: 'Instagram', color: '#E4405F' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2' },
  youtube: { label: 'YouTube', color: '#FF0000' },
  tiktok: { label: 'TikTok', color: '#000000' },
}

// KPIs por aba (Geral / Posts / Reels / Stories).
// Cada entrada vira um <KpiCard> renderizado no respectivo componente de aba.
export const KPIS_GERAL = [
  { key: 'seguidores', label: 'Seguidores', icon: Users, histKey: 'seguidores' },
  { key: 'novos_seguidores_periodo', label: 'Novos no período', icon: UserPlus, prefix: '+' },
  { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%', histKey: 'taxa_engajamento' },
  { key: 'alcance_medio', label: 'Alcance médio', icon: Eye, histKey: 'alcance_total' },
  { key: 'visualizacoes_perfil', label: 'Visualizações do perfil', icon: Eye, histKey: 'visitas_perfil' },
  { key: 'curtidas_total', label: 'Curtidas', icon: Heart, histKey: 'curtidas_total' },
  { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle, histKey: 'comentarios_total' },
  { key: 'salvamentos_total', label: 'Salvamentos', icon: Bookmark, histKey: 'salvamentos_total' },
  { key: 'compartilhamentos_total', label: 'Compartilhamentos', icon: Share2, histKey: 'compartilhamentos_total' },
  { key: 'posts_publicados', label: 'Posts (Feed)', icon: BarChart2, noDelta: true, histKey: 'posts_publicados' },
  { key: 'reels_publicados', label: 'Reels', icon: Film, noDelta: true, histKey: 'reels_publicados' },
  { key: 'stories_publicados', label: 'Stories', icon: Camera, noDelta: true, histKey: 'stories_publicados' },
]

export const KPIS_FEED = [
  { key: 'posts_publicados', label: 'Posts publicados', icon: BarChart2, noDelta: true },
  { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%' },
  { key: 'alcance_medio', label: 'Alcance médio', icon: Eye },
  { key: 'curtidas_total', label: 'Curtidas', icon: Heart },
  { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle },
  { key: 'salvamentos_total', label: 'Salvamentos', icon: Bookmark },
  { key: 'compartilhamentos_total', label: 'Compartilhamentos', icon: Share2 },
]

export const KPIS_REELS = [
  { key: 'reels_publicados', label: 'Reels publicados', icon: Film, noDelta: true },
  { key: 'plays_total', label: 'Plays totais', icon: Play },
  { key: 'alcance_medio', label: 'Alcance médio', icon: Eye },
  { key: 'watch_time_segundos_medio', label: 'Watch time médio', icon: Clock, decimals: 1, suffix: 's' },
  { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%' },
  { key: 'curtidas_total', label: 'Curtidas', icon: Heart },
  { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle },
  { key: 'compartilhamentos_total', label: 'Compartilhamentos', icon: Share2 },
  { key: 'salvamentos_total', label: 'Salvamentos', icon: Bookmark },
]

export const KPIS_STORIES = [
  { key: 'stories_publicados', label: 'Stories publicados', icon: Camera, noDelta: true },
  { key: 'alcance_medio', label: 'Alcance médio', icon: Eye },
  { key: 'replies_total', label: 'Replies', icon: MessageCircle },
  { key: 'taps_forward_total', label: 'Taps forward', icon: Play },
  { key: 'taps_back_total', label: 'Taps back', icon: Target },
  { key: 'exits_total', label: 'Saídas', icon: Eye },
  { key: 'compartilhamentos_total', label: 'Compartilhamentos', icon: Share2 },
]

// Peso por KPI na disputa de "winner" (coroa). Valores não-presentes = 1.
export const KPI_WEIGHT = {
  taxa_engajamento: 2.0,
  alcance_medio: 2.0,
  visualizacoes_perfil: 1.5,
  seguidores: 1.2,
  salvamentos_total: 1.2,
  compartilhamentos_total: 1.2,
  comentarios_total: 1.0,
  curtidas_total: 0.8,
}

// Opções de ordenação por aba — keys batem com ?ordenar= do backend
export const ORDER_OPTIONS_FEED = [
  { key: 'engajamento', label: 'Mais engajados' },
  { key: 'recente', label: 'Mais recentes' },
  { key: 'curtidas', label: 'Mais curtidos' },
  { key: 'comentarios', label: 'Mais comentados' },
  { key: 'salvamentos', label: 'Mais salvos' },
  { key: 'compartilhamentos', label: 'Mais compartilhados' },
  { key: 'alcance', label: 'Maior alcance' },
]

export const ORDER_OPTIONS_REELS = [
  { key: 'engajamento', label: 'Mais engajados' },
  { key: 'recente', label: 'Mais recentes' },
  { key: 'curtidas', label: 'Mais curtidos' },
  { key: 'comentarios', label: 'Mais comentados' },
  { key: 'salvamentos', label: 'Mais salvos' },
  { key: 'compartilhamentos', label: 'Mais compartilhados' },
  { key: 'alcance', label: 'Maior alcance' },
]

export const ORDER_OPTIONS_STORIES = [
  { key: 'recente', label: 'Mais recentes' },
  { key: 'alcance', label: 'Maior alcance' },
  { key: 'replies', label: 'Mais replies' },
  { key: 'exits', label: 'Mais exits' },
]
