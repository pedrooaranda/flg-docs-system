import { initials, cn } from '../../lib/utils'

export function Avatar({ name, size = 'md', className }) {
  const sizes = {
    sm:  'w-7 h-7 text-xs',
    md:  'w-9 h-9 text-sm',
    lg:  'w-12 h-12 text-base',
    xl:  'w-16 h-16 text-lg',
    '2xl': 'w-20 h-20 text-xl',
  }
  return (
    <div className={cn(
      'rounded-full flex items-center justify-center font-semibold flex-shrink-0',
      'bg-[rgba(201,168,76,0.12)] border border-[rgba(201,168,76,0.25)] text-gold-mid',
      sizes[size],
      className
    )}>
      {initials(name)}
    </div>
  )
}
