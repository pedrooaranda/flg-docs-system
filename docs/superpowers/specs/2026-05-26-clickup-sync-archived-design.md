# ClickUp Sync + Soft Delete — design

**Data:** 2026-05-26
**Stream:** 7 (NOVO)
**Status:** spec aprovada, plano e implementação na sequência
**Escopo:** ampliar `services/clickup_sync.py` existente. Sem agente LLM novo.

---

## 1. Objetivo

ClickUp é source-of-truth do ciclo de vida do cliente. Sistema FLG deve:
- **Manter visível:** ativo, pausado (com badge), em encerramento (transitório)
- **Arquivar (soft delete):** encerrado, renovado, inativo

Resolve interação com Stream 6: dos 23 órfãos do backfill da migration 009, vários provavelmente são inativos/encerrados que sumirão automaticamente quando primeiro sync rodar.

---

## 2. Modelo de dados

**Migration 010:**
- `ALTER TABLE clientes ADD COLUMN archived_at TIMESTAMPTZ NULL;`
- `CREATE INDEX idx_clientes_archived_at ON clientes(archived_at) WHERE archived_at IS NOT NULL;` (parcial — só registros arquivados)
- Comment documentando semântica: NULL = visível; NOT NULL = soft-deleted

Coluna `status` continua aceitando strings livres (ativo/pausado/etc) — semântica de visibilidade vai pelo `archived_at`. Status descreve o **estado operacional** (ativo/pausado); archived_at descreve **decisão de exclusão**.

---

## 3. Backend

### 3.1 Lifecycle evaluation

Nova função em `backend/services/clickup_sync.py`:

```python
def evaluate_lifecycle(situacao_raw: str | None) -> tuple[str, bool]:
    """
    Recebe valor do custom field SITUAÇÃO do ClickUp.
    Retorna (status_pra_DB, deve_arquivar).

    Regras:
      - 'encerrado', 'renovado', 'inativo' → ('concluido', True)  → archive
      - 'pausado'                          → ('pausado', False)   → visível com badge
      - 'em encerramento'                  → ('ativo', False)     → visível (transitório)
      - resto (excelente/normal/etc)        → ('ativo', False)     → visível
    """
```

Match com normalização (lowercase + trim). Lookup tabela:

| Padrão SITUAÇÃO | status DB | archive? |
|---|---|---|
| `encerrado`, `encerramento` (sem "em ")| concluido | ✅ |
| `renovado` | concluido | ✅ |
| `inativo` | concluido | ✅ |
| `em encerramento`, `em encerramento próximo` | ativo | ❌ (transitório) |
| `pausado`, `em pausa` | pausado | ❌ |
| `excelente`, `indo bem`, `normal`, `campanha`, `atenção`, `alerta`, etc | ativo | ❌ |
| (vazio/desconhecido) | ativo | ❌ (fallback seguro) |

### 3.2 Sync ampliado

`run_clickup_sync` chama `evaluate_lifecycle` por task e aplica:

```python
status_db, should_archive = evaluate_lifecycle(situacao_raw)
update_payload = {"status": status_db}

if should_archive and not existing.archived_at:
    update_payload["archived_at"] = now()
    log("🗄️ archived: {nome} ({situacao_raw})")
elif not should_archive and existing.archived_at:
    # Reativação: ClickUp moveu pra ativo/pausado depois de arquivado
    update_payload["archived_at"] = None
    log("↩️ reactivated: {nome}")
```

Stats retornados: `{archived: N, reactivated: M, paused: P, ativos: A, errors: E, total: T, duration_ms: X}`.

### 3.3 Endpoints

**Modificações:**
- `GET /clientes` — adiciona `WHERE archived_at IS NULL` por default. Aceita `?include_archived=true` (admin only — usa `scope.can_see_all`).
- `GET /metricas/ranking` — mesmo filtro.
- `GET /clientes/{id}` — **sem** filtro de archived (admin/owner pode acessar histórico de cliente archived pra debriefing/encontros).

**Novo:**
- `POST /admin/clickup/sync` — admin only (verifica `scope.can_see_all`). Dispara sync síncrono e retorna stats JSON. Resposta inclui `duration_ms`, contagens.

### 3.4 Schedule

Mantém apscheduler 6h + webhook + startup sync existentes. Pedro pode forçar via UI ou via endpoint.

---

## 4. Frontend (mínimo)

**Sem polish UI grande nesta spec — vai pro Stream 8.** O que vai aqui:

1. **Badge "Pausado"** dourado no card de cliente em `Clientes.jsx`. Já temos os cards — adicionar `<span>` condicional pra `cliente.status === 'pausado'`. Estilo: `bg-gold-mid/20 text-gold-mid text-xs px-2 py-0.5 rounded`.

2. **Botão "Sync ClickUp"** no header de `/clientes` — só renderiza se `canSeeAll`. Ícone refresh do lucide-react. On click: POST `/admin/clickup/sync`, loading spinner, toast de sucesso com stats.

3. **Filtro `status='inativo'`** removido do dropdown de status (em `Clientes.jsx` — hoje provavelmente lista todos). Substitui por: ativo / pausado / em encerramento / todos.

Clientes archived simplesmente somem da lista (backend filtra) — sem feature de "ver arquivados" agora (defer).

---

## 5. Rollout em etapas

### Etapa 1 — Migration 010 (Pedro)
- Aplicar `010-clientes-archived-at.sql` no Supabase Dashboard.
- Schema additive, zero impacto.

### Etapa 2 — Backend lifecycle + endpoints
- `evaluate_lifecycle`, `run_clickup_sync` ampliado, filtro nos endpoints, novo `/admin/clickup/sync`.
- Tests cobrindo cada regra de mapping + filtros.
- **Após deploy, próximo sync (6h ou trigger manual) já arquiva os encerrados/inativos/renovados.**

### Etapa 3 — Frontend mínimo
- Badge pausado, botão sync, filtro de status.

### Etapa 4 — Stream 8 (separado)
- Polish UI das 4 telas (Clientes, Métricas, Ranking, Dashboard) — brainstorming próprio.

---

## 6. Rollback plan

- **Migration:** `ALTER TABLE clientes DROP COLUMN archived_at;` (sem perda de dados — outras colunas intactas)
- **Backend:** `git revert` + redeploy. Sync volta a apenas atualizar status, sem archive.
- **Frontend:** `git revert`. Botão sync some, badge some. Sem impacto.
- **Reativação manual:** `UPDATE clientes SET archived_at = NULL WHERE id = '<x>'` no Supabase pra desfazer archive específico.

---

## 7. Métricas de sucesso

- ✅ Próximo sync após deploy arquiva clientes encerrados/renovados/inativos (verificar via SQL count)
- ✅ Lista de 23 órfãos do Stream 6 reduz significativamente após primeiro sync
- ✅ `/clientes` retorna só visíveis (consultor regular + admin)
- ✅ `/clientes?include_archived=true` retorna tudo (admin)
- ✅ Badge "pausado" aparece no card dos pausados
- ✅ Sync manual via botão funciona em < 5s pra ~70 tasks
- ✅ Reativação automática: Pedro muda status no ClickUp + sync → cliente reaparece

---

## 8. Out of scope

- Tela admin de "ver/recuperar arquivados" (defer)
- Histórico de transições (audit log) — não pedido
- Notificação quando cliente é arquivado/reativado — defer
- Sync das listas BS (já existe), AC, etc — Stream 7 só toca BS por enquanto, espelha sync existente
- Polish UI grande das telas (Stream 8 separado)

---

## 9. Arquivos afetados

```
NOVO:
  docs/migrations/010-clientes-archived-at.sql

MODIFICADO:
  backend/services/clickup_sync.py    # evaluate_lifecycle + sync ampliado
  backend/main.py                      # /admin/clickup/sync endpoint + filtro archived em /clientes
  backend/routes/metricas.py           # filtro archived em /ranking
  backend/tests/test_clickup_sync.py   # novo arquivo de tests
  backend/tests/test_clientes_auth.py  # ajustar pra include_archived
  frontend/src/components/Clientes.jsx # badge pausado + botão sync + filtros
```

---

## 10. Decisões consolidadas

| # | Decisão | Justificativa |
|---|---|---|
| 1 | Soft delete via `archived_at TIMESTAMPTZ` | Preserva FKs (encontros, métricas, debriefings). Reversível. |
| 2 | Archive em encerrado/renovado/inativo. NÃO em "em encerramento" | Pedro pediu literalmente; "em encerramento" é transitório |
| 3 | Reativação automática | Se ClickUp volta pra ativo, sistema desfaz archive |
| 4 | `?include_archived=true` no GET /clientes pra admin | Permite tela admin futura sem nova rota |
| 5 | Sem agente LLM | Mapping é determinístico; sync já existe; over-engineering desnecessário |
| 6 | Polish UI fica pra Stream 8 separado | Escopo desta spec focado em backend + UI mínima funcional |
