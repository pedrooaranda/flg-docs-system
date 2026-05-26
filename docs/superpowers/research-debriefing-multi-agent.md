# Multi-agent para Debriefing Estratégico FLG — Pesquisa Profunda

**Data:** 2026-05-26
**Contexto:** FLG Brasil, consultoria. Cada renovação de cliente exige documento
estratégico de ~20 páginas compilando 6 meses de trabalho (ClickUp + Drive +
transcrições + relatórios). Pipeline single-agent (Claude Sonnet 4.6) já em
produção, Phases 1-5 deployed; custo atual ~R$3-12 por doc, latência 60-90s.
Decisão em aberto: migrar para multi-agent.

Fontes citadas no fim do documento.

---

## 1. Arquitetura multi-agent — best practices Anthropic

### 1.1. O blueprint oficial (orchestrator-worker)

A Anthropic publicou em jun/2025 o post de engenharia "How we built our
multi-agent research system" descrevendo o motor por trás do feature Claude
Research. A arquitetura é estritamente **orchestrator + parallel subagents**:

- Um **Lead Researcher** recebe a query, decompõe em sub-tarefas, salva o
  plano em memória externa (sobrevive ao truncamento de contexto) e spawna
  3–5 subagentes em paralelo.
- Cada subagente roda com **seu próprio context window**, seu próprio system
  prompt, seu próprio conjunto de tools.
- Subagentes retornam **findings condensados** (não chat-style verbose) via
  shared memory store / filesystem — o lead nunca recebe o transcript bruto.
- Um **CitationAgent** roda no final pra atribuir as claims às fontes
  específicas. É o único componente "verifier" no blueprint.

Resultado interno citado: **+90,2% de performance vs single Claude Opus 4**
no eval de pesquisa.

### 1.2. Os 5 padrões oficiais (claude.com/blog)

Em "Multi-Agent Coordination Patterns" a Anthropic enumera 5 padrões. Para
nosso caso (síntese de documento estratégico a partir de fontes finitas):

| Padrão | Quando usar | Veredito FLG |
|---|---|---|
| **Generator–Verifier** | Quando há critério explícito de qualidade (factualidade, completude, estilo). | **Top fit.** Compositor gera, Reviewer audita contra fontes. |
| **Orchestrator–Subagent** | Decomposição em fases claras, cada fase com escopo isolado. | **Segundo fit.** Bom pra ClickUp ∥ Drive ∥ Métricas como ramos paralelos. |
| **Agent Teams** | Trabalhadores persistentes acumulando contexto entre execuções. | Não se aplica — debriefing é one-shot por ciclo. |
| **Message Bus** | Eventos roteados a especialistas. | Overkill. |
| **Shared State** | Sem coordenador central, agentes leem/escrevem em store comum. | Risco de loop, debug difícil. |

A guidance oficial é explícita: **"start with orchestrator–subagent"** e
evolui só se observação mostrar limitação. Para document synthesis o post
recomenda **Generator–Verifier** como melhor fit, com Orchestrator–Subagent
como segundo, sendo possível compor: orchestrator que termina com um
verifier final.

### 1.3. Quando single-agent ainda é a resposta certa

Citação direta do post Anthropic: multi-agent **"underperforms para domínios
que requerem shared context ou interdependências pesadas, como a maioria das
tasks de coding"**. Single-agent vence quando:

- Cada decisão depende de tudo que veio antes (fluxo serial puro).
- O volume de tokens cabe folgado num único context window (Sonnet 4.6
  comporta 200k+, Opus mais).
- O ganho marginal de especialização não justifica o overhead (multi-agent
  consome **~15x mais tokens** que single-agent, **~4x mais que chat**).
- Não há multi-source com sub-domínios independentes (e.g. transcrição ≠
  task tracker ≠ relatório financeiro).

Para o debriefing FLG: **temos fontes independentes (ClickUp, Drive docs,
transcrições, relatórios de entrega) e critério de qualidade explícito
(metodologia FLG, citação de fontes, template fixo de 20 páginas)** — ou
seja, condições favoráveis a multi-agent. Mas com 6 meses de dados isso
ainda cabe num único context window se compactarmos bem.

### 1.4. Paralelo vs sequencial — regra prática

Da Anthropic: agente líder usa subagentes em paralelo cortou "research time
em até 90%" para queries complexas. Mas o lead executa subagentes
**sincronamente** (espera todos terminarem) — bottleneck reconhecido pelos
próprios autores.

Regra: paralelize tudo que é **fan-out** (extração de fontes independentes,
análises ortogonais); sequencialize o que tem **dependência de dados**
(composição final precisa de todos os findings prontos).

---

## 2. Frameworks de orquestração — estado de mercado 2026

Snapshot maio 2026 dos principais frameworks:

| Framework | Status | Produção? | Embed em FastAPI Python? |
|---|---|---|---|
| **LangGraph** (LangChain) | v1.0 GA out/2025, runtime default LangChain | **Sim — durabilidade, checkpointing, sobrevive a restart** | Sim, lib Python first-class |
| **CrewAI** | v1.0 GA | OK pra protótipo, **sem checkpointing**, times migram pra LangGraph quando escala | Sim, mas abstração "role-based" rígida |
| **AutoGen** (Microsoft) | **Maintenance mode** desde início 2026; README aponta pra "Microsoft Agent Framework" | Não recomendado pra novos projetos | — |
| **OpenAI Swarm** | **Arquivado** mar/2025, substituído por **OpenAI Agents SDK** | Agents SDK ainda jovem; Swarm explicitamente "não use em prod" | Possível mas amarra a stack OpenAI |
| **Claude Agent SDK** | **Oficial Anthropic**, Python + TS, com `agents={}` (subagents nativos), hooks, MCP, sessions | Sim — usa o mesmo loop do Claude Code | **Sim, perfeito** — query() é async, integra direto em endpoint FastAPI |
| **LlamaIndex Agentic Workflows** | Estável | OK pra RAG-heavy | Sim mas mais voltado a RAG do que orchestration |

### 2.1. Veredito para FLG (FastAPI Python existente)

Duas opções realistas:

**(A) Claude Agent SDK** — recomendação primária. Vantagens:
- API oficial Anthropic, mesma stack do Claude Code, **sub-agents nativos
  via `AgentDefinition`** com prompt + tools próprios.
- Hooks (`PreToolUse`, `PostToolUse`, `Stop`) pra observability, logging,
  cost guards.
- Sessions com resume/fork → checkpointing barato.
- Roda dentro do processo FastAPI (Python ou TS), sem rede extra.
- Suporta MCP nativo (já temos servidores ClickUp, Drive instalados).
- **Cuidado:** a partir de 15/jun/2026 muda o pricing (credit separado em
  planos subscription); API key direta continua billing normal.

**(B) Custom Python "thin orchestrator"** — alternativa minimalista.
- ~150 linhas de Python: `asyncio.gather()` pros workers paralelos, dict
  de findings como shared state, função de síntese final.
- Pattern descrito no cookbook Anthropic (`orchestrator_workers.ipynb`) é
  **literalmente isso** — sequential loop hoje, recomendam `asyncio` pra
  paralelizar. Não há synthesis step no notebook (gap reconhecido).
- Vantagem: zero dependências novas, controle total, debug trivial.
- Desvantagem: você reescreve hooks/sessions/checkpointing.

**Não usar:** LangGraph (durabilidade que não precisamos — job de 3-5min
não justifica o overhead conceitual de state machine). CrewAI (rigidez de
roles e sem checkpointing). AutoGen/Swarm (mortos ou em manutenção).

---

## 3. Casos de uso similares no mercado

### 3.1. Otter / Fathom / Gong / Sembly — single-source

Esses produtos fazem **uma fonte (áudio de reunião) → transcript → summary
estruturado**. Não são multi-source. Padrão típico:

1. ASR (Whisper / proprietário) para transcript.
2. NLP/LLM para identificar speakers, action items, decisions.
3. Template fixo por vertical (Gong = sales objections, Sembly = exec
   summary). Summary quality difere por verticalização do prompt, não por
   multi-agent.

Lição: **um agente especializado por *tipo* de fonte produz output mais
limpo que generalista**. Gong sales summary > Otter geral porque o prompt é
verticalizado para signals de venda.

### 3.2. Glean Waldo — separa search planning do frontier

Padrão mais interessante e diretamente aplicável ao FLG. Glean Waldo é um
modelo **dedicado a tool planning** (Glean Search + employee search + web
search) que roda **ANTES** do frontier LLM, não como sub-agent. Por quê:

- Sub-agent design seria 3 inferências (frontier decide → Waldo busca →
  frontier responde). Waldo-first é **1 inferência frontier**.
- Resultado: **~50% latência menor, ~25% menos tokens, qualidade mantida**.
- Waldo (30B Nemotron) não escreve texto; produz **structured context**
  pro frontier sintetizar.

Lição direta: **separar "decidir quais fontes consultar" de "redigir o
documento"** vale a pena, e o "scout" pode ser modelo menor (Haiku 4.5).

### 3.3. Salesforce Einstein / HubSpot Breeze — outcome-based pricing

Salesforce e HubSpot tarifam por **outcome** (HubSpot Customer Agent $0.50
por conversa resolvida; Prospecting Agent $1 por lead qualificado).
Implicação pro FLG: nosso custo-meta de R$30 por debriefing (~$6) é
**competitivo até generoso** comparado a outcome-pricing de SaaS enterprise.
Há folga pra overhead de multi-agent.

### 3.4. Glean enterprise search — RAG sobre unified schema

Glean indexa 100+ fontes empresariais num **unified document schema** e usa
RAG com synthesis multi-fonte. Lição: se for crescer pra mais clientes /
mais fontes, vale padronizar o schema dos findings (ex: `{type, source_id,
date, summary, raw_excerpt, citation_uri}`) antes de mais sub-agents.

---

## 4. Decomposição em sub-agentes — proposta refinada

A proposta original do brief tinha 8 agentes (Source Scout, ClickUp,
Drive, Transcrição, Relatórios, Timeline, Methodology, Recommender,
Composer, Reviewer). **Está sobre-engenheirada.** Eis a crítica e a
contraproposta:

### 4.1. Onde sobra

- **Agent 1 (Source Scout)** decidindo escopo: o input do usuário já
  determina `cliente_id`, `periodo_inicio`, `periodo_fim`, `list_id`,
  `folder_id`. Não há "decisão de escopo" real — é **lookup determinístico**,
  não precisa de LLM. Sobre-engenheirado.
- **Sub-agents 3a/3b separados** dentro do Drive Extractor: transcrições e
  relatórios são ambos PDF/Doc com chunking similar. Faz mais sentido **um
  Drive worker** que classifica por tipo de doc e roteia. Dois sub-agents
  dobram tokens sem ganho mensurável.
- **Agent 4 (Timeline Reconstructor)** e **Agent 5 (Methodology Analyst)**
  e **Agent 6 (Strategic Recommender)** são na verdade **três facetas da
  mesma síntese**. Cada um exige todo o contexto das fontes — não há
  paralelismo natural. Fundir num único "Strategic Analyst" que recebe
  findings estruturados de todas as fontes evita 3x cache write de contexto.

### 4.2. Onde falta

- **Reranking/sufficiency check** após extração: o sub-agent que vasculha
  Drive pode terminar dizendo "achei 30 docs mas só 12 são relevantes pro
  período do ciclo" — esse filtro deveria ser explícito, não implícito no
  prompt do worker.
- **Critic/Reviewer** está presente (Agent 8) mas o critério precisa ser
  **explícito e mensurável**: "cada bullet do output cita ≥1 fonte"; "todas
  as 5 dimensões da metodologia FLG aparecem"; "0 invenções não citadas".
  Padrão Generator–Verifier real.

### 4.3. Arquitetura recomendada — 5 agentes (não 8)

```
[Orchestrator] (determinístico, Python — sem LLM)
   │
   │  Fan-out paralelo (asyncio.gather):
   ├─► [Worker A: ClickUp Extractor]   (Haiku 4.5)
   │     → tasks + comments + status filtrados por período
   │     → output structured JSON: {tasks: [...], milestones: [...]}
   │
   ├─► [Worker B: Drive Extractor + Classifier]   (Haiku 4.5)
   │     → lista pasta, filtra por data, baixa, classifica
   │       (transcricao | relatorio_entregas | doc_estrategico | outro),
   │       extrai key points por tipo
   │     → output JSON: {transcricoes: [...], relatorios: [...], docs: [...]}
   │
   │  Sync barrier (espera A e B)
   │
   ├─► [Worker C: Strategic Synthesizer]   (Sonnet 4.6 OU Opus 4.7)
   │     → recebe findings A + B, aplica metodologia FLG (Cadeira Vazia,
   │       Tríades, Schwartz, Progressão de Autoridade), cruza timeline,
   │       redige markdown completo do template de 20 páginas
   │
   ├─► [Worker D: Citation & Completeness Reviewer]   (Haiku 4.5)
   │     → verifica:
   │         - cada claim factual tem citation_uri
   │         - template completo (todas as seções presentes)
   │         - 0 invenções (sample N claims, check contra findings)
   │     → output: {pass: bool, issues: [...]}
   │     → se fail: devolve issues pro Worker C corrigir (max 1 retry)
   │
   └─► PDF render (determinístico, mesmo do single-agent atual)
```

**Justificativas:**

- Orchestrator é Python puro: já temos `debriefing_generator.py` (364
  linhas) fazendo isso. Não precisa virar LLM.
- A+B paralelos (asyncio): cortam latência. Independentes por construção
  (fontes diferentes).
- C é o trabalho pesado e quem justifica o custo — é o único que **precisa
  do modelo grande**. Recebe findings já estruturados, com tokens
  compactados.
- D é cheap (Haiku) e mensurável. Generator–Verifier pattern oficial.
- Modelo mixto: **Haiku 4.5 nos workers extratores e no reviewer, Sonnet
  4.6 (ou Opus 4.7) no Synthesizer**. Haiku custa ~$0.80/M input, ~$4/M
  output — ordem de grandeza mais barato que Opus.

---

## 5. Pitfalls — token, latência, erro, custo, debug, qualidade

### 5.1. Token explosion — mitigação concreta

Anthropic reporta multi-agent consumindo ~15x mais tokens que chat. Para
FLG isso significaria saltar de ~R$3-12 single-agent para **R$45-180** sem
mitigação — acima da meta de R$30.

**Mitigações ordenadas por impacto:**

1. **Prompt caching cross-agent.** Cache TTL 1h ($10/M write, $0.50/M
   read = 90% off em reads) compartilha system prompt + tool definitions +
   contexto da metodologia FLG entre os 4 workers. Cada call de worker hit
   no cache em vez de reescrever 5-10k tokens.
2. **Structured findings, não chat transcripts.** Worker A devolve JSON
   compacto (`{tasks: [{id, title, status, last_comment_summary}]}`), não
   o transcript completo do Claude pensando. Mesmo princípio do "artifact
   pattern" da Anthropic.
3. **Modelo certo por tarefa.** Haiku 4.5 nos extratores derruba custo de
   input ~5x vs Sonnet, ~15x vs Opus.
4. **Sem reentries desnecessários.** Worker D faz ≤1 retry no Synthesizer
   — não loop infinito.

### 5.2. Latência — paralelismo onde dá

- A+B paralelos: tempo total ≈ max(A,B) ≈ 15-25s cada.
- C sequencial: 30-45s (output grande, ~16k tokens).
- D rápido: 5-10s (Haiku, output curto).
- **Total esperado: 60-90s** — mesmo do single-agent atual. Multi-agent
  não precisa ser mais lento se o fan-out é bem aproveitado.

### 5.3. Error propagation

Anthropic blueprint é "happy path". Produção precisa:

- **Timeout por worker** (e.g. 60s). Worker que estoura → orchestrator
  registra parcial e segue com warning no findings.
- **Worker D vê findings incompletos** e ou prossegue com nota de gap, ou
  aborta com erro acionável.
- **Sem retry cego.** Falha de tool call (Drive 403, ClickUp rate-limit)
  é retornada com causa pra usuário decidir; falha de parsing pode 1
  retry com prompt corrigido.
- **Checkpointing barato:** persistir findings A+B no Supabase ANTES de
  chamar C. Se C falhar, retoma sem refazer extração — corta custo de
  retry pela metade.

### 5.4. Custo real — projeção

Hipóteses (preços Sonnet 4.6: $3/M input, $15/M output; Haiku 4.5:
~$0.80/M input, $4/M output; Opus 4.7: $15/M input, $75/M output):

Single-agent atual (Sonnet 4.6): ~50k tokens input, ~16k output → ~$0.39
input + $0.24 output = ~**$0.63 = R$3.50**. Bate com a baseline reportada.

Multi-agent recomendado (Sonnet no Synthesizer, Haiku no resto, cache 1h):

| Worker | Modelo | Input | Cached input | Output | Custo USD |
|---|---|---|---|---|---|
| A — ClickUp | Haiku | 8k @ $0.80 + 12k cached @ $0.08 | | 3k @ $4 | ~$0.027 |
| B — Drive | Haiku | 15k @ $0.80 + 12k cached @ $0.08 | | 4k @ $4 | ~$0.045 |
| C — Synthesizer | Sonnet | 8k @ $3 + 12k cache write @ $3.75 + 7k findings @ $3 | | 16k @ $15 | ~$0.32 |
| D — Reviewer | Haiku | 18k @ $0.80 + 12k cached @ $0.08 | | 1k @ $4 | ~$0.022 |
| **Total** | | | | | **~$0.42 ≈ R$2.30** |

**Multi-agent fica MAIS BARATO que single-agent atual**, contraintuitivo
mas explicável: ao usar Haiku no grosso da extração, economizamos mais do
que pagamos no overhead. Folga gigante até a meta de R$30. Se trocar
Synthesizer pra Opus 4.7 ($15/M input, $75/M output), sobe pra ~$1.80 ≈
R$10 — ainda dentro da meta.

**Guardrail recomendado:** cost cap por debriefing de $5 (~R$28) e abort
com erro se ultrapassar. Já existe `custo_usd` no `DebriefingResult`,
basta interceptar.

### 5.5. Observability / debug

Multi-agent é notoriamente difícil de debugar. Anthropic recomenda:

- **Trace por agent_id + parent_tool_use_id** (Agent SDK fornece o segundo
  nativamente).
- **Logar findings estruturados** em cada hand-off (não chat completion
  bruto).
- **Worker-level cost & token counters** persistidos por debriefing.
- **Replay-friendly state:** se findings A+B estão no DB, podemos
  re-rodar só o Synthesizer offline pra investigar qualidade.

### 5.6. Quality — multi-agent realmente entrega mais?

Evidência mista. Anthropic reporta +90.2% em research eval; CLEAR Framework
e MultiAgentBench mostram que **consistência cai com multi-agent**: agent
performance vai de 60% single-run para 25% no 8-run pass@k. Tradução: um
multi-agent pode ser MELHOR no melhor run e PIOR no pior run.

Para FLG isso significa: **adicionar Reviewer (Worker D) não é opcional,
é o que estabiliza a variance**. Sem ele, multi-agent é potencialmente
mais ruidoso que single-agent.

---

## Recomendação Concreta para FLG

**Arquitetura:** orchestrator–subagent + verifier final (compõe os 2
padrões oficiais Anthropic). **4 workers**, não 8.

**Framework:** Claude Agent SDK (Python). Justificativas:
- Oficial Anthropic, `AgentDefinition` nativo pra subagents.
- Roda dentro do FastAPI existente (`async for message in query(...)`).
- Hooks pra cost guard, observability, audit log.
- Sessions com resume → checkpointing barato.
- MCP nativo (já temos ClickUp + Drive MCP).
- Não amarra à reescrita do `debriefing_generator.py` atual — pode
  conviver lado a lado (`debriefing_generator_v2.py`) e ser ligado por
  feature flag.

**Modelos:**
- Workers A (ClickUp), B (Drive), D (Reviewer): **Claude Haiku 4.5**.
- Worker C (Synthesizer): **Claude Sonnet 4.6** (default) com opção de
  promover pra **Opus 4.7** via flag pra clientes high-touch.

**Paralelismo:**
- A ∥ B com `asyncio.gather()`.
- C sequencial após barrier.
- D sequencial após C, com max 1 retry de C se D falhar.

**Prompt caching:**
- Cache 1h ($10/M write, $0.50/M read) no system prompt + metodologia FLG
  + template do output. Compartilhado byte-a-byte entre A, B, C, D.
- Cache 5min ($6.25/M) nos findings de A+B passados para C e D.
- Pre-warm opcional se for batch de debriefings (vários clientes na mesma
  janela de renovação).

**Custo projetado:** ~$0.42 (~R$2.30) por debriefing — abaixo do
single-agent atual. Cost cap de $5 (~R$28) como guardrail.

**Latência projetada:** 60-90s, igual ao atual. Sem regressão.

**Plano de rollout:**
1. **Phase 6.1 — Skeleton:** subir `debriefing_generator_v2.py` com Agent
   SDK + os 4 `AgentDefinition`s, sem prompt caching. Feature flag
   `USE_MULTIAGENT=false` por padrão.
2. **Phase 6.2 — Findings schema:** padronizar JSON output de A e B,
   persistir em `debriefings.findings_jsonb` (nova coluna).
3. **Phase 6.3 — Reviewer (Worker D):** validar template completeness +
   citações antes de PDF.
4. **Phase 6.4 — Cache + cost guard:** ligar prompt caching + hook
   `PreToolUse` somando custo e abortando em $5.
5. **Phase 6.5 — A/B canary:** rodar multi-agent em paralelo com
   single-agent em 5-10 debriefings reais, comparar (qualidade subjetiva
   por Pedro + token cost + latência), promover ou rollback.

**O que NÃO fazer agora:**
- Não migrar pra LangGraph/CrewAI — custo de aprendizado não justifica.
- Não criar Source Scout LLM (é lookup determinístico).
- Não separar Transcription Synthesizer e Report Reader (mesmo worker
  Drive com classificador interno).
- Não adicionar Timeline Reconstructor / Methodology Analyst / Strategic
  Recommender como agentes separados (são facetas do mesmo Synthesizer).

**Critério de sucesso da Phase 6:** em 10 debriefings A/B, multi-agent
empata ou supera single-agent em (a) completude do template (todas as
seções FLG presentes), (b) densidade de citação (≥1 fonte por bullet
factual), (c) custo ≤ single-agent, (d) latência ≤ +20%. Se não bater,
rollback e investigar antes de promover.

---

## Fontes

**Anthropic oficial**
- Multi-Agent Research System (engineering blog): <https://www.anthropic.com/engineering/multi-agent-research-system>
- Multi-Agent Coordination Patterns: <https://claude.com/blog/multi-agent-coordination-patterns>
- Building Effective AI Agents: <https://resources.anthropic.com/building-effective-ai-agents>
- Prompt Caching (API docs): <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
- Claude Agent SDK overview: <https://code.claude.com/docs/en/agent-sdk/overview>
- Cookbook — orchestrator-workers: <https://github.com/anthropics/anthropic-cookbook/blob/main/patterns/agents/orchestrator_workers.ipynb>
- Prompt caching launch (news): <https://www.anthropic.com/news/prompt-caching>

**Análises de produção**
- "Anthropic's Multi-Agent Blueprint: What Production Adds" (Fountain City): <https://fountaincity.tech/resources/blog/anthropic-multi-agent-blueprint-production/>
- "How Anthropic Built a Multi-Agent Research System" (ByteByteGo): <https://blog.bytebytego.com/p/how-anthropic-built-a-multi-agent>

**Comparativos de frameworks 2026**
- LangGraph vs CrewAI vs AutoGen vs Swarms: <https://www.buildmvpfast.com/blog/langgraph-vs-crewai-vs-autogen-vs-swarms-agent-framework-2026>
- Which AI Agent Framework for Production: <https://docs.bswen.com/blog/2026-04-29-agent-framework-production-comparison/>
- Best Multi-Agent Frameworks 2026: <https://gurusup.com/blog/best-multi-agent-frameworks-2026>

**Casos de uso de mercado**
- Glean Waldo (agentic search pré-frontier): <https://www.glean.com/blog/waldo-launch>
- Glean enterprise search architecture: <https://www.zenml.io/llmops-database/building-robust-enterprise-search-with-llms-and-traditional-ir>
- Salesforce Einstein pricing: <https://aisotools.com/pricing/salesforce-einstein>
- HubSpot Breeze outcome-based pricing: <https://www.saastr.com/hubspot-switching-ai-pricing-from-per-use-to-per-resolution-but-does-it-really-matter/>
- Otter vs Fathom vs Fireflies (2026): <https://otter.ai/blog/otter-vs-fathom-which-ai-meeting-tool-is-better>

**Benchmarks single vs multi-agent**
- MultiAgentBench (ACL 2025): <https://aclanthology.org/2025.acl-long.421/>
- AgentArch (enterprise benchmark): <https://arxiv.org/html/2509.10769v1>
- The Reliability Gap (Paul Simmering): <https://simmering.dev/blog/agent-benchmarks/>
- Benchmarking Multi-Agent AI (Galileo): <https://galileo.ai/blog/benchmarks-multi-agent-ai>

**Outros**
- AI Agent Cost Optimization 2026: <https://moltbook-ai.com/posts/ai-agent-cost-optimization-2026>
- Anthropic prompt caching deep-dive (Medium): <https://medium.com/ai-software-engineer/anthropic-just-fixed-the-biggest-hidden-cost-in-ai-agents-using-automatic-prompt-caching-9d47c95903c5>
