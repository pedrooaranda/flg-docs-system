import { useState, useEffect, useMemo, useRef } from 'react'
import { GOLD } from './constants'

export default function ClienteCombobox({ clientes, value, onChange, accent = GOLD }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapperRef = useRef(null)

  const selected = clientes.find(c => c.id === value)

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? clientes.filter(c =>
          (c.nome || '').toLowerCase().includes(q) ||
          (c.empresa || '').toLowerCase().includes(q)
        )
      : clientes
    return [...list].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
  }, [clientes, query])

  return (
    <div ref={wrapperRef} className="relative" style={{ minWidth: 280 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 text-sm font-medium rounded-lg px-3 py-2 outline-none cursor-pointer"
        style={{ background: 'var(--flg-bg-raised)', border: `1px solid ${accent}40`, color: 'var(--flg-text)' }}
      >
        <span className="truncate">
          {selected ? `${selected.nome}${selected.empresa ? ' — ' + selected.empresa : ''}` : 'Selecionar cliente…'}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" className="opacity-60 shrink-0">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-1 rounded-lg shadow-2xl z-50 overflow-hidden"
          style={{ background: 'var(--flg-bg-raised)', border: `1px solid ${accent}40` }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--flg-border)' }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por nome ou empresa…"
              className="w-full px-2 py-1.5 text-sm rounded outline-none"
              style={{ background: 'var(--flg-bg-secondary)', border: '1px solid var(--flg-border)', color: 'var(--flg-text)' }}
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--flg-text-muted)' }}>
                Nenhum cliente encontrado
              </div>
            ) : (
              filtered.map(c => {
                const active = c.id === value
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { onChange(c.id); setOpen(false); setQuery('') }}
                    className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2"
                    style={active
                      ? { background: `${accent}18`, color: accent }
                      : { color: 'var(--flg-text)' }
                    }
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--flg-bg-hover)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span className="truncate">
                      <span className="font-medium">{c.nome}</span>
                      {c.empresa && <span className="opacity-60"> — {c.empresa}</span>}
                    </span>
                    {active && (
                      <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
                        <path d="M2 7l3.5 3.5L12 4" stroke="currentColor" strokeWidth="2" fill="none" />
                      </svg>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
