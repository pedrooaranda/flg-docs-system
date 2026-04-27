/**
 * Componentes auxiliares da página Métricas:
 *   - DateRangePicker (com presets + react-day-picker)
 *   - Skeletons (KPI grid, charts, heatmap, posts)
 *   - PostsTable (TanStack Table com sort/filter/export)
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { format, subDays, startOfMonth, endOfMonth, subMonths, differenceInCalendarDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Calendar, ChevronDown, Check, Search,
  Heart, MessageCircle, Bookmark, ExternalLink, Download, LayoutGrid, Table2, ArrowUpDown
} from 'lucide-react'
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table'

// ─── DateRangePicker ──────────────────────────────────────────────────────────

const PRESETS = [
  { label: 'Últimos 7 dias', dias: 7 },
  { label: 'Últimos 30 dias', dias: 30 },
  { label: 'Últimos 90 dias', dias: 90 },
  { label: 'Últimos 180 dias', dias: 180 },
  { label: 'Mês atual', range: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: 'Mês anterior', range: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
]

export function DateRangePicker({ periodo, onChange, accent = '#C9A84C' }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('preset') // 'preset' | 'custom'
  const [range, setRange] = useState(undefined)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const currentLabel = useMemo(() => {
    const found = PRESETS.find(p => p.dias === periodo)
    if (found) return found.label
    if (range?.from && range?.to) {
      return `${format(range.from, 'dd/MM/yy')} → ${format(range.to, 'dd/MM/yy')}`
    }
    return `Últimos ${periodo} dias`
  }, [periodo, range])

  function applyPreset(preset) {
    if (preset.dias) {
      onChange(preset.dias)
      setRange(undefined)
    } else if (preset.range) {
      const r = preset.range()
      const dias = Math.max(1, differenceInCalendarDays(r.to, r.from) + 1)
      setRange(r)
      onChange(dias, r)
    }
    setOpen(false)
  }

  function applyCustom() {
    if (!range?.from || !range?.to) return
    const dias = Math.max(1, differenceInCalendarDays(range.to, range.from) + 1)
    onChange(dias, range)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs font-semibold rounded-lg px-3 py-2 cursor-pointer"
        style={{
          background: 'var(--flg-bg-raised)',
          border: `1px solid ${accent}30`,
          color: 'var(--flg-text)',
        }}
      >
        <Calendar size={13} style={{ color: accent }} />
        <span>{currentLabel}</span>
        <ChevronDown size={12} className="opacity-50" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 z-50 rounded-xl overflow-hidden flex"
            style={{
              background: 'var(--flg-bg-raised)',
              border: `1px solid ${accent}30`,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            {/* Coluna presets */}
            <div className="py-2 min-w-[160px] border-r" style={{ borderColor: 'var(--flg-border)' }}>
              {PRESETS.map(p => {
                const active = p.dias === periodo
                return (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    className="w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors"
                    style={{
                      color: active ? accent : 'var(--flg-text)',
                      background: active ? `${accent}10` : 'transparent',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--flg-bg-hover)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span>{p.label}</span>
                    {active && <Check size={12} />}
                  </button>
                )
              })}
              <button
                onClick={() => setMode('custom')}
                className="w-full text-left px-3 py-2 text-xs transition-colors"
                style={{
                  color: mode === 'custom' ? accent : 'var(--flg-text-muted)',
                  background: mode === 'custom' ? `${accent}10` : 'transparent',
                  borderTop: '1px solid var(--flg-border)',
                  marginTop: 4,
                  paddingTop: 8,
                }}
              >
                Personalizado…
              </button>
            </div>
            {/* Coluna calendário (só aparece em mode='custom') */}
            {mode === 'custom' && (
              <div className="p-2">
                <div className="flg-daypicker">
                  <DayPicker
                    mode="range"
                    selected={range}
                    onSelect={setRange}
                    numberOfMonths={2}
                    locale={ptBR}
                    weekStartsOn={0}
                    showOutsideDays={false}
                  />
                </div>
                <div className="flex justify-between items-center px-2 pb-2">
                  <div className="text-[10px] text-white/40">
                    {range?.from && range?.to
                      ? `${differenceInCalendarDays(range.to, range.from) + 1} dias selecionados`
                      : 'Selecione início e fim'}
                  </div>
                  <button
                    onClick={applyCustom}
                    disabled={!range?.from || !range?.to}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-md disabled:opacity-30"
                    style={{
                      background: accent,
                      color: '#1a1300',
                    }}
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function Skel({ w = '100%', h = 14, rounded = 'rounded-md' }) {
  return (
    <div
      className={`${rounded} animate-pulse`}
      style={{
        width: w, height: h,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%)',
        backgroundSize: '200% 100%',
      }}
    />
  )
}

export function KpiGridSkeleton({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl p-4 flex flex-col gap-3"
          style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}
        >
          <div className="flex items-center justify-between">
            <Skel w={70} h={10} />
            <Skel w={14} h={14} rounded="rounded-full" />
          </div>
          <div className="flex items-end justify-between gap-2">
            <Skel w={80} h={28} />
            <Skel w={70} h={24} />
          </div>
          <Skel w={100} h={10} />
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton({ h = 240 }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}
    >
      <Skel w={140} h={12} />
      <div className="mt-4">
        <Skel h={h} rounded="rounded-lg" />
      </div>
    </div>
  )
}

export function HeatmapSkeleton() {
  return (
    <div
      className="rounded-xl p-5 space-y-2"
      style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}
    >
      <Skel w={180} h={12} />
      <div className="space-y-1.5 mt-3">
        {Array.from({ length: 5 }).map((_, fi) => (
          <div key={fi} className="grid gap-1" style={{ gridTemplateColumns: '52px repeat(7, 1fr)' }}>
            <Skel h={26} rounded="rounded-md" />
            {Array.from({ length: 7 }).map((_, di) => (
              <Skel key={di} h={26} rounded="rounded-md" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function PostsGridSkeleton({ count = 9 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl p-4 space-y-3"
          style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}
        >
          <div className="flex justify-between">
            <Skel w={60} h={20} rounded="rounded" />
            <Skel w={80} h={12} />
          </div>
          <Skel w="80%" h={14} />
          <div className="flex gap-3 pt-2">
            <Skel w={48} h={12} />
            <Skel w={48} h={12} />
            <Skel w={48} h={12} />
          </div>
          <Skel w={80} h={10} />
        </div>
      ))}
    </div>
  )
}

// ─── PostsTable (TanStack) ────────────────────────────────────────────────────

const TYPE_COLORS = {
  REEL:     { bg: '#7C3AED20', fg: '#A78BFA' },
  VIDEO:    { bg: '#EC489920', fg: '#F472B6' },
  CAROUSEL: { bg: '#0EA5E920', fg: '#38BDF8' },
  IMAGE:    { bg: '#C9A84C20', fg: '#C9A84C' },
  STORY:    { bg: '#EAB30820', fg: '#FACC15' },
}

function exportCSV(rows, filename = 'top-posts.csv') {
  if (!rows.length) return
  const cols = ['tipo', 'publicado_em', 'taxa_engajamento', 'curtidas', 'comentarios', 'salvamentos', 'alcance', 'legenda']
  const header = cols.join(',')
  const body = rows.map(r =>
    cols.map(c => {
      const v = r[c]
      if (v == null) return ''
      const s = String(v).replace(/"/g, '""')
      return /[",\n]/.test(s) ? `"${s}"` : s
    }).join(',')
  ).join('\n')
  const csv = `${header}\n${body}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function PostsTable({ posts, accent = '#E4405F' }) {
  const [sorting, setSorting] = useState([{ id: 'taxa_engajamento', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')
  const [tipoFilter, setTipoFilter] = useState('all')

  const tipos = useMemo(() => {
    const set = new Set(posts.map(p => p.tipo))
    return ['all', ...Array.from(set).sort()]
  }, [posts])

  const filteredData = useMemo(() => {
    return tipoFilter === 'all' ? posts : posts.filter(p => p.tipo === tipoFilter)
  }, [posts, tipoFilter])

  const columns = useMemo(() => [
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ getValue }) => {
        const t = getValue()
        const c = TYPE_COLORS[t] || { bg: 'rgba(255,255,255,0.08)', fg: '#fff' }
        return (
          <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded" style={{ background: c.bg, color: c.fg }}>
            {t}
          </span>
        )
      },
    },
    {
      accessorKey: 'legenda',
      header: 'Legenda',
      cell: ({ getValue, row }) => (
        <div className="flex items-center gap-2 max-w-md">
          <span className="truncate text-white/80">{getValue()}</span>
          {row.original.permalink && (
            <a href={row.original.permalink} target="_blank" rel="noopener noreferrer" className="opacity-40 hover:opacity-90 shrink-0">
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'taxa_engajamento',
      header: 'Eng. %',
      cell: ({ getValue }) => (
        <span className="font-semibold" style={{ color: accent }}>
          {Number(getValue()).toFixed(2)}%
        </span>
      ),
    },
    {
      accessorKey: 'curtidas',
      header: () => <span className="inline-flex items-center gap-1"><Heart size={10} /></span>,
      cell: ({ getValue }) => <span className="text-white/70">{Number(getValue() || 0).toLocaleString('pt-BR')}</span>,
    },
    {
      accessorKey: 'comentarios',
      header: () => <span className="inline-flex items-center gap-1"><MessageCircle size={10} /></span>,
      cell: ({ getValue }) => <span className="text-white/70">{Number(getValue() || 0).toLocaleString('pt-BR')}</span>,
    },
    {
      accessorKey: 'salvamentos',
      header: () => <span className="inline-flex items-center gap-1"><Bookmark size={10} /></span>,
      cell: ({ getValue }) => <span className="text-white/70">{Number(getValue() || 0).toLocaleString('pt-BR')}</span>,
    },
    {
      accessorKey: 'alcance',
      header: 'Alcance',
      cell: ({ getValue }) => <span className="text-white/70">{Number(getValue() || 0).toLocaleString('pt-BR')}</span>,
    },
    {
      accessorKey: 'publicado_em',
      header: 'Data',
      cell: ({ getValue }) => <span className="text-white/40 text-[11px]">{getValue()}</span>,
    },
  ], [accent])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            placeholder="Buscar na legenda…"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-xs bg-black/30 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
          />
        </div>
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
          {tipos.map(t => (
            <button
              key={t}
              onClick={() => setTipoFilter(t)}
              className="px-2.5 py-1 rounded text-[10px] font-semibold tracking-wider"
              style={tipoFilter === t
                ? { background: `${accent}18`, color: accent, border: `1px solid ${accent}40` }
                : { color: 'var(--flg-text-muted)', border: '1px solid transparent' }
              }
            >
              {t === 'all' ? 'TODOS' : t}
            </button>
          ))}
        </div>
        <button
          onClick={() => exportCSV(table.getFilteredRowModel().rows.map(r => r.original))}
          className="text-[11px] font-semibold px-3 py-2 rounded-lg cursor-pointer flex items-center gap-1.5"
          style={{
            background: 'var(--flg-bg-raised)',
            border: '1px solid var(--flg-border)',
            color: 'var(--flg-text-muted)',
          }}
          title="Exportar CSV"
        >
          <Download size={11} /> CSV
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} className="border-b" style={{ borderColor: 'var(--flg-border)' }}>
                  {hg.headers.map(h => {
                    const sortable = h.column.getCanSort()
                    const isSorted = h.column.getIsSorted()
                    return (
                      <th
                        key={h.id}
                        onClick={sortable ? h.column.getToggleSortingHandler() : undefined}
                        className={`text-left px-3 py-3 text-[10px] tracking-widest uppercase font-normal text-white/40 ${sortable ? 'cursor-pointer select-none hover:text-white/70' : ''}`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sortable && (
                            <ArrowUpDown
                              size={10}
                              className={isSorted ? 'opacity-90' : 'opacity-25'}
                              style={isSorted ? { color: accent } : undefined}
                            />
                          )}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr><td colSpan={columns.length} className="text-center py-6 text-white/30 text-xs">Sem resultados</td></tr>
              ) : table.getRowModel().rows.map(row => (
                <tr key={row.id} className="border-b last:border-0 transition-colors hover:bg-white/[0.02]" style={{ borderColor: 'var(--flg-border)' }}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-3 py-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[10px] text-white/30 text-right">
        {table.getFilteredRowModel().rows.length} {table.getFilteredRowModel().rows.length === 1 ? 'post' : 'posts'}
      </div>
    </div>
  )
}

// ─── ViewToggle (Cards / Tabela) ──────────────────────────────────────────────

export function ViewToggle({ value, onChange, accent = '#C9A84C' }) {
  return (
    <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
      <button
        onClick={() => onChange('cards')}
        className="px-2.5 py-1 rounded text-[10px] font-semibold flex items-center gap-1.5"
        style={value === 'cards'
          ? { background: `${accent}18`, color: accent, border: `1px solid ${accent}40` }
          : { color: 'var(--flg-text-muted)', border: '1px solid transparent' }}
        title="Cards"
      >
        <LayoutGrid size={11} /> Cards
      </button>
      <button
        onClick={() => onChange('table')}
        className="px-2.5 py-1 rounded text-[10px] font-semibold flex items-center gap-1.5"
        style={value === 'table'
          ? { background: `${accent}18`, color: accent, border: `1px solid ${accent}40` }
          : { color: 'var(--flg-text-muted)', border: '1px solid transparent' }}
        title="Tabela"
      >
        <Table2 size={11} /> Tabela
      </button>
    </div>
  )
}
