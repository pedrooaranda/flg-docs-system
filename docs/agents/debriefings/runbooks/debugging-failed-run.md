# Runbook — Debugging Failed Run

> Como diagnosticar um debriefing que terminou em `status='falhou'` ou cujo PDF saiu com qualidade ruim.

---

## Passo 0 — Olha o `erro` da row

```sql
SELECT id, status, erro, accumulated_cost_usd, duration_seconds
FROM debriefings
WHERE id = '<debriefing_id>';
```

Mensagem em `erro` aponta a fase + agente responsável. Continua o triage abaixo.

---

## Cenário 1 — "Source Squad falhou: Drive auth failure"

Causa típica: `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` env var ausente, expirada, ou service account perdeu permissão na pasta.

**Diagnóstico:**

```bash
# Na VPS:
cd /opt/flg
docker compose exec backend env | grep GOOGLE_DRIVE
docker compose logs backend --since 1h | grep gdrive
```

**Fix:**
- Se env var ausente: re-adicionar conforme [HANDOFF-debriefings.md seção 5.2.4](../../../superpowers/HANDOFF-debriefings.md)
- Se "Permission denied" no log: confirmar que a pasta foi compartilhada com o email do service account (vide `meta_tester_acceptance_url.md` no memory)

---

## Cenário 2 — "Cost cap exceeded at synthesis"

Causa típica: cliente tem volume MUITO acima do esperado (200+ tasks, 80+ docs), prompt do compositor explodiu.

**Diagnóstico:**

```bash
# Encontrar o quanto cada agente gastou:
grep '<debriefing_id>' backend/logs/agents/*.jsonl | jq '.cost_usd' | paste -sd+ | bc
```

Quebra por agente:
```bash
for agent in drive_fetcher clickup_fetcher sectionizer compositor citation_verifier style_reviewer; do
  cost=$(grep '<debriefing_id>' backend/logs/agents/$agent.jsonl | jq '.cost_usd')
  echo "$agent: $cost"
done
```

**Fix:**
1. Reduzir `max_tasks` no clickup-fetcher (200 → 100) ou `max_docs` no drive-fetcher (50 → 25) — temporariamente
2. Aumentar `COST_CAP_USD` do env (5.0 → 8.0) pra esse cliente high-touch
3. Investigar: cliente realmente precisa de tudo? Ou tem ruído nos findings?

---

## Cenário 3 — "Quality fail após 1 retry"

Causa típica: compositor inventou fato OU citation coverage <80%.

**Diagnóstico — ler o markdown salvo + verdict:**

```sql
SELECT markdown_content, findings_jsonb
FROM debriefings
WHERE id = '<debriefing_id>';
```

```bash
# Verdict do Quality Squad em log:
grep '<debriefing_id>' backend/logs/agents/citation_verifier.jsonl | jq .
grep '<debriefing_id>' backend/logs/agents/style_reviewer.jsonl | jq .
```

Olhe os `issues`. Padrões comuns:

- **`hallucinations_detected > 0`:** compositor inventou número/data. Investigar qual claim → revisar prompt do compositor pra ser mais conservador (`temperature 0.5 → 0.3`).
- **`citation_coverage_pct < 0.8`:** compositor esqueceu de citar. Revisar prompt enfatizando citação inline.
- **Style `fatal_violations` com "ai_self_ref":** compositor falhou em manter tom FLG. Revisar prompt com exemplos negativos.

**Fix imediato:** re-rodar usando markdown existente + Quality Squad apenas (debug offline, sem refazer fetching):

```bash
python -m agents.debriefings.debug_replay \
  --debriefing-id <id> \
  --skip-source --skip-synthesis \
  --rerun-quality
```

(Esse comando reusa `findings_jsonb` e `markdown_content` do DB.)

---

## Cenário 4 — "Timeout total exceeded"

Pipeline ultrapassou 4min hard cap.

**Diagnóstico:**

```bash
grep '<debriefing_id>' backend/logs/agents/*.jsonl | jq -r '[.agent, .duration_ms] | @csv'
```

Identifica o agente lento.

**Fixes possíveis:**
- **drive-fetcher lento:** muitos docs grandes no Drive. Reduzir `max_chars_por_doc` (4000 → 2000).
- **compositor lento:** prompt muito grande OU output muito longo. Verificar se `findings_jsonb` tá inchado, considerar split em sub-compositors por seção.
- **Source Squad sequencial em vez de paralelo:** bug no Orchestrator (asyncio.gather não foi chamado). Inspecionar código.

---

## Cenário 5 — PDF saiu mas qualidade está ruim

PDF gerado, `status='pronto'`, mas Pedro ou Founder revisa e acha output fraco.

**Diagnóstico:**

1. Ler `markdown_content` do row — qualidade textual está OK?
2. Comparar com `findings_jsonb` — há fatos importantes nos findings que NÃO entraram no markdown?
3. Olhar score do Quality Squad — passou com 80? 95? Score alto não garante qualidade subjetiva.

**Diagnóstico de prompt:**

Hash do prompt está em cada log. Se rodaste 5 debriefings recentes e 4 ficaram bons e 1 ficou ruim, **com o mesmo prompt_hash**, é variabilidade natural do modelo — pode ser fixed com retry. Se prompt_hash mudou e qualidade caiu, há regressão no prompt — git blame na pasta `prompts/`.

**Fix:**
- Ajustar prompt do compositor (mais exemplos, mais constraints)
- Promover `USE_OPUS=true` pra este cliente specific
- Aumentar `temperature` pra mais criatividade OU reduzir pra mais conservadorismo
- Re-rodar com prompt v2: criar `prompts/compositor/v2.md`, atualizar frontmatter do spec, atualizar Python pra ler v2

---

## Cenário 6 — Mesmo cliente, debriefings inconsistentes

Pedro roda 2 debriefings do mesmo cliente, mesmo período, e os outputs são significativamente diferentes.

**Causa:** variabilidade inerente do LLM. Anthropic recomenda `temperature=0` pra máxima determinismo, mas isso pode produzir output rígido demais.

**Fix:**
- Aceitar variabilidade dentro de bounds (Quality Squad valida cada run independentemente)
- Reduzir temperature gradualmente (0.5 → 0.3 → 0.1) até estabilizar
- Adicionar mais constraints específicos no prompt do compositor

---

## Quando NÃO debug — escalate pro Pedro/dev

- Erro do Claude API 5xx repetido (problema Anthropic, não nosso)
- Erro persistente do Supabase Storage (não consegue subir PDF)
- Pipeline funciona local mas falha em produção (env var diferente)

Em todos estes casos: documentar steps reproduzir + logs limpos, abrir issue, escalate.

---

## Ferramentas úteis

```bash
# Resumo de runs recentes:
psql -c "SELECT id, status, custo_usd, duracao_segundos, erro FROM debriefings ORDER BY created_at DESC LIMIT 20;"

# Custo médio por status nas últimas 100 runs:
psql -c "SELECT status, AVG(custo_usd) FROM debriefings ORDER BY created_at DESC LIMIT 100 GROUP BY status;"

# Top 10 mais caros:
psql -c "SELECT id, cliente_id, custo_usd, erro FROM debriefings ORDER BY custo_usd DESC LIMIT 10;"

# Logs de 1 debriefing completo:
debriefing_id=<id>
for agent in orchestrator drive_fetcher clickup_fetcher sectionizer compositor citation_verifier style_reviewer; do
  echo "=== $agent ==="
  grep $debriefing_id backend/logs/agents/$agent.jsonl | jq .
done
```
