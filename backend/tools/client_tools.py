"""
Tools Agno para gerenciamento de perfil de clientes no Supabase.
Expostas ao agente FLG como callable tools.
"""

import json
from typing import Optional
from supabase import create_client
from config import settings

_supabase = create_client(settings.supabase_url, settings.supabase_key)


def get_client_profile(client_id: str) -> str:
    """
    Retorna o perfil completo do cliente incluindo encontros anteriores realizados.
    Use para obter todas as informações do cliente antes de iniciar a conversa.
    """
    # Perfil principal
    result = _supabase.table("clientes").select("*").eq("id", client_id).single().execute()
    if not result.data:
        return json.dumps({"erro": f"Cliente {client_id} não encontrado"})

    cliente = result.data

    # Histórico de encontros realizados
    historico = (
        _supabase.table("encontros_realizados")
        .select("*")
        .eq("cliente_id", client_id)
        .order("encontro_numero")
        .execute()
    )
    cliente["encontros_realizados"] = historico.data or []

    return json.dumps(cliente, ensure_ascii=False, default=str)


def update_client_profile(client_id: str, campo: str, valor: str) -> str:
    """
    Atualiza um campo específico do perfil do cliente no Supabase.
    Use para registrar insights coletados na conversa (travas, avanços, observações).

    Campos atualizáveis: tom_de_voz, pontos_fortes, travas_conhecidas, ansiedades,
    situacao_atual, objetivo_em_6_meses, principal_dor_hoje, marcas_referencia,
    seguidores_instagram.
    """
    CAMPOS_PERMITIDOS = {
        "tom_de_voz", "pontos_fortes", "travas_conhecidas", "ansiedades",
        "situacao_atual", "objetivo_em_6_meses", "principal_dor_hoje",
        "marcas_referencia", "seguidores_instagram", "tem_trafego_pago",
        "tem_equipe_conteudo"
    }

    if campo not in CAMPOS_PERMITIDOS:
        return json.dumps({"erro": f"Campo '{campo}' não permitido. Use: {sorted(CAMPOS_PERMITIDOS)}"})

    _supabase.table("clientes").update({campo: valor}).eq("id", client_id).execute()
    return json.dumps({"ok": True, "campo_atualizado": campo})


def get_encontro_base(numero: int) -> str:
    """
    Retorna a linha intelectual e o objetivo estratégico de um encontro específico (1-15).
    Use no início da preparação para entender o contexto do encontro.
    """
    result = (
        _supabase.table("encontros_base")
        .select("*")
        .eq("numero", numero)
        .single()
        .execute()
    )
    if not result.data:
        return json.dumps({"erro": f"Encontro {numero} não encontrado"})
    return json.dumps(result.data, ensure_ascii=False, default=str)


def list_clients() -> str:
    """Retorna lista resumida de todos os clientes (para admin)."""
    result = (
        _supabase.table("clientes")
        .select("id, nome, empresa, consultor_responsavel, encontro_atual, created_at")
        .order("created_at", desc=True)
        .execute()
    )
    return json.dumps(result.data or [], ensure_ascii=False, default=str)


def save_encontro_auditoria(
    client_id: str,
    encontro_numero: int,
    auditoria_semana: Optional[str] = None,
    evoluiu_posicionamento: Optional[str] = None,
    principal_trava_hoje: Optional[str] = None,
    execucao_conteudo: Optional[str] = None,
    campanhas_rodando: Optional[str] = None,
    engajamento_tendencia: Optional[str] = None,
    mais_proximo_planejamento: Optional[bool] = None,
    observacoes_livres: Optional[str] = None,
) -> str:
    """
    Salva ou atualiza os dados de auditoria do encontro atual.
    Chamado pelo backend quando o consultor preenche os campos da Tela 3.
    """
    data = {
        "cliente_id": client_id,
        "encontro_numero": encontro_numero,
    }
    campos = {
        "auditoria_semana": auditoria_semana,
        "evoluiu_posicionamento": evoluiu_posicionamento,
        "principal_trava_hoje": principal_trava_hoje,
        "execucao_conteudo": execucao_conteudo,
        "campanhas_rodando": campanhas_rodando,
        "engajamento_tendencia": engajamento_tendencia,
        "mais_proximo_planejamento": mais_proximo_planejamento,
        "observacoes_livres": observacoes_livres,
    }
    data.update({k: v for k, v in campos.items() if v is not None})

    result = (
        _supabase.table("encontros_realizados")
        .upsert(data, on_conflict="cliente_id,encontro_numero")
        .execute()
    )
    return json.dumps({"ok": True, "id": result.data[0]["id"] if result.data else None}, default=str)
