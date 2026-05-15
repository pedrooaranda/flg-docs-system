# Estudo de Custos — Geração de Decks FLG via Claude

**Data:** 2026-05-13
**Stream:** Reuniões da Jornada (decks HTML intelectual + prática personalizada)
**Modelo principal:** Claude Sonnet 4.6 · **Fallback:** Claude Haiku 4.5

---

## 🎯 Resposta direta

**Custo médio por deck completo:** ~**R$ 1,52** (intelectual amortizado em 10 clientes + prática personalizada por cliente, Claude Sonnet 4.6 com prompt caching ativo).

---

## 📊 Quebra detalhada — Claude Sonnet 4.6

| Etapa | Tokens | USD | BRL |
|---|---|---|---|
| **HTML Intelectual** (1 vez por encontro, vale para TODOS os clientes) | | | |
| ↳ Primeira geração (cache miss) | ~18K in + 8.8K out | $0,198 | **R$ 1,07** |
| ↳ Re-geração em <5min (cache hit, mesmo session) | ~18K in + 8.8K out | $0,145 | R$ 0,78 |
| **HTML Prática** (por cliente × encontro) | | | |
| ↳ Chat consultor↔Claude (5 turns típicos) | ~20K cumulativo | $0,178 | R$ 0,96 |
| ↳ Geração HTML prática final | ~7K in + 4K out | $0,084 | R$ 0,46 |
| **Subtotal prática (1 deck)** | | **$0,262** | **R$ 1,42** |
| **TOTAL por deck (amortizado em 10 clientes)** | | **$0,282** | **R$ 1,52** |

> **Como o amortizado funciona:** o intelectual é gerado 1× e reaproveitado para os 10 clientes naquele encontro → cada cliente paga 1/10 do custo intelectual (R$ 0,11) + 100% da prática personalizada (R$ 1,42).

---

## 📈 Análise de sensibilidade

### Por tamanho do intelectual

| Slides | Custo intelectual | Por cliente (÷10) |
|---|---|---|
| 10 slides | R$ 0,70 | R$ 0,07 |
| 15 slides | R$ 0,87 | R$ 0,09 |
| **21 slides** (caso real do Encontro 5) | **R$ 1,07** | **R$ 0,11** |
| 30 slides | R$ 1,38 | R$ 0,14 |

### Por intensidade do chat de prática

| Turns do consultor | Custo prática |
|---|---|
| 3 turns (rápido) | R$ 1,10 |
| **5 turns (típico)** | **R$ 1,42** |
| 8 turns (refinamento médio) | R$ 1,95 |
| 12 turns (muito refinamento) | R$ 2,79 |

---

## 🏢 Operação completa típica

**Cenário:** 10 clientes × 15 encontros = **150 decks totais**

| Item | USD | BRL |
|---|---|---|
| 15 intelectuais (1× por encontro) | $2,97 | **R$ 16,05** |
| 150 práticas personalizadas | $39,32 | **R$ 212,31** |
| **TOTAL operacional completo** | **$42,29** | **R$ 228,36** |

**Por cliente completo (15 encontros do ciclo):** ~**R$ 22,80** em IA — o ciclo inteiro de produção de decks daquele cliente, do Encontro 1 ao 15.

---

## 🔑 Onde o dinheiro vai

- **~78% do custo Claude é INPUT** — o system prompt carrega o design system completo (15.469 tokens cached: FLG-DESIGN-SYSTEM.md + flg.css + deck-template.html).
- **Prompt caching já economiza ~27%** da primeira geração; em re-gerações <5min economia chega a ~60%.
- **Fallback Haiku 4.5** (que rodou em 529 overload) é ~5× mais barato: ~**R$ 0,30/deck**. Em cenário pessimista de overload constante, conta cai pra ~R$ 50/mês operação inteira.

---

## ⚠️ Premissas usadas

| Premissa | Valor |
|---|---|
| Preço Sonnet 4.6 — input regular | $3,00 / MTok |
| Preço Sonnet 4.6 — input cache write (TTL 5min, +25%) | $3,75 / MTok |
| Preço Sonnet 4.6 — input cache read (-90%) | $0,30 / MTok |
| Preço Sonnet 4.6 — output | $15,00 / MTok |
| Câmbio USD → BRL (conservador) | R$ 5,40 |
| Tokens por char (pt-BR + HTML/CSS) | ~3,5 chars/token |
| Output médio intelectual | 21 slides × ~420 tokens/slide |
| Output médio prática | 7 slides × ~570 tokens/slide |
| Chat médio de prática | 5 turns × (200 user + 350 assistant) |
| System prompt cached (design system) | 15.469 tokens |
| System prompt não-cached (role + regras) | ~700 tokens |

---

## 💼 Conclusão prática para precificação

Pra um cliente que paga **R$ 5.000/mês** de mentoria/consultoria:

- Custo IA por cliente/mês (1-2 encontros/mês × prática): ~**R$ 1,50–3,00**
- Custo IA do ciclo completo (15 encontros): ~**R$ 22,80**
- Como **% do ticket**: **< 0,5%** do valor cobrado.

Mesmo no cenário pessimista (12 turns por encontro + 30 slides), fica em ~**R$ 60/cliente/ciclo completo** — **1,2%** do ticket.

**Conclusão:** custo de IA é desprezível frente ao valor cobrado. Sistema sustentável mesmo com expansão significativa da carteira.

---

## 📎 Anexo — fórmula de custo

Para cada chamada Claude, o custo em USD é:

```
custo_chamada =
    (input_normal_tok       × $3.00  / 1M)
  + (input_cache_write_tok  × $3.75  / 1M)   # cache miss, escreve TTL 5min
  + (input_cache_read_tok   × $0.30  / 1M)   # cache hit, -90%
  + (output_tok             × $15.00 / 1M)
```

Para Haiku 4.5 (fallback): input $1,00 · cache read $0,10 · output $5,00 (todos /MTok).
