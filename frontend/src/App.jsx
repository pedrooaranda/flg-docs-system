import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useParams } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { ToastProvider } from './lib/toast'
import { AppProvider } from './contexts/AppContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Login from './components/Login'
import PasswordChangeRequired from './components/auth/PasswordChangeRequired'
import { PageSpinner } from './components/ui/Spinner'
import { needsPasswordChange } from './lib/utils'

import MainLayout from './layouts/MainLayout'
import DebriefingLayout from './layouts/DebriefingLayout'

// Lazy-loaded routes
const Dashboard        = lazy(() => import('./components/Dashboard'))
const PerfilCliente    = lazy(() => import('./components/PerfilCliente'))
const NovoCliente      = lazy(() => import('./components/NovoCliente'))
const PreparacaoEncontro = lazy(() => import('./components/PreparacaoEncontro'))
const AdminPanel       = lazy(() => import('./components/AdminPanel'))
const ConhecimentoBase = lazy(() => import('./components/ConhecimentoBase'))
const Clientes         = lazy(() => import('./components/Clientes'))
const MateriaisHome     = lazy(() => import('./components/Materiais'))
const ClienteArea       = lazy(() => import('./components/Materiais/ClienteArea'))
const ClienteDiarios    = lazy(() => import('./components/Materiais/ClienteArea/Diarios'))
const ClienteReunioes   = lazy(() => import('./components/Materiais/ClienteArea/Reunioes'))
const EditorReuniao     = lazy(() => import('./components/Materiais/Reuniao'))
const Copywriter       = lazy(() => import('./components/Copywriter'))
const Colaboradores    = lazy(() => import('./components/Colaboradores'))
const IntelecFLG       = lazy(() => import('./components/admin/IntelecFLG'))
const AgentesConfig    = lazy(() => import('./components/admin/AgentesConfig'))
const Metricas         = lazy(() => import('./components/Metricas'))
const MetricasGeral    = lazy(() => import('./components/Metricas/MetricasGeral'))
const MetricasPosts    = lazy(() => import('./components/Metricas/MetricasPosts'))
const MetricasReels    = lazy(() => import('./components/Metricas/MetricasReels'))
const MetricasStories  = lazy(() => import('./components/Metricas/MetricasStories'))
const MetricasYTVideos  = lazy(() => import('./components/Metricas/MetricasYTVideos'))
const MetricasYTShorts  = lazy(() => import('./components/Metricas/MetricasYTShorts'))
const MetricasLIPosts   = lazy(() => import('./components/Metricas/MetricasLIPosts'))
const MetricasLIArtigos = lazy(() => import('./components/Metricas/MetricasLIArtigos'))
const MetricasTTVideos  = lazy(() => import('./components/Metricas/MetricasTTVideos'))
const Ranking          = lazy(() => import('./components/Ranking'))
const LegalPage        = lazy(() => import('./components/LegalPage'))
const ConectarInstagram = lazy(() => import('./components/ConectarInstagram'))
const TutoriaisHub       = lazy(() => import('./components/Tutoriais'))
const TutorialConectarIG = lazy(() => import('./components/Tutoriais/ConectarInstagramCliente'))

// Sub-projeto 2 Debriefings
const DebriefingLogin    = lazy(() => import('./components/Debriefings/DebriefingLogin'))
const DebriefingsHome    = lazy(() => import('./components/Debriefings/DebriefingsHome'))
const ClienteHub         = lazy(() => import('./components/Debriefings/ClienteHub'))
const DebriefingViewer   = lazy(() => import('./components/Debriefings/Viewer'))

// Sub-projeto 3 Briefing do Consultor
const BriefingConsultor   = lazy(() => import('./components/BriefingConsultor'))

// Resolve qual componente renderizar baseado em ?plataforma= da URL.
// Mesma rota (ex: /metricas/:id/posts) serve Instagram E LinkedIn — distingue por query param.
function RouteByPlatform({ ig, li, yt, tt, fallback }) {
  const [params] = useSearchParams()
  const platform = params.get('plataforma') || 'instagram'
  const map = { instagram: ig, linkedin: li, youtube: yt, tiktok: tt }
  const Comp = map[platform] || fallback || ig
  return Comp ? <Comp /> : null
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return <PageSpinner />

  // Gate: usuários com senha temporária precisam trocar antes de acessar qualquer coisa.
  // Backend seta needs_password_change=true ao auto-criar conta via POST /colaboradores.
  // Exceções: páginas legais públicas + login + onboarding Instagram não passam pelo gate
  // (são tratadas como rotas públicas no BrowserRouter abaixo). Como needsPasswordChange só
  // é true quando há session, e essas rotas públicas não exigem session, não conflitam.
  if (session && needsPasswordChange(session.user)) {
    return (
      <ThemeProvider>
      <ToastProvider>
        <PasswordChangeRequired session={session} />
      </ToastProvider>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
    <AppProvider session={session}>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Públicas */}
          <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/debriefings/login" element={
            <Suspense fallback={<PageSpinner />}>
              <DebriefingLogin />
            </Suspense>
          } />

          {/* Páginas legais públicas (sem auth) — exigidas pela Meta para Instagram OAuth */}
          <Route path="/legal/:page" element={
            <Suspense fallback={<PageSpinner />}>
              <LegalPage />
            </Suspense>
          } />

          {/* Onboarding público — cliente conecta Instagram via link assinado, sem login Jornada */}
          <Route path="/conectar-instagram/:clienteId" element={
            <Suspense fallback={<PageSpinner />}>
              <ConectarInstagram />
            </Suspense>
          } />

          {/* Sistema Principal — gate canSeePrincipal via MainLayout */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<Dashboard session={session} />} />
            <Route path="/clientes" element={<Clientes session={session} />} />
            <Route path="/clientes/novo" element={<NovoCliente />} />
            <Route path="/clientes/:clientId" element={<PerfilCliente />} />
            <Route path="/clientes/:clientId/encontro/:encontroNum" element={<PreparacaoEncontro />} />
            <Route path="/clientes/:id/briefing-consultor" element={<BriefingConsultor />} />

            {/* Métricas — sub-rotas por aba (Geral / Posts / Reels / Stories) */}
            <Route path="/metricas" element={<Metricas session={session} />}>
              <Route index element={<MetricasGeral />} />
              <Route path=":clienteId" element={<MetricasGeral />} />
              <Route path=":clienteId/geral" element={<MetricasGeral />} />
              <Route path=":clienteId/posts" element={<RouteByPlatform ig={MetricasPosts} li={MetricasLIPosts} />} />
              <Route path=":clienteId/reels" element={<MetricasReels />} />
              <Route path=":clienteId/stories" element={<MetricasStories />} />
              <Route path=":clienteId/videos" element={<RouteByPlatform yt={MetricasYTVideos} tt={MetricasTTVideos} fallback={MetricasYTVideos} />} />
              <Route path=":clienteId/shorts" element={<MetricasYTShorts />} />
              <Route path=":clienteId/artigos" element={<MetricasLIArtigos />} />
            </Route>

            <Route path="/ranking" element={<Ranking />} />

            {/* Materiais: cliente como hub central (escolha de cliente → área do cliente) */}
            <Route path="/materiais" element={<MateriaisHome session={session} />} />

            {/* Redirects de rotas antigas (compatibilidade com bookmarks anteriores) */}
            <Route path="/materiais/diarios" element={<Navigate to="/materiais" replace />} />
            <Route path="/materiais/reunioes" element={<Navigate to="/materiais" replace />} />
            <Route path="/materiais/reunioes/:cid/:n" element={<Navigate to="/materiais" replace />} />

            <Route path="/materiais/cliente/:cid" element={<ClienteArea />}>
              <Route index element={<Navigate to="diarios" replace />} />
              <Route path="diarios" element={<ClienteDiarios />} />
              <Route path="reunioes" element={<ClienteReunioes />} />
            </Route>

            {/* Editor (tela inteira, fora do layout normal) — mantido dentro do MainLayout pra herdar gate */}
            <Route path="/materiais/cliente/:cid/reunioes/:n" element={<EditorReuniao session={session} />} />

            <Route path="/copywriter" element={<Copywriter />} />
            <Route path="/colaboradores" element={<Colaboradores session={session} />} />

            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/admin/conhecimento" element={<ConhecimentoBase />} />
            <Route path="/admin/intelecto" element={<IntelecFLG />} />
            <Route path="/admin/agentes" element={<AgentesConfig />} />

            <Route path="/tutoriais" element={<TutoriaisHub />} />
            <Route path="/tutoriais/conectar-instagram-cliente" element={<TutorialConectarIG />} />

            {/* Redirects das URLs antigas /clientes/:id/debriefings → /debriefings/cliente/:id */}
            <Route path="/clientes/:clientId/debriefings" element={<RedirectClienteDebriefings />} />
            <Route path="/clientes/:clientId/debriefings/:debriefingId" element={<RedirectClienteDebriefings withDebriefing />} />
          </Route>

          {/* Sistema Debriefing — gate canSeeDebriefings via DebriefingLayout */}
          <Route element={<DebriefingLayout />}>
            <Route path="/debriefings" element={<DebriefingsHome />} />
            <Route path="/debriefings/cliente/:id" element={<ClienteHub />} />
            <Route path="/debriefings/cliente/:id/:debriefingId" element={<DebriefingViewer />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
    </AppProvider>
    </ThemeProvider>
  )
}

// Redirect helper: bookmark antigo /clientes/:id/debriefings[/:debriefingId] → /debriefings/cliente/:id[/:debriefingId]
function RedirectClienteDebriefings({ withDebriefing = false }) {
  const { clientId, debriefingId } = useParams()
  const dest = withDebriefing && debriefingId
    ? `/debriefings/cliente/${clientId}/${debriefingId}`
    : `/debriefings/cliente/${clientId}`
  return <Navigate to={dest} replace />
}
