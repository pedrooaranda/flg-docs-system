# AI Framework — FLG

> Sistema de integração com IA para geração de materiais estratégicos.

---

## O que é

O AI Framework da FLG permite que consultores gerem slides e documentos estratégicos automaticamente a partir de um brief estruturado, usando a API do Claude (Anthropic).

**Input:** Brief preenchido (`brief.md`)
**Output:** `slides.html` + `documento.html` prontos para PDF

---

## Estrutura

```
ai-framework/
├── README.md                     ← Este arquivo
├── prompts/
│   ├── client-intake.md          ← Formulário de intake (preencher por cliente)
│   ├── slides-generation.md      ← System prompt para slides
│   ├── documento-generation.md   ← System prompt para documento
│   └── images/
│       ├── README.md             ← (ver document_template/slides/ai-image-prompts.md)
│       └── style-guide.md        ← Guia de estilo visual FLG
└── workflows/
    └── step-by-step.md           ← Workflows: manual, script, GitHub Actions, VPS
```

---

## Configuração Rápida

```bash
# 1. Copie o arquivo de variáveis
cp .env.example .env

# 2. Adicione sua API key
# Abra .env e preencha: ANTHROPIC_API_KEY=sk-ant-...

# 3. Obtenha sua API key em:
# https://console.anthropic.com/
```

---

## Modelos Claude Recomendados

| Uso | Modelo | Custo relativo | Velocidade |
|-----|--------|---------------|-----------|
| Produção (slides + doc) | `claude-opus-4-6` | $$$ | Médio |
| Rascunho rápido | `claude-sonnet-4-6` | $$ | Rápido |
| Testes e dev | `claude-haiku-4-5-20251001` | $ | Muito rápido |

Para entregas a clientes: use `claude-opus-4-6` (melhor qualidade).

---

## Ferramentas de IA Integradas

### Texto (Claude API)
- Gera conteúdo dos slides a partir do brief
- Gera o documento estratégico completo
- Refina seções específicas

### Imagens
- **Midjourney** — backgrounds de slides premium
- **Flux (Replicate API)** — geração automatizada via API
- **DALL-E 3** — integrado ao ChatGPT Plus

### Workflow
- **GitHub Actions** — automação de geração no push
- **n8n (self-hosted)** — orchestração de workflows complexos
- **Make.com** — alternativa visual ao n8n

---

## Consulte Também

- `ai-framework/workflows/step-by-step.md` — como usar cada opção de workflow
- `document_template/slides/ai-image-prompts.md` — como gerar imagens para slides
- `scripts/generate-ai.sh` — script de geração via CLI

---

*FLG · Founders Led Growth · AI Framework v1.0*
