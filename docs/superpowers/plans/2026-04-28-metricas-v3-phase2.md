# Métricas V3 — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar Dashboard de Métricas em 4 sub-rotas (Geral / Posts / Reels / Stories), com backend filtrável por tipo de mídia. Extrair Ranking pra rota dedicada `/ranking`. Quebrar `Metricas.jsx` (1500 linhas) em pasta com componentes focados.

**Architecture:** Sub-rotas no React Router (`/metricas/:clienteId/:tab`), com `<MetricasLayout>` envolvendo `<Outlet>` que renderiza um dos 4 componentes de aba. Backend `/overview` aceita `?tipo=all|feed|reels|story` e retorna KPIs específicos. Cada tipo tem seu builder de KPI no Python (`_build_kpis_geral/feed/reels/stories`). Componentes inline (KpiCard, banners) extraídos pra `shared/`.

**Tech Stack:** React 18 + Vite + react-router-dom v6 (já em uso), Tailwind, Python FastAPI, Supabase Postgres, Lucide icons (já em uso).

**Spec:** [docs/superpowers/specs/2026-04-28-metricas-v3-phase2-design.md](../specs/2026-04-28-metricas-v3-phase2-design.md)

---

## File Structure

| Tipo | Arquivo | Responsabilidade |
|---|---|---|
| Backend | `backend/services/instagram.py` | `get_historico` aceita `tipo` e expõe campos novos (plays, watch_time, replies, taps_*, exits) |
| Backend | `backend/routes/metricas.py` | `/overview` aceita `?tipo=N`, builders por tipo, helper `_build_kpis_for_tipo` |
| Frontend (novo) | `frontend/src/components/Metricas/MetricasLayout.jsx` | Header + combo cliente + filtro período + tabs + `<Outlet>` |
| Frontend (novo) | `frontend/src/components/Metricas/MetricasGeral.jsx` | Aba Geral (visão consolidada) |
| Frontend (novo) | `frontend/src/components/Metricas/MetricasPosts.jsx` | Aba Posts (FEED) |
| Frontend (novo) | `frontend/src/components/Metricas/MetricasReels.jsx` | Aba Reels |
| Frontend (novo) | `frontend/src/components/Metricas/MetricasStories.jsx` | Aba Stories |
| Frontend (novo) | `frontend/src/components/Metricas/shared/KpiCard.jsx` | Card de KPI extraído |
| Frontend (novo) | `frontend/src/components/Metricas/shared/banners.jsx` | DadosZeradosBanner, AguardandoSyncBanner, IGProfileBadge, MockDataBanner extraídos |
| Frontend (novo) | `frontend/src/components/Metricas/shared/SyncButton.jsx` | Botão Sincronizar agora extraído |
| Frontend (novo) | `frontend/src/components/Metricas/shared/constants.js` | PLATFORMS, PLATFORM_KPIS, KPI_WEIGHT, _SPARKLINE_FIELDS |
| Frontend (novo) | `frontend/src/components/Metricas/index.jsx` | Re-exporta MetricasLayout pra compat com import existente |
| Frontend (novo) | `frontend/src/components/Ranking.jsx` | Tabela de ranking movida (rota `/ranking`) |
| Frontend (modificar) | `frontend/src/App.jsx` | Adicionar sub-rotas e `/ranking` |
| Frontend (modificar) | `frontend/src/components/layout/Sidebar.jsx` | Adicionar link "Ranking" |
| Frontend (deletar) | `frontend/src/components/Metricas.jsx` | Tudo migra pra pasta `Metricas/` |

`MetricasParts.jsx` é mantido por enquanto (DateRangePicker, skeletons, PostsTable, DemographicsSection, MockDataBanner, ViewToggle) — Phase 3 absorve quando reformar Posts/Demografia. As funções extraídas pra `Metricas/shared/` saem do `Metricas.jsx`, não do `MetricasParts.jsx`.

Validação: `python3 -m py_compile`, `esbuild --loader:.jsx=jsx`, deploy via CI, F5 do Pedro entre commits.

---

## Task 1: Backend — `get_historico` aceita `tipo` e expõe campos extras

**Files:**
- Modify: `backend/services/instagram.py:261-320` (LiveInstagramRepository.get_historico)

- [ ] **Step 1: Adicionar parâmetro `tipo` na assinatura + filtro na query principal**

Em `backend/services/instagram.py`, dentro da classe `LiveInstagramRepository`, substituir a assinatura atual:

```python
    def get_historico(self, cliente_id: str, dias: int = 30) -> list:
        cutoff = (date.today() - timedelta(days=dias - 1)).isoformat()
```

por:

```python
    def get_historico(self, cliente_id: str, dias: int = 30, tipo: str = "all") -> list:
        """
        tipo: 'all' | 'feed' | 'reels' | 'story' — filtra os agregados por tipo
              de mídia. Default 'all' mantém comportamento legado.
        """
        cutoff = (date.today() - timedelta(days=dias - 1)).isoformat()
        # Mapeia o tipo da rota pro valor do DB (media_product_type)
        tipo_db = {"all": "ALL", "feed": "FEED", "reels": "REELS", "story": "STORY"}.get(
            tipo.lower(), "ALL"
        )
```

- [ ] **Step 2: Substituir o filtro hardcoded `"ALL"` por `tipo_db`**

No mesmo método, achar a query:

```python
        diarias = self.sb.table("instagram_metricas_diarias").select("*").eq(
            "cliente_id", cliente_id
        ).eq("media_product_type", "ALL").gte("data", cutoff).order("data").execute().data or []
```

Substituir por:

```python
        diarias = self.sb.table("instagram_metricas_diarias").select("*").eq(
            "cliente_id", cliente_id
        ).eq("media_product_type", tipo_db).gte("data", cutoff).order("data").execute().data or []
```

- [ ] **Step 3: Expor campos extras (plays, watch_time, replies, taps_*, exits, follows) no result**

Achar o bloco `result.append({...})` (~linha 295). Substituir por:

```python
            result.append({
                "data": d,
                "seguidores": seguidores,
                "delta_seguidores": f.get("delta_followers") or 0,
                "alcance_total": agg.get("total_reach") or 0,
                "impressoes_total": agg.get("total_impressions") or 0,
                "taxa_engajamento": float(agg.get("avg_engagement_rate") or 0),
                "curtidas_total": agg.get("total_likes") or 0,
                "comentarios_total": agg.get("total_comments") or 0,
                "salvamentos_total": agg.get("total_saves") or 0,
                "compartilhamentos_total": agg.get("total_shares") or 0,
                "visitas_perfil": agg.get("total_profile_visits") or 0,
                "cliques_link_bio": 0,
                "posts_publicados": feed_map.get(d, 0),
                "reels_publicados": reels_map.get(d, 0),
                "stories_publicados": stories_map.get(d, 0),
                # Campos extras pra builders por tipo:
                "plays_total": agg.get("total_plays") or 0,
                "watch_time_ms_total": agg.get("total_watch_time_ms") or 0,
                "watch_time_segundos_medio": float(agg.get("avg_watch_time_seconds") or 0),
                "retention_rate": float(agg.get("avg_retention_rate") or 0),
                "follows_total": agg.get("total_follows") or 0,
                "replies_total": agg.get("total_replies") or 0,
                "taps_forward_total": agg.get("total_taps_forward") or 0,
                "taps_back_total": agg.get("total_taps_back") or 0,
                "exits_total": agg.get("total_exits") or 0,
                "fonte": "live",
            })
```

- [ ] **Step 4: Validar sintaxe Python**

Run: `python3 -m py_compile backend/services/instagram.py`
Expected: sem output (sucesso)

- [ ] **Step 5: Commit**

```bash
git add backend/services/instagram.py
git commit -m "feat(metricas): get_historico aceita tipo (all|feed|reels|story) + expõe campos extras (plays, watch_time, replies, taps, exits)"
```

---

## Task 2: Backend — 4 builders de KPI + endpoint `/overview` aceita `?tipo`

**Files:**
- Modify: `backend/routes/metricas.py:55-67` (builders), `109-114` (mapping), `191-260` (endpoint)

- [ ] **Step 1: Renomear `_build_kpis_instagram` pra `_build_kpis_geral` e adicionar 3 builders novos**

Em `backend/routes/metricas.py`, substituir a função atual `_build_kpis_instagram` (~linha 55-67) por:

```python
# ─── Builders por tipo de mídia ──────────────────────────────────────────────

# Geral: visão consolidada (todos os tipos somados)
def _build_kpis_geral(atual, anterior):
    return {
        "seguidores": {"valor": _last(atual, "seguidores"), "delta_pct": _delta_pct(_last(atual, "seguidores"), _last(anterior, "seguidores"))},
        "novos_seguidores_periodo": {"valor": _net_growth(atual, "seguidores"), "delta_pct": _delta_pct(_net_growth(atual, "seguidores"), _net_growth(anterior, "seguidores"))},
        "taxa_engajamento": {"valor": _avg_active(atual, "taxa_engajamento"), "delta_pct": _delta_pct(_avg_active(atual, "taxa_engajamento"), _avg_active(anterior, "taxa_engajamento"))},
        "alcance_medio": {"valor": int(_avg_active(atual, "alcance_total")), "delta_pct": _delta_pct(_avg_active(atual, "alcance_total"), _avg_active(anterior, "alcance_total"))},
        "visualizacoes_perfil": {"valor": _sum(atual, "visitas_perfil"), "delta_pct": _delta_pct(_sum(atual, "visitas_perfil"), _sum(anterior, "visitas_perfil"))},
        "curtidas_total": {"valor": _sum(atual, "curtidas_total"), "delta_pct": _delta_pct(_sum(atual, "curtidas_total"), _sum(anterior, "curtidas_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
        "salvamentos_total": {"valor": _sum(atual, "salvamentos_total"), "delta_pct": _delta_pct(_sum(atual, "salvamentos_total"), _sum(anterior, "salvamentos_total"))},
        "compartilhamentos_total": {"valor": _sum(atual, "compartilhamentos_total"), "delta_pct": _delta_pct(_sum(atual, "compartilhamentos_total"), _sum(anterior, "compartilhamentos_total"))},
        "posts_publicados": {"valor": _sum(atual, "posts_publicados")},
        "reels_publicados": {"valor": _sum(atual, "reels_publicados")},
        "stories_publicados": {"valor": _sum(atual, "stories_publicados")},
    }


# Feed: posts no formato tradicional
def _build_kpis_feed(atual, anterior):
    return {
        "posts_publicados": {"valor": _sum(atual, "posts_publicados")},
        "taxa_engajamento": {"valor": _avg_active(atual, "taxa_engajamento"), "delta_pct": _delta_pct(_avg_active(atual, "taxa_engajamento"), _avg_active(anterior, "taxa_engajamento"))},
        "alcance_medio": {"valor": int(_avg_active(atual, "alcance_total")), "delta_pct": _delta_pct(_avg_active(atual, "alcance_total"), _avg_active(anterior, "alcance_total"))},
        "curtidas_total": {"valor": _sum(atual, "curtidas_total"), "delta_pct": _delta_pct(_sum(atual, "curtidas_total"), _sum(anterior, "curtidas_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
        "salvamentos_total": {"valor": _sum(atual, "salvamentos_total"), "delta_pct": _delta_pct(_sum(atual, "salvamentos_total"), _sum(anterior, "salvamentos_total"))},
        "compartilhamentos_total": {"valor": _sum(atual, "compartilhamentos_total"), "delta_pct": _delta_pct(_sum(atual, "compartilhamentos_total"), _sum(anterior, "compartilhamentos_total"))},
    }


# Reels: ênfase em plays e watch time (métricas chave de vídeo curto)
def _build_kpis_reels(atual, anterior):
    return {
        "reels_publicados": {"valor": _sum(atual, "reels_publicados")},
        "plays_total": {"valor": _sum(atual, "plays_total"), "delta_pct": _delta_pct(_sum(atual, "plays_total"), _sum(anterior, "plays_total"))},
        "alcance_medio": {"valor": int(_avg_active(atual, "alcance_total")), "delta_pct": _delta_pct(_avg_active(atual, "alcance_total"), _avg_active(anterior, "alcance_total"))},
        "watch_time_segundos_medio": {"valor": _avg_active(atual, "watch_time_segundos_medio"), "delta_pct": _delta_pct(_avg_active(atual, "watch_time_segundos_medio"), _avg_active(anterior, "watch_time_segundos_medio"))},
        "taxa_engajamento": {"valor": _avg_active(atual, "taxa_engajamento"), "delta_pct": _delta_pct(_avg_active(atual, "taxa_engajamento"), _avg_active(anterior, "taxa_engajamento"))},
        "curtidas_total": {"valor": _sum(atual, "curtidas_total"), "delta_pct": _delta_pct(_sum(atual, "curtidas_total"), _sum(anterior, "curtidas_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
        "compartilhamentos_total": {"valor": _sum(atual, "compartilhamentos_total"), "delta_pct": _delta_pct(_sum(atual, "compartilhamentos_total"), _sum(anterior, "compartilhamentos_total"))},
        "salvamentos_total": {"valor": _sum(atual, "salvamentos_total"), "delta_pct": _delta_pct(_sum(atual, "salvamentos_total"), _sum(anterior, "salvamentos_total"))},
    }


# Stories: ênfase em interações de tap (Forward, Back, Exits, Replies)
def _build_kpis_stories(atual, anterior):
    return {
        "stories_publicados": {"valor": _sum(atual, "stories_publicados")},
        "alcance_medio": {"valor": int(_avg_active(atual, "alcance_total")), "delta_pct": _delta_pct(_avg_active(atual, "alcance_total"), _avg_active(anterior, "alcance_total"))},
        "replies_total": {"valor": _sum(atual, "replies_total"), "delta_pct": _delta_pct(_sum(atual, "replies_total"), _sum(anterior, "replies_total"))},
        "taps_forward_total": {"valor": _sum(atual, "taps_forward_total"), "delta_pct": _delta_pct(_sum(atual, "taps_forward_total"), _sum(anterior, "taps_forward_total"))},
        "taps_back_total": {"valor": _sum(atual, "taps_back_total"), "delta_pct": _delta_pct(_sum(atual, "taps_back_total"), _sum(anterior, "taps_back_total"))},
        "exits_total": {"valor": _sum(atual, "exits_total"), "delta_pct": _delta_pct(_sum(atual, "exits_total"), _sum(anterior, "exits_total"))},
        "compartilhamentos_total": {"valor": _sum(atual, "compartilhamentos_total"), "delta_pct": _delta_pct(_sum(atual, "compartilhamentos_total"), _sum(anterior, "compartilhamentos_total"))},
    }
```

- [ ] **Step 2: Atualizar `_KPI_BUILDERS` mapping**

Achar o dict `_KPI_BUILDERS` (~linha 109). Substituir por:

```python
# Mapping de builders por (plataforma, tipo). Tipo só aplica pra Instagram —
# outras plataformas usam 'all' fixo.
_KPI_BUILDERS = {
    "instagram": {
        "all": _build_kpis_geral,
        "feed": _build_kpis_feed,
        "reels": _build_kpis_reels,
        "story": _build_kpis_stories,
    },
    "linkedin": _build_kpis_linkedin,
    "youtube": _build_kpis_youtube,
    "tiktok": _build_kpis_tiktok,
}


def _resolve_builder(plataforma: str, tipo: str):
    """Retorna o builder correto. Plataformas não-IG ignoram tipo."""
    cfg = _KPI_BUILDERS.get(plataforma, _build_kpis_geral)
    if isinstance(cfg, dict):
        return cfg.get(tipo.lower(), cfg["all"])
    return cfg
```

- [ ] **Step 3: Atualizar endpoint `/overview` pra aceitar `?tipo` e usar `_resolve_builder`**

Achar a função `get_overview` (~linha 191). Substituir a assinatura + corpo principal por:

```python
@router.get("/{cliente_id}/overview")
async def get_overview(
    cliente_id: str,
    plataforma: str = "instagram",
    dias: int = 30,
    tipo: str = "all",
    user=Depends(get_current_user),
):
    if dias < 1 or dias > 365:
        raise HTTPException(400, "dias deve estar entre 1 e 365")
    if tipo.lower() not in ("all", "feed", "reels", "story"):
        raise HTTPException(400, "tipo deve ser all, feed, reels ou story")
    repo = _get_repo(plataforma, cliente_id)
    # Pega 2x o período pra ter janela "atual" + "anterior" pro delta_pct.
    # Tipo só é repassado pro Live IG — Mocks ignoram (parâmetro extra).
    if plataforma == "instagram":
        historico = repo.get_historico(cliente_id, dias * 2, tipo=tipo)
    else:
        historico = repo.get_historico(cliente_id, dias * 2)
    connected = repo.is_connected(cliente_id)
```

E mais adiante (logo depois do split atual/anterior, ~linha 234), substituir:

```python
    builder = _KPI_BUILDERS.get(plataforma, _build_kpis_instagram)
    kpis = builder(atual, anterior)
```

por:

```python
    builder = _resolve_builder(plataforma, tipo)
    kpis = builder(atual, anterior)
```

E no payload de retorno (ambos: `if not historico` e o final), adicionar `"tipo": tipo` ao lado de `"dias_periodo"`.

- [ ] **Step 4: Verificar que o Mock IG não quebra**

`MockInstagramRepository` em `social.py` tem `get_historico(cliente_id, dias)` — sem `tipo`. Como passamos `tipo` só no caminho Live (`if plataforma == "instagram"` chama `get_historico(cliente_id, dias*2, tipo=tipo)`), o Mock continua sem receber. Mas no Mock IG do `instagram.py` também tem assinatura sem `tipo`. Vou tornar tolerante adicionando `**kwargs` no Mock:

Em `backend/services/instagram.py`, achar a classe `MockInstagramRepository` (~linha 53). Achar `def get_historico` dela. Substituir a assinatura por:

```python
    def get_historico(self, cliente_id: str, dias: int = 30, **kwargs) -> list:
```

(O `**kwargs` engole o `tipo` sem usar. Mock continua devolvendo o mesmo histórico fake independente do tipo — Phase 3+ pode separar se precisar.)

Mesmo tratamento em `backend/services/social.py` na classe `MockInstagramRepository`.

- [ ] **Step 5: Validar sintaxe Python**

Run: `python3 -m py_compile backend/routes/metricas.py backend/services/instagram.py backend/services/social.py`
Expected: sem output

- [ ] **Step 6: Commit**

```bash
git add backend/routes/metricas.py backend/services/instagram.py backend/services/social.py
git commit -m "feat(metricas): /overview aceita ?tipo (all/feed/reels/story) + 4 builders de KPI por tipo"
```

---

## Task 3: Frontend — Criar pasta `Metricas/` + extrair `shared/`

**Files:**
- Create: `frontend/src/components/Metricas/shared/constants.js`
- Create: `frontend/src/components/Metricas/shared/KpiCard.jsx`
- Create: `frontend/src/components/Metricas/shared/banners.jsx`
- Create: `frontend/src/components/Metricas/shared/SyncButton.jsx`

Esta task **NÃO toca em `Metricas.jsx` nem `App.jsx` ainda** — só cria os arquivos novos e o código deles. Tudo continua funcionando porque ninguém importa esses novos arquivos ainda. Tasks 4-7 fazem a migração.

- [ ] **Step 1: Criar `Metricas/shared/constants.js`**

Cria o arquivo com:

```javascript
// Constantes compartilhadas pelo Dashboard de Métricas.
// Extraídas do Metricas.jsx original (~linhas 50-130).

import { Users, UserPlus, TrendingUp, Eye, Heart, Bookmark, MessageCircle, BarChart2, Play, Share2, Target, Clock, Film, Camera } from 'lucide-react'

export const GOLD = '#C9A84C'

export const PLATFORMS = {
  instagram: { label: 'Instagram', color: '#E4405F' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2' },
  youtube: { label: 'YouTube', color: '#FF0000' },
  tiktok: { label: 'TikTok', color: '#000000' },
}

// KPIs por aba (Geral / Posts / Reels / Stories).
// Cada entrada vira um <KpiCard> renderizado no respectivo componente de aba.
export const KPIS_GERAL = [
  { key: 'seguidores', label: 'Seguidores', icon: Users, histKey: 'seguidores' },
  { key: 'novos_seguidores_periodo', label: 'Novos no período', icon: UserPlus, prefix: '+' },
  { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%', histKey: 'taxa_engajamento' },
  { key: 'alcance_medio', label: 'Alcance médio', icon: Eye, histKey: 'alcance_total' },
  { key: 'visualizacoes_perfil', label: 'Visualizações do perfil', icon: Eye, histKey: 'visitas_perfil' },
  { key: 'curtidas_total', label: 'Curtidas', icon: Heart, histKey: 'curtidas_total' },
  { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle, histKey: 'comentarios_total' },
  { key: 'salvamentos_total', label: 'Salvamentos', icon: Bookmark, histKey: 'salvamentos_total' },
  { key: 'compartilhamentos_total', label: 'Compartilhamentos', icon: Share2, histKey: 'compartilhamentos_total' },
  { key: 'posts_publicados', label: 'Posts (Feed)', icon: BarChart2, noDelta: true, histKey: 'posts_publicados' },
  { key: 'reels_publicados', label: 'Reels', icon: Film, noDelta: true, histKey: 'reels_publicados' },
  { key: 'stories_publicados', label: 'Stories', icon: Camera, noDelta: true, histKey: 'stories_publicados' },
]

export const KPIS_FEED = [
  { key: 'posts_publicados', label: 'Posts publicados', icon: BarChart2, noDelta: true },
  { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%' },
  { key: 'alcance_medio', label: 'Alcance médio', icon: Eye },
  { key: 'curtidas_total', label: 'Curtidas', icon: Heart },
  { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle },
  { key: 'salvamentos_total', label: 'Salvamentos', icon: Bookmark },
  { key: 'compartilhamentos_total', label: 'Compartilhamentos', icon: Share2 },
]

export const KPIS_REELS = [
  { key: 'reels_publicados', label: 'Reels publicados', icon: Film, noDelta: true },
  { key: 'plays_total', label: 'Plays totais', icon: Play },
  { key: 'alcance_medio', label: 'Alcance médio', icon: Eye },
  { key: 'watch_time_segundos_medio', label: 'Watch time médio', icon: Clock, decimals: 1, suffix: 's' },
  { key: 'taxa_engajamento', label: 'Engajamento', icon: TrendingUp, decimals: 2, suffix: '%' },
  { key: 'curtidas_total', label: 'Curtidas', icon: Heart },
  { key: 'comentarios_total', label: 'Comentários', icon: MessageCircle },
  { key: 'compartilhamentos_total', label: 'Compartilhamentos', icon: Share2 },
  { key: 'salvamentos_total', label: 'Salvamentos', icon: Bookmark },
]

export const KPIS_STORIES = [
  { key: 'stories_publicados', label: 'Stories publicados', icon: Camera, noDelta: true },
  { key: 'alcance_medio', label: 'Alcance médio', icon: Eye },
  { key: 'replies_total', label: 'Replies', icon: MessageCircle },
  { key: 'taps_forward_total', label: 'Taps forward', icon: Play },
  { key: 'taps_back_total', label: 'Taps back', icon: Target },
  { key: 'exits_total', label: 'Saídas', icon: Eye },
  { key: 'compartilhamentos_total', label: 'Compartilhamentos', icon: Share2 },
]

// Sparklines por aba (no card aparece um mini-gráfico)
export const SPARKLINE_FIELDS = {
  geral: [
    { label: 'seguidores', field: 'seguidores' },
    { label: 'engajamento', field: 'taxa_engajamento' },
    { label: 'alcance', field: 'alcance_total' },
  ],
}

// Peso por KPI na disputa de "winner" (coroa). Valores não-presentes = 1.
export const KPI_WEIGHT = {
  taxa_engajamento: 2.0,
  alcance_medio: 2.0,
  visualizacoes_perfil: 1.5,
  seguidores: 1.2,
  salvamentos_total: 1.2,
  compartilhamentos_total: 1.2,
  comentarios_total: 1.0,
  curtidas_total: 0.8,
}
```

- [ ] **Step 2: Criar `Metricas/shared/KpiCard.jsx`**

Cria o arquivo extraindo a função `KpiCard` do `Metricas.jsx` atual (~linha 264-313). E também as funções helpers `AnimatedNumber` e `Sparkline` que ela usa (procurar no Metricas.jsx atual). Conteúdo:

```jsx
import { motion } from 'framer-motion'
import { Crown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { GOLD } from './constants'

// Animação de número subindo até o valor final
function AnimatedNumber({ value, decimals = 0, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(value)
  const start = useRef(value)
  const frame = useRef(null)

  useEffect(() => {
    const startVal = start.current
    const startTime = performance.now()
    const dur = 600

    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(startVal + (value - startVal) * eased)
      if (t < 1) {
        frame.current = requestAnimationFrame(tick)
      } else {
        start.current = value
      }
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [value])

  const formatted = (decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString('pt-BR'))
  return <>{prefix}{formatted}{suffix}</>
}

// Mini-gráfico inline (sparkline)
function Sparkline({ data, color = GOLD, width = 70, height = 24 }) {
  if (!data?.length || data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((v - min) / range) * height
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  )
}

export default function KpiCard({ icon: Icon, label, value, decimals = 0, suffix = '', delta, prefix = '', color = GOLD, history, highlight = false }) {
  const positive = delta >= 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden group ${highlight ? 'kpi-pulse' : ''}`}
      style={{
        background: 'var(--flg-bg-raised)',
        border: highlight ? `1px solid ${color}55` : '1px solid var(--flg-border)',
        boxShadow: highlight ? `0 0 0 1px ${color}10` : undefined,
      }}
    >
      {highlight && (
        <div
          className="absolute top-2 right-2 flex items-center justify-center rounded-full crown-pulse"
          style={{
            width: 22,
            height: 22,
            background: `linear-gradient(135deg, #F5D68A, #C9A84C 50%, #8B6914)`,
            boxShadow: '0 0 10px rgba(245,214,138,0.45)',
          }}
          title="KPI com maior alta vs. mês anterior"
        >
          <Crown size={11} strokeWidth={2.2} color="#1a1300" />
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40 font-medium">{label}</span>
        <Icon size={14} style={{ color }} className="opacity-60" />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="text-2xl font-bold text-white leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
          <AnimatedNumber value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
        </div>
        {history && history.length > 1 && (
          <div className="opacity-70 group-hover:opacity-100 transition-opacity">
            <Sparkline data={history} color={color} width={70} height={24} />
          </div>
        )}
      </div>
      {delta !== undefined && delta !== null && (
        <div className={`text-[11px] font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
          {positive ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs. mês anterior
        </div>
      )}
      {delta === null && (
        <div className="text-[11px] font-medium text-white/30">
          sem comparativo do período anterior
        </div>
      )}
    </motion.div>
  )
}
```

- [ ] **Step 3: Criar `Metricas/shared/banners.jsx`**

Extrai `IGProfileBadge`, `AguardandoSyncBanner`, `DadosZeradosBanner` do `Metricas.jsx` atual (procurar essas funções inline). Conteúdo:

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, AlertCircle, RefreshCw, Wifi, ExternalLink } from 'lucide-react'
import { api } from '../../../lib/api'
import { GOLD } from './constants'
import { MockDataBanner } from '../../MetricasParts'

// Re-export pra outros componentes
export { MockDataBanner }

// Badge: avatar + @username do IG conectado, clicável → instagram.com
export function IGProfileBadge({ clienteId }) {
  const [info, setInfo] = useState(null)

  useEffect(() => {
    if (!clienteId) { setInfo(null); return }
    let cancelled = false
    api(`/instagram/oauth/status/${clienteId}`)
      .then(d => {
        if (cancelled || !d?.conectado) return
        setInfo({
          username: d.username,
          profile_picture_url: d.profile_picture_url,
          instagram_url: d.instagram_url || (d.username ? `https://instagram.com/${d.username}` : null),
        })
      })
      .catch(() => setInfo(null))
    return () => { cancelled = true }
  }, [clienteId])

  if (!info?.username) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-full"
        style={{ background: 'rgba(52,211,153,0.12)', color: '#34D399', border: '1px solid rgba(52,211,153,0.25)' }}>
        <Wifi size={11} />
        Instagram conectado
      </div>
    )
  }

  return (
    <a
      href={info.instagram_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-[11px] font-semibold px-2 py-1 rounded-full transition-all hover:scale-[1.02]"
      style={{
        background: 'rgba(52,211,153,0.10)',
        border: '1px solid rgba(52,211,153,0.30)',
        color: '#34D399',
      }}
      title={`Abrir @${info.username} no Instagram`}
    >
      {info.profile_picture_url ? (
        <img
          src={info.profile_picture_url}
          alt={`@${info.username}`}
          className="rounded-full object-cover"
          style={{ width: 20, height: 20, border: '1px solid rgba(52,211,153,0.4)' }}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      ) : (
        <Wifi size={11} />
      )}
      <span>@{info.username}</span>
      <ExternalLink size={10} className="opacity-60" />
    </a>
  )
}

// Banner: conectado mas aguardando primeira sincronização
export function AguardandoSyncBanner({ clienteId, accent = GOLD, onSynced }) {
  const [syncing, setSyncing] = useState(false)
  const [feedback, setFeedback] = useState(null)

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    setFeedback(null)
    try {
      const r = await api(`/instagram/oauth/sync/${clienteId}`, { method: 'POST' })
      const status = r?.status || (r?.errors?.length ? 'partial' : 'ok')
      if (status === 'ok' || status === 'partial') {
        if (onSynced) onSynced(r)
      }
      if (r?.errors?.length) {
        setFeedback({ kind: status === 'failed' ? 'failed' : 'partial', errors: r.errors })
      }
    } catch (err) {
      setFeedback({ kind: 'failed', errors: [{ step: 'request', message: err?.message || 'Erro desconhecido' }] })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: 'linear-gradient(135deg, rgba(56,189,248,0.08), rgba(34,211,238,0.04))',
        border: '1px solid rgba(56,189,248,0.30)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="rounded-lg flex items-center justify-center shrink-0"
          style={{ width: 36, height: 36, background: 'rgba(56,189,248,0.18)', border: '1px solid rgba(56,189,248,0.4)' }}
        >
          <RefreshCw size={18} style={{ color: '#7DD3FC' }} className={syncing ? 'animate-spin' : ''} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-white/90">Instagram conectado · aguardando primeira sincronização</div>
          <div className="text-[11px] text-white/55 mt-0.5">
            A conta foi vinculada, mas ainda não puxamos os dados. O sync automático roda toda madrugada (04h UTC). Clique abaixo pra rodar agora.
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
          style={{
            background: syncing ? 'var(--flg-bg-hover)' : accent,
            color: syncing ? 'var(--flg-text-muted)' : '#0B0B0B',
            border: `1px solid ${accent}`,
            cursor: syncing ? 'wait' : 'pointer',
          }}
        >
          {syncing ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
      </div>

      {feedback?.errors?.length > 0 && (
        <div
          className="rounded-lg p-2.5 text-[11px]"
          style={{
            background: 'rgba(248,113,113,0.08)',
            border: '1px solid rgba(248,113,113,0.30)',
          }}
        >
          <div className="font-semibold text-[#F87171] mb-1">
            {feedback.kind === 'failed' ? '❌ Sync falhou' : '⚠️ Sync com falhas parciais'}
          </div>
          <ul className="space-y-0.5 text-white/75">
            {feedback.errors.map((e, i) => (
              <li key={i}>
                <span className="font-semibold text-white/90">{e.step}:</span> {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Banner: dados zerados / sync falhou — explica e oferece retry
export function DadosZeradosBanner({ diagnostico, clienteId, accent = GOLD, onSynced }) {
  const [syncing, setSyncing] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const lastErr = diagnostico?.last_error
  const postsNoPeriodo = diagnostico?.posts_no_periodo || 0
  const errorsList = lastErr?.errors || []
  const lastSyncAt = diagnostico?.last_sync_at

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    setFeedback(null)
    try {
      const r = await api(`/instagram/oauth/sync/${clienteId}`, { method: 'POST' })
      const status = r?.status || (r?.errors?.length ? 'partial' : 'ok')
      setFeedback({ kind: status, errors: r.errors || [], diagnostics: r.diagnostics })
      if (onSynced) onSynced(r)
    } catch (err) {
      setFeedback({ kind: 'failed', errors: [{ step: 'request', message: err?.message || 'Erro' }] })
    } finally {
      setSyncing(false)
    }
  }

  const hasError = errorsList.length > 0
  const tone = hasError
    ? { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.30)', icon: '⚠️', label: 'Sync com problema' }
    : { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.30)', icon: '📭', label: 'Sem dados no período' }

  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: tone.bg, border: `1px solid ${tone.border}` }}>
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0">{tone.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-white/95">{tone.label}</div>
          <div className="text-[11px] text-white/65 mt-0.5">
            {hasError ? (
              <>O último sync rodou{lastSyncAt && ` em ${new Date(lastSyncAt).toLocaleString('pt-BR')}`} mas teve falhas. Veja abaixo o que precisa ser corrigido.</>
            ) : (
              <>Sync rodou{lastSyncAt && ` em ${new Date(lastSyncAt).toLocaleString('pt-BR')}`} mas não trouxe posts/insights nos últimos {diagnostico?.dias_periodo || 30} dias. Pode ser conta sem posts recentes nesse período, conta não-Business (sem acesso a Insights), ou permissão faltando no OAuth.</>
            )}
          </div>

          {hasError && (
            <ul className="mt-2 space-y-1 text-[11px] text-white/80">
              {errorsList.map((e, i) => (
                <li key={i}>
                  <span className="font-semibold text-white/95">{e.step}:</span> {e.message}
                </li>
              ))}
            </ul>
          )}

          {!hasError && postsNoPeriodo === 0 && (
            <div className="mt-2 text-[11px] text-white/55">
              Posts encontrados nos últimos {diagnostico?.dias_periodo || 30} dias: <span className="font-semibold text-white/80">{postsNoPeriodo}</span>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-all"
              style={{
                background: syncing ? 'var(--flg-bg-hover)' : accent,
                color: syncing ? 'var(--flg-text-muted)' : '#0B0B0B',
                border: `1px solid ${accent}`,
                cursor: syncing ? 'wait' : 'pointer',
              }}
            >
              <RefreshCw size={11} className={`inline mr-1 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando…' : 'Tentar novamente'}
            </button>
          </div>

          {feedback && (
            <div className="mt-2 text-[11px] text-white/75">
              {feedback.kind === 'ok' && <span className="text-[#34D399]">✅ Sync ok — recarregando…</span>}
              {feedback.kind === 'partial' && <span className="text-[#FACC15]">⚠️ Parcial — {feedback.errors?.length} etapa(s) com erro</span>}
              {feedback.kind === 'failed' && <span className="text-[#F87171]">❌ Falhou — {feedback.errors?.[0]?.message || 'erro desconhecido'}</span>}
              {feedback.diagnostics && (
                <div className="mt-1 text-[10.5px] text-white/50">
                  Posts encontrados: {feedback.diagnostics.media_fetched ?? 0} ·
                  Insights ok (full/safe): {feedback.diagnostics.insights_full ?? 0}/{feedback.diagnostics.insights_safe ?? 0} ·
                  falharam: {feedback.diagnostics.insights_failed ?? 0}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Criar `Metricas/shared/SyncButton.jsx`**

Extrai `SyncButton` e `formatRelative` do `Metricas.jsx` atual:

```jsx
import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '../../../lib/api'
import { GOLD } from './constants'

function formatRelative(iso) {
  const dt = new Date(iso)
  const diff = Date.now() - dt.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `há ${d}d`
  return dt.toLocaleDateString('pt-BR')
}

export default function SyncButton({ clienteId, onSynced, accent = GOLD }) {
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    if (!clienteId) return
    api(`/instagram/oauth/status/${clienteId}`)
      .then(d => setLastSync(d?.last_sync_at || null))
      .catch(() => {})
  }, [clienteId])

  useEffect(() => {
    if (!feedback) return
    const ms = feedback.kind === 'ok' ? 4000 : 12000
    const t = setTimeout(() => setFeedback(null), ms)
    return () => clearTimeout(t)
  }, [feedback])

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    setFeedback(null)
    try {
      const r = await api(`/instagram/oauth/sync/${clienteId}`, { method: 'POST' })
      setLastSync(new Date().toISOString())
      const status = r?.status || (r?.errors?.length ? 'partial' : 'ok')
      const summary = `posts=${r?.posts ?? 0} · métricas=${r?.metricas_diarias ?? 0} · horários=${r?.horarios ?? 0}`
      if (status === 'ok') {
        setFeedback({ kind: 'ok', message: `Sincronizado · ${summary}` })
      } else if (status === 'partial') {
        setFeedback({ kind: 'partial', message: `Sync parcial · ${summary}`, errors: r.errors })
      } else {
        setFeedback({ kind: 'failed', message: 'Sync falhou em todas as etapas', errors: r.errors })
      }
      if (onSynced) onSynced(r)
    } catch (err) {
      setFeedback({ kind: 'failed', message: err?.message || 'Erro ao sincronizar', errors: [] })
    } finally {
      setSyncing(false)
    }
  }

  const feedbackColor = feedback?.kind === 'ok' ? '#34D399' : feedback?.kind === 'partial' ? '#FACC15' : '#F87171'

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-full transition-all"
        style={{
          background: 'var(--flg-bg-hover)',
          color: syncing ? 'var(--flg-text-muted)' : accent,
          border: `1px solid ${accent}30`,
          cursor: syncing ? 'wait' : 'pointer',
        }}
        title={lastSync ? `Última sync: ${formatRelative(lastSync)}` : 'Nunca sincronizado'}
      >
        <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
        {syncing ? 'Sincronizando…' : (lastSync ? `Sync ${formatRelative(lastSync)}` : 'Atualizar agora')}
      </button>

      {feedback && (
        <div
          className="absolute top-full mt-2 left-0 z-20 rounded-lg px-3 py-2 text-[11px] max-w-md shadow-lg"
          style={{
            background: 'var(--flg-bg-raised)',
            border: `1px solid ${feedbackColor}50`,
            color: 'var(--flg-text)',
          }}
        >
          <div className="font-semibold flex items-center gap-2" style={{ color: feedbackColor }}>
            <span>{feedback.kind === 'ok' ? '✅' : feedback.kind === 'partial' ? '⚠️' : '❌'}</span>
            {feedback.message}
          </div>
          {feedback.errors?.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[10.5px] text-white/70">
              {feedback.errors.map((e, i) => (
                <li key={i}>
                  <span className="font-semibold text-white/90">{e.step}:</span> {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Validar parsing dos arquivos novos**

Run:
```bash
for f in frontend/src/components/Metricas/shared/*.{js,jsx}; do
  frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx "$f" > /dev/null && echo "OK $f" || echo "FAIL $f"
done
```
Expected: todas as linhas com `OK`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Metricas/shared/
git commit -m "refactor(metricas): extrair shared/ (KpiCard, banners, SyncButton, constants) — preparação Phase 2"
```

---

## Task 4: Frontend — `MetricasLayout.jsx` (header + tabs + Outlet)

**Files:**
- Create: `frontend/src/components/Metricas/MetricasLayout.jsx`

- [ ] **Step 1: Criar o layout**

```jsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Outlet, NavLink } from 'react-router-dom'
import { useApp } from '../../store/AppContext'
import { checkAdmin } from '../../lib/permissions'
import { ClienteCombobox } from '../MetricasParts'
import { DateRangePicker } from '../MetricasParts'
import { IGProfileBadge } from './shared/banners'
import SyncButton from './shared/SyncButton'
import { PLATFORMS } from './shared/constants'

const TABS = [
  { key: 'geral', label: 'Geral' },
  { key: 'posts', label: 'Posts' },
  { key: 'reels', label: 'Reels' },
  { key: 'stories', label: 'Stories' },
]

export default function MetricasLayout({ session }) {
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = session?.user
  const admin = checkAdmin(user)
  const { clientes: allClientes } = useApp()
  const clientes = admin
    ? allClientes
    : allClientes.filter(c => c.consultor_responsavel?.toLowerCase().includes(user?.email?.split('@')[0] || ''))

  const platform = 'instagram'
  const platConfig = PLATFORMS[platform]
  const periodo = parseInt(searchParams.get('dias') || '30', 10)
  const tab = params.tab || 'geral'
  const clienteId = params.clienteId

  // Redirect: sem cliente na URL → escolhe o primeiro
  useEffect(() => {
    if (!clienteId && clientes.length > 0) {
      navigate(`/metricas/${clientes[0].id}/geral`, { replace: true })
    }
  }, [clienteId, clientes, navigate])

  function setCliente(id) {
    navigate(`/metricas/${id}/${tab}?${searchParams.toString()}`)
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
      {/* Header: combo + badge IG + sync + filtro período */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3 flex-wrap">
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

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10">
        {TABS.map(t => (
          <NavLink
            key={t.key}
            to={`/metricas/${clienteId}/${t.key}?${searchParams.toString()}`}
            className={({ isActive }) =>
              `px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                isActive
                  ? 'border-current text-white'
                  : 'border-transparent text-white/40 hover:text-white/70'
              }`
            }
            style={({ isActive }) => isActive ? { color: platConfig.color, borderColor: platConfig.color } : {}}
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      {/* Conteúdo da aba (Outlet renderiza Geral/Posts/Reels/Stories) */}
      <Outlet context={{ clienteId, periodo, platform, platConfig }} />
    </div>
  )
}
```

- [ ] **Step 2: Validar parsing**

Run: `frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx frontend/src/components/Metricas/MetricasLayout.jsx > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit (sem deploy ainda — falta os componentes de aba)**

```bash
git add frontend/src/components/Metricas/MetricasLayout.jsx
git commit -m "feat(metricas): MetricasLayout com tabs + Outlet pra sub-rotas"
```

---

## Task 5: Frontend — `MetricasGeral.jsx` (aba default — visão consolidada)

**Files:**
- Create: `frontend/src/components/Metricas/MetricasGeral.jsx`

- [ ] **Step 1: Criar a aba Geral com KPIs + gráficos + heatmap + demografia**

Esta aba é a "ALL" — KPIs com `tipo=all`. Layout é o atual (sem o Ranking que sai).

```jsx
import { useState, useEffect, useMemo } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, PieChart, Pie, Cell } from 'recharts'
import { api } from '../../lib/api'
import { ChartSkeleton, KpiGridSkeleton, HeatmapSkeleton, PostsGridSkeleton, DemographicsSection } from '../MetricasParts'
import KpiCard from './shared/KpiCard'
import { DadosZeradosBanner, AguardandoSyncBanner, MockDataBanner } from './shared/banners'
import { KPIS_GERAL, KPI_WEIGHT, GOLD } from './shared/constants'

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-3">{children}</h2>
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--flg-bg-card)', border: '1px solid rgba(201,168,76,0.25)' }}>
      <p className="text-white/50 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || GOLD }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString('pt-BR') : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

function fmtDate(d) {
  if (!d) return ''
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

export default function MetricasGeral() {
  const navigate = useNavigate()
  const { clienteId, periodo, platform, platConfig } = useOutletContext()
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [historico, setHistorico] = useState([])
  const [horarios, setHorarios] = useState([])

  useEffect(() => {
    if (!clienteId) return
    setLoading(true)
    setOverview(null)
    Promise.all([
      api(`/metricas/${clienteId}/overview?plataforma=${platform}&dias=${periodo}&tipo=all`),
      api(`/metricas/${clienteId}/historico?plataforma=${platform}&dias=${periodo}`),
      api(`/metricas/${clienteId}/horarios?plataforma=${platform}`),
    ]).then(([ov, hist, hor]) => {
      setOverview(ov)
      setHistorico(hist.dados || [])
      setHorarios(hor.horarios || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [clienteId, periodo, platform])

  const kpis = overview?.kpis
  const conectado = overview?.conectado
  const aguardandoSync = overview?.aguardando_sync === true
  const diagnostico = overview?.diagnostico
  const mostrarDiagnostico = (
    conectado && !aguardandoSync && diagnostico && (
      (diagnostico.last_error?.errors?.length > 0) ||
      (diagnostico.posts_no_periodo === 0 && diagnostico.last_sync_at)
    )
  )

  const donutData = useMemo(() => {
    if (!kpis || platform !== 'instagram') return []
    const items = [
      { name: 'Posts', value: kpis.posts_publicados?.valor || 0, color: '#E4405F' },
      { name: 'Reels', value: kpis.reels_publicados?.valor || 0, color: '#A855F7' },
      { name: 'Stories', value: kpis.stories_publicados?.valor || 0, color: '#FACC15' },
    ].filter(x => x.value > 0)
    return items
  }, [kpis, platform])

  if (loading) {
    return (
      <div className="space-y-8">
        <section>
          <SectionTitle>Visão Geral — {platConfig.label} — últimos {periodo} dias</SectionTitle>
          <KpiGridSkeleton />
        </section>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2"><ChartSkeleton h={260} /></div>
          <ChartSkeleton h={260} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton h={200} />
          <HeatmapSkeleton />
        </div>
        <section>
          <SectionTitle>Melhores Posts — {platConfig.label}</SectionTitle>
          <PostsGridSkeleton />
        </section>
      </div>
    )
  }

  if (!overview) return null

  return (
    <>
      {aguardandoSync && (
        <AguardandoSyncBanner clienteId={clienteId} accent={platConfig.color} onSynced={() => setLoading(true)} />
      )}

      {!aguardandoSync && (
        <>
          {!conectado && (
            <MockDataBanner onConectar={() => navigate('/admin')} />
          )}
          {mostrarDiagnostico && (
            <DadosZeradosBanner
              diagnostico={diagnostico}
              clienteId={clienteId}
              accent={platConfig.color}
              onSynced={() => setLoading(true)}
            />
          )}

          {/* ── KPI Grid ── */}
          <section>
            <SectionTitle>Visão Geral — {platConfig.label} — últimos {periodo} dias</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {(() => {
                const winner = KPIS_GERAL.reduce((best, d) => {
                  if (d.noDelta) return best
                  const dl = kpis[d.key]?.delta_pct
                  if (dl == null || dl <= 0) return best
                  const score = dl * (KPI_WEIGHT[d.key] || 1)
                  if (!best || score > best.score) return { key: d.key, delta: dl, score }
                  return best
                }, null)
                return KPIS_GERAL.map((def) => {
                  const kpi = kpis[def.key]
                  if (!kpi) return null
                  const series = def.histKey
                    ? historico.map(h => Number(h[def.histKey]) || 0)
                    : null
                  return (
                    <KpiCard
                      key={def.key}
                      icon={def.icon}
                      label={def.label}
                      value={kpi.valor || 0}
                      decimals={def.decimals || 0}
                      suffix={def.suffix || ''}
                      prefix={def.prefix || ''}
                      delta={def.noDelta ? undefined : kpi.delta_pct}
                      color={platConfig.color}
                      history={series}
                      highlight={winner?.key === def.key}
                    />
                  )
                })
              })()}
            </div>
          </section>

          {/* ── Crescimento de seguidores ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
              <SectionTitle>Crescimento de seguidores</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={historico} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="seguidoresGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={platConfig.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={platConfig.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--flg-bg-hover)" />
                  <XAxis dataKey="data" tickFormatter={fmtDate} tick={{ fill: 'var(--flg-text-faint)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--flg-text-faint)', fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="seguidores" name="Seguidores" stroke={platConfig.color} strokeWidth={2} fill="url(#seguidoresGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* ── Mix de conteúdo ── */}
            <div className="rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
              <SectionTitle>Mix de conteúdo</SectionTitle>
              {donutData.length === 0 ? (
                <p className="text-white/40 text-xs">Sem publicações no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                {donutData.map(d => (
                  <span key={d.name} className="flex items-center gap-1" style={{ color: d.color }}>
                    <span style={{ width: 8, height: 8, background: d.color, borderRadius: '50%' }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── Demografia ── */}
          {platform === 'instagram' && conectado && !aguardandoSync && (
            <DemographicsSection clienteId={clienteId} accent={platConfig.color} />
          )}
        </>
      )}
    </>
  )
}
```

- [ ] **Step 2: Validar parsing**

Run: `frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx frontend/src/components/Metricas/MetricasGeral.jsx > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Metricas/MetricasGeral.jsx
git commit -m "feat(metricas): MetricasGeral.jsx (aba default — visão consolidada sem Ranking)"
```

---

## Task 6: Frontend — `MetricasPosts/Reels/Stories.jsx` (3 abas com KPIs específicos)

**Files:**
- Create: `frontend/src/components/Metricas/MetricasPosts.jsx`
- Create: `frontend/src/components/Metricas/MetricasReels.jsx`
- Create: `frontend/src/components/Metricas/MetricasStories.jsx`

Os 3 são quase idênticos — só mudam (a) `tipo=` na chamada do overview, (b) `KPIS_*` importado, (c) título. Vou listar cada um sem helper genérico (DRY ruim aqui — preferimos ler 3 arquivos de 90 linhas que 1 arquivo abstrato).

- [ ] **Step 1: Criar `MetricasPosts.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api } from '../../lib/api'
import { KpiGridSkeleton, PostsGridSkeleton, PostsTable, ViewToggle } from '../MetricasParts'
import KpiCard from './shared/KpiCard'
import { KPIS_FEED, KPI_WEIGHT } from './shared/constants'

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-3">{children}</h2>
}

export default function MetricasPosts() {
  const { clienteId, periodo, platform, platConfig } = useOutletContext()
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [posts, setPosts] = useState([])
  const [postsView, setPostsView] = useState('cards')

  useEffect(() => {
    if (!clienteId) return
    setLoading(true)
    setOverview(null)
    Promise.all([
      api(`/metricas/${clienteId}/overview?plataforma=${platform}&dias=${periodo}&tipo=feed`),
      api(`/metricas/${clienteId}/posts?plataforma=${platform}&limit=24`),
    ]).then(([ov, po]) => {
      setOverview(ov)
      // Filtra só FEED (a API hoje devolve todos os tipos)
      setPosts((po.posts || []).filter(p => p.tipo === 'IMAGE' || p.tipo === 'CAROUSEL'))
    }).catch(console.error).finally(() => setLoading(false))
  }, [clienteId, periodo, platform])

  if (loading) {
    return (
      <div className="space-y-6">
        <KpiGridSkeleton count={7} />
        <PostsGridSkeleton />
      </div>
    )
  }
  if (!overview) return null

  const kpis = overview.kpis
  const winner = KPIS_FEED.reduce((best, d) => {
    if (d.noDelta) return best
    const dl = kpis[d.key]?.delta_pct
    if (dl == null || dl <= 0) return best
    const score = dl * (KPI_WEIGHT[d.key] || 1)
    if (!best || score > best.score) return { key: d.key, delta: dl, score }
    return best
  }, null)

  return (
    <>
      <section>
        <SectionTitle>Posts (Feed) — últimos {periodo} dias</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {KPIS_FEED.map((def) => {
            const kpi = kpis[def.key]
            if (!kpi) return null
            return (
              <KpiCard
                key={def.key}
                icon={def.icon}
                label={def.label}
                value={kpi.valor || 0}
                decimals={def.decimals || 0}
                suffix={def.suffix || ''}
                delta={def.noDelta ? undefined : kpi.delta_pct}
                color={platConfig.color}
                highlight={winner?.key === def.key}
              />
            )
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Lista de posts</SectionTitle>
          <ViewToggle value={postsView} onChange={setPostsView} accent={platConfig.color} />
        </div>
        {posts.length === 0 ? (
          <p className="text-white/40 text-xs">Nenhum post no período.</p>
        ) : (
          <PostsTable posts={posts} accent={platConfig.color} />
        )}
      </section>
    </>
  )
}
```

- [ ] **Step 2: Criar `MetricasReels.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api } from '../../lib/api'
import { KpiGridSkeleton, PostsGridSkeleton, PostsTable, ViewToggle } from '../MetricasParts'
import KpiCard from './shared/KpiCard'
import { KPIS_REELS, KPI_WEIGHT } from './shared/constants'

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-3">{children}</h2>
}

export default function MetricasReels() {
  const { clienteId, periodo, platform, platConfig } = useOutletContext()
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [posts, setPosts] = useState([])
  const [postsView, setPostsView] = useState('cards')

  useEffect(() => {
    if (!clienteId) return
    setLoading(true)
    setOverview(null)
    Promise.all([
      api(`/metricas/${clienteId}/overview?plataforma=${platform}&dias=${periodo}&tipo=reels`),
      api(`/metricas/${clienteId}/posts?plataforma=${platform}&limit=24`),
    ]).then(([ov, po]) => {
      setOverview(ov)
      setPosts((po.posts || []).filter(p => p.tipo === 'REEL'))
    }).catch(console.error).finally(() => setLoading(false))
  }, [clienteId, periodo, platform])

  if (loading) return <div className="space-y-6"><KpiGridSkeleton count={9} /><PostsGridSkeleton /></div>
  if (!overview) return null

  const kpis = overview.kpis
  const winner = KPIS_REELS.reduce((best, d) => {
    if (d.noDelta) return best
    const dl = kpis[d.key]?.delta_pct
    if (dl == null || dl <= 0) return best
    const score = dl * (KPI_WEIGHT[d.key] || 1)
    if (!best || score > best.score) return { key: d.key, delta: dl, score }
    return best
  }, null)

  return (
    <>
      <section>
        <SectionTitle>Reels — últimos {periodo} dias</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {KPIS_REELS.map((def) => {
            const kpi = kpis[def.key]
            if (!kpi) return null
            return (
              <KpiCard
                key={def.key}
                icon={def.icon}
                label={def.label}
                value={kpi.valor || 0}
                decimals={def.decimals || 0}
                suffix={def.suffix || ''}
                delta={def.noDelta ? undefined : kpi.delta_pct}
                color={platConfig.color}
                highlight={winner?.key === def.key}
              />
            )
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Lista de Reels</SectionTitle>
          <ViewToggle value={postsView} onChange={setPostsView} accent={platConfig.color} />
        </div>
        {posts.length === 0 ? (
          <p className="text-white/40 text-xs">Nenhum Reel no período.</p>
        ) : (
          <PostsTable posts={posts} accent={platConfig.color} />
        )}
      </section>
    </>
  )
}
```

- [ ] **Step 3: Criar `MetricasStories.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api } from '../../lib/api'
import { KpiGridSkeleton, PostsGridSkeleton, PostsTable, ViewToggle } from '../MetricasParts'
import KpiCard from './shared/KpiCard'
import { KPIS_STORIES, KPI_WEIGHT } from './shared/constants'

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-3">{children}</h2>
}

export default function MetricasStories() {
  const { clienteId, periodo, platform, platConfig } = useOutletContext()
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [posts, setPosts] = useState([])
  const [postsView, setPostsView] = useState('cards')

  useEffect(() => {
    if (!clienteId) return
    setLoading(true)
    setOverview(null)
    Promise.all([
      api(`/metricas/${clienteId}/overview?plataforma=${platform}&dias=${periodo}&tipo=story`),
      api(`/metricas/${clienteId}/posts?plataforma=${platform}&limit=24`),
    ]).then(([ov, po]) => {
      setOverview(ov)
      setPosts((po.posts || []).filter(p => p.tipo === 'STORY'))
    }).catch(console.error).finally(() => setLoading(false))
  }, [clienteId, periodo, platform])

  if (loading) return <div className="space-y-6"><KpiGridSkeleton count={7} /><PostsGridSkeleton /></div>
  if (!overview) return null

  const kpis = overview.kpis
  const winner = KPIS_STORIES.reduce((best, d) => {
    if (d.noDelta) return best
    const dl = kpis[d.key]?.delta_pct
    if (dl == null || dl <= 0) return best
    const score = dl * (KPI_WEIGHT[d.key] || 1)
    if (!best || score > best.score) return { key: d.key, delta: dl, score }
    return best
  }, null)

  return (
    <>
      <section>
        <SectionTitle>Stories — últimos {periodo} dias</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {KPIS_STORIES.map((def) => {
            const kpi = kpis[def.key]
            if (!kpi) return null
            return (
              <KpiCard
                key={def.key}
                icon={def.icon}
                label={def.label}
                value={kpi.valor || 0}
                decimals={def.decimals || 0}
                suffix={def.suffix || ''}
                delta={def.noDelta ? undefined : kpi.delta_pct}
                color={platConfig.color}
                highlight={winner?.key === def.key}
              />
            )
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Stories ativas (24h) e recentes</SectionTitle>
          <ViewToggle value={postsView} onChange={setPostsView} accent={platConfig.color} />
        </div>
        {posts.length === 0 ? (
          <p className="text-white/40 text-xs">Nenhum Story no período.</p>
        ) : (
          <PostsTable posts={posts} accent={platConfig.color} />
        )}
      </section>
    </>
  )
}
```

- [ ] **Step 4: Validar parsing dos 3**

Run:
```bash
for f in MetricasPosts MetricasReels MetricasStories; do
  frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx "frontend/src/components/Metricas/$f.jsx" > /dev/null && echo "OK $f" || echo "FAIL $f"
done
```
Expected: 3 linhas com `OK`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Metricas/MetricasPosts.jsx frontend/src/components/Metricas/MetricasReels.jsx frontend/src/components/Metricas/MetricasStories.jsx
git commit -m "feat(metricas): abas Posts, Reels e Stories com KPIs específicos por tipo"
```

---

## Task 7: Frontend — Wiring (App.jsx routes + Sidebar link + Ranking page)

**Files:**
- Create: `frontend/src/components/Ranking.jsx`
- Modify: `frontend/src/App.jsx` (rotas)
- Modify: `frontend/src/components/layout/Sidebar.jsx` (link Ranking)

- [ ] **Step 1: Criar `Ranking.jsx` extraindo lógica do Metricas.jsx atual**

A função `RankingSection` no Metricas.jsx (procurar) move pra arquivo próprio, vira a página inteira (com header + tabela).

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Crown } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../store/AppContext'

export default function Ranking() {
  const navigate = useNavigate()
  const { clientes } = useApp()
  const [ranking, setRanking] = useState([])
  const [loading, setLoading] = useState(true)
  const platform = 'instagram'

  useEffect(() => {
    setLoading(true)
    api(`/metricas/ranking?plataforma=${platform}`)
      .then(d => setRanking(d.ranking || []))
      .catch(() => setRanking([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
          Ranking de Clientes
        </h1>
        <p className="text-xs text-white/50 mt-1">
          Ordenado por taxa de engajamento média nos últimos 30 dias.
        </p>
      </div>

      {loading ? (
        <p className="text-white/40 text-sm">Carregando…</p>
      ) : ranking.length === 0 ? (
        <p className="text-white/40 text-sm">Nenhum cliente com dados de Instagram conectado.</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">#</th>
                <th className="text-left px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Cliente</th>
                <th className="text-left px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Consultor</th>
                <th className="text-right px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Encontro</th>
                <th className="text-right px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Audiência</th>
                <th className="text-right px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Engajamento</th>
                <th className="text-right px-4 py-3 text-[10px] tracking-widest uppercase text-white/30 font-normal">Posts/mês</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => (
                <tr key={r.cliente_id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-white/60">
                    {i === 0 ? <Crown size={14} className="text-amber-400" /> : i + 1}
                  </td>
                  <td className="px-4 py-3 text-white/90 font-medium">{r.nome}</td>
                  <td className="px-4 py-3 text-white/55">{r.consultor || '—'}</td>
                  <td className="px-4 py-3 text-white/55 text-right">{r.encontro_atual}</td>
                  <td className="px-4 py-3 text-white/80 text-right">{(r.audiencia || 0).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-emerald-400 text-right font-semibold">
                    {(r.taxa_engajamento || 0).toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-white/55 text-right">{r.posts_mes || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => navigate(`/metricas/${r.cliente_id}/geral`)}
                      className="inline-flex items-center gap-1 text-[11px] text-gold-mid hover:underline"
                      style={{ color: '#C9A84C' }}
                    >
                      Ver <ExternalLink size={10} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Criar `index.jsx` da pasta Metricas pra re-exportar Layout (compat com import existente)**

Cria `frontend/src/components/Metricas/index.jsx`:

```jsx
export { default } from './MetricasLayout'
```

- [ ] **Step 3: Atualizar `frontend/src/App.jsx` — rotas novas**

Achar a rota `/metricas` (~linha 105):

```jsx
          <Route path="/metricas" element={
```

Substituir o BLOCO INTEIRO daquela rota (provavelmente algo como `<Route path="/metricas" element={<Layout><Metricas session={session} /></Layout>} />`) pelas 3 rotas novas + a rota `/ranking`. Preciso ler o App.jsx atual pra preservar wrapping (Layout + auth check). Antes do step de impl, a engenheira deve:

```bash
grep -A 6 'path="/metricas"' frontend/src/App.jsx
```

Identificar o wrapper. Substituir a única rota `/metricas` por:

```jsx
          {/* Métricas — sub-rotas por aba */}
          <Route path="/metricas" element={
            session ? <Layout><Metricas session={session} /></Layout> : <Navigate to="/login" replace />
          }>
            <Route index element={null} />
            <Route path=":clienteId" element={null} />
            <Route path=":clienteId/:tab" element={null} />
          </Route>

          {/* Ranking — rota separada */}
          <Route path="/ranking" element={
            session ? <Layout><Ranking /></Layout> : <Navigate to="/login" replace />
          } />
```

Wait, `<Outlet>` dentro do MetricasLayout precisa que as rotas FILHAS tenham `element` que renderize as abas. Refazendo:

```jsx
          <Route path="/metricas" element={
            session ? <Layout><Metricas session={session} /></Layout> : <Navigate to="/login" replace />
          }>
            <Route index element={<MetricasGeral />} />
            <Route path=":clienteId" element={<MetricasGeral />} />
            <Route path=":clienteId/geral" element={<MetricasGeral />} />
            <Route path=":clienteId/posts" element={<MetricasPosts />} />
            <Route path=":clienteId/reels" element={<MetricasReels />} />
            <Route path=":clienteId/stories" element={<MetricasStories />} />
          </Route>

          <Route path="/ranking" element={
            session ? <Layout><Ranking /></Layout> : <Navigate to="/login" replace />
          } />
```

Adicionar imports no topo do App.jsx:

```jsx
import Metricas from './components/Metricas'
import MetricasGeral from './components/Metricas/MetricasGeral'
import MetricasPosts from './components/Metricas/MetricasPosts'
import MetricasReels from './components/Metricas/MetricasReels'
import MetricasStories from './components/Metricas/MetricasStories'
import Ranking from './components/Ranking'
```

Se já existe `import Metricas from './components/Metricas'` (lazy ou normal), substituir pra apontar pra pasta.

- [ ] **Step 4: Atualizar `Sidebar.jsx` adicionando link Ranking**

Achar linha 18 e 26 (admin nav e consultor nav). Em ambas, depois do item `'Métricas'`, adicionar:

```jsx
  { icon: Trophy,         label: 'Ranking',        path: '/ranking' },
```

Adicionar `Trophy` ao import do `lucide-react` no topo do arquivo.

- [ ] **Step 5: Validar parsing**

Run:
```bash
for f in App.jsx components/Ranking.jsx components/Metricas/index.jsx components/layout/Sidebar.jsx; do
  frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx "frontend/src/$f" > /dev/null && echo "OK $f" || echo "FAIL $f"
done
```
Expected: 4 linhas com `OK`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/Ranking.jsx frontend/src/components/Metricas/index.jsx frontend/src/components/layout/Sidebar.jsx
git commit -m "feat(metricas): rotas /metricas/:clienteId/:tab + /ranking + link no menu"
```

---

## Task 8: Cleanup — deletar `Metricas.jsx` antigo

**Files:**
- Delete: `frontend/src/components/Metricas.jsx`

- [ ] **Step 1: Confirmar que ninguém mais importa do Metricas.jsx (só novo Metricas/)**

Run: `grep -rn "from.*Metricas[\"']" frontend/src/ --include="*.jsx" --include="*.js" | grep -v "Metricas/"`

Expected: nenhum resultado (apenas imports da pasta `Metricas/` remanescentes).

Se aparecer algum, esse arquivo precisa ser atualizado pra apontar pra pasta nova antes de deletar.

- [ ] **Step 2: Deletar arquivo**

Run: `rm frontend/src/components/Metricas.jsx`

- [ ] **Step 3: Validar build**

Run: `frontend/node_modules/.bin/esbuild --bundle frontend/src/main.jsx --loader:.jsx=jsx --loader:.js=jsx --outfile=/tmp/build-test.js > /dev/null 2>&1 && echo "OK build" || echo "FAIL build (provavelmente import quebrado)"`
Expected: `OK build`

Se falhar, ler o erro e ajustar import remanescente.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Metricas.jsx
git commit -m "refactor(metricas): remove Metricas.jsx antigo (substituído pela pasta Metricas/)"
```

---

## Task 9: Deploy + verificação end-to-end

**Files:** nenhum (CI)

- [ ] **Step 1: Push de tudo**

Run: `git push origin main`

- [ ] **Step 2: Aguardar deploy (vai rebuildar frontend + backend)**

Run:
```bash
sleep 6
RUN_ID=$(gh run list --workflow deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --exit-status
```

Se backend não rebuildar (bug do detector que vimos), rodar:
```bash
gh workflow run deploy.yml -f force_rebuild=true
```

- [ ] **Step 3: Smoke test backend**

Run: `curl -sf "https://docs.foundersledgrowth.online/api/metricas/ranking?plataforma=instagram"`
Expected: JSON com `{"ranking": [...], ...}`. Se 401, está OK (precisa auth — endpoint funcionando).

- [ ] **Step 4: Smoke test rotas frontend**

Acessar:
- https://docs.foundersledgrowth.online/metricas → redirecionar pra `/metricas/<id>/geral`
- https://docs.foundersledgrowth.online/metricas/<id_letícia>/reels → carrega aba Reels
- https://docs.foundersledgrowth.online/ranking → tabela de ranking

Pedro verifica visualmente.

- [ ] **Step 5: Pedir Pedro confirmar 6 itens**

Mensagem pro Pedro:

> Phase 2 deployada. Verifica:
> 1. ✅ `/metricas` redireciona pra `/metricas/<primeiro>/geral`
> 2. ✅ Tabs no topo: Geral / Posts / Reels / Stories — clicar troca a URL e o conteúdo
> 3. ✅ Voltar do navegador funciona
> 4. ✅ Aba Reels mostra **Plays totais** + **Watch time médio** (KPIs específicos)
> 5. ✅ Aba Stories mostra **Replies** + **Taps forward/back** + **Saídas**
> 6. ✅ Menu lateral tem "Ranking" — clica e mostra a tabela. Página de Métricas individual NÃO mostra mais Ranking embaixo

---

## Self-Review

**Spec coverage:**
- ✅ Sub-rotas no URL (Spec §A) → Tasks 4, 7
- ✅ Backend `?tipo` (Spec §B) → Tasks 1, 2
- ✅ Refatorar `Metricas.jsx` em pasta (Spec §C) → Tasks 3-7
- ✅ Ranking pra rota própria (Spec §D) → Task 7
- ✅ Verificação após deploy → Task 9

**Placeholder scan:** sem TBD/TODO/etc. Todos os steps têm código completo. ✓

**Type/method consistency:**
- `_resolve_builder(plataforma, tipo)` (Task 2) consistente em todas as referências ✓
- `get_historico(cliente_id, dias, tipo='all')` (Task 1) consumido com mesma assinatura em Task 2 ✓
- Outlet context `{ clienteId, periodo, platform, platConfig }` (Task 4) consumido com mesmas chaves nas Tasks 5, 6 ✓
- Imports da pasta `Metricas/shared/` consistentes nos 3 arquivos de aba ✓
- `Trophy` icon (Task 7 step 4) precisa ser importado — instrução explícita "Adicionar Trophy ao import do lucide-react" ✓
