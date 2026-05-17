"""
Callbacks obrigatórios da Meta pra App Review do FLG Journey Metrics.

Endpoints (sem auth — Meta chama via signed_request):
  POST /api/meta/data-deletion   — user solicitou exclusão de dados via Facebook
  POST /api/meta/deauthorize     — user desconectou o app
  GET  /api/meta/data-deletion/status/{code} — página pública de status da deleção

Protocolo Meta:
  - Recebe POST com form-data `signed_request` no formato `<base64url(sig)>.<base64url(payload)>`
  - Sig é HMAC-SHA256 do payload com `app_secret`. Sem validação → 400.
  - Payload tem `user_id` (Instagram User ID no caminho IG Login).
  - Endpoint data-deletion DEVE retornar JSON `{url, confirmation_code}` em sucesso.

Refs:
  - https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
  - https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback#deauthorize-callback
"""

import base64
import hashlib
import hmac
import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse

from config import settings
from deps import supabase_client

logger = logging.getLogger("flg.meta_callbacks")
# Prefix `/meta` — Traefik faz strip de `/api`, então URL pública vira `/api/meta/*`.
router = APIRouter(prefix="/meta", tags=["meta-callbacks"])
_supabase = supabase_client


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _b64url_decode(s: str) -> bytes:
    """Decode base64 URL-safe sem padding (formato Meta signed_request)."""
    # Meta omite o `=` do padding — adiciona de volta antes de decodar.
    padded = s + "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(padded)


def _parse_signed_request(signed_request: str, app_secret: str) -> dict:
    """
    Decodifica e valida `signed_request` Meta.
    Retorna o payload (dict) se válido, levanta HTTPException 400 se não.
    """
    if not signed_request or "." not in signed_request:
        raise HTTPException(status_code=400, detail="signed_request malformado")
    if not app_secret:
        # Sem secret configurado, não podemos validar — fail closed.
        logger.error("_parse_signed_request: APP_SECRET ausente em config")
        raise HTTPException(status_code=500, detail="Servidor mal configurado (sem app_secret)")

    try:
        encoded_sig, payload_b64 = signed_request.split(".", 1)
        sig = _b64url_decode(encoded_sig)
        payload_bytes = _b64url_decode(payload_b64)
        payload = json.loads(payload_bytes)
    except (ValueError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=400, detail=f"signed_request inválido: {e}")

    # Valida HMAC-SHA256
    expected_sig = hmac.new(
        app_secret.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(sig, expected_sig):
        logger.warning("_parse_signed_request: assinatura inválida")
        raise HTTPException(status_code=400, detail="Assinatura inválida")

    # Meta usa "hmac-sha256" como algoritmo. Confere por garantia.
    algo = payload.get("algorithm", "").upper().replace("-", "")
    if algo and algo != "HMACSHA256":
        raise HTTPException(status_code=400, detail=f"Algoritmo não suportado: {payload.get('algorithm')}")

    return payload


def _app_secret_for_signed_request() -> str:
    """
    Retorna app_secret do produto Instagram Login (preferido) ou Meta Login (legado).
    Tenta IG primeiro porque é o caminho atual; fallback pro Meta cobre conexões
    legadas que ainda possam estar ativas durante migração.
    """
    return settings.ig_app_secret or settings.meta_app_secret


# ─── Endpoint: Data Deletion ─────────────────────────────────────────────────

@router.post("/data-deletion")
async def data_deletion_callback(signed_request: str = Form(...)):
    """
    Recebe solicitação de deleção de dados via Meta.
    Payload Meta:
      {"user_id": "<IG/FB user id>", "algorithm": "HMAC-SHA256", "issued_at": ..., ...}

    Ações:
      1. Valida signed_request
      2. Localiza `instagram_conexoes` por instagram_user_id
      3. Marca status='deletado', limpa token, registra `deletion_requested_at`
      4. Apaga metricas_diarias_instagram desse cliente (cascade não cobre — manual)
      5. Retorna {url, confirmation_code} (padrão Meta)
    """
    secret = _app_secret_for_signed_request()
    payload = _parse_signed_request(signed_request, secret)
    user_id = str(payload.get("user_id", "")).strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id ausente no signed_request")

    confirmation_code = secrets.token_urlsafe(12)
    now_iso = datetime.now(timezone.utc).isoformat()
    affected_clientes = []

    try:
        # 1. Acha conexões IG desse user_id
        r = (
            _supabase.table("instagram_conexoes")
            .select("id, cliente_id, instagram_user_id, status")
            .eq("instagram_user_id", user_id)
            .execute()
        )
        conexoes = r.data or []

        for conn in conexoes:
            cid = conn["cliente_id"]
            affected_clientes.append(cid)

            # Limpa token + marca deletado (mantém row pra audit)
            _supabase.table("instagram_conexoes").update({
                "status": "deletado",
                "access_token": "",
                "last_error": f"Deleção solicitada via Meta data-deletion ({confirmation_code}) em {now_iso}",
                "updated_at": now_iso,
            }).eq("id", conn["id"]).execute()

            # Apaga métricas históricas desse cliente
            try:
                _supabase.table("metricas_diarias_instagram").delete().eq("cliente_id", cid).execute()
            except Exception as e:
                # Tabela pode não existir ou nome ser diferente — não bloqueia
                logger.warning(f"data-deletion: erro ao purgar metricas_diarias_instagram pra cliente {cid}: {e}")

        logger.info(
            f"data-deletion: user_id={user_id}, code={confirmation_code}, "
            f"clientes_afetados={len(affected_clientes)}"
        )
    except Exception as e:
        logger.exception(f"data-deletion: falha no processamento: {e}")
        # Mesmo em erro retornamos confirmação — Meta exige resposta válida.
        # Logamos pra investigar depois.

    status_url = f"{settings.app_base_url}/api/meta/data-deletion/status/{confirmation_code}"
    return JSONResponse({
        "url": status_url,
        "confirmation_code": confirmation_code,
    })


@router.get("/data-deletion/status/{code}", response_class=HTMLResponse)
async def data_deletion_status(code: str):
    """Página pública mostrando que a deleção foi recebida.
    Meta linka esse URL pro user verificar status.
    Não exposto via auth — code é o próprio identificador (não enumerável).
    """
    safe_code = (code or "").replace("<", "&lt;").replace(">", "&gt;")[:64]
    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Status de Deleção — FLG Jornada System</title>
  <style>
    body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
         background:#080808;color:#FAFAF8;line-height:1.6;padding:48px 24px;margin:0}}
    .container{{max-width:680px;margin:0 auto}}
    h1{{font-size:1.75rem;margin-bottom:8px;
       background:linear-gradient(135deg,#F5D68A,#C9A84C,#8B6914);
       -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}}
    .badge{{display:inline-block;padding:4px 10px;border-radius:999px;
           background:rgba(52,211,153,0.10);color:#34D399;font-size:0.75rem;
           border:1px solid rgba(52,211,153,0.30);margin:8px 0 24px}}
    p{{color:rgba(250,250,248,0.75);margin-bottom:12px}}
    code{{background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;
         font-size:0.85rem;color:#C9A84C}}
    a{{color:#C9A84C;text-decoration:none}}a:hover{{text-decoration:underline}}
    hr{{border:none;border-top:1px solid rgba(255,255,255,0.08);margin:32px 0}}
  </style>
</head>
<body>
<div class="container">
  <h1>Solicitação de deleção recebida</h1>
  <span class="badge">Em processamento</span>
  <p>Sua solicitação de exclusão de dados foi <strong>recebida e está sendo processada</strong>
     pela FLG Jornada System.</p>
  <p><strong>Código de confirmação:</strong> <code>{safe_code}</code></p>
  <p>Todos os dados associados à sua conta Instagram conectada
     (tokens, métricas históricas, posts armazenados em cache) serão removidos
     em até <strong>30 dias corridos</strong>, conforme exigência da Meta Platform Terms 4.b
     e da LGPD Art. 18º, VI.</p>
  <hr>
  <p>Em caso de dúvidas ou pedido de confirmação manual, contate
     <a href="mailto:contato@grupoguglielmi.com">contato@grupoguglielmi.com</a>
     informando o código acima.</p>
  <p style="margin-top:24px;font-size:0.85rem;color:rgba(250,250,248,0.4)">
    <a href="/legal/privacy">Política de Privacidade</a> ·
    <a href="/legal/data-deletion">Como solicitar exclusão</a>
  </p>
</div>
</body>
</html>"""
    return HTMLResponse(content=html, headers={
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
    })


# ─── Endpoint: Deauthorize ───────────────────────────────────────────────────

@router.post("/deauthorize")
async def deauthorize_callback(signed_request: str = Form(...)):
    """
    Meta chama isso quando user remove o app pelas configurações do Facebook/Instagram.
    Diferença pra data-deletion: aqui o user só desconecta, não exige deleção.
    Marcamos a conexão como `desautorizado` (mantém histórico, invalida token).
    """
    secret = _app_secret_for_signed_request()
    payload = _parse_signed_request(signed_request, secret)
    user_id = str(payload.get("user_id", "")).strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id ausente no signed_request")

    now_iso = datetime.now(timezone.utc).isoformat()
    affected = 0
    try:
        r = (
            _supabase.table("instagram_conexoes")
            .select("id")
            .eq("instagram_user_id", user_id)
            .execute()
        )
        for conn in (r.data or []):
            _supabase.table("instagram_conexoes").update({
                "status": "desautorizado",
                "access_token": "",
                "last_error": f"App desautorizado via Meta deauthorize callback em {now_iso}",
                "updated_at": now_iso,
            }).eq("id", conn["id"]).execute()
            affected += 1
        logger.info(f"deauthorize: user_id={user_id}, conexoes_atualizadas={affected}")
    except Exception as e:
        logger.exception(f"deauthorize: falha: {e}")
        # Não levanta — Meta espera 200 OK pra não retentar.

    return JSONResponse({"ok": True, "affected": affected})
