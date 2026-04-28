"""
Rotas de Métricas Sociais — FLG Jornada System.

Plataformas: instagram, linkedin, youtube, tiktok.
Todos os endpoints aceitam ?plataforma=... (default: instagram).

Endpoints:
  GET  /metricas/{cliente_id}/overview       — resumo 30d + comparativo
  GET  /metricas/{cliente_id}/historico      — série temporal (dias=30|90|180)
  GET  /metricas/{cliente_id}/posts          — top posts por engajamento
  GET  /metricas/{cliente_id}/horarios       — heatmap engajamento
  GET  /metricas/ranking                     — ranking admin
  POST /metricas/{cliente_id}/manual         — entrada manual
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_current_user, supabase_client
from services.social import get_platform_repository, PLATAFORMAS_VALIDAS

router = APIRouter(prefix="/metricas", tags=["metricas"])
_supabase = supabase_client


def _get_repo(plataforma: str, cliente_id: str):
    if plataforma not in PLATAFORMAS_VALIDAS:
        raise HTTPException(400, f"Plataforma inválida. Use: {', '.join(PLATAFORMAS_VALIDAS)}")
    return get_platform_repository(plataforma, cliente_id)


# ─── Helpers de agregação ────────────────────────────────────────────────────

def _avg(lst, key):
    """Média aritmética simples de todos os dias (incluindo zeros).
    Use pra métricas onde 'dia sem dado' é informação válida (raro)."""
    vals = [d[key] for d in lst if d.get(key) is not None]
    return round(sum(vals) / len(vals), 2) if vals else 0

def _avg_active(lst, key):
    """Média ignorando dias zerados — pra métricas tipo 'taxa por post' e
    'alcance por post'. Sem isso, 1 post com eng=12% em 30 dias dilui pra 0.4%."""
    vals = [d[key] for d in lst if d.get(key) and d[key] > 0]
    return round(sum(vals) / len(vals), 2) if vals else 0

def _sum(lst, key):
    return sum(d.get(key, 0) for d in lst)

def _last(lst, key):
    return lst[-1].get(key) if lst else 0

def _delta_pct(atual_val, anterior_val):
    """Retorna delta % vs período anterior.
    None quando não há base de comparação (cliente novo / sem dados anteriores) —
    frontend suprime o badge nesse caso pra não mostrar '0%' enganoso."""
    if anterior_val is None or anterior_val == 0:
        return None
    return round((atual_val - anterior_val) / anterior_val * 100, 1)


# ─── Overview genérico multi-plataforma ──────────────────────────────────────

def _build_kpis_instagram(atual, anterior):
    # taxa_engajamento, alcance_medio, impressoes_medias usam _avg_active:
    # são métricas "por post" e dias sem post não devem diluir.
    # curtidas/comentários/salvamentos somam tudo (volume absoluto no período).
    return {
        "seguidores": {"valor": _last(atual, "seguidores"), "delta_pct": _delta_pct(_last(atual, "seguidores"), _last(anterior, "seguidores"))},
        "taxa_engajamento": {"valor": _avg_active(atual, "taxa_engajamento"), "delta_pct": _delta_pct(_avg_active(atual, "taxa_engajamento"), _avg_active(anterior, "taxa_engajamento"))},
        "alcance_medio": {"valor": int(_avg_active(atual, "alcance_total")), "delta_pct": _delta_pct(_avg_active(atual, "alcance_total"), _avg_active(anterior, "alcance_total"))},
        "impressoes_medias": {"valor": int(_avg_active(atual, "impressoes_total")), "delta_pct": _delta_pct(_avg_active(atual, "impressoes_total"), _avg_active(anterior, "impressoes_total"))},
        "curtidas_total": {"valor": _sum(atual, "curtidas_total"), "delta_pct": _delta_pct(_sum(atual, "curtidas_total"), _sum(anterior, "curtidas_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
        "salvamentos_total": {"valor": _sum(atual, "salvamentos_total"), "delta_pct": _delta_pct(_sum(atual, "salvamentos_total"), _sum(anterior, "salvamentos_total"))},
        "posts_publicados": {"valor": _sum(atual, "posts_publicados")},
        "reels_publicados": {"valor": _sum(atual, "reels_publicados")},
        "stories_publicados": {"valor": _sum(atual, "stories_publicados")},
    }

def _build_kpis_linkedin(atual, anterior):
    return {
        "seguidores": {"valor": _last(atual, "seguidores"), "delta_pct": _delta_pct(_last(atual, "seguidores"), _last(anterior, "seguidores"))},
        "conexoes": {"valor": _last(atual, "conexoes"), "delta_pct": _delta_pct(_last(atual, "conexoes"), _last(anterior, "conexoes"))},
        "ssi_score": {"valor": _avg(atual, "ssi_score"), "delta_pct": _delta_pct(_avg(atual, "ssi_score"), _avg(anterior, "ssi_score"))},
        "taxa_engajamento": {"valor": _avg(atual, "taxa_engajamento"), "delta_pct": _delta_pct(_avg(atual, "taxa_engajamento"), _avg(anterior, "taxa_engajamento"))},
        "impressoes_posts": {"valor": int(_avg(atual, "impressoes_posts")), "delta_pct": _delta_pct(_avg(atual, "impressoes_posts"), _avg(anterior, "impressoes_posts"))},
        "visualizacoes_perfil": {"valor": _sum(atual, "visualizacoes_perfil"), "delta_pct": _delta_pct(_sum(atual, "visualizacoes_perfil"), _sum(anterior, "visualizacoes_perfil"))},
        "reacoes_total": {"valor": _sum(atual, "reacoes_total"), "delta_pct": _delta_pct(_sum(atual, "reacoes_total"), _sum(anterior, "reacoes_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
        "posts_publicados": {"valor": _sum(atual, "posts_publicados")},
        "artigos_publicados": {"valor": _sum(atual, "artigos_publicados")},
    }

def _build_kpis_youtube(atual, anterior):
    return {
        "inscritos": {"valor": _last(atual, "inscritos"), "delta_pct": _delta_pct(_last(atual, "inscritos"), _last(anterior, "inscritos"))},
        "visualizacoes": {"valor": _sum(atual, "visualizacoes"), "delta_pct": _delta_pct(_sum(atual, "visualizacoes"), _sum(anterior, "visualizacoes"))},
        "watch_time_horas": {"valor": round(_sum(atual, "watch_time_horas"), 1), "delta_pct": _delta_pct(_sum(atual, "watch_time_horas"), _sum(anterior, "watch_time_horas"))},
        "ctr_pct": {"valor": _avg(atual, "ctr_pct"), "delta_pct": _delta_pct(_avg(atual, "ctr_pct"), _avg(anterior, "ctr_pct"))},
        "taxa_retencao_pct": {"valor": _avg(atual, "taxa_retencao_pct"), "delta_pct": _delta_pct(_avg(atual, "taxa_retencao_pct"), _avg(anterior, "taxa_retencao_pct"))},
        "likes_total": {"valor": _sum(atual, "likes_total"), "delta_pct": _delta_pct(_sum(atual, "likes_total"), _sum(anterior, "likes_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
        "videos_publicados": {"valor": _sum(atual, "videos_publicados")},
        "shorts_publicados": {"valor": _sum(atual, "shorts_publicados")},
    }

def _build_kpis_tiktok(atual, anterior):
    return {
        "seguidores": {"valor": _last(atual, "seguidores"), "delta_pct": _delta_pct(_last(atual, "seguidores"), _last(anterior, "seguidores"))},
        "visualizacoes_video": {"valor": _sum(atual, "visualizacoes_video"), "delta_pct": _delta_pct(_sum(atual, "visualizacoes_video"), _sum(anterior, "visualizacoes_video"))},
        "taxa_engajamento": {"valor": _avg(atual, "taxa_engajamento"), "delta_pct": _delta_pct(_avg(atual, "taxa_engajamento"), _avg(anterior, "taxa_engajamento"))},
        "taxa_conclusao": {"valor": _avg(atual, "taxa_conclusao"), "delta_pct": _delta_pct(_avg(atual, "taxa_conclusao"), _avg(anterior, "taxa_conclusao"))},
        "fyp_pct": {"valor": _avg(atual, "fyp_pct"), "delta_pct": _delta_pct(_avg(atual, "fyp_pct"), _avg(anterior, "fyp_pct"))},
        "curtidas_total": {"valor": _sum(atual, "curtidas_total"), "delta_pct": _delta_pct(_sum(atual, "curtidas_total"), _sum(anterior, "curtidas_total"))},
        "comentarios_total": {"valor": _sum(atual, "comentarios_total"), "delta_pct": _delta_pct(_sum(atual, "comentarios_total"), _sum(anterior, "comentarios_total"))},
        "compartilhamentos_total": {"valor": _sum(atual, "compartilhamentos_total"), "delta_pct": _delta_pct(_sum(atual, "compartilhamentos_total"), _sum(anterior, "compartilhamentos_total"))},
        "videos_publicados": {"valor": _sum(atual, "videos_publicados")},
    }

_KPI_BUILDERS = {
    "instagram": _build_kpis_instagram,
    "linkedin": _build_kpis_linkedin,
    "youtube": _build_kpis_youtube,
    "tiktok": _build_kpis_tiktok,
}

# Sparkline fields per platform
_SPARKLINE_FIELDS = {
    "instagram": [("seguidores", "seguidores"), ("engajamento", "taxa_engajamento"), ("alcance", "alcance_total")],
    "linkedin": [("seguidores", "seguidores"), ("engajamento", "taxa_engajamento"), ("ssi", "ssi_score")],
    "youtube": [("inscritos", "inscritos"), ("visualizacoes", "visualizacoes"), ("ctr", "ctr_pct")],
    "tiktok": [("seguidores", "seguidores"), ("engajamento", "taxa_engajamento"), ("fyp", "fyp_pct")],
}


# ─── Ranking ─────────────────────────────────────────────────────────────────

@router.get("/ranking")
async def get_ranking(
    plataforma: str = "instagram",
    user=Depends(get_current_user),
):
    repo = _get_repo(plataforma, None)
    clientes = _supabase.table("clientes").select(
        "id, nome, empresa, consultor_responsavel, encontro_atual"
    ).order("nome").execute()

    ranking = []
    for c in (clientes.data or []):
        try:
            hist = repo.get_historico(c["id"], 30)
            if not hist:
                continue
            ranking.append({
                "cliente_id": c["id"],
                "nome": c["nome"],
                "empresa": c["empresa"],
                "consultor": c.get("consultor_responsavel"),
                "encontro_atual": c.get("encontro_atual", 1),
                "audiencia": hist[-1].get("seguidores") or hist[-1].get("inscritos", 0),
                "taxa_engajamento": _avg(hist, "taxa_engajamento"),
                "posts_mes": sum(
                    d.get("posts_publicados", 0) + d.get("videos_publicados", 0) for d in hist
                ),
            })
        except Exception:
            pass

    ranking.sort(key=lambda x: x["taxa_engajamento"], reverse=True)
    return {"ranking": ranking, "total": len(ranking), "plataforma": plataforma}


# ─── Overview ─────────────────────────────────────────────────────────────────

@router.get("/{cliente_id}/overview")
async def get_overview(
    cliente_id: str,
    plataforma: str = "instagram",
    user=Depends(get_current_user),
):
    repo = _get_repo(plataforma, cliente_id)
    historico = repo.get_historico(cliente_id, 60)
    connected = repo.is_connected(cliente_id)

    cliente_row = _supabase.table("clientes").select("nome, empresa").eq(
        "id", cliente_id
    ).single().execute()
    cliente_nome = cliente_row.data.get("nome", "—") if cliente_row.data else "—"

    # Diagnóstico: se for IG conectado, traz última sync e último erro pra UI poder
    # explicar quando dados ficam zerados (ex: sync rodou mas insights falharam).
    diagnostico = None
    if plataforma == "instagram" and connected:
        diagnostico = _build_ig_diagnostico(cliente_id, historico)

    # Cliente conectado mas sync ainda não populou as tabelas — devolve overview
    # vazio com flag pro frontend mostrar estado "aguardando primeira sync".
    # Mock sempre devolve histórico, então isso só dispara no caminho Live.
    if not historico:
        if connected:
            return {
                "cliente_id": cliente_id,
                "cliente_nome": cliente_nome,
                "plataforma": plataforma,
                "periodo": {"inicio": None, "fim": None},
                "conectado": True,
                "aguardando_sync": True,
                "kpis": {},
                "sparklines": {},
                "diagnostico": diagnostico,
            }
        raise HTTPException(404, "Sem dados para este cliente")

    atual = historico[30:]
    anterior = historico[:30]

    builder = _KPI_BUILDERS.get(plataforma, _build_kpis_instagram)
    kpis = builder(atual, anterior)

    spark7 = historico[-7:]
    sparklines = {}
    for label, field in _SPARKLINE_FIELDS.get(plataforma, []):
        sparklines[label] = [{"data": d["data"], "v": d.get(field, 0)} for d in spark7]

    return {
        "cliente_id": cliente_id,
        "cliente_nome": cliente_nome,
        "plataforma": plataforma,
        "periodo": {
            "inicio": atual[0]["data"] if atual else None,
            "fim": atual[-1]["data"] if atual else None,
        },
        "conectado": connected,
        "aguardando_sync": False,
        "kpis": kpis,
        "sparklines": sparklines,
        "diagnostico": diagnostico,
    }


def _build_ig_diagnostico(cliente_id: str, historico: list) -> dict:
    """
    Diagnóstico pro frontend explicar dados vazios.
    Conta posts dos últimos 30 dias e busca último erro de sync.
    """
    import json as _json
    posts_no_periodo = sum((h.get("posts_publicados") or 0) for h in historico[-30:])
    posts_no_periodo += sum((h.get("reels_publicados") or 0) for h in historico[-30:])
    posts_no_periodo += sum((h.get("stories_publicados") or 0) for h in historico[-30:])

    conn = _supabase.table("instagram_conexoes").select(
        "last_sync_at,last_error,token_expires_at"
    ).eq("cliente_id", cliente_id).eq("status", "ativo").maybe_single().execute()

    last_error_parsed = None
    last_sync_at = None
    if conn and conn.data:
        last_sync_at = conn.data.get("last_sync_at")
        raw_err = conn.data.get("last_error")
        if raw_err:
            try:
                last_error_parsed = _json.loads(raw_err)
            except Exception:
                last_error_parsed = {"errors": [{"step": "unknown", "message": raw_err}]}

    return {
        "posts_no_periodo": posts_no_periodo,
        "last_sync_at": last_sync_at,
        "last_error": last_error_parsed,
    }


# ─── Histórico ────────────────────────────────────────────────────────────────

@router.get("/{cliente_id}/historico")
async def get_historico(
    cliente_id: str,
    dias: int = 30,
    plataforma: str = "instagram",
    user=Depends(get_current_user),
):
    if dias < 1 or dias > 365:
        raise HTTPException(400, "dias deve estar entre 1 e 365")
    repo = _get_repo(plataforma, cliente_id)
    return {"cliente_id": cliente_id, "dias": dias, "plataforma": plataforma,
            "dados": repo.get_historico(cliente_id, dias)}


# ─── Posts ────────────────────────────────────────────────────────────────────

@router.get("/{cliente_id}/posts")
async def get_posts(
    cliente_id: str,
    limit: int = 12,
    plataforma: str = "instagram",
    user=Depends(get_current_user),
):
    if limit > 50:
        limit = 50
    repo = _get_repo(plataforma, cliente_id)
    return {"cliente_id": cliente_id, "plataforma": plataforma,
            "posts": repo.get_posts(cliente_id, limit)}


# ─── Horários ─────────────────────────────────────────────────────────────────

@router.get("/{cliente_id}/horarios")
async def get_horarios(
    cliente_id: str,
    plataforma: str = "instagram",
    user=Depends(get_current_user),
):
    repo = _get_repo(plataforma, cliente_id)
    return {"cliente_id": cliente_id, "plataforma": plataforma,
            "horarios": repo.get_horarios(cliente_id)}


# ─── Demografia (Instagram apenas — gênero/idade/região) ──────────────────────

@router.get("/{cliente_id}/demografia")
async def get_demografia(
    cliente_id: str,
    tipo: str = "follower",
    plataforma: str = "instagram",
    user=Depends(get_current_user),
):
    if tipo not in ("follower", "engaged_audience"):
        raise HTTPException(400, "tipo deve ser 'follower' ou 'engaged_audience'")
    if plataforma != "instagram":
        raise HTTPException(400, "Demografia disponível apenas para Instagram")
    repo = _get_repo(plataforma, cliente_id)
    if not hasattr(repo, "get_demografia"):
        raise HTTPException(501, "Demografia não implementada para esta plataforma")
    return {
        "cliente_id": cliente_id,
        "plataforma": plataforma,
        "demografia": repo.get_demografia(cliente_id, tipo),
    }


# ─── Entrada Manual ───────────────────────────────────────────────────────────

class MetricaManualInput(BaseModel):
    data: Optional[str] = None
    plataforma: str = "instagram"
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
    data_ref = body.data or str(date.today())
    payload = {
        "cliente_id": cliente_id,
        "data": data_ref,
        "plataforma": body.plataforma,
        "inserido_por": user.email,
        **{k: v for k, v in body.model_dump().items() if v is not None and k not in ("data", "plataforma")},
    }
    try:
        result = _supabase.table("metricas_manual").upsert(
            payload, on_conflict="cliente_id,data,plataforma"
        ).execute()
        return {"ok": True, "data": result.data[0] if result.data else payload}
    except Exception as e:
        raise HTTPException(500, f"Tabela metricas_manual pode não existir. Erro: {e}")
