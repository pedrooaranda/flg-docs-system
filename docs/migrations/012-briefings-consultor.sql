-- Migration 012: tabela briefings_consultor (sub-projeto 3 Debriefings)
-- Aplicada manualmente por Pedro em 2026-06-05 via Supabase Dashboard.
-- VPS sem IPv6 não permite Postgres direto via migrations CLI.

CREATE TABLE briefings_consultor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  consultor_id UUID NOT NULL REFERENCES colaboradores(id),
  conteudo TEXT NOT NULL DEFAULT '',
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, consultor_id)
);
