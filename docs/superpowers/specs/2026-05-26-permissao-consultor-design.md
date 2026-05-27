# Permissionamento por consultor — design

**Data:** 2026-05-26
**Stream:** 6 (NOVO)
**Status:** spec aprovada, pendente plano e implementação
**Escopo:** abas Clientes + Métricas. Não toca debriefings, materiais, colaboradores, tutoriais (fora do escopo desta spec).

---

## 1. Objetivo

Substituir o filtro client-side por email-split (frágil, contornável via DevTools) por **enforcement no backend** das telas Clientes e Métricas:

- **Consultor** (categoria='consultor' + role='member'): vê só clientes com `consultor_id` apontando pra ele
- **Admin/owner OU categoria='diretor'**: vê todos com filtro `ConsultorFilter` ativo (UX preservada)
- Endpoints individuais (`/metricas/{cliente_id}/overview`) retornam **403** quando consultor tenta acessar cliente alheio

Eliminar o `consultor_responsavel` TEXT livre como source-of-truth (substituído por FK `consultor_id` → `colaboradores.id`).

---

## 2. Modelo de dados

### 2.1 Mudança de schema

Migration `009-clientes-consultor-fk.sql`:

- `ALTER TABLE clientes ADD COLUMN consultor_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL;`
- `CREATE INDEX idx_clientes_consultor_id ON clientes(consultor_id);`
- Função `_normalize_consultor_name(text)` PL/pgSQL — replica matchConsultor JS: lowercase + unaccent + remove espaços/separadores
- Backfill em 2 passes:
  1. Match exato normalizado (`normalize(clientes.consultor_responsavel) = normalize(colaboradores.nome)`)
  2. Match bidirecional substring pros que sobraram (cobre "Lucas Nery" ↔ "lucasnery")
- `SELECT id, nome, consultor_responsavel FROM clientes WHERE consultor_id IS NULL` no final — Pedro reatribui pela UI

`consultor_responsavel` TEXT é **mantido** por compatibilidade (denormalizado). Será dropado em fase futura quando todo código consumir só `consultor_id`.

### 2.2 Regra de autorização (única, vive no backend)

```
can_see_all = (colaborador.categoria == 'diretor') OR (colaborador.role IN ('owner', 'admin'))
```

- `can_see_all = True`: vê tudo, ConsultorFilter ativo, pode editar qualquer cliente, pode reatribuir consultor
- `can_see_all = False`: backend filtra `WHERE consultor_id = me.id`, ConsultorFilter escondido, só edita os próprios, não pode reatribuir
- Clientes órfãos (`consultor_id = NULL`): só visíveis pra `can_see_all` (com badge "sem consultor" pra reatribuir)

---

## 3. Backend

### 3.1 Novo módulo `backend/lib/auth_scope.py`

```python
@dataclass(frozen=True)
class UserScope:
    user_id: str
    email: str
    can_see_all: bool
    consultor_id: str | None
    consultor_nome: str | None
    categoria: str | None  # 'consultor' | 'diretor' | None
    role: str | None       # 'owner' | 'admin' | 'member' | None

async def get_user_scope(user = Depends(get_current_user)) -> UserScope:
    """Lookup colaboradores by email, monta UserScope. Cacheado por request via Depends."""
    # 1) busca colaboradores.where(email=user.email, ativo=true)
    # 2) determina can_see_all = (categoria=='diretor') OR (role IN ('owner','admin'))
    # 3) retorna UserScope
    # Edge case: user sem ficha em colaboradores → pode ser owner via OWNER_FALLBACK_EMAILS
    #            ou user externo → can_see_all=False + consultor_id=None (vê NADA)
```

### 3.2 Novo endpoint `GET /me/scope`

Retorna o `UserScope` serializado pro frontend. Single source-of-truth pra UI saber `canSeeAll` + `myConsultorId` + `myConsultorNome`.

### 3.3 Endpoints alterados

| Endpoint | Mudança |
|---|---|
| `GET /clientes` | Aceita `?consultor_id=X` (só efeito se `can_see_all`). Se `!can_see_all`: ignora query param, filtra `WHERE consultor_id = scope.consultor_id`. |
| `GET /metricas/ranking` | Idem — filtra ranking. |
| `GET /metricas/{cliente_id}/overview` | Carrega cliente. Se `!scope.can_see_all` E `cliente.consultor_id != scope.consultor_id`: **HTTP 403** com `detail="Sem acesso a esse cliente"`. |
| `POST /clientes` | Se `!can_see_all`: força `consultor_id = scope.consultor_id` (ignora payload). Senão: aceita `consultor_id` do payload. |
| `PATCH /clientes/{id}` | Carrega cliente, valida ownership pra `!can_see_all`. Campo `consultor_id` só editável se `can_see_all`. |

### 3.4 Estratégia de testes

`backend/tests/test_auth_scope.py`:
- Consultor regular: `can_see_all=False`, `consultor_id` correto
- Diretor: `can_see_all=True` mesmo com role='member'
- Admin/owner: `can_see_all=True` mesmo com categoria='consultor'
- User sem ficha de colaborador: `can_see_all=False` e `consultor_id=None`
- Pedro via `OWNER_FALLBACK_EMAILS`: `can_see_all=True`

`backend/tests/test_clientes_auth.py`:
- Consultor → GET `/clientes` retorna só os seus
- Admin → GET `/clientes` retorna todos
- Admin com `?consultor_id=X` → filtra
- Consultor com `?consultor_id=outro` → ignora, retorna os próprios
- Consultor → PATCH cliente alheio → 403
- Consultor → POST cliente com `consultor_id=outro` → cria com `consultor_id=self`

`backend/tests/test_metricas_auth.py`:
- Ranking filtrado por consultor
- Overview cross-consultor → 403
- Overview do próprio cliente → 200

---

## 4. Frontend

### 4.1 Novo hook `useUserScope`

```js
// frontend/src/hooks/useUserScope.js
export function useUserScope() {
  // Chama GET /me/scope (cache em sessão via React Query OU SWR; fallback simples useState+useEffect)
  // Retorna: { canSeeAll, myConsultorId, myConsultorNome, isLoading, error }
}
```

Substitui chutes locais (`isAdminFromSession` + `findMyConsultorName`). Single source-of-truth: o backend devolve, frontend consome.

### 4.2 Telas alteradas

| Tela | Mudança |
|---|---|
| `Clientes.jsx` | Remove filtro client-side por email-split (linhas 320-323). Usa `useUserScope()` + dados já filtrados do backend. `ConsultorFilter` só renderiza se `canSeeAll`. URL param `?consultor=X` continua funcionando (admin/diretor). |
| `Metricas/` (Ranking, Overview, etc) | Mesma lógica: hook + dropdown condicional. Página por cliente captura 403 e mostra "Sem acesso a esse cliente" decentemente em vez de tela quebrada. |
| Modal de novo/editar cliente | Campo "consultor" vira `<select>` populado por `GET /colaboradores?categoria=consultor`. Pra `!canSeeAll`: campo readonly com nome do próprio. |
| **Refactor oportuno** | `Dashboard.jsx` (linhas 56-69) hoje duplica `findMyConsultorName` — migrar pro `useUserScope()` também. Custo: ~15 linhas. |

### 4.3 UX details

- Loading do hook: skeleton no lugar do dropdown (não pisca)
- Erro do `/me/scope`: cai pra modo restritivo (não admin) — segurança first, UX informa "não foi possível carregar permissões, recarregue"
- 403 em overview: mostra `<EmptyState>` com mensagem + botão "Voltar pra lista"
- Badge "sem consultor" em clientes órfãos (só visível pra `can_see_all`)

---

## 5. Rollout em etapas (cada uma deployável sozinha)

### Etapa 1 — Schema additive + backfill
**Diff:** migration `009-clientes-consultor-fk.sql` aplicada manualmente no Supabase Dashboard.
**Impacto:** zero (campo novo, app ignora).
**Validação:** Pedro recebe lista de órfãos e reatribui.

### Etapa 2 — Backend autorizativo
**Diff:** `auth_scope.py` + `/me/scope` endpoint + filtros nos endpoints + testes.
**Impacto:** consultor passa a ver só os seus. Admin/diretor sem mudança.
**Risca:** se Etapa 1 deixou clientes do Pedro com `consultor_id=NULL`, Pedro perde acesso. **Mitigação:** Etapa 1 100% resolvida antes desse deploy.

### Etapa 3 — Frontend hook + UI condicional
**Diff:** `useUserScope.js` + refactor `Clientes.jsx`, `Metricas/*`, modal, Dashboard.
**Impacto:** UX limpo (dropdown só pra quem deve ver), modal de cliente robusto.

### Etapa 4 — Cleanup (1-2 semanas depois)
**Diff:** remove filtro client-side residual de `Clientes.jsx:320-323`.
**Impacto:** simplifica codebase. Backend é única fonte de verdade.

---

## 6. Rollback plan

- **Etapa 1:** schema additive — sem rollback necessário. Se quiser desfazer: `ALTER TABLE clientes DROP COLUMN consultor_id; DROP FUNCTION _normalize_consultor_name;`
- **Etapa 2:** `git revert` do commit + redeploy. Schema da Etapa 1 fica idle (sem prejuízo).
- **Etapa 3:** `git revert` + redeploy. Backend continua filtrando, frontend volta ao filtro client-side antigo (degradação OK).
- **Backfill errado:** `UPDATE clientes SET consultor_id = NULL` + re-rodar backfill com ajuste.

---

## 7. Métricas de sucesso

- ✅ Consultor logado vê só seus clientes em `/clientes` e `/metricas/ranking` (auditável via DevTools Network)
- ✅ Admin/diretor vê todos com dropdown funcional (preservado)
- ✅ HTTP 403 quando consultor tenta `/metricas/{cliente_id_alheio}/overview` direto
- ✅ Lista de órfãos vazia depois do Pedro reatribuir manualmente
- ✅ Zero relatos "sumiu meu cliente" após Etapas 1+2 em prod por 1 semana

---

## 8. Out of scope (não nessa spec)

- Permissionamento em outras telas (Materiais, Tutoriais, Colaboradores, Debriefings)
- Drop da coluna `consultor_responsavel` (fica pra fase futura)
- Permissões granulares por ação (criar/editar/deletar diferenciado) — versão atual é binário "vê tudo ou só os seus"
- Histórico de reatribuição de consultor (auditoria) — não pedido
- Multi-consultor por cliente — fora do escopo (cliente tem 1 consultor único)

---

## 9. Arquivos afetados (preview)

```
NOVO:
  docs/migrations/009-clientes-consultor-fk.sql
  backend/lib/auth_scope.py
  backend/tests/test_auth_scope.py
  backend/tests/test_clientes_auth.py
  backend/tests/test_metricas_auth.py
  frontend/src/hooks/useUserScope.js

MODIFICADO:
  backend/main.py              # registra /me/scope se não estiver em routes próprio
  backend/routes/metricas.py   # filtros nos endpoints
  frontend/src/components/Clientes.jsx
  frontend/src/components/Metricas/* (telas afetadas)
  frontend/src/components/Dashboard.jsx  # refactor pra useUserScope
  frontend/src/components/<modal de cliente>.jsx  # select consultor
```

---

## 10. Decisões consolidadas (recapitulação)

| # | Decisão | Justificativa |
|---|---|---|
| 1 | `can_see_all` por **categoria + role** combinado | Diretor sempre vê tudo (mesmo role=member); admin/owner sobe permissão técnica |
| 2 | FK `consultor_id` (não manter TEXT) | Sustentável; elimina typos; dropdown na edição |
| 3 | Órfãos = `NULL` + relatório manual | Migration não trava; Pedro reatribui pela UI |
| 4 | Regra **só no backend** (FastAPI autoritativo) | Alinhado com codebase atual; RLS continua "authenticated read all" |
| 5 | Ranking pra consultor = **só seus clientes** | Consistente com restante das telas; sem expor métricas alheias |
| 6 | Frontend reusa **ConsultorFilter component** existente | Não inventa UI nova |
| 7 | `useUserScope` hook chama `/me/scope` | Single source-of-truth: backend decide, frontend consome |
| 8 | Refactor Dashboard.jsx pra usar mesmo hook | Limpeza oportuna (mencionada no brainstorming skill) |
| 9 | Rollout em 4 etapas reversíveis | Cada etapa deployável sozinha; rollback simples |
