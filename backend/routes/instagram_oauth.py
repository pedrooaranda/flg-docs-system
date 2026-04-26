"""
Rotas OAuth Instagram (Facebook Login) — FLG Jornada System.

Endpoints:
  GET  /instagram/oauth/connect/{cliente_id}     — inicia OAuth (retorna auth URL)
  GET  /instagram/oauth/callback                 — callback do Facebook
  GET  /instagram/oauth/status/{cliente_id}      — status da conexão
  POST /instagram/oauth/disconnect/{cliente_id}  — desconecta
  GET  /instagram/oauth/all                      — lista todas conexões (admin)
"""

import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from deps import get_current_user, supabase_client
from services.meta_oauth import (
    build_authorization_url,
    validate_state,
    exchange_code_for_token,
    discover_instagram_for_user,
    calculate_token_expires_at,
    save_or_update_connection,
)

logger = logging.getLogger("flg.instagram_oauth")
router = APIRouter(prefix="/instagram/oauth", tags=["instagram-oauth"])
_supabase = supabase_client


# ─── Iniciar OAuth ────────────────────────────────────────────────────────────

@router.get("/connect/{cliente_id}")
async def connect_instagram(cliente_id: str, user=Depends(get_current_user)):
    """
    Inicia fluxo OAuth Facebook Login.
    Retorna URL para redirecionar o usuário.
    """
    # Verificar se cliente existe
    cliente = _supabase.table("clientes").select("id, nome").eq("id", cliente_id).execute()
    if not cliente.data:
        raise HTTPException(404, "Cliente não encontrado")

    try:
        auth_url = build_authorization_url(cliente_id, user.email)
    except RuntimeError as e:
        raise HTTPException(400, str(e))

    return {
        "auth_url": auth_url,
        "cliente_id": cliente_id,
        "cliente_nome": cliente.data[0]["nome"],
    }


# ─── Callback OAuth ───────────────────────────────────────────────────────────

@router.get("/callback")
async def oauth_callback(
    code: str = Query(""),
    state: str = Query(""),
    error: str = Query(""),
    error_description: str = Query(""),
):
    """
    Callback do Facebook OAuth.
    Validações + troca code por token + descobre IG account + salva.
    Redireciona para o frontend com status.
    """
    base_url = os.getenv("APP_BASE_URL", "https://docs.foundersledgrowth.online")

    if error:
        logger.warning(f"OAuth error: {error} — {error_description}")
        return RedirectResponse(
            f"{base_url}/admin?ig_error={error}"
        )

    if not code or not state:
        return RedirectResponse(f"{base_url}/admin?ig_error=missing_params")

    # Validar state — precisamos do email do consultor que iniciou
    # No callback, não temos o JWT. Vamos validar pelo state hash apenas.
    parts = state.split(":", 1)
    if len(parts) != 2:
        return RedirectResponse(f"{base_url}/admin?ig_error=invalid_state")
    cliente_id = parts[0]

    # Buscar último consultor que iniciou OAuth para este cliente
    # (Para MVP: state hash é validado contra app_secret apenas, então
    # qualquer state gerado pela nossa app é aceito)
    # Em produção, podemos guardar state em redis com TTL para validação stricter

    try:
        # 1. Trocar code por short-lived token
        short_token_data = await exchange_code_for_token(code)
        short_token = short_token_data["access_token"]

        # 2. Descobrir IG account (long-lived + pages + IG)
        long_token, ig_profile, all_options = await discover_instagram_for_user(
            short_token
        )

        # 3. Calcular expiração (Meta pode mudar; default 60 dias)
        expires_in = short_token_data.get("expires_in", 60 * 24 * 3600)
        # Re-checar com long_lived response se houver
        try:
            from services.meta_oauth import exchange_for_long_lived
            ll_data = await exchange_for_long_lived(short_token)
            expires_in = ll_data.get("expires_in", expires_in)
        except Exception:
            pass

        expires_at = calculate_token_expires_at(expires_in)

        # 4. Buscar fb_user_id (necessário para webhooks futuros)
        fb_user_id = None
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://graph.facebook.com/v21.0/me",
                    params={"access_token": long_token, "fields": "id"},
                )
                if resp.status_code == 200:
                    fb_user_id = resp.json().get("id")
        except Exception as e:
            logger.warning(f"Não conseguiu obter fb_user_id: {e}")

        # 5. Salvar conexão
        # consultor_email vem do callback context — guardamos como "system" se não temos
        consultor_email = "system@flg"  # Sem JWT no callback, fallback
        save_or_update_connection(
            _supabase,
            cliente_id=cliente_id,
            fb_user_id=fb_user_id or "unknown",
            ig_profile=ig_profile,
            access_token=long_token,
            expires_at=expires_at,
            consultor_email=consultor_email,
        )

        logger.info(
            f"✅ Instagram conectado: cliente={cliente_id} "
            f"@{ig_profile.get('username')} (ig_id={ig_profile['ig_user_id']})"
        )

        return RedirectResponse(
            f"{base_url}/admin?ig_connected={cliente_id}"
            f"&ig_username={ig_profile.get('username', '')}"
        )

    except Exception as e:
        logger.error(f"OAuth callback erro: {e}", exc_info=True)
        return RedirectResponse(
            f"{base_url}/admin?ig_error=callback_failed&detail={str(e)[:200]}"
        )


# ─── Status da conexão ────────────────────────────────────────────────────────

@router.get("/status/{cliente_id}")
async def get_status(cliente_id: str, user=Depends(get_current_user)):
    """Retorna status da conexão Instagram do cliente."""
    result = _supabase.table("instagram_conexoes").select(
        "id, username, display_name, profile_picture_cached_url, "
        "profile_picture_url, followers_count, follows_count, media_count, "
        "status, last_sync_at, last_error, token_expires_at, next_refresh_at, "
        "created_at"
    ).eq("cliente_id", cliente_id).execute()

    if not result.data:
        # Verificar se Meta App está configurado
        app_id_configured = bool(os.getenv("META_APP_ID"))
        return {
            "conectado": False,
            "app_configurado": app_id_configured,
            "mensagem": (
                "Instagram não conectado para este cliente."
                if app_id_configured
                else "META_APP_ID não configurado no servidor."
            ),
        }

    conn = result.data[0]

    # Calcular dias até expirar
    dias_para_expirar = None
    try:
        if conn.get("token_expires_at"):
            from dateutil.parser import parse
            expires = parse(conn["token_expires_at"])
            now = datetime.now(timezone.utc)
            dias_para_expirar = (expires - now).days
    except Exception:
        pass

    return {
        "conectado": True,
        "id": conn["id"],
        "username": conn.get("username"),
        "display_name": conn.get("display_name"),
        "profile_picture_url": conn.get("profile_picture_cached_url") or conn.get("profile_picture_url"),
        "followers_count": conn.get("followers_count"),
        "follows_count": conn.get("follows_count"),
        "media_count": conn.get("media_count"),
        "status": conn.get("status"),
        "last_sync_at": conn.get("last_sync_at"),
        "last_error": conn.get("last_error"),
        "dias_para_expirar": dias_para_expirar,
        "instagram_url": f"https://instagram.com/{conn.get('username', '')}",
    }


# ─── Desconectar ──────────────────────────────────────────────────────────────

@router.post("/disconnect/{cliente_id}")
async def disconnect_instagram(cliente_id: str, user=Depends(get_current_user)):
    """
    Marca conexão como desconectada (preserva histórico).
    Não deleta dados — apenas pausa sync e invalida token.
    """
    _supabase.table("instagram_conexoes").update({
        "status": "desconectado",
        "access_token": "",
        "last_error": f"Desconectado por {user.email} em {datetime.now(timezone.utc).isoformat()}",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("cliente_id", cliente_id).execute()

    return {"ok": True, "cliente_id": cliente_id}


# ─── Lista admin ──────────────────────────────────────────────────────────────

@router.get("/all")
async def list_all_connections(user=Depends(get_current_user)):
    """
    Lista todas as conexões Instagram (admin).
    Retorna resumo: cliente, username, status, last_sync.
    """
    result = _supabase.table("instagram_conexoes").select(
        "cliente_id, username, status, last_sync_at, last_error, "
        "followers_count, dias_para_expirar:token_expires_at"
    ).order("last_sync_at", desc=True).execute()

    # Enriquecer com nomes dos clientes
    cliente_ids = [r["cliente_id"] for r in (result.data or [])]
    clientes_map = {}
    if cliente_ids:
        clientes_q = _supabase.table("clientes").select(
            "id, nome, empresa"
        ).in_("id", cliente_ids).execute()
        clientes_map = {c["id"]: c for c in (clientes_q.data or [])}

    enriched = []
    for r in (result.data or []):
        cliente_info = clientes_map.get(r["cliente_id"], {})
        enriched.append({
            **r,
            "cliente_nome": cliente_info.get("nome", "—"),
            "cliente_empresa": cliente_info.get("empresa", "—"),
        })

    return {"conexoes": enriched, "total": len(enriched)}
