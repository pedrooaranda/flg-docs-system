# Routing Rules — FLG Debriefings

> Regras formais de como o Orchestrator decide o quê em cada ponto de bifurcação. Implementadas em `backend/agents/debriefings/routing.py` como funções Python puras.

---

## R-1 — Sequência fixa de squads (não-LLM, hardcoded)

```python
def squad_sequence() -> list[SquadName]:
    """Sequência fixa. Não há decisão dinâmica de qual squad chamar."""
    return ["source", "synthesis", "quality"]
```

**Justificativa:** o input do POST `/debriefings` já determina o escopo. Não há ambiguidade que justifique LLM router. Adicionar dinâmica custaria +3-5x sem ganho (ADR-002).

---

## R-2 — Source Squad: degradação graceful

```python
def source_squad_outcome(drive_result, clickup_result) -> SourceSquadDecision:
    """
    Aplicada após gather(drive_task, clickup_task) no Orchestrator.
    """
    if drive_result.ok and clickup_result.ok:
        return SourceSquadDecision.PROCEED        # caso feliz

    if drive_result.failed and clickup_result.failed:
        return SourceSquadDecision.ABORT          # nenhuma fonte = sem material

    # Apenas 1 falhou
    if drive_result.failed:
        log_warning("Drive indisponível, prosseguindo só com ClickUp")
        return SourceSquadDecision.PROCEED_WITH_NOTE
    if clickup_result.failed:
        log_warning("ClickUp indisponível, prosseguindo só com Drive")
        return SourceSquadDecision.PROCEED_WITH_NOTE
```

**Threshold de "ok":**
- `ok` = items_count > 0 OU é genuinamente vazio (cliente sem atividade no período)
- `failed` = API totalmente indisponível, auth, timeout hard, ou raised exception

---

## R-3 — Classifier hybrid 3-layer (detalhado em [classifier.agent.md](../squads/source-squad/classifier.agent.md))

```python
def classify_doc(doc: DriveRawItem) -> DriveItemClassified:
    """
    Hybrid 3-layer routing dentro do Source Squad.
    Distribuição esperada: 70% regex, 25% embedding, 5% LLM.
    """
    # Layer 1: regex
    result = regex_classify(doc.name)
    if result:
        return ClassifierResult(type=result.type, confidence="high", layer="regex")

    # Layer 2: embedding
    try:
        result = embedding_classify(doc.name, doc.content_preview[:500])
        if result and result.similarity >= 0.75:
            return ClassifierResult(type=result.type, confidence="medium", layer="embedding")
    except EmbeddingAPIError:
        pass  # cai pra layer 3

    # Layer 3: LLM Haiku fallback
    try:
        result = llm_classify(doc.name, doc.content_preview[:500])
        return ClassifierResult(type=result.type, confidence="low", layer="llm")
    except Exception:
        return ClassifierResult(type="desconhecido", confidence="low", layer="none")
```

---

## R-4 — Synthesis Squad: sequencial obrigatório

```python
async def dispatch_synthesis_squad(state) -> SynthesisOutput:
    """Sectionizer ANTES de compositor — compositor precisa do outline."""
    outline = await sectionizer.run(SectionizerInput(
        findings=state.source_findings,
        cliente_context=state.cliente_context,
        # ...
    ))
    state.synthesis_output = SynthesisOutput(outline=outline.outline, markdown="")
    state.accumulated_cost_usd += outline.metadata.cost_usd

    # Cost gate
    if state.accumulated_cost_usd > 5.0:
        raise CostCapExceeded("at synthesis after sectionizer")

    markdown_out = await compositor.run(CompositorInput(
        outline=outline.outline,
        findings=state.source_findings,
        cliente_context=state.cliente_context,
    ))
    state.synthesis_output.markdown = markdown_out.markdown
    state.accumulated_cost_usd += markdown_out.metadata.cost_usd

    return state.synthesis_output
```

---

## R-5 — Quality decision + retry policy (max 1 retry)

```python
async def quality_loop(state) -> QualityVerdict:
    """
    Loop com max 1 retry do compositor se Quality reportar fail.
    """
    for attempt in range(2):                          # 0 e 1
        # Quality squad em paralelo
        citation_result, style_result = await asyncio.gather(
            citation_verifier.run(...),
            style_reviewer.run(...),
        )

        verdict = QualityVerdict(
            pass_=(
                citation_result.pass_ and
                style_result.pass_ and
                citation_result.score >= 80 and
                style_result.score >= 70
            ),
            score_overall=int((citation_result.score + style_result.score) / 2),
            citation_verdict=citation_result,
            style_verdict=style_result,
            issues=citation_result.issues + style_result.issues,
        )

        if verdict.pass_:
            return verdict          # OK, sai do loop

        if attempt == 0:
            # Retry: devolve issues pro compositor
            state.retry_count = 1
            emit_sse_event("retry", {"retry_count": 1, "issues": verdict.issues})

            # Filtra apenas issues acionáveis pelo compositor (fatal + high)
            actionable_issues = [i for i in verdict.issues if i.severity in ("fatal", "high")]

            compositor_retry = await compositor.run(CompositorInput(
                outline=state.synthesis_output.outline,
                findings=state.source_findings,
                cliente_context=state.cliente_context,
                previous_markdown=state.synthesis_output.markdown,
                quality_issues=actionable_issues,
            ))
            state.synthesis_output.markdown = compositor_retry.markdown
            state.accumulated_cost_usd += compositor_retry.metadata.cost_usd

            if state.accumulated_cost_usd > 5.0:
                raise CostCapExceeded("at synthesis retry")

        # Se attempt == 1 e ainda falha, sai do loop com verdict.pass_=False
        # Orchestrator decide abort baseado nisso

    return verdict
```

**Por que max 1 retry:**
- Anthropic Building Effective AI Agents: "loops são causa #1 de cost spikes"
- 2+ retries em geral não convergem (se compositor não fix em 1, dificilmente fix em 2)
- Decisão deterministic — 1 ou 0, sem ambiguidade

**Por que devolver pro compositor (não sectionizer):**
- Outline (de sectionizer) é estável; só prosa precisa correção
- Retry mais barato e mais provável de convergir

---

## R-6 — Cost cap atravessa todas as fases

```python
COST_CAP_USD = 5.0     # ~R$28

def check_cost_cap(state) -> None:
    """Chamado após cada agente terminar."""
    if state.accumulated_cost_usd > COST_CAP_USD:
        raise CostCapExceeded(
            f"accumulated=${state.accumulated_cost_usd:.2f} > cap=${COST_CAP_USD}"
        )
```

Comportamento ao exceder:
- Abort imediato
- Persist `status='falhou'`, `erro="cost cap exceeded at <phase>: $<accumulated>"`
- SSE emite `error` com razão pro frontend
- Não loga PII do cliente no error message (só metadata)

**Tunable:** `COST_CAP_USD` configurável via env `DEBRIEFING_COST_CAP_USD`. Default 5.0. Aumentar pra clientes high-touch via flag na request.

---

## R-7 — Timeouts em camadas

Cada agente tem seu próprio timeout (definido no frontmatter). Orchestrator tem timeout TOTAL global:

```python
TIMEOUT_TOTAL_SECONDS = 240    # 4min

async def run_debriefing(state):
    try:
        async with asyncio.timeout(TIMEOUT_TOTAL_SECONDS):
            await _run_phases(state)
    except asyncio.TimeoutError:
        await persist_falhou(state, erro="Hard timeout total exceeded (4min)")
```

**Hierarquia:**
- Agente individual: 30-120s (varia)
- Squad: soma dos agentes que rodam sequenciais; paralelos = max
- Orchestrator total: 240s

Se agente atinge soft timeout (1ª threshold), emite warning mas continua. Hard timeout aborta.

---

## R-8 — Eventos SSE: o quê emitir quando

```python
SSE_EVENT_MAP = {
    "init": "phase_start",                     # phase=1
    "drive_fetcher.start": "agent_start",
    "drive_fetcher.done": "agent_done",
    "clickup_fetcher.start": "agent_start",
    "clickup_fetcher.done": "agent_done",
    "classifier.done": "phase_progress",       # parte do squad source
    "source_barrier": "phase_done",            # phase=2/3
    "checkpoint_1": "phase_progress",          # phase=4
    "sectionizer.start": "agent_start",
    "sectionizer.done": "agent_done",
    "compositor.start": "agent_start",
    "compositor.progress": "agent_progress",   # streaming chars
    "compositor.done": "agent_done",
    "checkpoint_2": "phase_progress",          # phase=6
    "citation_verifier.start": "agent_start",
    "citation_verifier.done": "agent_done",
    "style_reviewer.start": "agent_start",
    "style_reviewer.done": "agent_done",
    "quality_barrier": "phase_done",           # phase=7
    "retry": "retry",                          # quando dispara retry
    "pdf.start": "phase_start",                # phase=9
    "pdf.done": "phase_done",
    "final.ok": "done",
    "final.error": "error",
}
```

Frontend StreamPanel consome esses eventos pra atualizar UI em tempo real.

---

## R-9 — Schema validation (estrita)

Todo output de agente é validado contra Pydantic schema ANTES de passar pro próximo. Falha de validação:

```python
def validate_agent_output(agent_name, raw_output, schema_class) -> AgentOutput:
    try:
        return schema_class.model_validate_json(raw_output)
    except ValidationError as e:
        # Não retentar o agente — bug está no prompt, não no input
        raise AgentSchemaError(f"{agent_name} returned invalid schema: {e}")
```

**Não retentar agente com schema inválido:** se Claude retornou JSON quebrado uma vez, retry geralmente retorna JSON quebrado de novo. Bug está no prompt do agente, deve ser ajustado pelo Pedro.

---

## R-10 — Logging estruturado por agente

Cada agente emite log JSON estruturado em `backend/logs/agents/<agente>.jsonl`:

```python
{
    "ts": "2026-05-26T15:34:12Z",
    "debriefing_id": "uuid",
    "agent": "compositor",
    "phase": "synthesis",
    "event": "complete",
    "tokens_in": 30000,
    "tokens_out": 12000,
    "cost_usd": 0.28,
    "duration_ms": 65000,
    "model": "claude-sonnet-4-6",
    "prompt_hash": "sha256:abc...",
    "retry_count": 0
}
```

Permite reconstrução completa de qualquer run via grep + jq. Não loga conteúdo (PII) — só metadata.
