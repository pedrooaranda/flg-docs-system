# FLG Debriefings — Handoff entre sessões

**Última atualização:** 2026-05-26 noite (setup desbloqueado + smoke test inicial revelou bugs estruturais — corridos Phase 6.2; aguardando re-teste do Pedro)
**Status:** Backend (Phases 1-6.2) + Frontend (Phase 5) em produção. Smoke test inicial 2026-05-26 manhã saiu vazio ("Não documentado" em ~80%) — 4 bugs estruturais identificados e corridos durante o dia. Aguardando re-teste com fixes aplicados.

## Atualização 2026-05-26 noite — Phase 6.2 bugs corridos

Setup foi desbloqueado (Pedro conseguiu role + JSON key gerada + Drive compartilhado + env path-based via volume mount). Primeiro smoke test do Leonardo Souza Ciclo 1 (CICLO | 2025.2) saiu com seções vazias. Investigação direta no código (sem precisar de logs):

### Bugs identificados

| # | Causa raiz | Fix | Commit |
|---|---|---|---|
| 1 | `google_drive_service.extract_for_debriefing` listava nomes das subpastas mas SÓ lia conteúdo do RELATÓRIO ESTRATÉGICO. Docs de `01. CONTEÚDO ESTRATÉGICO`, `02. PE`, etc. nunca chegavam ao Claude. | Novo `extract_strategic_docs_content`: walk recursivo de TODAS as subpastas, lê GDocs/Slides/Sheets/.docx/PDFs/.txt; skip imagens/vídeos por extensão; cap 40 docs × 8k chars + 5 PDFs via docling | `c82eabf` |
| 2 | `clickup_debriefing._within_period` filtrava por janela temporal mesmo com lista já dedicada `[CLIENTE \| CICLO0N]`. Filtro descartava tasks legítimas (criadas antes do ciclo ou atualizadas depois). Tasks arquivadas nunca eram buscadas. | Remove filtro; adiciona `list_archived_tasks` (chamada separada com `archived=true`); dedup por id | `c82eabf` |
| 6 | `.xlsx` (Excel upload) caía em "Tipo MIME não suportado" — RELATÓRIO ESTRATÉGICO do Leonardo confirmado via MCP Drive como `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (não Google Sheet nativo). Claude recebia literalmente o marker no lugar dos 15 encontros. | Adiciona `openpyxl` ao requirements; novo `extract_xlsx_all_sheets` lê TODAS as abas; branches em `extract_for_debriefing` pra .xlsx/.docx/PDF | `29918e9` |
| 4 | Google Sheet nativo na extração funda usava `_export_gsheet` que pega só a 1ª aba | Trocar por `extract_sheet_all_tabs` (Sheets API v4) | `29918e9` |

### Adições

- **Guard antivazio** em `debriefing_generator.run_debriefing`: aborta com erro claro se ambas extrações vierem 0 (não queima Claude gerando "Não documentado" em tudo)
- **Observabilidade:** persist `clickup_data` + `drive_data` brutos em `Storage/debriefings/debug/{debriefing_id}/{clickup,drive}.txt` pra pós-mortem (best-effort, não bloqueia)
- **UPSERT** em `_insert_debriefing`: regenerar sobrescreve em vez de quebrar constraint UNIQUE(cliente_id, ciclo_numero) — `39abf83`
- **CI `command_timeout`** 10m→25m: build com docling/torch/openpyxl + export layers passa de 12 min consistente. Antes timeout SSH cortava o `docker compose up` deixando container na versão antiga — `a47759d`

### Próximo passo (ação Pedro)

1. Limpar row órfã do teste anterior:
   ```sql
   DELETE FROM debriefings
   WHERE cliente_id = '049caf8f-6fe9-4153-b995-9d9d225071e7'
     AND ciclo_numero = 1;
   ```
   (Opcional — UPSERT cobre re-geração mesmo sem limpar)
2. Re-gerar debriefing do Leonardo Ciclo 1 pela UI
3. Se output ainda estranho: baixar `Storage/debriefings/debug/{id}/{clickup,drive}.txt` no Supabase pra ver o que Claude recebeu

---

## Status original (mantido pra contexto)

---

## 1. Objetivo

Feature pra time comercial da FLG gerar **debriefing estratégico automático** do ciclo anterior de um cliente quando ele renova contrato. Comercial escolhe cliente + período no frontend, backend orquestra **ClickUp** + **Google Drive** + **Claude**, gera PDF de ~20 páginas com:

- Reconstrução da timeline (planejado vs executado)
- Inventário de entregáveis
- Análise da dinâmica consultor↔cliente
- Avaliação pela metodologia FLG (Cadeira Vazia, Tríades, Schwartz, Progressão de Autoridade)
- Recomendações pro próximo ciclo

PDF vai pra reunião de renovação como compilado denso, evitando que cada consultor tenha que vasculhar 6 meses de ClickUp + Drive manualmente.

**Custo alvo:** R$3-12 por debriefing (Sonnet 4.6 com prompt caching).
**Tempo alvo:** 60-90s end-to-end na arquitetura atual single-agent.

---

## 2. Estado atual (em produção)

### ✅ Backend Phases 1-4 (SHA `25abbcd`)
- `docs/migrations/007-debriefings.sql` — tabela `debriefings` (FK clientes, status gerando/pronto/falhou, audit de tokens/custo/fontes, unique cliente_id+ciclo_numero)
- `backend/prompts/debriefing_prompt.py` — prompt XML estruturado v1.0, template Markdown rígido com 11 seções
- `backend/services/debriefing_generator.py` — orquestrador 4 fases, callback de progresso, dataclasses tipadas
- `backend/services/google_drive_service.py` — API Drive v3 via service account, list_docs + fetch_content, categorização automática, grace-degraded sem creds
- `backend/services/clickup_debriefing.py` — extração formatada filtrada por janela temporal, agrupamento por status, limite 200 tasks
- `backend/services/debriefing_pdf.py` — Markdown→HTML→PDF (WeasyPrint) com CSS FLG (Fraunces serif + accent gold), upload Supabase Storage
- `backend/routes/debriefings.py` — POST/GET/stream(SSE)/pdf/delete

### ✅ Frontend Phase 5 (SHA `9ecc7c7`)
- `frontend/src/components/Debriefings/index.jsx` — Hub: cards por ciclo + botão "Novo"
- `frontend/src/components/Debriefings/NovoDebriefingModal.jsx` — form (ciclo/período/clickup_list_id/drive_folder_id opcionais)
- `frontend/src/components/Debriefings/StreamPanel.jsx` — SSE GET stream, 4 fases com status + info extra
- `frontend/src/components/Debriefings/Viewer.jsx` — render markdown + botão "Baixar PDF" (signed URL)
- `frontend/src/lib/api.js` — `apiStreamGet` pra SSE com Authorization header
- `frontend/src/App.jsx` — rotas `/clientes/:id/debriefings` e `/clientes/:id/debriefings/:debriefingId`
- `frontend/src/components/PerfilCliente.jsx` — tab "Debriefings" embutindo o hub

### 🟡 Phase 6 — Setup ops Pedro (em curso)
- ✅ Migration 007 aplicada manualmente no Supabase Dashboard
- ✅ Bucket `debriefings` criado (privado, sem policies — explicação em `docs/setup/debriefings-setup.md`)
- ✅ Google Cloud project `FLG Debriefings` criado, Drive API habilitada
- ✅ Service account `flg-debriefings-reader@flg-debriefings.iam.gserviceaccount.com` criado
- 🚧 **Bloqueio atual:** org policy `iam.disableServiceAccountKeyCreation` impede criação de JSON key. Solução em curso: mover projeto pra "Sem organização" (decisão Pedro 2026-05-22).
- ⏳ Compartilhar pasta raiz dos clientes do FLG no Drive com email do service account
- ⏳ `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` env var na VPS (single-line via `jq -c`)
- ⏳ `CLICKUP_WORKSPACE_ID` env var (opcional — habilita busca de lista por nome)
- ⏳ Restart backend

### 🚧 Phase 7 — Refactor multi-agent (em investigação)
Decisão Pedro 2026-05-22: pipeline atual single-agent é suficiente como base mas quer especializar. Agente de research disparado pra mapear best practices Anthropic + frameworks de mercado + arquitetura ideal pra FLG. Output em `docs/superpowers/research-debriefing-multi-agent.md` (a ser criado). Spec do refactor será montada após research.

---

## 3. Arquitetura atual (single-agent monolítico)

```
[POST /debriefings]
    ↓
[debriefing_generator.run_debriefing()]
    ↓
    ├─► Fase 1: extract_clickup_data()   (clickup_debriefing.py)
    ├─► Fase 2: extract_drive_data()     (google_drive_service.py)
    ├─► Fase 3: generate_markdown()      ◄── 1 chamada Claude Sonnet 4.6
    │            (streaming SSE pro frontend)
    └─► Fase 4: generate_pdf_and_upload() (debriefing_pdf.py → Supabase Storage)
    ↓
[DebriefingResult persistido em debriefings table]
```

**Limites do single-agent:**
- Tudo num único contexto Claude → token explosion se cliente tem 200+ tasks + 50+ docs
- Sem especialização por tipo de fonte (transcrições, PEs, scripts) tratados uniformemente
- Sem revisão/critique step → output direto pra produção
- Análise FLG (Cadeira Vazia, Tríades) misturada com extração factual no mesmo prompt → potencial perda de profundidade

---

## 4. Arquitetura proposta (Phase 7 — multi-agent refactor)

**Research completa** em [`docs/superpowers/research-debriefing-multi-agent.md`](research-debriefing-multi-agent.md) (~2000 palavras, 5 dimensões + recomendação).

### 4.1. Veredito após research

- A proposta inicial (8 agentes) estava **sobre-engenheirada**. Sweet spot real são **4 agentes**.
- Padrão Anthropic oficial: **Orchestrator-Subagent + Generator-Verifier** combinados.
- Framework escolhido: **Claude Agent SDK** oficial (Python), `AgentDefinition` nativo, embed direto no FastAPI existente.

### 4.2. Arquitetura final recomendada

```
[Orchestrator]                          (Python puro, sem LLM — reusa debriefing_generator.py)
   │
   │  Fan-out paralelo (asyncio.gather):
   ├─► [Worker A: ClickUp Extractor]              (Haiku 4.5)
   │     → tasks + comentários + status filtrados por período
   │     → output JSON estruturado: {tasks, milestones, comments}
   │
   ├─► [Worker B: Drive Extractor + Classifier]   (Haiku 4.5)
   │     → lista pasta, filtra por data, baixa, classifica por tipo
   │       (transcricao | relatorio_entregas | doc_estrategico | outro)
   │     → extrai key points por tipo no mesmo worker
   │     → output JSON: {transcricoes, relatorios, docs}
   │
   │  Sync barrier (espera A e B)
   │
   ├─► [Worker C: Strategic Synthesizer]          (Sonnet 4.6 padrão / Opus 4.7 opt-in)
   │     → recebe findings A + B
   │     → aplica metodologia FLG (Cadeira Vazia, Tríades, Schwartz,
   │       Progressão de Autoridade)
   │     → cruza timeline ClickUp ↔ Drive cronologicamente
   │     → redige markdown completo (template 20 páginas)
   │
   ├─► [Worker D: Citation & Completeness Reviewer]   (Haiku 4.5)
   │     → verifica explicitamente:
   │         - cada claim factual tem citation_uri
   │         - template completo (todas as 11 seções FLG)
   │         - 0 invenções (sample N claims, check contra findings)
   │     → output: {pass: bool, issues: [...]}
   │     → se fail: devolve issues pro Worker C (max 1 retry)
   │
   └─► PDF render                                  (determinístico, reusa debriefing_pdf.py)
```

### 4.3. Decisões consolidadas

- **Orchestrator é Python puro:** já temos `debriefing_generator.py` (364 linhas). Não precisa virar LLM.
- **A ∥ B em paralelo via `asyncio.gather()`:** independentes por construção (fontes diferentes). Corta latência.
- **Source Scout removido:** decisão de escopo (cliente, período, lista) é lookup determinístico do request → não precisa LLM.
- **Transcription e Report unidos no Worker B:** ambos são docs do Drive com chunking similar; classificador interno roteia. Dois sub-agents separados duplicariam tokens sem ganho.
- **Timeline / Methodology / Recommender fundidos no Worker C:** são três facetas da mesma síntese, todas precisam do contexto completo. Separar triplicaria cache write de contexto.
- **Modelos mixtos:** Haiku 4.5 nos 3 workers cheap (~$0.80/M in, $4/M out), Sonnet 4.6 só no Synthesizer pesado.
- **Reviewer (Worker D) NÃO é opcional:** CLEAR Framework mostra que multi-agent sem verifier tem pass@k de 25% vs 60% single-run. Reviewer estabiliza a variance.

### 4.4. Projeção de custo e latência

| Worker | Modelo | Custo USD estimado |
|---|---|---|
| A — ClickUp Extractor | Haiku 4.5 | ~$0.027 |
| B — Drive Extractor + Classifier | Haiku 4.5 | ~$0.045 |
| C — Synthesizer | Sonnet 4.6 | ~$0.32 |
| D — Reviewer | Haiku 4.5 | ~$0.022 |
| **Total** | | **~$0.42 ≈ R$2,30** |

**Contra-intuitivo:** multi-agent fica **MAIS BARATO** que single-agent atual (~R$3,50), porque Haiku 4.5 nos workers extratores derruba o custo de input mais do que paga o overhead.

Latência: **60-90s** (mesmo do single-agent atual — paralelismo A∥B compensa).

Cost cap recomendado: **$5 (~R$28) por debriefing**, abort se ultrapassar (interceptado via `custo_usd` já existente).

### 4.5. Plano de rollout (Phase 7)

| Sub-fase | Escopo | Estimativa |
|---|---|---|
| **7.1** | Skeleton `debriefing_generator_v2.py` com Claude Agent SDK + 4 `AgentDefinition`s, sem caching, feature flag `USE_MULTIAGENT=false` | 5h |
| **7.2** | Findings schema JSON padronizado, nova coluna `debriefings.findings_jsonb` (migration 008), persist findings A+B antes de C (checkpointing barato) | 3h |
| **7.3** | Worker D (Reviewer) implementado, retry de C com issues, max 1 retry | 4h |
| **7.4** | Prompt caching cross-agent (TTL 1h no system + metodologia + template; TTL 5min nos findings A+B passados pra C/D). Hook `PreToolUse` somando custo e abortando em $5 | 3h |
| **7.5** | A/B canary: rodar multi-agent em paralelo com single-agent em 5-10 debriefings reais. Pedro avalia qualidade subjetiva. Promove ou rollback | 2h dev + 2-4 semanas de coleta |
| **Total** | | **~17h dev + canary** |

**Critério de sucesso Phase 7:** em 10 debriefings A/B, multi-agent deve empatar ou superar single-agent em:
1. **Completude do template** — todas as 11 seções FLG presentes
2. **Densidade de citação** — ≥1 fonte por bullet factual
3. **Custo** — ≤ single-agent (meta R$2,30)
4. **Latência** — ≤ +20% vs single-agent

Se não bater os 4 critérios, rollback e investigar antes de promover.

### 4.6. O que NÃO fazer agora

- ❌ Não migrar pra LangGraph / CrewAI (overhead de aprendizado não justifica)
- ❌ Não criar Source Scout LLM (é lookup determinístico)
- ❌ Não separar Transcription Synthesizer e Report Reader (mesmo worker com classificador interno)
- ❌ Não adicionar Timeline Reconstructor / Methodology Analyst / Strategic Recommender como agentes separados (são facetas do mesmo Synthesizer)

---

## 5. Setup ops — estado bloqueado e plano

### 5.1 Bloqueio atual (2026-05-26)

Google Workspace `grupoguglielmi.com` aplica policy **`iam.disableServiceAccountKeyCreation`** por default (Secure by Default da Google). Pedro tentou:

- ❌ **Mover projeto pra "Sem organização"** — UI bloqueia, falta permissão `resourcemanager.projects.create` em destino "Sem organização" pra contas de domínio gerenciado
- ❌ **Self-grant Org Policy Admin via admin.google.com** — Pedro tem acesso a `admin.google.com` mas NÃO é Super Admin (João Guglielmi é)
- ❌ **Personal Gmail criando projeto fora da org** — tecnicamente viável mas inadequado a médio prazo (bus factor, auditoria, billing, handover) → Pedro rejeitou corretamente

**Plano em curso:** Pedro pediu pro **João (Super Admin Workspace)** uma de duas coisas (2026-05-26):

**Opção A — João concede acesso a Pedro:**
- João vai em `admin.google.com` → Conta → Funções de admin
- Atribui pra Pedro o role **Super Admin** ou **Organization Administrator** (Workspace)
- Pedro depois auto-configura tudo no Cloud

**Opção B — João executa as 3 ações:**
1. Login `console.cloud.google.com` como Super Admin
2. Topo: seleciona organização `grupoguglielmi.com` (não projeto)
3. IAM → busca `pedroaranda@grupoguglielmi.com` → adiciona role **`roles/orgpolicy.policyAdmin`** (Administrador da política da organização)
4. Salva

Quando João liberar, Pedro retoma o setup como abaixo.

### 5.2 Setup pós-desbloqueio (quando João liberar)

#### 5.2.1 Desativar a policy específica
URL: `https://console.cloud.google.com/iam-admin/orgpolicies/iam-disableServiceAccountKeyCreation/edit?project=flg-debriefings`

- GERENCIAR POLÍTICA → muda "Herdar política do parent" → "Substituir política do parent"
- Em Regras → Aplicação: de "Ativada" → "Desativada"
- DEFINIR POLÍTICA

#### 5.2.2 Gerar JSON key
URL: `https://console.cloud.google.com/iam-admin/serviceaccounts?project=flg-debriefings`
- Click `flg-debriefings-reader` → aba CHAVES → ADICIONAR CHAVE → Criar nova (JSON) → CRIAR
- **Salvar no 1Password imediatamente** — Google não mostra de novo

#### 5.2.3 Compartilhar pasta Drive com service account
- Pedro define qual a pasta raiz dos clientes FLG no Drive (ou pasta de cada cliente — ainda a definir)
- Compartilha com email: `flg-debriefings-reader@flg-debriefings.iam.gserviceaccount.com`
- Permissão: **Visualizador** (read-only)
- Foco em garantir que **transcrições de reuniões** e **Relatório de Entregas** estão dentro do escopo compartilhado (são as fontes de maior valor pro debriefing por sinalização do Pedro)

#### 5.2.4 SSH na VPS + setup env
```bash
ssh root@72.61.54.192
cd /opt/flg
# Compactar JSON em uma linha
JSON_LINE=$(jq -c '.' /caminho/pro/flg-debriefings-XXXXX.json)
# Adicionar ao .env (cuidado com aspas — Pedro: salva o JSON num arquivo temporário primeiro, edita .env via nano/vim)
echo "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON='$JSON_LINE'" >> .env
# (opcional mas recomendado) Workspace ID do ClickUp pra busca de lista por nome
echo "CLICKUP_WORKSPACE_ID=9013123456" >> .env
docker compose restart backend
```

#### 5.2.5 Smoke test (single-agent atual — Phase 6 fechamento)
- Abrir `/clientes/<id_cliente_teste>/debriefings`
- Click "Novo Debriefing" → preencher período (sugerido: ciclo de 6 meses recente de cliente que renovou)
- Acompanhar progresso ao vivo no StreamPanel
- Validar PDF gerado: completude, citação de fontes, qualidade da síntese

#### 5.2.6 Caveat de privacidade — Meta App Review
**Importante:** quando o debriefing real estiver em uso e dados IG aparecerem dentro de docs do Drive (PE, relatórios, transcrições mencionando métricas IG), atualizar a submissão Meta App Review pra adicionar **Anthropic PBC como operador** (categoria TI/cloud, EUA). Hoje declaramos só Supabase + Hostinger. Memory `meta_ig_only_tester_needed.md` documenta o caveat.

---

## 6. Documentos relacionados

```
docs/
├── migrations/
│   └── 007-debriefings.sql           # Schema + RLS + triggers
├── setup/
│   └── debriefings-setup.md          # Runbook ops Pedro
└── superpowers/
    ├── HANDOFF-debriefings.md        # ESTE arquivo (contexto entre sessões)
    └── research-debriefing-multi-agent.md  # ★ A ser criado pelo agente em curso

backend/
├── prompts/
│   └── debriefing_prompt.py          # Prompt v1.0 (system + user template)
├── routes/
│   └── debriefings.py                # CRUD + SSE stream + PDF endpoint
└── services/
    ├── debriefing_generator.py       # Orquestrador 4 fases
    ├── google_drive_service.py       # API Drive + categorização
    ├── clickup_debriefing.py         # Extração ClickUp filtrada por período
    └── debriefing_pdf.py             # Markdown → PDF + Supabase Storage

frontend/src/components/Debriefings/
├── index.jsx                         # Hub com cards
├── NovoDebriefingModal.jsx           # Form de criação
├── StreamPanel.jsx                   # SSE progress
└── Viewer.jsx                        # Render markdown + download PDF
```

---

## 7. Decisões importantes

1. **PDF render:** WeasyPrint (não Chrome headless) — já estava em requirements, simpler, suficiente pra docs corporativos.
2. **Markdown parser frontend:** Inline regex (não markdown-it) — evita deps extra no bundle, render é referência rápida, PDF é canal oficial.
3. **Storage:** signed URLs sempre (nunca acesso público). Service role bypassa RLS, frontend só consome URL assinada com expiração 1h.
4. **Multi-tenancy:** filtragem por cliente_id já no banco, sem RLS específico de consultor (FLG é pequena, todos os consultores podem ver todos os debriefings — alinhar com Pedro se mudar).
5. **Caveat privacy Anthropic:** quando feature entrar em uso real, atualizar submissão Meta App Review pra adicionar Anthropic PBC como operador (Drive docs vão pro Claude). Memory `meta_ig_only_tester_needed.md` já registra esse caveat.
6. **Project Google Cloud:** decisão Pedro 2026-05-22 — mover pra "Sem organização" pra desbloquear JSON key. Trade-off aceitável pra projeto isolado de 1 service account.

---

## 8. Como recomeçar (próxima sessão)

1. **Ler este arquivo.**
2. **Verificar status do desbloqueio:** Pedro pediu pro João Guglielmi liberar `roles/orgpolicy.policyAdmin` (ou Super Admin Workspace). Confirmar com Pedro se já saiu.
   - Se SAIU → continuar Setup ops seção 5.2 (desativar policy → gerar JSON → compartilhar Drive → env var VPS → restart backend → smoke test).
   - Se NÃO SAIU → não há trabalho de código a fazer agora. Não use personal Gmail (rejeitado pelo Pedro, com razão).
3. **Quando setup completo + smoke test passou:** Pedro avalia qualidade do output single-agent (Phase 6 closed). Se OK, iniciar **Phase 7 (refactor multi-agent)** seguindo o plano 7.1-7.5 da seção 4.5.
4. **Research completa** em [`research-debriefing-multi-agent.md`](research-debriefing-multi-agent.md) — base de toda decisão arquitetural Phase 7.
5. **Stream global:** HANDOFF principal `docs/superpowers/HANDOFF-metricas-v3.md` referencia múltiplos streams (Métricas V3, Ranking, Colaboradores, Reuniões). Debriefings entra como **Stream 5**.

---

## 9. Resumo executivo

| Item | Status |
|---|---|
| **Backend Phases 1-4** | ✅ Em produção |
| **Frontend Phase 5** | ✅ Em produção |
| **Migration 007 aplicada** | ✅ |
| **Supabase Storage bucket criado** | ✅ |
| **Google Cloud project + Drive API + service account** | ✅ (parcial — falta JSON key bloqueada por org policy) |
| **JSON key gerada** | ⏳ **Bloqueado** — aguardando João Guglielmi liberar role IAM |
| **Pasta Drive compartilhada com service account** | ⏳ Após JSON |
| **Env var VPS configurada** | ⏳ Após Drive |
| **Smoke test single-agent** | ⏳ Após VPS |
| **Research multi-agent** | ✅ Completa |
| **Spec Phase 7 multi-agent** | ✅ Consolidada nesta doc |
| **Phase 7 implementação** | ⏳ Após Phase 6 (smoke test) passar |
