-- Migration 008 — Perspectiva do consultor nos Debriefings
-- A aplicar manualmente no Supabase Dashboard (VPS sem IPv6, padrão da repo).
-- Status: aguardando aplicação pelo Pedro.
--
-- Contexto: comerciais que disparam o debriefing agora podem anexar uma leitura
-- qualitativa do ciclo — texto inline (impressões, percepções estratégicas) ou
-- arquivo (PDF/DOCX/MD/TXT) com perspectiva mais densa. Esse input enriquece o
-- markdown final com camadas que ClickUp/Drive não capturam (subjetividade do
-- consultor sobre dinâmica, fricção, oportunidades).
--
-- Persistência:
--   - consultor_perspectiva_text: texto bruto (inline ou extraído do arquivo
--     via Docling). É o que o synthesizer Claude consome, sem re-fetch.
--   - consultor_perspectiva_storage_path: caminho no bucket 'debriefings' do
--     arquivo original (perspectivas/<debriefing_id>.<ext>). Mantido pra audit
--     e re-download eventual; pode ser NULL quando o usuário usou só inline.
--
-- Ambas colunas são opcionais (NULL = debriefing antigo sem perspectiva ou
-- disparado sem input qualitativo).

ALTER TABLE debriefings
  ADD COLUMN IF NOT EXISTS consultor_perspectiva_text TEXT,
  ADD COLUMN IF NOT EXISTS consultor_perspectiva_storage_path TEXT;
