/**
 * Home — feed dedicado ao consultor.
 *
 * Sections:
 *  1. Saudação dinâmica (Bom dia/tarde/noite + nome)
 *  2. Métricas resumo (clientes ativos, em campanha, pausados, etc)
 *  3. ⚠️ Alertas (clientes >3 dias sem postar) — mock até API real
 *  4. 📅 Próximos encontros da semana — mock até integração calendário
 *  5. ✓ Tarefas pendentes — mock até integração ClickUp
 *  6. Meus clientes (priorizando os da semana, depois os outros)
 */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Users, TrendingUp, PauseCircle, UserCheck, ArrowRight, AlertTriangle,
  Calendar, CheckCircle2, Clock, Sparkles,
} from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { Avatar } from './ui/Avatar'
import { StatusBadge } from './ui/Badge'
import { SkeletonCard } from './ui/Skeleton'
import { progressPercent } from '../lib/utils'

// ──────────────────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function getFirstName(email) {
  if (!email) return ''
  const local = email.split('@')[0]
  // Capitaliza primeira letra
  return local.charAt(0).toUpperCase() + local.slice(1)
}

// Determina o "status semáforo" do cliente baseado em encontro_atual + status
function getClientFlag(c) {
  if (c.status === 'pausado') return { label: 'Pausado', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)' }
  if (c.encontro_atual >= 6 && c.encontro_atual <= 8) return { label: 'Em campanha piloto', color: '#A855F7', bg: 'rgba(168,85,247,0.12)' }
  if (c.encontro_atual >= 13) return { label: 'Reta final', color: '#34D399', bg: 'rgba(52,211,153,0.12)' }
  return { label: 'Ativo', color: '#34D399', bg: 'rgba(52,211,153,0.12)' }
}

// Mock determinístico de "dias sem postar" baseado no cliente_id (até API real)
function mockDiasSemPostar(clienteId) {
  if (!clienteId) return 0
  const seed = clienteId.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  return seed % 14 // 0-13 dias
}

// Mock determinístico de próximos encontros da semana
function mockProximosEncontros(clientes) {
  return clientes.slice(0, 4).map((c, i) => {
    const hoje = new Date()
    const dia = new Date(hoje.getTime() + i * 24 * 60 * 60 * 1000)
    return {
      cliente: c,
      data: dia,
      hora: ['09:00', '14:30', '11:00', '16:00'][i] || '10:00',
      encontroNum: c.encontro_atual || 1,
    }
  })
}

// Mock determinístico de tarefas pendentes do ClickUp
function mockTarefasPendentes(clientes) {
  if (!clientes.length) return []
  const tarefas = [
    { titulo: 'Revisar copy do post de quarta', prioridade: 'alta' },
    { titulo: 'Aprovar roteiro do próximo Reel', prioridade: 'média' },
    { titulo: 'Brief de campanha — semana que vem', prioridade: 'alta' },
    { titulo: 'Análise mensal de métricas', prioridade: 'baixa' },
  ]
  return tarefas.slice(0, Math.min(4, clientes.length)).map((t, i) => ({
    ...t,
    cliente: clientes[i % clientes.length],
  }))
}

// ──────────────────────────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, sub, color = 'gold', delay = 0 }) {
  const colorMap = {
    gold:   { bg: 'rgba(201,168,76,0.08)',  border: 'rgba(201,168,76,0.2)',  icon: '#C9A84C' },
    green:  { bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.2)',  icon: '#34D399' },
    yellow: { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.2)',  icon: '#FBBF24' },
    purple: { bg: 'rgba(168,85,247,0.08)',  border: 'rgba(168,85,247,0.2)',  icon: '#A855F7' },
    blue:   { bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.2)',  icon: '#60A5FA' },
  }
  const c = colorMap[color]
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="card-flg p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-white/35 tracking-widest uppercase mb-2">{label}</p>
          <p className="font-display text-3xl font-bold text-white">{value}</p>
          {sub && <p className="text-xs text-white/30 mt-1">{sub}</p>}
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: c.bg, border: `1px solid ${c.border}` }}>
          <Icon size={16} style={{ color: c.icon }} />
        </div>
      </div>
    </motion.div>
  )
}

function AlertCard({ cliente, dias, delay }) {
  const navigate = useNavigate()
  const severity = dias > 7 ? 'critical' : dias > 4 ? 'high' : 'med'
  const palette = {
    critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.35)', label: 'CRÍTICO' },
    high:     { color: '#F97316', bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.35)', label: 'ALERTA' },
    med:      { color: '#FBBF24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.35)', label: 'ATENÇÃO' },
  }
  const p = palette[severity]
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="rounded-xl p-3.5 flex items-center gap-3 cursor-pointer transition-transform hover:scale-[1.01]"
      style={{ background: p.bg, border: `1px solid ${p.border}` }}
      onClick={() => navigate(`/clientes/${cliente.id}`)}
    >
      <div
        className="rounded-lg flex items-center justify-center shrink-0"
        style={{ width: 40, height: 40, background: `${p.color}20`, border: `1px solid ${p.color}40` }}
      >
        <AlertTriangle size={18} style={{ color: p.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded uppercase" style={{ background: `${p.color}25`, color: p.color }}>
            {p.label}
          </span>
          <span className="text-sm font-semibold text-white/90 truncate">{cliente.nome}</span>
        </div>
        <p className="text-[11px] text-white/55 mt-0.5">
          <strong className="text-white/85">{dias} dias</strong> sem produzir conteúdo · iniciar tratativa
        </p>
      </div>
      <ArrowRight size={14} className="text-white/30" />
    </motion.div>
  )
}

function EncontroCard({ encontro, delay }) {
  const navigate = useNavigate()
  const { cliente, data, hora, encontroNum } = encontro
  const diasNomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const ehHoje = new Date().toDateString() === data.toDateString()
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-xl p-3 cursor-pointer transition-colors"
      style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}
      onClick={() => navigate(`/clientes/${cliente.id}/encontro/${encontroNum}`)}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.4)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--flg-border)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="rounded-lg flex flex-col items-center justify-center shrink-0"
          style={{
            width: 48, height: 48,
            background: ehHoje ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.04)',
            border: ehHoje ? '1px solid rgba(201,168,76,0.4)' : '1px solid var(--flg-border)',
          }}
        >
          <span className="text-[9px] font-bold tracking-wider uppercase" style={{ color: ehHoje ? '#C9A84C' : 'rgba(255,255,255,0.45)' }}>
            {diasNomes[data.getDay()]}
          </span>
          <span className="text-base font-bold leading-none" style={{ color: ehHoje ? '#FACC15' : 'rgba(255,255,255,0.85)' }}>
            {data.getDate()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white/90 truncate">{cliente.nome}</p>
            {ehHoje && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: 'rgba(250,204,21,0.20)', color: '#FACC15' }}>HOJE</span>
            )}
          </div>
          <p className="text-[11px] text-white/45 mt-0.5 flex items-center gap-1.5">
            <Clock size={10} /> {hora}
            <span className="text-white/25">·</span>
            Encontro {encontroNum}/15
          </p>
        </div>
      </div>
    </motion.div>
  )
}

function TarefaCard({ tarefa, delay }) {
  const palette = {
    alta:  { color: '#EF4444', label: 'ALTA' },
    média: { color: '#FBBF24', label: 'MÉDIA' },
    baixa: { color: '#60A5FA', label: 'BAIXA' },
  }
  const p = palette[tarefa.prioridade] || palette.baixa
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-xl p-3 flex items-center gap-3"
      style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}
    >
      <div className="rounded-md w-1 h-10 shrink-0" style={{ background: p.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-white/85 leading-tight">{tarefa.titulo}</p>
        <p className="text-[11px] text-white/40 mt-1">
          <span className="font-semibold" style={{ color: p.color }}>{p.label}</span>
          <span className="text-white/25 mx-1.5">·</span>
          {tarefa.cliente.nome}
        </p>
      </div>
      <CheckCircle2 size={16} className="text-white/20 cursor-pointer hover:text-white/60 transition-colors" />
    </motion.div>
  )
}

function ClienteCard({ cliente, delay, prioridade = false }) {
  const navigate = useNavigate()
  const flag = getClientFlag(cliente)
  const dias = mockDiasSemPostar(cliente.id)
  const pct = progressPercent(cliente.encontro_atual)
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-xl p-4 cursor-pointer transition-transform hover:scale-[1.01]"
      style={{
        background: prioridade ? 'rgba(201,168,76,0.04)' : 'var(--flg-bg-raised)',
        border: `1px solid ${prioridade ? 'rgba(201,168,76,0.22)' : 'var(--flg-border)'}`,
      }}
      onClick={() => navigate(`/clientes/${cliente.id}`)}
    >
      <div className="flex items-center gap-3 mb-3">
        <Avatar name={cliente.nome} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white/90 truncate">{cliente.nome}</p>
          <p className="text-[11px] text-white/40 truncate">{cliente.empresa || '—'}</p>
        </div>
        <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded uppercase" style={{ background: flag.bg, color: flag.color }}>
          {flag.label}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] mb-2">
        <span className="text-white/40">Encontro {cliente.encontro_atual || 1}/15</span>
        {dias > 0 && (
          <span style={{ color: dias > 4 ? '#F97316' : 'rgba(255,255,255,0.5)' }}>
            {dias === 0 ? 'postou hoje' : `${dias}d sem postar`}
          </span>
        )}
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #C9A84C, #F5D68A)' }} />
      </div>
    </motion.div>
  )
}

function SectionTitle({ icon: Icon, children, count, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={14} className="text-white/40" />}
        <h2 className="text-xs font-semibold text-white/65 uppercase tracking-widest">{children}</h2>
        {count != null && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(201,168,76,0.15)', color: '#C9A84C' }}>
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────

export default function Dashboard({ session }) {
  const { clientes: allClientes, loading } = useApp()
  const navigate = useNavigate()

  const userEmail = session?.user?.email
  const firstName = getFirstName(userEmail)
  const greeting = getGreeting()

  // Home é SEMPRE a view do consultor logado (mesmo admin) — admin pra ver
  // tudo vai em "Clientes" no menu lateral.
  const myClientes = useMemo(() => {
    const handle = userEmail?.split('@')[0]?.toLowerCase() || ''
    return allClientes.filter(c =>
      c.consultor_responsavel?.toLowerCase().includes(handle)
    )
  }, [allClientes, userEmail])

  // Métricas
  const ativos = myClientes.filter(c => (c.status || 'ativo') === 'ativo').length
  const pausados = myClientes.filter(c => c.status === 'pausado').length
  const campanha = myClientes.filter(c => c.encontro_atual >= 6 && c.encontro_atual <= 8).length
  const retaFinal = myClientes.filter(c => c.encontro_atual >= 13).length

  // Alertas: clientes >3 dias sem postar (mock determinístico)
  const alertas = useMemo(() => {
    return myClientes
      .map(c => ({ cliente: c, dias: mockDiasSemPostar(c.id) }))
      .filter(a => a.dias > 3)
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 5)
  }, [myClientes])

  // Encontros da semana (mock)
  const encontros = useMemo(() => mockProximosEncontros(myClientes), [myClientes])

  // Tarefas pendentes (mock)
  const tarefas = useMemo(() => mockTarefasPendentes(myClientes), [myClientes])

  // Clientes ranqueados: prioridade primeiro (alertas + encontros da semana), depois resto
  const clientesPriorizados = useMemo(() => {
    const idsAlerta = new Set(alertas.map(a => a.cliente.id))
    const idsEncontro = new Set(encontros.map(e => e.cliente.id))
    const prioridade = myClientes.filter(c => idsAlerta.has(c.id) || idsEncontro.has(c.id))
    const resto = myClientes.filter(c => !idsAlerta.has(c.id) && !idsEncontro.has(c.id))
    return { prioridade, resto }
  }, [myClientes, alertas, encontros])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* ── 1. Saudação ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <div className="w-11 h-11 rounded-xl gold-gradient flex items-center justify-center flex-shrink-0">
          <Sparkles size={18} className="text-[#080808]" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-white">
            {greeting}{firstName && `, ${firstName}`}.
          </h1>
          <p className="text-xs text-white/35 mt-0.5">
            Você tem <strong className="text-white/65">{myClientes.length} clientes</strong> ativos
            {alertas.length > 0 && <> · <span className="text-orange-400">{alertas.length} precisa{alertas.length > 1 ? 'm' : ''} de atenção</span></>}
          </p>
        </div>
      </motion.div>

      {/* ── 2. Métricas resumo ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Users} label="Clientes Ativos" value={ativos} sub={`${myClientes.length} total`} color="green" delay={0} />
        <MetricCard icon={TrendingUp} label="Em Campanha Piloto" value={campanha} sub="Encontros 6–8" color="purple" delay={0.05} />
        <MetricCard icon={UserCheck} label="Reta Final" value={retaFinal} sub="Encontros 13+" color="gold" delay={0.1} />
        <MetricCard icon={PauseCircle} label="Pausados" value={pausados} sub="aguardando retorno" color="yellow" delay={0.15} />
      </div>

      {/* ── 3. Alertas + Próximos encontros (lado a lado) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <SectionTitle icon={AlertTriangle} count={alertas.length}>
            Atenção · clientes sem postar
          </SectionTitle>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <SkeletonCard key={i} className="h-16" />)}
            </div>
          ) : alertas.length === 0 ? (
            <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
              <CheckCircle2 size={20} className="mx-auto mb-2 text-emerald-400" />
              <p className="text-xs text-white/55">Tudo em dia · todos os clientes postaram nos últimos 3 dias</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alertas.map((a, i) => (
                <AlertCard key={a.cliente.id} cliente={a.cliente} dias={a.dias} delay={i * 0.05} />
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionTitle icon={Calendar} count={encontros.length}>
            Próximos encontros
          </SectionTitle>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <SkeletonCard key={i} className="h-16" />)}
            </div>
          ) : encontros.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-8">Sem encontros agendados</p>
          ) : (
            <div className="space-y-2">
              {encontros.map((e, i) => (
                <EncontroCard key={e.cliente.id} encontro={e} delay={i * 0.05} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 4. Tarefas pendentes (mock ClickUp) ── */}
      {tarefas.length > 0 && (
        <div>
          <SectionTitle icon={CheckCircle2} count={tarefas.length} action={
            <span className="text-[10px] text-white/30 italic">via ClickUp · mock</span>
          }>
            Tarefas pendentes
          </SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tarefas.map((t, i) => (
              <TarefaCard key={i} tarefa={t} delay={i * 0.05} />
            ))}
          </div>
        </div>
      )}

      {/* ── 5. Meus clientes (priorizados primeiro) ── */}
      <div>
        <SectionTitle icon={Users} count={myClientes.length} action={
          <button
            onClick={() => navigate('/clientes')}
            className="flex items-center gap-1 text-xs text-gold-mid/70 hover:text-gold-mid transition-colors cursor-pointer"
          >
            Ver todos <ArrowRight size={11} />
          </button>
        }>
          Meus clientes
        </SectionTitle>

        {loading && myClientes.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} className="h-32" />)}
          </div>
        ) : myClientes.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-8">Você ainda não tem clientes alocados.</p>
        ) : (
          <div className="space-y-4">
            {clientesPriorizados.prioridade.length > 0 && (
              <>
                <p className="text-[10px] text-white/35 uppercase tracking-wider font-medium">Prioridade da semana</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {clientesPriorizados.prioridade.map((c, i) => (
                    <ClienteCard key={c.id} cliente={c} delay={i * 0.04} prioridade />
                  ))}
                </div>
              </>
            )}
            {clientesPriorizados.resto.length > 0 && (
              <>
                {clientesPriorizados.prioridade.length > 0 && (
                  <p className="text-[10px] text-white/35 uppercase tracking-wider font-medium pt-2">Demais clientes</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {clientesPriorizados.resto.map((c, i) => (
                    <ClienteCard key={c.id} cliente={c} delay={i * 0.04} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
