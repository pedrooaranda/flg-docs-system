/**
 * Materiais — tela inicial: escolha de cliente.
 *
 * Filtro de consultor:
 *   - Admin/owner: tabs Pedro Aranda · Lucas Nery · Rebecca Rachel · Todos.
 *   - Consultor: auto-filtrado, sem tabs (vê só seus clientes).
 *
 * Click no cliente → /materiais/cliente/:cid (= /materiais/cliente/:cid/diarios).
 *
 * Design tokens: ouro #C9A84C, JetBrains Mono em "E0N", eyebrow uppercase tracking-widest.
 */

import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, FileText } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import ConsultorFilter from './shared/ConsultorFilter'
import ClienteCard from './shared/ClienteCard'
import { matchConsultor, isAdminFromSession } from './shared/consultor-utils'

export default function MateriaisHome({ session }) {
  const { clientes } = useApp()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const admin = isAdminFromSession(session)
  const userEmail = session?.user?.email || ''
  const [busca, setBusca] = useState('')

  // Filtro de consultor:
  //   - admin: vem da URL `?consultor=` (default 'todos')
  //   - consultor: forçado ao próprio (não acessa outros)
  const consultorFiltro = admin ? (searchParams.get('consultor') || 'todos') : 'self'

  function setConsultor(val) {
    const next = new URLSearchParams(searchParams)
    if (val === 'todos') next.delete('consultor')
    else next.set('consultor', val)
    setSearchParams(next, { replace: true })
  }

  const clientesFiltrados = useMemo(() => {
    let lista = clientes
    if (consultorFiltro === 'self') {
      lista = lista.filter(c => matchConsultor(c.consultor_responsavel, userEmail))
    } else if (consultorFiltro !== 'todos') {
      // admin escolheu um consultor específico (nome ou handle)
      lista = lista.filter(c => matchConsultor(c.consultor_responsavel, consultorFiltro))
    }
    if (busca.trim()) {
      const q = busca.toLowerCase()
      lista = lista.filter(c =>
        c.nome?.toLowerCase().includes(q) || c.empresa?.toLowerCase().includes(q)
      )
    }
    return lista
  }, [clientes, consultorFiltro, busca, userEmail])

  function handleClick(cliente) {
    navigate(`/materiais/cliente/${cliente.id}`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header com filtro de consultor e busca */}
      <div className="px-6 pt-6 pb-4 border-b border-white/5 flex-shrink-0 space-y-4"
        style={{ background: 'var(--flg-bg-secondary)' }}>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] tracking-[0.25em] uppercase text-gold-mid/70 font-monodeck mb-1">
              Materiais
            </p>
            <h1 className="text-2xl font-serifdeck font-medium text-white/95 leading-tight">
              Escolha o cliente
            </h1>
            <p className="text-xs text-white/40 mt-1">
              Cada cliente tem sua própria área com diários e reuniões.
            </p>
          </div>

          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="search"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-64 pl-8 pr-3 py-2 text-xs rounded bg-white/5 border border-white/8 text-white/80 focus:outline-none focus:border-gold-mid/40"
            />
          </div>
        </div>

        {admin && (
          <ConsultorFilter
            value={consultorFiltro}
            onChange={setConsultor}
            clientes={clientes}
          />
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto px-6 py-6">
        {clientesFiltrados.length === 0 ? (
          <EmptyState admin={admin} consultorFiltro={consultorFiltro} />
        ) : (
          <div className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
          >
            {clientesFiltrados.map(c => (
              <ClienteCard key={c.id} cliente={c} onClick={() => handleClick(c)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ admin, consultorFiltro }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-sm">
        <FileText size={32} className="text-white/15 mx-auto mb-3" />
        <p className="text-sm text-white/50 mb-1">Nenhum cliente nesse filtro</p>
        <p className="text-xs text-white/30">
          {admin
            ? consultorFiltro === 'todos'
              ? 'Cadastre um cliente em Clientes pra começar.'
              : 'Esse consultor não tem clientes ativos no momento.'
            : 'Você ainda não tem clientes atribuídos.'}
        </p>
      </div>
    </div>
  )
}
