"""
Agente FLG principal — Assistente estratégico para preparação de encontros.

Este módulo define o Agent Agno mas NÃO o instancia globalmente.
A instância é criada por request em agent_os.py, com o system prompt
injetado dinamicamente baseado no cliente e encontro em questão.
"""

from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.db.postgres import PostgresDb

from config import settings
from tools.client_tools import (
    get_client_profile,
    update_client_profile,
    get_encontro_base,
)
from tools.slides_tools import generate_slides


def create_flg_agent(system_prompt: str, session_id: str) -> Agent:
    """
    Cria uma instância do agente FLG com o system prompt do cliente/encontro
    e o session_id isolado (client_id + encontro_numero).
    """
    return Agent(
        name="Assistente FLG",
        id="assistente-flg",
        model=Claude(id="claude-sonnet-4-6"),
        db=PostgresDb(
            db_url=settings.supabase_db_url,
            session_table="conversas_agente",
        ),
        session_id=session_id,
        description="Assistente estratégico da FLG Brazil para preparação de encontros com founders.",
        instructions=system_prompt,
        tools=[
            get_client_profile,
            update_client_profile,
            get_encontro_base,
            generate_slides,
        ],
        add_history_to_context=True,
        num_history_runs=10,
        markdown=True,
    )
