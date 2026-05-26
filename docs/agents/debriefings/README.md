# FLG Debriefings — Agent Squad Architecture

> **Manifesto:** Como o sistema de Debriefings Estratégicos da FLG é organizado em squads de agentes especializados, com hierarquia de 2 níveis, condicionais explícitos e protocolos formais. Toda decisão tem fonte oficial e prova de uso em produção.

**Status:** v1 — design phase. Implementação após Phase 6 (setup ops) destravar.

**Maturity filter:** apenas patterns e tecnologias com **track record validado em produção pré-2026**. Nada bleeding edge sem testes consolidados. Cada decisão arquitetural em [`ARCHITECTURE.md`](ARCHITECTURE.md) cita fonte oficial + caso de uso em produção + alternativa rejeitada com motivo.

---

## 📋 Sumário desta pasta

```
docs/agents/debriefings/
├── README.md                          ← este arquivo (organograma + visão geral)
├── ARCHITECTURE.md                    ← ADRs com fonte + maturity por decisão
├── WORKFLOW.md                        ← fluxograma com condicionais
├── squads/
│   ├── orchestrator.agent.md          ← entry-point determinístico Python
│   ├── source-squad/
│   │   ├── README.md                  ← charter do squad
│   │   ├── drive-fetcher.agent.md     ← LLM Haiku
│   │   ├── clickup-fetcher.agent.md   ← LLM Haiku
│   │   └── classifier.agent.md        ← hybrid Python (regex + embedding + Haiku)
│   ├── synthesis-squad/
│   │   ├── README.md
│   │   ├── sectionizer.agent.md       ← LLM Sonnet
│   │   └── compositor.agent.md        ← LLM Sonnet
│   └── quality-squad/
│       ├── README.md
│       ├── citation-verifier.agent.md ← LLM Haiku
│       └── style-reviewer.agent.md    ← LLM Haiku
├── protocols/
│   ├── state.schema.md                ← state compartilhado entre agentes
│   ├── source-output.schema.md        ← saída do Source Squad
│   ├── synthesis-output.schema.md     ← saída do Synthesis Squad
│   ├── quality-verdict.schema.md      ← saída do Quality Squad
│   └── routing-rules.md               ← condicionais + retry policy
├── prompts/                           ← prompts versionados em git (1 pasta por agente)
│   ├── orchestrator/v1.md             ← system prompt (se virar LLM no futuro)
│   ├── classifier/v1.md
│   ├── sectionizer/v1.md
│   ├── compositor/v1.md
│   ├── citation-verifier/v1.md
│   └── style-reviewer/v1.md
└── runbooks/
    ├── adding-new-agent.md            ← como adicionar agente novo sem quebrar contrato
    ├── debugging-failed-run.md        ← diagnóstico de runs com erro
    └── cost-budget-tuning.md          ← como ajustar caps por agente
```

**Espelhamento docs ↔ Python (CI valida):**

Cada `<agente>.agent.md` em `docs/agents/debriefings/squads/<squad>/` tem irmão Python em `backend/agents/debriefings/squads/<squad>/<agente>.py`. CI valida correspondência 1:1. Doc tem o **contrato**, Python tem a **implementação**.

```
backend/agents/debriefings/
├── __init__.py
├── orchestrator.py                    ← entry-point, monta pipeline
├── state.py                           ← Pydantic model do State compartilhado
├── routing.py                         ← funções Python puras (hybrid classifier)
├── squads/
│   ├── source/
│   │   ├── drive_fetcher.py
│   │   ├── clickup_fetcher.py
│   │   └── classifier.py
│   ├── synthesis/
│   │   ├── sectionizer.py
│   │   └── compositor.py
│   └── quality/
│       ├── citation_verifier.py
│       └── style_reviewer.py
├── schemas/                           ← Pydantic — espelham protocols/*.schema.md
│   ├── state.py
│   ├── source_output.py
│   ├── synthesis_output.py
│   └── quality_verdict.py
└── tools/                             ← clients compartilhados
    ├── drive_client.py
    ├── clickup_client.py
    └── claude_client.py
```

---

## 🏛️ Organograma

```
┌────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR (Python determinístico — não-LLM)            │
│  - entry-point POST /debriefings                           │
│  - sequência fixa hardcoded: Source → Synthesis → Quality  │
│  - barreiras de sync + checkpoint findings_jsonb           │
│  - retry policy + cost guard                               │
│  - renderiza PDF final + upload Storage                    │
└──────┬───────────────────┬──────────────────┬──────────────┘
       │                   │                  │
       │  Fase 2: paralelo │  Fase 4-5: seq   │  Fase 6: paralelo
       │                   │                  │
   ┌───▼─────────┐    ┌────▼──────┐     ┌────▼──────────┐
   │ SOURCE SQUAD│    │ SYNTHESIS │     │ QUALITY SQUAD │
   │             │    │   SQUAD   │     │               │
   │ ┌─────────┐ │    │ ┌───────┐ │     │ ┌───────────┐ │
   │ │ drive-  │ │    │ │ sect- │ │     │ │ citation- │ │
   │ │ fetcher │ │    │ │ ionizer│ │     │ │ verifier  │ │
   │ │ (Haiku) │ │    │ │(Sonnet)│ │     │ │ (Haiku)   │ │
   │ └─────────┘ │    │ └───┬───┘ │     │ └───────────┘ │
   │ ┌─────────┐ │    │     │     │     │ ┌───────────┐ │
   │ │ clickup-│ │    │ ┌───▼───┐ │     │ │ style-    │ │
   │ │ fetcher │ │    │ │ compo-│ │     │ │ reviewer  │ │
   │ │ (Haiku) │ │    │ │ sitor │ │     │ │ (Haiku)   │ │
   │ └─────────┘ │    │ │(Sonnet)│ │     │ └───────────┘ │
   │ ┌─────────┐ │    │ └───────┘ │     │               │
   │ │ class-  │ │    │           │     │ Orchestrator  │
   │ │ ifier   │ │    │ Seq:      │     │ decide:       │
   │ │ (hybrid)│ │    │ section-  │     │ accept/retry/ │
   │ └─────────┘ │    │ izer ANTES│     │ abort         │
   │             │    │ compositor│     │               │
   │ Parallel:   │    │           │     │ Parallel:     │
   │ asyncio.    │    │           │     │ asyncio.      │
   │ gather()    │    │           │     │ gather()      │
   └─────────────┘    └───────────┘     └───────────────┘
                                                │
                                          ┌─────▼────────┐
                                          │ PDF Render   │
                                          │ (WeasyPrint) │
                                          │ + Storage    │
                                          └──────────────┘
```

**Profundidade = 2 níveis** (orchestrator → squad → agent). Não vai pra 3. Validado pela pesquisa: hierarquia profunda gera thrashing entre níveis (arXiv 2508.12683 taxonomia HMAS).

---

## 👥 Inventário dos componentes

| Componente | Tipo | Modelo | Squad | Custo USD esperado |
|---|---|---|---|---|
| **Orchestrator** | Python determinístico | n/a | — | $0 |
| `drive_fetcher` | LLM | Haiku 4.5 | source | $0,045 |
| `clickup_fetcher` | LLM | Haiku 4.5 | source | $0,027 |
| `classifier` | Hybrid Python (regex → embedding → Haiku fallback) | Haiku 4.5 (5% dos calls) | source | $0,005 |
| `sectionizer` | LLM | Sonnet 4.6 | synthesis | $0,08 |
| `compositor` | LLM | Sonnet 4.6 | synthesis | $0,28 |
| `citation_verifier` | LLM | Haiku 4.5 | quality | $0,025 |
| `style_reviewer` | LLM | Haiku 4.5 | quality | $0,015 |
| `PDF render` | Python determinístico (WeasyPrint) | n/a | — | $0 |
| **Total esperado** | | | | **~$0,49 ≈ R$2,70** |

Comparado ao single-agent atual (~R$3,50), arquitetura squad fica **mais barata**, contraintuitivo mas explicável: Haiku 4.5 nos 5 agentes de I/O derruba o custo de input mais do que paga overhead.

**Cap de segurança:** $5 (~R$28) por debriefing. Abort se ultrapassar.

---

## 🎯 Princípios de design (validados)

1. **Hierarchical com depth=2** — orchestrator coordena squads, squads coordenam agentes. Profundidade maior gera thrashing (paper arXiv 2508.12683). ([fonte](https://arxiv.org/html/2508.12683))

2. **Orchestrator é Python, não LLM** — sequência fixa hardcoded (Source → Synthesis → Quality). Sem decisão dinâmica → LLM router é overhead inútil. Glean Waldo pattern (2025) demonstra: separar "planner" determinístico do "synthesizer" frontier corta 50% latência e 25% tokens. ([fonte](https://www.glean.com/blog/waldo-launch))

3. **Source Squad em paralelo via `asyncio.gather()`** — drive/clickup/classifier independentes. Python standard há 12 anos.

4. **Synthesis Squad sequencial** — sectionizer ANTES de compositor (compositor precisa do outline). Sem paralelismo possível.

5. **Quality Squad em paralelo** — citation-verifier e style-reviewer auditam o mesmo Markdown, independentes. Orchestrator consolida verdicts.

6. **Generator-Verifier obrigatório** — Quality Squad NÃO é opcional. CLEAR Framework benchmark: pass@k cai de 60% (single-run) pra 25% (8-run) sem verifier. Ele estabiliza variance. ([fonte](https://galileo.ai/blog/benchmarks-multi-agent-ai))

7. **Hybrid 3-layer routing no classifier** — regex (resolve 70%) → embedding (resolve mais 25%) → Haiku fallback (5% ambíguo). Latência média 50-200ms, custo ~$0,005/req. ([fonte](https://medium.com/@cplog/semantic-router-blazing-fast-decisions-for-llm-agents))

8. **Modelo certo por tarefa**:
   - Haiku 4.5 nos workers de I/O (extração, classificação, revisão): high-volume + low-stakes
   - Sonnet 4.6 nos workers de síntese: low-volume + high-stakes
   - Opus 4.7 opt-in via flag pra clientes high-touch (sectionizer + compositor)

9. **Comunicação inter-agente: Pydantic + JSON dict no state compartilhado** — zero protocolo. MCP/A2A deferred até houver agentes externos. Cada agente tem `input_schema`/`output_schema` Pydantic documentado → migração futura pra A2A é wrap.

10. **Espelhamento docs ↔ Python validado por CI** — `*.agent.md` em `docs/agents/.../` ↔ módulo Python correspondente. Falha de CI bloqueia merge se ficar desincronizado.

11. **Prompts versionados em arquivos separados** — `prompts/<agente>/v1.md`. Git puro versiona. Hash do prompt embutido no trace de cada execução. Migrar pra ferramenta dedicada (Langfuse/Maxim/Braintrust) só quando non-engineers editarem ou A/B test entrar em loop. ([fonte](https://www.getmaxim.ai/articles/version-control-for-prompts))

---

## 🚦 Fluxo resumido (detalhe em [`WORKFLOW.md`](WORKFLOW.md))

1. **Trigger:** comercial clica "Novo Debriefing" → POST `/debriefings`
2. **Orchestrator:** persist row `status='gerando'`, abre SSE pro frontend
3. **Source Squad (paralelo, fase 2):**
   - `drive_fetcher` lista pasta + baixa docs
   - `clickup_fetcher` extrai tasks/comentários
   - `classifier` (executa após `drive_fetcher`, dentro do mesmo squad) classifica cada doc do Drive
4. **Orchestrator:** barreira de sync, persist `findings_jsonb` (checkpoint barato)
5. **Synthesis Squad (sequencial, fase 4-5):**
   - `sectionizer` cria outline com 11 seções FLG
   - `compositor` preenche cada seção com prosa baseada nos findings
6. **Quality Squad (paralelo, fase 6):**
   - `citation_verifier` valida claims contra findings
   - `style_reviewer` valida tom corporativo FLG
7. **Orchestrator decide:**
   - `verdict.pass = true` → renderiza PDF (fase 7)
   - `verdict.pass = false AND retry_count < 1` → devolve issues pro compositor (max 1 retry)
   - `verdict.pass = false AND retry_count >= 1` → `status='falhou'` + razão acionável
8. **PDF + Storage:** WeasyPrint → Supabase Storage → signed URL no row
9. **SSE done** → frontend mostra "Baixar PDF"

---

## 📚 Para se aprofundar

| Quer entender... | Leia |
|---|---|
| Por que escolhi cada pattern | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Como exatamente o fluxo se ramifica | [`WORKFLOW.md`](WORKFLOW.md) |
| Schema JSON entre squads | [`protocols/state.schema.md`](protocols/state.schema.md), [`protocols/source-output.schema.md`](protocols/source-output.schema.md), [`protocols/synthesis-output.schema.md`](protocols/synthesis-output.schema.md), [`protocols/quality-verdict.schema.md`](protocols/quality-verdict.schema.md) |
| Condicionais e retry policy | [`protocols/routing-rules.md`](protocols/routing-rules.md) |
| O que faz cada agente | `squads/<squad>/<agente>.agent.md` |
| Prompt completo de cada agente LLM | `prompts/<agente>/v1.md` |
| Como adicionar agente novo no futuro | [`runbooks/adding-new-agent.md`](runbooks/adding-new-agent.md) |
| Estado atual da feature (Phase 6 setup) | [`../../superpowers/HANDOFF-debriefings.md`](../../superpowers/HANDOFF-debriefings.md) |
| Pesquisas que embasaram | [`../../superpowers/research-debriefing-multi-agent.md`](../../superpowers/research-debriefing-multi-agent.md) + [`../../superpowers/research-debriefing-squad-architecture.md`](../../superpowers/research-debriefing-squad-architecture.md) |

---

## 🔒 Critério "validated only"

Em cada arquivo desta pasta, decisões arquiteturais incluem **metadados de maturidade**:

```yaml
source: Anthropic blog "Multi-Agent Research System" (Jun 2025)
production_use: Claude Research feature (Anthropic), Glean Waldo (Glean, 2025)
maturity: validated   # experimental | validated | battle-tested
```

Patterns SEM essa validação são rejeitados ou marcados como `experimental` + alternativa indicada. Reviewer humano (Pedro Aranda + futuros) tem direito de questionar e exigir downgrade pra `experimental` se a evidência for fraca.
