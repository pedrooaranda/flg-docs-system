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

# Tasks do ClickUp que não devem ser importadas (removidas pelo admin)
CLICKUP_BLOCKLIST = {
    "GABRIELCHIARELLO", "IZABELLABENTO", "CATHARINETURMINA",
    "MAISARASHE", "MARLAGOMES", "MAILOR | Revisar Landing Page",
    "VERONICALEÃO", "JOAOJUNHORODRIGUES",
}

# ─── Lifecycle evaluation ─────────────────────────────────────────────────────
# Mapeia o custom field SITUAÇÃO do ClickUp pra decisão de status_db +
# should_archive. Regras documentadas na spec Stream 7
# (docs/superpowers/specs/2026-05-26-clickup-sync-archived-design.md).

# Status terminais — disparam archive (soft delete). Pedro: "encerrado/renovado/inativo"
_STATUS_TERMINAIS = ("encerrado", "renovado", "inativo")
# Status pausado — mantém visível com badge. "em pausa" cobre variação comum
_STATUS_PAUSADO_KEYWORDS = ("pausado", "em pausa")
# "Em Encerramento" é transitório — Pedro pediu pra MANTER visível
_STATUS_EM_ENCERRAMENTO_KEYWORDS = ("em encerramento", "em encerramento próximo")


def evaluate_lifecycle(situacao_raw):
    """
    Mapeia SITUAÇÃO do ClickUp pra (status_db, should_archive).

    Args:
        situacao_raw: valor do custom field SITUAÇÃO (string ou None)

    Returns:
        tuple (status_db, should_archive) onde:
          status_db: 'ativo' | 'pausado' | 'concluido'
          should_archive: True se cliente deve ser soft-deleted

    Regras (em ordem de precedência):
        1. 'em encerramento' (transitório) → ('ativo', False)
        2. 'encerrado' | 'renovado' | 'inativo' → ('concluido', True)
        3. 'pausado' | 'em pausa' → ('pausado', False)
        4. fallback (vazio/desconhecido/ativo/normal/etc) → ('ativo', False)
    """
    if not situacao_raw:
        return ("ativo", False)
    s = situacao_raw.strip().lower()

    # Em encerramento (transitório) ANTES de encerrado pra match mais específico
    for kw in _STATUS_EM_ENCERRAMENTO_KEYWORDS:
        if kw in s:
            return ("ativo", False)

    # Terminais → archive. Match palavra inteira pra "encerrado" não bater em "em encerramento"
    # (já tratado acima, mas defensivo)
    for terminal in _STATUS_TERMINAIS:
        if terminal in s and "em encerramento" not in s:
            return ("concluido", True)

    # Pausado
    for kw in _STATUS_PAUSADO_KEYWORDS:
        if kw in s:
            return ("pausado", False)

    # Fallback seguro
    return ("ativo", False)



def run_clickup_sync():
    """
    Sync completo — chamado pelo APScheduler, no startup e via /admin/clickup/sync.
    Busca todas as tasks da List BS e aplica lifecycle por cliente:
      - status terminal (encerrado/renovado/inativo) → archived_at=now()
      - reativação (archived volta pra ativo/pausado) → archived_at=NULL
      - upsert normal com status atualizado

    Returns:
        dict com stats: archived, reactivated, paused, ativos, errors, total, duration_ms
    """
    from datetime import datetime, timezone
    from time import perf_counter
    from deps import supabase_client as sb

    started = perf_counter()
    stats = {
        "archived": 0, "reactivated": 0, "paused": 0, "ativos": 0,
        "errors": 0, "total": 0, "duration_ms": 0
    }

    token = os.getenv("CLICKUP_API_TOKEN", "")
    if not token:
        logger.warning("⚠️ CLICKUP_API_TOKEN não configurado — sync pulado")
        return stats

    logger.info("🔄 ClickUp sync iniciando...")

    try:
        tasks = list_all_tasks(LIST_CLIENTES_BS)
    except Exception as e:
        logger.error(f"❌ Erro ao buscar tasks do ClickUp: {e}")
        stats["errors"] = 1
        return stats

    stats["total"] = len(tasks)
    if not tasks:
        logger.info("Nenhuma task encontrada na List BS")
        return stats

    now_iso = datetime.now(timezone.utc).isoformat()

    for task in tasks:
        try:
            data = task_to_cliente_data(task)
            if not data.get("nome"):
                continue
            if data["nome"] in CLICKUP_BLOCKLIST:
                continue

            # Lifecycle decision: prefere custom field SITUAÇÃO; se vazio, cai pro
            # status NATIVO da task (kanban column). Pedro usa AMBOS no ClickUp —
            # cliente Fernanda Prado e outros têm task.status='encerrado' mas
            # custom field SITUAÇÃO vazio, então o sync ignorava como "ativo".
            situacao = data.pop("situacao_clickup", None)
            if not situacao:
                situacao = (task.get("status") or {}).get("status", "")
            status_db, should_archive = evaluate_lifecycle(situacao)
            data["status"] = status_db  # sobrescreve mapping antigo do task_to_cliente_data

            # Empresa NOT NULL no Supabase — fallback pra nome
            if not data.get("empresa"):
                data["empresa"] = data["nome"]

            # Busca cliente existente (precisamos saber se já está archived pra detectar reativação)
            existing = sb.table("clientes").select("id, archived_at").eq(
                "clickup_task_id", data["clickup_task_id"]
            ).execute()

            if existing.data:
                cliente_id = existing.data[0]["id"]
                currently_archived = existing.data[0].get("archived_at") is not None

                update_payload = {k: v for k, v in data.items() if k != "nome" and v is not None}
                update_payload["status"] = status_db  # garante mesmo se v is None

                if should_archive and not currently_archived:
                    update_payload["archived_at"] = now_iso
                    stats["archived"] += 1
                    logger.info(f"🗄️ archived: {data['nome']} (situação: {situacao})")
                elif not should_archive and currently_archived:
                    update_payload["archived_at"] = None
                    stats["reactivated"] += 1
                    logger.info(f"↩️ reactivated: {data['nome']}")
                elif status_db == "pausado":
                    stats["paused"] += 1
                elif status_db == "ativo":
                    stats["ativos"] += 1

                sb.table("clientes").update(update_payload).eq(
                    "clickup_task_id", data["clickup_task_id"]
                ).execute()
            else:
                # Novo cliente: insere com archived_at correspondente
                if should_archive:
                    data["archived_at"] = now_iso
                    stats["archived"] += 1
                    logger.info(f"🗄️ archived (new): {data['nome']} (situação: {situacao})")
                elif status_db == "pausado":
                    stats["paused"] += 1
                else:
                    stats["ativos"] += 1
                sb.table("clientes").insert(data).execute()

        except Exception as e:
            stats["errors"] += 1
            logger.error(f"  Erro sync task '{task.get('name', '?')}': {e}")

    stats["duration_ms"] = int((perf_counter() - started) * 1000)
    logger.info(
        f"✅ ClickUp sync concluído em {stats['duration_ms']}ms — "
        f"archived: {stats['archived']}, reactivated: {stats['reactivated']}, "
        f"paused: {stats['paused']}, ativos: {stats['ativos']}, errors: {stats['errors']} "
        f"(total: {stats['total']} tasks)"
    )
    return stats


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
