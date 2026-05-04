# Multi-Plataforma Métricas — Phase 1 (MVP UI + Mocks)

**Data:** 2026-05-04
**Escopo:** UI dropdown de plataforma na aba Métricas + mocks robustos pras 3 novas plataformas (YouTube, LinkedIn, TikTok). All-hands hoje. Real OAuth/sync = Fase 2 separada.

## Problema

Hoje a aba Métricas é hardcoded pra Instagram (`MetricasLayout.jsx:30 const platform = 'instagram'`). Pedro quer apresentar no all-hands de hoje a estrutura completa pras 4 plataformas (Instagram + YouTube + LinkedIn + TikTok) pros consultores entenderem onde o sistema vai chegar. OAuth flow real das 3 novas é trabalho de meses — pra hoje, **mocks realistas + UI funcional** são suficientes.

## Decisões já tomadas (brainstorm)

1. **Badge "Mock — em desenvolvimento"** visível nas 3 plataformas novas (honestidade com consultores)
2. **Hybrid backend strategy** (Fase 2): auto-build pra Instagram/YouTube/TikTok, aplicar pra LinkedIn Marketing Developer Platform agora; revisar pra Phyllo só pra LinkedIn se aprovação demorar >3 meses
3. **YouTube tabs**: Geral + Vídeos + Shorts (sem Lives)

## Pesquisa APIs (maio 2026) — input pra Fase 2

| Plataforma | Auth | Demographics | Métricas chave | Gotcha |
|---|---|---|---|---|
| Instagram (já temos) | Instagram Business Login | ✅ | engagement, reach, plays, saves, replies | OK |
| YouTube | OAuth 2.0 (`youtube.readonly`) | ✅ Analytics API | views, watch_time, subscribers, retention | Quota 10K units/dia → caching agressivo |
| LinkedIn | OAuth 2.0 (`w_organization_social`) | ✅ /analytics | impressions, reach, engagement, video views | 🔴 Marketing Developer Platform por aprovação caso-a-caso (1-6 meses) |
| TikTok | OAuth 2.0 (Business + Organic API) | 🔴 não tem (API não retorna age/gender) | video plays, FYP rate, shares, saves | Demografia indisponível via OAuth direto |

## Solução

### A) Frontend — dropdown de plataforma

`MetricasLayout.jsx`:
- Substituir `const platform = 'instagram'` por `useSearchParams()` lendo `?plataforma=` (default `instagram`)
- Adicionar `<PlatformSelector>` na header, ao lado do `ClienteCombobox`
- Persiste seleção na URL (igual `?dias=` e `?ordenar=`)
- Tabs renderizadas dinamicamente baseadas em `PLATFORM_TABS[platform]`
- Badge "Mock" no header quando plataforma != instagram

`PlatformSelector` componente novo (reutiliza padrão visual do `SortDropdown`):
- 4 opções: Instagram, YouTube, LinkedIn, TikTok
- Cada opção com ícone (lucide-react: Instagram, Youtube, Linkedin, Music2 pra TikTok)
- Cor de cada plataforma do `PLATFORMS` constant existente
- Badge "Mock" pequenino ao lado das 3 não-Instagram

### B) Frontend — tabs adaptáveis por plataforma

Em `constants.js`:

```javascript
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
```

Rotas em `App.jsx` precisam aceitar todas as combinações OU usar wildcard `:tab` (recomendo wildcard agora pra ficar elegante e suportar futuras plataformas). Hoje usa path estático (handoff Phase 2 documentou esse débito).

### C) KPIs por plataforma + tipo

Em `constants.js` adicionar:

```javascript
// YouTube
export const KPIS_YT_GERAL = [...]   // inscritos, watch time total, views, etc
export const KPIS_YT_VIDEOS = [...]  // por vídeo: views, watch time médio, retention, likes
export const KPIS_YT_SHORTS = [...]  // shorts: plays, swipe rate, likes

// LinkedIn
export const KPIS_LI_GERAL = [...]   // followers, impressions, engagement
export const KPIS_LI_POSTS = [...]   // post: impressions, reactions, shares, clicks
export const KPIS_LI_ARTIGOS = [...] // article: views, reads, completion rate

// TikTok
export const KPIS_TT_GERAL = [...]   // followers, views, engagement
export const KPIS_TT_VIDEOS = [...]  // video: plays, FYP%, shares, completion rate
```

Cada conjunto de ~7-9 KPIs realistas por plataforma. Reusar componente `KpiCard` existente.

### D) Backend — robustar mocks existentes

`backend/services/social.py` já tem `MockLinkedInRepository`, `MockYouTubeRepository`, `MockTikTokRepository`. Validar que retornam estruturas compatíveis com o que o frontend espera.

`backend/routes/metricas.py` endpoints já validam `?plataforma=` (em `PLATAFORMAS_VALIDAS`). Precisa garantir que `_get_repo(plataforma, cliente_id)` retorna o mock correto pra cada uma.

Mock data deve ser **realista por plataforma**:
- YouTube: subscribers crescente, views/watch time variando, vídeos com captions tipo "[Vídeo] Como triplicamos..."
- LinkedIn: posts mais formais "[Insight] 3 lições do nosso último Q...", followers crescimento lento
- TikTok: vídeos curtos, plays altos, FYP rate variando 5-30%

### E) Componentes específicos por plataforma

`MetricasLayout` hoje tem `IGProfileBadge` e `SyncButton` específicos do Instagram. Quando platform != instagram:
- IGProfileBadge → escondido OU substituído por badge genérico "Conta @usuario_mock"
- SyncButton → escondido OU mostra "Mock" disabled
- Tabs dinâmicas baseadas em `PLATFORM_TABS[platform]`

### F) Banner de status "Mock — em desenvolvimento"

Componente novo em `Metricas/shared/MockPlatformBanner.jsx`:
- Mostrado quando `platform !== 'instagram'`
- Texto: "Você está visualizando dados de exemplo. A integração real com {Platform} está em desenvolvimento e será liberada em breve."
- Estilo: borda sutil dourada/laranja, ícone, dismissable com `localStorage` (lembra do dismiss por sessão)

## Out of scope (Fase 2 — separada)

- OAuth flow real pras 3 novas plataformas
- Sync schedulers reais
- Embed players nos PostCards (YouTube embed seria fácil, mas adiciona complexidade)
- Decisão final Phyllo vs auto-build (tomar quando LinkedIn responder aprovação)
- Quota management YouTube (caching agressivo)
- Migration de schema pra novas plataformas (`youtube_videos`, `linkedin_posts`, etc)

## Arquitetura de arquivos afetada

```
backend/
  services/social.py          # validar/melhorar mocks Y/L/T (já existem)
  routes/metricas.py          # já aceita ?plataforma= (validar)

frontend/src/components/Metricas/
  MetricasLayout.jsx          # platform vira estado URL + dropdown + tabs dinâmicas
  MetricasGeral.jsx           # KPIs por plataforma
  MetricasPosts.jsx           # idem (e similar pra novos arquivos abaixo)
  MetricasReels.jsx           # Instagram only
  MetricasStories.jsx         # Instagram only
  MetricasYTVideos.jsx        # NOVO
  MetricasYTShorts.jsx        # NOVO
  MetricasLIPosts.jsx         # NOVO
  MetricasLIArtigos.jsx       # NOVO
  MetricasTTVideos.jsx        # NOVO
  shared/
    PlatformSelector.jsx      # NOVO
    MockPlatformBanner.jsx    # NOVO
    constants.js              # adiciona PLATFORM_TABS, KPIS_YT_*, KPIS_LI_*, KPIS_TT_*
    useTipoMetricas.js        # já é genérico, deve funcionar com qualquer platform/tipo
    MetricasTipoView.jsx      # já é genérico

frontend/src/App.jsx          # rotas: trocar paths estáticos por :tab dinâmico, ou adicionar paths novos
```

## Validação

- `python3 -m py_compile backend/services/social.py backend/routes/metricas.py`
- `esbuild` em todos arquivos novos/modificados
- Manual: trocar plataforma no dropdown, verificar tabs adaptáveis, KPIs aparecem, badge Mock visível

## Riscos

1. **Tabs do React Router em path estático**: hoje rotas são `/metricas/:clienteId/posts`, `:clienteId/reels` etc. Tabs novas (videos, shorts, artigos) requerem novas rotas. Refatorar pra `:clienteId/:tab` simplifica drasticamente. **Decisão**: refatorar agora, dado que vamos adicionar 5 tabs novas — economiza 5 rotas estáticas.

2. **Componentes MetricasYTVideos/etc duplicarem padrão**: igual a Phase 3 onde Posts/Reels/Stories tinham 95% código duplicado. Reusar `MetricasTipoView` + `useTipoMetricas` que já são agnósticos. Cada arquivo novo vira wrapper de ~14 linhas.

3. **Mock data não bater estrutura esperada**: validar que mocks retornam mesmo schema do Instagram pra reusar componentes.
