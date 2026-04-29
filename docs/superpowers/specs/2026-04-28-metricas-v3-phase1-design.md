# Métricas V3 — Phase 1: Bug do filtro de período + paginação retroativa

**Data:** 2026-04-28
**Escopo:** apenas Phase 1 do redesign do Dashboard. Phases 2-4 têm specs próprios.

## Problema

Dois bugs de "dados não fazem sentido" reportados pelo Pedro:

1. **Filtros 7d/30d/90d mostram exatamente os mesmos KPIs.** O usuário troca o período no header e nada muda nos cards do topo (só o gráfico abaixo muda).

2. **Cliente novo só vê posts dos últimos N dias mesmo quando o IG dele tem histórico maior.** O sync puxa só os 50 posts mais recentes, sem paginação. Cliente com 200 posts perde 150 do histórico — filtro "Últimos 90 dias" fica enganoso porque nem temos os posts de 90 dias atrás na DB.

## Causa raiz

### Bug 1 — filtro não chega no overview
`GET /metricas/{id}/overview` não aceita query param `dias`. Backend hardcoded em `repo.get_historico(cliente_id, 60)` (30 atual + 30 anterior). O frontend passa `dias` apenas pra `/historico` (gráfico), nunca pro `/overview` (KPIs).

### Bug 2 — sync sem paginação
`_sync_posts` em `instagram_sync.py` faz `GET /me/media?limit=50` e processa só essa primeira página. Sem `paging.next` follow-up. Independe de quantos posts o cliente tem no IG.

## Solução

### A) Overview aceita `?dias=N`

**Backend** (`backend/routes/metricas.py`):

- `GET /{cliente_id}/overview` ganha query param `dias: int = 30` (validação: 1 ≤ dias ≤ 365).
- Internamente: `historico = repo.get_historico(cliente_id, dias * 2)` — pra ter janela atual + anterior.
- Split: `atual = historico[dias:]`, `anterior = historico[:dias]`.
- Sparklines também respeitam o período: `historico[-min(7, dias):]`.

**Frontend** (`frontend/src/components/Metricas.jsx`):

- A chamada `api('/metricas/${clienteId}/overview?plataforma=${p}')` na linha 1104 passa a incluir `&dias=${periodo}`.
- O `useEffect` que dispara o fetch já tem `periodo` no dependency array — re-busca automaticamente quando troca o filtro.
- Título da seção "Visão Geral — INSTAGRAM — últimos 30 dias" vira dinâmico: "últimos {periodo} dias".

### B) Paginação inteligente de posts retroativos

**Backend** (`backend/services/instagram_sync.py`):

`_sync_posts` ganha loop de paginação com 3 critérios de parada:

1. **Hit fundo histórico**: posts mais antigos que 90 dias (`MAX_HISTORICAL_DAYS = 90`)
2. **Hit limite de páginas**: máx 10 páginas por sync (proteção contra rate limit Meta — 200 calls/hora/user)
3. **Hit post já consolidado**: encontrou um post que já existe na DB E está com `metricas_finalizadas=TRUE` (>30 dias). Significa que esse e tudo antes já foi sincronizado em runs anteriores.

**Comportamento esperado:**

- **Primeiro sync** de cliente novo: pagina até 90d ou até o início da conta (até 10 páginas × 50 = 500 posts). Demora ~30-60s.
- **Sync incremental** (cron diário): para na primeira página onde encontra um post finalizado já no DB. ~5-10s.

`MAX_POSTS_PER_SYNC` (50) vira `POSTS_PER_PAGE` (50). Adiciona `MAX_HISTORICAL_DAYS = 90` e `MAX_PAGES_PER_SYNC = 10`.

### C) Documentação clara dos limites Meta na UI — DEFERIDO PRA PHASE 2

A Phase 2 (estrutura por seções) é onde vamos ter espaço pra texto explicativo. Não inflar a tela atual com isso agora.

## O que NÃO está nesta Phase

- Reorganização do Dashboard em seções (Phase 2)
- Sub-página "Todos os posts" com filtros (Phase 3)
- Melhorar gráfico de demografia (Phase 3)
- Polish de UI/UX (Phase 4)
- Mover Ranking pra outra tela (Phase 2)

## Risco

- **Paginação pode atingir rate limit Meta** se cliente tem MUITOS posts E todas as conexões sincronizam ao mesmo tempo. Mitigação: `INTER_CALL_DELAY = 0.2s` já existe entre chamadas, e cron roda à 04h UTC quando ninguém usa Instagram. Se virar problema, pré-ordenar conexões com staggering.
- **Primeiro sync de cliente com 500+ posts pode demorar 1-2 min**. Aceitável: roda no cron, não bloqueia UI. Pra sync manual via botão, frontend já tem feedback "Sincronizando…".

## Verificação após deploy

1. Pedro/cliente troca filtro 7d → 30d → 90d. KPIs mudam visivelmente (não ficam iguais).
2. João reconecta (ou sync manual). Backend logs: `_sync_posts cliente=X: media=N (paginated K pages)`. N maior que 50.
3. Gráfico "Crescimento de seguidores" no filtro 90d mostra mais pontos retroativos de POSTS (não de followers — esse continua só desde a conexão, é limitação da Meta).

## Próxima Phase

Phase 2 — estrutura do Dashboard em seções (Geral / Posts / Reels / Stories), tirar Ranking dessa tela. Spec separado.
