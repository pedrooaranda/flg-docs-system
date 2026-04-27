"""
Sync engine — Instagram Business API → Supabase.

Para cada cliente conectado, popula:
  - instagram_followers_historico  (snapshot diário)
  - instagram_posts                (Feed/Reels/Stories + métricas)
  - instagram_metricas_diarias     (agregado por dia/tipo)
  - instagram_horarios_engagement  (heatmap dia × hora)

Estratégia:
  - Sync diário 04h00 via APScheduler (após token refresh às 03h00)
  - Trigger manual via POST /instagram/sync/{cliente_id}
  - Resync de posts dos últimos 7 dias (métricas continuam mudando)
  - Posts > 30 dias são marcados metricas_finalizadas=TRUE

Rate limits Meta Graph API v21.0:
  - 200 calls/hour por app por user
  - Estratégia: máx 50 posts por sync, com delay de 200ms entre calls
"""

import asyncio
import json
import logging
import os
from collections import defaultdict
from datetime import datetime, timezone, timedelta, date
from typing import Optional

import httpx

logger = logging.getLogger("flg.ig_sync")

GRAPH = "https://graph.facebook.com/v21.0"
HTTP_TIMEOUT = 20
INTER_CALL_DELAY = 0.2  # 200ms entre chamadas Graph API
DAYS_RESYNC_RECENT_POSTS = 7
DAYS_FINALIZE_POSTS = 30
MAX_POSTS_PER_SYNC = 50


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ENTRY POINT — CRON DIÁRIO
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def run_daily_sync_sync():
    """Wrapper síncrono para o APScheduler."""
    try:
        asyncio.get_event_loop().run_until_complete(_run_daily_sync())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_run_daily_sync())
        loop.close()


async def _run_daily_sync():
    """Sincroniza todas as conexões ativas."""
    from deps import supabase_client as sb

    logger.info("📊 Iniciando sync diário Instagram...")

    result = sb.table("instagram_conexoes").select("*").eq("status", "ativo").execute()
    conexoes = result.data or []
    if not conexoes:
        logger.info("Nenhuma conexão ativa para sync")
        return

    logger.info(f"Sincronizando {len(conexoes)} conexões")
    sucesso, falha = 0, 0

    for conn in conexoes:
        try:
            await sync_cliente(conn["cliente_id"])
            sucesso += 1
        except Exception as e:
            logger.error(f"❌ Sync falhou cliente={conn['cliente_id']}: {e}", exc_info=True)
            falha += 1

    logger.info(f"✅ Sync diário concluído — {sucesso} ok, {falha} falhas")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ORQUESTRADOR POR CLIENTE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def sync_cliente(cliente_id: str, sync_demographics: bool = False) -> dict:
    """
    Sincroniza um cliente específico.
    Retorna dict com contadores, duração e erros por etapa.
    """
    from deps import supabase_client as sb

    started_at = datetime.now(timezone.utc)

    conn_result = sb.table("instagram_conexoes").select("*").eq(
        "cliente_id", cliente_id
    ).eq("status", "ativo").maybe_single().execute()

    conn = conn_result.data if conn_result else None
    if not conn:
        raise RuntimeError(f"Cliente {cliente_id} não tem conexão Instagram ativa")

    ig_user_id = conn["ig_user_id"]
    access_token = conn["access_token"]
    username = conn.get("username", "?")

    logger.info(f"📊 Sync @{username} (cliente={cliente_id}, ig_user_id={ig_user_id})...")

    counters = {"followers": 0, "posts": 0, "metricas_diarias": 0, "horarios": 0, "demografia": 0}
    errors = []  # [{step, message}]

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        # 1. Snapshot followers + perfil
        try:
            profile = await _fetch_profile(client, ig_user_id, access_token)
            if profile:
                counters["followers"] = await _save_followers_snapshot(sb, cliente_id, profile)
                await _update_conexao_profile(sb, conn["id"], profile)
            else:
                errors.append({"step": "profile", "message": "Profile retornou vazio. Token pode não ter acesso à conta IG."})
        except Exception as e:
            errors.append({"step": "profile", "message": f"{type(e).__name__}: {str(e)[:200]}"})
            logger.error(f"Profile fetch erro: {e}", exc_info=True)

        # 2. Posts (FEED + REELS)
        try:
            counters["posts"] = await _sync_posts(sb, client, cliente_id, ig_user_id, access_token)
        except Exception as e:
            errors.append({"step": "posts", "message": f"{type(e).__name__}: {str(e)[:200]}"})
            logger.error(f"Posts sync erro: {e}", exc_info=True)

        # 3. Stories ativas (24h)
        try:
            counters["posts"] += await _sync_stories(sb, client, cliente_id, ig_user_id, access_token)
        except Exception as e:
            errors.append({"step": "stories", "message": f"{type(e).__name__}: {str(e)[:200]}"})

        # 4. Agregados locais
        try:
            counters["metricas_diarias"] = _aggregate_daily_metrics(sb, cliente_id)
            counters["horarios"] = _aggregate_horarios(sb, cliente_id)
        except Exception as e:
            errors.append({"step": "aggregate", "message": f"{type(e).__name__}: {str(e)[:200]}"})

        # 5. Demografia (semanal ou explícito)
        if sync_demographics or _is_weekly_sync_day():
            try:
                counters["demografia"] = await _sync_demographics(sb, client, cliente_id, ig_user_id, access_token)
            except Exception as e:
                errors.append({"step": "demografia", "message": f"{type(e).__name__}: {str(e)[:200]}"})

    duration_ms = int((datetime.now(timezone.utc) - started_at).total_seconds() * 1000)

    # Estado: tudo ok / parcial / total. Usado pra log e pro last_error.
    total_steps = sum(counters.values())
    if not errors:
        status_kind = "ok"
        last_error_value = None
    elif total_steps == 0:
        status_kind = "failed"
        last_error_value = json.dumps({"errors": errors, "at": datetime.now(timezone.utc).isoformat()})
    else:
        status_kind = "partial"
        last_error_value = json.dumps({"errors": errors, "at": datetime.now(timezone.utc).isoformat()})

    sb.table("instagram_conexoes").update({
        "last_sync_at": datetime.now(timezone.utc).isoformat(),
        "last_sync_duration_ms": duration_ms,
        "last_error": last_error_value,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", conn["id"]).execute()

    summary = (
        f"posts={counters['posts']}, métricas={counters['metricas_diarias']}, "
        f"horários={counters['horarios']}, demografia={counters['demografia']}, {duration_ms}ms"
    )
    if status_kind == "ok":
        logger.info(f"✅ Sync @{username} ok — {summary}")
    elif status_kind == "partial":
        steps_failed = ", ".join(e["step"] for e in errors)
        logger.warning(f"⚠️ Sync @{username} parcial ({steps_failed}) — {summary}")
    else:
        steps_failed = ", ".join(e["step"] for e in errors)
        logger.error(f"❌ Sync @{username} falhou ({steps_failed}) — {summary}")

    return {
        **counters,
        "duration_ms": duration_ms,
        "username": username,
        "status": status_kind,
        "errors": errors,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. PROFILE + FOLLOWERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def _fetch_profile(client: httpx.AsyncClient, ig_user_id: str, token: str) -> Optional[dict]:
    fields = "id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count"
    resp = await client.get(
        f"{GRAPH}/{ig_user_id}",
        params={"fields": fields, "access_token": token},
    )
    await asyncio.sleep(INTER_CALL_DELAY)
    if resp.status_code != 200:
        logger.warning(f"Profile fetch falhou {resp.status_code}: {resp.text[:200]}")
        return None
    return resp.json()


async def _save_followers_snapshot(sb, cliente_id: str, profile: dict) -> int:
    today = date.today().isoformat()
    followers_count = profile.get("followers_count", 0)
    follows_count = profile.get("follows_count", 0)
    media_count = profile.get("media_count", 0)

    yesterday_result = sb.table("instagram_followers_historico").select(
        "followers_count,follows_count,media_count"
    ).eq("cliente_id", cliente_id).order("data", desc=True).limit(1).execute()

    delta_followers = delta_follows = delta_media = None
    if yesterday_result.data:
        prev = yesterday_result.data[0]
        delta_followers = followers_count - (prev.get("followers_count") or 0)
        delta_follows = follows_count - (prev.get("follows_count") or 0)
        delta_media = media_count - (prev.get("media_count") or 0)

    sb.table("instagram_followers_historico").upsert({
        "cliente_id": cliente_id,
        "data": today,
        "followers_count": followers_count,
        "follows_count": follows_count,
        "media_count": media_count,
        "delta_followers": delta_followers,
        "delta_follows": delta_follows,
        "delta_media": delta_media,
    }, on_conflict="cliente_id,data").execute()
    return 1


async def _update_conexao_profile(sb, conn_id: str, profile: dict):
    sb.table("instagram_conexoes").update({
        "username": profile.get("username"),
        "display_name": profile.get("name"),
        "biography": profile.get("biography"),
        "website": profile.get("website"),
        "profile_picture_url": profile.get("profile_picture_url"),
        "followers_count": profile.get("followers_count"),
        "follows_count": profile.get("follows_count"),
        "media_count": profile.get("media_count"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", conn_id).execute()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. POSTS (FEED + REELS)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def _sync_posts(sb, client: httpx.AsyncClient, cliente_id: str, ig_user_id: str, token: str) -> int:
    fields = (
        "id,media_type,media_product_type,caption,permalink,media_url,thumbnail_url,"
        "timestamp,like_count,comments_count"
    )
    resp = await client.get(
        f"{GRAPH}/{ig_user_id}/media",
        params={"fields": fields, "limit": MAX_POSTS_PER_SYNC, "access_token": token},
    )
    await asyncio.sleep(INTER_CALL_DELAY)
    if resp.status_code != 200:
        logger.warning(f"Posts fetch falhou {resp.status_code}: {resp.text[:200]}")
        return 0

    media_items = resp.json().get("data", [])
    synced = 0

    cutoff_resync = datetime.now(timezone.utc) - timedelta(days=DAYS_RESYNC_RECENT_POSTS)
    cutoff_finalize = datetime.now(timezone.utc) - timedelta(days=DAYS_FINALIZE_POSTS)

    for item in media_items:
        media_id = item["id"]
        posted_at = _parse_ts(item.get("timestamp"))
        if not posted_at:
            continue

        existing = sb.table("instagram_posts").select(
            "id,metricas_finalizadas,ultima_atualizacao_metricas"
        ).eq("ig_media_id", media_id).maybe_single().execute()

        existing_data = existing.data if existing else None

        if existing_data and existing_data.get("metricas_finalizadas"):
            continue

        skip_resync = False
        if existing_data and posted_at < cutoff_resync:
            last_update = _parse_ts(existing_data.get("ultima_atualizacao_metricas"))
            if last_update and (datetime.now(timezone.utc) - last_update).days < 1:
                skip_resync = True

        if skip_resync:
            continue

        insights = await _fetch_post_insights(client, media_id, item.get("media_product_type", "FEED"), token)

        row = _build_post_row(cliente_id, item, insights, posted_at, cutoff_finalize)

        sb.table("instagram_posts").upsert(row, on_conflict="ig_media_id").execute()
        synced += 1

    return synced


async def _fetch_post_insights(client: httpx.AsyncClient, media_id: str, media_product_type: str, token: str) -> dict:
    if media_product_type == "REELS":
        metrics = "reach,saved,shares,total_interactions,plays,ig_reels_video_view_total_time,ig_reels_avg_watch_time,likes,comments"
    elif media_product_type == "STORY":
        metrics = "reach,impressions,exits,replies,taps_forward,taps_back,shares"
    else:
        metrics = "reach,impressions,saved,shares,total_interactions,profile_visits,follows,likes,comments"

    resp = await client.get(
        f"{GRAPH}/{media_id}/insights",
        params={"metric": metrics, "access_token": token},
    )
    await asyncio.sleep(INTER_CALL_DELAY)
    if resp.status_code != 200:
        logger.debug(f"Insights {media_id} falhou {resp.status_code}: {resp.text[:200]}")
        return {}

    raw = resp.json().get("data", [])
    out = {}
    for entry in raw:
        name = entry.get("name")
        values = entry.get("values", [])
        out[name] = values[0].get("value") if values else None
    return out


def _build_post_row(cliente_id: str, item: dict, insights: dict, posted_at: datetime, cutoff_finalize: datetime) -> dict:
    likes = item.get("like_count", 0) or insights.get("likes", 0) or 0
    comments = item.get("comments_count", 0) or insights.get("comments", 0) or 0
    saved = insights.get("saved", 0) or 0
    shares = insights.get("shares", 0) or 0
    reach = insights.get("reach", 0) or 0

    engagement_rate = None
    if reach > 0:
        engagement_rate = round((likes + comments + saved + shares) / reach * 100, 3)

    impressions = insights.get("impressions", 0) or 0
    exits = insights.get("exits", 0) or 0
    retention_rate = None
    if impressions > 0 and exits is not None:
        retention_rate = round(max(0.0, 1 - exits / impressions) * 100, 3)

    media_product_type = item.get("media_product_type", "FEED")
    media_type = item.get("media_type")

    finalizadas = posted_at < cutoff_finalize and media_product_type != "STORY"

    story_expires_at = None
    if media_product_type == "STORY":
        story_expires_at = (posted_at + timedelta(hours=24)).isoformat()

    return {
        "cliente_id": cliente_id,
        "ig_media_id": item["id"],
        "media_product_type": media_product_type,
        "media_type": media_type,
        "is_carousel": media_type == "CAROUSEL_ALBUM",
        "caption": item.get("caption"),
        "permalink": item.get("permalink"),
        "media_url": item.get("media_url"),
        "thumbnail_url": item.get("thumbnail_url"),
        "posted_at": posted_at.isoformat(),
        "story_expires_at": story_expires_at,
        "reach": reach,
        "impressions": impressions,
        "saved": saved,
        "shares": shares,
        "total_interactions": insights.get("total_interactions", 0) or 0,
        "likes": likes,
        "comments": comments,
        "profile_visits": insights.get("profile_visits", 0) or 0,
        "follows": insights.get("follows", 0) or 0,
        "plays": insights.get("plays", 0) or 0,
        "ig_reels_video_view_total_time": insights.get("ig_reels_video_view_total_time"),
        "ig_reels_avg_watch_time": insights.get("ig_reels_avg_watch_time"),
        "exits": exits,
        "replies": insights.get("replies", 0) or 0,
        "taps_forward": insights.get("taps_forward", 0) or 0,
        "taps_back": insights.get("taps_back", 0) or 0,
        "engagement_rate": engagement_rate,
        "retention_rate": retention_rate,
        "ultima_atualizacao_metricas": datetime.now(timezone.utc).isoformat(),
        "metricas_finalizadas": finalizadas,
        "raw_insights": insights,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. STORIES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def _sync_stories(sb, client: httpx.AsyncClient, cliente_id: str, ig_user_id: str, token: str) -> int:
    resp = await client.get(
        f"{GRAPH}/{ig_user_id}/stories",
        params={
            "fields": "id,media_type,media_product_type,caption,permalink,media_url,thumbnail_url,timestamp",
            "access_token": token,
        },
    )
    await asyncio.sleep(INTER_CALL_DELAY)
    if resp.status_code != 200:
        logger.debug(f"Stories fetch falhou {resp.status_code}: {resp.text[:200]}")
        return 0

    items = resp.json().get("data", [])
    cutoff_finalize = datetime.now(timezone.utc) - timedelta(days=DAYS_FINALIZE_POSTS)
    synced = 0
    for item in items:
        item["media_product_type"] = "STORY"
        posted_at = _parse_ts(item.get("timestamp"))
        if not posted_at:
            continue
        insights = await _fetch_post_insights(client, item["id"], "STORY", token)
        row = _build_post_row(cliente_id, item, insights, posted_at, cutoff_finalize)
        sb.table("instagram_posts").upsert(row, on_conflict="ig_media_id").execute()
        synced += 1
    return synced


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. AGREGADO DIÁRIO
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _aggregate_daily_metrics(sb, cliente_id: str) -> int:
    """Agrega instagram_posts em instagram_metricas_diarias (últimos 90 dias)."""
    cutoff = (date.today() - timedelta(days=90)).isoformat()
    posts_result = sb.table("instagram_posts").select("*").eq(
        "cliente_id", cliente_id
    ).gte("posted_at", cutoff).execute()
    posts = posts_result.data or []

    by_day_type = defaultdict(lambda: {
        "posts": 0, "likes": 0, "comments": 0, "saves": 0, "shares": 0,
        "reach": 0, "impressions": 0, "plays": 0, "watch_time": 0,
        "profile_visits": 0, "follows": 0, "exits": 0, "replies": 0,
        "taps_forward": 0, "taps_back": 0, "engagement_sum": 0.0,
        "retention_sum": 0.0, "best_eng": 0.0, "best_post_id": None,
    })

    for p in posts:
        posted_at = _parse_ts(p.get("posted_at"))
        if not posted_at:
            continue
        d = posted_at.date().isoformat()
        tipo = p.get("media_product_type") or "FEED"
        for key in (tipo, "ALL"):
            slot = by_day_type[(d, key)]
            slot["posts"] += 1
            slot["likes"] += p.get("likes") or 0
            slot["comments"] += p.get("comments") or 0
            slot["saves"] += p.get("saved") or 0
            slot["shares"] += p.get("shares") or 0
            slot["reach"] += p.get("reach") or 0
            slot["impressions"] += p.get("impressions") or 0
            slot["plays"] += p.get("plays") or 0
            slot["watch_time"] += p.get("ig_reels_video_view_total_time") or 0
            slot["profile_visits"] += p.get("profile_visits") or 0
            slot["follows"] += p.get("follows") or 0
            slot["exits"] += p.get("exits") or 0
            slot["replies"] += p.get("replies") or 0
            slot["taps_forward"] += p.get("taps_forward") or 0
            slot["taps_back"] += p.get("taps_back") or 0
            er = float(p.get("engagement_rate") or 0)
            rr = float(p.get("retention_rate") or 0)
            slot["engagement_sum"] += er
            slot["retention_sum"] += rr
            if er > slot["best_eng"]:
                slot["best_eng"] = er
                slot["best_post_id"] = p.get("id")

    rows = []
    for (d, tipo), s in by_day_type.items():
        avg_eng = round(s["engagement_sum"] / s["posts"], 3) if s["posts"] else 0
        avg_ret = round(s["retention_sum"] / s["posts"], 3) if s["posts"] else 0
        avg_reach = int(s["reach"] / s["posts"]) if s["posts"] else 0
        avg_watch = round(s["watch_time"] / max(s["plays"], 1) / 1000, 2) if s["plays"] else 0
        rows.append({
            "cliente_id": cliente_id,
            "data": d,
            "media_product_type": tipo,
            "posts_publicados": s["posts"],
            "total_likes": s["likes"],
            "total_comments": s["comments"],
            "total_saves": s["saves"],
            "total_shares": s["shares"],
            "total_reach": s["reach"],
            "total_impressions": s["impressions"],
            "total_plays": s["plays"],
            "total_watch_time_ms": s["watch_time"],
            "total_profile_visits": s["profile_visits"],
            "total_follows": s["follows"],
            "total_exits": s["exits"],
            "total_replies": s["replies"],
            "total_taps_forward": s["taps_forward"],
            "total_taps_back": s["taps_back"],
            "avg_engagement_rate": avg_eng,
            "avg_reach_per_post": avg_reach,
            "avg_watch_time_seconds": avg_watch,
            "avg_retention_rate": avg_ret,
            "best_post_id": s["best_post_id"],
            "best_post_engagement": s["best_eng"],
            "ultima_atualizacao": datetime.now(timezone.utc).isoformat(),
        })

    if rows:
        sb.table("instagram_metricas_diarias").upsert(
            rows, on_conflict="cliente_id,data,media_product_type"
        ).execute()
    return len(rows)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 5. HEATMAP DIA × HORA
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _aggregate_horarios(sb, cliente_id: str) -> int:
    posts_result = sb.table("instagram_posts").select(
        "posted_at,media_product_type,engagement_rate,reach"
    ).eq("cliente_id", cliente_id).execute()
    posts = posts_result.data or []

    bucket = defaultdict(lambda: {"engagement_sum": 0.0, "reach_sum": 0, "count": 0})
    for p in posts:
        posted_at = _parse_ts(p.get("posted_at"))
        if not posted_at:
            continue
        local = posted_at.astimezone()
        dia = (local.weekday() + 1) % 7  # 0=domingo
        hora = local.hour
        tipo = p.get("media_product_type") or "FEED"
        b = bucket[(tipo, dia, hora)]
        b["engagement_sum"] += float(p.get("engagement_rate") or 0)
        b["reach_sum"] += int(p.get("reach") or 0)
        b["count"] += 1

    rows = []
    for (tipo, dia, hora), b in bucket.items():
        if b["count"] == 0:
            continue
        rows.append({
            "cliente_id": cliente_id,
            "media_product_type": tipo,
            "dia_semana": dia,
            "faixa_horaria": hora,
            "taxa_engajamento_media": round(b["engagement_sum"] / b["count"], 2),
            "total_posts": b["count"],
            "total_reach": b["reach_sum"],
            "ultima_atualizacao": datetime.now(timezone.utc).isoformat(),
        })

    if rows:
        sb.table("instagram_horarios_engagement").upsert(
            rows, on_conflict="cliente_id,media_product_type,dia_semana,faixa_horaria"
        ).execute()
    return len(rows)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 6. DEMOGRAFIA (follower_demographics + engaged_audience_demographics)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DEMO_BREAKDOWNS = ["age", "gender", "country", "city"]


def _is_weekly_sync_day() -> bool:
    """Roda demografia toda segunda-feira (UTC)."""
    return datetime.now(timezone.utc).weekday() == 0


async def _sync_demographics(sb, client: httpx.AsyncClient, cliente_id: str, ig_user_id: str, token: str) -> int:
    """
    Puxa follower_demographics e engaged_audience_demographics.
    Cada combinação metric+breakdown é uma chamada.
    Salva em instagram_demografia (1 linha por tipo).
    """
    today = date.today().isoformat()
    saved = 0

    for tipo in ("follower_demographics", "engaged_audience_demographics"):
        agg = {"genero_idade": {}, "paises": [], "cidades": [], "locales": [], "total_count": 0}
        api_message = None

        for breakdown in DEMO_BREAKDOWNS:
            try:
                resp = await client.get(
                    f"{GRAPH}/{ig_user_id}/insights",
                    params={
                        "metric": tipo,
                        "period": "lifetime",
                        "metric_type": "total_value",
                        "breakdown": breakdown,
                        "access_token": token,
                    },
                )
                await asyncio.sleep(INTER_CALL_DELAY)

                if resp.status_code != 200:
                    api_message = f"{breakdown}: HTTP {resp.status_code} {resp.text[:160]}"
                    logger.debug(f"Demografia {tipo}/{breakdown} falhou: {api_message}")
                    continue

                data = resp.json().get("data", [])
                if not data:
                    continue

                total_value = data[0].get("total_value", {})
                breakdowns_arr = total_value.get("breakdowns", [])
                if not breakdowns_arr:
                    continue

                results = breakdowns_arr[0].get("results", [])
                _merge_breakdown(agg, breakdown, results)
            except Exception as e:
                logger.warning(f"Demografia erro {tipo}/{breakdown}: {e}")
                api_message = str(e)[:300]

        # Sortear top N
        agg["paises"] = _top_n(agg["paises"], 20)
        agg["cidades"] = _top_n(agg["cidades"], 30)
        agg["locales"] = _top_n(agg["locales"], 10)

        tipo_curto = "follower" if tipo == "follower_demographics" else "engaged_audience"
        sb.table("instagram_demografia").upsert({
            "cliente_id": cliente_id,
            "data_referencia": today,
            "tipo": tipo_curto,
            "genero_idade": agg["genero_idade"],
            "paises": agg["paises"],
            "cidades": agg["cidades"],
            "locales": agg["locales"],
            "total_count": agg["total_count"],
            "api_message": api_message,
        }, on_conflict="cliente_id,data_referencia,tipo").execute()
        saved += 1

    return saved


def _merge_breakdown(agg: dict, breakdown: str, results: list):
    """Distribui resultado da API no shape do nosso DB."""
    if breakdown == "age":
        # results: [{ "dimension_values": ["18-24"], "value": 1234 }]
        # Idade sozinha vira keys "*.18-24"; depois age+gender preenche genero
        for r in results:
            age = r.get("dimension_values", [""])[0]
            val = int(r.get("value") or 0)
            key = f"U.{age}"
            agg["genero_idade"][key] = agg["genero_idade"].get(key, 0) + val
    elif breakdown == "gender":
        for r in results:
            g = r.get("dimension_values", [""])[0]  # F | M | U
            val = int(r.get("value") or 0)
            agg["total_count"] += val
            # Atualiza prefixo "F.*" → "F.18-24" (se já tiver age) — simplificação:
            # se houver dados age separados, vamos manter ambos como agregados independentes.
            agg["genero_idade"][g] = agg["genero_idade"].get(g, 0) + val
    elif breakdown == "country":
        for r in results:
            country = r.get("dimension_values", [""])[0]
            val = int(r.get("value") or 0)
            agg["paises"].append({"key": country, "value": val})
    elif breakdown == "city":
        for r in results:
            city = r.get("dimension_values", [""])[0]
            val = int(r.get("value") or 0)
            agg["cidades"].append({"key": city, "value": val})


def _top_n(items: list, n: int) -> list:
    """Ordena por value desc e pega top N."""
    return sorted(items, key=lambda x: x.get("value", 0), reverse=True)[:n]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Helpers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _parse_ts(s) -> Optional[datetime]:
    if not s:
        return None
    if isinstance(s, datetime):
        return s if s.tzinfo else s.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None
