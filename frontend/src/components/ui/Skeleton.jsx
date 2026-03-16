import { cn } from '../../lib/utils'

export function Skeleton({ className }) {
  return (
    <div className={cn('animate-pulse rounded bg-white/5', className)} />
  )
}

export function SkeletonCard() {
  return (
    <div className="card-flg p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  )
}
