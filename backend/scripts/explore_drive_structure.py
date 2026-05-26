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


def explore_cliente(service, creds, cliente_folder: dict) -> dict:
    """Inspeciona estrutura de 1 cliente. Retorna dict relatório."""
    folder_id = cliente_folder["id"]
    folder_name = cliente_folder["name"]

    report = {
        "cliente": folder_name,
        "folder_id": folder_id,
        "web_view_link": cliente_folder.get("webViewLink"),
        "subpastas": [],
        "arquivos_raiz": {"count": 0, "por_categoria": {}, "samples": []},
        "entregas": None,
        "relatorio_entregas": None,
    }

    children = _list_folder(service, folder_id)

    # Separa: pastas vs arquivos
    subfolders = [c for c in children if c.get("mimeType") == "application/vnd.google-apps.folder"]
    files = [c for c in children if c.get("mimeType") != "application/vnd.google-apps.folder"]

    # Sumário das subpastas
    for sf in subfolders:
        report["subpastas"].append({
            "name": sf["name"],
            "id": sf["id"],
        })

    # Arquivos na raiz (counts por categoria)
    for f in files:
        cat = _categorize(f["name"], f.get("mimeType", ""))
        report["arquivos_raiz"]["por_categoria"].setdefault(cat, 0)
        report["arquivos_raiz"]["por_categoria"][cat] += 1
        if len(report["arquivos_raiz"]["samples"]) < 5:
            report["arquivos_raiz"]["samples"].append({"name": f["name"], "cat": cat})
    report["arquivos_raiz"]["count"] = len(files)

    # Procura subpasta ENTREGAS (case-insensitive)
    entregas_folder = next(
        (sf for sf in subfolders if sf["name"].strip().lower() in ("entregas", "entrega")),
        None,
    )
    if entregas_folder:
        entregas_children = _list_folder(service, entregas_folder["id"])
        # Subpastas dentro de ENTREGAS (provavelmente por setor)
        entregas_subfolders = [
            c for c in entregas_children if c.get("mimeType") == "application/vnd.google-apps.folder"
        ]
        entregas_files = [
            c for c in entregas_children if c.get("mimeType") != "application/vnd.google-apps.folder"
        ]
        report["entregas"] = {
            "folder_id": entregas_folder["id"],
            "subpastas": [{"name": s["name"], "id": s["id"]} for s in entregas_subfolders],
            "arquivos_raiz_count": len(entregas_files),
            "arquivos_por_categoria": {},
        }
        # Conta arquivos diretos de ENTREGAS por categoria
        for f in entregas_files:
            cat = _categorize(f["name"], f.get("mimeType", ""))
            report["entregas"]["arquivos_por_categoria"].setdefault(cat, 0)
            report["entregas"]["arquivos_por_categoria"][cat] += 1
        # Pra cada subpasta de ENTREGAS, conta arquivos por categoria
        for sub in entregas_subfolders:
            sub_files = _list_folder(service, sub["id"])
            sub_files = [c for c in sub_files if c.get("mimeType") != "application/vnd.google-apps.folder"]
            sub_report = {"name": sub["name"], "count": len(sub_files), "por_categoria": {}}
            for sf in sub_files:
                cat = _categorize(sf["name"], sf.get("mimeType", ""))
                sub_report["por_categoria"].setdefault(cat, 0)
                sub_report["por_categoria"][cat] += 1
            report["entregas"]["subpastas"] = [
                s for s in report["entregas"]["subpastas"] if s["id"] != sub["id"]
            ]
            report["entregas"]["subpastas"].append(sub_report | {"id": sub["id"]})

    # Procura arquivo "Relatório de Entregas" (em qualquer lugar — raiz, subpastas)
    import re
    pattern = re.compile(r"relat[óo]rio.*entregas?", re.IGNORECASE)
    relatorio_candidates = []
    # Busca em raiz
    for f in files:
        if pattern.search(f["name"]):
            relatorio_candidates.append(f)
    # Busca em subpastas tipo "Estratégia" ou "PE" (não vai fundo demais)
    for sf in subfolders:
        sf_children = _list_folder(service, sf["id"])
        for c in sf_children:
            if pattern.search(c["name"]):
                relatorio_candidates.append({**c, "_parent": sf["name"]})

    if relatorio_candidates:
        # Pega o primeiro candidato
        relat = relatorio_candidates[0]
        relat_info = {
            "name": relat["name"],
            "id": relat["id"],
            "mime_type": relat.get("mimeType"),
            "modified": relat.get("modifiedTime"),
            "web_view_link": relat.get("webViewLink"),
            "parent": relat.get("_parent", "raiz"),
            "abas": [],
        }
        # Se for Google Sheet, lista abas
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
        report["relatorio_entregas"] = relat_info
    else:
        report["relatorio_entregas"] = "NÃO ENCONTRADO"

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
