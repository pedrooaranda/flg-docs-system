# FLG Jornada — Handoff entre sessões

**Última atualização:** 2026-05-11 (sessão Métricas V3 + Ranking Tabs + Colaboradores)
**Status:** 3 streams ativos. Métricas V3 Phases 1+2+3 entregues. Ranking Tabs Phase 1 entregue (5 phases restantes). Colaboradores Phase 1 backend entregue (3 phases frontend restantes).

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

### Hotfix crítico 2026-05-08 — Meta API deprecou métricas (NÃO está nos specs originais)

Meta API deprecou em **2025-04-21** múltiplas métricas pra TODAS as versões:
- `impressions` (FEED, STORY) → substituído por `views`
- `plays` (REELS) → substituído por `views`
- `clips_replays_count`, `ig_reels_aggregated_all_plays_count` → mortas
- `taps_forward`/`taps_back`/`exits` standalone (STORY) → agora só via `navigation` com breakdown `story_navigation_action_type`

**Resultado do bug:** FEED/REELS/STORY apareciam todos com `engagement_rate=NULL` e `0% eng.` no UI desde abr/2025. Tudo silencioso porque o fallback "SAFE" também continha métricas mortas.

**Fix arquitetural entregue ([commit `c0baa6e`](https://github.com/pedrooaranda/flg-docs-system/commit/c0baa6e), `073881d`):**
- `_fetch_post_insights` agora é **self-healing**: pede lista preferida → se 400, parseia erro pra identificar métrica rejeitada → dropa → retenta. Futuras deprecações da Meta se ajustam sozinhas. Variant agora é `full|partial|minimal|failed`.
- Métricas atualizadas: FEED=`reach,saved,shares,total_interactions,views,profile_visits,follows`; REELS=mesmo + `ig_reels_video_view_total_time,ig_reels_avg_watch_time`; STORY=`reach,replies,shares,total_interactions,views,navigation`.
- **`likes`/`comments` NUNCA mais via insights** — vêm direto de `like_count`/`comments_count` do objeto media (mais barato + sem risco de deprecação).
- `_build_post_row`: `views` → `impressions` (FEED/STORY) e `views` → `plays` (REELS) pra preservar colunas existentes.
- STORY ganha 2ª chamada com `breakdown=story_navigation_action_type` pra extrair `taps_forward/back/exits` do `navigation`. Map em `_STORY_NAV_ACTION_TO_FIELD`.
- **Auto-recovery**: posts finalizados com `engagement_rate=NULL` E `likes>0` (sinal de insights quebrados historicamente) são re-fetchados automaticamente. Cap em `MAX_AUTO_RECOVERIES_PER_SYNC=40` pra respeitar rate limit Meta.
- `force_refresh=True` em `sync_cliente` + endpoint `POST /instagram/oauth/sync/{cid}?force=true` pra re-pagina 90 dias inteiros (rate-limit-aware).
- Diagnóstico ampliado: `_sync_posts` e `_sync_stories` reportam `insights_{full,partial,minimal,failed}` counters + `auto_recovered`.

**Status produção:** Letícia validada — sync `full=1` em FEED (1 post novo), stories `full=4` (4 stories ativos). Posts antigos (>30d) requerem `?force=true` pra repopular. Phase de auto-recovery deve cuidar de novos clientes que entrarem com dados quebrados.

---

## Stream 2 — Ranking Tabs (Clientes / Consultores)

### Spec aprovada + Phase 1 entregue
**Objetivo:** dividir tela `/ranking` em duas abas — **Clientes** (UX atual preservada) e **Consultores** (nova, comprehensive com pódio + troféus + atenção operacional + tabela com drill-down + integração ClickUp tasks + materiais_copy entregues).

Spec: [docs/superpowers/specs/2026-05-10-ranking-tabs-consultores-design.md](specs/2026-05-10-ranking-tabs-consultores-design.md).

### Phase 1 (entregue 2026-05-10, em produção)
Refactor estrutural do `Ranking.jsx` (722 linhas) em pasta:
```
frontend/src/components/Ranking/
  index.jsx                  — layout + tabs + URL ?tab= + fetch
  RankingClientes.jsx        — UX atual extraída (Atenção Master + Troféus + Pódio + Tabela + Consultores do mês)
  RankingConsultores.jsx     — stub "Em construção"
  shared/
    AtencaoMasterCard.jsx
    DestaqueCard.jsx          — agora aceita prop `getDisplayInfo(item)` pra reuso na aba Consultores
    PodiumCard.jsx            — agora aceita prop `metricsRender(item)` pra reuso
    RankRow.jsx
    ConsultorCard.jsx
    formatters.js             — formatCompact + severidadeAtencao
    constants.js              — GOLD + CATEGORIAS
```
Plan: [plans/2026-05-10-ranking-tabs-phase1.md](plans/2026-05-10-ranking-tabs-phase1.md).
Spec compliance ✅ + Code quality ✅. SHA produção `0b35f4a`.

### Phases 2-6 — não planejadas ainda (escopo no spec)
| Phase | Escopo | Estimativa |
|---|---|---|
| 2 | Backend `GET /metricas/ranking-consultores` (eng/audiência/crescimento agregados + clientes_em_crise por consultor) | ~3h |
| 3 | UI aba Consultores — pódio top 3, troféus (3 de 4, "Volume de Entregas" stub), atenção operacional, tabela com drill-down expandível inline | ~5h |
| 4 | Integração ClickUp — count tasks closed (subtasks do `LIST_CLIENTES_BS` com `status.type=="closed"`) por consultor + cache 5min in-memory + fallback gracioso | ~3h |
| 5 | Integração Materiais — count `materiais_copy` por consultor + ativa 4º troféu "Volume de Entregas" composite (tasks_closed + docs) | ~2h |
| 6 | Polish — loading skeletons, empty states, responsive, smoke prod | ~2h |

**Próximo passo concreto:** brainstormar/planejar Phase 2 (backend endpoint) — antes não tinha plan dela.

---

## Stream 3 — Colaboradores

### Spec aprovada + Phase 1 backend entregue
**Objetivo:** nova aba `/colaboradores` (abaixo de "Copywriter FLG" na sidebar) com gestão hierárquica de operadores. Separação ortogonal: identidade (email/nome) + categoria (`consultor`|`diretor`) + cargo (texto livre) + tier (`junior`|`pleno`|`senior`|`lead`) + role (`owner`|`admin`|`member`).

Spec: [specs/2026-05-10-colaboradores-design.md](specs/2026-05-10-colaboradores-design.md).

### Phase 1 backend (entregue 2026-05-11, em produção)
- **Migration 004 aplicada manualmente** no Supabase Dashboard (VPS sem IPv6, padrão da repo). Tabela `colaboradores` com schema completo + RLS SELECT-only (writes via service role bypassam) + Pedro seeded como `owner` + `auth.users.user_metadata.role='owner'` pra Pedro. Doc de evidência: [docs/migrations/004-colaboradores.sql](../migrations/004-colaboradores.sql).
- **`backend/services/colaboradores_sync.py`**: `sync_role_to_auth_metadata(supabase, email, role)` — espelha role DB → `auth.users.user_metadata.role`. Usa `list_users(page=1, per_page=200)` (verificado contra docs supabase-py v2.10+).
- **`backend/routes/colaboradores.py`**: 6 endpoints (GET list, GET /me, GET /{id}, POST, PATCH, DELETE soft) com **permission matrix completa**:
  - `OWNER_FALLBACK_EMAILS = {"pedroaranda@grupoguglielmi.com"}` — match exato (não substring) pra fallback se registro do Pedro for deletado por engano.
  - `_resolve_caller` filtra `ativo=true` — soft-deleted = sem privilégios (security fix do code review).
  - Promoção/rebaixamento de `owner` só por outro owner.
  - Member só edita próprio registro, apenas `SELF_EDITABLE_FIELDS = {nome, cargo, avatar_url}`.
  - DELETE bloqueia auto-desativação.
  - Email validado via regex local `_EMAIL_RE` (sem dep extra `email-validator`).
  - POST verifica que email existe em `auth.users` antes de criar (evita registro órfão); falha logada como ERROR (não warning silencioso).
- **`backend/main.py`**: router registrado + comment marcando migration 004 manual.

Plan: [plans/2026-05-10-colaboradores-phase1.md](plans/2026-05-10-colaboradores-phase1.md) (revisado pós-auto-análise vs docs Maio/2026).

**Spec compliance ✅ + Code quality ✅** (com 4 fixes de hardening aplicados: ativo-filter, error logging, email normalize, unused import). SHA produção `ef1f820`.

**Smoke test backend:** `curl /api/colaboradores` (sem auth) retorna HTTP 422 (auth header obrigatório) → confirma rota registrada. Smoke autenticado pelo Pedro: pendente (Pedro precisa rodar fetch no console com `allow pasting` ativado).

### Phases 2-5 — pendentes (não planejadas ainda)
| Phase | Escopo | Estimativa |
|---|---|---|
| 2 | Frontend pasta `Colaboradores/` + rota + sidebar entry (abaixo de Copywriter FLG, ícone `UserCog`) + tabs Consultores/Diretores (URL `?tab=`) + tabela read-only consumindo `GET /colaboradores` | ~3h |
| 3 | Modal criar/editar + permissões UI (botões condicionais por role) + badges (TierBadge, RoleBadge) + filtros (busca, tier, só admins) | ~4h |
| 4 | Polish — empty states, loading, responsive, `isOwner()` helper em `frontend/src/lib/utils.js`, ajustar `isAdmin()` legacy fallback pra incluir 'owner' | ~2h |
| 5 (opcional) | Botão "Sync ClickUp" — popula iniciais via `clickup_get_workspace_members` | ~2h |

**Próximo passo concreto:** Phase 2 plan + implementação.

---

## Bugs conhecidos / dívidas técnicas

1. **CI workflow detector usa `git diff HEAD~1`** — só vê último commit. Workaround: `gh workflow run deploy.yml -f force_rebuild=true` quando push de múltiplos commits.

2. **VPS sem IPv6** — migrations diretas (`_apply_migration_003/004`) falham silenciosamente. Aplicar SQL manualmente via Supabase Dashboard SQL Editor. Padrão da repo. Doc: `~/.claude/projects/.../memory/vps_supabase_ipv6_issue.md`.

3. **Mocks têm `**kwargs`** pra ignorar `tipo` graciosamente — quando dar realismo aos mocks por tipo (Phase futura), remover.

4. **PostCard sem embed pra Story** — Stories não têm embed público IG. Já tem fallback no PostCard.

5. **`list_users()` per_page=200 hardcoded** em `colaboradores_sync.py` e `routes/colaboradores.py` — workspace FLG (dezenas de users) é seguro por muito tempo. Quando passar de 200 colaboradores no Auth, refatorar pra paginação real ou cache `auth_user_id` na tabela `colaboradores`.

6. **TOCTOU em PATCH `/colaboradores/{id}`** — `_resolve_caller` lê role uma vez, update roda depois. Janela pequena. Aceito; pre-existing pattern.

7. **Detalhe leak em HTTPException** (`detail=f"Erro: {e}"`) — pre-existing em `notas.py` etc. Pode vazar SQL em erros. Defer.

---

## Como recomeçar (próxima sessão)

1. **Lê este arquivo.**
2. **Pergunta pro Pedro:** qual stream priorizar?
   - Métricas V3 → Phase 3B (sub-página todos os posts) ou 3D (polish shadcn)
   - Ranking Tabs → Phase 2 (backend endpoint consultores)
   - Colaboradores → Phase 2 (frontend skeleton + sidebar entry)
3. **Pendência crítica antes de tudo:** **smoke test do backend Colaboradores** — Pedro ainda não confirmou que `GET /api/colaboradores` retorna ele como owner com sessão autenticada. Sem isso, Phase 2 Colaboradores pode estar partindo de premissa errada. Cole no Console (com `allow pasting` ativado):
   ```js
   fetch('/api/colaboradores', {credentials:'include'}).then(r=>r.json()).then(console.log)
   ```
   Esperado: 1 colaborador (Pedro) com `role:"owner"`.
4. **Workflow:** brainstorming → spec → plan → subagent-driven-development.
5. **Visual Companion:** reusa server se vivo em `.superpowers/brainstorm/<sessão>/state/server-info`.

---

## Configurações importantes

- **Trabalha direto em `main`** — não usa worktrees nessa repo.
- **Deploy automático** em cada push pra `main` via `.github/workflows/deploy.yml`. Doc: `.github/AGENTE_DEPLOY.md`.
- **Stack:** Backend Python 3 + FastAPI 0.115+ + Pydantic v2.7+ + supabase-py v2.10+ + Postgres (Supabase managed). Frontend React 18 + Vite + Tailwind + Framer Motion + Recharts.
- **Validação sem suite de testes:** `python3 -m py_compile <file>` pra Python + `frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx <file>` pra JSX.
- **Logs do backend:** `gh workflow run fetch-logs.yml -f grep="<pattern>" -f lines=<N>` + aguardar e `gh run view <id> --log`.
- **Auth:** Supabase Auth + `user.user_metadata.role` (sincronizado por `colaboradores_sync.py` na Phase 1 entregue).

## Estrutura de arquivos relevantes

```
backend/
  main.py                              # registra routers; nota migration 004 manual
  deps.py                              # get_current_user, supabase_client
  routes/
    metricas.py                        # endpoints métricas + builders KPI por tipo
    colaboradores.py                   # ★ NOVO: CRUD colaboradores com permission matrix
    instagram_oauth.py                 # OAuth + manual sync (?force=true)
    notas.py                           # padrão de rota a mirror
  services/
    instagram.py                       # LiveInstagramRepository.get_historico
    instagram_sync.py                  # ★ ATUALIZADO: self-healing insights + auto-recovery
    colaboradores_sync.py              # ★ NOVO: sync role DB→auth.users.user_metadata
    meta_oauth.py                      # Instagram Business Login OAuth
    clickup_sync.py                    # importa clientes da LIST_CLIENTES_BS
  tools/clickup_tools.py               # list_all_tasks (subtasks=true), task_to_cliente_data

frontend/src/components/
  Metricas/                            # dashboard sub-rotas (Phase 2 V3)
    MetricasLayout.jsx
    MetricasGeral.jsx / Posts / Reels / Stories
    shared/                            # KpiCard, PostCard, ClienteCombobox, SyncButton, banners, constants
  Ranking/                             # ★ NOVO (Phase 1 Ranking Tabs)
    index.jsx                          # tabs + URL ?tab=
    RankingClientes.jsx                # aba atual preservada
    RankingConsultores.jsx             # stub "Em construção"
    shared/                            # AtencaoMasterCard, DestaqueCard, PodiumCard, RankRow, ConsultorCard, formatters, constants
  layout/Sidebar.jsx                   # consultantNav + adminNav + adminOnlyNav (★ Colaboradores entra entre Copywriter e Administração na Phase 2)
  lib/utils.js                         # ★ ATUALIZAR na Phase 4 Colaboradores: isOwner() + isAdmin() ampliado
  Materiais.jsx                        # tabela materiais_copy (read-only listing + upload)

docs/
  superpowers/specs/                   # specs por feature
  superpowers/plans/                   # plans por phase
  superpowers/HANDOFF-metricas-v3.md   # este arquivo
  migrations/                          # ★ NOVO: doc evidences (004-colaboradores.sql)
```
