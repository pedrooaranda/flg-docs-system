# FLG Design System

Pacote oficial de design da **FLG Brasil** para produção de landing pages, pitch decks, briefings e propostas comerciais.

> **Padrão visual:** preto + dourado, sóbrio, cinematográfico.

---

## Início rápido

### Para usar em um projeto novo:

1. Copie esta pasta inteira (`flg-design-system/`) para dentro do seu projeto.
2. No HTML do seu novo material, inclua:
   ```html
   <link rel="stylesheet" href="flg-design-system/css/flg.css">
   <script src="flg-design-system/js/flg-deck.js"></script>
   ```
3. Use os templates como ponto de partida:
   - `templates/deck-template.html` — apresentações 16:9 (pitch decks, briefings)
   - `templates/landing-template.html` — landing pages com scroll vertical

### Para usar com Claude (ou outro agente de IA):

Abra `INSTRUCOES-CLAUDE.md` e siga o prompt mestre. Ele faz o agente ler todo o sistema antes de produzir qualquer coisa.

---

## O que tem aqui

| Arquivo | Para que serve |
|---------|---------------|
| `FLG-DESIGN-SYSTEM.md` | Documentação completa: tokens, componentes, regras |
| `INSTRUCOES-CLAUDE.md` | Prompt pronto para usar com Claude/IA |
| `css/flg.css` | CSS unificado: tokens, base, tipografia, todos os componentes |
| `js/flg-deck.js` | Engine de slides (canvas + navegação por setas/swipe/clique) |
| `templates/deck-template.html` | Template de pitch deck 16:9 (3 slides exemplo) |
| `templates/landing-template.html` | Template de landing page (hero + seções + CTA + footer) |
| `assets/logo-flg.png` | Logo oficial FLG dourada (transparente) |

---

## Stack

- **HTML/CSS/JS puro.** Sem build step, sem npm, sem dependências.
- **Fonts:** Fraunces, Inter, JetBrains Mono (via Google Fonts CDN).
- **Compatibilidade:** navegadores modernos (Safari 14+, Chrome 90+, Firefox 90+).

---

## Tagline oficial

> **Ditando o mercado moderno.**

---

## Versão

`v1.0` — Abril 2026
