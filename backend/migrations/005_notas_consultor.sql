-- Migration 005 — Notas do Consultor por Cliente
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor → New Query)

CREATE TABLE IF NOT EXISTS notas_consultor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    consultor_email TEXT NOT NULL,
    tipo VARCHAR(30) DEFAULT 'geral',
    -- tipos: geral, percepcao, trava, evolucao, alerta, tarefa
    conteudo TEXT NOT NULL,
    fixada BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notas_cliente ON notas_consultor(cliente_id, created_at DESC);
ALTER TABLE notas_consultor ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "service_all_notas" ON notas_consultor
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
