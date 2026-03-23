/**
 * useAutoSave — auto-save com debounce e indicador visual.
 *
 * Uso:
 *   const { status } = useAutoSave(`/encontros-base/${num}`, 'intelecto_base', valor)
 *
 * status: 'idle' | 'saving' | 'saved' | 'error'
 *
 * O indicador visual pode ser renderizado assim:
 *   {status === 'saving' && <span>Salvando...</span>}
 *   {status === 'saved'  && <span>Salvo ✓</span>}
 *   {status === 'error'  && <span>Erro ao salvar</span>}
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../lib/api'

export function useAutoSave(endpoint, field, value, delay = 500) {
  const [status, setStatus] = useState('idle')
  const timerRef = useRef(null)
  const mountedRef = useRef(true)
  const isFirstRender = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const save = useCallback(async (val) => {
    if (!mountedRef.current) return
    setStatus('saving')
    try {
      await api(endpoint, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: val }),
      })
      if (mountedRef.current) {
        setStatus('saved')
        setTimeout(() => {
          if (mountedRef.current) setStatus('idle')
        }, 2000)
      }
    } catch {
      if (mountedRef.current) setStatus('error')
    }
  }, [endpoint, field])

  useEffect(() => {
    // Ignorar na primeira renderização (valor inicial)
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    clearTimeout(timerRef.current)
    setStatus('idle')
    timerRef.current = setTimeout(() => save(value), delay)
    return () => clearTimeout(timerRef.current)
  }, [value, delay, save])

  return { status, save }
}

/** Componente de indicador de status de auto-save */
export function AutoSaveIndicator({ status }) {
  if (status === 'idle') return null
  const map = {
    saving: { text: 'Salvando…', color: 'rgba(250,250,248,0.35)' },
    saved:  { text: 'Salvo ✓',   color: '#4ade80' },
    error:  { text: 'Erro ao salvar', color: '#f87171' },
  }
  const { text, color } = map[status] || map.saving
  return (
    <span className="text-[10px] transition-all" style={{ color }}>
      {text}
    </span>
  )
}
