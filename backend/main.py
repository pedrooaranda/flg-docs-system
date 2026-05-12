"""
Entry point do backend FLG.
AgentOS (Agno) + rotas customizadas + APScheduler para agente de rotina.
"""

import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException, Header, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import create_client

from config import settings
from agents.agent_os import build_agent_os
from agents.agente_flg import create_flg_agent
from agents.agente_rotina import run_rotina_sync
from services.ingestion import run_ingestion_sync
from services.clickup_sync import run_clickup_sync, register_webhook
from services.instagram_token_refresh import run_token_refresh_sync
from services.instagram_sync import run_daily_sync_sync
from prompts.system_prompt import build_system_prompt, TRIGGER_PHRASE
from tools.client_tools import get_client_profile, get_encontro_base
from routes.uploads import router as uploads_router
from routes.metricas import router as metricas_router
from routes.conexoes import router as conexoes_router
from routes.notas import router as notas_router
from routes.admin_clickup import router as admin_clickup_router
from routes.instagram_oauth import router as instagram_oauth_router
from routes.colaboradores import router as colaboradores_router
from routes.encontros_intelecto import router as encontros_intelecto_router
from routes.reunioes import router as reunioes_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("flg")

_supabase = create_client(settings.supabase_url, settings.supabase_key)
scheduler = AsyncIOScheduler()


# ─── Migration 003 auto-apply ─────────────────────────────────────────────────
async def _apply_migration_003():
    """Apply migration 003 (tables/columns) at startup if not yet applied.
    Each statement is executed independently — failures are logged and skipped.
    """
    import psycopg
    db_url = settings.supabase_db_url.replace("postgresql+psycopg://", "postgresql://")
    stmts = [
        # Coluna status em clientes (se não existir)
        "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ativo'",
        # Colunas novas em encontros_base
        """ALTER TABLE encontros_base
           ADD COLUMN IF NOT EXISTS imagem_principal_url TEXT,
           ADD COLUMN IF NOT EXISTS imagens_extras JSONB DEFAULT '[]',
           ADD COLUMN IF NOT EXISTS intelecto_versao INT DEFAULT 1,
           ADD COLUMN IF NOT EXISTS intelecto_updated_at TIMESTAMPTZ DEFAULT NOW(),
           ADD COLUMN IF NOT EXISTS intelecto_updated_by TEXT""",
        # Tabela de histórico do intelecto
        """CREATE TABLE IF NOT EXISTS intelecto_historico (
           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           encontro_numero INT REFERENCES encontros_base(numero) ON DELETE CASCADE,
           intelecto_conteudo TEXT NOT NULL,
           versao INT NOT NULL,
           editado_por TEXT,
           created_at TIMESTAMPTZ DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_intelecto_historico_encontro ON intelecto_historico(encontro_numero)",
        "ALTER TABLE intelecto_historico ENABLE ROW LEVEL SECURITY",
        # Tabela de copies do Copywriter
        """CREATE TABLE IF NOT EXISTS materiais_copy (
           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
           tipo_material VARCHAR(50) NOT NULL,
           titulo TEXT,
           conteudo TEXT NOT NULL,
           consultor_email TEXT,
           encontro_referencia INT,
           created_at TIMESTAMPTZ DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_materiais_copy_cliente ON materiais_copy(cliente_id)",
        "ALTER TABLE materiais_copy ENABLE ROW LEVEL SECURITY",
        # Tabela de configuração dos agentes
        """CREATE TABLE IF NOT EXISTS agentes_config (
           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           agente_tipo VARCHAR(50) UNIQUE NOT NULL,
           system_prompt_base TEXT NOT NULL DEFAULT '',
           diretrizes TEXT,
           config_extra JSONB DEFAULT '{}',
           versao INT DEFAULT 1,
           updated_by TEXT,
           updated_at TIMESTAMPTZ DEFAULT NOW()
        )""",
        "ALTER TABLE agentes_config ENABLE ROW LEVEL SECURITY",
        # Seed dos agentes
        """INSERT INTO agentes_config (agente_tipo, system_prompt_base)
           VALUES ('preparacao_encontro', ''), ('copywriter', ''), ('materiais', ''), ('intelecto', '')
           ON CONFLICT (agente_tipo) DO NOTHING""",
        # Policy UPDATE em encontros_base (SELECT já existe na migration 001)
        """DO $$ BEGIN
             CREATE POLICY "auth_update_encontros_base" ON encontros_base
               FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
           EXCEPTION WHEN duplicate_object THEN NULL;
           END $$""",
        # Bucket de imagens dos encontros (público para URLs funcionarem nos slides)
        """INSERT INTO storage.buckets (id, name, public)
           VALUES ('encontros', 'encontros', true)
           ON CONFLICT (id) DO NOTHING""",
        # Coluna auth_provider em instagram_conexoes
        # 'fb_login' = legado (Facebook Login for Business, deprecado)
        # 'ig_login' = atual (Instagram Business Login, desde abr/2026)
        """ALTER TABLE instagram_conexoes
           ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'fb_login'""",
        # Invalida conexões legadas: tokens antigos foram emitidos via FB Login e
        # não funcionam no novo backend (graph.instagram.com). Cliente precisa reconectar.
        """UPDATE instagram_conexoes
           SET status = 'desconectado',
               access_token = '',
               last_error = 'Sistema migrado para Instagram Business Login em abr/2026. Reconecte o cliente pelo link de onboarding.',
               updated_at = NOW()
           WHERE auth_provider = 'fb_login' AND status = 'ativo'""",
        # Coluna nome_formatado em clientes — usada SÓ no link público de onboarding
        # pra mostrar "Letícia Toledo" em vez de "LETICIATOLEDO". Lazy-fill via LLM.
        "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nome_formatado TEXT",
    ]
    try:
        async with await psycopg.AsyncConnection.connect(db_url, autocommit=True) as conn:
            ok, skipped = 0, 0
            for stmt in stmts:
                try:
                    await conn.execute(stmt)
                    ok += 1
                except Exception as stmt_err:
                    logger.warning(f"Migration 003 stmt skipped: {stmt_err}")
                    skipped += 1
        logger.info(f"✅ Migration 003 concluída ({ok} ok, {skipped} skipped)")
    except Exception as e:
        logger.warning(f"⚠️ Migration 003 conexão falhou: {e}")


# Migration 004 (colaboradores) é aplicada manualmente via Supabase Dashboard —
# VPS sem IPv6 não consegue conexão direta. Schema em
# docs/superpowers/plans/2026-05-10-colaboradores-phase1.md Task 1.
# Status: aplicado em 2026-05-10.


# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await _apply_migration_003()
    # Iniciar scheduler PRIMEIRO (não bloqueia healthcheck)
    scheduler.add_job(run_rotina_sync, "interval", hours=6, id="rotina_clickup")
    scheduler.add_job(run_ingestion_sync, "interval", hours=6, id="metricas_ingestion")
    scheduler.add_job(run_clickup_sync, "interval", hours=6, id="clickup_sync")
    # ClickUp sync inicial agendado para 30s após startup (não bloqueia healthcheck)
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    scheduler.add_job(
        run_clickup_sync,
        "date",
        run_date=_dt.now(_tz.utc) + _td(seconds=30),
        id="clickup_initial_sync",
    )
    scheduler.add_job(
        register_webhook,
        "date",
        run_date=_dt.now(_tz.utc) + _td(seconds=45),
        id="clickup_webhook_registration",
    )
    # Instagram token refresh diário às 03h00 (token expira em 60d, refresh aos 50d)
    scheduler.add_job(
        run_token_refresh_sync,
        "cron",
        hour=3,
        minute=0,
        id="instagram_token_refresh",
        max_instances=1,
        replace_existing=True,
    )
    # Instagram sync diário às 04h00 (após token refresh, puxa posts/insights/followers)
    scheduler.add_job(
        run_daily_sync_sync,
        "cron",
        hour=4,
        minute=0,
        id="instagram_daily_sync",
        max_instances=1,
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        "✅ APScheduler iniciado — rotina 6h + ingestão 6h + ClickUp 6h + "
        "IG token refresh 03h + IG sync 04h"
    )
    yield
    scheduler.shutdown()


# ─── AgentOS (monta as rotas do playground Agno) ──────────────────────────────
agent_os = build_agent_os()
app: FastAPI = agent_os.get_app()

# Substituir lifespan para incluir o scheduler
app.router.lifespan_context = lifespan

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.include_router(uploads_router)
app.include_router(metricas_router)
app.include_router(conexoes_router)
app.include_router(notas_router)
app.include_router(admin_clickup_router)
app.include_router(instagram_oauth_router)
app.include_router(colaboradores_router)
app.include_router(encontros_intelecto_router)
app.include_router(reunioes_router)

# Migration 005 (encontros_base ganha intelecto_estrutura, html_intelecto,
# num_slides_intelecto, html_gerado_at) é aplicada manualmente via Supabase
# Dashboard — VPS sem IPv6 não consegue conexão direta. Schema em
# docs/superpowers/plans/2026-05-12-reunioes-phase-a-admin-intelectual.md Task 1.
# Status: aplicado em 2026-05-12.

# Migration 006 (tabela encontros_pratica com slug público + conversa_chat JSONB)
# também aplicada manualmente via Supabase Dashboard.
# Schema em docs/migrations/006-encontros-pratica.sql.

# flg-design-system/ é servido pelo FRONTEND (Nginx via Vite) em frontend/public/flg-design-system/.
# Backend lê os arquivos via volume mount (/app/flg-design-system) só pra construir o
# system prompt do Claude — NÃO serve via HTTP. Browser carrega /flg-design-system/css/flg.css
# do Nginx do frontend (Traefik route flg-frontend tem priority 1, cai aí pra paths fora de /api).

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


# ─── Deploy status ────────────────────────────────────────────────────────────
@app.get("/deploy-status")
async def deploy_status():
    """Retorna o SHA do git baked no build e confirma que o serviço está rodando."""
    return {
        "git_sha": os.getenv("GIT_SHA", "unknown"),
        "service": "FLG Jornada System",
        "status": "running",
    }


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
        "id, nome, empresa, consultor_responsavel, "
        "encontro_atual, status, updated_at, created_at"
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
    try:
        result = _supabase.table("clientes").update(data).eq("id", client_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar cliente: {e}")
    if not result.data:
        raise HTTPException(status_code=404, detail="Cliente não encontrado ou sem permissão")
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
    try:
        result = _supabase.table("conhecimento_base").update(data).eq("id", item_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar conhecimento: {e}")
    if not result.data:
        raise HTTPException(status_code=404, detail="Item não encontrado")
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
    try:
        result = _supabase.table("encontros_base").update(data).eq("numero", numero).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar encontro: {e}")
    if not result.data:
        raise HTTPException(status_code=404, detail="Encontro não encontrado ou sem permissão de UPDATE (verifique RLS)")
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


@app.get("/encontros-realizados")
async def list_encontros_realizados(
    cliente_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    q = _supabase.table("encontros_realizados").select("*").order("encontro_numero")
    if cliente_id:
        q = q.eq("cliente_id", cliente_id)
    return q.execute().data


# ─── Upload imagem de encontro ────────────────────────────────────────────────
@app.post("/upload-imagem-encontro")
async def upload_imagem_encontro(
    encontro_numero: int = Form(...),
    tipo: str = Form("principal"),
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    """Upload de imagem principal para um encontro. Salva no bucket 'encontros'."""
    ALLOWED = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="Formato não suportado (use jpg, png ou webp)")

    contents = await file.read()
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    storage_path = f"encontro-{encontro_numero:02d}-{tipo}.{ext}"

    # Garantir que o bucket existe
    try:
        _supabase.storage.create_bucket("encontros", options={"public": True})
    except Exception:
        pass  # Já existe

    # Upload com upsert (cria ou substitui)
    try:
        _supabase.storage.from_("encontros").upload(
            path=storage_path,
            file=contents,
            file_options={"content-type": file.content_type},
        )
    except Exception:
        # Arquivo já existe — substituir
        try:
            _supabase.storage.from_("encontros").update(
                path=storage_path,
                file=contents,
                file_options={"content-type": file.content_type},
            )
        except Exception as e:
            logger.error(f"Erro ao fazer upload da imagem: {e}")
            raise HTTPException(status_code=500, detail=f"Erro no upload: {e}")

    url = _supabase.storage.from_("encontros").get_public_url(storage_path)

    # Atualizar encontros_base com a URL da imagem
    _supabase.table("encontros_base").update(
        {"imagem_principal_url": url}
    ).eq("numero", encontro_numero).execute()

    logger.info(f"Imagem do encontro {encontro_numero} enviada: {storage_path}")
    return {"url": url}


# ─── Materiais Copy API ────────────────────────────────────────────────────────
@app.get("/materiais-copy")
async def list_materiais_copy(
    cliente_id: Optional[str] = None,
    tipo_material: Optional[str] = None,
    user=Depends(get_current_user),
):
    q = _supabase.table("materiais_copy").select("*").order("created_at", desc=True)
    if cliente_id:
        q = q.eq("cliente_id", cliente_id)
    if tipo_material:
        q = q.eq("tipo_material", tipo_material)
    return q.execute().data


@app.post("/materiais-copy")
async def create_material_copy(data: dict, user=Depends(get_current_user)):
    data["consultor_email"] = user.email
    try:
        result = _supabase.table("materiais_copy").insert(data).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao criar material: {e}")
    if not result.data:
        raise HTTPException(status_code=500, detail="Material não foi criado (tabela materiais_copy pode não existir ainda)")
    return result.data[0]


@app.delete("/materiais-copy/{item_id}")
async def delete_material_copy(item_id: str, user=Depends(get_current_user)):
    _supabase.table("materiais_copy").delete().eq("id", item_id).execute()
    return {"ok": True}


# ─── Agentes Config API ────────────────────────────────────────────────────────
@app.get("/agentes-config")
async def list_agentes_config(user=Depends(get_current_user)):
    return _supabase.table("agentes_config").select("*").order("agente_tipo").execute().data


@app.patch("/agentes-config/{agente_tipo}")
async def update_agente_config(agente_tipo: str, data: dict, user=Depends(get_current_user)):
    data["updated_by"] = user.email
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    # Increment versão
    try:
        current = _supabase.table("agentes_config").select("versao").eq(
            "agente_tipo", agente_tipo
        ).single().execute()
        if current.data:
            data["versao"] = (current.data.get("versao") or 1) + 1
        result = _supabase.table("agentes_config").update(data).eq(
            "agente_tipo", agente_tipo
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar agente: {e}")
    if not result.data:
        raise HTTPException(status_code=404, detail="Agente não encontrado (tabela agentes_config pode não existir ainda — aguarde inicialização)")
    return result.data[0]


# ─── Intelecto Histórico API ───────────────────────────────────────────────────
@app.get("/intelecto-historico")
async def list_intelecto_historico(
    encontro_numero: Optional[int] = None,
    user=Depends(get_current_user),
):
    q = _supabase.table("intelecto_historico").select("*").order("created_at", desc=True)
    if encontro_numero:
        q = q.eq("encontro_numero", encontro_numero)
    return q.execute().data


# Override do PATCH encontros-base para gravar histórico
@app.patch("/encontros-base/{numero}/com-historico")
async def update_encontro_base_historico(
    numero: int, data: dict, user=Depends(get_current_user)
):
    """Atualiza intelecto_base e grava versão no histórico."""
    # Buscar versão atual
    current = _supabase.table("encontros_base").select(
        "intelecto_base, intelecto_versao"
    ).eq("numero", numero).single().execute()
    versao_atual = (current.data.get("intelecto_versao") or 1) if current.data else 1
    nova_versao = versao_atual + 1

    # Salvar histórico
    if current.data and current.data.get("intelecto_base"):
        _supabase.table("intelecto_historico").insert({
            "encontro_numero": numero,
            "intelecto_conteudo": current.data["intelecto_base"],
            "versao": versao_atual,
            "editado_por": user.email,
        }).execute()

    # Atualizar encontro com nova versão
    update_data = {
        **data,
        "intelecto_versao": nova_versao,
        "intelecto_updated_by": user.email,
        "intelecto_updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        result = _supabase.table("encontros_base").update(update_data).eq("numero", numero).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar intelecto: {e}")
    if not result.data:
        raise HTTPException(status_code=404, detail="Encontro não encontrado ou colunas intelecto_versao/intelecto_updated_by ausentes — execute a migration 003")
    return result.data[0]


# ─── Chat Materiais (SSE) ──────────────────────────────────────────────────────
@app.post("/chat-materiais/{client_id}")
async def chat_materiais(
    client_id: str,
    body: ChatMessage,
    user=Depends(get_current_user),
):
    """Chat do Agente de Materiais — usa system prompt de agentes_config."""
    from tools.client_tools import get_client_profile

    cliente_json = get_client_profile(client_id)
    import json as _json
    cliente = _json.loads(cliente_json)
    if "erro" in cliente:
        raise HTTPException(status_code=404, detail=cliente["erro"])

    # Buscar config do agente
    config_row = _supabase.table("agentes_config").select("system_prompt_base").eq(
        "agente_tipo", "materiais"
    ).single().execute()
    base_prompt = config_row.data.get("system_prompt_base", "") if config_row.data else ""

    system_prompt = base_prompt or (
        f"Você é o Agente de Materiais FLG — especialista em estruturar e desenvolver "
        f"materiais estratégicos para founders.\n\n"
        f"CLIENTE ATIVO: {cliente.get('nome')} | "
        f"Empresa: {cliente.get('empresa')} | "
        f"Encontro atual: {cliente.get('encontro_atual', 1)}\n\n"
        f"Pergunte qual material deseja desenvolver hoje."
    )

    session_id = body.session_id or f"materiais_{client_id}"
    agent = create_flg_agent(system_prompt=system_prompt, session_id=session_id)

    async def stream_generator():
        async for chunk in agent.arun(body.message, stream=True, session_id=session_id):
            if hasattr(chunk, "content") and chunk.content and isinstance(chunk.content, str):
                yield f"data: {json.dumps({'type': 'text_delta', 'content': chunk.content})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'trigger_slides': False})}\n\n"

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


# ─── Chat Copywriter (SSE) ────────────────────────────────────────────────────
class CopywriterMessage(BaseModel):
    message: str
    session_id: Optional[str] = None
    tipo_material: Optional[str] = None


@app.post("/chat-copywriter/{client_id}")
async def chat_copywriter(
    client_id: str,
    body: CopywriterMessage,
    user=Depends(get_current_user),
):
    """Chat do Copywriter FLG — usa system prompt de agentes_config."""
    from tools.client_tools import get_client_profile
    import json as _json

    cliente_json = get_client_profile(client_id)
    cliente = _json.loads(cliente_json)
    if "erro" in cliente:
        raise HTTPException(status_code=404, detail=cliente["erro"])

    config_row = _supabase.table("agentes_config").select("system_prompt_base, diretrizes").eq(
        "agente_tipo", "copywriter"
    ).single().execute()
    base_prompt = config_row.data.get("system_prompt_base", "") if config_row.data else ""
    diretrizes = config_row.data.get("diretrizes", "") if config_row.data else ""

    system_prompt = base_prompt or (
        f"Você é o Copywriter FLG — especialista em copy estratégica para founders de alto nível.\n\n"
        f"CLIENTE: {cliente.get('nome')} | Empresa: {cliente.get('empresa')}\n"
        f"Tom de voz: {cliente.get('tom_de_voz', 'Profissional e direto')}\n"
        f"Material solicitado: {body.tipo_material or 'não especificado'}\n\n"
        f"{diretrizes}"
    )

    session_id = body.session_id or f"copy_{client_id}_{body.tipo_material or 'geral'}"
    agent = create_flg_agent(system_prompt=system_prompt, session_id=session_id)

    async def stream_generator():
        async for chunk in agent.arun(body.message, stream=True, session_id=session_id):
            if hasattr(chunk, "content") and chunk.content and isinstance(chunk.content, str):
                yield f"data: {json.dumps({'type': 'text_delta', 'content': chunk.content})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'trigger_slides': False})}\n\n"

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


# ─── Chat Intelecto (SSE) ─────────────────────────────────────────────────────
@app.post("/chat-intelecto/{encontro_numero}")
async def chat_intelecto(
    encontro_numero: int,
    body: ChatMessage,
    user=Depends(get_current_user),
):
    """Chat para Pedro desenvolver o conteúdo intelectual de um encontro."""
    from tools.client_tools import get_encontro_base
    import json as _json

    encontro_json = get_encontro_base(encontro_numero)
    encontro = _json.loads(encontro_json)

    system_prompt = (
        f"Você é o assistente de desenvolvimento intelectual da FLG.\n\n"
        f"ENCONTRO {encontro_numero}: {encontro.get('nome', '')}\n"
        f"Objetivo: {encontro.get('objetivo_estrategico', '')}\n\n"
        f"Conteúdo atual:\n{encontro.get('intelecto_base', '(vazio)')}\n\n"
        f"Ajude a desenvolver e aprofundar o conteúdo intelectual deste encontro."
    )

    session_id = body.session_id or f"intelecto_{encontro_numero}"
    agent = create_flg_agent(system_prompt=system_prompt, session_id=session_id)

    async def stream_generator():
        async for chunk in agent.arun(body.message, stream=True, session_id=session_id):
            if hasattr(chunk, "content") and chunk.content and isinstance(chunk.content, str):
                yield f"data: {json.dumps({'type': 'text_delta', 'content': chunk.content})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'trigger_slides': False})}\n\n"

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )
