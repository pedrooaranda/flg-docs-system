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
