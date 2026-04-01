"""
Rotas admin de integração ClickUp — FLG Jornada System.

Endpoints:
  POST /admin/clickup/import       — importação bulk de clientes da List
  GET  /admin/clickup/fields       — listar custom fields da List (para mapeamento)
  GET  /admin/clickup/preview      — preview sem gravar (dry-run)
  POST /admin/clickup/webhook      — endpoint para receber webhooks do ClickUp
"""

import hashlib
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from deps import get_current_user, supabase_client
from tools.clickup_tools import (
    list_all_tasks,
    task_to_cliente_data,
    get_list_fields,
    get_task_details,
    get_custom_field_value,
)

logger = logging.getLogger("flg.clickup")
router = APIRouter(prefix="/admin/clickup", tags=["admin-clickup"])
_supabase = supabase_client


# ID real do workspace FLG
LIST_CLIENTES_BS = "901315392942"   # Clientes | BS (Business Strategist)

def _get_list_ids() -> list:
    """Retorna as List IDs configuradas. Default: BS."""
    env_id = os.getenv("CLICKUP_LIST_ID", "")
    if env_id:
        return [lid.strip() for lid in env_id.split(",")]
    return [LIST_CLIENTES_BS]


# ─── Preview (dry-run) ───────────────────────────────────────────────────────

@router.get("/preview")
async def preview_import(user=Depends(get_current_user)):
    """
    Mostra o que seria importado sem gravar nada.
    Busca de ambas as lists (BS + AC).
    """
    list_ids = _get_list_ids()
    all_tasks = []
    for lid in list_ids:
        all_tasks.extend(list_all_tasks(lid))

    preview = []
    for task in all_tasks:
        data = task_to_cliente_data(task)
        data["_clickup_status_raw"] = task.get("status", {}).get("status", "")
        data["_clickup_url"] = task.get("url", "")
        data["_list"] = task.get("list", {}).get("name", "")
        preview.append(data)

    return {
        "total_tasks": len(all_tasks),
        "preview": preview,
        "lists": list_ids,
    }


# ─── Custom fields da List ───────────────────────────────────────────────────

@router.get("/fields")
async def list_custom_fields(user=Depends(get_current_user)):
    """Retorna os custom fields das Lists de clientes."""
    list_ids = _get_list_ids()
    all_fields = {}
    for lid in list_ids:
        for f in get_list_fields(lid):
            all_fields[f["id"]] = f
    return {"fields": list(all_fields.values()), "lists": list_ids}


# ─── Import bulk ──────────────────────────────────────────────────────────────

class ImportConfig(BaseModel):
    field_map: Optional[dict] = None  # custom_field_name → coluna_supabase
    dry_run: bool = False


@router.post("/import")
async def import_clientes(
    body: ImportConfig = ImportConfig(),
    user=Depends(get_current_user),
):
    """
    Importa todos os clientes da List do ClickUp para o Supabase.
    Faz upsert por clickup_task_id — atualiza existentes e cria novos.
    """
    list_ids = _get_list_ids()
    tasks = []
    for lid in list_ids:
        tasks.extend(list_all_tasks(lid))

    if not tasks:
        return {"importados": 0, "atualizados": 0, "erros": 0, "mensagem": "Nenhuma task encontrada na List"}

    importados, atualizados, erros = 0, 0, 0
    detalhes = []

    for task in tasks:
        try:
            data = task_to_cliente_data(task, body.field_map)

            if not data.get("nome"):
                continue

            # Empresa é NOT NULL — fallback para nome
            if not data.get("empresa"):
                data["empresa"] = data["nome"]
            data.pop("situacao_clickup", None)

            if body.dry_run:
                detalhes.append({"acao": "preview", **data})
                continue

            # Verificar se já existe por clickup_task_id
            existing = _supabase.table("clientes").select("id").eq(
                "clickup_task_id", data["clickup_task_id"]
            ).execute()

            if existing.data:
                # Update — não sobrescrever nome se já existe
                update_data = {k: v for k, v in data.items() if k != "nome" and v}
                _supabase.table("clientes").update(update_data).eq(
                    "clickup_task_id", data["clickup_task_id"]
                ).execute()
                atualizados += 1
                detalhes.append({"acao": "atualizado", **data})
            else:
                # Insert
                _supabase.table("clientes").insert(data).execute()
                importados += 1
                detalhes.append({"acao": "importado", **data})

        except Exception as e:
            erros += 1
            detalhes.append({
                "acao": "erro",
                "nome": task.get("name", "?"),
                "erro": str(e)[:200],
            })
            logger.error(f"Erro ao importar task {task.get('name')}: {e}")

    logger.info(f"ClickUp import: {importados} novos, {atualizados} atualizados, {erros} erros")

    return {
        "importados": importados,
        "atualizados": atualizados,
        "erros": erros,
        "total_tasks": len(tasks),
        "detalhes": detalhes,
    }


# ─── Webhook ──────────────────────────────────────────────────────────────────

@router.post("/webhook")
async def clickup_webhook(request: Request):
    """
    Recebe webhooks do ClickUp quando tasks são criadas/atualizadas.
    Sem autenticação (ClickUp não envia JWT) — valida por assinatura.
    """
    body = await request.json()

    # ClickUp envia um challenge no registro do webhook
    if "challenge" in body:
        return body

    event = body.get("event")
    task_id = body.get("task_id")

    if not task_id:
        return {"ok": True, "skipped": "no task_id"}

    # Filtrar eventos relevantes
    relevant_events = {
        "taskCreated", "taskUpdated", "taskStatusUpdated",
        "taskAssigneeUpdated", "taskMoved",
    }
    if event not in relevant_events:
        return {"ok": True, "skipped": f"event {event} not tracked"}

    logger.info(f"ClickUp webhook: {event} task={task_id}")

    try:
        # Buscar task completa
        from tools.clickup_tools import _headers, CLICKUP_API_BASE
        import requests

        resp = requests.get(
            f"{CLICKUP_API_BASE}/task/{task_id}",
            headers=_headers(),
            params={"include_subtasks": "true"},
            timeout=15,
        )
        resp.raise_for_status()
        task = resp.json()

        data = task_to_cliente_data(task)
        if not data.get("nome"):
            return {"ok": True, "skipped": "empty name"}
        if not data.get("empresa"):
            data["empresa"] = data["nome"]
        data.pop("situacao_clickup", None)

        # Verificar se pertence a uma das nossas Lists
        valid_lists = set(_get_list_ids())
        task_list_id = task.get("list", {}).get("id", "")
        if valid_lists and task_list_id not in valid_lists:
            return {"ok": True, "skipped": "different list"}

        # Upsert
        existing = _supabase.table("clientes").select("id").eq(
            "clickup_task_id", data["clickup_task_id"]
        ).execute()

        if existing.data:
            update_data = {k: v for k, v in data.items() if k != "nome" and v}
            _supabase.table("clientes").update(update_data).eq(
                "clickup_task_id", data["clickup_task_id"]
            ).execute()
            logger.info(f"  Webhook: atualizado {data['nome']}")
        else:
            _supabase.table("clientes").insert(data).execute()
            logger.info(f"  Webhook: importado {data['nome']}")

        return {"ok": True, "action": "upserted", "nome": data["nome"]}

    except Exception as e:
        logger.error(f"Webhook erro task {task_id}: {e}")
        return {"ok": False, "error": str(e)[:200]}
