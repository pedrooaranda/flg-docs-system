"""
Extração de dados ClickUp formatada para o debriefing estratégico.

Reusa tools/clickup_tools.py (list_all_tasks, read_clickup_comments) e
adiciona:
  - Filtro por janela temporal (date_created ou date_updated no período)
  - Formatação compacta + agrupada por status pra envio ao Claude
  - Busca de lista por nome (fallback quando list_id não fornecido)

Limites:
  - Pega no máx 200 tasks por debriefing pra evitar explodir context window
  - Pega no máx 20 comentários mais recentes por task
"""

import logging
import os
import re
import unicodedata
from datetime import datetime
from typing import Optional

import requests

from tools.clickup_tools import list_all_tasks, read_clickup_comments, _headers, CLICKUP_API_BASE

logger = logging.getLogger("flg.clickup_debriefing")

MAX_TASKS = 200
MAX_COMMENTS_PER_TASK = 20
MAX_CONTENT_PER_TASK_DESC = 1500


# ─── Busca de lista por nome ──────────────────────────────────────────────────

# Padrões de lista no workspace FLG (CX usa essas convenções):
#   `[NOMEDOCLIENTE]`              — cliente sem ciclos múltiplos
#   `[NOMEDOCLIENTE | CICLO01]`    — cliente com debriefings anteriores (1+ ciclos)
#
# Memory ref: flg_clickup_nomenclatura_clientes.md
_CICLO_PATTERN = re.compile(r"ciclo\s*0*(\d+)", re.IGNORECASE)


def _normalize(s: str) -> str:
    """Normaliza string pra match: lowercase + sem acentos + sem brackets/pipes + sem espaços extras."""
    if not s:
        return ""
    # Remove acentos
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    # Lowercase + remove brackets, pipes, espaços extras
    s = s.lower().strip()
    s = re.sub(r"[\[\]|]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def _extract_ciclo_from_name(name: str) -> int:
    """Extrai número do ciclo do nome da lista, ou 0 se não tiver."""
    if not name:
        return 0
    m = _CICLO_PATTERN.search(name)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            return 0
    return 0


def find_list_by_name(
    workspace_id: str,
    query: str,
    ciclo_numero: Optional[int] = None,
) -> Optional[str]:
    """
    Busca uma List no workspace por nome, considerando os padrões da FLG:
      `[CLIENTE]` ou `[CLIENTE | CICLO0N]`.

    Estratégia:
      1. Normaliza query (remove brackets, pipes, acentos, lowercase, espaços extras)
      2. Acha todas as listas cujo nome normalizado contém a query normalizada
      3. Se `ciclo_numero` fornecido, prefere a lista com ciclo == N
      4. Senão, prefere a lista com MAIOR ciclo (mais recente)
      5. Empate / sem ciclo na lista: primeira match

    Retorna list_id ou None se não achar.
    """
    try:
        resp = requests.get(
            f"{CLICKUP_API_BASE}/team/{workspace_id}/list",
            headers=_headers(),
            timeout=15,
        )
        if resp.status_code != 200:
            logger.warning(f"[clickup] busca de list por workspace retornou {resp.status_code}")
            return None
        all_lists = resp.json().get("lists", []) or []
    except requests.RequestException as e:
        logger.warning(f"[clickup] erro buscando list por nome: {e}")
        return None

    query_norm = _normalize(query)
    if not query_norm:
        return None

    # Coleta matches com metadata: (id, name, ciclo_extraído)
    matches: list[tuple[str, str, int]] = []
    for lst in all_lists:
        list_name = lst.get("name") or ""
        if query_norm in _normalize(list_name):
            ciclo = _extract_ciclo_from_name(list_name)
            matches.append((lst["id"], list_name, ciclo))

    if not matches:
        logger.info(f"[clickup] nenhuma lista matching '{query}' no workspace {workspace_id}")
        return None

    logger.info(f"[clickup] {len(matches)} listas matching '{query}': {[(n, c) for _, n, c in matches]}")

    # 1ª preferência: ciclo exato
    if ciclo_numero is not None:
        exact = [m for m in matches if m[2] == ciclo_numero]
        if exact:
            chosen = exact[0]
            logger.info(f"[clickup] escolhida (ciclo exato {ciclo_numero}): {chosen[1]}")
            return chosen[0]

    # 2ª preferência: maior ciclo (mais recente)
    chosen = max(matches, key=lambda m: m[2])
    logger.info(f"[clickup] escolhida (maior ciclo {chosen[2]}): {chosen[1]}")
    return chosen[0]


# ─── Filtro temporal ──────────────────────────────────────────────────────────

def _within_period(task: dict, ini_ms: int, fim_ms: int) -> bool:
    """True se a task tem qualquer atividade (criação ou update) dentro do período."""
    date_created = int(task.get("date_created") or 0)
    date_updated = int(task.get("date_updated") or 0)
    date_closed = int(task.get("date_closed") or 0)

    # Inclui se criada no período OU atualizada no período OU fechada no período
    return (
        (ini_ms <= date_created <= fim_ms)
        or (ini_ms <= date_updated <= fim_ms)
        or (ini_ms <= date_closed <= fim_ms)
    )


def _ms_from_iso(iso_date: str, end_of_day: bool = False) -> int:
    """Converte 'YYYY-MM-DD' em timestamp ms UTC."""
    dt = datetime.strptime(iso_date, "%Y-%m-%d")
    if end_of_day:
        dt = dt.replace(hour=23, minute=59, second=59)
    return int(dt.timestamp() * 1000)


# ─── Formatação por task ──────────────────────────────────────────────────────

def _fmt_ms(ms_str) -> str:
    try:
        ms = int(ms_str or 0)
        if ms == 0:
            return "—"
        return datetime.fromtimestamp(ms / 1000).strftime("%d/%m/%Y")
    except (ValueError, TypeError):
        return "—"


def _format_task(task: dict, with_comments: bool = True) -> str:
    nome = task.get("name", "").strip() or "(sem nome)"
    status = task.get("status", {}).get("status", "")
    assignees = [a.get("username") or a.get("email") or "?" for a in task.get("assignees", [])]
    criada = _fmt_ms(task.get("date_created"))
    atualizada = _fmt_ms(task.get("date_updated"))
    fechada = _fmt_ms(task.get("date_closed"))
    descricao = (task.get("description") or task.get("text_content") or "").strip()
    if len(descricao) > MAX_CONTENT_PER_TASK_DESC:
        descricao = descricao[:MAX_CONTENT_PER_TASK_DESC] + "…"

    tags = [t.get("name") for t in task.get("tags", []) if t.get("name")]

    parts = [
        f"\n--- Task: {nome} ---",
        f"Status: {status} | Criada: {criada} | Atualizada: {atualizada} | Fechada: {fechada}",
        f"Responsáveis: {', '.join(assignees) or '—'}",
    ]
    if tags:
        parts.append(f"Tags: {', '.join(tags)}")
    if descricao:
        parts.append(f"Descrição: {descricao}")

    if with_comments and task.get("id"):
        try:
            comentarios = read_clickup_comments(task["id"], limit=MAX_COMMENTS_PER_TASK)
            if comentarios and "Nenhum comentário" not in comentarios:
                parts.append(f"Comentários:\n{comentarios}")
        except Exception as e:
            logger.warning(f"[clickup] falha lendo comentários de {task.get('id')}: {e}")

    return "\n".join(parts)


# ─── Top-level extraction ─────────────────────────────────────────────────────

def extract_for_debriefing(
    list_id: Optional[str],
    cliente_nome: str,
    periodo_inicio: str,
    periodo_fim: str,
    workspace_id: Optional[str] = None,
    ciclo_numero: Optional[int] = None,
) -> tuple[str, int]:
    """
    Função top-level usada pelo debriefing_generator.
    Retorna (texto_formatado, num_tasks).

    Se list_id não fornecido e workspace_id presente, tenta achar list por
    nome do cliente. Quando `ciclo_numero` é passado, busca prefere a lista
    com sufixo `CICLO{N}` (vide flg_clickup_nomenclatura_clientes na memory).
    """
    if not os.getenv("CLICKUP_API_TOKEN"):
        return ("[ClickUp não configurado — defina CLICKUP_API_TOKEN]", 0)

    # Fallback: tenta achar lista pelo nome do cliente
    if not list_id and workspace_id:
        list_id = find_list_by_name(workspace_id, cliente_nome, ciclo_numero=ciclo_numero)
        if not list_id:
            return (
                f"[Lista do ClickUp não encontrada para o cliente '{cliente_nome}' "
                f"no workspace {workspace_id}]",
                0,
            )

    if not list_id:
        return ("[clickup_list_id não fornecido e workspace não definido]", 0)

    try:
        tasks = list_all_tasks(list_id)
    except Exception as e:
        return (f"[Erro ao listar tasks da lista {list_id}: {e}]", 0)

    if not tasks:
        return (f"[Nenhuma task encontrada na lista {list_id}]", 0)

    # Filtra por período
    ini_ms = _ms_from_iso(periodo_inicio)
    fim_ms = _ms_from_iso(periodo_fim, end_of_day=True)
    tasks_no_periodo = [t for t in tasks if _within_period(t, ini_ms, fim_ms)]

    # Limita pra evitar overflow
    tasks_no_periodo.sort(
        key=lambda t: int(t.get("date_updated") or t.get("date_created") or 0),
        reverse=True,
    )
    truncado = False
    if len(tasks_no_periodo) > MAX_TASKS:
        tasks_no_periodo = tasks_no_periodo[:MAX_TASKS]
        truncado = True

    # Agrupa por status pra Claude organizar melhor
    por_status: dict[str, list[dict]] = {}
    for t in tasks_no_periodo:
        st = t.get("status", {}).get("status", "sem-status")
        por_status.setdefault(st, []).append(t)

    parts: list[str] = [
        f"Lista ClickUp: {list_id}",
        f"Total de tasks no período: {len(tasks_no_periodo)}"
        + (f" (truncado em {MAX_TASKS} mais recentes)" if truncado else ""),
        f"Período filtrado: {periodo_inicio} a {periodo_fim}",
        "",
    ]

    for status, task_list in sorted(por_status.items()):
        parts.append(f"\n=== Status: {status} ({len(task_list)} tasks) ===")
        for t in task_list:
            parts.append(_format_task(t, with_comments=True))

    return ("\n".join(parts), len(tasks_no_periodo))
