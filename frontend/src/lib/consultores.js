/**
 * Utilitários relacionados a consultores — compartilhado entre telas (Clientes,
 * Métricas, Ranking, Dashboard). Antes vivia em Materiais/shared/consultor-utils.js,
 * mas foi movido pra cá porque componentes em `components/ui/` não devem importar
 * de namespace específico de Materiais.
 *
 * Funções específicas de matching (matchConsultor) e auth (isAdminFromSession)
 * continuam em Materiais/shared/consultor-utils.js — uso restrito àquela área.
 */

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
