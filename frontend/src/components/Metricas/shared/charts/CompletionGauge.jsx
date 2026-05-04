/**
 * Completion Rate Gauge pra TikTok — semi-círculo color-coded por benchmark.
 * 80%+ = verde escuro (viral) · 60-79% verde claro · 40-59% amarelo · <40% vermelho.
 */

import { useMemo } from 'react'
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts'

export default function CompletionGauge({ value, label = 'Taxa de Conclusão', subtitle, fypValue }) {
  const v = useMemo(() => Math.max(0, Math.min(100, Number(value) || 0)), [value])

  const tier = useMemo(() => {
    if (v >= 80) return { color: '#10B981', label: 'VIRAL', desc: 'Alto potencial de FYP' }
    if (v >= 60) return { color: '#84CC16', label: 'ALTO', desc: 'Boa retenção' }
    if (v >= 40) return { color: '#FACC15', label: 'MÉDIO', desc: 'Pode melhorar' }
    return { color: '#EF4444', label: 'BAIXO', desc: 'Refazer ganchos iniciais' }
  }, [v])

  const data = [{ name: 'val', value: v, fill: tier.color }]

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-white/40 font-medium">{label}</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ background: `${tier.color}18`, color: tier.color }}>
          {tier.label}
        </span>
      </div>
      <div className="relative" style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height={180}>
          <RadialBarChart
            innerRadius="68%"
            outerRadius="100%"
            startAngle={180}
            endAngle={0}
            data={data}
            cy="80%"
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} angleAxisId={0} />
            <RadialBar
              background={{ fill: 'rgba(255,255,255,0.05)' }}
              dataKey="value"
              cornerRadius={10}
              fill={tier.color}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2 pointer-events-none">
          <div className="text-4xl font-bold" style={{ color: tier.color }}>
            {v.toFixed(1)}%
          </div>
          <div className="text-[10px] text-white/45 mt-0.5">{tier.desc}</div>
        </div>
      </div>
      {fypValue != null && (
        <div className="flex items-center justify-between text-[11px] mt-2 pt-2" style={{ borderTop: '1px solid var(--flg-border)' }}>
          <span className="text-white/50">For You Page</span>
          <span className="font-semibold" style={{ color: '#FE2C55' }}>{Number(fypValue).toFixed(1)}%</span>
        </div>
      )}
      {subtitle && <p className="text-[10px] text-white/40 mt-2 text-center">{subtitle}</p>}
    </div>
  )
}
