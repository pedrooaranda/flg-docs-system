# Reuniões da Jornada — Decks HTML com Design System + IA

**Data:** 2026-05-12
**Autor:** Brainstorm Pedro × Claude
**Status:** Aprovado pra implementação (decisões 1-6 confirmadas)

---

## Contexto e motivação

O sistema FLG já tem `encontros_base` (10 encontros nº 5-15) com `intelecto_base` em texto livre — usado hoje só como referência teórica em chat com Claude na aba "Preparação do Encontro". Não há produção de deck visual: consultores fazem slides manualmente fora do sistema, sem padrão.

A pasta `flg-design-system/` (adicionada à raiz em 2026-05-12) traz CSS unificado + slide engine JS + templates HTML 16:9 prontos para produção de decks sóbrios (preto+dourado). Vamos conectar isso à preparação de reuniões: cada encontro vira um **deck HTML** composto de **parte intelectual fixa** (mesmo conteúdo pra todos os clientes, escrito pelo Pedro) + **parte prática personalizada** (gerada via chat consultor↔Claude por cliente).

Resultado final: consultor abre uma URL fullscreen na hora da reunião e apresenta o deck pronto, sem PDF, sem PowerPoint, sem manutenção manual.

---

## Decisões de design aprovadas

1. **Document_template antigo arquivado** em `docs/archive/document_template-v0/` (redundante com flg-design-system).
2. **Sub-rotas `/materiais/diarios` e `/materiais/reunioes`** (não tabs internas — URL bookmarkable).
3. **HTML armazenado no DB** (`encontros_base.html_intelecto` + nova tabela `encontros_pratica`).
4. **Formato simples pra Pedro escrever a parte intelectual:**
   ```
   SLIDE 1
   [Título]
   [Conteúdo]

   SLIDE 2
   [Título]
   [Conteúdo]
   ```
   Sistema converte esse texto em HTML do design system via Claude (com prompt caching).
5. **Apresentação fullscreen via slug público no domínio da VPS** — `https://docs.foundersledgrowth.online/apresentar/:slug`. Sem auth (slug é a credencial). Slug pode ser revogado pelo consultor.
6. **Modelo Claude Sonnet 4.6** (custo/velocidade ótimos pra HTML estruturado). Parametrizado em env var.

---

## Arquitetura

### Visão de fluxo

```
┌─────────────────────┐
│  ADMIN (Pedro)      │
│  Intelecto FLG      │ → escreve texto formato "SLIDE N / Título / Conteúdo"
│  por encontro       │ → click "Gerar HTML do Design System"
│                     │ → Claude converte texto → HTML válido (cached)
│                     │ → preview + edit raw HTML se quiser
│                     │ → salva em encontros_base.html_intelecto
└─────────────────────┘

┌─────────────────────┐
│  CONSULTOR          │
│  /materiais/        │ → grid: clientes × encontros 5-15
│  reunioes           │ → click "Preparar Encontro 9 — Charles Feijó"
│                     │
│  Editor split:      │ → ESQUERDA: preview intelectual (HTML fixo)
│  intelecto vs       │ → DIREITA: chat com Claude — descreve cliente,
│  chat prática       │   Claude gera HTML prática slide a slide
│                     │ → consultor refina ("regenera slide 4...")
│                     │ → click "Pronto pra apresentar"
│                     │   → gera slug + status='pronto'
└─────────────────────┘

┌─────────────────────┐
│  APRESENTAÇÃO       │
│  /apresentar/:slug  │ → URL pública, sem auth
│  (nova guia)        │ → backend monta HTML: intelectual + prática
│                     │   + carrega flg-design-system/css/flg.css
│                     │   + flg-design-system/js/flg-deck.js
│                     │ → consultor apresenta em fullscreen
│                     │ → setas/swipe/espaço navegam
└─────────────────────┘
```

### Modelo de dados

```sql
-- Migration 005

-- 1. encontros_base ganha campo de HTML pronto + fonte ("source of truth" textual)
ALTER TABLE encontros_base
  ADD COLUMN intelecto_estrutura TEXT,           -- formato simples "SLIDE N / Título / Conteúdo"
  ADD COLUMN html_intelecto TEXT,                -- HTML renderizado do estrutura via Claude
  ADD COLUMN num_slides_intelecto INT DEFAULT 0, -- count cached pra UI
  ADD COLUMN html_gerado_at TIMESTAMPTZ;         -- timestamp da última geração

-- 2. Nova tabela: parte prática personalizada por cliente
CREATE TABLE encontros_pratica (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clientes(id) ON DELETE CASCADE,
  encontro_numero INT NOT NULL,

  -- Chat history consultor ↔ Claude (input do consultor + perguntas + refinamentos)
  conversa_chat JSONB NOT NULL DEFAULT '[]',  -- [{role, content, ts}]

  -- HTML gerado (pode ser regenerado várias vezes)
  html_pratica TEXT,
  num_slides_pratica INT DEFAULT 0,

  -- Slug público pra apresentação (revogável)
  slug TEXT UNIQUE,
  slug_gerado_at TIMESTAMPTZ,
  slug_revogado_at TIMESTAMPTZ,

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','gerando','pronto','apresentado','arquivado')),

  -- Audit
  consultor_email TEXT NOT NULL,
  ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
  apresentado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(cliente_id, encontro_numero)
);

CREATE INDEX idx_encontros_pratica_cliente ON encontros_pratica(cliente_id);
CREATE INDEX idx_encontros_pratica_slug ON encontros_pratica(slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_encontros_pratica_status ON encontros_pratica(status);

ALTER TABLE encontros_pratica ENABLE ROW LEVEL SECURITY;

-- Policy SELECT autenticado (backend usa service role pra writes)
DROP POLICY IF EXISTS encontros_pratica_select ON encontros_pratica;
CREATE POLICY encontros_pratica_select ON encontros_pratica
  FOR SELECT TO authenticated USING (true);
```

### Backend — novos endpoints

```
─── Admin (Intelecto) ────────────────────────────────────
GET  /encontros/:numero                       — detalhe encontro + intelecto_estrutura + html_intelecto
POST /admin/encontros/:numero/intelecto       — admin salva texto-estrutura (apenas Pedro/owner)
POST /admin/encontros/:numero/gerar-html      — converte intelecto_estrutura → html_intelecto via Claude
                                                (idempotente; usa cache do design system no prompt)

─── Consultor (Reuniões) ─────────────────────────────────
GET  /reunioes/:cliente_id                    — lista status dos 10 encontros (5-15) deste cliente
GET  /reunioes/:cliente_id/:numero            — pratica do encontro N pra este cliente
                                                (cria registro rascunho se não existe)
POST /reunioes/:cliente_id/:numero/chat       — turno de chat com Claude (streaming SSE)
                                                grava em conversa_chat
POST /reunioes/:cliente_id/:numero/gerar      — pede pro Claude gerar HTML prática final
                                                a partir do conversa_chat acumulada
POST /reunioes/:cliente_id/:numero/marcar-pronto
                                              — status=pronto, gera slug random
POST /reunioes/:cliente_id/:numero/revogar    — slug_revogado_at=now (mantém histórico)

─── Apresentação pública ─────────────────────────────────
GET  /apresentar/:slug                        — HTML completo (intelectual+prática)
                                                sem auth. Retorna 404 se slug não existe ou foi revogado.
```

### Frontend — estrutura de pastas

```
frontend/src/components/
  Materiais/                              # NOVO (refactor do atual)
    index.jsx                             # layout + sub-rotas (espelha Métricas/Ranking)
    Diarios.jsx                           # UI atual de materiais_copy migrada pra cá
    Reunioes.jsx                          # grid clientes × encontros 5-15
    Reuniao/                              # /materiais/reunioes/:cid/:numero
      index.jsx                           # editor split (preview vs chat)
      PreviewIntelecto.jsx                # iframe do html_intelecto
      ChatGerador.jsx                     # chat consultor ↔ Claude com streaming
      ActionsBar.jsx                      # botões: Gerar, Pronto, Apresentar, Revogar
    shared/
      EncontroCard.jsx                    # card de encontro no grid
      formatters.js
      constants.js

  admin/
    IntelecFLG.jsx                        # evolução: ganha campo "Estrutura" + botão "Gerar HTML"
                                          # 2 tabs novas: "Estrutura (texto)" e "HTML preview"
```

### Frontend — rotas em App.jsx

```jsx
<Route path="/materiais" element={...}>
  <Route index element={<Navigate to="diarios" replace />} />
  <Route path="diarios" element={<MateriaisDiarios />} />
  <Route path="reunioes" element={<MateriaisReunioes />} />
  <Route path="reunioes/:clienteId/:encontroNumero" element={<EditorReuniao session={session} />} />
</Route>

{/* Apresentação fullscreen — fora do Layout/AuthGuard. Slug é a credencial */}
<Route path="/apresentar/:slug" element={<ApresentarDeck />} />
```

---

## Formato "estrutura" da parte intelectual

Pedro escreve no IntelecFLG num textarea simples:

```
SLIDE 1
A Jornada da Marca
Por que esse encontro define o tom do que vem depois.

SLIDE 2
Os 3 pilares
1. Identidade
2. Posicionamento
3. Voz

SLIDE 3
A travessia
O que separa quem é da marca de quem só fala dela.

...
```

**Regras do formato (super simples):**
- `SLIDE N` em linha própria — separador de slides
- Próxima linha = título do slide
- Linhas seguintes (até próximo `SLIDE`) = conteúdo
- Listas: linha começando com `1. ` `2. ` etc → vira `.entries`
- Linhas começando com `- ` → vira lista bullet
- Texto solto → vira `body-lg`
- Slide 1 sempre vira capa (template "deck-cover")
- Último slide vira fechamento (template "deck-closing")
- Intermediários viram conteúdo padrão

**Conversão é via Claude**, não regex determinística — Claude consegue inferir o melhor componente do design system pra cada slide (`.pillars` vs `.entries` vs `.stat-card`). Mas o admin pode editar HTML raw depois se quiser ajustar.

---

## Pipeline de geração com Claude (Sonnet 4.6)

### Geração do HTML intelectual (admin)

```
SYSTEM PROMPT (com cache_control pra economizar 90%):
<role>
Você é gerador de slides FLG Brasil. Produz HTML 100% válido seguindo o design system EXATO.
</role>

<design_system>
[INSERE flg-design-system/FLG-DESIGN-SYSTEM.md inteiro, ~13K tokens — cached]
</design_system>

<allowed_classes>
[Lista das classes extraídas do flg.css — ~80 classes, cached]
</allowed_classes>

<deck_template>
[INSERE flg-design-system/templates/deck-template.html inteiro — cached]
</deck_template>

<output_rules>
1. Retorne APENAS HTML válido. Sem markdown wrapper.
2. Use APENAS classes do allowed_classes.
3. Cada slide é uma <section class="slide" data-screen-label="...">.
4. Slide 1 sempre tem .stage-bg + .stage--center + logo FLG centralizada.
5. Slides intermediários: logo no canto via .flg-mark--corner.
6. Último slide: logo centralizada novamente + frase de fechamento.
7. Sem nome de cliente nos slides (este HTML é reutilizável).
8. Aplique as regras de copy: sem travessões, <em> dourado pra grifo, <strong> pra ênfase.
</output_rules>

USER PROMPT:
Converta esta estrutura de slides em HTML do deck-template.
Cada bloco SLIDE N abaixo vira uma <section class="slide">.

<estrutura>
{intelecto_estrutura do encontro}
</estrutura>

[PREFILL: <section class="slide" data-screen-label="01]
[STOP SEQUENCE: </body>]
```

Parâmetros: `model="claude-sonnet-4-6"`, `max_tokens=8000`, `temperature=0.3` (HTML estruturado, não criativo).

### Geração do HTML prática (consultor)

Diferente do admin — é **multi-turn chat** com Claude:

```
TURN 1 (consultor): "Charles Feijó travou na precificação. Cobra R$5k/mês,
                     concorrência baixou pra R$3k. Ele quer manter premium mas
                     está perdendo deals. Encontro 9, tema 'Posicionamento de preço'."

TURN 1 (Claude):    "Entendi. Pra construir os slides práticos preciso saber:
                     1. Qual o lifetime value médio do cliente do Charles?
                     2. O cliente que ele perdeu foi por preço só ou por valor percebido?
                     3. Quantos clientes ele tem hoje?"

TURN 2 (consultor): "1. ~R$60k. 2. Valor percebido — vendedor não sabe vender o método.
                     3. 18 clientes ativos."

TURN 2 (Claude):    "Beleza. Vou propor 5 slides práticos:
                     - Diagnóstico do problema (LTV vs ticket atual)
                     - O erro do mercado (corrida pra baixo)
                     - Ancoragem premium (3 técnicas aplicáveis ao caso)
                     - Roteiro de venda com novo posicionamento
                     - Próximos 30 dias

                     [GERA HTML preview embedded]"

TURN 3 (consultor): "Slide 3 muito teórico. Faz mais concreto, com exemplo do mercado dele."

TURN 3 (Claude):    "[Regenera só slide 3]"

→ Quando consultor click "Pronto pra apresentar":
  Backend salva html_pratica completo + gera slug
```

**System prompt do chat** inclui:
- Design system (cached)
- Intelecto do encontro N (não-cached, ~2K tokens) — pra Claude alinhar a prática com o intelectual
- Perfil do cliente (não-cached, ~1K tokens) — `clientes` row + última nota do consultor
- Restrição: "não use nome do cliente nos slides" (regra do Pedro reutilizar)

Streaming via SSE pra UI mostrar tokens chegando.

---

## Apresentação fullscreen

**Endpoint:** `GET /apresentar/:slug` (rota pública, sem AuthGuard).

**Lógica:**
1. Backend busca `encontros_pratica` por slug
2. Se não existe OU `slug_revogado_at IS NOT NULL` → 404
3. Junta `encontros_base.html_intelecto` + `encontros_pratica.html_pratica`
4. Monta resposta HTML completa:
   ```html
   <!DOCTYPE html>
   <html lang="pt-BR">
   <head>
     <link rel="stylesheet" href="/flg-design-system/css/flg.css">
     ... fonts, viewport, title
   </head>
   <body class="flg-deck" data-deck-id="encontro-9-charles">
     <canvas id="stage-canvas"></canvas>
     <div class="grain"></div>
     <div class="progress"><div class="progress-fill"></div></div>
     <div class="counter">...</div>
     <div class="nav-hint">← → · ESPAÇO · SWIPE</div>
     <button class="nav-arrows nav-prev">‹</button>
     <button class="nav-arrows nav-next">›</button>

     <div class="deck">
       <!-- HTML INTELECTUAL inserido aqui -->
       {html_intelecto}
       <!-- HTML PRÁTICA inserido aqui -->
       {html_pratica}
     </div>

     <script src="/flg-design-system/js/flg-deck.js"></script>
   </body>
   </html>
   ```
5. Serve com `Content-Type: text/html; charset=utf-8`

**Assets do design system:** servidos como arquivos estáticos pelo backend FastAPI (`StaticFiles` em `/flg-design-system/*`). Atualização do CSS reflete em todos os decks instantaneamente.

**Slug:** 12 chars random (`secrets.token_urlsafe(9)`), formato `slug = "abc123def456"`. Não usa nome do cliente — é credencial, não link semântico.

**Revogação:** consultor pode chamar `POST /reunioes/.../revogar` → `slug_revogado_at = now()`. Próxima visita ao slug retorna 404.

**Auto-marcação de "apresentado":** se URL acessada pela primeira vez fora do range IP do admin (heurística simples), `apresentado_at = now()` e status → 'apresentado'. Opcional — não bloquear apresentação. Phase futura.

---

## Decomposição em phases

| Phase | Escopo | Estimativa |
|---|---|---|
| **A1** | Schema migration 005 + endpoints admin GET/POST intelecto (estrutura textual e HTML) | ~3h |
| **A2** | Backend: serviço de geração HTML intelectual via Claude (Sonnet 4.6) com prompt caching do design system | ~4h |
| **A3** | IntelecFLG.jsx ganha 2 novas tabs: "Estrutura" (textarea formato simples) + "HTML" (preview + edit raw) + botão "Gerar HTML" | ~4h |
| **B1** | Refactor `Materiais.jsx` (atual) → `Materiais/` pasta com sub-rotas `/diarios` e `/reunioes`. `Diarios.jsx` = UI atual migrada (zero comportamento novo) | ~3h |
| **B2** | `Reunioes.jsx` — grid de clientes × encontros 5-15 com status (não iniciado / rascunho / pronto / apresentado) | ~3h |
| **C1** | Backend: endpoints chat (POST streaming SSE) + gerar HTML prática + marcar-pronto (com slug random) + revogar | ~5h |
| **C2** | Frontend `EditorReuniao` — layout split preview/chat, streaming Claude, regenerar slide específico | ~6h |
| **D1** | Backend: `GET /apresentar/:slug` montando HTML completo + servir assets do design system via StaticFiles | ~3h |
| **D2** | Frontend: botão "Apresentar" abre nova aba `/apresentar/:slug` em fullscreen | ~1h |
| **E** | Polish: empty states, status visual, "regerar slide N", copiar HTML, mobile-friendly (read-only quando mobile), auto-status 'apresentado' | ~4h |

**Total: ~36h.** É um stream paralelo à Phase 4 Colaboradores. Sugiro entregar Phases A primeiro (Intelecto admin funcional), depois B (skeleton consultor), depois C-D (chat + apresentação) — cada conjunto gera valor independente.

---

## Stack e dependências

- **Backend:** Anthropic SDK Python (já temos via `anthropic` no `requirements.txt`). FastAPI `StaticFiles` pra servir design system. `secrets.token_urlsafe` pra slugs.
- **Frontend:** React 18, Tailwind, React Router v6, lucide-react. Streaming via `fetch + ReadableStream` (sem dep extra).
- **AI:** Claude Sonnet 4.6 via Anthropic API. **Prompt caching** (`cache_control: ephemeral`) no system prompt — economiza ~90% do custo. Cache TTL 5min, suficiente pra múltiplas regenerações de um mesmo encontro.
- **DB:** Supabase Postgres (migration 005 manual via dashboard — padrão da repo).

---

## Trade-offs e alternativas consideradas

### Conversão texto→HTML: Claude vs parser determinístico
- **Escolhido:** Claude com cache do design system.
- **Razão:** Claude infere o melhor componente (`.pillars` vs `.entries` vs `.stat-card`) — parser regex faria escolhas pobres. Custo controlado por cache.
- **Risco:** HTML gerado pode usar classe inexistente → validação server-side em phase A2 (parsea DOM, checa whitelist).

### HTML armazenado no DB vs filesystem
- **Escolhido:** DB.
- **Razão:** Admin atualiza via UI sem precisar de deploy. Phase futura facilita backup/sync.
- **Trade-off:** filesystem seria git-versionado naturalmente. Mitigação: `intelecto_historico` já existe pra versionamento.

### Apresentação: nova aba vs embed
- **Escolhido:** nova aba (`window.open(/apresentar/:slug, '_blank')`).
- **Razão:** Slot inteiro de tela pra deck, sem chrome do app FLG distraindo. Permite apresentar de outro device só com link.

### Slug público vs auth
- **Escolhido:** público com slug random de 12 chars.
- **Razão:** Consultor abre em iPad/laptop sem login. Slug é não-enumerável (`secrets.token_urlsafe`). Revogável.
- **Risco:** se vazar, deck fica acessível. Mitigação: revogação manual + sem dados sensíveis nos slides (Pedro já regra "sem nome de cliente").

### Streaming chat: SSE vs WebSocket
- **Escolhido:** SSE (Server-Sent Events).
- **Razão:** Mais simples que WebSocket, suficiente pra streaming unidirecional Claude→frontend. Anthropic SDK suporta nativamente.

---

## Riscos identificados

1. **Claude pode gerar HTML inválido** (classe inventada, tag malformada). Mitigação: validação server-side parseando com `lxml`/`BeautifulSoup`, rejeitar se houver classe fora do allowlist OU tag fora de uma whitelist (section, div, h1-h6, p, em, strong, span, ul, ol, li, img). Em caso de rejeição: retry automático com mensagem de erro pro Claude na próxima chamada.

2. **Custo Claude pode escalar** com regenerações sucessivas. Mitigação: prompt caching reduz 90% (system prompt do design system + intelecto = ~15K tokens cached). Limit soft de regenerações por encontro (ex: 10 turnos de chat).

3. **VPS sem IPv6 → migration manual** — padrão da repo. Phase A1 inclui SQL pro Pedro rodar no Supabase Dashboard.

4. **Slugs colidindo** (improvável com `token_urlsafe(9)` = 72 bits de entropia). DB constraint UNIQUE captura caso aconteça → retry.

5. **HTML grande no DB** — cada deck ~30-60KB. Tabela `encontros_pratica` cresce linearmente com clientes × encontros = ~150 rows pra workspace típico. Sem problema.

6. **flg-deck.js precisa estar acessível pelos decks** — backend serve via FastAPI StaticFiles ou frontend Vite copia pro `dist/`. Recomendação: FastAPI StaticFiles, fora do bundle Vite (pra que slug público funcione mesmo se a SPA não carregar).

---

## Testing manual (UAT)

Por phase:

- **A1**: SQL aplicado no Supabase. `GET /encontros/5` retorna o registro com `intelecto_estrutura=null, html_intelecto=null` inicialmente.
- **A2**: `POST /admin/encontros/5/intelecto` com payload `{intelecto_estrutura: "SLIDE 1\nTeste\n..."}`. Em seguida `POST /admin/encontros/5/gerar-html` retorna HTML válido com `<section class="slide">` e classes do allowlist.
- **A3**: Admin abre `/admin/intelecto`, escolhe encontro 5, vai pra tab "Estrutura", escreve formato simples, click "Gerar HTML" → preview aparece na tab "HTML" + tab "HTML" permite edit raw + salvar.
- **B1**: `/materiais` redireciona pra `/materiais/diarios`. UI atual aparece normal. `/materiais/reunioes` mostra grid placeholder.
- **B2**: Grid `/materiais/reunioes` mostra cards de cada cliente com 10 encontros (5-15). Status visual: cinza (não iniciado), amarelo (rascunho), verde (pronto), azul (apresentado).
- **C1**: `POST /reunioes/:cid/9/chat` retorna SSE com tokens streaming do Claude. Conversa persistida em `conversa_chat` JSONB.
- **C2**: Editor abre split. Esquerda mostra preview do intelectual. Direita: chat funciona, streaming visível, Claude pergunta, consultor responde, Claude gera HTML embedded.
- **D1**: `GET /apresentar/:slug` retorna HTML completo de 200 OK. CSS + JS do design system carregam de `/flg-design-system/css/flg.css` e `/js/flg-deck.js`.
- **D2**: Click "Apresentar" → nova aba abre. Setas/swipe/espaço navegam. Apresentação real funciona em projetor.
- **E**: Mobile mostra mensagem "apresentação só em desktop". Botão "Copiar HTML" copia o markup completo. Status auto-atualiza pra "apresentado" após primeira visita ao slug.

---

## Out of scope (não nessa entrega)

- Export PDF nativo (browser Cmd+P cobre)
- Versionamento detalhado de `html_pratica` (sobrescreve a cada geração)
- Compartilhar slug com analytics ("quantas vezes foi aberto")
- Editor visual WYSIWYG dos slides
- Templates de prática pré-existentes (consultor sempre escreve do zero por cliente)
- Aprovação multi-stage (Phase futura — hoje consultor só faz "pronto")
- Internacionalização (apenas pt-BR por enquanto)
- Sync com Google Slides / PowerPoint
- A/B test de variações de slide
- Comentários inline (anotações do consultor antes da reunião)
- Tradução automática pra clientes que não falam português
