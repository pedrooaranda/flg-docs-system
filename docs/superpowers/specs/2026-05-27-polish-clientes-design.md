# Polish UI Clientes — design

**Data:** 2026-05-27
**Stream:** 8.2 (2º sub-stream do Stream 8 polish UI)
**Status:** spec aprovada, plano e implementação na sequência
**Escopo:** redesign dos cards + endpoint backend agregando métricas IG + click-through pro perfil + skeletons + empty states + micro-animações.

---

## 1. Objetivo

Cards de cliente em `/clientes` hoje são pouco didáticos: nome em CAPSLOCK gigante, info pobre, botões "Preparar/Materiais" só aparecem no hover e BLOQUEIAM click do card pro perfil (bug). Pedro pediu cards clicáveis abrindo `/clientes/:id`, hierarquia visual decente, e informações úteis "de relance".

---

## 2. Seção 1 — Backend: novo endpoint `/clientes/summary`

Endpoint agrega cliente + métricas IG em 1 round-trip. Mantém `GET /clientes` simples (outros callers — AppContext, Dashboard — não pagam pelo overhead).

### 2.1 Endpoint

`GET /clientes/summary`:
- Aceita query `?consultor_id=X` e `?include_archived=true` (mesma semântica de `/clientes`)
- Mesma regra de auth (consultor regular só vê os próprios)
- Retorna lista de clientes + para cada um:
  - Campos básicos: `id, nome, empresa, consultor_responsavel, consultor_id, encontro_atual, status, archived_at, updated_at, created_at`
  - Métricas IG: `seguidores_atual` (último valor de `metricas_diarias_instagram`), `taxa_engajamento_pct` (média 30d), `dias_sem_postar` (calculado de `instagram_posts.posted_at`)
  - `instagram_conectado` (bool — `instagram_conexoes.status='ativo'`)

### 2.2 Implementação

1 query base (clientes filtrados) + 3 queries batch agregadas (não N+1):
- `SELECT cliente_id, MAX(data) AS last_data, ...` em `metricas_diarias_instagram` agrupado
- `SELECT cliente_id, MAX(posted_at) AS last_post` em `instagram_posts` agrupado
- `SELECT cliente_id` em `instagram_conexoes WHERE status='ativo'`

Resultado: O(1) round-trip a mais que o `/clientes` atual.

### 2.3 Sem novo modelo de DB

Tudo agregado de tabelas existentes. Sem migration.

---

## 3. Seção 2 — Frontend: card visual redesenhado

### 3.1 Click-through (fix bug)

Remover overlay com botões "Preparar/Materiais" do hover. Card todo clicável → abre `/clientes/:id`. Ações Preparar/Materiais ficam no header do perfil do cliente.

### 3.2 Novo layout

```
┌──────────────────────────────────────────┐
│ 🟢 Ativo                          E12   │  status semáforo + encontro
│                                          │
│ [A]  Amanda Aragão                       │  avatar + nome (font-semibold)
│      Empresa S/A                         │  empresa subtítulo
│                                          │
│ Jornada              12 / 15             │  progresso jornada
│ ████████████████░░░░                     │
│                                          │
│ 👥  12.4k    📊  3.2%    🟡  5 dias     │  métricas IG (se conectado)
│                                          │
│ Lucas Nery                26/mai · 5d   │  consultor + última atividade
└──────────────────────────────────────────┘
                                              hover: lift -2px + gold shadow
```

### 3.3 Componente reescrito

`frontend/src/components/Clientes/ClientCard.jsx` (extraído inline → arquivo próprio):
- **Status semáforo (linha 1):** verde=ativo, amarelo=pausado, vermelho=alerta (`dias_sem_postar > 7`). Substitui o "● Ativo" simples
- **Avatar md** (Avatar.jsx existente)
- **Nome:** `font-semibold text-sm text-white/90` (NÃO CAPSLOCK gigante) + empresa `text-xs text-white/40`
- **E{N} badge:** mantém pill gold atual
- **Métricas IG inline (linha 4):** ícones lucide-react `Users`, `BarChart3`, dot colorido + texto. Se `instagram_conectado=false`, esconde a linha inteira
- **Última atividade:** humanize date — "5 dias atrás", "ontem", "2 sem"
- **Hover:** card lift via Framer `whileHover={{ y: -2 }}` + shadow gold-tinted
- **Click:** `onClick navigate(/clientes/:id)`, `whileTap={{ scale: 0.97 }}`

### 3.4 Sem mudança no modo tabela

Modo tabela continua funcional. Botões Preparar/Materiais ainda aparecem como coluna "ações" lá.

---

## 4. Seção 3 — Skeletons + Empty states + Micro-animações

### 4.1 Loading skeleton

Novo componente `ClientCardSkeleton.jsx` mimicando layout final:
- Avatar circle skeleton (40×40)
- 2 linhas de texto skeleton (nome + empresa)
- Barra de progresso skeleton
- Linha de métricas skeleton (3 blocos)
- Linha de consultor skeleton

`animate-pulse` Tailwind. 8 cards skeleton no grid pra preencher fold.

Também aplicar pro `ConsultorFilter` durante `useUserScope` loading — em vez de "Carregando...", mostrar skeleton das pills.

### 4.2 Empty states ilustrados

Novo componente `EmptyClientes.jsx` com 3 variantes (via prop `variant`):

| Variant | Ícone (lucide) | Título | Dica | Ação |
|---|---|---|---|---|
| `no_results` | `Search` 48px cinza | "Nenhum cliente encontrado" | "Ajuste a busca ou troque o consultor" | Botão "Limpar filtros" |
| `empty` (consultor sem nada) | `UserPlus` 48px gold | "Você ainda não tem clientes" | "Peça pro admin atribuir clientes a você" | `<a href="mailto:pedroaranda@grupoguglielmi.com">` |
| `error` | `AlertTriangle` 48px red | "Erro ao carregar clientes" | err.message | Botão "Tentar novamente" |

Padding generoso, centralizado, contraste suave (não grita).

### 4.3 Micro-animações (Framer Motion)

- **Entrance:** stagger `delay={i * 0.04}`, `initial={{ opacity: 0, y: 8 }}`, `animate={{ opacity: 1, y: 0 }}`, duration 0.25s
- **Hover:** `whileHover={{ y: -2 }}` + shadow `0 8px 24px rgba(201,168,76,0.15)` via CSS class `card-flg-hover-gold`
- **Tap:** `whileTap={{ scale: 0.97 }}` (brief feedback no click)
- **Filter change:** envolver grid de cards em `<AnimatePresence>` com `exit={{ opacity: 0, scale: 0.95 }}` — quando filtros mudam, cards somem suaves em vez de hard cut

---

## 5. Arquivos afetados

```
NOVO:
  backend/routes/clientes_summary.py (ou inline em main.py — decide implementer)
  backend/tests/test_clientes_summary.py
  frontend/src/components/Clientes/ClientCard.jsx           (extraído inline)
  frontend/src/components/Clientes/ClientCardSkeleton.jsx
  frontend/src/components/Clientes/EmptyClientes.jsx
  frontend/src/hooks/useClientesSummary.js                  (chama /clientes/summary)
  frontend/src/lib/humanize-date.js                         (helper "5 dias atrás")

MODIFICADO:
  backend/main.py        # registra novo endpoint (se inline)
  frontend/src/components/Clientes.jsx  # usa hook + ClientCard novo + skeletons + empty
  frontend/src/index.css  # nova classe .card-flg-hover-gold (shadow gold-tinted)
```

---

## 6. Rollout

Single push — escopo cabe em 1 deploy.

Rollback: `git revert`. Backend volta a usar só `/clientes`, frontend volta ao ClientCard inline antigo.

---

## 7. Testes

**Backend (pytest):**
- `GET /clientes/summary` retorna campos esperados
- Filtragem por scope respeitada
- Instagram desconectado → métricas vêm null/0 + `instagram_conectado=false`
- Performance: queries batch (não N+1)

**Frontend (esbuild + smoke manual):**
- Card click navega pro perfil
- Skeleton aparece durante load (rede slow simulator pra validar)
- Empty state aparece quando filtro zera
- Micro-anim funcionam (hover/tap visíveis)

---

## 8. Out of scope (Stream 8.3+ depois)

- ConsultorFilter padronizado em Métricas/Ranking (Stream 8.3)
- Polish Dashboard (Stream 8.4)
- Endpoint summary pra outras telas (defer)
- Trocar fonte de métricas pra realtime via WebSocket (defer)

---

## 9. Decisões consolidadas

| # | Decisão | Justificativa |
|---|---|---|
| 1 | Novo endpoint `/clientes/summary` separado | Não onerar `/clientes` usado em outros lugares |
| 2 | Remover overlay com botões Preparar/Materiais | Causa bug do click + UX confuso; ações vão pro header do perfil |
| 3 | Status semáforo (verde/amarelo/vermelho) | Visual rápido. Mais didático que "● Ativo" |
| 4 | Skeleton mimica layout exato | Zero layout shift (CLS) — boa prática Web Vitals |
| 5 | 3 variantes de empty state | `no_results`, `empty`, `error` cobrem todos cenários |
| 6 | Framer Motion (já no projeto) | Sem dep nova |
| 7 | ClientCard extraído pra arquivo próprio | Clientes.jsx hoje é grande; isolar = mais legível + testável |
