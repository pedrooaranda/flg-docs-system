# Plano de Arquitetura — Novo Projeto FLG (Subdomínio)

**Data:** 08/04/2026
**Objetivo:** Criar um segundo sistema FLG com subdomínio independente, mantendo 100% do padrão visual, tech stack e qualidade do sistema principal.

---

## Decisão Arquitetural: Repositório Separado

### Por que NÃO subpasta/monorepo?
- Git histories misturados → merge conflicts
- Deploy acoplado → push no projeto A pode rebuildar projeto B
- Docker Compose compartilhado → risco de derrubar sistema principal
- APScheduler/lifespan conflitantes

### Por que repositório separado + regras compartilhadas?
- **Zero impacto** no sistema principal
- Deploy totalmente independente (workflow próprio)
- Context window limpa no Claude Code (sem carregar código irrelevante)
- Subdomínio próprio no Traefik (ex: `app2.foundersledgrowth.online`)
- Regras de design compartilhadas via symlinks (DRY)

---

## Estrutura de Diretórios

```
/Users/usuario/Documents/Pedro Aranda/Pedro Aranda FLG/
│
├── documentos_oficiais/              ← Repo 1 (sistema principal - Jornada System)
│   ├── .claude/
│   │   └── rules/
│   │       └── shared/              ← symlink para ../../flg-shared-rules/
│   ├── backend/
│   ├── frontend/
│   └── CLAUDE.md
│
├── flg-shared-rules/                 ← Regras compartilhadas (pasta local, não é repo)
│   ├── design-system.md              ← Paleta, tipografia, componentes, CSS variables
│   ├── tech-stack.md                 ← FastAPI, Supabase, React, Tailwind, padrões
│   ├── code-style.md                 ← Convenções de código, imports, naming
│   └── deploy-patterns.md            ← Docker, Traefik, GitHub Actions, VPS
│
└── [novo-projeto]/                   ← Repo 2 (novo sistema)
    ├── .claude/
    │   ├── CLAUDE.md                 ← Instruções específicas do novo projeto
    │   └── rules/
    │       └── shared/              ← symlink para ../../flg-shared-rules/
    ├── backend/
    │   ├── main.py
    │   ├── config.py
    │   ├── deps.py
    │   ├── routes/
    │   ├── services/
    │   ├── requirements.txt
    │   └── Dockerfile
    ├── frontend/
    │   ├── src/
    │   │   ├── components/
    │   │   │   ├── layout/          ← Sidebar, Topbar, Layout (copiados e adaptados)
    │   │   │   └── ui/              ← Avatar, Badge, Spinner, Skeleton (idênticos)
    │   │   ├── contexts/
    │   │   │   ├── AppContext.jsx
    │   │   │   └── ThemeContext.jsx  ← Idêntico (dark/light toggle)
    │   │   ├── lib/
    │   │   │   ├── api.js           ← Idêntico (padrão de fetch com auth)
    │   │   │   ├── supabase.js
    │   │   │   ├── utils.js
    │   │   │   └── toast.js
    │   │   ├── hooks/
    │   │   ├── index.css            ← Idêntico (CSS variables, tema claro/escuro)
    │   │   └── App.jsx
    │   ├── tailwind.config.js       ← Idêntico (gold palette, fonts, animations)
    │   ├── package.json
    │   ├── Dockerfile
    │   └── nginx.conf
    ├── docker-compose.yml
    ├── .github/workflows/deploy.yml
    └── .env
```

---

## Passo a Passo de Implementação

### Fase 1 — Preparação (5 min)

```bash
# 1. Criar pasta de regras compartilhadas
mkdir -p "/Users/usuario/Documents/Pedro Aranda/Pedro Aranda FLG/flg-shared-rules"

# 2. Criar regras (Claude Code faz isso)

# 3. Criar symlink no projeto principal
mkdir -p "/Users/usuario/Documents/Pedro Aranda/Pedro Aranda FLG/documentos_oficiais/.claude/rules"
ln -s "../../../flg-shared-rules" "/Users/usuario/Documents/Pedro Aranda/Pedro Aranda FLG/documentos_oficiais/.claude/rules/shared"
```

### Fase 2 — Criar Regras Compartilhadas

**design-system.md** — O documento mais importante:
- CSS variables completas (dark + light)
- Paleta gold: #C9A84C, #F5D68A, #8B6914
- Light mode: #0A0A0A text, #F5F3EF bg, #8B6914 gold
- Tipografia: Playfair Display (display), Poppins (body)
- Utility classes: card-flg, btn-gold, btn-ghost, input-flg, gold-text, gold-gradient
- Componentes base: Avatar, Badge, Spinner, Skeleton
- Padrões de layout: Sidebar colapsável + Topbar + main scroll
- Animações: framer-motion fade-in, slide-in, pulse-gold

**tech-stack.md** — Stack obrigatória:
- Backend: FastAPI + Supabase (PostgreSQL + Auth + Realtime + Storage)
- Frontend: React 18 + Vite + Tailwind CSS 3
- State: useReducer + Context (AppContext pattern)
- Auth: Supabase JWT + get_current_user dependency
- Real-time: Supabase Realtime channels
- UI: Radix UI primitives + Framer Motion + Lucide icons + Recharts
- Deploy: Docker Compose + Traefik reverse proxy + GitHub Actions

**code-style.md** — Convenções:
- Python: async def handlers, Pydantic models, type hints
- React: function components, hooks, lazy loading
- CSS: CSS variables > Tailwind classes > inline styles (nessa ordem)
- API: /recurso (GET list), /recurso/{id} (GET one), POST/PATCH/DELETE
- Naming: snake_case Python, camelCase JS, kebab-case CSS

**deploy-patterns.md** — Infraestrutura:
- VPS: root@72.61.54.192
- Traefik: proxy reverso com HTTPS automático (Let's Encrypt)
- Docker Compose: backend + frontend containers
- GitHub Actions: push to main → detect changes → selective rebuild → healthcheck → rollback on failure

### Fase 3 — Criar Novo Repositório

```bash
# No GitHub
gh repo create pedrooaranda/[nome-novo-projeto] --private

# Local
cd "/Users/usuario/Documents/Pedro Aranda/Pedro Aranda FLG"
git clone https://github.com/pedrooaranda/[nome-novo-projeto].git

# Symlink para regras compartilhadas
mkdir -p [nome-novo-projeto]/.claude/rules
ln -s "../../../flg-shared-rules" [nome-novo-projeto]/.claude/rules/shared
```

### Fase 4 — Scaffolding (Claude Code faz)

Copiar do projeto principal e adaptar:
1. **frontend/src/index.css** → idêntico (CSS variables + tema)
2. **frontend/tailwind.config.js** → idêntico
3. **frontend/src/contexts/ThemeContext.jsx** → idêntico
4. **frontend/src/components/ui/** → idênticos (Avatar, Badge, Spinner, Skeleton)
5. **frontend/src/components/layout/** → base (Sidebar adaptado, Topbar, Layout)
6. **frontend/src/lib/api.js** → idêntico (fetch pattern)
7. **frontend/src/lib/supabase.js** → idêntico (client config)
8. **frontend/src/lib/toast.js** → idêntico
9. **backend/deps.py** → idêntico (auth dependency)
10. **backend/config.py** → adaptado (novas env vars)
11. **docker-compose.yml** → adaptado (novo subdomínio)
12. **.github/workflows/deploy.yml** → adaptado (novo repo)

### Fase 5 — Deploy Independente

No docker-compose.yml do NOVO projeto:
```yaml
services:
  backend:
    labels:
      - "traefik.http.routers.novo-backend.rule=Host(`app2.foundersledgrowth.online`) && PathPrefix(`/api`)"

  frontend:
    labels:
      - "traefik.http.routers.novo-frontend.rule=Host(`app2.foundersledgrowth.online`)"
```

No Supabase: criar NOVO projeto (banco separado, auth separado).

---

## CLAUDE.md do Novo Projeto (template)

```markdown
# [Nome do Projeto] — FLG

## Stack
FastAPI + Supabase + React + Tailwind CSS + Docker + Traefik

## Design System
Este projeto usa o design system FLG compartilhado.
Ver regras em `.claude/rules/shared/design-system.md`.

## Estrutura
- backend/ — FastAPI com Supabase (service role key)
- frontend/ — React 18 + Vite + Tailwind
- Deploy: Docker Compose na VPS 72.61.54.192

## Subdomínio
https://app2.foundersledgrowth.online

## Banco de Dados
Supabase Project: [URL do novo projeto Supabase]

## Regras Importantes
- SEMPRE usar CSS variables (var(--flg-*)) em vez de cores hardcoded
- SEMPRE suportar tema claro E escuro
- NUNCA criar componentes UI do zero — usar os de src/components/ui/
- NUNCA alterar o projeto principal (documentos_oficiais)
- Seguir as convenções em .claude/rules/shared/
```

---

## Resumo

| Aspecto | Projeto Principal | Novo Projeto |
|---------|-------------------|--------------|
| Repo | flg-docs-system | [novo-repo] |
| Domínio | docs.foundersledgrowth.online | app2.foundersledgrowth.online |
| Supabase | ygvclagcsbdbsfyeeeil | [novo projeto] |
| Docker Compose | /opt/flg-jornada/ | /opt/[novo-projeto]/ |
| Design System | Compartilhado via symlink | Compartilhado via symlink |
| Deploy | GitHub Actions independente | GitHub Actions independente |
| Impacto mútuo | Zero | Zero |

---

## Próximos Passos

1. Me diga o **nome do novo projeto** e o que ele faz
2. Eu crio as regras compartilhadas (design-system.md, tech-stack.md, etc.)
3. Crio o repositório e faço o scaffolding completo
4. Configuro o deploy independente na VPS
5. Você começa a desenvolver com Claude Code tendo todo o contexto
