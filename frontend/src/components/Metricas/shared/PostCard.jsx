import { motion } from 'framer-motion'
import { Instagram, Hourglass } from 'lucide-react'
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

// Detecta Story recém-postado sem métricas (Meta API leva ~30min a algumas horas pra liberar)
function isStoryEmColeta(post) {
  if (post.tipo !== 'STORY') return false
  const semMetricas = !post.curtidas && !post.comentarios && !post.salvamentos &&
                      !post.alcance && !post.impressoes
  if (!semMetricas) return false
  // Se tem timestamp ISO, usa pra detectar < 6h. Senão, considera "coleta" se publicado hoje.
  if (post.publicado_em_iso) {
    const publicado = new Date(post.publicado_em_iso)
    const horasAtras = (Date.now() - publicado.getTime()) / (1000 * 60 * 60)
    return horasAtras < 6
  }
  const hoje = new Date().toISOString().slice(0, 10)
  return post.publicado_em === hoje
}

function tempoDesdePublicacao(post) {
  if (!post.publicado_em_iso) return null
  const publicado = new Date(post.publicado_em_iso)
  const min = Math.max(0, Math.floor((Date.now() - publicado.getTime()) / 60000))
  if (min < 1) return 'agora mesmo'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d}d`
}

// Placeholder elegante pra Story em coleta de métricas (gradient IG + ícone + texto)
function StoryColetando({ post }) {
  const tempo = tempoDesdePublicacao(post) || 'recém-publicado'
  return (
    <div
      className="relative flex flex-col items-center justify-center text-center px-6"
      style={{
        height: 320,
        background: 'linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #F77737 100%)',
      }}
    >
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.35)' }} />
      <div className="relative z-10 flex flex-col items-center gap-3">
        <div
          className="rounded-full flex items-center justify-center"
          style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)' }}
        >
          <Instagram size={26} className="text-white" />
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-white/95 px-3 py-1 rounded-full"
             style={{ background: 'rgba(0,0,0,0.4)' }}>
          <Hourglass size={10} className="animate-pulse" /> Métricas em coleta
        </div>
        <p className="text-[11px] text-white/85 max-w-[220px] leading-relaxed">
          Stories levam de 30 min a algumas horas pra Meta disponibilizar insights.
        </p>
        <p className="text-[10px] text-white/60 font-medium">Publicado {tempo}</p>
      </div>
    </div>
  )
}

// Placeholder genérico pra Story com legenda (sem embed real, Stories são efêmeros)
function StoryComLegenda({ post }) {
  return (
    <div
      className="relative flex flex-col items-center justify-center text-center px-6"
      style={{
        height: 320,
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2a1a2a 40%, #1a1a1a 100%)',
      }}
    >
      <div className="absolute top-4 right-4 opacity-60">
        <Instagram size={18} className="text-white/40" />
      </div>
      <p className="text-sm text-white/80 leading-relaxed line-clamp-6 max-w-[260px]">
        {post.legenda || 'Story sem legenda'}
      </p>
      <p className="text-[10px] text-white/30 mt-3 uppercase tracking-wider">Story · 24h</p>
    </div>
  )
}

export default function PostCard({ post, rank, platform = 'instagram' }) {
  const typeColor = {
    REEL: '#7C3AED', IMAGE: GOLD, CAROUSEL: '#0EA5E9', VIDEO: '#EC4899',
    POST: '#0A66C2', ARTICLE: GOLD, POLL: '#34D399', DOCUMENT: '#F59E0B',
    SHORT: '#FF0000', STORY: '#EAB308',
  }
  const metrics = postMetrics(post, platform)
  const isStory = post.tipo === 'STORY'
  // Embed só pra Instagram NÃO-Story (Stories não têm embed público)
  const hasEmbed = platform === 'instagram' && !isStory && post.permalink
  const embedUrl = hasEmbed ? `${post.permalink.replace(/\/+$/, '')}/embed/captioned/` : null
  const storyEmColeta = isStory && isStoryEmColeta(post)
  const tempo = tempoDesdePublicacao(post)

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
        {storyEmColeta ? (
          <span className="text-[9px] font-bold text-white/30 uppercase tracking-wider">aguardando</span>
        ) : (
          <span className="text-[10px] font-bold" style={{ color: GOLD }}>{post.taxa_engajamento}% eng.</span>
        )}
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
      ) : isStory ? (
        storyEmColeta ? <StoryColetando post={post} /> : <StoryComLegenda post={post} />
      ) : (
        <p className="text-xs text-white/60 line-clamp-3 leading-relaxed px-3 pb-2">{post.legenda || '—'}</p>
      )}

      <div className="px-3 py-2.5 flex flex-col gap-1.5 mt-auto" style={{ borderTop: (hasEmbed || isStory) ? '1px solid var(--flg-border)' : 'none' }}>
        {!storyEmColeta && (
          <div className="grid grid-cols-3 gap-1 text-[10px] text-white/40">
            {metrics.map((m, i) => <span key={i}>{m}</span>)}
          </div>
        )}
        <div className="flex items-center justify-between">
          <p className="text-[9px] text-white/25">{tempo || post.publicado_em}</p>
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
