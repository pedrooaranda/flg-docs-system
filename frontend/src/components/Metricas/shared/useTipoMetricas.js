import { useState, useEffect, useCallback } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { api } from '../../../lib/api'

/**
 * Hook compartilhado pelas abas Posts/Reels/Stories.
 * Lê ?ordenar= do searchParams (ou usa defaultOrdenar). Expõe setOrdenar
 * que atualiza a URL.
 */
export function useTipoMetricas({ tipoBackend, tipoFiltroPostFE, defaultOrdenar = 'engajamento' }) {
  const { clienteId, periodo, platform, platConfig } = useOutletContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [posts, setPosts] = useState([])

  const ordenar = searchParams.get('ordenar') || defaultOrdenar

  const setOrdenar = useCallback((newOrdenar) => {
    const sp = new URLSearchParams(searchParams)
    sp.set('ordenar', newOrdenar)
    setSearchParams(sp, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!clienteId) return
    setLoading(true)
    setOverview(null)
    Promise.all([
      api(`/metricas/${clienteId}/overview?plataforma=${platform}&dias=${periodo}&tipo=${tipoBackend}`),
      api(`/metricas/${clienteId}/posts?plataforma=${platform}&limit=24&tipo=${tipoBackend}&ordenar=${ordenar}&dias=${periodo}`),
    ]).then(([ov, po]) => {
      setOverview(ov)
      const all = po.posts || []
      const filtered = tipoFiltroPostFE
        ? all.filter(p => tipoFiltroPostFE.includes(p.tipo))
        : all
      setPosts(filtered)
    }).catch(console.error).finally(() => setLoading(false))
  }, [clienteId, periodo, platform, tipoBackend, ordenar])

  return { clienteId, periodo, platform, platConfig, loading, overview, posts, ordenar, setOrdenar }
}
