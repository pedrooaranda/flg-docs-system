-- Migration 007 — Debriefings estratégicos por ciclo
-- A aplicar manualmente no Supabase Dashboard (VPS sem IPv6, padrão da repo).
-- Status: aguardando aplicação pelo Pedro.
--
-- Contexto: feature pro time comercial gerar debriefing automático do ciclo
-- anterior de um cliente quando ele renova. Backend extrai ClickUp + Google Drive,
-- Claude produz Markdown estruturado, sistema gera PDF e persiste aqui.

CREATE TABLE IF NOT EXISTS debriefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,

  -- Identificação do ciclo (1, 2, 3... conforme renovações do cliente)
  ciclo_numero INT NOT NULL,
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,

  -- Estado do job assíncrono
  status TEXT NOT NULL DEFAULT 'gerando'
    CHECK (status IN ('gerando', 'pronto', 'falhou')),
  erro TEXT,

  -- Saída
  markdown_content TEXT,
  pdf_storage_path TEXT,           -- caminho no Supabase Storage (bucket 'debriefings')

  -- Audit das fontes consumidas
  clickup_list_id TEXT,
  drive_folder_id TEXT,
  num_tasks_clickup INT,
  num_docs_drive INT,

  -- Audit de custo
  tokens_input INT,
  tokens_output INT,
  custo_usd NUMERIC(10,4),
  duracao_segundos INT,

  -- Quem disparou
  gerado_por_email TEXT NOT NULL,
  gerado_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(cliente_id, ciclo_numero)
);

CREATE INDEX IF NOT EXISTS idx_debriefings_cliente ON debriefings(cliente_id, ciclo_numero DESC);
CREATE INDEX IF NOT EXISTS idx_debriefings_status ON debriefings(status);
CREATE INDEX IF NOT EXISTS idx_debriefings_gerado_at ON debriefings(gerado_at DESC);

ALTER TABLE debriefings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS debriefings_select ON debriefings;
CREATE POLICY debriefings_select ON debriefings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS debriefings_modify ON debriefings;
CREATE POLICY debriefings_modify ON debriefings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION trg_debriefings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS debriefings_updated_at_trg ON debriefings;
CREATE TRIGGER debriefings_updated_at_trg
  BEFORE UPDATE ON debriefings
  FOR EACH ROW EXECUTE FUNCTION trg_debriefings_updated_at();

-- Bucket de storage para os PDFs (criar no Supabase Dashboard → Storage → Create bucket
-- 'debriefings' com policy "authenticated read" e "service_role write").
