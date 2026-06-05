/**
 * useUserScope — single source-of-truth pra permissionamento no frontend.
 *
 * Chama GET /me/scope que retorna o UserScope autoritativo do backend
 * (categoria + role + consultor_id + can_see_all + flags de debriefings).
 * Substitui chutes locais tipo `email.split('@')[0]` que eram frágeis.
 *
 * Uso típico:
 *   const { canSeeAll, myConsultorId, myConsultorNome, isLoading } = useUserScope()
 *   if (isLoading) return <SkeletonDropdown />
 *   {canSeeAll && <ConsultorFilter ... />}
 *
 * Flags expostas:
 *   - canSeeAll: vê dados de todos consultores (Jornada)
 *   - canSeePrincipal: principal (sócio/líder) com visão ampla
 *   - canSeeDebriefings: pode acessar área de Debriefings
 *   - canSeeDebriefingsAdmin: admin da área de Debriefings
 *
 * Fail-safe: se /me/scope falha, retorna tudo false (modo restritivo)
 * pra não vazar acidentalmente.
 */
import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export function useUserScope() {
  const [state, setState] = useState({
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
  })

  useEffect(() => {
    let cancelled = false
    api('/me/scope')
      .then((scope) => {
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
      .catch((err) => {
        if (cancelled) return
        // Fail-safe: restritivo
        setState({
          canSeeAll: false,
          canSeePrincipal: false,
          canSeeDebriefings: false,
          canSeeDebriefingsAdmin: false,
          myConsultorId: null,
          myConsultorNome: null,
          categoria: null,
          role: null,
          isLoading: false,
          error: err?.message || 'Falha ao carregar permissões',
        })
      })
    return () => { cancelled = true }
  }, [])

  return state
}
