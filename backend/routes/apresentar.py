"""
Rota pública pra apresentação fullscreen de um encontro.

  GET /apresentar/{slug}  — sem auth. Slug é a credencial. Retorna HTML completo.

Backend monta o documento (intelectual + prática + chrome do deck) e o browser
carrega `/flg-design-system/css/flg.css` e `/flg-design-system/js/flg-deck.js`
de mesma origem (Nginx do frontend serve esses paths via Vite public).

404 se slug não existe ou foi revogado.
"""

import html as _html_lib
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from deps import supabase_client

logger = logging.getLogger("flg.apresentar")
router = APIRouter(tags=["apresentar"])
_supabase = supabase_client


def _build_deck_html(
    *,
    deck_id: str,
    encontro_titulo: str,
    html_intelecto: str,
    html_pratica: str,
) -> str:
    """Monta o documento HTML completo do deck — espelha
    `frontend/public/flg-design-system/templates/deck-template.html` em estrutura.

    Inputs já vêm sanitizados pelo allowlist do design system (Phase A2/C1
    validam classes CSS antes de salvar). Aqui só fazemos escape no título."""
    title = _html_lib.escape(encontro_titulo or "FLG Brasil — Apresentação")
    deck_id_attr = _html_lib.escape(deck_id)

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{title} · FLG Brasil</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..700,30..100;1,9..144,300..700,30..100&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/flg-design-system/css/flg.css">
</head>
<body class="flg-deck" data-deck-id="{deck_id_attr}">

<canvas id="stage-canvas"></canvas>
<div class="grain"></div>

<div class="progress"><div class="progress-fill"></div></div>
<div class="counter"><span class="counter-dot"></span><span class="counter-num">01 / 01</span></div>
<div class="nav-hint">&#8592; &#8594; &middot; ESPA&Ccedil;O &middot; SWIPE</div>
<button class="nav-arrows nav-prev" aria-label="Anterior">&lsaquo;</button>
<button class="nav-arrows nav-next" aria-label="Pr&oacute;ximo">&rsaquo;</button>

<div class="deck">
{html_intelecto or ''}
{html_pratica or ''}
</div>

<script src="/flg-design-system/js/flg-deck.js"></script>
</body>
</html>
"""


@router.get("/apresentar/{slug}", include_in_schema=False)
async def apresentar(slug: str):
    """Serve o deck completo. Sem auth — slug é a credencial. Cache: no-store."""
    if not slug or len(slug) < 6:
        raise HTTPException(status_code=404, detail="Slug inválido")

    # Lookup
    r = (
        _supabase.table("encontros_pratica")
        .select("*")
        .eq("slug", slug)
        .maybe_single()
        .execute()
    )
    pratica = r.data if r else None
    if not pratica:
        raise HTTPException(status_code=404, detail="Apresentação não encontrada")

    if pratica.get("slug_revogado_at"):
        raise HTTPException(status_code=404, detail="Apresentação revogada")

    # Fetch intelectual (coluna 'nome' guarda o título do encontro)
    enc_r = (
        _supabase.table("encontros_base")
        .select("numero, nome, html_intelecto")
        .eq("numero", pratica["encontro_numero"])
        .maybe_single()
        .execute()
    )
    encontro = enc_r.data if enc_r else None
    if not encontro:
        raise HTTPException(status_code=404, detail="Encontro do deck não existe")

    html = _build_deck_html(
        deck_id=f"encontro-{pratica['encontro_numero']}-{slug[:6]}",
        encontro_titulo=encontro.get("nome") or f"Encontro {pratica['encontro_numero']}",
        html_intelecto=encontro.get("html_intelecto") or "",
        html_pratica=pratica.get("html_pratica") or "",
    )

    # Marca apresentado_at na PRIMEIRA visita (best-effort, não bloqueia render)
    if not pratica.get("apresentado_at"):
        try:
            _supabase.table("encontros_pratica").update({
                "apresentado_at": datetime.now(timezone.utc).isoformat(),
                "status": "apresentado",
            }).eq("id", pratica["id"]).execute()
        except Exception as e:
            logger.warning(f"apresentar: falha ao marcar apresentado: {e}")

    return HTMLResponse(
        content=html,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "X-Robots-Tag": "noindex, nofollow",
        },
    )
