# Debriefings — Sub-projeto 1: Identidade Comercial + Gating de Backend

**Data:** 2026-06-02
**Subsistema:** Debriefings (1º de 5 sub-projetos)
**Status:** spec aprovada, plano e implementação na sequência
**Escopo:** identidade do time comercial + scope estendido no backend + gating dos endpoints. Sem UI nova do Debriefing — sub-projeto 2 entrega login dedicado, layouts e migração da tela atual.

---

## 1. Objetivo

Permitir que a FLG cadastre time comercial novo (Membros e Diretores Comerciais) reusando toda a infra atual de colaboradores. Backend passa a saber quem pode ver o sistema principal e quem pode ver o subsistema de Debriefings, bloqueando acessos cruzados em todos os endpoints.

Este sub-projeto NÃO move funcionalidade nem cria UI nova fora da página de Colaboradores. Quem usa hoje continua usando como hoje. Comerciais cadastrados aqui só recebem convite quando sub-projeto 2 estiver pronto.

---

## 2. Decisões de design (alinhamento Pedro 2026-06-02)

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde guardar comerciais | Estender `colaboradores` com `categoria='comercial'` | Reusa modal, auto-provisioning, reset-password, validação de domínio |
| Hierarquia comercial | 2 níveis: Membro (`role='member'`) + Diretor (`role='admin'`) | Reusa enum `roles` atual sem inventar nada |
| Tela `/debriefings/login` neste sub-projeto | Não. Vai pro sub-projeto 2 | Comerciais só são convidados quando UI de Debriefing estiver pronta. Construir login agora vira "Em breve" disfarçado, e Pedro pediu pra evitar isso |
| Frontend gating (layouts) neste sub-projeto | Não. Vai pro sub-projeto 2 | Sem comerciais logados em prod ainda, o gating só importa quando o sub-projeto 2 abrir as portas |
| Mudança no Debriefing atual (dentro de Clientes) | Só gating de endpoint | Consultor perde acesso a `/debriefings/*` no backend. UI dentro de Cliente continua funcionando pra owner/diretor |
| Owner vê tudo | Sim | Pedro mantém visão total como Owner |

---

## 3. Modelo de dados

### 3.1 Migration `011-colaboradores-categoria-comercial.sql`

```sql
-- Adiciona categoria 'comercial' (time de debriefings, separado do sistema principal)
ALTER TABLE colaboradores DROP CONSTRAINT IF EXISTS colaboradores_categoria_check;
ALTER TABLE colaboradores ADD CONSTRAINT colaboradores_categoria_check
  CHECK (categoria IN ('consultor', 'diretor', 'comercial'));

COMMENT ON COLUMN colaboradores.categoria IS
  'consultor (atua no sistema principal), diretor (acesso transversal), comercial (acesso só ao subsistema de Debriefings)';
```

Aplicada via Supabase Dashboard SQL Editor (padrão da repo — VPS sem IPv6).

### 3.2 Mapeamento de papéis

| Papel funcional | `categoria` | `role` |
|---|---|---|
| Consultor | `consultor` | `member` ou `admin` |
| Diretor do sistema principal | `diretor` | `member` ou `admin` |
| Membro Comercial | `comercial` | `member` |
| Diretor Comercial | `comercial` | `admin` |
| Owner (Pedro) | qualquer | `owner` |

---

## 4. Matriz de acesso

| Categoria | Role | Sistema Principal | Sistema Debriefing | Painel Admin de Debriefing |
|---|---|---|---|---|
| `consultor` | `member`/`admin` | ✓ | ✗ | ✗ |
| `diretor` | `member`/`admin` | ✓ | ✓ | ✓ |
| `comercial` | `member` | ✗ | ✓ | ✗ |
| `comercial` | `admin` | ✗ | ✓ | ✓ |
| qualquer | `owner` | ✓ | ✓ | ✓ |

**Edição de colaboradores comerciais:**
- Diretor Comercial cria/edita Membros Comerciais (regra atual de `admin+`)
- Diretor do sistema principal (admin+) cria/edita qualquer um, inclusive comerciais
- Owner promove Diretor Comercial (regra atual de promoção a `admin`)
- Promoção a `owner` continua sendo só de Owner

---

## 5. Backend: UserScope estendido + helpers

### 5.1 `lib/auth_scope.py`

`UserScope` ganha 3 flags computadas e expõe `categoria`/`role`:

```python
@dataclass
class UserScope:
    user_id: str
    email: str
    consultor_id: Optional[str]
    categoria: Optional[str]                  # NOVO: 'consultor' | 'diretor' | 'comercial' | None
    role: str                                  # NOVO: 'member' | 'admin' | 'owner'
    can_see_all: bool                          # mantém — admin+ ou diretor (filtros admin)
    can_see_principal: bool                    # NOVO
    can_see_debriefings: bool                  # NOVO
    can_see_debriefings_admin: bool            # NOVO — painel KPIs
```

**Cálculo:**

```python
is_owner = (role == 'owner')

can_see_principal = is_owner or (categoria in ('consultor', 'diretor'))
can_see_debriefings = is_owner or (categoria in ('diretor', 'comercial'))
can_see_debriefings_admin = (
    is_owner
    or categoria == 'diretor'
    or (categoria == 'comercial' and role == 'admin')
)
```

### 5.2 Helpers de gating

```python
def require_principal(scope: UserScope) -> None:
    if not scope.can_see_principal:
        raise HTTPException(403, "Acesso restrito ao sistema principal")

def require_debriefings(scope: UserScope) -> None:
    if not scope.can_see_debriefings:
        raise HTTPException(403, "Acesso restrito ao sistema de Debriefings")

def require_debriefings_admin(scope: UserScope) -> None:
    if not scope.can_see_debriefings_admin:
        raise HTTPException(403, "Acesso restrito ao painel admin de Debriefings")
```

### 5.3 Aplicar gating em endpoints existentes

**Sistema principal — comercial passa a receber 403:**

Endpoints que servem dados do sistema principal e hoje aceitam qualquer logado (`get_current_user` direto) ganham `require_principal(scope)`. Mapeamento exato:

- `GET /clientes`, `POST /clientes`, `GET /clientes/{id}`, `PATCH /clientes/{id}`, `DELETE /clientes/{id}`
- `GET /clientes-summary`
- `GET /clientes-basic` (chamado pelo tutorial de IG — comercial não deveria abrir tutorial)
- `GET /metricas/*` (todos os endpoints do prefixo)
- `GET /encontros-base`
- `POST /admin/encontros/*` (já tem `_require_admin` próprio, manter — só somar o gate de principal)

**Aberto pra qualquer logado** (não bloquear): `GET /colaboradores`, `GET /colaboradores/me`, `GET /colaboradores/{id}` — caller precisa enxergar a lista pra qualquer função interna. POST/PATCH/DELETE já são admin+.

**Debriefings — consultor passa a receber 403:**

Todas as rotas em `routes/debriefings.py` ganham `require_debriefings(scope)` no topo do handler. As que listam ranking/KPIs (sub-projeto 5) trocam pra `require_debriefings_admin`.

### 5.4 Lookup de categoria/role

Hoje `get_user_scope` já busca `categoria` e `role` na tabela `colaboradores` mas só usa internamente. Mudança: expor no dataclass de retorno.

---

## 6. Frontend: o mínimo necessário

### 6.1 Constantes

`frontend/src/components/Colaboradores/shared/constants.js`:

```js
export const CATEGORIAS = ['consultor', 'diretor', 'comercial']  // antes: 2 itens

export const CATEGORIA_CONFIG = {
  consultor: { label: 'Consultor' },
  diretor:   { label: 'Diretor' },
  comercial: { label: 'Comercial' },                              // NOVO
}
```

### 6.2 Aba "Comerciais" em `/colaboradores`

`frontend/src/components/Colaboradores/index.jsx`:

```js
const TABS = [
  { key: 'consultores', label: 'Consultores', categoria: 'consultor' },
  { key: 'diretores',   label: 'Diretores',   categoria: 'diretor' },
  { key: 'comerciais',  label: 'Comerciais',  categoria: 'comercial' },  // NOVO
]
```

A lógica de filtro, badges e edição já é genérica pela categoria — funciona out-of-the-box.

### 6.3 Modal "Adicionar colaborador"

`ColaboradorFormModal.jsx`: dropdown de categoria ganha terceira opção `Comercial`. Sem outras mudanças.

### 6.4 `useUserScope` estendido

`frontend/src/hooks/useUserScope.js` retorna campos novos (consumidos pelos próximos sub-projetos):

```js
{
  isLoading,
  user,
  categoria,                  // NOVO
  role,                       // NOVO
  canSeePrincipal,            // NOVO
  canSeeDebriefings,          // NOVO
  canSeeDebriefingsAdmin,     // NOVO
  canSeeAll,                  // mantém
  myConsultorId,              // mantém
  myConsultorNome,            // mantém
}
```

Hoje a UI principal não usa essas flags ainda — sub-projeto 2 vai usar. Aqui só preparamos.

### 6.5 O que NÃO entra neste sub-projeto

- `/debriefings/login` — sub-projeto 2
- `MainLayout` / `DebriefingLayout` (gates de roteamento) — sub-projeto 2
- Migração da UI de Debriefing de dentro de Clientes pra `/debriefings/*` — sub-projeto 2
- Qualquer KPI/Dashboard — sub-projeto 5

---

## 7. Arquivos afetados

```
NOVO:
  docs/migrations/011-colaboradores-categoria-comercial.sql

MODIFICADO:
  backend/lib/auth_scope.py                                   # UserScope + helpers
  backend/main.py                                              # require_principal nos endpoints relevantes
  backend/routes/debriefings.py                                # require_debriefings em todas as rotas
  backend/routes/colaboradores.py                              # _validate_categoria aceita 'comercial'
  frontend/src/hooks/useUserScope.js                           # novos campos
  frontend/src/components/Colaboradores/index.jsx              # aba Comerciais
  frontend/src/components/Colaboradores/shared/constants.js    # CATEGORIAS + CATEGORIA_CONFIG
```

---

## 8. Rollout

1. Aplicar migration 011 no Supabase Dashboard
2. Deploy backend + frontend (auto via GH Actions)
3. Owner valida que ainda loga e vê tudo (não regrediu nada)
4. Owner valida em Colaboradores que apareceu a aba "Comerciais"
5. Owner cria um Diretor Comercial de teste via modal — recebe senha temp na revealmodal
6. Owner valida que consultor existente NÃO consegue mais chamar `/api/debriefings/...` (curl com Bearer do consultor → 403)
7. Owner valida que esse Diretor Comercial de teste NÃO consegue chamar `/api/clientes` (curl → 403)

Rollback: `git revert` + reverter constraint da categoria pra `IN ('consultor','diretor')` via SQL. Comerciais cadastrados ficam órfãos (linha em auth.users, sem linha em colaboradores se a row for deletada). Pra limpeza, deletar manualmente do auth.users.

---

## 9. Testes

**Backend (pytest):**

- `UserScope`: cada combinação categoria × role retorna as flags certas (matriz da seção 4)
- `require_principal` levanta 403 pra comercial e libera pra consultor/diretor/owner
- `require_debriefings` levanta 403 pra consultor e libera pra diretor/comercial/owner
- `require_debriefings_admin` levanta 403 pra membro comercial e libera pra diretor/diretor comercial/owner
- Owner passa em todos os helpers independentemente de categoria

**Frontend (esbuild + smoke manual):**

- Build passa sem erro
- Aba "Comerciais" aparece em `/colaboradores`
- Modal de adicionar colaborador mostra 3 categorias
- Selecionar categoria=Comercial e role=Admin cria registro válido + retorna senha temp

---

## 10. Out of scope (sub-projetos seguintes)

- **Sub-projeto 2**: `/debriefings/login`, `MainLayout`, `DebriefingLayout`, migração da UI de Debriefing de dentro de Clientes pra rota dedicada `/debriefings/*`. Hub do consumidor comercial.
- **Sub-projeto 3**: aba "Briefing do Consultor" abaixo de Tutoriais no sistema principal. Consultor preenche perspectiva por ciclo.
- **Sub-projeto 4**: lista filtrada por Encerrado/Renovado + ponte de status "briefing preenchido / não preenchido".
- **Sub-projeto 5**: painel admin com KPIs e ranking de geração.

Todos esses dependem deste sub-projeto entregar identidade + gating, mas são trabalho separado.

---

## 11. Notas

- Owner permanece tendo visão total mesmo se mexer em categoria/role própria — fallback hardcoded existe no `_is_owner_fallback`.
- Tabela `auth.users` (Supabase Auth) é única pros 2 sistemas. Identidade unificada é parte do que torna a ponte fluida quando sub-projetos 3-5 atribuírem ações entre categorias (ex: debriefing gerado por comercial X de cliente do consultor Y).
- Endpoint `/colaboradores` GET fica intencionalmente aberto pra qualquer logado — caller precisa ver lista pra trabalho diário e dados expostos são só nome/email/role/categoria.
- Cadastro de comerciais começa a funcionar com esse sub-projeto. **Convites efetivos só fazem sentido depois do sub-projeto 2** estar em prod (senão o comercial loga e cai em rota que não existe, porque sub-projeto 1 não cria `/debriefings/login` nem a UI interna).
