"""
Configuração do AgentOS — serve o agente FLG como API FastAPI.
Os agentes são registrados aqui para monitoramento via os.agno.com.
"""

from agno.os import AgentOS

from agents.agente_flg import create_flg_agent
from agents.agente_rotina import agente_rotina
from prompts.system_prompt import build_system_prompt


def build_agent_os() -> AgentOS:
    """
    Cria o AgentOS com ambos os agentes registrados.
    O agente FLG usa um system prompt placeholder — na prática o system prompt
    é injetado dinamicamente via endpoint customizado /chat/{client_id}/{encontro}.
    """
    # Agente FLG com prompt genérico (usado pelo playground do AgentOS)
    agente_flg_default = create_flg_agent(
        system_prompt="Você é o Assistente FLG. Para iniciar, informe o client_id e o número do encontro.",
        session_id="default",
    )

    agent_os = AgentOS(
        agents=[agente_flg_default, agente_rotina],
        tracing=True,
    )
    return agent_os
