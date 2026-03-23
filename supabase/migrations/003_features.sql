-- ============================================================
-- Migration 003 — Materiais, Intelecto histórico, Config agentes
-- ============================================================

-- ─── Novos campos em encontros_base ──────────────────────────
ALTER TABLE encontros_base
  ADD COLUMN IF NOT EXISTS imagem_principal_url TEXT,
  ADD COLUMN IF NOT EXISTS imagens_extras JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS intelecto_versao INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS intelecto_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS intelecto_updated_by TEXT;

-- ─── Histórico de versões do intelecto ───────────────────────
CREATE TABLE IF NOT EXISTS intelecto_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encontro_numero INT REFERENCES encontros_base(numero) ON DELETE CASCADE,
  intelecto_conteudo TEXT NOT NULL,
  versao INT NOT NULL,
  editado_por TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intelecto_historico_encontro
  ON intelecto_historico(encontro_numero);

-- ─── Materiais de copy gerados pelo Copywriter FLG ──────────
CREATE TABLE IF NOT EXISTS materiais_copy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
  tipo_material VARCHAR(50) NOT NULL,
  titulo TEXT,
  conteudo TEXT NOT NULL,
  consultor_email TEXT,
  encontro_referencia INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materiais_copy_cliente
  ON materiais_copy(cliente_id);
CREATE INDEX IF NOT EXISTS idx_materiais_copy_tipo
  ON materiais_copy(tipo_material);

-- ─── Configuração dos agentes FLG ────────────────────────────
CREATE TABLE IF NOT EXISTS agentes_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_tipo VARCHAR(50) UNIQUE NOT NULL,
  system_prompt_base TEXT NOT NULL DEFAULT '',
  diretrizes TEXT,
  config_extra JSONB DEFAULT '{}',
  versao INT DEFAULT 1,
  updated_by TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO agentes_config (agente_tipo, system_prompt_base) VALUES
  ('preparacao_encontro', ''),
  ('copywriter', ''),
  ('materiais', '')
ON CONFLICT (agente_tipo) DO NOTHING;

-- ─── RLS (replicar política dos outros) ──────────────────────
ALTER TABLE intelecto_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read intelecto_historico"
  ON intelecto_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert intelecto_historico"
  ON intelecto_historico FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE materiais_copy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated all materiais_copy"
  ON materiais_copy FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE agentes_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read agentes_config"
  ON agentes_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated update agentes_config"
  ON agentes_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
