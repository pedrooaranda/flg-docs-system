"""
Entry point do backend FLG.
AgentOS (Agno) + rotas customizadas + APScheduler para agente de rotina.
"""

import json
import logging
from contextlib import asynccontextmanager
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import create_client

from config import settings
from agents.agent_os import build_agent_os
from agents.agente_flg import create_flg_agent
from agents.agente_rotina import run_rotina_sync
from prompts.system_prompt import build_system_prompt, TRIGGER_PHRASE
from tools.client_tools import get_client_profile, get_encontro_base
from routes.uploads import router as uploads_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("flg")

_supabase = create_client(settings.supabase_url, settings.supabase_key)
scheduler = AsyncIOScheduler()


# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Iniciar scheduler do agente de rotina
    scheduler.add_job(run_rotina_sync, "interval", hours=6, id="rotina_clickup")
    scheduler.start()
    logger.info("✅ APScheduler iniciado — agente de rotina a cada 6h")
    yield
    scheduler.shutdown()


# ─── AgentOS (monta as rotas do playground Agno) ──────────────────────────────
agent_os = build_agent_os()
app: FastAPI = agent_os.get_app()

# Substituir lifespan para incluir o scheduler
app.router.lifespan_context = lifespan

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.include_router(uploads_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://docs.foundersledgrowth.online", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Auth dependency ──────────────────────────────────────────────────────────
async def get_current_user(authorization: str = Header(...)):
    """Valida JWT do Supabase. Retorna o user dict."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token inválido")
    token = authorization[7:]
    try:
        user = _supabase.auth.get_user(token)
        return user.user
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")


# ─── Health check ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "FLG Jornada System"}


# ─── Schemas ──────────────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None


class GenerateSlidesRequest(BaseModel):
    client_id: str
    encontro_numero: int
    conversation_context: Optional[str] = None


# ─── Chat com streaming (SSE) ─────────────────────────────────────────────────
@app.post("/chat/{client_id}/{encontro_numero}")
async def chat_stream(
    client_id: str,
    encontro_numero: int,
    body: ChatMessage,
    user=Depends(get_current_user),
):
    """
    Endpoint de chat com streaming SSE.
    Injeta o system prompt dinâmico baseado no cliente e encontro.
    """
    # Buscar perfil e encontro
    cliente_json = get_client_profile(client_id)
    encontro_json = get_encontro_base(encontro_numero)
    cliente = json.loads(cliente_json)
    encontro = json.loads(encontro_json)

    if "erro" in cliente:
        raise HTTPException(status_code=404, detail=cliente["erro"])
    if "erro" in encontro:
        raise HTTPException(status_code=404, detail=encontro["erro"])

    system_prompt = build_system_prompt(cliente, encontro)
    session_id = body.session_id or f"{client_id}_{encontro_numero}"

    agent = create_flg_agent(system_prompt=system_prompt, session_id=session_id)

    async def stream_generator():
        has_trigger = False
        full_response = ""

        # agent.arun() with stream=True returns an AsyncGenerator directly (not awaitable)
        async for chunk in agent.arun(body.message, stream=True, session_id=session_id):
            if hasattr(chunk, "content") and chunk.content and isinstance(chunk.content, str):
                text = chunk.content
                full_response += text
                yield f"data: {json.dumps({'type': 'text_delta', 'content': text})}\n\n"

        # Verificar se o agente quer gerar slides
        if TRIGGER_PHRASE in full_response:
            has_trigger = True

        yield f"data: {json.dumps({'type': 'done', 'trigger_slides': has_trigger})}\n\n"

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable Nginx/Traefik response buffering for SSE
        },
    )


# ─── Gerar slides ─────────────────────────────────────────────────────────────
@app.post("/generate-slides")
async def generate_slides_endpoint(
    body: GenerateSlidesRequest,
    user=Depends(get_current_user),
):
    """
    Gera slides HTML + PDF personalizados para o encontro.
    Chamado quando o consultor clica em "Gerar Slides".
    """
    from tools.slides_tools import generate_slides as _generate

    result = await _generate(
        client_id=body.client_id,
        encontro_numero=body.encontro_numero,
        conversation_context=body.conversation_context or "",
    )
    return result


# ─── Clientes API ─────────────────────────────────────────────────────────────
@app.get("/clientes")
async def list_clientes(user=Depends(get_current_user)):
    result = _supabase.table("clientes").select(
        "id, nome, empresa, consultor_responsavel, encontro_atual, created_at"
    ).order("created_at", desc=True).execute()
    return result.data


@app.get("/clientes/{client_id}")
async def get_cliente(client_id: str, user=Depends(get_current_user)):
    result = _supabase.table("clientes").select("*").eq("id", client_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    # Buscar encontros realizados
    encontros = _supabase.table("encontros_realizados").select("*").eq(
        "cliente_id", client_id
    ).order("encontro_numero").execute()
    result.data["encontros_realizados"] = encontros.data or []
    return result.data


@app.post("/clientes")
async def create_cliente(data: dict, user=Depends(get_current_user)):
    result = _supabase.table("clientes").insert(data).execute()
    return result.data[0]


@app.patch("/clientes/{client_id}")
async def update_cliente(client_id: str, data: dict, user=Depends(get_current_user)):
    result = _supabase.table("clientes").update(data).eq("id", client_id).execute()
    return result.data[0]


# ─── Base de Conhecimento ─────────────────────────────────────────────────────
@app.get("/conhecimento-base")
async def list_conhecimento(user=Depends(get_current_user)):
    result = _supabase.table("conhecimento_base").select("*").order("ordem").execute()
    return result.data


@app.post("/conhecimento-base")
async def create_conhecimento(data: dict, user=Depends(get_current_user)):
    result = _supabase.table("conhecimento_base").insert(data).execute()
    return result.data[0]


@app.patch("/conhecimento-base/{item_id}")
async def update_conhecimento(item_id: int, data: dict, user=Depends(get_current_user)):
    result = _supabase.table("conhecimento_base").update(data).eq("id", item_id).execute()
    return result.data[0]


@app.delete("/conhecimento-base/{item_id}")
async def delete_conhecimento(item_id: int, user=Depends(get_current_user)):
    _supabase.table("conhecimento_base").delete().eq("id", item_id).execute()
    return {"ok": True}


# ─── Encontros base API ────────────────────────────────────────────────────────
@app.get("/encontros-base")
async def list_encontros_base(user=Depends(get_current_user)):
    result = _supabase.table("encontros_base").select("*").order("numero").execute()
    return result.data


@app.patch("/encontros-base/{numero}")
async def update_encontro_base(numero: int, data: dict, user=Depends(get_current_user)):
    """Admin only — atualiza intelecto_base de um encontro."""
    result = _supabase.table("encontros_base").update(data).eq("numero", numero).execute()
    return result.data[0]


# ─── Encontros realizados ──────────────────────────────────────────────────────
@app.post("/encontros-realizados")
async def save_encontro(data: dict, user=Depends(get_current_user)):
    result = _supabase.table("encontros_realizados").upsert(
        data, on_conflict="cliente_id,encontro_numero"
    ).execute()
    # Avançar encontro_atual do cliente se necessário
    if result.data:
        enc_num = data.get("encontro_numero", 0)
        _supabase.table("clientes").update(
            {"encontro_atual": enc_num + 1}
        ).eq("id", data["cliente_id"]).lt("encontro_atual", enc_num + 1).execute()
    return result.data[0] if result.data else {}
