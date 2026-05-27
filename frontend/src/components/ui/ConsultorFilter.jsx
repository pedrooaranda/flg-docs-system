/**
 * ConsultorFilter — tabs/pills "CONSULTOR · Todos · Pedro Aranda · Lucas Nery · ...".
 *
 * Componente compartilhado de filtro por consultor — usado em todas as telas
 * com lista de clientes (Clientes, Métricas, Ranking, Dashboard, Materiais).
 * Substitui dropdowns `<select>` vanilla por UI consistente.
 *
 * Source de consultores:
 *   - Por padrão deriva de `clientes` (DISTINCT consultor_responsavel)
 *   - Override explícito via prop `consultores: string[]` quando a tela não
 *     tem array de clientes acessível (ex: Métricas top-level)
 *
 * Sempre inclui CONSULTORES_OFICIAIS hardcoded como fallback, pra garantir
 * que os 3 nomes oficiais aparecem mesmo quando lista vazia (estado inicial).
 */

import { useMemo } from 'react'
import { listConsultoresFromClientes } from '../../lib/consultores'

const CONSULTORES_OFICIAIS = ['Pedro Aranda', 'Lucas Nery', 'Rebecca Rachel']

export default function ConsultorFilter({ value, onChange, clientes, consultores }) {
  const lista = useMemo(() => {
    // Source: prop explícita (consultores) tem precedência sobre derivado de clientes
    const fromSource = consultores
      ? consultores
      : listConsultoresFromClientes(clientes).map(c => c.nome)
    // Une com lista oficial (mantém oficiais mesmo sem dados ainda).
    const setAll = new Set([...CONSULTORES_OFICIAIS, ...fromSource])
    // Ordena: oficiais primeiro (na ordem definida), depois outros alfabético
    const oficiais = CONSULTORES_OFICIAIS.filter(n => setAll.has(n))
    const outros = Array.from(setAll)
      .filter(n => !CONSULTORES_OFICIAIS.includes(n))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return [...oficiais, ...outros]
  }, [clientes, consultores])

  const opcoes = [
    { key: 'todos', label: 'Todos' },
    ...lista.map(nome => ({ key: nome, label: nome })),
  ]

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[9px] tracking-[0.2em] uppercase text-white/30 font-monodeck mr-2">
        Consultor
      </span>
      {opcoes.map(opt => {
        const ativo = value === opt.key
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
            style={ativo
              ? {
                  background: 'rgba(201,168,76,0.18)',
                  color: '#C9A84C',
                  border: '1px solid rgba(201,168,76,0.45)',
                  boxShadow: '0 0 0 1px rgba(201,168,76,0.08) inset',
                }
              : {
                  background: 'rgba(255,255,255,0.03)',
                  color: 'rgba(255,255,255,0.45)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }
            }
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
