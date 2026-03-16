import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { ToastProvider } from './lib/toast'
import Layout from './components/layout/Layout'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import PerfilCliente from './components/PerfilCliente'
import NovoCliente from './components/NovoCliente'
import PreparacaoEncontro from './components/PreparacaoEncontro'
import AdminPanel from './components/AdminPanel'
import ConhecimentoBase from './components/ConhecimentoBase'
import { PageSpinner } from './components/ui/Spinner'

function AuthGuard({ session, children, title, subtitle }) {
  if (!session) return <Navigate to="/login" replace />
  return (
    <Layout session={session} title={title} subtitle={subtitle}>
      {children}
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
          <Route path="/" element={<AuthGuard session={session}><Dashboard session={session} /></AuthGuard>} />
          <Route path="/clientes/novo" element={<AuthGuard session={session} title="Novo Cliente"><NovoCliente /></AuthGuard>} />
          <Route path="/clientes/:clientId" element={<AuthGuard session={session}><PerfilCliente /></AuthGuard>} />
          <Route path="/clientes/:clientId/encontro/:encontroNum" element={
            <Layout session={session}>
              <PreparacaoEncontro />
            </Layout>
          } />
          <Route path="/admin" element={<AuthGuard session={session} title="Admin"><AdminPanel /></AuthGuard>} />
          <Route path="/admin/conhecimento" element={<AuthGuard session={session} title="Base de Conhecimento"><ConhecimentoBase /></AuthGuard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
