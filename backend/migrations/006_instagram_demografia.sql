-- Migration 006 — Instagram Demografia (follower + engaged_audience)
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- API: /{ig-user-id}/insights
--   metric=follower_demographics,engaged_audience_demographics
--   period=lifetime
--   breakdown=age,gender,city,country
--
-- Pré-requisitos Meta para retornar dados:
--   - Conta IG Business com >=100 seguidores
--   - >=100 contas engajadas no período (para engaged_audience)
--
-- Snapshot semanal (não diário) — esses dados mudam pouco e são caros de pegar.

CREATE TABLE IF NOT EXISTS instagram_demografia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,

    -- Snapshot
    data_referencia DATE NOT NULL,
    tipo VARCHAR(30) NOT NULL,             -- 'follower' | 'engaged_audience'

    -- Breakdowns (JSONB para flexibilidade)
    -- genero_idade:  { "F.18-24": 1234, "M.25-34": 5678, "U.45-54": 100 }
    -- paises:        [ {"key": "BR", "value": 12345}, {"key": "US", "value": 234} ]
    -- cidades:       [ {"key": "São Paulo, BR", "value": 1234}, ... ]
    -- locales:       [ {"key": "pt_BR", "value": 9876}, ... ]
    genero_idade JSONB DEFAULT '{}'::jsonb,
    paises JSONB DEFAULT '[]'::jsonb,
    cidades JSONB DEFAULT '[]'::jsonb,
    locales JSONB DEFAULT '[]'::jsonb,

    -- Totais (denominador para cálculo de %)
    total_count INT DEFAULT 0,

    -- Metadata
    raw_response JSONB,
    api_message TEXT,                       -- ex: "100+ followers required"
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(cliente_id, data_referencia, tipo)
);

CREATE INDEX IF NOT EXISTS idx_ig_demo_cliente_data
    ON instagram_demografia(cliente_id, data_referencia DESC);
CREATE INDEX IF NOT EXISTS idx_ig_demo_tipo
    ON instagram_demografia(cliente_id, tipo, data_referencia DESC);

ALTER TABLE instagram_demografia ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "service_all_ig_demografia" ON instagram_demografia
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
