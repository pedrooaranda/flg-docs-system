# FLG Jornada — Handoff entre sessões

**Última atualização:** 2026-05-27 manhã (Stream 8.2 polish cards ENTREGUE em prod — 8 commits, 70 tests verdes. Próximo sprint: Stream 9 export PDF dos slides de reuniões.)
**Status:** 9 streams ativos. Veja "Como recomeçar" no fim pra próximos passos imediatos.

**Lições aprendidas Streams 6/7 (anti-recorrência):**
1. **Rules of Hooks vs early return:** nunca `if (loading) return <…>` ANTES de useMemo/useEffect declarados depois. `esbuild` valida sintaxe mas NÃO Rules of Hooks — só pega em runtime React. Fix: mover early return pra após todos os hooks. Commit `05cbb0b` documentou.
2. **Migration antes do código:** quando código novo faz SELECT/WHERE em coluna ainda não existente, dá 500 silencioso. Antes de deployar código que depende de migration, CONFIRMAR explicitamente com Pedro que rodou OU bloquear deploy via env check. Causou tela "sem dados" em prod.
3. **Custom field vs status nativo ClickUp:** dropdown SITUAÇÃO no ClickUp é confundível com status NATIVO da task (kanban). Source-of-truth de lifecycle = status nativo. Custom field é info visual. Decisão Pedro 2026-05-27.
4. **Bug `if opt_id and ...`** no `get_custom_field_value` falhava pra orderindex=0 (falsy). Sempre `is not None` quando opt_id pode ser zero. Commit `63352e1`.
5. **Matching sync deve ser híbrido** (clickup_task_id primário, nome normalizado secundário). Match SÓ por task_id criava duplicatas pra clientes manuais. Commit `d368bdd`.
6. **Envs críticos do GH Secrets → .env da VPS via `sync_env_var` no deploy.yml**. Sem isso, force_rebuild zera o env e sync falha silenciosamente (toast `0 archived (0ms)`). Pedro perdeu ~35h investigando isso. Commit `3e0e292` adicionou CLICKUP_API_TOKEN/TEAM_ID/WORKSPACE_ID. Endpoint `/admin/clickup/sync` retorna 503 explícito quando token ausente — nunca mais silencioso. **Setup ops:** todo env novo no `.env.example` precisa entrar nos GH Secrets + deploy.yml `sync_env_var` na mesma PR.

**Política de atualização:** este handoff deve ser atualizado **ao final de cada sprint/fase entregue** (não a cada commit). Quando você termina uma fase, antes de fechar a sessão: invoque `Skill update-handoff` (descrita em `Configurações importantes` no fim) ou edite manualmente a seção do Stream + bump da data no topo.

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

### Meta App Publishing — backend pronto 2026-05-17 (SHA `9c5c009`)

Callbacks obrigatórios da App Review entregues em `backend/routes/meta_callbacks.py`:
- **`POST /api/meta/data-deletion`** — recebe `signed_request`, valida HMAC-SHA256 com `ig_app_secret` (fallback `meta_app_secret`). Localiza `instagram_conexoes` por `instagram_user_id`, marca `status='deletado'`, limpa `access_token`, purga `metricas_diarias_instagram`. Retorna `{url, confirmation_code}` padrão Meta.
- **`GET /api/meta/data-deletion/status/{code}`** — página HTML pública mostrando confirmação de recebimento + prazo 30 dias LGPD. `X-Robots-Tag: noindex`.
- **`POST /api/meta/deauthorize`** — webhook quando user desconecta. Marca `status='desautorizado'` + limpa token. Retorna 200 OK.

Smoke validado: signed_request inválido → 400 (HMAC fail), missing field → 422.

### Painel Meta App Review — progresso 2026-05-17 tarde

Pedro está preenchendo manualmente o submission form no painel developers.facebook.com. Decisões consolidadas:

**Permissões finais (3 cards, removido `instagram_basic` legacy):**
- `instagram_business_basic` — descrição oficial colada no card ① ("identificar conta IG conectada + listar mídias publicadas; pré-requisito das demais permissões")
- `instagram_business_manage_insights` — descrição oficial colada ("popular dashboard de performance: reach/profile_views/follows/demografia agregados + KPIs por publicação/story; consultor usa em encontros mensais pra decisão estratégica de conteúdo")
- `instagram_business_manage_comments` — descrição oficial colada, ênfase em **LEITURA SOMENTE** ("análise qualitativa de sentimento manual + direcionamento de pauta editorial + identificação de fricções; NÃO respondemos/deletamos/ocultamos/moderamos")

Os 3 checkboxes de conformidade marcados. Screencast (~2min) único cobre as 3 permissões e sobe nos 3 cards (mesmo MP4).

**Data Handling Questions form (Tech Provider path):**
- Q1 "Integração pra múltiplos clientes empresariais gerenciarem próprios dados FB?" → ✅ Sim (FLG é SaaS multi-tenant)
- Q2 "Integração em nome de cliente individual?" → ❌ Não

**Operadores/processors declarados (apenas 2, decisão validada via grep):**
1. **Supabase Inc.** — categoria "Para fornecer serviços de jogos ou soluções de TI, incluindo armazenamento e processamento em nuvem". Países: Estados Unidos + região AWS atual (Pedro precisa confirmar via Supabase Dashboard → Settings → General).
2. **Hostinger International Ltd.** — mesma categoria. Países: Brasil + Lituânia (HQ). VPS confirmada via `ipinfo.io 72.61.54.192`: `srv1475950.hstgr.cloud`, AS47583, São Paulo BR.

**Anthropic/Claude NÃO declarado** — validado por `grep "instagram|metric|insights|post|comment|reach|follower"` em `backend/services/` + `backend/prompts/` + `backend/agents/` → resultado vazio. Os prompts Claude (chat-materiais, chat-copywriter, chat-intelecto, gerador de decks, chat-pratica de Reuniões) só recebem dados internos FLG (nome cliente, empresa, tom de voz, intelecto textual). **Caveat futuro:** se algum dia rodar análise de sentimento de comentários IG via Claude ou pedir resumo de performance, voltar nesse formulário e adicionar Anthropic PBC (categoria TI/cloud, EUA).

**Controlador / responsible-1:**
- Founders Led Growth Brazil (Grupo Guglielmi)
- CNPJ: 21.468.097/0001-XX (Pedro vai substituir XX pelos dígitos reais do Cartão CNPJ)
- Endereço: Av. Engenheiro Luís Carlos Berrini, 550 — Sala 08, São Paulo/SP, CEP 04571-000
- DPO: Pedro Aranda — `presidencia@grupoguglielmi.com`
- País (responsible-2): Brasil

**Solicitações de autoridades:**
- requests-3 (forneceu nos últimos 12 meses?): ❌ Não
- requests-4 (processos/políticas): 4 primeiras marcadas (análise legitimidade + contestação ilegais + minimização + registro). NÃO marcar "Nenhuma das opções" nem "Somos proibidos por lei".

**Pendências operacionais restantes (Pedro):**
1. Confirmar região AWS do Supabase no Dashboard (Settings → General) — define se países do Supabase são apenas EUA ou +Brasil/Reino Unido/etc
2. Substituir `XX` do CNPJ pelos dígitos reais
3. Configurar URLs no painel Meta (Privacy/Terms/Data Deletion + callbacks já no backend)
4. Subir App Icon 1024×1024
5. Gravar screencast (~2min) seguindo roteiro definido (Login → Clientes → Métricas → header IG → KPIs+demografia → Posts list → Post detail → Comentários reais → /legal/privacy → Desconectar IG)
6. Subir o MESMO MP4 nos 3 cards de permissão
7. Iniciar Business Verification do Grupo Guglielmi
8. Submeter App Review — Meta responde em 3-14 dias úteis

Prazo total ~2 semanas até modo Live.

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

### Phase 4 (entregue 2026-05-13, em produção, SHA `ad6e67e`)
- **`components/auth/PasswordChangeRequired.jsx`** — tela bloqueante quando `session.user.user_metadata.needs_password_change === true` (flag setada pelo backend auto-provisioning). Email readonly + nova senha + confirmar + validação (8+ chars, ≥1 lower/UPPER/digit). Chama `supabase.auth.updateUser({password, data:{needs_password_change:false}})`. Botão "Sair" via `signOut`.
- **`App.jsx`** — gate condicional: depois de carregar sessão, se `needsPasswordChange(user)` → renderiza só PasswordChangeRequired (sem AppProvider/rotas). Após updateUser, `onAuthStateChange` detecta novo metadata e libera nav automaticamente.
- **`lib/utils.js`** — `isOwner(user)` extraído (match EXATO de email pra fallback, não `includes('pedro')`). `needsPasswordChange(user)` helper.
- **Refactor:** inline `isOwner` derivado em `Colaboradores/index.jsx` agora usa o helper.
- **Yellow nits:** `useCallback` em `loadColaboradores` + dep array do `useEffect` corrigida.
- **Loading skeleton novo:** 5 linhas placeholder com `animate-pulse`, estrutura espelhando a table real (zero layout shift). Substituiu o texto "Carregando colaboradores…".

**Pendente da Phase 4:** mobile responsive (table → cards em telas <768px), `onClose` stable ref via useCallback (yellow nit menor). Não bloqueia uso.

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

---

## Stream 5 — Debriefings Estratégicos (NOVO 2026-05-21)

### Spec aprovada + 6 fases entregues (em produção)

**Objetivo:** time comercial gera debriefing automático do ciclo anterior de um cliente quando ele renova. Backend orquestra extração ClickUp + Google Drive + análise Claude Sonnet 4.6 + render PDF FLG-styled. Cliente seleciona no perfil do cliente (tab Debriefings) ou rota direta `/clientes/:id/debriefings`.

Doc de setup operacional (passos do Pedro pra ativar): [docs/setup/debriefings-setup.md](../setup/debriefings-setup.md).

### Backend (em prod, SHA `25abbcd`)

- **Migration 007** (aguardando aplicação manual): tabela `debriefings` com cliente_id FK, ciclo_numero, periodo, status (gerando/pronto/falhou), markdown_content, pdf_storage_path, audit (tokens, custo USD, num_tasks, num_docs, duracao_s).
- **`backend/prompts/debriefing_prompt.py`** — system + user prompt XML structured. Template Markdown rígido 11 seções. Baseado no prompt v1.0 do Pedro Aranda.
- **`backend/services/google_drive_service.py`** — auth via service account JSON, listagem com filtro folder/nome + janela temporal, export GDoc/Sheet/Slides/PDF, categorização automática por nome. Grace-degraded (sem creds → mensagem + segue).
- **`backend/services/clickup_debriefing.py`** — reusa `list_all_tasks` + `read_clickup_comments`. Filtro temporal (created/updated/closed no período), fallback `find_list_by_name` por workspace_id, formatação agrupada por status. Limita 200 tasks + 20 comments/task.
- **`backend/services/debriefing_generator.py`** — orquestrador 4 fases com callback de progresso. Claude `messages.stream` com `cache_control` no system. Sonnet 4.6, temp 0.3, max 16000 tokens. Captura usage real (input+cache_creation+cache_read+output). Custo USD: $3/M in + $15/M out.
- **`backend/services/debriefing_pdf.py`** — Markdown → HTML (python-markdown) → PDF (WeasyPrint) → Supabase Storage. CSS FLG-branded: fundo claro, Georgia serif H1/H2 com accent gold #C9A84C, tabelas escuras, header/footer paginado. Bucket `debriefings`, `get_signed_url(expires=3600)`.
- **`backend/routes/debriefings.py`** — 5 endpoints:
  - `POST /debriefings` — cria row + BackgroundTasks dispara geração, retorna 202 + id + stream_url
  - `GET /debriefings?cliente_id=X` — lista
  - `GET /debriefings/:id` — detalhe (com markdown_content)
  - `GET /debriefings/:id/stream` — SSE com eventos phase_start/phase_progress/phase_done/error/done. Queue in-memory por debriefing_id.
  - `GET /debriefings/:id/pdf` — retorna signed_url do Storage
- **Deps novas** (instaladas no rebuild): `google-api-python-client>=2.140.0`, `google-auth>=2.34.0`, `markdown>=3.6`. WeasyPrint já estava.

### Frontend (em prod, SHA `9ecc7c7`)

- **`Debriefings/index.jsx`** (Hub) — header com gradiente + counter status + botão "Novo Debriefing". Cards listando ciclos com status badge (gerando/pronto/falhou), grid metrics (tasks, docs, custo USD). Click "gerando" → StreamPanel; click "pronto" → Viewer route.
- **`Debriefings/NovoDebriefingModal.jsx`** — form com ciclo auto-sugerido (max+1), período default últimos 6 meses, clickup_list_id e drive_folder_id opcionais. POST + onCreated dispara stream.
- **`Debriefings/StreamPanel.jsx`** — SSE via novo helper `apiStreamGet` (fetch + ReadableStream pq EventSource nativa não suporta Authorization header). 4 fases listadas com Loader2 animado, info extra (tasks, docs, tokens) quando phase_done emite.
- **`Debriefings/Viewer.jsx`** — render Markdown via parser regex inline (sem dep externa). Header com metrics (custo, duração, tokens, tasks, docs). Botão "Baixar PDF" → fetch signed_url → window.open.
- **`PerfilCliente.jsx`** — nova tab "Debriefings" embutindo o hub inline.
- **Rotas** em `App.jsx`: `/clientes/:clientId/debriefings` + `/clientes/:clientId/debriefings/:debriefingId`.
- **`lib/api.js`** — novo `apiStreamGet(path, onEvent, signal)` pra SSE com auth.

### Pendências operacionais (Pedro) — RESOLVIDAS em 2026-05-26

1. ✅ Migration 007 aplicada
2. ✅ Bucket `debriefings` criado
3. ✅ Service account `flg-debriefings-reader@flg-debriefings.iam.gserviceaccount.com` criado, JSON key gerada (path-based via volume mount), pasta `BUSINESS STRATEGISTS` compartilhada
4. ✅ `CLICKUP_WORKSPACE_ID` configurado
5. ⏳ Meta App Review pendente (não bloqueia smoke test)

### Phase 6.1 — Drive ciclo-aware + RELATÓRIO + setores + perspectiva consultor (entregue 2026-05-26)

- Cliente↔Drive matching agressivo (normalização sem espaços/separadores) — DB `LEONARDOSOUZA` ↔ Drive `LEONARDO SOUZA | BS`
- Resolução de ciclo via parse `CICLO | YYYY.X` (não createdTime, que era unreliable)
- Frontend: botões dinâmicos `CICLO 01 (jul-dez 2025)` baseados em `periodo_humano` do backend
- Setor counts em `09. ENTREGAS` (DESIGN/COPY/AUDIOVISUAL)
- Perspectiva do consultor (texto inline OU arquivo md/pdf/docx via Docling) — migration 008 + multipart upload
- UPSERT em `_insert_debriefing` (regenerar sobrescreve em vez de quebrar constraint)
- Modal backdrop sólido (`rgba(8,8,10,0.88)` + blur)

### Phase 6.2 — Bugs estruturais do pipeline de extração (entregue 2026-05-26)

**Sintoma:** primeiro debriefing real do Leonardo Ciclo 1 saiu com "Não documentado" em ~80% das seções, mesmo com docs claros no Drive e 15 encontros no Relatório Estratégico. Investigação direta no código (sem precisar de logs run-time) identificou 4 bugs compostos:

| Bug | Local | Fix | Commit |
|---|---|---|---|
| **#1** Drive lia só nomes de pastas (não conteúdo dos docs estratégicos) | `google_drive_service.py` | `extract_strategic_docs_content`: walk recursivo lê GDocs/Slides/Sheets/.docx/PDFs/.txt das subpastas 01-08; skip imagens/vídeos por extensão; cap 40 docs × 8k chars + 5 PDFs via docling | `c82eabf` |
| **#2** ClickUp filtrava por janela temporal mesmo com lista já dedicada `[CLIENTE \| CICLO0N]` | `clickup_debriefing.py` | Remove `_within_period`; adiciona `list_archived_tasks` (chamada separada com `archived=true`); dedup por id | `c82eabf` |
| **#6** `.xlsx` (Excel upload) caía em "Tipo MIME não suportado" — RELATÓRIO ESTRATÉGICO do Leonardo é xlsx | `google_drive_service.py` + `requirements.txt` | Adiciona `openpyxl`; novo `extract_xlsx_all_sheets` lê TODAS as abas; suporte a .xlsx + .docx + PDF tanto no relatório quanto na extração funda | `29918e9` |
| **#4** Google Sheet nativo usava `_export_gsheet` que pega só 1ª aba | `google_drive_service.py` | Trocar por `extract_sheet_all_tabs` (Sheets API v4) | `29918e9` |

**Plus:**
- Guard antivazio em `run_debriefing`: aborta com erro claro se ambas extrações vierem 0 (não queima Claude gerando "Não documentado")
- Observabilidade: persist `clickup_data` + `drive_data` brutos em `Storage/debriefings/debug/{id}/{clickup,drive}.txt` pra pós-mortem
- CI `command_timeout` 10m→25m (build com docling/torch/openpyxl + export layers passa de 12 min consistente) — `a47759d`

Investigação confirmada via MCP Google Drive: arquivo é `LEONARDO SOUZA | BS | Relatório Estratégico` em `CICLO | 2025.2 / 09. ENTREGAS`, mime `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, 15+ encontros com data/nome/descrição/link de gravação.

### Custo projetado

- API Anthropic Sonnet 4.6: R$3-12 por debriefing
- 30 renovações/mês: ~R$90-360/mês total

### Próximos passos

- ⏳ Pedro re-testa debriefing do Leonardo Ciclo 1 (DELETE SQL da row órfã já enviado; UPSERT cobre se duplicate)
- Validar Markdown quality, PDF render, custo real
- Atualizar Meta App Review com Anthropic, PBC (categoria TI/cloud, EUA)
- (Futuro) Phase 7 multi-agent refactor — research e plano consolidados em [HANDOFF-debriefings.md](HANDOFF-debriefings.md) (seção 4)

---

---

## Stream 7 — ClickUp sync + soft delete (ENTREGUE 2026-05-26 noite)

### Objetivo

ClickUp é source-of-truth do ciclo de vida do cliente. Sistema FLG arquiva (soft delete) clientes com status terminal e mantém visíveis apenas ativos+pausados+em encerramento.

### Decisões aprovadas

- **Archive** (sai do display): SITUAÇÃO ∈ {encerrado, renovado, inativo}
- **Mantém visível com badge**: pausado, em pausa
- **Mantém visível normal**: em encerramento (transitório), ativo, indo bem, normal, etc.
- **Soft delete via `archived_at TIMESTAMPTZ`**: preserva FKs (encontros, metricas, debriefings); reversível se ClickUp voltar status

Spec: [specs/2026-05-26-clickup-sync-archived-design.md](specs/2026-05-26-clickup-sync-archived-design.md). Plano: [plans/2026-05-26-clickup-sync-archived.md](plans/2026-05-26-clickup-sync-archived.md).

### Migration 010 aplicada pelo Pedro

`clientes.archived_at TIMESTAMPTZ NULL` + index parcial.

### Backend — 4 commits, 60 tests verdes

| SHA | Task | Entrega |
|---|---|---|
| `0b58029` | 1 | `evaluate_lifecycle(situacao_raw) → (status_db, should_archive)` puro — 21 tests parametrizados |
| `c90aae0` | 2 | `run_clickup_sync` ampliado: archive/reactivate + stats `{archived, reactivated, paused, ativos, errors, total, duration_ms}` |
| `a75c8e5` | 3 | `GET /clientes` + `GET /metricas/ranking` filtram `archived_at IS NULL` por default; admin pode `?include_archived=true` |
| `00ecf54` | 4 | `POST /admin/clickup/sync` — trigger manual admin only, retorna stats |

### Frontend — 1 commit

| SHA | Task | Entrega |
|---|---|---|
| `5712c3a` | 5 | `Clientes.jsx` — botão "Sync ClickUp" no header (admin), toast com stats, filtros sem "Inativos" (archived sai automaticamente), Badge Pausado já existente |

### Status final (2026-05-27 madrugada): FUNCIONANDO ✅

Sync ClickUp confirmado funcional após reset estrutural completo:
- Matching híbrido (task_id → nome normalizado → insert)
- UPDATE explícito de TODOS campos (encontro_atual, consultor_responsavel, status, etc)
- Source-of-truth = status NATIVO da task (não custom field SITUAÇÃO)
- Endpoint `/admin/clickup/sync` retorna 503 explícito se token ausente
- Endpoint `/admin/clickup/diagnose?nome=X` pra debug cirúrgico

Commits finais Stream 7: `d368bdd` (reset estrutural), `3e0e292` (deploy.yml sync envs).

### Setup ops (uma vez por máquina/conta)

GH Secrets necessários (deploy.yml sync_env_var):
- `CLICKUP_API_TOKEN` ✅ (configurado 2026-05-27)
- `CLICKUP_TEAM_ID` (opcional, default 9013791877)
- `CLICKUP_WORKSPACE_ID` (opcional)
- `IG_APP_ID`, `IG_APP_SECRET` (já existiam)

---

## Stream 8.1 — ConsultorFilter universal (ENTREGUE 2026-05-27)

ConsultorFilter (tabs pill "Todos · Pedro · Lucas · Rebecca · …") padronizado em TODAS telas com filtro consultor. Antes vivia em `Materiais/shared/`, agora em `components/ui/` compartilhado.

Spec: [specs/2026-05-26-consultor-filter-universal-design.md](specs/2026-05-26-consultor-filter-universal-design.md). Plano: [plans/2026-05-26-consultor-filter-universal.md](plans/2026-05-26-consultor-filter-universal.md).

Commits: `d5fe61d` (lib/consultores.js), `a8f2f3f` (ui/ConsultorFilter), `26d72cb` (Dashboard+Materiais imports), `c9d2872` (Clientes.jsx adoption).

### Stream 8.2 — Polish Clientes (ENTREGUE 2026-05-27)

Spec: [specs/2026-05-27-polish-clientes-design.md](specs/2026-05-27-polish-clientes-design.md). Plano: [plans/2026-05-27-polish-clientes.md](plans/2026-05-27-polish-clientes.md).

8 commits (6e230c1..7a20005). Backend: endpoint `GET /clientes-summary` agrega métricas IG inline (4 tests). Frontend: ClientCard novo (clicável, status semáforo verde/amarelo/vermelho, métricas inline, hover lift + gold shadow, tap feedback), ClientCardSkeleton (zero CLS), EmptyClientes (3 variantes: no_results/empty/error), useClientesSummary hook, humanize-date helper, AnimatePresence pros filtros.

**Bug fix pós-deploy:** path original `/clientes/summary` conflitava com `/clientes/{id}` no routing FastAPI (Postgres castava "summary" como UUID). Fix: trocou pra `/clientes-summary` (hífen) em commit `7a20005`.

### Streams 8.3-8.4 pendentes (polish UI restante)

- **8.3 Polish Métricas:** ConsultorFilter padrão + skeletons + handle 403 ilustrado.
- **8.4 Polish Ranking + Dashboard:** mesmo padrão.

### Stream 9 — Export PDF dos slides (FILA 2026-05-27)

Pedro pediu próximo sprint após cards. Reuniões da Jornada tem HTML deck gerado via Claude + design system FLG, servido em `/apresentar/:slug` pra apresentação fullscreen. Falta gerar PDF do deck pra download/distribuição.

Decisões pendentes (brainstorming):
- Aspect ratio: 16:9 slide (1920×1080) ou A4 retrato?
- Engine: WeasyPrint (já instalado) ou Chrome headless?
- Trigger: botão no editor de reunião OU botão no `/apresentar/:slug`?
- Destino: download do usuário, anexar ao cliente em Storage, ou ambos?

Skill auxiliar disponível: `export-pdf` (Claude Code, pipeline HTML→PDF via Chrome headless já configurado pra outros projetos do Pedro).

---

## Infraestrutura de manutenção (NOVO 2026-05-27)

### Workflows GH Actions agendados

| Workflow | Schedule | Função |
|---|---|---|
| `clickup-sync-daily.yml` | Diário 06:00 BRT (09:00 UTC) | POST `/admin/clickup/sync` via `X-Cron-Token` header. Falha + cria issue se `duration_ms<=0` (env missing) ou HTTP != 200. |
| `integrations-health-weekly.yml` | Segundas 09:00 BRT (12:00 UTC) | Health endpoint + sync teste + inventário GH Secrets esperados. Falha + cria issue se algo errado. |

Endpoint `/admin/clickup/sync` aceita 2 modos de auth:
- `Authorization: Bearer <JWT>` (admin via UI)
- `X-Cron-Token: <CRON_SHARED_SECRET>` (workflow cron — bypass de admin gate)

Resposta inclui `_diagnostico.triggered_by` ("admin_ui" | "cron") + `token_configured`.

### Setup ops adicional

GH Secret necessário pra cron funcionar:
- `CRON_SHARED_SECRET` — string aleatória, qualquer valor seguro (ex: `openssl rand -hex 32`)

Adicionar via UI ou `gh secret set CRON_SHARED_SECRET`.

Deploy.yml sincroniza esse secret pro `.env` da VPS junto com CLICKUP_API_TOKEN.

### Skill maintain-integrations

`~/.claude/skills/maintain-integrations/SKILL.md` — checklist + comandos pra diagnose de integrações (ClickUp, Drive, Meta, Anthropic, Supabase, VPS). Use quando algo aparenta degradação OU em rotina semanal manual antes do workflow rodar.

---

## Stream 6 — Permissionamento por consultor (ENTREGUE 2026-05-26 noite)

### Objetivo

Substituir filtro client-side por email-split (frágil, contornável via DevTools) por **enforcement de backend** nas telas Clientes e Métricas:
- **Consultor** vê só seus clientes (`WHERE consultor_id = me.id`)
- **Admin/owner OU categoria=diretor** vê todos com filtro ConsultorFilter ativo
- Bloqueio 403 em endpoints individuais quando consultor tenta acessar cliente alheio

Spec: [specs/2026-05-26-permissao-consultor-design.md](specs/2026-05-26-permissao-consultor-design.md). Plano: [plans/2026-05-26-permissao-consultor.md](plans/2026-05-26-permissao-consultor.md).

### Migration 009 aplicada pelo Pedro

Stats backfill: 42/65 clientes batidos automaticamente (64.6%), 23 órfãos com `consultor_id=NULL` pendentes reatribuição manual. Função PL/pgSQL `_normalize_consultor_name` espelha JS matchConsultor.

### Backend — 5 commits, 29/29 testes verdes

| SHA | Task | Entrega |
|---|---|---|
| `80a969c` | 1 | pytest setup (primeira suite da repo) + fixtures + conftest com sys.modules stubs pra rodar sem fastapi/supabase local |
| `8e2ae8e` | 2 | `backend/lib/auth_scope.py` — UserScope frozen dataclass + get_user_scope dependency (TDD, 6 tests) |
| `9388d7d` | 3 | `backend/routes/me.py` — endpoint GET /me/scope serializa UserScope pro frontend |
| `0797315` | 4 | Filtros em /clientes (list+get+post+patch) — 14 tests cobrindo consultor/admin/edge cases |
| `5112d08` | 5 | Filtros em /metricas/ranking + 403 em /metricas/{id}/overview (6 tests) |

Regra autoritativa única em `lib/auth_scope.py`:
```
can_see_all = (categoria == 'diretor') OR (role IN ('owner', 'admin'))
```

### Frontend — 5 commits

| SHA | Task | Entrega |
|---|---|---|
| `232ab8b` | 6 | `frontend/src/hooks/useUserScope.js` — chama GET /me/scope, fail-safe restritivo em erro |
| `62f4a41` | 7 | `Clientes.jsx` — usa hook, remove filtro client-side por email-split, ConsultorFilter condicional, header "Meus" vs "Todos" |
| `4938742` | 8 | `Metricas/MetricasGeral.jsx` — handle 403 com empty state + botão Voltar |
| `26d1ef1` | 9 | `Dashboard.jsx` — usa hook, remove 32 linhas de duplicação (`findMyConsultorName` local) |
| `b517f9b` | 10 | `NovoCliente.jsx` — select de colaboradores condicional (admin), input readonly pra consultor regular |

### Ressalvas registradas pra hardening futuro (Stream 6.1, não bloqueantes)

1. **Supabase Realtime bypassa scope.** `AppContext.jsx:82-88` subscreve `postgres_changes` em `clientes` sem filtro. Consultor regular pode receber updates de clientes alheios em tempo real (vaza nome/empresa na UI). Backend BLOQUEIA qualquer ação — só vaza display. Fix: `filter: \`consultor_id=eq.${myConsultorId}\`` na subscription.

2. **Sub-endpoints /metricas/{id}/historico|posts|horarios|demografia sem scope.** Apenas `Depends(get_current_user)`. Spec não listou; 403 no /overview bloqueia fluxo UI natural. Acesso direto via API permanece não-guardado. Fix trivial: espelha lógica de `get_overview`.

### Pendências pós-deploy (Pedro)

1. ⏳ Reatribuir os 23 órfãos do backfill (UI Task 10 já em prod permite isso)
2. ⏳ Smoke test end-to-end:
   - Como consultor → `/clientes` mostra só os seus, dropdown escondido, header "Meus Clientes"
   - Tentar `/metricas/{id_alheio}/overview` direto → "Sem acesso" + botão Voltar
   - Como Pedro/admin → dropdown ConsultorFilter ativo, vê todos, filtra
   - Criar cliente como consultor → consultor_id forçado pro self (backend enforça)

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

1. **Lê este arquivo PRIMEIRO.** Bump da data no topo indica até onde está atualizado.

2. **Estados em curso (2026-05-26):**

   - **Stream 5 Debriefings — smoke test pendente.** Bugs estruturais foram corridos (commits `c82eabf`, `29918e9`, `a47759d`). Pedro precisa: (a) rodar SQL de limpeza pra row órfã do teste anterior (`DELETE FROM debriefings WHERE cliente_id='049caf8f-6fe9-4153-b995-9d9d225071e7' AND ciclo_numero=1;`); (b) regerar debriefing do Leonardo Ciclo 1 pela UI; (c) se algo estranho, baixar `Storage/debriefings/debug/{debriefing_id}/{clickup,drive}.txt` pra inspecionar o que Claude recebeu. UPSERT cobre re-geração sem precisar limpar SQL.

   - **Stream 6 Permissionamento — ENTREGUE em prod 2026-05-26 noite.** Pedro precisa: (a) reatribuir 23 órfãos do backfill via UI (Task 10 já permite isso pelo NovoCliente.jsx); (b) smoke test end-to-end (logar como consultor não-admin + como admin pra confirmar filtros).

   - **Stream 7 ClickUp sync — FILA.** Pedido novo do Pedro: agente que lê status dos clientes no ClickUp e remove inativos/encerrados do sistema, mantém pausados com tag. Quando rodar, resolve maioria dos 23 órfãos automaticamente. Aguardando brainstorming.

   - **Stream 1 Meta App Publishing:** Pedro estava preenchendo submission form. Pendências: confirmar região AWS Supabase, gravar screencast 2min, Business Verification Grupo Guglielmi.

3. **Outros streams disponíveis (se Pedro mudar prioridade):**
   - Métricas V3 → Phase 3B (sub-página todos os posts) ou 3D (polish shadcn/radix)
   - Ranking Tabs → Phase 2 (backend endpoint consultores)
   - Reuniões da Jornada → Phase E polish (regerar slide N, copy URL, mobile, Traefik /apresentar/* sem /api/)
   - Colaboradores → mobile responsive (último item pendente da Phase 4)
   - Debriefings → Phase 7 multi-agent refactor (research pronto em HANDOFF-debriefings.md seção 4)

4. **Workflow padrão (OBRIGATÓRIO):** `superpowers:brainstorming` → spec → `superpowers:writing-plans` → `superpowers:subagent-driven-development`. NÃO pular pra implementação sem passar pelo brainstorming.

5. **Auto mode** está ativo na maioria das sessões — minimize interruptions, prefer action over planning. Mas mantém spec/plan/review gates da subagent-driven-development pra qualidade.

6. **Ao terminar uma sprint/fase entregue:** atualize este handoff (data no topo + nova seção/sub-seção do stream) ANTES de fechar a sessão. Política em "Configurações importantes" abaixo.

---

## Configurações importantes

- **Trabalha direto em `main`** — não usa worktrees nessa repo.
- **Deploy automático** em cada push pra `main` via `.github/workflows/deploy.yml`. Doc: `.github/AGENTE_DEPLOY.md`. Push direto autorizado (auto mode). `command_timeout` está em 25min (build com docling/torch passa de 12min).
- **Stack:** Backend Python 3 + FastAPI 0.115+ + Pydantic v2.7+ + supabase-py v2.10+ + anthropic SDK + beautifulsoup4 + openpyxl + docling. Frontend React 18 + Vite + Tailwind + Framer Motion + Recharts + lucide-react. Postgres (Supabase managed).
- **Validação sem suite de testes:** `python3 -m py_compile <file>` pra Python + `frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx <file>` pra JSX.
- **Logs do backend:** `gh workflow run fetch-logs.yml -f grep="<pattern>" -f lines=<N>` + aguardar e `gh run view <id> --log`.
- **Auth:** Supabase Auth + `user.user_metadata.role` (sincronizado por `colaboradores_sync.py`).
- **AI:** Anthropic Claude — Sonnet 4.6 padrão; Opus 4.7 só quando preciso. Prompt caching ativo (`cache_control:ephemeral`).

### Política de atualização deste handoff

**Quando atualizar:** ao final de cada **sprint/fase entregue em produção** (não a cada commit). Sinal claro: você acabou de fazer push do último commit da fase E confirmou que o deploy passou.

**Como atualizar:**
1. Bump da data no header (`Última atualização: YYYY-MM-DD`)
2. Edita a seção do stream afetado (adiciona Phase X.Y entregue ou atualiza pendências)
3. Se for stream novo, adiciona Stream N na ordem
4. Se houve mudança operacional importante (timeout, deps, secrets), atualiza essa seção
5. Atualiza "Como recomeçar" se o próximo passo mudou

**Lembrete prático:** quando você terminar uma sprint, antes de fechar a sessão pergunte "atualizei o handoff?" — se não, faça antes do user fechar o terminal.

**Skill auxiliar:** `Skill update-handoff` (em `~/.claude/skills/update-handoff/SKILL.md`) — invoca pra orientação rápida. Skill não escreve por você; lembra os passos.

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
