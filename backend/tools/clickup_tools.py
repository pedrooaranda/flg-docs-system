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


def _get_users_field_name(task: dict, field_name: str) -> str:
    """Extrai o username de um campo do tipo 'users'."""
    for f in task.get("custom_fields", []):
        if f.get("name", "").lower().strip() == field_name.lower().strip():
            if f.get("type") == "users":
                vals = f.get("value") or []
                if isinstance(vals, list) and vals:
                    return vals[0].get("username") or vals[0].get("email", "")
            return get_custom_field_value(task, field_name)
    return ""


def task_to_cliente_data(task: dict, field_map: dict = None) -> dict:
    """
    Converte uma task do ClickUp (List Clientes | BS / AC) em dados
    para upsert na tabela clientes do Supabase.

    Mapeamento baseado nos custom fields reais do workspace FLG:
      - "Nome da Empresa" → empresa
      - "Consultor" (users) → consultor_responsavel
      - "Estrategista" (users) → estrategista
      - "ENCONTRO ATUAL" (dropdown: "ENCONTRO 2"..."ENCONTRO 30") → encontro_atual
      - "SITUAÇÃO" (dropdown) → status
      - "E-mail" → email no extra_data
      - "@ do instagram" → seguidores_instagram ref
      - "Plano" (dropdown) → plano no extra_data
      - "Momento Atual" (text) → situacao_atual
      - "Breve Contexto do Cliente" (text) → contexto
    """
    import re

    data = {
        "nome": task.get("name", "").strip(),
        "clickup_task_id": task.get("id", ""),
    }

    # Empresa
    empresa = get_custom_field_value(task, "Nome da Empresa")
    if empresa:
        data["empresa"] = empresa

    # Consultor (campo users)
    consultor = _get_users_field_name(task, "Consultor")
    if consultor:
        data["consultor_responsavel"] = consultor

    # Estrategista (campo users)
    estrategista = _get_users_field_name(task, "Estrategista")
    if estrategista:
        data["estrategista"] = estrategista

    # Encontro atual (dropdown "ENCONTRO 2"..."ENCONTRO 30", "ONBOARDING", etc.)
    encontro_raw = get_custom_field_value(task, "ENCONTRO ATUAL")
    if encontro_raw:
        nums = re.findall(r"\d+", encontro_raw)
        if nums:
            data["encontro_atual"] = int(nums[0])
        elif "ONBOARDING" in encontro_raw.upper():
            data["encontro_atual"] = 1
        elif "AGUARDANDO" in encontro_raw.upper():
            data["encontro_atual"] = 0

    # Situação → status
    situacao_raw = get_custom_field_value(task, "SITUAÇÃO")
    if situacao_raw:
        sit_lower = situacao_raw.lower()
        if any(w in sit_lower for w in ["excelente", "indo bem", "normal", "campanha"]):
            data["status"] = "ativo"
        elif any(w in sit_lower for w in ["pausado"]):
            data["status"] = "pausado"
        elif any(w in sit_lower for w in ["encerrado", "encerramento"]):
            data["status"] = "concluido"
        elif any(w in sit_lower for w in ["atenção", "alerta", "procrastinação", "resolução"]):
            data["status"] = "ativo"  # ainda ativo, mas com alerta
        else:
            data["status"] = "ativo"
        # Guardar a situação original para contexto
        data["situacao_clickup"] = situacao_raw

    # Momento Atual → situacao_atual
    momento = get_custom_field_value(task, "Momento Atual")
    if momento:
        data["situacao_atual"] = momento

    # Fallback: assignees → consultor
    if "consultor_responsavel" not in data or not data["consultor_responsavel"]:
        assignees = task.get("assignees", [])
        if assignees:
            data["consultor_responsavel"] = assignees[0].get("username") or assignees[0].get("email", "")

    # Fallback status from ClickUp task status
    if "status" not in data:
        status_raw = task.get("status", {}).get("status", "").lower()
        status_map = {
            "ativo": "ativo", "active": "ativo", "em andamento": "ativo",
            "to do": "ativo", "open": "ativo",
            "pausado": "pausado", "paused": "pausado",
            "concluído": "concluido", "complete": "concluido",
            "done": "concluido", "closed": "concluido",
        }
        data["status"] = status_map.get(status_raw, "ativo")

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
