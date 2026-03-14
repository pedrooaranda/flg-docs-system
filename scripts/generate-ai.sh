#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  FLG — generate-ai.sh
#  Gera slides e/ou documento estratégico usando Claude API (Anthropic).
#
#  PRÉ-REQUISITOS:
#    - ANTHROPIC_API_KEY em .env ou como variável de ambiente
#    - curl e jq instalados (brew install jq)
#    - brief.md preenchido em clients/SLUG/
#
#  USO:
#    ./scripts/generate-ai.sh SLUG [slides|documento|ambos]
#
#  EXEMPLOS:
#    ./scripts/generate-ai.sh gofit-novo
#    ./scripts/generate-ai.sh gofit-novo slides
#    ./scripts/generate-ai.sh gofit-novo documento
# ─────────────────────────────────────────────────────────────────────────────

set -e

# ── Cores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
GOLD='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── Caminhos ───────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Carregar .env ──────────────────────────────────────────────────────────
if [ -f "$ROOT_DIR/.env" ]; then
  export $(grep -v '^#' "$ROOT_DIR/.env" | xargs)
fi

# ── Verificar argumentos ───────────────────────────────────────────────────
if [ -z "$1" ]; then
  echo ""
  echo -e "${GOLD}FLG — Gerador de Materiais com IA${NC}"
  echo ""
  echo "USO:"
  echo "  ./scripts/generate-ai.sh SLUG [slides|documento|ambos]"
  echo ""
  echo "EXEMPLO:"
  echo "  ./scripts/generate-ai.sh gofit-novo"
  echo ""
  exit 1
fi

SLUG="$1"
MODE="${2:-ambos}"
CLIENT_DIR="$ROOT_DIR/clients/$SLUG"

# ── Verificações ───────────────────────────────────────────────────────────
if [ ! -d "$CLIENT_DIR" ]; then
  echo -e "${RED}Erro:${NC} Pasta clients/$SLUG não encontrada."
  echo "Execute primeiro: ./scripts/new-client.sh $SLUG ..."
  exit 1
fi

if [ ! -f "$CLIENT_DIR/brief.md" ]; then
  echo -e "${RED}Erro:${NC} brief.md não encontrado em clients/$SLUG/"
  echo "Preencha o formulário de intake antes de gerar."
  exit 1
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo -e "${RED}Erro:${NC} ANTHROPIC_API_KEY não configurada."
  echo "Adicione ao arquivo .env:"
  echo "  ANTHROPIC_API_KEY=sk-ant-..."
  echo ""
  echo "Obtenha sua chave em: https://console.anthropic.com/"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo -e "${RED}Erro:${NC} 'jq' não instalado."
  echo "Instale com: brew install jq"
  exit 1
fi

# ── Função para chamar Claude API ──────────────────────────────────────────
call_claude() {
  local SYSTEM_PROMPT="$1"
  local USER_CONTENT="$2"
  local OUTPUT_FILE="$3"

  echo -e "  → Chamando Claude API..."

  # Escapar para JSON
  local SYSTEM_JSON
  SYSTEM_JSON=$(echo "$SYSTEM_PROMPT" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))")
  local USER_JSON
  USER_JSON=$(echo "$USER_CONTENT" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))")

  local RESPONSE
  RESPONSE=$(curl -s https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "{
      \"model\": \"claude-opus-4-6\",
      \"max_tokens\": 16000,
      \"system\": $SYSTEM_JSON,
      \"messages\": [{\"role\": \"user\", \"content\": $USER_JSON}]
    }")

  # Verificar erro na resposta
  local ERROR
  ERROR=$(echo "$RESPONSE" | jq -r '.error.message // empty' 2>/dev/null)
  if [ -n "$ERROR" ]; then
    echo -e "${RED}Erro da API:${NC} $ERROR"
    exit 1
  fi

  # Extrair conteúdo
  echo "$RESPONSE" | jq -r '.content[0].text' > "$OUTPUT_FILE"
  echo -e "  ${GREEN}✓${NC} Salvo em: $OUTPUT_FILE"
}

# ── Banner ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GOLD}  FLG — Geração com IA · cliente: $SLUG${NC}"
echo -e "${GOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

BRIEF=$(cat "$CLIENT_DIR/brief.md")

# ── Gerar Slides ───────────────────────────────────────────────────────────
if [ "$MODE" = "slides" ] || [ "$MODE" = "ambos" ]; then
  echo -e "${BLUE}[1/2] Gerando slides.html...${NC}"

  SLIDES_SYSTEM=$(cat "$ROOT_DIR/ai-framework/prompts/slides-generation.md")
  SLIDES_TEMPLATE=$(cat "$ROOT_DIR/document_template/slides/template.html")

  SLIDES_USER="Brief do cliente:
---
$BRIEF
---

Template HTML a ser preenchido:
---
$SLIDES_TEMPLATE
---

Preencha TODOS os {{PLACEHOLDERS}} com conteúdo real e relevante baseado no brief.
Retorne APENAS o HTML completo, sem nenhum texto adicional."

  call_claude "$SLIDES_SYSTEM" "$SLIDES_USER" "$CLIENT_DIR/slides.html"
fi

# ── Gerar Documento ────────────────────────────────────────────────────────
if [ "$MODE" = "documento" ] || [ "$MODE" = "ambos" ]; then
  echo -e "${BLUE}[2/2] Gerando documento.html...${NC}"

  DOC_SYSTEM=$(cat "$ROOT_DIR/ai-framework/prompts/documento-generation.md")
  DOC_TEMPLATE=$(cat "$ROOT_DIR/document_template/documento/template.html")

  DOC_USER="Brief do cliente:
---
$BRIEF
---

Template HTML a ser preenchido:
---
$DOC_TEMPLATE
---

Preencha TODOS os {{PLACEHOLDERS}} com conteúdo completo e detalhado baseado no brief.
Expanda cada seção com profundidade estratégica real.
Retorne APENAS o HTML completo, sem nenhum texto adicional."

  call_claude "$DOC_SYSTEM" "$DOC_USER" "$CLIENT_DIR/documento.html"
fi

# ── Resultado ──────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✓ Geração concluída!${NC}"
echo ""
echo -e "  Arquivos gerados em: ${BLUE}clients/$SLUG/${NC}"
echo ""
echo -e "  Próximos passos:"
echo -e "  ${GOLD}1.${NC} Revise o conteúdo gerado"
echo -e "  ${GOLD}2.${NC} Adicione imagens em: clients/$SLUG/assets/images/"
echo -e "  ${GOLD}3.${NC} Abra no Chrome e exporte como PDF"
echo ""

# ── Abrir no navegador (macOS) ─────────────────────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]] && [ "$MODE" = "slides" ] || [ "$MODE" = "ambos" ]; then
  read -r -p "Abrir slides.html no navegador? [s/N] " OPEN
  if [[ "$OPEN" =~ ^[Ss]$ ]]; then
    open "$CLIENT_DIR/slides.html"
  fi
fi

echo -e "${GOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
