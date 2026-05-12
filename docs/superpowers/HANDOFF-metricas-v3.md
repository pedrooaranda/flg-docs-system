# FLG Jornada — Handoff entre sessões

**Última atualização:** 2026-05-12 (Reuniões A→D + refactor Materiais com cliente como hub central + design tokens FLG)
**Status:** 4 streams ativos. Veja "Como recomeçar" no fim pra próximos passos imediatos.

---

## Stream 1 — Métricas V3

### Phases 1, 2, 3A+C (entregues, em produção)
- Phase 1: filtro 7d/30d/90d + paginação 90 dias retroativos + KPIs honestos (média ignora dias zerados, delta=null, carry-forward de seguidores).
- Phase 2: dashboard sub-rotas (Geral/Posts/Reels/Stories), URL bookmarkable, `Metricas.jsx` 1392 linhas refatorado em pasta `Metricas/`. Ranking extraído pra `/ranking`.
- Phase 3A: bug crônico do `genero_idade` corrigido (5ª chamada Meta com `breakdown=age,gender` CSV).
- Phase 3C: filtros de posts (`?ordenar=engajamento|recente|...`) + `MetricasTipoView` + `useTipoMetricas` shared.

Specs: [phase1](specs/2026-04-28-metricas-v3-phase1-design.md), [phase2](specs/2026-04-28-metricas-v3-phase2-design.md), [phase3](specs/2026-04-29-metricas-v3-phase3-design.md).

### Phase 3 B+D — pendentes
- **B) Sub-página "Todos os posts"**: rota `/metricas/:clienteId/:tab/todos`, tabela paginada full (sem limit de 24), TanStack Table v8 sugerido.
- **D) Polish UI**: shadcn/ui ou radix-ui pra dropdowns/popovers/tooltips (substituir `SortDropdown` manual atual). Manter preto + dourado FLG.

### Hotfix crítico 2026-05-08 — Meta API deprecou métricas (entregue)

Meta API deprecou em **2025-04-21** múltiplas métricas pra TODAS as versões: `impressions`, `plays`, `clips_replays_count`, `ig_reels_aggregated_all_plays_count` mortas; `taps_forward/back/exits` standalone (STORY) só via `navigation` com breakdown `story_navigation_action_type`.

**Fix entregue ([commit `c0baa6e`](https://github.com/pedrooaranda/flg-docs-system/commit/c0baa6e) + `073881d`):**
- `_fetch_post_insights` self-healing — pede lista preferida → se 400, parseia erro pra identificar métrica rejeitada → dropa → retenta. Variant agora é `full|partial|minimal|failed`.
- Métricas atualizadas (FEED/REELS/STORY) + `views` substitui `impressions`/`plays` em `_build_post_row` + STORY ganha 2ª chamada com `breakdown=story_navigation_action_type`.
- **Auto-recovery**: posts finalizados com `engagement_rate=NULL` E `likes>0` são re-fetchados automaticamente (cap em 40/sync).
- `force_refresh=True` em `sync_cliente` + endpoint `POST /instagram/oauth/sync/{cid}?force=true`.

---

## Stream 2 — Ranking Tabs (Clientes / Consultores)

### Spec aprovada + Phase 1 entregue
**Objetivo:** dividir tela `/ranking` em duas abas — **Clientes** (UX atual preservada) e **Consultores** (nova, comprehensive com pódio + troféus + atenção operacional + tabela com drill-down + integração ClickUp tasks + materiais_copy entregues).

Spec: [specs/2026-05-10-ranking-tabs-consultores-design.md](specs/2026-05-10-ranking-tabs-consultores-design.md).

### Phase 1 (entregue 2026-05-10, em produção)
Refactor estrutural do `Ranking.jsx` (722 linhas) em pasta `Ranking/` com `index.jsx` (layout + tabs + URL `?tab=` + fetch), `RankingClientes.jsx` (UX atual extraída), `RankingConsultores.jsx` (stub "Em construção"), e 5 componentes em `shared/`. SHA `0b35f4a`.

### Phases 2-6 — não planejadas ainda (escopo no spec)
| Phase | Escopo | Estimativa |
|---|---|---|
| 2 | Backend `GET /metricas/ranking-consultores` (agregados Instagram + clientes_em_crise) | ~3h |
| 3 | UI aba Consultores — pódio, troféus, atenção operacional, tabela, drill-down | ~5h |
| 4 | Integração ClickUp — count tasks closed por consultor + cache 5min | ~3h |
| 5 | Integração Materiais — count `materiais_copy` + 4º troféu "Volume de Entregas" composite | ~2h |
| 6 | Polish — loading skeletons, empty states, responsive, smoke prod | ~2h |

**Próximo passo concreto:** brainstormar/planejar Phase 2 (backend endpoint).

---

## Stream 3 — Colaboradores

### Spec aprovada + Phases 1, 2, 3, 3.1 entregues

**Objetivo:** nova aba `/colaboradores` (abaixo de "Copywriter FLG") com gestão hierárquica de operadores. Separação ortogonal: identidade + categoria (consultor/diretor) + cargo + tier (junior/pleno/senior/lead) + role (owner/admin/member).

Spec: [specs/2026-05-10-colaboradores-design.md](specs/2026-05-10-colaboradores-design.md).

### Phase 1 backend (entregue 2026-05-11, em produção, SHA `ef1f820`)
- Migration 004 aplicada manualmente: tabela `colaboradores` + Pedro seeded como owner.
- `backend/services/colaboradores_sync.py` — `sync_role_to_auth_metadata` (espelha role DB → `auth.users.user_metadata.role`).
- `backend/routes/colaboradores.py` — 6 endpoints (GET list/detail/me, POST, PATCH, DELETE soft) com permission matrix (`OWNER_FALLBACK_EMAILS` exato, `ativo=true` filter em `_resolve_caller`, SELF_EDITABLE_FIELDS pra member).

### Phase 2 frontend skeleton (entregue 2026-05-11, em produção, SHA `612124e`)
- Rota `/colaboradores` + sidebar entry (ícone `UserCog`, após Copywriter FLG).
- `Colaboradores/index.jsx` — tabs Consultores/Diretores via URL `?tab=`, tabela read-only.

### Phase 3 CRUD UI (entregue 2026-05-11, em produção, SHA `d407a4f`)
- `lib/utils.js` — `isAdmin()` agora reconhece `role='owner'`.
- `Colaboradores/shared/` ganhou: `constants.js` (TIER_CONFIG, ROLE_CONFIG, SELF_EDITABLE_FIELDS, INPUT_CLASS), `TierBadge.jsx`, `RoleBadge.jsx`, `ColaboradorRow.jsx` (botões editar/desativar permission-aware), `ColaboradorFormModal.jsx` (criar/editar com `fieldDisabled` por permissão).
- Filtros no index: busca por nome/email, dropdown tier, checkbox "só admins/owners".

### Phase 3.1 auth auto-provisioning (entregue 2026-05-12, em produção, SHA `9847be3`)
- Backend `POST /colaboradores` agora valida domínio `@grupoguglielmi.com` + auto-cria conta em `auth.users` via `supabase.auth.admin.create_user` com senha temporária random 16-char (alphanumeric, ≥1 lower + ≥1 upper + ≥1 dígito) + `user_metadata.needs_password_change=true`. Resposta inclui `temporary_password` apenas quando user foi criado agora.
- Frontend `PasswordRevealModal.jsx` — mostra senha com copy-to-clipboard. **Não fecha com backdrop/ESC** (acidente perderia senha). Só fecha via botão "Entendi, senha salva" ou X.
- `_validate_email_domain` usa `split("@")` em vez de `endswith` (rejeita `foo@evil.com@grupoguglielmi.com`).

### Phase 4 — pendente (não planejada ainda)
**Escopo:** 
- Tela de trocar senha no primeiro login (UI que detecta `user.user_metadata.needs_password_change=true` após login e força change).
- Extrair `isOwner()` helper em `lib/utils.js` (hoje inline derivado em vários lugares).
- Yellow nits do code review de Phase 3 (useCallback em `loadColaboradores`, `onClose` stable ref).
- Loading skeletons + empty states polish + mobile responsive.

**Estimativa:** ~4h. Sem plan escrito ainda.

---

## Stream 4 — Reuniões da Jornada (NOVO 2026-05-12)

### Spec aprovada + Phase A entregue

**Objetivo:** Produção de **decks HTML** pra reuniões dos encontros (1-15) usando `flg-design-system/` (preto + dourado, Fraunces+Inter+JetBrains Mono). Cada encontro = parte intelectual fixa (admin escreve, Claude converte em HTML) + parte prática personalizada por cliente (consultor↔Claude chat). Apresentação fullscreen via slug público.

Spec: [specs/2026-05-12-reunioes-jornada-design.md](specs/2026-05-12-reunioes-jornada-design.md).

### Decisões aprovadas
1. Sub-rotas `/materiais/diarios` e `/materiais/reunioes` (não tabs internas).
2. HTML armazenado no DB (`encontros_base.html_intelecto` + nova tabela `encontros_pratica` futura).
3. **Formato simples pra Pedro**: `SLIDE N / Título / Conteúdo` linha-a-linha. Sistema converte via Claude.
4. Apresentação fullscreen via slug público em `/apresentar/:slug` (Phase D, futura).
5. Modelo Claude **Sonnet 4.6** com prompt caching (~90% economia em re-geração).

### Phase A — Admin Intelectual (entregue 2026-05-12, em produção, SHA `447f735`)
- **Migration 005** aplicada: `encontros_base` ganhou `intelecto_estrutura` (texto formato simples), `html_intelecto` (HTML gerado), `num_slides_intelecto`, `html_gerado_at`.
- **`backend/services/claude_html_generator.py`** — Claude API com prompt caching dos 3 arquivos do design system (`FLG-DESIGN-SYSTEM.md` + `flg.css` + `deck-template.html`) carregados via env var `FLG_DESIGN_SYSTEM_PATH` (volume mount `/app/flg-design-system` no container). Validação via BeautifulSoup contra allowlist de classes CSS. Retry multi-turn com feedback ao Claude.
- **`backend/routes/encontros_intelecto.py`** — 4 endpoints: GET detail, POST save estrutura, POST gerar-html, POST html raw. Reusa `_require_role` de `colaboradores.py` pra evitar drift.
- **`backend/main.py`** — registra router. Mount static do design system foi REMOVIDO; frontend serve via Nginx em `frontend/public/flg-design-system/`.
- **`frontend/src/components/admin/IntelecFLG.jsx`** — 2 novas tabs: "Estrutura" (textarea formato simples + counter "N slides detectados") e "HTML" (botão "Gerar HTML" → Claude → preview iframe + toggle "Editar HTML raw"). Persistência integrada com AppContext (`dispatch({type:'ENCONTRO_UPDATE'})`).

**Decisão arquitetural importante:** `flg-design-system/` movido pra `frontend/public/flg-design-system/` (Nginx serve URLs `/flg-design-system/*` direto). Backend lê os 3 arquivos via volume mount em `/app/flg-design-system` (env `FLG_DESIGN_SYSTEM_PATH`). Decisão veio de: backend Dockerfile context é `./backend` (não copia arquivos fora), Traefik route `/api/*` strip-prefix faria URL ficar `/api/flg-design-system/` se mount fosse no backend.

### Phase B — Refactor Materiais + Grid (entregue 2026-05-12, em produção, SHA `e0a8601`)
- `frontend/src/components/Materiais.jsx` (1 arquivo, 312 linhas) refatorado em pasta `Materiais/`:
  - `index.jsx` — MateriaisLayout com NavLinks "Diários" / "Reuniões" + `<Outlet />`.
  - `Diarios.jsx` — UI clássica migrada zero comportamento novo (ClienteSelector + chat + biblioteca).
  - `Reunioes.jsx` — grid clientes × encontros (1-15 hoje). Busca por nome/empresa, filtro por consultor (admin vê todos). Empty states.
  - `shared/constants.js` — `ENCONTRO_STATUS` map (intelectual_pendente, aguardando_pratica, rascunho, pronto, apresentado) + `deriveStatus(encontroBase, encontroPratica)` helper.
  - `shared/EncontroCard.jsx` — card visual por encontro com label, num_slides, status.
- `App.jsx` ganhou rotas nested `/materiais/diarios` (index redirect) + `/materiais/reunioes`. Lazy imports separados pra cada sub-rota.
- `Sidebar.jsx` — item Materiais ganhou `matchPrefix: true` pra destacar em sub-rotas.

**Status atualmente exibido:** só `intelectual_pendente` (html_intelecto vazio) e `aguardando_pratica` (html_intelecto pronto, sem prática) — `encontros_pratica` ainda não existe (vem em C1). `deriveStatus` já prepara as outras chaves.

Plano: [plans/2026-05-12-reunioes-phase-b.md](plans/2026-05-12-reunioes-phase-b.md).

### Phase C1 backend (entregue 2026-05-12, em produção, SHA `d3e188a`)

⚠️ **Migration 006 ainda não aplicada** — Pedro precisa rodar SQL manualmente no Supabase Dashboard. Arquivo: [docs/migrations/006-encontros-pratica.sql](../migrations/006-encontros-pratica.sql). Backend já está em prod, endpoints respondem mas falham até a tabela existir.

- **`backend/routes/reunioes.py`** (~280 linhas) — 6 endpoints:
  - `GET  /reunioes/:cid` — lista status de TODOS encontros do cliente (junta `encontros_base` + `encontros_pratica`)
  - `GET  /reunioes/:cid/:n` — pratica do encontro N (cria rascunho vazio se não existe, idempotente)
  - `POST /reunioes/:cid/:n/chat` — turno de chat SSE (salva user turn antes, assistant turn após stream)
  - `POST /reunioes/:cid/:n/gerar` — Claude produz HTML prática final + valida via allowlist + salva
  - `POST /reunioes/:cid/:n/marcar-pronto` — gera slug único (`secrets.token_urlsafe(9)`, retry 5x), status='pronto'
  - `POST /reunioes/:cid/:n/revogar` — `slug_revogado_at=now` (mantém histórico)
- **`backend/services/claude_chat_pratica.py`** — reusa `_DS_MD`/`_DS_CSS`/`_DS_TEMPLATE`/`_ALLOWED_CLASSES` de `claude_html_generator` (mesmo I/O de startup, mesmo cache no Anthropic). `stream_chat_turn()` sync generator pra SSE; `generate_pratica_html()` multi-turn retry com feedback.
- **`backend/main.py`** registra `reunioes_router` + nota da migration 006.
- **Modelo Claude:** Sonnet 4.6 com `temperature=0.7` no chat (conversa natural) e `0.3` na geração (HTML estruturado).

Auth: usuário autenticado, sem gate por consultor↔cliente (frontend filtra, padrão dos endpoints existentes). `consultor_email` é gravado pra audit.

### Phase C2 frontend (entregue 2026-05-12, em produção, SHA `0549495`)

Editor `/materiais/reunioes/:cid/:n` (tela inteira, fora do layout Materiais):
- **`Materiais/Reuniao/index.jsx`** — fetch de pratica via `GET /reunioes/:cid/:n`, render split 58/42. Empty states: cliente/encontro não encontrado; intelectual ainda não gerado.
- **`Materiais/Reuniao/PreviewIntelecto.jsx`** — iframe combinando `html_intelecto + html_pratica` com `<link rel="stylesheet" href="/flg-design-system/css/flg.css">`. Empilha slides verticalmente pra revisão (sem `flg-deck.js` aqui).
- **`Materiais/Reuniao/ChatGerador.jsx`** — chat consultor↔Claude consumindo `apiStream(POST /reunioes/:cid/:n/chat)`. Streaming visível com TypingDots. Optimistic user turn + auto-reload após done.
- **`Materiais/Reuniao/ActionsBar.jsx`** — botões "Gerar HTML" (estado-aware: "Gerar" / "Gerar de novo"), "Marcar pronto" (gera slug), "Apresentar" (abre `/apresentar/:slug` em nova aba — link 404 até Phase D), "Revogar", "Copy HTML".
- **`Materiais/Reunioes.jsx`** (grid Phase B) — agora fetch `GET /reunioes/:cid` por cliente pra preencher `encontroPratica` no card. `EncontroCard` virou `<Link>` clicável quando intelectual está pronto.
- **`App.jsx`** — rota `/materiais/reunioes/:cid/:n` (fora do nested Materiais layout pra tela inteira).

**Migration 006 aplicada em 2026-05-12** — fluxo end-to-end funcional após aplicação manual no Supabase Dashboard.

### Phase D — Apresentação pública (entregue 2026-05-12, em produção, SHA `ee13c51`)

- **`backend/routes/apresentar.py`** — endpoint `GET /apresentar/{slug}` (registrado sem prefix; resolve em `/api/apresentar/...` via Traefik). **Sem auth** (slug é a credencial). Look-up em `encontros_pratica` por slug, 404 se ausente ou `slug_revogado_at IS NOT NULL`. Junta com `encontros_base.html_intelecto` e monta documento completo (estrutura do `deck-template.html`: canvas + grain + progress + counter + nav arrows + `.deck > slides`). Carrega `/flg-design-system/css/flg.css` e `/flg-design-system/js/flg-deck.js` de mesma origem (Nginx do frontend serve via Vite public).
- **Best-effort `apresentado_at`:** primeira visita marca `apresentado_at=now()` + `status='apresentado'` (não bloqueia render se falhar).
- **Headers:** `Cache-Control: no-store, no-cache` + `X-Robots-Tag: noindex, nofollow` (evita indexação de slugs públicos).
- **Frontend `ActionsBar.jsx`** — `APRESENTAR_BASE='/api/apresentar'`. Botão "Apresentar" abre nova aba.

URL pública final: `https://docs.foundersledgrowth.online/api/apresentar/:slug`. Pra ficar mais bonito (sem `/api/`), Pedro pode adicionar rule no Traefik aliasando `/apresentar/*` → backend — opcional, Phase E.

### Refactor UX 2026-05-12 — Cliente como hub central (entregue, SHA `03d83f4`)

Pedro pediu reorganização: filtro por consultor, cliente como entrada principal, design system aplicado. Implementado:

- **`/materiais`** (`MateriaisHome`) — tela de escolha de cliente. Cards com avatar + nome + empresa + consultor + barra de progresso E0N/15.
- **Filtro consultor:**
  - Admin/owner vê tabs `Todos · Pedro Aranda · Lucas Nery · Rebecca Rachel · ...` (lista derivada de `clientes.consultor_responsavel` distinct + união com 3 oficiais hardcoded). URL `?consultor=Lucas Nery` bookmarkable.
  - Consultor não-admin vê só seus clientes (auto-filtro). Sem UI de toggle.
- **`/materiais/cliente/:cid`** (`ClienteArea`) — header da identidade do cliente (avatar + nome + empresa + consultor + progresso jornada) + tabs `Diários | Reuniões` via NavLink.
  - `/materiais/cliente/:cid/diarios` — chat de materiais + biblioteca (cliente vem do `useOutletContext`, sem mais ClienteSelector).
  - `/materiais/cliente/:cid/reunioes` — grid dos 15 encontros DESSE cliente com cards detalhados (título, status visual com Icon, slides count intelectual+prática, indicador "link ativo" quando slug está vivo).
- **`/materiais/cliente/:cid/reunioes/:n`** — editor `Reuniao/` reaproveitado (URLs de "voltar" ajustadas pra área do cliente).
- **Design System tokens FLG aplicados:**
  - Tipografia: `font-serifdeck` (Fraunces) em nomes/títulos; `font-monodeck` (JetBrains Mono) em E01/E15/contadores.
  - Cores: `#C9A84C` (gold-mid) consistente, gold-dividers gradient em separadores, eyebrows uppercase tracking-widest.
  - Fontes importadas em `frontend/src/index.css` (Fraunces + JetBrains Mono).
- **Helper `consultor-utils.js`:**
  - `matchConsultor(consultor_responsavel, identificador)` — normaliza espaços/case/acentos pra ligar "Lucas Nery" ↔ "lucasnery" (corrige bug latente do `includes` ingênuo).
  - `isAdminFromSession(session)` — checa `user_metadata.role === 'owner' | 'admin'` + fallback Pedro.
  - `listConsultoresFromClientes(clientes)` — DISTINCT consultor_responsavel ordenado por contagem.
- **Redirects** de rotas antigas: `/materiais/diarios`, `/materiais/reunioes`, `/materiais/reunioes/:cid/:n` → `/materiais` (compat com bookmarks).
- **Slug:** NÃO mudado. `secrets.token_urlsafe(9)` é credencial não-enumerável. Separação por cliente já é nativa via `cliente_id` FK em `encontros_pratica`.

### Phase E — Polish (pendente)
**Escopo:**
- "Regerar slide N" individual (Claude refaz só uma `<section>` específica)
- "Copiar URL pública" no ActionsBar
- Empty states refinados
- Mobile-friendly read-only no editor (chat funciona, preview empilhado vertical)
- Traefik rule pra `/apresentar/*` (URL bonita sem `/api/`)
- Loading skeletons no grid de Reuniões

**Estimativa:** ~4h. Sem plan escrito ainda.

**Próximo passo:** validar fluxo end-to-end (Pedro testa novo UX) + se OK, iniciar Phase E ou pivotar pra outro stream.

---

## Organização da raiz (2026-05-12)

**Arquivados em `docs/archive/`:**
- `ANALISE_BEHAVIOR_CANVAS.md`
- `PLANO_IMPLEMENTACAO_V2.md`
- `PLANO_METRICAS_V2.md`
- `PLANO_NOVO_PROJETO.md`
- `document_template-v0/` (predecessor redundante com `flg-design-system/`)

**Mantido na raiz:** README.md, backend/, frontend/, ai-framework/, scripts/, supabase/, clients/, docs/, docker-compose.yml, .env.example, .github/, .gitignore, .superpowers/.

**Movido:** `flg-design-system/` (que estava na raiz) → `frontend/public/flg-design-system/` (Phase A entrega).

---

## Bugs conhecidos / dívidas técnicas

1. **CI workflow detector usa `git diff HEAD~1`** — só vê último commit. Workaround: `gh workflow run deploy.yml -f force_rebuild=true` quando push de múltiplos commits OU quando deploy não rebuilda backend automaticamente.

2. **Deploy SSH timeouts intermitentes** — fallback em quase todos os pushes recentes: workflow retry via `gh workflow run deploy.yml -f force_rebuild=false`.

3. **VPS sem IPv6** — migrations diretas falham silenciosamente. Aplicar SQL manualmente via Supabase Dashboard SQL Editor. Padrão da repo. Doc: `~/.claude/projects/.../memory/vps_supabase_ipv6_issue.md`.

4. **Mocks têm `**kwargs`** pra ignorar `tipo` graciosamente — quando dar realismo, remover.

5. **PostCard sem embed pra Story** — fallback ok no PostCard.

6. **`list_users()` per_page=200 hardcoded** em `colaboradores_sync.py` e `routes/colaboradores.py` — workspace FLG seguro por muito tempo. Refatorar quando passar de 200 colaboradores.

7. **TOCTOU em PATCH `/colaboradores/{id}`** — `_resolve_caller` lê role uma vez, update roda depois. Janela pequena. Aceito.

8. **Detalhe leak em HTTPException** (`detail=f"Erro: {e}"`) — pre-existing em `notas.py` etc. Pode vazar SQL. Defer.

9. **AppContext encontrosBase não sincroniza em tempo real entre devices** — Realtime do Supabase já está configurado em `AppContext.jsx` (`channel('encontros_base').on('postgres_changes', ...)` dispatches `ENCONTRO_UPDATE`), mas precisa confirmar que está ativo em produção pra Phase A funcionar em multi-admin.

---

## Como recomeçar (próxima sessão)

1. **Lê este arquivo.**

2. **Pergunta pro Pedro:** qual stream priorizar?
   - Métricas V3 → Phase 3B (sub-página todos os posts) ou 3D (polish shadcn/radix)
   - Ranking Tabs → Phase 2 (backend endpoint consultores)
   - Colaboradores → Phase 4 (tela de trocar senha primeiro login + isOwner extraction + polish)
   - **Reuniões da Jornada → Phase C2** (frontend editor split preview/chat streaming consumindo endpoints da C1) **← provável próximo passo**
   - **⚠️ Pendência operacional:** Migration 006 (`encontros_pratica`) ainda não aplicada — Pedro precisa rodar SQL no Supabase Dashboard antes da Phase C1 funcionar end-to-end. Arquivo: `docs/migrations/006-encontros-pratica.sql`.

3. **Workflow padrão:** brainstorming → spec → plan → subagent-driven-development.

4. **Auto mode** está ativo na maioria das sessões — minimize interruptions, prefer action over planning. Mas mantém spec/plan/review gates da subagent-driven-development pra qualidade.

---

## Configurações importantes

- **Trabalha direto em `main`** — não usa worktrees nessa repo.
- **Deploy automático** em cada push pra `main` via `.github/workflows/deploy.yml`. Doc: `.github/AGENTE_DEPLOY.md`. Push direto autorizado (auto mode).
- **Stack:** Backend Python 3 + FastAPI 0.115+ + Pydantic v2.7+ + supabase-py v2.10+ + anthropic SDK + beautifulsoup4. Frontend React 18 + Vite + Tailwind + Framer Motion + Recharts + lucide-react. Postgres (Supabase managed).
- **Validação sem suite de testes:** `python3 -m py_compile <file>` pra Python + `frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx <file>` pra JSX.
- **Logs do backend:** `gh workflow run fetch-logs.yml -f grep="<pattern>" -f lines=<N>` + aguardar e `gh run view <id> --log`.
- **Auth:** Supabase Auth + `user.user_metadata.role` (sincronizado por `colaboradores_sync.py`).
- **AI:** Anthropic Claude — Sonnet 4.6 padrão; Opus 4.7 só quando preciso. Prompt caching ativo (`cache_control:ephemeral`).

## Estrutura de arquivos relevantes

```
backend/
  main.py                              # registra routers; notas migrations 004 (colaboradores), 005 (encontros intelecto)
  deps.py                              # get_current_user, supabase_client
  routes/
    metricas.py                        # endpoints métricas + builders KPI por tipo
    colaboradores.py                   # CRUD com permission matrix + auto-provisioning auth
    encontros_intelecto.py             # GET encontro + POST estrutura/gerar-html/html raw
    reunioes.py                        # ★ NOVO Phase C1: encontros_pratica CRUD + chat SSE + slug
    instagram_oauth.py                 # OAuth + manual sync (?force=true)
    notas.py                           # padrão de rota a mirror
  services/
    instagram.py                       # LiveInstagramRepository.get_historico
    instagram_sync.py                  # self-healing insights + auto-recovery
    colaboradores_sync.py              # sync role DB → auth.users.user_metadata
    claude_html_generator.py           # Claude Sonnet 4.6 + prompt cache do design system + valida HTML
    claude_chat_pratica.py             # ★ NOVO Phase C1: chat consultor↔Claude streaming + gera HTML prática
    meta_oauth.py
    clickup_sync.py
  tools/clickup_tools.py

frontend/src/components/
  Metricas/                            # dashboard sub-rotas (Phase 2 V3)
  Ranking/                             # tabs Clientes/Consultores (Phase 1 Ranking)
  Colaboradores/                       # CRUD UI completo
    index.jsx
    shared/
      constants.js, TierBadge.jsx, RoleBadge.jsx, ColaboradorRow.jsx,
      ColaboradorFormModal.jsx, PasswordRevealModal.jsx
  layout/Sidebar.jsx                   # consultantNav + adminNav + adminOnlyNav
  lib/utils.js                         # isAdmin reconhece owner. isOwner() ainda inline (Phase 4 extrair)
  Materiais/                           # ★ Refactor 2026-05-12: cliente como hub central
    index.jsx                          # MateriaisHome — tela de escolha de cliente + filtro consultor
    ClienteArea/
      index.jsx                        # layout área do cliente (header + abas Diários|Reuniões)
      Diarios.jsx                      # chat materiais + biblioteca (cliente do Outlet)
      Reunioes.jsx                     # grid dos 15 encontros do cliente
    Reuniao/                           # editor split (Phase C2)
      index.jsx
      PreviewIntelecto.jsx
      ChatGerador.jsx
      ActionsBar.jsx
    shared/
      consultor-utils.js               # matchConsultor + isAdminFromSession + listConsultoresFromClientes
      ConsultorFilter.jsx              # tabs Pedro/Lucas/Rebecca/Todos
      ClienteCard.jsx                  # card do cliente na tela de escolha
  admin/IntelecFLG.jsx                 # ★ 5 tabs agora: Conteúdo, Estrutura, HTML, Imagens, Chat

frontend/public/
  flg-design-system/                   # ★ NOVO local (movido da raiz). Nginx serve URLs /flg-design-system/*
    css/flg.css                        # 745 linhas, tokens + componentes
    js/flg-deck.js                     # engine de slides (canvas + setas/swipe)
    templates/deck-template.html, landing-template.html
    FLG-DESIGN-SYSTEM.md, INSTRUCOES-CLAUDE.md, README.md
    assets/logo-flg.png

docs/
  archive/                             # ★ NOVO: planos antigos + document_template-v0
  migrations/                          # SQL evidence files (004 colaboradores, 005 encontros)
  superpowers/specs/                   # specs por feature
  superpowers/plans/                   # plans por phase
  superpowers/HANDOFF-metricas-v3.md   # este arquivo
```
