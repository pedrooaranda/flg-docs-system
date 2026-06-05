# Subsistema Comercial — Sub-projeto 2: Tela de Login, Layouts e Migração da UI

**Data:** 2026-06-05
**Status:** Aprovado pelo Pedro durante brainstorming (5/5 seções)
**Plano de implementação:** a ser criado via `superpowers:writing-plans`
**Depende de:** Sub-projeto 1 já em produção (`docs/superpowers/specs/2026-06-02-debriefing-subproject-1-roles-auth-design.md`)

---

## 1. Objetivo

Entregar a porta de entrada e a UI dedicada do **Sistema de Debriefings (FLG Comercial)** como aplicação visualmente separada do sistema principal, aproveitando o gating de backend já em produção (sub-projeto 1).

Três entregáveis:

1. Tela `/debriefings/login` com branding explícito **FLG Comercial**
2. Camada de gating de rota no frontend (`MainLayout` + `DebriefingLayout`) — comercial nunca acessa rotas do sistema principal e vice-versa
3. Migração do hub de Debriefings que hoje é uma aba dentro do `PerfilCliente.jsx` pra rota dedicada `/debriefings/cliente/:id`, preservando funcionalidade

Fora de escopo deste sub-projeto: lista filtrada por Encerrado/Renovado + status de briefing (sub-projeto 4); aba "Briefing do Consultor" abaixo de Tutoriais (sub-projeto 3); painel admin com KPIs (sub-projeto 5).

## 2. Contexto: o que sub-projeto 1 já entregou

Em produção desde 2026-06-05:

- `categoria='comercial'` no enum de `colaboradores` (migration 011 aplicada)
- `UserScope` com 3 flags: `can_see_principal`, `can_see_debriefings`, `can_see_debriefings_admin`
- Helpers `require_principal`, `require_debriefings`, `require_debriefings_admin` em `backend/lib/auth_scope.py`
- Gating backend aplicado: `/clientes/*` + `/metricas/*` com `require_principal`; `/debriefings/*` com `require_debriefings`
- `/me/scope` aberto pra qualquer logado
- Frontend: aba "Comerciais" em `/colaboradores`, modal aceita `categoria=Comercial`, `useUserScope` expõe `canSeePrincipal`, `canSeeDebriefings`, `canSeeDebriefingsAdmin`

**Matriz de acesso vigente:**

| Categoria | Role | Sistema Principal | Sistema Debriefing |
|---|---|---|---|
| consultor | member/admin | ✓ | ✗ |
| diretor | member/admin | ✓ | ✓ |
| comercial | member | ✗ | ✓ |
| comercial | admin | ✗ | ✓ + painel admin |
| qualquer | owner | ✓ | ✓ |

## 3. Decisões já tomadas no brainstorming

Confirmadas pelo Pedro durante o fluxo (`superpowers:brainstorming`):

1. **Home `/debriefings`** — lista simples de TODOS os clientes ativos (sem filtros nem badges). Sub-projeto 4 vai refinar com filtro Encerrado/Renovado + badge "briefing preenchido".
2. **Aba "Debriefings" dentro de `/clientes/:id`** — some completamente. No lugar, aparece um botão **"Abrir Debriefings deste cliente"** no header do perfil, visível só pra quem tem `canSeeDebriefings === true`. Click navega pra `/debriefings/cliente/:id`. Hub fica num único lugar (sem duplicação).
3. **Branding tela de login** — opção A do mockup: eyebrow gold "FLG BRASIL · COMERCIAL" + título h1 grande "FLG Comercial" + subtítulo "Hub de Debriefings". Mesmo dark + gold + glow radial do `/login` atual.

## 4. Estrutura de rotas

### Públicas (sem auth)

```
/login                                             tela atual (não muda)
/debriefings/login                                 NOVA
```

### Sistema Principal (gate `canSeePrincipal`)

Todas as rotas atuais ficam dentro do `MainLayout`:

```
/                                                  Dashboard
/clientes · /clientes/novo · /clientes/:id · /clientes/:id/encontro/:n
/metricas/*
/ranking
/materiais · /materiais/cliente/:cid · (redirects de paths antigos)
/colaboradores
/tutoriais/* · /configuracoes
[todas as demais rotas autenticadas atuais]
```

### Sistema Debriefing (gate `canSeeDebriefings`)

```
/debriefings                                       NOVA — home (lista clientes ativos)
/debriefings/cliente/:id                           NOVA — hub do cliente (UI atual movida)
/debriefings/cliente/:id/:debriefingId             NOVA — viewer
```

## 5. Tela `/debriefings/login`

Novo componente `frontend/src/components/Debriefings/DebriefingLogin.jsx`.

**Layout (opção A do mockup):**

```
┌──────────────────────────────────┐
│         [logo-flg.png]           │
│                                  │
│   FLG BRASIL · COMERCIAL  ← gold │
│                                  │
│       FLG Comercial              │
│       (Fraunces, h1)             │
│                                  │
│   Hub de Debriefings             │
│   (subtitle, cinza/55%)          │
│                                  │
│   ┌────────────────────────┐    │
│   │  E-mail                │    │
│   │  Senha                 │    │
│   │  [    ENTRAR    ]      │    │
│   └────────────────────────┘    │
└──────────────────────────────────┘
```

**Comportamento:**

- Reusa o glow radial gold + dark do `Login.jsx` atual
- Form aciona `supabase.auth.signInWithPassword({ email, password })`
- Após sucesso: lê `useUserScope`
  - Se `canSeeDebriefings === true` → `navigate('/debriefings')`
  - Se `canSeeDebriefings === false` → mensagem inline "Esta entrada é do time comercial. Use o login principal." + botão "Ir pra /login"
- Sem link "criar conta" (admin cria via Colaboradores)
- Sem link "esqueci senha" nesta versão (admin reseta pelo modal existente em Colaboradores → password reveal)

## 6. Layouts e gating de rota

Dois wrappers em `frontend/src/layouts/`:

```
frontend/src/layouts/MainLayout.jsx
frontend/src/layouts/DebriefingLayout.jsx
```

### MainLayout

```jsx
export default function MainLayout() {
  const { isLoading, error, canSeePrincipal } = useUserScope()
  if (isLoading) return <PageSpinner />
  if (error) return <Navigate to="/login" replace />
  if (!canSeePrincipal) {
    return <Navigate to="/debriefings/login" replace
                     state={{ toast: 'Sua conta é do sistema de Debriefings' }} />
  }
  return <Layout><Outlet /></Layout>   // Layout = sidebar/header atual
}
```

### DebriefingLayout

```jsx
export default function DebriefingLayout() {
  const { isLoading, error, canSeeDebriefings } = useUserScope()
  if (isLoading) return <PageSpinner />
  if (error) return <Navigate to="/debriefings/login" replace />
  if (!canSeeDebriefings) {
    return <Navigate to="/login" replace
                     state={{ toast: 'Esse sistema é restrito ao time comercial e diretoria' }} />
  }
  return <Outlet />   // por enquanto sem chrome próprio; sub-projeto 4 adiciona sidebar/header do Debriefing
}
```

### Toasts pós-redirect

`Login.jsx` e `DebriefingLogin.jsx` leem `useLocation().state?.toast` no mount e disparam toast via `useToast()` se houver. Limpam o state após exibir pra evitar reaparecer em re-render.

### Reorganização do `App.jsx`

Substitui o padrão atual de `<AuthGuard>` em cada rota por agrupamento em layouts:

```jsx
<Routes>
  {/* Públicas */}
  <Route path="/login" element={<Login />} />
  <Route path="/debriefings/login" element={<DebriefingLogin />} />
  <Route path="/legal/:page" element={<LegalPage />} />
  <Route path="/conectar-instagram/:clienteId" element={<ConectarInstagram />} />

  {/* Sistema Principal */}
  <Route element={<MainLayout />}>
    <Route index element={<Dashboard />} />
    <Route path="/clientes" element={<Clientes />} />
    <Route path="/clientes/novo" element={<NovoCliente />} />
    <Route path="/clientes/:clientId" element={<PerfilCliente />} />
    <Route path="/clientes/:clientId/encontro/:encontroNum" element={<PreparacaoEncontro />} />
    <Route path="/metricas" element={<Metricas />}>
      <Route index element={<MetricasGeral />} />
      ... (sub-rotas atuais)
    </Route>
    <Route path="/ranking" element={<Ranking />} />
    <Route path="/materiais" element={<MateriaisHome />} />
    ... (demais rotas atuais)
  </Route>

  {/* Sistema Debriefing */}
  <Route element={<DebriefingLayout />}>
    <Route path="/debriefings" element={<DebriefingsHome />} />
    <Route path="/debriefings/cliente/:id" element={<ClienteHub />} />
    <Route path="/debriefings/cliente/:id/:debriefingId" element={<Viewer />} />
  </Route>
</Routes>
```

### Tratamento do `AuthGuard` atual

O componente `AuthGuard` hoje encapsula: (a) checar sessão, (b) chamar `<Layout title={...}>` com sidebar/header, (c) `<Suspense>` com `<PageSpinner />`. O `MainLayout` substitui essas três responsabilidades. `AuthGuard` é removido após a migração — qualquer rota órfã que ainda o referencie passa a usar `MainLayout`.

`title` que era prop do `AuthGuard` migra pra propriedade da rota ou é lido do path dentro do `Layout` (mantém comportamento atual de `<title>` do browser).

### Defesa em profundidade

Backend (sub-projeto 1) já bloqueia acesso cruzado com 403. Se o gate frontend falhar, requests caem em erro e UI mostra mensagem. Não é única camada de proteção.

## 7. Estrutura dos componentes Debriefings

```
frontend/src/components/Debriefings/
├── DebriefingLogin.jsx           NOVO — tela /debriefings/login (seção 5)
├── DebriefingsHome.jsx           NOVO — home /debriefings (lista clientes ativos)
├── ClienteHub.jsx                MOVIDO — era index.jsx
├── Viewer.jsx                    SEM MUDANÇA
├── StreamPanel.jsx               SEM MUDANÇA
└── NovoDebriefingModal.jsx       SEM MUDANÇA
```

### `DebriefingsHome.jsx`

- Chama endpoint existente `/api/clientes-basic` (já retorna id + nome + empresa + categoria/status; respeitando RLS do sub-projeto 1 — backend filtra por persona)
- Renderiza grid de cards: nome do cliente + empresa. Sem métricas IG. Sem filtros.
- Click no card → `navigate('/debriefings/cliente/' + id)`
- Loading: skeleton de cards. Empty: mensagem "Nenhum cliente disponível no momento."
- **Importante**: o backend hoje já retorna lista filtrada por persona (comercial vê o que admin liberar via futuras tabelas; por ora vê todos os clientes ativos que o gating backend não bloqueia explicitamente). Comportamento exato será verificado durante implementação — se necessário ajustar backend pra liberar `/clientes-basic` ao comercial (não está em `require_principal` hoje, pois é endpoint de listagem mínima usado em vários lugares).

> **Nota de implementação:** verificar durante o plano se `/api/clientes-basic` está gateado por `require_principal` (sub-projeto 1 listou todos os endpoints `/clientes/*`). Se sim, criar variante `/api/clientes-basic-for-debriefings` com `require_debriefings`, ou trocar gate do endpoint atual pra um mais permissivo que aceite ambas as personas (decisão durante implementação com base no código atual).

### `ClienteHub.jsx` (movido de `index.jsx`)

- Ajustar `const { clientId } = useParams()` → `const { id: clientId } = useParams()` (a rota usa `:id`)
- Toda lógica interna (lista de debriefings por ciclo, botão "Novo debriefing", modal `NovoDebriefingModal`, link pro viewer, botão "Baixar PDF") permanece igual
- Links internos atualizam: navegação pro viewer passa de `/clientes/:id/debriefings/:debriefingId` pra `/debriefings/cliente/:id/:debriefingId`
- Adicionar breadcrumb/back-button "← Voltar pra todos os clientes" no topo (link pra `/debriefings`)
- Auditoria de links hardcoded: grep por `/clientes/` dentro de `Debriefings/` durante implementação; reescrever pra `/debriefings/cliente/...`

### `Viewer.jsx`

Recebe `debriefingId` via params. Sem mudança de lógica. URL atualiza pra `/debriefings/cliente/:id/:debriefingId`. Botão "voltar" navega pra `/debriefings/cliente/:id` (era `/clientes/:id` antes — usa `useNavigate(-1)` ou hardcoded; verificar).

## 8. Mudança no `PerfilCliente.jsx`

**Hoje** (linhas relevantes):

```jsx
import DebriefingsHub from './Debriefings'   // L13

const tabs = [
  ...
  { value: 'debriefings', label: 'Debriefings' },   // L332
]

<Tabs.Content value="debriefings">
  <DebriefingsHub />                                 // L415-416
</Tabs.Content>
```

**Mudança:**

1. Remover import `DebriefingsHub`
2. Remover entrada `{ value: 'debriefings', ... }` do array `tabs`
3. Remover `<Tabs.Content value="debriefings">`
4. Adicionar botão **"Abrir Debriefings deste cliente"** no header do perfil (ao lado/abaixo do nome do cliente), no mesmo bloco do título da página
   - Visível só se `useUserScope().canSeeDebriefings === true`
   - Ícone `FileText` da `lucide-react`
   - `onClick` → `navigate('/debriefings/cliente/' + clientId)`

Quem não tem permissão simplesmente não vê o botão (sem placeholder ou disabled — Consultor não precisa saber que existe).

## 9. Out of scope (não muda neste sub-projeto)

- Lista de clientes filtrada por status (Encerrado/Renovado) e badges de status de briefing — sub-projeto 4
- Aba "Briefing do Consultor" abaixo de Tutoriais no sistema principal — sub-projeto 3
- Painel admin de Debriefing com KPIs e ranking de comerciais — sub-projeto 5
- Sidebar/header próprio do `DebriefingLayout` — pode ser adicionado em sub-projeto futuro; por ora, `DebriefingLayout` renderiza só `<Outlet />` sem chrome (visual minimalista)
- Reset de senha self-service na tela `/debriefings/login` — admin reseta via Colaboradores
- Migration de banco — sub-projeto 2 é só frontend + reorganização de rotas

## 10. Ordem de implementação sugerida

1. **Layouts:** criar `MainLayout` + `DebriefingLayout`, reorganizar `App.jsx`, remover/inlinar `AuthGuard`. Smoke: tudo continua funcionando pro user logado atual (Owner).
2. **Tela de login:** criar `DebriefingLogin.jsx`. Smoke: rota `/debriefings/login` renderiza, mas não tem onde ir (rotas debriefings ainda não existem; redirect cai em `/debriefings/login` em loop — aceitável temporariamente até passo 3, ou usar `navigate('/')` provisório).
3. **Rotas Debriefings:** criar `DebriefingsHome.jsx`, mover `Debriefings/index.jsx` → `Debriefings/ClienteHub.jsx`, ajustar imports, atualizar rotas no `App.jsx` pra apontar pros nomes novos. Smoke: Owner navega `/debriefings`, vê grid, clica num cliente, abre o hub, abre um debriefing.
4. **Toasts de redirect:** instrumentar `Login` e `DebriefingLogin` pra ler `location.state.toast`.
5. **PerfilCliente:** remover aba, adicionar botão no header. Smoke: Owner abre `/clientes/:id`, vê botão "Abrir Debriefings", clica, cai no hub do cliente.
6. **Smoke matriz completa:**
   - **Owner**: nada quebrou; vê botão no PerfilCliente; navega `/debriefings` sem erro
   - **Diretor**: idem Owner
   - **Consultor**: não vê botão no PerfilCliente; digitar `/debriefings` redireciona pra `/login` com toast
   - **Comercial de teste** (criar 1 via Colaboradores): loga em `/debriefings/login`, cai em `/debriefings`, vê clientes, navega pra hub, vê viewer; digitar `/clientes` redireciona pra `/debriefings/login` com toast

## 11. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Bookmarks antigos de `/clientes/:id?tab=debriefings` | Aba some, perfil abre normal sem aba selecionada. Sem redirect — usuário clica no botão se quiser. Aceitável. |
| Links hardcoded `/clientes/:id/debriefings/...` dentro de `Debriefings/*` componentes | Grep durante implementação, atualizar pra `/debriefings/cliente/:id/...` |
| `/api/clientes-basic` gateado por `require_principal` impede comercial de ver home | Verificar durante implementação; criar variante ou trocar gate (nota na seção 7) |
| Loop infinito de redirect (`/login` → `/debriefings/login` → `/login`) | `useUserScope` carrega 1 vez; layouts esperam `isLoading`. Após carregado, decisão é determinística. Toast só dispara após confirmar destino correto. |
| Rotas órfãs com `<AuthGuard>` que não foram migradas | Build esbuild rejeita import quebrado; teste manual cobre rotas-chave do passo 6 |
| Comercial digita URL do sistema principal e backend retorna 403 antes do redirect | UI mostra erro feio. Mitigação: gate frontend redireciona antes da chamada. Defesa em profundidade — backend protege se gate falhar. |

## 12. Critérios de aceitação

- [ ] Owner consegue logar em `/login`, navegar por todo o sistema principal, abrir `/clientes/:id`, ver botão "Abrir Debriefings", clicar, abrir hub do cliente, abrir um debriefing existente
- [ ] Owner consegue logar em `/debriefings/login` e cair em `/debriefings`
- [ ] Diretor: mesma matriz de testes do Owner passa
- [ ] Consultor: logado em `/login`, NÃO vê botão "Abrir Debriefings" no PerfilCliente; digitar `/debriefings` na URL redireciona pra `/login` com toast explicativo
- [ ] Comercial (teste): logado em `/debriefings/login`, NÃO consegue acessar `/clientes` ou `/metricas` (redireciona pra `/debriefings/login` com toast); consegue navegar `/debriefings` → `/debriefings/cliente/:id` → `/debriefings/cliente/:id/:debriefingId`
- [ ] Build esbuild limpa no frontend (`npm run build` exit 0)
- [ ] Suite de testes backend continua em 83/5 (ou melhor — não há mudança de backend planejada)
- [ ] Deploy em prod e smoke manual do Pedro passam

---

**Próximo passo:** invocar `superpowers:writing-plans` pra criar o plano de implementação tarefa-a-tarefa, executável via `superpowers:subagent-driven-development`.
