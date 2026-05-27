/**
 * Humaniza intervalos de tempo em pt-BR.
 *   humanizeDate('2026-05-27T00:00:00Z')  // → "hoje"
 *   humanizeDate(dateString_2_dias_atras)  // → "2 dias atrás"
 *   humanizeDate(dateString_15_dias)        // → "2 sem"
 *   humanizeDate(dateString_45_dias)        // → "1 mês"
 *
 * Retorna "" se input inválido (não estoura).
 */

export function humanizeDate(iso) {
  if (!iso) return ''
  let dt
  try {
    dt = new Date(iso)
    if (isNaN(dt.getTime())) return ''
  } catch {
    return ''
  }

  const now = new Date()
  const diffMs = now.getTime() - dt.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays < 0) return 'futuro'
  if (diffDays === 0) return 'hoje'
  if (diffDays === 1) return 'ontem'
  if (diffDays < 7) return `${diffDays} dias atrás`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return weeks === 1 ? '1 sem' : `${weeks} sem`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return months === 1 ? '1 mês' : `${months} meses`
  }
  const years = Math.floor(diffDays / 365)
  return years === 1 ? '1 ano' : `${years} anos`
}
