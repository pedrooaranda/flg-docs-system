import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Check } from 'lucide-react'

/**
 * Dropdown clássico de ordenação.
 *
 * Props:
 * - value: chave atual (string)
 * - onChange: (key) => void
 * - options: [{ key, label }]
 * - accent: cor de destaque (hex)
 */
export default function SortDropdown({ value, onChange, options, accent = '#C9A84C' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = options.find(o => o.key === value) || options[0]

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
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>Ordenar:</span>
        <span>{current.label}</span>
        <ChevronDown size={12} className="opacity-50" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 z-50 rounded-xl overflow-hidden min-w-[200px]"
            style={{
              background: 'var(--flg-bg-raised)',
              border: `1px solid ${accent}30`,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div className="py-1">
              {options.map(opt => {
                const active = opt.key === value
                return (
                  <button
                    key={opt.key}
                    onClick={() => { onChange(opt.key); setOpen(false) }}
                    className="w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors"
                    style={{
                      color: active ? accent : 'var(--flg-text)',
                      background: active ? `${accent}10` : 'transparent',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--flg-bg-hover)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span>{opt.label}</span>
                    {active && <Check size={12} />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
