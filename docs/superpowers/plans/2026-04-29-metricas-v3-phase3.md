# Métricas V3 Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir bug crônico do cruzamento gênero × idade na demografia, redesenhar UI de demografia (Recharts), adicionar filtros reais de ordenação em posts/reels/stories (`?ordenar=` no backend + dropdown no frontend), e refatorar as 3 abas duplicadas em hook + view compartilhada.

**Architecture:** Backend ganha 1 chamada extra à Meta API (`breakdown=age,gender`) e novos query params em `/posts`. Frontend ganha 3 módulos compartilhados (`useTipoMetricas`, `MetricasTipoView`, `SortDropdown`) que substituem as 3 implementações duplicadas. Demografia migra de CSS borboleta pra Recharts BarChart vertical agrupado.

**Tech Stack:** FastAPI + Supabase (Postgres) backend; React + Vite + Tailwind + Recharts + framer-motion frontend. Sem suite de testes formal — validação via `python3 -m py_compile` (backend) + `esbuild --bundle=false --loader:.jsx=jsx` (frontend) + smoke manual após deploy automático em push pra `main`.

**Spec:** [docs/superpowers/specs/2026-04-29-metricas-v3-phase3-design.md](../specs/2026-04-29-metricas-v3-phase3-design.md)

---

## Estrutura de arquivos

**Modificar:**
- `backend/services/instagram_sync.py` — `_sync_demographics` ganha 5ª chamada; `_merge_breakdown` ganha branch `age,gender`
- `backend/services/instagram.py` — `LiveInstagramRepository.get_posts` aceita `tipo` e `ordenar`; `MockInstagramRepository.get_posts` idem
- `backend/routes/metricas.py` — endpoint `/posts` aceita `?tipo=` e `?ordenar=`
- `frontend/src/components/MetricasParts.jsx` — `GenderAgeChart` reescrito com Recharts; `CountryBars`/`CityBars` refinados
- `frontend/src/components/Metricas/shared/constants.js` — adiciona `ORDER_OPTIONS_FEED`/`REELS`/`STORIES`
- `frontend/src/components/Metricas/MetricasPosts.jsx` — vira wrapper de ~25 linhas
- `frontend/src/components/Metricas/MetricasReels.jsx` — idem
- `frontend/src/components/Metricas/MetricasStories.jsx` — idem

**Criar:**
- `frontend/src/components/Metricas/shared/SortDropdown.jsx` — dropdown clássico
- `frontend/src/components/Metricas/shared/MetricasTipoView.jsx` — view compartilhada das 3 abas
- `frontend/src/components/Metricas/shared/useTipoMetricas.js` — hook de fetch + state

---

## Tasks

### Task 1: Backend — fix demografia age × gender

**Sub-tema A do spec.** Bug crônico: `_sync_demographics` chama Meta API com breakdowns separados (`age`, `gender`) — nunca combina. Frontend espera keys `F.18-24`, `M.25-34` que nunca foram geradas. Solução: adicionar 5ª chamada com `breakdown=age,gender` e branch novo no `_merge_breakdown`.

**Files:**
- Modify: `backend/services/instagram_sync.py:687-799`

- [ ] **Step 1: Adicionar `"age,gender"` no DEMO_BREAKDOWNS**

Editar `backend/services/instagram_sync.py:687`. Antes:

```python
DEMO_BREAKDOWNS = ["age", "gender", "country", "city"]
```

Depois:

```python
DEMO_BREAKDOWNS = ["age", "gender", "country", "city", "age,gender"]
```

A Meta API aceita CSV no parâmetro `breakdown`. A nova chamada retorna `dimension_values: ["18-24", "F"]` (ordem age, gender).

- [ ] **Step 2: Adicionar branch `age,gender` em `_merge_breakdown`**

Editar `backend/services/instagram_sync.py:764`. Localizar o último `elif breakdown == "city":` e adicionar branch novo logo antes do fim da função. Função atualmente termina em `elif breakdown == "locale":` (ou similar). Adicionar:

```python
    elif breakdown == "age,gender":
        # results: [{ "dimension_values": ["18-24", "F"], "value": 1234 }]
        # Cruzamento puro — alimenta keys "F.18-24", "M.25-34" que o frontend usa.
        for r in results:
            dims = r.get("dimension_values", [])
            if len(dims) < 2:
                continue
            age, gender = dims[0], dims[1]
            if gender not in ("F", "M", "U"):
                continue
            val = int(r.get("value") or 0)
            key = f"{gender}.{age}"
            agg["genero_idade"][key] = agg["genero_idade"].get(key, 0) + val
```

Importante: NÃO somar em `total_count` aqui — o branch `gender` (sem age) já faz isso. Somar duas vezes inflaria o total.

- [ ] **Step 3: Validar sintaxe backend**

Run: `python3 -m py_compile backend/services/instagram_sync.py`
Expected: sem output (sucesso silencioso)

- [ ] **Step 4: Commit**

```bash
git add backend/services/instagram_sync.py
git commit -m "$(cat <<'EOF'
fix(metricas): puxa cruzamento age × gender da Meta API

Bug crônico: _sync_demographics chamava breakdown=age e breakdown=gender
separadamente. Frontend GenderAgeChart espera keys F.18-24/M.25-34 que
nunca foram geradas — daí o gráfico borboleta sempre vazio.

Adiciona 5ª chamada com breakdown=age,gender (CSV aceito pela Meta API)
que retorna dimension_values=["18-24","F"]. Branch novo no _merge_breakdown
escreve as keys cruzadas. Outras 4 chamadas mantidas — gender ainda alimenta
totais agregados F/M.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Frontend — redesign demografia UI

**Sub-tema B do spec.** Substituir `GenderAgeChart` (CSS borboleta com barras h-3.5 sutis) por Recharts BarChart vertical agrupado. Refinar `CountryBars` e `CityBars` (top 10 + mini-rank #1/#2/#3 colorido + totais formatados).

**Files:**
- Modify: `frontend/src/components/MetricasParts.jsx:596-727`

- [ ] **Step 1: Adicionar import do Recharts e helper formatCompact**

Editar topo do `frontend/src/components/MetricasParts.jsx`. Procurar o bloco de imports do `lucide-react` (linhas ~14-17). Logo abaixo dos imports já existentes, adicionar:

```jsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend, LabelList, ResponsiveContainer } from 'recharts'
```

Procurar a função `formatNum` (linha ~517) e ADICIONAR (não substituir) logo abaixo dela:

```jsx
function formatCompact(n) {
  if (n == null) return '—'
  const num = Number(n)
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace('.0', '') + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace('.0', '') + 'K'
  return num.toLocaleString('pt-BR')
}

const RANK_COLORS = ['#FACC15', '#CBD5E1', '#D97706'] // ouro, prata, bronze
```

- [ ] **Step 2: Reescrever `GenderAgeChart` com Recharts**

Editar `frontend/src/components/MetricasParts.jsx:596-648`. Substituir a função `GenderAgeChart` inteira por:

```jsx
function GenderAgeChart({ data, accent, loading }) {
  const ages = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']
  const totalF = data['F'] || 0
  const totalM = data['M'] || 0
  const grandTotal = totalF + totalM
  const pctF = grandTotal ? Math.round((totalF / grandTotal) * 100) : 0
  const pctM = grandTotal ? Math.round((totalM / grandTotal) * 100) : 0

  const chartData = ages.map(age => ({
    age,
    F: data[`F.${age}`] || 0,
    M: data[`M.${age}`] || 0,
  }))

  const hasCrossData = chartData.some(d => d.F > 0 || d.M > 0)

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-white/40 font-medium">Gênero × Idade</span>
        {grandTotal > 0 && (
          <div className="text-[10px] flex items-center gap-3">
            <span><span style={{ color: '#F472B6' }}>● </span>F {pctF}%</span>
            <span><span style={{ color: '#60A5FA' }}>● </span>M {pctM}%</span>
          </div>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          {ages.map((a, i) => <Skel key={i} h={16} />)}
        </div>
      ) : !hasCrossData ? (
        <div className="text-[11px] text-white/30 py-8 text-center">
          Sem dados de cruzamento gênero × idade.
          <div className="text-[10px] text-white/20 mt-1">A Meta API só retorna esse cruzamento com audiência mínima.</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 14, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="age" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} tickLine={false} axisLine={false} width={40} tickFormatter={formatCompact} />
            <ReTooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{ background: 'var(--flg-bg-card)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 8, fontSize: 11 }}
              formatter={(v, name) => [formatNum(v), name === 'F' ? 'Feminino' : 'Masculino']}
            />
            <Bar dataKey="F" fill="#F472B6" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="F" position="top" fill="rgba(255,255,255,0.55)" fontSize={9} formatter={formatCompact} />
            </Bar>
            <Bar dataKey="M" fill="#60A5FA" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="M" position="top" fill="rgba(255,255,255,0.55)" fontSize={9} formatter={formatCompact} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Refinar `CountryBars` (top 10 + mini-rank + formatCompact)**

Editar `frontend/src/components/MetricasParts.jsx:650-693`. Substituir função inteira por:

```jsx
function CountryBars({ data, total, accent, loading }) {
  const top = (data || []).slice(0, 10)
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-white/40 font-medium">Top Países</span>
        <span className="text-[9px] text-white/25">{top.length} de {data?.length || 0}</span>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => <Skel key={i} h={20} />)}
        </div>
      ) : top.length === 0 ? (
        <div className="text-[11px] text-white/30 py-6 text-center">Sem dados</div>
      ) : (
        <div className="space-y-2">
          {top.map((item, idx) => {
            const pct = total ? (item.value / total) * 100 : 0
            const rankColor = RANK_COLORS[idx]
            return (
              <div key={item.key} className="text-[11px]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white/70 flex items-center gap-1.5">
                    <span
                      className="text-[9px] font-bold w-4 text-center"
                      style={{ color: rankColor || 'rgba(255,255,255,0.3)' }}
                    >
                      #{idx + 1}
                    </span>
                    <span className="text-base leading-none">{FLAG_EMOJI(item.key)}</span>
                    {COUNTRY_NAMES[item.key] || item.key}
                  </span>
                  <span className="text-white/40">
                    <span style={{ color: accent }} className="font-semibold">{pct.toFixed(1)}%</span>
                    <span className="ml-1.5 text-white/30">{formatCompact(item.value)}</span>
                  </span>
                </div>
                <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div
                    className="h-1 rounded-full transition-all"
                    style={{ width: `${Math.min(100, pct * 1.2)}%`, background: `linear-gradient(90deg, ${accent}50, ${accent})` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Refinar `CityBars` (top 10 + mini-rank + formatCompact)**

Editar `frontend/src/components/MetricasParts.jsx:695-727`. Substituir função inteira por:

```jsx
function CityBars({ data, total, accent, loading }) {
  const top = (data || []).slice(0, 10)
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-white/40 font-medium">Top Cidades</span>
        <span className="text-[9px] text-white/25">{top.length} de {data?.length || 0}</span>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => <Skel key={i} h={18} />)}
        </div>
      ) : top.length === 0 ? (
        <div className="text-[11px] text-white/30 py-6 text-center">Sem dados</div>
      ) : (
        <div className="space-y-1.5">
          {top.map((item, idx) => {
            const pct = total ? (item.value / total) * 100 : 0
            const rankColor = RANK_COLORS[idx]
            return (
              <div key={item.key} className="flex items-center justify-between text-[11px]">
                <span className="text-white/70 flex items-center gap-1.5 truncate flex-1 min-w-0">
                  <span
                    className="text-[9px] font-bold w-4 text-center shrink-0"
                    style={{ color: rankColor || 'rgba(255,255,255,0.3)' }}
                  >
                    #{idx + 1}
                  </span>
                  <span className="truncate">{item.key}</span>
                </span>
                <span className="ml-2 text-white/30 shrink-0">
                  <span style={{ color: accent }} className="font-semibold">{pct.toFixed(1)}%</span>
                  <span className="ml-1.5">· {formatCompact(item.value)}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Validar bundle frontend**

Run: `frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx frontend/src/components/MetricasParts.jsx > /dev/null`
Expected: sem erros de sintaxe (saída vazia ou só warnings de estilo)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/MetricasParts.jsx
git commit -m "$(cat <<'EOF'
feat(metricas): redesign demografia (Recharts BarChart + top 10 países/cidades)

GenderAgeChart trocado de borboleta CSS por Recharts BarChart vertical
agrupado (rosa F + azul M por faixa etária, valores acima das barras,
tooltip rico). Mostra mensagem específica quando Meta não retornou cruzamento.

CountryBars e CityBars: top 10 (era 6/8), mini-rank colorido nos primeiros
3 (#1 ouro, #2 prata, #3 bronze), totais em formato compacto (12.4K).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Backend — `/posts` aceita `?tipo=` e `?ordenar=`

**Sub-tema C do spec.** Hoje endpoint `/posts` retorna `limit` posts ordenados por `engagement_rate desc`, sem aceitar tipo nem alternativa de ordenação. Frontend filtra por tipo no client-side. Mudança: backend faz tudo, retorna top N por critério escolhido sobre todo o histórico.

**Files:**
- Modify: `backend/services/instagram.py:119-149` (mock get_posts)
- Modify: `backend/services/instagram.py:375-413` (live get_posts)
- Modify: `backend/routes/metricas.py:382-393` (endpoint)

- [ ] **Step 1: Atualizar `LiveInstagramRepository.get_posts` pra aceitar tipo + ordenar**

Editar `backend/services/instagram.py:375`. Substituir a assinatura e o início da função (até a linha que ordena por `engagement_rate`) por:

```python
    ORDER_COLUMN_MAP = {
        "engajamento": "engagement_rate",
        "recente": "posted_at",
        "curtidas": "likes",
        "comentarios": "comments",
        "salvamentos": "saved",
        "compartilhamentos": "shares",
        "alcance": "reach",
        "replies": "replies_total",
        "exits": "exits_total",
    }

    def get_posts(self, cliente_id: str, limit: int = 12, tipo: str = "all", ordenar: str = "engajamento") -> list:
        column = self.ORDER_COLUMN_MAP.get(ordenar, "engagement_rate")
        q = self.sb.table("instagram_posts").select("*").eq("cliente_id", cliente_id)

        if tipo == "feed":
            q = q.in_("media_product_type", ["FEED"])
        elif tipo == "reels":
            q = q.in_("media_product_type", ["REELS"])
        elif tipo == "story":
            q = q.in_("media_product_type", ["STORY"])
        # tipo == "all" (default) → sem filtro

        posts = q.order(column, desc=True).limit(limit).execute().data or []
```

O resto da função (loop `for p in posts:` que monta `out`) fica idêntico — só mudou o fetch.

**Importante:** validar que `instagram_posts` tem coluna `media_product_type`. Se não tiver, mapear via `media_type` no Python (mais lento). Verificar antes:

```bash
grep -A5 "CREATE TABLE instagram_posts" backend/main.py | head -30
```

Se a coluna `media_product_type` não existir no schema, o `q.in_("media_product_type", ...)` vai falhar. Plano B: filtrar Python-side depois do fetch (menos eficiente mas funciona).

- [ ] **Step 2: Atualizar `MockInstagramRepository.get_posts` pra aceitar tipo + ordenar**

Editar `backend/services/instagram.py:119`. Substituir assinatura e final da função:

```python
    def get_posts(self, cliente_id: str, limit: int = 12, tipo: str = "all", ordenar: str = "engajamento", **kwargs) -> list:
        rng = self._rng(cliente_id)
        # Ciclo aumentado pra cobrir os 3 tipos
        tipos_ciclo_all = ["REEL", "IMAGE", "CAROUSEL", "STORY", "VIDEO", "REEL", "STORY", "IMAGE"]

        if tipo == "feed":
            tipos_ciclo = ["IMAGE", "CAROUSEL", "VIDEO"]
        elif tipo == "reels":
            tipos_ciclo = ["REEL"]
        elif tipo == "story":
            tipos_ciclo = ["STORY"]
        else:
            tipos_ciclo = tipos_ciclo_all

        posts = []
        for i in range(limit):
            tipo_post = tipos_ciclo[i % len(tipos_ciclo)]
            alcance   = rng.randint(600, 6000)
            curtidas  = rng.randint(80, 500)
            coments   = rng.randint(5, 70)
            salvam    = rng.randint(10, 140)
            taxa = round((curtidas + coments + salvam) / max(alcance, 1) * 100, 2)
            dias_atras = rng.randint(1, 30)

            posts.append({
                "id": f"mock_{cliente_id[:8]}_{i}",
                "tipo": tipo_post,
                "publicado_em": str(date.today() - timedelta(days=dias_atras)),
                "legenda": _mock_legenda(tipo_post, rng),
                "curtidas": curtidas,
                "comentarios": coments,
                "salvamentos": salvam,
                "compartilhamentos": rng.randint(2, 35),
                "alcance": alcance,
                "impressoes": int(alcance * rng.uniform(1.3, 2.2)),
                "plays": curtidas * rng.randint(3, 8) if tipo_post in ("REEL", "VIDEO") else 0,
                "taxa_engajamento": taxa,
                "fonte": "mock",
            })

        sort_keys = {
            "engajamento": "taxa_engajamento",
            "recente": "publicado_em",
            "curtidas": "curtidas",
            "comentarios": "comentarios",
            "salvamentos": "salvamentos",
            "compartilhamentos": "compartilhamentos",
            "alcance": "alcance",
        }
        sk = sort_keys.get(ordenar, "taxa_engajamento")
        return sorted(posts, key=lambda x: x.get(sk) or 0, reverse=True)
```

- [ ] **Step 3: Atualizar endpoint `/posts` em routes/metricas.py**

Editar `backend/routes/metricas.py:382-393`. Substituir endpoint inteiro por:

```python
VALID_ORDENAR = {"engajamento", "recente", "curtidas", "comentarios", "salvamentos",
                 "compartilhamentos", "alcance", "replies", "exits"}
VALID_TIPO = {"all", "feed", "reels", "story"}


@router.get("/{cliente_id}/posts")
async def get_posts(
    cliente_id: str,
    limit: int = 12,
    plataforma: str = "instagram",
    tipo: str = "all",
    ordenar: str = "engajamento",
    user=Depends(get_current_user),
):
    if limit > 50:
        limit = 50
    if tipo not in VALID_TIPO:
        raise HTTPException(400, f"tipo deve ser um de: {sorted(VALID_TIPO)}")
    if ordenar not in VALID_ORDENAR:
        raise HTTPException(400, f"ordenar deve ser um de: {sorted(VALID_ORDENAR)}")
    repo = _get_repo(plataforma, cliente_id)
    return {
        "cliente_id": cliente_id,
        "plataforma": plataforma,
        "tipo": tipo,
        "ordenar": ordenar,
        "posts": repo.get_posts(cliente_id, limit, tipo=tipo, ordenar=ordenar),
    }
```

As constantes `VALID_ORDENAR` e `VALID_TIPO` ficam no topo do arquivo (próximo aos outros constants). Se o arquivo já tiver uma seção de constantes, agrupar lá.

- [ ] **Step 4: Validar sintaxe backend**

Run: `python3 -m py_compile backend/services/instagram.py backend/routes/metricas.py`
Expected: sem output (sucesso silencioso)

- [ ] **Step 5: Verificar coluna `media_product_type` no schema**

Run: `grep -B1 -A30 "CREATE TABLE.*instagram_posts" backend/main.py | head -40`

Conferir se aparece `media_product_type`. Se sim, ok. Se não, **rollback do filtro tipo no Live**: trocar `q.in_("media_product_type", [...])` por filtro Python-side depois do fetch:

```python
posts = q.order(column, desc=True).limit(limit * 3).execute().data or []  # margem
if tipo == "feed":
    posts = [p for p in posts if (p.get("media_product_type") or "FEED").upper() == "FEED"][:limit]
elif tipo == "reels":
    posts = [p for p in posts if (p.get("media_product_type") or "").upper() == "REELS"][:limit]
elif tipo == "story":
    posts = [p for p in posts if (p.get("media_product_type") or "").upper() == "STORY"][:limit]
else:
    posts = posts[:limit]
```

- [ ] **Step 6: Commit**

```bash
git add backend/services/instagram.py backend/routes/metricas.py
git commit -m "$(cat <<'EOF'
feat(metricas): /posts aceita ?tipo= e ?ordenar=

Backend agora ordena posts por critério escolhido sobre todo histórico
do cliente, antes de aplicar limit. Resolve limitação atual onde "mais
engajados" mostrava só os mais engajados ENTRE os 24 mais recentes.

Tipos: all | feed | reels | story
Ordenar: engajamento (default) | recente | curtidas | comentarios |
         salvamentos | compartilhamentos | alcance | replies | exits

Mock e Live ambos atualizados. Validação 400 pra valores inválidos.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Frontend — refactor: hook + view compartilhada

**Sub-tema E do spec.** Os 3 arquivos `MetricasPosts.jsx`, `MetricasReels.jsx`, `MetricasStories.jsx` repetem 95% do código. Extrair `useTipoMetricas` (hook de fetch) + `MetricasTipoView` (componente de render). **Sem dropdown ainda** — mantém paridade com comportamento atual. Task 5 adiciona o dropdown depois.

**Files:**
- Create: `frontend/src/components/Metricas/shared/useTipoMetricas.js`
- Create: `frontend/src/components/Metricas/shared/MetricasTipoView.jsx`
- Modify: `frontend/src/components/Metricas/MetricasPosts.jsx` (vira wrapper)
- Modify: `frontend/src/components/Metricas/MetricasReels.jsx` (vira wrapper)
- Modify: `frontend/src/components/Metricas/MetricasStories.jsx` (vira wrapper)

- [ ] **Step 1: Criar hook `useTipoMetricas`**

Criar `frontend/src/components/Metricas/shared/useTipoMetricas.js`:

```javascript
import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api } from '../../../lib/api'

/**
 * Hook compartilhado pelas abas Posts/Reels/Stories.
 * tipoBackend: 'feed' | 'reels' | 'story' (vai pro ?tipo= do /overview)
 * tipoFiltroPostFE: array de strings ['IMAGE','CAROUSEL','VIDEO'] etc — filtra
 *   posts no frontend depois do fetch (Task 5 substitui isso por ?tipo= no /posts)
 * ordenar: string que vai pro ?ordenar= do /posts (Task 5 ativa de fato)
 */
export function useTipoMetricas({ tipoBackend, tipoFiltroPostFE, ordenar = 'engajamento' }) {
  const { clienteId, periodo, platform, platConfig } = useOutletContext()
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [posts, setPosts] = useState([])

  useEffect(() => {
    if (!clienteId) return
    setLoading(true)
    setOverview(null)
    Promise.all([
      api(`/metricas/${clienteId}/overview?plataforma=${platform}&dias=${periodo}&tipo=${tipoBackend}`),
      api(`/metricas/${clienteId}/posts?plataforma=${platform}&limit=24&tipo=${tipoBackend}&ordenar=${ordenar}`),
    ]).then(([ov, po]) => {
      setOverview(ov)
      // Filtro frontend mantido como segurança caso backend ainda devolva tipos misturados
      const all = po.posts || []
      const filtered = tipoFiltroPostFE
        ? all.filter(p => tipoFiltroPostFE.includes(p.tipo))
        : all
      setPosts(filtered)
    }).catch(console.error).finally(() => setLoading(false))
  }, [clienteId, periodo, platform, tipoBackend, ordenar])

  return { clienteId, periodo, platform, platConfig, loading, overview, posts }
}
```

- [ ] **Step 2: Criar componente `MetricasTipoView`**

Criar `frontend/src/components/Metricas/shared/MetricasTipoView.jsx`:

```jsx
import { useState } from 'react'
import { KpiGridSkeleton, PostsGridSkeleton, PostsTable, ViewToggle } from '../../MetricasParts'
import KpiCard from './KpiCard'
import PostCard from './PostCard'
import { KPI_WEIGHT } from './constants'
import { useTipoMetricas } from './useTipoMetricas'

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-3">{children}</h2>
}

/**
 * View compartilhada das abas Posts/Reels/Stories.
 *
 * Props:
 * - tipoBackend: 'feed' | 'reels' | 'story'
 * - tipoFiltroPostFE: array de tipos válidos (ex: ['IMAGE','CAROUSEL','VIDEO'] pra Feed)
 * - kpisDef: lista de defs de KPI (KPIS_FEED, KPIS_REELS ou KPIS_STORIES)
 * - kpiSkelCount: quantos skeletons mostrar
 * - sectionTitle: título da seção de KPIs (ex: 'Posts (Feed)')
 * - listTitle: título da lista de posts (ex: 'Lista de posts')
 * - emptyMessage: texto quando não tem post
 */
export default function MetricasTipoView({
  tipoBackend,
  tipoFiltroPostFE,
  kpisDef,
  kpiSkelCount = 7,
  sectionTitle,
  listTitle,
  emptyMessage,
}) {
  const { periodo, platform, platConfig, loading, overview, posts } = useTipoMetricas({
    tipoBackend,
    tipoFiltroPostFE,
  })
  const [postsView, setPostsView] = useState('cards')

  if (loading) {
    return (
      <div className="space-y-6">
        <KpiGridSkeleton count={kpiSkelCount} />
        <PostsGridSkeleton />
      </div>
    )
  }
  if (!overview) return null

  const kpis = overview.kpis
  const winner = kpisDef.reduce((best, d) => {
    if (d.noDelta) return best
    const dl = kpis[d.key]?.delta_pct
    if (dl == null || dl <= 0) return best
    const score = dl * (KPI_WEIGHT[d.key] || 1)
    if (!best || score > best.score) return { key: d.key, delta: dl, score }
    return best
  }, null)

  return (
    <>
      <section>
        <SectionTitle>{sectionTitle} — últimos {periodo} dias</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {kpisDef.map((def) => {
            const kpi = kpis[def.key]
            if (!kpi) return null
            return (
              <KpiCard
                key={def.key}
                icon={def.icon}
                label={def.label}
                value={kpi.valor || 0}
                decimals={def.decimals || 0}
                suffix={def.suffix || ''}
                delta={def.noDelta ? undefined : kpi.delta_pct}
                color={platConfig.color}
                highlight={winner?.key === def.key}
              />
            )
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>{listTitle}</SectionTitle>
          <ViewToggle value={postsView} onChange={setPostsView} accent={platConfig.color} />
        </div>
        {posts.length === 0 ? (
          <p className="text-white/40 text-xs">{emptyMessage}</p>
        ) : postsView === 'cards' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.slice(0, 9).map((post, i) => <PostCard key={post.id} post={post} rank={i} platform={platform} />)}
          </div>
        ) : (
          <PostsTable posts={posts} accent={platConfig.color} />
        )}
      </section>
    </>
  )
}
```

- [ ] **Step 3: Reescrever `MetricasPosts.jsx` como wrapper**

Substituir conteúdo inteiro de `frontend/src/components/Metricas/MetricasPosts.jsx` por:

```jsx
import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_FEED } from './shared/constants'

export default function MetricasPosts() {
  return (
    <MetricasTipoView
      tipoBackend="feed"
      tipoFiltroPostFE={['IMAGE', 'CAROUSEL', 'VIDEO']}
      kpisDef={KPIS_FEED}
      kpiSkelCount={7}
      sectionTitle="Posts (Feed)"
      listTitle="Lista de posts"
      emptyMessage="Nenhum post no período."
    />
  )
}
```

- [ ] **Step 4: Reescrever `MetricasReels.jsx` como wrapper**

Substituir conteúdo inteiro de `frontend/src/components/Metricas/MetricasReels.jsx` por:

```jsx
import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_REELS } from './shared/constants'

export default function MetricasReels() {
  return (
    <MetricasTipoView
      tipoBackend="reels"
      tipoFiltroPostFE={['REEL']}
      kpisDef={KPIS_REELS}
      kpiSkelCount={9}
      sectionTitle="Reels"
      listTitle="Lista de Reels"
      emptyMessage="Nenhum Reel no período."
    />
  )
}
```

- [ ] **Step 5: Reescrever `MetricasStories.jsx` como wrapper**

Substituir conteúdo inteiro de `frontend/src/components/Metricas/MetricasStories.jsx` por:

```jsx
import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_STORIES } from './shared/constants'

export default function MetricasStories() {
  return (
    <MetricasTipoView
      tipoBackend="story"
      tipoFiltroPostFE={['STORY']}
      kpisDef={KPIS_STORIES}
      kpiSkelCount={7}
      sectionTitle="Stories"
      listTitle="Stories ativas (24h) e recentes"
      emptyMessage="Nenhum Story no período."
    />
  )
}
```

- [ ] **Step 6: Validar bundle**

Run:
```bash
frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx \
  frontend/src/components/Metricas/MetricasPosts.jsx \
  frontend/src/components/Metricas/MetricasReels.jsx \
  frontend/src/components/Metricas/MetricasStories.jsx \
  frontend/src/components/Metricas/shared/MetricasTipoView.jsx \
  frontend/src/components/Metricas/shared/useTipoMetricas.js > /dev/null
```
Expected: sem erros (saída vazia)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Metricas/MetricasPosts.jsx \
        frontend/src/components/Metricas/MetricasReels.jsx \
        frontend/src/components/Metricas/MetricasStories.jsx \
        frontend/src/components/Metricas/shared/MetricasTipoView.jsx \
        frontend/src/components/Metricas/shared/useTipoMetricas.js
git commit -m "$(cat <<'EOF'
refactor(metricas): extrair MetricasTipoView + useTipoMetricas das 3 abas

MetricasPosts, MetricasReels e MetricasStories tinham 95% do mesmo código
(state, useEffect com Promise.all, ViewToggle, render KPIs+cards/tabela).
Cada um vira wrapper de ~12 linhas que define KPIs + labels e delega.

Mantém paridade exata com comportamento atual — sort dropdown vem na próxima
feita. Hook já chama backend com ?tipo= e ?ordenar= novos (default
'engajamento') — Task seguinte expõe controle de UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Frontend — `SortDropdown` + integração

**Sub-tema D do spec.** Criar componente `SortDropdown` clássico (trigger + menu vertical com checkmark), expor opções por tipo em `constants.js`, integrar no `MetricasTipoView` e propagar pra URL via `useSearchParams`.

**Files:**
- Create: `frontend/src/components/Metricas/shared/SortDropdown.jsx`
- Modify: `frontend/src/components/Metricas/shared/constants.js` (adiciona ORDER_OPTIONS_*)
- Modify: `frontend/src/components/Metricas/shared/useTipoMetricas.js` (lê ordenar do searchParams)
- Modify: `frontend/src/components/Metricas/shared/MetricasTipoView.jsx` (renderiza dropdown)
- Modify: `frontend/src/components/Metricas/MetricasPosts.jsx` (passa orderOptions + defaultOrdenar)
- Modify: `frontend/src/components/Metricas/MetricasReels.jsx` (idem)
- Modify: `frontend/src/components/Metricas/MetricasStories.jsx` (idem)

- [ ] **Step 1: Adicionar ORDER_OPTIONS_* em `constants.js`**

Editar `frontend/src/components/Metricas/shared/constants.js`. Adicionar no fim do arquivo:

```javascript
// Opções de ordenação por aba — keys batem com ?ordenar= do backend
export const ORDER_OPTIONS_FEED = [
  { key: 'engajamento', label: 'Mais engajados' },
  { key: 'recente', label: 'Mais recentes' },
  { key: 'curtidas', label: 'Mais curtidos' },
  { key: 'comentarios', label: 'Mais comentados' },
  { key: 'salvamentos', label: 'Mais salvos' },
  { key: 'compartilhamentos', label: 'Mais compartilhados' },
  { key: 'alcance', label: 'Maior alcance' },
]

export const ORDER_OPTIONS_REELS = [
  { key: 'engajamento', label: 'Mais engajados' },
  { key: 'recente', label: 'Mais recentes' },
  { key: 'curtidas', label: 'Mais curtidos' },
  { key: 'comentarios', label: 'Mais comentados' },
  { key: 'salvamentos', label: 'Mais salvos' },
  { key: 'compartilhamentos', label: 'Mais compartilhados' },
  { key: 'alcance', label: 'Maior alcance' },
]

export const ORDER_OPTIONS_STORIES = [
  { key: 'recente', label: 'Mais recentes' },
  { key: 'alcance', label: 'Maior alcance' },
  { key: 'replies', label: 'Mais replies' },
  { key: 'exits', label: 'Mais exits' },
]
```

- [ ] **Step 2: Criar componente `SortDropdown`**

Criar `frontend/src/components/Metricas/shared/SortDropdown.jsx`:

```jsx
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Check } from 'lucide-react'

/**
 * Dropdown clássico de ordenação.
 *
 * Props:
 * - value: chave atual (string)
 * - onChange: (key) => void
 * - options: [{ key, label }]
 * - accent: cor de destaque (hex)
 */
export default function SortDropdown({ value, onChange, options, accent = '#C9A84C' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = options.find(o => o.key === value) || options[0]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs font-semibold rounded-lg px-3 py-2 cursor-pointer"
        style={{
          background: 'var(--flg-bg-raised)',
          border: `1px solid ${accent}30`,
          color: 'var(--flg-text)',
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>Ordenar:</span>
        <span>{current.label}</span>
        <ChevronDown size={12} className="opacity-50" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 z-50 rounded-xl overflow-hidden min-w-[200px]"
            style={{
              background: 'var(--flg-bg-raised)',
              border: `1px solid ${accent}30`,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div className="py-1">
              {options.map(opt => {
                const active = opt.key === value
                return (
                  <button
                    key={opt.key}
                    onClick={() => { onChange(opt.key); setOpen(false) }}
                    className="w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors"
                    style={{
                      color: active ? accent : 'var(--flg-text)',
                      background: active ? `${accent}10` : 'transparent',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--flg-bg-hover)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span>{opt.label}</span>
                    {active && <Check size={12} />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 3: Atualizar `useTipoMetricas` pra ler/escrever `?ordenar=`**

Editar `frontend/src/components/Metricas/shared/useTipoMetricas.js`. Substituir o arquivo inteiro por:

```javascript
import { useState, useEffect, useCallback } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { api } from '../../../lib/api'

/**
 * Hook compartilhado pelas abas Posts/Reels/Stories.
 * Lê ?ordenar= do searchParams (ou usa defaultOrdenar). Expõe setOrdenar
 * que atualiza a URL.
 */
export function useTipoMetricas({ tipoBackend, tipoFiltroPostFE, defaultOrdenar = 'engajamento' }) {
  const { clienteId, periodo, platform, platConfig } = useOutletContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [posts, setPosts] = useState([])

  const ordenar = searchParams.get('ordenar') || defaultOrdenar

  const setOrdenar = useCallback((newOrdenar) => {
    const sp = new URLSearchParams(searchParams)
    sp.set('ordenar', newOrdenar)
    setSearchParams(sp, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!clienteId) return
    setLoading(true)
    setOverview(null)
    Promise.all([
      api(`/metricas/${clienteId}/overview?plataforma=${platform}&dias=${periodo}&tipo=${tipoBackend}`),
      api(`/metricas/${clienteId}/posts?plataforma=${platform}&limit=24&tipo=${tipoBackend}&ordenar=${ordenar}`),
    ]).then(([ov, po]) => {
      setOverview(ov)
      const all = po.posts || []
      const filtered = tipoFiltroPostFE
        ? all.filter(p => tipoFiltroPostFE.includes(p.tipo))
        : all
      setPosts(filtered)
    }).catch(console.error).finally(() => setLoading(false))
  }, [clienteId, periodo, platform, tipoBackend, ordenar])

  return { clienteId, periodo, platform, platConfig, loading, overview, posts, ordenar, setOrdenar }
}
```

- [ ] **Step 4: Atualizar `MetricasTipoView` pra renderizar `SortDropdown`**

Editar `frontend/src/components/Metricas/shared/MetricasTipoView.jsx`. Substituir o arquivo inteiro por:

```jsx
import { useState } from 'react'
import { KpiGridSkeleton, PostsGridSkeleton, PostsTable, ViewToggle } from '../../MetricasParts'
import KpiCard from './KpiCard'
import PostCard from './PostCard'
import SortDropdown from './SortDropdown'
import { KPI_WEIGHT } from './constants'
import { useTipoMetricas } from './useTipoMetricas'

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-3">{children}</h2>
}

/**
 * View compartilhada das abas Posts/Reels/Stories.
 *
 * Props:
 * - tipoBackend: 'feed' | 'reels' | 'story'
 * - tipoFiltroPostFE: array de tipos válidos pro filtro frontend de segurança
 * - kpisDef: lista de defs de KPI
 * - kpiSkelCount: quantos skeletons mostrar
 * - sectionTitle: título da seção de KPIs
 * - listTitle: título da lista de posts
 * - emptyMessage: texto quando não tem post
 * - orderOptions: array de { key, label } com opções de ordenação
 * - defaultOrdenar: chave default da ordenação (quando URL não tem ?ordenar=)
 */
export default function MetricasTipoView({
  tipoBackend,
  tipoFiltroPostFE,
  kpisDef,
  kpiSkelCount = 7,
  sectionTitle,
  listTitle,
  emptyMessage,
  orderOptions,
  defaultOrdenar = 'engajamento',
}) {
  const { periodo, platform, platConfig, loading, overview, posts, ordenar, setOrdenar } = useTipoMetricas({
    tipoBackend,
    tipoFiltroPostFE,
    defaultOrdenar,
  })
  const [postsView, setPostsView] = useState('cards')

  if (loading) {
    return (
      <div className="space-y-6">
        <KpiGridSkeleton count={kpiSkelCount} />
        <PostsGridSkeleton />
      </div>
    )
  }
  if (!overview) return null

  const kpis = overview.kpis
  const winner = kpisDef.reduce((best, d) => {
    if (d.noDelta) return best
    const dl = kpis[d.key]?.delta_pct
    if (dl == null || dl <= 0) return best
    const score = dl * (KPI_WEIGHT[d.key] || 1)
    if (!best || score > best.score) return { key: d.key, delta: dl, score }
    return best
  }, null)

  return (
    <>
      <section>
        <SectionTitle>{sectionTitle} — últimos {periodo} dias</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {kpisDef.map((def) => {
            const kpi = kpis[def.key]
            if (!kpi) return null
            return (
              <KpiCard
                key={def.key}
                icon={def.icon}
                label={def.label}
                value={kpi.valor || 0}
                decimals={def.decimals || 0}
                suffix={def.suffix || ''}
                delta={def.noDelta ? undefined : kpi.delta_pct}
                color={platConfig.color}
                highlight={winner?.key === def.key}
              />
            )
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <SectionTitle>{listTitle}</SectionTitle>
          <div className="flex items-center gap-2">
            <SortDropdown
              value={ordenar}
              onChange={setOrdenar}
              options={orderOptions}
              accent={platConfig.color}
            />
            <ViewToggle value={postsView} onChange={setPostsView} accent={platConfig.color} />
          </div>
        </div>
        {posts.length === 0 ? (
          <p className="text-white/40 text-xs">{emptyMessage}</p>
        ) : postsView === 'cards' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.slice(0, 9).map((post, i) => <PostCard key={post.id} post={post} rank={i} platform={platform} />)}
          </div>
        ) : (
          <PostsTable posts={posts} accent={platConfig.color} />
        )}
      </section>
    </>
  )
}
```

- [ ] **Step 5: Passar `orderOptions` + `defaultOrdenar` em `MetricasPosts.jsx`**

Editar `frontend/src/components/Metricas/MetricasPosts.jsx`:

```jsx
import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_FEED, ORDER_OPTIONS_FEED } from './shared/constants'

export default function MetricasPosts() {
  return (
    <MetricasTipoView
      tipoBackend="feed"
      tipoFiltroPostFE={['IMAGE', 'CAROUSEL', 'VIDEO']}
      kpisDef={KPIS_FEED}
      kpiSkelCount={7}
      sectionTitle="Posts (Feed)"
      listTitle="Lista de posts"
      emptyMessage="Nenhum post no período."
      orderOptions={ORDER_OPTIONS_FEED}
      defaultOrdenar="engajamento"
    />
  )
}
```

- [ ] **Step 6: Passar `orderOptions` + `defaultOrdenar` em `MetricasReels.jsx`**

Editar `frontend/src/components/Metricas/MetricasReels.jsx`:

```jsx
import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_REELS, ORDER_OPTIONS_REELS } from './shared/constants'

export default function MetricasReels() {
  return (
    <MetricasTipoView
      tipoBackend="reels"
      tipoFiltroPostFE={['REEL']}
      kpisDef={KPIS_REELS}
      kpiSkelCount={9}
      sectionTitle="Reels"
      listTitle="Lista de Reels"
      emptyMessage="Nenhum Reel no período."
      orderOptions={ORDER_OPTIONS_REELS}
      defaultOrdenar="engajamento"
    />
  )
}
```

- [ ] **Step 7: Passar `orderOptions` + `defaultOrdenar` em `MetricasStories.jsx`**

Editar `frontend/src/components/Metricas/MetricasStories.jsx`:

```jsx
import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_STORIES, ORDER_OPTIONS_STORIES } from './shared/constants'

export default function MetricasStories() {
  return (
    <MetricasTipoView
      tipoBackend="story"
      tipoFiltroPostFE={['STORY']}
      kpisDef={KPIS_STORIES}
      kpiSkelCount={7}
      sectionTitle="Stories"
      listTitle="Stories ativas (24h) e recentes"
      emptyMessage="Nenhum Story no período."
      orderOptions={ORDER_OPTIONS_STORIES}
      defaultOrdenar="recente"
    />
  )
}
```

- [ ] **Step 8: Validar bundle**

Run:
```bash
frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx \
  frontend/src/components/Metricas/shared/SortDropdown.jsx \
  frontend/src/components/Metricas/shared/MetricasTipoView.jsx \
  frontend/src/components/Metricas/shared/useTipoMetricas.js \
  frontend/src/components/Metricas/MetricasPosts.jsx \
  frontend/src/components/Metricas/MetricasReels.jsx \
  frontend/src/components/Metricas/MetricasStories.jsx > /dev/null
```
Expected: sem erros (saída vazia)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/Metricas/shared/SortDropdown.jsx \
        frontend/src/components/Metricas/shared/MetricasTipoView.jsx \
        frontend/src/components/Metricas/shared/useTipoMetricas.js \
        frontend/src/components/Metricas/shared/constants.js \
        frontend/src/components/Metricas/MetricasPosts.jsx \
        frontend/src/components/Metricas/MetricasReels.jsx \
        frontend/src/components/Metricas/MetricasStories.jsx
git commit -m "$(cat <<'EOF'
feat(metricas): dropdown de ordenação nas abas Posts/Reels/Stories

SortDropdown clássico (trigger + menu vertical, checkmark na opção ativa,
animação framer-motion). Persiste seleção em ?ordenar= na URL.

Defaults: Posts=engajamento, Reels=engajamento, Stories=recente.
Cada aba tem seu set próprio (Stories não tem 'engajamento' nem 'curtidas').

Backend já aceitava ?ordenar= desde a task anterior — agora a UI usa.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Smoke test manual após deploy

Deploy é automático em push pra `main` via `.github/workflows/deploy.yml`. Após Task 5 commitada e pushada:

1. **Demografia (aba Geral):**
   - Abrir `/metricas/{cliente_real}/geral` (cliente conectado, com sync recente)
   - Verificar gráfico Gênero × Idade renderizado com Recharts (barras rosa+azul agrupadas, números acima)
   - Top Países: top 10, mini-rank #1 ouro / #2 prata / #3 bronze, total formato `12.4K`
   - Top Cidades: idem
   - Caso a Meta API ainda não tenha rodado o novo breakdown (sync semanal toda segunda), o gráfico mostra mensagem "Sem dados de cruzamento". Pra forçar sync agora: clicar "Sincronizar agora" no header — `_sync_demographics` só roda em `_is_weekly_sync_day()` (segundas), então pode precisar setar manualmente ou aguardar.

2. **Filtros (abas Posts/Reels/Stories):**
   - Trocar entre opções do dropdown — lista de posts muda visivelmente
   - URL atualiza (`?ordenar=curtidas` aparece)
   - Trocar de aba (Posts → Reels → Stories) — default da aba aplica (Stories abre em "recente")
   - Refresh da página com `?ordenar=` na URL — preserva seleção
   - Testar com cliente sem dados ("emptyMessage" aparece)

3. **Refactor (paridade visual):**
   - Cards/Tabela toggle ainda funciona nas 3 abas
   - KPIs renderizam igual antes (KPIS_FEED/REELS/STORIES preservados)
   - Tab destacada ainda funciona (não mexemos no Layout)

## Riscos conhecidos

1. **`_sync_demographics` só roda segundas** — Pedro pode precisar esperar até segunda-feira pra ver dados age × gender preenchidos no Live, OU forçar sync manual e remover guard `_is_weekly_sync_day()` temporariamente. Não está no escopo dessa Phase mexer no scheduler.

2. **Coluna `media_product_type` pode não existir em `instagram_posts`** — verificar no Step 5 da Task 3. Se não existir, usar fallback Python-side já documentado no plano.

3. **Backend `?ordenar=` sobre todo histórico pode ficar lento** — sem índices nas colunas `(cliente_id, taxa_engajamento)`, `(cliente_id, posted_at)` etc. Adicionar índices fora desse plano (precisa rodar SQL no Supabase porque VPS não tem IPv6 — ver `~/.claude/projects/.../memory/vps_supabase_ipv6_issue.md`). Medir performance primeiro com cliente real grande.

4. **Refactor da Task 4 pode quebrar comportamento sutil** — comparar visualmente as 3 abas antes/depois do merge. Se quebrar, reverter Task 4+5 commits e refazer com mais cuidado.
