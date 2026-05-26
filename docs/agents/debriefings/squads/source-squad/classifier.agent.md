---
name: classifier
version: 1
squad: source-squad
type: hybrid              # Python primário, Haiku 4.5 em fallback (~5%)
description: |
  Classifica cada doc raw do Drive em uma das 4 categorias (transcricao,
  relatorio_entregas, documento_estrategico, outro) e extrai key points por
  tipo. Hybrid 3-layer: regex → embedding similarity → LLM Haiku fallback.
when_to_invoke: |
  Fase 2c do pipeline, APÓS drive-fetcher terminar mas DENTRO do Source Squad
  (não passa pelo Orchestrator). Recebe DriveRawItems, devolve DriveFindings.
owner: pedroaranda@grupoguglielmi.com
model: claude-haiku-4-5            # só pra fallback (5% dos casos)
temperature: 0.1
max_input_tokens: 1500             # Haiku fallback usa contexto pequeno (só primeiros 500 chars)
max_output_tokens: 200
input_schema: backend/agents/debriefings/schemas/source_output.py:ClassifierInput
output_schema: backend/agents/debriefings/schemas/source_output.py:DriveFindings
tools:
  - regex_classify           # Python, free, instant
  - embedding_classify       # Cohere/OpenAI small embedding API, $0.0001/req
  - llm_classify_fallback    # Haiku 4.5 quando ambíguo
prompt_file: docs/agents/debriefings/prompts/classifier/v1.md
implementation_file: backend/agents/debriefings/squads/source/classifier.py
on_failure: return_type_unknown
max_retries: 0                     # se Haiku falha, item fica type=desconhecido
timeout_soft_seconds: 10
timeout_hard_seconds: 30
max_cost_usd: 0.01                 # cap baixo por design
trace_tags: [debriefing, source, classifier]
metrics:
  - items_classified
  - layer1_resolved_total            # regex
  - layer2_resolved_total            # embedding
  - layer3_resolved_total            # haiku fallback
  - layer3_cost_usd
  - duration_ms_per_item
maturity: validated
last_review: 2026-05-26
---

# Classifier

> Classificador de docs do Drive em 4 categorias. Hybrid 3-layer pra otimizar custo: 90% resolve com Python puro, 10% requer LLM. Não interpreta valor estratégico — só categoriza e extrai key points por tipo.

## Papel

**Em escopo:**
- Categorizar cada `DriveRawItem` em uma de 4 categorias:
  - `transcricao` — transcrições de reuniões (Meet, Zoom, etc.)
  - `relatorio_entregas` — relatórios de entrega (geralmente mensal/quinzenal pro cliente)
  - `documento_estrategico` — PEs, manifestos, mapas de cadeira vazia, propostas
  - `outro` — qualquer outro tipo (anexos diversos)
- Pra cada doc categorizado, extrair key points específicos por tipo:
  - `transcricao` → decisões, action items, percepções do consultor
  - `relatorio_entregas` → KPIs, métricas, entregas listadas
  - `documento_estrategico` → headlines, território intelectual, tríades, cadeira vazia
  - `outro` → metadata só (não inflar prompt do Synthesizer)
- Devolver `DriveFindings` consolidado

**Fora de escopo:**
- Avaliar QUALIDADE do conteúdo (cabe ao Synthesis Squad)
- Cruzar com tasks do ClickUp (cabe ao Synthesis Squad)
- Recomendar leitura de docs específicos (cabe ao Synthesis Squad)

## Activation

Invocado pelo `drive_fetcher.py` ao final da sua execução. Não é invocado direto pelo Orchestrator (faz parte do flow interno do Source Squad).

```python
# Dentro de drive_fetcher.py:
raw_items = await fetch_raw_items(...)
classified = await classifier.run(raw_items)
return DriveFindings(items=classified, ...)
```

## Inputs / Outputs

```python
class ClassifierInput(BaseModel):
    items: list[DriveRawItem]      # do drive-fetcher

class DriveItemClassified(BaseModel):
    id: str
    name: str
    type: Literal["transcricao", "relatorio_entregas", "documento_estrategico", "outro", "desconhecido"]
    confidence: Literal["high", "medium", "low"]
    layer_used: Literal["regex", "embedding", "llm", "none"]
    key_points: list[str]              # extraídos por tipo
    citation_uri: str                  # vem do RawItem
    modified_time: datetime
    content_excerpt: str               # primeiros 1500 chars (truncated)

class DriveFindings(BaseModel):
    items: list[DriveItemClassified]
    by_type: dict[str, int]            # contagem por categoria
    issues: list[Issue]
    metadata: AgentMetadata
```

## Layers (detalhe)

### Camada 1 — Regex no nome do arquivo (~70% dos casos)

```python
PATTERNS = [
    (re.compile(r"transcri[çc][ãa]o|transcript|reuni[ãa]o\s+\d", re.I), "transcricao"),
    (re.compile(r"relat[óo]rio.*entrega|entregas?|delivery\s+report", re.I), "relatorio_entregas"),
    (re.compile(r"planejamento\s+estrat[ée]gico|manifesto|cadeira\s+vazia|\bPE\b", re.I), "documento_estrategico"),
]

def regex_classify(name: str) -> Optional[tuple[str, str]]:
    for pattern, tipo in PATTERNS:
        if pattern.search(name):
            return (tipo, "high")
    return None
```

**Custo:** $0 (Python puro). **Latência:** <1ms.

### Camada 2 — Embedding similarity (~25% dos casos)

```python
CENTROIDS = {
    "transcricao": [...],            # embedding de "transcrição reunião decisão ação"
    "relatorio_entregas": [...],
    "documento_estrategico": [...],
    "outro": [...],
}

async def embedding_classify(name: str, content_500_chars: str) -> Optional[tuple[str, str]]:
    query = f"{name}\n{content_500_chars}"
    query_emb = await get_embedding(query, model="cohere-embed-multilingual-light")
    sims = {tipo: cosine_sim(query_emb, centroid) for tipo, centroid in CENTROIDS.items()}
    best_tipo, best_sim = max(sims.items(), key=lambda x: x[1])
    if best_sim >= 0.75:
        return (best_tipo, "medium")
    return None
```

**Custo:** $0,0001/req (Cohere multilingual-light) ou equivalente OpenAI. **Latência:** 50-200ms.

### Camada 3 — LLM Haiku fallback (~5% dos casos)

```python
async def llm_classify_fallback(name: str, content_500_chars: str) -> tuple[str, str]:
    prompt = f"""Classify this document into one category: transcricao, relatorio_entregas,
documento_estrategico, or outro.

Filename: {name}
Content excerpt: {content_500_chars}

Respond with JSON: {{"type": "...", "reasoning": "..."}}"""

    resp = await haiku_call(prompt)  # max_tokens 200
    return (resp["type"], "low")
```

**Custo:** ~$0,001/req. **Latência:** 500-1500ms.

## Extração de key points por tipo

Pra cada item classificado, classifier também extrai key points específicos (não é LLM call adicional — pode ser regex + heurística por enquanto, evolui pra LLM se preciso):

```python
def extract_key_points(item: DriveItemClassified) -> list[str]:
    if item.type == "transcricao":
        # Buscar: "decidimos", "ação:", "TODO:", "percepção:", "next step"
        ...
    elif item.type == "relatorio_entregas":
        # Buscar: linhas com KPIs (% , R$, X mil seguidores)
        ...
    elif item.type == "documento_estrategico":
        # Buscar: "headline:", "cadeira vazia:", "tríade:", "território"
        ...
    return key_points[:10]  # cap em 10 por doc
```

## Error handling

| Erro | Comportamento |
|---|---|
| Regex match ambíguo (2+ matches) | Vai pra Camada 2 |
| Embedding API timeout | Pula pra Camada 3 |
| Embedding API erro 5xx | Pula pra Camada 3 |
| LLM Haiku fallback timeout | Item fica `type='desconhecido'`, confidence=`low`, layer_used=`none` |
| LLM Haiku retorna JSON inválido | Item fica `type='desconhecido'` |
| Cost cap excedido | Para classificação no item atual, restante fica `type='desconhecido'` |

Em todos os casos: o item AINDA aparece no `DriveFindings` (só com tipo "desconhecido"). Synthesizer adapta.

## Observability

**Métricas-chave:**
- `flg_classifier_layer_distribution{layer=regex|embedding|llm|none}` — proporção. Esperado: 70/25/5/0
- `flg_classifier_type_distribution{type=transcricao|...}` — quantos de cada
- `flg_classifier_low_confidence_items` — quantos foram `confidence=low`
- `flg_classifier_cost_usd_total` (deve ser <$0,01 por debriefing)

Se `layer=llm` ultrapassar 15% dos calls, ALERTA: regex/embedding precisam de tuning (centroids desalinhados ou nova categoria emergindo).

**Logs:** `backend/logs/agents/classifier.jsonl`

## Cost / Latency baseline

Por debriefing (assumindo ~20 docs do Drive):

| Métrica | Esperado | P95 |
|---|---|---|
| Items classificados | 20 | 50 |
| Layer 1 (regex) | 14 items, $0 | — |
| Layer 2 (embedding) | 5 items, $0,0005 | $0,002 |
| Layer 3 (LLM) | 1 item, $0,001 | $0,005 |
| **Total** | **$0,005** | **$0,015** |
| Latência total | 2-4s | 10s |

## Como testar localmente

```bash
cd backend
python -m agents.debriefings.squads.source.classifier \
  --input drive_raw.json \
  --output drive_findings.json
```

Sem env vars de Cohere/OpenAI → cai pra layer regex puro (sem embedding). Sem Anthropic key → layer 3 falha (items ficam `desconhecido`).

Validar: `drive_findings.json` deve ter `layer_used` populado em cada item, e `cost_usd < 0.01`.

## Changelog

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-05-26 | v1 | Spec inicial — pattern hybrid 3-layer baseado em research-debriefing-squad-architecture.md | Pedro Aranda |
