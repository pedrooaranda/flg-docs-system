# Workflow Completo — Como Produzir Materiais FLG

> Três opções de workflow: Manual, Semi-automatizado (local) e Totalmente automatizado (GitHub Actions / VPS).

---

## OPÇÃO 1 — Manual (para qualquer consultor)

Sem terminal, sem código. Apenas navegador e editor de texto.

### Passo 1 — Criar a pasta do cliente
```
clients/
└── meu-cliente/
    └── assets/
```
Copie `document_template/slides/template.html` para `clients/meu-cliente/slides.html`.
Copie `document_template/documento/template.html` para `clients/meu-cliente/documento.html`.

### Passo 2 — Preencher o brief
Abra `ai-framework/prompts/client-intake.md`, copie e preencha no Notion, Word ou Google Docs.

### Passo 3 — Substituir placeholders
Abra `slides.html` no editor (VS Code ou TextEdit) e use **Localizar & Substituir** (Ctrl+H ou Cmd+H) para trocar cada `{{PLACEHOLDER}}` pelo valor real.

### Passo 4 — Adicionar imagens (opcional)
Siga `document_template/slides/ai-image-prompts.md`.

### Passo 5 — Exportar PDF
Abra no Chrome → P (ou Ctrl+P) → Salvar como PDF → Ativar "Gráficos de fundo".

---

## OPÇÃO 2 — Semi-automatizado (terminal local)

Para quem tem acesso ao terminal e quer automatizar o setup inicial.

### Requisitos
- macOS, Linux ou WSL no Windows
- Bash (já incluído no macOS)
- Opcional: `ANTHROPIC_API_KEY` para geração com IA

### Criar novo cliente (sem IA)
```bash
cd documentos_oficiais
./scripts/new-client.sh gofit-novo "Rosane & Antonella" "Go Fit" "Pedro Aranda" "2026" "Academia"
```

Resultado: cria `clients/gofit-novo/` com slides e documento prontos para editar.

### Gerar conteúdo com IA (Claude API)
```bash
# 1. Configure a API key
cp .env.example .env
# edite .env com sua ANTHROPIC_API_KEY

# 2. Preencha o brief
cp ai-framework/prompts/client-intake.md clients/gofit-novo/brief.md
# edite clients/gofit-novo/brief.md com os dados do cliente

# 3. Gere os materiais
./scripts/generate-ai.sh gofit-novo
```

---

## OPÇÃO 3 — GitHub Actions (recomendado para times)

Totalmente automatizado. Qualquer colaborador faz upload do brief e o sistema gera os documentos.

### Configuração inicial (uma vez)

1. **Fork ou clone** este repositório para a conta GitHub da FLG
2. Vá em **Settings → Secrets and variables → Actions**
3. Adicione: `ANTHROPIC_API_KEY` com sua chave da API Anthropic
4. Ative o GitHub Pages: **Settings → Pages → Source: GitHub Actions**

### Workflow diário (colaborador leigo)

1. Clone o repositório ou acesse pelo GitHub Web Editor
2. Crie a pasta: `clients/nome-cliente/`
3. Copie e preencha o brief: `clients/nome-cliente/brief.md`
4. Faça **commit** e **push** na branch `main`
5. O GitHub Actions roda automaticamente
6. Em ~2 minutos, os materiais aparecem em `clients/nome-cliente/`
7. Acesse os PDFs pelo GitHub Pages: `https://SEU-ORG.github.io/flg-docs/clients/nome-cliente/`

### Arquivo de workflow (`.github/workflows/generate-docs.yml`)

Já incluído neste repositório. Veja o arquivo para detalhes.

---

## OPÇÃO 4 — VPS com Interface Web

Para instalar um painel web onde qualquer colaborador preenche um formulário e recebe os PDFs.

### Requisitos de servidor
- VPS Ubuntu 22.04 (mínimo 1GB RAM)
- Node.js 20+ ou Python 3.11+
- Nginx

### Instalação simplificada

```bash
# No servidor
git clone https://github.com/SEU-ORG/flg-docs.git /var/www/flg
cd /var/www/flg

# Instalar dependências
npm install

# Configurar variáveis
cp .env.example .env
nano .env  # Adicionar ANTHROPIC_API_KEY

# Iniciar servidor
npm start

# Configurar Nginx (porta 3000 → domínio)
# Ver nginx.conf.example
```

### URL de acesso para colaboradores
```
https://docs.fundersled.com.br/novo-cliente
```

O colaborador preenche um formulário com os dados do brief e recebe um link para download dos materiais gerados.

---

## Tempos Estimados por Método

| Método | Setup inicial | Por novo cliente |
|--------|-------------|-----------------|
| Manual | ~0 min | ~60-90 min |
| Script local | ~5 min | ~5 min + edição |
| IA local | ~10 min | ~3 min (geração) + revisão |
| GitHub Actions | ~30 min (uma vez) | ~5 min (commit do brief) |
| VPS + Web | ~2h (uma vez) | ~3 min (formulário) |

---

## Recomendação para a FLG

**Curto prazo (agora):** Opção 2 — script local. Simples, sem custo extra, funciona hoje.

**Médio prazo (próximos 3 meses):** Opção 3 — GitHub Actions. Permite que qualquer colaborador produza materiais sem saber de código.

**Longo prazo (quando o volume justificar):** Opção 4 — VPS com formulário web para máxima facilidade de uso.

---

*FLG · FLG Brazil · Workflow Guide v1.0*
