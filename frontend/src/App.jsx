import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { ToastProvider } from './lib/toast'
import { AppProvider } from './contexts/AppContext'
import { ThemeProvider } from './contexts/ThemeContext'
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
const Clientes         = lazy(() => import('./components/Clientes'))
const Materiais        = lazy(() => import('./components/Materiais'))
const Copywriter       = lazy(() => import('./components/Copywriter'))
const IntelecFLG       = lazy(() => import('./components/admin/IntelecFLG'))
const AgentesConfig    = lazy(() => import('./components/admin/AgentesConfig'))
const Metricas         = lazy(() => import('./components/Metricas'))
const LegalPage        = lazy(() => import('./components/LegalPage'))

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
    <ThemeProvider>
    <AppProvider session={session}>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />

          {/* Páginas legais públicas (sem auth) — exigidas pela Meta para Instagram OAuth */}
          <Route path="/legal/:page" element={
            <Suspense fallback={<PageSpinner />}>
              <LegalPage />
            </Suspense>
          } />

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
              <Clientes session={session} />
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

          <Route path="/metricas" element={
            <AuthGuard session={session} title="Métricas Instagram">
              <Metricas session={session} />
            </AuthGuard>
          } />

          <Route path="/materiais" element={
            <AuthGuard session={session} title="Materiais">
              <Materiais />
            </AuthGuard>
          } />

          <Route path="/copywriter" element={
            <AuthGuard session={session} title="Copywriter FLG">
              <Copywriter />
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
    </AppProvider>
    </ThemeProvider>
  )
}
