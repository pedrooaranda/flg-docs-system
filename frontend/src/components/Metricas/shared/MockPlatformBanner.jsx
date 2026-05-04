import { motion } from 'framer-motion'
import { Beaker } from 'lucide-react'
import { PLATFORMS } from './constants'

export default function MockPlatformBanner({ platform }) {
  const cfg = PLATFORMS[platform] || PLATFORMS.instagram
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-3 flex items-center gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(234,179,8,0.08), rgba(245,158,11,0.04))',
        border: '1px solid rgba(234,179,8,0.30)',
      }}
    >
      <div
        className="rounded-lg flex items-center justify-center shrink-0"
        style={{ width: 32, height: 32, background: 'rgba(234,179,8,0.18)', border: '1px solid rgba(234,179,8,0.4)' }}
      >
        <Beaker size={16} style={{ color: '#FACC15' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded uppercase" style={{ background: 'rgba(234,179,8,0.20)', color: '#FACC15' }}>
            Em desenvolvimento
          </span>
          <span className="text-xs text-white/85 font-semibold">
            Dados simulados de {cfg.label}
          </span>
        </div>
        <p className="text-[11px] text-white/55 mt-0.5">
          A integração real com {cfg.label} está sendo construída e será liberada em breve. Use esses dados pra entender a estrutura final.
        </p>
      </div>
    </motion.div>
  )
}
