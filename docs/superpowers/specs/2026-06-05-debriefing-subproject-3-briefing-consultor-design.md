# Subsistema Comercial — Sub-projeto 3: Briefing do Consultor

**Data:** 2026-06-05
**Status:** Aprovado pelo Pedro durante brainstorming (5/5 seções)
**Plano de implementação:** a ser criado via `superpowers:writing-plans`
**Depende de:**
- Sub-projeto 1 já em prod (`docs/superpowers/specs/2026-06-02-debriefing-subproject-1-roles-auth-design.md`)
- Sub-projeto 2 já em prod (`docs/superpowers/specs/2026-06-05-debriefing-subproject-2-login-layouts-ui-design.md`)

---

## 1. Objetivo

Dar ao consultor um espaço dedicado pra registrar a **percepção dele** sobre cada cliente, que o time comercial usa como insumo pra montar o debriefing oficial de renovação.

Hoje (após sub-projetos 1+2), o consultor não tem nenhum acesso ao subsistema de Debriefings. O comercial gera o PDF de debriefing usando só ClickUp + Drive — perde a leitura qualitativa que o consultor tem do cliente.

Sub-projeto 3 entrega:

1. Tela `/clientes/:id/briefing-consultor` onde o consultor escreve em texto livre (auto-save) + vê histórico read-only dos debriefings gerados pra esse cliente.
2. Seção "Percepções dos consultores" no hub do comercial (`/debriefings/cliente/:id`) listando todas as percepções escritas pra aquele cliente, cada uma assinada pelo consultor.
3. Botão no header do `PerfilCliente` muda por persona: comercial/diretor/owner veem "Abrir Debriefings"; consultor vê "Meu Briefing pra esse Cliente".

Fora deste sub-projeto: notificações, comentários do comercial, histórico de versões, injeção das percepções no prompt do Claude que gera o PDF.

## 2. Contexto: o que sub-projetos 1+2 já entregaram

- **Sub-projeto 1**: `UserScope` com `categoria`/`role`/`consultor_id`/`canSeePrincipal`/`canSeeDebriefings`/`canSeeDebriefingsAdmin`. Helpers `require_principal`/`require_debriefings`. Categoria `comercial` existe.
- **Sub-projeto 2**: `MainLayout`/`DebriefingLayout` no frontend. Rota `/debriefings/cliente/:id` (ClienteHub) sob `DebriefingLayout`. Botão "Abrir Debriefings" no `PerfilCliente` gateado por `canSeeDebriefings`.

Matriz atual (vigente em prod):

| Categoria | Role | canSeePrincipal | canSeeDebriefings |
|---|---|---|---|
| consultor | member/admin | ✓ | ✗ |
| diretor | member/admin | ✓ | ✓ |
| comercial | member/admin | ✗ | ✓ |
| qualquer | owner | ✓ | ✓ |

`scope.consultor_id` está populado pra qualquer colaborador registrado com `consultor_id` (independente de categoria/role).

## 3. Decisões fechadas no brainstorming

1. **Conteúdo**: texto livre único (markdown), auto-save. 1 percepção por consultor por cliente.
2. **Quem escreve**: qualquer consultor pode escrever a SUA percepção sobre QUALQUER cliente. PK = `(cliente_id, consultor_id)`. Cada consultor só edita a dele.
3. **Visão comercial**: seção destacada no topo do `/debriefings/cliente/:id` (antes da lista de debriefings) listando todas as percepções com assinatura do consultor. Sem injeção no prompt do Claude.
4. **Viewer dos debriefings na tela do consultor**: inline expansível (sem rotear pra fora) — evita ter que abrir o gate da rota viewer pra consultor.
5. **Botão "Meu Briefing"**: aparece pra consultor (sem `canSeeDebriefings` mas com `myConsultorId`). Mesmo visual gold-gradient do "Abrir Debriefings", copy diferente.

## 4. Backend

### Migration 012 — `briefings_consultor`

```sql
CREATE TABLE briefings_consultor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  consultor_id UUID NOT NULL REFERENCES colaboradores(id),
  conteudo TEXT NOT NULL DEFAULT '',
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, consultor_id)
);
```

Pedro rodou esse SQL exato via Supabase Dashboard em 2026-06-05. Migration vai ser arquivada em `docs/migrations/012-briefings-consultor.sql` com esse conteúdo na Task 1 da implementação.

**Sobre índices:** a constraint `UNIQUE(cliente_id, consultor_id)` cria automaticamente um índice composto. Como `cliente_id` é a primeira coluna, esse índice já serve queries por `cliente_id` sozinho — não precisa de índice extra.

### Endpoints novos (`backend/routes/briefings_consultor.py`)

**`GET /briefings-consultor/cliente/{cliente_id}/me`**
- Retorna o briefing do consultor logado pra esse cliente
- Gate: `scope.consultor_id IS NOT NULL` (qualquer pessoa registrada como consultor — consultor.member/admin + diretor.member/admin + owner com consultor_id). Comercial sem consultor_id recebe 403.
- Se não existe row ainda: retorna `{ conteudo: "", atualizado_em: null }` (não cria row em GET)
- Response: `{ conteudo: str, atualizado_em: str | null }`

**`PUT /briefings-consultor/cliente/{cliente_id}/me`**
- Body: `{ conteudo: str }`
- Upsert (cliente_id, consultor_id=scope.consultor_id) → conteudo
- Gate: igual ao GET /me
- Response: `{ conteudo, atualizado_em }` (com timestamp atualizado)

**`GET /briefings-consultor/cliente/{cliente_id}`**
- Lista todos os briefings do cliente (1 por consultor que escreveu)
- Gate: `require_debriefings(scope)` (comercial, diretor, owner)
- Response: array de `{ consultor_id, consultor_nome, conteudo, atualizado_em }`. Ordenado por `atualizado_em DESC`.

### Tests (`backend/tests/test_briefings_consultor.py`)

Cobertura mínima:
- `test_consultor_le_e_escreve_o_proprio` — consultor faz PUT, depois GET /me, recebe o que escreveu
- `test_consultor_get_me_sem_briefing_retorna_vazio` — GET /me quando não há row retorna `conteudo=""`
- `test_comercial_sem_consultor_id_recebe_403_em_me` — comercial.member sem consultor_id é bloqueado em GET /me e PUT /me
- `test_consultor_recebe_403_em_listagem` — consultor não pode chamar GET /briefings-consultor/cliente/:id (sem `canSeeDebriefings`)
- `test_comercial_le_listagem` — comercial vê listagem completa com nomes dos consultores
- `test_diretor_le_listagem` — diretor idem
- `test_owner_le_listagem` — owner idem

### Registro do router

Em `backend/main.py`, adicionar:
```python
from routes.briefings_consultor import router as briefings_consultor_router
app.include_router(briefings_consultor_router)
```

(Mesmo padrão de `debriefings_router`.)

## 5. Frontend — tela do consultor

Componente novo `frontend/src/components/BriefingConsultor.jsx`. Rota:
```
/clientes/:id/briefing-consultor    sob MainLayout
```

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ← Voltar pro cliente                                       │
│                                                             │
│  Briefing do Consultor                                      │
│  Cliente: {nome} · {empresa}                                │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Sua percepção                          [Salvo ✓]    │ │
│  │  ─────────────────────────────────────────────────   │ │
│  │  [textarea grande — auto-save]                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Isso vai pro time comercial montar o debriefing oficial.  │
│  Escreva o que considera importante eles saberem antes de  │
│  gerar o material de renovação.                            │
│                                                             │
│  ─────────────────────────────────────────────────────     │
│                                                             │
│  Debriefings já gerados                                    │
│                                                             │
│  [card Ciclo 1 - status, data]                              │
│  [card Ciclo 2 - status, data]                              │
│  (cards expansíveis inline com markdown + link Baixar PDF) │
└─────────────────────────────────────────────────────────────┘
```

### Comportamento

- Carrega `GET /briefings-consultor/cliente/:id/me` no mount → popula textarea
- Auto-save: hook `useAutoSave` que já existe no projeto (usado em `PerfilCliente` pra campos de perfil). Reusar — adapta endpoint pra `PUT /briefings-consultor/cliente/:id/me`. Debounce de 2s após inatividade.
- Status visível: "Salvando…" / "Salvo ✓" / "Falha ao salvar" (mesmo padrão do AutoSaveIndicator que já existe)
- Carrega `GET /debriefings/cliente/:id/ciclos` (endpoint que já existe — usado pelo `ClienteHub` hoje) → renderiza cards de ciclos. Click no card expande inline:
  - Fetch `/debriefings/:debriefingId` (endpoint existente do sub-projeto debriefings original) pro markdown
  - Renderiza dentro do mesmo card (com `react-markdown` que já está no projeto)
  - Link "Baixar PDF" usa o mesmo endpoint `/debriefings/:id/pdf` que já existe (signed URL)

### Gate da rota

`/clientes/:id/briefing-consultor` fica sob `MainLayout` (consultor tem `canSeePrincipal=true`). Backend já bloqueia comercial sem consultor_id em GET/PUT /me, então comercial que digite essa URL vê a tela mas chamadas falham com 403 → UI mostra erro inline.

## 6. Frontend — seção no hub do comercial

Em `frontend/src/components/Debriefings/ClienteHub.jsx`, adicionar `<BriefingPercepcoesCard clienteId={clientId} />` no topo, antes da lista de debriefings.

Componente novo `frontend/src/components/Debriefings/BriefingPercepcoesCard.jsx`:

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  💡 Percepções dos consultores                              │
│  Insumo escrito pelos consultores que tocaram esse cliente  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ {Consultor Nome} · {atualizado relativo}             │  │
│  │ ──────────────────────────────                       │  │
│  │ {preview ~3 linhas}                                  │  │
│  │ [Ver completo ▾]                                     │  │
│  └──────────────────────────────────────────────────────┘  │
│  [outros cards]                                             │
└─────────────────────────────────────────────────────────────┘
```

### Comportamento

- Mount → `GET /briefings-consultor/cliente/:id` (lista)
- Pra cada item: card com nome do consultor + `atualizado_em` relativo (`há 2h`, `há 3d` — função utilitária)
- Preview: primeiros ~200 caracteres
- Botão "Ver completo ▾" expande inline pra markdown renderizado
- Empty state: "Nenhum consultor registrou percepção ainda — você pode gerar o debriefing mesmo assim com os dados do ClickUp/Drive."
- Erro: card de erro inline (não quebra o resto do hub)

## 7. Mudança no `PerfilCliente.jsx`

Trocar o botão atual:
```jsx
{canSeeDebriefings && (
  <button onClick={() => navigate(`/debriefings/cliente/${cliente.id}`)}>
    Abrir Debriefings
  </button>
)}
```

Por:
```jsx
{canSeeDebriefings ? (
  <button onClick={() => navigate(`/debriefings/cliente/${cliente.id}`)}>
    Abrir Debriefings
  </button>
) : myConsultorId ? (
  <button onClick={() => navigate(`/clientes/${cliente.id}/briefing-consultor`)}>
    Meu Briefing pra esse Cliente
  </button>
) : null}
```

`myConsultorId` vem de `useUserScope` (já exposto desde sub-projeto 1). Mesmo estilo gold-gradient do botão atual (`/style(perfil)` commit 3a79565).

## 8. Out of scope

- Injeção das percepções no prompt do Claude que gera o PDF (sub-projeto futuro se virar útil)
- Notificação pro comercial quando consultor atualiza percepção
- Histórico de versões (cada PUT sobrescreve; sem audit log)
- Comentários do comercial em cima da percepção
- Tags/labels na percepção
- Botão no hub do comercial pra ele também escrever percepção
- Migrar pra ser por ciclo (atual é 1 por consultor por cliente, sem ciclo)

## 9. Ordem de implementação sugerida

1. Arquivar SQL da migration 012 em `docs/migrations/012-briefings-consultor.sql` (Pedro cola o SQL exato que rodou)
2. Backend: `backend/routes/briefings_consultor.py` (3 endpoints) + tests
3. Backend: registrar router em `main.py`
4. Frontend: `BriefingConsultor.jsx` (tela do consultor) com auto-save
5. Frontend: adicionar rota em `App.jsx` sob `MainLayout`
6. Frontend: `BriefingPercepcoesCard.jsx` + integrar em `ClienteHub.jsx`
7. Frontend: ajustar botão no `PerfilCliente.jsx`
8. Push + smoke matriz (Owner/Diretor/Consultor/Comercial)

## 10. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Auto-save concorrente (consultor editando em 2 abas): última escrita vence | Aceitável. Se virar dor real, adiciona timestamp check no PUT. |
| Migration já rodada pelo Pedro com SQL ligeiramente diferente do spec | Task 1 da implementação pede SQL exato pra arquivar no repo. Se houver divergência, ajusto o spec do endpoint pra match (ou peço alteração). |
| Comercial sem consultor_id navega manualmente pra `/clientes/:id/briefing-consultor` | Backend retorna 403, frontend mostra mensagem clara. Edge case raro. |
| Performance: cliente com muitos consultores no histórico (~10+) | Aceitável até virar dor; sem paginação por ora (1 row por consultor por cliente, raramente >5). |
| Markdown renderizado com conteúdo malicioso (XSS) | `react-markdown` já sanitiza por default (`disallowedElements`). Igual já é usado no `Viewer.jsx`. |

## 11. Critérios de aceitação

- [ ] Migration 012 versionada em `docs/migrations/012-briefings-consultor.sql` com SQL exato que Pedro rodou
- [ ] 7 tests backend passam (consultor lê/escreve próprio, GET vazio sem row, comercial sem consultor_id 403, consultor 403 em listagem, comercial/diretor/owner leem listagem). Suite total ≥ 94 passed / 5 failed (87 atual + 7 novos).
- [ ] Consultor abre `/clientes/:id` → vê botão "Meu Briefing" → click → carrega tela com textarea vazia → escreve → vê "Salvo ✓" → recarrega → texto persiste
- [ ] Comercial abre `/debriefings/cliente/:id` → vê seção "Percepções dos consultores" com a percepção que o consultor escreveu acima
- [ ] Diretor: vê tanto botão "Abrir Debriefings" no PerfilCliente quanto a seção no hub; consegue acessar `/clientes/:id/briefing-consultor` direto e escrever a dele
- [ ] Owner: idem diretor
- [ ] Build esbuild limpa no frontend (`npm run build` exit 0)
- [ ] Deploy em prod + smoke manual do Pedro passa

---

**Próximo passo:** invocar `superpowers:writing-plans` pra criar o plano de implementação tarefa-a-tarefa.
