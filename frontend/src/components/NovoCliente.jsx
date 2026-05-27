import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { api } from '../lib/api'
import { useUserScope } from '../hooks/useUserScope'
import { Spinner } from './ui/Spinner'
import { cn } from '../lib/utils'

const CAMPOS = [
  { key: 'nome',                  label: 'Nome do Founder',       required: true,  textarea: false },
  { key: 'empresa',               label: 'Empresa',               required: true,  textarea: false },
  // consultor_responsavel é renderizado separadamente (select vs readonly)
  { key: 'estrategista',          label: 'Estrategista',          required: false, textarea: false },
  { key: 'clickup_task_id',       label: 'ClickUp Task ID',       required: false, textarea: false },
  { key: 'tom_de_voz',            label: 'Tom de Voz',            required: false, textarea: true  },
  { key: 'pontos_fortes',         label: 'Pontos Fortes',         required: false, textarea: true  },
  { key: 'travas_conhecidas',     label: 'Travas Conhecidas',     required: false, textarea: true  },
  { key: 'situacao_atual',        label: 'Situação Atual',        required: false, textarea: true  },
  { key: 'objetivo_em_6_meses',   label: 'Objetivo em 6 Meses',  required: false, textarea: true  },
  { key: 'principal_dor_hoje',    label: 'Principal Dor Hoje',    required: false, textarea: true  },
]

const CAMPOS_OBRIGATORIOS = CAMPOS.filter(c => c.required)
const CAMPOS_OPCIONAIS = CAMPOS.filter(c => !c.required)

export default function NovoCliente() {
  const navigate = useNavigate()
  const { canSeeAll, myConsultorId, myConsultorNome, isLoading: scopeLoading } = useUserScope()
  const [colaboradores, setColaboradores] = useState([])
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!canSeeAll) return  // consultor regular não precisa da lista
    api('/colaboradores?categoria=consultor&ativo=true')
      .then(data => setColaboradores(data.colaboradores || []))
      .catch(() => setColaboradores([]))
  }, [canSeeAll])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = { ...form, encontro_atual: 1 }
      // Para consultor regular, backend força consultor_id = self — mas enviamos
      // mesmo assim pra clareza. Para admin/diretor, vem do select.
      if (!canSeeAll && myConsultorId) {
        payload.consultor_id = myConsultorId
        payload.consultor_responsavel = myConsultorNome || payload.consultor_responsavel
      }
      const c = await api('/clientes', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      navigate(`/clientes/${c.id}`)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  function renderField({ key, label, required, textarea }) {
    const sharedClass = cn(
      'input-flg w-full',
      textarea && 'resize-none'
    )
    return (
      <div key={key}>
        <label className="block text-[10px] tracking-widest uppercase text-white/35 mb-2">
          {label}
          {required && <span className="text-gold-mid ml-1">*</span>}
        </label>
        {textarea ? (
          <textarea
            rows={3}
            value={form[key] || ''}
            onChange={e => set(key, e.target.value)}
            className={sharedClass}
          />
        ) : (
          <input
            type="text"
            required={required}
            value={form[key] || ''}
            onChange={e => set(key, e.target.value)}
            className={sharedClass}
          />
        )}
      </div>
    )
  }

  function renderConsultorField() {
    const sharedClass = 'input-flg w-full'
    return (
      <div key="consultor_responsavel">
        <label className="block text-[10px] tracking-widest uppercase text-white/35 mb-2">
          Consultor Responsável
          <span className="text-gold-mid ml-1">*</span>
        </label>
        {canSeeAll ? (
          <select
            value={form.consultor_id || ''}
            onChange={e => {
              const id = e.target.value
              const col = colaboradores.find(c => c.id === id)
              setForm(f => ({
                ...f,
                consultor_id: id || null,
                consultor_responsavel: col?.nome || '',
              }))
            }}
            className={sharedClass}
          >
            <option value="">— Sem consultor —</option>
            {colaboradores.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={myConsultorNome || '(você)'}
            readOnly
            className={cn(sharedClass, 'opacity-60 cursor-default')}
          />
        )}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-6 max-w-2xl mx-auto"
    >
      {/* Back */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors mb-8"
      >
        <ArrowLeft size={14} />
        Dashboard
      </button>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center">
          <UserPlus size={18} className="text-[#080808]" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Novo Cliente</h1>
          <p className="text-sm text-white/30 mt-0.5">Cadastrar founder na jornada FLG</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Dados obrigatórios */}
        <div className="card-flg p-5 space-y-4">
          <p className="text-[10px] tracking-widest uppercase text-white/30">Informações Básicas</p>
          {CAMPOS_OBRIGATORIOS.map(renderField)}
          {scopeLoading ? (
            <div className="flex items-center gap-2 text-white/30 text-sm">
              <Spinner size="sm" /> Carregando permissões…
            </div>
          ) : renderConsultorField()}
        </div>

        {/* Perfil do cliente */}
        <div className="card-flg p-5 space-y-4">
          <p className="text-[10px] tracking-widest uppercase text-white/30">Perfil do Founder</p>
          <p className="text-xs text-white/30 -mt-2 pb-1">Opcional — pode ser preenchido depois ou pelo agente de rotina.</p>
          {CAMPOS_OPCIONAIS.map(renderField)}
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 px-4 py-3 rounded-lg">
            {error}
          </p>
        )}

        <div className="flex gap-3 pb-4">
          <button
            type="submit"
            disabled={loading || scopeLoading}
            className="btn-gold flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
          >
            {loading ? <><Spinner size="sm" /> Criando…</> : <><UserPlus size={15} /> Criar Cliente</>}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn-ghost"
          >
            Cancelar
          </button>
        </div>
      </form>
    </motion.div>
  )
}
