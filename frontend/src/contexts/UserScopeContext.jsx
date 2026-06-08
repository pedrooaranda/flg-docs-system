/**
 * UserScopeContext — cache global do UserScope.
 *
 * Antes: cada componente que chamava `useUserScope()` fazia um fetch novo
 * em `/me/scope`. Páginas como `/clientes/:id` montavam MainLayout +
 * PerfilCliente + (filtros) que disparavam 3+ requests paralelos do
 * mesmo scope. Multiplica por toda navegação SPA → lentidão percebida.
 *
 * Agora: 1 Provider monta no topo do app, faz fetch 1x quando a sessão
 * resolve, expõe via context. Hook `useUserScope` lê do context. API
 * externa do hook ficou IGUAL — consumers não precisam mudar.
 *
 * Re-fetch acontece quando a session muda (login/logout) — coberto pelo
 * deps array do useEffect.
 */
import { createContext, useContext, useEffect, useState } from 'react'
import { useApp } from './AppContext'
import { api } from '../lib/api'

const INITIAL = {
  canSeeAll: false,
  canSeePrincipal: false,
  canSeeDebriefings: false,
  canSeeDebriefingsAdmin: false,
  myConsultorId: null,
  myConsultorNome: null,
  categoria: null,
  role: null,
  isLoading: true,
  error: null,
}

const UserScopeContext = createContext(INITIAL)

export function UserScopeProvider({ children }) {
  const { session } = useApp()
  const [state, setState] = useState(INITIAL)

  useEffect(() => {
    if (!session) {
      setState({ ...INITIAL, isLoading: false })
      return
    }
    let cancelled = false
    setState(s => ({ ...s, isLoading: true, error: null }))
    api('/me/scope')
      .then(scope => {
        if (cancelled) return
        setState({
          canSeeAll: scope.can_see_all === true,
          canSeePrincipal: scope.can_see_principal === true,
          canSeeDebriefings: scope.can_see_debriefings === true,
          canSeeDebriefingsAdmin: scope.can_see_debriefings_admin === true,
          myConsultorId: scope.consultor_id ?? null,
          myConsultorNome: scope.consultor_nome ?? null,
          categoria: scope.categoria ?? null,
          role: scope.role ?? null,
          isLoading: false,
          error: null,
        })
      })
      .catch(err => {
        if (cancelled) return
        setState({ ...INITIAL, isLoading: false, error: err?.message || 'Falha ao carregar permissões' })
      })
    return () => { cancelled = true }
  }, [session?.user?.id])

  return <UserScopeContext.Provider value={state}>{children}</UserScopeContext.Provider>
}

export function useUserScopeContext() {
  return useContext(UserScopeContext)
}
