"""
Orquestrador de geração de debriefing estratégico FLG.

Pipeline:
  1. Fase 1 — Extrai dados do ClickUp (lista do cliente: tasks + comentários + status).
  2. Fase 2 — Extrai dados do Google Drive (docs da pasta do cliente filtrados por período).
  3. Fase 3 — Chama Claude Sonnet 4.6 com o prompt estruturado + dados extraídos.
  4. Fase 4 — Gera PDF a partir do Markdown produzido e persiste no Supabase Storage.

Cada fase reporta progresso via callback (usado pelo SSE endpoint).
Estado intermediário e final persistido na tabela `debriefings`.

Implementação por fase do plano:
  - Phase 1 (atual): estrutura, prompt build, stubs com TODO.
  - Phase 2: integração Google Drive.
  - Phase 3: orquestração Claude + streaming real.
  - Phase 4: PDF + storage.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Optional

from prompts.debriefing_prompt import build_system_prompt, build_user_prompt

logger = logging.getLogger("flg.debriefing")


@dataclass
class DebriefingRequest:
    """Input pra geração de um debriefing."""
    cliente_id: str
    ciclo_numero: int
    periodo_inicio: str           # ISO date "YYYY-MM-DD"
    periodo_fim: str
    clickup_list_id: Optional[str] = None
    drive_folder_id: Optional[str] = None
    gerado_por_email: str = ""


@dataclass
class DebriefingResult:
    """Output da geração."""
    debriefing_id: str
    status: str                   # 'pronto' | 'falhou'
    markdown_content: Optional[str] = None
    pdf_storage_path: Optional[str] = None
    tokens_input: int = 0
    tokens_output: int = 0
    custo_usd: float = 0.0
    duracao_segundos: int = 0
    num_tasks_clickup: int = 0
    num_docs_drive: int = 0
    erro: Optional[str] = None
    progress_events: list = field(default_factory=list)


ProgressCallback = Callable[[str, dict], None]
"""Callback assinatura: (event_type, payload) -> None.
event_type: 'phase_start' | 'phase_progress' | 'phase_done' | 'error' | 'complete'"""


def _noop_callback(event_type: str, payload: dict) -> None:
    pass


def _emit(callback: Optional[ProgressCallback], event_type: str, payload: dict) -> None:
    """Helper pra emitir progresso e logar."""
    logger.info(f"[debriefing] {event_type}: {payload}")
    (callback or _noop_callback)(event_type, payload)


# ─── Fase 1: ClickUp extraction ───────────────────────────────────────────────

def extract_clickup_data(
    list_id: Optional[str],
    cliente_nome: str,
    periodo_inicio: str,
    periodo_fim: str,
    callback: Optional[ProgressCallback] = None,
) -> tuple[str, int]:
    """
    Extrai tasks + comentários + status da lista ClickUp do cliente.
    Filtra por período (created_at ou updated_at entre inicio/fim).

    Retorna (texto_formatado, num_tasks).

    TODO Phase 3: implementação real. Por ora retorna stub.
    """
    _emit(callback, "phase_start", {"phase": 1, "name": "ClickUp"})
    # TODO: usar tools/clickup_tools.py — buscar list por nome se list_id None,
    # listar tasks, pra cada task pegar comentários e status, formatar como texto.
    stub = f"[STUB Phase 1] ClickUp list_id={list_id}, cliente={cliente_nome}"
    _emit(callback, "phase_done", {"phase": 1, "num_tasks": 0})
    return stub, 0


# ─── Fase 2: Google Drive extraction ──────────────────────────────────────────

def extract_drive_data(
    folder_id: Optional[str],
    cliente_nome: str,
    empresa_nome: str,
    periodo_inicio: str,
    periodo_fim: str,
    callback: Optional[ProgressCallback] = None,
) -> tuple[str, int]:
    """
    Extrai documentos do Google Drive relacionados ao cliente (filtrados por
    nome/empresa e período de modificação).

    Retorna (texto_formatado, num_docs).

    TODO Phase 2: implementação real via Google Drive API + service account.
    """
    _emit(callback, "phase_start", {"phase": 2, "name": "Google Drive"})
    stub = f"[STUB Phase 2] Drive folder={folder_id}, cliente={cliente_nome}"
    _emit(callback, "phase_done", {"phase": 2, "num_docs": 0})
    return stub, 0


# ─── Fase 3: Claude analysis + Markdown generation ────────────────────────────

def generate_markdown(
    *,
    nome_cliente: str,
    nome_empresa: str,
    consultor: str,
    periodo_inicio: str,
    periodo_fim: str,
    reunioes_contratadas: int,
    clickup_data: str,
    drive_data: str,
    callback: Optional[ProgressCallback] = None,
) -> tuple[str, int, int]:
    """
    Chama Claude Sonnet 4.6 com prompt completo e dados extraídos.
    Retorna (markdown, tokens_input, tokens_output).

    TODO Phase 3: implementação real com anthropic.Anthropic().messages.create
    + prompt caching no system_prompt + streaming SSE pro callback.
    """
    _emit(callback, "phase_start", {"phase": 3, "name": "Claude analysis"})

    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(
        nome_cliente=nome_cliente,
        nome_empresa=nome_empresa,
        consultor=consultor,
        periodo_inicio=periodo_inicio,
        periodo_fim=periodo_fim,
        reunioes_contratadas=reunioes_contratadas,
        data_geracao=datetime.now(timezone.utc).strftime("%d/%m/%Y"),
        clickup_data=clickup_data,
        drive_data=drive_data,
    )

    # TODO Phase 3: implementação real
    logger.info(f"[debriefing] system_prompt len={len(system_prompt)}, user_prompt len={len(user_prompt)}")
    stub_md = (
        f"# Debriefing Estratégico — {nome_cliente} | {nome_empresa}\n\n"
        f"> **Período:** {periodo_inicio} a {periodo_fim}\n"
        f"> **Consultor responsável:** {consultor}\n\n"
        f"[STUB Phase 3 — markdown completo virá quando integração Claude estiver pronta]\n"
    )

    _emit(callback, "phase_done", {"phase": 3, "tokens_input": 0, "tokens_output": 0})
    return stub_md, 0, 0


# ─── Fase 4: PDF generation + storage upload ──────────────────────────────────

def generate_pdf_and_upload(
    debriefing_id: str,
    markdown: str,
    callback: Optional[ProgressCallback] = None,
) -> str:
    """
    Renderiza Markdown -> HTML -> PDF (Chrome headless) e sobe pra Supabase Storage
    bucket 'debriefings'. Retorna o storage path.

    TODO Phase 4: implementação real.
    """
    _emit(callback, "phase_start", {"phase": 4, "name": "PDF + Storage"})
    stub_path = f"debriefings/{debriefing_id}.pdf"
    _emit(callback, "phase_done", {"phase": 4, "path": stub_path})
    return stub_path


# ─── Orquestrador top-level ────────────────────────────────────────────────────

def run_debriefing(
    request: DebriefingRequest,
    cliente_row: dict,
    callback: Optional[ProgressCallback] = None,
) -> DebriefingResult:
    """
    Pipeline completo. Recebe request + cliente_row (já carregado do banco)
    e executa as 4 fases sequencialmente. Reporta progresso via callback.

    Caller é responsável por:
    - Persistir status='gerando' antes
    - Atualizar com o DebriefingResult depois
    """
    started = datetime.now(timezone.utc)

    try:
        clickup_data, num_tasks = extract_clickup_data(
            list_id=request.clickup_list_id,
            cliente_nome=cliente_row.get("nome", ""),
            periodo_inicio=request.periodo_inicio,
            periodo_fim=request.periodo_fim,
            callback=callback,
        )

        drive_data, num_docs = extract_drive_data(
            folder_id=request.drive_folder_id,
            cliente_nome=cliente_row.get("nome", ""),
            empresa_nome=cliente_row.get("empresa", ""),
            periodo_inicio=request.periodo_inicio,
            periodo_fim=request.periodo_fim,
            callback=callback,
        )

        markdown, tokens_in, tokens_out = generate_markdown(
            nome_cliente=cliente_row.get("nome", ""),
            nome_empresa=cliente_row.get("empresa", ""),
            consultor=cliente_row.get("consultor_responsavel", ""),
            periodo_inicio=request.periodo_inicio,
            periodo_fim=request.periodo_fim,
            reunioes_contratadas=cliente_row.get("reunioes_contratadas", 15),
            clickup_data=clickup_data,
            drive_data=drive_data,
            callback=callback,
        )

        pdf_path = generate_pdf_and_upload(
            debriefing_id=request.cliente_id,  # placeholder, real id vem do caller
            markdown=markdown,
            callback=callback,
        )

        # Custo: Sonnet 4.6 = $3/M input, $15/M output
        custo_usd = (tokens_in / 1_000_000 * 3.0) + (tokens_out / 1_000_000 * 15.0)
        duracao = int((datetime.now(timezone.utc) - started).total_seconds())

        _emit(callback, "complete", {"custo_usd": custo_usd, "duracao_s": duracao})

        return DebriefingResult(
            debriefing_id=request.cliente_id,
            status="pronto",
            markdown_content=markdown,
            pdf_storage_path=pdf_path,
            tokens_input=tokens_in,
            tokens_output=tokens_out,
            custo_usd=custo_usd,
            duracao_segundos=duracao,
            num_tasks_clickup=num_tasks,
            num_docs_drive=num_docs,
        )

    except Exception as e:
        logger.exception(f"[debriefing] falhou: {e}")
        _emit(callback, "error", {"erro": str(e)})
        return DebriefingResult(
            debriefing_id=request.cliente_id,
            status="falhou",
            erro=str(e),
            duracao_segundos=int((datetime.now(timezone.utc) - started).total_seconds()),
        )
