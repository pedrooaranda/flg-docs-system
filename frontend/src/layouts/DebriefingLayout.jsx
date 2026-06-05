import { Suspense } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../contexts/AppContext'
import { useUserScope } from '../hooks/useUserScope'
import { PageSpinner } from '../components/ui/Spinner'
import DebriefingHeader from '../components/Debriefings/DebriefingHeader'

export default function DebriefingLayout() {
  const { session } = useApp()
  const { isLoading, error, canSeeDebriefings } = useUserScope()
  const location = useLocation()

  if (!session) {
    return <Navigate to="/debriefings/login" replace state={{ from: location.pathname }} />
  }

  if (isLoading) return <PageSpinner />

  if (error || !canSeeDebriefings) {
    return <Navigate to="/login" replace
      state={{ toast: { title: 'Acesso restrito', description: 'Esse sistema é do time comercial e diretoria.', variant: 'error' } }} />
  }

  return (
    <div className="min-h-screen flex flex-col transition-colors" style={{ background: 'var(--flg-bg)' }}>
      <DebriefingHeader session={session} />
      <main className="flex-1 overflow-y-auto">
        <Suspense fallback={<PageSpinner />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
