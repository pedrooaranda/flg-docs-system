# Ranking — Tabs Clientes/Consultores com integração ClickUp + Materiais

**Data:** 2026-05-10
**Autor:** Brainstorm Pedro × Claude
**Status:** Aprovado pra implementação

---

## Contexto e motivação

Hoje [Ranking.jsx](../../../frontend/src/components/Ranking.jsx) (722 linhas) compila num único viewport corrido: Atenção Master → Sala dos Troféus (clientes) → Pódio (clientes) → Tabela completa (clientes) → "Consultores do mês" (4 cards agregados client-side). A análise de performance do consultor é uma sessão minúscula no rodapé, calculada client-side a partir do ranking de clientes, sem profundidade.

Pedro pediu separar a visualização em duas abas — uma focada em clientes (preserva o que existe), outra focada em consultores (nova, comprehensive). Na aba de consultores, expandir muito além do agregado de métricas Instagram: incluir **volume de entregas** via integração com ClickUp (tarefas concluídas) e tabela `materiais_copy` (documentos/copies produzidos).

**Padrões de mercado consultados** (HubSpot Sales, Sprout Social Team Reports, Intercom Agent Dashboards, Buffer Agency): consenso é tabs no nível superior separando audiência (clientes vs operadores), com pódio/troféus pro lado emocional + tabela analítica + drill-down. Aba do operador combina métricas positivas (engajamento, audiência) com sinal de risco (clientes em crise) numa view única.

---

## Arquitetura

### Frontend — refactor estrutural

Extrair `Ranking.jsx` em pasta dedicada (espelha o padrão de `Metricas/` da Phase 2 V3):

```
frontend/src/components/Ranking/
  index.jsx                  # layout + tabs + fetch compartilhado
  RankingClientes.jsx        # aba atual (preservada)
  RankingConsultores.jsx     # aba nova
  shared/
    PodiumCard.jsx           # pódio top 3 — reutilizado pelas 2 abas
    DestaqueCard.jsx         # troféu por categoria — reutilizado
    AtencaoMasterCard.jsx    # card de crise — usado em Clientes E em Consultores (variação compacta)
    ConsultorRow.jsx         # row expandível da tabela de consultores
    formatters.js            # formatCompact, severidadeAtencao
```

`index.jsx`:
- Roteia via URL query `?tab=clientes|consultores` (bookmarkable)
- Tab default: `clientes`
- Visual da tab: linha dourada underline ativa (mesmo padrão do header de Métricas — consistência visual já validada com usuário)
- Fetch compartilhado: `useEffect` puxa `/metricas/ranking` e `/metricas/ranking-consultores` em paralelo, ambas com loading state separado. Aba Clientes não trava enquanto Consultores carrega (paralelo).

### Aba **Clientes** (preserva o atual)

Seções mantidas exatamente como estão hoje:
1. **Atenção Master** (clientes ≥4 dias sem postar) — fica nesta aba
2. **Sala dos Troféus** (4 troféus: Maior Engajamento / Maior Crescimento / Maior Alcance / Mais Produtivo)
3. **Pódio Geral** (top 3 por engajamento, layout 2º-1º-3º)
4. **Ranking completo** (tabela com mini-bars)

A lógica é só movida pra `RankingClientes.jsx` — zero mudança de comportamento.

### Aba **Consultores** (nova)

#### 1. Pódio Top 3 Consultores
Mesmo visual do pódio de clientes (cards laterais com altura escalonada, 2º-1º-3º no desktop). Métricas exibidas no card: `# clientes ativos`, `Eng. médio`, `Audiência total`. Critério de ordenação default: **Eng. médio** (igual aos clientes). Click → expande/rola pra drill-down do consultor na tabela.

#### 2. Sala dos Troféus (4 categorias por consultor)
- 🔥 **Maior Engajamento Médio** (qualidade) — eng médio dos clientes do consultor
- 🌱 **Maior Crescimento Agregado** — soma de `crescimento_30d` dos clientes do consultor
- 📦 **Maior Volume de Entregas** — composite: `clickup_tasks_closed + materiais_copy_count`. Mostra ambos números no card.
- 👥 **Maior Audiência sob Gestão** — soma de seguidores dos clientes do consultor

Cada DestaqueCard mostra winner #1 + #2/#3 compactos abaixo (igual ao padrão da aba Clientes).

#### 3. Atenção Operacional
Só renderiza se `algum_consultor.clientes_em_crise.total > 0`. Cards com:
- Avatar + nome do consultor
- Contadores tiered: `N CRÍTICO · N CRISE · N ATENÇÃO` com cores correspondentes (`#EF4444`/`#F97316`/`#FBBF24`)
- Botão "Ver clientes em crise" — expande inline mostrando lista dos clientes em risco daquele consultor

Empty state se zero crises agregadas: card verde "Toda a equipe em dia".

#### 4. Tabela Completa
Colunas:
| # | Consultor | Clientes | Eng. médio | Audiência total | Crescimento 30d | Tasks ✓ | Docs | Em crise ⚠️ | → |

- `Tasks ✓` = `clickup_tasks_closed` (subtasks com status `closed` dentro das tasks de cliente do consultor)
- `Docs` = `materiais_copy_count` (entradas em `materiais_copy` onde `cliente_id IN clientes do consultor`)
- `Em crise ⚠️` = `clientes_em_crise.total`, badge vermelho/laranja/amarelo conforme tier máximo
- `→` = chevron pra drill-down

**Drill-down**: clique numa row expande inline (não modal, não rota nova) mostrando lista dos clientes do consultor:
- Avatar + nome + empresa
- Audiência atual + delta 30d
- Eng% + indicador de tier de crise (se aplicável)
- Link `Ver perfil` → `/metricas/:cliente_id/geral`

Reusa `consultor.clientes_detalhe[]` que vem opcionalmente do backend (lazy-loaded ao expandir).

### Backend — novo endpoint

`GET /metricas/ranking-consultores?include_detail=false`

**Resposta:**
```jsonc
{
  "consultores": [
    {
      "nome": "João Silva",
      "clientes_count": 12,
      "clientes_ids": ["uuid1", "uuid2", ...],
      "eng_medio": 4.23,                    // média simples dos eng% dos clientes
      "audiencia_total": 145300,
      "crescimento_total": 2340,             // soma absoluta de novos seguidores 30d
      "crescimento_pct": 1.6,                // crescimento_total / audiencia_inicio * 100
      "clientes_em_crise": {
        "critical": 1,                       // ≥14 dias
        "high": 2,                           // 7-13 dias
        "med": 3,                            // 4-6 dias
        "total": 6
      },
      "clickup_tasks_closed": 47,
      "docs_entregues": 23,
      "volume_entregas": 70,                 // tasks_closed + docs_entregues (composite)
      "clientes_detalhe": [                 // só se include_detail=true
        {
          "cliente_id": "uuid1",
          "nome": "Letícia Toledo",
          "empresa": "Toledo & Co",
          "audiencia": 22100,
          "crescimento_30d": 340,
          "taxa_engajamento": 3.2,
          "dias_sem_postar": 0
        }
      ]
    }
  ],
  "total": 7,
  "generated_at": "2026-05-10T22:00:00Z"
}
```

**Algoritmo:**
1. Query `clientes` agrupando por `consultor_responsavel` (não-null). Cliente sem consultor é skipado.
2. Pra cada consultor, itera seus clientes e:
   - Reutiliza `repo.get_historico(cliente_id, 30)` (mesma fonte do ranking atual) pra eng/audiência/crescimento
   - Reutiliza lógica de `dias_sem_postar` do endpoint `/ranking` (última `posted_at` em `instagram_posts`)
   - Conta `materiais_copy` via `sb.table("materiais_copy").select("id", count="exact").in_("cliente_id", clientes_ids)`
3. ClickUp tasks: chama `list_all_tasks(LIST_CLIENTES_BS)` (cache de 5min), filtra tasks cujo custom field "Consultor" bate com o consultor, soma subtasks com `status.type == "closed"`.
4. Agrega e ordena por `eng_medio` desc (default).

**Cache ClickUp:**
- Cache em memória (módulo-level dict `_clickup_cache = {"data": [...], "fetched_at": datetime}`)
- TTL 5min
- Concurrent safety: lock simples (`asyncio.Lock()`) pra evitar dois fetchs simultâneos
- Fallback: se ClickUp API falhar, retorna `clickup_tasks_closed: null` por consultor (frontend mostra "—") + log warning. Não falha o endpoint inteiro.

**Performance esperada:**
- Sem cache (cold start): ~5-8s (dominado pelo fetch ClickUp + N×get_historico)
- Com cache: ~1-2s
- Aceitável pra dashboard que é renderizado uma vez quando user abre a aba.

---

## Modelo de dados — assunções

### ClickUp "tarefas concluídas"
**Assunção (premissa principal):** "tarefa concluída" = **subtask com `status.type == "closed"`** dentro de uma task da `LIST_CLIENTES_BS` (lista de clientes BS). Cada task de cliente já vem com `subtasks: true` na chamada `list_all_tasks`.

A relação consultor→tasks é via cliente: `task.custom_field("Consultor") == consultor_responsavel`. Depois soma subtasks closed dentro dessas tasks.

Se essa assunção estiver errada (ex: existe outra List dedicada a tasks de consultor), trocar `LIST_CLIENTES_BS` por env var `CLICKUP_CONSULTOR_TASKS_LIST_ID` futuramente.

### Materiais
**Assunção:** "Documentos nos Relatórios de entregas" = entradas na tabela `materiais_copy` (tipos variados — copy, estratégia, etc.). Conta por `cliente_id`, agrega via `consultor_responsavel` do cliente.

Não filtra por `tipo_material` na agregação — todos os materiais contam como "entrega". Se Pedro quiser separar (ex: só `tipo_material='relatorio'`), adicionar query param `?tipo_material=...` no endpoint depois.

---

## Decomposição em fases (Phase 1 → Phase 6)

| Fase | Escopo | Estimativa |
|------|--------|------------|
| **1** | Refactor estrutural — extrair `Ranking.jsx` em pasta `Ranking/`, criar `index.jsx` com tabs + URL `?tab=`, mover lógica atual pra `RankingClientes.jsx`. Zero feature nova, paridade visual completa. | ~3h |
| **2** | Backend: endpoint `GET /metricas/ranking-consultores` (sem ClickUp/Materiais ainda — só métricas Instagram agregadas: eng/audiência/crescimento/em_crise). | ~3h |
| **3** | Frontend: aba Consultores completa visualmente — pódio, troféus (3 de 4, "Volume de Entregas" stub mostrando "—"), atenção operacional, tabela, drill-down. | ~5h |
| **4** | Integração ClickUp — count tasks closed por consultor com cache 5min + fallback gracioso. | ~3h |
| **5** | Integração Materiais — count em `materiais_copy` + ativar 4º troféu "Volume de Entregas" composite. | ~2h |
| **6** | Polish — loading states (skeletons), empty states, responsive (mobile/tablet), performance check, smoke test em produção. | ~2h |

**Total:** ~18h de trabalho efetivo, ~2-3 dias calendário.

Cada fase commita atomicamente e deploya (auto-deploy via push pra `main`). Phase 1 não tem feature nova mas valida o refactor estrutural sem regredir.

---

## Trade-offs e alternativas consideradas

### Tabs vs sub-rotas separadas
- **Escolhido**: tabs no mesmo componente, URL query param `?tab=`
- **Alternativa rejeitada**: rotas separadas `/ranking/clientes` e `/ranking/consultores` (como Métricas faz). Rejeitado porque o sidebar tem só "Ranking" (não submenu) e o user vai querer alternar rápido entre as duas visões — query param mantém scroll position e estado mais natural.

### Drill-down inline vs modal vs rota
- **Escolhido**: expansão inline na tabela (estilo accordion)
- **Rejeitado**: modal (interrompe fluxo de comparação), rota nova (perde contexto de ranking)

### ClickUp tasks: subtasks vs custom checklist items
- **Escolhido**: subtasks com `status.type == "closed"`
- **Razão**: subtasks já são parseadas pela função existente `list_all_tasks` (com `subtasks: true`). Checklist items dentro de tasks teriam que ser parseados separadamente. Subtasks é o mecanismo mais comum no workspace FLG segundo `clickup_sync.py`.

### ClickUp cache: in-memory vs Redis vs Supabase table
- **Escolhido**: in-memory dict com lock (módulo singleton no backend)
- **Razão**: backend é monolítico (um único processo Docker), TTL curto (5min), simplicidade. Não vale a pena Redis pra esse escopo.

### Eng. médio: simples vs ponderado por audiência
- **Escolhido**: média simples
- **Razão**: ranking de consultores hoje no frontend já usa média simples — manter consistência. Ponderado pode ser feito depois se Pedro quiser (parametriza no endpoint).

---

## Riscos identificados

1. **ClickUp API rate limit (100 req/min):** mitigado por cache 5min + uma única chamada `list_all_tasks` por refresh (não chamada por consultor).
2. **ClickUp pode demorar e travar UI:** mitigado por fetch paralelo no frontend — aba Clientes renderiza com seu próprio endpoint enquanto Consultores ainda carrega.
3. **Schema de `materiais_copy` pode não ter linhas históricas pros clientes antigos:** count vai dar 0 pra esses casos, não quebra. Aceitável.
4. **Consultor name matching:** o custom field "Consultor" do ClickUp retorna nome do user; `clientes.consultor_responsavel` é string. Possível mismatch de capitalização/espaços. Mitigação: normalização (`.strip().lower()`) na comparação.

---

## Testing manual (UAT)

Validação por fase:
- **Phase 1**: Abre `/ranking?tab=clientes` — vê tudo igual antes. Abre `?tab=consultores` — vê placeholder "Em construção". URL muda ao alternar tabs.
- **Phase 2**: `curl /metricas/ranking-consultores` retorna lista com eng/audiência/crescimento/em_crise corretos. Total bate com count de consultores únicos.
- **Phase 3**: Pódio renderiza 3 cards. Troféus 4 cards (1 com stub). Atenção operacional só mostra consultores com crise. Tabela com drill-down funcional (click expande).
- **Phase 4**: Tasks ✓ aparece como número >0 pra consultores conhecidos. Forçar erro ClickUp (token inválido temporário) verifica fallback "—".
- **Phase 5**: Troféu "Volume de Entregas" ativa com composite real. Coluna Docs > 0 pra clientes com materiais.
- **Phase 6**: Mobile (375px width) — tabela vira cards. Skeleton aparece no primeiro load. Empty states corretos.

---

## Out of scope (não nessa entrega)

- Filtro por período na aba Consultores (semana/mês) — botão semanal/mensal já é estado local mesmo na aba Clientes, deixar como está.
- Exportar ranking pra CSV/PDF.
- Notificação proativa pro consultor quando ele entra em "atenção operacional" — futuro.
- Editar `consultor_responsavel` direto da tabela — futuro.
- Comparar consultores entre meses (gráfico de tendência) — futuro.
