/**
 * Funnel horizontal pra Instagram: Impressões → Alcance → Engajados → Saves+Shares.
 * Mostra a queda de cada etapa em barras horizontais decrescentes + % de conversão.
 */

import { useMemo } from 'react'

function formatCompact(n) {
  if (n == null) return '0'
  const num = Number(n)
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace('.0', '') + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace('.0', '') + 'K'
  return num.toLocaleString('pt-BR')
}

export default function EngagementFunnel({ kpis, accent = '#E4405F' }) {
  const stages = useMemo(() => {
    const impressoes = kpis?.impressoes_total?.valor || kpis?.alcance_medio?.valor * 1.6 || 0
    const alcance = kpis?.alcance_medio?.valor || 0
    const curtidas = kpis?.curtidas_total?.valor || 0
    const comentarios = kpis?.comentarios_total?.valor || 0
    const salvamentos = kpis?.salvamentos_total?.valor || 0
    const compartilhamentos = kpis?.compartilhamentos_total?.valor || 0
    const engajados = curtidas + comentarios
    const acoesProfundas = salvamentos + compartilhamentos
    return [
      { label: 'Impressões', value: impressoes, color: '#A855F7' },
      { label: 'Alcance', value: alcance, color: '#7C3AED' },
      { label: 'Engajados', value: engajados, color: '#EC4899', sub: 'Curtidas + comentários' },
      { label: 'Ações profundas', value: acoesProfundas, color: accent, sub: 'Salvos + compartilhados' },
    ]
  }, [kpis, accent])

  const max = Math.max(...stages.map(s => s.value), 1)

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-white/40 font-medium">Funil de Engajamento</span>
        <span className="text-[10px] text-white/30">Quanto cada etapa converte</span>
      </div>
      <div className="space-y-2.5">
        {stages.map((s, i) => {
          const widthPct = (s.value / max) * 100
          const prev = i > 0 ? stages[i - 1].value : null
          const conversionPct = prev && prev > 0 ? (s.value / prev) * 100 : null
          return (
            <div key={s.label} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/70 font-medium flex items-center gap-2">
                  {s.label}
                  {s.sub && <span className="text-[9px] text-white/30">({s.sub})</span>}
                </span>
                <span className="text-white/50">
                  <span className="font-semibold" style={{ color: s.color }}>{formatCompact(s.value)}</span>
                  {conversionPct != null && (
                    <span className="ml-2 text-white/30">→ {conversionPct.toFixed(1)}%</span>
                  )}
                </span>
              </div>
              <div className="h-7 rounded-md overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div
                  className="h-full rounded-md transition-all flex items-center justify-end pr-2"
                  style={{
                    width: `${Math.max(widthPct, 2)}%`,
                    background: `linear-gradient(90deg, ${s.color}40, ${s.color})`,
                  }}
                >
                  <span className="text-[10px] font-bold text-white/85">{widthPct.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
