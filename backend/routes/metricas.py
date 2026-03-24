"""
Rotas de Métricas Instagram — FLG Jornada System.

Endpoints:
  GET  /metricas/{cliente_id}/overview       — resumo últimos 30d + comparativo anterior
  GET  /metricas/{cliente_id}/historico      — série temporal (dias=30|90|180)
  GET  /metricas/{cliente_id}/posts          — top posts por engajamento
  GET  /metricas/{cliente_id}/horarios       — matriz heatmap de engajamento
  GET  /metricas/ranking                     — ranking admin de todos os clientes
  POST /metricas/{cliente_id}/manual         — entrada manual de métricas
"""

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_current_user, supabase_client
from services.instagram import get_repository

router = APIRouter(prefix="/metricas", tags=["metricas"])

_supabase = supabase_client


# ─── Overview ─────────────────────────────────────────────────────────────────

@router.get("/{cliente_id}/overview")
async def get_overview(cliente_id: str, user=Depends(get_current_user)):
    """
    Retorna KPIs dos últimos 30 dias vs. 30 dias anteriores.
    Inclui sparklines (série de 7 dias) para cada métrica principal.
    """
    repo = get_repository(cliente_id)

    # Buscar 60 dias para poder comparar com período anterior
    historico = repo.get_historico(cliente_id, 60)

    if not historico:
        raise HTTPException(status_code=404, detail="Sem dados para este cliente")

    atual = historico[30:]   # últimos 30 dias
    anterior = historico[:30]  # 30 dias anteriores

    def _avg(lst, key):
        vals = [d[key] for d in lst if d.get(key) is not None]
        return round(sum(vals) / len(vals), 2) if vals else 0

    def _sum(lst, key):
        return sum(d.get(key, 0) for d in lst)

    def _last(lst, key):
        return lst[-1].get(key) if lst else 0

    def _delta_pct(atual_val, anterior_val):
        if anterior_val == 0:
            return 0
        return round((atual_val - anterior_val) / anterior_val * 100, 1)

    # Seguidores: pegar último do período atual vs. último do anterior
    seg_atual = _last(atual, "seguidores")
    seg_anterior = _last(anterior, "seguidores")

    eng_atual = _avg(atual, "taxa_engajamento")
    eng_anterior = _avg(anterior, "taxa_engajamento")

    alc_atual = _avg(atual, "alcance_total")
    alc_anterior = _avg(anterior, "alcance_total")

    imp_atual = _avg(atual, "impressoes_total")
    imp_anterior = _avg(anterior, "impressoes_total")

    # Sparklines: últimos 7 dias
    spark7 = historico[-7:]

    # Verificar se Instagram está conectado
    connected = repo.is_connected(cliente_id)

    # Buscar perfil do cliente para nome
    cliente_row = _supabase.table("clientes").select("nome, empresa").eq(
        "id", cliente_id
    ).single().execute()
    cliente_nome = cliente_row.data.get("nome", "—") if cliente_row.data else "—"

    return {
        "cliente_id": cliente_id,
        "cliente_nome": cliente_nome,
        "periodo": {
            "inicio": atual[0]["data"] if atual else None,
            "fim": atual[-1]["data"] if atual else None,
        },
        "instagram_conectado": connected,
        "kpis": {
            "seguidores": {
                "valor": seg_atual,
                "delta_pct": _delta_pct(seg_atual, seg_anterior),
                "delta_abs": seg_atual - seg_anterior,
            },
            "taxa_engajamento": {
                "valor": eng_atual,
                "delta_pct": _delta_pct(eng_atual, eng_anterior),
            },
            "alcance_medio": {
                "valor": int(alc_atual),
                "delta_pct": _delta_pct(alc_atual, alc_anterior),
            },
            "impressoes_medias": {
                "valor": int(imp_atual),
                "delta_pct": _delta_pct(imp_atual, imp_anterior),
            },
            "curtidas_total": {
                "valor": _sum(atual, "curtidas_total"),
                "delta_pct": _delta_pct(
                    _sum(atual, "curtidas_total"),
                    _sum(anterior, "curtidas_total"),
                ),
            },
            "comentarios_total": {
                "valor": _sum(atual, "comentarios_total"),
                "delta_pct": _delta_pct(
                    _sum(atual, "comentarios_total"),
                    _sum(anterior, "comentarios_total"),
                ),
            },
            "salvamentos_total": {
                "valor": _sum(atual, "salvamentos_total"),
                "delta_pct": _delta_pct(
                    _sum(atual, "salvamentos_total"),
                    _sum(anterior, "salvamentos_total"),
                ),
            },
            "posts_publicados": {
                "valor": _sum(atual, "posts_publicados"),
            },
            "reels_publicados": {
                "valor": _sum(atual, "reels_publicados"),
            },
            "stories_publicados": {
                "valor": _sum(atual, "stories_publicados"),
            },
        },
        "sparklines": {
            "seguidores": [{"data": d["data"], "v": d["seguidores"]} for d in spark7],
            "engajamento": [{"data": d["data"], "v": d["taxa_engajamento"]} for d in spark7],
            "alcance": [{"data": d["data"], "v": d["alcance_total"]} for d in spark7],
        },
    }


# ─── Histórico ────────────────────────────────────────────────────────────────

@router.get("/{cliente_id}/historico")
async def get_historico(
    cliente_id: str,
    dias: int = 30,
    user=Depends(get_current_user),
):
    """Série temporal completa para gráficos de evolução."""
    if dias not in (30, 90, 180):
        raise HTTPException(status_code=400, detail="dias deve ser 30, 90 ou 180")

    repo = get_repository(cliente_id)
    dados = repo.get_historico(cliente_id, dias)
    return {"cliente_id": cliente_id, "dias": dias, "dados": dados}


# ─── Posts ────────────────────────────────────────────────────────────────────

@router.get("/{cliente_id}/posts")
async def get_posts(
    cliente_id: str,
    limit: int = 12,
    user=Depends(get_current_user),
):
    """Top posts ordenados por taxa de engajamento."""
    if limit > 50:
        limit = 50
    repo = get_repository(cliente_id)
    posts = repo.get_posts(cliente_id, limit)
    return {"cliente_id": cliente_id, "posts": posts}


# ─── Horários ─────────────────────────────────────────────────────────────────

@router.get("/{cliente_id}/horarios")
async def get_horarios(
    cliente_id: str,
    user=Depends(get_current_user),
):
    """Matriz de engajamento médio por faixa horária × dia da semana (heatmap)."""
    repo = get_repository(cliente_id)
    return {"cliente_id": cliente_id, "horarios": repo.get_horarios(cliente_id)}


# ─── Ranking Admin ────────────────────────────────────────────────────────────

@router.get("/ranking")
async def get_ranking(user=Depends(get_current_user)):
    """
    Retorna ranking de todos os clientes com seus KPIs principais.
    Admin-only (verificado no frontend — backend retorna para todos autenticados).
    """
    clientes = _supabase.table("clientes").select(
        "id, nome, empresa, consultor_responsavel, encontro_atual"
    ).order("nome").execute()

    ranking = []
    for c in (clientes.data or []):
        try:
            repo = get_repository(c["id"])
            hist = repo.get_historico(c["id"], 30)
            if not hist:
                continue

            def _avg_30(key):
                vals = [d[key] for d in hist if d.get(key) is not None]
                return round(sum(vals) / len(vals), 2) if vals else 0

            ranking.append({
                "cliente_id": c["id"],
                "nome": c["nome"],
                "empresa": c["empresa"],
                "consultor": c.get("consultor_responsavel"),
                "encontro_atual": c.get("encontro_atual", 1),
                "seguidores": hist[-1].get("seguidores", 0),
                "taxa_engajamento": _avg_30("taxa_engajamento"),
                "alcance_medio": int(_avg_30("alcance_total")),
                "posts_mes": sum(d.get("posts_publicados", 0) for d in hist),
                "reels_mes": sum(d.get("reels_publicados", 0) for d in hist),
            })
        except Exception:
            pass  # Ignorar clientes sem dados

    # Ordenar por taxa de engajamento descendente
    ranking.sort(key=lambda x: x["taxa_engajamento"], reverse=True)
    return {"ranking": ranking, "total": len(ranking)}


# ─── Entrada Manual ───────────────────────────────────────────────────────────

class MetricaManualInput(BaseModel):
    data: Optional[str] = None  # ISO date string, default = hoje
    seguidores: Optional[int] = None
    taxa_engajamento: Optional[float] = None
    alcance_total: Optional[int] = None
    impressoes_total: Optional[int] = None
    curtidas_total: Optional[int] = None
    comentarios_total: Optional[int] = None
    salvamentos_total: Optional[int] = None
    compartilhamentos_total: Optional[int] = None
    visitas_perfil: Optional[int] = None
    cliques_link_bio: Optional[int] = None
    posts_publicados: Optional[int] = None
    reels_publicados: Optional[int] = None
    stories_publicados: Optional[int] = None


@router.post("/{cliente_id}/manual")
async def post_manual(
    cliente_id: str,
    body: MetricaManualInput,
    user=Depends(get_current_user),
):
    """
    Salva métricas inseridas manualmente no banco.
    Usa tabela instagram_metricas_manual criada na migration 004.
    """
    data_ref = body.data or str(date.today())

    payload = {
        "cliente_id": cliente_id,
        "data": data_ref,
        "inserido_por": user.email,
        **{k: v for k, v in body.model_dump().items() if v is not None and k != "data"},
    }

    try:
        result = _supabase.table("instagram_metricas_manual").upsert(
            payload, on_conflict="cliente_id,data"
        ).execute()
        return {"ok": True, "data": result.data[0] if result.data else payload}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Tabela instagram_metricas_manual pode não existir. Execute a migration 004. Erro: {e}",
        )
