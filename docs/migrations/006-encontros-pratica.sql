-- Migration 006 — Reuniões Phase C1: tabela encontros_pratica
-- Aplicada manualmente no Supabase Dashboard em 2026-05-12
-- (VPS sem IPv6 → padrão da repo, ver memory/vps_supabase_ipv6_issue.md)
-- SQL exato em docs/superpowers/plans/2026-05-12-reunioes-phase-c1.md Task 1.
-- Status: aguardando aplicação pelo Pedro.

CREATE TABLE IF NOT EXISTS encontros_pratica (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  encontro_numero INT NOT NULL,

  conversa_chat JSONB NOT NULL DEFAULT '[]',

  html_pratica TEXT,
  num_slides_pratica INT DEFAULT 0,

  slug TEXT UNIQUE,
  slug_gerado_at TIMESTAMPTZ,
  slug_revogado_at TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','gerando','pronto','apresentado','arquivado')),

  consultor_email TEXT NOT NULL,
  ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
  apresentado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(cliente_id, encontro_numero)
);

CREATE INDEX IF NOT EXISTS idx_encontros_pratica_cliente ON encontros_pratica(cliente_id);
CREATE INDEX IF NOT EXISTS idx_encontros_pratica_slug
  ON encontros_pratica(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_encontros_pratica_status ON encontros_pratica(status);

ALTER TABLE encontros_pratica ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS encontros_pratica_select ON encontros_pratica;
CREATE POLICY encontros_pratica_select ON encontros_pratica
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS encontros_pratica_modify ON encontros_pratica;
CREATE POLICY encontros_pratica_modify ON encontros_pratica
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION trg_encontros_pratica_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS encontros_pratica_updated_at_trg ON encontros_pratica;
CREATE TRIGGER encontros_pratica_updated_at_trg
  BEFORE UPDATE ON encontros_pratica
  FOR EACH ROW EXECUTE FUNCTION trg_encontros_pratica_updated_at();
