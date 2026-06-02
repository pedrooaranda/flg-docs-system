"""
Serviço de sincronização automática ClickUp → Supabase.

Source-of-truth: status NATIVO da task no kanban (não o custom field SITUAÇÃO).
Decisão Pedro 2026-05-27 após múltiplas iterações.

Matching estratégia (em ordem de preferência):
  1. `clickup_task_id` exato (tasks vinculadas via sync anterior)
  2. `nome` normalizado (lowercase, sem acentos/espaços) — cura clientes
     criados manualmente sem clickup_task_id, evita duplicatas
  3. INSERT novo se nada bate

Otimização: fetch único de TODOS clientes do DB no início, lookups O(1) por dict.

Logging estruturado por task com [sync] ACTION | NOME | task.status | match | campos.
"""

import logging
import os
import re
import unicodedata

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


# ─── Normalização de nome ─────────────────────────────────────────────────────

def _normalize_name(s):
    """lowercase + sem acentos + sem espaços/separadores.
    'Fernanda Prado' → 'fernandaprado'. Mesma regra da migration 009 (PL/pgSQL)."""
    if not s:
        return ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[\s\-_.|\[\]]+", "", s.lower())


# ─── Lifecycle evaluation (status nativo da task) ─────────────────────────────

_STATUS_TERMINAIS = ("encerrado", "renovado", "inativo")
_STATUS_PAUSADO_KEYWORDS = ("pausado", "em pausa")
_STATUS_EM_ENCERRAMENTO_KEYWORDS = ("em encerramento", "em encerramento próximo")


def evaluate_lifecycle(situacao_raw):
    """
    Status nativo da task → (status_db, should_archive).

    Regras (em ordem):
        1. 'em encerramento' (transitório) → ('ativo', False)
        2. 'encerrado'/'renovado'/'inativo' → ('concluido', True)
        3. 'pausado'/'em pausa' → ('pausado', False)
        4. fallback → ('ativo', False)
    """
    if not situacao_raw:
        return ("ativo", False)
    s = situacao_raw.strip().lower()
    for kw in _STATUS_EM_ENCERRAMENTO_KEYWORDS:
        if kw in s:
            return ("ativo", False)
    for terminal in _STATUS_TERMINAIS:
        if terminal in s and "em encerramento" not in s:
            return ("concluido", True)
    for kw in _STATUS_PAUSADO_KEYWORDS:
        if kw in s:
            return ("pausado", False)
    return ("ativo", False)


# ─── Sync principal ───────────────────────────────────────────────────────────

# Campos que o sync UPDATE explicitamente quando vindos do ClickUp.
# Evita o dict-comprehension genérico que escondia bugs (ex: encontro_atual=0 falsy).
_UPDATEABLE_FIELDS = (
    "nome",
    "empresa",
    "consultor_responsavel",
    "consultor_id",  # UUID resolvido de consultor_responsavel via tabela colaboradores
    "estrategista",
    "encontro_atual",
    "status",
    "situacao_atual",
    "clickup_task_id",  # cura clientes que tinham null
)


def _load_consultores_lookup(sb):
    """
    Carrega mapa {nome_normalizado: uuid} de colaboradores ativos da categoria
    consultor, pra resolver consultor_responsavel (texto livre do ClickUp) em
    consultor_id (UUID). Sem isso, clientes criados pelo sync ficam com
    consultor_id=NULL e o consultor logado não os vê (filtro do backend GET /clientes
    é por consultor_id, não por nome).
    """
    r = sb.table("colaboradores").select("id, nome").eq("ativo", True).execute()
    return {
        _normalize_name(row.get("nome", "")): row["id"]
        for row in (r.data or [])
        if row.get("nome")
    }


def _resolve_consultor_id(consultores_by_name, consultor_nome):
    """nome livre do ClickUp → UUID do colaborador. Retorna None se não bater."""
    if not consultor_nome:
        return None
    return consultores_by_name.get(_normalize_name(consultor_nome))


def _load_clientes_lookup(sb):
    """
    Carrega TODOS os clientes do DB e monta 2 dicts pra lookup O(1):
      - by_task_id: clickup_task_id → cliente
      - by_name_norm: _normalize_name(nome) → cliente

    Necessário pra matching híbrido sem N+1 queries.
    """
    r = sb.table("clientes").select(
        "id, nome, clickup_task_id, archived_at, status, encontro_atual, consultor_responsavel"
    ).execute()
    rows = r.data or []
    by_task_id = {row["clickup_task_id"]: row for row in rows if row.get("clickup_task_id")}
    by_name_norm = {_normalize_name(row.get("nome", "")): row for row in rows if row.get("nome")}
    return by_task_id, by_name_norm


def _resolve_match(by_task_id, by_name_norm, clickup_task_id, nome):
    """
    Retorna (cliente_row_dict | None, match_strategy_str).
    Estratégias: 'task_id' | 'name' | 'not_found'.
    """
    if clickup_task_id and clickup_task_id in by_task_id:
        return (by_task_id[clickup_task_id], "task_id")
    nome_norm = _normalize_name(nome)
    if nome_norm and nome_norm in by_name_norm:
        return (by_name_norm[nome_norm], "name")
    return (None, "not_found")


def run_clickup_sync():
    """
    Sync completo da List "Clientes | BS" → tabela `clientes` do Supabase.

    Para cada task:
      - Resolve match no DB (clickup_task_id → nome normalizado → insert)
      - Atualiza TODOS os campos relevantes do ClickUp explicitamente
      - Aplica decisão de archive baseada no status NATIVO da task
      - Loga decisão estruturada [sync] ACTION | NOME | dados

    Returns:
        dict stats: archived, reactivated, paused, ativos, created, updated, errors, total, duration_ms
    """
    from datetime import datetime, timezone
    from time import perf_counter
    from deps import supabase_client as sb

    started = perf_counter()
    stats = {
        "archived": 0, "reactivated": 0, "paused": 0, "ativos": 0,
        "created": 0, "updated": 0, "no_change": 0,
        "errors": 0, "total": 0, "duration_ms": 0,
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

    # Fetch único de todos clientes pra matching híbrido O(1)
    by_task_id, by_name_norm = _load_clientes_lookup(sb)
    logger.info(f"[sync] DB lookup carregado: {len(by_task_id)} por task_id, {len(by_name_norm)} por nome")

    # Mapa nome do colaborador → UUID, pra resolver consultor_id de cada task
    consultores_by_name = _load_consultores_lookup(sb)
    logger.info(f"[sync] Consultores lookup carregado: {len(consultores_by_name)} colaboradores ativos")

    now_iso = datetime.now(timezone.utc).isoformat()

    for task in tasks:
        try:
            data = task_to_cliente_data(task)
            nome = data.get("nome", "")
            if not nome or nome in CLICKUP_BLOCKLIST:
                continue

            # Lifecycle: status NATIVO da task (Pedro 2026-05-27 — custom field SITUAÇÃO ignorado)
            data.pop("situacao_clickup", None)
            situacao = (task.get("status") or {}).get("status", "")
            status_db, should_archive = evaluate_lifecycle(situacao)
            data["status"] = status_db

            # Empresa NOT NULL no Supabase
            if not data.get("empresa"):
                data["empresa"] = nome

            # Resolve consultor_id (UUID) a partir do consultor_responsavel (texto)
            # Sem isso, consultor regular não vê a cliente no GET /clientes (que
            # filtra por UUID). Bug histórico: MARAREIS 2026-06-02 ficou invisível
            # pro Lucas mesmo com consultor_responsavel='Lucas Nery' setado.
            resolved_consultor_id = _resolve_consultor_id(
                consultores_by_name, data.get("consultor_responsavel")
            )
            if resolved_consultor_id:
                data["consultor_id"] = resolved_consultor_id
            elif data.get("consultor_responsavel"):
                logger.warning(
                    f"[sync] consultor_responsavel='{data['consultor_responsavel']}' "
                    f"não bate com nenhum colaborador ativo (cliente '{nome}'). "
                    "consultor_id ficará NULL — cliente não aparece pra consultor regular."
                )

            # Match no DB (cache em dicts)
            existing, match_strategy = _resolve_match(
                by_task_id, by_name_norm,
                data.get("clickup_task_id"), nome
            )

            if existing:
                cliente_id = existing["id"]
                currently_archived = existing.get("archived_at") is not None

                # Payload explícito: SÓ campos da allowlist + status sempre
                update_payload = {}
                for field in _UPDATEABLE_FIELDS:
                    if field in data and data[field] is not None:
                        update_payload[field] = data[field]
                update_payload["status"] = status_db  # garante override mesmo se task_to_cliente_data devolveu None

                # Decisão archive/reactivate
                action = "NO-CHANGE"
                if should_archive and not currently_archived:
                    update_payload["archived_at"] = now_iso
                    stats["archived"] += 1
                    action = "ARCHIVED"
                elif not should_archive and currently_archived:
                    update_payload["archived_at"] = None
                    stats["reactivated"] += 1
                    action = "REACTIVATED"
                elif should_archive and currently_archived:
                    action = "ALREADY-ARCHIVED"
                elif status_db == "pausado":
                    stats["paused"] += 1
                    action = "PAUSED"
                elif status_db == "ativo":
                    stats["ativos"] += 1
                    action = "ATIVO"

                # UPDATE por id (mais robusto que clickup_task_id quando match foi por nome)
                sb.table("clientes").update(update_payload).eq("id", cliente_id).execute()
                stats["updated"] += 1

                # Log estruturado de cada decisão
                logger.info(
                    f"[sync] {action:16s} | {nome:30s} | task.status='{situacao}' | "
                    f"match={match_strategy} | encontro_atual={data.get('encontro_atual')} | "
                    f"consultor={data.get('consultor_responsavel')} | db_id={cliente_id}"
                )
            else:
                # INSERT novo
                insert_data = dict(data)
                action = "CREATED-ATIVO"
                if should_archive:
                    insert_data["archived_at"] = now_iso
                    stats["archived"] += 1
                    action = "CREATED-ARCHIVED"
                elif status_db == "pausado":
                    stats["paused"] += 1
                    action = "CREATED-PAUSED"
                else:
                    stats["ativos"] += 1

                sb.table("clientes").insert(insert_data).execute()
                stats["created"] += 1
                logger.info(
                    f"[sync] {action:18s} | {nome:30s} | task.status='{situacao}'"
                )

        except Exception as e:
            stats["errors"] += 1
            logger.error(f"❌ Erro sync task '{task.get('name', '?')}': {e}")

    stats["duration_ms"] = int((perf_counter() - started) * 1000)
    logger.info(
        f"✅ Sync concluído em {stats['duration_ms']}ms — "
        f"updated: {stats['updated']}, created: {stats['created']}, "
        f"archived: {stats['archived']}, reactivated: {stats['reactivated']}, "
        f"paused: {stats['paused']}, ativos: {stats['ativos']}, "
        f"errors: {stats['errors']} (total: {stats['total']})"
    )
    return stats


# ─── Webhook ──────────────────────────────────────────────────────────────────

def register_webhook():
    """
    Registra webhook no ClickUp para receber eventos em tempo real.
    Idempotente — verifica se já existe antes de criar.
    """
    token = os.getenv("CLICKUP_API_TOKEN", "")
    team_id = os.getenv("CLICKUP_TEAM_ID", "9013791877")
    app_url = os.getenv("APP_BASE_URL", "https://docs.foundersledgrowth.online")
    webhook_url = f"{app_url}/api/admin/clickup/webhook"

    if not token:
        logger.warning("⚠️ CLICKUP_API_TOKEN não configurado — webhook não registrado")
        return

    headers = {"Authorization": token, "Content-Type": "application/json"}

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

    try:
        resp = requests.post(
            f"{CLICKUP_API_BASE}/team/{team_id}/webhook",
            headers=headers,
            json={
                "endpoint": webhook_url,
                "events": [
                    "taskCreated", "taskUpdated", "taskStatusUpdated",
                    "taskAssigneeUpdated", "taskMoved", "taskDeleted",
                ],
                "space_id": "90136473711",  # Space "Operacional"
            },
            timeout=15,
        )
        resp.raise_for_status()
        wh_id = resp.json().get("id", "?")
        logger.info(f"✅ Webhook ClickUp registrado (id: {wh_id})")
    except Exception as e:
        logger.warning(f"⚠️ Erro ao registrar webhook ClickUp: {e} — sync por polling continua")
