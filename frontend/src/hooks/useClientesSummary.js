/**
 * useClientesSummary — fetch /clientes-summary com métricas IG agregadas.
 *
 * Usado pela tela /clientes pra ter cards ricos sem N+1 requests.
 * Outros lugares (Dashboard, AppContext) continuam usando GET /clientes
 * normal sem o overhead.
 *
 * NOTA: path `/clientes-summary` (hífen, sem nested) evita ambiguidade com
 * `/clientes/{client_id}` em FastAPI routing (Postgres tentava castar
 * "summary" pra UUID).
 *
 * Retorna: { clientes, isLoading, error, refetch }
 */
import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export function useClientesSummary({ consultorId, includeArchived = false } = {}) {
  const [state, setState] = useState({
    clientes: [],
    isLoading: true,
    error: null,
  })

  const fetchSummary = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }))
    try {
      const params = new URLSearchParams()
      if (consultorId) params.set('consultor_id', consultorId)
      if (includeArchived) params.set('include_archived', 'true')
      const qs = params.toString()
      const path = `/clientes-summary${qs ? `?${qs}` : ''}`
      const data = await api(path)
      setState({ clientes: Array.isArray(data) ? data : [], isLoading: false, error: null })
    } catch (err) {
      setState({ clientes: [], isLoading: false, error: err?.message || 'Falha ao carregar clientes' })
    }
  }, [consultorId, includeArchived])

  useEffect(() => {
    let cancelled = false
    fetchSummary().catch(() => {})
    return () => { cancelled = true }
  }, [fetchSummary])

  return { ...state, refetch: fetchSummary }
}
