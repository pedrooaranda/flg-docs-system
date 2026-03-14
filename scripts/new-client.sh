#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  FLG — new-client.sh
#  Cria a estrutura de um novo cliente a partir dos templates oficiais FLG.
#
#  USO:
#    ./scripts/new-client.sh SLUG "NOMES" "EMPRESA" "ESTRATEGISTA" "ANO" "SETOR"
#
#  EXEMPLO:
#    ./scripts/new-client.sh gofit-2 "Rosane & Antonella" "Go Fit" "Pedro Aranda" "2026" "Academia / Fitness"
#
#  RESULTADO:
#    clients/gofit-2/
#    ├── assets/
#    │   └── images/      ← coloque as imagens aqui
#    ├── slides.html      ← template preenchido
#    ├── documento.html   ← template preenchido
#    └── brief.md         ← formulário para preencher
# ─────────────────────────────────────────────────────────────────────────────

set -e

# ── Cores para output ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
GOLD='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ── Verificar argumentos ───────────────────────────────────────────────────
if [ $# -lt 2 ]; then
  echo ""
  echo -e "${GOLD}FLG — Criador de Novo Cliente${NC}"
  echo ""
  echo "USO:"
  echo "  ./scripts/new-client.sh SLUG \"Nomes\" \"Empresa\" \"Estrategista\" \"Ano\" \"Setor\""
  echo ""
  echo "EXEMPLO:"
  echo "  ./scripts/new-client.sh gofit-2 \"Rosane & Antonella\" \"Go Fit\" \"Pedro Aranda\" \"2026\" \"Academia\""
  echo ""
  exit 1
fi

# ── Variáveis ──────────────────────────────────────────────────────────────
SLUG="$1"
CLIENTES="${2:-Clientes}"
EMPRESA="${3:-Empresa}"
ESTRATEGISTA="${4:-Pedro Aranda}"
ANO="${5:-$(date +%Y)}"
SETOR="${6:-Consultoria}"
DATA="$(date '+%B %Y' | sed 's/\b./\u&/g')"

# Calcular caminhos relativos ao repositório
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CLIENT_DIR="$ROOT_DIR/clients/$SLUG"
TEMPLATE_SLIDES="$ROOT_DIR/document_template/slides/template.html"
TEMPLATE_DOC="$ROOT_DIR/document_template/documento/template.html"
INTAKE_FORM="$ROOT_DIR/ai-framework/prompts/client-intake.md"

# ── Verificar se cliente já existe ────────────────────────────────────────
if [ -d "$CLIENT_DIR" ]; then
  echo -e "${RED}Erro:${NC} A pasta clients/$SLUG já existe."
  echo "Use um slug diferente ou remova a pasta manualmente."
  exit 1
fi

echo ""
echo -e "${GOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GOLD}  FLG — Criando novo cliente${NC}"
echo -e "${GOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Slug:          ${BLUE}$SLUG${NC}"
echo -e "  Clientes:      ${BLUE}$CLIENTES${NC}"
echo -e "  Empresa:       ${BLUE}$EMPRESA${NC}"
echo -e "  Estrategista:  ${BLUE}$ESTRATEGISTA${NC}"
echo -e "  Ano:           ${BLUE}$ANO${NC}"
echo -e "  Setor:         ${BLUE}$SETOR${NC}"
echo ""

# ── Criar estrutura de pastas ──────────────────────────────────────────────
echo -e "→ Criando estrutura de pastas..."
mkdir -p "$CLIENT_DIR/assets/images"

# ── Função para substituir placeholders ───────────────────────────────────
replace_placeholders() {
  local FILE="$1"
  # macOS usa sed -i '' | Linux usa sed -i
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' \
      -e "s|{{EMPRESA}}|$EMPRESA|g" \
      -e "s|{{CLIENTES}}|$CLIENTES|g" \
      -e "s|{{ESTRATEGISTA}}|$ESTRATEGISTA|g" \
      -e "s|{{ANO}}|$ANO|g" \
      -e "s|{{DATA}}|$DATA|g" \
      -e "s|{{SETOR}}|$SETOR|g" \
      "$FILE"
  else
    sed -i \
      -e "s|{{EMPRESA}}|$EMPRESA|g" \
      -e "s|{{CLIENTES}}|$CLIENTES|g" \
      -e "s|{{ESTRATEGISTA}}|$ESTRATEGISTA|g" \
      -e "s|{{ANO}}|$ANO|g" \
      -e "s|{{DATA}}|$DATA|g" \
      -e "s|{{SETOR}}|$SETOR|g" \
      "$FILE"
  fi
}

# ── Copiar e preencher slides ──────────────────────────────────────────────
echo -e "→ Gerando slides.html..."
cp "$TEMPLATE_SLIDES" "$CLIENT_DIR/slides.html"
replace_placeholders "$CLIENT_DIR/slides.html"

# ── Copiar e preencher documento ───────────────────────────────────────────
echo -e "→ Gerando documento.html..."
cp "$TEMPLATE_DOC" "$CLIENT_DIR/documento.html"
replace_placeholders "$CLIENT_DIR/documento.html"

# Preencher também o título do documento
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|{{TITULO_DOC}}|Documento Estratégico|g" "$CLIENT_DIR/documento.html"
  sed -i '' "s|{{DESCRICAO}}|Planejamento estratégico elaborado pela Founders Led Growth para $EMPRESA.|g" "$CLIENT_DIR/documento.html"
else
  sed -i "s|{{TITULO_DOC}}|Documento Estratégico|g" "$CLIENT_DIR/documento.html"
  sed -i "s|{{DESCRICAO}}|Planejamento estratégico elaborado pela Founders Led Growth para $EMPRESA.|g" "$CLIENT_DIR/documento.html"
fi

# ── Copiar formulário de intake ─────────────────────────────────────────────
echo -e "→ Criando brief.md..."
cp "$INTAKE_FORM" "$CLIENT_DIR/brief.md"

# Pré-preencher campos básicos no brief
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' \
    -e "s|Nome do cliente:        \[ex: Rosane Pereira\]|Nome do cliente:        $CLIENTES|g" \
    -e "s|Nome da empresa:        \[ex: Go Fit\]|Nome da empresa:        $EMPRESA|g" \
    -e "s|Setor / Indústria:      \[ex: Academia / Fitness\]|Setor / Indústria:      $SETOR|g" \
    -e "s|Estrategista FLG:       \[ex: Pedro Aranda\]|Estrategista FLG:       $ESTRATEGISTA|g" \
    "$CLIENT_DIR/brief.md"
else
  sed -i \
    -e "s|Nome do cliente:        \[ex: Rosane Pereira\]|Nome do cliente:        $CLIENTES|g" \
    -e "s|Nome da empresa:        \[ex: Go Fit\]|Nome da empresa:        $EMPRESA|g" \
    -e "s|Setor / Indústria:      \[ex: Academia / Fitness\]|Setor / Indústria:      $SETOR|g" \
    -e "s|Estrategista FLG:       \[ex: Pedro Aranda\]|Estrategista FLG:       $ESTRATEGISTA|g" \
    "$CLIENT_DIR/brief.md"
fi

# ── Criar PROJECT.md ───────────────────────────────────────────────────────
echo -e "→ Criando PROJECT.md..."
cat > "$CLIENT_DIR/PROJECT.md" << EOF
# $EMPRESA — $CLIENTES

**Estrategista:** $ESTRATEGISTA
**Período:** $ANO
**Setor:** $SETOR

---

## Status do Projeto

- [ ] Brief preenchido (brief.md)
- [ ] Slides gerados e revisados (slides.html)
- [ ] Documento gerado e revisado (documento.html)
- [ ] Imagens adicionadas (assets/images/)
- [ ] PDFs exportados
- [ ] Entregue ao cliente

---

## Arquivos

| Arquivo | Descrição | Status |
|---------|-----------|--------|
| brief.md | Formulário de intake | A preencher |
| slides.html | Apresentação em slides | Template copiado |
| documento.html | Documento estratégico | Template copiado |

---

## Notas

*(Adicione notas internas sobre o projeto aqui)*

---

*Criado em $(date '+%d/%m/%Y') por $ESTRATEGISTA · FLG*
EOF

# ── Resumo final ───────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✓ Cliente criado com sucesso!${NC}"
echo ""
echo -e "  Pasta:  ${BLUE}clients/$SLUG/${NC}"
echo ""
echo -e "  Próximos passos:"
echo -e "  ${GOLD}1.${NC} Preencha o brief:  clients/$SLUG/brief.md"
echo -e "  ${GOLD}2.${NC} Complete os slides: clients/$SLUG/slides.html"
echo -e "  ${GOLD}3.${NC} Complete o doc:     clients/$SLUG/documento.html"
echo -e "  ${GOLD}4.${NC} Adicione imagens:   clients/$SLUG/assets/images/"
echo ""
echo -e "  Ou gere com IA: ${BLUE}./scripts/generate-ai.sh $SLUG${NC}"
echo ""

# ── Abrir arquivos no navegador (macOS) ───────────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
  read -r -p "Abrir slides.html no navegador? [s/N] " OPEN_BROWSER
  if [[ "$OPEN_BROWSER" =~ ^[Ss]$ ]]; then
    open "$CLIENT_DIR/slides.html"
  fi
fi

echo -e "${GOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
