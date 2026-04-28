"""
Formatador de nome de cliente pra exibição em telas públicas.

USO RESTRITO: somente o link público de onboarding (/instagram/oauth/onboard-info)
chama esta função. Qualquer outro lugar do sistema (admin, métricas, slides,
agente IA) usa o `nome` cru direto do banco.

Pra que serve: clientes vêm cadastrados como "LETICIATOLEDO" (caixa alta tudo
junto) por convenção interna. No link público o cliente vê o próprio nome —
queremos exibir "Letícia Toledo" pra não soar estranho.

Estratégia:
  - Cache em clientes.nome_formatado (lazy-fill na primeira leitura)
  - Chama Claude pra separar palavras + capitalizar + acentuar
  - Fallback pra .title() simples se o LLM falhar (pior caso: sem acento)
"""

import logging

from anthropic import Anthropic

from config import settings

logger = logging.getLogger("flg.nome_formatter")

_client = Anthropic(api_key=settings.anthropic_api_key)

_FORMAT_PROMPT = (
    "Formate este nome próprio brasileiro corretamente: separe palavras quando "
    "estiverem coladas, capitalize cada palavra (Title Case respeitando "
    "preposições como 'de', 'da', 'do', 'dos', 'das' em minúsculas no meio), "
    "e adicione acentos quando necessário.\n\n"
    "Exemplos:\n"
    '  "LETICIATOLEDO" → Letícia Toledo\n'
    '  "MARIAJOSEDASILVA" → Maria José da Silva\n'
    '  "JOAOPEDRODEOLIVEIRA" → João Pedro de Oliveira\n'
    '  "ANA CLARA" → Ana Clara\n'
    '  "CAUE" → Cauê\n\n'
    "Responda APENAS com o nome formatado, sem aspas, sem explicação, sem "
    "nada além do nome.\n\n"
    "Nome: {nome_raw}"
)


def formatar_nome_cliente(sb, cliente_id: str) -> str:
    """
    Retorna nome formatado pra exibição pública.
    Cache em clientes.nome_formatado — chama LLM só na primeira leitura.
    """
    result = sb.table("clientes").select("nome, nome_formatado").eq(
        "id", cliente_id
    ).maybe_single().execute()

    if not result or not result.data:
        return "—"

    cliente = result.data
    cached = (cliente.get("nome_formatado") or "").strip()
    if cached:
        return cached

    nome_raw = (cliente.get("nome") or "").strip()
    if not nome_raw:
        return "—"

    formatted = _format_with_llm(nome_raw)

    try:
        sb.table("clientes").update(
            {"nome_formatado": formatted}
        ).eq("id", cliente_id).execute()
    except Exception as e:
        # Cache opcional — se falhar, retorna o formato e tenta de novo na próxima
        logger.warning(f"Falha ao salvar nome_formatado pra {cliente_id}: {e}")

    return formatted


def _format_with_llm(nome_raw: str) -> str:
    """
    Chama Claude pra formatar nome próprio brasileiro.
    Em caso de erro, retorna .title() (sem acento, mas ao menos legível).
    """
    try:
        response = _client.messages.create(
            model="claude-opus-4-7",
            max_tokens=80,
            messages=[
                {
                    "role": "user",
                    "content": _FORMAT_PROMPT.format(nome_raw=nome_raw),
                }
            ],
        )
        for block in response.content:
            if block.type == "text":
                cleaned = block.text.strip().strip('"').strip("'")
                if cleaned:
                    return cleaned
        # Resposta vazia — fallback
        logger.warning(f"LLM retornou vazio pra '{nome_raw}' — fallback title case")
        return nome_raw.title()
    except Exception as e:
        logger.warning(f"LLM falhou pra '{nome_raw}': {e} — fallback title case")
        return nome_raw.title()
