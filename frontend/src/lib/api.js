import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || '/api'

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')
  return session.access_token
}

export async function api(path, options = {}) {
  const token = await getToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

/**
 * SSE streaming fetch. Returns a cancel function.
 * Pass an AbortSignal via options.signal to cancel externally.
 */
export async function apiStream(path, body, onChunk, onDone, signal) {
  const token = await getToken()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))
          if (event.type === 'text_delta') onChunk(event.content)
          if (event.type === 'done') onDone(event)
        } catch {}
      }
    }
  } finally {
    reader.cancel()
  }
}

/**
 * SSE consumer pra endpoints GET que precisam de Authorization header
 * (EventSource nativa não suporta headers customizados, daí fetch + stream).
 *
 * onEvent recebe cada evento parseado como objeto: { type, data }.
 * Encerra automaticamente quando recebe event com type === 'done' ou 'error'.
 * Retorna uma promise que resolve quando a conexão fecha.
 */
export async function apiStreamGet(path, onEvent, signal) {
  const token = await getToken()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'text/event-stream',
    },
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))
          onEvent(event)
          if (event.type === 'done' || event.type === 'error') return
        } catch {}
      }
    }
  } finally {
    reader.cancel()
  }
}

export async function uploadImagemEncontro(encontroNumero, tipo, file) {
  const token = await getToken()
  const form = new FormData()
  form.append('encontro_numero', encontroNumero)
  form.append('tipo', tipo)
  form.append('file', file)

  const res = await fetch(`${API_URL}/upload-imagem-encontro`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

/**
 * POST /debriefings via multipart/form-data — usado quando o consultor anexa
 * um arquivo de perspectiva (PDF/DOCX/MD/TXT). O backend (T2) detecta o
 * content-type e desempacota o form em DebriefingCreate + file opcional.
 *
 * payload: campos JSON-like do DebriefingCreate (cliente_id, ciclo_numero, etc).
 * file:    File object (browser põe o boundary automaticamente; não setar Content-Type).
 */
export async function createDebriefingMultipart(payload, file) {
  const token = await getToken()
  const form = new FormData()
  for (const [key, value] of Object.entries(payload)) {
    if (value !== null && value !== undefined) form.append(key, String(value))
  }
  if (file) form.append('file', file)
  const res = await fetch(`${API_URL}/debriefings`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function uploadPdf(clientId, docType, file) {
  const token = await getToken()
  const form = new FormData()
  form.append('client_id', clientId)
  form.append('doc_type', docType)
  form.append('file', file)

  const res = await fetch(`${API_URL}/upload-pdf`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}
