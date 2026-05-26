# Architecture Decision Records — FLG Debriefings

> Cada decisão arquitetural com **fonte oficial**, **prova de uso em produção** e **alternativa avaliada e rejeitada**. Nada bleeding edge sem track record.

---

## ADR-001 — Padrão: Orchestrator-Worker + Generator-Verifier composto

**Decisão:** Compor 2 patterns oficiais Anthropic — **Orchestrator-Worker** pro fan-out de fontes/síntese + **Generator-Verifier** pro Quality Squad final auditando o output do Synthesis Squad.

**Source:**
- Anthropic Engineering Blog, "How we built our multi-agent research system" (Jun 2025): https://www.anthropic.com/engineering/multi-agent-research-system
- Anthropic Blog, "Multi-Agent Coordination Patterns": https://claude.com/blog/multi-agent-coordination-patterns

**Production use:**
- Claude Research feature (Anthropic) usa orchestrator-worker em produção desde Jun 2025
- Generator-Verifier é o "top fit pra document synthesis com critério explícito de qualidade" — guidance oficial Anthropic

**Maturity:** ✅ Validated — em produção há 12+ meses na própria Anthropic, +90,2% performance vs single-agent no eval interno.

**Alternativa rejeitada — Manager-Worker (CrewAI Hierarchical):** anti-pattern documentado em [Towards Data Science](https://towardsdatascience.com/why-crewais-manager-worker-architecture-fails-and-how-to-fix-it/): manager auto-gerado executa todas as tasks sequencialmente mesmo quando irrelevantes. CrewAI custa +30-50% tokens vs Process.sequential. Solução requer `manager_agent` customizado — preferimos Python determinístico (ADR-002) que evita LLM overhead.

**Alternativa rejeitada — Swarm:** sem SPOF mas auditoria difícil. Debriefing exige rastreabilidade (cliente paga, founder revisa) → swarm desqualificado. ([MarkTechPost taxonomia 2025](https://www.marktechpost.com/2025/11/15/comparing-the-top-5-ai-agent-architectures-in-2025-hierarchical-swarm-meta-learning-modular-evolutionary/))

**Alternativa rejeitada — Hierarchical 3+ níveis:** todos exemplos industriais (smart grid, oil&gas, warehouse) usam 2-3 níveis máximo. Mais que isso vira thrashing. ([arXiv 2508.12683](https://arxiv.org/html/2508.12683))

---

## ADR-002 — Orchestrator é Python determinístico, não LLM

**Decisão:** O Orchestrator (entry-point) é **código Python puro** — não um agente LLM. Sequência fixa hardcoded: Source → Synthesis → Quality. Sem decisão dinâmica de roteamento.

**Source:**
- Anthropic Cookbook, "orchestrator-workers.ipynb": orchestrator pode ser código puro em casos simples
- Glean Waldo pattern (2025): separar "search planning" (Python/small model) de "synthesis" (frontier LLM)

**Production use:**
- Glean Waldo (2025): cortou 50% latência e 25% tokens vs orchestrator LLM
- Padrão usado pela própria Anthropic em pipelines internos

**Maturity:** ✅ Battle-tested — `asyncio` é Python standard desde 3.4 (2014).

**Por que neste caso específico:** o input do POST `/debriefings` já determina cliente_id + período + opcionalmente list_id/folder_id. Não há ambiguidade que justifique LLM router. Adicionar LLM aqui custaria +3-5x sem ganho.

**Alternativa rejeitada — LangGraph Supervisor:** excelente padrão (94% routing accuracy em prod) mas adiciona complexidade de state machine pra fluxo linear. Mantemos o `debriefing_generator.py` já existente como base do orchestrator, evoluído pra coordenar squads via `asyncio.gather()`.

**Alternativa rejeitada — Sonnet 4.6 como Orchestrator LLM (sugerido em research2):** apesar de research dedicado mencionar essa opção, ela contradiz Anthropic guidance pra casos com sequência conhecida. Mantemos Python.

---

## ADR-003 — Framework: Claude Agent SDK (oficial Anthropic)

**Decisão:** Usar **Claude Agent SDK Python** (oficial Anthropic) pra definir e executar os 7 agentes LLM. Roda direto dentro do FastAPI existente.

**Source:** Claude Agent SDK overview: https://code.claude.com/docs/en/agent-sdk/overview

**Production use:**
- Claude Code (Anthropic) usa o mesmo loop em produção desde 2024
- API oficial Anthropic, mantida pela própria empresa

**Maturity:** ✅ Validated — SDK oficial, acompanha o modelo principal.

**Alternativa rejeitada — LangGraph:** v1.0 GA Out 2025 (~7 meses). Excelente pra workflows duráveis com checkpointing complexo, mas pra job de 60-90s sem persistência cross-restart é overhead. Aprendizado de StateGraph + edges + Send/Command pra time pequeno não compensa.

**Alternativa rejeitada — CrewAI:** sem checkpointing nativo. Abstração role-based rígida. Times grandes migram pra LangGraph quando escala.

**Alternativa rejeitada — AutoGen:** Maintenance mode desde início 2026. README oficial aponta pra "Microsoft Agent Framework" — projeto novo, sem track record consolidado.

**Alternativa rejeitada — OpenAI Swarm:** Arquivado Mar 2025. Substituto (Agents SDK) amarra a stack OpenAI, incompatível com nossa stack Claude.

---

## ADR-004 — Decomposição em 7 agentes (3+2+2) + 1 Orchestrator

**Decisão:** Decompor em **3 squads** com **7 agentes** + 1 Orchestrator Python:

- **Source Squad (3):** drive-fetcher, clickup-fetcher, classifier
- **Synthesis Squad (2):** sectionizer, compositor
- **Quality Squad (2):** citation-verifier, style-reviewer

**Source:** [research-debriefing-squad-architecture.md](../../superpowers/research-debriefing-squad-architecture.md) seção "Recomendação Concreta". Cross-validado com [research-debriefing-multi-agent.md](../../superpowers/research-debriefing-multi-agent.md).

**Production use:** alinhado com guidance Anthropic + benchmarks LangGraph supervisor patterns.

**Maturity:** ✅ Validated — pattern documentado em produção (Glean Waldo, Anthropic Research).

**Por que essa granularidade (e não menos, e não mais):**

| Agente | Por que existir separado |
|---|---|
| `drive-fetcher` | Acessa Google Drive API. Isolado pra falhar graciosamente sem derrubar ClickUp. |
| `clickup-fetcher` | Acessa ClickUp API. Isolado pelo mesmo motivo. |
| `classifier` | Categoriza docs do Drive em transcrição/relatório/PE/outro. Hybrid 3-layer (regex → embedding → Haiku) — separado pra que regra de classificação evolua sem mexer no fetcher. |
| `sectionizer` | Cria outline com 11 seções do template FLG. Decisão estratégica de quais bullets vão em quais seções. Output: outline estruturado. |
| `compositor` | Preenche prosa em cada seção a partir do outline + findings. Output: Markdown final. Separado de sectionizer pra que sectionizer possa ser caro e cuidadoso (decide estrutura) e compositor possa ser caro e cuidadoso (escreve bem). |
| `citation-verifier` | Valida que cada claim factual no Markdown está respaldada por findings. Anti-hallucination. |
| `style-reviewer` | Valida tom corporativo FLG (sem "como AI eu...", sem gírias, primeira pessoa do plural). |

**Anti-pattern evitado:** ter 1 só "synthesizer" fazendo tudo (sectionizing + composing + reviewing) sobrecarrega context window, mistura responsabilidades, e dificulta debug quando algo sai errado.

**Anti-pattern evitado:** ter 1 agente "Drive Extractor" sozinho fazendo fetching + classificação + extração por tipo. Mistura I/O com decisão lógica. Separar permite usar Python determinístico no classificador (90% mais barato).

---

## ADR-005 — Modelo mixto: Haiku no I/O, Sonnet na síntese

**Decisão:**

| Agente | Modelo | Justificativa |
|---|---|---|
| `drive-fetcher` | Haiku 4.5 | High-volume I/O, low-stakes extração |
| `clickup-fetcher` | Haiku 4.5 | Idem |
| `classifier` | Python regex + embedding (95%) → Haiku 4.5 fallback (5%) | Maioria dos casos é determinístico |
| `sectionizer` | Sonnet 4.6 | Low-volume, high-stakes — define estrutura do output final |
| `compositor` | Sonnet 4.6 | Low-volume, high-stakes — qualidade da redação importa |
| `citation-verifier` | Haiku 4.5 | High-volume verification, low-stakes (regra binária) |
| `style-reviewer` | Haiku 4.5 | Idem |

**Source:** Anthropic Building Effective AI Agents — princípio "right model for the task". Glean Waldo pattern: small model na decisão de planning, frontier model na resposta.

**Production use:** padrão de mercado consolidado (Anthropic recomendation 2024+).

**Opt-in escalation:** flag `USE_OPUS=true` promove `sectionizer` e `compositor` pra Opus 4.7 pra clientes high-touch. Custo sobe ~3x mas qualidade da síntese estratégica também.

**Maturity:** ✅ Validated — Haiku/Sonnet/Opus disponíveis em produção, recomendações Anthropic documentadas.

**Custo projetado por componente** (com prompt caching cross-agent TTL 1h):

| Componente | Custo USD |
|---|---|
| drive-fetcher | $0,045 |
| clickup-fetcher | $0,027 |
| classifier | $0,005 (90% Python, 10% Haiku fallback) |
| sectionizer | $0,08 |
| compositor | $0,28 |
| citation-verifier | $0,025 |
| style-reviewer | $0,015 |
| **Total** | **~$0,49 ≈ R$2,70** |

Cap por debriefing: $5 (~R$28). Guarded pelo Orchestrator.

---

## ADR-006 — Comunicação inter-agente: Pydantic + JSON dict (zero protocolo)

**Decisão:** Hand-offs entre agentes via **state compartilhado Pydantic** passado pelo Orchestrator. **NÃO** adotar MCP/A2A/ACP/AGNTCY agora.

**Source:**
- [Intuz MCP vs A2A](https://www.intuz.com/blog/mcp-vs-a2a)
- [4sysops AI protocols comparison](https://4sysops.com/archives/comparing-ai-protocols-mcp-a2a-agp-agntcy-ibm-acp-zed-acp/)

**Production use:**
- Anthropic Multi-Agent Research System usa shared memory store (filesystem JSON), não protocolo
- CrewAI usa Python dicts pra comunicação entre agentes — sem protocolo formal
- LangGraph usa TypedDict como State

**Maturity:**
- ✅ Pydantic + JSON dict: battle-tested há décadas
- ✅ MCP (Anthropic Nov 2024, doado à Linux Foundation Dez 2025): padrão de fato pra agent↔tools, 97M downloads/mês
- ⚠️ A2A (Google Abr 2025): emergente pra agent↔agent cross-framework
- ⚠️ ACP/AGNTCY: muito novos

**Por que zero protocolo agora:** 1 backend, sem agentes externos, sem cross-framework. A2A overkill. MCP útil pra futuro se houver 2º cliente além do backend Python (ex: CLI dev) ou agentes externos.

**Future-proofing:** garantir que cada agente já tenha `input_schema`/`output_schema` Pydantic documentados. Migração futura pra A2A vira só wrapping (sem refactor traumático).

**Schema padrão** — todos hand-offs seguem o envelope universal definido em [`protocols/state.schema.md`](protocols/state.schema.md):

```python
class DebriefingState(BaseModel):
    """State compartilhado entre todos os agentes do pipeline."""
    debriefing_id: str
    cliente_id: str
    request: DebriefingRequest
    source_findings: Optional[SourceFindings] = None
    synthesis_output: Optional[SynthesisOutput] = None
    quality_verdict: Optional[QualityVerdict] = None
    retry_count: int = 0
    accumulated_cost_usd: float = 0.0
    accumulated_tokens: TokenCounters = ...
    issues: list[Issue] = []
```

---

## ADR-007 — Prompt caching cross-agent obrigatório

**Decisão:** Ativar **prompt caching TTL 1h** ($10/M write, $0,50/M read = 95% off) compartilhando system prompt FLG + metodologia + template do output entre os 7 workers.

**Source:** Anthropic Prompt Caching docs: https://platform.claude.com/docs/en/build-with-claude/prompt-caching

**Production use:**
- Em todos os sistemas multi-agent Anthropic em produção
- Mesma técnica já usada no FLG (`claude_html_generator.py`, `claude_chat_pratica.py`)

**Maturity:** ✅ Battle-tested.

**Impacto financeiro:**
- Sem caching: ~$1,80 por debriefing (token cost explode com 7 agentes lendo contexto repetido)
- Com caching: ~$0,49 por debriefing (95% off nos blocos compartilhados)
- **Diferença ~3,7x.** Não-negociável.

---

## ADR-008 — Retry condicional: max 1, controlado pelo Orchestrator

**Decisão:** Se Quality Squad reportar `verdict.pass = false`, Orchestrator devolve issues pro `compositor` pra correção. **No máximo 1 retry.** Após isso, persiste com `status='falhou'` + razão.

**Source:**
- Anthropic Building Effective AI Agents: "limit retries — loops são causa #1 de cost spikes"
- LangChain blog "Agents in Production"

**Production use:** padrão amplamente adotado.

**Por que não retry ilimitado:** loops infinitos em agentes são causa #1 de incidentes de custo.

**Por que não 0 retry:** Reviewer pegar inconsistência genuína (ex: "seção 7.3 vazia") merece 1 chance pro compositor corrigir antes de descartar.

**Por que devolver pro compositor (não sectionizer):** o outline (de sectionizer) é estável; só a redação (do compositor) precisa correção. Retry mais barato.

**Implementação:** controlada no Orchestrator (Python), não delegada. Mais previsível.

---

## ADR-009 — Checkpointing barato no Supabase

**Decisão:** Após Source Squad terminar (barreira), persistir `source_findings` em `debriefings.findings_jsonb` (nova coluna em migration 008). Após Synthesis terminar, persistir `synthesis_output.markdown` em `markdown_content`. Se Quality falhar e retry esgotar, dados parciais ficam disponíveis pra debug.

**Source:** Pattern padrão de workflows duráveis (Temporal, Airflow, Step Functions).

**Production use:** ubíquo em pipelines de dados sérios.

**Maturity:** ✅ Battle-tested.

**Replay offline:** se quiser re-rodar só Quality Squad com findings já capturados (debug/iteração), basta ler `findings_jsonb` + `markdown_content` direto do DB. Permite testar prompt do citation-verifier sem refazer fetching.

---

## ADR-010 — Espelhamento docs ↔ Python validado por CI

**Decisão:** Pra cada `*.agent.md` em `docs/agents/debriefings/squads/<squad>/`, existe módulo Python correspondente em `backend/agents/debriefings/squads/<squad>/<nome>.py` exportando classe `Agent` ou função `run()`. CI valida correspondência 1:1.

**Source:** padrão usado pelo Claude Code (`.claude/agents/*.md` ↔ código), Cursor Rules, Replit Agents.

**Production use:** padrão de fato no ecossistema de agent platforms 2024+.

**Maturity:** ✅ Validated.

**Por que:** doc tem o **contrato** (campos, schema, prompt, budget), código tem a **implementação**. Desincronia = bug latente. CI bloqueia merge.

**Script de validação** (a criar em `scripts/validate_agent_specs.py`):
```python
# Pseudo-código:
for md_file in glob("docs/agents/debriefings/squads/*/*.agent.md"):
    name = parse_frontmatter(md_file)["name"]
    squad = parse_frontmatter(md_file)["squad"]
    py_file = f"backend/agents/debriefings/squads/{squad}/{name}.py"
    assert exists(py_file), f"Missing Python impl for {md_file}"
    # Valida que Pydantic schemas em py_file batem com frontmatter
    ...
```

---

## ADR-011 — Prompts versionados em arquivos separados + git

**Decisão:** Cada agente LLM tem seu system prompt em arquivo separado `docs/agents/debriefings/prompts/<agente>/v1.md`. Git puro versiona. Hash do prompt embutido no trace de cada execução.

**Source:** [Maxim AI prompt versioning survey 2025](https://www.getmaxim.ai/articles/version-control-for-prompts-the-foundation-of-reliable-ai-workflows/) — git puro funciona até ~10 prompts; depois ferramenta dedicada vale.

**Production use:** consenso da indústria pra equipes pequenas.

**Maturity:** ✅ Validated.

**Quando migrar pra Langfuse/Maxim/Braintrust:** quando non-engineers precisarem editar OU quando A/B test virar loop ativo. Hoje, com Pedro como único prompt-editor, git puro basta.

**Trace integration:** hash SHA-256 dos primeiros 1000 chars do prompt entra no metadata de cada chamada Claude. Permite reproduzir output em debug, sabendo exatamente qual versão do prompt rodou.

---

## ADR-012 — Folder structure: docs/ separado de backend/, espelhamento 1:1

**Decisão:** 2 universos paralelos:
- `docs/agents/debriefings/` — contratos lidos por humanos
- `backend/agents/debriefings/` — implementação executada pelo sistema

Estrutura exata em [`README.md`](README.md). CI valida espelhamento.

**Source:** convenções observadas no Claude Code (`.claude/agents/`), CrewAI (`config/`), LangGraph, Pydantic AI, Microsoft Agent Framework — síntese das partes mais maduras de cada.

**Production use:** padrão emergente 2025+.

**Maturity:** ✅ Validated.

**Por que separar 2 universos:**
- Doc pode ser editado por non-engineers (estrategistas FLG ajustando prompt) sem mexer no Python
- Implementação Python pode ser refatorada (split em sub-módulos, etc.) sem afetar contrato visível
- Reviewer humano lê só docs/ pra entender o sistema; reviewer técnico abre backend/ pra ver o como
