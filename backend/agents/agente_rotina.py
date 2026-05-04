"""
Agente de rotina FLG — sincroniza comentários do ClickUp com os perfis dos clientes.
Roda a cada 6h via APScheduler.
"""

import json
import logging

from agno.agent import Agent
from agno.models.anthropic import Claude
from supabase import create_client

from config import settings
from tools.clickup_tools import read_clickup_comments
from tools.client_tools import update_client_profile

logger = logging.getLogger("flg.rotina")

_supabase = create_client(settings.supabase_url, settings.supabase_key)

ROTINA_SYSTEM_PROMPT = """\
Você é um assistente de CRM da FLG Brasil.
Sua função é ler os comentários recentes de uma task do ClickUp sobre um cliente
e atualizar os campos relevantes do perfil desse cliente.

CAMPOS QUE VOCÊ PODE ATUALIZAR:
- situacao_atual: o que está acontecendo na empresa hoje
- travas_conhecidas: bloqueios, resistências e dificuldades identificadas
- pontos_fortes: conquistas e capacidades do founder
- ansiedades: preocupações e medos expressos
- principal_dor_hoje: a dor mais urgente no momento
- objetivo_em_6_meses: o que o cliente quer alcançar

INSTRUÇÕES:
1. Leia os comentários com read_clickup_comments
2. Extraia insights relevantes sobre o cliente
3. Atualize APENAS os campos onde há informação nova e relevante
4. Não sobrescreva informações boas com informações vagas
5. Se não há nada novo, não faça nenhuma atualização
"""


agente_rotina = Agent(
    name="Agente de Rotina FLG",
    id="agente-rotina",
    model=Claude(id="claude-haiku-4-5-20251001"),
    tools=[read_clickup_comments, update_client_profile],
    instructions=ROTINA_SYSTEM_PROMPT,
    markdown=False,
)


async def run_rotina_sync():
    """
    Executa sincronização para todos os clientes com clickup_task_id configurado.
    Chamada pelo APScheduler a cada 6h.
    """
    logger.info("▶ Iniciando agente de rotina — ClickUp sync")

    result = (
        _supabase.table("clientes")
        .select("id, nome, clickup_task_id")
        .not_.is_("clickup_task_id", "null")
        .execute()
    )
    clientes = result.data or []

    if not clientes:
        logger.info("Nenhum cliente com clickup_task_id configurado")
        return

    for cliente in clientes:
        client_id = cliente["id"]
        task_id = cliente["clickup_task_id"]
        nome = cliente["nome"]

        try:
            logger.info(f"  Sincronizando {nome} (task: {task_id})")
            message = (
                f"Sincronize o cliente '{nome}' (ID: {client_id}) "
                f"lendo os comentários da task ClickUp '{task_id}'."
            )
            await agente_rotina.arun(message)
            logger.info(f"  ✅ {nome} sincronizado")
        except Exception as e:
            logger.error(f"  ❌ Erro ao sincronizar {nome}: {e}")

    logger.info(f"▶ Rotina concluída — {len(clientes)} clientes processados")
