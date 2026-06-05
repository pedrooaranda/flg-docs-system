# Debriefings Sub-projeto 2 — Tela de Login, Layouts e Migração da UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a porta de entrada visual do FLG Comercial: tela `/debriefings/login` com branding próprio, layouts (`MainLayout` + `DebriefingLayout`) fazendo gating de rota no frontend, e migração do hub de Debriefings da aba do `PerfilCliente` pra rota dedicada `/debriefings/cliente/:id`.

**Architecture:** Frontend-only — backend já está gated do sub-projeto 1 em produção (defesa em profundidade). Dois layouts React Router como wrappers (`<Outlet />`) lendo `useUserScope` pra decidir renderizar ou redirecionar. Hub de Debriefings movido de `Debriefings/index.jsx` pra `Debriefings/ClienteHub.jsx` com mudança mínima (param `clientId` → `id`). Backend só ganha 1 endpoint novo `/clientes/list-for-debriefings` pra comercial poder listar clientes na home.

**Tech Stack:** React 18 + Vite + Tailwind + React Router v6 + Supabase Auth + esbuild (validação local). Backend FastAPI + supabase-py + pytest. Repo direto em `main`. Deploy auto via GH Actions.

---

## Mapa de arquivos

**Criar (backend):**
- `backend/tests/test_clientes_list_for_debriefings.py` — tests do endpoint novo
- `backend/main.py:N` — adiciona handler `list_clientes_for_debriefings`

**Criar (frontend):**
- `frontend/src/layouts/MainLayout.jsx` — wrapper das rotas do sistema principal
- `frontend/src/layouts/DebriefingLayout.jsx` — wrapper das rotas do sistema Debriefing
- `frontend/src/components/Debriefings/DebriefingHeader.jsx` — header mínimo (logo + nome + Sair)
- `frontend/src/components/Debriefings/DebriefingLogin.jsx` — tela `/debriefings/login`
- `frontend/src/components/Debriefings/DebriefingsHome.jsx` — home `/debriefings`

**Renomear (frontend):**
- `frontend/src/components/Debriefings/index.jsx` → `frontend/src/components/Debriefings/ClienteHub.jsx`

**Modificar (frontend):**
- `frontend/src/components/Login.jsx` — lê `location.state.toast` ao montar
- `frontend/src/components/Debriefings/Viewer.jsx` — atualiza navegação interna pra `/debriefings/cliente/:id`
- `frontend/src/components/PerfilCliente.jsx` — remove aba "Debriefings", adiciona botão "Abrir Debriefings deste cliente"
- `frontend/src/App.jsx` — reorganiza rotas em `<Route element={<MainLayout />}>` e `<Route element={<DebriefingLayout />}>`; remove `AuthGuard`; adiciona rotas `/debriefings/*`

---

## Princípio: dois sistemas conversam sem conflitar

Owner e Diretor **veem ambos** (`canSeePrincipal` E `canSeeDebriefings` true). Pra eles, navegar entre os sistemas é só URL — o `MainLayout` aceita, o `DebriefingLayout` aceita. O botão "Abrir Debriefings" no perfil do cliente é o atalho. O Sidebar atual continua só listando rotas do sistema principal (sub-projeto 4 decide se adiciona um item Debriefings na sidebar; aqui fica de fora pra não inflar escopo).

Consultor e Comercial **veem só um** — qualquer URL do sistema errado redireciona com toast.

Nenhuma rota fica em ambos os layouts. Cada rota vive sob exatamente um gate.

---

## Task 1: Backend — endpoint `/clientes/list-for-debriefings`

**Files:**
- Create: `backend/tests/test_clientes_list_for_debriefings.py`
- Modify: `backend/main.py` (adicionar handler após o handler `list_clientes_basic`)

**Contexto:** `/clientes-basic` hoje está gated por `require_principal` (bloqueia comercial). Comercial precisa de uma listagem de clientes ativos pra renderizar a home `/debriefings`. Endpoint novo com `require_debriefings`. Mesmo retorno (id, nome, empresa), mesmo filtro `archived_at IS NULL`.

- [ ] **Step 1: Escrever tests**

Criar `backend/tests/test_clientes_list_for_debriefings.py`:

```python
"""Tests de gating do endpoint /clientes/list-for-debriefings.

Endpoint do sub-projeto 2 (Debriefings) — listagem enxuta pra home
/debriefings.

Regra:
  - Comercial passa (canSeeDebriefings=True)
  - Diretor passa
  - Owner passa
  - Consultor recebe 403 (canSeeDebriefings=False)
"""
import os
import sys
import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

from lib.auth_scope import UserScope


def _make_scope(categoria, role):
    """Helper: monta UserScope com flags computadas pelo _compute_flags real."""
    from lib.auth_scope import _compute_flags
    p, d, da = _compute_flags(categoria, role)
    return UserScope(
        user_id="u-1",
        email="x@grupoguglielmi.com",
        role=role,
        consultor_id=None,
        consultor_nome=None,
        categoria=categoria,
        can_see_all=True,
        can_see_principal=p,
        can_see_debriefings=d,
        can_see_debriefings_admin=da,
    )


@pytest.mark.asyncio
async def test_consultor_recebe_403():
    from main import list_clientes_for_debriefings
    scope = _make_scope("consultor", "member")
    with pytest.raises(HTTPException) as exc:
        await list_clientes_for_debriefings(scope=scope)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_comercial_passa(mock_supabase):
    from main import list_clientes_for_debriefings
    scope = _make_scope("comercial", "member")
    fake_data = [{"id": "c1", "nome": "Cliente A", "empresa": "Empresa A"}]
    mock_supabase.table.return_value.select.return_value.is_.return_value.order.return_value.execute.return_value = MagicMock(data=fake_data)
    result = await list_clientes_for_debriefings(scope=scope)
    assert result == fake_data


@pytest.mark.asyncio
async def test_diretor_passa(mock_supabase):
    from main import list_clientes_for_debriefings
    scope = _make_scope("diretor", "member")
    fake_data = [{"id": "c1", "nome": "X", "empresa": "Y"}]
    mock_supabase.table.return_value.select.return_value.is_.return_value.order.return_value.execute.return_value = MagicMock(data=fake_data)
    result = await list_clientes_for_debriefings(scope=scope)
    assert result == fake_data
```

- [ ] **Step 2: Rodar tests pra verificar que falham**

```bash
cd backend && python3 -m pytest tests/test_clientes_list_for_debriefings.py -v 2>&1 | tail -10
```

Expected: 3 erros tipo `ImportError: cannot import name 'list_clientes_for_debriefings' from 'main'`.

- [ ] **Step 3: Implementar endpoint**

Em `backend/main.py`, localizar o handler `list_clientes_basic` (procurar por `@app.get("/clientes-basic")`). Adicionar **logo após o `return result.data` desse handler** (antes do próximo `@app.get`):

```python
@app.get("/clientes/list-for-debriefings")
async def list_clientes_for_debriefings(scope: UserScope = Depends(get_user_scope)):
    """
    Lista enxuta de clientes (id, nome, empresa) pra home /debriefings.

    Caso de uso: comercial loga em /debriefings/login → cai em /debriefings →
    precisa ver grid de clientes pra escolher um e abrir o hub.

    Bloqueado pra categoria='consultor' (sistema principal, sem acesso ao
    subsistema de Debriefings).

    Filtra archived_at IS NULL.

    Sub-projeto 4 vai refinar com filtro Encerrado/Renovado + status briefing.
    """
    require_debriefings(scope)
    result = (
        _supabase.table("clientes")
        .select("id, nome, empresa")
        .is_("archived_at", "null")
        .order("nome")
        .execute()
    )
    return result.data
```

- [ ] **Step 4: Rodar tests pra verificar que passam**

```bash
cd backend && python3 -m pytest tests/test_clientes_list_for_debriefings.py -v 2>&1 | tail -5
```

Expected: `3 passed`.

- [ ] **Step 5: Suite completa continua estável**

```bash
cd backend && python3 -m pytest tests/ 2>&1 | tail -3
```

Expected: `86 passed, 5 failed` (eram 83 — +3 dos novos tests; 5 pre-existentes em `test_admin_clickup_sync.py` continuam fora de escopo).

- [ ] **Step 6: Commit**

```bash
git add backend/tests/test_clientes_list_for_debriefings.py backend/main.py
git commit -m "feat(api): GET /clientes/list-for-debriefings (require_debriefings)

Endpoint pra home /debriefings — lista enxuta de clientes ativos.
/clientes-basic é restrito ao sistema principal (require_principal), então
comercial precisa de variante gateada por require_debriefings.

Sub-projeto 4 vai refinar com filtro Encerrado/Renovado."
```

---

## Task 2: `MainLayout`

**Files:**
- Create: `frontend/src/layouts/MainLayout.jsx`

**Contexto:** Substitui o `AuthGuard` atual pra todas as rotas autenticadas do sistema principal. Encapsula: aguardar sessão+scope, redirecionar se não-logado ou se for comercial, renderizar `<Layout session>` (sidebar/header) com `<Outlet />` dentro de `<Suspense>`.

- [ ] **Step 1: Criar `frontend/src/layouts/MainLayout.jsx`**

```jsx
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
```

**Nota sobre `useApp().session`:** `AppProvider` em `frontend/src/contexts/AppContext.jsx` já recebe `session` como prop. Verificar se expõe via `useApp()`. Se não expõe ainda, ajustar `AppContext.jsx` neste mesmo step pra incluir `session` no value do contexto — uma linha. Verificar primeiro:

```bash
grep -n "session" frontend/src/contexts/AppContext.jsx | head -10
```

Se `session` aparecer só no `AppProvider({ children, session })` mas não no `value={{ ... }}`, adicionar na linha do `value`: `value={{ session, clientes, encontrosBase, dispatch }}` (preservar campos existentes).

- [ ] **Step 2: Validar build esbuild**

```bash
cd frontend && npx esbuild --bundle src/layouts/MainLayout.jsx --loader:.jsx=jsx --jsx=automatic --target=es2020 --outfile=/tmp/flg-val-mainlayout.js 2>&1 | tail -5 ; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/layouts/MainLayout.jsx frontend/src/contexts/AppContext.jsx
git commit -m "feat(layouts): MainLayout gateia rotas do sistema principal

Wrapper React Router que substitui AuthGuard nas rotas autenticadas:
  - aguarda sessão + useUserScope
  - sem sessão → /login
  - canSeePrincipal=false (comercial) → /debriefings/login + toast
  - OK → <Layout> (sidebar/header) com <Outlet /> em <Suspense>

AppContext expõe session no value pra MainLayout consumir via useApp()."
```

---

## Task 3: `DebriefingLayout` + `DebriefingHeader`

**Files:**
- Create: `frontend/src/layouts/DebriefingLayout.jsx`
- Create: `frontend/src/components/Debriefings/DebriefingHeader.jsx`

**Contexto:** Layout do subsistema Debriefing. Sem sidebar (1 área só). Header mínimo: logo FLG à esquerda, "FLG Comercial" no centro, nome+Sair à direita. Suficiente pra UX (logout sem devtools) sem virar feature creep — sub-projeto 4 decide se vira chrome completo.

- [ ] **Step 1: Criar `DebriefingHeader.jsx`**

`frontend/src/components/Debriefings/DebriefingHeader.jsx`:

```jsx
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
```

- [ ] **Step 2: Criar `DebriefingLayout.jsx`**

`frontend/src/layouts/DebriefingLayout.jsx`:

```jsx
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
```

- [ ] **Step 3: Validar build**

```bash
cd frontend && npx esbuild --bundle src/layouts/DebriefingLayout.jsx --loader:.jsx=jsx --jsx=automatic --target=es2020 --outfile=/tmp/flg-val-deblayout.js 2>&1 | tail -5 ; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/layouts/DebriefingLayout.jsx frontend/src/components/Debriefings/DebriefingHeader.jsx
git commit -m "feat(layouts): DebriefingLayout + DebriefingHeader

DebriefingLayout: wrapper das rotas /debriefings/*. Gateia por
canSeeDebriefings, redireciona consultor pra /login com toast.

DebriefingHeader: chrome mínimo (logo FLG + label gold 'FLG Comercial' +
nome do user + botão Sair). Sub-projeto 4 decide se vira chrome completo
com nav."
```

---

## Task 4: Tela `/debriefings/login`

**Files:**
- Create: `frontend/src/components/Debriefings/DebriefingLogin.jsx`

**Contexto:** Clone funcional do `Login.jsx` com branding opção A (eyebrow gold "FLG BRASIL · COMERCIAL" + título grande "FLG Comercial" + subtítulo "Hub de Debriefings"). Mesma estrutura de form, mesmo `signInWithPassword`. Pós-login: se `canSeeDebriefings=true` navega `/debriefings`; senão mostra erro + link `/login`. Toast lido de `location.state` no mount.

- [ ] **Step 1: Criar `DebriefingLogin.jsx`**

`frontend/src/components/Debriefings/DebriefingLogin.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../contexts/AppContext'
import { useUserScope } from '../../hooks/useUserScope'
import { useToast } from '../../lib/toast'
import { Spinner } from '../ui/Spinner'

export default function DebriefingLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [wrongDoor, setWrongDoor] = useState(false)

  const { session } = useApp()
  const { isLoading: scopeLoading, canSeeDebriefings } = useUserScope()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  // Lê toast da rota anterior (vindo de MainLayout redirect)
  useEffect(() => {
    const t = location.state?.toast
    if (t) {
      toast(t)
      // Limpa o state pra não disparar de novo em re-render
      window.history.replaceState({}, '')
    }
  }, [location.state, toast])

  // Já logado e pode ver Debriefings → manda pra /debriefings
  if (session && !scopeLoading && canSeeDebriefings) {
    return <Navigate to="/debriefings" replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setWrongDoor(false)
    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signErr) {
      setError('E-mail ou senha incorretos')
      setLoading(false)
      return
    }
    // Sessão é setada via onAuthStateChange (App.jsx). Polling pequeno até useUserScope resolver.
    // Se canSeeDebriefings vier false, mostra "porta errada" em vez de navegar.
    // Aqui só limpamos loading — o Navigate condicional acima cuida do redirect quando flag resolver.
    setLoading(false)
  }

  // Após login bem-sucedido mas sem permissão de Debriefings
  if (session && !scopeLoading && canSeeDebriefings === false) {
    if (!wrongDoor) setWrongDoor(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden transition-colors" style={{ background: 'var(--flg-bg)' }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #C9A84C 0%, transparent 70%)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="text-center mb-10">
          <img
            src="/logo-flg.png"
            alt="FLG"
            className="mx-auto mb-5"
            style={{ height: 80, width: 'auto', objectFit: 'contain' }}
          />
          <p className="text-[10px] tracking-widest uppercase font-bold mb-2" style={{ color: '#C9A84C' }}>
            FLG Brasil · Comercial
          </p>
          <h1 className="font-display text-3xl font-semibold text-white/90">FLG Comercial</h1>
          <p className="text-xs text-white/45 mt-2">Hub de Debriefings</p>
        </div>

        {wrongDoor ? (
          <div className="card-flg p-8 space-y-4 text-center">
            <p className="text-sm text-white/80">
              Esta entrada é do <span className="font-semibold" style={{ color: '#C9A84C' }}>time comercial</span>.
            </p>
            <p className="text-xs text-white/55">
              Sua conta acessa o sistema principal da FLG.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="btn-gold w-full py-3 uppercase tracking-widest text-xs"
            >
              Ir pro Login principal
            </button>
            <button
              type="button"
              onClick={async () => { await supabase.auth.signOut(); }}
              className="text-[10px] text-white/30 hover:text-white/60 mt-2"
            >
              Sair desta conta
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card-flg p-8 space-y-5">
            <div className="space-y-1.5">
              <label className="block text-[10px] tracking-widest uppercase text-white/35 font-medium">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="input-flg"
                placeholder="seu@email.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] tracking-widest uppercase text-white/35 font-medium">Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="input-flg"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-400 text-xs text-center bg-red-500/8 border border-red-500/15 rounded py-2 px-3"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={loading || scopeLoading}
              className="btn-gold w-full py-3 flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
            >
              {loading || scopeLoading ? <><Spinner size="sm" /> Entrando…</> : 'Entrar'}
            </button>
          </form>
        )}

        <p className="text-center text-[10px] text-white/12 mt-6 tracking-wide">
          Acesso restrito · FLG Brasil
        </p>
      </motion.div>
    </div>
  )
}
```

- [ ] **Step 2: Validar build**

```bash
cd frontend && npx esbuild --bundle src/components/Debriefings/DebriefingLogin.jsx --loader:.jsx=jsx --jsx=automatic --target=es2020 --outfile=/tmp/flg-val-deblogin.js 2>&1 | tail -5 ; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Debriefings/DebriefingLogin.jsx
git commit -m "feat(debriefings): tela /debriefings/login com branding 'FLG Comercial'

Tratamento visual opção A do mockup: eyebrow gold 'FLG BRASIL · COMERCIAL'
+ título grande 'FLG Comercial' + subtítulo 'Hub de Debriefings'. Mesmo
dark + gold + glow do /login atual.

Pós-login com canSeeDebriefings=false mostra estado 'porta errada' com link
pra /login (em vez de redirecionar e perder contexto)."
```

---

## Task 5: Reorganizar `App.jsx` (layouts + toasts + AuthGuard removido)

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Login.jsx`

**Contexto:** Reescreve o bloco de rotas usando `<Route element={<MainLayout />}>` em vez de `<AuthGuard>` por rota. Adiciona rotas `/debriefings/*` sob `<Route element={<DebriefingLayout />}>`. Remove componente `AuthGuard` (inline no MainLayout). Adiciona leitura de `location.state.toast` no Login.jsx. Mantém `PreparacaoEncontro` (rota com session check manual hoje) dentro do `MainLayout` também.

**Atenção:** este é o maior diff. Não tem como evitar — é o ponto de virada estrutural. Após aplicar, **todos os smokes do Owner devem continuar funcionando antes de avançar** (deploy ainda não acontece, mas dev local roda).

- [ ] **Step 1: Atualizar `Login.jsx` pra ler toast da rota**

Em `frontend/src/components/Login.jsx`, adicionar no topo do componente (depois dos `useState`):

Localizar o bloco de imports e adicionar `useEffect`, `useLocation`, `useToast`:

```jsx
import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { Spinner } from './ui/Spinner'
```

Dentro de `export default function Login() {`, logo após `const [error, setError] = useState('')`, adicionar:

```jsx
const location = useLocation()
const toast = useToast()

useEffect(() => {
  const t = location.state?.toast
  if (t) {
    toast(t)
    window.history.replaceState({}, '')
  }
}, [location.state, toast])
```

- [ ] **Step 2: Reescrever `App.jsx`**

Sobrescrever `frontend/src/App.jsx` com o conteúdo abaixo. **Antes**: rodar `grep -c "AuthGuard\|<Route" frontend/src/App.jsx` pra registrar baseline (esperado ~20+). **Depois**: zero referências a AuthGuard.

```jsx
import { useEffect, useState, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { AppProvider } from './contexts/AppContext'
import { ToastProvider } from './lib/toast'
import { ThemeProvider } from './lib/theme'
import { needsPasswordChange } from './lib/utils'

import Login from './components/Login'
import PageSpinner from './components/ui/Spinner'

import MainLayout from './layouts/MainLayout'
import DebriefingLayout from './layouts/DebriefingLayout'

import Dashboard from './components/Dashboard'
import Clientes from './components/Clientes'
import NovoCliente from './components/NovoCliente'
import PerfilCliente from './components/PerfilCliente'
import Ranking from './components/Ranking'
import Metricas from './components/Metricas'
import MateriaisHome from './components/Materiais/MateriaisHome'
import MateriaisCliente from './components/Materiais/MateriaisCliente'
import PasswordChangeRequired from './components/PasswordChangeRequired'

// Lazy-loaded
const MetricasGeral     = lazy(() => import('./components/Metricas/MetricasGeral'))
const MetricasPosts     = lazy(() => import('./components/Metricas/MetricasPosts'))
const MetricasLIPosts   = lazy(() => import('./components/Metricas/MetricasLIPosts'))
const MetricasReels     = lazy(() => import('./components/Metricas/MetricasReels'))
const MetricasStories   = lazy(() => import('./components/Metricas/MetricasStories'))
const MetricasYTVideos  = lazy(() => import('./components/Metricas/MetricasYTVideos'))
const MetricasTTVideos  = lazy(() => import('./components/Metricas/MetricasTTVideos'))
const MetricasYTShorts  = lazy(() => import('./components/Metricas/MetricasYTShorts'))
const MetricasLIArtigos = lazy(() => import('./components/Metricas/MetricasLIArtigos'))
const PreparacaoEncontro = lazy(() => import('./components/PreparacaoEncontro'))
const LegalPage          = lazy(() => import('./components/LegalPage'))
const ConectarInstagram  = lazy(() => import('./components/ConectarInstagram'))
const Colaboradores      = lazy(() => import('./components/Colaboradores'))
const Tutoriais          = lazy(() => import('./components/Tutoriais'))
const Configuracoes      = lazy(() => import('./components/Configuracoes'))
const Copywriter         = lazy(() => import('./components/Copywriter'))

// Debriefings (Sub-projeto 2)
const DebriefingLogin     = lazy(() => import('./components/Debriefings/DebriefingLogin'))
const DebriefingsHome     = lazy(() => import('./components/Debriefings/DebriefingsHome'))
const ClienteHub          = lazy(() => import('./components/Debriefings/ClienteHub'))
const DebriefingViewer    = lazy(() => import('./components/Debriefings/Viewer'))

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
          <Route path="/debriefings/login" element={<Suspense fallback={<PageSpinner />}><DebriefingLogin /></Suspense>} />
          <Route path="/legal/:page" element={<Suspense fallback={<PageSpinner />}><LegalPage /></Suspense>} />
          <Route path="/conectar-instagram/:clienteId" element={<Suspense fallback={<PageSpinner />}><ConectarInstagram /></Suspense>} />

          {/* Sistema Principal — gate canSeePrincipal */}
          <Route element={<MainLayout />}>
            <Route index element={<Dashboard session={session} />} />
            <Route path="/clientes" element={<Clientes session={session} />} />
            <Route path="/clientes/novo" element={<NovoCliente />} />
            <Route path="/clientes/:clientId" element={<PerfilCliente />} />
            <Route path="/clientes/:clientId/encontro/:encontroNum" element={<PreparacaoEncontro />} />
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
            <Route path="/materiais" element={<MateriaisHome session={session} />} />
            <Route path="/materiais/diarios" element={<Navigate to="/materiais" replace />} />
            <Route path="/materiais/reunioes" element={<Navigate to="/materiais" replace />} />
            <Route path="/materiais/reunioes/:cid/:n" element={<Navigate to="/materiais" replace />} />
            <Route path="/materiais/cliente/:cid" element={<MateriaisCliente />} />
            <Route path="/copywriter" element={<Copywriter />} />
            <Route path="/colaboradores" element={<Colaboradores />} />
            <Route path="/tutoriais/*" element={<Tutoriais />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
          </Route>

          {/* Sistema Debriefing — gate canSeeDebriefings */}
          <Route element={<DebriefingLayout />}>
            <Route path="/debriefings" element={<DebriefingsHome />} />
            <Route path="/debriefings/cliente/:id" element={<ClienteHub />} />
            <Route path="/debriefings/cliente/:id/:debriefingId" element={<DebriefingViewer />} />
          </Route>

          {/* Fallback: rotas desconhecidas → /login se deslogado, / se logado */}
          <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
    </AppProvider>
    </ThemeProvider>
  )
}
```

**Atenção 1**: as rotas `/materiais/*`, `/tutoriais/*`, `/copywriter`, `/configuracoes`, `/colaboradores` no original podem estar em outras posições ou com props diferentes. Antes de sobrescrever, rodar `grep -E "Route path=\"/(materiais|tutoriais|copywriter|configuracoes|colaboradores)" frontend/src/App.jsx` e mapear cada uma pra preservar props que existam (ex: `session={session}`). O bloco acima é o esqueleto — preserve quaisquer props extras durante a reescrita.

**Atenção 2**: imports `PageSpinner` — no original é `import { PageSpinner } from './components/ui/Spinner'` (named export). Manter assim:

```jsx
import { PageSpinner } from './components/ui/Spinner'
```

(Substituir a linha `import PageSpinner from './components/ui/Spinner'` acima — foi erro de transcrição.)

- [ ] **Step 3: Validar build do app inteiro**

```bash
cd frontend && npx esbuild --bundle src/App.jsx --loader:.jsx=jsx --jsx=automatic --target=es2020 --outfile=/tmp/flg-val-app.js 2>&1 | tail -5 ; echo "exit=$?"
```

Expected: `exit=0`. Se falhar com "Could not resolve" em algum import, ajustar paths conforme o erro.

- [ ] **Step 4: Smoke local rápido**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: `built in Xms` sem erros.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/Login.jsx
git commit -m "refactor(routes): MainLayout + DebriefingLayout substituem AuthGuard

Rotas autenticadas reorganizadas em dois <Route element={<Layout />}>
agrupadores. AuthGuard removido (responsabilidade absorvida no MainLayout).
Adiciona rotas /debriefings, /debriefings/cliente/:id e
/debriefings/cliente/:id/:debriefingId sob DebriefingLayout.

Login.jsx agora lê location.state.toast e dispara via useToast (pra UX de
redirect cross-system). Rota fallback '*' captura URLs desconhecidas."
```

---

## Task 6: Mover `Debriefings/index.jsx` → `Debriefings/ClienteHub.jsx`

**Files:**
- Rename: `frontend/src/components/Debriefings/index.jsx` → `frontend/src/components/Debriefings/ClienteHub.jsx`
- Modify: `frontend/src/components/Debriefings/ClienteHub.jsx` (param + 1 link interno)
- Modify: `frontend/src/components/Debriefings/Viewer.jsx` (1 link interno)

**Contexto:** O hub atual usa `const { clientId } = useParams()` (rota antiga `/clientes/:clientId/debriefings`). Na nova rota `/debriefings/cliente/:id`, o param é `id`. Mudança mínima: destructure como `id` e renomear a variável internamente, **mas pra reduzir risco, vamos apenas renomear o destructure** mantendo a variável `clientId` no resto do código.

Viewer também tem 1 link interno hardcoded pra `/clientes/${clientId}/debriefings` que precisa virar `/debriefings/cliente/${clientId}`.

- [ ] **Step 1: Rename do arquivo preservando history**

```bash
git mv frontend/src/components/Debriefings/index.jsx frontend/src/components/Debriefings/ClienteHub.jsx
```

- [ ] **Step 2: Ajustar param em `ClienteHub.jsx`**

Localizar a linha `const { clientId } = useParams()` (aproximadamente linha 141) e trocar por:

```jsx
const { id: clientId } = useParams()
```

(Renomeia o destructure de `:id` da URL pra `clientId` internamente — minimiza diff no resto do componente.)

- [ ] **Step 3: Ajustar link interno em `ClienteHub.jsx`**

Localizar `navigate(\`/clientes/${clientId}/debriefings/${debriefing.id}\`)` (~ linha 184) e trocar por:

```jsx
navigate(`/debriefings/cliente/${clientId}/${debriefing.id}`)
```

- [ ] **Step 4: Ajustar link interno em `Viewer.jsx`**

Em `frontend/src/components/Debriefings/Viewer.jsx`, localizar `navigate(\`/clientes/${clientId}/debriefings\`)` (~ linha 159) e trocar por:

```jsx
navigate(`/debriefings/cliente/${clientId}`)
```

Também ajustar o `useParams()` se Viewer usa `clientId`. Conferir:

```bash
grep -n "useParams\|clientId" frontend/src/components/Debriefings/Viewer.jsx | head -5
```

Se Viewer usa `const { clientId, debriefingId } = useParams()`, trocar pra `const { id: clientId, debriefingId } = useParams()` (a rota nova é `/debriefings/cliente/:id/:debriefingId`).

- [ ] **Step 5: Verificar que não sobrou nenhum link hardcoded `/clientes/...` apontando pra debriefings**

```bash
grep -rn "clientes.*debriefings\|debriefings.*clientes" frontend/src/components/Debriefings/ | head -5
```

Expected: zero resultados (ou só comments). Se sobrar algum, ajustar.

- [ ] **Step 6: Validar build**

```bash
cd frontend && npx esbuild --bundle src/components/Debriefings/ClienteHub.jsx --loader:.jsx=jsx --jsx=automatic --target=es2020 --outfile=/tmp/flg-val-clienthub.js 2>&1 | tail -3 ; echo "exit=$?"
cd frontend && npx esbuild --bundle src/components/Debriefings/Viewer.jsx --loader:.jsx=jsx --jsx=automatic --target=es2020 --outfile=/tmp/flg-val-viewer.js 2>&1 | tail -3 ; echo "exit=$?"
```

Expected: ambos `exit=0`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Debriefings/
git commit -m "refactor(debriefings): move hub pra rota dedicada /debriefings/cliente/:id

Renomeia Debriefings/index.jsx → ClienteHub.jsx (git mv preserva history).
useParams destructure de :id (era :clientId). Links internos atualizados
pra /debriefings/cliente/:id/... (eram /clientes/:id/debriefings/...).

Viewer.jsx idem.

Nenhuma mudança comportamental — só URLs."
```

---

## Task 7: `DebriefingsHome`

**Files:**
- Create: `frontend/src/components/Debriefings/DebriefingsHome.jsx`

**Contexto:** Home `/debriefings` — grid de clientes ativos. Chama `/api/clientes/list-for-debriefings` (criado na Task 1). Card simples (nome + empresa). Click → `/debriefings/cliente/:id`. Loading skeleton + empty state. Sem filtros (sub-projeto 4 adiciona).

- [ ] **Step 1: Criar `DebriefingsHome.jsx`**

`frontend/src/components/Debriefings/DebriefingsHome.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Users, ChevronRight } from 'lucide-react'
import { api } from '../../lib/api'

export default function DebriefingsHome() {
  const [clientes, setClientes] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    api('/clientes/list-for-debriefings')
      .then(data => { if (!cancelled) setClientes(data || []) })
      .catch(err => { if (!cancelled) setError(err?.message || 'Falha ao carregar clientes') })
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center text-red-400 text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-white">Clientes</h1>
        <p className="text-white/45 text-sm mt-1">Escolha um cliente pra acessar os debriefings</p>
      </div>

      {clientes === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card-flg p-5 animate-pulse">
              <div className="h-5 bg-white/5 rounded w-2/3 mb-2" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : clientes.length === 0 ? (
        <div className="card-flg p-12 text-center">
          <Users size={32} className="mx-auto text-white/20 mb-3" />
          <p className="text-white/55 text-sm">Nenhum cliente disponível no momento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clientes.map((c, idx) => (
            <motion.button
              key={c.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              onClick={() => navigate(`/debriefings/cliente/${c.id}`)}
              className="card-flg p-5 text-left hover:border-[#C9A84C]/40 transition-colors group flex items-center justify-between"
            >
              <div className="min-w-0 flex-1">
                <h3 className="text-white font-semibold truncate">{c.nome}</h3>
                <p className="text-white/45 text-xs mt-0.5 truncate">{c.empresa}</p>
              </div>
              <ChevronRight size={16} className="text-white/25 group-hover:text-[#C9A84C] flex-shrink-0 ml-3" />
            </motion.button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Validar build**

```bash
cd frontend && npx esbuild --bundle src/components/Debriefings/DebriefingsHome.jsx --loader:.jsx=jsx --jsx=automatic --target=es2020 --outfile=/tmp/flg-val-debhome.js 2>&1 | tail -3 ; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Debriefings/DebriefingsHome.jsx
git commit -m "feat(debriefings): home /debriefings com grid de clientes ativos

Chama /clientes/list-for-debriefings (gateado por require_debriefings).
Cards simples (nome + empresa) — click navega pra /debriefings/cliente/:id.
Loading skeleton + empty state.

Sub-projeto 4 vai adicionar filtros Encerrado/Renovado + badges de status."
```

---

## Task 8: Atualizar `PerfilCliente` (remove aba, adiciona botão)

**Files:**
- Modify: `frontend/src/components/PerfilCliente.jsx`

**Contexto:** Aba "Debriefings" some. No header do perfil, ao lado de StatusBadge + link ClickUp, adiciona botão "Abrir Debriefings deste cliente" visível só pra quem tem `canSeeDebriefings`.

- [ ] **Step 1: Remover import e renderização da aba**

Em `frontend/src/components/PerfilCliente.jsx`:

1. Remover a linha `import DebriefingsHub from './Debriefings'` (linha 13).
2. Adicionar import `import { useUserScope } from '../hooks/useUserScope'` (junto com outros hooks).
3. Adicionar import `import { FileText } from 'lucide-react'` (ou adicionar `FileText` ao import existente de `lucide-react`).
4. Dentro do componente, logo após o uso de `useApp()`, adicionar:
   ```jsx
   const { canSeeDebriefings } = useUserScope()
   const navigate = useNavigate()
   ```
   (Verificar se `useNavigate` já está importado; se não, adicionar ao import de `react-router-dom`.)
5. Remover a entrada `{ value: 'debriefings', label: 'Debriefings' }` do array `tabs` (linha ~332).
6. Remover o bloco `<Tabs.Content value="debriefings"><DebriefingsHub /></Tabs.Content>` (linhas ~415-417).

- [ ] **Step 2: Adicionar botão no header**

Localizar o bloco do header com `<StatusBadge status={cliente.status || 'ativo'} />` e o link de ClickUp (linhas ~285-298). Adicionar como **último item dentro do mesmo `<div className="flex items-center gap-3 mt-2 flex-wrap">`**, após o link do ClickUp:

```jsx
{canSeeDebriefings && (
  <button
    onClick={() => navigate(`/debriefings/cliente/${cliente.id}`)}
    className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors"
    style={{
      color: '#C9A84C',
      background: 'rgba(201,168,76,0.10)',
      borderColor: 'rgba(201,168,76,0.30)',
    }}
    title="Abrir Debriefings deste cliente"
  >
    <FileText size={11} />
    Debriefings
  </button>
)}
```

- [ ] **Step 3: Validar build**

```bash
cd frontend && npx esbuild --bundle src/components/PerfilCliente.jsx --loader:.jsx=jsx --jsx=automatic --target=es2020 --outfile=/tmp/flg-val-pcl.js 2>&1 | tail -5 ; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 4: Confirmar que nada referencia mais `DebriefingsHub` em `PerfilCliente.jsx`**

```bash
grep -n "DebriefingsHub\|debriefings" frontend/src/components/PerfilCliente.jsx
```

Expected: zero ocorrências de `DebriefingsHub`. Pode haver string "Debriefings" no botão novo (esperado).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PerfilCliente.jsx
git commit -m "feat(perfil): aba Debriefings vira botão no header

Aba 'Debriefings' do PerfilCliente removida. No lugar, botão pill gold
'Debriefings' (ícone FileText) aparece no header ao lado de StatusBadge
e link ClickUp — visível só pra quem tem canSeeDebriefings.

Click navega pra /debriefings/cliente/:id (rota dedicada, sub-projeto 2).
Hub fica em 1 lugar só (sem duplicação)."
```

---

## Task 9: Push + smoke fim a fim

**Files:** nenhum mudado. Só ops.

- [ ] **Step 1: Conferir todos os commits locais antes do push**

```bash
git log --oneline origin/main..HEAD
```

Expected: 8 commits da Tasks 1-8.

- [ ] **Step 2: Suite backend completa**

```bash
cd backend && python3 -m pytest tests/ 2>&1 | tail -3
```

Expected: `86 passed, 5 failed` (os 5 debt antigo de `test_admin_clickup_sync.py`).

- [ ] **Step 3: Build frontend completo**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: `built in Xms`, zero erros.

- [ ] **Step 4: Push**

```bash
git push origin main 2>&1 | tail -3
```

- [ ] **Step 5: Acompanhar deploy**

```bash
sleep 8
RUN_ID=$(gh run list --workflow=deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --exit-status 2>&1 | tail -3
```

Expected: `completed success`. Se falhar com SSH timeout (já aconteceu 2x no sub-projeto 1), re-disparar via `gh workflow run deploy.yml --ref main` e aguardar.

- [ ] **Step 6: Smoke sem auth (gates retornam o esperado)**

```bash
echo "=== sem auth ==="
curl -s -o /dev/null -w "GET /api/health                : %{http_code}\n" https://docs.foundersledgrowth.online/api/health
curl -s -o /dev/null -w "GET /                          : %{http_code}\n" https://docs.foundersledgrowth.online/
curl -s -o /dev/null -w "GET /debriefings/login (SPA)   : %{http_code}\n" https://docs.foundersledgrowth.online/debriefings/login
curl -s -o /dev/null -w "GET /api/clientes/list-for-debriefings : %{http_code}\n" https://docs.foundersledgrowth.online/api/clientes/list-for-debriefings
```

Expected:
- `/api/health` → 200
- `/` → 200 (SPA fallback HTML)
- `/debriefings/login` → 200 (SPA fallback HTML, React Router rende a tela depois)
- `/api/clientes/list-for-debriefings` → 422 (FastAPI exige Authorization)

- [ ] **Step 7: Smoke manual do Pedro (matriz)**

Pedido em texto pro Pedro testar:

> Smoke matriz completa do sub-projeto 2:
>
> **Owner (você):**
> 1. Login em `/login` → home carrega normal
> 2. Vai em `/clientes/:id` (qualquer um) → vê botão pill gold "Debriefings" no header
> 3. Clica → cai em `/debriefings/cliente/:id` com header "FLG Comercial" + Sair
> 4. Click num debriefing existente → viewer carrega
> 5. Volta pra `/debriefings` → vê grid de clientes
> 6. Cola `/login` na URL → cai em home do sistema principal
>
> **Comercial de teste** (criar via Colaboradores → modal → categoria=Comercial, role=member):
> 1. Senha temp aparece na modal de reveal — copia
> 2. Logout (do Owner)
> 3. Acessa `/debriefings/login` (URL direta)
> 4. Loga com email comercial + senha temp → cai em `/debriefings`
> 5. Vê grid de clientes
> 6. Clica num cliente → abre `ClienteHub`
> 7. Cola `/clientes` na URL → redireciona pra `/debriefings/login` com toast "Acesso restrito" + descrição
> 8. Sai

- [ ] **Step 8: Atualizar HANDOFF**

Após smoke aprovado, editar `docs/superpowers/HANDOFF-debriefings.md` movendo Sub-projeto 2 de "🟡 brainstorming ativo" pra "✅ ENTREGUE em prod", listar commits do sprint, listar artefatos novos.

```bash
git add docs/superpowers/HANDOFF-debriefings.md
git commit -m "docs(handoff): sub-projeto 2 do Subsistema Comercial entregue"
git push
```

---

## Self-review

**1. Spec coverage:**

| Spec section | Task | Status |
|---|---|---|
| §1 Objetivo (login + layouts + migração) | Tasks 2-8 | ✓ |
| §2 Contexto sub-projeto 1 | n/a (já em prod) | ✓ |
| §3.1 Home = lista simples | Task 7 | ✓ |
| §3.2 Aba PerfilCliente vira botão | Task 8 | ✓ |
| §3.3 Branding tela login opção A | Task 4 | ✓ |
| §4 Rotas | Task 5 | ✓ |
| §5 Tela `/debriefings/login` | Task 4 | ✓ |
| §6 MainLayout + DebriefingLayout + toasts | Tasks 2, 3, 5 | ✓ |
| §7 Estrutura componentes (incluindo `/api/clientes-basic` issue) | Task 1 (endpoint novo) + Tasks 6-7 | ✓ |
| §8 PerfilCliente | Task 8 | ✓ |
| §9 Out of scope | respeitado | ✓ |
| §10 Ordem de implementação | Tasks 1-9 seguem | ✓ |
| §11 Riscos | mitigados nos passos (grep antes de sobrescrever, esbuild validation, smoke por persona) | ✓ |
| §12 Critérios de aceitação | Task 9 cobre via smoke matriz | ✓ |

Nenhuma gap detectada.

**2. Placeholder scan:** plano não contém "TBD", "TODO", "implement later", "handle edge cases". Cada step tem código completo ou comando exato. ✓

**3. Type consistency:**
- `MainLayout` lê `canSeePrincipal` (Task 2) — bate com flag exposta por `useUserScope` no sub-projeto 1 ✓
- `DebriefingLayout` lê `canSeeDebriefings` ✓
- Endpoint `/clientes/list-for-debriefings` (Task 1) batido com fetch em `DebriefingsHome` (Task 7) ✓
- `ClienteHub.jsx` recebe param `id` (Task 6) batido com rota `/debriefings/cliente/:id` (Task 5) ✓
- `Viewer.jsx` recebe params `id` + `debriefingId` (Task 6) batido com rota `/debriefings/cliente/:id/:debriefingId` (Task 5) ✓
- `useApp().session` (Tasks 2, 3) — Task 2 Step 1 inclui ajuste em `AppContext.jsx` se necessário ✓
- `toast({ title, description, variant })` — bate com API do `useToast()` confirmada em exploração ✓

Sem inconsistências.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-05-debriefing-subproject-2-login-layouts-ui.md`.**
