import { createContext, useContext, useState, useCallback } from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback(({ title, description, variant = 'default' }) => {
    const id = Date.now()
    setToasts(t => [...t, { id, title, description, variant }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  const icons = {
    success: <CheckCircle2 size={16} className="text-green-400 flex-shrink-0 mt-0.5" />,
    error:   <AlertCircle  size={16} className="text-red-400  flex-shrink-0 mt-0.5" />,
    default: <Info          size={16} className="text-gold-mid flex-shrink-0 mt-0.5" />,
  }

  return (
    <ToastContext.Provider value={toast}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map(t => (
          <ToastPrimitive.Root
            key={t.id}
            open={true}
            className="flex items-start gap-3 bg-[#1A1A1A] border border-white/10 rounded-lg p-4 shadow-xl w-80 animate-slide-in-right"
          >
            {icons[t.variant]}
            <div className="flex-1 min-w-0">
              {t.title && <ToastPrimitive.Title className="text-sm font-semibold text-white">{t.title}</ToastPrimitive.Title>}
              {t.description && <ToastPrimitive.Description className="text-xs text-white/60 mt-0.5">{t.description}</ToastPrimitive.Description>}
            </div>
            <ToastPrimitive.Close className="text-white/30 hover:text-white transition-colors flex-shrink-0">
              <X size={14} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 w-80" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
