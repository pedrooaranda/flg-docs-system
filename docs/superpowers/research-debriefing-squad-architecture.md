# Squad Architecture para Debriefing Estratégico FLG — Pesquisa Profunda

**Data:** 2026-05-26
**Contexto:** continuação de `research-debriefing-multi-agent.md`. Aquele
documento cobriu patterns Anthropic, frameworks, custo/latência e
decomposição em 4 agentes. Este foca em **5 gaps específicos** sobre como
montar e documentar o organograma de squads pro debriefing FLG.

---

## Gap 1 — Hierarquia vs Flat (Squads de Agentes)

### 1.1. Manager-Worker (CrewAI Hierarchical Process)

CrewAI implementa Manager-Worker como `Process.hierarchical`: um manager
LLM (auto-gerado ou customizado via `manager_agent`) recebe o goal,
decompõe e delega a workers. O manager é **necessariamente** uma chamada
LLM extra a cada decisão de delegação.

**Custo medido:** uma crew de 3 workers + 3 tasks gera ~6-9 chamadas
extras só do manager. Em crews de 5 tasks, o manager adiciona
**+30-50% de tokens** vs `Process.sequential`. ([CallSphere](https://callsphere.ai/blog/crewai-process-types-sequential-hierarchical-consensual-workflows))

**Falha conhecida (anti-pattern):** Towards Data Science mostrou que o
manager auto-gerado **executa todas as tasks sequencialmente mesmo
quando irrelevantes** — pra query técnica pura, o billing agent rodou
do mesmo jeito (38s, 15.7k tokens, output ruim). Solução: substituir
por `manager_agent` customizado com routing explícito (24s, 10k tokens,
output bom). ([Towards Data Science](https://towardsdatascience.com/why-crewais-manager-worker-architecture-fails-and-how-to-fix-it/))

**Veredito FLG:** o auto-manager do CrewAI **não serve**. Se for usar
manager-worker, tem que ser deterministic (Python decide) + LLM só pra
síntese.

### 1.2. Supervisor (LangGraph)

Supervisor é o padrão **mais usado em produção LangGraph**: 1 supervisor
recebe input, escolhe próximo agente via `Command` ou `Send`, recebe
output, decide se continua ou termina. Diferente do manager-worker do
CrewAI, o supervisor é um **nó num StateGraph** — o framework garante
checkpoint após cada nó (resume em falha).

Benchmark Focused.io (supervisor vs swarm em customer service): ([Focused](https://focused.io/lab/multi-agent-orchestration-in-langgraph-supervisor-vs-swarm-tradeoffs-and-architecture))

| Métrica | Supervisor | Swarm |
|---|---|---|
| Latência single-domain | 4,2s | 2,8s |
| Latência handoff | 9,1s | 5,4s |
| LLM calls handoff | 4 | 2 |
| Routing accuracy | 94% | 91% |

Recomendação oficial: **comece com supervisor**, migre pra swarm só
quando latência virar gargalo medido E roteamento estiver confiável.

### 1.3. Hierarchical Teams (Supervisor of Supervisors)

LangGraph documenta `hierarchical_teams` como evolução do supervisor:
sub-teams com supervisor próprio + top-supervisor coordenando. O paper
arXiv 2508.12683 (taxonomia HMAS) classifica isso como **temporal
hierarchy** — top decide estratégia (rara, cara, longa), bottom decide
tática (frequente, barata, curta).

**Profundidade ideal:** o paper não prescreve número fixo, mas todos
exemplos industriais (smart grid, oil&gas, warehouse) usam **3
níveis no máximo**. Mais que isso vira "supervisor of supervisor of
supervisor" — overhead de coordenação supera ganho.

Anti-pattern documentado: hierarquia profunda em sistema onde
sub-tarefas têm interdependência forte → causa thrashing entre níveis.

### 1.4. Squad/Team pattern

Não existe nome formal único. Mais próximos:
- **Anthropic** chama de "subagent teams" no blog Research.
- **LangGraph** documenta como `hierarchical_teams`.
- **Microsoft Agent Framework** chama de "nested workflows" — você aninha
  um workflow inteiro como nó de outro workflow.
- **CrewAI** usa o termo "crew" pro time.

Convergência: a *idéia* (agrupar agentes por responsabilidade afim, expor
um único entry-point ao orquestrador acima) é praticamente universal,
mas a *terminologia* não cristalizou.

### 1.5. Swarm vs Hierarchy — guidance 2025-2026

Taxonomia comparativa ([MarkTechPost top 5 architectures 2025](https://www.marktechpost.com/2025/11/15/comparing-the-top-5-ai-agent-architectures-in-2025-hierarchical-swarm-meta-learning-modular-evolutionary/)):

| Critério | Hierárquico | Swarm |
|---|---|---|
| Controle | alto, centralizado | baixo, emergente |
| Escala | limitada pelo supervisor | massiva |
| Robustez a falha | SPOF no top | sem SPOF |
| Auditoria | excelente (trace claro) | difícil |
| Adequado a... | tasks com etapas conhecidas | exploração espacial/paralela massiva |

**Veredito FLG:** swarm não se aplica. Debriefing tem etapas conhecidas,
template fixo, exige auditoria (cliente paga, founder revisa). Hierarchy
ganha por knockout. O paper arXiv reforça: hierarchical com 2-3 níveis
+ algum peer-to-peer interno num nível ("hybrid") é o sweet spot
industrial.

---

## Gap 2 — Conditional Routing entre agentes

Comparativo dos patterns:

| Pattern | Latência extra | Custo | Quando usar | Quando NÃO usar |
|---|---|---|---|---|
| **Hard-coded if/else** | 0 | 0 | Categorias fechadas, sinais claros (extensão, mime, regex) | Quando input é texto livre ambíguo |
| **Semantic Router** (embedding) | 50-200ms | $0.0001/req | 5-20 rotas estáveis, baixa latência | Quando rotas mudam toda semana ou exigem reasoning |
| **LLM Router** (small model) | 500-2000ms | $0.001-0.005 | Input ambíguo, precisa reasoning leve | Quando regra é trivial |
| **State Machine** (LangGraph cond. edges) | 0 (Python puro) | 0 | Quando você já tem state graph | Para classificação inicial pura |
| **Tool-as-router** (handoff) | 1 LLM call | full LLM cost | Quando o agente atual sabe pra quem mandar | Pra triagem inicial sem contexto |
| **Hybrid deterministic + LLM** | 0-500ms | 0-$0.001 | **Default recomendado em produção** | Quando volume é baixo (não compensa engenharia) |

### Routing patterns formalizados

- **LangChain RouterChain (deprecated)** → substituído por `RunnableBranch`
  ou `Command` em LangGraph. ([LangChain docs router](https://docs.langchain.com/oss/python/langchain/multi-agent/router))
- **Semantic Router** (aurelio-labs, MIT) → biblioteca dedicada, encoder
  Cohere/OpenAI, usa "utterances" (exemplos por rota) e classifica via
  nearest-neighbor em vector space. ([github](https://github.com/aurelio-labs/semantic-router))
- **vLLM Semantic Router** (Red Hat, set/2025, v0.1 Iris jan/2026) →
  usa ModernBERT como classifier embutido. Foco em selecionar **qual
  modelo** chamar (mixture-of-models), não necessariamente qual agente.
  ([vLLM blog](https://blog.vllm.ai/2025/09/11/semantic-router.html))
- **LangGraph conditional edges** → `add_conditional_edges(node, routing_fn)`
  onde `routing_fn(state) -> str` é **Python puro**, sem LLM call. Doc
  explícita: "keep control flow logic in Python rather than in LLMs".
- **OpenAI Agents SDK handoffs** → `handoff(target_agent)` retorna ferramenta
  cujo nome é `transfer_to_<agent_name>`. Padrão tool-as-router.
- **Adaptive Query Reasoning** (arXiv 2510.21727) → 3 componentes:
  Reasoner Router classifica, manda pra Dense Reasoner (barato) ou LLM
  Reasoner (caro). Hibridiza embedding + LLM por nível de complexidade.

### Resposta direta para classificar docs do Drive (transcrição vs relatório vs PE vs outro)

**Pattern ótimo: Hybrid deterministic + LLM fallback**, em 3 camadas:

1. **Camada 1 — Regex/heuristic** (custo zero, instantâneo).
   Filename matching: `transcricao*`, `*PE*`, `relatorio*`. Mime-type
   (`gdoc` vs `pdf`). Resolve ~70% dos casos.

2. **Camada 2 — Embedding semântico** (50ms, ~$0). Pega o título +
   primeiros 500 chars, classifica via similarity contra 4 utterances
   âncora ("transcrição de reunião", "relatório mensal de entrega",
   "planejamento estratégico", "outros documentos"). Resolve mais ~25%.

3. **Camada 3 — LLM classifier** (Haiku, ~$0.001). Só pros 5% ambíguos.
   Retorna `{categoria, confiança, motivo}`.

Por que essa stack:
- Volume é baixo (dezenas de docs por debriefing) → tem orçamento pra
  LLM, mas é desperdício na maioria.
- Cliente FLG controla os nomes via convenção → regex resolve muito.
- Erro tem custo alto (categoria errada polui síntese) → fallback LLM
  pros ambíguos vale o gasto.

**Implementação:** função Python (`route_drive_doc(file) -> Literal[...]`)
chamada antes dos subagentes, retorna a categoria, popula o estado.
Subagente "Source Team" lê o estado e despacha em paralelo.

---

## Gap 3 — Documentação e specs de agentes em produção

### 3.1. Padrões emergentes

**Anthropic Claude Code subagents** (`.claude/agents/*.md`) — markdown com
YAML frontmatter. Os campos: `name`, `description` (obrigatórios), e
opcionais `tools`, `model`, `permissionMode`, `maxTurns`, `skills`,
`isolation`, `memory`, `hooks`, `background`. Body = system prompt
verbatim. Repos como `VoltAgent/awesome-claude-code-subagents` (154+
agents em 10 categorias) e `wshobson/agents` são referências. ([Claude
Code docs](https://code.claude.com/docs/en/sub-agents))

Exemplo do VoltAgent:

```yaml
---
name: backend-developer
description: Server-side expert for scalable APIs
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

[role + protocolos + workflow]
```

**Pydantic AI Agent Specs** — YAML/JSON declarativo. Schema oficial:
`model`, `instructions`, `deps_schema` (JSON Schema dos inputs),
`output_schema` (JSON Schema dos outputs), `capabilities`. Carrega com
`Agent.from_file('agent.yaml')`. Validação no construct-time:
template vars como `{{ user_name }}` são checadas contra deps_schema.
([Pydantic AI](https://ai.pydantic.dev/agent/))

**CrewAI** — split em 2 YAMLs: `agents.yaml` (role/goal/backstory) e
`tasks.yaml` (description/expected_output/agent). Convenção fixa
`src/<projeto>/config/`.

**OpenAI Agents SDK** — Python class (não YAML). `Agent(name=,
instructions=, model=, tools=, handoffs=)`. Spec é o código.

**Microsoft Agent Framework v1.0** (abr/2026) — Python/.NET. Spec via
classes + decorators, com middleware e telemetry built-in.

### 3.2. Campos canônicos pra uma "agent spec"

Síntese do estado da arte (Pydantic + Anthropic + Microsoft):

- **Identity:** `name`, `version`, `description`, `owner`
- **Activation:** `when_to_invoke` (descrição pra outros agentes lerem),
  `triggers` (regex/intent/tool name)
- **Model config:** `model`, `temperature`, `max_tokens`, `thinking_budget`
- **Schemas:** `input_schema` (Pydantic ou JSON Schema), `output_schema`
- **Tools/Capabilities:** lista nominal, com escopos
- **System prompt:** body Markdown OU referência a arquivo separado
- **Error handling:** `on_failure` (retry / escalate / return-stub /
  abort), `max_retries`, `timeout_seconds`
- **Cost budget:** `max_input_tokens`, `max_output_tokens`,
  `max_total_cost_usd` (cap por invocação)
- **Observability:** `trace_tags`, `metrics_to_emit`, `log_level`
- **Versioning hook:** `prompt_version_id` (link a sistema externo tipo
  Langfuse/Maxim/Braintrust)

### 3.3. Prompt versioning em 2026

Survey Maxim AI 2025: prompt engineering = 30-40% do tempo de dev de AI.
"Versionar prompt em git puro funciona até ~10 prompts; depois quebra."
([Maxim AI](https://www.getmaxim.ai/articles/version-control-for-prompts-the-foundation-of-reliable-ai-workflows/))

Pra FLG com 4-8 agentes, **git puro ainda basta**, desde que:
- Cada prompt seja arquivo separado (`prompts/<agent>/v1.md`).
- Build embuta o hash do prompt no trace/log de cada execução.
- README do agent linka pro arquivo de prompt.

Migrar pra ferramenta dedicada (Langfuse/Maxim/Braintrust) só quando
non-engineers precisarem editar ou A/B test entrar em loop.

---

## Gap 4 — Comunicação entre agentes (Protocolos)

### 4.1. Estado da corrida em mai/2026

| Protocolo | Origem | Foco | Status 2026 |
|---|---|---|---|
| **MCP** | Anthropic (nov/2024), doado à Linux Foundation dez/2025 | Agente ↔ Tools/Data | **Padrão de fato.** 97M downloads SDK/mês. Adotado por Anthropic, OpenAI, Google, Microsoft, Amazon. |
| **A2A** | Google (abr/2025), doado à Linux Foundation jun/2025 | Agente ↔ Agente (cross-framework) | **Padrão emergente.** Agent Cards em `/.well-known/agent-card.json`. Bom pra interop entre empresas. |
| **ACP (IBM/BeeAI)** | IBM Research, Linux Foundation | Agente ↔ Agente, HTTP-native | **Mergeado com A2A.** Time descontinuando, contribuindo expertise. |
| **AGNTCY/AGP** | Cisco, Linux Foundation jul/2025 | "Internet of Agents", stack completa | Tração modesta. |
| **OpenAI Responses API handoffs** | OpenAI | Agente ↔ Agente intra-SDK | Proprietary, não-portável. |

Fontes: [Intuz MCP vs A2A](https://www.intuz.com/blog/mcp-vs-a2a), [4sysops AI protocols comparison](https://4sysops.com/archives/comparing-ai-protocols-mcp-a2a-agp-agntcy-ibm-acp-zed-acp/), [A2A spec](https://a2a-protocol.org/latest/specification/).

### 4.2. Síntese do consenso

**MCP e A2A não competem.** MCP é "como agentes falam com ferramentas".
A2A é "como agentes falam com outros agentes". Em produção, usa-se
ambos: cada agente expõe tools via MCP e capabilities via A2A.

### 4.3. Decisão para FLG

Caso FLG: **1 backend, sem agentes externos, sem cross-framework**.

- **MCP:** Já faz sentido se houver integração com Drive/ClickUp via
  servidor MCP (vs SDK direto). Mas o código atual usa SDK direto e
  funciona — não há ganho imediato. **Deferir.**
- **A2A:** Overkill agora. A2A brilha quando 2 sistemas DIFERENTES
  precisam falar (FLG ↔ vendor externo). Internamente, agentes do mesmo
  backend Python chamando uns aos outros via JSON dict é mais simples,
  mais rápido, mais debugável.
- **Roll-our-own JSON simples:** vence. Estado compartilhado via Pydantic
  models, agentes recebem `AgentInput`, retornam `AgentOutput`.

**Recomendação:** estado interno como Pydantic + JSON (zero protocolo).
Reservar arquitetura pra permitir extração futura pra A2A se um dia FLG
expor capabilities a parceiros externos. Concretamente: cada agente
deve ter `input_schema`/`output_schema` documentados — esse é o passo 1
pra futura migração A2A sem refactor traumático.

---

## Gap 5 — Folder structure pra agent system em produção

### 5.1. Convenções observadas

**Claude Code (`.claude/agents/`):** flat, 1 arquivo `.md` por agente.
Frontmatter YAML + body Markdown. Simples, descoberta automática.

**CrewAI (`src/<proj>/config/`):**
```
src/projeto/
├── config/
│   ├── agents.yaml     # todos os agents num arquivo
│   └── tasks.yaml      # todas as tasks num arquivo
├── tools/custom_tool.py
├── crew.py             # constrói a crew
└── main.py
```
Crítica: monolítico, conflito de merge quando 2 devs adicionam agents
ao mesmo tempo.

**LangGraph (canônica):**
```
projeto/
├── agent.py            # constrói o StateGraph
├── nodes.py            # funções dos nodes
├── tools.py            # tools
├── state.py            # TypedDict do State
├── utils/
└── langgraph.json
```
Crítica: mistura agent code com infra; quando squad cresce, vira sopa.

**Microsoft Agent Framework:** workflow Python + arquivos de spec
opcionais. Pouco prescritivo.

### 5.2. Recomendação pra FLG (squad-oriented)

Dado que existem 2 universos a documentar (1) **spec/contrato do agente**
(humanos leem) e (2) **implementação Python** (sistema executa), separar
claramente:

```
docs/agents/debriefings/                  # CONTRATOS, lidos por humanos
├── README.md                             # organograma visual + índice
├── squads/
│   ├── source-squad/
│   │   ├── README.md                    # papel do squad
│   │   ├── drive-fetcher.agent.md       # spec individual
│   │   ├── clickup-fetcher.agent.md
│   │   └── classifier.agent.md
│   ├── synthesis-squad/
│   │   ├── README.md
│   │   ├── orchestrator.agent.md
│   │   ├── compositor.agent.md
│   │   └── sectionizer.agent.md
│   └── quality-squad/
│       ├── README.md
│       ├── citation-verifier.agent.md
│       └── style-reviewer.agent.md
├── protocols/                            # contratos entre agentes
│   ├── source-output.schema.md           # o que Source Squad entrega
│   ├── synthesis-output.schema.md
│   └── routing-rules.md
├── prompts/                              # prompts versionados em git
│   ├── orchestrator/v1.md
│   ├── compositor/v1.md
│   └── ...
└── runbooks/
    ├── debugging-failed-run.md
    └── adding-new-agent.md
```

E em paralelo:

```
backend/agents/debriefings/               # IMPLEMENTAÇÃO Python
├── __init__.py
├── orchestrator.py                       # entry-point, monta pipeline
├── state.py                              # Pydantic model do State compartilhado
├── routing.py                             # função Python pura (hybrid router)
├── squads/
│   ├── __init__.py
│   ├── source/
│   │   ├── __init__.py
│   │   ├── drive_fetcher.py
│   │   ├── clickup_fetcher.py
│   │   └── classifier.py
│   ├── synthesis/
│   │   ├── __init__.py
│   │   ├── compositor.py
│   │   └── sectionizer.py
│   └── quality/
│       ├── __init__.py
│       ├── citation_verifier.py
│       └── style_reviewer.py
├── schemas/                              # Pydantic — espelham protocols/*.schema.md
│   ├── source_output.py
│   ├── synthesis_output.py
│   └── final_doc.py
└── tools/                                # tools compartilhadas (Drive, ClickUp, Claude)
    ├── drive_client.py
    └── clickup_client.py
```

Princípio: cada `*.agent.md` em `docs/` tem **espelho exato** num arquivo
Python em `backend/agents/debriefings/squads/`. Convenção:

- `docs/agents/debriefings/squads/synthesis-squad/compositor.agent.md`
  ↔ `backend/agents/debriefings/squads/synthesis/compositor.py`

A doc tem o **contrato** (campos, prompt, error policy). O Python tem
a **implementação**. CI valida que pra cada `.agent.md` existe o
módulo Python correspondente exportando `Agent` (e vice-versa).

---

## RECOMENDAÇÃO CONCRETA PRA FLG

### 1. Squad structure (3 squads, 7 agentes)

```
┌─────────────────────────────────────────────────────┐
│ ORCHESTRATOR (Sonnet 4.6)                           │
│ — entry-point único                                 │
│ — decompõe job, monta plan, dispatch squads         │
│ — consolida output final, devolve PDF               │
└────────────┬───────────┬───────────┬───────────────┘
             │           │           │
   ┌─────────▼────┐ ┌────▼──────┐ ┌─▼──────────────┐
   │ SOURCE SQUAD │ │ SYNTHESIS │ │ QUALITY SQUAD  │
   │              │ │   SQUAD   │ │                │
   │ drive-fetch  │ │           │ │ citation-      │
   │ clickup-fetch│ │ compositor│ │   verifier     │
   │ classifier   │ │ sectionizer│ │ style-reviewer│
   │ (3 agentes)  │ │ (2 agentes)│ │ (2 agentes)   │
   │              │ │           │ │                │
   │ Modelo: Haiku│ │ Modelo:   │ │ Modelo: Sonnet │
   │ (cheap I/O)  │ │ Sonnet 4.6│ │ (audita)       │
   └──────────────┘ └───────────┘ └────────────────┘
```

- **Source Squad** roda **em paralelo** (3 fetchers concorrentes + 1
  classifier deterministic Python). Output: bundle estruturado de fontes
  classificadas.
- **Synthesis Squad** roda **sequencial**: sectionizer cria outline,
  compositor preenche cada seção (com possível fan-out por seção em V2).
- **Quality Squad** roda **paralelo**: citation-verifier e
  style-reviewer auditam o draft. Orchestrator decide se aceita ou
  loopa pro compositor.

Depth = 2 níveis (orchestrator → squad → agent). Não vá pra 3.

### 2. Routing strategy

- **Orchestrator → Squad:** sequência fixa hardcoded (Source → Synthesis
  → Quality). Sem LLM router aqui — é overhead inútil pra fluxo conhecido.
- **Source Squad → Fetchers:** dispatch paralelo determinístico (sempre
  os 3 fetchers rodam).
- **Classifier (dentro do Source):** **hybrid 3-camadas** — regex →
  embedding (Cohere/OpenAI small) → Haiku fallback. Doc 5.x descreve.
- **Quality decision loop:** Python avalia `verdict ∈ {accept, retry,
  abort}` baseado em scores do verifier. Máximo 1 retry.

### 3. Comm protocol

- **Interno:** Pydantic models + JSON dict no state compartilhado.
  **Zero protocolo.** State é um dict tipado, agentes recebem fatia
  relevante, retornam fatia atualizada.
- **Tools externas (Drive, ClickUp, Claude):** SDK direto por enquanto.
  Considerar wrap em MCP quando: (a) houver 2º cliente além do backend
  Python (e.g. CLI dev) OU (b) quiser permitir devs internos rodarem
  agentes localmente sem ENV completo.
- **A2A:** deferir até existir parceiro externo. Mas **já garantir** que
  cada agente tem `input_schema` + `output_schema` Pydantic — assim a
  migração futura é só wrapping.

### 4. Folder structure (com nome dos arquivos)

```
docs/agents/debriefings/
├── README.md
├── squads/
│   ├── source-squad/
│   │   ├── README.md
│   │   ├── drive-fetcher.agent.md
│   │   ├── clickup-fetcher.agent.md
│   │   └── classifier.agent.md
│   ├── synthesis-squad/
│   │   ├── README.md
│   │   ├── sectionizer.agent.md
│   │   └── compositor.agent.md
│   ├── quality-squad/
│   │   ├── README.md
│   │   ├── citation-verifier.agent.md
│   │   └── style-reviewer.agent.md
│   └── orchestrator.agent.md
├── protocols/
│   ├── state.schema.md
│   ├── source-output.schema.md
│   ├── synthesis-output.schema.md
│   └── routing-rules.md
├── prompts/
│   ├── orchestrator/v1.md
│   ├── compositor/v1.md
│   ├── sectionizer/v1.md
│   ├── citation-verifier/v1.md
│   ├── style-reviewer/v1.md
│   └── classifier/v1.md
└── runbooks/
    ├── debugging-failed-run.md
    ├── adding-new-agent.md
    └── cost-budget-tuning.md

backend/agents/debriefings/
├── __init__.py
├── orchestrator.py
├── state.py
├── routing.py
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
├── schemas/
│   ├── state.py
│   ├── source_output.py
│   ├── synthesis_output.py
│   └── final_doc.py
└── tools/
    ├── drive_client.py
    ├── clickup_client.py
    └── claude_client.py
```

### 5. Template de Agent Spec

Salvar como `docs/agents/debriefings/squads/<squad>/<agent>.agent.md`:

```markdown
---
name: compositor
version: 1
squad: synthesis
description: |
  Preenche cada seção do debriefing com prosa estratégica baseada nas
  fontes classificadas, seguindo template FLG fixo de 20 páginas.
when_to_invoke: |
  Após sectionizer ter produzido o outline e source-squad ter entregue
  o bundle de fontes. Orquestrador chama compositor.run(state).
owner: pedroaranda@grupoguglielmi.com
model: claude-sonnet-4-6
temperature: 0.4
max_input_tokens: 150000
max_output_tokens: 8000
thinking_budget: 4000
input_schema: schemas/synthesis_output.py:CompositorInput
output_schema: schemas/synthesis_output.py:CompositorOutput
tools:
  - read_source_bundle
  - draft_section
prompt_file: prompts/compositor/v1.md
on_failure: retry_once_then_abort
max_retries: 1
timeout_seconds: 180
max_cost_usd: 4.00
trace_tags: [debriefing, synthesis, compositor]
metrics:
  - tokens_input
  - tokens_output
  - cost_usd
  - sections_produced
  - retries
---

## Papel

Compositor traduz o outline + fontes em prosa do debriefing seguindo o
estilo FLG. Não inventa fatos — só usa o bundle entregue pelo Source Squad.

## Contrato com Source Squad

Recebe `CompositorInput` (ver schema). Garante que cada seção produzida
referencia ao menos 1 fonte do bundle via `source_id`.

## Erros conhecidos

- Alucinação de números → mitigação: citation-verifier audita depois.
- Excesso de jargão → mitigação: style-reviewer normaliza.

## Histórico de versões

- v1 (2026-05-26): inicial, baseado em prompt monolítico atual de
  `backend/prompts/debriefing_prompt.py`.
```

Esse template combina o que há de mais maduro: frontmatter YAML estilo
Anthropic + campos de schema estilo Pydantic AI + budget/observability
estilo Microsoft Agent Framework + versionamento via git nativo.

---

## Sources

- [Anthropic — How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [LangGraph supervisor vs swarm tradeoffs (Focused)](https://focused.io/lab/multi-agent-orchestration-in-langgraph-supervisor-vs-swarm-tradeoffs-and-architecture)
- [LangGraph Multi-Agent Supervisor reference](https://reference.langchain.com/python/langgraph-supervisor)
- [LangChain — Multi-agent Router docs](https://docs.langchain.com/oss/python/langchain/multi-agent/router)
- [CrewAI — Hierarchical Process docs](https://docs.crewai.com/en/learn/hierarchical-process)
- [Why CrewAI's Manager-Worker fails (Towards Data Science)](https://towardsdatascience.com/why-crewais-manager-worker-architecture-fails-and-how-to-fix-it/)
- [CrewAI Process Types comparison (CallSphere)](https://callsphere.ai/blog/crewai-process-types-sequential-hierarchical-consensual-workflows)
- [arXiv 2508.12683 — Taxonomy of Hierarchical Multi-Agent Systems](https://arxiv.org/abs/2508.12683)
- [MarkTechPost — Top 5 AI Agent Architectures 2025](https://www.marktechpost.com/2025/11/15/comparing-the-top-5-ai-agent-architectures-in-2025-hierarchical-swarm-meta-learning-modular-evolutionary/)
- [Agent Orchestration Patterns: Swarm vs Mesh vs Hierarchical (Gurusup)](https://gurusup.com/blog/agent-orchestration-patterns)
- [Semantic Router (aurelio-labs github)](https://github.com/aurelio-labs/semantic-router)
- [vLLM Semantic Router blog](https://blog.vllm.ai/2025/09/11/semantic-router.html)
- [arXiv 2510.08731 — When to Reason: Semantic Router for vLLM](https://arxiv.org/pdf/2510.08731)
- [Claude Code — Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [VoltAgent — awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents)
- [Pydantic AI Agent Specs](https://pydantic.dev/docs/ai/core-concepts/agent-spec/)
- [Pydantic AI Agent docs](https://ai.pydantic.dev/agent/)
- [CrewAI Quickstart docs](https://docs.crewai.com/en/quickstart)
- [OpenAI Agents SDK — Handoffs](https://openai.github.io/openai-agents-python/handoffs/)
- [Microsoft Agent Framework v1.0 announcement](https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/)
- [MCP vs A2A protocol comparison (Intuz)](https://www.intuz.com/blog/mcp-vs-a2a)
- [4sysops — Comparing AI protocols MCP, A2A, AGP, AGNTCY, ACP](https://4sysops.com/archives/comparing-ai-protocols-mcp-a2a-agp-agntcy-ibm-acp-zed-acp/)
- [Agent2Agent (A2A) Protocol Specification](https://a2a-protocol.org/latest/specification/)
- [IBM — Agent Communication Protocol](https://research.ibm.com/projects/agent-communication-protocol)
- [Maxim AI — Version Control for Prompts](https://www.getmaxim.ai/articles/version-control-for-prompts-the-foundation-of-reliable-ai-workflows/)
- [LangGraph conditional edges guide (LangChain Tutorials)](https://langchain-tutorials.github.io/langgraph-conditional-edges-router-pattern-guide/)
- [LangGraph application structure docs](https://docs.langchain.com/langgraph-platform/application-structure)
- [Best Multi-Agent Frameworks 2026 (Gurusup)](https://gurusup.com/blog/best-multi-agent-frameworks-2026)
