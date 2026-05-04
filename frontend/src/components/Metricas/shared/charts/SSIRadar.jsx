/**
 * SSI Radar Chart pra LinkedIn — visualização icônica dos 4 pillars (cada 0-25, total 100).
 * Brand · Find right people · Engage with insights · Build relationships.
 */

import { useMemo } from 'react'
import { ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip } from 'recharts'

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--flg-bg-card)', border: '1px solid rgba(10,102,194,0.3)' }}>
      <p className="text-white/85 font-semibold">{p.payload.fullDim}</p>
      <p style={{ color: '#0A66C2' }}>
        <strong>{p.value.toFixed(1)}</strong> / 25
      </p>
    </div>
  )
}

export default function SSIRadar({ ssiBreakdown, ssiTotal, accent = '#0A66C2' }) {
  const data = useMemo(() => {
    // Fallback: se backend não retornou breakdown, divide o total em 4 partes desiguais sintéticas
    const total = ssiTotal || 60
    const fallback = ssiBreakdown || {
      brand: total * 0.27,
      find: total * 0.24,
      engage: total * 0.26,
      build: total * 0.23,
    }
    return [
      { dim: 'Marca', fullDim: 'Estabelecer marca profissional', value: fallback.brand || 0 },
      { dim: 'Pessoas', fullDim: 'Encontrar pessoas certas', value: fallback.find || 0 },
      { dim: 'Insights', fullDim: 'Engajar com insights', value: fallback.engage || 0 },
      { dim: 'Relações', fullDim: 'Construir relações', value: fallback.build || 0 },
    ]
  }, [ssiBreakdown, ssiTotal])

  const total = data.reduce((s, d) => s + d.value, 0)

  // Tier baseado no total SSI (LinkedIn benchmarks: top 25% acima de 65, top 1% acima de 75)
  const tier =
    total >= 75 ? { label: 'Top 1%', color: '#FACC15' }
    : total >= 65 ? { label: 'Top 25%', color: '#10B981' }
    : total >= 50 ? { label: 'Médio', color: accent }
    : { label: 'Baixo', color: '#EF4444' }

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-white/40 font-medium">Social Selling Index (SSI)</span>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold" style={{ color: tier.color }}>{total.toFixed(1)}</span>
          <span className="text-[10px] text-white/40">/ 100</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ background: `${tier.color}18`, color: tier.color }}>
            {tier.label}
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={data} margin={{ top: 5, right: 30, bottom: 5, left: 30 }}>
          <PolarGrid stroke="rgba(255,255,255,0.08)" />
          <PolarAngleAxis dataKey="dim" tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 500 }} />
          <PolarRadiusAxis domain={[0, 25]} tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 9 }} stroke="rgba(255,255,255,0.08)" />
          <Tooltip content={<ChartTooltip />} />
          <Radar
            dataKey="value"
            stroke={accent}
            strokeWidth={2}
            fill={accent}
            fillOpacity={0.28}
            dot={{ fill: accent, r: 3 }}
          />
        </RadarChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-white/40 mt-2 text-center">
        Os 4 pilares que o LinkedIn avalia · acima de 65 = top 25% · acima de 75 = top 1%
      </p>
    </div>
  )
}
