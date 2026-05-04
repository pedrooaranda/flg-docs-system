/**
 * Heatmap de engajamento por dia × horário (CSS Grid).
 * Mostra a "melhor janela" pra postar baseado em dados históricos.
 */

import { useState } from 'react'
import { GOLD } from '../constants'

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const FAIXAS = ['06-09h', '09-12h', '12-15h', '15-18h', '18-21h']

export default function EngagementHeatmap({ data, accent = GOLD }) {
  const [hover, setHover] = useState(null)
  if (!data?.length) {
    return (
      <div className="rounded-xl p-6 text-center" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
        <p className="text-xs text-white/40">Sem dados de horários ainda. Sincronize pra coletar.</p>
      </div>
    )
  }

  const maxEng = Math.max(...data.map(d => d.engajamento))
  const minEng = Math.min(...data.map(d => d.engajamento))
  const range = maxEng - minEng || 1
  const best = data.reduce((a, b) => (b.engajamento > a.engajamento ? b : a), data[0])

  const intensity = (eng) => 0.05 + ((eng - minEng) / range) * 0.85
  const gridCols = '52px repeat(7, 1fr)'

  return (
    <div className="rounded-xl p-4 space-y-3 relative" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white/40 font-medium">Melhores horários pra postar</span>
        <span className="text-[10px] text-white/30">Engajamento médio por janela</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[440px]">
          <div className="grid mb-1.5" style={{ gridTemplateColumns: gridCols, gap: '4px' }}>
            <div />
            {DIAS.map(d => (
              <div key={d} className="text-[10px] text-white/30 text-center font-normal tracking-wider">{d}</div>
            ))}
          </div>
          {FAIXAS.map((faixa, fi) => (
            <div key={faixa} className="grid mb-1" style={{ gridTemplateColumns: gridCols, gap: '4px' }}>
              <div className="text-[10px] text-white/30 flex items-center justify-end pr-1">{faixa}</div>
              {DIAS.map((_, di) => {
                const cell = data.find(d => d.faixa_idx === fi && d.dia_idx === di)
                if (!cell) return <div key={di} className="rounded-md" style={{ height: 26, background: 'rgba(255,255,255,0.02)' }} />
                const alpha = intensity(cell.engajamento)
                const isBest = best && cell.dia_idx === best.dia_idx && cell.faixa_idx === best.faixa_idx
                return (
                  <div
                    key={di}
                    onMouseEnter={() => setHover(cell)}
                    onMouseLeave={() => setHover(null)}
                    className="rounded-md flex items-center justify-center transition-transform hover:scale-105"
                    style={{
                      height: 26,
                      background: `${accent}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`,
                      border: isBest ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.03)',
                      boxShadow: isBest ? `0 0 12px ${accent}40` : 'none',
                      cursor: 'default',
                    }}
                  >
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: alpha > 0.55 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.45)' }}
                    >
                      {cell.engajamento.toFixed(1)}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] text-white/40">
        {best && (
          <div>
            <span className="text-white/25">⭐ Melhor janela:</span>{' '}
            <span style={{ color: accent }} className="font-semibold">
              {best.dia} · {best.faixa} · {best.engajamento.toFixed(2)}%
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-white/25">Menos</span>
          <div className="h-1.5 w-24 rounded-full" style={{
            background: `linear-gradient(to right, ${accent}10, ${accent})`,
          }} />
          <span className="text-white/25">Mais</span>
        </div>
      </div>
      {hover && (
        <div className="absolute pointer-events-none z-10 rounded-md px-2.5 py-1.5 text-[11px] left-1/2 -translate-x-1/2 top-2"
          style={{
            background: 'var(--flg-bg-card)',
            border: `1px solid ${accent}40`,
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
          }}>
          <span className="text-white/40">{hover.dia} · {hover.faixa} · </span>
          <span style={{ color: accent }} className="font-semibold">{hover.engajamento.toFixed(2)}%</span>
        </div>
      )}
    </div>
  )
}
