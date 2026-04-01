import { Bell, Settings, Sun, Moon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../ui/Avatar'
import * as Tooltip from '@radix-ui/react-tooltip'
import { getUserDisplayName } from '../../lib/utils'
import { useTheme } from '../../contexts/ThemeContext'

function TooltipBtn({ label, icon, onClick }) {
  return (
    <Tooltip.Provider delayDuration={400}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={onClick}
            className="w-8 h-8 rounded-md flex items-center justify-center transition-all cursor-pointer active:scale-95"
            style={{ color: 'var(--flg-text-muted)' }}
          >
            {icon}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="text-xs px-2 py-1 rounded shadow-xl" style={{ background: 'var(--flg-tooltip-bg)', border: '1px solid var(--flg-border)', color: 'var(--flg-text-secondary)' }} sideOffset={5}>
            {label}
            <Tooltip.Arrow style={{ fill: 'var(--flg-tooltip-bg)' }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

export default function Topbar({ user, isAdmin, title, subtitle }) {
  const navigate = useNavigate()
  const userName = getUserDisplayName(user)
  const { isDark, toggle } = useTheme()

  const now = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const displayTitle = title || `Olá, ${userName.split(' ')[0]}`
  const displaySubtitle = subtitle || now

  return (
    <header className="h-14 border-b flex items-center justify-between px-6 flex-shrink-0 transition-colors" style={{ background: 'var(--flg-bg)', borderColor: 'var(--flg-border)' }}>
      <div>
        <h1 className="text-sm font-semibold" style={{ color: 'var(--flg-text)' }}>{displayTitle}</h1>
        <p className="text-xs capitalize" style={{ color: 'var(--flg-text-muted)' }}>{displaySubtitle}</p>
      </div>

      <div className="flex items-center gap-1">
        <TooltipBtn
          label={isDark ? 'Tema claro' : 'Tema escuro'}
          icon={isDark ? <Sun size={15} /> : <Moon size={15} />}
          onClick={toggle}
        />
        <TooltipBtn label="Notificações" icon={<Bell size={15} />} />
        {isAdmin && (
          <TooltipBtn label="Configurações" icon={<Settings size={15} />} onClick={() => navigate('/admin')} />
        )}
        <div className="w-px h-5 bg-white/8 mx-1" />
        <Avatar name={userName} size="sm" className="cursor-default" />
      </div>
    </header>
  )
}
