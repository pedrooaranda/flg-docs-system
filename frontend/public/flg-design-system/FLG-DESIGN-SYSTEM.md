# FLG Design System v1.0

Sistema de design oficial da **FLG Brasil**. Padrão visual sóbrio (preto + dourado) para landing pages, pitch decks, briefings e propostas comerciais.

> Este documento é a fonte da verdade. Qualquer agente de IA (Claude, GPT) que for produzir materiais usando esse design system deve **ler este arquivo primeiro** e seguir os tokens, componentes e regras descritos aqui.

---

## Filosofia

- **Sóbrio, premium, cinematográfico.** Não é colorido. Não é divertido. É autoridade silenciosa.
- **Preto + dourado.** Sem RGB, sem rainbow, sem cores secundárias além do dourado.
- **Tipografia editorial.** Serifa elegante (Fraunces) + sans neutra (Inter) + monoespaçada técnica (JetBrains Mono).
- **Spotlights, aurora, ondas sonoras.** O fundo "respira" como um palco.
- **Copy sem travessões (`—`).** Prefira pontos, vírgulas ou novas frases. Nada de linguagem de IA.

---

## Estrutura da pasta

```
flg-design-system/
├── FLG-DESIGN-SYSTEM.md      ← Este arquivo (docs principais)
├── INSTRUCOES-CLAUDE.md      ← Prompt pronto para colar no Claude
├── css/
│   └── flg.css               ← CSS unificado (tokens + base + componentes + deck)
├── js/
│   └── flg-deck.js           ← Engine de slides (canvas + navegação)
├── templates/
│   ├── deck-template.html    ← Template de pitch deck/briefing 16:9
│   └── landing-template.html ← Template de landing page (scroll vertical)
└── assets/
    └── logo-flg.png          ← Logo oficial dourada
```

**Para usar em outro projeto:** copie a pasta inteira para dentro do projeto e inclua no HTML:

```html
<link rel="stylesheet" href="caminho/para/flg-design-system/css/flg.css">
<script src="caminho/para/flg-design-system/js/flg-deck.js"></script>
```

---

## 1. Design Tokens

### Cores

| Token | Hex | Uso |
|-------|-----|-----|
| `--bg` | `#05050a` | Background principal (quase preto) |
| `--bg-stage` | `#0a0a12` | Background de seções alternadas |
| `--bg-card` | `#0e0e18` | Background de cards |
| `--bg-glass` | `rgba(20,20,28,0.55)` | Glass effect (com blur) |
| `--ink` | `#F2F0E6` | Texto principal (off-white) |
| `--ink-soft` | `rgba(242,240,230,0.68)` | Texto secundário |
| `--ink-mute` | `rgba(242,240,230,0.38)` | Labels, eyebrows |
| `--ink-dim` | `rgba(242,240,230,0.18)` | Texto decorativo |
| `--line` | `rgba(255,255,255,0.07)` | Bordas sutis |
| `--line-2` | `rgba(255,255,255,0.14)` | Bordas hover/destaque |
| `--gold` | `#E9C46A` | Cor primária — todos os acentos, CTAs, números |
| `--gold-hi` | `#F6DFA0` | Gold claro (highlights) |
| `--gold-lo` | `#B38829` | Gold escuro |
| `--gold-glow` | `rgba(233,196,106,0.35)` | Brilho/sombra dourada |
| `--gold-wash` | `rgba(233,196,106,0.08)` | Background dourado sutil |

**Regra inviolável:** o único acento colorido é o dourado. Vermelhos, verdes, azuis e arco-íris **NÃO** existem nesse design system. Se uma cor adicional for necessária para um cliente específico, deve ser tratada como exceção e documentada à parte.

### Tipografia

| Token | Família | Uso |
|-------|---------|-----|
| `--serif` | `Fraunces` | Headlines, números grandes, italicos editoriais |
| `--sans` | `Inter` | Corpo de texto, UI |
| `--mono` | `JetBrains Mono` | Eyebrows, labels, dados técnicos, contadores |

**Hierarquia tipográfica:**

| Classe | Tamanho clamp | Uso |
|--------|---------------|-----|
| `.d-mega` | 3-6rem | Headline gigante (capa, fechamento) |
| `.d-xl` | 2.2-3.6rem | Headline de seção |
| `.d-lg` | 1.6-2.4rem | Subheadline |
| `.d-md` | 1.25-1.75rem | Subtítulo de bloco |
| `.body-lg` | 1-1.15rem | Corpo grande |
| `.body-md` | 0.92-1rem | Corpo padrão |
| `.body-sm` | 0.85rem | Corpo pequeno |
| `.eyebrow` | 0.68rem | Label dourado acima de headlines |
| `.tech` | 0.68rem | Dados técnicos em mono |

**Italicos com `<em>`** sempre ficam dourados automaticamente em `.d-mega`, `.d-xl`, `.d-lg`, `.d-md`. Use para grifos editoriais, não para todo italico.

### Motion

| Token | Curva | Uso |
|-------|-------|-----|
| `--ease` | `cubic-bezier(0.22,1,0.36,1)` | Padrão para entradas |
| `--ease-in` | `cubic-bezier(0.64,0,0.78,0)` | Saídas |

---

## 2. Componentes

### Background Layers (cinematic stage)

Usados em **todo slide de deck** ou seção hero de landing page para criar atmosfera de palco:

```html
<div class="stage-bg">
  <div class="aurora"></div>
  <div class="spotlight spotlight--center"></div>
  <div class="stage-floor"></div>
  <div class="wave-horizon"></div>
</div>
```

**Variantes de spotlight:**
- `.spotlight--center` (padrão)
- `.spotlight--left`
- `.spotlight--right`

Customize com inline style: `style="--sl-color:rgba(233,196,106,0.4);width:60%;left:20%"`.

### Eyebrow (label dourado)

```html
<div class="eyebrow">Texto da label</div>
```

Sempre dourado, mono, uppercase, com linha dourada antes. Use **antes** de toda headline de seção.

### Gold Divider (substitui spectrum colorido)

```html
<div class="gold-divider gold-divider--thick">
  <div class="line"></div>
  <div class="dot"></div>
  <div class="line"></div>
</div>
```

Linha dourada com brilho central. Use em capas e fechamentos para marcar respiro.

### Botão Primário

```html
<a href="#" class="btn-primary">Texto do botão &rarr;</a>
```

Fundo dourado, texto preto, pill shape. Único estilo de botão primário do sistema.

### Entries (lista numerada)

```html
<div class="entries">
  <div class="entry"><div class="entry-num">01</div><div class="entry-text">Item com <strong>destaque</strong>.</div></div>
  <div class="entry"><div class="entry-num">02</div><div class="entry-text">Outro item.</div></div>
</div>
```

Use para listas de 3-6 itens com ordem narrativa.

### Pillars (4-card feature blocks)

```html
<div class="pillars">
  <div class="pillar-block">
    <div class="pillar-tag">Pilar 01</div>
    <div class="pillar-title">Título do pilar</div>
    <p class="pillar-desc">Descrição curta.</p>
  </div>
  ...
</div>
```

Grid 2x2 para apresentar pilares de uma metodologia ou módulos de um produto.

### Stat Card (cards de números)

```html
<div class="stat-grid cols-3">
  <div class="stat-card">
    <div class="stat-num">70%</div>
    <div class="stat-lbl">Label dourada</div>
    <div class="stat-desc">Descrição complementar.</div>
  </div>
  ...
</div>
```

Variantes: `.cols-2`, `.cols-3`, `.cols-4`. Número grande dourado com glow.

### Financial Grid (cenários de receita)

```html
<div class="fin-grid">
  <div class="fin-card">
    <div class="fin-tier">3 primeiros meses</div>
    <div class="fin-num">R$ 14.950<small>/mês</small></div>
    <div class="fin-label"><strong>500 assinantes</strong><br>Detalhe</div>
  </div>
  ...
</div>
```

3 colunas para mostrar cenários financeiros progressivos.

### Path Grid (dois caminhos)

```html
<div class="path-grid">
  <div class="path-card path-card--featured">
    <div class="path-tag">Caminho 1</div>
    <h3 class="path-title">Título <em>destacado</em></h3>
    <div class="path-price">R$ 8.000</div>
    <p class="path-desc">Descrição completa.</p>
  </div>
  <div class="path-card path-card--alt">
    <div class="path-tag">Caminho 2</div>
    <h3 class="path-title">Alternativa</h3>
    <div class="path-price path-price--alt">Sem custo adicional</div>
    <p class="path-desc">Descrição.</p>
  </div>
</div>
```

Para apresentar 2 opções de proposta. `.path-card--featured` é a recomendada (gold border + accent line).

### Channel Grid (canal + lista)

```html
<div class="channel-grid">
  <div class="channel-meta">
    <div class="channel-icon">IG</div>
    <h2 class="channel-name">Presença <em>diária</em></h2>
    <div class="channel-tag">Tagline curta</div>
  </div>
  <div class="channel-list">
    <div class="channel-item">Item da lista.</div>
    <div class="channel-item">Outro item.</div>
  </div>
</div>
```

Layout 1.2fr/2fr com ícone+meta na esquerda e lista de pontos na direita.

### List Cols (listas em colunas)

```html
<div class="list-cols">
  <div class="list-item"><span><strong>Bullet 1.</strong> Texto explicativo.</span></div>
  <div class="list-item"><span><strong>Bullet 2.</strong> Texto explicativo.</span></div>
</div>
```

Use `.list-wide` para 1 coluna. Cada item começa com `+` dourado automaticamente.

### Arsenal Grid (3x3 de itens curtos)

```html
<div class="arsenal-grid">
  <div class="arsenal-card"><div class="arsenal-num">01</div><div class="arsenal-text"><strong>1</strong> Entrega.</div></div>
  ...
</div>
```

Variante: `.cols-4`. Use para checklists de 9-12 itens.

### Shift Grid (antes × depois)

```html
<div class="shift-grid">
  <div class="shift-col shift-col--from">
    <div class="shift-tag">Antes</div>
    <div class="shift-row">Estado anterior.</div>
  </div>
  <div class="shift-col shift-col--to">
    <div class="shift-tag">Depois</div>
    <div class="shift-row"><strong>Estado novo</strong>.</div>
  </div>
</div>
```

Comparação binária. `--to` tem accent dourado.

### PQ Grid (Para quem é / não é)

```html
<div class="pq-grid">
  <div class="pq-card pq-card--yes">
    <div class="pq-title"><span style="color:var(--gold)">✓</span> É para você se...</div>
    <div class="pq-item"><span class="dot"></span>Critério 1</div>
  </div>
  <div class="pq-card pq-card--no">
    <div class="pq-title"><span style="color:var(--ink-mute)">✕</span> Não é se...</div>
    <div class="pq-item"><span class="dot"></span>Anti-critério 1</div>
  </div>
</div>
```

### Investment Block (preço grande + parcelas)

```html
<div class="invest">
  <div class="invest-halo"></div>
  <div class="eyebrow invest-eyebrow">Investimento</div>
  <div class="invest-tier">Nome do produto</div>
  <h2 class="d-lg">Headline opcional</h2>
  <div class="price-row">
    <span class="price-sym">R$</span>
    <span class="price-num">7.000</span>
  </div>
  <div class="price-sub">à vista</div>
  <div class="parcel">
    <div class="parcel-or">Ou</div>
    <div class="parcel-val">12× de R$ 583</div>
    <div class="parcel-desc">no cartão de crédito</div>
  </div>
  <div class="invest-includes">
    <span class="invest-chip">Item 1</span>
    <span class="invest-chip">Item 2</span>
  </div>
</div>
```

### Comparison Table (tabela comparativa)

```html
<div class="cmp cols-3">
  <div class="cmp-h"></div>
  <div class="cmp-h">Opção 1</div>
  <div class="cmp-h gold">Opção 2 (destacada)</div>

  <div class="cmp-row">Critério</div>
  <div class="cmp-val">Valor 1</div>
  <div class="cmp-val gold">Valor 2</div>
</div>
```

Variantes: `.cols-2`, `.cols-3`, `.cols-4`. Header `.gold` destaca a coluna recomendada.

### Bio Frame (foto + tag dourada)

```html
<div class="bio-frame">
  <img src="foto.jpg" alt="Nome">
  <div class="bio-tag">Cargo · 30+ anos</div>
</div>
```

### Logo FLG (3 variantes)

```html
<!-- Capa: logo grande centralizada -->
<img src="assets/logo-flg.png" class="flg-mark">

<!-- Footer: pequena -->
<img src="assets/logo-flg.png" class="flg-mark--small">

<!-- Slide intermediário: canto superior direito sutil -->
<img src="assets/logo-flg.png" class="flg-mark--corner">
```

---

## 3. Animações

Adicione `.reveal` em qualquer elemento dentro de um slide para que apareça com fade+rise quando o slide ficar ativo. Use `.d1` até `.d8` para escalonar a entrada:

```html
<h2 class="d-xl reveal d1">Aparece primeiro</h2>
<p class="body-lg reveal d2">Aparece depois</p>
<div class="entries reveal d3">...</div>
```

---

## 4. Templates

### Deck (apresentação 16:9)

Use `templates/deck-template.html` como base. Estrutura mínima:

```html
<body class="flg-deck" data-deck-id="nome-do-projeto">
  <canvas id="stage-canvas"></canvas>
  <div class="grain"></div>
  <div class="progress"><div class="progress-fill"></div></div>
  <div class="counter"><span class="counter-dot"></span><span class="counter-num">01 / N</span></div>
  <div class="nav-hint">← → · ESPAÇO · SWIPE</div>
  <button class="nav-arrows nav-prev">‹</button>
  <button class="nav-arrows nav-next">›</button>

  <div class="deck">
    <section class="slide">...</section>
    <section class="slide">...</section>
  </div>

  <script src="caminho/flg-design-system/js/flg-deck.js"></script>
</body>
```

`data-deck-id` no body permite o engine salvar a posição atual no localStorage entre sessões.

### Landing Page (scroll vertical)

Use `templates/landing-template.html` como base. **Não inclua** o `flg-deck.js` (engine de slides), apenas o CSS. Adicione o JS de scroll-aware nav inline.

Estrutura:
- Nav fixa que ganha blur ao scroll
- Hero com `stage-bg` cinematográfico
- Sections alternando `var(--bg)` e `var(--bg-stage)`
- CTA final
- Footer minimal

---

## 5. Regras de Copy

1. **Sem travessões longos (`—`).** Substitua por pontos, vírgulas ou nova frase.
2. **Sem linguagem de IA.** Evite "jornada transformadora", "potencialize", "destaque-se", "tapete de significados".
3. **Frases curtas quando o impacto pede.** Frases longas quando o assunto pede ar.
4. **`<em>` é grifo dourado editorial.** Use 1-3 vezes por slide, não mais.
5. **`<strong>` destaca a palavra-chave.** Cor texto principal (não dourado).
6. **`<strong style="color:var(--gold)">` destaca números/dados.** Use com moderação.

---

## 6. Stack Técnica

- **HTML/CSS/JS puro.** Sem React, sem build step.
- **Fonts via Google Fonts CDN.** Fraunces (variable), Inter, JetBrains Mono.
- **Sem libs JS externas obrigatórias.** O deck engine é vanilla. Para animações de scroll na landing, adicione GSAP ou Lenis se necessário.
- **Compatibilidade:** Safari 14+, Chrome 90+, Firefox 90+. Usa CSS variables, clamp(), backdrop-filter.

---

## 7. Princípios de Composição

| Princípio | Aplicação |
|-----------|-----------|
| **1 ideia por slide/seção** | Não empilhar 3 conceitos. Quebre em mais slides. |
| **Respiro generoso** | Padding alto, max-width nos textos para legibilidade. |
| **Hierarquia clara** | Eyebrow → Headline → Sub → Body → CTA. |
| **Ênfase pontual** | `<em>` ou `<strong style="color:gold">` em palavras-chave. Não em frases inteiras. |
| **Cinematográfico** | Sempre incluir `stage-bg` com aurora + spotlight em slides de impacto. |
| **Logo FLG sempre presente** | Capa (grande), slides intermediários (canto sutil), encerramento (centralizada). |

---

## 8. Como instruir o Claude

Veja `INSTRUCOES-CLAUDE.md` para um prompt pronto que carrega o contexto completo do design system e gera materiais consistentes.

---

**Versão:** 1.0
**Mantido por:** FLG Brasil
**Tagline oficial:** *Ditando o mercado moderno*
