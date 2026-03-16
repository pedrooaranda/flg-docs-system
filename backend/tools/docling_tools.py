"""
Tool de extração de texto de PDFs via Docling.
Processa planejamentos estratégicos e estudos de mercado enviados pelos consultores.
"""

import logging
import tempfile
from pathlib import Path

from supabase import create_client

from config import settings

logger = logging.getLogger("flg.docling")

_supabase = create_client(settings.supabase_url, settings.supabase_key)


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extrai texto estruturado de um PDF usando Docling.
    Retorna markdown com o conteúdo do documento.
    """
    try:
        from docling.document_converter import DocumentConverter
    except ImportError:
        logger.error("Docling não instalado")
        raise RuntimeError("Docling não disponível")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = Path(tmp.name)

    try:
        converter = DocumentConverter()
        result = converter.convert(str(tmp_path))
        text = result.document.export_to_markdown()
        logger.info(f"PDF processado: {len(text)} caracteres extraídos")
        return text
    finally:
        tmp_path.unlink(missing_ok=True)


def save_document_text(client_id: str, doc_type: str, text: str) -> dict:
    """
    Salva o texto extraído do PDF no perfil do cliente.

    doc_type: 'planejamento' → campo planejamento_estrategico_texto
              'estudo'       → campo estudo_mercado_texto
    """
    campo_map = {
        "planejamento": "planejamento_estrategico_texto",
        "estudo": "estudo_mercado_texto",
    }
    campo = campo_map.get(doc_type)
    if not campo:
        raise ValueError(f"doc_type inválido: {doc_type}. Use 'planejamento' ou 'estudo'")

    _supabase.table("clientes").update({campo: text}).eq("id", client_id).execute()
    logger.info(f"Texto salvo em clientes.{campo} para cliente {client_id}")
    return {"ok": True, "campo": campo, "chars": len(text)}
