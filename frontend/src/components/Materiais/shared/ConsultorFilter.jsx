/**
 * ConsultorFilter — tabs/pills "Todos · Pedro Aranda · Lucas Nery · Rebecca Rachel · ...".
 *
 * Lista de consultores derivada dinamicamente dos clientes (DISTINCT consultor_responsavel),
 * com fallback hardcoded pros 3 nomes oficiais quando a lista está vazia (estado inicial).
 */

import { useMemo } from 'react'
import { listConsultoresFromClientes } from './consultor-utils'

const CONSULTORES_OFICIAIS = ['Pedro Aranda', 'Lucas Nery', 'Rebecca Rachel']

export default function ConsultorFilter({ value, onChange, clientes }) {
  const consultores = useMemo(() => {
    const fromData = listConsultoresFromClientes(clientes).map(c => c.nome)
    // Une dados reais com lista oficial (mantém oficiais mesmo sem clientes ainda).
    const setAll = new Set([...CONSULTORES_OFICIAIS, ...fromData])
    // Ordena: oficiais primeiro (na ordem definida), depois outros em ordem alfabética
    const oficiais = CONSULTORES_OFICIAIS.filter(n => setAll.has(n))
    const outros = Array.from(setAll)
      .filter(n => !CONSULTORES_OFICIAIS.includes(n))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return [...oficiais, ...outros]
  }, [clientes])

  const opcoes = [
    { key: 'todos', label: 'Todos' },
    ...consultores.map(nome => ({ key: nome, label: nome })),
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
