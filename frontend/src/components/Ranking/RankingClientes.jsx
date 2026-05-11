/**
 * Aba Clientes do Ranking — UX atual preservada.
 * Pega `ranking` (array de clientes) e `loading` via props do parent `Ranking/index.jsx`.
 * Seções: Atenção Master, Sala dos Troféus, Pódio Geral, Tabela completa, Consultores do mês.
 *
 * Consultores agregados são calculados client-side aqui mesmo (lógica antiga).
 * Na Phase 3 essa seção será removida em favor da aba Consultores dedicada com
 * endpoint server-side `/ranking-consultores`.
 */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, Crown, TrendingUp, Award, Sparkles, ShieldAlert } from 'lucide-react'
import AtencaoMasterCard from './shared/AtencaoMasterCard'
import DestaqueCard from './shared/DestaqueCard'
import PodiumCard from './shared/PodiumCard'
import RankRow from './shared/RankRow'
import ConsultorCard from './shared/ConsultorCard'
import { CATEGORIAS } from './shared/constants'

export default function RankingClientes({ ranking, loading }) {
  const navigate = useNavigate()

  // Maximums pra normalizar mini-bars
  const max = useMemo(() => {
    return ranking.reduce((acc, r) => ({
      eng: Math.max(acc.eng, r.taxa_engajamento || 0),
      aud: Math.max(acc.aud, r.audiencia || 0),
      posts: Math.max(acc.posts, r.posts_mes || 0),
    }), { eng: 0, aud: 0, posts: 0 })
  }, [ranking])

  // Agregar por consultor (funcionário do mês) — client-side legado.
  const consultores = useMemo(() => {
    const byCons = {}
    ranking.forEach(r => {
      const nome = r.consultor || 'Sem consultor'
      if (!byCons[nome]) byCons[nome] = { nome, clientes: [], engSoma: 0, audTotal: 0 }
      byCons[nome].clientes.push(r)
      byCons[nome].engSoma += r.taxa_engajamento || 0
      byCons[nome].audTotal += r.audiencia || 0
    })
    return Object.values(byCons)
      .filter(c => c.nome !== 'Sem consultor')
      .map(c => ({
        nome: c.nome,
        numClientes: c.clientes.length,
        engMedio: c.engSoma / Math.max(c.clientes.length, 1),
        audienciaTotal: c.audTotal,
      }))
      .sort((a, b) => b.engMedio - a.engMedio)
      .slice(0, 4)
      .map((c, i) => ({ ...c, rank: i }))
  }, [ranking])

  const top3 = ranking.slice(0, 3)
  const resto = ranking.slice(3)

  if (loading) {
    return <p className="text-white/40 text-sm">Carregando ranking…</p>
  }

  if (ranking.length === 0) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
        <Sparkles size={28} className="mx-auto mb-3 text-white/30" />
        <p className="text-sm text-white/55">Nenhum cliente com dados de Instagram conectado.</p>
        <p className="text-xs text-white/35 mt-1">Conecte clientes e aguarde o sync pra ver o ranking.</p>
      </div>
    )
  }

  // ─── Atenção Master: clientes em crise (>= 4 dias sem postar) ───────────────
  // Lógica original mantida 100% — promoção visual de exemplos pros 3 tiers.
  let emCrise = ranking
    .filter(r => (r.dias_sem_postar || 0) >= 4)
    .sort((a, b) => (b.dias_sem_postar || 0) - (a.dias_sem_postar || 0))

  const hasCritical = emCrise.some(r => r.dias_sem_postar >= 14)
  const hasHigh = emCrise.some(r => r.dias_sem_postar >= 7 && r.dias_sem_postar < 14)
  const hasMed = emCrise.some(r => r.dias_sem_postar >= 4 && r.dias_sem_postar < 7)

  if (!hasCritical || !hasHigh || !hasMed) {
    const oks = ranking.filter(r => (r.dias_sem_postar || 0) < 4)
    let oksIdx = 0
    const pickNext = () => oks[oksIdx++ % Math.max(oks.length, 1)]
    const demos = []
    if (!hasCritical && oks.length > 0) {
      const c = pickNext()
      if (c) demos.push({ ...c, dias_sem_postar: 18, _demo: true })
    }
    if (!hasHigh && oks.length > 0) {
      const c = pickNext()
      if (c) demos.push({ ...c, dias_sem_postar: 9, _demo: true })
    }
    if (!hasMed && oks.length > 0) {
      const c = pickNext()
      if (c) demos.push({ ...c, dias_sem_postar: 5, _demo: true })
    }
    emCrise = [...emCrise, ...demos].sort((a, b) => (b.dias_sem_postar || 0) - (a.dias_sem_postar || 0))
  }

  emCrise = emCrise.slice(0, 8)

  const counts = {
    critical: emCrise.filter(r => r.dias_sem_postar >= 14).length,
    high:     emCrise.filter(r => r.dias_sem_postar >= 7 && r.dias_sem_postar < 14).length,
    med:      emCrise.filter(r => r.dias_sem_postar >= 4 && r.dias_sem_postar < 7).length,
  }
  const totalCrise = emCrise.length

  return (
    <div className="space-y-8">
      {/* Atenção Master */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h2 className="text-xs font-semibold text-white/85 uppercase tracking-widest flex items-center gap-2">
            <ShieldAlert size={14} className="text-red-400" /> Atenção Master · clientes sem produzir conteúdo
            {totalCrise > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase ml-1"
                    style={{ background: 'rgba(239,68,68,0.20)', color: '#F87171', border: '1px solid rgba(239,68,68,0.35)' }}>
                {totalCrise} em alerta
              </span>
            )}
          </h2>
          {totalCrise > 0 && (
            <div className="flex items-center gap-2 text-[10px]">
              {counts.critical > 0 && (
                <span className="px-2 py-0.5 rounded font-bold" style={{ background: 'rgba(239,68,68,0.18)', color: '#EF4444' }}>
                  {counts.critical} CRÍTICO
                </span>
              )}
              {counts.high > 0 && (
                <span className="px-2 py-0.5 rounded font-bold" style={{ background: 'rgba(249,115,22,0.18)', color: '#F97316' }}>
                  {counts.high} CRISE
                </span>
              )}
              {counts.med > 0 && (
                <span className="px-2 py-0.5 rounded font-bold" style={{ background: 'rgba(251,191,36,0.18)', color: '#FBBF24' }}>
                  {counts.med} ATENÇÃO
                </span>
              )}
            </div>
          )}
        </div>
        {totalCrise === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.20)' }}>
            <Sparkles size={24} className="mx-auto mb-2 text-emerald-400" />
            <p className="text-sm font-semibold text-white/80">Tudo em dia</p>
            <p className="text-xs text-white/45 mt-1">Todos os clientes postaram nos últimos 3 dias.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {emCrise.map((item, i) => (
              <AtencaoMasterCard
                key={item.cliente_id}
                item={item}
                delay={i * 0.04}
                onResolve={(r) => navigate(`/clientes/${r.cliente_id}`)}
                onWhats={(r) => alert(`Iniciar tratativa com ${r.nome} — integração WhatsApp/email em breve`)}
                onPerfil={(r) => navigate(`/metricas/${r.cliente_id}/geral`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Sala dos Troféus */}
      <section>
        <h2 className="text-xs font-semibold text-white/65 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Trophy size={13} className="text-amber-400" /> Sala dos Troféus · destaques por categoria
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {CATEGORIAS.map(cat => (
            <DestaqueCard
              key={cat.key}
              categoria={cat}
              ranking={ranking}
              onClick={(winner) => navigate(`/metricas/${winner.cliente_id}/geral`)}
            />
          ))}
        </div>
      </section>

      {/* Pódio Geral */}
      {top3.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-white/65 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Crown size={13} className="text-amber-400" /> Pódio Geral
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="order-2 lg:order-1">
              {top3[1] && <PodiumCard rank={1} item={top3[1]} onClick={() => navigate(`/metricas/${top3[1].cliente_id}/geral`)} />}
            </div>
            <div className="order-1 lg:order-2">
              {top3[0] && <PodiumCard rank={0} item={top3[0]} onClick={() => navigate(`/metricas/${top3[0].cliente_id}/geral`)} />}
            </div>
            <div className="order-3">
              {top3[2] && <PodiumCard rank={2} item={top3[2]} onClick={() => navigate(`/metricas/${top3[2].cliente_id}/geral`)} />}
            </div>
          </div>
        </section>
      )}

      {/* Tabela completa */}
      {resto.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-white/65 uppercase tracking-widest mb-3 flex items-center gap-2">
            <TrendingUp size={13} /> Ranking completo
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--flg-border)' }}>
                    <th className="text-left px-3 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">#</th>
                    <th className="text-left px-3 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Cliente</th>
                    <th className="text-left px-3 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal hidden md:table-cell">Consultor</th>
                    <th className="text-right px-3 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Engajamento</th>
                    <th className="text-right px-3 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Audiência</th>
                    <th className="text-right px-3 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Posts/mês</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {resto.map((r, i) => (
                    <RankRow
                      key={r.cliente_id}
                      item={r}
                      rank={i + 3}
                      max={max}
                      delay={i * 0.02}
                      onClick={() => navigate(`/metricas/${r.cliente_id}/geral`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Consultores do mês — legado client-side, removido na Phase 3 */}
      {consultores.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-white/65 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Award size={13} className="text-amber-400" /> Consultores do mês
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {consultores.map(c => (
              <ConsultorCard key={c.nome} consultor={c} delay={c.rank * 0.08} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
