-- Migration 004 — Infraestrutura de conexões e métricas reais por plataforma
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- Tabelas:
--   plataforma_conexoes  — tokens OAuth por cliente × plataforma
--   metricas_diarias     — métricas diárias puxadas das APIs
--   metricas_posts       — métricas por post/vídeo individual

-- ─── Conexões OAuth por cliente × plataforma ─────────────────────────────────
CREATE TABLE IF NOT EXISTS plataforma_conexoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    plataforma VARCHAR(20) NOT NULL,  -- instagram, linkedin, youtube, tiktok

    -- OAuth tokens
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,

    -- ID da conta na plataforma (ex: Instagram Business Account ID, Channel ID)
    platform_account_id TEXT,
    platform_username TEXT,
    platform_display_name TEXT,

    -- Estado da conexão
    status VARCHAR(20) DEFAULT 'pendente',  -- pendente, ativo, expirado, erro, desconectado
    ultimo_erro TEXT,
    ultima_sincronizacao TIMESTAMPTZ,

    -- Metadata
    scopes TEXT,                       -- permissões concedidas
    extra_data JSONB DEFAULT '{}',     -- dados extras (page_id p/ Instagram, etc.)
    conectado_por TEXT,                -- email do consultor que conectou
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Um cliente só pode ter uma conexão ativa por plataforma
    UNIQUE(cliente_id, plataforma)
);

CREATE INDEX IF NOT EXISTS idx_conexoes_cliente ON plataforma_conexoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_conexoes_status ON plataforma_conexoes(status);
ALTER TABLE plataforma_conexoes ENABLE ROW LEVEL SECURITY;


-- ─── Métricas diárias agregadas ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metricas_diarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    plataforma VARCHAR(20) NOT NULL,
    data DATE NOT NULL,

    -- Audiência
    seguidores INT,
    delta_seguidores INT,

    -- Engajamento
    taxa_engajamento DECIMAL(6,2),
    curtidas_total INT,
    comentarios_total INT,
    compartilhamentos_total INT,
    salvamentos_total INT,

    -- Alcance / Impressões
    alcance_total INT,
    impressoes_total INT,
    visualizacoes_perfil INT,

    -- Plataforma-específicos (JSONB para flexibilidade)
    -- Instagram: { reels_publicados, stories_publicados, cliques_link_bio }
    -- LinkedIn:  { conexoes, ssi_score, busca_aparicoes, artigos_publicados }
    -- YouTube:   { inscritos, watch_time_horas, ctr_pct, taxa_retencao_pct, shorts_publicados }
    -- TikTok:    { taxa_conclusao, fyp_pct, visualizacoes_video }
    extras JSONB DEFAULT '{}',

    posts_publicados INT DEFAULT 0,
    fonte VARCHAR(20) DEFAULT 'api',  -- api, manual
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(cliente_id, plataforma, data)
);

CREATE INDEX IF NOT EXISTS idx_metricas_diarias_lookup
    ON metricas_diarias(cliente_id, plataforma, data DESC);
ALTER TABLE metricas_diarias ENABLE ROW LEVEL SECURITY;


-- ─── Métricas por post individual ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metricas_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    plataforma VARCHAR(20) NOT NULL,

    -- ID do post na plataforma
    platform_post_id TEXT NOT NULL,
    tipo VARCHAR(30),                  -- REEL, IMAGE, CAROUSEL, VIDEO, SHORT, POST, ARTICLE, POLL, DOCUMENT

    -- Conteúdo
    legenda TEXT,
    url TEXT,
    thumbnail_url TEXT,
    publicado_em TIMESTAMPTZ,

    -- Métricas
    visualizacoes INT DEFAULT 0,
    curtidas INT DEFAULT 0,
    comentarios INT DEFAULT 0,
    compartilhamentos INT DEFAULT 0,
    salvamentos INT DEFAULT 0,
    alcance INT DEFAULT 0,
    impressoes INT DEFAULT 0,
    taxa_engajamento DECIMAL(6,2),

    -- Plataforma-específicos
    -- YouTube: { watch_time_min, duracao_min, ctr, taxa_retencao }
    -- TikTok:  { taxa_conclusao, fyp_pct }
    -- LinkedIn: { reacoes }
    extras JSONB DEFAULT '{}',

    ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(cliente_id, plataforma, platform_post_id)
);

CREATE INDEX IF NOT EXISTS idx_metricas_posts_lookup
    ON metricas_posts(cliente_id, plataforma, publicado_em DESC);
ALTER TABLE metricas_posts ENABLE ROW LEVEL SECURITY;


-- ─── RLS Policies (service role bypassa, mas adicionamos p/ segurança) ──────
DO $$ BEGIN
    CREATE POLICY "service_all_conexoes" ON plataforma_conexoes
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "service_all_metricas_diarias" ON metricas_diarias
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "service_all_metricas_posts" ON metricas_posts
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
