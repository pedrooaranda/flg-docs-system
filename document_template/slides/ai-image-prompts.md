# Framework de Imagens com IA — FLG Slides

> Guia para consultores sobre quando, como e com qual prompt gerar imagens para os slides FLG.

---

## Filosofia Visual

Os slides FLG são fundo **preto** com detalhes **dourado**. As imagens devem **reforçar** essa identidade, nunca competir com ela:

- Imagens aparecem com **opacity: 0.13** (13%) — criam textura, não dominam
- Estilo: **dark, cinematic, minimal, luxury**
- Sem texto, sem logos, sem pessoas sorridentes artificialmente
- Preferencialmente: ambientes, texturas, luz dramática, natureza

---

## Ferramentas Recomendadas

| Ferramenta | Melhor para | Como usar | Custo |
|-----------|------------|----------|-------|
| **Midjourney** | Qualidade máxima | Discord bot `/imagine` | ~$10/mês |
| **DALL-E 3** | Integração com API | OpenAI API ou ChatGPT Plus | ~$0.04/img |
| **Flux Schnell** | Velocidade + API | Replicate API (`black-forest-labs/flux-schnell`) | ~$0.003/img |
| **Flux Dev** | Qualidade + API | Replicate API (`black-forest-labs/flux-dev`) | ~$0.025/img |
| **Ideogram 2.0** | Composição precisa | ideogram.ai | ~$0.08/img |
| **Adobe Firefly** | Uso comercial seguro | firefly.adobe.com | CC subscription |

**Recomendação para uso regular:** Flux Schnell via API (barato, rápido, boa qualidade)
**Recomendação para clientes premium:** Midjourney (qualidade superior)

---

## Tamanhos e Formatos

| Uso | Tamanho | Proporção | Formato |
|-----|---------|----------|--------|
| Background de slide | 1920×1080 | 16:9 | JPG (qualidade 85%) |
| Hero / lateral | 960×1080 | 9:16 | JPG |
| Foto de pessoa | 600×800 | 3:4 | JPG |
| Ícone decorativo | 400×400 | 1:1 | PNG com transparência |

---

## Prompts por Tipo de Slide

### SLIDE CAPA (Cover)

```
[SETOR] professional photography, dark cinematic studio lighting,
luxury minimal aesthetic, moody atmosphere, deep black background,
subtle gold light reflection, no people, no text, editorial --ar 16:9
--style raw --q 2
```

**Exemplos por setor:**
- Academia/Fitness: `"high-end gym interior, dark cinematic, weight equipment silhouette, dramatic side lighting"`
- Gastronomia: `"dark fine dining restaurant interior, candlelight, minimal, luxury table setting"`
- Tecnologia: `"dark server room, blue accent light, minimal, professional, cinematic"`
- Moda: `"dark fashion editorial texture, silk fabric, moody lighting, luxury"`
- Consultoria: `"dark corporate minimal office, city night view, blurred background"`

---

### SLIDE SEÇÃO (Section Divider)

```
abstract dark texture, minimal luxury, subtle gold particles,
atmospheric, dark background #080808, no text, no logos,
macro photography, --ar 16:9 --style raw
```

**Variações:**
- `"dark marble texture, black and gold veins, luxury minimal"`
- `"dark fabric texture, subtle sheen, editorial photography"`
- `"abstract dark water reflection, gold light distortion"`

---

### SLIDE PESSOAS (Person Profile)

```
professional portrait photography, [DESCRIÇÃO DA PESSOA],
dark studio background, dramatic side lighting, confident expression,
editorial style, luxury, high contrast, --ar 3:4 --style raw
```

**Instruções para fotos reais:**
1. Foto com fundo neutro escuro ou desfocado
2. Iluminação lateral (Rembrandt lighting)
3. Roupas alinhadas com a marca do cliente
4. Expressão: confiante, serena, presente
5. Editar com filtro preto e branco ou desaturar levemente
6. Salvar como `assets/images/pessoa-a.jpg` (600×800px)

---

### SLIDE DADOS / STATS

Slides de dados geralmente **não precisam** de imagem de fundo.
O impacto visual vem dos números grandes em dourado.

Se quiser adicionar textura sutil:
```
abstract dark grid pattern, minimal, geometric, dark background,
very subtle, almost invisible, --ar 16:9 --no color --style raw
```

---

### SLIDE CITAÇÃO (Quote)

```
dark minimalist background, subtle light bokeh, moody, atmospheric,
luxury editorial, no text, deep black, --ar 16:9 --style raw
```

---

### SLIDE ENCERRAMENTO (Closing)

Use a mesma imagem da Capa para criar consistência visual (início = fim).

---

## Workflow Completo com IA de Imagens

### Opção A — Manual (Midjourney)

1. Abra o Discord e vá para o bot Midjourney
2. Use `/imagine` com o prompt adequado
3. Gere 4 variações, escolha a melhor
4. Use `/upscale` para 2x
5. Baixe e converta para JPG (qualidade 85%)
6. Redimensione para 1920×1080
7. Coloque em `clients/SEU-CLIENTE/assets/images/`
8. Descomente o `<img class="slide-bg">` no HTML

### Opção B — Automatizada (Flux via Replicate API)

```bash
# Instalar replicate CLI
npm install -g replicate

# Definir API key
export REPLICATE_API_TOKEN=r8_xxx

# Gerar imagem
replicate run black-forest-labs/flux-schnell \
  --input prompt="high-end gym interior, dark cinematic, luxury minimal --ar 16:9" \
  --input width=1920 \
  --input height=1080 \
  --output > assets/images/capa.jpg
```

### Opção C — DALL-E 3 via ChatGPT Plus

1. Abra o ChatGPT (versão Plus com GPT-4o)
2. Cole o prompt: *"Crie uma imagem horizontal 16:9 de: [PROMPT]"*
3. Faça download da imagem
4. Redimensione para 1920×1080 se necessário

---

## Onde Colocar as Imagens

```
clients/
└── SEU-CLIENTE/
    └── assets/
        └── images/
            ├── capa.jpg          ← Capa + Encerramento
            ├── secao-01.jpg      ← Seção 1
            ├── secao-02.jpg      ← Seção 2
            ├── pessoa-a.jpg      ← Foto pessoa A (3:4)
            └── pessoa-b.jpg      ← Foto pessoa B (3:4)
```

---

## Como Ativar no Template HTML

Cada slide tem um comentário com o slot. Basta descomentá-lo:

```html
<!-- ANTES (slot comentado) -->
<!-- <img class="slide-bg" src="assets/images/capa.jpg" alt=""> -->

<!-- DEPOIS (ativado) -->
<img class="slide-bg" src="assets/images/capa.jpg" alt="">
```

O CSS `.slide-bg` já cuida de tudo: `position: absolute`, `width: 100%`, `height: 100%`, `object-fit: cover`, `opacity: 0.13`.

---

## Checklist de Qualidade Visual

Antes de entregar ao cliente, verifique:

- [ ] Imagens de fundo em todos os slides desejados
- [ ] Opacidade suficientemente baixa (texto legível sobre a imagem)
- [ ] Consistência de estilo entre todas as imagens
- [ ] Resolução mínima 1280×720 (preferível 1920×1080)
- [ ] Arquivos otimizados (JPG < 500KB por imagem)
- [ ] Nenhuma imagem com texto, logos ou marcas d'água visíveis

---

*FLG · FLG Brazil · Guia interno de produção*
