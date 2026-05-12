/**
 * Constantes compartilhadas de Materiais/Reuniões.
 *
 * Em Phase B só usamos os 2 primeiros status (sem encontros_pratica ainda).
 * Phase C expande pra rascunho/pronto/apresentado quando essa tabela existir.
 */

export const ENCONTRO_STATUS = {
  intelectual_pendente: {
    label: 'Intelectual pendente',
    color: 'rgba(255,255,255,0.30)',
    bg: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.10)',
  },
  aguardando_pratica: {
    label: 'Aguardando prática',
    color: 'rgba(250,250,248,0.55)',
    bg: 'rgba(201,168,76,0.05)',
    border: 'rgba(201,168,76,0.15)',
  },
  rascunho: {
    label: 'Rascunho',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.10)',
    border: 'rgba(245,158,11,0.30)',
  },
  pronto: {
    label: 'Pronto',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.10)',
    border: 'rgba(52,211,153,0.30)',
  },
  apresentado: {
    label: 'Apresentado',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.10)',
    border: 'rgba(96,165,250,0.30)',
  },
}

/**
 * Deriva o status visual do encontro a partir de:
 *   - `encontroBase` (linha de encontros_base): tem html_intelecto?
 *   - `encontroPratica` (nullable, futuro Phase C): status + slug
 *
 * Em Phase B, encontroPratica é sempre null.
 */
export function deriveStatus(encontroBase, encontroPratica) {
  if (encontroPratica) {
    if (encontroPratica.status === 'apresentado') return 'apresentado'
    if (encontroPratica.status === 'pronto')      return 'pronto'
    return 'rascunho'
  }
  if (!encontroBase?.html_intelecto || !encontroBase.html_intelecto.trim()) {
    return 'intelectual_pendente'
  }
  return 'aguardando_pratica'
}
