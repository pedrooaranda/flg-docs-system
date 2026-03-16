export function Spinner({ size = 'md', className = '' }) {
  const s = { sm: 'w-4 h-4 border-2', md: 'w-6 h-6 border-2', lg: 'w-8 h-8 border-2' }[size]
  return (
    <div className={`${s} border-gold-mid border-t-transparent rounded-full animate-spin ${className}`} />
  )
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#080808]">
      <Spinner size="lg" />
    </div>
  )
}
