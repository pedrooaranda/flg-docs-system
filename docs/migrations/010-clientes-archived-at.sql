-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 010 — clientes.archived_at (soft delete via ClickUp sync)
-- Data: 2026-05-26
-- Spec: docs/superpowers/specs/2026-05-26-clickup-sync-archived-design.md
--
-- Stream 7: ClickUp sync passa a arquivar (soft delete) clientes com status
-- terminal (encerrado/renovado/inativo). archived_at != NULL → cliente sai do
-- display em /clientes e /metricas/ranking mas permanece no DB com FKs intactas
-- (encontros_realizados, debriefings, metricas_diarias_instagram, etc).
--
-- Schema additive: zero impacto até o backend Etapa 2 deployar e o próximo
-- sync rodar. Após sync, próximas leituras de /clientes filtram archived
-- automaticamente. Reativação: se ClickUp volta status pra ativo/pausado,
-- sync seta archived_at=NULL.
--
-- Como aplicar:
--   Supabase Dashboard → SQL Editor → cola este arquivo → Run
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

-- Index parcial: só registros arquivados (esmagadoramente menor que total),
-- usado pra queries admin tipo `?include_archived=true` ou auditoria.
-- Queries normais (?include_archived=false default) usam `WHERE archived_at IS NULL`
-- que aproveita o nullable + tabela pequena (~70 clientes); index parcial é pra
-- escalar quando arquivados crescer.
CREATE INDEX IF NOT EXISTS idx_clientes_archived_at
  ON clientes(archived_at)
  WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN clientes.archived_at IS
  'Soft delete via ClickUp sync (Stream 7). NULL = visível em /clientes e /metricas. '
  'NOT NULL = arquivado (status terminal no ClickUp: encerrado/renovado/inativo). '
  'Reversível: se ClickUp volta status pra ativo/pausado, sync seta archived_at=NULL. '
  'FKs preservadas pra histórico (encontros_realizados, debriefings, metricas).';
