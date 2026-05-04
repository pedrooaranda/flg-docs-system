# Multi-Plataforma Métricas — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended pra time pressure inline). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar dropdown de plataforma (Instagram + YouTube + LinkedIn + TikTok) na aba Métricas, com tabs adaptáveis por plataforma e KPIs realistas via mocks robustos. UI funcional pra all-hands de hoje. OAuth/sync real fica pra Fase 2.

**Architecture:** Backend já tem mocks Y/L/T em `social.py` e builders por plataforma em `metricas.py`. Vou expandir builders pra ter sub-tipos (geral/videos/shorts pra YouTube, geral/posts/artigos pra LinkedIn, geral/videos pra TikTok). Frontend ganha `PlatformSelector` ao lado do `ClienteCombobox`, `PLATFORM_TABS` constant que renderiza tabs dinamicamente, banner "Mock — em desenvolvimento" pras 3 novas. Wrappers finos por sub-tipo (~14 linhas cada) reusam `MetricasTipoView` que já é agnóstico.

**Tech Stack:** FastAPI + Supabase backend; React + Vite + Tailwind + framer-motion + lucide-react frontend.

**Spec:** [specs/2026-05-04-multiplataforma-design.md](../specs/2026-05-04-multiplataforma-design.md)

---

## Estrutura de arquivos

**Modificar:**
- `backend/routes/metricas.py` — expandir `_KPI_BUILDERS` com sub-tipos pra Y/L/T
- `frontend/src/components/Metricas/shared/constants.js` — adicionar `PLATFORM_TABS`, `KPIS_YT_*`, `KPIS_LI_*`, `KPIS_TT_*`, `ORDER_OPTIONS_*` pras novas
- `frontend/src/components/Metricas/MetricasLayout.jsx` — platform vira estado URL + tabs dinâmicas + esconder IG-specific
- `frontend/src/App.jsx` — adicionar 5 rotas novas pras tabs novas

**Criar:**
- `frontend/src/components/Metricas/shared/PlatformSelector.jsx`
- `frontend/src/components/Metricas/shared/MockPlatformBanner.jsx`
- `frontend/src/components/Metricas/MetricasYTVideos.jsx`
- `frontend/src/components/Metricas/MetricasYTShorts.jsx`
- `frontend/src/components/Metricas/MetricasLIPosts.jsx`
- `frontend/src/components/Metricas/MetricasLIArtigos.jsx`
- `frontend/src/components/Metricas/MetricasTTVideos.jsx`

---

## Tasks

### Task 1: Backend — builders por sub-tipo (YT/LI/TT)

`metricas.py` hoje tem 1 builder por plataforma não-IG. Preciso de sub-tipos pra suportar tabs Vídeos/Shorts (YouTube), Posts/Artigos (LinkedIn), Vídeos (TikTok).

**Files:**
- Modify: `backend/routes/metricas.py:140-200`

- [ ] **Step 1: Substituir `_build_kpis_linkedin` por 3 builders (geral/posts/artigos)**

Editar `backend/routes/metricas.py`. Localizar `def _build_kpis_linkedin(atual, anterior):` (linha ~140). Substituir essa função (até a próxima `def`) por:

```python
def _build_kpis_linkedin_geral(atual, anterior):
    return {
        "seguidores": {"valor": _last(atual, "seguidores"), "delta_pct": _delta_pct(_last(atual, "seguidores"), _last(anterior, "seguidores"))},
        "conexoes": {"valor": _last(atual, "conexoes"), "delta_pct": _delta_pct(_last(atual, "conexoes"), _last(anterior, "conexoes"))},
        "ssi_score": {"valor": _avg(atual, "ssi_score"), "delta_pct": _delta_pct(_avg(atual, "ssi_score"), _avg(anterior, "ssi_score"))},
        "taxa_engajamento": {"valor": _avg(atual, "taxa_engajamento"), "delta_pct": _delta_pct(_avg(atual, "taxa_engajamento"), _avg(anterior, "taxa_engajamento"))},
        "impressoes_posts": {"valor": int(_avg(atual, "impressoes_posts")), "delta_pct": _delta_pct(_avg(atual, "impressoes_posts"), _avg(anterior, "impressoes_posts"))},
        "visualizacoes_perfil": {"valor": _sum(atual, "visualizacoes_perfil"), "delta_pct": _delta_pct(_sum(atual, "visualizacoes_perfil"), _sum(anterior, "visualizacoes_perfil"))},
        "reacoes_total": {"valor": _sum(atual, "reacoes_total"), "delta_pct": _delta_pct(_sum(atual, "reacoes_total"), _sum(anterior, "reacoes_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
        "posts_publicados": {"valor": _sum(atual, "posts_publicados"), "noDelta": True},
        "artigos_publicados": {"valor": _sum(atual, "artigos_publicados"), "noDelta": True},
    }


def _build_kpis_linkedin_posts(atual, anterior):
    return {
        "posts_publicados": {"valor": _sum(atual, "posts_publicados")},
        "impressoes_posts": {"valor": int(_avg(atual, "impressoes_posts")), "delta_pct": _delta_pct(_avg(atual, "impressoes_posts"), _avg(anterior, "impressoes_posts"))},
        "taxa_engajamento": {"valor": _avg(atual, "taxa_engajamento"), "delta_pct": _delta_pct(_avg(atual, "taxa_engajamento"), _avg(anterior, "taxa_engajamento"))},
        "reacoes_total": {"valor": _sum(atual, "reacoes_total"), "delta_pct": _delta_pct(_sum(atual, "reacoes_total"), _sum(anterior, "reacoes_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
        "compartilhamentos_total": {"valor": _sum(atual, "compartilhamentos_total"), "delta_pct": _delta_pct(_sum(atual, "compartilhamentos_total"), _sum(anterior, "compartilhamentos_total"))},
    }


def _build_kpis_linkedin_artigos(atual, anterior):
    return {
        "artigos_publicados": {"valor": _sum(atual, "artigos_publicados")},
        "impressoes_posts": {"valor": int(_avg(atual, "impressoes_posts")), "delta_pct": _delta_pct(_avg(atual, "impressoes_posts"), _avg(anterior, "impressoes_posts"))},
        "taxa_engajamento": {"valor": _avg(atual, "taxa_engajamento"), "delta_pct": _delta_pct(_avg(atual, "taxa_engajamento"), _avg(anterior, "taxa_engajamento"))},
        "visualizacoes_perfil": {"valor": _sum(atual, "visualizacoes_perfil"), "delta_pct": _delta_pct(_sum(atual, "visualizacoes_perfil"), _sum(anterior, "visualizacoes_perfil"))},
        "reacoes_total": {"valor": _sum(atual, "reacoes_total"), "delta_pct": _delta_pct(_sum(atual, "reacoes_total"), _sum(anterior, "reacoes_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
    }
```

- [ ] **Step 2: Substituir `_build_kpis_youtube` por 3 builders**

Localizar `def _build_kpis_youtube` (linha ~154). Substituir por:

```python
def _build_kpis_youtube_geral(atual, anterior):
    return {
        "inscritos": {"valor": _last(atual, "inscritos"), "delta_pct": _delta_pct(_last(atual, "inscritos"), _last(anterior, "inscritos"))},
        "visualizacoes": {"valor": _sum(atual, "visualizacoes"), "delta_pct": _delta_pct(_sum(atual, "visualizacoes"), _sum(anterior, "visualizacoes"))},
        "watch_time_horas": {"valor": round(_sum(atual, "watch_time_horas"), 1), "delta_pct": _delta_pct(_sum(atual, "watch_time_horas"), _sum(anterior, "watch_time_horas"))},
        "ctr_pct": {"valor": _avg(atual, "ctr_pct"), "delta_pct": _delta_pct(_avg(atual, "ctr_pct"), _avg(anterior, "ctr_pct"))},
        "taxa_retencao_pct": {"valor": _avg(atual, "taxa_retencao_pct"), "delta_pct": _delta_pct(_avg(atual, "taxa_retencao_pct"), _avg(anterior, "taxa_retencao_pct"))},
        "likes_total": {"valor": _sum(atual, "likes_total"), "delta_pct": _delta_pct(_sum(atual, "likes_total"), _sum(anterior, "likes_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
        "videos_publicados": {"valor": _sum(atual, "videos_publicados"), "noDelta": True},
        "shorts_publicados": {"valor": _sum(atual, "shorts_publicados"), "noDelta": True},
    }


def _build_kpis_youtube_videos(atual, anterior):
    return {
        "videos_publicados": {"valor": _sum(atual, "videos_publicados")},
        "visualizacoes": {"valor": _sum(atual, "visualizacoes"), "delta_pct": _delta_pct(_sum(atual, "visualizacoes"), _sum(anterior, "visualizacoes"))},
        "watch_time_horas": {"valor": round(_sum(atual, "watch_time_horas"), 1), "delta_pct": _delta_pct(_sum(atual, "watch_time_horas"), _sum(anterior, "watch_time_horas"))},
        "duracao_media_min": {"valor": _avg(atual, "duracao_media_min"), "delta_pct": _delta_pct(_avg(atual, "duracao_media_min"), _avg(anterior, "duracao_media_min"))},
        "taxa_retencao_pct": {"valor": _avg(atual, "taxa_retencao_pct"), "delta_pct": _delta_pct(_avg(atual, "taxa_retencao_pct"), _avg(anterior, "taxa_retencao_pct"))},
        "ctr_pct": {"valor": _avg(atual, "ctr_pct"), "delta_pct": _delta_pct(_avg(atual, "ctr_pct"), _avg(anterior, "ctr_pct"))},
        "likes_total": {"valor": _sum(atual, "likes_total"), "delta_pct": _delta_pct(_sum(atual, "likes_total"), _sum(anterior, "likes_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
    }


def _build_kpis_youtube_shorts(atual, anterior):
    return {
        "shorts_publicados": {"valor": _sum(atual, "shorts_publicados")},
        "visualizacoes": {"valor": _sum(atual, "visualizacoes"), "delta_pct": _delta_pct(_sum(atual, "visualizacoes"), _sum(anterior, "visualizacoes"))},
        "taxa_retencao_pct": {"valor": _avg(atual, "taxa_retencao_pct"), "delta_pct": _delta_pct(_avg(atual, "taxa_retencao_pct"), _avg(anterior, "taxa_retencao_pct"))},
        "likes_total": {"valor": _sum(atual, "likes_total"), "delta_pct": _delta_pct(_sum(atual, "likes_total"), _sum(anterior, "likes_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
        "compartilhamentos_total": {"valor": _sum(atual, "compartilhamentos_total"), "delta_pct": _delta_pct(_sum(atual, "compartilhamentos_total"), _sum(anterior, "compartilhamentos_total"))},
    }
```

- [ ] **Step 3: Substituir `_build_kpis_tiktok` por 2 builders**

Localizar `def _build_kpis_tiktok` (linha ~167). Substituir por:

```python
def _build_kpis_tiktok_geral(atual, anterior):
    return {
        "seguidores": {"valor": _last(atual, "seguidores"), "delta_pct": _delta_pct(_last(atual, "seguidores"), _last(anterior, "seguidores"))},
        "visualizacoes_video": {"valor": _sum(atual, "visualizacoes_video"), "delta_pct": _delta_pct(_sum(atual, "visualizacoes_video"), _sum(anterior, "visualizacoes_video"))},
        "taxa_engajamento": {"valor": _avg(atual, "taxa_engajamento"), "delta_pct": _delta_pct(_avg(atual, "taxa_engajamento"), _avg(anterior, "taxa_engajamento"))},
        "taxa_conclusao": {"valor": _avg(atual, "taxa_conclusao"), "delta_pct": _delta_pct(_avg(atual, "taxa_conclusao"), _avg(anterior, "taxa_conclusao"))},
        "fyp_pct": {"valor": _avg(atual, "fyp_pct"), "delta_pct": _delta_pct(_avg(atual, "fyp_pct"), _avg(anterior, "fyp_pct"))},
        "curtidas_total": {"valor": _sum(atual, "curtidas_total"), "delta_pct": _delta_pct(_sum(atual, "curtidas_total"), _sum(anterior, "curtidas_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
        "compartilhamentos_total": {"valor": _sum(atual, "compartilhamentos_total"), "delta_pct": _delta_pct(_sum(atual, "compartilhamentos_total"), _sum(anterior, "compartilhamentos_total"))},
        "videos_publicados": {"valor": _sum(atual, "videos_publicados"), "noDelta": True},
    }


def _build_kpis_tiktok_videos(atual, anterior):
    return {
        "videos_publicados": {"valor": _sum(atual, "videos_publicados")},
        "visualizacoes_video": {"valor": _sum(atual, "visualizacoes_video"), "delta_pct": _delta_pct(_sum(atual, "visualizacoes_video"), _sum(anterior, "visualizacoes_video"))},
        "taxa_conclusao": {"valor": _avg(atual, "taxa_conclusao"), "delta_pct": _delta_pct(_avg(atual, "taxa_conclusao"), _avg(anterior, "taxa_conclusao"))},
        "fyp_pct": {"valor": _avg(atual, "fyp_pct"), "delta_pct": _delta_pct(_avg(atual, "fyp_pct"), _avg(anterior, "fyp_pct"))},
        "taxa_engajamento": {"valor": _avg(atual, "taxa_engajamento"), "delta_pct": _delta_pct(_avg(atual, "taxa_engajamento"), _avg(anterior, "taxa_engajamento"))},
        "curtidas_total": {"valor": _sum(atual, "curtidas_total"), "delta_pct": _delta_pct(_sum(atual, "curtidas_total"), _sum(anterior, "curtidas_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
        "compartilhamentos_total": {"valor": _sum(atual, "compartilhamentos_total"), "delta_pct": _delta_pct(_sum(atual, "compartilhamentos_total"), _sum(anterior, "compartilhamentos_total"))},
    }
```

- [ ] **Step 4: Atualizar `_KPI_BUILDERS` mapping**

Localizar `_KPI_BUILDERS = {` (linha ~182). Substituir o dict inteiro por:

```python
_KPI_BUILDERS = {
    "instagram": {
        "all": _build_kpis_geral,
        "feed": _build_kpis_feed,
        "reels": _build_kpis_reels,
        "story": _build_kpis_stories,
    },
    "linkedin": {
        "all": _build_kpis_linkedin_geral,
        "posts": _build_kpis_linkedin_posts,
        "artigos": _build_kpis_linkedin_artigos,
    },
    "youtube": {
        "all": _build_kpis_youtube_geral,
        "videos": _build_kpis_youtube_videos,
        "shorts": _build_kpis_youtube_shorts,
    },
    "tiktok": {
        "all": _build_kpis_tiktok_geral,
        "videos": _build_kpis_tiktok_videos,
    },
}
```

- [ ] **Step 5: Atualizar `VALID_TIPO` constant**

Localizar `VALID_TIPO = {"all", "feed", "reels", "story"}` (procura por `VALID_TIPO`). Substituir por:

```python
VALID_TIPO = {"all", "feed", "reels", "story", "videos", "shorts", "posts", "artigos"}
```

- [ ] **Step 6: Validar sintaxe + commit**

```bash
python3 -m py_compile backend/routes/metricas.py
git add backend/routes/metricas.py
git commit -m "feat(metricas): builders por sub-tipo pra YT/LI/TT (multi-plataforma fase 1)"
```

---

### Task 2: Frontend — `constants.js` (PLATFORM_TABS, KPIS_*, ORDER_OPTIONS_*)

**Files:**
- Modify: `frontend/src/components/Metricas/shared/constants.js`

- [ ] **Step 1: Adicionar imports + PLATFORM_TABS no fim do arquivo**

Editar `frontend/src/components/Metricas/shared/constants.js`. **No topo** dos imports lucide-react existentes (linha 4), **trocar** por:

```javascript
import { Users, UserPlus, TrendingUp, Eye, Heart, Bookmark, MessageCircle, BarChart2, Play, Share2, Target, Clock, Film, Camera, Award, Globe, Zap, ThumbsUp } from 'lucide-react'
```

**No fim do arquivo**, adicionar:

```javascript
// Tabs por plataforma — renderizadas dinamicamente em MetricasLayout
export const PLATFORM_TABS = {
  instagram: [
    { key: 'geral', label: 'Geral' },
    { key: 'posts', label: 'Posts' },
    { key: 'reels', label: 'Reels' },
    { key: 'stories', label: 'Stories' },
  ],
  youtube: [
    { key: 'geral', label: 'Geral' },
    { key: 'videos', label: 'Vídeos' },
    { key: 'shorts', label: 'Shorts' },
  ],
  linkedin: [
    { key: 'geral', label: 'Geral' },
    { key: 'posts', label: 'Posts' },
    { key: 'artigos', label: 'Artigos' },
  ],
  tiktok: [
    { key: 'geral', label: 'Geral' },
    { key: 'videos', label: 'Vídeos' },
  ],
}

// Plataformas com badge "Mock" (todas exceto Instagram que tem flow real)
export const PLATFORMS_MOCK = new Set(['youtube', 'linkedin', 'tiktok'])

// ───── KPIs por plataforma ─────

// YouTube
export const KPIS_YT_GERAL = [
  { key: 'inscritos', label: 'Inscritos', icon: Users, histKey: 'inscritos' },
  { key: 'visualizacoes', label: 'Visualizações', icon: Eye, histKey: 'visualizacoes' },
  { key: 'watch_time_horas', label: 'Watch time (h)', icon: Clock, decimals: 1, histKey: 'watch_time_horas' },
  { key: 'ctr_pct', label: 'CTR', icon: Target, decimals: 1, suffix: '%' },
  { key: 'taxa_retencao_pct', label: 'Retenção', icon: TrendingUp, decimals: 1, suffix: '%' },
  { key: 'likes_total', label: 'Likes', icon: ThumbsUp, histKey: 'likes_total' },
  { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle, histKey: 'comentarios_total' },
  { key: 'videos_publicados', label: 'Vídeos', icon: Film, noDelta: true, histKey: 'videos_publicados' },
  { key: 'shorts_publicados', label: 'Shorts', icon: Zap, noDelta: true, histKey: 'shorts_publicados' },
]

export const KPIS_YT_VIDEOS = [
  { key: 'videos_publicados', label: 'Vídeos publicados', icon: Film, noDelta: true },
  { key: 'visualizacoes', label: 'Visualizações', icon: Eye },
  { key: 'watch_time_horas', label: 'Watch time (h)', icon: Clock, decimals: 1 },
  { key: 'duracao_media_min', label: 'Duração média', icon: Clock, decimals: 1, suffix: 'min' },
  { key: 'taxa_retencao_pct', label: 'Retenção média', icon: TrendingUp, decimals: 1, suffix: '%' },
  { key: 'ctr_pct', label: 'CTR', icon: Target, decimals: 1, suffix: '%' },
  { key: 'likes_total', label: 'Likes', icon: ThumbsUp },
  { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle },
]

export const KPIS_YT_SHORTS = [
  { key: 'shorts_publicados', label: 'Shorts publicados', icon: Zap, noDelta: true },
  { key: 'visualizacoes', label: 'Visualizações', icon: Eye },
  { key: 'taxa_retencao_pct', label: 'Retenção', icon: TrendingUp, decimals: 1, suffix: '%' },
  { key: 'likes_total', label: 'Likes', icon: ThumbsUp },
  { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle },
  { key: 'compartilhamentos_total', label: 'Compartilhamentos', icon: Share2 },
]

// LinkedIn
export const KPIS_LI_GERAL = [
  { key: 'seguidores', label: 'Seguidores', icon: Users, histKey: 'seguidores' },
  { key: 'conexoes', label: 'Conexões', icon: UserPlus, histKey: 'conexoes' },
  { key: 'ssi_score', label: 'SSI Score', icon: Award, decimals: 1 },
  { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%' },
  { key: 'impressoes_posts', label: 'Impressões médias', icon: Eye },
  { key: 'visualizacoes_perfil', label: 'Visualizações do perfil', icon: Eye, histKey: 'visualizacoes_perfil' },
  { key: 'reacoes_total', label: 'Reações', icon: ThumbsUp, histKey: 'reacoes_total' },
  { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle, histKey: 'comentarios_total' },
  { key: 'posts_publicados', label: 'Posts', icon: BarChart2, noDelta: true, histKey: 'posts_publicados' },
  { key: 'artigos_publicados', label: 'Artigos', icon: FileTextIcon, noDelta: true, histKey: 'artigos_publicados' },
]

export const KPIS_LI_POSTS = [
  { key: 'posts_publicados', label: 'Posts publicados', icon: BarChart2, noDelta: true },
  { key: 'impressoes_posts', label: 'Impressões médias', icon: Eye },
  { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%' },
  { key: 'reacoes_total', label: 'Reações', icon: ThumbsUp },
  { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle },
  { key: 'compartilhamentos_total', label: 'Compartilhamentos', icon: Share2 },
]

export const KPIS_LI_ARTIGOS = [
  { key: 'artigos_publicados', label: 'Artigos publicados', icon: BarChart2, noDelta: true },
  { key: 'impressoes_posts', label: 'Impressões médias', icon: Eye },
  { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%' },
  { key: 'visualizacoes_perfil', label: 'Visualizações do perfil', icon: Eye },
  { key: 'reacoes_total', label: 'Reações', icon: ThumbsUp },
  { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle },
]

// TikTok
export const KPIS_TT_GERAL = [
  { key: 'seguidores', label: 'Seguidores', icon: Users, histKey: 'seguidores' },
  { key: 'visualizacoes_video', label: 'Visualizações', icon: Eye, histKey: 'visualizacoes_video' },
  { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%' },
  { key: 'taxa_conclusao', label: 'Taxa de conclusão', icon: TrendingUp, decimals: 1, suffix: '%' },
  { key: 'fyp_pct', label: 'For You %', icon: Globe, decimals: 1, suffix: '%' },
  { key: 'curtidas_total', label: 'Curtidas', icon: Heart, histKey: 'curtidas_total' },
  { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle, histKey: 'comentarios_total' },
  { key: 'compartilhamentos_total', label: 'Compartilhamentos', icon: Share2, histKey: 'compartilhamentos_total' },
  { key: 'videos_publicados', label: 'Vídeos', icon: Film, noDelta: true, histKey: 'videos_publicados' },
]

export const KPIS_TT_VIDEOS = [
  { key: 'videos_publicados', label: 'Vídeos publicados', icon: Film, noDelta: true },
  { key: 'visualizacoes_video', label: 'Visualizações', icon: Eye },
  { key: 'taxa_conclusao', label: 'Taxa de conclusão', icon: TrendingUp, decimals: 1, suffix: '%' },
  { key: 'fyp_pct', label: 'For You %', icon: Globe, decimals: 1, suffix: '%' },
  { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%' },
  { key: 'curtidas_total', label: 'Curtidas', icon: Heart },
  { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle },
  { key: 'compartilhamentos_total', label: 'Compartilhamentos', icon: Share2 },
]

// Order options pras novas plataformas (mock-only por enquanto)
export const ORDER_OPTIONS_GENERIC = [
  { key: 'engajamento', label: 'Mais engajados' },
  { key: 'recente', label: 'Mais recentes' },
]
```

Importante: substituir `FileTextIcon` por `FileText` no import — adicionar `FileText` ao import statement.

- [ ] **Step 2: Adicionar `FileText` ao import lucide-react**

No início do arquivo, na linha de imports lucide-react, adicionar `FileText`:

```javascript
import { Users, UserPlus, TrendingUp, Eye, Heart, Bookmark, MessageCircle, BarChart2, Play, Share2, Target, Clock, Film, Camera, Award, Globe, Zap, ThumbsUp, FileText } from 'lucide-react'
```

E no `KPIS_LI_GERAL`, trocar `icon: FileTextIcon` por `icon: FileText`.

- [ ] **Step 3: Validar bundle**

```bash
cd /Users/usuario/Documents/Pedro\ Aranda/Pedro\ Aranda\ FLG/documentos_oficiais
frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx frontend/src/components/Metricas/shared/constants.js > /dev/null && echo OK
```

---

### Task 3: Frontend — `PlatformSelector` + `MockPlatformBanner`

**Files:**
- Create: `frontend/src/components/Metricas/shared/PlatformSelector.jsx`
- Create: `frontend/src/components/Metricas/shared/MockPlatformBanner.jsx`

- [ ] **Step 1: Criar `PlatformSelector.jsx`**

```jsx
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Check, Instagram, Youtube, Linkedin, Music2 } from 'lucide-react'
import { PLATFORMS, PLATFORMS_MOCK } from './constants'

const ICONS = { instagram: Instagram, youtube: Youtube, linkedin: Linkedin, tiktok: Music2 }

export default function PlatformSelector({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = PLATFORMS[value] || PLATFORMS.instagram
  const CurrentIcon = ICONS[value] || Instagram

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs font-semibold rounded-lg px-3 py-2 cursor-pointer"
        style={{
          background: 'var(--flg-bg-raised)',
          border: `1px solid ${current.color}40`,
          color: 'var(--flg-text)',
        }}
      >
        <CurrentIcon size={13} style={{ color: current.color }} />
        <span>{current.label}</span>
        {PLATFORMS_MOCK.has(value) && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(234,179,8,0.18)', color: '#FACC15' }}>MOCK</span>
        )}
        <ChevronDown size={12} className="opacity-50" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-2 z-50 rounded-xl overflow-hidden min-w-[200px]"
            style={{
              background: 'var(--flg-bg-raised)',
              border: '1px solid var(--flg-bg-card-border)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div className="py-1">
              {Object.entries(PLATFORMS).map(([key, cfg]) => {
                const Icon = ICONS[key]
                const active = key === value
                const isMock = PLATFORMS_MOCK.has(key)
                return (
                  <button
                    key={key}
                    onClick={() => { onChange(key); setOpen(false) }}
                    className="w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors"
                    style={{
                      color: active ? cfg.color : 'var(--flg-text)',
                      background: active ? `${cfg.color}10` : 'transparent',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--flg-bg-hover)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span className="flex items-center gap-2">
                      <Icon size={13} style={{ color: cfg.color }} />
                      {cfg.label}
                      {isMock && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(234,179,8,0.18)', color: '#FACC15' }}>MOCK</span>}
                    </span>
                    {active && <Check size={12} />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 2: Criar `MockPlatformBanner.jsx`**

```jsx
import { motion } from 'framer-motion'
import { Beaker } from 'lucide-react'
import { PLATFORMS } from './constants'

export default function MockPlatformBanner({ platform }) {
  const cfg = PLATFORMS[platform] || PLATFORMS.instagram
  const platLabel = cfg.label
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-3 flex items-center gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(234,179,8,0.08), rgba(245,158,11,0.04))',
        border: '1px solid rgba(234,179,8,0.30)',
      }}
    >
      <div
        className="rounded-lg flex items-center justify-center shrink-0"
        style={{ width: 32, height: 32, background: 'rgba(234,179,8,0.18)', border: '1px solid rgba(234,179,8,0.4)' }}
      >
        <Beaker size={16} style={{ color: '#FACC15' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded uppercase" style={{ background: 'rgba(234,179,8,0.20)', color: '#FACC15' }}>
            Em desenvolvimento
          </span>
          <span className="text-xs text-white/85 font-semibold">
            Dados simulados de {platLabel}
          </span>
        </div>
        <p className="text-[11px] text-white/55 mt-0.5">
          A integração real com {platLabel} está sendo construída e será liberada em breve. Use esses dados pra entender a estrutura final.
        </p>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 3: Validar bundle**

```bash
cd /Users/usuario/Documents/Pedro\ Aranda/Pedro\ Aranda\ FLG/documentos_oficiais
for f in frontend/src/components/Metricas/shared/PlatformSelector.jsx frontend/src/components/Metricas/shared/MockPlatformBanner.jsx; do
  frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx "$f" > /dev/null || exit 1
done && echo OK
```

- [ ] **Step 4: Commit Tasks 2+3**

```bash
git add frontend/src/components/Metricas/shared/constants.js \
        frontend/src/components/Metricas/shared/PlatformSelector.jsx \
        frontend/src/components/Metricas/shared/MockPlatformBanner.jsx
git commit -m "feat(metricas): PlatformSelector + MockBanner + KPIs/tabs por plataforma"
```

---

### Task 4: Frontend — `MetricasLayout` integra dropdown + tabs dinâmicas

**Files:**
- Modify: `frontend/src/components/Metricas/MetricasLayout.jsx`

- [ ] **Step 1: Substituir o componente inteiro**

Substituir conteúdo de `MetricasLayout.jsx` por:

```jsx
import { useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation, Outlet, NavLink } from 'react-router-dom'
import { useApp } from '../../contexts/AppContext'
import { isAdmin as checkAdmin } from '../../lib/utils'
import { DateRangePicker } from '../MetricasParts'
import { IGProfileBadge } from './shared/banners'
import SyncButton from './shared/SyncButton'
import ClienteCombobox from './shared/ClienteCombobox'
import PlatformSelector from './shared/PlatformSelector'
import MockPlatformBanner from './shared/MockPlatformBanner'
import { PLATFORMS, PLATFORM_TABS, PLATFORMS_MOCK } from './shared/constants'

export default function MetricasLayout({ session }) {
  const navigate = useNavigate()
  const params = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = session?.user
  const admin = checkAdmin(user)
  const { clientes: allClientes } = useApp()
  const clientes = admin
    ? allClientes
    : allClientes.filter(c => c.consultor_responsavel?.toLowerCase().includes(user?.email?.split('@')[0] || ''))

  const platform = searchParams.get('plataforma') || 'instagram'
  const platConfig = PLATFORMS[platform] || PLATFORMS.instagram
  const tabs = PLATFORM_TABS[platform] || PLATFORM_TABS.instagram
  const periodo = parseInt(searchParams.get('dias') || '30', 10)
  const clienteId = params.clienteId
  const isMock = PLATFORMS_MOCK.has(platform)

  // Detecta tab pela URL — pega último segmento e valida contra tabs da plataforma
  const validTabKeys = tabs.map(t => t.key)
  const segments = location.pathname.split('/').filter(Boolean)
  const lastSegment = segments[segments.length - 1]
  const tab = validTabKeys.includes(lastSegment) ? lastSegment : 'geral'

  useEffect(() => {
    if (!clienteId && clientes.length > 0) {
      const sp = searchParams.toString()
      navigate(`/metricas/${clientes[0].id}/geral${sp ? '?' + sp : ''}`, { replace: true })
    }
  }, [clienteId, clientes, navigate, searchParams])

  // Quando muda de plataforma, redireciona pra geral (tab pode não existir na plataforma nova)
  function setPlatform(newPlatform) {
    const sp = new URLSearchParams(searchParams)
    sp.set('plataforma', newPlatform)
    navigate(`/metricas/${clienteId}/geral?${sp.toString()}`)
  }

  function setCliente(id) {
    const sp = searchParams.toString()
    navigate(`/metricas/${id}/${tab}${sp ? '?' + sp : ''}`)
  }

  function setPeriodo(dias) {
    const sp = new URLSearchParams(searchParams)
    sp.set('dias', String(dias))
    setSearchParams(sp, { replace: true })
  }

  if (!clienteId) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <p className="text-white/50 text-sm">Selecione um cliente.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <PlatformSelector value={platform} onChange={setPlatform} />
          <ClienteCombobox
            clientes={clientes}
            value={clienteId}
            onChange={setCliente}
            accent={platConfig.color}
          />
          {platform === 'instagram' && <IGProfileBadge clienteId={clienteId} />}
          {platform === 'instagram' && (
            <SyncButton clienteId={clienteId} onSynced={() => window.location.reload()} accent={platConfig.color} />
          )}
        </div>

        <DateRangePicker
          periodo={periodo}
          onChange={setPeriodo}
          accent={platConfig.color}
        />
      </div>

      {isMock && <MockPlatformBanner platform={platform} />}

      <div className="flex items-center gap-1 border-b border-white/10">
        {tabs.map(t => {
          const sp = searchParams.toString()
          const to = `/metricas/${clienteId}/${t.key}${sp ? '?' + sp : ''}`
          const isActive = t.key === tab
          return (
            <NavLink
              key={t.key}
              to={to}
              end={true}
              className="px-4 py-2.5 text-xs font-semibold transition-colors"
              style={isActive
                ? { color: platConfig.color, borderBottom: `2px solid ${platConfig.color}`, marginBottom: '-1px' }
                : { color: 'rgba(255,255,255,0.4)', borderBottom: '2px solid transparent', marginBottom: '-1px' }
              }
            >
              {t.label}
            </NavLink>
          )
        })}
      </div>

      <Outlet context={{ clienteId, periodo, platform, platConfig }} />
    </div>
  )
}
```

- [ ] **Step 2: Validar bundle**

```bash
frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx frontend/src/components/Metricas/MetricasLayout.jsx > /dev/null && echo OK
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Metricas/MetricasLayout.jsx
git commit -m "feat(metricas): MetricasLayout suporta multi-plataforma (dropdown + tabs dinâmicas)"
```

---

### Task 5: Frontend — Wrappers das tabs novas

5 arquivos novos. Cada um é wrapper de ~14 linhas que usa `MetricasTipoView` (já agnóstico).

**Files:**
- Create: `frontend/src/components/Metricas/MetricasYTVideos.jsx`
- Create: `frontend/src/components/Metricas/MetricasYTShorts.jsx`
- Create: `frontend/src/components/Metricas/MetricasLIPosts.jsx`
- Create: `frontend/src/components/Metricas/MetricasLIArtigos.jsx`
- Create: `frontend/src/components/Metricas/MetricasTTVideos.jsx`

- [ ] **Step 1: `MetricasYTVideos.jsx`**

```jsx
import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_YT_VIDEOS, ORDER_OPTIONS_GENERIC } from './shared/constants'

export default function MetricasYTVideos() {
  return (
    <MetricasTipoView
      tipoBackend="videos"
      tipoFiltroPostFE={['VIDEO']}
      kpisDef={KPIS_YT_VIDEOS}
      kpiSkelCount={8}
      sectionTitle="Vídeos do YouTube"
      listTitle="Lista de vídeos"
      emptyMessage="Nenhum vídeo no período."
      orderOptions={ORDER_OPTIONS_GENERIC}
      defaultOrdenar="recente"
    />
  )
}
```

- [ ] **Step 2: `MetricasYTShorts.jsx`**

```jsx
import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_YT_SHORTS, ORDER_OPTIONS_GENERIC } from './shared/constants'

export default function MetricasYTShorts() {
  return (
    <MetricasTipoView
      tipoBackend="shorts"
      tipoFiltroPostFE={['SHORT']}
      kpisDef={KPIS_YT_SHORTS}
      kpiSkelCount={6}
      sectionTitle="Shorts do YouTube"
      listTitle="Lista de Shorts"
      emptyMessage="Nenhum Short no período."
      orderOptions={ORDER_OPTIONS_GENERIC}
      defaultOrdenar="recente"
    />
  )
}
```

- [ ] **Step 3: `MetricasLIPosts.jsx`**

```jsx
import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_LI_POSTS, ORDER_OPTIONS_GENERIC } from './shared/constants'

export default function MetricasLIPosts() {
  return (
    <MetricasTipoView
      tipoBackend="posts"
      tipoFiltroPostFE={['POST', 'POLL', 'DOCUMENT']}
      kpisDef={KPIS_LI_POSTS}
      kpiSkelCount={6}
      sectionTitle="Posts do LinkedIn"
      listTitle="Lista de posts"
      emptyMessage="Nenhum post no período."
      orderOptions={ORDER_OPTIONS_GENERIC}
      defaultOrdenar="recente"
    />
  )
}
```

- [ ] **Step 4: `MetricasLIArtigos.jsx`**

```jsx
import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_LI_ARTIGOS, ORDER_OPTIONS_GENERIC } from './shared/constants'

export default function MetricasLIArtigos() {
  return (
    <MetricasTipoView
      tipoBackend="artigos"
      tipoFiltroPostFE={['ARTICLE']}
      kpisDef={KPIS_LI_ARTIGOS}
      kpiSkelCount={6}
      sectionTitle="Artigos do LinkedIn"
      listTitle="Lista de artigos"
      emptyMessage="Nenhum artigo no período."
      orderOptions={ORDER_OPTIONS_GENERIC}
      defaultOrdenar="recente"
    />
  )
}
```

- [ ] **Step 5: `MetricasTTVideos.jsx`**

```jsx
import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_TT_VIDEOS, ORDER_OPTIONS_GENERIC } from './shared/constants'

export default function MetricasTTVideos() {
  return (
    <MetricasTipoView
      tipoBackend="videos"
      tipoFiltroPostFE={['VIDEO']}
      kpisDef={KPIS_TT_VIDEOS}
      kpiSkelCount={8}
      sectionTitle="Vídeos do TikTok"
      listTitle="Lista de vídeos"
      emptyMessage="Nenhum vídeo no período."
      orderOptions={ORDER_OPTIONS_GENERIC}
      defaultOrdenar="recente"
    />
  )
}
```

- [ ] **Step 6: Validar bundles**

```bash
for f in frontend/src/components/Metricas/MetricasYTVideos.jsx \
         frontend/src/components/Metricas/MetricasYTShorts.jsx \
         frontend/src/components/Metricas/MetricasLIPosts.jsx \
         frontend/src/components/Metricas/MetricasLIArtigos.jsx \
         frontend/src/components/Metricas/MetricasTTVideos.jsx; do
  frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx "$f" > /dev/null || exit 1
done && echo OK
```

---

### Task 6: Frontend — App.jsx rotas + MetricasGeral suporta multi-plataforma

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Metricas/MetricasGeral.jsx`

- [ ] **Step 1: Adicionar imports lazy + rotas em App.jsx**

Em `frontend/src/App.jsx`, na seção de imports lazy (linha ~24-28), adicionar **após** `MetricasStories`:

```javascript
const MetricasYTVideos  = lazy(() => import('./components/Metricas/MetricasYTVideos'))
const MetricasYTShorts  = lazy(() => import('./components/Metricas/MetricasYTShorts'))
const MetricasLIPosts   = lazy(() => import('./components/Metricas/MetricasLIPosts'))
const MetricasLIArtigos = lazy(() => import('./components/Metricas/MetricasLIArtigos'))
const MetricasTTVideos  = lazy(() => import('./components/Metricas/MetricasTTVideos'))
```

E nas rotas dentro de `<Route path="/metricas">` (linha ~111-122), **após** a linha `:clienteId/stories`, adicionar:

```jsx
            <Route path=":clienteId/videos" element={<Suspense fallback={<PageSpinner />}><RouteByPlatform tt={MetricasTTVideos} yt={MetricasYTVideos} /></Suspense>} />
            <Route path=":clienteId/shorts" element={<Suspense fallback={<PageSpinner />}><MetricasYTShorts /></Suspense>} />
            <Route path=":clienteId/artigos" element={<Suspense fallback={<PageSpinner />}><MetricasLIArtigos /></Suspense>} />
```

E **substituir** a rota `:clienteId/posts`:

```jsx
            <Route path=":clienteId/posts" element={<Suspense fallback={<PageSpinner />}><RouteByPlatform ig={MetricasPosts} li={MetricasLIPosts} /></Suspense>} />
```

Adicionar componente helper `RouteByPlatform` no topo do arquivo (após imports):

```jsx
import { useSearchParams } from 'react-router-dom'

function RouteByPlatform({ ig, li, yt, tt, fallback }) {
  const [params] = useSearchParams()
  const platform = params.get('plataforma') || 'instagram'
  if (platform === 'instagram' && ig) {
    const Comp = ig
    return <Comp />
  }
  if (platform === 'linkedin' && li) {
    const Comp = li
    return <Comp />
  }
  if (platform === 'youtube' && yt) {
    const Comp = yt
    return <Comp />
  }
  if (platform === 'tiktok' && tt) {
    const Comp = tt
    return <Comp />
  }
  if (fallback) {
    const Comp = fallback
    return <Comp />
  }
  return null
}
```

- [ ] **Step 2: MetricasGeral usa KPIs por plataforma**

Editar `frontend/src/components/Metricas/MetricasGeral.jsx`. Localizar import `import { KPIS_GERAL, KPI_WEIGHT, GOLD } from './shared/constants'` e substituir por:

```jsx
import { KPIS_GERAL, KPIS_YT_GERAL, KPIS_LI_GERAL, KPIS_TT_GERAL, KPI_WEIGHT, GOLD } from './shared/constants'

const KPIS_BY_PLATFORM = {
  instagram: KPIS_GERAL,
  youtube: KPIS_YT_GERAL,
  linkedin: KPIS_LI_GERAL,
  tiktok: KPIS_TT_GERAL,
}
```

E dentro do componente, **antes** do `useEffect`, adicionar:

```jsx
const kpisDef = KPIS_BY_PLATFORM[platform] || KPIS_GERAL
```

E substituir todas as ocorrências de `KPIS_GERAL.map` e `KPIS_GERAL.reduce` por `kpisDef.map` / `kpisDef.reduce` no arquivo.

Também trocar `tipo=all` no fetch pra usar tipo correto baseado em platform — mas como o backend trata, não precisa mexer no frontend. O `?tipo=all` já é o default e mapeia pra "all" no `_KPI_BUILDERS[platform]['all']`.

- [ ] **Step 3: Validar bundle final**

```bash
for f in frontend/src/App.jsx \
         frontend/src/components/Metricas/MetricasGeral.jsx; do
  frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx "$f" > /dev/null || exit 1
done && echo OK
```

- [ ] **Step 4: Commit + push**

```bash
git add frontend/src/App.jsx \
        frontend/src/components/Metricas/MetricasGeral.jsx \
        frontend/src/components/Metricas/MetricasYTVideos.jsx \
        frontend/src/components/Metricas/MetricasYTShorts.jsx \
        frontend/src/components/Metricas/MetricasLIPosts.jsx \
        frontend/src/components/Metricas/MetricasLIArtigos.jsx \
        frontend/src/components/Metricas/MetricasTTVideos.jsx
git commit -m "feat(metricas): rotas + wrappers pras tabs novas (YT/LI/TT)"
git push origin main
```

---

## Smoke test pós-deploy

1. Abrir `/metricas/<cliente_real>` → carrega Geral Instagram (default)
2. Clicar dropdown Plataforma → trocar pra YouTube → URL vira `?plataforma=youtube`, tabs viram "Geral / Vídeos / Shorts", banner "Mock" aparece
3. Trocar pra LinkedIn → tabs viram "Geral / Posts / Artigos"
4. Trocar pra TikTok → tabs viram "Geral / Vídeos"
5. Voltar pra Instagram → tabs voltam pra "Geral / Posts / Reels / Stories", banner Mock some
6. KPIs mudam coerentemente por plataforma (YouTube mostra "Inscritos" e "CTR", LinkedIn mostra "SSI Score", TikTok mostra "For You %")

## Riscos conhecidos

1. **`:clienteId/posts` é compartilhado entre Instagram (MetricasPosts) e LinkedIn (MetricasLIPosts).** O `RouteByPlatform` resolve isso via `?plataforma=`. Se URL não tem `?plataforma=`, default é Instagram. OK.

2. **`:clienteId/videos` é compartilhado entre YouTube e TikTok.** Idem `RouteByPlatform`.

3. **MetricasGeral não foi totalmente generalizado** — só troca KPIs. Crescimento de seguidores chart, mix de conteúdo donut e Demografia ainda são Instagram-specific. Pra Phase 2 vão ser adaptados. Pra hoje, esses elementos podem aparecer "vazios" pras outras plataformas — banner Mock já avisa que tá em desenvolvimento.

4. **MetricasLayout usa `useSearchParams` pra plataforma.** Se Pedro digitar `?plataforma=invalida` na URL, fallback é Instagram (validado no `PLATFORMS[platform] || PLATFORMS.instagram`).
