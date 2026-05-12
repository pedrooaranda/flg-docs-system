"""
Geração de HTML do design system FLG via Claude Sonnet 4.6.

Pipeline:
  1. Lê os 3 arquivos do design system (FLG-DESIGN-SYSTEM.md + flg.css + deck-template.html)
     UMA VEZ em memória no startup do módulo (evita I/O por request).
  2. Monta system prompt com cache_control:ephemeral nos blocos grandes
     (design system) — Anthropic faz cache server-side por ~5min.
  3. Chama Claude com max_tokens=8000, temperature=0.3 (HTML estruturado, não criativo),
     stop_sequences=["</body>"] pra cortar lixo no fim.
  4. Valida HTML retornado: parsing via BeautifulSoup, checa que todas as
     classes CSS usadas estão em WHITELIST_CLASSES (extraído do flg.css).
  5. Conta slides (<section class="slide">) e retorna (html, num_slides).

Cache de prompt economiza ~90% do custo de input em runs sequenciais.
"""

import logging
import re
from pathlib import Path
from typing import Tuple

import anthropic
from bs4 import BeautifulSoup

from config import settings

logger = logging.getLogger("flg.claude_html")

_claude = anthropic.Anthropic(api_key=settings.anthropic_api_key)

# Caminho da pasta do design system (relativo à raiz do repo)
_DS_DIR = Path(__file__).parent.parent.parent / "flg-design-system"


def _read_ds_file(rel_path: str) -> str:
    """Lê arquivo do design system. Retorna string vazia se não existir."""
    p = _DS_DIR / rel_path
    if not p.exists():
        logger.warning(f"Design system file não encontrado: {p}")
        return ""
    return p.read_text(encoding="utf-8")


# Cache em memória dos arquivos do design system (lidos UMA vez no import)
_DS_MD = _read_ds_file("FLG-DESIGN-SYSTEM.md")
_DS_CSS = _read_ds_file("css/flg.css")
_DS_TEMPLATE = _read_ds_file("templates/deck-template.html")


def _extract_allowed_classes(css_content: str) -> set[str]:
    """
    Extrai todas as classes CSS definidas no flg.css.
    Match `.classe-nome { ... }` ou `.classe-nome,` ou `.classe-nome.outra`.
    Retorna set de strings sem o ponto.
    """
    pattern = re.compile(r"\.([a-zA-Z][a-zA-Z0-9_-]*)(?=[\s.,:{])")
    classes = set(pattern.findall(css_content))
    # Adiciona classes que aparecem no template HTML mas podem não estar no CSS direto
    template_classes = re.findall(r'class="([^"]+)"', _DS_TEMPLATE)
    for cls_attr in template_classes:
        for cls in cls_attr.split():
            classes.add(cls)
    return classes


_ALLOWED_CLASSES = _extract_allowed_classes(_DS_CSS)
logger.info(f"claude_html_generator: {len(_ALLOWED_CLASSES)} classes CSS no allowlist")


def _build_system_prompt() -> list:
    """
    Monta system prompt com cache_control:ephemeral nos blocos grandes.

    Blocos:
      1. Role + regras curtas (sem cache — instrução curta varia pouco)
      2. FLG-DESIGN-SYSTEM.md inteiro (cache — ~13K tokens, estável)
      3. flg.css inteiro (cache — ~25K tokens, estável)
      4. deck-template.html (cache — ~5K tokens, estável)
      5. Output rules (sem cache — pode ajustar por chamada)
    """
    return [
        {
            "type": "text",
            "text": (
                "Você é o gerador oficial de slides HTML da FLG Brasil. "
                "Sua função é converter uma estrutura textual simples "
                "(blocos no formato 'SLIDE N / Título / Conteúdo') em HTML "
                "100% válido seguindo o design system FLG (preto + dourado, sóbrio, cinematográfico)."
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
                "1. Retorne APENAS HTML válido. Sem markdown, sem ```html, sem texto fora das tags.\n"
                "2. Cada slide é uma <section class=\"slide\" data-screen-label=\"NN Título\">.\n"
                "3. Slide 1 é capa: use .stage--center + logo FLG centralizada (.flg-mark) + .d-mega + .gold-divider.\n"
                "4. Slides intermediários: logo no canto via <img class=\"flg-mark--corner\"> + .stage com .stage-bg.\n"
                "5. Último slide: logo centralizada novamente + frase de fechamento sóbria.\n"
                "6. Use APENAS classes que existem no css_flg acima. Não invente classes.\n"
                "7. Para listas numeradas (1./2./3.): use componente .entries com .entry/.entry-num/.entry-text.\n"
                "8. Para 2-4 pilares com título+descrição: use .pillars com .pillar.\n"
                "9. Para citações/destaques: use .body-lg com <em> dourado pra grifo (max 1-3 por slide).\n"
                "10. SEM travessões longos (—). Use pontos ou vírgulas.\n"
                "11. SEM nome de cliente nos slides (HTML é reutilizável pra qualquer founder).\n"
                "12. Saída completa começa com a primeira <section class=\"slide\"> e termina com a última </section>. NÃO inclua <html>, <head>, <body> wrapper — o backend monta o documento completo.\n"
                "</output_rules>"
            ),
        },
    ]


def _validate_html(html: str) -> Tuple[bool, str]:
    """
    Valida HTML gerado:
      - É parseável?
      - Todas as classes usadas estão no allowlist?
      - Tem pelo menos 1 <section class="slide">?

    Returns (ok, error_message).
    """
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
    for element in soup.find_all(class_=True):
        cls_attr = element.get("class")
        if isinstance(cls_attr, list):
            used_classes.update(cls_attr)
        elif isinstance(cls_attr, str):
            used_classes.update(cls_attr.split())

    unknown = used_classes - _ALLOWED_CLASSES
    # Permite classes utilitárias semânticas que Claude pode inventar
    # (ex: state classes que aparecem só com JS). Filtramos as óbvias.
    UTILITY_WHITELIST = {"active", "current", "visible", "hidden", "open"}
    unknown -= UTILITY_WHITELIST

    if unknown:
        # Falha apenas se mais de 3 classes desconhecidas (tolera ruído pequeno)
        if len(unknown) > 3:
            return False, f"Classes CSS não permitidas: {sorted(unknown)[:10]}"
        logger.warning(f"_validate_html: tolerando {len(unknown)} classe(s) desconhecida(s): {sorted(unknown)}")

    return True, ""


def _extract_html_only(raw: str) -> str:
    """
    Claude pode retornar com markdown wrapper ou texto extra antes/depois.
    Extrai apenas a primeira <section> até a última </section>.
    """
    raw = raw.strip()
    # Remove markdown wrapper se houver
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:html)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
    # Pega tudo entre primeira <section e última </section>
    match = re.search(r"<section[^>]*class=[\"']slide[\"'][^>]*>.*</section>", raw, re.DOTALL)
    if match:
        return match.group(0).strip()
    return raw.strip()


def generate_intelecto_html(intelecto_estrutura: str, encontro_numero: int) -> dict:
    """Gera HTML do design system via Claude.

    Retry strategy: na 1ª tentativa, manda só a estrutura. Se validação falhar,
    a 2ª tentativa é uma continuação da conversa (multi-turn) — manda o output
    anterior + a mensagem de erro pro Claude corrigir. Isso dá feedback real
    em vez de re-rodar a mesma chamada com temperature baixa (que geraria saída
    quase idêntica e o mesmo erro).
    """
    if not intelecto_estrutura or not intelecto_estrutura.strip():
        raise ValueError("intelecto_estrutura vazia — escreva pelo menos um SLIDE")

    initial_user_message = (
        f"Encontro {encontro_numero}. Estrutura abaixo. "
        f"Converta em HTML do design system FLG. "
        f"Retorne APENAS as <section class=\"slide\">, sem html/head/body wrapper.\n\n"
        f"<estrutura>\n{intelecto_estrutura.strip()}\n</estrutura>"
    )

    # Conversation accumulada — começa com a mensagem inicial.
    # Em caso de retry, adicionamos o output do Claude + a mensagem de erro.
    messages = [{"role": "user", "content": initial_user_message}]

    last_error = None
    last_raw = None

    for attempt in range(2):  # 1 tentativa + 1 retry com feedback
        try:
            logger.info(
                f"generate_intelecto_html: encontro {encontro_numero}, attempt {attempt+1}, "
                f"messages={len(messages)}"
            )
            response = _claude.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=8000,
                temperature=0.3,
                stop_sequences=["</body>", "```"],
                system=_build_system_prompt(),
                messages=messages,
            )
            raw = response.content[0].text
            last_raw = raw
            html = _extract_html_only(raw)

            ok, err = _validate_html(html)
            if not ok:
                last_error = err
                logger.warning(
                    f"generate_intelecto_html: validação falhou (attempt {attempt+1}): {err}"
                )
                if attempt == 0:
                    # Constrói retry com feedback explícito — multi-turn conversa
                    messages.append({"role": "assistant", "content": raw})
                    messages.append({
                        "role": "user",
                        "content": (
                            f"O HTML acima tem problema: {err}\n\n"
                            f"Corrija e retorne APENAS o HTML válido (sem markdown wrapper, "
                            f"sem ```, começando direto na primeira <section class=\"slide\">). "
                            f"Use APENAS classes do css_flg que está no system prompt."
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
            logger.error(
                f"generate_intelecto_html: Claude API erro (attempt {attempt+1}): {e}"
            )
            last_error = str(e)
            if attempt == 0:
                # Em erro de API, retry MESMA chamada (sem multi-turn) — error de infra
                continue
            raise RuntimeError(f"Claude API falhou após 2 tentativas: {last_error}")

    raise RuntimeError(f"Falha inesperada: {last_error}")
