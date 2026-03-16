import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, uploadPdf } from '../lib/api'

const CAMPOS_EDITAVEIS = [
  { key: 'tom_de_voz',           label: 'Tom de Voz' },
  { key: 'pontos_fortes',        label: 'Pontos Fortes' },
  { key: 'travas_conhecidas',    label: 'Travas Conhecidas' },
  { key: 'ansiedades',           label: 'Ansiedades' },
  { key: 'situacao_atual',       label: 'Situação Atual' },
  { key: 'objetivo_em_6_meses',  label: 'Objetivo em 6 Meses' },
  { key: 'principal_dor_hoje',   label: 'Principal Dor Hoje' },
]

export default function PerfilCliente() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(null)
  const fileInputRef = useRef()
  const [pendingDocType, setPendingDocType] = useState(null)

  useEffect(() => {
    api(`/clientes/${clientId}`)
      .then(data => { setCliente(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [clientId])

  async function handleUploadPdf(docType) {
    setPendingDocType(docType)
    fileInputRef.current.click()
  }

  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file || !pendingDocType) return
    e.target.value = ''
    setUploading(pendingDocType)
    try {
      await uploadPdf(clientId, pendingDocType, file)
      alert(`PDF de ${pendingDocType} processado com sucesso!`)
    } catch (err) {
      alert(`Erro: ${err.message}`)
    } finally {
      setUploading(null)
      setPendingDocType(null)
    }
  }

  if (loading) return <div className="flex justify-center items-center min-h-screen"><div className="w-8 h-8 border-2 border-gold-mid border-t-transparent rounded-full animate-spin" /></div>
  if (!cliente) return <div className="text-center py-20 text-white/40">Cliente não encontrado</div>

  const encontroAtual = cliente.encontro_atual || 1

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/5 px-8 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="text-white/40 hover:text-white text-sm transition-colors">← Dashboard</button>
        <span className="text-white/20">/</span>
        <span className="text-white/70">{cliente.nome}</span>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-10">
        {/* Header do cliente */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="font-display text-4xl font-bold gold-text">{cliente.nome}</h1>
            <p className="text-xl text-white/50 mt-1">{cliente.empresa}</p>
            <p className="text-sm text-white/30 mt-2">Consultor: {cliente.consultor_responsavel}</p>
          </div>
          <div className="text-right">
            <div className="text-5xl font-display font-bold gold-text">E{encontroAtual}</div>
            <p className="text-white/40 text-sm">de 15 encontros</p>
          </div>
        </div>

        {/* Encontros */}
        <section className="mb-10">
          <h2 className="text-xs tracking-widest uppercase text-white/40 mb-4">Jornada</h2>
          <div className="grid grid-cols-5 md:grid-cols-10 lg:grid-cols-15 gap-2">
            {Array.from({ length: 15 }, (_, i) => i + 1).map(n => {
              const feito = (cliente.encontros_realizados || []).find(e => e.encontro_numero === n)
              const atual = n === encontroAtual
              return (
                <button
                  key={n}
                  onClick={() => navigate(`/clientes/${clientId}/encontro/${n}`)}
                  className={`aspect-square rounded flex items-center justify-center text-sm font-semibold transition-all
                    ${feito ? 'border border-gold-mid/60 text-gold-mid' :
                      atual ? 'border-2 border-gold-mid text-white' :
                      'border border-white/10 text-white/20 hover:border-white/30'}`}
                >
                  {n}
                </button>
              )
            })}
          </div>
        </section>

        {/* Perfil */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {CAMPOS_EDITAVEIS.map(({ key, label }) => (
            <div key={key} className="card-flg p-4">
              <p className="text-xs tracking-widest uppercase text-white/40 mb-2">{label}</p>
              <p className="text-sm text-white/80 leading-relaxed">{cliente[key] || <span className="text-white/20 italic">Não informado</span>}</p>
            </div>
          ))}
        </section>

        {/* Upload de PDFs */}
        <section>
          <h2 className="text-xs tracking-widest uppercase text-white/40 mb-4">Documentos</h2>
          <div className="flex gap-4">
            <button
              onClick={() => handleUploadPdf('planejamento')}
              disabled={!!uploading}
              className="card-flg px-5 py-3 text-sm text-white/70 hover:text-white hover:border-gold-mid/50 transition-all disabled:opacity-50"
            >
              {uploading === 'planejamento' ? '⏳ Processando…' : '📄 Upload Planejamento Estratégico'}
            </button>
            <button
              onClick={() => handleUploadPdf('estudo')}
              disabled={!!uploading}
              className="card-flg px-5 py-3 text-sm text-white/70 hover:text-white hover:border-gold-mid/50 transition-all disabled:opacity-50"
            >
              {uploading === 'estudo' ? '⏳ Processando…' : '📊 Upload Estudo de Mercado'}
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
        </section>
      </main>
    </div>
  )
}
