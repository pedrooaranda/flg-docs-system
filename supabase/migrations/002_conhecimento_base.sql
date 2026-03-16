-- ═══════════════════════════════════════════════════════════════════════════
-- FLG Jornada System — Base de Conhecimento do Agente
-- Tabela onde Pedro armazena e atualiza o conhecimento da jornada FLG.
-- O agente injeta os registros ativos no system prompt automaticamente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conhecimento_base (
    id          SERIAL PRIMARY KEY,
    titulo      TEXT NOT NULL,                          -- ex: "Metodologia FLG", "O que é Jornada"
    tipo        TEXT NOT NULL DEFAULT 'geral',          -- geral | metodologia | encontro | processo | filosofia
    conteudo    TEXT NOT NULL,                          -- o conhecimento em texto livre / markdown
    ativo       BOOLEAN NOT NULL DEFAULT TRUE,          -- desativar sem deletar
    ordem       INTEGER DEFAULT 0,                      -- controla a ordem de injeção no prompt
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para buscar só os ativos em ordem
CREATE INDEX IF NOT EXISTS idx_conhecimento_ativo_ordem
    ON conhecimento_base (ativo, ordem);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conhecimento_updated_at ON conhecimento_base;
CREATE TRIGGER trg_conhecimento_updated_at
    BEFORE UPDATE ON conhecimento_base
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Seed inicial — estrutura vazia aguardando conteúdo do Pedro ─────────────
INSERT INTO conhecimento_base (titulo, tipo, conteudo, ordem) VALUES
(
    'O que é a Founders Led Growth',
    'filosofia',
    'Preencher com o conteúdo do documento da jornada FLG.',
    1
),
(
    'Estrutura da Jornada (15 Encontros)',
    'metodologia',
    'Preencher com a descrição completa dos 15 encontros e a lógica da progressão.',
    2
),
(
    'Como o Agente deve se comportar',
    'processo',
    'Preencher com diretrizes específicas de comportamento, tom e abordagem do assistente.',
    3
)
ON CONFLICT DO NOTHING;
