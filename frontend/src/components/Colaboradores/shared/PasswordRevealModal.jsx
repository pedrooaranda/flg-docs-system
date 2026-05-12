import { useState, useEffect } from 'react'
import { X, Copy, CheckCircle2, AlertTriangle } from 'lucide-react'

/**
 * Modal de revelação de senha temporária. Aparece UMA vez após admin criar
 * colaborador novo (com auth.users criado automaticamente pelo backend).
 *
 * @param open - boolean
 * @param password - string da senha gerada
 * @param email - email do colaborador criado
 * @param nome - nome pra contexto humano
 * @param onClose - fecha modal (depois disso senha some — admin precisa ter copiado)
 */
export default function PasswordRevealModal({ open, password, email, nome, onClose }) {
  const [copied, setCopied] = useState(false)

  // Reset estado quando modal abre
  useEffect(() => {
    if (open) setCopied(false)
  }, [open])

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (e) {
      // Fallback se clipboard API não disponível (HTTP sem TLS ou navegador antigo)
      console.warn('Clipboard não disponível, selecione a senha manualmente')
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="rounded-2xl w-full max-w-md"
        style={{ background: 'var(--flg-bg-secondary)', border: '1px solid rgba(201,168,76,0.30)' }}
      >
        <div
          className="flex items-center justify-between p-5 border-b"
          style={{ borderColor: 'var(--flg-border)' }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-emerald-400" />
            <h2 className="font-display text-lg font-bold text-white">Colaborador criado</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white cursor-pointer transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm text-white/85">
              <span className="font-semibold text-white">{nome}</span> foi cadastrado(a).
            </p>
            <p className="text-xs text-white/55 mt-1">
              Conta criada no Supabase Auth com senha temporária. Compartilhe a senha abaixo
              com o(a) colaborador(a) — ele(a) poderá trocar no primeiro login.
            </p>
          </div>

          <div>
            <label className="block text-[10px] tracking-widest uppercase text-white/45 font-semibold mb-2">
              Email
            </label>
            <div
              className="px-3 py-2 rounded-lg text-sm text-white/85 font-mono"
              style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}
            >
              {email}
            </div>
          </div>

          <div>
            <label className="block text-[10px] tracking-widest uppercase text-white/45 font-semibold mb-2">
              Senha temporária
            </label>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 px-3 py-2.5 rounded-lg text-base font-mono tracking-wider select-all"
                style={{
                  background: 'var(--flg-bg-raised)',
                  border: '1px solid rgba(201,168,76,0.40)',
                  color: '#C9A84C',
                }}
              >
                {password}
              </div>
              <button
                onClick={copyPassword}
                className="px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                style={{
                  background: copied ? 'rgba(52,211,153,0.20)' : '#C9A84C',
                  color: copied ? '#34D399' : '#080808',
                  border: copied ? '1px solid rgba(52,211,153,0.40)' : 'none',
                }}
              >
                {copied ? (
                  <>
                    <CheckCircle2 size={13} /> Copiado
                  </>
                ) : (
                  <>
                    <Copy size={13} /> Copiar
                  </>
                )}
              </button>
            </div>
          </div>

          <div
            className="rounded-lg p-3 flex items-start gap-2"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}
          >
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-400">Senha aparece apenas uma vez</p>
              <p className="text-[11px] text-white/55 mt-0.5">
                Após fechar este modal, a senha não será mostrada de novo. Salve em local seguro.
              </p>
            </div>
          </div>
        </div>

        <div
          className="flex items-center justify-end p-5 border-t"
          style={{ borderColor: 'var(--flg-border)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer"
            style={{ background: '#C9A84C', color: '#080808' }}
          >
            Entendi, senha salva
          </button>
        </div>
      </div>
    </div>
  )
}
