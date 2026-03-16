-- ═══════════════════════════════════════════════════════════════════════════
-- FLG Jornada System — Schema inicial
-- Executar no SQL Editor do Supabase ou via CLI: supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Extensões ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── encontros_base ──────────────────────────────────────────────────────────
-- Conteúdo intelectual fixo de cada encontro.
-- Editável pelo admin (Pedro) via painel admin.
CREATE TABLE IF NOT EXISTS encontros_base (
    id                    SERIAL PRIMARY KEY,
    numero                INTEGER NOT NULL UNIQUE,
    nome                  TEXT NOT NULL,
    objetivo_estrategico  TEXT,
    intelecto_base        TEXT,                    -- conteúdo intelectual do encontro
    checklist_pre         JSONB DEFAULT '[]',
    checklist_durante     JSONB DEFAULT '[]',
    checklist_pos         JSONB DEFAULT '[]',
    tem_slides            BOOLEAN NOT NULL DEFAULT TRUE,
    numero_slides_medio   INTEGER DEFAULT 22,
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── clientes ────────────────────────────────────────────────────────────────
-- Perfil completo do cliente — alimentado no onboarding, atualizado pelo agente.
CREATE TABLE IF NOT EXISTS clientes (
    id                             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome                           TEXT NOT NULL,
    empresa                        TEXT NOT NULL,
    consultor_responsavel          TEXT,
    estrategista                   TEXT,
    data_inicio_jornada            DATE,
    encontro_atual                 INTEGER DEFAULT 1,

    -- Documentos estratégicos (extraídos pelo Docling)
    planejamento_estrategico_texto TEXT,
    estudo_mercado_texto           TEXT,

    -- Perfil comportamental e estratégico
    tom_de_voz                     TEXT,
    pontos_fortes                  TEXT,
    travas_conhecidas              TEXT,
    ansiedades                     TEXT,
    marcas_referencia              TEXT,
    situacao_atual                 TEXT,
    objetivo_em_6_meses            TEXT,

    -- Dados de mídias
    seguidores_instagram           INTEGER,
    tem_trafego_pago               BOOLEAN DEFAULT FALSE,
    tem_equipe_conteudo            BOOLEAN DEFAULT FALSE,
    principal_dor_hoje             TEXT,

    -- Integração ClickUp
    clickup_task_id                TEXT,

    created_at                     TIMESTAMPTZ DEFAULT NOW(),
    updated_at                     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── encontros_realizados ────────────────────────────────────────────────────
-- Registro de cada encontro executado com o cliente.
CREATE TABLE IF NOT EXISTS encontros_realizados (
    id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id                   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    encontro_numero              INTEGER NOT NULL,
    data_realizacao              DATE DEFAULT CURRENT_DATE,

    -- Campos de auditoria (preenchidos pelo consultor antes do encontro)
    auditoria_semana             TEXT,       -- como o cliente chegou essa semana
    evoluiu_posicionamento       TEXT,       -- o que funcionou
    principal_trava_hoje         TEXT,
    execucao_conteudo            TEXT,
    campanhas_rodando            TEXT,
    engajamento_tendencia        TEXT CHECK (engajamento_tendencia IN ('subindo','estável','caindo')),
    mais_proximo_planejamento    BOOLEAN,
    observacoes_livres           TEXT,

    -- Slides gerados
    slides_html_url              TEXT,
    pdf_url                      TEXT,

    created_at                   TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(cliente_id, encontro_numero)
);

-- ─── conversas_agente ────────────────────────────────────────────────────────
-- Gerenciada automaticamente pelo Agno (PostgresAgentStorage).
-- A tabela é criada pelo Agno na inicialização, mas declaramos aqui
-- para garantir que o schema está registrado.
CREATE TABLE IF NOT EXISTS conversas_agente (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id     TEXT NOT NULL,
    agent_id       TEXT NOT NULL,
    user_id        TEXT,
    memory         JSONB,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_encontros_realizados_cliente ON encontros_realizados(cliente_id);
CREATE INDEX IF NOT EXISTS idx_conversas_session ON conversas_agente(session_id);
CREATE INDEX IF NOT EXISTS idx_clientes_clickup ON clientes(clickup_task_id) WHERE clickup_task_id IS NOT NULL;

-- ─── Trigger updated_at ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_clientes_updated_at
    BEFORE UPDATE ON clientes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_conversas_updated_at
    BEFORE UPDATE ON conversas_agente
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Habilitar RLS nas tabelas
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE encontros_realizados ENABLE ROW LEVEL SECURITY;
ALTER TABLE encontros_base ENABLE ROW LEVEL SECURITY;

-- Política: usuários autenticados podem ler e escrever tudo
-- (controle fino de permissão é feito na camada FastAPI via service role key)
CREATE POLICY "auth_full_access_clientes"
    ON clientes FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "auth_full_access_encontros_realizados"
    ON encontros_realizados FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "auth_read_encontros_base"
    ON encontros_base FOR SELECT
    TO authenticated
    USING (true);

-- Service role ignora RLS (usado pelo backend)

-- ─── Supabase Storage buckets ─────────────────────────────────────────────────
-- Criar buckets para slides e PDFs gerados
INSERT INTO storage.buckets (id, name, public)
VALUES
    ('slides', 'slides', false),
    ('pdfs', 'pdfs', false),
    ('documentos', 'documentos', false)
ON CONFLICT (id) DO NOTHING;

-- ─── SEED: encontros_base ─────────────────────────────────────────────────────
INSERT INTO encontros_base (numero, nome, objetivo_estrategico, tem_slides, numero_slides_medio, intelecto_base) VALUES
(1,  'Onboarding à FLG',
     'Apresentar a FLG, metodologia e contrato de jornada. Estabelecer expectativas.',
     FALSE, 0,
     'Slide fixo produzido pela Tati. Não gerar via IA.'),

(2,  'Mapeamento Estratégico',
     'Mapear profundamente o negócio, o founder e o mercado. Diagnóstico completo.',
     FALSE, 0,
     'Encontro de escuta profunda. Sem slides — apenas conversa estruturada.'),

(3,  'Organização de Mídias',
     'Auditar e organizar todos os canais digitais existentes. Setup técnico.',
     FALSE, 0,
     'Encontro técnico de setup. Sem slides — guia passo a passo verbal.'),

(4,  'Planejamento Estratégico',
     'Apresentar o Planejamento Estratégico completo da jornada. Primeiro encontro com slides personalizados.',
     TRUE, 25,
     'Este é o encontro de fundação estratégica. O founder precisa sair com clareza absoluta sobre: (1) seu posicionamento único de mercado, (2) os 3 pilares de conteúdo que sustentarão sua presença digital, (3) a arquitetura da jornada de compra do cliente ideal, (4) o papel de cada canal na estratégia. A linha intelectual central é: posicionamento não é o que você faz, é o que você representa na mente de quem você quer atrair.'),

(5,  'Avaliação de Mídias',
     'Analisar desempenho dos canais nos primeiros 30 dias. Ajustar direcionamento.',
     TRUE, 20,
     'Encontro de diagnóstico de mídias. Avaliar: taxa de engajamento por formato, qual conteúdo gerou mais conexão, o que o algoritmo está priorizando, onde o founder está se sentindo mais autêntico. Linha intelectual: métricas sem contexto são ruído — o que importa é identificar o padrão de conteúdo que conecta posicionamento com resultado.'),

(6,  'Estrutura da Campanha Piloto',
     'Estruturar a primeira campanha de captação. Definir oferta, público e criativo.',
     TRUE, 22,
     'A Campanha Piloto é o primeiro teste real de conversão. Estrutura os 5 elementos: (1) Oferta irresistível — o que o cliente ganha e como está posicionado, (2) Público frio definido — lookalike ou interesse?, (3) Criativo do founder — autenticidade acima de produção, (4) Headline que gera curiosidade sem clickbait, (5) Funil simples: anúncio → perfil → DM ou link. Linha intelectual: uma campanha de founder não vende produto — apresenta uma perspectiva de mundo.'),

(7,  'Início da Captação',
     'Lançar a campanha piloto. Revisar criativos e acompanhar primeiros dados.',
     TRUE, 20,
     'Momento de execução. Validar se o criativo está rodando conforme planejado. Identificar: custo por resultado inicial, qualidade dos leads chegando, reação do público. Linha intelectual: os primeiros 48h de uma campanha são para aprender, não para otimizar. Deixe rodar e colha dados antes de ajustar.'),

(8,  'Otimização da Campanha',
     'Analisar dados da campanha piloto e implementar otimizações estratégicas.',
     TRUE, 22,
     'Com dados reais em mãos, otimizar com intenção. Avaliar: qual anúncio performou melhor e por quê, o custo por lead/conversão está dentro do esperado, há padrão nas objeções dos leads. Linha intelectual: otimização sem hipótese é chute — toda mudança deve ter uma tese de melhoria baseada em dado observado.'),

(9,  'Reflow 01 — Expansão',
     'Primeiro reflow estratégico. Revisar aprendizados e estruturar fase de expansão.',
     TRUE, 24,
     'O Reflow marca uma virada de fase. Sintetizar: o que aprendemos sobre o founder como comunicador, o que aprendemos sobre o mercado, o que o público está respondendo. Estruturar a próxima fase: expandir para novos canais ou aprofundar nos que funcionaram? Linha intelectual: expansão sem consolidação é dispersão — crescer nos canais certos no momento certo.'),

(10, 'Captação Canais Expansão',
     'Estruturar e lançar captação nos novos canais definidos no Reflow.',
     TRUE, 22,
     'Aplicar os aprendizados da campanha piloto nos novos canais. Cada canal tem sua linguagem: o que funciona no Instagram pode não funcionar no TikTok ou YouTube. Linha intelectual: canais diferentes exigem versões diferentes do mesmo founder — mesmo posicionamento, linguagem adaptada.'),

(11, 'Validação Expansão',
     'Validar resultados da fase de expansão. Confirmar canais principais.',
     TRUE, 20,
     'Momento de decisão estratégica: quais canais validamos? Avaliar: ROI de atenção (tempo investido vs. resultado gerado), qual canal o founder mais se identifica, qual canal tem maior potencial de escala. Linha intelectual: não tente estar em todos os lugares — domine os canais onde seu founder é mais autêntico e seu público está mais presente.'),

(12, 'Debrief + Reflow 02 — Escala',
     'Debrief dos 4 meses de jornada. Estruturar estratégia de escala.',
     TRUE, 26,
     'Debrief profundo dos 4 meses: o que mudou no founder, no negócio, no mercado. Reflow para escala — não é crescer mais rápido, é crescer com mais eficiência. Estruturar: sistema de conteúdo recorrente, automações que preservam autenticidade, processos que não dependem do founder para cada detalhe. Linha intelectual: escala não é velocidade — é alavancagem.'),

(13, 'Captação Canais Escala',
     'Estruturar captação na fase de escala com sistemas mais robustos.',
     TRUE, 22,
     'Captação em escala requer sistemas. Estruturar: funil de múltiplos toques (retargeting + audiência quente + audiência fria), biblioteca de criativos com variações, processo de aprovação e atualização de anúncios. Linha intelectual: na escala, o founder não está mais vendendo — está construindo um sistema que vende enquanto ele foca no que faz de melhor.'),

(14, 'Validação Escala',
     'Validar estratégia de escala. Confirmar resultados e ajustar para o sprint final.',
     TRUE, 20,
     'Última validação antes do debrief final. O negócio está operando de forma mais independente do founder? O conteúdo está gerando leads qualificados de forma consistente? Linha intelectual: a melhor validação não é o número — é quando o founder percebe que o sistema funciona mesmo quando ele está ausente.'),

(15, 'Debrief Final + Pitch de Recompra',
     'Apresentar resultados completos da jornada. Apresentar proposta de continuidade.',
     TRUE, 30,
     'O Encontro 15 é o mais importante de toda a jornada. É onde a transformação se torna visível. Estrutura: (1) Linha do tempo da jornada — onde o founder estava vs. onde está, (2) Números e resultados concretos, (3) Transformação do founder como comunicador e líder, (4) O que construímos juntos — ativos, sistemas, posicionamento, (5) O que vem a seguir — proposta de continuidade da parceria. Linha intelectual: o debrief final não é sobre resultados passados — é sobre o founder ver com clareza quem ele se tornou e o que isso significa para o futuro.')
ON CONFLICT (numero) DO UPDATE SET
    nome = EXCLUDED.nome,
    objetivo_estrategico = EXCLUDED.objetivo_estrategico,
    tem_slides = EXCLUDED.tem_slides,
    numero_slides_medio = EXCLUDED.numero_slides_medio;

-- ─── SEED: cliente de teste ───────────────────────────────────────────────────
INSERT INTO clientes (
    nome, empresa, consultor_responsavel, estrategista,
    encontro_atual, tom_de_voz, pontos_fortes, travas_conhecidas,
    ansiedades, situacao_atual, objetivo_em_6_meses,
    clickup_task_id
) VALUES (
    'Carlos Levir',
    'Carlos Levir',
    'Pedro Aranda',
    'Pedro Aranda',
    6,
    'Direto, profissional. Resistência inicial a novos formatos mas comprometido quando convencido do porquê.',
    'Entusiasta quando entende a lógica. Alta energia quando comprometido.',
    'Desacredita de conteúdo muito editado/produzido. Agenda corrida, demora a responder. Mudança de escritório recente causou desorganização.',
    'Medo de que o formato profissional não funcione para o público dele. Insegurança com a nova identidade digital.',
    'Concluiu Linha Editorial 1, gravou os conteúdos mas ainda não postou. Entendeu importância da mescla lo-fi + profissional. Campanha Piloto é o próximo passo imediato.',
    'Tornar-se o principal canal de aquisição da própria empresa através do posicionamento como founder.',
    '86ad2g3hk'
) ON CONFLICT DO NOTHING;
