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

# Client com retry agressivo:
# - max_retries=5 (default=2) → SDK faz exponential backoff com jitter, cobrindo 529 (overloaded_error),
#   429 (rate limit) e 5xx transientes em até ~60s totais.
# - timeout=120s (default=600s) → mais agressivo pro caso de pedido travar.
# Ver: https://github.com/anthropics/anthropic-sdk-python
_claude = anthropic.Anthropic(
    api_key=settings.anthropic_api_key,
    max_retries=5,
    timeout=120.0,
)

# Modelo principal e fallback (caso 529 persista após retries).
_MODEL_PRIMARY = "claude-sonnet-4-6"
_MODEL_FALLBACK = "claude-haiku-4-5"  # menor capacidade mas raramente fica overloaded

# Caminho da pasta do design system. No host (dev): frontend/public/flg-design-system.
# No container: pode ser sobrescrito via env FLG_DESIGN_SYSTEM_PATH (mount via docker-compose).
import os as _os
_DS_DIR = Path(
    _os.getenv("FLG_DESIGN_SYSTEM_PATH")
    or (Path(__file__).parent.parent.parent / "frontend" / "public" / "flg-design-system")
)


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
                "3. **TODOS os slides DEVEM mostrar a logo FLG**:\n"
                "   - Slide 1 (capa): logo grande centralizada → <img src=\"/flg-design-system/assets/logo-flg.png\" alt=\"FLG Brasil\" class=\"flg-mark reveal d0\"> dentro de .stage--center.\n"
                "   - Slides intermediários: logo discreta no canto → <img src=\"/flg-design-system/assets/logo-flg.png\" alt=\"FLG\" class=\"flg-mark--corner\"> NO INÍCIO DA <section>, antes do .stage.\n"
                "   - Último slide: logo grande centralizada NOVAMENTE como na capa (.flg-mark reveal d0 dentro de .stage--center).\n"
                "4. **SEMPRE use path absoluto pra logo**: /flg-design-system/assets/logo-flg.png (NÃO use ../assets/ — paths relativos quebram quando o HTML é servido em rotas diferentes).\n"
                "5. Slide 1 (capa): .stage--center + .flg-mark + .eyebrow + .d-mega + .gold-divider + frase de gancho.\n"
                "6. Slides intermediários: .flg-mark--corner + .stage com .stage-bg + conteúdo.\n"
                "7. Último slide: .stage--center + .flg-mark + .d-md/.d-lg com frase de fechamento sóbria + .gold-divider.\n"
                "8. Use APENAS classes que existem no css_flg acima. Não invente classes.\n"
                "9. Para listas numeradas (1./2./3.): use componente .entries com .entry/.entry-num/.entry-text.\n"
                "10. Para 2-4 pilares com título+descrição: use .pillars com .pillar.\n"
                "11. Para citações/destaques: use .body-lg com <em> dourado pra grifo (max 1-3 por slide).\n"
                "12. SEM travessões longos (—). Use pontos ou vírgulas.\n"
                "13. SEM nome de cliente nos slides (HTML é reutilizável pra qualquer founder).\n"
                "14. Saída completa começa com a primeira <section class=\"slide\"> e termina com a última </section>. NÃO inclua <html>, <head>, <body> wrapper — o backend monta o documento completo.\n"
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


def normalize_asset_paths(html: str) -> str:
    """Alias público — endpoints podem chamar isso pra blindar HTMLs antigos do DB."""
    return _normalize_asset_paths(html)


def _normalize_asset_paths(html: str) -> str:
    """Reescreve paths relativos do design system (../assets/ etc.) pra absolutos.

    Por que: o template oficial usa `../assets/logo-flg.png` (relativo ao arquivo de template).
    Quando o HTML é servido em outras rotas (/api/apresentar/:slug, blob URL fullscreen,
    iframe srcDoc), o relativo aponta pra lugares errados e a logo não carrega.

    Normaliza pra `/flg-design-system/assets/logo-flg.png` que resolve sempre via Nginx
    (mesma origem em todas as rotas do app + apresentação pública).
    """
    if not html:
        return html
    # ../assets/X → /flg-design-system/assets/X
    html = re.sub(r'(["\'])\.\./assets/', r'\1/flg-design-system/assets/', html)
    # assets/X (sem dois pontos) no início de src/href → /flg-design-system/assets/X
    html = re.sub(r'(src|href)=(["\'])assets/', r'\1=\2/flg-design-system/assets/', html)
    # ../css/X → /flg-design-system/css/X (raro mas pra blindar)
    html = re.sub(r'(["\'])\.\./css/', r'\1/flg-design-system/css/', html)
    # ../js/X → /flg-design-system/js/X
    html = re.sub(r'(["\'])\.\./js/', r'\1/flg-design-system/js/', html)
    return html


def _extract_html_only(raw: str) -> str:
    """
    Claude pode retornar com markdown wrapper ou texto extra antes/depois.
    Extrai apenas a primeira <section> até a última </section>.
    Normaliza paths de assets pra absolutos (resiliente contra paths relativos).
    """
    raw = raw.strip()
    # Remove markdown wrapper se houver
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:html)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
    # Pega tudo entre primeira <section e última </section>
    match = re.search(r"<section[^>]*class=[\"']slide[\"'][^>]*>.*</section>", raw, re.DOTALL)
    html = match.group(0).strip() if match else raw.strip()
    return _normalize_asset_paths(html)


def _call_claude(model: str, messages: list, max_tokens: int = 16000) -> tuple:
    """Chama Claude e retorna (raw_text, response). SDK faz retry automático
    em 408/409/429/5xx (inclui 529) com exponential backoff jitter (max_retries=5).

    Levanta:
      - anthropic.APIStatusError com .status_code se ainda falhar após retries
      - anthropic.APIConnectionError em problemas de rede
    """
    response = _claude.messages.create(
        model=model,
        max_tokens=max_tokens,
        temperature=0.3,
        stop_sequences=["</body>"],
        system=_build_system_prompt(),
        messages=messages,
    )
    raw = ""
    for block in response.content or []:
        if getattr(block, "type", None) == "text":
            raw += getattr(block, "text", "") or ""
    return raw, response


def _is_overloaded_error(exc: Exception) -> bool:
    """True quando erro é Claude API overloaded (529) ou rate-limited (429)."""
    if isinstance(exc, anthropic.APIStatusError):
        return exc.status_code in (429, 529)
    return False


def generate_intelecto_html(intelecto_estrutura: str, encontro_numero: int) -> dict:
    """Gera HTML do design system via Claude.

    Estratégia de robustez:
      1. SDK retry automático (max_retries=5, exponential backoff) cobre 5xx/429/529 transientes.
      2. Se Sonnet 4.6 ainda falhar com 529/429 após retries → fallback automático pra Haiku 4.5.
      3. Validation retry multi-turn: se HTML inválido, dá feedback explícito pro Claude corrigir.
    """
    if not intelecto_estrutura or not intelecto_estrutura.strip():
        raise ValueError("intelecto_estrutura vazia — escreva pelo menos um SLIDE")

    initial_user_message = (
        f"Encontro {encontro_numero}. Estrutura abaixo. "
        f"Converta em HTML do design system FLG. "
        f"Retorne APENAS as <section class=\"slide\">, sem html/head/body wrapper.\n\n"
        f"<estrutura>\n{intelecto_estrutura.strip()}\n</estrutura>"
    )

    messages = [{"role": "user", "content": initial_user_message}]

    # Lista de modelos a tentar em ordem. Cada um já tem 5 retries internos do SDK.
    models_to_try = [_MODEL_PRIMARY, _MODEL_FALLBACK]
    last_error: Optional[str] = None
    response = None
    raw = ""
    used_model: Optional[str] = None

    # ─── Etapa 1: obter resposta válida do Claude (com fallback de modelo) ───
    for model in models_to_try:
        try:
            logger.info(f"generate_intelecto_html: tentando modelo {model} (encontro {encontro_numero})")
            raw, response = _call_claude(model, messages)
            used_model = model
            # Detecta truncamento por max_tokens (HTML cortado no meio)
            stop_reason = getattr(response, "stop_reason", None)
            if stop_reason == "max_tokens":
                logger.warning(
                    f"generate_intelecto_html: {model} truncou (stop_reason=max_tokens, "
                    f"output_tokens={getattr(response.usage, 'output_tokens', '?')}). "
                    "Considere aumentar max_tokens se isso for recorrente."
                )
            if not raw.strip():
                # Resposta vazia — tenta de novo no mesmo modelo pedindo sem markdown
                logger.warning(f"generate_intelecto_html: resposta vazia de {model} (stop_reason={getattr(response, 'stop_reason', '?')})")
                msgs_retry = messages + [
                    {"role": "assistant", "content": "<!-- vazio -->"},
                    {"role": "user", "content": "Sua resposta veio vazia. Responda agora começando direto com a primeira <section class=\"slide\"> sem markdown wrapper."},
                ]
                raw, response = _call_claude(model, msgs_retry)
                if not raw.strip():
                    last_error = f"{model} retornou vazio duas vezes"
                    continue  # tenta próximo modelo
            break  # sucesso, sai do loop de modelos
        except (anthropic.APIStatusError, anthropic.APIConnectionError, anthropic.APIError) as e:
            last_error = f"{model}: {e}"
            logger.error(f"generate_intelecto_html: {last_error}")
            if _is_overloaded_error(e) and model != models_to_try[-1]:
                logger.warning(f"generate_intelecto_html: {model} overloaded/rate-limited, caindo pra fallback")
                continue
            # Erro não-recuperável OU já está no último modelo
            if model == models_to_try[-1]:
                break
            continue

    if not raw.strip():
        raise RuntimeError(
            f"Claude API indisponível em todos os modelos ({', '.join(models_to_try)}). "
            f"Último erro: {last_error}. Tente de novo em alguns minutos."
        )

    # ─── Etapa 2: validar HTML (com retry multi-turn no mesmo modelo) ───
    html = _extract_html_only(raw)
    ok, err = _validate_html(html)

    if not ok:
        logger.warning(f"generate_intelecto_html: validação falhou no 1º round ({used_model}): {err}")
        messages.append({"role": "assistant", "content": raw})
        messages.append({
            "role": "user",
            "content": (
                f"O HTML acima tem problema: {err}\n\n"
                f"Corrija e retorne APENAS o HTML válido (sem markdown wrapper, "
                f"começando direto na primeira <section class=\"slide\">). "
                f"Use APENAS classes do css_flg que está no system prompt."
            ),
        })
        try:
            raw, response = _call_claude(used_model, messages)
        except (anthropic.APIStatusError, anthropic.APIConnectionError, anthropic.APIError) as e:
            raise RuntimeError(f"Falha ao re-tentar validação ({used_model}): {e}")

        html = _extract_html_only(raw)
        ok, err = _validate_html(html)
        if not ok:
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
        "model_used": used_model,
    }

    raise RuntimeError(f"Falha inesperada: {last_error}")
