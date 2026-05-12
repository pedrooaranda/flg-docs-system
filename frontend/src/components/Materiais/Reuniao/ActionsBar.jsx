/**
 * ActionsBar — botões de geração / publicação / revogação.
 *
 * Estados visuais derivados de pratica:
 *   - html_pratica null → só "Gerar HTML" disponível
 *   - html_pratica preenchido → "Gerar de novo" + "Marcar pronto"
 *   - status=pronto + slug ativo → "Apresentar" (abre slug, Phase D) + "Revogar"
 */

import { useState } from 'react'
import { Sparkles, Check, Link2Off, Copy, ExternalLink, RotateCw } from 'lucide-react'
import { api } from '../../../lib/api'
import { useToast } from '../../../lib/toast'
import { Spinner } from '../../ui/Spinner'

// Backend serve direto via /api/* (Traefik routing). Slug é a credencial.
const APRESENTAR_BASE = '/api/apresentar'

export default function ActionsBar({ pratica, onChanged, cliente, encontroNumero }) {
  const toast = useToast()
  const [busy, setBusy] = useState(null)  // string identificando ação em curso

  const cid = cliente.id
  const hasHtml = !!(pratica?.html_pratica && pratica.html_pratica.trim())
  const isPronto = pratica?.status === 'pronto'
  const slugAtivo = pratica?.slug && !pratica?.slug_revogado_at
  const numConversa = (pratica?.conversa_chat || []).length

  async function gerarHtml() {
    if (busy) return
    if (numConversa < 2) {
      toast?.({ title: 'Converse com Claude primeiro pra criar o contexto', variant: 'warning' })
      return
    }
    setBusy('gerar')
    try {
      const updated = await api(`/reunioes/${cid}/${encontroNumero}/gerar`, { method: 'POST' })
      onChanged?.(updated)
      toast?.({ title: `HTML gerado (${updated.num_slides_pratica} slides)`, variant: 'success' })
    } catch (e) {
      toast?.({ title: `Erro: ${e.message}`, variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  async function marcarPronto() {
    if (busy) return
    if (!hasHtml) {
      toast?.({ title: 'Gere o HTML antes de marcar como pronto', variant: 'warning' })
      return
    }
    setBusy('pronto')
    try {
      const updated = await api(`/reunioes/${cid}/${encontroNumero}/marcar-pronto`, { method: 'POST' })
      onChanged?.(updated)
      toast?.({ title: 'Marcado como pronto — slug público gerado', variant: 'success' })
    } catch (e) {
      toast?.({ title: `Erro: ${e.message}`, variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  async function revogar() {
    if (busy || !slugAtivo) return
    setBusy('revogar')
    try {
      const updated = await api(`/reunioes/${cid}/${encontroNumero}/revogar`, { method: 'POST' })
      onChanged?.(updated)
      toast?.({ title: 'Slug revogado', variant: 'success' })
    } catch (e) {
      toast?.({ title: `Erro: ${e.message}`, variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  async function copiarHtml() {
    if (!hasHtml) return
    try {
      await navigator.clipboard.writeText(pratica.html_pratica)
      toast?.({ title: 'HTML prática copiado', variant: 'success' })
    } catch {
      toast?.({ title: 'Não foi possível copiar (clipboard bloqueado)', variant: 'error' })
    }
  }

  function abrirApresentacao() {
    if (!slugAtivo) return
    const url = `${APRESENTAR_BASE}/${pratica.slug}`
    window.open(url, '_blank', 'noopener')
  }

  const Btn = ({ onClick, disabled, busyKey, icon: Icon, label, primary = false, danger = false }) => (
    <button
      onClick={onClick}
      disabled={disabled || !!busy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold transition-all"
      style={{
        background: danger
          ? 'rgba(239,68,68,0.10)'
          : primary
            ? 'rgba(201,168,76,0.18)'
            : 'rgba(255,255,255,0.04)',
        border: `1px solid ${danger ? 'rgba(239,68,68,0.30)' : primary ? 'rgba(201,168,76,0.35)' : 'rgba(255,255,255,0.10)'}`,
        color: disabled
          ? 'rgba(255,255,255,0.25)'
          : danger ? '#F87171' : primary ? '#C9A84C' : 'rgba(255,255,255,0.7)',
        cursor: disabled || busy ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {busy === busyKey ? <Spinner size="xs" /> : <Icon size={12} />}
      {label}
    </button>
  )

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Btn
        onClick={gerarHtml}
        disabled={numConversa < 2}
        busyKey="gerar"
        icon={hasHtml ? RotateCw : Sparkles}
        label={hasHtml ? 'Gerar de novo' : 'Gerar HTML'}
        primary={!hasHtml}
      />

      {hasHtml && (
        <Btn
          onClick={marcarPronto}
          disabled={isPronto && slugAtivo}
          busyKey="pronto"
          icon={Check}
          label={isPronto && slugAtivo ? 'Pronto ✓' : 'Marcar pronto'}
          primary={!isPronto || !slugAtivo}
        />
      )}

      {slugAtivo && (
        <>
          <Btn
            onClick={abrirApresentacao}
            icon={ExternalLink}
            label="Apresentar"
            primary
          />
          <Btn
            onClick={revogar}
            busyKey="revogar"
            icon={Link2Off}
            label="Revogar"
            danger
          />
        </>
      )}

      {hasHtml && (
        <Btn onClick={copiarHtml} icon={Copy} label="Copy HTML" />
      )}
    </div>
  )
}
