import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '../../../lib/api'
import { GOLD } from './constants'

function formatRelative(iso) {
  const dt = new Date(iso)
  const diff = Date.now() - dt.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `há ${d}d`
  return dt.toLocaleDateString('pt-BR')
}

export default function SyncButton({ clienteId, onSynced, accent = GOLD }) {
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    if (!clienteId) return
    api(`/instagram/oauth/status/${clienteId}`)
      .then(d => setLastSync(d?.last_sync_at || null))
      .catch(() => {})
  }, [clienteId])

  useEffect(() => {
    if (!feedback) return
    const ms = feedback.kind === 'ok' ? 4000 : 12000
    const t = setTimeout(() => setFeedback(null), ms)
    return () => clearTimeout(t)
  }, [feedback])

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    setFeedback(null)
    try {
      const r = await api(`/instagram/oauth/sync/${clienteId}`, { method: 'POST' })
      setLastSync(new Date().toISOString())
      const status = r?.status || (r?.errors?.length ? 'partial' : 'ok')
      const summary = `posts=${r?.posts ?? 0} · métricas=${r?.metricas_diarias ?? 0} · horários=${r?.horarios ?? 0}`
      if (status === 'ok') {
        setFeedback({ kind: 'ok', message: `Sincronizado · ${summary}` })
      } else if (status === 'partial') {
        setFeedback({ kind: 'partial', message: `Sync parcial · ${summary}`, errors: r.errors })
      } else {
        setFeedback({ kind: 'failed', message: 'Sync falhou em todas as etapas', errors: r.errors })
      }
      if (onSynced) onSynced(r)
    } catch (err) {
      setFeedback({ kind: 'failed', message: err?.message || 'Erro ao sincronizar', errors: [] })
    } finally {
      setSyncing(false)
    }
  }

  const feedbackColor = feedback?.kind === 'ok' ? '#34D399' : feedback?.kind === 'partial' ? '#FACC15' : '#F87171'

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-full transition-all"
        style={{
          background: 'var(--flg-bg-hover)',
          color: syncing ? 'var(--flg-text-muted)' : accent,
          border: `1px solid ${accent}30`,
          cursor: syncing ? 'wait' : 'pointer',
        }}
        title={lastSync ? `Última sync: ${formatRelative(lastSync)}` : 'Nunca sincronizado'}
      >
        <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
        {syncing ? 'Sincronizando…' : (lastSync ? `Sync ${formatRelative(lastSync)}` : 'Atualizar agora')}
      </button>

      {feedback && (
        <div
          className="absolute top-full mt-2 left-0 z-20 rounded-lg px-3 py-2 text-[11px] max-w-md shadow-lg"
          style={{
            background: 'var(--flg-bg-raised)',
            border: `1px solid ${feedbackColor}50`,
            color: 'var(--flg-text)',
          }}
        >
          <div className="font-semibold flex items-center gap-2" style={{ color: feedbackColor }}>
            <span>{feedback.kind === 'ok' ? '✅' : feedback.kind === 'partial' ? '⚠️' : '❌'}</span>
            {feedback.message}
          </div>
          {feedback.errors?.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[10.5px] text-white/70">
              {feedback.errors.map((e, i) => (
                <li key={i}>
                  <span className="font-semibold text-white/90">{e.step}:</span> {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
