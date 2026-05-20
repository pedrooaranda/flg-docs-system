/**
 * Tutorial para o consultor adicionar o Founder como Tester no Meta App FLG.
 *
 * Necessário enquanto o app está em Development Mode (antes da App Review aprovada).
 * Cada Founder precisa ser adicionado como App Tester e Instagram Tester antes
 * de poder autorizar a conexão IG pelas Métricas FLG.
 *
 * Quando a App Review aprovar, este passo desaparece. O tutorial pode ser
 * arquivado mas a rota fica até a Meta aprovar.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Instagram, Facebook, Copy, Check, ExternalLink, ChevronDown,
  CheckCircle2, AlertCircle, Clock, Users, MessageSquare, Sparkles,
  HelpCircle, ArrowRight, ArrowLeft,
} from 'lucide-react'

const META_APP_NAME = 'FLG Jornada System'

// URLs canônicas validadas (vide memory: meta_tester_acceptance_url.md)
const URL_FB_APP_TESTERS = 'https://developers.facebook.com/apps/'
const URL_FB_DEV_PORTAL = 'https://developers.facebook.com/'
const URL_IG_ACCEPT_INVITE = 'https://www.instagram.com/accounts/manage_access/'

const MENSAGEM_PADRAO = `Olá [NOME DO FOUNDER]!

Para começarmos a analisar e direcionar as próximas estratégias a partir das suas métricas de Instagram nos encontros, precisamos que você autorize o acesso (leva menos de 1 minuto):

📲 ABRIR NO INSTAGRAM (precisa ser pelo Aplicativo do celular):
   ${URL_IG_ACCEPT_INVITE}

   → Vai aparecer um convite para ser "Testador Instagram" do ${META_APP_NAME}
   → Clique em ACEITAR

Quando aceitar, nos avise por aqui que vamos finalizar a conexão para começarmos a acompanhar as métricas juntos.

Qualquer dúvida que tiver, nos chame por aqui!

A FLG Brasil agradece.`

// ──────────────────────────────────────────────────────────────────────────────

function Eyebrow({ children }) {
  return (
    <p className="text-[10px] tracking-[0.25em] uppercase text-gold-mid/70 font-monodeck mb-1">
      {children}
    </p>
  )
}

function StepCard({ num, title, time, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3 }}
      className="card-flg p-6"
    >
      <div className="flex items-start gap-4 mb-4">
        <div
          className="rounded-xl flex flex-col items-center justify-center flex-shrink-0"
          style={{
            width: 56, height: 56,
            background: 'rgba(201,168,76,0.10)',
            border: '1px solid rgba(201,168,76,0.30)',
          }}
        >
          <span className="text-[9px] font-bold tracking-wider uppercase" style={{ color: '#C9A84C' }}>
            Passo
          </span>
          <span className="text-xl font-bold leading-none font-monodeck" style={{ color: '#FACC15' }}>
            {num}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-serifdeck text-xl font-medium text-white/95 leading-tight">
            {title}
          </h3>
          {time && (
            <p className="text-xs text-white/40 mt-1 flex items-center gap-1.5">
              <Clock size={11} /> {time}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-3 text-sm text-white/75 leading-relaxed">
        {children}
      </div>
    </motion.div>
  )
}

function ExternalLinkBtn({ href, children, primary = false }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
      style={primary ? {
        background: 'rgba(201,168,76,0.18)',
        color: '#C9A84C',
        border: '1px solid rgba(201,168,76,0.45)',
      } : {
        background: 'rgba(255,255,255,0.03)',
        color: 'rgba(255,255,255,0.7)',
        border: '1px solid rgba(255,255,255,0.10)',
      }}
    >
      {children}
      <ExternalLink size={11} />
    </a>
  )
}

function CopyBox({ text, label = 'Copiar' }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--flg-border)' }}>
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ background: 'rgba(201,168,76,0.06)' }}
      >
        <span className="text-[10px] tracking-widest uppercase text-gold-mid/70 font-monodeck">
          Mensagem padrão para o Founder
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] font-semibold transition-colors"
          style={{ color: copied ? '#34D399' : '#C9A84C' }}
        >
          {copied ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> {label}</>}
        </button>
      </div>
      <pre
        className="text-xs text-white/75 p-4 whitespace-pre-wrap leading-relaxed font-sans"
        style={{ background: 'var(--flg-bg-raised)', fontFamily: 'inherit' }}
      >
        {text}
      </pre>
    </div>
  )
}

function Collapsible({ title, icon: Icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card-flg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-4 flex items-center justify-between text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon size={16} className="text-gold-mid/70" />}
          <span className="font-serifdeck text-base text-white/90">{title}</span>
        </div>
        <ChevronDown
          size={16}
          className="text-white/40 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
        />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="px-5 pb-5 text-sm text-white/70 leading-relaxed"
          style={{ borderTop: '1px solid var(--flg-border)' }}
        >
          <div className="pt-4 space-y-3">{children}</div>
        </motion.div>
      )}
    </div>
  )
}

function InfoBox({ children, variant = 'info' }) {
  const colors = {
    info:    { bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.25)',  text: '#60A5FA' },
    warning: { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.25)',  text: '#FBBF24' },
    success: { bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.25)',  text: '#34D399' },
    danger:  { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   text: '#F87171' },
  }
  const c = colors[variant] || colors.info
  return (
    <div className="rounded-lg p-3 flex gap-3" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: c.text }} />
      <div className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.8)' }}>
        {children}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────

export default function ConectarInstagramCliente() {
  const navigate = useNavigate()

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-10 space-y-8">
      {/* Breadcrumb */}
      <button
        type="button"
        onClick={() => navigate('/tutoriais')}
        className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-gold-mid transition-colors cursor-pointer -mb-4"
      >
        <ArrowLeft size={11} /> Tutoriais
      </button>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center pb-6"
        style={{ borderBottom: '1px solid var(--flg-border)' }}
      >
        <div className="inline-flex items-center gap-2 mb-3">
          <Instagram size={14} className="text-gold-mid" />
          <Eyebrow>Tutorial · Onboarding Métricas</Eyebrow>
        </div>
        <h1 className="font-serifdeck text-3xl lg:text-4xl font-medium text-white leading-tight">
          Conectar Instagram do Founder
        </h1>
        <p className="text-sm text-white/55 mt-3 max-w-xl mx-auto">
          Passo a passo para autorizar o Instagram de um Founder nas Métricas FLG.
        </p>
        <div className="flex items-center justify-center gap-6 mt-4 text-xs text-white/45">
          <span className="flex items-center gap-1.5"><Clock size={11} /> ~6 minutos</span>
          <span className="text-white/15">·</span>
          <span className="flex items-center gap-1.5"><Users size={11} /> 3 minutos seu + 3 minutos do Founder</span>
        </div>
      </motion.div>

      {/* Pré-requisitos */}
      <Collapsible title="Antes de começar, pré-requisitos" icon={CheckCircle2} defaultOpen>
        <p className="text-white/85 mb-3">
          Este setup só precisa ser feito <strong className="text-gold-mid">uma vez por Consultor</strong>.
          Se você já fez, pode pular para os Passos seguintes abaixo.
        </p>
        <ul className="space-y-2 list-none">
          <li className="flex gap-2"><span className="text-gold-mid">✓</span> Você tem conta no Facebook ativa (com seu nome real)</li>
          <li className="flex gap-2"><span className="text-gold-mid">✓</span> Pedro te adicionou como Developer no Meta App da FLG</li>
          <li className="flex gap-2"><span className="text-gold-mid">✓</span> Você abriu <a href={URL_FB_DEV_PORTAL} target="_blank" rel="noopener noreferrer" className="text-gold-mid underline">developers.facebook.com</a> e aceitou o convite de Developer</li>
        </ul>
        <InfoBox variant="warning">
          <strong>Ainda não tem acesso?</strong> Chama o Pedro no Slack solicitando
          <em> "Pedro, me adiciona como Developer no Meta App para eu poder fazer o onboarding com os meus Founders"</em>.
          Leva 2 minutos para o lado dele e nunca mais precisa repetir.
        </InfoBox>
      </Collapsible>

      {/* Por que este processo? */}
      <Collapsible title="Por que este processo manual?" icon={HelpCircle}>
        <p>
          O app FLG ainda está em <strong className="text-white/90">Development Mode</strong> na Meta. Ou seja,
          aguardando aprovação na App Review oficial (que leva aproximadamente 4 a 6 semanas a partir do envio).
        </p>
        <p>
          Enquanto a Meta não aprova, cada Founder precisa ser explicitamente adicionado como
          <strong className="text-white/90"> "Instagram Tester"</strong> no painel do app, para autorizar o acesso ao Instagram dele.
          É a forma operacional disponível neste momento para atender Founders reais.
        </p>
        <p>
          <strong className="text-gold-mid">Quando a Meta aprovar</strong>, este tutorial deixa de existir.
          Qualquer Founder poderá conectar diretamente pelo botão "Conectar Instagram" sem nenhum passo prévio.
        </p>
      </Collapsible>

      {/* Os 6 passos */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-3">
          <Sparkles size={16} className="text-gold-mid" />
          <Eyebrow>Os passos</Eyebrow>
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(201,168,76,0.3), transparent)' }} />
        </div>

        {/* Passo 1 */}
        <StepCard num="1" title="Colete o @handle do Instagram do Founder" time="1 minuto">
          <p>Você vai precisar de 1 informação antes de acessar o painel da Meta:</p>
          <ul className="space-y-2 ml-1">
            <li className="flex gap-2">
              <span className="text-gold-mid font-bold">→</span>
              <span><strong className="text-white/90">@handle do Instagram da empresa</strong> (exemplo: @grupoguglielmi.
              O nome de usuário, sem o "https://instagram.com/")</span>
            </li>
          </ul>
          <InfoBox variant="info">
            <strong>Dica:</strong> envie mensagem para o Founder ANTES de começar, pedindo essa informação.
            Ele responde em 1 minuto e você não interrompe seu fluxo no painel da Meta depois.
          </InfoBox>
        </StepCard>

        {/* Passo 2 */}
        <StepCard num="2" title="Adicionar como Instagram Tester" time="2 minutos">
          <p>
            <strong className="text-white/90">Instagram Tester</strong> é a função que libera
            a conta Instagram do Founder para ser acessada via API e autorizar o app FLG no fluxo OAuth.
          </p>
          <ol className="space-y-2 ml-1 list-decimal list-inside">
            <li>Abra o painel Meta for Developers abaixo:</li>
          </ol>
          <ExternalLinkBtn href={URL_FB_APP_TESTERS} primary>
            <Facebook size={12} /> Abrir painel Meta for Developers
          </ExternalLinkBtn>
          <ol start="2" className="space-y-2 ml-1 list-decimal list-inside">
            <li>Clique no app <strong className="text-gold-mid">{META_APP_NAME}</strong> na lista de apps</li>
            <li>No menu lateral esquerdo, vá em <strong className="text-white/90">Produtos</strong>, depois <strong className="text-white/90">Instagram</strong>, depois <strong className="text-white/90">Configuração da API com login do Instagram</strong></li>
            <li>Procure a seção <strong className="text-white/90">"Instagram Testers"</strong> (geralmente no fim da página)</li>
            <li>Clique em <strong className="text-white/90">"Adicionar Instagram Testers"</strong></li>
            <li>Digite o <strong className="text-white/90">@handle</strong> do Founder (exemplo: <code className="text-gold-mid">grupoguglielmi</code>, sem o @)</li>
            <li>Confirme e o convite será enviado ✅</li>
          </ol>
          <InfoBox variant="danger">
            <strong>A conta IG do Founder PRECISA ser Business ou Creator</strong> (não Personal).
            Se for Personal, peça para o Founder trocar antes em: <em>Configurações IG, Conta, Mudar tipo de conta, Conta comercial</em> (gratuito).
          </InfoBox>
        </StepCard>

        {/* Passo 3 */}
        <StepCard num="3" title="Envie a mensagem padrão para o Founder" time="1 minuto">
          <p>
            O convite está pendente. Agora o Founder precisa aceitar.
            Copie a mensagem abaixo, substitua <code className="text-gold-mid">[NOME DO FOUNDER]</code> pelo nome do Founder
            e envie pelo WhatsApp ou email dele:
          </p>
          <CopyBox text={MENSAGEM_PADRAO} />
          <InfoBox variant="info">
            <strong>O convite PRECISA ser aceito pelo aplicativo mobile do Instagram</strong>,
            não pelo navegador. Avise o Founder disso na mensagem caso ele seja menos técnico.
          </InfoBox>
        </StepCard>

        {/* Passo 4 */}
        <StepCard num="4" title="Aguardar o Founder aceitar o convite" time="5 minutos a 24h">
          <p>
            A Meta <strong className="text-white/90">não notifica</strong> quando o Founder aceita.
            Você fica dependente da resposta dele no WhatsApp.
          </p>
          <ul className="space-y-2 ml-1">
            <li className="flex gap-2"><Clock size={13} className="text-white/40 mt-0.5 flex-shrink-0" /> <span>Tempo médio: 5 a 30 minutos se o Founder estiver ativo no celular</span></li>
            <li className="flex gap-2"><Clock size={13} className="text-white/40 mt-0.5 flex-shrink-0" /> <span>Pode demorar até 24 horas se ele estiver ocupado</span></li>
            <li className="flex gap-2"><MessageSquare size={13} className="text-white/40 mt-0.5 flex-shrink-0" /> <span>Se não responder em 24 horas, envie um lembrete amigável</span></li>
          </ul>
          <InfoBox variant="info">
            <strong>Quer conferir se o Founder já aceitou?</strong> Volte no painel Meta, vá em Produtos, Instagram, Configuração da API com login do Instagram, seção Instagram Testers.
            Se ainda estiver "Pendente", ele não aceitou. Se estiver "Aceito" ✅, pode passar para o Passo 5.
          </InfoBox>
        </StepCard>

        {/* Passo 5 */}
        <StepCard num="5" title="Conecte o Instagram dentro do FLG" time="2 minutos">
          <p>
            O Founder confirmou que aceitou o convite? Agora é só finalizar dentro do FLG:
          </p>
          <ol className="space-y-2 ml-1 list-decimal list-inside">
            <li>Vá em <strong className="text-white/90">Clientes</strong> no menu lateral</li>
            <li>Clique no Founder que você acabou de configurar</li>
            <li>Procure a seção "Instagram" e clique no botão <strong className="text-gold-mid">"Conectar Instagram"</strong></li>
            <li>Compartilhe o link de onboarding com o Founder</li>
            <li>O Founder faz login no Instagram dele e autoriza as 3 permissões solicitadas pela FLG</li>
            <li>Pronto ✅ Em aproximadamente 5 minutos as métricas começam a sincronizar</li>
          </ol>
          <button
            onClick={() => navigate('/clientes')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: 'rgba(201,168,76,0.18)',
              color: '#C9A84C',
              border: '1px solid rgba(201,168,76,0.45)',
            }}
          >
            Ir para Clientes <ArrowRight size={11} />
          </button>
        </StepCard>
      </div>

      {/* Direcionamento de suporte */}
      <Collapsible title="Como dar suporte ao Founder" icon={Users} defaultOpen>
        <p className="text-white/85 mb-3">
          A implementação ideal deste fluxo de Tracking acontece durante a reunião de{' '}
          <strong className="text-gold-mid">Organização de Mídias</strong> com o Founder. Nesse momento ele está atento,
          tem o celular em mãos, e você consegue acompanhar o clique de aceitação em tempo real,
          garantindo que a conexão fique pronta antes do encontro terminar.
        </p>
        <p className="text-white/85 mb-3">
          Quando isso não for possível (por exemplo, o Founder esqueceu de configurar antes da reunião ou apresentou dificuldade
          técnica durante o encontro), siga uma das duas opções abaixo:
        </p>
        <ul className="space-y-3 ml-1">
          <li className="flex gap-3">
            <span className="text-gold-mid font-bold flex-shrink-0">1.</span>
            <span>
              <strong className="text-white/90">Envie a mensagem padrão pelo WhatsApp</strong> e aguarde o aceite remoto.
              Se o Founder responder rápido, o tracking fica ativo em poucas horas.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold-mid font-bold flex-shrink-0">2.</span>
            <span>
              <strong className="text-white/90">Marque um alinhamento complementar de 15 minutos</strong> via Google Meet ou Zoom
              para fazer o passo a passo junto com o Founder. Esta opção é especialmente recomendada quando o Founder
              relata dificuldade em encontrar o convite no aplicativo do Instagram.
            </span>
          </li>
        </ul>
        <InfoBox variant="info">
          <strong>Lembre-se:</strong> a percepção de suporte do Founder com a FLG começa nesses pequenos atritos.
          Conduzir o processo com calma e disponibilidade fortalece a parceria de longo prazo.
        </InfoBox>
      </Collapsible>

      {/* FAQ Rápido */}
      <Collapsible title="FAQ Rápido" icon={AlertCircle}>
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-white/90 mb-1">❌ "Não acho o @handle do Founder ao adicionar Instagram Tester"</p>
            <p>Confirme com o Founder se o @handle está escrito exatamente igual ao do perfil Instagram dele (sem o @, sem espaços).
            Tente também copiar e colar direto do perfil dele para evitar erro de digitação.</p>
          </div>
          <div>
            <p className="font-semibold text-white/90 mb-1">❌ "Founder diz que aceitou mas o OAuth ainda apresenta erro"</p>
            <p>O convite de Instagram Tester precisa ser aceito pelo aplicativo mobile do Instagram, não pelo navegador desktop.
            Confirme com o Founder se ele abriu o link {URL_IG_ACCEPT_INVITE} dentro do app do celular e clicou em ACEITAR.</p>
          </div>
          <div>
            <p className="font-semibold text-white/90 mb-1">❌ "Erro: Invalid scopes" ou "App em modo de desenvolvimento"</p>
            <p>O Founder NÃO foi adicionado como Instagram Tester ou ainda não aceitou. Volte no painel Meta em Produtos, Instagram, Configuração da API com login do Instagram, seção Instagram Testers, e confirme o status.</p>
          </div>
          <div>
            <p className="font-semibold text-white/90 mb-1">❌ "Conta IG do Founder é Personal"</p>
            <p>Não funciona com IG Personal, apenas Business ou Creator. O Founder precisa trocar em
            Configurações do Instagram, Conta, Mudar para conta comercial. Gratuito, leva 30 segundos, sem perder seguidores.</p>
          </div>
          <div>
            <p className="font-semibold text-white/90 mb-1">❌ "Tudo certo e ainda não funciona"</p>
            <p>Chame o Pedro no Slack com o print do erro. Provavelmente é um caso específico (token expirado, conta IG ainda em transição de tipo, entre outros).</p>
          </div>
        </div>
      </Collapsible>

      {/* Footer */}
      <div className="text-center pt-4 pb-2 space-y-2">
        <p className="text-[10px] tracking-widest uppercase text-white/30 font-monodeck">
          FLG Brasil · Tutorial Onboarding
        </p>
        <p className="text-xs text-white/40">
          Dúvida que não está aqui? Chama o Pedro no Slack ou envie um email para pedroaranda@grupoguglielmi.com
        </p>
      </div>
    </div>
  )
}
