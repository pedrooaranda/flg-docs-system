import { useState, useEffect } from 'react'
import { RefreshCw, Wifi, ExternalLink } from 'lucide-react'
import { api } from '../../../lib/api'
import { GOLD } from './constants'
import { MockDataBanner } from '../../MetricasParts'

// Re-export pra outros componentes
export { MockDataBanner }

// Badge: avatar + @username do IG conectado, clicável → instagram.com
export function IGProfileBadge({ clienteId }) {
  const [info, setInfo] = useState(null)

  useEffect(() => {
    if (!clienteId) { setInfo(null); return }
    let cancelled = false
    api(`/instagram/oauth/status/${clienteId}`)
      .then(d => {
        if (cancelled || !d?.conectado) return
        setInfo({
          username: d.username,
          profile_picture_url: d.profile_picture_url,
          instagram_url: d.instagram_url || (d.username ? `https://instagram.com/${d.username}` : null),
        })
      })
      .catch(() => setInfo(null))
    return () => { cancelled = true }
  }, [clienteId])

  if (!info?.username) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-full"
        style={{ background: 'rgba(52,211,153,0.12)', color: '#34D399', border: '1px solid rgba(52,211,153,0.25)' }}>
        <Wifi size={11} />
        Instagram conectado
      </div>
    )
  }

  return (
    <a
      href={info.instagram_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-[11px] font-semibold px-2 py-1 rounded-full transition-all hover:scale-[1.02]"
      style={{
        background: 'rgba(52,211,153,0.10)',
        border: '1px solid rgba(52,211,153,0.30)',
        color: '#34D399',
      }}
      title={`Abrir @${info.username} no Instagram`}
    >
      {info.profile_picture_url ? (
        <img
          src={info.profile_picture_url}
          alt={`@${info.username}`}
          className="rounded-full object-cover"
          style={{ width: 20, height: 20, border: '1px solid rgba(52,211,153,0.4)' }}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      ) : (
        <Wifi size={11} />
      )}
      <span>@{info.username}</span>
      <ExternalLink size={10} className="opacity-60" />
    </a>
  )
}

// Banner: conectado mas aguardando primeira sincronização
export function AguardandoSyncBanner({ clienteId, accent = GOLD, onSynced }) {
  const [syncing, setSyncing] = useState(false)
  const [feedback, setFeedback] = useState(null)

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    setFeedback(null)
    try {
      const r = await api(`/instagram/oauth/sync/${clienteId}`, { method: 'POST' })
      const status = r?.status || (r?.errors?.length ? 'partial' : 'ok')
      if (status === 'ok' || status === 'partial') {
        if (onSynced) onSynced(r)
      }
      if (r?.errors?.length) {
        setFeedback({ kind: status === 'failed' ? 'failed' : 'partial', errors: r.errors })
      }
    } catch (err) {
      setFeedback({ kind: 'failed', errors: [{ step: 'request', message: err?.message || 'Erro desconhecido' }] })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(56,189,248,0.08), rgba(34,211,238,0.04))',
        border: '1px solid rgba(56,189,248,0.30)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="rounded-lg flex items-center justify-center shrink-0"
          style={{ width: 36, height: 36, background: 'rgba(56,189,248,0.18)', border: '1px solid rgba(56,189,248,0.4)' }}
        >
          <RefreshCw size={18} style={{ color: '#7DD3FC' }} className={syncing ? 'animate-spin' : ''} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-white/90">Instagram conectado · aguardando primeira sincronização</div>
          <div className="text-[11px] text-white/55 mt-0.5">
            A conta foi vinculada, mas ainda não puxamos os dados. O sync automático roda toda madrugada (04h UTC). Clique abaixo pra rodar agora.
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
          style={{
            background: syncing ? 'var(--flg-bg-hover)' : accent,
            color: syncing ? 'var(--flg-text-muted)' : '#0B0B0B',
            border: `1px solid ${accent}`,
            cursor: syncing ? 'wait' : 'pointer',
          }}
        >
          {syncing ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
      </div>

      {feedback?.errors?.length > 0 && (
        <div
          className="rounded-lg p-2.5 text-[11px]"
          style={{
            background: 'rgba(248,113,113,0.08)',
            border: '1px solid rgba(248,113,113,0.30)',
          }}
        >
          <div className="font-semibold text-[#F87171] mb-1">
            {feedback.kind === 'failed' ? '❌ Sync falhou' : '⚠️ Sync com falhas parciais'}
          </div>
          <ul className="space-y-0.5 text-white/75">
            {feedback.errors.map((e, i) => (
              <li key={i}>
                <span className="font-semibold text-white/90">{e.step}:</span> {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Banner: dados zerados / sync falhou — explica e oferece retry
export function DadosZeradosBanner({ diagnostico, clienteId, accent = GOLD, onSynced }) {
  const [syncing, setSyncing] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const lastErr = diagnostico?.last_error
  const postsNoPeriodo = diagnostico?.posts_no_periodo || 0
  const errorsList = lastErr?.errors || []
  const lastSyncAt = diagnostico?.last_sync_at

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    setFeedback(null)
    try {
      const r = await api(`/instagram/oauth/sync/${clienteId}`, { method: 'POST' })
      const status = r?.status || (r?.errors?.length ? 'partial' : 'ok')
      setFeedback({ kind: status, errors: r.errors || [], diagnostics: r.diagnostics })
      if (onSynced) onSynced(r)
    } catch (err) {
      setFeedback({ kind: 'failed', errors: [{ step: 'request', message: err?.message || 'Erro' }] })
    } finally {
      setSyncing(false)
    }
  }

  const hasError = errorsList.length > 0
  const tone = hasError
    ? { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.30)', icon: '⚠️', label: 'Sync com problema' }
    : { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.30)', icon: '📭', label: 'Sem dados no período' }

  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: tone.bg, border: `1px solid ${tone.border}` }}>
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0">{tone.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-white/95">{tone.label}</div>
          <div className="text-[11px] text-white/65 mt-0.5">
            {hasError ? (
              <>O último sync rodou{lastSyncAt && ` em ${new Date(lastSyncAt).toLocaleString('pt-BR')}`} mas teve falhas. Veja abaixo o que precisa ser corrigido.</>
            ) : (
              <>Sync rodou{lastSyncAt && ` em ${new Date(lastSyncAt).toLocaleString('pt-BR')}`} mas não trouxe posts/insights nos últimos {diagnostico?.dias_periodo || 30} dias. Pode ser conta sem posts recentes nesse período, conta não-Business (sem acesso a Insights), ou permissão faltando no OAuth.</>
            )}
          </div>

          {hasError && (
            <ul className="mt-2 space-y-1 text-[11px] text-white/80">
              {errorsList.map((e, i) => (
                <li key={i}>
                  <span className="font-semibold text-white/95">{e.step}:</span> {e.message}
                </li>
              ))}
            </ul>
          )}

          {!hasError && postsNoPeriodo === 0 && (
            <div className="mt-2 text-[11px] text-white/55">
              Posts encontrados nos últimos {diagnostico?.dias_periodo || 30} dias: <span className="font-semibold text-white/80">{postsNoPeriodo}</span>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-all"
              style={{
                background: syncing ? 'var(--flg-bg-hover)' : accent,
                color: syncing ? 'var(--flg-text-muted)' : '#0B0B0B',
                border: `1px solid ${accent}`,
                cursor: syncing ? 'wait' : 'pointer',
              }}
            >
              <RefreshCw size={11} className={`inline mr-1 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando…' : 'Tentar novamente'}
            </button>
          </div>

          {feedback && (
            <div className="mt-2 text-[11px] text-white/75">
              {feedback.kind === 'ok' && <span className="text-[#34D399]">✅ Sync ok — recarregando…</span>}
              {feedback.kind === 'partial' && <span className="text-[#FACC15]">⚠️ Parcial — {feedback.errors?.length} etapa(s) com erro</span>}
              {feedback.kind === 'failed' && <span className="text-[#F87171]">❌ Falhou — {feedback.errors?.[0]?.message || 'erro desconhecido'}</span>}
              {feedback.diagnostics && (
                <div className="mt-1 text-[10.5px] text-white/50">
                  Posts encontrados: {feedback.diagnostics.media_fetched ?? 0} ·
                  Insights ok (full/safe): {feedback.diagnostics.insights_full ?? 0}/{feedback.diagnostics.insights_safe ?? 0} ·
                  falharam: {feedback.diagnostics.insights_failed ?? 0}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
