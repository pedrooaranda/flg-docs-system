import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { Avatar } from '../../ui/Avatar'
import { formatCompact } from './formatters'
import { GOLD } from './constants'

// Linha da tabela "Ranking completo" — cliente com mini-bars de engajamento,
// audiência e posts/mês (normalizados pelo máximo do dataset).
//
// `max` é { eng, aud, posts } — calculado uma vez no parent via useMemo.
export default function RankRow({ item, rank, max, onClick, delay }) {
  const engPct = max.eng > 0 ? (item.taxa_engajamento / max.eng) * 100 : 0
  const audPct = max.aud > 0 ? (item.audiencia / max.aud) * 100 : 0
  const postsPct = max.posts > 0 ? ((item.posts_mes || 0) / max.posts) * 100 : 0
  return (
    <motion.tr
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      onClick={onClick}
      className="border-b last:border-0 transition-colors cursor-pointer hover:bg-white/[0.02]"
      style={{ borderColor: 'var(--flg-border)' }}
    >
      <td className="px-3 py-3 text-white/55 font-mono text-[11px] w-10">#{rank + 1}</td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar name={item.nome} size="sm" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white/90 truncate">{item.nome}</p>
            <p className="text-[10px] text-white/40 truncate">{item.empresa || '—'}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-white/55 text-[11px] hidden md:table-cell">{item.consultor || '—'}</td>
      <td className="px-3 py-3 text-right">
        <div className="flex items-center gap-2 justify-end">
          <div className="hidden lg:block w-16 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-full" style={{ width: `${engPct}%`, background: 'linear-gradient(90deg, #34D39960, #34D399)' }} />
          </div>
          <span className="text-[12px] font-semibold text-emerald-400 tabular-nums w-14 text-right">
            {(item.taxa_engajamento || 0).toFixed(2)}%
          </span>
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex items-center gap-2 justify-end">
          <div className="hidden lg:block w-16 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-full" style={{ width: `${audPct}%`, background: `linear-gradient(90deg, ${GOLD}60, ${GOLD})` }} />
          </div>
          <span className="text-[12px] text-white/80 tabular-nums w-14 text-right">{formatCompact(item.audiencia)}</span>
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex items-center gap-2 justify-end">
          <div className="hidden lg:block w-12 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-full" style={{ width: `${postsPct}%`, background: 'linear-gradient(90deg, #A855F760, #A855F7)' }} />
          </div>
          <span className="text-[12px] text-white/55 tabular-nums w-8 text-right">{item.posts_mes || 0}</span>
        </div>
      </td>
      <td className="px-3 py-3 text-right w-20">
        <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: GOLD }}>
          Ver <ExternalLink size={9} />
        </span>
      </td>
    </motion.tr>
  )
}
