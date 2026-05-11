# Colaboradores — gestão hierárquica de operadores do sistema

**Data:** 2026-05-10
**Autor:** Brainstorm Pedro × Claude
**Status:** Aprovado pra implementação

---

## Contexto e motivação

Hoje o sistema FLG não tem nenhuma representação estruturada de quem é a equipe interna. "Consultor" existe apenas como string solta em `clientes.consultor_responsavel`, e a detecção de admin é rudimentar: `user.email.includes('pedro') || user.user_metadata.role === 'admin'` (`frontend/src/lib/utils.js:23`). Não há tabela de colaboradores, não há tiers/cargos, não há hierarquia de permissões.

Pedro quer uma nova aba **"Colaboradores"** logo abaixo de Copywriter FLG na sidebar, listando todos os operadores internos separados entre **Consultores** e **Diretores**. Admins podem editar tier, cargo e role de qualquer colaborador. Pedro é Owner do sistema, com acesso global.

**Pesquisa de mercado consultada** (Slack, Notion, Linear, HubSpot, Salesforce, GitHub Orgs, Workday): consenso é separar três conceitos ortogonais — identidade (auth), cargo (job title), permissão (role). Hierarquia leve via `manager_id`. Admin como role separada do cargo. Padrão "Owner > Admin > Member" para SaaS de operação interna (HubSpot, Linear, Notion adotam essa estrutura tri-nivelada).

---

## Arquitetura

### Decomposição ortogonal de conceitos

| Dimensão | Campo | Valores | Quem edita |
|---|---|---|---|
| **Identidade** | `email`, `nome`, `avatar_url` | livres | self + admin |
| **Categoria** (o que faz) | `categoria` | `consultor` \| `diretor` | admin |
| **Cargo** (job title) | `cargo` | texto livre | admin |
| **Tier** (seniority) | `tier` | `junior` \| `pleno` \| `senior` \| `lead` | admin |
| **Role** (permissão) | `role` | `owner` \| `admin` \| `member` | owner (exceto auto-promote para admin → outro admin) |
| **Hierarquia** | `manager_id` | FK colaborador | admin |
| **Status** | `ativo` | bool | admin (soft-delete) |

**Owner** é o nível mais alto — acesso irrestrito, pode promover/rebaixar admins, deletar permanentemente, alterar configurações de sistema. Esperado: um único Owner (Pedro). A constraint não força unicidade no banco — múltiplos owners é permitido tecnicamente (defesa em profundidade), mas a UI desencoraja.

**Admin** pode editar todos os campos exceto promover alguém para `owner`. Pode promover member → admin. Pode editar tier/cargo/categoria de qualquer um.

**Member** é o default — não vê painel de gestão de colaboradores além de listagem read-only. Pode editar APENAS o próprio perfil (nome, avatar, cargo). Não vê toggles/botões de admin.

### Backend

**Schema Supabase** (nova migration):

```sql
CREATE TABLE colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  nome text NOT NULL,
  avatar_url text,

  -- Categoria + seniority
  categoria text NOT NULL CHECK (categoria IN ('consultor', 'diretor')),
  cargo text,
  tier text CHECK (tier IS NULL OR tier IN ('junior', 'pleno', 'senior', 'lead')),

  -- Hierarquia opcional
  manager_id uuid REFERENCES colaboradores(id) ON DELETE SET NULL,

  -- RBAC
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),

  -- Soft-delete
  ativo boolean NOT NULL DEFAULT true,

  -- Integração futura (Phase opcional)
  clickup_user_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_colaboradores_email      ON colaboradores(email);
CREATE INDEX idx_colaboradores_categoria  ON colaboradores(categoria);
CREATE INDEX idx_colaboradores_role       ON colaboradores(role);
CREATE INDEX idx_colaboradores_ativo      ON colaboradores(ativo) WHERE ativo = true;

ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;
```

**Seed inicial** (executado pelo backend ao subir, idempotente):
- Pedro (`pedroaranda@grupoguglielmi.com`) inserido como `owner`, categoria=`diretor`, ativo=true.

**Endpoint REST** em `backend/routes/colaboradores.py`:

```
GET    /colaboradores                      — lista (todos autenticados, filtros: ?categoria=, ?role=, ?ativo=, ?tier=)
GET    /colaboradores/{id}                 — detalhe
GET    /colaboradores/me                   — perfil do usuário logado (auto-resolve via email)
POST   /colaboradores                      — criar (admin+)
PATCH  /colaboradores/{id}                 — editar
DELETE /colaboradores/{id}                 — soft-delete (ativo=false; owner only para hard-delete futuro)
```

**Permissões na camada de endpoint** (lib `_require_role(user, "admin")`):
- `GET *` — qualquer logado
- `POST` — admin+
- `PATCH` — admin+ pode editar qualquer um; member só pode editar próprio registro (subset de campos: `nome`, `avatar_url`, `cargo`)
- `DELETE` — admin+
- Promoção `role: member → admin` requer admin+. Promoção para `owner` requer owner. Tentativa de não-owner promover alguém para owner → HTTP 403.

**Sincronização DB → Auth metadata**: quando colaborador tem `role` alterada (PATCH), o backend atualiza `auth.users.user_metadata.role` correspondente. Isso mantém o `isAdmin()` do frontend (que lê `user_metadata.role`) sincronizado sem precisar refatorar tudo agora. Owner também escreve `role='owner'` no metadata para futura distinção UI.

### Frontend

**Nova rota** `/colaboradores` registrada em `App.jsx` (lazy import).

**Sidebar** ([`frontend/src/components/layout/Sidebar.jsx`](frontend/src/components/layout/Sidebar.jsx)): adicionar item `{ icon: UserCog, label: 'Colaboradores', path: '/colaboradores' }` em **ambos** `consultantNav` e `adminNav`, posição imediatamente após "Copywriter FLG" (índice 6). Item visível a todos os logados (não fica em `adminOnlyNav`).

**Estrutura de pastas** (mesmo padrão de `Metricas/` e `Ranking/`):

```
frontend/src/components/Colaboradores/
  index.jsx                  # layout + tabs + fetch
  ColaboradoresConsultores.jsx
  ColaboradoresDiretores.jsx
  shared/
    ColaboradorRow.jsx       # row da tabela com edição inline (admin only)
    ColaboradorFormModal.jsx # modal criar/editar
    TierBadge.jsx            # badge colorido pro tier
    RoleBadge.jsx            # badge Owner/Admin/Member
    constants.js             # TIER_CONFIG, ROLE_CONFIG, CATEGORIA_CONFIG
```

**Layout da página:**

1. **Header** — título "Colaboradores", subtítulo dinâmico por aba, botão "+ Adicionar colaborador" (visível só admin+).
2. **Tabs** — `Consultores | Diretores` (URL `?tab=consultores|diretores`, mesmo padrão do Ranking).
3. **Filtros** — busca por nome/email, dropdown de tier, checkbox "só admins/owners".
4. **Tabela** — colunas:
   - Avatar + Nome + e-mail
   - Cargo (texto)
   - Tier (badge colorido: Júnior cinza, Pleno azul, Sênior dourado, Lead roxo)
   - Role (badge: Owner com ícone coroa, Admin com ícone escudo, Member sem badge)
   - Manager (nome do gestor, se houver)
   - Ações (admin+: ícone "editar" abre modal; ícone "desativar" com confirmação)
5. **Empty state** — quando categoria vazia.

**Modal criar/editar** — campos: nome, email (read-only no edit), categoria (dropdown), cargo (input), tier (dropdown), role (dropdown — owner desabilitado se editor não é owner), manager_id (autocomplete por nome de colaborador da mesma ou maior categoria), avatar URL.

**Permissões UI** — `isOwner(user)` e `isAdmin(user)` derivados de `user_metadata.role`. Botões de ação condicionais:
- Member: vê tabela, não vê botões de edição. Vê "Editar meu perfil" só na própria linha.
- Admin: vê todos os botões exceto "promover a Owner" (desabilitado com tooltip).
- Owner: vê tudo.

**isOwner** novo helper em [`frontend/src/lib/utils.js`](frontend/src/lib/utils.js):
```javascript
export function isOwner(user) {
  return user?.user_metadata?.role === 'owner'
}
```

E `isAdmin` ampliado para considerar owner também:
```javascript
export function isAdmin(user) {
  const role = user?.user_metadata?.role
  return role === 'admin' || role === 'owner' || user?.email?.includes('pedro')  // fallback legacy
}
```

---

## Modelo de dados — premissas

### "Cargo" vs "Categoria"

- **Categoria** é a dimensão organizacional macro (Consultor ou Diretor) que separa as abas.
- **Cargo** é o título descritivo dentro daquela categoria. Texto livre. Ex: Consultora de Performance, Diretora de Operações, Consultor Sênior de Branding.

Não pré-definimos cargos — admin digita livre. Se a operação ganhar escala, futuro: tabela `cargos` ou dropdown com sugestões. Por enquanto YAGNI.

### Tier

Quatro níveis fixos: `junior`, `pleno`, `senior`, `lead`. Cobre o range típico. Sem numérico (T1-T5) por enquanto. Se Pedro quiser depois trocar pra numérico ou expandir, é só editar `TIER_CONFIG` + atualizar CHECK constraint.

### Owner — singleton ou múltiplo?

Permitir múltiplos no schema (sem UNIQUE), porque:
1. Defesa em profundidade — se Pedro perder acesso, alguém pode ser promovido.
2. Empresas crescem — coordenação multi-founder é caso real.
3. UI ainda assim **encoraja singleton** — badge "Owner" exibido com aviso de unicidade quando existe mais de um.

### Sync DB → Auth metadata

Não usamos `auth.users` como source of truth de role porque Supabase Auth não tem CRUD UI viável fora do dashboard. DB é o source of truth, Auth metadata é mirror para o frontend ler sem precisar de query extra. Sincronização one-way em cada `PATCH /colaboradores/{id}` que muda role.

Mismatch possível: se admin altera role diretamente no Supabase dashboard ignorando o app, sai dessincronizado. Aceitável — admin tem acesso ao dashboard de qualquer jeito. Não tem rate limit / consistency crítico em jogo.

### Email = chave de junção com auth

Colaborador é criado APÓS o usuário fazer signup no Supabase Auth (caso contrário, o registro flutua sem login possível). O endpoint `POST /colaboradores` valida que existe um `auth.users` com aquele email — se não existir, retorna 400 sugerindo "convide o usuário pelo Supabase Auth primeiro".

Futuro (não nessa entrega): botão "Convidar" que dispara `supabase.auth.admin.inviteUserByEmail()` antes de criar o colaborador.

---

## Decomposição em fases

| Fase | Escopo | Estimativa |
|---|---|---|
| **1** | Schema Supabase (migration via SQL editor — VPS sem IPv6) + seed do Pedro como owner + endpoint CRUD básico (`GET/POST/PATCH/DELETE /colaboradores`) com checks de permissão + sync role → auth metadata | ~4h |
| **2** | Frontend pasta `Colaboradores/` + rota + sidebar entry + tabs Consultores/Diretores + tabela read-only consumindo `GET /colaboradores` | ~3h |
| **3** | Modal criar/editar + permissões UI (botões condicionais por role) + badges visuais (tier, role) + filtros (busca, tier, só admins) | ~4h |
| **4** | Polish — empty states, loading, responsive, ícones na sidebar (`UserCog`), `isOwner()` helper, ajuste `isAdmin()` legacy fallback, smoke test em produção | ~2h |
| **5** | (opcional) Botão "Sync ClickUp" — popula colaboradores iniciais a partir do workspace ClickUp (`clickup_get_workspace_members`) com mapping manual de categoria | ~2h |

**Total Phase 1-4 obrigatórias: ~13h, ~2 dias.** Phase 5 pode entrar quando Pedro decidir.

---

## Trade-offs e alternativas consideradas

### Tabela separada `colaboradores` vs colunas extras em `auth.users`
- **Escolhido**: tabela separada.
- **Razão**: Supabase Auth `users` é gerenciado pelo Supabase, não customizamos sem complicar. Tabela própria é o padrão (mesmo Supabase recomenda `public.profiles` linked by email/id).

### Email vs Supabase auth user id como FK
- **Escolhido**: email como join key (UNIQUE).
- **Razão**: email é estável, humano-legível, fácil debug. UUID do Supabase Auth funciona mas força query extra pra resolver. Email funciona pro nosso volume (dezenas de colaboradores, não milhões).

### Role como enum único vs flags booleanas
- **Escolhido**: enum `('owner', 'admin', 'member')`.
- **Razão**: roles são mutuamente exclusivas (não faz sentido owner+admin). Booleanos seriam `is_owner`/`is_admin` independentes → permite estado inválido (admin sem ser member). Enum força exclusividade.

### Categoria + Tier como tabelas separadas vs CHECK enum
- **Escolhido**: CHECK enum inline.
- **Razão**: 2 categorias e 4 tiers são valores fixos baixos. Tabelas separadas seriam over-engineering YAGNI. Se Pedro quiser editar valores pela UI no futuro, vira tabela.

### Hierarquia (`manager_id`) — incluir agora ou depois?
- **Escolhido**: campo no schema agora, UI não usa ainda.
- **Razão**: schema migration é custoso (VPS sem IPv6 → manual no Supabase dashboard). Adicionar coluna depois exige migration nova. UI pode ignorar agora sem custo.

---

## Riscos identificados

1. **VPS sem IPv6 → migration manual**. Igual problema documentado em `vps_supabase_ipv6_issue.md`. Mitigação: rodar SQL via Supabase Dashboard, validar via `select` antes de subir backend novo. Plan de Phase 1 inclui essa etapa explicitamente.

2. **Sync role DB → Auth metadata pode falhar silenciosamente** se token da service role do Supabase estiver com escopo errado. Mitigação: log + alerta em caso de falha, e fallback de `isAdmin()` legacy (`email.includes('pedro')`) mantém Pedro com acesso até DB ser corrigido.

3. **Colaborador existente sem signup no Auth** = registro órfão. Mitigação: validação na criação. Em produção: alerta visual "este colaborador não tem login ainda — convide pelo Supabase Auth".

4. **Race: dois admins editando mesmo colaborador**. Aceito — last-write-wins. UI atualiza após save bem-sucedido.

5. **Pedro perde acesso ao Auth metadata e fica trancado fora**. Mitigação: fallback `email.includes('pedro')` em `isAdmin` (já existe). Plus: SQL no Supabase dashboard sempre disponível como escape hatch.

---

## Testing manual (UAT)

Validação por fase:

- **Phase 1**: `curl GET /colaboradores` (autenticado) retorna lista com pelo menos Pedro (`role=owner`). `POST /colaboradores` com payload válido cria registro. `PATCH` muda role e reflete em `user_metadata.role` no dashboard Auth. Tentativa não-admin de POST retorna 403.
- **Phase 2**: Sidebar mostra "Colaboradores" abaixo de Copywriter FLG. Click navega `/colaboradores`. Tabela carrega, abas Consultores/Diretores funcionam, URL muda com `?tab=`.
- **Phase 3**: Botão "+ Adicionar" visível só pro admin. Modal abre, formulário valida (email obrigatório, categoria obrigatória), submit cria colaborador e ele aparece na lista. Edição funciona. Badges de tier/role aparecem corretas. Filtros funcionam.
- **Phase 4**: Mobile responsivo (375px), empty state quando aba vazia, loading skeleton aparece, ícone `UserCog` na sidebar visível, `isOwner()` funciona pra esconder botões de promover a owner pra não-owners.

---

## Out of scope

- Sync ClickUp ↔ colaboradores (Phase 5 opcional)
- Convite por email (botão "Convidar" que dispara `auth.admin.inviteUserByEmail`)
- Org-chart visual (D3/recharts tree) usando `manager_id`
- Auditoria de quem editou o quê (audit log)
- Permissões granulares por feature (ex: "este admin não pode editar finance"); por enquanto admin é admin all-or-nothing
- Foto upload — só URL externa por enquanto (frontend usa `Avatar` que gera iniciais se não tiver URL)
- Notificação ao colaborador quando muda role/tier
- API de busca full-text (filtro client-side é suficiente pro volume)
