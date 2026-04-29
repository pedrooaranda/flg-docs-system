import { useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Outlet, NavLink } from 'react-router-dom'
import { useApp } from '../../contexts/AppContext'
import { isAdmin as checkAdmin } from '../../lib/utils'
import { DateRangePicker } from '../MetricasParts'
import { IGProfileBadge } from './shared/banners'
import SyncButton from './shared/SyncButton'
import ClienteCombobox from './shared/ClienteCombobox'
import { PLATFORMS } from './shared/constants'

const TABS = [
  { key: 'geral', label: 'Geral' },
  { key: 'posts', label: 'Posts' },
  { key: 'reels', label: 'Reels' },
  { key: 'stories', label: 'Stories' },
]

export default function MetricasLayout({ session }) {
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = session?.user
  const admin = checkAdmin(user)
  const { clientes: allClientes } = useApp()
  const clientes = admin
    ? allClientes
    : allClientes.filter(c => c.consultor_responsavel?.toLowerCase().includes(user?.email?.split('@')[0] || ''))

  const platform = 'instagram'
  const platConfig = PLATFORMS[platform]
  const periodo = parseInt(searchParams.get('dias') || '30', 10)
  const tab = params.tab || 'geral'
  const clienteId = params.clienteId

  // Redirect: sem cliente na URL → escolhe o primeiro
  useEffect(() => {
    if (!clienteId && clientes.length > 0) {
      navigate(`/metricas/${clientes[0].id}/geral`, { replace: true })
    }
  }, [clienteId, clientes, navigate])

  function setCliente(id) {
    const sp = searchParams.toString()
    navigate(`/metricas/${id}/${tab}${sp ? '?' + sp : ''}`)
  }

  function setPeriodo(dias) {
    const sp = new URLSearchParams(searchParams)
    sp.set('dias', String(dias))
    setSearchParams(sp, { replace: true })
  }

  if (!clienteId) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <p className="text-white/50 text-sm">Selecione um cliente.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header: combo + badge IG + sync + filtro período */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <ClienteCombobox
            clientes={clientes}
            value={clienteId}
            onChange={setCliente}
            accent={platConfig.color}
          />
          {platform === 'instagram' && <IGProfileBadge clienteId={clienteId} />}
          {platform === 'instagram' && (
            <SyncButton clienteId={clienteId} onSynced={() => window.location.reload()} accent={platConfig.color} />
          )}
        </div>

        <DateRangePicker
          periodo={periodo}
          onChange={setPeriodo}
          accent={platConfig.color}
        />
      </div>

      {/* Tabs — usa NavLink isActive direto. end=true pra match exato da rota. */}
      <div className="flex items-center gap-1 border-b border-white/10">
        {TABS.map(t => {
          const sp = searchParams.toString()
          const to = `/metricas/${clienteId}/${t.key}${sp ? '?' + sp : ''}`
          // NavLink isActive funciona via path matching real do React Router.
          // Aqui forço comparação manual também porque a rota /metricas/:clienteId
          // (sem /tab) também aponta pra Geral, e NavLink end=true não pegaria isso.
          const isActive = t.key === tab
          return (
            <NavLink
              key={t.key}
              to={to}
              end={true}
              className="px-4 py-2.5 text-xs font-semibold transition-colors"
              style={isActive
                ? {
                    color: platConfig.color,
                    borderBottom: `2px solid ${platConfig.color}`,
                    marginBottom: '-1px',
                  }
                : {
                    color: 'rgba(255,255,255,0.4)',
                    borderBottom: '2px solid transparent',
                    marginBottom: '-1px',
                  }
              }
            >
              {t.label}
            </NavLink>
          )
        })}
      </div>

      {/* Conteúdo da aba (Outlet renderiza Geral/Posts/Reels/Stories) */}
      <Outlet context={{ clienteId, periodo, platform, platConfig }} />
    </div>
  )
}
