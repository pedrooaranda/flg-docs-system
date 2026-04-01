"""
Serviço de sincronização automática ClickUp → Supabase.

Roda automaticamente:
  1. Na inicialização do backend (sync completo)
  2. A cada 6 horas via APScheduler
  3. Em tempo real via webhook (quando tasks mudam no ClickUp)

Fluxo:
  - Busca todas as tasks da List "Clientes | BS"
  - Para cada task, converte em dados de cliente e faz upsert por clickup_task_id
  - Clientes novos são criados, existentes são atualizados
  - Logga tudo para rastreabilidade
"""

import logging
import os
import requests

from tools.clickup_tools import list_all_tasks, task_to_cliente_data

logger = logging.getLogger("flg.clickup_sync")

LIST_CLIENTES_BS = "901315392942"

CLICKUP_API_BASE = "https://api.clickup.com/api/v2"


def run_clickup_sync():
    """
    Sync completo — chamado pelo APScheduler e no startup.
    Busca todas as tasks da List e faz upsert no Supabase.
    """
    from deps import supabase_client as sb

    token = os.getenv("CLICKUP_API_TOKEN", "")
    if not token:
        logger.warning("⚠️ CLICKUP_API_TOKEN não configurado — sync pulado")
        return

    logger.info("🔄 ClickUp sync iniciando...")

    try:
        tasks = list_all_tasks(LIST_CLIENTES_BS)
    except Exception as e:
        logger.error(f"❌ Erro ao buscar tasks do ClickUp: {e}")
        return

    if not tasks:
        logger.info("Nenhuma task encontrada na List BS")
        return

    importados, atualizados, erros = 0, 0, 0

    for task in tasks:
        try:
            data = task_to_cliente_data(task)
            if not data.get("nome"):
                continue

            # Remover campo não existente no schema
            data.pop("situacao_clickup", None)

            existing = sb.table("clientes").select("id").eq(
                "clickup_task_id", data["clickup_task_id"]
            ).execute()

            if existing.data:
                update_data = {k: v for k, v in data.items() if k != "nome" and v}
                if update_data:
                    sb.table("clientes").update(update_data).eq(
                        "clickup_task_id", data["clickup_task_id"]
                    ).execute()
                atualizados += 1
            else:
                sb.table("clientes").insert(data).execute()
                importados += 1

        except Exception as e:
            erros += 1
            logger.error(f"  Erro sync task '{task.get('name', '?')}': {e}")

    logger.info(f"✅ ClickUp sync concluído — {importados} novos, {atualizados} atualizados, {erros} erros (total: {len(tasks)} tasks)")


def register_webhook():
    """
    Registra webhook no ClickUp para receber eventos em tempo real.
    Chamado uma vez no startup — idempotente (verifica se já existe).
    """
    token = os.getenv("CLICKUP_API_TOKEN", "")
    team_id = os.getenv("CLICKUP_TEAM_ID", "9013791877")
    app_url = os.getenv("APP_BASE_URL", "https://docs.foundersledgrowth.online")
    webhook_url = f"{app_url}/api/admin/clickup/webhook"

    if not token:
        logger.warning("⚠️ CLICKUP_API_TOKEN não configurado — webhook não registrado")
        return

    headers = {"Authorization": token, "Content-Type": "application/json"}

    # Verificar webhooks existentes
    try:
        resp = requests.get(
            f"{CLICKUP_API_BASE}/team/{team_id}/webhook",
            headers=headers,
            timeout=15,
        )
        resp.raise_for_status()
        existing = resp.json().get("webhooks", [])

        for wh in existing:
            if wh.get("endpoint") == webhook_url:
                logger.info(f"✅ Webhook ClickUp já registrado (id: {wh['id']})")
                return
    except Exception as e:
        logger.warning(f"⚠️ Erro ao verificar webhooks existentes: {e}")

    # Registrar novo webhook
    try:
        resp = requests.post(
            f"{CLICKUP_API_BASE}/team/{team_id}/webhook",
            headers=headers,
            json={
                "endpoint": webhook_url,
                "events": [
                    "taskCreated",
                    "taskUpdated",
                    "taskStatusUpdated",
                    "taskAssigneeUpdated",
                    "taskMoved",
                    "taskDeleted",
                ],
                "space_id": "90136473711",  # Space "Operacional"
            },
            timeout=15,
        )
        resp.raise_for_status()
        wh_id = resp.json().get("id", "?")
        logger.info(f"✅ Webhook ClickUp registrado com sucesso (id: {wh_id})")
    except Exception as e:
        logger.warning(f"⚠️ Erro ao registrar webhook ClickUp: {e} — sync por polling continua funcionando")
