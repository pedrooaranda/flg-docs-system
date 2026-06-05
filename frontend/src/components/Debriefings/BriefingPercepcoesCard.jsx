/**
 * Card "Percepções dos consultores" — sub-projeto 3 Debriefings.
 *
 * Renderizado no topo de ClienteHub (/debriefings/cliente/:id). Lista todas
 * as percepções escritas por consultores pra esse cliente. Cada item
 * expansível inline.
 *
 * Texto renderizado como pre-line (preserva quebras de linha) — sem markdown
 * sofisticado, percepções são texto simples.
 */
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lightbulb, ChevronDown } from 'lucide-react'
import { api } from '../../lib/api'

function relativeTime(iso) {
  if (!iso) return ''
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.max(0, now - then)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora há pouco'
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function PercepcaoCard({ item }) {
  const [expanded, setExpanded] = useState(false)
  const preview = (item.conteudo || '').slice(0, 200).trim() || '(vazio)'
  const hasMore = (item.conteudo || '').length > 200

  return (
    <div className="card-flg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white">{item.consultor_nome}</span>
        <span className="text-xs text-white/40">{relativeTime(item.atualizado_em)}</span>
      </div>
      {!expanded ? (
        <>
          <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line">
            {preview}{hasMore && '…'}
          </p>
          {hasMore && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-2 text-xs text-[#C9A84C] hover:underline flex items-center gap-1"
            >
              Ver completo <ChevronDown size={12} />
            </button>
          )}
        </>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">
              {item.conteudo || '(vazio)'}
            </p>
            <button
              onClick={() => setExpanded(false)}
              className="mt-2 text-xs text-white/45 hover:text-white/70"
            >
              Recolher
            </button>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}

export default function BriefingPercepcoesCard({ clienteId }) {
  const [percepcoes, setPercepcoes] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    api(`/briefings-consultor/cliente/${clienteId}`)
      .then(data => { if (!cancelled) setPercepcoes(data || []) })
      .catch(err => { if (!cancelled) setError(err?.message || 'Falha ao carregar percepções') })
    return () => { cancelled = true }
  }, [clienteId])

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb size={16} className="text-[#C9A84C]" />
        <h3 className="text-sm font-semibold text-white">Percepções dos consultores</h3>
      </div>
      <p className="text-xs text-white/45 mb-4">
        Insumo escrito pelos consultores que tocaram esse cliente.
      </p>

      {error ? (
        <div className="card-flg p-4 text-red-400 text-sm">{error}</div>
      ) : percepcoes === null ? (
        <div className="card-flg p-4 text-white/45 text-sm">Carregando…</div>
      ) : percepcoes.length === 0 ? (
        <div className="card-flg p-6 text-center">
          <p className="text-white/55 text-sm">
            Nenhum consultor registrou percepção ainda. Você pode gerar o debriefing
            mesmo assim com os dados do ClickUp/Drive.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {percepcoes.map(p => <PercepcaoCard key={p.consultor_id} item={p} />)}
        </div>
      )}
    </div>
  )
}
