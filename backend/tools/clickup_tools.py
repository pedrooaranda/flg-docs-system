"""
Tool de leitura de comentários do ClickUp via REST API.
Usada pelo agente de rotina para sincronizar atualizações dos clientes.
"""

import logging
import os
from datetime import datetime

import requests

logger = logging.getLogger("flg.clickup")

CLICKUP_API_BASE = "https://api.clickup.com/api/v2"


def _headers() -> dict:
    token = os.getenv("CLICKUP_API_TOKEN", "")
    if not token:
        raise RuntimeError("CLICKUP_API_TOKEN não configurado")
    return {"Authorization": token}


def read_clickup_comments(task_id: str, limit: int = 10) -> str:
    """
    Lê os comentários mais recentes de uma task do ClickUp.
    Retorna string formatada com os últimos comentários do cliente.

    Args:
        task_id: ID da task no ClickUp (ex: 'abc123def')
        limit: número máximo de comentários a retornar (padrão 10)
    """
    try:
        resp = requests.get(
            f"{CLICKUP_API_BASE}/task/{task_id}/comment",
            headers=_headers(),
            timeout=15,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"Erro ao buscar comentários ClickUp task {task_id}: {e}")
        return f"Erro ao acessar ClickUp: {e}"

    comments = resp.json().get("comments", [])
    if not comments:
        return "Nenhum comentário encontrado na task."

    # Pegar os mais recentes
    recent = comments[-limit:]
    lines = []
    for c in recent:
        user = c.get("user", {}).get("username", "desconhecido")
        date_ms = c.get("date", 0)
        date_str = datetime.fromtimestamp(date_ms / 1000).strftime("%d/%m/%Y %H:%M") if date_ms else "?"
        text = c.get("comment_text", "").strip()
        if text:
            lines.append(f"[{date_str}] {user}: {text}")

    return "\n".join(lines) if lines else "Nenhum comentário com texto encontrado."


def get_task_details(task_id: str) -> dict:
    """
    Retorna detalhes básicos de uma task do ClickUp (nome, status, assignees).
    """
    try:
        resp = requests.get(
            f"{CLICKUP_API_BASE}/task/{task_id}",
            headers=_headers(),
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "nome": data.get("name", ""),
            "status": data.get("status", {}).get("status", ""),
            "url": data.get("url", ""),
        }
    except requests.RequestException as e:
        logger.error(f"Erro ao buscar task ClickUp {task_id}: {e}")
        return {}


def list_all_tasks(list_id: str) -> list:
    """
    Pagina todas as tasks de uma List do ClickUp.
    Retorna lista completa de tasks com custom fields.
    """
    tasks = []
    page = 0
    while True:
        try:
            resp = requests.get(
                f"{CLICKUP_API_BASE}/list/{list_id}/task",
                headers=_headers(),
                params={
                    "page": page,
                    "include_closed": "true",
                    "subtasks": "true",
                },
                timeout=30,
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.error(f"Erro ao listar tasks ClickUp (page {page}): {e}")
            break

        batch = resp.json().get("tasks", [])
        tasks.extend(batch)
        if len(batch) < 100:
            break
        page += 1

    logger.info(f"ClickUp: {len(tasks)} tasks encontradas na list {list_id}")
    return tasks


def get_custom_field_value(task: dict, field_name: str) -> str:
    """Extrai o valor de um custom field pelo nome (case-insensitive)."""
    for f in task.get("custom_fields", []):
        if f.get("name", "").lower().strip() == field_name.lower().strip():
            # Text / Short Text / Email
            if f.get("type") in ("text", "short_text", "email", "url", "phone"):
                return (f.get("value") or "").strip()
            # Number
            if f.get("type") == "number":
                return str(f.get("value") or "")
            # Drop-down
            if f.get("type") == "drop_down":
                opt_id = f.get("value")
                if opt_id and f.get("type_config", {}).get("options"):
                    for opt in f["type_config"]["options"]:
                        if str(opt.get("orderindex")) == str(opt_id) or opt.get("id") == opt_id:
                            return opt.get("name", "")
                return str(opt_id or "")
            # Labels / Tags
            if f.get("type") == "labels":
                vals = f.get("value") or []
                if isinstance(vals, list):
                    opts = f.get("type_config", {}).get("options", [])
                    return ", ".join(
                        next((o["label"] for o in opts if o["id"] == v), str(v))
                        for v in vals
                    )
            # Generic fallback
            return str(f.get("value") or "")
    return ""


def task_to_cliente_data(task: dict, field_map: dict = None) -> dict:
    """
    Converte uma task do ClickUp em dados para upsert na tabela clientes.

    field_map: mapeamento custom_field_name → coluna_supabase.
    Default: { "Empresa": "empresa", "Consultor": "consultor_responsavel",
               "Etapa": "encontro_atual" }
    """
    if field_map is None:
        field_map = {
            "empresa": "empresa",
            "consultor": "consultor_responsavel",
            "consultor responsável": "consultor_responsavel",
            "etapa": "encontro_atual",
            "encontro": "encontro_atual",
            "encontro atual": "encontro_atual",
        }

    # Status mapping ClickUp → Supabase
    status_raw = task.get("status", {}).get("status", "").lower()
    status_map = {
        "ativo": "ativo", "active": "ativo", "em andamento": "ativo",
        "to do": "ativo", "open": "ativo",
        "pausado": "pausado", "paused": "pausado", "on hold": "pausado",
        "concluído": "concluido", "complete": "concluido", "done": "concluido",
        "closed": "concluido",
    }
    status = status_map.get(status_raw, "ativo")

    data = {
        "nome": task.get("name", "").strip(),
        "clickup_task_id": task.get("id", ""),
        "status": status,
    }

    # Mapear custom fields
    for cf_name, col_name in field_map.items():
        val = get_custom_field_value(task, cf_name)
        if val:
            if col_name == "encontro_atual":
                # Extrair número do valor (ex: "Encontro 7" → 7, ou "7" → 7)
                import re
                nums = re.findall(r"\d+", val)
                if nums:
                    data[col_name] = int(nums[0])
            else:
                data[col_name] = val

    # Assignees → consultor_responsavel (fallback se não veio do custom field)
    if "consultor_responsavel" not in data or not data["consultor_responsavel"]:
        assignees = task.get("assignees", [])
        if assignees:
            data["consultor_responsavel"] = assignees[0].get("username") or assignees[0].get("email", "")

    return data


def get_list_fields(list_id: str) -> list:
    """Retorna os custom fields definidos numa List (para o mapeador de campos)."""
    try:
        resp = requests.get(
            f"{CLICKUP_API_BASE}/list/{list_id}/field",
            headers=_headers(),
            timeout=15,
        )
        resp.raise_for_status()
        return [
            {"id": f["id"], "name": f["name"], "type": f["type"]}
            for f in resp.json().get("fields", [])
        ]
    except requests.RequestException as e:
        logger.error(f"Erro ao buscar fields da list {list_id}: {e}")
        return []
