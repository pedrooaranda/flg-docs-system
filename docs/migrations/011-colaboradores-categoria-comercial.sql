-- Migration 011 — Categoria 'comercial' em colaboradores
-- A aplicar manualmente no Supabase Dashboard (VPS sem IPv6, padrão da repo).
-- Status: aguardando aplicação pelo Pedro.
--
-- Contexto: subsistema de Debriefings precisa de um time comercial separado
-- (Membros Comerciais e Diretores Comerciais) que não acessa o sistema principal.
-- Reusa tabela colaboradores adicionando 'comercial' no CHECK constraint da
-- coluna categoria. Membro Comercial = role='member'; Diretor Comercial = role='admin'.

ALTER TABLE colaboradores DROP CONSTRAINT IF EXISTS colaboradores_categoria_check;
ALTER TABLE colaboradores ADD CONSTRAINT colaboradores_categoria_check
  CHECK (categoria IN ('consultor', 'diretor', 'comercial'));

COMMENT ON COLUMN colaboradores.categoria IS
  'consultor (sistema principal), diretor (acesso transversal), comercial (só subsistema de Debriefings)';
