/**
 * ClienteArea — layout da área do cliente em /materiais/cliente/:cid.
 *
 * Header com identidade do cliente (avatar + nome + empresa + consultor + barra de progresso).
 * Abas Diários | Reuniões via NavLink (URL bookmarkable).
 *
 * Design tokens: Fraunces em nome, JetBrains Mono em codes, eyebrow uppercase,
 * gold-divider abaixo do header.
 */

import { Outlet, NavLink, Navigate, useLocation, useParams, useNavigate, Link } from 'react-router-dom'
import { FileText, Presentation, ChevronLeft } from 'lucide-react'
import { useApp } from '../../../contexts/AppContext'
import { Avatar } from '../../ui/Avatar'

const TABS = [
  { key: 'diarios',  label: 'Diários',  to: 'diarios',  Icon: FileText },
  { key: 'reunioes', label: 'Reuniões', to: 'reunioes', Icon: Presentation },
]

export default function ClienteArea() {
  const { cid } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { clientes } = useApp()

  const cliente = clientes.find(c => c.id === cid)

  // /materiais/cliente/:cid → redirect pra /diarios
  const basePath = `/materiais/cliente/${cid}`
  if (pathname === basePath || pathname === basePath + '/') {
    return <Navigate to={`${basePath}/diarios`} replace />
  }

  if (!cliente) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-lg p-6 text-center"
          style={{ background: 'var(--flg-bg-card)', border: '1px solid var(--flg-border)' }}>
          <p className="text-sm text-white/70 mb-2">Cliente não encontrado.</p>
          <button
            onClick={() => navigate('/materiais')}
            className="inline-flex items-center gap-1.5 text-xs text-gold-mid hover:underline">
            <ChevronLeft size={12} /> Voltar pra escolha de cliente
          </button>
        </div>
      </div>
    )
  }

  const encAtual = cliente.encontro_atual || 1
  const pct = Math.min(100, Math.round((encAtual / 15) * 100))

  return (
    <div className="flex flex-col h-full">
      {/* Header da área do cliente */}
      <div className="px-6 pt-5 pb-3 border-b border-white/5 flex-shrink-0"
        style={{ background: 'var(--flg-bg-secondary)' }}>
        <Link to="/materiais"
          className="inline-flex items-center gap-1 text-[11px] text-white/40 hover:text-gold-mid transition-colors mb-3">
          <ChevronLeft size={12} /> Todos os clientes
        </Link>

        <div className="flex items-start gap-4">
          <Avatar name={cliente.nome} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] tracking-[0.25em] uppercase text-gold-mid/70 font-monodeck mb-1">
              {cliente.consultor_responsavel || 'Sem consultor'}
            </p>
            <h1 className="text-2xl font-serifdeck font-medium text-white/95 leading-tight truncate">
              {cliente.nome}
            </h1>
            <p className="text-xs text-white/45 mt-1 truncate">
              {cliente.empresa || '—'}
            </p>
          </div>

          {/* Progresso da jornada */}
          <div className="flex flex-col items-end gap-2 min-w-[180px]">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] tracking-[0.2em] uppercase text-white/40 font-monodeck">
                Encontro
              </span>
              <span className="text-lg font-serifdeck font-medium text-gold-mid">
                {String(encAtual).padStart(2, '0')}
              </span>
              <span className="text-xs text-white/30 font-monodeck">/ 15</span>
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden bg-white/5">
              <div
                className="h-full"
                style={{
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg, rgba(201,168,76,0.4), #C9A84C)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Gold divider sutil + tabs */}
        <div className="h-px mt-4"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.20), transparent)' }} />

        <div className="flex items-center gap-1 mt-3">
          {TABS.map(t => (
            <NavLink
              key={t.key}
              to={`${basePath}/${t.to}`}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors"
              style={({ isActive }) =>
                isActive
                  ? { color: '#C9A84C', borderBottom: '2px solid #C9A84C', marginBottom: '-1px' }
                  : { color: 'rgba(255,255,255,0.4)', borderBottom: '2px solid transparent', marginBottom: '-1px' }
              }
            >
              <t.Icon size={14} />
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Outlet context={{ cliente }} />
      </div>
    </div>
  )
}
