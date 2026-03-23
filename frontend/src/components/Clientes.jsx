import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  flexRender, createColumnHelper,
} from '@tanstack/react-table'
import {
  Search, Plus, LayoutGrid, List, ChevronUp, ChevronDown,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
} from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { Avatar } from './ui/Avatar'
import { StatusBadge } from './ui/Badge'
import { SkeletonCard } from './ui/Skeleton'
import { progressPercent, formatDate, isAdmin as checkAdmin, cn } from '../lib/utils'

/* ─── Card individual (igual ao Dashboard) ─── */
function ClientCard({ cliente, onPreparar, onMateriais, delay = 0 }) {
  const [hovered, setHovered] = useState(false)
  const pct = progressPercent(cliente.encontro_atual)
  const navigate = useNavigate()

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="card-flg-hover p-5 relative overflow-hidden cursor-pointer"
      onClick={() => navigate(`/clientes/${cliente.id}`)}
    >
      <div className="flex items-start gap-3 mb-4">
        <Avatar name={cliente.nome} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white/90 text-sm truncate">{cliente.nome}</p>
            <StatusBadge status={cliente.status || 'ativo'} />
          </div>
          <p className="text-xs text-white/40 truncate mt-0.5">{cliente.empresa}</p>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: 'rgba(201,168,76,0.15)', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.25)' }}>
          E{cliente.encontro_atual || 1}
        </span>
      </div>

      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-xs text-white/30">
          <span>Jornada</span>
          <span>{cliente.encontro_atual || 1} / 15</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, delay: delay + 0.2, ease: 'easeOut' }}
            className="h-full rounded-full gold-gradient"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-white/25">{cliente.consultor_responsavel}</p>
        {cliente.updated_at && (
          <p className="text-[10px] text-white/20">{formatDate(cliente.updated_at)}</p>
        )}
      </div>

      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-end p-4 gap-2"
            style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.95) 55%, transparent)' }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={onPreparar} className="flex-1 btn-gold text-xs py-2 px-3">Preparar</button>
            <button onClick={onMateriais} className="flex-1 btn-outline-gold text-xs py-2 px-3">Materiais</button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ─── Seção agrupada por status (modo cards) ─── */
function StatusSection({ label, clientes, onPreparar, onMateriais }) {
  if (clientes.length === 0) return null
  return (
    <div className="mb-8">
      <h3 className="text-xs font-medium tracking-widest uppercase text-white/30 mb-4">{label} · {clientes.length}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {clientes.map((c, i) => (
          <ClientCard
            key={c.id}
            cliente={c}
            delay={i * 0.03}
            onPreparar={() => onPreparar(c)}
            onMateriais={() => onMateriais(c)}
          />
        ))}
      </div>
    </div>
  )
}

/* ─── Header de coluna ordenável ─── */
function SortHeader({ column, children }) {
  const sorted = column.getIsSorted()
  return (
    <button
      onClick={column.getToggleSortingHandler()}
      className="flex items-center gap-1 text-left hover:text-white/80 transition-colors cursor-pointer"
    >
      {children}
      <span className="w-3 text-white/20">
        {sorted === 'asc'  ? <ChevronUp size={11} className="text-gold-mid" /> :
         sorted === 'desc' ? <ChevronDown size={11} className="text-gold-mid" /> :
         <ChevronUp size={11} className="opacity-0 group-hover:opacity-40" />}
      </span>
    </button>
  )
}

const columnHelper = createColumnHelper()

/* ─── Tabela principal ─── */
function ClientTable({ data, isAdmin, onPreparar, onMateriais }) {
  const navigate = useNavigate()
  const [sorting, setSorting] = useState([{ id: 'nome', desc: false }])

  const columns = useMemo(() => {
    const cols = [
      columnHelper.accessor('nome', {
        header: ({ column }) => <SortHeader column={column}>Nome</SortHeader>,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar name={row.original.nome} size="sm" className="flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/85 truncate">{row.original.nome}</p>
              <p className="text-xs text-white/35 truncate">{row.original.empresa}</p>
            </div>
          </div>
        ),
        size: 220,
      }),
      columnHelper.accessor('status', {
        header: ({ column }) => <SortHeader column={column}>Status</SortHeader>,
        cell: ({ getValue }) => <StatusBadge status={getValue() || 'ativo'} />,
        size: 100,
      }),
      columnHelper.accessor('encontro_atual', {
        header: ({ column }) => <SortHeader column={column}>Encontro</SortHeader>,
        cell: ({ getValue }) => {
          const n = getValue() || 1
          const pct = progressPercent(n)
          return (
            <div className="flex items-center gap-2 min-w-[100px]">
              <span className="text-xs font-bold text-gold-mid w-8">{n}/15</span>
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full gold-gradient" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        },
        size: 150,
      }),
    ]
    if (isAdmin) {
      cols.push(
        columnHelper.accessor('consultor_responsavel', {
          header: ({ column }) => <SortHeader column={column}>Consultor</SortHeader>,
          cell: ({ getValue }) => <span className="text-xs text-white/50">{getValue() || '—'}</span>,
          size: 160,
        })
      )
    }
    cols.push(
      columnHelper.accessor('updated_at', {
        header: ({ column }) => <SortHeader column={column}>Atualizado</SortHeader>,
        cell: ({ getValue }) => <span className="text-xs text-white/30">{formatDate(getValue())}</span>,
        size: 120,
      }),
      columnHelper.display({
        id: 'acoes',
        header: () => null,
        cell: ({ row }) => (
          <div className="flex gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={e => { e.stopPropagation(); onPreparar(row.original) }}
              className="btn-gold text-[10px] py-1 px-2.5"
            >Preparar</button>
            <button
              onClick={e => { e.stopPropagation(); onMateriais(row.original) }}
              className="btn-outline-gold text-[10px] py-1 px-2.5"
            >Materiais</button>
          </div>
        ),
        size: 160,
      })
    )
    return cols
  }, [isAdmin, onPreparar, onMateriais])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  })

  return (
    <div>
      <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <table className="w-full border-collapse">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#0e0e0e' }}>
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize(), padding: '10px 16px' }}
                    className="text-left text-[10px] tracking-widest uppercase text-white/30 font-medium whitespace-nowrap"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <motion.tr
                key={row.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, delay: i * 0.015 }}
                className="group cursor-pointer transition-colors"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                onClick={() => navigate(`/clientes/${row.original.id}`)}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} style={{ padding: '12px 16px' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-xs text-white/25">
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              data.length
            )} de {data.length}
          </p>
          <div className="flex items-center gap-1">
            {[
              { icon: ChevronsLeft,  action: () => table.setPageIndex(0),         disabled: !table.getCanPreviousPage() },
              { icon: ChevronLeft,   action: () => table.previousPage(),           disabled: !table.getCanPreviousPage() },
              { icon: ChevronRight,  action: () => table.nextPage(),               disabled: !table.getCanNextPage() },
              { icon: ChevronsRight, action: () => table.setPageIndex(table.getPageCount() - 1), disabled: !table.getCanNextPage() },
            ].map(({ icon: Icon, action, disabled }, i) => (
              <button
                key={i}
                onClick={action}
                disabled={disabled}
                className="w-7 h-7 rounded flex items-center justify-center transition-colors disabled:opacity-20 cursor-pointer disabled:cursor-default"
                style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
                onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              >
                <Icon size={12} className="text-white/50" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Página principal ─── */
export default function Clientes({ session }) {
  const { clientes: allClientes, loading } = useApp()
  const navigate = useNavigate()

  const [search, setSearch]           = useState('')
  const [filterStatus, setFilterStatus]       = useState('todos')
  const [filterConsultor, setFilterConsultor] = useState('todos')
  const [viewMode, setViewMode]       = useState('cards') // 'cards' | 'table'

  const isAdmin   = checkAdmin(session?.user)
  const userEmail = session?.user?.email

  const consultores = useMemo(
    () => [...new Set(allClientes.map(c => c.consultor_responsavel).filter(Boolean))],
    [allClientes]
  )

  const filtered = useMemo(() => allClientes.filter(c => {
    const matchSearch    = !search || c.nome?.toLowerCase().includes(search.toLowerCase()) || c.empresa?.toLowerCase().includes(search.toLowerCase())
    const matchStatus    = filterStatus === 'todos' || (c.status || 'ativo') === filterStatus
    const matchConsultor = filterConsultor === 'todos' || c.consultor_responsavel === filterConsultor
    const matchOwner     = isAdmin || c.consultor_responsavel?.toLowerCase().includes(userEmail?.split('@')[0] || '')
    return matchSearch && matchStatus && matchConsultor && matchOwner
  }), [allClientes, search, filterStatus, filterConsultor, isAdmin, userEmail])

  const ativos   = filtered.filter(c => (c.status || 'ativo') === 'ativo')
  const pausados = filtered.filter(c => c.status === 'pausado')
  const inativos = filtered.filter(c => c.status === 'inativo')

  function handlePreparar(c) {
    navigate(`/clientes/${c.id}/encontro/${c.encontro_atual || 1}`)
  }
  function handleMateriais(c) {
    navigate(`/materiais?cliente=${c.id}`)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">
            {isAdmin ? 'Todos os Clientes' : 'Meus Clientes'}
          </h2>
          <p className="text-sm text-white/30 mt-0.5">
            {filtered.length} founder{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle modo */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            {[
              { mode: 'cards', icon: LayoutGrid },
              { mode: 'table', icon: List },
            ].map(({ mode, icon: Icon }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn('w-8 h-8 flex items-center justify-center transition-colors cursor-pointer', viewMode === mode ? 'text-gold-mid' : 'text-white/25 hover:text-white/50')}
                style={viewMode === mode ? { background: 'rgba(201,168,76,0.12)' } : {}}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
          {isAdmin && (
            <button onClick={() => navigate('/clientes/novo')} className="btn-gold flex items-center gap-2">
              <Plus size={14} />
              Novo Cliente
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou empresa…"
            className="input-flg pl-9"
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-flg w-auto pr-8 cursor-pointer">
          <option value="todos">Todos os status</option>
          <option value="ativo">Ativos</option>
          <option value="pausado">Pausados</option>
          <option value="inativo">Inativos</option>
        </select>
        {isAdmin && (
          <select value={filterConsultor} onChange={e => setFilterConsultor(e.target.value)} className="input-flg w-auto pr-8 cursor-pointer">
            <option value="todos">Todos os consultores</option>
            {consultores.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* Conteúdo */}
      {loading && allClientes.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-white/40 text-sm">Nenhum cliente encontrado</p>
          {search && <p className="text-white/20 text-xs mt-1">Tente ajustar a busca</p>}
        </div>
      ) : viewMode === 'table' ? (
        <ClientTable
          data={filtered}
          isAdmin={isAdmin}
          onPreparar={handlePreparar}
          onMateriais={handleMateriais}
        />
      ) : (
        /* Modo cards — agrupado por status */
        filterStatus !== 'todos' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((c, i) => (
              <ClientCard key={c.id} cliente={c} delay={i * 0.03} onPreparar={() => handlePreparar(c)} onMateriais={() => handleMateriais(c)} />
            ))}
          </div>
        ) : (
          <>
            <StatusSection label="Ativos"   clientes={ativos}   onPreparar={handlePreparar} onMateriais={handleMateriais} />
            <StatusSection label="Pausados" clientes={pausados} onPreparar={handlePreparar} onMateriais={handleMateriais} />
            <StatusSection label="Inativos" clientes={inativos} onPreparar={handlePreparar} onMateriais={handleMateriais} />
          </>
        )
      )}
    </div>
  )
}
