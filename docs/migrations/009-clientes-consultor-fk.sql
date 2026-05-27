-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 009 — clientes.consultor_id (FK pra colaboradores)
-- Data: 2026-05-26
-- Spec: docs/superpowers/specs/2026-05-26-permissao-consultor-design.md
--
-- ETAPA 1 do rollout do permissionamento por consultor.
-- Schema additive: cria FK + backfilla. App ainda ignora o campo novo.
-- Comportamento atual não muda. Etapa 2 (backend autorizativo) virá depois.
--
-- Como aplicar:
--   Supabase Dashboard → SQL Editor → cola este arquivo inteiro → Run
--   (motivo: VPS sem IPv6, padrão da repo — vide HANDOFF-metricas-v3 seção 8)
--
-- O que esperar:
--   Última query (SELECT órfãos) deve mostrar a lista de clientes que NÃO
--   bateram com nenhum colaborador. Pedro reatribui pela UI depois.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Extension necessária pra unaccent ────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS unaccent;

-- ─── 2. Função de normalização (espelha matchConsultor JS) ───────────────────
-- Lowercase + sem acentos + sem espaços/separadores. Match agressivo.
-- Exemplo: '  Pedro Aranda ' → 'pedroaranda'; 'Letícia Toledo' → 'leticiatoledo'

CREATE OR REPLACE FUNCTION _normalize_consultor_name(input TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(
           lower(unaccent(coalesce(input, ''))),
           '[\s\-_.|\[\]]+',
           '',
           'g'
         );
$$;

-- ─── 3. Adicionar coluna FK ──────────────────────────────────────────────────

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS consultor_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_consultor_id ON clientes(consultor_id);

-- Comentário documentando a fase de transição
COMMENT ON COLUMN clientes.consultor_id IS
  'FK pra colaboradores. Source-of-truth pra permissionamento (Stream 6 Permissão Consultor). '
  'Substituiu consultor_responsavel TEXT que fica como denormalizado até fase de drop futura.';

-- ─── 4. Backfill pass 1: match exato normalizado ─────────────────────────────

UPDATE clientes c
   SET consultor_id = col.id
  FROM colaboradores col
 WHERE c.consultor_id IS NULL
   AND col.ativo = true
   AND _normalize_consultor_name(c.consultor_responsavel) = _normalize_consultor_name(col.nome);

-- ─── 5. Backfill pass 2: match bidirecional substring (pega "lucas" ↔ "lucasnery") ──

UPDATE clientes c
   SET consultor_id = col.id
  FROM colaboradores col
 WHERE c.consultor_id IS NULL
   AND col.ativo = true
   AND length(_normalize_consultor_name(c.consultor_responsavel)) >= 3  -- evita matches degenerados
   AND length(_normalize_consultor_name(col.nome)) >= 3
   AND (
        _normalize_consultor_name(col.nome)
          LIKE '%' || _normalize_consultor_name(c.consultor_responsavel) || '%'
     OR _normalize_consultor_name(c.consultor_responsavel)
          LIKE '%' || _normalize_consultor_name(col.nome) || '%'
   )
   -- Se mais de 1 colaborador bate, fica NULL (Pedro decide pela UI)
   AND (
     SELECT count(*) FROM colaboradores col2
      WHERE col2.ativo = true
        AND (
             _normalize_consultor_name(col2.nome)
               LIKE '%' || _normalize_consultor_name(c.consultor_responsavel) || '%'
          OR _normalize_consultor_name(c.consultor_responsavel)
               LIKE '%' || _normalize_consultor_name(col2.nome) || '%'
        )
   ) = 1;

-- ─── 6. Relatório: clientes ÓRFÃOS (consultor_id NULL após backfill) ─────────
-- Estes precisam reatribuição manual pelo Pedro via UI (Etapa 3 do rollout).
-- Causas comuns: typo histórico em consultor_responsavel, consultor desativado,
-- nome ambíguo (múltiplos colaboradores bateram), ou cliente legado sem dono.

SELECT
  c.id,
  c.nome,
  c.empresa,
  c.consultor_responsavel AS responsavel_text_atual,
  c.status,
  c.created_at::date AS criado_em,
  CASE
    WHEN c.consultor_responsavel IS NULL OR trim(c.consultor_responsavel) = '' THEN 'campo vazio'
    WHEN NOT EXISTS (SELECT 1 FROM colaboradores WHERE ativo = true
                      AND _normalize_consultor_name(nome) = _normalize_consultor_name(c.consultor_responsavel))
         THEN 'nome não bate exato com nenhum colaborador ativo'
    ELSE 'múltiplos colaboradores bateram (ambíguo)'
  END AS motivo_orfao
FROM clientes c
WHERE c.consultor_id IS NULL
ORDER BY c.status DESC NULLS LAST, c.created_at DESC;

-- ─── 7. Estatísticas do backfill ─────────────────────────────────────────────
-- Pra Pedro ver de relance quanto resolveu vs quanto sobrou.

SELECT
  count(*) FILTER (WHERE consultor_id IS NOT NULL) AS clientes_com_consultor,
  count(*) FILTER (WHERE consultor_id IS NULL)     AS clientes_orfaos,
  count(*)                                         AS total_clientes,
  round(
    100.0 * count(*) FILTER (WHERE consultor_id IS NOT NULL) / nullif(count(*), 0),
    1
  ) AS pct_resolvido
FROM clientes;
