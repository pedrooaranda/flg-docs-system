"""
Google Drive service para extrair documentos relacionados a um cliente.

Autenticação: service account JSON via env var `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`
(conteúdo do arquivo JSON do service account criado no Google Cloud Console).
O service account precisa ter acesso de leitura à pasta raiz da FLG no Drive
(compartilhar manualmente a pasta com o email do service account).

Fluxo:
  1. Cliente fornece folder_id (id da pasta no Drive) OU busca por nome.
  2. Lista arquivos na pasta filtrados por modifiedTime entre período.
  3. Para cada arquivo, extrai conteúdo:
     - Google Doc → export texto/plain
     - Google Sheet → export csv (primeira aba) ou skip
     - PDF → download binário, extrai texto via docling (Phase 3+)
     - Outros → skip com nota
  4. Formata como string para envio ao Claude.

Grace-degraded: se env var não configurada, retorna ([], "<sem credenciais>").
"""

import io
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

logger = logging.getLogger("flg.gdrive")

_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

# MIME types suportados para extração de conteúdo
_MIME_GDOC = "application/vnd.google-apps.document"
_MIME_GSHEET = "application/vnd.google-apps.spreadsheet"
_MIME_GSLIDES = "application/vnd.google-apps.presentation"
_MIME_PDF = "application/pdf"
_MIME_FOLDER = "application/vnd.google-apps.folder"

# Mapeamento MIME → categoria para classificação no debriefing
_CATEGORIA_POR_NOME = [
    (("planejamento estratégico", "planejamento", "pe "), "Planejamento Estratégico"),
    (("script", "reel", "roteiro"), "Scripts de Conteúdo"),
    (("manifesto",), "Manifestos e Textos Estratégicos"),
    (("proposta", "contrato"), "Propostas Comerciais / Contratos"),
    (("briefing", "criativo"), "Briefings Criativos / Visuais"),
    (("relatório", "report", "media paga", "mídia paga"), "Relatórios de Mídia Paga"),
    (("pesquisa", "análise", "mercado"), "Documentos de Pesquisa"),
    (("ata", "transcri", "reunião"), "Atas de Reunião / Anotações"),
]


@dataclass
class DriveDoc:
    id: str
    name: str
    mime_type: str
    modified_time: str
    web_view_link: str
    content_preview: str       # primeiros ~2000 chars do conteúdo
    categoria: str             # categoria inferida pelo nome
    erro: Optional[str] = None # se falhou ao extrair conteúdo


# ─── Auth ─────────────────────────────────────────────────────────────────────

def _build_service():
    """
    Constrói o cliente Drive v3. Retorna None se creds não configuradas.
    """
    raw = os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "")
    if not raw:
        logger.warning("[gdrive] GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON não configurado")
        return None

    try:
        info = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error(f"[gdrive] JSON inválido em GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: {e}")
        return None

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        creds = service_account.Credentials.from_service_account_info(info, scopes=_SCOPES)
        return build("drive", "v3", credentials=creds, cache_discovery=False)
    except Exception as e:
        logger.exception(f"[gdrive] falha ao construir service: {e}")
        return None


def is_configured() -> bool:
    return bool(os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", ""))


# ─── Helpers de categoria ─────────────────────────────────────────────────────

def _classify(name: str, mime_type: str) -> str:
    name_lower = (name or "").lower()
    for keywords, categoria in _CATEGORIA_POR_NOME:
        if any(kw in name_lower for kw in keywords):
            return categoria
    # Fallback por MIME
    if mime_type == _MIME_GDOC:
        return "Documento de Texto"
    if mime_type == _MIME_GSHEET:
        return "Planilha"
    if mime_type == _MIME_GSLIDES:
        return "Apresentação"
    if mime_type == _MIME_PDF:
        return "PDF"
    return "Outros"


# ─── Listagem ─────────────────────────────────────────────────────────────────

def _build_query(
    folder_id: Optional[str],
    cliente_nome: Optional[str],
    empresa_nome: Optional[str],
    periodo_inicio: Optional[str],
    periodo_fim: Optional[str],
) -> str:
    """Constrói query Drive v3 (https://developers.google.com/drive/api/guides/search-files)."""
    parts = ["trashed = false"]

    if folder_id:
        parts.append(f"'{folder_id}' in parents")
    elif cliente_nome or empresa_nome:
        # Busca por nome contém — escapando aspas simples
        terms = [t for t in [cliente_nome, empresa_nome] if t]
        name_clauses = " or ".join([f"name contains '{t.replace(chr(39), '')}'" for t in terms])
        parts.append(f"({name_clauses})")

    if periodo_inicio:
        parts.append(f"modifiedTime >= '{periodo_inicio}T00:00:00'")
    if periodo_fim:
        parts.append(f"modifiedTime <= '{periodo_fim}T23:59:59'")

    return " and ".join(parts)


def list_docs(
    folder_id: Optional[str] = None,
    cliente_nome: Optional[str] = None,
    empresa_nome: Optional[str] = None,
    periodo_inicio: Optional[str] = None,
    periodo_fim: Optional[str] = None,
    page_size: int = 200,
) -> list[dict]:
    """
    Lista arquivos do Drive matching os critérios. Retorna lista de dicts crus
    (id, name, mimeType, modifiedTime, webViewLink).
    """
    service = _build_service()
    if service is None:
        return []

    query = _build_query(folder_id, cliente_nome, empresa_nome, periodo_inicio, periodo_fim)
    logger.info(f"[gdrive] query: {query}")

    files: list[dict] = []
    page_token = None
    try:
        while True:
            resp = service.files().list(
                q=query,
                pageSize=page_size,
                fields="nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, parents)",
                pageToken=page_token,
                includeItemsFromAllDrives=True,
                supportsAllDrives=True,
            ).execute()
            files.extend(resp.get("files", []))
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
    except Exception as e:
        logger.exception(f"[gdrive] erro listando arquivos: {e}")
        return []

    # Filtra pastas (queremos só docs)
    return [f for f in files if f.get("mimeType") != _MIME_FOLDER]


# ─── Extração de conteúdo ─────────────────────────────────────────────────────

def _export_gdoc(service, file_id: str) -> str:
    """Exporta Google Doc como texto plano."""
    try:
        data = service.files().export(fileId=file_id, mimeType="text/plain").execute()
        return data.decode("utf-8", errors="ignore") if isinstance(data, bytes) else str(data)
    except Exception as e:
        logger.warning(f"[gdrive] falha export gdoc {file_id}: {e}")
        return ""


def _export_gsheet(service, file_id: str) -> str:
    """Exporta primeira aba do Sheet como CSV."""
    try:
        data = service.files().export(fileId=file_id, mimeType="text/csv").execute()
        return data.decode("utf-8", errors="ignore") if isinstance(data, bytes) else str(data)
    except Exception as e:
        logger.warning(f"[gdrive] falha export sheet {file_id}: {e}")
        return ""


def _export_gslides(service, file_id: str) -> str:
    """Exporta apresentação como texto plano (export text/plain extrai textos dos slides)."""
    try:
        data = service.files().export(fileId=file_id, mimeType="text/plain").execute()
        return data.decode("utf-8", errors="ignore") if isinstance(data, bytes) else str(data)
    except Exception as e:
        logger.warning(f"[gdrive] falha export slides {file_id}: {e}")
        return ""


def _download_pdf(service, file_id: str) -> bytes:
    """Baixa PDF binário. Extração de texto fica para o caller (via docling)."""
    try:
        from googleapiclient.http import MediaIoBaseDownload

        request = service.files().get_media(fileId=file_id)
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        return buf.getvalue()
    except Exception as e:
        logger.warning(f"[gdrive] falha download pdf {file_id}: {e}")
        return b""


def fetch_doc_content(file_meta: dict, max_chars: int = 4000) -> DriveDoc:
    """
    Recebe metadata cru de um file e extrai/preview seu conteúdo.
    Retorna DriveDoc com content_preview truncado em max_chars.
    """
    service = _build_service()
    file_id = file_meta["id"]
    name = file_meta.get("name", "")
    mime = file_meta.get("mimeType", "")

    if service is None:
        return DriveDoc(
            id=file_id, name=name, mime_type=mime,
            modified_time=file_meta.get("modifiedTime", ""),
            web_view_link=file_meta.get("webViewLink", ""),
            content_preview="",
            categoria=_classify(name, mime),
            erro="Drive service não configurado",
        )

    content = ""
    erro = None
    try:
        if mime == _MIME_GDOC:
            content = _export_gdoc(service, file_id)
        elif mime == _MIME_GSHEET:
            content = _export_gsheet(service, file_id)
        elif mime == _MIME_GSLIDES:
            content = _export_gslides(service, file_id)
        elif mime == _MIME_PDF:
            # Phase 3+: integrar docling pra extrair texto de PDFs.
            # Por ora, marca que existe mas não extrai conteúdo.
            content = "[PDF binário — extração de texto pendente Phase 3]"
        else:
            content = f"[Tipo não suportado: {mime}]"
    except Exception as e:
        erro = str(e)
        logger.warning(f"[gdrive] erro extraindo {file_id}: {e}")

    return DriveDoc(
        id=file_id,
        name=name,
        mime_type=mime,
        modified_time=file_meta.get("modifiedTime", ""),
        web_view_link=file_meta.get("webViewLink", ""),
        content_preview=content[:max_chars] if content else "",
        categoria=_classify(name, mime),
        erro=erro,
    )


# ─── Top-level: extração formatada para Claude ────────────────────────────────

def extract_for_debriefing(
    folder_id: Optional[str],
    cliente_nome: str,
    empresa_nome: str,
    periodo_inicio: str,
    periodo_fim: str,
    max_docs: int = 50,
    max_chars_por_doc: int = 4000,
) -> tuple[str, int]:
    """
    Função top-level usada pelo debriefing_generator. Retorna:
      (texto_formatado_pra_claude, num_docs_extraidos)

    Texto inclui metadata + content_preview de cada doc, organizado por categoria.
    """
    if not is_configured():
        return (
            "[Google Drive não configurado — defina GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON]",
            0,
        )

    files = list_docs(
        folder_id=folder_id,
        cliente_nome=cliente_nome,
        empresa_nome=empresa_nome,
        periodo_inicio=periodo_inicio,
        periodo_fim=periodo_fim,
    )

    if not files:
        return ("[Nenhum documento encontrado nos critérios fornecidos]", 0)

    # Limita ao max_docs (ordenado por modifiedTime desc)
    files.sort(key=lambda f: f.get("modifiedTime", ""), reverse=True)
    files = files[:max_docs]

    docs = [fetch_doc_content(f, max_chars=max_chars_por_doc) for f in files]

    # Agrupa por categoria pro Claude organizar melhor
    por_categoria: dict[str, list[DriveDoc]] = {}
    for d in docs:
        por_categoria.setdefault(d.categoria, []).append(d)

    parts: list[str] = [f"Total: {len(docs)} documentos extraídos do Drive\n"]
    for categoria, docs_cat in sorted(por_categoria.items()):
        parts.append(f"\n=== {categoria} ({len(docs_cat)}) ===\n")
        for d in docs_cat:
            modif = d.modified_time[:10] if d.modified_time else "—"
            parts.append(f"\n--- {d.name} (modificado {modif}) ---")
            parts.append(f"Link: {d.web_view_link}")
            if d.erro:
                parts.append(f"[ERRO ao extrair: {d.erro}]")
            elif d.content_preview:
                parts.append(d.content_preview)
            else:
                parts.append("[Sem conteúdo extraído]")

    return ("\n".join(parts), len(docs))
