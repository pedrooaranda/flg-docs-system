"""
Carregamento da base de conhecimento FLG do Supabase.
Injetado no system prompt de todos os agentes.
"""

import logging
from functools import lru_cache
from supabase import create_client
from config import settings

logger = logging.getLogger("flg.knowledge")

_supabase = create_client(settings.supabase_url, settings.supabase_key)


def load_conhecimento_base() -> str:
    """
    Carrega todos os registros ativos da base de conhecimento, ordenados por `ordem`.
    Retorna string formatada para injeção no system prompt.
    """
    result = (
        _supabase.table("conhecimento_base")
        .select("titulo, tipo, conteudo")
        .eq("ativo", True)
        .order("ordem")
        .execute()
    )
    items = result.data or []
    if not items:
        return ""

    sections = []
    for item in items:
        sections.append(f"### {item['titulo']}\n{item['conteudo']}")

    return "\n\n".join(sections)
