/**
 * ClienteCard — card visual de cliente na tela de escolha de Materiais.
 *
 * Design tokens FLG: ouro #C9A84C, eyebrow uppercase JetBrains Mono, h-divider
 * dourada, hover lift suave.
 */

import { ChevronRight } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'

export default function ClienteCard({ cliente, onClick }) {
  const encAtual = cliente.encontro_atual || 1
  const pct = Math.min(100, Math.round((encAtual / 15) * 100))

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl p-4 transition-all hover:scale-[1.015] group flex flex-col gap-3"
      style={{
        background: 'var(--flg-bg-card)',
        border: '1px solid var(--flg-border)',
      }}
    >
      <div className="flex items-start gap-3">
        <Avatar name={cliente.nome} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-[9px] tracking-[0.2em] uppercase text-gold-mid/60 font-monodeck mb-0.5">
            {cliente.consultor_responsavel || 'Sem consultor'}
          </p>
          <p className="text-base font-serifdeck font-medium text-white/95 truncate leading-tight">
            {cliente.nome}
          </p>
          <p className="text-[11px] text-white/40 truncate mt-0.5">
            {cliente.empresa || '—'}
          </p>
        </div>
        <ChevronRight size={16} className="text-white/20 group-hover:text-gold-mid transition-colors flex-shrink-0 mt-1" />
      </div>

      <div className="h-px w-full"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.25), transparent)' }} />

      <div className="flex items-center justify-between text-[10px]">
        <span className="font-monodeck text-white/50">
          E{String(encAtual).padStart(2, '0')} <span className="text-white/25">/ 15</span>
        </span>
        <div className="flex items-center gap-2 flex-1 ml-3">
          <div className="flex-1 h-1 rounded-full overflow-hidden bg-white/5">
            <div
              className="h-full"
              style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg, rgba(201,168,76,0.4), #C9A84C)',
              }}
            />
          </div>
          <span className="text-white/30 font-monodeck w-8 text-right">{pct}%</span>
        </div>
      </div>
    </button>
  )
}
