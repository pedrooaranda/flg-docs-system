"""
Rotas de gerenciamento de conexões — FLG Jornada System.

CRUD de conexões + OAuth callbacks por plataforma.

Endpoints:
  GET    /conexoes/{cliente_id}                  — listar conexões do cliente
  GET    /conexoes/{cliente_id}/{plataforma}      — status de uma conexão
  POST   /conexoes/{cliente_id}/{plataforma}/connect — iniciar OAuth (retorna URL)
  GET    /conexoes/callback/{plataforma}          — callback OAuth (redireciona)
  DELETE /conexoes/{cliente_id}/{plataforma}       — desconectar plataforma
  POST   /conexoes/{cliente_id}/{plataforma}/sync  — forçar sincronização agora
"""

import os
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_current_user, supabase_client

router = APIRouter(prefix="/conexoes", tags=["conexoes"])
_supabase = supabase_client

VALID_PLATFORMS = ("instagram", "linkedin", "youtube", "tiktok")

# ─── OAuth config por plataforma ──────────────────────────────────────────────
# Preenchido quando as credenciais forem configuradas no .env

OAUTH_CONFIG = {
    "instagram": {
        "auth_url": "https://www.facebook.com/v19.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v19.0/oauth/access_token",
        "scopes": "instagram_basic,instagram_manage_insights,pages_read_engagement,pages_show_list",
        "client_id_env": "META_APP_ID",
        "client_secret_env": "META_APP_SECRET",
    },
    "linkedin": {
        "auth_url": "https://www.linkedin.com/oauth/v2/authorization",
        "token_url": "https://www.linkedin.com/oauth/v2/accessToken",
        "scopes": "openid profile r_organization_social rw_organization_admin",
        "client_id_env": "LINKEDIN_CLIENT_ID",
        "client_secret_env": "LINKEDIN_CLIENT_SECRET",
    },
    "youtube": {
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scopes": "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
        "client_id_env": "GOOGLE_CLIENT_ID",
        "client_secret_env": "GOOGLE_CLIENT_SECRET",
    },
    "tiktok": {
        "auth_url": "https://www.tiktok.com/v2/auth/authorize/",
        "token_url": "https://open.tiktokapis.com/v2/oauth/token/",
        "scopes": "user.info.basic,user.info.stats,video.list",
        "client_id_env": "TIKTOK_CLIENT_KEY",
        "client_secret_env": "TIKTOK_CLIENT_SECRET",
    },
}

BASE_URL = os.getenv("APP_BASE_URL", "https://docs.foundersledgrowth.online")


def _validate_platform(plataforma: str):
    if plataforma not in VALID_PLATFORMS:
        raise HTTPException(400, f"Plataforma inválida. Use: {', '.join(VALID_PLATFORMS)}")


def _get_oauth_creds(plataforma: str):
    """Retorna (client_id, client_secret) ou None se não configurado."""
    cfg = OAUTH_CONFIG.get(plataforma)
    if not cfg:
        return None, None
    client_id = os.getenv(cfg["client_id_env"])
    client_secret = os.getenv(cfg["client_secret_env"])
    return client_id, client_secret


# ─── Listar conexões de um cliente ────────────────────────────────────────────

@router.get("/{cliente_id}")
async def list_conexoes(cliente_id: str, user=Depends(get_current_user)):
    """Retorna todas as conexões do cliente com status de cada plataforma."""
    result = _supabase.table("plataforma_conexoes").select(
        "id, cliente_id, plataforma, status, platform_username, "
        "platform_display_name, ultima_sincronizacao, ultimo_erro, created_at"
    ).eq("cliente_id", cliente_id).execute()

    # Montar mapa completo — incluir plataformas não conectadas
    conexoes_map = {c["plataforma"]: c for c in (result.data or [])}
    todas = []
    for plat in VALID_PLATFORMS:
        client_id, _ = _get_oauth_creds(plat)
        if plat in conexoes_map:
            c = conexoes_map[plat]
            c["oauth_configurado"] = bool(client_id)
            todas.append(c)
        else:
            todas.append({
                "plataforma": plat,
                "status": "nao_conectado",
                "oauth_configurado": bool(client_id),
                "platform_username": None,
                "platform_display_name": None,
                "ultima_sincronizacao": None,
            })

    return {"cliente_id": cliente_id, "conexoes": todas}


# ─── Status de uma conexão específica ─────────────────────────────────────────

@router.get("/{cliente_id}/{plataforma}")
async def get_conexao(cliente_id: str, plataforma: str, user=Depends(get_current_user)):
    _validate_platform(plataforma)
    result = _supabase.table("plataforma_conexoes").select("*").eq(
        "cliente_id", cliente_id
    ).eq("plataforma", plataforma).execute()

    if not result.data:
        client_id, _ = _get_oauth_creds(plataforma)
        return {
            "plataforma": plataforma,
            "status": "nao_conectado",
            "oauth_configurado": bool(client_id),
        }

    conn = result.data[0]
    # Nunca expor tokens no frontend
    conn.pop("access_token", None)
    conn.pop("refresh_token", None)
    client_id, _ = _get_oauth_creds(plataforma)
    conn["oauth_configurado"] = bool(client_id)
    return conn


# ─── Iniciar OAuth — retorna URL de autorização ──────────────────────────────

@router.post("/{cliente_id}/{plataforma}/connect")
async def connect_platform(cliente_id: str, plataforma: str, user=Depends(get_current_user)):
    _validate_platform(plataforma)

    client_id, client_secret = _get_oauth_creds(plataforma)
    if not client_id:
        raise HTTPException(
            400,
            f"OAuth para {plataforma} não configurado. "
            f"Configure {OAUTH_CONFIG[plataforma]['client_id_env']} e "
            f"{OAUTH_CONFIG[plataforma]['client_secret_env']} no .env do backend."
        )

    cfg = OAUTH_CONFIG[plataforma]
    callback_url = f"{BASE_URL}/api/conexoes/callback/{plataforma}"

    # State encoda cliente_id + email do consultor (validado no callback)
    import hashlib
    state = hashlib.sha256(f"{cliente_id}:{user.email}:{client_secret[:8]}".encode()).hexdigest()[:32]

    # Salvar state temporariamente na conexão
    _supabase.table("plataforma_conexoes").upsert({
        "cliente_id": cliente_id,
        "plataforma": plataforma,
        "status": "pendente",
        "conectado_por": user.email,
        "extra_data": {"oauth_state": state},
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="cliente_id,plataforma").execute()

    # Montar URL de autorização
    params = {
        "client_id": client_id,
        "redirect_uri": callback_url,
        "response_type": "code",
        "state": f"{cliente_id}:{state}",
    }

    if plataforma == "instagram":
        params["scope"] = cfg["scopes"]
        params["config_id"] = os.getenv("META_CONFIG_ID", "")
    elif plataforma == "linkedin":
        params["scope"] = cfg["scopes"]
    elif plataforma == "youtube":
        params["scope"] = cfg["scopes"]
        params["access_type"] = "offline"
        params["prompt"] = "consent"
    elif plataforma == "tiktok":
        params["scope"] = cfg["scopes"]
        params["client_key"] = client_id
        del params["client_id"]

    auth_url = f"{cfg['auth_url']}?{urlencode(params)}"
    return {"auth_url": auth_url, "plataforma": plataforma}


# ─── Callback OAuth ──────────────────────────────────────────────────────────

@router.get("/callback/{plataforma}")
async def oauth_callback(plataforma: str, code: str = "", state: str = "", error: str = ""):
    """
    Callback chamado pela plataforma após autorização.
    Troca o code por access_token e salva na conexão.
    """
    from fastapi.responses import RedirectResponse

    _validate_platform(plataforma)

    if error:
        return RedirectResponse(
            f"{BASE_URL}/metricas?error={plataforma}_auth_failed&detail={error}"
        )

    if not code or not state:
        return RedirectResponse(f"{BASE_URL}/metricas?error=missing_params")

    # Parse state → cliente_id:hash
    parts = state.split(":", 1)
    if len(parts) != 2:
        return RedirectResponse(f"{BASE_URL}/metricas?error=invalid_state")

    cliente_id, state_hash = parts

    # Verificar state na conexão
    conn_result = _supabase.table("plataforma_conexoes").select("*").eq(
        "cliente_id", cliente_id
    ).eq("plataforma", plataforma).execute()

    if not conn_result.data:
        return RedirectResponse(f"{BASE_URL}/metricas?error=connection_not_found")

    conn = conn_result.data[0]
    stored_state = (conn.get("extra_data") or {}).get("oauth_state")
    if stored_state != state_hash:
        return RedirectResponse(f"{BASE_URL}/metricas?error=state_mismatch")

    # Trocar code por token
    client_id, client_secret = _get_oauth_creds(plataforma)
    cfg = OAUTH_CONFIG[plataforma]
    callback_url = f"{BASE_URL}/api/conexoes/callback/{plataforma}"

    import httpx
    try:
        async with httpx.AsyncClient() as client:
            token_data = {
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": callback_url,
                "grant_type": "authorization_code",
            }

            # TikTok usa client_key em vez de client_id
            if plataforma == "tiktok":
                token_data["client_key"] = client_id
                del token_data["client_id"]

            resp = await client.post(cfg["token_url"], data=token_data)
            resp.raise_for_status()
            tokens = resp.json()

    except Exception as e:
        _supabase.table("plataforma_conexoes").update({
            "status": "erro",
            "ultimo_erro": f"Token exchange falhou: {str(e)[:300]}",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", conn["id"]).execute()
        return RedirectResponse(f"{BASE_URL}/metricas?error=token_exchange_failed")

    # Extrair tokens (cada plataforma retorna em formato diferente)
    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in")

    expires_at = None
    if expires_in:
        expires_at = (datetime.now(timezone.utc) + __import__("datetime").timedelta(seconds=int(expires_in))).isoformat()

    # Salvar tokens
    _supabase.table("plataforma_conexoes").update({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_expires_at": expires_at,
        "status": "ativo",
        "ultimo_erro": None,
        "scopes": cfg.get("scopes", ""),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", conn["id"]).execute()

    return RedirectResponse(f"{BASE_URL}/metricas?connected={plataforma}")


# ─── Desconectar ──────────────────────────────────────────────────────────────

@router.delete("/{cliente_id}/{plataforma}")
async def disconnect_platform(cliente_id: str, plataforma: str, user=Depends(get_current_user)):
    _validate_platform(plataforma)

    _supabase.table("plataforma_conexoes").update({
        "status": "desconectado",
        "access_token": None,
        "refresh_token": None,
        "token_expires_at": None,
        "ultimo_erro": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("cliente_id", cliente_id).eq("plataforma", plataforma).execute()

    return {"ok": True, "plataforma": plataforma}


# ─── Forçar sincronização ─────────────────────────────────────────────────────

@router.post("/{cliente_id}/{plataforma}/sync")
async def force_sync(cliente_id: str, plataforma: str, user=Depends(get_current_user)):
    """Força uma sincronização imediata para esta conexão."""
    _validate_platform(plataforma)

    conn_result = _supabase.table("plataforma_conexoes").select("*").eq(
        "cliente_id", cliente_id
    ).eq("plataforma", plataforma).eq("status", "ativo").execute()

    if not conn_result.data:
        raise HTTPException(404, f"{plataforma} não está conectado para este cliente")

    from services.ingestion import _PULL_FUNCTIONS
    pull_fn = _PULL_FUNCTIONS.get(plataforma)
    if not pull_fn:
        raise HTTPException(501, f"Pull para {plataforma} não implementado ainda")

    conn = conn_result.data[0]
    try:
        ok = await pull_fn(_supabase, conn)
        if ok:
            _supabase.table("plataforma_conexoes").update({
                "ultima_sincronizacao": datetime.now(timezone.utc).isoformat(),
                "ultimo_erro": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", conn["id"]).execute()
        return {"ok": ok, "plataforma": plataforma}
    except Exception as e:
        raise HTTPException(500, f"Erro na sincronização: {e}")
