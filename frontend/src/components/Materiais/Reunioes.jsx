/**
 * Reunioes — grid de clientes × encontros disponíveis (encontros_base).
 *
 * Em Phase B é exibição read-only. Phase C adiciona click → editor + status
 * de encontros_pratica.
 *
 * Filtro de clientes: consultor vê só seus clientes (padrão de Metricas);
 * admin vê todos.
 */

import { useState, useMemo } from 'react'
import { Search, Presentation, AlertCircle } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { Avatar } from '../ui/Avatar'
import EncontroCard from './shared/EncontroCard'

export default function MateriaisReunioes({ session }) {
  const { clientes: allClientes, encontrosBase } = useApp()
  const [busca, setBusca] = useState('')

  const encontros = useMemo(
    () => [...(encontrosBase || [])].sort((a, b) => a.numero - b.numero),
    [encontrosBase]
  )

  const userEmail = session?.user?.email || ''
  const role = session?.user?.user_metadata?.role
  const isAdmin = role === 'owner' || role === 'admin' || userEmail.includes('pedro')

  const clientesVisiveis = useMemo(() => {
    const base = isAdmin
      ? allClientes
      : allClientes.filter(c =>
          c.consultor_responsavel?.toLowerCase().includes(userEmail.split('@')[0] || '')
        )
    if (!busca.trim()) return base
    const q = busca.toLowerCase()
    return base.filter(c =>
      c.nome?.toLowerCase().includes(q) || c.empresa?.toLowerCase().includes(q)
    )
  }, [allClientes, busca, isAdmin, userEmail])

  if (encontros.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <AlertCircle size={28} className="text-white/20 mx-auto mb-3" />
          <p className="text-sm text-white/40">
            Nenhum encontro cadastrado em <code className="text-white/60">encontros_base</code>.
          </p>
          <p className="text-xs text-white/25 mt-1">
            Admin precisa criar os encontros antes de aparecerem aqui.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Presentation size={16} className="text-gold-mid" />
          <p className="text-sm font-semibold text-white/80">Reuniões da Jornada</p>
          <span className="text-[10px] text-white/30">
            ({clientesVisiveis.length} clientes · {encontros.length} encontros)
          </span>
        </div>

        <div className="flex-1 max-w-xs ml-auto">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="search"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded bg-white/5 border border-white/8 text-white/80 focus:outline-none focus:border-gold-mid/40"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {clientesVisiveis.length === 0 ? (
          <div className="text-center py-16 text-xs text-white/30">
            Nenhum cliente encontrado.
          </div>
        ) : (
          <div className="space-y-3">
            {clientesVisiveis.map(c => (
              <ClienteRow key={c.id} cliente={c} encontros={encontros} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ClienteRow({ cliente, encontros }) {
  const encontroAtual = cliente.encontro_atual || 1
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: 'var(--flg-bg-card)',
        border: '1px solid var(--flg-border)',
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <Avatar name={cliente.nome} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/85 font-medium truncate">{cliente.nome}</p>
          <p className="text-[10px] text-white/35 truncate">
            {cliente.empresa || '—'} · {cliente.consultor_responsavel || 'sem consultor'}
          </p>
        </div>
        <span className="text-[10px] text-gold-mid flex-shrink-0">
          E{encontroAtual} atual
        </span>
      </div>

      <div className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${Math.min(encontros.length, 5)}, minmax(0, 1fr))`,
        }}
      >
        {encontros.map(enc => (
          <EncontroCard
            key={enc.numero}
            encontroBase={enc}
            encontroPratica={null}
          />
        ))}
      </div>
    </div>
  )
}
