import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Check, Instagram, Youtube, Linkedin, Music2 } from 'lucide-react'
import { PLATFORMS, PLATFORMS_MOCK } from './constants'

const ICONS = { instagram: Instagram, youtube: Youtube, linkedin: Linkedin, tiktok: Music2 }

export default function PlatformSelector({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = PLATFORMS[value] || PLATFORMS.instagram
  const CurrentIcon = ICONS[value] || Instagram

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs font-semibold rounded-lg px-3 py-2 cursor-pointer"
        style={{
          background: 'var(--flg-bg-raised)',
          border: `1px solid ${current.color}40`,
          color: 'var(--flg-text)',
        }}
      >
        <CurrentIcon size={13} style={{ color: current.color }} />
        <span>{current.label}</span>
        {PLATFORMS_MOCK.has(value) && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(234,179,8,0.18)', color: '#FACC15' }}>MOCK</span>
        )}
        <ChevronDown size={12} className="opacity-50" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-2 z-50 rounded-xl overflow-hidden min-w-[220px]"
            style={{
              background: 'var(--flg-bg-raised)',
              border: '1px solid var(--flg-bg-card-border)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div className="py-1">
              {Object.entries(PLATFORMS).map(([key, cfg]) => {
                const Icon = ICONS[key]
                const active = key === value
                const isMock = PLATFORMS_MOCK.has(key)
                return (
                  <button
                    key={key}
                    onClick={() => { onChange(key); setOpen(false) }}
                    className="w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors"
                    style={{
                      color: active ? cfg.color : 'var(--flg-text)',
                      background: active ? `${cfg.color}10` : 'transparent',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--flg-bg-hover)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span className="flex items-center gap-2">
                      <Icon size={13} style={{ color: cfg.color }} />
                      {cfg.label}
                      {isMock && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(234,179,8,0.18)', color: '#FACC15' }}>MOCK</span>}
                    </span>
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
