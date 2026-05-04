/**
 * Audience Retention Curve pra YouTube — linha mostrando % de viewers ao longo da duração média.
 * Curva decrescente clássica (100% no início, cai gradualmente).
 *
 * Como o backend mock ainda não tem dados reais de retention, gera curva sintética
 * baseada em taxa_retencao_pct média (decaimento exponencial até esse valor).
 */

import { useMemo } from 'react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--flg-bg-card)', border: '1px solid rgba(255,0,0,0.25)' }}>
      <p className="text-white/50 mb-1">{p.payload.tempo}% do vídeo</p>
      <p style={{ color: '#FF0000' }}>
        Viewers: <strong>{p.value.toFixed(1)}%</strong>
      </p>
    </div>
  )
}

export default function RetentionCurve({ retencaoMedia = 50, accent = '#FF0000' }) {
  const data = useMemo(() => {
    // Curva sintética: começa 100%, decai exponencialmente até atingir retencaoMedia no fim
    const points = 21 // 0%, 5%, 10%, ..., 100%
    const ret = Math.max(15, Math.min(95, retencaoMedia))
    const lambda = -Math.log(ret / 100) // decay rate to hit ret% at t=1
    return Array.from({ length: points }, (_, i) => {
      const t = i / (points - 1) // 0 → 1
      const viewers = 100 * Math.exp(-lambda * t)
      // Pequena oscilação realista (drops/spikes em momentos chave)
      const noise = i > 0 && i < points - 1 ? (Math.sin(i * 1.3) * 2) : 0
      return {
        tempo: Math.round(t * 100),
        viewers: Math.max(0, Math.min(100, viewers + noise)),
      }
    })
  }, [retencaoMedia])

  // Encontra o "cliff" — maior queda entre dois pontos consecutivos
  const cliffIndex = useMemo(() => {
    let max = 0
    let idx = -1
    for (let i = 1; i < data.length; i++) {
      const drop = data[i - 1].viewers - data[i].viewers
      if (drop > max) {
        max = drop
        idx = i
      }
    }
    return idx
  }, [data])

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-white/40 font-medium">Curva de Retenção</span>
        <span className="text-[10px] text-white/30">média de todos os vídeos · {retencaoMedia.toFixed(1)}% no fim</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.4} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="tempo"
            tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `${v}%`}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `${v}%`}
            width={45}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }} />
          {cliffIndex > 0 && (
            <ReferenceLine
              x={data[cliffIndex].tempo}
              stroke="rgba(250,204,21,0.6)"
              strokeDasharray="3 3"
              label={{ value: 'maior queda', fill: '#FACC15', fontSize: 9, position: 'top' }}
            />
          )}
          <Area type="monotone" dataKey="viewers" stroke={accent} strokeWidth={2.5} fill="url(#retGrad)" />
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-white/40 mt-2 text-center">
        Onde os viewers tendem a abandonar — corte/refaça o cliff pra retenção subir
      </p>
    </div>
  )
}
