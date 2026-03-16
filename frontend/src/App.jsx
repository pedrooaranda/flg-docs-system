import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import PerfilCliente from './components/PerfilCliente'
import NovoCliente from './components/NovoCliente'
import PreparacaoEncontro from './components/PreparacaoEncontro'
import AdminPanel from './components/AdminPanel'
import ConhecimentoBase from './components/ConhecimentoBase'

function AuthGuard({ session, children }) {
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-gold-mid border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<AuthGuard session={session}><Dashboard /></AuthGuard>} />
        <Route path="/clientes/novo" element={<AuthGuard session={session}><NovoCliente /></AuthGuard>} />
        <Route path="/clientes/:clientId" element={<AuthGuard session={session}><PerfilCliente /></AuthGuard>} />
        <Route path="/clientes/:clientId/encontro/:encontroNum" element={<AuthGuard session={session}><PreparacaoEncontro /></AuthGuard>} />
        <Route path="/admin" element={<AuthGuard session={session}><AdminPanel /></AuthGuard>} />
        <Route path="/admin/conhecimento" element={<AuthGuard session={session}><ConhecimentoBase /></AuthGuard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
