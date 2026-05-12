# Como usar o FLG Design System com Claude

Este arquivo é seu guia para instruir o Claude (ou outro agente de IA) a produzir materiais usando o design system oficial da FLG.

---

## Setup inicial em qualquer projeto novo

1. **Copie a pasta `flg-design-system/` inteira** para dentro do projeto novo.
2. Estrutura recomendada:
   ```
   meu-projeto-novo/
   ├── flg-design-system/    ← cole a pasta aqui
   │   ├── FLG-DESIGN-SYSTEM.md
   │   ├── INSTRUCOES-CLAUDE.md (este arquivo)
   │   ├── css/flg.css
   │   ├── js/flg-deck.js
   │   ├── templates/
   │   └── assets/logo-flg.png
   └── (seus arquivos)
   ```

---

## Prompt mestre para colar no Claude

Cole isso na primeira mensagem ao iniciar uma tarefa:

```
Estou trabalhando em um material para a FLG Brasil. Antes de fazer qualquer coisa, leia os seguintes arquivos:

1. flg-design-system/FLG-DESIGN-SYSTEM.md (documentação completa do design system)
2. flg-design-system/css/flg.css (todos os tokens e componentes disponíveis)
3. flg-design-system/templates/deck-template.html (se for pitch deck)
   OU flg-design-system/templates/landing-template.html (se for landing page)

Regras inegociáveis:
- Use APENAS os tokens, classes e componentes do flg.css. Não invente novos.
- Paleta: preto + dourado. Sem RGB rainbow, sem cores secundárias.
- Tipografia: Fraunces (serif) + Inter (sans) + JetBrains Mono (mono).
- Copy sem travessões (—). Use pontos, vírgulas ou novas frases.
- Logo FLG presente: capa (grande), intermediários (canto sutil), encerramento (centralizada).
- Para italicos editoriais use <em> (vira dourado automático).
- Para destaques use <strong> (texto principal).
- Para números/dados em destaque use <strong style="color:var(--gold)">.

Tarefa: [descreva aqui o que você quer]
```

---

## Exemplos de tarefas que funcionam

### Pitch Deck / Briefing

```
Tarefa: criar um pitch deck de 12 slides para o cliente [Nome] sobre [tema].
- Estrutura sugerida: capa, contexto, problema, solução, método, entregas, prova,
  para quem é, investimento, próximo passo, encerramento.
- Use o template deck-template.html como base.
- Salve como [nome-do-arquivo].html dentro da pasta do projeto.
- Coloque o logo da FLG na capa (grande), nos slides intermediários (corner sutil)
  e no encerramento (centralizada).
```

### Landing Page

```
Tarefa: criar uma landing page de venda para [produto] do cliente [Nome].
- Use o template landing-template.html como base.
- Headline impactante no hero, seções de problema → solução → método → CTA.
- CTA principal: [texto do botão].
- Salve como index.html.
```

### Documento / Proposta

```
Tarefa: criar uma proposta comercial de 8 slides para [Nome].
- Mesmo padrão do deck-template, mas focado em apresentar 1 oferta com clareza.
- Inclua: capa, problema do cliente, solução proposta, entregas, investimento,
  parcelamento, próximo passo, encerramento.
- Estrutura de preço: use o componente .invest com .price-row e .parcel.
```

---

## Componentes mais usados (referência rápida)

| Componente | Quando usar |
|------------|-------------|
| `.eyebrow` | Sempre antes de uma headline de seção |
| `.d-mega` | Capa, fechamento, frases-impacto |
| `.d-xl` | Headlines de seção |
| `.d-md` | Subheadings |
| `.body-lg`, `.body-md` | Texto corrido |
| `.entries` | Lista numerada com 3-6 itens |
| `.pillars` | Grid 2x2 de pilares/módulos |
| `.stat-card` | Cards de números (porcentagens, totais) |
| `.path-grid` | 2 caminhos / opções de proposta |
| `.fin-grid` | Cenários financeiros (3 colunas) |
| `.invest` | Bloco de preço grande + parcelas |
| `.cmp` | Tabela comparativa |
| `.pq-grid` | Para quem é / não é |
| `.shift-grid` | Antes × Depois |
| `.arsenal-grid` | 9-12 itens curtos em grid 3x3 ou 4x3 |
| `.channel-grid` | Canal + lista de pontos |
| `.list-cols`, `.list-wide` | Listas de bullets |
| `.gold-divider` | Substituto sóbrio do spectrum colorido |
| `.bridge` | Transição entre dois conceitos |
| `.timeline-arrow` | Sequência horizontal (evolução de versões) |

---

## Regras de copy

1. **Sem travessões.** Use pontos ou vírgulas.
2. **Frases diretas.** Sem "no atual cenário do mercado".
3. **`<em>` para grifo editorial dourado.** 1-3 vezes por slide, não mais.
4. **`<strong>` para palavra-chave.** Cor padrão de texto.
5. **`<strong style="color:var(--gold)">` para dados/números.** Com moderação.
6. **Eyebrow sempre dourado, sempre uppercase, sempre antes da headline.**

---

## Anti-padrões (NÃO faça)

❌ Usar cores que não sejam preto, off-white ou dourado
❌ Adicionar bibliotecas externas sem necessidade (Tailwind, Bootstrap, etc.)
❌ Inventar componentes novos quando já existe equivalente no flg.css
❌ Usar travessões longos (`—`) na copy
❌ Misturar várias famílias de fonte fora das 3 oficiais
❌ Esquecer da logo FLG na capa e fechamento
❌ Usar `<em>` em frases inteiras (vira dourado demais e perde impacto)
❌ Cobrir o `stage-bg` com cor sólida (perde a atmosfera cinematográfica)

---

## Exemplos vivos (referência)

Materiais já produzidos com este design system:

- **Pitch deck "Seu Par Criativo"** — proposta comercial de 28 slides
- **Landing page "Método SOM"** (variante com cores das 7 notas — exceção do cliente Ivo Mozart)
- **Briefing de encerramento "FLG × Ivo Mozart"** — 18 slides
- **Proposta de cross-sell "Charles Feijó"** — 11 slides em padrão sóbrio

---

## Manutenção

Se um componente novo for criado para um projeto e fizer sentido virar parte do sistema, adicione em:

1. `css/flg.css` — bloco com comentário `/* ═══ NOME DO COMPONENTE ═══ */`
2. `FLG-DESIGN-SYSTEM.md` — seção "2. Componentes" com exemplo de markup
3. (Opcional) Atualize o template relevante

---

**Pronto. Boa produção.**
