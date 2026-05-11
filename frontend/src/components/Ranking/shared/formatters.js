// Formatadores compartilhados entre RankingClientes e RankingConsultores.

export function formatCompact(n) {
  const num = Number(n) || 0
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace('.0', '') + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace('.0', '') + 'K'
  return num.toLocaleString('pt-BR')
}

// Atenção Master: severidade por dias sem postar.
// >=14 dias = CRÍTICO (vermelho), 7-13 = CRISE (laranja), 4-6 = ATENÇÃO (amarelo).
// Retorna null se não está em nenhum tier (ok).
export function severidadeAtencao(dias) {
  if (dias >= 14) return { tier: 'critical', label: 'CRÍTICO', color: '#EF4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.40)', glow: 'rgba(239,68,68,0.25)' }
  if (dias >= 7)  return { tier: 'high',     label: 'GESTÃO DE CRISE', color: '#F97316', bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.40)', glow: 'rgba(249,115,22,0.20)' }
  if (dias >= 4)  return { tier: 'med',      label: 'ATENÇÃO',  color: '#FBBF24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.35)', glow: 'rgba(251,191,36,0.18)' }
  return null
}
