import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api } from '../../../lib/api'

/**
 * Hook compartilhado pelas abas Posts/Reels/Stories.
 * tipoBackend: 'feed' | 'reels' | 'story' (vai pro ?tipo= do /overview e /posts)
 * tipoFiltroPostFE: array de strings ['IMAGE','CAROUSEL','VIDEO'] etc — filtro
 *   frontend de segurança caso backend devolva tipos misturados
 * ordenar: vai pro ?ordenar= do /posts (Task 5 expõe controle de UI)
 */
export function useTipoMetricas({ tipoBackend, tipoFiltroPostFE, ordenar = 'engajamento' }) {
  const { clienteId, periodo, platform, platConfig } = useOutletContext()
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [posts, setPosts] = useState([])

  useEffect(() => {
    if (!clienteId) return
    setLoading(true)
    setOverview(null)
    Promise.all([
      api(`/metricas/${clienteId}/overview?plataforma=${platform}&dias=${periodo}&tipo=${tipoBackend}`),
      api(`/metricas/${clienteId}/posts?plataforma=${platform}&limit=24&tipo=${tipoBackend}&ordenar=${ordenar}`),
    ]).then(([ov, po]) => {
      setOverview(ov)
      const all = po.posts || []
      const filtered = tipoFiltroPostFE
        ? all.filter(p => tipoFiltroPostFE.includes(p.tipo))
        : all
      setPosts(filtered)
    }).catch(console.error).finally(() => setLoading(false))
  }, [clienteId, periodo, platform, tipoBackend, ordenar])

  return { clienteId, periodo, platform, platConfig, loading, overview, posts }
}
