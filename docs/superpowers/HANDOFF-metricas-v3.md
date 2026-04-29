# Métricas V3 — Handoff entre sessões

**Última atualização:** 2026-04-29
**Status:** Phases 1, 2 e 3 (sub-temas A+C) entregues e validadas em produção. Sub-temas B+D pendentes.

---

## Onde estamos

### Phase 1 (entregue)
Bug do filtro 7d/30d/90d corrigido + paginação inteligente até 90 dias retroativos. KPIs honestos (média ignora dias zerados, delta=null pra cliente novo, carry-forward de seguidores com forward-projection).

**Spec:** [specs/2026-04-28-metricas-v3-phase1-design.md](specs/2026-04-28-metricas-v3-phase1-design.md)
**Plan:** [plans/2026-04-28-metricas-v3-phase1.md](plans/2026-04-28-metricas-v3-phase1.md)

### Phase 2 (entregue)
Dashboard reorganizado em sub-rotas (Geral / Posts / Reels / Stories) com URL bookmarkable. Backend `/overview` aceita `?tipo=all|feed|reels|story`. `Metricas.jsx` (1392 linhas) refatorado em pasta `Metricas/` com componentes focados. Ranking extraído pra rota `/ranking` com link no menu lateral.

**Spec:** [specs/2026-04-28-metricas-v3-phase2-design.md](specs/2026-04-28-metricas-v3-phase2-design.md)
**Plan:** [plans/2026-04-28-metricas-v3-phase2.md](plans/2026-04-28-metricas-v3-phase2.md)

**Hotfixes pós-Phase 2:**
1. ViewToggle (Cards / Tabela) só renderizava Tabela — agora respeita `postsView`. Criado `Metricas/shared/PostCard.jsx`.
2. Tab destacada não batia com conteúdo aberto — `params.tab` era `undefined` porque rotas no `App.jsx` têm path estático (`:clienteId/posts`) em vez de dinâmico (`:clienteId/:tab`). Fix: pega último segmento do `pathname` via `useLocation`.

### Phase 3 — sub-temas A + C (entregues 2026-04-29)
- **Bug crônico do `genero_idade`** corrigido: backend chamava `breakdown=age` e `breakdown=gender` separados, frontend esperava keys cruzadas `F.18-24`/`M.25-34` que nunca eram geradas. Fix: 5ª chamada com `breakdown=age,gender` (CSV) na Meta API + branch novo em `_merge_breakdown`. Validado com cliente real (João): após `Sincronizar agora` o gráfico Recharts BarChart vertical agrupado preencheu.
- **Demografia UI** redesenhada em Recharts (rosa F + azul M por faixa etária, valores em label) + top 10 países/cidades com mini-rank `#1 #2 #3` colorido (ouro/prata/bronze) e total formato compacto (`12.4K`).
- **Filtros de posts** funcionando: `/posts?tipo=feed|reels|story&ordenar=engajamento|recente|curtidas|comentarios|salvamentos|compartilhamentos|alcance|replies|exits` — backend ordena sobre histórico inteiro antes de aplicar limit. Dropdown clássico (`SortDropdown.jsx`) persiste seleção em `?ordenar=` na URL. Defaults: Posts/Reels=engajamento, Stories=recente.
- **Refactor**: `MetricasPosts/Reels/Stories` (270 linhas duplicadas) viraram wrappers de ~14 linhas cada usando `MetricasTipoView` + `useTipoMetricas` hook compartilhados.

**Spec:** [specs/2026-04-29-metricas-v3-phase3-design.md](specs/2026-04-29-metricas-v3-phase3-design.md)
**Plan:** [plans/2026-04-29-metricas-v3-phase3.md](plans/2026-04-29-metricas-v3-phase3.md)

---

## Phase 3 — sub-temas B + D (pendentes)

### B) Sub-página "Todos os posts"

Pedro pediu na Phase 1 brainstorm: "vale a pena criar uma subpágina ali, tipo de todos os posts pra ver tudo. E aí filtra".

Rota nova: `/metricas/:clienteId/:tab/todos` (ex: `/metricas/abc/posts/todos`). Tabela paginada de TODOS os posts daquele tipo (sem limit de 24), com filtros completos. Pra Reels e Posts é onde provavelmente o consultor vai gastar mais tempo. Backend `/posts` já aceita `?ordenar=` e `?tipo=` — só precisa de `?offset=`/cursor + página de UI usando TanStack Table v8 ou similar.

### D) Polish UI/UX

Pedro disse: "traga as melhores bibliotecas também de programação, de desenvolvimento de UI e de UX". Sugestões:
- **shadcn/ui ou radix-ui** pra dropdowns, popovers, tooltips polidos (substituir o `SortDropdown` manual atual)
- **TanStack Table v8** se a tabela paginada de "Todos os posts" precisar de sorting/filtering complexo
- Manter visual atual (preto + dourado FLG) — só refinar interações

---

## Bugs conhecidos / dívidas técnicas

1. **CI workflow detector usa `git diff HEAD~1`** que só vê o último commit. Push com vários commits seguidos só rebuilda baseado no último. Workaround atual: `gh workflow run deploy.yml -f force_rebuild=true` quando preciso. Fix verdadeiro: trocar pra `git diff origin/main..HEAD~1` ou similar pre-pull.

2. **VPS sem IPv6** — `_apply_migration_003()` no `main.py` falha silencioso porque Postgres direct connection do Supabase é IPv6-only e a VPS não roteia. Migrations precisam ser rodadas manualmente no SQL Editor do Supabase enquanto o `SUPABASE_DB_URL` não for trocado pro Connection Pooler IPv4. Doc: `~/.claude/projects/.../memory/vps_supabase_ipv6_issue.md`.

3. **Mocks têm `**kwargs`** pra ignorar `tipo` graciosamente. Quando alguém quiser dar realismo aos mocks por tipo (Phase futura), tirar o kwargs e implementar.

4. **PostCard mostra embed do Instagram** via iframe `/embed/captioned/`. Funciona pra posts públicos. Stories não têm embed público — pra Stories vai mostrar só legenda (já é o fallback no PostCard).

---

## Como recomeçar

1. Lê este arquivo.
2. Lê os 3 specs (Phase 1, 2, 3) pra contexto histórico.
3. Pergunta pro Pedro: "Brainstormamos B (sub-página Todos os posts) ou D (polish UI shadcn/radix)?"
4. Invoca `superpowers:brainstorming`. Reusa o Visual Companion server (verifica se está vivo em `.superpowers/brainstorm/<sessão>/state/server-info`; se `server-stopped` existe, reinicia).
5. Spec → plan → execução inline (já é o padrão dessa repo).

**Configurações importantes:**
- Trabalha direto em `main` — não usa worktrees nessa repo.
- Deploy é automático em cada push pra `main` via `.github/workflows/deploy.yml`.
- Backend Python 3 + FastAPI, frontend React + Vite + Tailwind.
- Validação sem suite de testes — usa `python3 -m py_compile` + `frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx`.
- Logs do backend acessíveis via `gh workflow run fetch-logs.yml -f grep="..." -f lines=N`.

**Estrutura de arquivos relevantes:**
```
backend/
  routes/metricas.py              # endpoints + builders KPI por tipo
  services/instagram.py           # LiveInstagramRepository.get_historico
  services/instagram_sync.py      # sync com paginação
  services/meta_oauth.py          # Instagram Business Login OAuth
frontend/src/components/
  Metricas/
    MetricasLayout.jsx            # header + tabs + Outlet
    MetricasGeral.jsx             # aba Geral
    MetricasPosts.jsx             # aba Feed
    MetricasReels.jsx             # aba Reels
    MetricasStories.jsx           # aba Stories
    index.jsx                     # re-export do Layout
    shared/
      KpiCard.jsx                 # card de KPI com sparkline
      PostCard.jsx                # card de post com embed IG
      ClienteCombobox.jsx         # combo de seleção de cliente
      SyncButton.jsx              # botão Sincronizar agora
      banners.jsx                 # IGProfileBadge, AguardandoSync, DadosZerados
      constants.js                # PLATFORMS, KPIS_GERAL/FEED/REELS/STORIES, KPI_WEIGHT
  Ranking.jsx                     # rota /ranking
  MetricasParts.jsx               # legado: DateRangePicker, skeletons, PostsTable, ViewToggle, DemographicsSection (a refatorar na Phase 3)
```
