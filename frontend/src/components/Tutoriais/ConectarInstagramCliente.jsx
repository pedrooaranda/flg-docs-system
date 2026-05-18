/**
 * Tutorial pra consultor adicionar cliente como Tester no Meta App FLG.
 *
 * Necessário enquanto o app está em Development Mode (pré App Review aprovada).
 * Cada cliente precisa ser adicionado como App Tester + Instagram Tester antes
 * de poder autorizar a conexão IG pelas Métricas FLG.
 *
 * Quando o App Review aprovar, esse passo desaparece — o tutorial pode ser
 * arquivado mas a rota fica até a Meta aprovar.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Instagram, Facebook, Copy, Check, ExternalLink, ChevronDown,
  CheckCircle2, AlertCircle, Clock, Users, MessageSquare, Sparkles,
  HelpCircle, ArrowRight,
} from 'lucide-react'

const META_APP_NAME = 'FLG Jornada System'

// URLs canônicas validadas (vide memory: meta_tester_acceptance_url.md)
const URL_FB_APP_TESTERS = 'https://developers.facebook.com/apps/'
const URL_FB_ACCEPT_INVITE = 'https://www.facebook.com/settings?tab=applications'
const URL_IG_ACCEPT_INVITE = 'https://www.instagram.com/accounts/manage_access/'

const MENSAGEM_PADRAO = `Olá [NOME DO CLIENTE]!

Pra começarmos a entregar suas métricas de Instagram nas reuniões da FLG, preciso que você autorize o acesso em 2 lugares (leva 1 min cada):

1️⃣ ABRIR NO FACEBOOK (no celular ou computador):
   ${URL_FB_ACCEPT_INVITE}

   → Vai aparecer um convite pra ser "Testador" do ${META_APP_NAME}
   → Click em ACEITAR

2️⃣ ABRIR NO INSTAGRAM (precisa ser pelo APP do celular):
   ${URL_IG_ACCEPT_INVITE}

   → Vai aparecer convite pra ser "Testador Instagram" do ${META_APP_NAME}
   → Click em ACEITAR

Quando aceitar os 2, me avisa por aqui que eu finalizo a conexão pra começarmos a acompanhar as métricas juntos.

Qualquer dúvida, me chama!

Obrigado 🙏
[SEU NOME]`

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
          Mensagem padrão pro cliente
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
          className="px-5 pb-5 text-sm text-white/70 leading-relaxed space-y-3"
          style={{ borderTop: '1px solid var(--flg-border)' }}
        >
          <div className="pt-4">{children}</div>
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
          Conectar Instagram do Cliente
        </h1>
        <p className="text-sm text-white/55 mt-3 max-w-xl mx-auto">
          Passo a passo pra autorizar o Instagram de um cliente nas Métricas FLG.
          Sem depender do Pedro pra rodar isso.
        </p>
        <div className="flex items-center justify-center gap-6 mt-4 text-xs text-white/45">
          <span className="flex items-center gap-1.5"><Clock size={11} /> ~10 min</span>
          <span className="text-white/15">·</span>
          <span className="flex items-center gap-1.5"><Users size={11} /> 5 min seu + 5 min do cliente</span>
        </div>
      </motion.div>

      {/* Pré-requisitos */}
      <Collapsible title="Antes de começar — pré-requisitos" icon={CheckCircle2} defaultOpen>
        <p className="text-white/85 mb-3">
          Esse setup só precisa ser feito <strong className="text-gold-mid">uma vez por consultor</strong>.
          Se você já fez, pode pular pra "Os passos" abaixo.
        </p>
        <ul className="space-y-2 list-none">
          <li className="flex gap-2"><span className="text-gold-mid">✓</span> Você tem conta no Facebook ativa (com seu nome real)</li>
          <li className="flex gap-2"><span className="text-gold-mid">✓</span> Pedro te adicionou como Developer no Meta App da FLG</li>
          <li className="flex gap-2"><span className="text-gold-mid">✓</span> Você abriu <a href={URL_FB_ACCEPT_INVITE} target="_blank" rel="noopener noreferrer" className="text-gold-mid underline">facebook.com/settings → Aplicativos</a> e aceitou o convite</li>
        </ul>
        <InfoBox variant="warning">
          <strong>Não fez isso ainda?</strong> Chama o Pedro no chat ou WhatsApp pedindo
          <em> "me adiciona como Developer no Meta App pra eu poder onboardar meus clientes"</em>.
          Leva 2 minutos pro lado dele e nunca mais precisa repetir.
        </InfoBox>
      </Collapsible>

      {/* Por que esse processo? */}
      <Collapsible title="Por que esse processo manual?" icon={HelpCircle}>
        <p>
          O app FLG ainda está em <strong className="text-white/90">Development Mode</strong> na Meta — ou seja,
          aguardando aprovação na App Review oficial (que leva ~4-6 semanas a partir do envio).
        </p>
        <p>
          Enquanto a Meta não aprova, cada cliente precisa ser explicitamente adicionado como
          <strong className="text-white/90"> "Tester"</strong> no painel do app, pra autorizar o acesso ao Instagram dele.
          É chato, mas é a única forma de operar com clientes reais agora.
        </p>
        <p>
          <strong className="text-gold-mid">Quando a Meta aprovar</strong>, esse tutorial deixa de existir —
          qualquer cliente vai poder conectar direto pelo botão "Conectar Instagram" sem nenhum passo prévio.
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
        <StepCard num="1" title="Colete os dados do cliente" time="1 min">
          <p>Você vai precisar de 2 informações antes de mexer no painel da Meta:</p>
          <ul className="space-y-2 ml-1">
            <li className="flex gap-2">
              <span className="text-gold-mid font-bold">→</span>
              <span><strong className="text-white/90">Nome completo do dono da conta Facebook</strong> do cliente
              (geralmente o sócio ou dono da empresa)</span>
            </li>
            <li className="flex gap-2">
              <span className="text-gold-mid font-bold">→</span>
              <span><strong className="text-white/90">@handle do Instagram da empresa</strong> (ex: @grupoguglielmi —
              o nome de usuário, sem o "https://instagram.com/")</span>
            </li>
          </ul>
          <InfoBox variant="info">
            <strong>Dica:</strong> manda mensagem pro cliente ANTES de começar, pedindo essas 2 informações.
            Ele responde em 1 min e você não interrompe seu fluxo no painel da Meta depois.
          </InfoBox>
        </StepCard>

        {/* Passo 2 */}
        <StepCard num="2" title="Adicionar como App Tester (Facebook)" time="2 min">
          <p>
            <strong className="text-white/90">App Tester</strong> = role que dá ao cliente
            permissão pra autorizar o app FLG no fluxo OAuth.
          </p>
          <ol className="space-y-2 ml-1 list-decimal list-inside">
            <li>Abre o painel Meta abaixo:</li>
          </ol>
          <ExternalLinkBtn href={URL_FB_APP_TESTERS} primary>
            <Facebook size={12} /> Abrir painel Meta for Developers
          </ExternalLinkBtn>
          <ol start="2" className="space-y-2 ml-1 list-decimal list-inside">
            <li>Click no app <strong className="text-gold-mid">{META_APP_NAME}</strong> na lista de apps</li>
            <li>No menu lateral esquerdo, click em <strong className="text-white/90">Funções do app</strong> → <strong className="text-white/90">Testadores</strong></li>
            <li>Click no botão azul <strong className="text-white/90">"Adicionar testadores"</strong> (canto superior direito)</li>
            <li>Digite o <strong className="text-white/90">nome completo Facebook</strong> do cliente — vai aparecer sugestão com a foto do perfil</li>
            <li>Click no nome certo → confirma → convite enviado ✅</li>
          </ol>
          <InfoBox variant="warning">
            <strong>Não acha o nome do cliente na busca?</strong> Confirma com ele se o nome do perfil Facebook é
            exatamente esse (pode estar com sobrenome diferente, sem acento, etc). A busca da Meta é sensível.
            Última opção: pede pro cliente te enviar o link do perfil Facebook dele e tenta achar por ali.
          </InfoBox>
        </StepCard>

        {/* Passo 3 */}
        <StepCard num="3" title="Adicionar como Instagram Tester" time="2 min">
          <p>
            <strong className="text-white/90">Instagram Tester</strong> = role específica que libera
            a CONTA IG do cliente pra ser acessada via API. <em>Sem isso, mesmo com App Tester aceito,
            o OAuth dá erro "Invalid scopes".</em>
          </p>
          <ol className="space-y-2 ml-1 list-decimal list-inside">
            <li>Ainda dentro do app <strong className="text-gold-mid">{META_APP_NAME}</strong>, no menu lateral esquerdo, vá em <strong className="text-white/90">Produtos</strong> → <strong className="text-white/90">Instagram</strong> → <strong className="text-white/90">Configuração da API com login do Instagram</strong></li>
            <li>Procura a seção <strong className="text-white/90">"Instagram Testers"</strong> (geralmente no fim da página)</li>
            <li>Click <strong className="text-white/90">"Adicionar Instagram Testers"</strong></li>
            <li>Digite o <strong className="text-white/90">@handle</strong> do cliente (ex: <code className="text-gold-mid">grupoguglielmi</code> — sem o @)</li>
            <li>Confirma → convite enviado ✅</li>
          </ol>
          <InfoBox variant="danger">
            <strong>A conta IG do cliente PRECISA ser Business ou Creator</strong> (não Personal).
            Se for Personal, peça pro cliente trocar antes em: <em>Configurações IG → Conta → Mudar tipo de conta → Conta comercial</em> (gratuito).
          </InfoBox>
        </StepCard>

        {/* Passo 4 */}
        <StepCard num="4" title="Envie a mensagem padrão pro cliente" time="1 min">
          <p>
            Os 2 convites estão pendentes. Agora o cliente precisa aceitar nos 2 lugares.
            Copia a mensagem abaixo, troca <code className="text-gold-mid">[NOME DO CLIENTE]</code> e <code className="text-gold-mid">[SEU NOME]</code>,
            e manda no WhatsApp/email dele:
          </p>
          <CopyBox text={MENSAGEM_PADRAO} />
          <InfoBox variant="info">
            <strong>O Instagram Tester PRECISA ser aceito pelo app mobile do Instagram</strong>,
            não pelo navegador. Avisa o cliente disso na mensagem se ele for menos técnico.
          </InfoBox>
        </StepCard>

        {/* Passo 5 */}
        <StepCard num="5" title="Aguardar o cliente aceitar os 2 convites" time="5 min – 24h">
          <p>
            A Meta <strong className="text-white/90">não notifica</strong> quando o cliente aceita.
            Você fica dependente da resposta dele no WhatsApp.
          </p>
          <ul className="space-y-2 ml-1">
            <li className="flex gap-2"><Clock size={13} className="text-white/40 mt-0.5 flex-shrink-0" /> <span>Tempo médio: 5-30 min se cliente tá ativo no celular</span></li>
            <li className="flex gap-2"><Clock size={13} className="text-white/40 mt-0.5 flex-shrink-0" /> <span>Pode demorar até 24h se ele tá ocupado</span></li>
            <li className="flex gap-2"><MessageSquare size={13} className="text-white/40 mt-0.5 flex-shrink-0" /> <span>Se não responder em 24h, dá um lembrete amigável</span></li>
          </ul>
          <InfoBox variant="info">
            <strong>Quer conferir se o cliente já aceitou?</strong> Volta no painel Meta → Funções do app → Testadores.
            Se ainda estiver "Pendente", ele não aceitou. Se estiver "Aceito" ✅, pode passar pro Passo 6.
          </InfoBox>
        </StepCard>

        {/* Passo 6 */}
        <StepCard num="6" title="Conecte o Instagram dentro do FLG" time="2 min">
          <p>
            Cliente confirmou que aceitou os 2 convites? Agora é só finalizar dentro do FLG:
          </p>
          <ol className="space-y-2 ml-1 list-decimal list-inside">
            <li>Vai em <strong className="text-white/90">Clientes</strong> no menu lateral</li>
            <li>Click no cliente que você acabou de configurar</li>
            <li>Procura a seção "Instagram" → click no botão <strong className="text-gold-mid">"Conectar Instagram"</strong></li>
            <li>Compartilha o link de onboarding com o cliente (ou ele clica diretamente no botão)</li>
            <li>Cliente faz login no IG dele, autoriza as 3 permissões pedidas pela FLG</li>
            <li>Pronto ✅ Em ~5 min as métricas começam a sincronizar</li>
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
            Ir pra Clientes <ArrowRight size={11} />
          </button>
        </StepCard>
      </div>

      {/* Troubleshooting */}
      <Collapsible title="Deu errado? Troubleshooting" icon={AlertCircle}>
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-white/90 mb-1">❌ "Não acho o nome do cliente na busca de testadores"</p>
            <p>O nome no Facebook pode ter espaços, sobrenomes ou acentos diferentes. Pede pro cliente te mandar o link do perfil
            Facebook dele (formato <code>facebook.com/nome.sobrenome</code>) e busca exatamente assim.</p>
          </div>
          <div>
            <p className="font-semibold text-white/90 mb-1">❌ "Cliente diz que aceitou mas o OAuth ainda dá erro"</p>
            <p>Provavelmente ele só aceitou um dos 2 convites (App Tester OU Instagram Tester). Confere no painel Meta:
            BOTH precisam estar "Aceito". Se faltar Instagram Tester, ele precisa aceitar no APP do Instagram (não funciona no navegador desktop).</p>
          </div>
          <div>
            <p className="font-semibold text-white/90 mb-1">❌ "Erro: Invalid scopes" ou "App em modo de desenvolvimento"</p>
            <p>O cliente NÃO foi adicionado como Tester ou ainda não aceitou. Volta no painel Meta e confirma status.</p>
          </div>
          <div>
            <p className="font-semibold text-white/90 mb-1">❌ "Conta IG do cliente é Personal"</p>
            <p>Não funciona com IG Personal — só Business/Creator. Cliente precisa trocar em Configurações IG → Conta → Mudar pra conta comercial. Gratuito, leva 30s, sem perder seguidores.</p>
          </div>
          <div>
            <p className="font-semibold text-white/90 mb-1">❌ "Cliente perdeu/não acha o convite no Facebook"</p>
            <p>Manda esse link direto: <code className="text-gold-mid">{URL_FB_ACCEPT_INVITE}</code></p>
          </div>
          <div>
            <p className="font-semibold text-white/90 mb-1">❌ "Tudo certo e ainda não funciona"</p>
            <p>Chama o Pedro com print do erro. Provavelmente é caso edge (token expirado, conta IG ainda em transição de tipo, etc).</p>
          </div>
        </div>
      </Collapsible>

      {/* FAQ */}
      <Collapsible title="Perguntas frequentes" icon={HelpCircle}>
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-white/90 mb-1">💰 Quanto custa pro cliente?</p>
            <p>Zero. Gratuito sempre. Cliente só autoriza acesso de leitura aos dados públicos do IG Business dele.</p>
          </div>
          <div>
            <p className="font-semibold text-white/90 mb-1">👁️ O cliente vê meus dados ou minha conta Meta?</p>
            <p>Não. Ele só vê "FLG Jornada System" como nome do app e os escopos solicitados (basic, insights, comments).
            Sua identidade como consultor não aparece pra ele no painel Meta.</p>
          </div>
          <div>
            <p className="font-semibold text-white/90 mb-1">📈 Quantos clientes posso adicionar?</p>
            <p>Até <strong className="text-gold-mid">50 testers</strong> enquanto a Business Verification não aprovar.
            Depois sobe pra 500. E quando a App Review aprovar, esse limite some — qualquer cliente conecta direto sem ser Tester.</p>
          </div>
          <div>
            <p className="font-semibold text-white/90 mb-1">🔁 Adicionei a pessoa errada por engano — perigo?</p>
            <p>Nenhum. Vai em Funções do app → Testadores → click no nome errado → Remover. Zero efeito colateral.</p>
          </div>
          <div>
            <p className="font-semibold text-white/90 mb-1">⏰ Quanto tempo dura o acesso depois que conecta?</p>
            <p>Token IG dura 60 dias, mas a FLG renova automaticamente em background. Cliente só vai precisar reautorizar
            se trocar a senha do IG ou explicitamente revogar o acesso.</p>
          </div>
          <div>
            <p className="font-semibold text-white/90 mb-1">🚪 Cliente quer desconectar — como funciona?</p>
            <p>2 opções: (a) cliente revoga direto nas Configurações do Instagram → Aplicativos autorizados → revoga FLG;
            (b) FLG remove em /clientes/&lt;id&gt; → "Desconectar Instagram". Em ambos os casos os dados históricos são preservados
            mas o sync para de rodar.</p>
          </div>
        </div>
      </Collapsible>

      {/* Footer */}
      <div className="text-center pt-4 pb-2 space-y-2">
        <p className="text-[10px] tracking-widest uppercase text-white/30 font-monodeck">
          FLG Brasil · Tutorial Onboarding
        </p>
        <p className="text-xs text-white/40">
          Dúvida que não está aqui? Manda mensagem pro Pedro · presidencia@grupoguglielmi.com
        </p>
      </div>
    </div>
  )
}
