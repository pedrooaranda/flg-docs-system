import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function Layout({ session, children, title, subtitle }) {
  const user = session?.user
  const isAdmin = user?.email?.includes('pedro') || user?.user_metadata?.role === 'admin'

  return (
    <div className="flex h-screen bg-[#080808] overflow-hidden">
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
