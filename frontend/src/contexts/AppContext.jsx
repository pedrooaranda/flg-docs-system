/**
 * AppContext — estado global centralizado.
 *
 * Centraliza: clientes, encontrosBase, agentesConfig.
 * Usa Supabase Realtime para manter dados sincronizados em todas
 * as telas sem recarregar.
 *
 * Uso:
 *   const { clientes, encontrosBase, dispatch } = useApp()
 */
import { createContext, useContext, useReducer, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

const AppCtx = createContext(null)

const initialState = {
  clientes: [],
  encontrosBase: [],
  agentesConfig: [],
  loading: true,
}

function reducer(state, action) {
  switch (action.type) {
    case 'LOADED':
      return { ...state, ...action.payload, loading: false }

    case 'CLIENT_UPSERT': {
      const idx = state.clientes.findIndex(c => c.id === action.payload.id)
      if (idx === -1) return { ...state, clientes: [action.payload, ...state.clientes] }
      const clientes = [...state.clientes]
      clientes[idx] = { ...clientes[idx], ...action.payload }
      return { ...state, clientes }
    }
    case 'CLIENT_DELETE':
      return { ...state, clientes: state.clientes.filter(c => c.id !== action.payload.id) }

    case 'ENCONTRO_UPDATE': {
      const idx = state.encontrosBase.findIndex(e => e.numero === action.payload.numero)
      if (idx === -1) return state
      const encontrosBase = [...state.encontrosBase]
      encontrosBase[idx] = { ...encontrosBase[idx], ...action.payload }
      return { ...state, encontrosBase }
    }

    case 'AGENTE_UPDATE': {
      const idx = state.agentesConfig.findIndex(a => a.agente_tipo === action.payload.agente_tipo)
      if (idx === -1) return { ...state, agentesConfig: [action.payload, ...state.agentesConfig] }
      const agentesConfig = [...state.agentesConfig]
      agentesConfig[idx] = { ...agentesConfig[idx], ...action.payload }
      return { ...state, agentesConfig }
    }

    default:
      return state
  }
}

export function AppProvider({ children, session }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    if (!session) return

    // Carga inicial em paralelo
    Promise.all([
      api('/clientes').catch(() => []),
      api('/encontros-base').catch(() => []),
      api('/agentes-config').catch(() => []),
    ]).then(([clientes, encontrosBase, agentesConfig]) => {
      dispatch({ type: 'LOADED', payload: { clientes, encontrosBase, agentesConfig } })
    })

    // Supabase Realtime — clientes
    const clientesCh = supabase
      .channel('app-clientes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, (p) => {
        if (p.eventType === 'DELETE') dispatch({ type: 'CLIENT_DELETE', payload: p.old })
        else dispatch({ type: 'CLIENT_UPSERT', payload: p.new })
      })
      .subscribe()

    // Supabase Realtime — encontros_base
    const encontrosCh = supabase
      .channel('app-encontros')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'encontros_base' }, (p) => {
        dispatch({ type: 'ENCONTRO_UPDATE', payload: p.new })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(clientesCh)
      supabase.removeChannel(encontrosCh)
    }
  }, [session])

  return (
    <AppCtx.Provider value={{ ...state, dispatch }}>
      {children}
    </AppCtx.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
