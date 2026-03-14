# FLG — Sistema de Documentação de Clientes

> **Founders Led Growth** · Pedro Aranda · Sistema de produção de materiais estratégicos

---

## Visão Geral

Este repositório é o **centro de operações de documentação** da FLG. Ele contém:

- **Templates** de apresentação e documento estratégico prontos para reutilização
- **Framework de IA** com prompts e workflows para geração automatizada de conteúdo
- **Projetos de clientes** organizados e versionados
- **Scripts** para criar novos clientes com um único comando

---

## Estrutura de Pastas

```
documentos_oficiais/
│
├── README.md                        ← Este arquivo
│
├── document_template/               ← Templates oficiais FLG
│   ├── README.md                    ← Como usar os templates
│   ├── assets/                      ← Logo FLG + fontes compartilhadas
│   ├── slides/
│   │   ├── template.html            ← Template de apresentação (slides)
│   │   ├── GUIDE.md                 ← Guia completo de uso
│   │   └── ai-image-prompts.md      ← Framework de imagens com IA
│   └── documento/
│       ├── template.html            ← Template de documento estratégico
│       └── GUIDE.md
│
├── ai-framework/                    ← Integração com IA
│   ├── README.md                    ← Visão geral e como configurar
│   ├── prompts/
│   │   ├── client-intake.md         ← Formulário de intake do cliente
│   │   ├── slides-generation.md     ← Prompt para gerar slides via Claude
│   │   ├── documento-generation.md  ← Prompt para gerar documento via Claude
│   │   └── images/
│   │       ├── README.md            ← Como gerar imagens para slides
│   │       └── style-guide.md       ← Guia de estilo visual FLG
│   └── workflows/
│       └── step-by-step.md          ← Workflow completo (manual e automatizado)
│
├── scripts/                         ← Automação
│   ├── README.md
│   ├── new-client.sh                ← Cria novo cliente a partir do template
│   └── generate-ai.sh               ← Gera conteúdo via Claude API
│
├── .github/
│   └── workflows/
│       └── generate-docs.yml        ← GitHub Actions (geração automática)
│
└── clients/                         ← Projetos finalizados
    └── rosane-gofit/                ← Go Fit × Rosane & Antonella (referência)
        ├── assets/
        ├── slides-gofit.html
        ├── documento-estrategico.html
        ├── planilha-conteudo.html
        └── PROJECT.md
```

---

## Como Criar um Novo Cliente

### Opção 1 — Script Automático (recomendado)

```bash
cd documentos_oficiais
./scripts/new-client.sh \
  "nome-cliente" \
  "Nome do Cliente" \
  "Empresa Cliente" \
  "Pedro Aranda" \
  "2026" \
  "Setor / Indústria"
```

Isso cria `clients/nome-cliente/` com slides e documento prontos para edição.

### Opção 2 — Manual

1. Duplique `document_template/slides/template.html` para `clients/SEU-CLIENTE/slides.html`
2. Duplique `document_template/documento/template.html` para `clients/SEU-CLIENTE/documento.html`
3. Substitua todos os `{{PLACEHOLDERS}}` com os dados do cliente
4. Coloque os assets do cliente em `clients/SEU-CLIENTE/assets/`

### Opção 3 — Geração com IA

```bash
# 1. Preencha o brief do cliente
cp ai-framework/prompts/client-intake.md clients/SEU-CLIENTE/brief.md
# edite o brief.md com os dados do cliente

# 2. Configure a API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# 3. Gere os documentos
./scripts/generate-ai.sh SEU-CLIENTE
```

---

## Padrão Visual FLG

| Elemento       | Valor                              |
|---------------|-------------------------------------|
| Fundo         | `#080808` (preto)                  |
| Texto         | `#FAFAF8` (branco quente)          |
| Gold principal| `#C9A84C`                          |
| Gold claro    | `#F5D68A`                          |
| Gold escuro   | `#8B6914`                          |
| Título        | Playfair Display (serif, gold grad) |
| Corpo         | Poppins (sans-serif)               |

---

## Imagens nos Slides

Os slides suportam imagens de fundo opcionais. Cada slide tem um **slot de imagem** documentado com:
- Tamanho recomendado (1920×1080)
- Prompt sugerido para Midjourney / DALL-E / Flux
- Opacidade de overlay (padrão: 15%)

Consulte `document_template/slides/ai-image-prompts.md` para o framework completo.

---

## Deploy (VPS ou GitHub Pages)

Consulte `ai-framework/workflows/step-by-step.md` para instruções de deploy.

---

*FLG · Founders Led Growth · Pedro Aranda · Florianópolis*
