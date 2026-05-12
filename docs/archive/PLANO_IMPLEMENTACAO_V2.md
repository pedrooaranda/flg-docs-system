# Plano de Implementação V2 — FLG Jornada System

**Data:** 31/03/2026
**Stack:** FastAPI + Supabase (pgvector) + React + Claude API
**Princípio:** Zero breaking changes — cada feature é aditiva

---

## Visão Geral das 5 Features

| # | Feature | Complexidade | Dependência Externa |
|---|---------|-------------|---------------------|
| 1 | Google Drive RAG (IA lê materiais dos clientes) | Alta | Google Cloud Project + OAuth |
| 2 | Agente Google Calendar + ClickUp → Dashboard | Média | Google Calendar OAuth + ClickUp Webhooks |
| 3 | Importar clientes do ClickUp para o banco | Baixa | ClickUp API Token (já existe) |
| 4 | Banco de notas do consultor por cliente | Baixa | Nenhuma |
| 5 | Painel de gerenciamento de consultores (Admin) | Média | Nenhuma |

**Ordem recomendada:** 4 → 3 → 5 → 2 → 1
(do mais simples ao mais complexo, cada um construindo sobre o anterior)

---

## Feature 4 — Notas do Consultor por Cliente
*Complexidade: Baixa | Tempo: ~2h | Zero dependências externas*

### Por que primeiro?
Valor imediato, zero dependência externa, e estabelece um padrão que será usado nas outras features.

### Schema (migration 005)
```sql
CREATE TABLE IF NOT EXISTS notas_consultor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    consultor_email TEXT NOT NULL,
    tipo VARCHAR(30) DEFAULT 'geral',
    -- tipos: geral, percepcao, trava, evolucao, alerta, tarefa
    conteudo TEXT NOT NULL,
    fixada BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notas_cliente ON notas_consultor(cliente_id, created_at DESC);
```

### Backend
- `GET /notas/{cliente_id}` — listar notas (filtro por tipo)
- `POST /notas/{cliente_id}` — criar nota
- `PATCH /notas/{nota_id}` — editar/fixar
- `DELETE /notas/{nota_id}` — deletar

### Frontend
- Aba "Notas" no PerfilCliente.jsx
- Input de texto com seletor de tipo (chip selector)
- Timeline de notas com avatar do consultor e timestamp
- Notas fixadas aparecem no topo
- Admin vê notas de todos os consultores; consultor vê só as suas

### Impacto nos agentes
- O agente de preparação de encontro (`agente_flg.py`) passa a receber
  as últimas 5 notas do cliente no system prompt — contexto humano

---

## Feature 3 — Importar Clientes do ClickUp
*Complexidade: Baixa | Tempo: ~3h | Usa ClickUp API Token já existente*

### Contexto
Já temos `clickup_api_token` no .env e `clickup_task_id` no schema.
O que falta: puxar TODOS os clientes de uma List no ClickUp e criar/atualizar no Supabase.

### Abordagem
```
ClickUp List (Clientes Ativos)
   └─ Task = um cliente
       ├─ Task Name → clientes.nome
       ├─ Custom Field "Empresa" → clientes.empresa
       ├─ Custom Field "Consultor" → clientes.consultor_responsavel
       ├─ Custom Field "Etapa" → clientes.encontro_atual
       ├─ Status → clientes.status (ativo/pausado/concluido)
       └─ Task ID → clientes.clickup_task_id
```

### Backend
- `POST /admin/clickup/import` — importação bulk (admin only)
  - Pagina `GET /api/v2/list/{list_id}/task?page=N`
  - Para cada task: upsert em `clientes` por `clickup_task_id`
  - Retorna `{ importados: 12, atualizados: 3, erros: 0 }`

- `POST /admin/clickup/webhook` — endpoint para receber webhooks
  - Registrar: `POST /api/v2/team/{team_id}/webhook` com endpoint
  - Eventos: `taskCreated`, `taskUpdated`, `taskStatusUpdated`
  - No payload: buscar task atualizada e upsert no Supabase

### Config (adicionar ao .env)
```env
CLICKUP_LIST_ID=901234567890  # ID da lista de clientes no ClickUp
CLICKUP_TEAM_ID=1234567       # ID do workspace para webhooks
```

### Frontend
- Botão "Importar do ClickUp" no AdminPanel
- Mostra progresso e resultado da importação
- Mapeador de campos (se os custom fields tiverem nomes diferentes)

---

## Feature 5 — Painel de Gerenciamento de Consultores (Admin)
*Complexidade: Média | Tempo: ~4h | Depende da Feature 4 (notas)*

### O que mostra
Dashboard exclusivo para Admin com visão de TODOS os consultores:

| Consultor | Clientes | Reuniões/mês | Materiais | Copies | Nota média |
|-----------|----------|-------------|-----------|--------|-----------|
| Carlos    | 8        | 24          | 12        | 18     | 4.2★      |
| Maria     | 5        | 15          | 8         | 11     | 3.8★      |

### Dados já disponíveis no banco
- `clientes.consultor_responsavel` → qtd clientes por consultor
- `materiais_copy.consultor_email` → qtd materiais produzidos
- `conversas_agente` → qtd de interações com os agentes IA
- `encontros_realizados` → qtd de encontros realizados
- `notas_consultor` (Feature 4) → qtd de notas escritas

### Backend
- `GET /admin/consultores` — lista agregada de métricas por consultor
  - Agrega: COUNT(clientes), COUNT(materiais), COUNT(encontros),
    COUNT(notas), COUNT(conversas)
  - Tudo via queries no Supabase, sem tabela nova

### Frontend
- Nova rota `/admin/consultores`
- Nav item no Sidebar (admin only): "Consultores"
- Cards com métricas por consultor
- Drill-down: clicar no consultor → ver seus clientes + atividade
- Filtros de período (30d, 90d, all-time)

---

## Feature 2 — Agente Calendar + ClickUp → Dashboard
*Complexidade: Média | Tempo: ~6h | Precisa: Google Cloud OAuth*

### Arquitetura
```
Google Calendar ──webhook──→ FastAPI /webhooks/calendar
                                │
                          Upsert reunioes table
                                │
ClickUp ──────webhook──→ FastAPI /webhooks/clickup
                                │
                          Upsert clientes (etapa/status)
                                │
                    Dashboard mostra timeline unificada
```

### Schema (migration 006)
```sql
CREATE TABLE IF NOT EXISTS reunioes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,          -- Google Calendar event ID
    calendar_id TEXT,
    titulo TEXT,
    data_inicio TIMESTAMPTZ NOT NULL,
    data_fim TIMESTAMPTZ,
    participantes JSONB DEFAULT '[]', -- [{email, name, response}]
    local TEXT,
    encontro_numero INT,             -- mapeado automaticamente
    notas TEXT,
    fonte VARCHAR(20) DEFAULT 'calendar',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id)
);
```

### Fluxo de sincronização
1. Admin conecta Google Calendar via OAuth (mesmo flow de conexões)
2. Sync incremental a cada 15 min (sync tokens do Calendar API)
3. Match automático: `event.attendees[].email` → `clientes.email`
4. Se o título contém "Encontro X" → `reunioes.encontro_numero = X`
5. Dashboard mostra: próximas reuniões, reuniões realizadas, timeline

### Config
```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
```
*(Mesmo projeto Google Cloud já usado para YouTube)*

### Frontend
- Widget "Próximas Reuniões" no Dashboard.jsx
- Timeline de reuniões no PerfilCliente.jsx
- Contador automático de encontros realizados

---

## Feature 1 — Google Drive RAG (IA lê materiais)
*Complexidade: Alta | Tempo: ~10h | Precisa: Google Cloud + pgvector*

### O que resolve
Hoje os agentes têm contexto limitado sobre cada cliente. Com Drive RAG,
a IA acessa apresentações, planilhas, PDFs, docs — tudo que o cliente
compartilha — e usa como insumo para copies e preparação de materiais.

### Arquitetura RAG
```
Google Drive (pasta do cliente)
       │
   [Drive API v3]
       │
   Extrai texto (Docs→plain text, PDF→pymupdf)
       │
   Chunking (512-1024 tokens, overlap 15%)
       │
   Embedding (text-embedding-3-small, OpenAI)
       │
   pgvector (Supabase) ← documentos_embedding table
       │
   Na hora do chat: busca top-5 chunks relevantes
       │
   Injeta no system prompt do agente
```

### Schema (migration 007)
```sql
-- Habilitar extensão pgvector no Supabase
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS drive_documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    drive_file_id TEXT NOT NULL,
    nome_arquivo TEXT NOT NULL,
    mime_type TEXT,
    drive_modified_time TIMESTAMPTZ,
    texto_extraido TEXT,
    status VARCHAR(20) DEFAULT 'pendente',
    -- pendente, processando, indexado, erro
    ultimo_erro TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cliente_id, drive_file_id)
);

CREATE TABLE IF NOT EXISTS drive_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_id UUID REFERENCES drive_documentos(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL,
    chunk_index INT NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding vector(1536),  -- text-embedding-3-small dimension
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice IVFFlat para busca vetorial rápida
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
    ON drive_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

### Backend
- `POST /drive/{cliente_id}/connect` — OAuth Google Drive (scope: `drive.readonly`)
- `POST /drive/{cliente_id}/sync` — escanear pasta, extrair texto, embedar
- `GET /drive/{cliente_id}/search?q=proposta comercial` — busca semântica
- Scheduler: re-sync a cada 6h, verificando `modifiedTime` dos arquivos

### Integração com agentes
```python
# No build_system_prompt():
def get_rag_context(cliente_id: str, query: str, top_k: int = 5) -> str:
    """Busca os chunks mais relevantes para a query do consultor."""
    query_embedding = openai.embeddings.create(input=query, model="text-embedding-3-small")
    results = supabase.rpc("match_embeddings", {
        "query_embedding": query_embedding,
        "match_count": top_k,
        "filter_cliente": cliente_id,
    }).execute()
    return "\n---\n".join(r["chunk_text"] for r in results.data)
```

### Dependências novas
```
openai>=1.0          # embeddings (text-embedding-3-small)
pymupdf>=1.24        # PDF text extraction
```
*(Não usar langchain — overhead desnecessário para nosso caso)*

### Config
```env
OPENAI_API_KEY=sk-xxx           # Para embeddings
GOOGLE_CLIENT_ID=xxx            # Mesmo da Feature 2
GOOGLE_CLIENT_SECRET=xxx        # Mesmo da Feature 2
```

### Frontend
- Seção "Documentos Drive" no PerfilCliente.jsx
- Lista de arquivos sincronizados com status
- Botão "Conectar Google Drive" por cliente
- No chat do agente: badge "RAG ativo" quando há contexto do Drive

---

## Resumo de Dependências Externas

### Google Cloud (1 projeto para tudo)
1. Criar projeto no Google Cloud Console
2. Ativar APIs: Drive v3, Calendar v3, YouTube Data v3
3. Criar OAuth 2.0 Client ID (tipo: Web Application)
4. Redirect URIs: `https://docs.foundersledgrowth.online/api/conexoes/callback/youtube`
   (e equivalentes para drive/calendar)

### OpenAI (apenas para embeddings)
- API key para `text-embedding-3-small`
- Custo: ~$0.02 por 1M tokens (~500 documentos médios)
- Alternativa futura: Anthropic embeddings quando disponíveis

### ClickUp (já configurado)
- Token API já existe no .env
- Adicionar: `CLICKUP_LIST_ID` e `CLICKUP_TEAM_ID`

---

## Cronograma Sugerido

```
Semana 1: Feature 4 (Notas) + Feature 3 (Import ClickUp)
           └─ Entregam valor imediato, zero dependência externa

Semana 2: Feature 5 (Painel Consultores)
           └─ Usa dados de F3 e F4

Semana 3: Feature 2 (Calendar + ClickUp → Dashboard)
           └─ Precisa configurar Google Cloud

Semana 4: Feature 1 (Drive RAG)
           └─ A mais complexa, usa infraestrutura de Google Cloud da F2
```

---

## Env Vars Finais (todas as features)

```env
# Já existentes
ANTHROPIC_API_KEY=xxx
SUPABASE_URL=xxx
SUPABASE_KEY=xxx
SUPABASE_DB_URL=xxx
CLICKUP_API_TOKEN=xxx

# Novos — Feature 1 + 2
OPENAI_API_KEY=sk-xxx
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# Novos — Feature 3
CLICKUP_LIST_ID=xxx
CLICKUP_TEAM_ID=xxx

# Já planejados (social connections)
META_APP_ID=xxx
META_APP_SECRET=xxx
LINKEDIN_CLIENT_ID=xxx
LINKEDIN_CLIENT_SECRET=xxx
TIKTOK_CLIENT_KEY=xxx
TIKTOK_CLIENT_SECRET=xxx
```

---

## Princípios de Implementação

1. **Aditivo, nunca destrutivo** — nenhuma feature altera código existente de forma breaking
2. **Mock-first** — cada feature funciona com dados mock antes de integrar a API real
3. **Graceful degradation** — se uma API falha, o sistema continua funcionando com dados anteriores
4. **Schema flexível** — campos JSONB para dados plataforma-específicos
5. **Observabilidade** — cada sync/import loga sucesso/falha com contexto suficiente
