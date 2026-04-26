-- Migration 005 — Instagram Métricas V2 (Real-time, dados reais Meta Graph API)
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- 6 tabelas:
--   instagram_conexoes              — OAuth tokens + perfil por cliente
--   instagram_followers_historico   — Snapshot diário (API não dá histórico)
--   instagram_posts                 — Posts + Reels + Stories com TODAS as métricas
--   instagram_metricas_diarias      — Cache agregado para queries rápidas
--   instagram_horarios_engagement   — Heatmap dia × hora por tipo
--   instagram_insights_ia           — Análises Claude estruturadas

-- ─── 1. CONEXÕES OAUTH ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instagram_conexoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,

    -- OAuth (Facebook Login)
    fb_user_id TEXT,
    fb_page_id TEXT NOT NULL,
    ig_user_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    access_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    scopes TEXT,

    -- Perfil (atualizado a cada sync)
    profile_picture_url TEXT,
    profile_picture_cached_url TEXT,
    profile_picture_cached_at TIMESTAMPTZ,
    display_name TEXT,
    biography TEXT,
    website TEXT,
    followers_count INT,
    follows_count INT,
    media_count INT,

    -- Status
    status VARCHAR(20) DEFAULT 'ativo',
    last_sync_at TIMESTAMPTZ,
    last_sync_duration_ms INT,
    last_error TEXT,
    next_refresh_at TIMESTAMPTZ,
    sync_pausado_ate TIMESTAMPTZ,

    conectado_por TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_conexoes_status ON instagram_conexoes(status);
CREATE INDEX IF NOT EXISTS idx_ig_conexoes_next_refresh ON instagram_conexoes(next_refresh_at)
    WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS idx_ig_conexoes_last_sync ON instagram_conexoes(last_sync_at)
    WHERE status = 'ativo';

ALTER TABLE instagram_conexoes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "service_all_ig_conexoes" ON instagram_conexoes
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── 2. SNAPSHOT DIÁRIO DE FOLLOWERS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instagram_followers_historico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    data DATE NOT NULL,

    followers_count INT NOT NULL,
    follows_count INT,
    media_count INT,

    -- Calculado: hoje - ontem
    delta_followers INT,
    delta_follows INT,
    delta_media INT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cliente_id, data)
);

CREATE INDEX IF NOT EXISTS idx_ig_followers_lookup
    ON instagram_followers_historico(cliente_id, data DESC);

ALTER TABLE instagram_followers_historico ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "service_all_ig_followers" ON instagram_followers_historico
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── 3. POSTS / REELS / STORIES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instagram_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    ig_media_id TEXT NOT NULL UNIQUE,

    -- Tipo (CRÍTICO para separação)
    media_product_type VARCHAR(20) NOT NULL,  -- FEED | REELS | STORY
    media_type VARCHAR(20),                    -- IMAGE | VIDEO | CAROUSEL_ALBUM
    is_carousel BOOLEAN DEFAULT FALSE,

    -- Conteúdo
    caption TEXT,
    permalink TEXT,
    media_url TEXT,
    thumbnail_url TEXT,
    thumbnail_cached_url TEXT,

    -- Timestamps
    posted_at TIMESTAMPTZ NOT NULL,
    story_expires_at TIMESTAMPTZ,
    discovered_at TIMESTAMPTZ DEFAULT NOW(),

    -- ─── Métricas comuns (todos os tipos) ───
    reach INT DEFAULT 0,
    impressions INT DEFAULT 0,
    saved INT DEFAULT 0,
    shares INT DEFAULT 0,
    total_interactions INT DEFAULT 0,
    likes INT DEFAULT 0,
    comments INT DEFAULT 0,

    -- ─── Métricas Feed/Carousel ───
    profile_visits INT DEFAULT 0,
    follows INT DEFAULT 0,                   -- Novos seguidores via este post

    -- ─── Métricas Reels ───
    plays INT DEFAULT 0,
    ig_reels_video_view_total_time BIGINT,   -- ms
    ig_reels_avg_watch_time BIGINT,          -- ms

    -- ─── Métricas Stories (capturadas antes de expirar 24h) ───
    exits INT DEFAULT 0,
    replies INT DEFAULT 0,
    taps_forward INT DEFAULT 0,
    taps_back INT DEFAULT 0,

    -- Calculados
    engagement_rate DECIMAL(6,3),            -- (likes+comments+saves+shares) / reach
    retention_rate DECIMAL(6,3),             -- 1 - (exits / impressions) [Stories]

    -- Metadata sync
    ultima_atualizacao_metricas TIMESTAMPTZ DEFAULT NOW(),
    metricas_finalizadas BOOLEAN DEFAULT FALSE,
    sync_count INT DEFAULT 1,
    raw_insights JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ig_posts_cliente_data
    ON instagram_posts(cliente_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_posts_tipo
    ON instagram_posts(cliente_id, media_product_type, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_posts_story_expiring
    ON instagram_posts(story_expires_at)
    WHERE media_product_type = 'STORY' AND metricas_finalizadas = FALSE;
CREATE INDEX IF NOT EXISTS idx_ig_posts_recente_resync
    ON instagram_posts(cliente_id, ultima_atualizacao_metricas)
    WHERE metricas_finalizadas = FALSE;
CREATE INDEX IF NOT EXISTS idx_ig_posts_engagement
    ON instagram_posts(cliente_id, engagement_rate DESC)
    WHERE engagement_rate IS NOT NULL;

ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "service_all_ig_posts" ON instagram_posts
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── 4. CACHE DE MÉTRICAS DIÁRIAS AGREGADAS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS instagram_metricas_diarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    media_product_type VARCHAR(20) NOT NULL,  -- FEED | REELS | STORY | ALL

    -- Volume
    posts_publicados INT DEFAULT 0,

    -- Somatórios do dia
    total_likes INT DEFAULT 0,
    total_comments INT DEFAULT 0,
    total_saves INT DEFAULT 0,
    total_shares INT DEFAULT 0,
    total_reach INT DEFAULT 0,
    total_impressions INT DEFAULT 0,
    total_plays INT DEFAULT 0,                -- Reels
    total_watch_time_ms BIGINT DEFAULT 0,     -- Reels
    total_profile_visits INT DEFAULT 0,
    total_follows INT DEFAULT 0,              -- Followers via posts do dia
    total_exits INT DEFAULT 0,                -- Stories
    total_replies INT DEFAULT 0,              -- Stories
    total_taps_forward INT DEFAULT 0,         -- Stories
    total_taps_back INT DEFAULT 0,            -- Stories

    -- Médias calculadas
    avg_engagement_rate DECIMAL(6,3),
    avg_reach_per_post INT,
    avg_watch_time_seconds DECIMAL(8,2),      -- Reels
    avg_retention_rate DECIMAL(6,3),          -- Stories

    -- Top post do dia
    best_post_id UUID REFERENCES instagram_posts(id),
    best_post_engagement DECIMAL(8,3),

    ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cliente_id, data, media_product_type)
);

CREATE INDEX IF NOT EXISTS idx_ig_metricas_diarias_lookup
    ON instagram_metricas_diarias(cliente_id, data DESC, media_product_type);

ALTER TABLE instagram_metricas_diarias ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "service_all_ig_metricas_diarias" ON instagram_metricas_diarias
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── 5. HEATMAP DIA × HORA ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instagram_horarios_engagement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    media_product_type VARCHAR(20) NOT NULL,  -- FEED | REELS | STORY
    dia_semana INT NOT NULL,                   -- 0=domingo, 6=sábado
    faixa_horaria INT NOT NULL,                -- 0-23

    taxa_engajamento_media DECIMAL(6,2),
    total_posts INT DEFAULT 0,
    total_reach INT DEFAULT 0,

    ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cliente_id, media_product_type, dia_semana, faixa_horaria)
);

CREATE INDEX IF NOT EXISTS idx_ig_horarios_lookup
    ON instagram_horarios_engagement(cliente_id, media_product_type);

ALTER TABLE instagram_horarios_engagement ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "service_all_ig_horarios" ON instagram_horarios_engagement
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── 6. INSIGHTS IA (CLAUDE STRUCTURED OUTPUTS) ──────────────────────────────
CREATE TABLE IF NOT EXISTS instagram_insights_ia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,

    periodo_inicio DATE NOT NULL,
    periodo_fim DATE NOT NULL,
    janela_dias INT NOT NULL,

    -- Análise estruturada
    tendencia VARCHAR(20),                    -- crescimento | queda | estavel
    drift_detectado BOOLEAN DEFAULT FALSE,
    drift_severity VARCHAR(20),               -- baixa | media | alta
    insight_principal TEXT,
    recomendacoes JSONB,
    pontos_fortes JSONB,
    pontos_atencao JSONB,
    score_geral DECIMAL(3,1),                 -- 0-10

    -- Comparativos
    vs_periodo_anterior JSONB,
    melhor_post_id UUID REFERENCES instagram_posts(id),
    melhor_post_motivo TEXT,
    pior_post_id UUID REFERENCES instagram_posts(id),
    pior_post_motivo TEXT,

    -- Metadata
    modelo_usado VARCHAR(50),
    tokens_usados INT,
    raw_output TEXT,
    gerado_por VARCHAR(20) DEFAULT 'auto',    -- auto | manual
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ig_insights_cliente
    ON instagram_insights_ia(cliente_id, periodo_fim DESC);

ALTER TABLE instagram_insights_ia ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "service_all_ig_insights" ON instagram_insights_ia
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── 7. STORAGE BUCKET PARA PROFILE PICS ─────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('instagram-assets', 'instagram-assets', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
    CREATE POLICY "service_all_ig_assets" ON storage.objects
        FOR ALL TO authenticated USING (bucket_id = 'instagram-assets')
        WITH CHECK (bucket_id = 'instagram-assets');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
