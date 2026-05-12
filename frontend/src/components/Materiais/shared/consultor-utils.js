/**
 * Helpers de matching consultor↔cliente.
 *
 * `clientes.consultor_responsavel` é string livre tipo "Pedro Aranda".
 * Email do user é tipo "pedroaranda@grupoguglielmi.com".
 * Match precisa normalizar espaços/case pra ligar os dois.
 */

const ALLOWED_DOMAIN = '@grupoguglielmi.com'

export function isAdminFromSession(session) {
  const role = session?.user?.user_metadata?.role
  if (role === 'owner' || role === 'admin') return true
  const email = (session?.user?.email || '').toLowerCase()
  // Fallback: Pedro (owner hardcoded no backend) sempre é admin
  return email === 'pedroaranda@grupoguglielmi.com'
}

/**
 * Normaliza string pra comparação: lowercase, sem espaços, sem acentos.
 */
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // remove diacritics
    .replace(/\s+/g, '')
    .trim()
}

/**
 * Match cliente.consultor_responsavel ↔ identificador do consultor.
 * Identificador pode ser:
 *   - email completo do user: "lucasnery@grupoguglielmi.com"
 *   - handle (parte antes do @): "lucasnery"
 *   - nome do consultor: "Lucas Nery"
 */
export function matchConsultor(consultorResponsavel, identificador) {
  if (!consultorResponsavel || !identificador) return false
  const cn = normalize(consultorResponsavel)
  let id = identificador
  if (id.includes('@')) id = id.split('@')[0]
  const idn = normalize(id)
  if (!idn || !cn) return false
  // Match bidirecional pra cobrir "pedroaranda" ↔ "pedro aranda"
  return cn.includes(idn) || idn.includes(cn)
}

/**
 * Lista de consultores distintos extraída do array de clientes.
 * Retorna [{ nome, count }] ordenado por count desc.
 */
export function listConsultoresFromClientes(clientes) {
  const counts = new Map()
  for (const c of clientes || []) {
    const nome = (c.consultor_responsavel || '').trim()
    if (!nome) continue
    counts.set(nome, (counts.get(nome) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([nome, count]) => ({ nome, count }))
    .sort((a, b) => b.count - a.count)
}

export { ALLOWED_DOMAIN }
