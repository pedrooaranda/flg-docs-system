"""
Job de refresh dos long-lived tokens do Instagram.

Roda diariamente às 03h00. Para cada conexão ativa cujo `next_refresh_at`
já passou, faz refresh do token (estende validade por mais 60 dias).

Estratégia:
  - Refresh aos 50 dias (10 dias de margem antes da expiração de 60 dias)
  - Em caso de erro, marca status='expirado' e last_error
  - Cliente precisa reconectar manualmente se token expirar de fato
"""

import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger("flg.ig_token_refresh")


def run_token_refresh_sync():
    """Wrapper síncrono para o APScheduler."""
    try:
        asyncio.get_event_loop().run_until_complete(_run_refresh())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_run_refresh())
        loop.close()


async def _run_refresh():
    from deps import supabase_client as sb
    from services.meta_oauth import (
        refresh_long_lived_token,
        calculate_token_expires_at,
        calculate_next_refresh_at,
    )

    logger.info("🔄 Iniciando refresh de tokens Instagram...")

    now = datetime.now(timezone.utc).isoformat()
    result = sb.table("instagram_conexoes").select("*").eq(
        "status", "ativo"
    ).lte("next_refresh_at", now).execute()

    conexoes = result.data or []
    if not conexoes:
        logger.info("Nenhum token precisa de refresh agora")
        return

    logger.info(f"Encontradas {len(conexoes)} conexões para refresh")
    sucesso, falha = 0, 0

    for conn in conexoes:
        cliente_id = conn["cliente_id"]
        username = conn.get("username", "?")
        try:
            ll_data = await refresh_long_lived_token(conn["access_token"])
            new_token = ll_data["access_token"]
            expires_in = ll_data.get("expires_in", 60 * 24 * 3600)
            new_expires_at = calculate_token_expires_at(expires_in)

            sb.table("instagram_conexoes").update({
                "access_token": new_token,
                "token_expires_at": new_expires_at.isoformat(),
                "next_refresh_at": calculate_next_refresh_at(new_expires_at).isoformat(),
                "last_error": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", conn["id"]).execute()

            logger.info(f"✅ Token renovado: @{username} (cliente={cliente_id})")
            sucesso += 1
        except Exception as e:
            logger.error(f"❌ Falha refresh @{username}: {e}")
            sb.table("instagram_conexoes").update({
                "status": "expirado",
                "last_error": f"Refresh falhou: {str(e)[:300]}",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", conn["id"]).execute()
            falha += 1

    logger.info(f"✅ Refresh concluído — {sucesso} ok, {falha} falhas")
