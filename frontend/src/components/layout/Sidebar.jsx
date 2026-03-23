import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, Users, Settings, BookOpen, LogOut, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../ui/Avatar'
import { cn, getUserDisplayName } from '../../lib/utils'

const navItems = [
  { icon: Home,     label: 'Dashboard',       path: '/',              adminOnly: false },
  { icon: Users,    label: 'Clientes',         path: '/clientes',      adminOnly: false },
  { icon: BookOpen, label: 'Conhecimento',     path: '/admin/conhecimento', adminOnly: true },
  { icon: Settings, label: 'Admin',            path: '/admin',         adminOnly: true },
]

export default function Sidebar({ user, isAdmin }) {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const items = navItems.filter(i => !i.adminOnly || isAdmin)
  const userName = getUserDisplayName(user)
  const roleLabel = isAdmin ? 'Admin' : 'Consultor'

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 220 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="relative flex flex-col h-screen bg-[#0A0A0A] border-r border-white/5 flex-shrink-0 overflow-hidden"
    >
      {/* Logo */}
      <div className={cn('flex items-center h-16 border-b border-white/5 px-4 flex-shrink-0', collapsed ? 'justify-center' : 'gap-3')}>
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

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-hidden">
        {items.map(item => {
          const active = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path))
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : undefined}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150',
                active
                  ? 'bg-gold-mid/15 text-gold-mid border border-gold-mid/20'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/5',
                collapsed && 'justify-center'
              )}
            >
              <item.icon size={16} className="flex-shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="whitespace-nowrap font-medium"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )
        })}
      </nav>

      {/* Footer: user + logout */}
      <div className={cn('border-t border-white/5 p-3 flex-shrink-0', collapsed ? 'items-center' : '')}>
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
          className={cn('w-full flex items-center gap-2 px-2 py-2 rounded text-xs text-white/30 hover:text-red-400 hover:bg-red-500/5 transition-all', collapsed && 'justify-center')}
        >
          <LogOut size={14} className="flex-shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                Sair
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Toggle button */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-[#1A1A1A] border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </motion.aside>
  )
}
