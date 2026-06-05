import { Suspense } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../contexts/AppContext'
import { useUserScope } from '../hooks/useUserScope'
import Layout from '../components/layout/Layout'
import { PageSpinner } from '../components/ui/Spinner'

export default function MainLayout() {
  const { session } = useApp()
  const { isLoading, error, canSeePrincipal } = useUserScope()
  const location = useLocation()

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (isLoading) return <PageSpinner />

  if (error || !canSeePrincipal) {
    return <Navigate to="/debriefings/login" replace
      state={{ toast: { title: 'Acesso restrito', description: 'Sua conta é do sistema de Debriefings.', variant: 'error' } }} />
  }

  return (
    <Layout session={session}>
      <Suspense fallback={<PageSpinner />}>
        <Outlet />
      </Suspense>
    </Layout>
  )
}
