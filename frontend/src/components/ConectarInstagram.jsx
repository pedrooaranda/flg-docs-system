/**
 * Página pública de onboarding Instagram via link assinado.
 * Acessada por: /conectar-instagram/:clienteId?t={token}
 * Não exige login no Jornada — só Facebook.
 */

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Instagram, CheckCircle2, AlertCircle, Loader2, Lock, ShieldCheck } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

export default function ConectarInstagram() {
  const { clienteId } = useParams()
  const [search] = useSearchParams()
  const token = search.get('t') || ''
  const igConnected = search.get('ig_connected')
  const igError = search.get('ig_error')

  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!token) {
      setError('Link inválido — token ausente')
      setLoading(false)
      return
    }
    fetch(`${API_BASE}/instagram/oauth/onboard-info?token=${encodeURIComponent(token)}`, {
      headers: { 'Accept': 'application/json' },
    })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.detail || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then(setInfo)
      .catch(err => setError(err.message || 'Erro ao validar link'))
      .finally(() => setLoading(false))
  }, [token])

  function startOAuth() {
    window.location.href = `${API_BASE}/instagram/oauth/onboard-start?token=${encodeURIComponent(token)}`
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg, #080808 0%, #1a1300 60%, #080808 100%)' }}
    >
      <div className="w-full max-w-md">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3"
            style={{
              background: 'linear-gradient(135deg, #F5D68A, #C9A84C, #8B6914)',
              boxShadow: '0 8px 24px rgba(201,168,76,0.25)',
            }}
          >
            <span className="font-display font-bold text-base" style={{ color: '#1a1300' }}>FLG</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-white">Jornada System</h1>
          <p className="text-xs text-white/40 mt-1">Conexão Instagram</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-7"
          style={{
            background: 'rgba(20,15,8,0.85)',
            border: '1px solid rgba(201,168,76,0.18)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,168,76,0.05)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {loading && (
            <div className="text-center py-4">
              <Loader2 size={28} className="mx-auto mb-3 text-gold-mid animate-spin" style={{ color: '#C9A84C' }} />
              <p className="text-sm text-white/50">Validando link…</p>
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-4">
              <AlertCircle size={32} className="mx-auto mb-3 text-red-400" />
              <h2 className="text-base font-semibold text-white mb-1">Link inválido</h2>
              <p className="text-xs text-white/50">{error}</p>
              <p className="text-[11px] text-white/30 mt-4">
                Peça ao seu consultor um link novo.
              </p>
            </div>
          )}

          {!loading && info && igConnected && (
            <div className="text-center py-4">
              <CheckCircle2 size={36} className="mx-auto mb-3 text-emerald-400" />
              <h2 className="text-lg font-semibold text-white mb-1">Conectado!</h2>
              <p className="text-xs text-white/50 mb-4">
                Instagram de <strong className="text-white/80">{info.cliente_nome}</strong> conectado com sucesso.
              </p>
              <p className="text-[11px] text-white/30">
                Pode fechar esta janela. Seu consultor já vai começar a ver as métricas.
              </p>
            </div>
          )}

          {!loading && info && igError && !igConnected && (
            <div className="text-center py-4">
              <AlertCircle size={32} className="mx-auto mb-3 text-amber-400" />
              <h2 className="text-base font-semibold text-white mb-1">Conexão interrompida</h2>
              <p className="text-xs text-white/50 mb-3">
                Não foi possível concluir a autorização. Você pode tentar novamente abaixo.
              </p>
              <p className="text-[10px] text-white/30 mb-4">{decodeURIComponent(igError)}</p>
              <button
                onClick={startOAuth}
                className="text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ background: '#C9A84C', color: '#1a1300' }}
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && info && !igConnected && !igError && (
            <>
              {info.ja_conectado ? (
                <div className="text-center py-2">
                  <CheckCircle2 size={28} className="mx-auto mb-3 text-emerald-400" />
                  <h2 className="text-base font-semibold text-white mb-1">Já está conectado</h2>
                  <p className="text-xs text-white/50">
                    O Instagram de <strong className="text-white/80">{info.cliente_nome}</strong>
                    {info.username_conectado && <> (<span style={{ color: '#C9A84C' }}>@{info.username_conectado}</span>)</>}
                    {' '}já está vinculado ao Jornada System.
                  </p>
                  <p className="text-[11px] text-white/30 mt-4">
                    Se quiser reconectar com outra conta, fale com seu consultor.
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-white mb-1">
                    Olá, {info.cliente_nome.split(' ')[0]}!
                  </h2>
                  <p className="text-xs text-white/55 mb-5">
                    Para que seu consultor da FLG acompanhe seus resultados em tempo real, conecte sua conta Instagram em um clique.
                  </p>

                  <div className="space-y-2.5 mb-6 text-[11px] text-white/55">
                    <div className="flex items-start gap-2">
                      <ShieldCheck size={13} style={{ color: '#34D399' }} className="mt-0.5 shrink-0" />
                      <span>Você autoriza pela tela oficial do Facebook (mesma do Meta Business Suite)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Lock size={13} style={{ color: '#34D399' }} className="mt-0.5 shrink-0" />
                      <span>Acessamos apenas métricas (alcance, engajamento, posts) — nunca publicamos por você</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 size={13} style={{ color: '#34D399' }} className="mt-0.5 shrink-0" />
                      <span>Pode revogar acesso a qualquer momento em <span className="text-white/70">facebook.com/settings</span></span>
                    </div>
                  </div>

                  <button
                    onClick={startOAuth}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-transform hover:scale-[1.02]"
                    style={{
                      background: 'linear-gradient(135deg, #F5D68A, #C9A84C, #8B6914)',
                      color: '#1a1300',
                      boxShadow: '0 8px 24px rgba(201,168,76,0.35)',
                    }}
                  >
                    <Instagram size={16} />
                    Conectar com Facebook
                  </button>

                  <p className="text-[10px] text-white/30 text-center mt-4">
                    Ao conectar, você aceita nossa{' '}
                    <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/60">
                      Política de Privacidade
                    </a>
                    .
                  </p>
                </>
              )}
            </>
          )}
        </motion.div>

        <p className="text-center text-[10px] text-white/25 mt-6">
          Founders Led Growth · FLG Jornada System
        </p>
      </div>
    </div>
  )
}
