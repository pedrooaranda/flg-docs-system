import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { ToastProvider } from './lib/toast'
import Layout from './components/layout/Layout'
import Login from './components/Login'
import { PageSpinner } from './components/ui/Spinner'

// Lazy-loaded routes
const Dashboard        = lazy(() => import('./components/Dashboard'))
const PerfilCliente    = lazy(() => import('./components/PerfilCliente'))
const NovoCliente      = lazy(() => import('./components/NovoCliente'))
const PreparacaoEncontro = lazy(() => import('./components/PreparacaoEncontro'))
const AdminPanel       = lazy(() => import('./components/AdminPanel'))
const ConhecimentoBase = lazy(() => import('./components/ConhecimentoBase'))
const Materiais        = lazy(() => import('./components/Materiais'))
const Copywriter       = lazy(() => import('./components/Copywriter'))
const IntelecFLG       = lazy(() => import('./components/admin/IntelecFLG'))
const AgentesConfig    = lazy(() => import('./components/admin/AgentesConfig'))

function AuthGuard({ session, children, title, subtitle }) {
  if (!session) return <Navigate to="/login" replace />
  return (
    <Layout session={session} title={title} subtitle={subtitle}>
      <Suspense fallback={<PageSpinner />}>
        {children}
      </Suspense>
    </Layout>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return <PageSpinner />

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />

          <Route path="/" element={
            <AuthGuard session={session} title="Dashboard">
              <Dashboard session={session} />
            </AuthGuard>
          } />

          <Route path="/clientes/novo" element={
            <AuthGuard session={session} title="Novo Cliente">
              <NovoCliente />
            </AuthGuard>
          } />

          <Route path="/clientes" element={
            <AuthGuard session={session} title="Clientes">
              <Dashboard session={session} />
            </AuthGuard>
          } />

          <Route path="/clientes/:clientId" element={
            <AuthGuard session={session}>
              <PerfilCliente />
            </AuthGuard>
          } />

          <Route path="/clientes/:clientId/encontro/:encontroNum" element={
            session ? (
              <Layout session={session}>
                <Suspense fallback={<PageSpinner />}>
                  <PreparacaoEncontro />
                </Suspense>
              </Layout>
            ) : <Navigate to="/login" replace />
          } />

          <Route path="/materiais" element={
            <AuthGuard session={session} title="Materiais">
              <Materiais session={session} />
            </AuthGuard>
          } />

          <Route path="/copywriter" element={
            <AuthGuard session={session} title="Copywriter FLG">
              <Copywriter session={session} />
            </AuthGuard>
          } />

          <Route path="/admin" element={
            <AuthGuard session={session} title="Configurações">
              <AdminPanel />
            </AuthGuard>
          } />

          <Route path="/admin/conhecimento" element={
            <AuthGuard session={session} title="Base de Conhecimento">
              <ConhecimentoBase />
            </AuthGuard>
          } />

          <Route path="/admin/intelecto" element={
            <AuthGuard session={session} title="Intelecto FLG">
              <IntelecFLG />
            </AuthGuard>
          } />

          <Route path="/admin/agentes" element={
            <AuthGuard session={session} title="Agentes FLG">
              <AgentesConfig />
            </AuthGuard>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
