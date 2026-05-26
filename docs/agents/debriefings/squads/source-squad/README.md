# Source Squad

**Missão:** extrair de forma estruturada e factual os dados das fontes externas (ClickUp + Drive) que vão alimentar o Synthesis Squad. Sem invenção, sem opinião, sem síntese — só fatos limpos com citação rastreável.

## Agentes deste squad (3)

| Agente | Tipo | Modelo | Spec |
|---|---|---|---|
| `drive-fetcher` | LLM | Haiku 4.5 | [`drive-fetcher.agent.md`](drive-fetcher.agent.md) |
| `clickup-fetcher` | LLM | Haiku 4.5 | [`clickup-fetcher.agent.md`](clickup-fetcher.agent.md) |
| `classifier` | Hybrid (Python + Haiku fallback) | Python regex/embed + Haiku 4.5 em 5% | [`classifier.agent.md`](classifier.agent.md) |

## Schema de output do squad

Implementado em `backend/agents/debriefings/schemas/source_output.py`. Documentado em [`../../protocols/source-output.schema.md`](../../protocols/source-output.schema.md).

```python
class SourceFindings(BaseModel):
    """Output consolidado do Source Squad."""
    debriefing_id: str
    clickup: ClickUpFindings           # do clickup-fetcher
    drive: DriveFindings               # do drive-fetcher + classifier
    period: tuple[date, date]
    total_items: int                   # tasks + docs combinados
    issues: list[Issue]                # warnings não-fatais (ex: "Drive timeout")
    metadata: SquadMetadata            # cost, tokens, duration combinados
```

Cada `FindingItem` (task do ClickUp ou doc do Drive) carrega obrigatoriamente:
- `id` (interno da fonte)
- `title` / `name`
- `date_created` ou `date_modified`
- `summary_text` (≤ 1500 chars, key points extraídos)
- `citation_uri` (URL pública pra Synthesizer/Reviewer validar) ← **obrigatório, sem isso Quality fail**

## Princípios do Source Squad

1. **Factual only.** Workers extraem, não interpretam. Síntese é do Synthesis Squad.
2. **Citation obrigatória.** Sem `citation_uri`, item é rejeitado pelo Orchestrator. Anti-hallucination começa aqui.
3. **Idempotência.** Mesmo input → mesmo output (modulo timestamps). Permite retry barato.
4. **Independência entre fetchers.** `drive-fetcher` não chama `clickup-fetcher` (nem vice-versa). Paralelizam via `asyncio.gather` no Orchestrator.
5. **Classifier roda APÓS drive-fetcher**, dentro do squad. Não dentro do drive-fetcher pra manter separação de responsabilidades.
6. **Degradação graceful.** Se ClickUp 503, retorna `items=[]` + issue "API unavailable", **não** aborta o pipeline. Drive pode continuar; Synthesizer adapta.

## Fluxo interno

```
              ┌─────────────────────┐
              │  Orchestrator       │
              │  dispatch_source()  │
              └──────────┬──────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
       asyncio.gather                 │
            │                         │
   ┌────────▼─────────┐    ┌─────────▼────────┐
   │  drive-fetcher   │    │ clickup-fetcher  │
   │  (Haiku 4.5)     │    │  (Haiku 4.5)     │
   │  fetch raw docs  │    │  fetch tasks/    │
   │  + content       │    │  comments        │
   └────────┬─────────┘    └─────────┬────────┘
            │                         │
            ▼                         │
   ┌─────────────────┐                │
   │   classifier    │                │
   │ (Python hybrid) │                │
   │ tipo por doc    │                │
   └────────┬────────┘                │
            │                         │
            └──────────┬──────────────┘
                       │
              ┌────────▼──────────┐
              │  SourceFindings   │
              │  (consolidado)    │
              └───────────────────┘
```

## Critérios pra adicionar agente novo neste squad

Qualquer fonte de dados externa que entrega items com:
- ID estável
- Data
- Texto/conteúdo
- URL de citação (`citation_uri`)

Entra direto no Source Squad sem refactor. Exemplos futuros:
- **`calendar-fetcher`** (datas de reuniões realizadas no ciclo + transcrições do Google Meet)
- **`sheets-fetcher`** (planilhas de métricas mantidas pelo consultor)
- **`metricas-fetcher`** (métricas IG já no Supabase — sem precisar Drive)

Pra cada novo: replicar template em `<agente>.agent.md`, criar Python espelho, adicionar ao `asyncio.gather` no Orchestrator. Runbook em [`../../runbooks/adding-new-agent.md`](../../runbooks/adding-new-agent.md).

## Cost / Latency baseline do squad inteiro

| Métrica | Esperado | P95 |
|---|---|---|
| Custo USD total | $0,077 | $0,15 |
| Latência (paralelo) | 15-30s | 60s |
| Items extraídos | 30-80 | 200 |

## Owner

`pedroaranda@grupoguglielmi.com` (até designação de squad owner específico)
