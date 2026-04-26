"""
Serviço OAuth Meta (Facebook Login) → Instagram Business API.

Fluxo:
  1. /connect/{cliente_id} → redirect para dialog Facebook OAuth
  2. /callback → recebe code, troca por short-lived token
  3. Troca short-lived (1h) por long-lived (60 dias)
  4. Busca Facebook Pages do usuário
  5. Para cada Page, busca Instagram Business Account vinculado
  6. Salva conexão em instagram_conexoes
  7. Refresh job aos 50 dias (margem de segurança)

Documentação:
  https://developers.facebook.com/docs/instagram-api/getting-started
  https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
"""

import hashlib
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlencode

import httpx

logger = logging.getLogger("flg.meta_oauth")

GRAPH_API_BASE = "https://graph.facebook.com/v21.0"
FB_OAUTH_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth"

# Permissions necessárias para Instagram Business API insights
META_SCOPES = ",".join([
    "instagram_basic",
    "instagram_manage_insights",
    "pages_show_list",
    "pages_read_engagement",
    "business_management",
])


def _get_app_credentials() -> tuple[str, str]:
    """Retorna (app_id, app_secret) — falha se não configurado."""
    app_id = os.getenv("META_APP_ID", "")
    app_secret = os.getenv("META_APP_SECRET", "")
    if not app_id or not app_secret:
        raise RuntimeError(
            "META_APP_ID/META_APP_SECRET não configurados. "
            "Configure no .env do backend."
        )
    return app_id, app_secret


def _get_redirect_uri() -> str:
    return os.getenv(
        "META_REDIRECT_URI",
        "https://docs.foundersledgrowth.online/api/instagram/oauth/callback",
    )


def build_authorization_url(cliente_id: str, consultor_email: str) -> str:
    """
    Gera URL para iniciar OAuth Facebook Login.
    state encoda cliente_id + hash para validar no callback.
    """
    app_id, app_secret = _get_app_credentials()

    # State: cliente_id:hash (validado no callback)
    state_hash = hashlib.sha256(
        f"{cliente_id}:{consultor_email}:{app_secret[:8]}".encode()
    ).hexdigest()[:32]
    state = f"{cliente_id}:{state_hash}"

    params = {
        "client_id": app_id,
        "redirect_uri": _get_redirect_uri(),
        "scope": META_SCOPES,
        "response_type": "code",
        "state": state,
    }
    return f"{FB_OAUTH_DIALOG}?{urlencode(params)}"


def validate_state(state: str, expected_consultor_email: str) -> Optional[str]:
    """Valida o state e retorna cliente_id se OK, None se inválido."""
    if not state or ":" not in state:
        return None
    parts = state.split(":", 1)
    if len(parts) != 2:
        return None
    cliente_id, state_hash = parts

    _, app_secret = _get_app_credentials()
    expected_hash = hashlib.sha256(
        f"{cliente_id}:{expected_consultor_email}:{app_secret[:8]}".encode()
    ).hexdigest()[:32]

    return cliente_id if expected_hash == state_hash else None


async def exchange_code_for_token(code: str) -> dict:
    """
    Troca authorization code por short-lived access token (1h).
    Retorna dict com access_token, token_type, expires_in.
    """
    app_id, app_secret = _get_app_credentials()

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{GRAPH_API_BASE}/oauth/access_token",
            params={
                "client_id": app_id,
                "client_secret": app_secret,
                "redirect_uri": _get_redirect_uri(),
                "code": code,
            },
        )
        resp.raise_for_status()
        return resp.json()


async def exchange_for_long_lived(short_token: str) -> dict:
    """
    Troca short-lived token (1h) por long-lived (60 dias).
    Retorna dict com access_token, token_type, expires_in.
    """
    app_id, app_secret = _get_app_credentials()

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{GRAPH_API_BASE}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": app_id,
                "client_secret": app_secret,
                "fb_exchange_token": short_token,
            },
        )
        resp.raise_for_status()
        return resp.json()


async def refresh_long_lived_token(current_token: str) -> dict:
    """
    Refresh de long-lived token. Estende validade por mais 60 dias.
    Deve ser chamado antes da expiração (idealmente aos 50 dias).
    """
    return await exchange_for_long_lived(current_token)


async def get_user_pages(access_token: str) -> list[dict]:
    """
    Lista Facebook Pages do usuário. Cada Page pode ter um Instagram
    Business Account vinculado.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{GRAPH_API_BASE}/me/accounts",
            params={
                "access_token": access_token,
                "fields": "id,name,access_token,instagram_business_account",
            },
        )
        resp.raise_for_status()
        return resp.json().get("data", [])


async def get_instagram_account(page_id: str, page_access_token: str) -> Optional[dict]:
    """
    Busca o Instagram Business Account vinculado a uma Page.
    Retorna profile completo ou None se Page não tem IG vinculado.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        # Primeiro pega o IG account ID
        resp = await client.get(
            f"{GRAPH_API_BASE}/{page_id}",
            params={
                "fields": "instagram_business_account",
                "access_token": page_access_token,
            },
        )
        resp.raise_for_status()
        ig_link = resp.json().get("instagram_business_account")
        if not ig_link or "id" not in ig_link:
            return None
        ig_user_id = ig_link["id"]

        # Busca dados do perfil
        resp = await client.get(
            f"{GRAPH_API_BASE}/{ig_user_id}",
            params={
                "fields": "id,username,name,biography,profile_picture_url,"
                          "followers_count,follows_count,media_count,website",
                "access_token": page_access_token,
            },
        )
        resp.raise_for_status()
        profile = resp.json()
        profile["ig_user_id"] = ig_user_id
        profile["page_id"] = page_id
        profile["page_access_token"] = page_access_token
        return profile


async def discover_instagram_for_user(short_token: str) -> tuple[str, dict, list[dict]]:
    """
    Fluxo completo após receber o code:
      1. Troca por long-lived
      2. Busca Pages do usuário
      3. Para cada Page, busca IG Business Account
      4. Retorna (long_lived_token, primeiro_ig_profile, todas_pages)

    Se usuário tem múltiplas Pages com IG, frontend deve permitir escolher.
    Para MVP, pegamos a primeira encontrada.
    """
    # 1. Long-lived
    long_lived = await exchange_for_long_lived(short_token)
    long_token = long_lived["access_token"]
    expires_in = long_lived.get("expires_in", 60 * 24 * 3600)  # 60 dias default

    # 2. Pages
    pages = await get_user_pages(long_token)
    if not pages:
        raise RuntimeError(
            "Usuário não tem Facebook Pages. "
            "É preciso vincular uma Page para usar Instagram Business API."
        )

    # 3. Buscar IG em cada Page
    ig_options = []
    for page in pages:
        page_id = page["id"]
        page_token = page.get("access_token", long_token)
        try:
            ig_profile = await get_instagram_account(page_id, page_token)
            if ig_profile:
                ig_profile["page_name"] = page.get("name")
                ig_options.append(ig_profile)
        except Exception as e:
            logger.warning(f"Erro ao buscar IG da Page {page_id}: {e}")
            continue

    if not ig_options:
        raise RuntimeError(
            "Nenhum Instagram Business Account vinculado às Pages. "
            "Converta a conta para Business e vincule a uma Facebook Page."
        )

    return long_token, ig_options[0], ig_options


def calculate_token_expires_at(expires_in_seconds: int) -> datetime:
    """Calcula timestamp de expiração baseado em expires_in."""
    return datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds)


def calculate_next_refresh_at(token_expires_at: datetime) -> datetime:
    """
    Calcula quando refresh deve ser feito (10 dias antes da expiração).
    Default: token = 60 dias → refresh aos 50 dias.
    """
    return token_expires_at - timedelta(days=10)


# ─── Save & Update na DB ─────────────────────────────────────────────────────

def save_or_update_connection(
    sb,
    cliente_id: str,
    fb_user_id: str,
    ig_profile: dict,
    access_token: str,
    expires_at: datetime,
    consultor_email: str,
) -> dict:
    """
    Salva ou atualiza conexão Instagram para um cliente.
    Retorna o registro salvo.
    """
    payload = {
        "cliente_id": cliente_id,
        "fb_user_id": fb_user_id,
        "fb_page_id": ig_profile["page_id"],
        "ig_user_id": ig_profile["ig_user_id"],
        "username": ig_profile.get("username", ""),
        "access_token": access_token,
        "token_expires_at": expires_at.isoformat(),
        "scopes": META_SCOPES,
        "profile_picture_url": ig_profile.get("profile_picture_url"),
        "display_name": ig_profile.get("name"),
        "biography": ig_profile.get("biography"),
        "website": ig_profile.get("website"),
        "followers_count": ig_profile.get("followers_count", 0),
        "follows_count": ig_profile.get("follows_count", 0),
        "media_count": ig_profile.get("media_count", 0),
        "status": "ativo",
        "next_refresh_at": calculate_next_refresh_at(expires_at).isoformat(),
        "last_error": None,
        "conectado_por": consultor_email,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    result = sb.table("instagram_conexoes").upsert(
        payload, on_conflict="cliente_id"
    ).execute()
    return result.data[0] if result.data else payload
