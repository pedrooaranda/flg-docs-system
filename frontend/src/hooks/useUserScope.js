/**
 * useUserScope — leitura do scope autoritativo do usuário logado.
 *
 * Antes: cada montagem do hook fazia um fetch novo em /me/scope.
 * Agora: lê do UserScopeContext (frontend/src/contexts/UserScopeContext.jsx)
 * que faz fetch 1x quando a session muda. API externa do hook é IDÊNTICA
 * à versão anterior — todos os consumers funcionam sem mudança.
 *
 * Flags expostas:
 *   - canSeeAll: vê dados de todos consultores (Jornada)
 *   - canSeePrincipal: principal (sócio/líder) com visão ampla
 *   - canSeeDebriefings: pode acessar área de Debriefings
 *   - canSeeDebriefingsAdmin: admin da área de Debriefings
 *
 * Fail-safe: se /me/scope falha, retorna tudo false (modo restritivo).
 */
import { useUserScopeContext } from '../contexts/UserScopeContext'

export function useUserScope() {
  return useUserScopeContext()
}
