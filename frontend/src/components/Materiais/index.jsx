/**
 * Materiais — orquestrador das sub-rotas Diários / Reuniões.
 *
 * Tabs como NavLinks (rotas reais, URL bookmarkable). Outlet renderiza filho.
 * Espelha o padrão de Metricas/MetricasLayout.jsx.
 */

import { Outlet, NavLink, Navigate, useLocation } from 'react-router-dom'
import { FileText, Presentation } from 'lucide-react'

const TABS = [
  { key: 'diarios',   label: 'Diários',  to: '/materiais/diarios',  Icon: FileText },
  { key: 'reunioes',  label: 'Reuniões', to: '/materiais/reunioes', Icon: Presentation },
]

export default function MateriaisLayout() {
  const { pathname } = useLocation()

  // /materiais sem sub-rota → redirect pra /materiais/diarios
  if (pathname === '/materiais' || pathname === '/materiais/') {
    return <Navigate to="/materiais/diarios" replace />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-6 pt-4 border-b border-white/5 flex-shrink-0">
        {TABS.map(t => (
          <NavLink
            key={t.key}
            to={t.to}
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

      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
