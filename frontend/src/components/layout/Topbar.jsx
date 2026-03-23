import { Bell, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../ui/Avatar'
import * as Tooltip from '@radix-ui/react-tooltip'
import { getUserDisplayName } from '../../lib/utils'

function TooltipBtn({ label, icon, onClick }) {
  return (
    <Tooltip.Provider delayDuration={400}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={onClick}
            className="w-8 h-8 rounded-md flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all cursor-pointer active:scale-95"
          >
            {icon}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="bg-[#1A1A1A] border border-white/10 text-white/80 text-xs px-2 py-1 rounded shadow-xl" sideOffset={5}>
            {label}
            <Tooltip.Arrow className="fill-[#1A1A1A]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

export default function Topbar({ user, isAdmin, title, subtitle }) {
  const navigate = useNavigate()
  const userName = getUserDisplayName(user)

  const now = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const displayTitle = title || `Olá, ${userName.split(' ')[0]}`
  const displaySubtitle = subtitle || now

  return (
    <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 flex-shrink-0 bg-[#080808]">
      <div>
        <h1 className="text-sm font-semibold text-white/90">{displayTitle}</h1>
        <p className="text-xs text-white/30 capitalize">{displaySubtitle}</p>
      </div>

      <div className="flex items-center gap-1">
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
