import { Crown, Shield } from 'lucide-react'

// Tier (seniority) — cores escolhidas pra hierarquia visual: cinza → azul → dourado FLG → roxo.
export const TIER_CONFIG = {
  junior: { label: 'Junior', color: 'rgba(255,255,255,0.65)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.18)' },
  pleno:  { label: 'Pleno',  color: '#60A5FA',                 bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.30)' },
  senior: { label: 'Sênior', color: '#C9A84C',                 bg: 'rgba(201,168,76,0.12)',  border: 'rgba(201,168,76,0.35)' },
  lead:   { label: 'Lead',   color: '#A78BFA',                 bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.35)' },
}

// Role (permissão) — owner usa amarelo dourado (coroa), admin usa dourado FLG (escudo), member sem badge.
export const ROLE_CONFIG = {
  owner:  { label: 'Owner',  color: '#FACC15', bg: 'rgba(250,204,21,0.12)', border: 'rgba(250,204,21,0.35)', icon: Crown },
  admin:  { label: 'Admin',  color: '#C9A84C', bg: 'rgba(201,168,76,0.12)', border: 'rgba(201,168,76,0.35)', icon: Shield },
  member: null,
}

export const CATEGORIA_CONFIG = {
  consultor: { label: 'Consultor' },
  diretor:   { label: 'Diretor' },
}

// Enums em arrays — usados em dropdowns de formulário e validação.
export const TIERS      = ['junior', 'pleno', 'senior', 'lead']
export const ROLES      = ['owner', 'admin', 'member']
export const CATEGORIAS = ['consultor', 'diretor']

// Campos que member pode editar do próprio registro. Espelha SELF_EDITABLE_FIELDS
// no backend (backend/routes/colaboradores.py) — manter sincronizado.
export const SELF_EDITABLE_FIELDS = new Set(['nome', 'cargo', 'avatar_url'])

// Classe utilitária pra inputs do modal (form fields).
export const INPUT_CLASS = "w-full px-3 py-2 rounded-lg text-sm bg-[var(--flg-bg-raised)] border border-[var(--flg-border)] text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A84C]/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
