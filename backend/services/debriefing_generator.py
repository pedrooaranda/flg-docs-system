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
from services import google_drive_service, clickup_debriefing, debriefing_pdf

logger = logging.getLogger("flg.debriefing")

# Modelo Claude pra análise estratégica
_CLAUDE_MODEL = "claude-sonnet-4-6"
_CLAUDE_MAX_TOKENS = 16000
# Pricing Sonnet 4.6 (USD/M tokens)
_PRICE_INPUT_PER_M = 3.0
_PRICE_OUTPUT_PER_M = 15.0


@dataclass
class DebriefingRequest:
    """Input pra geração de um debriefing."""
    cliente_id: str
    ciclo_numero: int
    periodo_inicio: str           # ISO date "YYYY-MM-DD"
    periodo_fim: str
    debriefing_id: str = ""       # gerado pelo caller (rota), usado pelo PDF path
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
    ciclo_numero: Optional[int] = None,
    callback: Optional[ProgressCallback] = None,
) -> tuple[str, int]:
    """
    Extrai tasks + comentários + status da lista ClickUp do cliente.
    Filtra por período (created_at ou updated_at entre inicio/fim).

    `ciclo_numero` (quando fornecido) é usado pra escolher a lista certa
    quando há múltiplas (padrão FLG: `[CLIENTE | CICLO0N]`).

    Retorna (texto_formatado, num_tasks).
    """
    import os
    _emit(callback, "phase_start", {"phase": 1, "name": "ClickUp"})

    workspace_id = os.getenv("CLICKUP_WORKSPACE_ID") or None
    texto, num_tasks = clickup_debriefing.extract_for_debriefing(
        list_id=list_id,
        cliente_nome=cliente_nome,
        periodo_inicio=periodo_inicio,
        periodo_fim=periodo_fim,
        workspace_id=workspace_id,
        ciclo_numero=ciclo_numero,
    )
    _emit(callback, "phase_done", {"phase": 1, "num_tasks": num_tasks})
    return texto, num_tasks


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

    Grace-degraded: se Google Drive não configurado, retorna mensagem sinalizando
    e segue (Claude vai trabalhar só com ClickUp).
    """
    _emit(callback, "phase_start", {"phase": 2, "name": "Google Drive"})

    if not google_drive_service.is_configured():
        _emit(callback, "phase_done", {"phase": 2, "num_docs": 0, "warning": "drive não configurado"})
        return ("[Google Drive não configurado — debriefing usará apenas ClickUp]", 0)

    texto, num_docs = google_drive_service.extract_for_debriefing(
        folder_id=folder_id,
        cliente_nome=cliente_nome,
        empresa_nome=empresa_nome,
        periodo_inicio=periodo_inicio,
        periodo_fim=periodo_fim,
    )

    _emit(callback, "phase_done", {"phase": 2, "num_docs": num_docs})
    return texto, num_docs


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
    consultor_perspectiva: Optional[str] = None,
    callback: Optional[ProgressCallback] = None,
) -> tuple[str, int, int]:
    """
    Chama Claude Sonnet 4.6 com prompt completo e dados extraídos.
    Streaming via SDK Anthropic, eventos de progresso propagados via callback.
    Prompt caching ativado no system prompt (~90% de economia em re-geração).

    `consultor_perspectiva` é a leitura qualitativa do consultor (input
    complementar opcional). Quando presente, é incluída em XML section
    própria no prompt e Claude é instruído a citá-la nas seções 6, 8 e 10.

    Retorna (markdown, tokens_input, tokens_output).
    """
    import os
    import anthropic

    _emit(callback, "phase_start", {"phase": 3, "name": "Claude analysis"})

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY não configurado")

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
        consultor_perspectiva=consultor_perspectiva,
    )

    logger.info(
        f"[debriefing] Claude call: system={len(system_prompt)} chars, "
        f"user={len(user_prompt)} chars"
    )

    client = anthropic.Anthropic(api_key=api_key)

    # System prompt com cache_control pra economizar em re-runs
    system_block = [{
        "type": "text",
        "text": system_prompt,
        "cache_control": {"type": "ephemeral"},
    }]

    tokens_input = 0
    tokens_output = 0
    chunks: list[str] = []
    last_progress_emit = 0

    try:
        with client.messages.stream(
            model=_CLAUDE_MODEL,
            max_tokens=_CLAUDE_MAX_TOKENS,
            temperature=0.3,
            system=system_block,
            messages=[{"role": "user", "content": user_prompt}],
        ) as stream:
            for text in stream.text_stream:
                chunks.append(text)
                # Emite progresso a cada ~1000 chars pra não floodar o SSE
                if len(chunks) - last_progress_emit > 50:
                    _emit(callback, "phase_progress", {
                        "phase": 3,
                        "chars": sum(len(c) for c in chunks),
                    })
                    last_progress_emit = len(chunks)

            final = stream.get_final_message()
            usage = getattr(final, "usage", None)
            if usage:
                tokens_input = (
                    (getattr(usage, "input_tokens", 0) or 0)
                    + (getattr(usage, "cache_creation_input_tokens", 0) or 0)
                    + (getattr(usage, "cache_read_input_tokens", 0) or 0)
                )
                tokens_output = getattr(usage, "output_tokens", 0) or 0
    except anthropic.APIError as e:
        logger.exception(f"[debriefing] Claude API error: {e}")
        raise RuntimeError(f"Falha ao chamar Claude: {e}")

    markdown = "".join(chunks)
    if not markdown.strip():
        raise RuntimeError("Claude retornou markdown vazio")

    _emit(callback, "phase_done", {
        "phase": 3,
        "tokens_input": tokens_input,
        "tokens_output": tokens_output,
        "chars": len(markdown),
    })
    return markdown, tokens_input, tokens_output


# ─── Fase 4: PDF generation + storage upload ──────────────────────────────────

def generate_pdf_and_upload(
    debriefing_id: str,
    markdown: str,
    titulo: str = "Debriefing FLG",
    callback: Optional[ProgressCallback] = None,
) -> str:
    """
    Renderiza Markdown -> HTML -> PDF (WeasyPrint) e sobe pra Supabase Storage
    bucket 'debriefings'. Retorna o storage path.
    """
    _emit(callback, "phase_start", {"phase": 4, "name": "PDF + Storage"})
    storage_path = debriefing_pdf.render_and_upload(
        debriefing_id=debriefing_id,
        markdown_text=markdown,
        titulo=titulo,
    )
    _emit(callback, "phase_done", {"phase": 4, "path": storage_path})
    return storage_path


# ─── Orquestrador top-level ────────────────────────────────────────────────────

def _load_consultor_perspectiva(debriefing_id: str) -> Optional[str]:
    """
    Lê consultor_perspectiva_text do debriefing recém-criado (já populado pela
    rota POST, seja via texto inline ou texto extraído de arquivo via Docling).
    Retorna None se não houver perspectiva ou em caso de falha (graceful).
    """
    if not debriefing_id:
        return None
    try:
        from deps import supabase_client
        row = (
            supabase_client.table("debriefings")
            .select("consultor_perspectiva_text")
            .eq("id", debriefing_id)
            .single()
            .execute()
        )
        if not row.data:
            return None
        text = row.data.get("consultor_perspectiva_text")
        return text if (text and text.strip()) else None
    except Exception as e:
        logger.warning(f"[debriefing] falha ao carregar perspectiva: {e}")
        return None


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
            ciclo_numero=request.ciclo_numero,
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

        # Perspectiva qualitativa do consultor (input opcional persistido na
        # rota antes do dispatch — texto inline ou extraído de arquivo).
        consultor_perspectiva = _load_consultor_perspectiva(request.debriefing_id)

        markdown, tokens_in, tokens_out = generate_markdown(
            nome_cliente=cliente_row.get("nome", ""),
            nome_empresa=cliente_row.get("empresa", ""),
            consultor=cliente_row.get("consultor_responsavel", ""),
            periodo_inicio=request.periodo_inicio,
            periodo_fim=request.periodo_fim,
            reunioes_contratadas=cliente_row.get("reunioes_contratadas", 15),
            clickup_data=clickup_data,
            drive_data=drive_data,
            consultor_perspectiva=consultor_perspectiva,
            callback=callback,
        )

        titulo_pdf = (
            f"Debriefing — {cliente_row.get('nome', '')} | Ciclo {request.ciclo_numero}"
        )
        pdf_path = generate_pdf_and_upload(
            debriefing_id=request.debriefing_id or request.cliente_id,
            markdown=markdown,
            titulo=titulo_pdf,
            callback=callback,
        )

        custo_usd = (
            tokens_in / 1_000_000 * _PRICE_INPUT_PER_M
            + tokens_out / 1_000_000 * _PRICE_OUTPUT_PER_M
        )
        duracao = int((datetime.now(timezone.utc) - started).total_seconds())

        _emit(callback, "complete", {"custo_usd": custo_usd, "duracao_s": duracao})

        return DebriefingResult(
            debriefing_id=request.debriefing_id or request.cliente_id,
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
            debriefing_id=request.debriefing_id or request.cliente_id,
            status="falhou",
            erro=str(e),
            duracao_segundos=int((datetime.now(timezone.utc) - started).total_seconds()),
        )
