# Runbook — Cost Budget Tuning

> Como ajustar caps de custo por agente e total quando o perfil de uso mudar.

---

## Custo baseline atual (com 4-agent arch atual em prod, single-agent)

~R$3,50 por debriefing (Sonnet 4.6 + prompt caching).

## Custo projetado pós-refactor squad

~R$2,70 por debriefing (Haiku 4.5 nos workers de I/O + Sonnet 4.6 só no synthesis).

| Agente | Modelo | Custo USD | % do total |
|---|---|---|---|
| drive-fetcher | Haiku 4.5 | $0,045 | 9% |
| clickup-fetcher | Haiku 4.5 | $0,027 | 6% |
| classifier | Hybrid (95% Python) | $0,005 | 1% |
| sectionizer | Sonnet 4.6 | $0,08 | 16% |
| compositor | Sonnet 4.6 | $0,28 | 57% |
| citation-verifier | Haiku 4.5 | $0,025 | 5% |
| style-reviewer | Haiku 4.5 | $0,015 | 3% |
| PDF render | — | $0 | — |
| **Total** | | **$0,49** | 100% |

**Cap default total:** $5 USD (~R$28) por debriefing.

---

## Cenário 1 — Cap individual de agente muito apertado

Se um agente específico abortou com "cost cap exceeded" mas outros agentes ficaram folgados:

1. Identificar o agente:
   ```bash
   grep "cost cap" backend/logs/agents/*.jsonl | tail -20
   ```

2. Aumentar o `max_cost_usd` no frontmatter da spec do agente:
   ```yaml
   # docs/agents/debriefings/squads/synthesis-squad/compositor.agent.md
   max_cost_usd: 1.20   # antes era 0.80
   ```

3. Atualizar o Python pra ler do frontmatter (script de loading) ou hardcoded em `backend/agents/debriefings/squads/synthesis/compositor.py`.

4. Commit com justificativa: "Bump compositor cap from $0.80 to $1.20 — 3 debriefings hit cap em clientes high-touch."

---

## Cenário 2 — Cap total ($5) muito apertado

Se vários debriefings recentes hit o cap total:

```sql
SELECT cliente_id, custo_usd, erro
FROM debriefings
WHERE erro LIKE '%cost cap exceeded%'
ORDER BY created_at DESC LIMIT 20;
```

**Opções:**

a) **Aumentar cap global:** edita env var
   ```bash
   # Na VPS:
   echo "DEBRIEFING_COST_CAP_USD=8.0" >> /opt/flg/.env
   docker compose restart backend
   ```

b) **Cap dinâmico por cliente:** adicionar coluna `clientes.debriefing_cost_cap_usd` (default 5, override pra clientes high-touch).

c) **Reduzir consumo dos agentes problemáticos:**
   - drive-fetcher: reduzir `max_docs` e/ou `max_chars_por_doc`
   - clickup-fetcher: reduzir `max_tasks`
   - compositor: simplificar template (menos seções) — não recomendado

---

## Cenário 3 — Cliente com pouco material → custo desnecessariamente baixo

Se cliente novo com 5 tasks + 3 docs gera debriefing de $0.20:

Nada errado — custo baixo é bom. Quality Squad ainda valida output mesmo com pouco material. Sectionizer adapta (algumas seções ficam com "Sem dados suficientes neste ciclo").

---

## Cenário 4 — Promover sectionizer + compositor pra Opus

Pra clientes premium, o trade-off custo×qualidade muda:

1. Frontend: adicionar toggle "Use Opus (alta qualidade)" no `NovoDebriefingModal.jsx`
2. Request: `use_opus: true`
3. Orchestrator: passar pro sectionizer e compositor
4. Sectionizer e Compositor: ler `state.request.use_opus` e trocar `model='claude-opus-4-7'`
5. Custo projetado vai de $0.49 → ~$1.80 (Opus é ~3x Sonnet)
6. Cap individual do compositor: $0.80 → $2.50

---

## Cenário 5 — Análise de custo por mês

Pra reportar custo agregado mensal:

```sql
SELECT
  date_trunc('month', gerado_at) AS mes,
  COUNT(*) AS total_debriefings,
  SUM(custo_usd) AS custo_total_usd,
  AVG(custo_usd) AS custo_medio_usd,
  MAX(custo_usd) AS custo_max_usd,
  SUM(CASE WHEN status='falhou' THEN 1 ELSE 0 END) AS falhou_count
FROM debriefings
GROUP BY 1
ORDER BY 1 DESC;
```

Alvo: `custo_medio_usd < 0.70` (R$4) por debriefing. Se ultrapassar persistentemente, revisar prompts ou caps.

---

## Cenário 6 — Prompt caching não está funcionando

Verifica se cache está hit:

```bash
grep '<debriefing_id>' backend/logs/agents/*.jsonl | jq '.tokens_in_cached'
```

Esperado: `tokens_in_cached >> tokens_in` (cache hit). Se `tokens_in_cached = 0`:
- Cache pode ter expirado (TTL 1h)
- System prompt mudou byte-a-byte entre runs (cache invalida)
- Bug na implementação Anthropic SDK

Fix:
- Confirmar `cache_control` está sendo enviado no system prompt
- Verificar que system prompt é IDÊNTICO entre runs do mesmo agente
- Olhar response do Claude pra ver se `cache_creation_input_tokens` e `cache_read_input_tokens` estão sendo retornados

Sem caching, custo sobe ~3.7x — não é negociável.

---

## Tabela de referência rápida

| Variável | Default | Onde fica | Quando mudar |
|---|---|---|---|
| `DEBRIEFING_COST_CAP_USD` | 5.0 | env var | Cliente high-touch ou debriefings sistematicamente caps |
| `max_cost_usd` (compositor) | 0.80 | spec frontmatter | Cliente high-touch ou prompt mais longo |
| `max_docs` (drive-fetcher) | 50 | spec frontmatter | Reduzir se cliente tem ruído no Drive |
| `max_tasks` (clickup-fetcher) | 200 | spec frontmatter | Reduzir se ClickUp tem ruído |
| `max_chars_por_doc` (drive-fetcher) | 4000 | spec frontmatter | Reduzir se docs grandes inflam tokens |
| Cache TTL | 1h | hardcoded no Claude SDK | Não tunável (Anthropic limit) |

Toda mudança nesses valores → commit com justificativa + amostra de 3+ debriefings que motivaram.
