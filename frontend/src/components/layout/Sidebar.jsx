import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Users, FileText, PenTool,
  Brain, Bot, Settings, LogOut,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../ui/Avatar'
import { cn, getUserDisplayName } from '../../lib/utils'

// matchPrefix: true → usa startsWith (para rotas com sub-rotas como /clientes/:id)
// matchPrefix: false (default) → match exato
const consultantNav = [
  { icon: LayoutDashboard, label: 'Dashboard',    path: '/' },
  { icon: Users,          label: 'Meus Clientes', path: '/clientes', matchPrefix: true },
  { icon: FileText,       label: 'Materiais',      path: '/materiais' },
  { icon: PenTool,        label: 'Copywriter FLG', path: '/copywriter' },
]

const adminNav = [
  { icon: LayoutDashboard, label: 'Dashboard',  path: '/' },
  { icon: Users,          label: 'Clientes',     path: '/clientes', matchPrefix: true },
  { icon: FileText,       label: 'Materiais',    path: '/materiais' },
  { icon: PenTool,        label: 'Copywriter FLG', path: '/copywriter' },
]

const adminOnlyNav = [
  { icon: Brain,    label: 'Intelecto FLG', path: '/admin/intelecto' },
  { icon: Bot,      label: 'Agentes',        path: '/admin/agentes' },
  { icon: Settings, label: 'Configurações',  path: '/admin' },
]

function itemIsActive(item, pathname) {
  if (item.path === '/') return pathname === '/'
  if (item.matchPrefix) return pathname.startsWith(item.path)
  return pathname === item.path
}

function NavItem({ item, badge, collapsed, onClick }) {
  const { pathname } = useLocation()
  const active = itemIsActive(item, pathname)

  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150',
        active ? 'text-gold-mid' : 'text-white/40 hover:text-white/80 hover:bg-white/5',
        collapsed && 'justify-center'
      )}
      style={active ? {
        background: 'rgba(201, 168, 76, 0.1)',
        borderLeft: '3px solid #C9A84C',
        paddingLeft: collapsed ? undefined : '10px',
      } : {}}
    >
      <item.icon size={16} className="flex-shrink-0" />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="whitespace-nowrap font-medium flex-1 text-left"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
      {!collapsed && badge && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wide flex-shrink-0"
          style={{
            background: 'rgba(201, 168, 76, 0.15)',
            border: '1px solid rgba(201, 168, 76, 0.3)',
            color: '#C9A84C',
          }}
        >
          {badge}
        </motion.span>
      )}
    </button>
  )
}

export default function Sidebar({ user, isAdmin }) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  )
  const navigate = useNavigate()
  const userName = getUserDisplayName(user)
  const roleLabel = isAdmin ? 'Admin' : 'Consultor'
  const mainItems = isAdmin ? adminNav : consultantNav

  function handleToggle() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar_collapsed', String(next))
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 220 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="relative flex flex-col h-screen flex-shrink-0 overflow-hidden"
      style={{ background: '#0a0a0a', borderRight: '1px solid rgba(201, 168, 76, 0.12)' }}
    >
      {/* Logo */}
      <div
        className={cn('flex items-center h-16 px-4 flex-shrink-0', collapsed ? 'justify-center' : 'gap-3')}
        style={{ borderBottom: '1px solid rgba(201, 168, 76, 0.12)' }}
      >
        <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 gold-gradient font-display font-bold text-xs text-[#080808]">
          FLG
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="font-display text-sm font-semibold gold-text whitespace-nowrap"
            >
              Jornada System
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-hidden">
        {mainItems.map(item => (
          <NavItem
            key={item.path}
            item={item}
            collapsed={collapsed}
            onClick={() => navigate(item.path)}
          />
        ))}

        {/* Admin section */}
        {isAdmin && (
          <>
            <div className={cn('pt-4 pb-2', collapsed ? 'px-0' : 'px-1')}>
              <AnimatePresence>
                {!collapsed ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-[9px] tracking-widest uppercase font-semibold"
                    style={{ color: 'rgba(201, 168, 76, 0.45)' }}
                  >
                    Administração
                  </motion.p>
                ) : (
                  <div className="h-px mx-1" style={{ background: 'rgba(201, 168, 76, 0.15)' }} />
                )}
              </AnimatePresence>
            </div>
            {adminOnlyNav.map(item => (
              <NavItem
                key={item.path}
                item={item}
                badge="Admin"
                collapsed={collapsed}
                onClick={() => navigate(item.path)}
              />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div
        className={cn('p-3 flex-shrink-0', collapsed && 'items-center')}
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className={cn('flex items-center gap-2 mb-2', collapsed && 'justify-center')}>
          <Avatar name={userName} size="sm" />
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-1 min-w-0"
              >
                <p className="text-xs font-semibold text-white/80 truncate">{userName}</p>
                <p className="text-[10px] text-white/30">{roleLabel}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sair' : undefined}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-2 rounded text-xs text-white/30 cursor-pointer',
            'hover:text-red-400 hover:bg-red-500/5 transition-all',
            collapsed && 'justify-center'
          )}
        >
          <LogOut size={14} className="flex-shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                Sair
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Collapse toggle — borda direita, centralizado verticalmente */}
      <button
        onClick={handleToggle}
        title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-white/30 transition-all z-10 cursor-pointer"
        style={{ background: '#1A1A1A' }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </motion.aside>
  )
}
