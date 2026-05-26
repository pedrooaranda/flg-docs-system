"""
Google Drive service para extrair documentos relacionados a um cliente.

Autenticação: service account JSON. Suporta DOIS modos (path-based preferido):

1. **Path-based (recomendado):** env var `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_PATH`
   apontando pra arquivo `.json` montado como volume read-only no container.
   Padrão Google + indústria — evita problemas de parser env, evita exposição
   de credenciais em logs/echo.

2. **Inline (legacy/fallback):** env var `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`
   com o conteúdo JSON inteiro como string. Mantido por compatibilidade.

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
import re
import unicodedata
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger("flg.gdrive")

_SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]

# MIME types suportados para extração de conteúdo
_MIME_GDOC = "application/vnd.google-apps.document"
_MIME_GSHEET = "application/vnd.google-apps.spreadsheet"
_MIME_GSLIDES = "application/vnd.google-apps.presentation"
_MIME_PDF = "application/pdf"
_MIME_FOLDER = "application/vnd.google-apps.folder"

# Padrões de pasta FLG (vide flg_clickup_nomenclatura_clientes na memory)
_CICLO_FOLDER_PATTERN = re.compile(r"^\s*ciclo\s*\|", re.IGNORECASE)
_ENTREGAS_FOLDER_PATTERN = re.compile(r"^\s*(?:\d+\s*\.\s*)?entregas?\s*$", re.IGNORECASE)
_RELATORIO_ESTRATEGICO_PATTERN = re.compile(r"relat[óo]rio.*estrat[ée]gico|relat[óo]rio.*entregas?", re.IGNORECASE)

# Categorização por extensão (file naming convention FLG)
_EXT_BY_CATEGORIA = {
    "design":      {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".heic", ".tiff", ".psd", ".ai"},
    "audiovisual": {".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v"},
    "audio":       {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"},
    "documento":   {".pdf", ".docx", ".doc", ".odt", ".rtf", ".txt", ".md"},
    "planilha":    {".xlsx", ".xls", ".ods", ".csv"},
    "apresentacao": {".pptx", ".ppt", ".odp", ".key"},
}
_GOOGLE_MIME_TO_CATEGORIA = {
    _MIME_GDOC:    "documento",
    _MIME_GSHEET:  "planilha",
    _MIME_GSLIDES: "apresentacao",
}

# Mapeamento MIME → categoria para classificação no debriefing (legacy — busca por nome)
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


# ─── Normalização e mapeamento de ciclos (Drive ↔ ClickUp bridge) ─────────────

def _normalize_name(s: str) -> str:
    """Lowercase, sem acentos, sem `|`/brackets/espaços extras."""
    if not s:
        return ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().strip()
    s = re.sub(r"[\[\]|]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def _normalize_for_match(s: str) -> str:
    """Normalização agressiva: SEM espaços/separadores — match robusto entre 'LEONARDOSOUZA' (DB) e 'LEONARDO SOUZA | BS' (Drive)."""
    base = _normalize_name(s)
    return re.sub(r"[\s\-_.]+", "", base)


def _cliente_name_matches(client_folder_name: str, cliente_nome_db: str) -> bool:
    """
    Match nome do cliente do DB com pasta no Drive — agressivo, ignora separadores.

    Casos cobertos:
    - DB: 'LEONARDOSOUZA' (sem espaço) ↔ Drive: 'LEONARDO SOUZA | BS' → ✅
    - DB: 'Leonardo Souza' ↔ Drive: 'LEONARDO SOUZA | BS' → ✅
    - DB: 'Letícia Toledo' ↔ Drive: 'LETÍCIA TOLEDO | FLG' → ✅
    - DB: 'João Guglielmi' ↔ Drive: 'JOÃO GUGLIELMI | FLG' → ✅

    Bidirectional substring match após remover TODOS espaços/separadores.
    """
    norm_drive = _normalize_for_match(client_folder_name)
    norm_db = _normalize_for_match(cliente_nome_db)
    if not norm_drive or not norm_db:
        return False
    return norm_db in norm_drive or norm_drive in norm_db


def _ext_categoria(name: str, mime_type: str = "") -> str:
    """Categoriza file por extensão e mime — retorna 'design', 'audiovisual', etc."""
    if mime_type in _GOOGLE_MIME_TO_CATEGORIA:
        return _GOOGLE_MIME_TO_CATEGORIA[mime_type]
    if "." in name:
        ext = "." + name.rsplit(".", 1)[-1].lower()
        for cat, exts in _EXT_BY_CATEGORIA.items():
            if ext in exts:
                return cat
    return "outro"


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

def _load_credentials():
    """
    Carrega credentials do service account. Tenta path-based primeiro
    (GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_PATH), fallback pra inline JSON
    (GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON).

    Retorna service_account.Credentials ou None se não configurado/inválido.
    """
    try:
        from google.oauth2 import service_account
    except ImportError:
        logger.error("[gdrive] google-auth não instalado")
        return None

    # Modo 1 (preferido): path-based
    path = os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_PATH", "").strip()
    if path:
        if not os.path.isfile(path):
            logger.error(f"[gdrive] GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_PATH aponta pra arquivo inexistente: {path}")
            return None
        try:
            return service_account.Credentials.from_service_account_file(path, scopes=_SCOPES)
        except Exception as e:
            logger.error(f"[gdrive] falha ao carregar credentials de {path}: {e}")
            return None

    # Modo 2 (legacy): inline JSON
    raw = os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        logger.warning("[gdrive] Nenhuma credencial configurada (nem PATH nem JSON inline)")
        return None

    # Remove aspas externas se docker compose deixou (single ou double)
    if (raw.startswith("'") and raw.endswith("'")) or (raw.startswith('"') and raw.endswith('"')):
        raw = raw[1:-1]

    try:
        info = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error(f"[gdrive] JSON inline inválido: {e}")
        return None

    try:
        return service_account.Credentials.from_service_account_info(info, scopes=_SCOPES)
    except Exception as e:
        logger.error(f"[gdrive] falha ao construir credentials de JSON inline: {e}")
        return None


def _build_service():
    """
    Constrói o cliente Drive v3. Retorna None se creds não configuradas.
    """
    creds = _load_credentials()
    if creds is None:
        return None

    try:
        from googleapiclient.discovery import build
        return build("drive", "v3", credentials=creds, cache_discovery=False)
    except Exception as e:
        logger.exception(f"[gdrive] falha ao construir service: {e}")
        return None


def is_configured() -> bool:
    """True se path-based OU inline está configurado."""
    return bool(
        os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_PATH", "").strip()
        or os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "").strip()
    )


def _build_sheets_service():
    """Constrói cliente Sheets API v4 pra ler todas as abas de uma planilha."""
    creds = _load_credentials()
    if creds is None:
        return None
    try:
        from googleapiclient.discovery import build
        return build("sheets", "v4", credentials=creds, cache_discovery=False)
    except Exception as e:
        logger.exception(f"[gdrive] falha ao construir sheets service: {e}")
        return None


# ─── Listagem de pastas (ciclo-aware) ─────────────────────────────────────────

def _list_folder_children(service, folder_id: str) -> list[dict]:
    """Lista arquivos+pastas filhos diretos de folder_id."""
    files = []
    page_token = None
    while True:
        try:
            resp = service.files().list(
                q=f"'{folder_id}' in parents and trashed = false",
                pageSize=200,
                fields=("nextPageToken, files(id, name, mimeType, modifiedTime, "
                        "createdTime, webViewLink, size)"),
                pageToken=page_token,
                includeItemsFromAllDrives=True,
                supportsAllDrives=True,
            ).execute()
        except Exception as e:
            logger.warning(f"[gdrive] erro listando filhos de {folder_id}: {e}")
            return files
        files.extend(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return files


def find_client_folder_in_master(cliente_nome: str, master_folder_id: Optional[str] = None) -> Optional[dict]:
    """
    Localiza a pasta do cliente dentro da master folder FLG (BUSINESS STRATEGISTS).
    Retorna dict {id, name, ...} ou None.

    `cliente_nome` é o nome do DB (sem sufixos | BS / | FLG).
    """
    master_id = master_folder_id or os.getenv("FLG_DRIVE_MASTER_FOLDER_ID", "")
    if not master_id:
        logger.warning("[gdrive] FLG_DRIVE_MASTER_FOLDER_ID não configurado")
        return None

    service = _build_service()
    if service is None:
        return None

    children = _list_folder_children(service, master_id)
    candidates = [
        c for c in children
        if c.get("mimeType") == _MIME_FOLDER
        and _cliente_name_matches(c.get("name", ""), cliente_nome)
    ]
    if not candidates:
        logger.info(f"[gdrive] nenhuma pasta de cliente matching '{cliente_nome}'")
        return None
    if len(candidates) > 1:
        logger.warning(f"[gdrive] {len(candidates)} pastas matching '{cliente_nome}': {[c['name'] for c in candidates]}")
    return candidates[0]


def list_ciclos_for_client(client_folder_id: str) -> list[dict]:
    """
    Lista subpastas 'CICLO | YYYY.X' ordenadas por createdTime ASC, atribuindo
    ciclo_numero sequencial 1-based.

    Retorna lista de dicts: [{ciclo_numero, name, id, created_time, web_view_link}, ...]

    Se NÃO houver subpastas CICLO|*, retorna lista vazia (cliente padrão "novo"
    sem ciclos múltiplos — usa o próprio client_folder como ciclo único).
    """
    service = _build_service()
    if service is None:
        return []

    children = _list_folder_children(service, client_folder_id)
    ciclos = [
        c for c in children
        if c.get("mimeType") == _MIME_FOLDER
        and _CICLO_FOLDER_PATTERN.match(c.get("name", ""))
    ]
    # Ordena por createdTime ASC (mais antigo primeiro)
    ciclos.sort(key=lambda c: c.get("createdTime", ""))

    return [
        {
            "ciclo_numero": idx + 1,
            "name": c["name"],
            "id": c["id"],
            "created_time": c.get("createdTime"),
            "web_view_link": c.get("webViewLink"),
        }
        for idx, c in enumerate(ciclos)
    ]


def resolve_ciclo_folder(
    client_folder_id: str,
    ciclo_numero: Optional[int] = None,
) -> Optional[dict]:
    """
    Resolve qual pasta usar pro debriefing dado um cliente_folder + ciclo_numero.

    Lógica:
      - Cliente tem CICLO|* subfolders → usa ciclo_numero pra escolher (default: último)
      - Cliente NÃO tem CICLO|* → usa o próprio client_folder (ciclo único = 01)

    Retorna dict {ciclo_numero, name, id, ...} ou None se ciclo_numero inválido.
    """
    ciclos = list_ciclos_for_client(client_folder_id)

    if not ciclos:
        # Padrão "novo": ciclo único = a própria pasta do cliente
        service = _build_service()
        if service:
            try:
                meta = service.files().get(
                    fileId=client_folder_id,
                    fields="id, name, createdTime, webViewLink",
                    supportsAllDrives=True,
                ).execute()
                return {
                    "ciclo_numero": 1,
                    "name": meta.get("name"),
                    "id": meta.get("id"),
                    "created_time": meta.get("createdTime"),
                    "web_view_link": meta.get("webViewLink"),
                    "is_root_client_folder": True,
                }
            except Exception as e:
                logger.warning(f"[gdrive] falha ao buscar metadata da client folder: {e}")
                return None
        return None

    # Cliente tem ciclos: escolhe por ciclo_numero ou default ao último (atual)
    if ciclo_numero is None:
        return ciclos[-1]  # último cronológico = atual

    matching = [c for c in ciclos if c["ciclo_numero"] == ciclo_numero]
    if matching:
        return matching[0]
    logger.warning(
        f"[gdrive] ciclo_numero={ciclo_numero} não encontrado. "
        f"Disponíveis: {[c['ciclo_numero'] for c in ciclos]}"
    )
    return None


# ─── Inspeção de 09. ENTREGAS (setores DESIGN/COPY/AUDIOVISUAL) ───────────────

def extract_entregas_summary(ciclo_folder_id: str) -> dict:
    """
    Inspeciona a subpasta '09. ENTREGAS' dentro do ciclo. Conta arquivos por
    setor (DESIGN/COPY/AUDIOVISUAL — subpastas dentro de ENTREGAS) e categoria
    (design/audiovisual/audio/documento por extensão).

    Retorna dict com estrutura:
        {
            "entregas_folder_id": str | None,
            "total_arquivos": int,
            "setores": {
                "DESIGN": {"count": N, "por_categoria": {...}},
                "COPY": {"count": N, "por_categoria": {...}},
                "AUDIOVISUAL": {"count": N, "por_categoria": {...}},
            },
            "arquivos_no_raiz": {"count": N, "por_categoria": {...}, "samples": [...]},
        }

    Se '09. ENTREGAS' não existir, retorna {entregas_folder_id: None, ...}.
    """
    service = _build_service()
    if service is None:
        return {"entregas_folder_id": None, "total_arquivos": 0, "setores": {}, "arquivos_no_raiz": {}}

    ciclo_children = _list_folder_children(service, ciclo_folder_id)
    entregas_folder = next(
        (c for c in ciclo_children
         if c.get("mimeType") == _MIME_FOLDER
         and _ENTREGAS_FOLDER_PATTERN.match(c.get("name", ""))),
        None,
    )
    if not entregas_folder:
        return {"entregas_folder_id": None, "total_arquivos": 0, "setores": {}, "arquivos_no_raiz": {}}

    entregas_children = _list_folder_children(service, entregas_folder["id"])
    entregas_subfolders = [c for c in entregas_children if c.get("mimeType") == _MIME_FOLDER]
    entregas_files_raiz = [c for c in entregas_children if c.get("mimeType") != _MIME_FOLDER]

    # Conta arquivos diretos na raiz de ENTREGAS
    raiz_summary = {"count": len(entregas_files_raiz), "por_categoria": {}, "samples": []}
    for f in entregas_files_raiz:
        cat = _ext_categoria(f["name"], f.get("mimeType", ""))
        raiz_summary["por_categoria"].setdefault(cat, 0)
        raiz_summary["por_categoria"][cat] += 1
        if len(raiz_summary["samples"]) < 3:
            raiz_summary["samples"].append({"name": f["name"], "cat": cat})

    # Conta por setor (DESIGN/COPY/AUDIOVISUAL)
    setores = {}
    total = len(entregas_files_raiz)
    for sub in entregas_subfolders:
        setor_name = sub["name"].strip().upper()
        sub_files = _list_folder_children(service, sub["id"])
        sub_files = [c for c in sub_files if c.get("mimeType") != _MIME_FOLDER]
        por_cat = {}
        for f in sub_files:
            cat = _ext_categoria(f["name"], f.get("mimeType", ""))
            por_cat.setdefault(cat, 0)
            por_cat[cat] += 1
        setores[setor_name] = {"count": len(sub_files), "por_categoria": por_cat}
        total += len(sub_files)

    return {
        "entregas_folder_id": entregas_folder["id"],
        "entregas_folder_name": entregas_folder["name"],
        "total_arquivos": total,
        "setores": setores,
        "arquivos_no_raiz": raiz_summary,
    }


# ─── RELATÓRIO ESTRATÉGICO (planilha com abas — datas reuniões + entregas) ────

def find_relatorio_estrategico(ciclo_folder_id: str) -> Optional[dict]:
    """
    Procura arquivo "RELATÓRIO ESTRATÉGICO" dentro de '09. ENTREGAS' do ciclo.

    Retorna dict {id, name, mime_type, web_view_link} ou None se não achar.
    """
    service = _build_service()
    if service is None:
        return None

    # Procura primeiro em 09. ENTREGAS raiz
    ciclo_children = _list_folder_children(service, ciclo_folder_id)
    entregas_folder = next(
        (c for c in ciclo_children
         if c.get("mimeType") == _MIME_FOLDER
         and _ENTREGAS_FOLDER_PATTERN.match(c.get("name", ""))),
        None,
    )
    search_root = entregas_folder["id"] if entregas_folder else ciclo_folder_id

    children = _list_folder_children(service, search_root)
    for c in children:
        if c.get("mimeType") == _MIME_FOLDER:
            continue
        if _RELATORIO_ESTRATEGICO_PATTERN.search(c.get("name", "")):
            return {
                "id": c["id"],
                "name": c["name"],
                "mime_type": c.get("mimeType", ""),
                "web_view_link": c.get("webViewLink"),
                "modified_time": c.get("modifiedTime"),
            }
    return None


def extract_sheet_all_tabs(file_id: str, max_rows_per_tab: int = 500) -> str:
    """
    Exporta TODAS as abas de um Google Sheet como texto formatado.
    Usa Sheets API v4 (não Drive API export que só pega 1 aba).

    Retorna string formatada multi-aba pronta pra alimentar prompt do Claude.
    """
    sheets_service = _build_sheets_service()
    if sheets_service is None:
        return "[Sheets API indisponível]"

    try:
        meta = sheets_service.spreadsheets().get(
            spreadsheetId=file_id,
            fields="properties.title,sheets.properties",
        ).execute()
    except Exception as e:
        logger.warning(f"[gdrive] falha get sheet metadata: {e}")
        return f"[Erro ao ler planilha: {e}]"

    title = meta.get("properties", {}).get("title", "(sem título)")
    parts = [f"=== PLANILHA: {title} ==="]

    for sheet_meta in meta.get("sheets", []):
        props = sheet_meta.get("properties", {})
        sheet_name = props.get("title", "(sem nome)")
        grid = props.get("gridProperties", {})
        row_count = min(grid.get("rowCount", 100), max_rows_per_tab)

        try:
            result = sheets_service.spreadsheets().values().get(
                spreadsheetId=file_id,
                range=f"'{sheet_name}'!A1:Z{row_count}",
            ).execute()
            rows = result.get("values", [])
        except Exception as e:
            logger.warning(f"[gdrive] falha read aba {sheet_name}: {e}")
            continue

        parts.append(f"\n--- ABA: {sheet_name} ({len(rows)} linhas com dados) ---")
        if not rows:
            parts.append("(aba vazia)")
            continue

        # Formato CSV-like simples (separador tab)
        for row in rows:
            parts.append("\t".join(str(c) for c in row))

    return "\n".join(parts)


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
    empresa_nome: str = "",
    periodo_inicio: str = "",
    periodo_fim: str = "",
    ciclo_numero: Optional[int] = None,
    max_docs: int = 50,
    max_chars_por_doc: int = 4000,
) -> tuple[str, int]:
    """
    Função top-level usada pelo debriefing_generator. Retorna:
      (texto_formatado_pra_claude, num_items_extraidos)

    Lógica ciclo-aware (2026-05-26):
      1. Resolve a pasta do cliente dentro do master folder FLG (BUSINESS STRATEGISTS)
         - Usa `folder_id` se fornecido (override manual)
         - Senão, busca por `cliente_nome` em FLG_DRIVE_MASTER_FOLDER_ID
      2. Resolve a pasta do ciclo correspondente (createdTime ASC = ciclo 01, 02, ...)
         - Usa `ciclo_numero` se fornecido (default: último ciclo = atual)
         - Cliente sem CICLO|* subfolders: usa client_folder direto (ciclo único)
      3. Inspeciona 09. ENTREGAS dentro do ciclo:
         - Conta arquivos por SETOR (DESIGN/COPY/AUDIOVISUAL)
         - Conta arquivos por categoria (design/audiovisual/audio/documento/...)
      4. Localiza + exporta RELATÓRIO ESTRATÉGICO (planilha — todas abas)
      5. Lista demais subpastas do ciclo (01. CONTRATO, 02. PE, etc.)
      6. Formata tudo num texto estruturado pro Synthesizer

    Períodos `periodo_inicio/fim` são informativos (gravados no prompt) mas o
    SCOPE de extração é o ciclo inteiro — período fica embutido na criação da
    pasta CICLO|YYYY.X.
    """
    if not is_configured():
        return (
            "[Google Drive não configurado — defina GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_PATH]",
            0,
        )

    # 1. Resolve client folder
    if folder_id:
        # Override manual — busca metadata direto
        service = _build_service()
        if not service:
            return ("[Drive service indisponível]", 0)
        try:
            client_folder = service.files().get(
                fileId=folder_id,
                fields="id, name, createdTime, webViewLink",
                supportsAllDrives=True,
            ).execute()
        except Exception as e:
            return (f"[Erro ao acessar folder_id={folder_id}: {e}]", 0)
    else:
        client_folder = find_client_folder_in_master(cliente_nome)
        if not client_folder:
            return (
                f"[Pasta do cliente '{cliente_nome}' não encontrada na master FLG. "
                f"Confira nome + permissão de leitura do service account]",
                0,
            )

    logger.info(f"[gdrive] client folder: '{client_folder['name']}' ({client_folder['id']})")

    # 2. Resolve ciclo folder
    ciclo_folder = resolve_ciclo_folder(client_folder["id"], ciclo_numero=ciclo_numero)
    if not ciclo_folder:
        return (
            f"[Ciclo {ciclo_numero} não encontrado pra cliente '{cliente_nome}']",
            0,
        )

    logger.info(
        f"[gdrive] ciclo folder: '{ciclo_folder['name']}' "
        f"(ciclo_numero={ciclo_folder['ciclo_numero']}, "
        f"created={ciclo_folder.get('created_time', '?')[:10]})"
    )

    # 3. Inspeciona 09. ENTREGAS
    entregas = extract_entregas_summary(ciclo_folder["id"])

    # 4. Localiza + exporta RELATÓRIO ESTRATÉGICO
    relatorio_meta = find_relatorio_estrategico(ciclo_folder["id"])
    relatorio_content = ""
    if relatorio_meta:
        if relatorio_meta["mime_type"] == _MIME_GSHEET:
            relatorio_content = extract_sheet_all_tabs(relatorio_meta["id"])
        elif relatorio_meta["mime_type"] == _MIME_GDOC:
            service = _build_service()
            relatorio_content = _export_gdoc(service, relatorio_meta["id"]) if service else ""
        elif relatorio_meta["mime_type"] == _MIME_GSLIDES:
            service = _build_service()
            relatorio_content = _export_gslides(service, relatorio_meta["id"]) if service else ""
        else:
            relatorio_content = f"[Tipo MIME não suportado: {relatorio_meta['mime_type']}]"

    # 5. Lista demais subpastas do ciclo (contexto)
    service = _build_service()
    ciclo_children = _list_folder_children(service, ciclo_folder["id"]) if service else []
    subpastas_ciclo = [
        c["name"] for c in ciclo_children if c.get("mimeType") == _MIME_FOLDER
    ]

    # 6. Formata output
    parts: list[str] = []
    parts.append(f"=== CLIENTE: {client_folder['name']} ===")
    parts.append(f"Pasta cliente: {client_folder.get('webViewLink', '—')}")
    parts.append("")
    parts.append(
        f"=== CICLO {ciclo_folder['ciclo_numero']:02d} — {ciclo_folder['name']} ==="
    )
    if ciclo_folder.get("created_time"):
        parts.append(f"Pasta criada em: {ciclo_folder['created_time'][:10]}")
    if ciclo_folder.get("web_view_link"):
        parts.append(f"Link: {ciclo_folder['web_view_link']}")
    parts.append(f"Período informado: {periodo_inicio} → {periodo_fim}")
    parts.append("")
    parts.append("Subpastas do ciclo:")
    for sp in subpastas_ciclo:
        parts.append(f"  - {sp}")
    parts.append("")

    # ENTREGAS
    parts.append("=== ENTREGAS POR SETOR ===")
    if entregas.get("entregas_folder_id"):
        total = entregas.get("total_arquivos", 0)
        parts.append(f"Total de arquivos em 09. ENTREGAS: {total}")
        parts.append("")
        for setor_name, info in (entregas.get("setores") or {}).items():
            parts.append(f"📁 {setor_name}: {info['count']} arquivos")
            for cat, n in (info.get("por_categoria") or {}).items():
                parts.append(f"   • {cat}: {n}")
        # Arquivos diretamente em ENTREGAS (raiz)
        raiz = entregas.get("arquivos_no_raiz") or {}
        if raiz.get("count"):
            parts.append(f"\nArquivos no raiz de ENTREGAS: {raiz['count']}")
            for s in raiz.get("samples", []):
                parts.append(f"   • {s['name']} ({s['cat']})")
    else:
        parts.append("[Subpasta '09. ENTREGAS' NÃO encontrada neste ciclo]")
    parts.append("")

    # RELATÓRIO ESTRATÉGICO
    parts.append("=== RELATÓRIO ESTRATÉGICO (planilha de reuniões + entregas) ===")
    if relatorio_meta:
        parts.append(f"Arquivo: {relatorio_meta['name']}")
        parts.append(f"Link: {relatorio_meta.get('web_view_link', '—')}")
        if relatorio_meta.get("modified_time"):
            parts.append(f"Modificado em: {relatorio_meta['modified_time'][:10]}")
        parts.append("")
        parts.append("CONTEÚDO COMPLETO (todas as abas):")
        parts.append(relatorio_content or "[Conteúdo não pôde ser extraído]")
    else:
        parts.append("[RELATÓRIO ESTRATÉGICO NÃO encontrado em 09. ENTREGAS deste ciclo]")

    # Conta total de items pra retornar (entregas + 1 se houver relatório)
    items_count = entregas.get("total_arquivos", 0) + (1 if relatorio_meta else 0)

    return ("\n".join(parts), items_count)
