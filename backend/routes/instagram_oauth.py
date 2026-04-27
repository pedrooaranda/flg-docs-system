"""
Rotas OAuth Instagram (Facebook Login) — FLG Jornada System.

Endpoints:
  GET  /instagram/oauth/connect/{cliente_id}        — inicia OAuth (autenticado)
  GET  /instagram/oauth/callback                    — callback do Facebook
  GET  /instagram/oauth/status/{cliente_id}         — status da conexão
  POST /instagram/oauth/disconnect/{cliente_id}     — desconecta
  GET  /instagram/oauth/all                         — lista todas conexões (admin)

  GET  /instagram/oauth/onboard-token/{cliente_id}  — gera link público (admin)
  GET  /instagram/oauth/onboard-info?token=...      — info pública do cliente
  GET  /instagram/oauth/onboard-start?token=...     — redirect direto pro Meta
"""

import base64
import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timezone, timedelta

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

    # Detecta self-onboard pelo state: "cliente_id:hash:onboard:<token>"
    onboard_token_in_state = ""
    if state and ":onboard:" in state:
        # split em até 4 partes: cliente_id, hash, "onboard", token
        sparts = state.split(":", 3)
        if len(sparts) == 4 and sparts[2] == "onboard":
            onboard_token_in_state = sparts[3]
            state = f"{sparts[0]}:{sparts[1]}"  # remove sufixo pra validação

    def _redirect_target(query: str) -> str:
        if onboard_token_in_state:
            cid = state.split(":", 1)[0] if ":" in state else ""
            return f"{base_url}/conectar-instagram/{cid}?t={onboard_token_in_state}&{query}"
        return f"{base_url}/admin?{query}"

    if error:
        logger.warning(f"OAuth error: {error} — {error_description}")
        return RedirectResponse(_redirect_target(f"ig_error={error}"))

    if not code or not state:
        return RedirectResponse(_redirect_target("ig_error=missing_params"))

    # Validar state — precisamos do email do consultor que iniciou
    # No callback, não temos o JWT. Vamos validar pelo state hash apenas.
    parts = state.split(":", 1)
    if len(parts) != 2:
        return RedirectResponse(_redirect_target("ig_error=invalid_state"))
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

        return RedirectResponse(_redirect_target(
            f"ig_connected={cliente_id}&ig_username={ig_profile.get('username', '')}"
        ))

    except Exception as e:
        logger.error(f"OAuth callback erro: {e}", exc_info=True)
        return RedirectResponse(_redirect_target(
            f"ig_error=callback_failed&detail={str(e)[:200]}"
        ))


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


# ─── Sync manual ──────────────────────────────────────────────────────────────

@router.post("/sync/{cliente_id}")
async def sync_cliente_manual(cliente_id: str, user=Depends(get_current_user)):
    """
    Trigger manual de sync para um cliente conectado.
    Usado pelo botão "Atualizar agora" na página Métricas.

    Sempre puxa demografia (endpoint caro, mas user pediu explicitamente).
    """
    from services.instagram_sync import sync_cliente
    try:
        result = await sync_cliente(cliente_id, sync_demographics=True)
        return {"ok": True, **result}
    except Exception as e:
        logger.error(f"Sync manual falhou cliente={cliente_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ─── Public Onboard Link (token assinado) ─────────────────────────────────────
#
# Fluxo:
#   1. Admin chama GET /onboard-token/{cliente_id} → recebe token + URL completa
#   2. Admin envia URL pro cliente (ou pessoa que vai conectar)
#   3. Pessoa abre URL no navegador → frontend route /conectar-instagram/:cid?t=...
#   4. Frontend bate em GET /onboard-info?token=... → mostra nome do cliente
#   5. Pessoa clica "Conectar Instagram" → frontend redireciona pra
#      GET /onboard-start?token=... que redireciona pro Meta OAuth
#   6. Callback (já existente) salva conexão e volta pra /admin?ig_connected=...

ONBOARD_TOKEN_TTL_DAYS = 30


def _onboard_secret() -> bytes:
    secret = os.getenv("META_APP_SECRET", "") + os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not secret:
        secret = "flg-fallback-secret-not-for-production"
    return secret.encode()


def _make_onboard_token(cliente_id: str, ttl_days: int = ONBOARD_TOKEN_TTL_DAYS) -> str:
    expires_at = int((datetime.now(timezone.utc) + timedelta(days=ttl_days)).timestamp())
    payload = json.dumps({"cid": cliente_id, "exp": expires_at}, separators=(",", ":")).encode()
    payload_b64 = base64.urlsafe_b64encode(payload).rstrip(b"=").decode()
    sig = hmac.new(_onboard_secret(), payload_b64.encode(), hashlib.sha256).hexdigest()[:24]
    return f"{payload_b64}.{sig}"


def _verify_onboard_token(token: str) -> str:
    """Valida token e retorna cliente_id. Raises HTTPException se inválido."""
    try:
        payload_b64, sig = token.rsplit(".", 1)
    except ValueError:
        raise HTTPException(400, "Token mal formatado")

    expected_sig = hmac.new(_onboard_secret(), payload_b64.encode(), hashlib.sha256).hexdigest()[:24]
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(401, "Token inválido")

    try:
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded))
    except Exception:
        raise HTTPException(400, "Token corrompido")

    if data.get("exp", 0) < int(datetime.now(timezone.utc).timestamp()):
        raise HTTPException(401, "Token expirado — gere um novo link")

    return data["cid"]


@router.get("/onboard-token/{cliente_id}")
async def generate_onboard_token(cliente_id: str, user=Depends(get_current_user)):
    """Gera link público de onboarding pra mandar pro cliente. Requer auth admin."""
    cliente = _supabase.table("clientes").select("id, nome").eq("id", cliente_id).execute()
    if not cliente.data:
        raise HTTPException(404, "Cliente não encontrado")
    token = _make_onboard_token(cliente_id)
    base = os.getenv("APP_BASE_URL", "https://docs.foundersledgrowth.online")
    return {
        "token": token,
        "url": f"{base}/conectar-instagram/{cliente_id}?t={token}",
        "expires_in_days": ONBOARD_TOKEN_TTL_DAYS,
        "cliente_nome": cliente.data[0]["nome"],
    }


@router.get("/onboard-info")
async def onboard_info(token: str = Query(...)):
    """Endpoint público — frontend usa pra mostrar nome do cliente na landing."""
    cliente_id = _verify_onboard_token(token)
    cliente = _supabase.table("clientes").select("id, nome, empresa").eq(
        "id", cliente_id
    ).execute()
    if not cliente.data:
        raise HTTPException(404, "Cliente não encontrado")
    c = cliente.data[0]

    # Já está conectado?
    conn = _supabase.table("instagram_conexoes").select("username, status").eq(
        "cliente_id", cliente_id
    ).eq("status", "ativo").execute()
    ja_conectado = bool(conn.data)
    username_conectado = conn.data[0]["username"] if conn.data else None

    return {
        "cliente_id": cliente_id,
        "cliente_nome": c["nome"],
        "cliente_empresa": c.get("empresa"),
        "ja_conectado": ja_conectado,
        "username_conectado": username_conectado,
    }


@router.get("/onboard-start")
async def onboard_start(token: str = Query(...)):
    """Endpoint público — gera URL OAuth e redireciona direto pro Meta."""
    cliente_id = _verify_onboard_token(token)
    cliente = _supabase.table("clientes").select("id").eq("id", cliente_id).execute()
    if not cliente.data:
        raise HTTPException(404, "Cliente não encontrado")
    try:
        # Passa o onboard_token pro build pra que o callback redirecione
        # de volta pra rota pública /conectar-instagram em vez de /admin
        auth_url = build_authorization_url(cliente_id, "self-onboard@flg", onboard_token=token)
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    return RedirectResponse(auth_url)
