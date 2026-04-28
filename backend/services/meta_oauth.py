"""
Serviço OAuth — Instagram Business Login (caminho atual desde abr/2026).

Fluxo:
  1. /connect/{cliente_id} → redirect para instagram.com/oauth/authorize
  2. /callback → recebe code, troca por short-lived token (1h)
  3. Troca short-lived por long-lived (60 dias) via graph.instagram.com
  4. Pega ig_user_id direto via /me (sem precisar passar por Pages do Facebook)
  5. Salva conexão em instagram_conexoes com auth_provider='ig_login'
  6. Refresh aos 50 dias estende validade por mais 60 dias

Referências:
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
  https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login

Histórico:
  Antes (até abr/2026) usávamos o caminho "Instagram API with Facebook Login"
  via facebook.com/dialog/oauth + escopos instagram_basic / instagram_manage_insights.
  Esses escopos foram desligados pela Meta em 27-jan-2025 e a Meta empurrou todo
  mundo pra esse caminho novo. Mantemos o nome do módulo como meta_oauth pra não
  quebrar imports, mas a implementação agora é Instagram Business Login.
"""

import hashlib
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlencode

import httpx

logger = logging.getLogger("flg.meta_oauth")

# Endpoints Instagram Business Login
IG_OAUTH_DIALOG = "https://www.instagram.com/oauth/authorize"
IG_TOKEN_EXCHANGE = "https://api.instagram.com/oauth/access_token"  # POST short-lived
IG_GRAPH = "https://graph.instagram.com"  # GET long-lived + refresh + dados

# Permissões pedidas no OAuth — somente leitura, nunca publicamos nem mandamos DM.
# https://developers.facebook.com/docs/permissions
#
# - instagram_business_basic: perfil, posts, reels, stories, contadores
# - instagram_business_manage_insights: reach, impressions, demografia, retention
# - instagram_business_manage_comments: TEXTO dos comentários (ler — não responder)
#   Pedido agora pra evitar reconexão futura quando UI de análise de comentários sair.
IG_SCOPES = ",".join([
    "instagram_business_basic",
    "instagram_business_manage_insights",
    "instagram_business_manage_comments",
])


def _get_app_credentials() -> tuple[str, str]:
    """Retorna (ig_app_id, ig_app_secret) — falha se não configurado."""
    app_id = os.getenv("IG_APP_ID", "")
    app_secret = os.getenv("IG_APP_SECRET", "")
    if not app_id or not app_secret:
        raise RuntimeError(
            "IG_APP_ID/IG_APP_SECRET não configurados. "
            "Pegue no painel Meta → produto 'Instagram API with Instagram Login' "
            "e configure no .env do backend."
        )
    return app_id, app_secret


def _get_redirect_uri() -> str:
    return os.getenv(
        "META_REDIRECT_URI",
        "https://docs.foundersledgrowth.online/api/instagram/oauth/callback",
    )


def build_authorization_url(cliente_id: str, consultor_email: str, onboard_token: str = "") -> str:
    """
    Gera URL para iniciar OAuth Instagram Business Login.
    state encoda cliente_id + hash para validar no callback.
    Se onboard_token != "", marca o state como self-onboard.
    """
    app_id, app_secret = _get_app_credentials()

    state_hash = hashlib.sha256(
        f"{cliente_id}:{consultor_email}:{app_secret[:8]}".encode()
    ).hexdigest()[:32]
    state = f"{cliente_id}:{state_hash}"
    if onboard_token:
        state = f"{state}:onboard:{onboard_token}"

    params = {
        "client_id": app_id,
        "redirect_uri": _get_redirect_uri(),
        "scope": IG_SCOPES,
        "response_type": "code",
        "state": state,
        "force_reauth": "true",
    }
    return f"{IG_OAUTH_DIALOG}?{urlencode(params)}"


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
    Endpoint: POST api.instagram.com/oauth/access_token (form-encoded).
    Retorna {access_token, user_id, permissions}.
    """
    app_id, app_secret = _get_app_credentials()

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            IG_TOKEN_EXCHANGE,
            data={
                "client_id": app_id,
                "client_secret": app_secret,
                "grant_type": "authorization_code",
                "redirect_uri": _get_redirect_uri(),
                "code": code,
            },
        )
        if resp.status_code != 200:
            logger.error(f"IG token exchange falhou {resp.status_code}: {resp.text[:300]}")
            resp.raise_for_status()
        return resp.json()


async def exchange_for_long_lived(short_token: str) -> dict:
    """
    Troca short-lived (1h) por long-lived (60d) — Instagram Business Login.
    Endpoint: GET graph.instagram.com/access_token (grant_type=ig_exchange_token).
    Retorna {access_token, token_type, expires_in}.
    """
    _, app_secret = _get_app_credentials()

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{IG_GRAPH}/access_token",
            params={
                "grant_type": "ig_exchange_token",
                "client_secret": app_secret,
                "access_token": short_token,
            },
        )
        if resp.status_code != 200:
            logger.error(f"IG long-lived exchange falhou {resp.status_code}: {resp.text[:300]}")
            resp.raise_for_status()
        return resp.json()


async def refresh_long_lived_token(current_token: str) -> dict:
    """
    Refresh long-lived token. Estende por mais 60 dias.
    Só funciona se o token tiver pelo menos 24h de idade.
    Endpoint: GET graph.instagram.com/refresh_access_token (grant_type=ig_refresh_token).
    """
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{IG_GRAPH}/refresh_access_token",
            params={
                "grant_type": "ig_refresh_token",
                "access_token": current_token,
            },
        )
        if resp.status_code != 200:
            logger.error(f"IG refresh falhou {resp.status_code}: {resp.text[:300]}")
            resp.raise_for_status()
        return resp.json()


async def fetch_ig_profile(access_token: str) -> dict:
    """
    Pega perfil do usuário logado — Instagram Business Login dispensa Pages.
    Retorna profile com ig_user_id (chave 'id' ou 'user_id').
    """
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{IG_GRAPH}/v21.0/me",
            params={
                "fields": "user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count,biography,website",
                "access_token": access_token,
            },
        )
        if resp.status_code != 200:
            logger.error(f"IG /me falhou {resp.status_code}: {resp.text[:300]}")
            resp.raise_for_status()
        data = resp.json()
        # Normaliza ig_user_id (api retorna user_id no IG Login, id no FB Login)
        ig_user_id = str(data.get("user_id") or data.get("id"))
        data["ig_user_id"] = ig_user_id
        return data


async def discover_instagram_for_user(short_token: str) -> tuple[str, dict, list[dict]]:
    """
    Fluxo simplificado pro Instagram Business Login:
      1. Troca short-lived por long-lived
      2. GET /me — retorna direto o perfil IG
      3. Retorna (long_token, ig_profile, [ig_profile])

    Mantém assinatura compatível com o fluxo anterior (que retornava
    múltiplas Pages) — agora sempre devolve uma lista de 1 item porque
    Instagram Login é por conta IG, não por Page.
    """
    long_lived = await exchange_for_long_lived(short_token)
    long_token = long_lived["access_token"]

    profile = await fetch_ig_profile(long_token)
    if not profile.get("ig_user_id"):
        raise RuntimeError(
            "Conta Instagram não retornou ig_user_id. "
            "Verifique se a conta é Business ou Creator (Personal não funciona com Insights)."
        )

    return long_token, profile, [profile]


def calculate_token_expires_at(expires_in_seconds: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds)


def calculate_next_refresh_at(token_expires_at: datetime) -> datetime:
    """Refresh aos 50 dias (10 dias de margem antes da expiração de 60 dias)."""
    return token_expires_at - timedelta(days=10)


# ─── Save & Update na DB ─────────────────────────────────────────────────────

def save_or_update_connection(
    sb,
    cliente_id: str,
    fb_user_id: str,           # mantido na assinatura por compat — não usado no IG Login
    ig_profile: dict,
    access_token: str,
    expires_at: datetime,
    consultor_email: str,
) -> dict:
    """
    Salva ou atualiza conexão Instagram pra um cliente.
    Marca auth_provider='ig_login' quando a coluna existir; se não existir
    (ex: migration ainda não rodou), tenta de novo sem essa chave pra que o
    callback OAuth NUNCA falhe pro cliente final por causa de schema desatualizado.
    """
    payload = {
        "cliente_id": cliente_id,
        "fb_user_id": fb_user_id or "",  # campo legado, vazio no IG Login
        "fb_page_id": "",                 # idem — não tem Page
        "ig_user_id": ig_profile["ig_user_id"],
        "username": ig_profile.get("username", ""),
        "access_token": access_token,
        "token_expires_at": expires_at.isoformat(),
        "scopes": IG_SCOPES,
        "profile_picture_url": ig_profile.get("profile_picture_url"),
        "display_name": ig_profile.get("name"),
        "biography": ig_profile.get("biography"),
        "website": ig_profile.get("website"),
        "followers_count": ig_profile.get("followers_count", 0),
        "follows_count": ig_profile.get("follows_count", 0),
        "media_count": ig_profile.get("media_count", 0),
        "status": "ativo",
        "auth_provider": "ig_login",
        "next_refresh_at": calculate_next_refresh_at(expires_at).isoformat(),
        "last_error": None,
        "conectado_por": consultor_email,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        result = sb.table("instagram_conexoes").upsert(
            payload, on_conflict="cliente_id"
        ).execute()
        return result.data[0] if result.data else payload
    except Exception as e:
        # Postgrest erro PGRST204: coluna não existe no schema cache.
        # Tenta de novo removendo as chaves "novas" que podem não existir
        # se a migration não rodou (ex: VPS sem IPv6 pro Postgres direct).
        msg = str(e)
        if "auth_provider" in msg or "PGRST204" in msg:
            logger.warning(
                f"upsert falhou ({msg[:200]}); tentando sem auth_provider"
            )
            payload.pop("auth_provider", None)
            result = sb.table("instagram_conexoes").upsert(
                payload, on_conflict="cliente_id"
            ).execute()
            return result.data[0] if result.data else payload
        raise
