import { useParams, Link } from 'react-router-dom'

const PRIVACY = `# Política de Privacidade — FLG Jornada System

**Última atualização:** 26 de abril de 2026

A Founders Led Growth ("FLG", "nós") opera a plataforma FLG Jornada System
("Plataforma") em https://docs.foundersledgrowth.online. Esta Política de
Privacidade descreve como coletamos, usamos, armazenamos e protegemos
informações de nossos clientes ("você") e dos perfis sociais conectados.

---

## 1. Informações que coletamos

### 1.1 Informações fornecidas pelo cliente
- Nome, e-mail corporativo, empresa, telefone (WhatsApp)
- Histórico de encontros, materiais e copies produzidos
- Notas e observações do consultor sobre o cliente
- Documentos enviados (planejamento estratégico, estudos de mercado)

### 1.2 Informações de contas conectadas (Instagram Business via Meta Graph API)
Quando você autoriza a FLG a conectar sua conta Instagram Business, coletamos:
- **Dados de perfil:** username, foto de perfil, biografia, contagem de seguidores,
  contagem de seguindo, contagem de mídia
- **Dados de mídia (posts, reels, stories):** URL pública, legenda, data de
  publicação, thumbnail, tipo de mídia
- **Métricas (insights):** alcance, impressões, curtidas, comentários, salvamentos,
  compartilhamentos, plays (Reels), watch time (Reels), exits/replies/taps
  (Stories), visitas ao perfil
- **Token de acesso OAuth** (criptografado em repouso) — usado exclusivamente
  para consultar dados de sua conta na Meta Graph API

### 1.3 Informações de uso da plataforma
- Logs de acesso, ações realizadas, sessões de chat com agentes IA
- Endereço IP (apenas para segurança e prevenção de fraudes)

---

## 2. Como usamos as informações

- **Operação do serviço:** preparação de encontros consultivos, geração de
  materiais e copies, dashboard de métricas
- **Análise de IA:** os agentes Claude (Anthropic) processam dados do cliente
  para gerar insights, análises de tendências e recomendações
- **Sincronização de métricas:** polling periódico da Meta Graph API para
  manter dashboard atualizado em tempo real
- **Comunicação:** envio de relatórios, alertas e atualizações de produto

**Não vendemos, alugamos ou compartilhamos seus dados com terceiros para
fins de marketing.**

---

## 3. Compartilhamento de dados

Compartilhamos dados apenas com os seguintes provedores de infraestrutura:
- **Supabase** (banco de dados, autenticação, storage) — Estados Unidos
- **Anthropic** (API Claude para análise de IA) — Estados Unidos
- **Meta Platforms** (somente para validar tokens OAuth) — Estados Unidos
- **ClickUp** (CRM e gerenciamento de tasks) — Estados Unidos

Todos os provedores são cobertos por DPAs (Data Processing Agreements)
e operam sob padrões de segurança equivalentes ao GDPR/LGPD.

---

## 4. Armazenamento e segurança

- Banco de dados PostgreSQL com Row Level Security (RLS) ativada
- Tokens OAuth armazenados criptografados em repouso
- Conexões TLS 1.3 obrigatórias
- Backups automáticos diários
- Servidores localizados em regiões com adequação à LGPD

---

## 5. Retenção

- Dados de clientes ativos: mantidos enquanto a conta estiver ativa
- Dados de Instagram (posts, métricas): mantidos integralmente para análise
  histórica de tendências
- Após desconexão de conta Instagram: tokens são imediatamente invalidados;
  histórico é preservado para auditoria
- Após cancelamento de cliente: dados são anonimizados em até 30 dias
- Logs de acesso: retidos por 12 meses

---

## 6. Seus direitos (LGPD/GDPR)

Você tem direito a:
- **Acesso** — solicitar cópia dos dados que mantemos sobre você
- **Correção** — corrigir dados imprecisos
- **Exclusão** — solicitar deleção completa de seus dados
- **Portabilidade** — receber seus dados em formato estruturado
- **Revogação de consentimento** — desconectar sua conta Instagram a qualquer
  momento via plataforma ou em https://www.facebook.com/settings?tab=business_tools
- **Oposição** — contestar processamento de dados

Para exercer qualquer desses direitos, envie e-mail para
**presidencia@grupoguglielmi.com** ou siga as instruções em
[Exclusão de Dados](/legal/data-deletion).

---

## 7. Cookies e tecnologias similares

Usamos cookies estritamente necessários para autenticação (Supabase Auth)
e funcionamento da plataforma. Não usamos cookies de marketing ou rastreamento
de terceiros.

---

## 8. Crianças

Nosso serviço não é destinado a menores de 18 anos. Não coletamos
deliberadamente dados de menores.

---

## 9. Alterações nesta política

Podemos atualizar esta Política periodicamente. Mudanças significativas
serão comunicadas por e-mail aos clientes ativos com no mínimo 30 dias
de antecedência.

---

## 10. Contato

**Founders Led Growth (Grupo Guglielmi)**
E-mail: presidencia@grupoguglielmi.com
Site: https://foundersledgrowth.com.br
Plataforma: https://docs.foundersledgrowth.online

Para questões relacionadas à proteção de dados (LGPD), entre em contato
diretamente com nosso DPO no e-mail acima.
`

const TERMS = `# Termos de Serviço — FLG Jornada System

**Última atualização:** 26 de abril de 2026

Bem-vindo ao FLG Jornada System. Estes Termos de Serviço ("Termos") regem
seu uso da plataforma operada pela Founders Led Growth ("FLG", "nós").

Ao acessar ou usar a Plataforma, você concorda integralmente com estes Termos.

---

## 1. Sobre o serviço

O FLG Jornada System é uma plataforma B2B de assessoria estratégica para
founders, incluindo:
- Preparação de encontros consultivos guiada por IA
- Produção de materiais e copies estratégicos
- Dashboard de métricas de redes sociais (Instagram Business)
- Análise comportamental de clientes
- Integrações com ClickUp, Meta Graph API e ferramentas correlatas

---

## 2. Conta e elegibilidade

- O serviço é destinado a empresas e profissionais com 18+ anos
- Cada cliente recebe credenciais de acesso geradas pela FLG
- Você é responsável por manter suas credenciais em segurança
- É proibido compartilhar credenciais com terceiros não autorizados

---

## 3. Uso aceitável

Você concorda em **não**:
- Usar a plataforma para fins ilegais ou que violem direitos de terceiros
- Tentar acessar áreas restritas ou contas de outros clientes
- Realizar engenharia reversa ou copiar a propriedade intelectual da FLG
- Sobrecarregar nossa infraestrutura com requisições automatizadas
- Inserir dados pessoais de terceiros sem o devido consentimento

---

## 4. Conexão com Instagram Business (Meta)

Ao conectar sua conta Instagram Business à nossa plataforma:
- Você autoriza a FLG a coletar métricas e conteúdo público de sua conta
- A coleta é feita exclusivamente via Meta Graph API com seu consentimento
- Você pode revogar a conexão a qualquer momento (via nossa plataforma ou
  diretamente em https://www.facebook.com/settings?tab=business_tools)
- Os dados coletados são usados apenas para gerar análises e insights
  estratégicos para você
- A FLG não publica, modifica ou exclui conteúdo de sua conta

---

## 5. Propriedade intelectual

- Todo conteúdo da plataforma (código, design, metodologia) é propriedade
  exclusiva da Founders Led Growth
- A metodologia FLG, frameworks e análises proprietárias estão protegidos
  por direitos autorais
- Materiais gerados com auxílio dos agentes IA pertencem ao cliente, mas
  a FLG mantém o direito de uso anônimo agregado para melhoria do serviço

---

## 6. Pagamento e cancelamento

- Os termos comerciais (mensalidade, prazo, escopo) são definidos em
  contrato individual entre o cliente e a FLG
- O cancelamento segue o prazo estabelecido em contrato
- Após cancelamento, os dados do cliente serão anonimizados em até 30 dias

---

## 7. Limitação de responsabilidade

A FLG envida seus melhores esforços para garantir disponibilidade,
precisão e segurança da plataforma, mas:
- Não garantimos disponibilidade 100% (SLA detalhado em contrato)
- Não nos responsabilizamos por decisões de negócio tomadas com base nas
  análises e recomendações geradas pela plataforma
- Não nos responsabilizamos por instabilidades em APIs de terceiros
  (Meta, ClickUp, Anthropic) que afetem o serviço
- Em nenhuma hipótese nossa responsabilidade excederá o valor pago pelo
  cliente nos últimos 12 meses

---

## 8. Privacidade

O tratamento de dados pessoais segue nossa
[Política de Privacidade](/legal/privacy), parte integrante destes Termos.

---

## 9. Modificações

Podemos atualizar estes Termos. Mudanças relevantes serão comunicadas
por e-mail aos clientes ativos com 30 dias de antecedência. O uso
continuado da Plataforma após mudanças constitui aceitação.

---

## 10. Lei aplicável e foro

Estes Termos são regidos pela legislação brasileira. Fica eleito o foro
da Comarca de São Paulo/SP para dirimir eventuais controvérsias,
com renúncia expressa a qualquer outro, por mais privilegiado que seja.

---

## 11. Contato

**Founders Led Growth (Grupo Guglielmi)**
E-mail: presidencia@grupoguglielmi.com
Site: https://foundersledgrowth.com.br
Plataforma: https://docs.foundersledgrowth.online
`

const DATA_DELETION = `# Exclusão de Dados — FLG Jornada System

**Última atualização:** 26 de abril de 2026

Esta página descreve como solicitar a **exclusão de seus dados** mantidos
pela Founders Led Growth ("FLG") em nossa plataforma e em integrações com
serviços terceiros como o Meta (Instagram).

---

## 1. O que pode ser excluído

### 1.1 Dados da plataforma FLG
- Perfil e histórico de encontros
- Materiais, copies e documentos produzidos
- Notas e observações do consultor
- Histórico de conversas com agentes IA

### 1.2 Dados de Instagram conectado via Meta Graph API
- Token OAuth (invalidado imediatamente)
- Métricas históricas (posts, reels, stories, insights)
- Snapshot de perfil (foto, bio, contagem de seguidores)

---

## 2. Como solicitar a exclusão

### Opção A — Desconectar Instagram (apenas dados Meta)

1. Acesse https://www.facebook.com/settings?tab=business_tools
2. Localize "FLG Metrics System" na lista de aplicativos integrados
3. Clique em **Remover** ao lado do nome
4. A revogação é instantânea — nosso sistema deixa de poder consultar
   sua conta a partir do momento da remoção

Após a desconexão, os dados históricos já coletados podem ser solicitados
para exclusão pelas opções B ou C abaixo.

### Opção B — Solicitar exclusão completa por e-mail

Envie um e-mail para **presidencia@grupoguglielmi.com** com:
- Assunto: **"Solicitação de Exclusão de Dados — LGPD"**
- Seu nome completo
- E-mail cadastrado na plataforma
- Especificação do que deseja excluir (todos os dados, apenas Instagram, etc.)

**Prazo de resposta:** até 15 dias úteis para confirmação, exclusão
efetivada em até 30 dias corridos a partir da confirmação.

### Opção C — Pelo seu consultor FLG

Solicite diretamente ao seu consultor responsável a exclusão de dados.
A solicitação será encaminhada à equipe técnica e processada nos mesmos
prazos da Opção B.

---

## 3. O que acontece após a exclusão

- **Dados pessoais e de Instagram:** removidos permanentemente do banco
  principal, dos backups e dos sistemas de processamento de IA
- **Logs operacionais:** retidos por 12 meses para fins de segurança e
  auditoria, depois removidos automaticamente
- **Dados anonimizados agregados** (sem identificação pessoal): podem ser
  retidos para análise estatística da plataforma

---

## 4. Confirmação

Após a exclusão, você receberá uma confirmação por e-mail com:
- Data e horário da exclusão
- Lista de sistemas em que os dados foram removidos
- Eventuais dados retidos por obrigação legal (com justificativa)

---

## 5. Seus direitos LGPD

Além da exclusão, você tem direito a:
- Acesso a uma cópia de seus dados
- Correção de dados imprecisos
- Portabilidade (receber dados em formato estruturado)
- Revogação de consentimento

Veja a [Política de Privacidade](/legal/privacy) completa para mais detalhes.

---

## 6. Contato

**Founders Led Growth (Grupo Guglielmi)**
E-mail (DPO): presidencia@grupoguglielmi.com
Site: https://foundersledgrowth.com.br
`

const PAGES = {
  privacy: { title: 'Política de Privacidade', content: PRIVACY },
  terms: { title: 'Termos de Serviço', content: TERMS },
  'data-deletion': { title: 'Exclusão de Dados', content: DATA_DELETION },
}

function renderMarkdown(md) {
  // Renderizador simples de Markdown — suficiente pra páginas legais
  const lines = md.split('\n')
  const out = []
  let inList = false
  let para = []

  const flushPara = () => {
    if (para.length) {
      out.push(<p key={out.length} className="mb-4 leading-relaxed text-white/70">
        {renderInline(para.join(' '))}
      </p>)
      para = []
    }
  }
  const flushList = () => {
    if (inList) { out.push(<div key={`l${out.length}`} className="mb-4" />); inList = false }
  }

  const renderInline = (text) => {
    const parts = []
    let remaining = text
    let key = 0
    while (remaining.length) {
      const bold = remaining.match(/\*\*([^*]+)\*\*/)
      const link = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/)
      const code = remaining.match(/`([^`]+)`/)
      const matches = [bold, link, code].filter(Boolean)
      if (!matches.length) { parts.push(remaining); break }
      const first = matches.reduce((a, b) => a.index < b.index ? a : b)
      if (first.index > 0) parts.push(remaining.slice(0, first.index))
      if (first === bold) parts.push(<strong key={key++} className="text-white">{first[1]}</strong>)
      else if (first === link) parts.push(<a key={key++} href={first[2]} className="text-gold-mid hover:underline" target={first[2].startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{first[1]}</a>)
      else if (first === code) parts.push(<code key={key++} className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--flg-bg-card)' }}>{first[1]}</code>)
      remaining = remaining.slice(first.index + first[0].length)
    }
    return parts
  }

  for (const line of lines) {
    if (line.startsWith('# ')) { flushPara(); flushList(); out.push(<h1 key={out.length} className="text-3xl font-bold mt-2 mb-6 gold-text" style={{ fontFamily: 'Playfair Display, serif' }}>{line.slice(2)}</h1>); continue }
    if (line.startsWith('## ')) { flushPara(); flushList(); out.push(<h2 key={out.length} className="text-xl font-bold mt-8 mb-3 text-white/90" style={{ fontFamily: 'Playfair Display, serif' }}>{line.slice(3)}</h2>); continue }
    if (line.startsWith('### ')) { flushPara(); flushList(); out.push(<h3 key={out.length} className="text-base font-semibold mt-5 mb-2 text-white/80">{line.slice(4)}</h3>); continue }
    if (line.startsWith('---')) { flushPara(); flushList(); out.push(<hr key={out.length} className="my-8 border-white/10" />); continue }
    if (line.startsWith('- ')) { flushPara(); inList = true; out.push(<li key={out.length} className="ml-5 mb-1 leading-relaxed text-white/70 list-disc">{renderInline(line.slice(2))}</li>); continue }
    if (/^\d+\.\s/.test(line)) { flushPara(); inList = true; out.push(<li key={out.length} className="ml-5 mb-1 leading-relaxed text-white/70 list-decimal">{renderInline(line.replace(/^\d+\.\s/, ''))}</li>); continue }
    if (line.trim() === '') { flushPara(); flushList(); continue }
    para.push(line)
  }
  flushPara(); flushList()
  return out
}

export default function LegalPage() {
  const { page } = useParams()
  const data = PAGES[page]

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--flg-bg)' }}>
        <p className="text-white/40">Página não encontrada.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-12 px-6" style={{ background: 'var(--flg-bg)' }}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <Link to="/" className="inline-flex items-center gap-2 mb-8 text-sm text-white/40 hover:text-gold-mid transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Voltar para o Jornada System
        </Link>

        <div className="card-flg p-8 sm:p-10">
          {renderMarkdown(data.content)}
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between text-xs text-white/30">
          <p>Founders Led Growth — Grupo Guglielmi</p>
          <div className="flex gap-4">
            <Link to="/legal/privacy" className="hover:text-gold-mid">Privacidade</Link>
            <Link to="/legal/terms" className="hover:text-gold-mid">Termos</Link>
            <Link to="/legal/data-deletion" className="hover:text-gold-mid">Exclusão de Dados</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
