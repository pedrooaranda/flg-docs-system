import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Users, ChevronRight } from 'lucide-react'
import { api } from '../../lib/api'

export default function DebriefingsHome() {
  const [clientes, setClientes] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    api('/clientes/list-for-debriefings')
      .then(data => { if (!cancelled) setClientes(data || []) })
      .catch(err => { if (!cancelled) setError(err?.message || 'Falha ao carregar clientes') })
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center text-red-400 text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-white">Clientes</h1>
        <p className="text-white/45 text-sm mt-1">Escolha um cliente pra acessar os debriefings</p>
      </div>

      {clientes === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card-flg p-5 animate-pulse">
              <div className="h-5 bg-white/5 rounded w-2/3 mb-2" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : clientes.length === 0 ? (
        <div className="card-flg p-12 text-center">
          <Users size={32} className="mx-auto text-white/20 mb-3" />
          <p className="text-white/55 text-sm">Nenhum cliente disponível no momento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clientes.map((c, idx) => (
            <motion.button
              key={c.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              onClick={() => navigate(`/debriefings/cliente/${c.id}`)}
              className="card-flg p-5 text-left hover:border-[#C9A84C]/40 transition-colors group flex items-center justify-between"
            >
              <div className="min-w-0 flex-1">
                <h3 className="text-white font-semibold truncate">{c.nome}</h3>
                <p className="text-white/45 text-xs mt-0.5 truncate">{c.empresa}</p>
              </div>
              <ChevronRight size={16} className="text-white/25 group-hover:text-[#C9A84C] flex-shrink-0 ml-3" />
            </motion.button>
          ))}
        </div>
      )}
    </div>
  )
}
