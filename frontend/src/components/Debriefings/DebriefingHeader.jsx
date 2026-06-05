import { LogOut } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getUserDisplayName } from '../../lib/utils'

export default function DebriefingHeader({ session }) {
  const user = session?.user
  const name = getUserDisplayName(user) || user?.email || 'Comercial'

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <header
      className="flex items-center justify-between px-6 py-3 border-b transition-colors"
      style={{ background: 'var(--flg-bg-raised)', borderColor: 'var(--flg-border)' }}
    >
      <div className="flex items-center gap-3">
        <img src="/logo-flg.png" alt="FLG" style={{ height: 28, width: 'auto' }} />
        <span className="text-[10px] tracking-widest uppercase text-[#C9A84C] font-bold">
          FLG Comercial
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-white/55">{name}</span>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/80 transition-colors"
          title="Sair"
        >
          <LogOut size={14} />
          Sair
        </button>
      </div>
    </header>
  )
}
