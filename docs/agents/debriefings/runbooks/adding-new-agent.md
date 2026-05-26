# Runbook — Adicionando agente novo

> Como adicionar um novo agente (ex: Calendar Fetcher no Source Squad) sem quebrar o contrato do sistema.

---

## Pré-requisitos

1. Você decidiu que o agente novo é necessário (a feature pediu, não é over-engineering).
2. Você sabe a qual squad ele pertence:
   - **Source Squad:** se extrai dados externos
   - **Synthesis Squad:** se compõe/transforma findings em conteúdo
   - **Quality Squad:** se audita output

3. Identificou se o agente é:
   - **LLM** (precisa Claude API)
   - **Hybrid** (Python + LLM fallback)
   - **Process** (Python puro)

---

## Passo 1 — Criar a spec (`.agent.md`)

Crie `docs/agents/debriefings/squads/<squad>/<nome-agente>.agent.md` seguindo o template do squad README ([source-squad/README.md](../squads/source-squad/README.md), [synthesis-squad/README.md](../squads/synthesis-squad/README.md), [quality-squad/README.md](../squads/quality-squad/README.md)).

Campos OBRIGATÓRIOS no frontmatter:
- `name`, `version`, `squad`, `type`, `description`, `when_to_invoke`
- `owner`, `model` (se LLM)
- `input_schema`, `output_schema`, `implementation_file`
- `on_failure`, `max_retries`, `timeout_soft_seconds`, `timeout_hard_seconds`
- `max_cost_usd`
- `maturity` (sempre começa em `experimental` até ser provado)

---

## Passo 2 — Criar schemas Pydantic

Em `backend/agents/debriefings/schemas/<squad>_output.py`, adicione:

```python
class <Nome>FetcherInput(BaseModel):
    debriefing_id: str
    # ... outros campos obrigatórios

class <Nome>FetcherOutput(BaseModel):
    items: list[<Item>]                # com citation_uri obrigatório
    issues: list[Issue]
    metadata: AgentMetadata
```

Update também o schema universal do squad (ex: `SourceFindings`) pra incluir esse novo campo.

---

## Passo 3 — Implementar o módulo Python

Crie `backend/agents/debriefings/squads/<squad>/<nome>.py`:

```python
"""<Nome>Fetcher agent — extrai <fonte> filtrado por período.

Spec: docs/agents/debriefings/squads/<squad>/<nome>.agent.md
"""

import logging
from typing import Optional
from anthropic import Anthropic
from ..schemas import <Nome>FetcherInput, <Nome>FetcherOutput

logger = logging.getLogger("flg.agents.<nome>")


async def run(input_: <Nome>FetcherInput) -> <Nome>FetcherOutput:
    """Entry-point do agente. Chamado pelo Orchestrator."""
    # 1. Validate auth/config (se LLM, ANTHROPIC_API_KEY etc.)
    # 2. Fetch data from external source (if applicable)
    # 3. Build prompt (se LLM)
    # 4. Call Claude (se LLM) com prompt caching
    # 5. Parse response, validate schema
    # 6. Return <Nome>FetcherOutput
    ...
```

---

## Passo 4 — Criar prompt file (se LLM)

Crie `docs/agents/debriefings/prompts/<nome>/v1.md` com o system prompt completo:

```markdown
# <Nome>Fetcher — System Prompt v1

You are the <Nome>Fetcher agent for the FLG debriefing pipeline.

Your job: ...

Critical rules:
- ...
- Every item MUST have citation_uri populated.
- Output strict JSON matching <Nome>FetcherOutput schema.
```

---

## Passo 5 — Plugar no Orchestrator

Em `backend/agents/debriefings/orchestrator.py`:

**Source Squad (adicionar fetcher novo):**

```python
async def dispatch_source_squad(state):
    drive_task = asyncio.create_task(drive_fetcher.run(...))
    clickup_task = asyncio.create_task(clickup_fetcher.run(...))
    calendar_task = asyncio.create_task(calendar_fetcher.run(...))   # <-- NOVO

    results = await asyncio.gather(
        drive_task, clickup_task, calendar_task,                     # <-- NOVO
        return_exceptions=True
    )
    # ... consolida em SourceFindings (adicionar campo calendar)
```

**Synthesis Squad:** geralmente NÃO adiciona novo agente — sectionizer+compositor cobre o framework FLG. Excepção: criar `outline_validator` entre os dois.

**Quality Squad:** se adicionar `grammar-reviewer` ou similar, plugar no `asyncio.gather` da fase 7.

---

## Passo 6 — Atualizar docs

- [ ] Adicionar entrada na tabela "Inventário dos componentes" em [README.md](../README.md)
- [ ] Adicionar entrada no fluxograma em [WORKFLOW.md](../WORKFLOW.md)
- [ ] Atualizar `SourceFindings` (ou squad correspondente) em [protocols/state.schema.md](../protocols/state.schema.md) e [protocols/source-output.schema.md](../protocols/source-output.schema.md)
- [ ] Se introduz nova rota condicional, adicionar regra em [protocols/routing-rules.md](../protocols/routing-rules.md)
- [ ] Atualizar squad README com o novo agente listado

---

## Passo 7 — Testes

1. **Unit test** do módulo Python (mock Claude API):
   ```bash
   pytest backend/tests/agents/debriefings/test_<nome>.py
   ```

2. **CLI smoke test** local:
   ```bash
   python -m agents.debriefings.squads.<squad>.<nome> \
     --input test_input.json --output result.json
   ```

3. **Integration test** end-to-end com 1 cliente real:
   - Gerar debriefing pelo frontend
   - Validar que `findings` (ou output do squad) inclui dados do novo agente
   - Confirmar custo total dentro do cap

---

## Passo 8 — CI validation

CI roda `scripts/validate_agent_specs.py` que valida:

1. Cada `*.agent.md` tem irmão `.py` correspondente
2. Cada `.py` tem irmão `.agent.md`
3. Frontmatter campos obrigatórios presentes
4. Pydantic schemas referenciados existem
5. `prompt_file` se LLM, tem `.md` correspondente

Se algum falhar: CI bloqueia merge.

---

## Passo 9 — Promoção de maturity

1. **Spec inicial:** `maturity: experimental`
2. **Após 10 debriefings reais sem erro fatal:** muda pra `validated` no frontmatter
3. **Após 100 debriefings + 3 meses sem regressão:** muda pra `battle-tested`

Documente no `Changelog` do spec a mudança de maturity.

---

## Anti-padrões — NÃO faça

❌ Adicionar agente sem spec. Spec é o contrato; sem ela, ninguém sabe o que esperar do agente.

❌ Adicionar 5 agentes de uma vez. Adiciona 1, valida em produção, depois adiciona próximo. Caso contrário, debug fica impossível.

❌ Pular Quality Squad pra agente novo. Se o novo agente produz texto/markdown, Quality precisa auditar.

❌ Usar Sonnet onde Haiku resolve. Cada agente novo aumenta custo total — usar modelo mais barato que entrega qualidade aceitável.

❌ Quebrar contrato de schema sem aviso. Se mudar `SourceFindings`, todos os agentes downstream que leem isso (Synthesis Squad) precisam ser atualizados ao mesmo tempo.

❌ Esquecer `citation_uri` obrigatório. Quality Squad vai falhar 100% se algum item novo não tiver isso.

---

## Exemplo concreto: adicionando `calendar-fetcher`

Pra adicionar fetcher de eventos do Google Calendar (datas + descrições de reuniões realizadas no ciclo):

1. Doc: `docs/agents/debriefings/squads/source-squad/calendar-fetcher.agent.md`
2. Schema: `backend/agents/debriefings/schemas/source_output.py:CalendarFindings`
3. Python: `backend/agents/debriefings/squads/source/calendar_fetcher.py`
4. Prompt: `docs/agents/debriefings/prompts/calendar-fetcher/v1.md`
5. Orchestrator: adicionar `calendar_task` no `asyncio.gather` do Source Squad
6. SourceFindings: adicionar `calendar: CalendarFindings` ao schema universal
7. Update README + WORKFLOW + protocols
8. Tests + CI passa
9. Deploy + 10 debriefings reais → promover pra `validated`

Estimativa total: ~6-10h de dev incluindo testes. Padrão pra cada novo fetcher.
