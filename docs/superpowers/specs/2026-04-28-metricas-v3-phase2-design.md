# Métricas V3 — Phase 2: Estrutura por seções (Geral / Posts / Reels / Stories) + extrair Ranking

**Data:** 2026-04-28
**Escopo:** Phase 2 do redesign do Dashboard. Phase 1 já entregue. Phases 3-4 têm specs próprios.

## Problema

Dashboard atual mostra **tudo numa página única** — Visão Geral, KPIs misturados (Feed + Reels + Stories somados), gráficos, posts, heatmap, demografia, e ainda Ranking de todos os clientes. Isso causa 3 problemas:

1. **Métricas misturadas confundem.** "Engajamento médio" hoje é a média de FEED + REELS + STORIES juntos. Reels e Feed têm comportamento muito diferente — somar dilui o sinal de cada um.

2. **Ranking não pertence ao dashboard individual.** Cliente abre página dele e vê uma lista com todos os outros clientes. Confunde escopo.

3. **Página gigante e o arquivo de código também.** `Metricas.jsx` tem ~1500 linhas, lenta de manter, lenta de carregar. Várias responsabilidades num único componente.

## Solução

### A) Sub-rotas no URL pra cada seção

```
/metricas                              → redirect /metricas/{primeiro_cliente_do_consultor}/geral
/metricas/:clienteId                   → redirect /metricas/:clienteId/geral
/metricas/:clienteId/geral             ← Visão consolidada (todos os tipos)
/metricas/:clienteId/posts             ← Só FEED
/metricas/:clienteId/reels             ← Só REELS
/metricas/:clienteId/stories           ← Só STORY
/ranking                               ← Tabela de Ranking movida (rota nova no menu lateral)
```

Cliente é selecionado no combo (já existe). Trocar de cliente atualiza `:clienteId` na URL. Trocar de aba atualiza `:tab` na URL. Filtro de período (`?dias=N`) e plataforma (`?plataforma=instagram`) viram query params também — preservados entre trocas.

Voltar/avançar do navegador funciona. Bookmarkable. Shareable ("vê os Reels do João: https://docs/metricas/{id}/reels").

### B) Backend `/overview` aceita `?tipo=all|feed|reels|story`

Hoje `LiveInstagramRepository.get_historico` filtra só `media_product_type=ALL`. Vai aceitar parâmetro `tipo`:

- `tipo=all` (default, mantém comportamento atual)
- `tipo=feed` → filtra `media_product_type=FEED`
- `tipo=reels` → filtra `media_product_type=REELS`
- `tipo=story` → filtra `media_product_type=STORY`

Os agregados já existem no DB — `_aggregate_daily_metrics` salva uma linha por (data, tipo) + uma por (data, ALL). Só precisa expor.

`_build_kpis_instagram` ganha 3 variantes:

- `_build_kpis_geral` — atual (mantém os 12 cards)
- `_build_kpis_feed` — KPIs comuns + ênfase em compartilhamentos/salvamentos
- `_build_kpis_reels` — KPIs comuns + **plays_total**, **watch_time_medio_segundos**, **retention_rate** (novos campos no get_historico)
- `_build_kpis_stories` — KPIs comuns + **replies**, **taps_forward**, **taps_back**, **exits** (novos campos)

Os campos novos já existem em `instagram_metricas_diarias` (`total_plays`, `total_watch_time_ms`, `total_replies`, etc.) — só precisa expor em `get_historico`.

### C) Refatorar `Metricas.jsx` em componentes menores

Estrutura nova:

```
frontend/src/components/Metricas/
├── index.jsx                  # Entry — só re-exporta MetricasLayout
├── MetricasLayout.jsx         # Header + combo cliente + filtro período + tabs + <Outlet>
├── MetricasGeral.jsx          # Aba Geral — atual layout, mas sem Ranking
├── MetricasPosts.jsx          # Aba Posts (FEED)
├── MetricasReels.jsx          # Aba Reels
├── MetricasStories.jsx        # Aba Stories
├── shared/
│   ├── KpiGrid.jsx            # Grid de KpiCards (extraído do atual)
│   ├── KpiCard.jsx            # Já existe inline em Metricas.jsx, extrai
│   ├── PostsList.jsx          # Lista de posts (extrai dos PostsParts)
│   ├── ChartCrescimento.jsx   # Gráfico de seguidores
│   ├── HeatmapHorarios.jsx    # Já existe em MetricasParts
│   ├── DemografiaCard.jsx     # Já existe
│   ├── DadosZeradosBanner.jsx # Já existe inline em Metricas.jsx
│   ├── AguardandoSyncBanner.jsx
│   └── IGProfileBadge.jsx
└── (constants — paleta, mappings — extraídos pra arquivo próprio)
```

`MetricasParts.jsx` (que já existe) é absorvido — seus componentes vão pra `Metricas/shared/`.

`Metricas.jsx` original deletado depois que tudo migrar.

**Por quê dividir agora:** o arquivo já passou de 1500 linhas e Phase 3 vai adicionar ainda mais (filtros de posts, melhor demografia). Sem dividir agora, Phase 3 vira impossível de manter. A Phase 2 já encosta no código todo de qualquer forma — fazer refactor junto não custa muito mais.

### D) `Ranking.jsx` extraído pra rota própria

Componente atual `RankingSection` em `Metricas.jsx` vira `Ranking.jsx` em `frontend/src/components/Ranking.jsx`. Rota `/ranking` adicionada em `App.jsx`. Link "Ranking" no menu lateral (`Sidebar.jsx` ou equivalente — vou identificar o arquivo na implementação).

Comportamento atual da tabela mantido: lista clientes ordenados por engajamento, com colunas nome / consultor / encontro / audiência / engajamento / posts.

## O que está fora desta Phase

- Filtros avançados nos cards de posts (Phase 3 — "mais engajados / mais recentes / mais curtidos / mais compartilhados")
- Sub-página "Todos os posts" detalhada (Phase 3)
- Gráfico decente de gênero+idade (Phase 3)
- Polish de UI/UX, micro-animações, biblioteca de componentes (Phase 4)
- Dashboard Geral agregado (todos os clientes) — Phase 5+ (não planejada ainda)

## Risco

- **Refatoração quebra coisa.** Mitigação: cada commit em batch (KpiCard extraído + testar, depois Geral + testar, etc). Sem suite de testes — Pedro precisa F5 cada deploy intermediário e testar manualmente.
- **`?tipo=feed/reels/story` pode retornar overview vazio se cliente não tem posts daquele tipo.** Banner "sem dados no período" da Phase 1 já cobre esse caso — vai aparecer naturalmente quando aplicável.
- **URL com `:clienteId` quebra bookmarks antigos** (`/metricas` puro). Aceitável — sistema interno, ninguém tem bookmark salvo de Métricas.

## Verificação após deploy

1. Acessa `/metricas` → redireciona pra `/metricas/{primeiro_cliente}/geral`
2. Troca de aba (Geral → Posts → Reels → Stories) e os KPIs MUDAM (cada aba mostra só os números daquele tipo)
3. URL atualiza ao trocar aba
4. Voltar do navegador funciona (volta pra aba anterior)
5. Manda link `/metricas/{leticia_id}/reels` em outra aba/anônimo (com login) e abre direto na aba Reels
6. Menu lateral tem "Ranking" novo. Clica → vai pra `/ranking` com a tabela
7. Página de Métricas individual NÃO mostra mais Ranking embaixo

## Próxima Phase

Phase 3 — filtros de posts (mais engajados/recentes/curtidos/compartilhados), sub-página "Todos os posts", gráfico de gênero+idade decente. Spec separado.
