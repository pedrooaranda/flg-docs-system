import { motion } from 'framer-motion'
import { Zap, MessageCircle, ExternalLink, AlertTriangle, ShieldAlert } from 'lucide-react'
import { severidadeAtencao } from './formatters'

// Card individual da seção "Atenção Master" — cliente em crise.
// Recebe `item` (cliente do ranking), `delay` (anim stagger) e callbacks
// pros 3 botões (Resolver agora, Iniciar tratativa via WhatsApp, Ver perfil).
//
// `item._demo` é true se for cliente promovido visualmente pra demonstração
// (todos os tiers visíveis no all-hands mesmo sem crise real).
export default function AtencaoMasterCard({ item, onResolve, onWhats, onPerfil, delay }) {
  const sev = severidadeAtencao(item.dias_sem_postar || 0)
  if (!sev) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      className="rounded-xl p-4 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${sev.bg} 0%, rgba(0,0,0,0.25) 70%)`,
        border: `1px solid ${sev.border}`,
        boxShadow: `0 0 24px ${sev.glow}`,
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: sev.color, boxShadow: `0 0 8px ${sev.color}` }}
      />
      {item._demo && (
        <span className="absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest"
              style={{ background: 'rgba(234,179,8,0.18)', color: '#FACC15', border: '1px solid rgba(234,179,8,0.35)' }}>
          EXEMPLO
        </span>
      )}
      <div className="flex items-start gap-3 ml-1">
        <div
          className="rounded-lg flex items-center justify-center shrink-0"
          style={{
            width: 40, height: 40,
            background: `${sev.color}25`,
            border: `1px solid ${sev.color}50`,
          }}
        >
          {sev.tier === 'critical' ? <ShieldAlert size={18} style={{ color: sev.color }} /> : <AlertTriangle size={18} style={{ color: sev.color }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded uppercase" style={{ background: `${sev.color}25`, color: sev.color }}>
              {sev.label}
            </span>
            <span className="text-[10px] text-white/30">·</span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: sev.color }}>
              {item.dias_sem_postar} {item.dias_sem_postar === 1 ? 'dia' : 'dias'} sem postar
            </span>
          </div>
          <p className="text-sm font-bold text-white/95 truncate">{item.nome}</p>
          <div className="flex items-center gap-2 text-[11px] text-white/45 mt-0.5">
            {item.empresa && <span className="truncate">{item.empresa}</span>}
            {item.empresa && item.consultor && <span className="text-white/20">·</span>}
            {item.consultor && (
              <span className="truncate">
                Consultor: <span className="text-white/70 font-medium">{item.consultor}</span>
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        <button
          onClick={() => onResolve(item)}
          className="text-[10px] font-bold py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1"
          style={{ background: sev.color, color: '#080808' }}
        >
          <Zap size={11} /> Resolver agora
        </button>
        <button
          onClick={() => onWhats(item)}
          className="text-[10px] font-semibold py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1"
          style={{ background: 'rgba(52,211,153,0.18)', color: '#34D399', border: '1px solid rgba(52,211,153,0.35)' }}
        >
          <MessageCircle size={11} /> Iniciar tratativa
        </button>
        <button
          onClick={() => onPerfil(item)}
          className="text-[10px] font-semibold py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.65)', border: '1px solid var(--flg-border)' }}
        >
          <ExternalLink size={11} /> Ver perfil
        </button>
      </div>
    </motion.div>
  )
}
