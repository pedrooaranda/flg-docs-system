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

    NUNCA levanta exceção — em qualquer falha (coluna ausente, supabase down,
    LLM erro, etc.) cai pro fallback mais conservador: o nome cru. Isso evita
    quebrar o /onboard-info, que é a única superfície que usa essa função.
    """
    cliente = None

    # Tenta com a coluna nova (caminho normal)
    try:
        result = sb.table("clientes").select("nome, nome_formatado").eq(
            "id", cliente_id
        ).maybe_single().execute()
        cliente = result.data if result else None
    except Exception as e:
        # Coluna nome_formatado pode não existir se a migration não rodou —
        # tenta de novo só com 'nome' pra pelo menos exibir algo.
        logger.warning(
            f"select(nome, nome_formatado) falhou pra {cliente_id} ({e}); "
            f"caindo pra select(nome) — coluna nome_formatado pode estar ausente"
        )
        try:
            result = sb.table("clientes").select("nome").eq(
                "id", cliente_id
            ).maybe_single().execute()
            cliente = result.data if result else None
        except Exception as e2:
            logger.error(f"select(nome) também falhou pra {cliente_id}: {e2}")
            return "—"

    if not cliente:
        return "—"

    cached = (cliente.get("nome_formatado") or "").strip()
    if cached:
        return cached

    nome_raw = (cliente.get("nome") or "").strip()
    if not nome_raw:
        return "—"

    # Tenta LLM — se falhar, retorna title case
    try:
        formatted = _format_with_llm(nome_raw)
    except Exception as e:
        logger.warning(f"_format_with_llm levantou pra '{nome_raw}': {e}")
        return nome_raw.title()

    # Cache opcional — falha aqui não impacta o retorno
    try:
        sb.table("clientes").update(
            {"nome_formatado": formatted}
        ).eq("id", cliente_id).execute()
    except Exception as e:
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
