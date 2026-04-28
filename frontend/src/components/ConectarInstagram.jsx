/**
 * Página pública de onboarding Instagram via link assinado.
 * Acessada por: /conectar-instagram/:clienteId?t={token}
 * Não exige login no Jornada — só Facebook.
 */

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Instagram, CheckCircle2, AlertCircle, Loader2, Lock, ShieldCheck, ExternalLink } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

export default function ConectarInstagram() {
  const { clienteId } = useParams()
  const [search] = useSearchParams()
  const token = search.get('t') || ''
  const igConnected = search.get('ig_connected')
  const igError = search.get('ig_error')
  const igUsername = search.get('ig_username') || ''

  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Pre-check de pré-requisitos: cliente precisa confirmar que entendeu antes de autorizar
  const [confirmaProfissional, setConfirmaProfissional] = useState(false)
  const [confirmaAdmin, setConfirmaAdmin] = useState(false)
  const podeAutorizar = confirmaProfissional && confirmaAdmin

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
          <h1 className="font-display text-2xl font-bold text-white">Founders Led Growth</h1>
          <p className="text-[11px] text-white/40 mt-1 tracking-widest uppercase">Autorização de acesso</p>
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
              <Loader2 size={28} className="mx-auto mb-3 animate-spin" style={{ color: '#C9A84C' }} />
              <p className="text-sm text-white/50">Validando autorização…</p>
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-4">
              <AlertCircle size={32} className="mx-auto mb-3 text-red-400" />
              <h2 className="text-base font-semibold text-white mb-1">Link inválido ou expirado</h2>
              <p className="text-xs text-white/50">{error}</p>
              <p className="text-[11px] text-white/35 mt-4 leading-relaxed">
                Solicite ao seu consultor da FLG um novo link de autorização.
              </p>
            </div>
          )}

          {!loading && info && igConnected && (
            <div className="text-center py-4">
              <CheckCircle2 size={36} className="mx-auto mb-3 text-emerald-400" />
              <h2 className="text-lg font-semibold text-white mb-1">Acesso autorizado</h2>
              <p className="text-xs text-white/55 mb-4 leading-relaxed">
                O Instagram de <strong className="text-white/80">{info.cliente_nome}</strong> foi vinculado com sucesso ao Jornada System.
              </p>
              <p className="text-[11px] text-white/35 leading-relaxed">
                Pode encerrar esta janela. Seu consultor passará a acompanhar a evolução do perfil em detalhe a partir de agora.
              </p>
            </div>
          )}

          {!loading && info && igError && !igConnected && igError === 'account_personal' && (
            <div className="py-2">
              <AlertCircle size={32} className="mx-auto mb-3 text-amber-400" />
              <h2 className="text-base font-semibold text-white mb-2 text-center">
                Sua conta ainda é Pessoal
              </h2>
              <p className="text-xs text-white/65 mb-4 leading-relaxed text-center">
                {igUsername ? <>A conta <strong className="text-white/90">@{igUsername}</strong> autorizou,</> : 'A conta autorizou,'} mas o Instagram só libera métricas e insights pra contas <strong className="text-white/90">Profissionais</strong> (Comercial ou Criador). Sem isso a gente não consegue puxar nada.
              </p>

              <div
                className="rounded-lg p-3 mb-4 text-[11px] text-white/70"
                style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.20)' }}
              >
                <p className="font-semibold text-white/85 mb-1.5">Como mudar (1 minuto):</p>
                <ol className="space-y-1 list-decimal list-inside leading-relaxed">
                  <li>Abra o app do Instagram</li>
                  <li>Vá em <strong>Perfil → Menu (☰) → Configurações e privacidade</strong></li>
                  <li>Toque em <strong>Conta → Tipo de conta e ferramentas → Mudar para conta profissional</strong></li>
                  <li>Escolha <strong>Comercial</strong> ou <strong>Criador de conteúdo</strong> e siga os passos</li>
                  <li>Volte aqui e clique em "Tentar novamente"</li>
                </ol>
                <a
                  href="https://help.instagram.com/138925576130557"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2.5 text-[11px] text-amber-400 underline hover:text-amber-300"
                >
                  Tutorial oficial do Instagram <ExternalLink size={10} />
                </a>
              </div>

              <button
                onClick={startOAuth}
                className="w-full py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: '#C9A84C', color: '#1a1300' }}
              >
                Já mudei — Tentar novamente
              </button>
            </div>
          )}

          {!loading && info && igError && !igConnected && igError !== 'account_personal' && (
            <div className="text-center py-4">
              <AlertCircle size={32} className="mx-auto mb-3 text-amber-400" />
              <h2 className="text-base font-semibold text-white mb-1">Autorização não concluída</h2>
              <p className="text-xs text-white/55 mb-3 leading-relaxed">
                Houve uma interrupção no processo. Você pode tentar novamente sem problema — nada foi salvo até aqui.
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
                  <h2 className="text-base font-semibold text-white mb-1">Acesso já autorizado</h2>
                  <p className="text-xs text-white/55 leading-relaxed">
                    O Instagram de <strong className="text-white/80">{info.cliente_nome}</strong>
                    {info.username_conectado && <> (<span style={{ color: '#C9A84C' }}>@{info.username_conectado}</span>)</>}
                    {' '}já está vinculado ao Jornada System. Seu consultor tem visibilidade completa sobre os resultados.
                  </p>
                  <p className="text-[11px] text-white/35 mt-4 leading-relaxed">
                    Para vincular outra conta, fale diretamente com seu consultor da FLG.
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-white mb-1.5">
                    Olá, {info.cliente_nome.split(' ')[0]}.
                  </h2>
                  <p className="text-xs text-white/60 mb-5 leading-relaxed">
                    Esta é a etapa de autorização para que seu consultor da FLG acompanhe seu perfil no Instagram em profundidade e analise os resultados de forma contínua, gerando recomendações estratégicas baseadas em dados.
                  </p>

                  <div className="space-y-2.5 mb-5 text-[11px] text-white/60">
                    <div className="flex items-start gap-2">
                      <ShieldCheck size={13} style={{ color: '#34D399' }} className="mt-0.5 shrink-0" />
                      <span>Autorização realizada pela tela oficial do Meta — a mesma utilizada no Business Suite.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Lock size={13} style={{ color: '#34D399' }} className="mt-0.5 shrink-0" />
                      <span>Acesso exclusivamente de leitura: métricas, posts, insights e comentários. Em nenhum momento publicamos ou interagimos em seu nome.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 size={13} style={{ color: '#34D399' }} className="mt-0.5 shrink-0" />
                      <span>Você pode revogar o acesso a qualquer momento nas configurações do Instagram.</span>
                    </div>
                  </div>

                  {/* Pre-check de pré-requisitos — Personal não funciona com Insights */}
                  <div
                    className="rounded-xl p-3.5 mb-4"
                    style={{
                      background: 'rgba(201,168,76,0.06)',
                      border: '1px solid rgba(201,168,76,0.20)',
                    }}
                  >
                    <p className="text-[11px] font-semibold text-white/85 mb-2.5">
                      Antes de autorizar, confirme:
                    </p>
                    <label className="flex items-start gap-2.5 mb-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={confirmaProfissional}
                        onChange={e => setConfirmaProfissional(e.target.checked)}
                        className="mt-0.5 shrink-0 cursor-pointer accent-amber-400"
                      />
                      <span className="text-[11px] text-white/70 leading-relaxed group-hover:text-white/90">
                        Minha conta no Instagram é <strong className="text-white/95">Profissional</strong> (Comercial ou Criador de conteúdo).{' '}
                        <a
                          href="https://help.instagram.com/138925576130557"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-amber-400 hover:text-amber-300"
                        >
                          Como verificar
                        </a>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={confirmaAdmin}
                        onChange={e => setConfirmaAdmin(e.target.checked)}
                        className="mt-0.5 shrink-0 cursor-pointer accent-amber-400"
                      />
                      <span className="text-[11px] text-white/70 leading-relaxed group-hover:text-white/90">
                        Eu sou o <strong className="text-white/95">administrador</strong> dessa conta (logo agora no app do Instagram).
                      </span>
                    </label>
                    {!podeAutorizar && (
                      <p className="text-[10px] text-white/40 mt-3 leading-relaxed">
                        Conta Pessoal não funciona — o Instagram bloqueia acesso a métricas. Se ainda for Pessoal, mude em <em>Configurações → Conta → Mudar para profissional</em> antes de continuar.
                      </p>
                    )}
                  </div>

                  <button
                    onClick={startOAuth}
                    disabled={!podeAutorizar}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all"
                    style={{
                      background: podeAutorizar
                        ? 'linear-gradient(135deg, #F5D68A, #C9A84C, #8B6914)'
                        : 'rgba(255,255,255,0.05)',
                      color: podeAutorizar ? '#1a1300' : 'rgba(255,255,255,0.30)',
                      boxShadow: podeAutorizar ? '0 8px 24px rgba(201,168,76,0.35)' : 'none',
                      cursor: podeAutorizar ? 'pointer' : 'not-allowed',
                      transform: 'scale(1)',
                    }}
                    onMouseEnter={e => podeAutorizar && (e.currentTarget.style.transform = 'scale(1.02)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <Instagram size={16} />
                    Autorizar acesso pelo Instagram
                  </button>

                  <p className="text-[10px] text-white/35 text-center mt-4 leading-relaxed">
                    Ao continuar, você concorda com nossa{' '}
                    <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/60">
                      Política de Privacidade
                    </a>{' '}
                    e{' '}
                    <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/60">
                      Termos de Uso
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
