"""
Chat consultor↔Claude pra produção da parte PRÁTICA do encontro (por cliente).

Pipeline:
  1. System prompt reusa cache do design system (mesmos 3 arquivos do Phase A intelectual).
  2. Adiciona contexto do encontro (intelecto_estrutura + html_intelecto) e perfil do cliente.
  3. Streaming SSE — Claude responde incrementalmente, frontend mostra tokens chegando.
  4. Endpoint `gerar` chama Claude com instrução final "produza HTML completo" — não streaming,
     valida HTML pelo mesmo allowlist do intelectual, retorna pronto pra persistir.

Reutiliza `_DS_MD`, `_DS_CSS`, `_DS_TEMPLATE` e `_ALLOWED_CLASSES` de claude_html_generator
pra não duplicar I/O de startup.
"""

import logging
import re
from typing import AsyncGenerator, Optional

import anthropic
from bs4 import BeautifulSoup

from config import settings
from services.claude_html_generator import (
    _DS_MD,
    _DS_CSS,
    _DS_TEMPLATE,
    _ALLOWED_CLASSES,
    _extract_html_only,
)

logger = logging.getLogger("flg.claude_chat_pratica")

_claude = anthropic.Anthropic(api_key=settings.anthropic_api_key)


def _build_system_prompt(encontro: dict, cliente: dict) -> list:
    """
    System prompt com cache nos blocos grandes (design system) + contexto
    do encontro e do cliente em blocos não-cached (mudam por chamada).
    """
    intelecto_estrutura = (encontro or {}).get("intelecto_estrutura") or ""
    intelecto_base = (encontro or {}).get("intelecto_base") or ""
    titulo = (encontro or {}).get("titulo") or f"Encontro {encontro.get('numero')}"

    cliente_blob = (
        f"Nome do founder: {cliente.get('nome', '?')}\n"
        f"Empresa: {cliente.get('empresa', '?')}\n"
        f"Encontro atual do cliente: {cliente.get('encontro_atual', '?')}\n"
        f"Tom de voz preferido: {cliente.get('tom_de_voz') or 'não definido'}\n"
        f"Consultor responsável: {cliente.get('consultor_responsavel', '?')}\n"
    )

    return [
        {
            "type": "text",
            "text": (
                "Você é o assistente FLG de produção da parte PRÁTICA dos encontros. "
                "Conversa com o CONSULTOR pra entender contexto específico do cliente, "
                "perguntar o que faltar, e ao final produzir HTML de slides práticos "
                "100% alinhados ao design system FLG. "
                "Você NÃO inventa fatos — pergunta quando precisar. "
                "Quando o consultor estiver satisfeito e pedir HTML final, você gera as <section class=\"slide\"> "
                "diretamente, SEM nome do cliente nos slides (HTML deve ser reutilizável)."
            ),
        },
        {
            "type": "text",
            "text": f"<design_system_docs>\n{_DS_MD}\n</design_system_docs>",
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": f"<css_flg>\n{_DS_CSS}\n</css_flg>",
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": f"<deck_template_html>\n{_DS_TEMPLATE}\n</deck_template_html>",
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": (
                f"<encontro_intelectual>\n"
                f"Título: {titulo}\n\n"
                f"Estrutura (parte intelectual fixa que vai antes da prática):\n{intelecto_estrutura}\n\n"
                f"Texto base do intelectual:\n{intelecto_base}\n"
                f"</encontro_intelectual>"
            ),
        },
        {
            "type": "text",
            "text": f"<cliente_atual>\n{cliente_blob}</cliente_atual>",
        },
        {
            "type": "text",
            "text": (
                "<chat_rules>\n"
                "1. Conversa em pt-BR, tom profissional sem ser robótico.\n"
                "2. Faça no máximo 2-3 perguntas por turno. Não despeje uma lista enorme.\n"
                "3. Antes de propor slides, entenda: problema concreto do cliente, métricas/números relevantes, contexto comercial.\n"
                "4. Quando propor slides, descreva curto: 'Slide 1: diagnóstico (LTV vs ticket)', 'Slide 2: ...'. NÃO gere HTML aqui — só quando pedido explicitamente via 'gerar'.\n"
                "5. Sem travessões longos (—). Sem nome do cliente nos slides finais.\n"
                "</chat_rules>"
            ),
        },
    ]


def _build_generation_prompt() -> list:
    """System prompt da geração final (não-streaming, igual ao do intelectual)."""
    return [
        {
            "type": "text",
            "text": (
                "Você está produzindo o HTML PRÁTICO final do encontro com base na conversa anterior "
                "com o consultor. Saída: APENAS <section class=\"slide\"> ... </section>, "
                "uma por slide. Sem markdown, sem html/head/body wrapper."
            ),
        },
        {
            "type": "text",
            "text": f"<design_system_docs>\n{_DS_MD}\n</design_system_docs>",
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": f"<css_flg>\n{_DS_CSS}\n</css_flg>",
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": f"<deck_template_html>\n{_DS_TEMPLATE}\n</deck_template_html>",
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": (
                "<output_rules>\n"
                "1. APENAS HTML. Sem markdown, sem ```html, sem texto fora das tags.\n"
                "2. Cada slide é uma <section class=\"slide\" data-screen-label=\"NN Título\">.\n"
                "3. NÃO inclua slide de capa nem fechamento — esses vêm da parte intelectual. "
                "Aqui é só o miolo da prática (slides intermediários: .stage com .stage-bg + .flg-mark--corner).\n"
                "4. Use APENAS classes do css_flg. Não invente classes.\n"
                "5. SEM nome de cliente nos slides. HTML deve ser reutilizável.\n"
                "6. SEM travessões longos (—). Use pontos ou vírgulas.\n"
                "7. 3-7 slides ideais. Foco em concretude, números, ação.\n"
                "</output_rules>"
            ),
        },
    ]


def _validate_pratica_html(html: str) -> tuple[bool, str]:
    """Valida HTML prática — mesmo allowlist do intelectual."""
    if not html or not html.strip():
        return False, "HTML vazio"
    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception as e:
        return False, f"HTML não parseável: {e}"

    slides = soup.select("section.slide")
    if not slides:
        return False, "Nenhuma <section class='slide'> encontrada"

    used_classes = set()
    for el in soup.find_all(class_=True):
        cls_attr = el.get("class")
        if isinstance(cls_attr, list):
            used_classes.update(cls_attr)
        elif isinstance(cls_attr, str):
            used_classes.update(cls_attr.split())

    UTILITY_WHITELIST = {"active", "current", "visible", "hidden", "open"}
    unknown = used_classes - _ALLOWED_CLASSES - UTILITY_WHITELIST
    if len(unknown) > 3:
        return False, f"Classes CSS não permitidas: {sorted(unknown)[:10]}"
    if unknown:
        logger.warning(f"_validate_pratica_html: tolerando {len(unknown)} classe(s) desconhecida(s): {sorted(unknown)}")
    return True, ""


def stream_chat_turn(
    conversa_anterior: list,
    nova_mensagem_user: str,
    encontro: dict,
    cliente: dict,
) -> AsyncGenerator[str, None]:
    """
    Gera chunks do Claude (streaming) pro próximo turno do chat.

    Args:
        conversa_anterior: lista [{role, content, ...}] do histórico salvo no DB.
        nova_mensagem_user: mensagem que o consultor acaba de mandar.
        encontro: row de encontros_base com intelecto.
        cliente: row de clientes.

    Yields:
        deltas de texto (string). Caller aplica o protocolo SSE em volta.
    """
    # Sanitiza conversa_anterior pro shape esperado pela Anthropic SDK
    messages = []
    for turn in conversa_anterior or []:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": str(content)})
    messages.append({"role": "user", "content": nova_mensagem_user})

    system_prompt = _build_system_prompt(encontro, cliente)

    with _claude.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        temperature=0.7,
        system=system_prompt,
        messages=messages,
    ) as stream:
        for text_chunk in stream.text_stream:
            if text_chunk:
                yield text_chunk


def generate_pratica_html(
    conversa: list,
    encontro: dict,
    cliente: dict,
) -> dict:
    """
    Pede pro Claude produzir o HTML prática FINAL baseado na conversa acumulada.

    Não streaming — chamada única, retorna {html, num_slides, tokens}.
    Multi-turn retry com feedback se HTML inválido (mesmo padrão de Phase A).
    """
    if not conversa:
        raise ValueError("Conversa vazia — converse com o assistente antes de gerar")

    # Reusa a conversa como contexto. Última mensagem é instrução explícita de gerar.
    messages = []
    for turn in conversa:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": str(content)})

    messages.append({
        "role": "user",
        "content": (
            "Agora produza o HTML completo da parte prática deste encontro pra este cliente. "
            "Retorne APENAS as <section class=\"slide\"> em sequência, sem texto antes nem depois. "
            "Sem nome do cliente, sem capa, sem fechamento — só o miolo prático."
        ),
    })

    last_error: Optional[str] = None
    for attempt in range(2):
        try:
            logger.info(f"generate_pratica_html: attempt {attempt+1}, messages={len(messages)}")
            response = _claude.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=8000,
                temperature=0.3,
                stop_sequences=["</body>", "```"],
                system=_build_generation_prompt(),
                messages=messages,
            )
            raw = response.content[0].text
            html = _extract_html_only(raw)

            ok, err = _validate_pratica_html(html)
            if not ok:
                last_error = err
                logger.warning(f"generate_pratica_html: validação falhou (attempt {attempt+1}): {err}")
                if attempt == 0:
                    messages.append({"role": "assistant", "content": raw})
                    messages.append({
                        "role": "user",
                        "content": (
                            f"O HTML acima tem problema: {err}\n\n"
                            f"Corrija e retorne APENAS o HTML válido (sem markdown wrapper, "
                            f"começando direto na primeira <section class=\"slide\">). "
                            f"Use APENAS classes do css_flg."
                        ),
                    })
                    continue
                raise RuntimeError(f"HTML inválido após 2 tentativas: {err}")

            soup = BeautifulSoup(html, "html.parser")
            num_slides = len(soup.select("section.slide"))
            usage = response.usage

            return {
                "html": html,
                "num_slides": num_slides,
                "cached_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
            }
        except (anthropic.APIError, anthropic.APIConnectionError) as e:
            logger.error(f"generate_pratica_html: Claude API erro (attempt {attempt+1}): {e}")
            last_error = str(e)
            if attempt == 0:
                continue
            raise RuntimeError(f"Claude API falhou após 2 tentativas: {last_error}")

    raise RuntimeError(f"Falha inesperada: {last_error}")
