"""
Rota de upload de PDFs (planejamento estratégico, estudo de mercado).
Processa o PDF com Docling e salva o texto no perfil do cliente.
"""

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.security import HTTPBearer

logger = logging.getLogger("flg.uploads")

router = APIRouter(prefix="/upload-pdf", tags=["uploads"])


@router.post("")
async def upload_pdf(
    client_id: str = Form(...),
    doc_type: Literal["planejamento", "estudo"] = Form(...),
    file: UploadFile = File(...),
    # auth: str = Depends(get_current_user),  # inject via main.py
):
    """
    Recebe um PDF, extrai o texto com Docling e salva no perfil do cliente.

    - doc_type='planejamento' → campo planejamento_estrategico_texto
    - doc_type='estudo'       → campo estudo_mercado_texto
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Apenas arquivos PDF são aceitos")

    if file.size and file.size > 50 * 1024 * 1024:  # 50 MB
        raise HTTPException(status_code=413, detail="Arquivo muito grande (máx 50 MB)")

    pdf_bytes = await file.read()
    logger.info(f"PDF recebido: {file.filename} ({len(pdf_bytes)} bytes) para cliente {client_id}")

    try:
        from tools.docling_tools import extract_text_from_pdf, save_document_text
        text = extract_text_from_pdf(pdf_bytes)
        result = save_document_text(client_id, doc_type, text)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Erro ao processar PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao processar PDF: {e}")

    return {
        "ok": True,
        "client_id": client_id,
        "doc_type": doc_type,
        "filename": file.filename,
        "chars_extracted": result["chars"],
    }
