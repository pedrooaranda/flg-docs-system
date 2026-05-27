/**
 * ClientCardSkeleton — placeholder visual durante load do /clientes/summary.
 * Mimica EXATAMENTE o layout do ClientCard final (zero layout shift / CLS).
 */
export default function ClientCardSkeleton() {
  return (
    <div className="card-flg p-5 animate-pulse">
      {/* Linha 1: status + encontro */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-20 rounded bg-white/10" />
        <div className="h-5 w-10 rounded-full bg-white/10" />
      </div>

      {/* Linha 2: avatar + nome + empresa */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded bg-white/10" />
          <div className="h-3 w-24 rounded bg-white/5" />
        </div>
      </div>

      {/* Linha 3: progresso */}
      <div className="space-y-2 mb-3">
        <div className="flex justify-between">
          <div className="h-3 w-16 rounded bg-white/5" />
          <div className="h-3 w-12 rounded bg-white/5" />
        </div>
        <div className="h-1.5 bg-white/5 rounded-full" />
      </div>

      {/* Linha 4: métricas IG (3 blocos) */}
      <div className="flex items-center gap-4 mb-3">
        <div className="h-3 w-14 rounded bg-white/5" />
        <div className="h-3 w-14 rounded bg-white/5" />
        <div className="h-3 w-14 rounded bg-white/5" />
      </div>

      {/* Linha 5: consultor + data */}
      <div className="flex justify-between">
        <div className="h-3 w-20 rounded bg-white/5" />
        <div className="h-3 w-16 rounded bg-white/5" />
      </div>
    </div>
  )
}
