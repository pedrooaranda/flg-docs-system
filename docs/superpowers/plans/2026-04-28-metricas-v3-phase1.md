# Métricas V3 — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fixar 2 bugs do Dashboard de Métricas: filtro 7d/30d/90d que não muda KPIs (overview hardcoded em 30d), e sync de posts limitado a 50 (sem paginação retroativa).

**Architecture:** Backend ganha query param `dias` no `/overview` e split proporcional (atual/anterior). `_sync_posts` ganha loop de paginação com 3 critérios de parada (>90 dias, >10 páginas, ou bater post já consolidado no DB). Frontend passa `dias` na chamada de overview e renderiza título dinâmico.

**Tech Stack:** Python (FastAPI), Supabase Postgres, React (Vite), Meta Graph API v21.0 (Instagram Business Login).

**Spec:** [docs/superpowers/specs/2026-04-28-metricas-v3-phase1-design.md](../specs/2026-04-28-metricas-v3-phase1-design.md)

---

## File Structure

| Arquivo | Responsabilidade | Mudança |
|---|---|---|
| `backend/routes/metricas.py` | Endpoints HTTP de métricas | `/overview` aceita `?dias=N`, ajusta split atual/anterior |
| `backend/services/instagram_sync.py` | Sync engine Meta → Supabase | `_sync_posts` ganha loop de paginação inteligente |
| `frontend/src/components/Metricas.jsx` | UI do Dashboard | Passa `dias` no fetch do overview, título dinâmico |

Validação sem suite de testes: `python3 -m py_compile`, `esbuild --loader:.jsx=jsx`, deploy via CI, `fetch-logs.yml` pra logs reais.

---

## Task 1: Backend — `/overview` aceita `?dias=N`

**Files:**
- Modify: `backend/routes/metricas.py:191-228` (assinatura + lógica de split)

- [ ] **Step 1: Adicionar query param `dias` na assinatura**

Edit em `backend/routes/metricas.py`, função `get_overview`. Trocar:

```python
@router.get("/{cliente_id}/overview")
async def get_overview(
    cliente_id: str,
    plataforma: str = "instagram",
    user=Depends(get_current_user),
):
    repo = _get_repo(plataforma, cliente_id)
    historico = repo.get_historico(cliente_id, 60)
```

por:

```python
@router.get("/{cliente_id}/overview")
async def get_overview(
    cliente_id: str,
    plataforma: str = "instagram",
    dias: int = 30,
    user=Depends(get_current_user),
):
    if dias < 1 or dias > 365:
        raise HTTPException(400, "dias deve estar entre 1 e 365")
    repo = _get_repo(plataforma, cliente_id)
    # Pega 2x o período pra ter janela "atual" + "anterior" pro delta_pct
    historico = repo.get_historico(cliente_id, dias * 2)
```

- [ ] **Step 2: Ajustar split de `atual` / `anterior` proporcional**

No mesmo arquivo, trocar:

```python
    atual = historico[30:]
    anterior = historico[:30]
```

por:

```python
    atual = historico[dias:]
    anterior = historico[:dias]
```

- [ ] **Step 3: Ajustar sparklines pra respeitar o período**

Trocar:

```python
    spark7 = historico[-7:]
```

por:

```python
    # Sparklines: mostra últimos min(7, dias) pontos do período atual
    spark7 = atual[-min(7, dias):] if atual else []
```

- [ ] **Step 4: Incluir `dias` no payload do response (pro frontend exibir)**

Procurar o `return {` final (~linha 256, depois do `if not historico` block). No dict de retorno principal (que tem `kpis`, `sparklines`, etc.), adicionar a chave:

```python
        "dias_periodo": dias,
```

E no return do caso `aguardando_sync` (~linha 217-227), adicionar a mesma chave.

- [ ] **Step 5: Validar sintaxe Python**

Run: `python3 -m py_compile backend/routes/metricas.py`
Expected: sem output (sucesso)

- [ ] **Step 6: Commit**

```bash
git add backend/routes/metricas.py
git commit -m "feat(metricas): /overview aceita ?dias=N pra respeitar filtro de período do frontend"
```

---

## Task 2: Backend — Paginação inteligente em `_sync_posts`

**Files:**
- Modify: `backend/services/instagram_sync.py:33-37` (constantes), `233-310` (função `_sync_posts`)

- [ ] **Step 1: Adicionar constantes de paginação**

Em `backend/services/instagram_sync.py`, achar o bloco de constantes (~linha 32-37):

```python
GRAPH = "https://graph.instagram.com/v21.0"
HTTP_TIMEOUT = 20
INTER_CALL_DELAY = 0.2  # 200ms entre chamadas Graph API
DAYS_RESYNC_RECENT_POSTS = 7
DAYS_FINALIZE_POSTS = 30
MAX_POSTS_PER_SYNC = 50
```

Substituir por:

```python
GRAPH = "https://graph.instagram.com/v21.0"
HTTP_TIMEOUT = 20
INTER_CALL_DELAY = 0.2  # 200ms entre chamadas Graph API
DAYS_RESYNC_RECENT_POSTS = 7
DAYS_FINALIZE_POSTS = 30
POSTS_PER_PAGE = 50           # tamanho de cada página /me/media
MAX_PAGES_PER_SYNC = 10       # teto de páginas (proteção rate limit Meta: 200 calls/h)
MAX_HISTORICAL_DAYS = 90      # janela retroativa máxima — não pagina antes disso
```

Procurar e substituir TODOS os usos de `MAX_POSTS_PER_SYNC` no arquivo por `POSTS_PER_PAGE`.

- [ ] **Step 2: Validar grep**

Run: `grep -n "MAX_POSTS_PER_SYNC" backend/services/instagram_sync.py`
Expected: sem output (todas as ocorrências foram substituídas)

- [ ] **Step 3: Reescrever `_sync_posts` com loop de paginação**

Localizar a função `_sync_posts` (começa ~linha 233). Substituir TODA a função por:

```python
async def _sync_posts(sb, client: httpx.AsyncClient, cliente_id: str, ig_user_id: str, token: str) -> dict:
    """
    Sincroniza posts paginando até cobrir os últimos MAX_HISTORICAL_DAYS dias
    OU até bater num post já consolidado no DB (cron incremental).

    Retorna dict com contadores: media_fetched, synced, insights_full,
    insights_safe, insights_failed, pages_fetched.
    """
    fields = (
        "id,media_type,media_product_type,caption,permalink,media_url,thumbnail_url,"
        "timestamp,like_count,comments_count"
    )

    counters = {
        "media_fetched": 0,
        "synced": 0,
        "insights_full": 0,
        "insights_safe": 0,
        "insights_failed": 0,
        "pages_fetched": 0,
    }

    cutoff_resync = datetime.now(timezone.utc) - timedelta(days=DAYS_RESYNC_RECENT_POSTS)
    cutoff_finalize = datetime.now(timezone.utc) - timedelta(days=DAYS_FINALIZE_POSTS)
    cutoff_historical = datetime.now(timezone.utc) - timedelta(days=MAX_HISTORICAL_DAYS)

    # Primeira página
    next_url = f"{GRAPH}/{ig_user_id}/media"
    next_params = {"fields": fields, "limit": POSTS_PER_PAGE, "access_token": token}

    while next_url and counters["pages_fetched"] < MAX_PAGES_PER_SYNC:
        resp = await client.get(next_url, params=next_params)
        await asyncio.sleep(INTER_CALL_DELAY)
        if resp.status_code != 200:
            logger.warning(f"Posts fetch falhou {resp.status_code}: {resp.text[:200]}")
            if counters["pages_fetched"] == 0:
                # Falhou logo na primeira página — propaga
                raise RuntimeError(f"Posts fetch HTTP {resp.status_code}: {resp.text[:200]}")
            # Falhou no meio da paginação — usa o que conseguimos e segue
            break

        body = resp.json()
        media_items = body.get("data", [])
        counters["pages_fetched"] += 1
        counters["media_fetched"] += len(media_items)

        if not media_items:
            break

        stop_paginating = False  # sinaliza pra parar depois de processar a página atual

        for item in media_items:
            media_id = item["id"]
            posted_at = _parse_ts(item.get("timestamp"))
            if not posted_at:
                continue

            # Critério de parada A: post mais antigo que MAX_HISTORICAL_DAYS — não interessa
            if posted_at < cutoff_historical:
                stop_paginating = True
                continue

            existing = sb.table("instagram_posts").select(
                "id,metricas_finalizadas,ultima_atualizacao_metricas"
            ).eq("ig_media_id", media_id).maybe_single().execute()

            existing_data = existing.data if existing else None

            # Critério de parada B: encontrou post JÁ FINALIZADO no DB →
            # tudo antes dele já foi sincronizado em runs anteriores. Pode parar.
            if existing_data and existing_data.get("metricas_finalizadas"):
                stop_paginating = True
                continue

            # Skip resync se já está no DB e foi atualizado hoje
            skip_resync = False
            if existing_data and posted_at < cutoff_resync:
                last_update = _parse_ts(existing_data.get("ultima_atualizacao_metricas"))
                if last_update and (datetime.now(timezone.utc) - last_update).days < 1:
                    skip_resync = True

            if skip_resync:
                continue

            insights = await _fetch_post_insights(client, media_id, item.get("media_product_type", "FEED"), token)
            variant = insights.pop("_insights_variant", "failed")
            counters[f"insights_{variant}"] += 1

            row = _build_post_row(cliente_id, item, insights, posted_at, cutoff_finalize)
            sb.table("instagram_posts").upsert(row, on_conflict="ig_media_id").execute()
            counters["synced"] += 1

        if stop_paginating:
            break

        # Critério de parada C: fim da paginação Meta
        paging = body.get("paging", {})
        next_url = paging.get("next")
        next_params = None  # next_url já vem com query string completa

    logger.info(
        f"_sync_posts cliente={cliente_id}: pages={counters['pages_fetched']}, "
        f"media={counters['media_fetched']}, synced={counters['synced']}, "
        f"insights full/safe/failed="
        f"{counters['insights_full']}/{counters['insights_safe']}/{counters['insights_failed']}"
    )
    return counters
```

- [ ] **Step 4: Validar sintaxe Python**

Run: `python3 -m py_compile backend/services/instagram_sync.py`
Expected: sem output (sucesso)

- [ ] **Step 5: Verificar que sync_cliente continua compatível com novo retorno**

Run: `grep -n "_sync_posts" backend/services/instagram_sync.py`
Confere que `sync_cliente` faz `posts_result["pages_fetched"]` se quiser usar (opcional). Como já estava lendo `synced`, `media_fetched`, `insights_*` do dict, o novo `pages_fetched` é só info adicional não-quebradora.

Atualizar a função `sync_cliente` pra incluir `pages_fetched` em `diagnostics` (~linha 130):

```python
            posts_result = await _sync_posts(sb, client, cliente_id, ig_user_id, access_token)
            counters["posts"] = posts_result["synced"]
            diagnostics["media_fetched"] = posts_result["media_fetched"]
            diagnostics["pages_fetched"] = posts_result["pages_fetched"]
            diagnostics["insights_full"] = posts_result["insights_full"]
            diagnostics["insights_safe"] = posts_result["insights_safe"]
            diagnostics["insights_failed"] = posts_result["insights_failed"]
```

- [ ] **Step 6: Validar sintaxe novamente**

Run: `python3 -m py_compile backend/services/instagram_sync.py`
Expected: sem output

- [ ] **Step 7: Commit**

```bash
git add backend/services/instagram_sync.py
git commit -m "feat(sync): paginação inteligente de posts (até 90d ou primeiro post finalizado)"
```

---

## Task 3: Frontend — passa `dias` no overview + título dinâmico

**Files:**
- Modify: `frontend/src/components/Metricas.jsx:1104` (fetch overview), `1218` (título)

- [ ] **Step 1: Passar `dias` no fetch do overview**

Em `frontend/src/components/Metricas.jsx`, achar a chamada do overview (~linha 1104):

```javascript
      api(`/metricas/${clienteId}/overview?plataforma=${p}`),
```

Substituir por:

```javascript
      api(`/metricas/${clienteId}/overview?plataforma=${p}&dias=${periodo}`),
```

- [ ] **Step 2: Tornar título da seção dinâmico**

Achar a linha (~1218):

```javascript
            <SectionTitle>Visão Geral — {platConfig.label} — últimos 30 dias</SectionTitle>
```

Substituir por:

```javascript
            <SectionTitle>Visão Geral — {platConfig.label} — últimos {periodo} dias</SectionTitle>
```

- [ ] **Step 3: Validar sintaxe JSX**

Run: `frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx frontend/src/components/Metricas.jsx > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Metricas.jsx
git commit -m "feat(metricas): UI passa filtro de período no overview + título dinâmico"
```

---

## Task 4: Deploy + verificação end-to-end

**Files:** nenhum (só CI/observação)

- [ ] **Step 1: Push pra disparar deploy**

Run:
```bash
git push origin main
```
Expected: `main -> main` no output (sucesso).

- [ ] **Step 2: Aguardar CI concluir**

Run:
```bash
sleep 6 && gh run list --workflow deploy.yml --limit 1
```
Expected: status `in_progress` ou `success`. Se `in_progress`, aguardar com `gh run watch <ID> --exit-status`.

Run:
```bash
RUN_ID=$(gh run list --workflow deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --exit-status
```
Expected: `Run ... has already completed with 'success'` ou similar.

- [ ] **Step 3: Smoke test do healthcheck**

Run:
```bash
curl -sf https://docs.foundersledgrowth.online/api/health
```
Expected: `{"status":"ok",...}` em <2s.

- [ ] **Step 4: Pedir pro Pedro fazer sync manual do João + trocar filtros**

Mensagem pro Pedro (no terminal do agente, não automação):

> Deploy completo. Pra validar:
> 1. Métricas → Letícia/João → clica **Sincronizar agora** (vai puxar todo histórico até 90d, demora 30-60s)
> 2. Troca o filtro do topo direito: 7d → 30d → 90d. KPIs DEVEM mudar visivelmente. Título também ("últimos 7 dias", "últimos 30 dias", etc).

- [ ] **Step 5: Verificar logs do sync com paginação**

Após o Pedro sincronizar, run:

```bash
gh workflow run fetch-logs.yml -f grep="_sync_posts.*pages=" -f lines=20
sleep 4
RUN_ID=$(gh run list --workflow fetch-logs.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --exit-status
gh run view $RUN_ID --log | grep "_sync_posts"
```

Expected: linha tipo `_sync_posts cliente=X: pages=N, media=M, synced=K, ...` com `pages > 1` se cliente tem mais que 50 posts.

- [ ] **Step 6: Confirmar com Pedro que filtros mudam KPIs**

Aguardar resposta do Pedro. Se positivo: Phase 1 entregue. Se negativo: investigar (provavelmente é cliente com pouco histórico — `_avg_active` pode estar honestamente igual entre 7d e 30d se não tem posts diferentes nesses períodos).

---

## Self-Review

**Spec coverage:**
- ✅ Bug filtro de período (overview hardcoded em 30d) → Task 1
- ✅ Paginação inteligente até 90d → Task 2
- ✅ Frontend usa filtro no overview → Task 3
- ✅ Verificação após deploy → Task 4
- ✅ "Não está nesta Phase": Phases 2-4 ficam pra specs próprios — mencionado no spec

**Placeholder scan:** sem TBD/TODO/etc. ✓

**Type/method consistency:** `_sync_posts` retorna `dict` (mesmo tipo do antes). Constantes renomeadas em batch via grep. ✓

**Ambiguidade:** critérios de parada da paginação são 3 condições com OR (idade do post, posts já finalizados, fim da paginação Meta) + teto duro de 10 páginas. Explícitos. ✓
