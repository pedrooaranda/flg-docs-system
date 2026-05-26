"""
Script de exploração da estrutura do Drive FLG.

Uso na VPS:
    docker compose exec backend python3 -m scripts.explore_drive_structure

Opcionalmente filtra por nome de cliente:
    docker compose exec backend python3 -m scripts.explore_drive_structure --cliente "Letícia"

O que faz:
  1. Lista subpastas de FLG_DRIVE_MASTER_FOLDER_ID (BUSINESS STRATEGISTS)
  2. Pra cada cliente (ou só o filtrado): inspeciona estrutura
     - subpasta ENTREGAS? Quais arquivos por extensão?
     - Tem arquivo "Relatório de Entregas" (planilha)?
       Se sim: exporta cada aba pra texto e mostra primeiras N linhas
  3. Imprime relatório consolidado pro stdout (sem expor dados sensíveis demais)

Usado pra mapear a estrutura real antes de cravar lógica de parsing em código.
Memory ref: flg_drive_estrutura_clientes (a criar baseado no output deste script).
"""

import os
import sys
import argparse
import json
import logging
from typing import Optional

# Setup path pra importar do backend
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("flg.explore")


# Categorias por extensão (mesmo critério proposto pelo Pedro)
_EXT_TO_CATEGORY = {
    "design": {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".heic", ".tiff", ".psd", ".ai"},
    "audiovisual": {".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v"},
    "audio": {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"},
    "documento": {".pdf", ".docx", ".doc", ".odt", ".rtf"},
    "planilha": {".xlsx", ".xls", ".ods", ".csv"},
    "apresentacao": {".pptx", ".ppt", ".odp", ".key"},
}
_GOOGLE_MIME_CATEGORIA = {
    "application/vnd.google-apps.document": "documento (Google Doc)",
    "application/vnd.google-apps.spreadsheet": "planilha (Google Sheet)",
    "application/vnd.google-apps.presentation": "apresentacao (Google Slides)",
    "application/vnd.google-apps.folder": "pasta",
}


def _categorize(name: str, mime_type: str) -> str:
    """Categoriza arquivo por extensão OU MIME (pra Google-native files)."""
    if mime_type in _GOOGLE_MIME_CATEGORIA:
        return _GOOGLE_MIME_CATEGORIA[mime_type]
    if "." in name:
        ext = "." + name.rsplit(".", 1)[-1].lower()
        for cat, exts in _EXT_TO_CATEGORY.items():
            if ext in exts:
                return cat
    return "outro"


def _list_folder(service, folder_id: str) -> list[dict]:
    """Lista arquivos/pastas filhos diretos de folder_id."""
    files = []
    page_token = None
    while True:
        resp = service.files().list(
            q=f"'{folder_id}' in parents and trashed = false",
            pageSize=200,
            fields="nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, size)",
            pageToken=page_token,
            includeItemsFromAllDrives=True,
            supportsAllDrives=True,
        ).execute()
        files.extend(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return files


def _export_sheet_to_csv(service, file_id: str) -> Optional[str]:
    """Exporta primeira aba de um Google Sheet como CSV. Pra múltiplas abas, precisa Sheets API."""
    try:
        data = service.files().export(fileId=file_id, mimeType="text/csv").execute()
        return data.decode("utf-8", errors="replace") if isinstance(data, bytes) else str(data)
    except Exception as e:
        logger.warning(f"export sheet falhou: {e}")
        return None


def _list_sheet_tabs(file_id: str, creds) -> list[dict]:
    """Lista abas de um Google Sheet via Sheets API."""
    try:
        from googleapiclient.discovery import build
        sheets_service = build("sheets", "v4", credentials=creds, cache_discovery=False)
        meta = sheets_service.spreadsheets().get(spreadsheetId=file_id, fields="sheets.properties").execute()
        return [s["properties"] for s in meta.get("sheets", [])]
    except Exception as e:
        logger.warning(f"list tabs falhou: {e}")
        return []


def _get_sheet_first_rows(file_id: str, sheet_name: str, n: int = 5, creds=None) -> list[list]:
    """Pega primeiras N linhas de uma aba específica."""
    try:
        from googleapiclient.discovery import build
        sheets_service = build("sheets", "v4", credentials=creds, cache_discovery=False)
        result = sheets_service.spreadsheets().values().get(
            spreadsheetId=file_id,
            range=f"'{sheet_name}'!A1:Z{n}",
        ).execute()
        return result.get("values", [])
    except Exception as e:
        logger.warning(f"get first rows falhou: {e}")
        return []


import re as _re

# Padrões mais robustos baseados nos achados reais (2026-05-26)
_ENTREGAS_PATTERN = _re.compile(r"^\s*(?:\d+\s*\.\s*)?entregas?\s*$", _re.IGNORECASE)
_RELATORIO_PATTERN = _re.compile(r"relat[óo]rio.*entregas?", _re.IGNORECASE)
_CICLO_PATTERN = _re.compile(r"^\s*ciclo\s*\|", _re.IGNORECASE)


def _is_entregas_folder(name: str) -> bool:
    """Match '09. ENTREGAS', '09.ENTREGAS', 'ENTREGAS', '09. entregas ', etc."""
    return bool(_ENTREGAS_PATTERN.match((name or "").strip()))


def _is_ciclo_folder(name: str) -> bool:
    """Match 'CICLO | 2026.1', 'CICLO | 2025.2', etc."""
    return bool(_CICLO_PATTERN.match((name or "").strip()))


def _summarize_folder_contents(service, folder_id: str) -> dict:
    """Lista arquivos+subpastas de uma folder e retorna sumário (counts por categoria)."""
    children = _list_folder(service, folder_id)
    subfolders = [c for c in children if c.get("mimeType") == "application/vnd.google-apps.folder"]
    files = [c for c in children if c.get("mimeType") != "application/vnd.google-apps.folder"]

    summary = {
        "subpastas": [{"name": sf["name"], "id": sf["id"]} for sf in subfolders],
        "arquivos_count": len(files),
        "arquivos_por_categoria": {},
        "samples": [],
    }
    for f in files:
        cat = _categorize(f["name"], f.get("mimeType", ""))
        summary["arquivos_por_categoria"].setdefault(cat, 0)
        summary["arquivos_por_categoria"][cat] += 1
        if len(summary["samples"]) < 3:
            summary["samples"].append({"name": f["name"], "cat": cat})
    return summary


def _explore_entregas_deep(service, entregas_folder_id: str, entregas_name: str) -> dict:
    """Inspeciona uma pasta '09. ENTREGAS' a fundo (subpastas + arquivos por categoria)."""
    summary = _summarize_folder_contents(service, entregas_folder_id)
    # Cava 1 nível mais fundo nas subpastas (provavelmente são setores)
    deep_subpastas = []
    for sub in summary["subpastas"]:
        sub_summary = _summarize_folder_contents(service, sub["id"])
        deep_subpastas.append({
            "name": sub["name"],
            "id": sub["id"],
            "arquivos_count": sub_summary["arquivos_count"],
            "arquivos_por_categoria": sub_summary["arquivos_por_categoria"],
        })
    summary["subpastas"] = deep_subpastas
    summary["folder_name"] = entregas_name
    summary["folder_id"] = entregas_folder_id
    return summary


def _find_relatorio_recursive(service, folder_id: str, max_depth: int = 3, depth: int = 0, parent_path: str = "") -> list[dict]:
    """Procura arquivos matching 'Relatório de Entregas' recursivamente até max_depth níveis."""
    if depth > max_depth:
        return []
    found = []
    children = _list_folder(service, folder_id)
    for c in children:
        name = c.get("name", "")
        cur_path = f"{parent_path}/{name}" if parent_path else name
        if c.get("mimeType") == "application/vnd.google-apps.folder":
            found.extend(_find_relatorio_recursive(service, c["id"], max_depth, depth + 1, cur_path))
        else:
            if _RELATORIO_PATTERN.search(name):
                found.append({**c, "_path": cur_path})
    return found


def _enrich_relatorio_info(relat: dict, creds) -> dict:
    """Enriquece info do arquivo 'Relatório de Entregas' (abas se for sheet)."""
    relat_info = {
        "name": relat["name"],
        "id": relat["id"],
        "mime_type": relat.get("mimeType"),
        "modified": relat.get("modifiedTime"),
        "web_view_link": relat.get("webViewLink"),
        "path": relat.get("_path", "?"),
        "abas": [],
    }
    if relat.get("mimeType") == "application/vnd.google-apps.spreadsheet":
        tabs = _list_sheet_tabs(relat["id"], creds)
        for tab in tabs:
            tab_name = tab.get("title", "(sem nome)")
            first_rows = _get_sheet_first_rows(relat["id"], tab_name, n=5, creds=creds)
            relat_info["abas"].append({
                "name": tab_name,
                "row_count": tab.get("gridProperties", {}).get("rowCount"),
                "col_count": tab.get("gridProperties", {}).get("columnCount"),
                "primeiras_5_linhas": first_rows,
            })
    return relat_info


def explore_cliente(service, creds, cliente_folder: dict) -> dict:
    """
    Inspeciona estrutura de 1 cliente, lidando com 2 padrões observados:
      (A) Cliente novo: 01-09 subpastas + BANCO DE DADOS
      (B) Cliente renovado: CICLO|YYYY.X subpastas + BANCO DE DADOS
    """
    folder_id = cliente_folder["id"]
    folder_name = cliente_folder["name"]

    report = {
        "cliente": folder_name,
        "folder_id": folder_id,
        "web_view_link": cliente_folder.get("webViewLink"),
        "padrao": None,  # 'novo' | 'renovado' | 'misto' | 'desconhecido'
        "subpastas_top_level": [],
        "ciclos": [],
        "entregas_consolidadas": [],  # lista de 09. ENTREGAS encontradas (1 ou várias)
        "relatorio_entregas_encontrados": [],
    }

    top_children = _list_folder(service, folder_id)
    top_subfolders = [c for c in top_children if c.get("mimeType") == "application/vnd.google-apps.folder"]

    report["subpastas_top_level"] = [{"name": sf["name"], "id": sf["id"]} for sf in top_subfolders]

    # Detecta padrão
    has_ciclo = any(_is_ciclo_folder(sf["name"]) for sf in top_subfolders)
    has_entregas_top = any(_is_entregas_folder(sf["name"]) for sf in top_subfolders)
    if has_ciclo and has_entregas_top:
        report["padrao"] = "misto"
    elif has_ciclo:
        report["padrao"] = "renovado"
    elif has_entregas_top:
        report["padrao"] = "novo"
    else:
        report["padrao"] = "desconhecido"

    # Caso (A) padrão "novo" — explora 09. ENTREGAS no topo
    for sf in top_subfolders:
        if _is_entregas_folder(sf["name"]):
            report["entregas_consolidadas"].append(
                _explore_entregas_deep(service, sf["id"], sf["name"])
            )

    # Caso (B) padrão "renovado" — explora cada CICLO
    for sf in top_subfolders:
        if _is_ciclo_folder(sf["name"]):
            ciclo_report = {
                "ciclo_name": sf["name"],
                "ciclo_id": sf["id"],
                "subpastas": [],
                "entregas": None,
            }
            ciclo_children = _list_folder(service, sf["id"])
            ciclo_subfolders = [c for c in ciclo_children if c.get("mimeType") == "application/vnd.google-apps.folder"]
            ciclo_report["subpastas"] = [{"name": cs["name"], "id": cs["id"]} for cs in ciclo_subfolders]
            # Procura 09. ENTREGAS dentro do ciclo
            for cs in ciclo_subfolders:
                if _is_entregas_folder(cs["name"]):
                    ciclo_report["entregas"] = _explore_entregas_deep(service, cs["id"], cs["name"])
                    break
            report["ciclos"].append(ciclo_report)

    # Procura "Relatório de Entregas" recursivo (até 3 níveis de profundidade)
    relatorios = _find_relatorio_recursive(service, folder_id, max_depth=3)
    for r in relatorios:
        report["relatorio_entregas_encontrados"].append(_enrich_relatorio_info(r, creds))

    return report


def main():
    parser = argparse.ArgumentParser(description="Explora estrutura do Drive FLG.")
    parser.add_argument("--cliente", help="Filtra por nome de subpasta (case-insensitive substring)")
    parser.add_argument("--max", type=int, default=3, help="Máximo de clientes a inspecionar")
    parser.add_argument("--output", default="-", help="Arquivo de output (default: stdout)")
    args = parser.parse_args()

    master_folder_id = os.getenv("FLG_DRIVE_MASTER_FOLDER_ID")
    if not master_folder_id:
        print("ERRO: FLG_DRIVE_MASTER_FOLDER_ID não configurado", file=sys.stderr)
        sys.exit(1)

    from services.google_drive_service import _load_credentials
    creds = _load_credentials()
    if not creds:
        print("ERRO: credenciais Drive não carregaram", file=sys.stderr)
        sys.exit(1)

    from googleapiclient.discovery import build
    service = build("drive", "v3", credentials=creds, cache_discovery=False)

    # Lista subpastas (clientes) do master folder
    print(f"📂 Listando subpastas de {master_folder_id}...", file=sys.stderr)
    children = _list_folder(service, master_folder_id)
    client_folders = [c for c in children if c.get("mimeType") == "application/vnd.google-apps.folder"]
    print(f"   Encontradas {len(client_folders)} subpastas (presumidamente clientes)", file=sys.stderr)

    # Filtra
    if args.cliente:
        q = args.cliente.lower()
        client_folders = [c for c in client_folders if q in c["name"].lower()]
        print(f"   Filtrado por '{args.cliente}': {len(client_folders)} pastas", file=sys.stderr)

    client_folders = client_folders[:args.max]
    print(f"   Inspecionando {len(client_folders)} cliente(s)...\n", file=sys.stderr)

    # Inspeciona
    reports = []
    for cf in client_folders:
        print(f"  → {cf['name']}...", file=sys.stderr)
        reports.append(explore_cliente(service, creds, cf))

    # Output
    output_json = json.dumps(reports, indent=2, ensure_ascii=False)
    if args.output == "-":
        print(output_json)
    else:
        with open(args.output, "w", encoding="utf-8") as fp:
            fp.write(output_json)
        print(f"✅ Output salvo em {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
