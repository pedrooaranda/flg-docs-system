# Métricas V3 — Phase 3: Filtros de posts + Demografia decente

**Data:** 2026-04-29
**Escopo:** Phase 3 do redesign do Dashboard. Sub-temas A (filtros de posts) + C (demografia gênero × idade). Sub-tema B (sub-página "Todos os posts") e D (polish UI shadcn/radix) ficam pra próximas rodadas.

## Problema

Dois problemas independentes que ficaram pra essa fase:

### 1. Demografia gênero × idade nunca funcionou

Pedro reclamou na Phase 1: "aquele gráfico não tá exibindo, só tá mostrando que 53% masculino e 47% feminino, mas não tá mostrando em relação a gênero e idade".

Investigação revelou: o componente frontend `GenderAgeChart` em `MetricasParts.jsx:596` espera keys `F.18-24`, `M.25-34` etc. Mas o backend em `instagram_sync.py:_sync_demographics` chama Meta API com **breakdowns separados** (`age` sozinho, `gender` sozinho). Resultado:

- breakdown=`age` cria keys `U.18-24` (Unknown gender) — porque sem gender o agregador grava `U.`
- breakdown=`gender` cria keys `F`, `M`, `U` agregados sem idade

O cruzamento age × gender **nunca foi puxado**. A Meta API aceita breakdown CSV (`breakdown=age,gender`) que retorna `dimension_values: ["18-24", "F"]`. Bug crônico desde o começo, não regressão.

Além do bug de dados, o gráfico atual é estilo "borboleta" com barras finas (h-3.5) e sem números visíveis. Pedro topou também redesenhar.

### 2. Posts/Reels/Stories sem ordenação útil

Hoje `MetricasPosts.jsx`, `MetricasReels.jsx` e `MetricasStories.jsx` chamam `/posts?limit=24` e mostram os 9 primeiros em cards (ordem do backend = mais recentes). O modo Tabela (`PostsTable`) tem sort por coluna mas só sobre os 24 carregados.

Limitação real: se o cliente publicou um post viral há 60 dias e 24 posts médios nas últimas 2 semanas, esse post viral **nunca aparece** no dashboard — não foi carregado. O consultor precisa "ver os posts mais engajados do cliente nos últimos 90d", não "os mais engajados entre os 24 mais recentes".

## Solução

### A) Bug fix demografia (backend)

`backend/services/instagram_sync.py` → `_sync_demographics`. Adicionar quinta chamada à Meta com `breakdown=age,gender`:

```python
DEMO_BREAKDOWNS = ["age", "gender", "country", "city", "age,gender"]
```

Função nova `_merge_age_gender_breakdown(agg, results)` que escreve keys `F.18-24`, `M.25-34` etc. As 4 chamadas existentes ficam — `gender` ainda alimenta os totais agregados `F`/`M` que o frontend mostra no header do gráfico.

A Meta API retorna `dimension_values: ["18-24", "F"]` (ordem age, gender). Função:

```python
def _merge_age_gender_breakdown(agg: dict, results: list):
    for r in results:
        dims = r.get("dimension_values", [])
        if len(dims) < 2:
            continue
        age, gender = dims[0], dims[1]
        if gender not in ("F", "M", "U"):
            continue
        key = f"{gender}.{age}"
        val = int(r.get("value") or 0)
        agg["genero_idade"][key] = agg["genero_idade"].get(key, 0) + val
```

Não muda schema do DB — `instagram_demografia.genero_idade` é JSONB e já comporta as keys cruzadas.

### B) Demografia UI redesign (frontend)

`frontend/src/components/MetricasParts.jsx`:

**`GenderAgeChart`** — substituir borboleta CSS por **Recharts BarChart vertical**:
- Eixo X: faixas etárias (`13-17`, `18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+`)
- 2 barras agrupadas por faixa: `F` (rosa `#F472B6`) + `M` (azul `#60A5FA`)
- Valores absolutos visíveis acima de cada barra (`<LabelList>`)
- Tooltip rico com `<ChartTooltip>` (componente já existe em MetricasGeral)
- Header mantém percentuais agregados `F xx% / M yy%`
- Skeleton mantido pra loading

**`CountryBars`** — refinar:
- Top 10 (era 6)
- Mini-rank colorido nos primeiros 3 (`#1` dourado, `#2` prata, `#3` bronze)
- Total formatado em `pt-BR` com sufixo K (ex: `12.4K`) — já existe `formatNum` mas só faz `toLocaleString`. Adicionar helper `formatCompact(n)` que retorna `1.2K`, `34M` etc.
- Mantém bandeirinha emoji + `COUNTRY_NAMES`

**`CityBars`** — refinar idêntico ao CountryBars:
- Top 10 (era 8)
- Mini-rank colorido nos 3 primeiros
- Total formatado compacto
- Sem bandeirinha (cidade não tem)

Renderização permanece em `MetricasGeral` (aba Geral) — não duplica em Posts/Reels/Stories. Demografia é da audiência inteira, não específica por tipo de post.

### C) Filtros backend (`?ordenar=`)

`backend/routes/metricas.py` → endpoint `/metricas/{cliente_id}/posts` aceita 2 novos query params:

```
GET /metricas/{cliente_id}/posts?plataforma=instagram&limit=24&tipo=feed&ordenar=engajamento
```

- `tipo=all|feed|reels|story` — filtra por categoria de mídia (hoje frontend que filtra)
  - `feed` → `tipo IN ('IMAGE', 'CAROUSEL', 'VIDEO')`
  - `reels` → `tipo = 'REEL'`
  - `story` → `tipo = 'STORY'`
  - `all` (default) → sem filtro
- `ordenar=` — ordenação sobre todo histórico do cliente, antes de aplicar `limit`:
  - `engajamento` (default) → `taxa_engajamento DESC`
  - `recente` → `publicado_em DESC`
  - `curtidas` → `curtidas DESC`
  - `comentarios` → `comentarios DESC`
  - `salvamentos` → `salvamentos DESC`
  - `compartilhamentos` → `compartilhamentos DESC`
  - `alcance` → `alcance DESC`
  - `replies` → `replies_total DESC` (Stories)
  - `exits` → `exits_total DESC` (Stories)

Validação: `ordenar` inválido retorna 400 com lista das opções válidas.

`backend/services/instagram.py` → `LiveInstagramRepository.get_posts(cliente_id, limit, tipo='all', ordenar='engajamento')`. Query Supabase:

```python
column_map = {
    "engajamento": "taxa_engajamento",
    "recente": "publicado_em",
    "curtidas": "curtidas",
    "comentarios": "comentarios",
    "salvamentos": "salvamentos",
    "compartilhamentos": "compartilhamentos",
    "alcance": "alcance",
    "replies": "replies_total",
    "exits": "exits_total",
}
q = sb.table("instagram_posts").select("*").eq("cliente_id", cliente_id)
if tipo == "feed":
    q = q.in_("tipo", ["IMAGE", "CAROUSEL", "VIDEO"])
elif tipo in ("reels", "story"):
    q = q.eq("tipo", "REEL" if tipo == "reels" else "STORY")
q = q.order(column_map[ordenar], desc=True).limit(limit)
```

Mock também aceita os params (com `**kwargs` se preferível) — retorna ordenado de mentirinha.

### D) Filtros frontend (dropdown clássico)

Componente novo: `frontend/src/components/Metricas/shared/SortDropdown.jsx`.

```jsx
<SortDropdown
  value={ordenar}                    // 'engajamento'
  onChange={setOrdenar}
  options={ORDER_OPTIONS_FEED}       // [{ key: 'engajamento', label: 'Mais engajados' }, ...]
  accent={platConfig.color}
/>
```

UI: trigger com texto `Ordenar: Mais engajados ▼`, abre menu vertical. Opção ativa com checkmark + cor accent. Click-outside fecha. Animação suave (framer-motion como o `DateRangePicker` já usa).

Constantes em `shared/constants.js`:

```js
export const ORDER_OPTIONS_FEED = [
  { key: 'engajamento', label: 'Mais engajados' },
  { key: 'recente', label: 'Mais recentes' },
  { key: 'curtidas', label: 'Mais curtidos' },
  { key: 'comentarios', label: 'Mais comentados' },
  { key: 'salvamentos', label: 'Mais salvos' },
  { key: 'compartilhamentos', label: 'Mais compartilhados' },
  { key: 'alcance', label: 'Maior alcance' },
]

export const ORDER_OPTIONS_REELS = [...] // mesmo set
export const ORDER_OPTIONS_STORIES = [
  { key: 'recente', label: 'Mais recentes' },
  { key: 'alcance', label: 'Maior alcance' },
  { key: 'replies', label: 'Mais replies' },
  { key: 'exits', label: 'Mais exits' },
]
```

Defaults por aba:
- Posts → `engajamento`
- Reels → `engajamento`
- Stories → `recente`

Filtro persiste na URL: `/metricas/:id/posts?dias=30&ordenar=curtidas`. Implementação via `useSearchParams` (padrão já usado pra `dias`).

Cada aba tem seu próprio filtro — trocar de aba **não preserva** a ordenação (default do tipo aplica). Razão: stories e feed têm sets diferentes de opções, e "mais engajados" em Stories nem existe.

### E) Refactor: hook + componente compartilhado

Os 3 arquivos `MetricasPosts.jsx`, `MetricasReels.jsx`, `MetricasStories.jsx` repetem 95% do código (state, useEffect com Promise.all, ViewToggle, render de KPIs, render de cards/tabela). Phase 3 é boa oportunidade pra extrair antes de adicionar mais lógica em cima.

Estrutura nova:

```
shared/
  useTipoMetricas.js      # hook que faz fetch + state
  MetricasTipoView.jsx    # componente que renderiza KPIs + lista de posts
  SortDropdown.jsx        # novo (item D)
```

`useTipoMetricas(clienteId, periodo, platform, tipo, ordenar)` retorna `{ loading, overview, posts, kpis, winner }`.

`MetricasTipoView({ kpis: KPIS_FEED, orderOptions: ORDER_OPTIONS_FEED, defaultOrdenar, sectionTitle, sectionSubtitle, tipo, emptyMessage })` renderiza tudo.

Cada arquivo de aba vira ~25 linhas:

```jsx
// MetricasPosts.jsx
import MetricasTipoView from './shared/MetricasTipoView'
import { KPIS_FEED, ORDER_OPTIONS_FEED } from './shared/constants'

export default function MetricasPosts() {
  return (
    <MetricasTipoView
      tipo="feed"
      kpisDef={KPIS_FEED}
      orderOptions={ORDER_OPTIONS_FEED}
      defaultOrdenar="engajamento"
      sectionTitle="Posts (Feed)"
      listTitle="Lista de posts"
      emptyMessage="Nenhum post no período."
    />
  )
}
```

3 × 90 = 270 linhas viram 3 × 25 + 1 hook (~40) + 1 view (~120) = 235 linhas, com lógica deduplicada e ponto único pra adicionar features futuras (ex: sub-página B na próxima rodada).

## Out of scope

- **Sub-página "Todos os posts"** (sub-tema B) — fica pra próxima rodada. A refatoração em E facilita esse trabalho depois.
- **Polish geral com shadcn/radix** (sub-tema D) — fica pra próxima rodada. Dropdown dessa fase é implementação manual com framer-motion seguindo padrão do `DateRangePicker`.
- **Mapa-mundi de países** — descartado (90%+ dos clientes têm audiência majoritariamente brasileira; mapa vira BR escuro + resto cinza).
- **Cruzamento gênero × país/cidade** — Meta API não disponibiliza esse breakdown.

## Riscos e mitigações

1. **Meta pode rejeitar `breakdown=age,gender`** se a audiência for pequena (<100 pessoas em algum bucket). Mitigação: a chamada está num `try/except` que registra `api_message` e segue. Frontend mostra Skel + "sem dados suficientes" quando vazio. Comportamento atual já é resiliente assim.

2. **`?ordenar=` sobre todo histórico pode ser lento** se cliente tem 5000+ posts. Mitigação: índices Supabase em `(cliente_id, taxa_engajamento)`, `(cliente_id, publicado_em)` etc. Hoje só tem `(cliente_id)`. Adicionar índices via migration manual (lembrando que VPS não tem IPv6 — Pedro roda no SQL Editor do Supabase). Ou adicionar `LIMIT` interno antes do sort se ficar lento na prática (medir primeiro).

3. **Refactor E pode introduzir regressão** nas 3 abas. Mitigação: validação manual em cada aba pós-merge (visualmente). Sem suite de testes nessa repo, mas py_compile + esbuild bundle check pega erro de sintaxe.

## Validação

- `python3 -m py_compile backend/services/instagram_sync.py backend/services/instagram.py backend/routes/metricas.py`
- `frontend/node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx frontend/src/components/Metricas/**/*.jsx`
- Manual: trocar entre as 3 abas, mudar ordenação, ver se posts mudam coerentemente; abrir aba Geral, ver gráfico demografia preenchido (se cliente tem dados suficientes); ver top países/cidades em formato refinado.

## Arquivos afetados

```
backend/
  routes/metricas.py              # novo: /posts aceita ?ordenar= e ?tipo=
  services/instagram.py           # LiveInstagramRepository.get_posts(...) reescrito
  services/instagram_sync.py      # _sync_demographics + _merge_age_gender_breakdown

frontend/src/components/
  MetricasParts.jsx               # GenderAgeChart reescrito (Recharts), CountryBars/CityBars refinados
  Metricas/
    MetricasPosts.jsx             # vira ~25 linhas usando MetricasTipoView
    MetricasReels.jsx             # idem
    MetricasStories.jsx           # idem
    shared/
      constants.js                # ORDER_OPTIONS_FEED/REELS/STORIES
      SortDropdown.jsx            # NOVO
      MetricasTipoView.jsx        # NOVO
      useTipoMetricas.js          # NOVO
```
