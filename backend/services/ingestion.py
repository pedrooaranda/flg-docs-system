"""
Serviço de ingestão de métricas — FLG Jornada System.

Puxa dados reais das plataformas conectadas e salva no banco.
Roda via APScheduler a cada 6 horas (configurável).

Fluxo:
  1. Buscar todas as conexões ativas
  2. Para cada conexão, verificar se o token está válido (refresh se necessário)
  3. Puxar métricas do dia via API da plataforma
  4. Salvar em metricas_diarias + metricas_posts
  5. Atualizar ultima_sincronizacao na conexão

Cada plataforma tem seu próprio módulo de pull (Instagram, LinkedIn, etc.).
Os módulos são plug-and-play: quando as credenciais chegarem, basta implementar.
"""

import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("flg.ingestion")


# ─── Pull functions por plataforma ────────────────────────────────────────────
# Cada função recebe (supabase_client, conexao_row) e retorna True/False

async def _pull_instagram(sb, conn):
    """
    Pull Instagram via Meta Graph API.

    Endpoints usados:
      GET /{ig-user-id}?fields=followers_count,media_count
      GET /{ig-user-id}/insights?metric=reach,impressions,profile_views&period=day
      GET /{ig-user-id}/media?fields=id,caption,media_type,timestamp,like_count,
          comments_count,insights.metric(reach,impressions,saved,shares)

    Setup necessário:
      1. App no Meta for Developers (developers.facebook.com)
      2. Permissões: instagram_basic, instagram_manage_insights,
         pages_read_engagement, pages_show_list
      3. App Review aprovado
      4. Token de longa duração (60 dias, refresh automático)

    Variáveis de ambiente:
      META_APP_ID, META_APP_SECRET
    """
    logger.info(f"Instagram pull para cliente {conn['cliente_id']} — TODO: implementar")
    return False


async def _pull_linkedin(sb, conn):
    """
    Pull LinkedIn via LinkedIn Marketing API.

    Endpoints usados:
      GET /v2/networkSizes/{urn}?edgeType=CompanyFollowedByMember
      GET /v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity={urn}
      GET /v2/shares?q=owners&owners={urn}&count=50

    Setup necessário:
      1. App no LinkedIn Developers (developer.linkedin.com)
      2. Product: "Sign In with LinkedIn using OpenID Connect" + "Marketing Developer Platform"
      3. OAuth 2.0 scopes: r_organization_social, rw_organization_admin, r_1st_connections_size
      4. App aprovado pelo LinkedIn (pode levar semanas)

    Variáveis de ambiente:
      LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
    """
    logger.info(f"LinkedIn pull para cliente {conn['cliente_id']} — TODO: implementar")
    return False


async def _pull_youtube(sb, conn):
    """
    Pull YouTube via YouTube Data API v3 + YouTube Analytics API.

    Endpoints usados:
      GET /youtube/v3/channels?part=statistics,snippet&mine=true
      GET /youtube/v3/search?channelId={id}&type=video&order=date&maxResults=50
      GET /youtubeAnalytics/v2/reports?ids=channel=={id}&metrics=views,estimatedMinutesWatched,
          averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares

    Setup necessário:
      1. Projeto no Google Cloud Console (console.cloud.google.com)
      2. Ativar YouTube Data API v3 + YouTube Analytics API
      3. Criar OAuth 2.0 Client ID (Web application)
      4. Scopes: youtube.readonly, yt-analytics.readonly
      ** MAIS FÁCIL de todos — não precisa de app review para uso próprio **

    Variáveis de ambiente:
      GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
    """
    logger.info(f"YouTube pull para cliente {conn['cliente_id']} — TODO: implementar")
    return False


async def _pull_tiktok(sb, conn):
    """
    Pull TikTok via TikTok API for Business.

    Endpoints usados:
      GET /v2/research/user/info?username={username}
      GET /v2/video/list?cursor=0&max_count=20
      GET /v2/video/query?filters[video_ids]=[...]

    Setup necessário:
      1. App no TikTok for Developers (developers.tiktok.com)
      2. Product: "Login Kit" + "Content Posting API" (para ler dados)
      3. Scopes: user.info.basic, user.info.stats, video.list
      4. App Review aprovado

    Variáveis de ambiente:
      TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
    """
    logger.info(f"TikTok pull para cliente {conn['cliente_id']} — TODO: implementar")
    return False


_PULL_FUNCTIONS = {
    "instagram": _pull_instagram,
    "linkedin": _pull_linkedin,
    "youtube": _pull_youtube,
    "tiktok": _pull_tiktok,
}


# ─── Token refresh ────────────────────────────────────────────────────────────

async def _refresh_token_if_needed(sb, conn):
    """
    Verifica se o token está prestes a expirar e faz refresh.
    Retorna True se o token está válido (ou foi renovado com sucesso).
    """
    expires_at = conn.get("token_expires_at")
    if not expires_at:
        return True  # Token sem expiração definida

    from dateutil.parser import parse as parse_dt
    try:
        exp = parse_dt(expires_at) if isinstance(expires_at, str) else expires_at
    except Exception:
        return True

    # Refresh se expira nas próximas 2 horas
    if exp > datetime.now(timezone.utc) + timedelta(hours=2):
        return True

    plat = conn["plataforma"]
    logger.info(f"Token {plat} do cliente {conn['cliente_id']} expirando — refresh necessário")

    # TODO: implementar refresh por plataforma
    # Instagram/Meta: POST /oauth/access_token?grant_type=fb_exchange_token
    # LinkedIn: POST /oauth/v2/accessToken?grant_type=refresh_token
    # Google/YouTube: POST /oauth2/v4/token?grant_type=refresh_token
    # TikTok: POST /oauth/token/?grant_type=refresh_token

    sb.table("plataforma_conexoes").update({
        "status": "expirado",
        "ultimo_erro": "Token expirado — refresh não implementado ainda",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", conn["id"]).execute()

    return False


# ─── Job principal (chamado pelo APScheduler) ─────────────────────────────────

def run_ingestion_sync():
    """
    Wrapper síncrono para o APScheduler.
    Busca conexões ativas e puxa métricas de cada uma.
    """
    import asyncio
    try:
        asyncio.get_event_loop().run_until_complete(_run_ingestion())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_run_ingestion())
        loop.close()


async def _run_ingestion():
    """Job principal de ingestão."""
    from deps import supabase_client as sb

    logger.info("🔄 Iniciando ciclo de ingestão de métricas...")

    # Buscar conexões ativas
    result = sb.table("plataforma_conexoes").select("*").eq("status", "ativo").execute()
    conexoes = result.data or []

    if not conexoes:
        logger.info("Nenhuma conexão ativa encontrada — pulando ingestão")
        return

    logger.info(f"Encontradas {len(conexoes)} conexões ativas")

    sucesso, falha = 0, 0
    for conn in conexoes:
        plat = conn["plataforma"]
        cliente_id = conn["cliente_id"]

        try:
            # Refresh token se necessário
            token_ok = await _refresh_token_if_needed(sb, conn)
            if not token_ok:
                falha += 1
                continue

            # Puxar métricas
            pull_fn = _PULL_FUNCTIONS.get(plat)
            if not pull_fn:
                logger.warning(f"Plataforma {plat} sem pull function — ignorando")
                continue

            ok = await pull_fn(sb, conn)

            # Atualizar conexão
            sb.table("plataforma_conexoes").update({
                "ultima_sincronizacao": datetime.now(timezone.utc).isoformat(),
                "status": "ativo" if ok else conn["status"],
                "ultimo_erro": None if ok else "Pull falhou",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", conn["id"]).execute()

            if ok:
                sucesso += 1
            else:
                falha += 1

        except Exception as e:
            logger.error(f"Erro na ingestão {plat}/{cliente_id}: {e}")
            sb.table("plataforma_conexoes").update({
                "ultimo_erro": str(e)[:500],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", conn["id"]).execute()
            falha += 1

    logger.info(f"✅ Ingestão concluída — {sucesso} ok, {falha} falhas")
