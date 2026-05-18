/**
 * Tutoriais — hub central tipo Knowledge Base.
 *
 * Lista de cards apontando pra tutoriais individuais. Escalável: cada tutorial
 * novo vira um novo card aqui + um componente em Tutoriais/<Nome>.jsx + uma
 * rota em App.jsx.
 *
 * Cards podem estar:
 *   - `ready: true`  → click navega pro tutorial
 *   - `ready: false` → exibe badge "Em breve", click desabilitado
 */

import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BookOpen, Instagram, FileText, BarChart2, PenTool,
  Clock, ArrowRight, Sparkles,
} from 'lucide-react'

// ──────────────────────────────────────────────────────────────────────────────
// Catálogo de tutoriais.
// Pra adicionar novo: cria o componente em Tutoriais/<Nome>.jsx, registra rota
// em App.jsx, e adiciona uma entrada aqui com `ready: true`.
// ──────────────────────────────────────────────────────────────────────────────

const TUTORIAIS = [
  {
    slug: 'conectar-instagram-cliente',
    titulo: 'Conectar IG para Tracking',
    eyebrow: 'Onboarding',
    descricao: 'Adicione um cliente como Meta Tester pra autorizar o Instagram dele nas Métricas FLG. Passo a passo enquanto o app está em revisão pela Meta.',
    icone: Instagram,
    tempo: '~10 min',
    cor: { bg: 'rgba(225,48,108,0.10)', border: 'rgba(225,48,108,0.30)', text: '#E1306C' },
    ready: true,
  },
  {
    slug: 'reunioes-jornada',
    titulo: 'Reuniões da Jornada — decks HTML',
    eyebrow: 'Materiais',
    descricao: 'Como preparar a parte prática de cada encontro junto com o Claude e gerar os slides finais pra apresentação fullscreen.',
    icone: FileText,
    tempo: '~12 min',
    cor: { bg: 'rgba(168,85,247,0.10)', border: 'rgba(168,85,247,0.30)', text: '#A855F7' },
    ready: false,
  },
  {
    slug: 'interpretar-metricas',
    titulo: 'Interpretando Métricas do IG',
    eyebrow: 'Estratégia',
    descricao: 'Como ler reach, engagement, demografia e comentários nas reuniões mensais com cliente. Quais KPIs priorizar por fase da jornada.',
    icone: BarChart2,
    tempo: '~15 min',
    cor: { bg: 'rgba(96,165,250,0.10)', border: 'rgba(96,165,250,0.30)', text: '#60A5FA' },
    ready: false,
  },
  {
    slug: 'copywriter-flg',
    titulo: 'Copywriter FLG na prática',
    eyebrow: 'Conteúdo',
    descricao: 'Como gerar copies de posts, reels e carrosséis usando o Copywriter FLG. Prompts ideais, edição e revisão antes de entregar.',
    icone: PenTool,
    tempo: '~8 min',
    cor: { bg: 'rgba(201,168,76,0.10)', border: 'rgba(201,168,76,0.30)', text: '#C9A84C' },
    ready: false,
  },
]

// ──────────────────────────────────────────────────────────────────────────────

function Eyebrow({ children }) {
  return (
    <p className="text-[10px] tracking-[0.25em] uppercase text-gold-mid/70 font-monodeck">
      {children}
    </p>
  )
}

function TutorialCard({ tutorial, onClick }) {
  const Icon = tutorial.icone
  const ready = tutorial.ready

  return (
    <motion.button
      type="button"
      onClick={ready ? onClick : undefined}
      disabled={!ready}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: ready ? 1 : 0.55, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3 }}
      whileHover={ready ? { y: -2, scale: 1.005 } : undefined}
      className="text-left rounded-xl p-5 transition-all relative overflow-hidden group"
      style={{
        background: ready ? 'var(--flg-bg-raised)' : 'rgba(255,255,255,0.015)',
        border: `1px solid ${ready ? 'var(--flg-border)' : 'rgba(255,255,255,0.05)'}`,
        cursor: ready ? 'pointer' : 'not-allowed',
        opacity: ready ? 1 : 0.65,
      }}
      onMouseEnter={ready ? (e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.4)' } : undefined}
      onMouseLeave={ready ? (e) => { e.currentTarget.style.borderColor = 'var(--flg-border)' } : undefined}
    >
      {/* Top row: icon + eyebrow badge + status */}
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: tutorial.cor.bg,
            border: `1px solid ${tutorial.cor.border}`,
          }}
        >
          <Icon size={18} style={{ color: tutorial.cor.text }} />
        </div>
        {!ready && (
          <span
            className="text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full font-monodeck"
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.45)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            Em breve
          </span>
        )}
        {ready && (
          <span className="text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full font-monodeck text-gold-mid"
            style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)' }}
          >
            {tutorial.eyebrow}
          </span>
        )}
      </div>

      {/* Eyebrow (when ready: já saiu pro topo; quando "em breve": fica aqui sutil) */}
      {!ready && (
        <p className="text-[9px] tracking-[0.25em] uppercase text-white/30 font-monodeck mb-1">
          {tutorial.eyebrow}
        </p>
      )}

      {/* Title */}
      <h3 className="font-serifdeck text-lg font-medium text-white/95 leading-tight mb-2 pr-2">
        {tutorial.titulo}
      </h3>

      {/* Description */}
      <p className="text-xs text-white/55 leading-relaxed mb-4 line-clamp-3">
        {tutorial.descricao}
      </p>

      {/* Footer: time + arrow */}
      <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--flg-border)' }}>
        <span className="flex items-center gap-1.5 text-[11px] text-white/45 font-monodeck">
          <Clock size={11} /> {tutorial.tempo}
        </span>
        {ready && (
          <span className="flex items-center gap-1 text-[11px] text-gold-mid/70 group-hover:text-gold-mid transition-colors font-semibold">
            Abrir <ArrowRight size={11} />
          </span>
        )}
      </div>
    </motion.button>
  )
}

// ──────────────────────────────────────────────────────────────────────────────

export default function TutoriaisHub() {
  const navigate = useNavigate()

  function abrirTutorial(slug) {
    navigate(`/tutoriais/${slug}`)
  }

  const totalReady = TUTORIAIS.filter(t => t.ready).length
  const totalEmBreve = TUTORIAIS.filter(t => !t.ready).length

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10 space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="pb-6 space-y-3"
        style={{ borderBottom: '1px solid var(--flg-border)' }}
      >
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-gold-mid" />
          <Eyebrow>Centro de aprendizado · FLG</Eyebrow>
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serifdeck text-3xl lg:text-4xl font-medium text-white leading-tight">
              Tutoriais
            </h1>
            <p className="text-sm text-white/55 mt-2 max-w-xl">
              Documentação prática pra operar a plataforma FLG com autonomia. Cada tutorial leva entre 5 e 15 minutos e cobre um fluxo específico do dia a dia da consultoria.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-white/45">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400/70" />
              <strong className="text-white/65">{totalReady}</strong> disponíveis
            </span>
            <span className="text-white/15">·</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-white/20" />
              <strong className="text-white/45">{totalEmBreve}</strong> em breve
            </span>
          </div>
        </div>
      </motion.div>

      {/* Grid de cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {TUTORIAIS.map(t => (
          <TutorialCard
            key={t.slug}
            tutorial={t}
            onClick={() => abrirTutorial(t.slug)}
          />
        ))}
      </div>

      {/* Footer hint */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="card-flg p-5 flex items-start gap-4"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(201,168,76,0.10)', border: '1px solid rgba(201,168,76,0.30)' }}
        >
          <Sparkles size={16} style={{ color: '#C9A84C' }} />
        </div>
        <div className="flex-1">
          <h3 className="font-serifdeck text-base text-white/90 mb-1">
            Falta algum tutorial ou gostaria de algum outro específico?
          </h3>
          <p className="text-xs text-white/55 leading-relaxed">
            Entre em contato com <strong className="text-gold-mid">Pedro Aranda</strong> via Slack no Canal de Tecnologia ou via e-mail{' '}
            <a href="mailto:pedroaranda@grupoguglielmi.com" className="text-gold-mid hover:underline">
              pedroaranda@grupoguglielmi.com
            </a>{' '}
            descrevendo a solicitação que precisa de uma documentação e Tutorial. Tutoriais novos vão aparecendo aqui à medida que a equipe sinaliza demanda.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
