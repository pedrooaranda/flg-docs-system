import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { isAdmin as checkAdmin } from '../../lib/utils'

export default function Layout({ session, children, title, subtitle }) {
  const user = session?.user
  const isAdmin = checkAdmin(user)

  return (
    <div className="flex h-screen overflow-hidden transition-colors" style={{ background: 'var(--flg-bg)' }}>
      <Sidebar user={user} isAdmin={isAdmin} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar user={user} isAdmin={isAdmin} title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
