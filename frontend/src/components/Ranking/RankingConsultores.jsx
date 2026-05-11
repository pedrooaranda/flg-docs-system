/**
 * Aba Consultores do Ranking — implementação completa nas Phases 2-5.
 * Phase 1 entrega só o stub pra validar o roteamento de tabs.
 */

import { Users, Hammer } from 'lucide-react'

export default function RankingConsultores({ ranking, loading }) {
  if (loading) {
    return <p className="text-white/40 text-sm">Carregando ranking…</p>
  }
  return (
    <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
      <div className="flex items-center justify-center gap-3 mb-4">
        <Users size={32} className="text-amber-400/60" />
        <Hammer size={20} className="text-white/30" />
      </div>
      <p className="text-base font-semibold text-white/80 mb-1">Ranking de Consultores</p>
      <p className="text-xs text-white/40 max-w-md mx-auto leading-relaxed">
        Em construção. Em breve aqui você verá pódio dos consultores, troféus por categoria,
        atenção operacional, tabela completa e drill-down com integração ClickUp + entregas.
      </p>
    </div>
  )
}
