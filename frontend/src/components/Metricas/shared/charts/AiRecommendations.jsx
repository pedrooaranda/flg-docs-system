/**
 * Recomendações IA baseadas nas métricas — heurísticas por plataforma.
 * Compara KPIs vs benchmarks e gera insights acionáveis.
 */

import { motion } from 'framer-motion'
import { PLATFORMS, GOLD_FAINT, GOLD_DIM } from '../constants'

const BENCHMARKS = {
  instagram: [2, 4],
  linkedin: [3, 6],
  youtube: [3, 6],
  tiktok: [5, 8],
}

export default function AiRecommendations({ overview, horarios, posts, platform }) {
  const kpis = overview?.kpis
  if (!kpis) return null
  const recs = []
  const pLabel = PLATFORMS[platform]?.label || platform

  if (horarios?.length) {
    const best = [...horarios].sort((a, b) => b.engajamento - a.engajamento)[0]
    if (best && best.engajamento > 0) {
      recs.push({
        icon: '🕐',
        title: 'Melhor horário',
        text: `Pico de engajamento no ${pLabel} às ${best.faixa} (${best.dia}) — ${best.engajamento.toFixed(2)}%.`,
      })
    }
  }

  const eng = kpis.taxa_engajamento?.valor || 0
  const [low, high] = BENCHMARKS[platform] || [2, 4]
  if (eng > 0 && eng < low) {
    recs.push({
      icon: '⚠️',
      title: 'Engajamento abaixo',
      text: `${eng.toFixed(2)}% está abaixo do benchmark ${low}-${high}%. Teste novos formatos.`,
    })
  } else if (eng >= high) {
    recs.push({
      icon: '🔥',
      title: 'Engajamento excelente',
      text: `${eng.toFixed(2)}% está acima do benchmark. Continue replicando o que funciona.`,
    })
  }

  if (posts?.length) {
    const byType = {}
    posts.forEach(p => {
      if (!byType[p.tipo]) byType[p.tipo] = []
      byType[p.tipo].push(p.taxa_engajamento || 0)
    })
    let bestType = ''
    let bestAvg = 0
    Object.entries(byType).forEach(([tipo, vals]) => {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      if (avg > bestAvg) {
        bestAvg = avg
        bestType = tipo
      }
    })
    if (bestType && bestAvg > 0) {
      recs.push({
        icon: '🎯',
        title: `${bestType} performa melhor`,
        text: `Média de ${bestAvg.toFixed(2)}% de engajamento. Aumente frequência desse formato.`,
      })
    }
  }

  // Plataforma-específicas
  if (platform === 'tiktok' && kpis.fyp_pct) {
    const fyp = kpis.fyp_pct.valor
    if (fyp > 80) recs.push({
      icon: '🚀', title: 'Algoritmo a favor',
      text: `${fyp.toFixed(1)}% do alcance vem do FYP — alto potencial viral, mantenha o ritmo.`,
    })
  }
  if (platform === 'linkedin' && kpis.ssi_score) {
    const ssi = kpis.ssi_score.valor
    if (ssi < 60) recs.push({
      icon: '📊', title: 'SSI Score baixo',
      text: `Score ${ssi.toFixed(0)}/100. Foque em engajar com insights de outras pessoas e construir rede.`,
    })
  }
  if (platform === 'youtube' && kpis.ctr_pct) {
    const ctr = kpis.ctr_pct.valor
    if (ctr < 4) recs.push({
      icon: '🖼️', title: 'CTR precisa melhorar',
      text: `${ctr.toFixed(1)}% CTR — teste thumbnails mais chamativos e títulos com curiosity gap.`,
    })
  }

  if (!recs.length) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {recs.map((r, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.07 }}
          className="rounded-xl p-4 flex flex-col gap-2"
          style={{ background: GOLD_FAINT, border: `1px solid ${GOLD_DIM}` }}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{r.icon}</span>
            <span className="text-xs font-bold text-white/80">{r.title}</span>
          </div>
          <p className="text-xs text-white/55 leading-relaxed">{r.text}</p>
        </motion.div>
      ))}
    </div>
  )
}
