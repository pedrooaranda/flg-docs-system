"""
Tool de geração de slides HTML + PDF para os encontros FLG.
Chamada pelo agente ou diretamente pelo endpoint /generate-slides.
"""

import base64
import json
import logging
from pathlib import Path

import anthropic
import weasyprint
from supabase import create_client

from config import settings
from prompts.slides_prompt import SLIDES_SYSTEM_PROMPT, build_slides_prompt
from tools.client_tools import get_client_profile as _get_profile, get_encontro_base as _get_encontro

logger = logging.getLogger("flg.slides")

_supabase = create_client(settings.supabase_url, settings.supabase_key)
_claude = anthropic.Anthropic(api_key=settings.anthropic_api_key)

ASSETS_DIR = Path(__file__).parent.parent / "assets" / "images"


def _load_image_b64(encontro_numero: int) -> str:
    """Carrega imagem estática do encontro como base64. Retorna string vazia se não existir."""
    path = ASSETS_DIR / f"encontro-{encontro_numero:02d}.jpg"
    if path.exists():
        return base64.b64encode(path.read_bytes()).decode()
    logger.warning(f"Imagem não encontrada: {path}")
    return ""


async def generate_slides(
    client_id: str,
    encontro_numero: int,
    conversation_context: str = "",
) -> dict:
    """
    Gera slides HTML personalizados + PDF para um encontro.

    Fluxo:
    1. Busca perfil do cliente e dados do encontro
    2. Carrega imagem estática do encontro (base64)
    3. Gera HTML via Claude API (chamada separada do agente)
    4. Converte para PDF com WeasyPrint
    5. Faz upload de HTML e PDF para Supabase Storage
    6. Salva URLs em encontros_realizados

    Returns dict com html_url, pdf_url e html (string completa).
    """
    # 1. Buscar dados
    cliente_json = _get_profile(client_id)
    encontro_json = _get_encontro(encontro_numero)
    cliente = json.loads(cliente_json)
    encontro = json.loads(encontro_json)

    if "erro" in cliente:
        raise ValueError(f"Cliente não encontrado: {cliente['erro']}")
    if "erro" in encontro:
        raise ValueError(f"Encontro não encontrado: {encontro['erro']}")

    # 2. Imagem de fundo
    image_b64 = _load_image_b64(encontro_numero)

    # 3. Gerar HTML via Claude
    prompt = build_slides_prompt(cliente, encontro, conversation_context, image_b64)
    num_slides = encontro.get("numero_slides_medio", 22)

    logger.info(f"Gerando slides para {cliente['nome']} — Encontro {encontro_numero}")
    response = _claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=16000,
        system=SLIDES_SYSTEM_PROMPT.format(num_slides=num_slides),
        messages=[{"role": "user", "content": prompt}],
    )
    html = response.content[0].text.strip()

    # Garantir que é HTML válido
    if not html.startswith("<!DOCTYPE") and not html.startswith("<html"):
        # Claude às vezes adiciona markdown — extrair HTML
        import re
        match = re.search(r"<!DOCTYPE.*</html>", html, re.DOTALL | re.IGNORECASE)
        if match:
            html = match.group(0)

    # 4. Gerar PDF
    pdf_bytes = _html_to_pdf(html)

    # 5. Upload para Supabase Storage
    html_path = f"slides/{client_id}/encontro-{encontro_numero:02d}.html"
    pdf_path = f"pdfs/{client_id}/encontro-{encontro_numero:02d}.pdf"

    html_url = _upload_storage(html_path, html.encode("utf-8"), "text/html")
    pdf_url = _upload_storage(pdf_path, pdf_bytes, "application/pdf")

    # 6. Salvar em encontros_realizados
    _supabase.table("encontros_realizados").upsert(
        {
            "cliente_id": client_id,
            "encontro_numero": encontro_numero,
            "slides_html_url": html_url,
            "slides_pdf_url": pdf_url,
        },
        on_conflict="cliente_id,encontro_numero",
    ).execute()

    logger.info(f"Slides gerados: {html_url}")
    return {"html_url": html_url, "pdf_url": pdf_url, "html": html}


def _html_to_pdf(html: str) -> bytes:
    """Converte HTML para PDF usando WeasyPrint."""
    try:
        return weasyprint.HTML(string=html).write_pdf()
    except Exception as e:
        logger.error(f"WeasyPrint error: {e}")
        raise


def _upload_storage(path: str, content: bytes, content_type: str) -> str:
    """Upload para Supabase Storage. Retorna URL pública."""
    bucket = "materiais-flg"
    try:
        _supabase.storage.from_(bucket).upload(
            path=path,
            file=content,
            file_options={"content-type": content_type, "upsert": "true"},
        )
    except Exception as e:
        logger.warning(f"Upload error (tentando upsert): {e}")

    public_url = _supabase.storage.from_(bucket).get_public_url(path)
    return public_url
