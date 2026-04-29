import { motion } from 'framer-motion'
import { Crown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { GOLD } from './constants'

// Animação de número subindo até o valor final
function AnimatedNumber({ value, decimals = 0, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(value)
  const start = useRef(value)
  const frame = useRef(null)

  useEffect(() => {
    const startVal = start.current
    const startTime = performance.now()
    const dur = 600

    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(startVal + (value - startVal) * eased)
      if (t < 1) {
        frame.current = requestAnimationFrame(tick)
      } else {
        start.current = value
      }
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [value])

  const formatted = (decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString('pt-BR'))
  return <>{prefix}{formatted}{suffix}</>
}

// Mini-gráfico inline (sparkline)
function Sparkline({ data, color = GOLD, width = 70, height = 24 }) {
  if (!data?.length || data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((v - min) / range) * height
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  )
}

export default function KpiCard({ icon: Icon, label, value, decimals = 0, suffix = '', delta, prefix = '', color = GOLD, history, highlight = false }) {
  const positive = delta >= 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden group ${highlight ? 'kpi-pulse' : ''}`}
      style={{
        background: 'var(--flg-bg-raised)',
        border: highlight ? `1px solid ${color}55` : '1px solid var(--flg-border)',
        boxShadow: highlight ? `0 0 0 1px ${color}10` : undefined,
      }}
    >
      {highlight && (
        <div
          className="absolute top-2 right-2 flex items-center justify-center rounded-full crown-pulse"
          style={{
            width: 22,
            height: 22,
            background: `linear-gradient(135deg, #F5D68A, #C9A84C 50%, #8B6914)`,
            boxShadow: '0 0 10px rgba(245,214,138,0.45)',
          }}
          title="KPI com maior alta vs. mês anterior"
        >
          <Crown size={11} strokeWidth={2.2} color="#1a1300" />
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40 font-medium">{label}</span>
        <Icon size={14} style={{ color }} className="opacity-60" />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="text-2xl font-bold text-white leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
          <AnimatedNumber value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
        </div>
        {history && history.length > 1 && (
          <div className="opacity-70 group-hover:opacity-100 transition-opacity">
            <Sparkline data={history} color={color} width={70} height={24} />
          </div>
        )}
      </div>
      {delta !== undefined && delta !== null && (
        <div className={`text-[11px] font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
          {positive ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs. mês anterior
        </div>
      )}
      {delta === null && (
        <div className="text-[11px] font-medium text-white/30">
          sem comparativo do período anterior
        </div>
      )}
    </motion.div>
  )
}
