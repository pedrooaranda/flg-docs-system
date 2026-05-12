# Plano de Implementação — Métricas V2 (Instagram Real-Time)

**Data:** 09/04/2026
**Projeto:** Jornada System (docs.foundersledgrowth.online)
**Objetivo:** Sistema completo de tracking Instagram com IA, embeds, separação por tipo de conteúdo, e estrutura de banco preparada para nunca perder dados.

---

## Visão Geral — O que muda

### Hoje
- Mock data com seed determinístico
- Métricas genéricas misturadas (sem separação por tipo de conteúdo)
- IA: 3-4 recomendações estáticas baseadas em benchmarks
- Sem dados reais

### Depois (V2)
- Dados reais via Meta Graph API com polling a cada 30 min
- **Separação por tipo de conteúdo:** Posts/Carousel · Reels · Stories
- **Conjunto MÁXIMO de métricas** capturadas em cada tipo (visualizações, saves, shares, likes, comentários, watch time, taps, exits, etc.)
- IA Claude com **structured outputs** gera insights semanais (drift detection, tendências, recomendações práticas)
- **Embed dos últimos 9 posts** via Instagram Embed.js (lazy load)
- Link direto para o Instagram do founder
- Heatmap de melhores horários por tipo de conteúdo
- Histórico completo de followers (que a API não devolve — calculamos via polling)
- **Identidade visual mantida:** mesma paleta gold da FLG (não usar foto/cores do cliente)

---

## Escalabilidade — Pensando em 70 → 300+ clientes

### Cálculo de carga
- **70 clientes hoje × ~30 posts/mês** = ~2.100 posts/mês = ~70/dia
- Cada post: 1 chamada `/insights` ao gerar + 3 chamadas de refresh nos primeiros 7 dias
- **300 clientes (futuro):** ~300 posts/dia × 4 chamadas = 1.200 chamadas/dia
- Rate limit Meta: **200 chamadas/hora por user token** (cada cliente = 1 token)
- Conclusão: cada cliente tem seu próprio rate limit, então a infra escala linear sem gargalo de API

### Estratégias para suportar escala
1. **Polling distribuído:** não puxar todos os 70 clientes ao mesmo tempo. Job APScheduler escolhe 10 clientes por ciclo de 30 min (3h para todos). Stories priorizados (sync mais frequente, antes da expiração 24h).
2. **Sync incremental inteligente:**
   - Posts novos (sem `last_synced_at` ou `< 24h`): pull completo
   - Posts < 7 dias: refresh de métricas a cada 6h (Meta ainda atualiza nos primeiros dias)
   - Posts 7-30 dias: refresh diário (estabilização ainda em curso)
   - Posts > 30 dias: refresh semanal (métricas raramente mudam)
   - **Posts ficam no banco PARA SEMPRE — histórico completo desde o dia da conexão**
3. **Backoff exponencial:** se Meta retornar 429 (rate limit), pausar aquele cliente por 1h.
4. **Job persistente:** APScheduler com SQLAlchemyJobStore (`jobs.db`) — se backend reinicia, jobs retomam.
5. **Isolamento de erros:** falha em 1 cliente NUNCA afeta os outros (try/except por cliente, log estruturado).
6. **Particionamento de tabelas:** `instagram_posts` particionada por `cliente_id` (índice composto) — queries por cliente sempre rápidas mesmo com milhões de linhas.
7. **Connection pooling Supabase:** `pgbouncer` no DATABASE_URL para evitar exhaustion de conexões.
8. **Real-time via webhooks:** Meta envia webhooks para `comments` e `mentions` (instantâneo, sem latência). Salvamos imediatamente.

### Limites operacionais
| Recurso | Capacidade hoje | Capacidade limite |
|---|---|---|
| Supabase Free | 500MB DB, 1GB storage | ~5.000 clientes (50KB cada) |
| APScheduler | Single-process | ~500 clientes simultâneos OK |
| Meta API | 200 req/h por cliente | Sem limite global |
| Sync 30min | 70 clientes | 300+ clientes (com polling distribuído) |

---

## Janelas Analíticas e Retenção de Dados

### Janelas disponíveis no dashboard (todas calculadas em tempo real sobre dados reais)
- **Hoje** (0h - agora) — métricas do dia em tempo real
- **7 dias** — semana
- **14 dias** — duas semanas
- **28 dias** — ciclo lunar / período Meta padrão
- **30 dias** — mês
- **60 dias** — bimestre
- **90 dias** — trimestre
- **All-time** — desde a conexão do Instagram
- **Custom** — date picker (qualquer intervalo)

### Comparativos automáticos
Cada métrica mostra **delta vs. período anterior equivalente**:
- "30 dias atuais" comparado com "30 dias anteriores"
- "7 dias atuais" comparado com "7 dias anteriores"
- Visualização: ↑ +12% ou ↓ -3%

### Retenção de dados
- **Posts:** retidos para sempre (sem TTL)
- **Stories:** sync prioritário antes das 24h da expiração — dados ficam no banco mesmo após o Story sumir do Instagram
- **Snapshots de perfil:** 1 por dia, retidos para sempre (formam o histórico de followers que a API não devolve)
- **Insights da IA:** retidos para sempre (auditoria de evolução)
- **Tokens OAuth:** rotacionados a cada 50 dias automaticamente

### Snapshot diário de perfil (`instagram_followers_historico`)
Capturado todo dia às 00h05 (timezone São Paulo) para cada cliente conectado:
- followers_count
- follows_count
- media_count
- delta_followers (calculado: hoje - ontem)
- engagement_rate_dia (média ponderada dos posts publicados no dia)

Isso resolve o gap da Meta API que **não retorna histórico** — calculamos nós mesmos via polling diário.

### Métricas agregadas pré-calculadas (cache para performance)
Tabela `instagram_metricas_diarias` armazena resumos diários por tipo de conteúdo:
- Total de posts/reels/stories publicados no dia
- Soma de likes, comentários, saves, shares, plays, reach, impressions
- Engagement rate médio
- Best post do dia (highest engagement)

Isso permite consultas rápidas para janelas de 90+ dias sem ter que somar 90 × ~30 posts a cada request.

---

## Estrutura de Banco (Migration 005)

### Tabela: `instagram_conexoes`
Armazena tokens OAuth e dados da conta vinculada por cliente.

```sql
CREATE TABLE IF NOT EXISTS instagram_conexoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,

  -- OAuth (Facebook Login)
  fb_user_id TEXT,                       -- Facebook user ID
  fb_page_id TEXT NOT NULL,              -- Facebook Page (obrigatório p/ Business)
  ig_user_id TEXT NOT NULL UNIQUE,       -- Instagram Business Account ID
  username TEXT NOT NULL,                -- @handle
  access_token TEXT NOT NULL,            -- Long-lived (60 dias)
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT,

  -- Profile snapshot (atualizado a cada poll)
  profile_picture_url TEXT,              -- URL original (CDN expira)
  profile_picture_cached_url TEXT,       -- URL no Supabase Storage (estável)
  profile_picture_cached_at TIMESTAMPTZ,
  display_name TEXT,
  biography TEXT,
  website TEXT,
  followers_count INT,
  follows_count INT,
  media_count INT,

  -- Status
  status VARCHAR(20) DEFAULT 'ativo',    -- ativo | expirado | erro | pausado
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  next_refresh_at TIMESTAMPTZ,           -- Quando refresh do token

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cliente_id)
);

CREATE INDEX idx_ig_conexoes_status ON instagram_conexoes(status);
CREATE INDEX idx_ig_conexoes_next_refresh ON instagram_conexoes(next_refresh_at);
```

### Tabela: `instagram_followers_historico`
Snapshot diário de followers (a API não dá histórico, calculamos).

```sql
CREATE TABLE IF NOT EXISTS instagram_followers_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  followers_count INT NOT NULL,
  follows_count INT,
  media_count INT,
  delta_followers INT,                   -- Calculado: hoje - ontem
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cliente_id, data)
);

CREATE INDEX idx_ig_followers_lookup ON instagram_followers_historico(cliente_id, data DESC);
```

### Tabela: `instagram_posts`
Cada post/reel/story como linha. Tipo separa categorias.

```sql
CREATE TABLE IF NOT EXISTS instagram_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  ig_media_id TEXT NOT NULL UNIQUE,      -- ID na Meta Graph API

  -- Tipo de conteúdo (CRÍTICO para separação)
  media_product_type VARCHAR(20) NOT NULL,  -- FEED | REELS | STORY
  media_type VARCHAR(20),                   -- IMAGE | VIDEO | CAROUSEL_ALBUM
  is_carousel BOOLEAN DEFAULT FALSE,

  -- Conteúdo
  caption TEXT,
  permalink TEXT,                        -- URL pública (para embed)
  media_url TEXT,                        -- URL da mídia
  thumbnail_url TEXT,                    -- Para vídeos/reels
  thumbnail_cached_url TEXT,             -- Cache no Supabase Storage

  -- Timestamps
  posted_at TIMESTAMPTZ NOT NULL,
  story_expires_at TIMESTAMPTZ,          -- Stories: 24h após postagem

  -- Métricas comuns
  reach INT DEFAULT 0,
  impressions INT DEFAULT 0,
  saved INT DEFAULT 0,
  shares INT DEFAULT 0,
  total_interactions INT DEFAULT 0,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,

  -- Métricas Feed/Carousel específicas
  profile_visits INT DEFAULT 0,
  follows INT DEFAULT 0,                 -- Novos seguidores deste post

  -- Métricas Reels específicas
  plays INT DEFAULT 0,
  ig_reels_video_view_total_time BIGINT,  -- ms
  ig_reels_avg_watch_time BIGINT,         -- ms

  -- Métricas Stories específicas (capturar antes de 24h pós-expirar!)
  exits INT DEFAULT 0,
  replies INT DEFAULT 0,
  taps_forward INT DEFAULT 0,
  taps_back INT DEFAULT 0,

  -- Metadata
  ultima_atualizacao_metricas TIMESTAMPTZ DEFAULT NOW(),
  metricas_finalizadas BOOLEAN DEFAULT FALSE,  -- Stories: TRUE quando expirado e dados salvos
  raw_insights JSONB,                          -- Dump completo da API

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ig_posts_cliente ON instagram_posts(cliente_id, posted_at DESC);
CREATE INDEX idx_ig_posts_type ON instagram_posts(cliente_id, media_product_type, posted_at DESC);
CREATE INDEX idx_ig_posts_story_expiring ON instagram_posts(story_expires_at)
  WHERE media_product_type = 'STORY' AND metricas_finalizadas = FALSE;
```

### Tabela: `instagram_insights_ia`
Análises semanais geradas pela IA (Claude).

```sql
CREATE TABLE IF NOT EXISTS instagram_insights_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,

  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,

  -- Análise estruturada (JSON do Claude)
  tendencia VARCHAR(20),                 -- crescimento | queda | estavel
  drift_detectado BOOLEAN DEFAULT FALSE,
  drift_severity VARCHAR(20),            -- baixa | media | alta
  insight_principal TEXT,
  recomendacoes JSONB,                   -- array de strings
  pontos_fortes JSONB,
  pontos_atencao JSONB,
  score_geral DECIMAL(3,1),              -- 0-10

  -- Comparativos
  vs_periodo_anterior JSONB,             -- {seguidores: +5%, engajamento: -12%, ...}
  melhor_post_id UUID REFERENCES instagram_posts(id),
  pior_post_id UUID REFERENCES instagram_posts(id),

  -- Metadata
  modelo_usado VARCHAR(50),
  tokens_usados INT,
  raw_output TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ig_insights_cliente ON instagram_insights_ia(cliente_id, periodo_fim DESC);
```

### Tabela: `instagram_metricas_diarias` (CACHE — performance crítica)
Agregados diários pré-calculados por tipo de conteúdo. Atualizada automaticamente sempre que sync roda. Permite queries de 90 dias sem somar centenas de linhas.

```sql
CREATE TABLE IF NOT EXISTS instagram_metricas_diarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  media_product_type VARCHAR(20) NOT NULL,  -- FEED | REELS | STORY | ALL

  -- Volume
  posts_publicados INT DEFAULT 0,

  -- Métricas absolutas (somatório do dia)
  total_likes INT DEFAULT 0,
  total_comments INT DEFAULT 0,
  total_saves INT DEFAULT 0,
  total_shares INT DEFAULT 0,
  total_reach INT DEFAULT 0,
  total_impressions INT DEFAULT 0,
  total_plays INT DEFAULT 0,                -- Reels
  total_watch_time_ms BIGINT DEFAULT 0,     -- Reels
  total_profile_visits INT DEFAULT 0,
  total_follows INT DEFAULT 0,              -- Followers ganhos via posts do dia
  total_exits INT DEFAULT 0,                -- Stories
  total_replies INT DEFAULT 0,              -- Stories
  total_taps_forward INT DEFAULT 0,         -- Stories
  total_taps_back INT DEFAULT 0,            -- Stories

  -- Métricas calculadas (médias)
  avg_engagement_rate DECIMAL(6,3),         -- (likes+comments+saves+shares) / reach
  avg_reach_per_post INT,
  avg_watch_time_seconds DECIMAL(8,2),      -- Reels

  -- Top post do dia
  best_post_id UUID REFERENCES instagram_posts(id),
  best_post_engagement DECIMAL(8,3),

  ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cliente_id, data, media_product_type)
);

CREATE INDEX idx_ig_metricas_diarias_lookup
  ON instagram_metricas_diarias(cliente_id, data DESC, media_product_type);
```

### Tabela: `instagram_horarios_engagement`
Heatmap de melhores horários por tipo de conteúdo.

```sql
CREATE TABLE IF NOT EXISTS instagram_horarios_engagement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  media_product_type VARCHAR(20) NOT NULL,  -- FEED | REELS | STORY
  dia_semana INT NOT NULL,                  -- 0=domingo, 6=sábado
  faixa_horaria INT NOT NULL,               -- 0-23
  taxa_engajamento_media DECIMAL(6,2),
  total_posts INT DEFAULT 0,
  ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cliente_id, media_product_type, dia_semana, faixa_horaria)
);
```

---

## Backend — Arquitetura

### `backend/services/meta_oauth.py`
Fluxo OAuth Facebook Login → Long-lived token → Salvar `instagram_conexoes`.

```python
# Endpoints
GET  /metricas/instagram/connect/{cliente_id}  → redirect para Facebook OAuth
GET  /metricas/instagram/callback              → callback OAuth, salva conexão
POST /metricas/instagram/disconnect/{cliente_id}
GET  /metricas/instagram/status/{cliente_id}   → conectado? expirado? sync recente?
```

### `backend/services/instagram_sync.py`
Polling a cada 30 min para todas as conexões ativas.

**Sequência de sync por cliente:**
1. Refresh token se < 7 dias para expirar
2. Buscar profile (followers_count, profile_picture_url, etc.)
3. Salvar snapshot em `instagram_followers_historico` (1x/dia)
4. Cachear profile_picture no Supabase Storage se > 20h velha
5. Buscar últimos 50 media (`/me/media`)
6. Para cada media nova ou < 7 dias: buscar `/insights`
7. Para Stories: buscar AGORA antes de expirar (24h)
8. Recalcular `instagram_horarios_engagement`

### `backend/services/instagram_insights.py`
IA Claude gera insights semanais.

```python
class InsightsSemana(BaseModel):
    tendencia: Literal["crescimento", "queda", "estavel"]
    drift_detectado: bool
    drift_severity: Literal["baixa", "media", "alta"]
    insight_principal: str
    recomendacoes: list[str]
    pontos_fortes: list[str]
    pontos_atencao: list[str]
    score_geral: float
    melhor_post_motivo: str
    pior_post_motivo: str
```

Roda toda segunda-feira às 8h (APScheduler).

### `backend/routes/metricas_instagram.py`
Endpoints novos (todos aceitam `?janela=7|14|28|30|60|90|all|custom&inicio=&fim=`):

```python
GET /metricas/{cliente_id}/instagram/perfil
  → username, foto, bio, link, followers atual, status conexão

GET /metricas/{cliente_id}/instagram/overview?janela=30
  → KPIs gerais agregados na janela + delta vs período anterior

GET /metricas/{cliente_id}/instagram/followers?janela=90
  → série temporal diária de followers + delta diário

GET /metricas/{cliente_id}/instagram/posts?tipo=FEED|REELS|STORY&janela=30&limit=50
  → lista de posts no período com TODAS as métricas

GET /metricas/{cliente_id}/instagram/diario?tipo=FEED&janela=30
  → série temporal de métricas agregadas por dia (para gráficos)

GET /metricas/{cliente_id}/instagram/horarios?tipo=FEED|REELS&janela=90
  → heatmap dia-da-semana × hora-do-dia

GET /metricas/{cliente_id}/instagram/top-posts?tipo=ALL&janela=30&por=engagement|saves|reach&limit=10
  → ranking de melhores posts por critério

GET /metricas/{cliente_id}/instagram/insights?janela=7|30
  → análise IA Claude da janela

GET /metricas/{cliente_id}/instagram/embed/{media_id}
  → oEmbed proxy para evitar expor token Meta no frontend

POST /metricas/{cliente_id}/instagram/sync-now
  → force sync (admin only, rate-limited 1x/min)

POST /metricas/{cliente_id}/instagram/insights/regenerate
  → força nova análise IA (rate-limited 3x/dia)

# Webhooks (Meta → nosso backend)
POST /api/webhooks/instagram/comments     # Comentário novo (real-time)
POST /api/webhooks/instagram/mentions     # @ mention (real-time)
GET  /api/webhooks/instagram              # Verificação de webhook (Meta)
```

---

## Frontend — Reformulação da aba Métricas

### Header novo (topo)
- **Foto de perfil** (cached) circular grande
- **@username** com link `instagram.com/{username}` (target=_blank)
- **Bio** (truncada)
- Badge: "Conectado" / "Token expirando em X dias" / "Desconectado"
- Botão: "Sincronizar agora" (admin)

### Tabs principais por tipo de conteúdo
```
[ Visão Geral ] [ Posts/Feed ] [ Reels ] [ Stories ]
```

Cada tab com KPIs específicos:

#### Visão Geral
- **Followers** com sparkline 90 dias + delta
- Engajamento médio (todos os tipos)
- Alcance médio (todos os tipos)
- Visitas ao perfil
- Crescimento de followers (gráfico de área 90 dias)
- Insights IA (card grande com análise da semana)

#### Posts/Feed (`media_product_type = FEED`)
- Posts publicados (30d)
- Alcance médio por post
- **Saves** (grande destaque — métrica crítica para Instagram)
- Profile visits gerados
- Comentários médios
- Heatmap melhores horários (por dia × hora)
- **Grid de embeds dos últimos 9 posts** com Instagram Embed.js
- Top 5 posts por engajamento (com métricas)

#### Reels
- Reels publicados (30d)
- **Plays totais**
- **Avg watch time** (segundos)
- Watch time total (horas)
- Reach médio por Reel
- Saves (Reels viralizam por save)
- Heatmap específico de Reels
- **Grid de embeds dos últimos 9 Reels**
- Top 5 Reels (ordenados por plays)

#### Stories
- Stories publicados (30d)
- **Reach médio**
- **Taxa de retenção** (1 - exits/impressions)
- **Taps forward vs back** (sinaliza interesse)
- Replies (engagement direto)
- Heatmap horários de Stories
- Top 5 Stories (por retention rate)
- Aviso: "Stories expiram em 24h. Dados capturados antes da expiração."

### Embed dos posts
Componente `<InstagramEmbed url={permalink} />` com:
- Lazy load via IntersectionObserver
- Skeleton loader enquanto carrega
- Botão "Ver no Instagram" como fallback

### Insights IA (sidebar ou card destacado)
- Tendência da semana (badge: ↑ crescimento | ↓ queda | → estável)
- Insight principal (1 parágrafo)
- 3-5 recomendações práticas
- Pontos de atenção (drift detection)
- Score geral 0-10
- Botão: "Gerar nova análise" (rate-limited)

---

## Setup Necessário (Você precisa fazer)

### 1. App no Meta for Developers
1. Acesse https://developers.facebook.com/apps/
2. Criar novo app: tipo **Business**
3. Adicionar produtos:
   - Instagram (Graph API)
   - Facebook Login
4. Configurar redirect URI: `https://docs.foundersledgrowth.online/api/metricas/instagram/callback`
5. Anotar `App ID` e `App Secret`

### 2. App Review (5-15 dias úteis)
**Permissions a solicitar:**
- `instagram_basic`
- `instagram_manage_insights` (Advanced — exige review)
- `pages_show_list`
- `pages_read_engagement`
- `business_management`

**Materiais necessários:**
- Privacy Policy URL (criar página simples)
- Terms of Service URL
- Screencast mostrando o uso de cada permission
- Justificativa por escrito do uso

### 3. Conta Instagram Business
- Cliente precisa converter conta para **Business** ou **Creator**
- Vincular a uma Facebook Page
- Pedro ou consultor faz isso junto com o cliente no onboarding

### 4. Variáveis de ambiente
```env
META_APP_ID=...
META_APP_SECRET=...
META_REDIRECT_URI=https://docs.foundersledgrowth.online/api/metricas/instagram/callback
INSTAGRAM_OEMBED_TOKEN=...  # Para gerar oEmbed dos posts
```

---

## Cronograma de Fases — Infra primeiro, Frontend depois

### Fase 1 — Schema completo + OAuth (4h) — **COMEÇAR AGORA**
- Migration 005 com TODAS as 6 tabelas:
  - `instagram_conexoes` (tokens + perfil)
  - `instagram_followers_historico` (snapshot diário)
  - `instagram_posts` (posts + reels + stories com TODAS as métricas)
  - `instagram_metricas_diarias` (cache agregado para queries rápidas)
  - `instagram_horarios_engagement` (heatmap)
  - `instagram_insights_ia` (análises Claude)
- Endpoints OAuth Facebook Login (`/connect`, `/callback`, `/status`, `/disconnect`)
- Token refresh job (50 dias)
- Funciona em modo Development sem App Review aprovado

### Fase 2 — Sync engine completo (6h)
- `instagram_sync.py` com:
  - Sync de perfil + snapshot diário às 00h05
  - Sync de posts/reels/stories diferenciados
  - Sync inteligente: posts < 24h (completo), < 7d (6h), < 30d (diário), > 30d (semanal)
  - Stories: sync prioritário antes de 24h expirar
  - Cálculo automático de `instagram_metricas_diarias` após cada sync
  - Recálculo automático de `instagram_horarios_engagement`
  - Backoff exponencial em rate limit
  - Polling distribuído (10 clientes / 30min)
  - APScheduler com SQLAlchemyJobStore (persistente)

### Fase 3 — Webhooks real-time + endpoints API (4h)
- Webhook endpoints para comments e mentions Meta
- Endpoints REST com janelas (7/14/28/30/60/90/all/custom)
- Sistema de delta vs período anterior em todos os endpoints
- oEmbed proxy

### Fase 4 — Insights IA Claude (3h)
- `instagram_insights.py` com structured outputs Pydantic
- Schema completo: tendência, drift, recomendações, score, melhores posts
- Job semanal segunda 8h
- Endpoint manual rate-limited

### Fase 5 — Stress test + monitoring (2h)
- Simular sync de 70 clientes simultâneos
- Verificar pgbouncer + connection pool
- Logs estruturados (cliente_id, tempo, erro)
- Dashboard interno de status de syncs (admin)

### Fase 6 — Frontend reformulado (6h) — **só após infra estável**
- Tabs por tipo (Visão Geral / Posts / Reels / Stories)
- Selector de janela analítica (7/14/28/30/60/90/all)
- KPIs específicos por aba com delta vs período anterior
- Heatmap com `@nivo/heatmap`
- Embeds com lazy loading + IntersectionObserver
- Card de insights IA na Visão Geral
- Identidade FLG mantida (gold palette)

### Fase 7 — App Review Meta (em paralelo, qualquer momento)
- Privacy Policy + Terms (Pedro escreve)
- Screencast de cada permission
- Submeter
- 5-15 dias úteis

**Total dev:** ~25h
**Ordem:** Infra (Fases 1-5, ~19h) → Frontend (Fase 6, ~6h)
**Em paralelo:** App Review Meta

---

## Pontos críticos que vamos resolver

| Problema | Solução |
|---|---|
| Token expira em 60 dias | Job de refresh aos 50 dias |
| Profile pic CDN expira em 24h | Cache no Supabase Storage, refresh 20h |
| API não dá histórico de followers | Polling diário + tabela `instagram_followers_historico` |
| Stories somem em 24h | Sync prioritário antes de expirar |
| Sem webhook de novo post | Polling 30min em todas conexões ativas |
| Rate limit 200 calls/h por token | Sync inteligente: só posts novos/recentes |
| App Review demorado | Modo Development cobre 25 testers (suficiente p/ piloto) |

---

## Diferenças cruciais vs versão atual

| Atual | V2 |
|---|---|
| Mock data | Dados reais Meta Graph API |
| 4 plataformas misturadas | Foco Instagram com profundidade |
| Métricas genéricas | Específicas por tipo de conteúdo |
| Sem histórico real | Histórico de followers, posts, métricas |
| Sem visualização de conteúdo | Embeds reais + thumbs cached |
| Recomendações estáticas | IA Claude com structured outputs |
| Sem refresh automático | Polling 30min + refresh tokens |
| Sem identidade do cliente | Foto, @, bio, link Instagram |

---

## Bibliotecas a adicionar

**Backend (mínimo):**
- Nada — usar `anthropic` (já no projeto), `httpx` (já), Supabase Storage (já)

**Frontend:**
- `@nivo/heatmap @nivo/core` — Apenas para heatmap (Recharts cobre o resto)

**Skip:**
- `react-instagram-embed` (deprecated, usar embed.js direto)
- Tremor (conflita com nosso CSS variables)
- Celery/Temporal (APScheduler é suficiente)

---

## Próximo passo

Confirma o plano e eu começo pela **Fase 1** (schema + OAuth) ainda hoje. As Fases 2-5 podem rodar enquanto a Fase 6 (App Review) acontece em paralelo.

Para a Fase 1 funcionar em produção, você precisa:
1. Criar o App no Meta for Developers (10 min) — me passa App ID e App Secret
2. Ter pelo menos 1 cliente teste com conta Instagram Business

Sem isso, a Fase 1 fica completa mas sem cliente conectado para testar end-to-end.
