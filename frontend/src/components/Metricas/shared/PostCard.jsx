import { motion } from 'framer-motion'
import { GOLD } from './constants'

function postMetrics(post, platform) {
  switch (platform) {
    case 'instagram': return [
      `❤ ${(post.curtidas || 0).toLocaleString('pt-BR')}`,
      `💬 ${post.comentarios || 0}`,
      `🔖 ${post.salvamentos || 0}`,
    ]
    case 'linkedin': return [
      `👍 ${(post.reacoes || 0).toLocaleString('pt-BR')}`,
      `💬 ${post.comentarios || 0}`,
      `🔁 ${post.compartilhamentos || 0}`,
    ]
    case 'youtube': return [
      `👁 ${(post.visualizacoes || 0).toLocaleString('pt-BR')}`,
      `👍 ${post.likes || 0}`,
      `⏱ ${post.taxa_retencao || 0}% ret.`,
    ]
    case 'tiktok': return [
      `👁 ${(post.visualizacoes || 0).toLocaleString('pt-BR')}`,
      `❤ ${(post.curtidas || 0).toLocaleString('pt-BR')}`,
      `🔁 ${post.compartilhamentos || 0}`,
    ]
    default: return []
  }
}

export default function PostCard({ post, rank, platform = 'instagram' }) {
  const typeColor = {
    REEL: '#7C3AED', IMAGE: GOLD, CAROUSEL: '#0EA5E9', VIDEO: '#EC4899',
    POST: '#0A66C2', ARTICLE: GOLD, POLL: '#34D399', DOCUMENT: '#F59E0B',
    SHORT: '#FF0000', STORY: '#EAB308',
  }
  const metrics = postMetrics(post, platform)
  const hasEmbed = platform === 'instagram' && post.permalink
  const embedUrl = hasEmbed ? `${post.permalink.replace(/\/+$/, '')}/embed/captioned/` : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (rank || 0) * 0.04 }}
      className="rounded-lg overflow-hidden flex flex-col"
      style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}
    >
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: `${typeColor[post.tipo] || GOLD}22`, color: typeColor[post.tipo] || GOLD }}>
          {post.tipo}
        </span>
        <span className="text-[10px] font-bold" style={{ color: GOLD }}>{post.taxa_engajamento}% eng.</span>
      </div>

      {hasEmbed ? (
        <div className="relative bg-black" style={{ height: 360 }}>
          <iframe
            src={embedUrl}
            className="w-full h-full"
            frameBorder="0"
            scrolling="no"
            allowtransparency="true"
            allow="encrypted-media"
            title={post.legenda?.slice(0, 60) || 'Instagram post'}
          />
        </div>
      ) : (
        <p className="text-xs text-white/60 line-clamp-3 leading-relaxed px-3 pb-2">{post.legenda || '—'}</p>
      )}

      <div className="px-3 py-2.5 flex flex-col gap-1.5 mt-auto" style={{ borderTop: hasEmbed ? '1px solid var(--flg-border)' : 'none' }}>
        <div className="grid grid-cols-3 gap-1 text-[10px] text-white/40">
          {metrics.map((m, i) => <span key={i}>{m}</span>)}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[9px] text-white/25">{post.publicado_em}</p>
          {post.permalink && (
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] text-white/35 hover:text-white/70 inline-flex items-center gap-1 transition-colors"
              title="Abrir no Instagram"
            >
              Ver no Instagram ↗
            </a>
          )}
        </div>
      </div>
    </motion.div>
  )
}
