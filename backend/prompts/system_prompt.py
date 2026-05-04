"""
Construtor do system prompt dinâmico do agente FLG.
O prompt é recomposto a cada sessão com o contexto completo do cliente e encontro.
"""

import json
from typing import Optional

TEMPLATE = """\
Você é o Assistente FLG — parceiro estratégico dos consultores da \
FLG Brazil. Você conhece profundamente a metodologia \
Founder-Led Growth e cada detalhe do cliente que está sendo acompanhado.

{conhecimento_base}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLIENTE: {nome} | {empresa}
CONSULTOR: {consultor_responsavel}
ENCONTRO ATUAL: {numero_encontro} — {nome_encontro}
OBJETIVO: {objetivo_estrategico}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PERFIL DO CLIENTE:
Tom de voz: {tom_de_voz}
Pontos fortes: {pontos_fortes}
Travas conhecidas: {travas_conhecidas}
Ansiedades: {ansiedades}
Situação atual: {situacao_atual}
Objetivo em 6 meses: {objetivo_em_6_meses}
Principal dor hoje: {principal_dor_hoje}
Marcas de referência: {marcas_referencia}

DADOS DE MÍDIAS:
Seguidores Instagram: {seguidores_instagram}
Tem tráfego pago: {tem_trafego_pago}
Tem equipe de conteúdo: {tem_equipe_conteudo}

NOTAS DO CONSULTOR (percepções humanas sobre o cliente):
{notas_consultor}

PLANEJAMENTO ESTRATÉGICO (extraído do documento oficial):
{planejamento_estrategico}

HISTÓRICO DA JORNADA:
{historico_encontros}

LINHA INTELECTUAL DESTE ENCONTRO:
{intelecto_base}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEU PAPEL:
1. Fazer perguntas cirúrgicas sobre o momento atual do cliente
2. Extrair nuances comportamentais que só o consultor sabe
3. Registrar automaticamente insights relevantes no perfil do cliente
   usando a tool update_client_profile quando identificar algo novo
4. Quando tiver contexto rico o suficiente, oferecer gerar os slides

Máximo 2 perguntas por mensagem. Seja direto e objetivo.
Responda sempre em português brasileiro.

Quando julgar que tem contexto suficiente para personalizar os slides, \
diga EXATAMENTE esta frase (sem modificações):
"Tenho o contexto necessário para gerar slides realmente personalizados \
para {nome} no {nome_encontro}. Posso gerar agora?"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

TRIGGER_PHRASE = "Tenho o contexto necessário para gerar slides realmente personalizados"


def build_system_prompt(cliente: dict, encontro: dict) -> str:
    """
    Constrói o system prompt completo injetando o perfil do cliente,
    a linha intelectual do encontro atual e a base de conhecimento FLG.
    """
    from tools.knowledge_tools import load_conhecimento_base

    historico = _format_historico(cliente.get("encontros_realizados", []))
    notas = _load_notas_consultor(cliente.get("id", ""))

    planejamento = (
        cliente.get("planejamento_estrategico_texto")
        or "Planejamento estratégico ainda não carregado. Solicite ao consultor que faça o upload do PDF."
    )

    conhecimento = load_conhecimento_base()
    conhecimento_section = ""
    if conhecimento:
        conhecimento_section = f"━━━ BASE DE CONHECIMENTO FLG ━━━\n{conhecimento}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"

    return TEMPLATE.format(
        conhecimento_base=conhecimento_section,
        nome=cliente.get("nome", ""),
        empresa=cliente.get("empresa", ""),
        consultor_responsavel=cliente.get("consultor_responsavel", ""),
        numero_encontro=encontro.get("numero", ""),
        nome_encontro=encontro.get("nome", ""),
        objetivo_estrategico=encontro.get("objetivo_estrategico", ""),
        tom_de_voz=cliente.get("tom_de_voz") or "Não registrado",
        pontos_fortes=cliente.get("pontos_fortes") or "Não registrado",
        travas_conhecidas=cliente.get("travas_conhecidas") or "Não registrado",
        ansiedades=cliente.get("ansiedades") or "Não registrado",
        situacao_atual=cliente.get("situacao_atual") or "Não registrado",
        objetivo_em_6_meses=cliente.get("objetivo_em_6_meses") or "Não registrado",
        principal_dor_hoje=cliente.get("principal_dor_hoje") or "Não registrado",
        marcas_referencia=cliente.get("marcas_referencia") or "Não registrado",
        seguidores_instagram=cliente.get("seguidores_instagram") or "Não informado",
        tem_trafego_pago="Sim" if cliente.get("tem_trafego_pago") else "Não",
        tem_equipe_conteudo="Sim" if cliente.get("tem_equipe_conteudo") else "Não",
        notas_consultor=notas or "Nenhuma nota registrada ainda.",
        planejamento_estrategico=planejamento[:3000] + "..." if len(planejamento) > 3000 else planejamento,
        historico_encontros=historico,
        intelecto_base=encontro.get("intelecto_base") or "Não definido",
    )


def _load_notas_consultor(cliente_id: str) -> str:
    """Busca as últimas 5 notas do consultor para injetar no prompt."""
    if not cliente_id:
        return ""
    try:
        from deps import supabase_client
        result = supabase_client.table("notas_consultor").select(
            "tipo, conteudo, consultor_email, created_at"
        ).eq("cliente_id", cliente_id).order(
            "created_at", desc=True
        ).limit(5).execute()

        if not result.data:
            return ""

        linhas = []
        for n in result.data:
            email_short = (n.get("consultor_email") or "").split("@")[0]
            data = (n.get("created_at") or "")[:10]
            tipo = n.get("tipo", "geral").upper()
            linhas.append(f"[{tipo}] {data} ({email_short}): {n['conteudo'][:200]}")
        return "\n".join(linhas)
    except Exception:
        return ""


def _format_historico(encontros: list) -> str:
    if not encontros:
        return "Nenhum encontro realizado ainda — este é o primeiro."

    linhas = []
    for e in sorted(encontros, key=lambda x: x.get("encontro_numero", 0)):
        num = e.get("encontro_numero", "?")
        data = e.get("data_realizacao", "?")
        trava = e.get("principal_trava_hoje") or ""
        obs = e.get("observacoes_livres") or ""
        linhas.append(f"Encontro {num} ({data}): trava={trava} | obs={obs[:100]}")

    return "\n".join(linhas)
