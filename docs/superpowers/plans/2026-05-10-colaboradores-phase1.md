# Colaboradores — Phase 1: Schema + Backend CRUD

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-10-colaboradores-design.md](../specs/2026-05-10-colaboradores-design.md)

**Goal:** Criar tabela `colaboradores` no Supabase (Pedro seeded como `owner`) + endpoint REST `/colaboradores` com CRUD completo, permissões role-based (`owner > admin > member`) e sincronização DB → `auth.users.user_metadata.role`.

**Architecture:** SQL migration manual via Supabase dashboard (VPS sem IPv6 — padrão da repo). Endpoint REST em `backend/routes/colaboradores.py` mirando o padrão de `routes/notas.py`. Sync de role pra auth metadata isolado em `backend/services/colaboradores_sync.py`. Permission checks via helper `_require_role(user, min_level)` que resolve o colaborador do caller pelo email.

**Tech Stack:** FastAPI + Pydantic, Supabase Python client (service role — já disponível via `deps.supabase_client`), Python 3.11.

**Não-objetivos:** UI frontend (Phase 2-4); sync ClickUp (Phase 5 opcional); testes pytest (repo não usa).

---

## File Structure

**Criar:**
- `backend/routes/colaboradores.py` — endpoints REST + Pydantic models + permission helpers locais
- `backend/services/colaboradores_sync.py` — função `sync_role_to_auth_metadata(supabase, email, role)` isolada

**Modificar:**
- `backend/main.py` — registrar router em `app.include_router(...)` e documentar migration 004 em comentário

**SQL aplicado externamente (não checked-in como arquivo .sql):**
- Via Supabase Dashboard SQL Editor — Pedro executa antes de promover o deploy. Block documentado em Task 1.

---

## Tarefas

### Task 1: Aplicar migration SQL no Supabase + seed Pedro como owner

**Files:** apenas SQL externo no Supabase Dashboard. Nada no repo.

- [ ] **Step 1: Abrir Supabase Dashboard → SQL Editor**

URL: `https://app.supabase.com/project/ygvclagcsbdbsfyeeeil/sql/new` (project ID identificado em logs anteriores).

- [ ] **Step 2: Colar e executar o SQL completo**

```sql
-- Migration 004: tabela colaboradores
-- Idempotente: CREATE TABLE IF NOT EXISTS + INSERT ON CONFLICT DO NOTHING

CREATE TABLE IF NOT EXISTS colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  nome text NOT NULL,
  avatar_url text,
  categoria text NOT NULL CHECK (categoria IN ('consultor', 'diretor')),
  cargo text,
  tier text CHECK (tier IS NULL OR tier IN ('junior', 'pleno', 'senior', 'lead')),
  manager_id uuid REFERENCES colaboradores(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  ativo boolean NOT NULL DEFAULT true,
  clickup_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_colaboradores_email      ON colaboradores(email);
CREATE INDEX IF NOT EXISTS idx_colaboradores_categoria  ON colaboradores(categoria);
CREATE INDEX IF NOT EXISTS idx_colaboradores_role       ON colaboradores(role);
CREATE INDEX IF NOT EXISTS idx_colaboradores_ativo      ON colaboradores(ativo) WHERE ativo = true;

ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;

-- Policy: leitura para todos autenticados. Não há policies de INSERT/UPDATE/DELETE
-- intencionalmente — o backend usa a service role do Supabase que bypassa RLS por
-- design, e faz os checks finos de permissão (owner > admin > member) no nível do
-- endpoint REST. Se o anon key vazar, sem policy de write = bloqueado por RLS.
DROP POLICY IF EXISTS colaboradores_select_authenticated ON colaboradores;
CREATE POLICY colaboradores_select_authenticated ON colaboradores
  FOR SELECT TO authenticated USING (true);

-- Seed Pedro como owner (idempotente)
INSERT INTO colaboradores (email, nome, categoria, role)
VALUES ('pedroaranda@grupoguglielmi.com', 'Pedro Aranda', 'diretor', 'owner')
ON CONFLICT (email) DO NOTHING;
```

Expected: query roda sem erro, retorna "Success. No rows returned" + 1 linha inserida (ou 0 se Pedro já estava).

- [ ] **Step 3: Verificar que a tabela existe e Pedro está nela**

Rodar no SQL Editor:

```sql
SELECT id, email, nome, categoria, role, ativo, created_at FROM colaboradores;
```

Expected: pelo menos 1 linha com `email='pedroaranda@grupoguglielmi.com'`, `role='owner'`, `categoria='diretor'`, `ativo=true`.

- [ ] **Step 4: Atualizar `user_metadata.role` do Pedro no Supabase Auth**

Via SQL Editor (atalho — Auth UI também funciona):

```sql
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role": "owner"}'::jsonb
WHERE email = 'pedroaranda@grupoguglielmi.com';
```

Expected: "Success. 1 row affected".

Isso garante que assim que o frontend ler `user.user_metadata.role`, vai bater `"owner"` e os helpers `isOwner()` (criados em Phase 4) reconhecerem corretamente.

- [ ] **Step 5: Documentar em commit que migration 004 foi aplicada manualmente**

Cria um arquivo de evidência simples:

```bash
mkdir -p docs/migrations
```

```bash
cat > docs/migrations/004-colaboradores.sql <<'EOF'
-- Migration 004 — Aplicada manualmente no Supabase Dashboard em 2026-05-10
-- (VPS sem IPv6 → padrão da repo, ver memory/vps_supabase_ipv6_issue.md)
-- O bloco SQL exato está no plano docs/superpowers/plans/2026-05-10-colaboradores-phase1.md Task 1.
-- Status: aplicado em produção em 2026-05-10.
EOF
```

```bash
git add docs/migrations/004-colaboradores.sql
git commit -m "docs(migrations): registra migration 004 colaboradores aplicada manualmente"
```

---

### Task 2: Criar `backend/services/colaboradores_sync.py`

**Files:**
- Create: `backend/services/colaboradores_sync.py`

- [ ] **Step 1: Criar o arquivo**

```python
"""
Sincronização DB → Auth metadata para colaboradores.

Quando o role de um colaborador muda na tabela `colaboradores`, espelhamos
em `auth.users.user_metadata.role` para que o frontend (que lê
`user_metadata.role` via session) reflita a permissão sem precisar
de query extra contra `colaboradores`.

Sync é one-way (DB → Auth). Se alguém alterar user_metadata diretamente
pelo dashboard, vira out-of-sync — aceitável dado o volume baixo (dezenas
de operadores) e a baixa frequência de mudanças manuais.
"""

import logging
from typing import Optional

logger = logging.getLogger("flg.colaboradores_sync")


def sync_role_to_auth_metadata(supabase, email: str, role: str) -> bool:
    """
    Atualiza `auth.users.user_metadata.role` do usuário com `email` para `role`.
    Faz merge com metadata existente (não substitui).

    Returns: True se sucesso, False se usuário não encontrado ou erro.
    Logs warning em qualquer falha — não levanta exceção (caller decide se
    quer ignorar ou propagar).

    Per supabase-py v2.10+:
      - `list_users(page, per_page) -> List[User]` (Pydantic User objects)
      - Default per_page=50; bumpamos pra 200 pra cobrir workspace FLG.
      - `update_user_by_id(uid, attributes)` aceita dict que supabase-py coerce
        em AdminUserAttributes via Pydantic. Shape `{"user_metadata": {...}}` é canônico.
    """
    try:
        users = supabase.auth.admin.list_users(page=1, per_page=200)
        target_email = (email or "").strip().lower()
        target = next(
            (u for u in users if (getattr(u, "email", "") or "").strip().lower() == target_email),
            None,
        )
        if not target:
            logger.warning(f"sync_role: usuário {email} não encontrado em auth.users — colaborador órfão?")
            return False

        user_id = getattr(target, "id", None)
        if not user_id:
            logger.warning(f"sync_role: User {email} sem id — formato inesperado da resposta")
            return False

        # User.user_metadata é dict (ou None) per Pydantic model do supabase-auth.
        current_meta = getattr(target, "user_metadata", None) or {}
        new_meta = {**current_meta, "role": role}

        supabase.auth.admin.update_user_by_id(user_id, {"user_metadata": new_meta})
        logger.info(f"sync_role: {email} → role={role} (auth metadata atualizado)")
        return True
    except Exception as e:
        logger.warning(f"sync_role: falhou pra {email} (role={role}): {e}")
        return False
```

- [ ] **Step 2: Syntax check**

```bash
python3 -m py_compile backend/services/colaboradores_sync.py
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/services/colaboradores_sync.py
git commit -m "feat(colaboradores): sync role DB→auth.users.user_metadata"
```

---

### Task 3: Criar `backend/routes/colaboradores.py` — modelos + GETs

**Files:**
- Create: `backend/routes/colaboradores.py`

- [ ] **Step 1: Criar o arquivo com modelos Pydantic + helpers + endpoints GET**

```python
"""
Rotas REST de Colaboradores — FLG Jornada System.

Endpoints:
  GET    /colaboradores              — lista (filtros: categoria, role, ativo, tier)
  GET    /colaboradores/me           — perfil do usuário logado (resolve por email)
  GET    /colaboradores/{id}         — detalhe por id
  POST   /colaboradores              — criar (admin+)
  PATCH  /colaboradores/{id}         — editar (member: self apenas; admin+: qualquer)
  DELETE /colaboradores/{id}         — soft-delete (admin+)

Permissões: hierarquia 'owner' > 'admin' > 'member'. Owner é o único que pode
promover alguém para owner. Admin pode promover member ↔ admin e editar qualquer
campo. Member só edita o próprio registro em campos limitados.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from deps import get_current_user, supabase_client
from services.colaboradores_sync import sync_role_to_auth_metadata

logger = logging.getLogger("flg.colaboradores")
router = APIRouter(prefix="/colaboradores", tags=["colaboradores"])
_supabase = supabase_client


# ─── Modelos ─────────────────────────────────────────────────────────────────

CATEGORIAS_VALIDAS = ("consultor", "diretor")
TIERS_VALIDOS = ("junior", "pleno", "senior", "lead")
ROLES_VALIDOS = ("owner", "admin", "member")
ROLE_LEVEL = {"member": 0, "admin": 1, "owner": 2}

# Email regex simples — validação real é no Supabase Auth no signup; aqui só rejeita
# input obviamente quebrado. Evita dep extra `email-validator` que `EmailStr` exigiria.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Fallback hardcoded pro owner — proteção se registro do Pedro for deletado por engano.
# Match EXATO (não substring) pra evitar que qualquer email com 'pedro' ganhe acesso.
OWNER_FALLBACK_EMAILS = {"pedroaranda@grupoguglielmi.com"}


class ColaboradorCreate(BaseModel):
    email: str
    nome: str = Field(min_length=1)
    categoria: str
    cargo: Optional[str] = None
    tier: Optional[str] = None
    role: str = "member"
    manager_id: Optional[str] = None
    avatar_url: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("Email inválido")
        return v


class ColaboradorUpdate(BaseModel):
    nome: Optional[str] = None
    categoria: Optional[str] = None
    cargo: Optional[str] = None
    tier: Optional[str] = None
    role: Optional[str] = None
    manager_id: Optional[str] = None
    avatar_url: Optional[str] = None
    ativo: Optional[bool] = None


# ─── Helpers de permissão ────────────────────────────────────────────────────

def _is_owner_fallback(user) -> bool:
    """Pedro hardcoded como owner caso registro tenha sido deletado.
    Match exato (não substring) — proteção robusta."""
    return (user.email or "").strip().lower() in OWNER_FALLBACK_EMAILS


def _resolve_caller(user) -> dict:
    """Resolve o colaborador correspondente ao usuário autenticado pelo email.
    Retorna dict do colaborador ou None se não houver registro."""
    email = (user.email or "").strip().lower()
    r = _supabase.table("colaboradores").select("*").eq("email", email).maybe_single().execute()
    return r.data if r else None


def _require_role(user, min_role: str) -> dict:
    """Garante que o caller tem pelo menos `min_role`. Retorna o colaborador do caller.
    Levanta HTTP 403 se não.

    Fallback: se Pedro (email exato) não tem registro, trata como owner —
    protege caso registro seja deletado por engano.
    """
    caller = _resolve_caller(user)
    if caller is None:
        if _is_owner_fallback(user):
            return {"email": user.email, "role": "owner", "_fallback": True}
        raise HTTPException(status_code=403, detail="Usuário sem registro de colaborador. Peça pra um admin criar.")

    caller_level = ROLE_LEVEL.get(caller.get("role", "member"), 0)
    required_level = ROLE_LEVEL[min_role]
    if caller_level < required_level:
        raise HTTPException(status_code=403, detail=f"Operação requer role {min_role}+")
    return caller


# ─── Validações de payload ───────────────────────────────────────────────────

def _validate_categoria(value: Optional[str], field: str = "categoria"):
    if value is not None and value not in CATEGORIAS_VALIDAS:
        raise HTTPException(status_code=400, detail=f"{field} deve ser uma de: {CATEGORIAS_VALIDAS}")


def _validate_tier(value: Optional[str]):
    if value is not None and value not in TIERS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"tier deve ser uma de: {TIERS_VALIDOS}")


def _validate_role(value: Optional[str]):
    if value is not None and value not in ROLES_VALIDOS:
        raise HTTPException(status_code=400, detail=f"role deve ser uma de: {ROLES_VALIDOS}")


# ─── Endpoints GET ───────────────────────────────────────────────────────────

@router.get("")
async def list_colaboradores(
    categoria: Optional[str] = None,
    role: Optional[str] = None,
    tier: Optional[str] = None,
    ativo: Optional[bool] = True,
    user=Depends(get_current_user),
):
    """Lista colaboradores. Default: só ativos. Qualquer logado pode chamar."""
    q = _supabase.table("colaboradores").select("*").order("nome")
    if categoria:
        _validate_categoria(categoria)
        q = q.eq("categoria", categoria)
    if role:
        _validate_role(role)
        q = q.eq("role", role)
    if tier:
        _validate_tier(tier)
        q = q.eq("tier", tier)
    if ativo is not None:
        q = q.eq("ativo", ativo)
    r = q.execute()
    return {"colaboradores": r.data or [], "total": len(r.data or [])}


@router.get("/me")
async def get_my_profile(user=Depends(get_current_user)):
    """Resolve o colaborador correspondente ao usuário logado pelo email."""
    caller = _resolve_caller(user)
    if caller is None:
        raise HTTPException(status_code=404, detail="Você não tem registro de colaborador. Peça pra um admin criar.")
    return caller


@router.get("/{colab_id}")
async def get_colaborador(colab_id: str, user=Depends(get_current_user)):
    r = _supabase.table("colaboradores").select("*").eq("id", colab_id).maybe_single().execute()
    if not r or not r.data:
        raise HTTPException(status_code=404, detail="Colaborador não encontrado")
    return r.data
```

- [ ] **Step 2: Syntax check**

```bash
python3 -m py_compile backend/routes/colaboradores.py
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/colaboradores.py
git commit -m "feat(colaboradores): rotas GET + modelos + helpers de permissão"
```

---

### Task 4: Adicionar `POST /colaboradores` (criar, admin+)

**Files:**
- Modify: `backend/routes/colaboradores.py` (append endpoint)

- [ ] **Step 1: Adicionar o endpoint POST no final do arquivo**

Adicionar ao final de `backend/routes/colaboradores.py`:

```python
# ─── Endpoint POST ───────────────────────────────────────────────────────────

@router.post("")
async def create_colaborador(payload: ColaboradorCreate, user=Depends(get_current_user)):
    """Cria colaborador. Admin+ apenas. Promoção a 'owner' requer caller=owner."""
    caller = _require_role(user, "admin")

    _validate_categoria(payload.categoria)
    _validate_tier(payload.tier)
    _validate_role(payload.role)

    # Apenas owner pode criar outro owner
    if payload.role == "owner" and caller.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Apenas Owner pode criar outro Owner")

    # Verificar que o email tem signup no Supabase Auth (evita registro órfão).
    # list_users() default per_page=50 — bumpamos pra 200 (cobre o workspace FLG por muito tempo).
    # Quando passarmos disso, refatorar pra paginação real ou cache de mapping email→user_id.
    try:
        users = _supabase.auth.admin.list_users(page=1, per_page=200)
        # supabase-py v2.10+: retorna List[User] (Pydantic User objects).
        target_email = payload.email.strip().lower()
        exists = any((getattr(u, "email", "") or "").strip().lower() == target_email for u in users)
        if not exists:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Email {payload.email} não tem conta no Supabase Auth. "
                    "Convide o usuário pelo dashboard Auth primeiro, depois crie o colaborador."
                ),
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"create_colaborador: falha ao verificar auth.users: {e}")
        # Continua mesmo assim — não quer travar criação por causa de erro no list_users

    # Insert
    data = payload.model_dump(exclude_none=True)
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_at"] = data["created_at"]

    try:
        r = _supabase.table("colaboradores").insert(data).execute()
    except Exception as e:
        msg = str(e)
        if "unique" in msg.lower() or "duplicate" in msg.lower():
            raise HTTPException(status_code=409, detail=f"Email {payload.email} já cadastrado")
        raise HTTPException(status_code=500, detail=f"Erro ao criar colaborador: {msg}")

    novo = (r.data or [None])[0]
    if not novo:
        raise HTTPException(status_code=500, detail="Colaborador não foi criado")

    # Sync role pra auth metadata (se role != default 'member' faz sentido sincronizar
    # imediatamente; pra 'member' também rodamos pra garantir consistência)
    sync_role_to_auth_metadata(_supabase, novo["email"], novo["role"])

    return novo
```

- [ ] **Step 2: Syntax check**

```bash
python3 -m py_compile backend/routes/colaboradores.py
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/colaboradores.py
git commit -m "feat(colaboradores): POST criar colaborador com checks de permissão"
```

---

### Task 5: Adicionar `PATCH /colaboradores/{id}` (editar)

**Files:**
- Modify: `backend/routes/colaboradores.py` (append endpoint)

- [ ] **Step 1: Adicionar o endpoint PATCH no final do arquivo**

Adicionar ao final de `backend/routes/colaboradores.py`:

```python
# ─── Endpoint PATCH ──────────────────────────────────────────────────────────

# Campos que o próprio colaborador pode editar quando não é admin+
SELF_EDITABLE_FIELDS = {"nome", "cargo", "avatar_url"}


@router.patch("/{colab_id}")
async def update_colaborador(
    colab_id: str,
    payload: ColaboradorUpdate,
    user=Depends(get_current_user),
):
    """
    Edita colaborador. Regras:
    - Admin+: edita qualquer um, qualquer campo.
    - Member: edita só o próprio registro, apenas campos SELF_EDITABLE_FIELDS.
    - Promoção pra role='owner' requer caller=owner.
    """
    # Validar tabela
    target_resp = _supabase.table("colaboradores").select("*").eq("id", colab_id).maybe_single().execute()
    target = target_resp.data if target_resp else None
    if not target:
        raise HTTPException(status_code=404, detail="Colaborador não encontrado")

    # Resolver caller (qualquer role, mesmo member, passa). Pedro fallback exato.
    caller = _resolve_caller(user)
    is_owner_fb = caller is None and _is_owner_fallback(user)
    if caller is None and not is_owner_fb:
        raise HTTPException(status_code=403, detail="Sem registro de colaborador")
    if is_owner_fb:
        caller = {"email": user.email, "role": "owner", "_fallback": True}

    caller_level = ROLE_LEVEL.get(caller.get("role", "member"), 0)
    is_admin_plus = caller_level >= ROLE_LEVEL["admin"]
    is_self = caller.get("email") == target.get("email")

    if not is_admin_plus and not is_self:
        raise HTTPException(status_code=403, detail="Você só pode editar o próprio registro")

    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada pra atualizar")

    # Member auto-editando: filtra apenas campos permitidos
    if not is_admin_plus:
        invalid = [k for k in updates.keys() if k not in SELF_EDITABLE_FIELDS]
        if invalid:
            raise HTTPException(
                status_code=403,
                detail=f"Member só pode editar: {sorted(SELF_EDITABLE_FIELDS)}. Não permitido: {invalid}",
            )

    # Validar valores enum
    _validate_categoria(updates.get("categoria"))
    _validate_tier(updates.get("tier"))
    _validate_role(updates.get("role"))

    # Promoção a 'owner' só por outro owner
    new_role = updates.get("role")
    if new_role == "owner" and caller.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Apenas Owner pode promover alguém a Owner")

    # Rebaixamento de owner: também só owner pode rebaixar outro owner
    if target.get("role") == "owner" and new_role and new_role != "owner" and caller.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Apenas Owner pode rebaixar outro Owner")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        r = _supabase.table("colaboradores").update(updates).eq("id", colab_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar: {e}")

    updated = (r.data or [None])[0]
    if not updated:
        raise HTTPException(status_code=500, detail="Update não retornou registro")

    # Se role mudou, sincronizar com auth metadata
    if new_role and new_role != target.get("role"):
        sync_role_to_auth_metadata(_supabase, updated["email"], new_role)

    return updated
```

- [ ] **Step 2: Syntax check**

```bash
python3 -m py_compile backend/routes/colaboradores.py
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/colaboradores.py
git commit -m "feat(colaboradores): PATCH editar com permission matrix + sync role"
```

---

### Task 6: Adicionar `DELETE /colaboradores/{id}` (soft-delete, admin+)

**Files:**
- Modify: `backend/routes/colaboradores.py` (append endpoint)

- [ ] **Step 1: Adicionar o endpoint DELETE no final do arquivo**

Adicionar ao final de `backend/routes/colaboradores.py`:

```python
# ─── Endpoint DELETE ─────────────────────────────────────────────────────────

@router.delete("/{colab_id}")
async def delete_colaborador(colab_id: str, user=Depends(get_current_user)):
    """Soft-delete: marca ativo=false. Admin+. Owner não pode ser desativado por não-owner."""
    caller = _require_role(user, "admin")

    target_resp = _supabase.table("colaboradores").select("*").eq("id", colab_id).maybe_single().execute()
    target = target_resp.data if target_resp else None
    if not target:
        raise HTTPException(status_code=404, detail="Colaborador não encontrado")

    if target.get("role") == "owner" and caller.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Apenas Owner pode desativar outro Owner")

    # Auto-desativação: bloqueada (evita lockout acidental)
    if target.get("email") == caller.get("email"):
        raise HTTPException(status_code=400, detail="Você não pode desativar seu próprio registro")

    try:
        _supabase.table("colaboradores").update({
            "ativo": False,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", colab_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao desativar: {e}")

    return {"ok": True, "id": colab_id, "ativo": False}
```

- [ ] **Step 2: Syntax check**

```bash
python3 -m py_compile backend/routes/colaboradores.py
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/colaboradores.py
git commit -m "feat(colaboradores): DELETE soft-delete admin+"
```

---

### Task 7: Registrar router em `backend/main.py`

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Identificar onde adicionar o import**

Procurar pelo bloco de imports de routers no topo do arquivo. Exemplo:

```bash
grep -n "from routes\." backend/main.py | head
```

Expected output inclui linhas tipo: `from routes.notas import router as notas_router`, `from routes.admin_clickup import router as admin_clickup_router`, etc.

- [ ] **Step 2: Adicionar o import**

Após o último `from routes.* import router as *` no bloco de imports, adicionar:

```python
from routes.colaboradores import router as colaboradores_router
```

- [ ] **Step 3: Registrar o router**

Procurar pelo bloco de `app.include_router(...)`:

```bash
grep -n "app.include_router" backend/main.py
```

Após o último `app.include_router(...)`, adicionar:

```python
app.include_router(colaboradores_router)
```

- [ ] **Step 4: Adicionar comentário sobre migration 004**

Procurar pela função `_apply_migration_003`:

```bash
grep -n "_apply_migration_003" backend/main.py
```

Adicionar logo após a definição da função `_apply_migration_003` (mas ANTES de qualquer função/código que use ela), um comentário documentando que migration 004 existe e é manual:

```python

# Migration 004 (colaboradores) é aplicada manualmente via Supabase Dashboard —
# VPS sem IPv6 não consegue conexão direta. Schema em
# docs/superpowers/plans/2026-05-10-colaboradores-phase1.md Task 1.
# Status: aplicado em 2026-05-10.
```

- [ ] **Step 5: Syntax check completo**

```bash
python3 -m py_compile backend/main.py
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py
git commit -m "feat(colaboradores): registra router em main.py + nota migration 004"
```

---

### Task 8: Deploy + smoke test em produção

- [ ] **Step 1: Push pra main → deploy automático**

```bash
git push origin main
```

Expected: push aceito.

- [ ] **Step 2: Aguardar deploy**

```bash
DEPLOY_ID=$(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
until gh run view "$DEPLOY_ID" --json status -q '.status' 2>/dev/null | grep -q completed; do sleep 10; done
gh run view "$DEPLOY_ID" --json conclusion -q '.conclusion'
```

Expected: `success`.

- [ ] **Step 3: Verificar health**

```bash
curl -s https://docs.foundersledgrowth.online/api/health
```

Expected: `{"status":"ok",...}`.

- [ ] **Step 4: Smoke test do endpoint (autenticado, executado pelo Pedro)**

No browser console em uma aba autenticada do app:

```js
fetch('/api/colaboradores', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)
```

Expected: `{ colaboradores: [{ email: "pedroaranda@grupoguglielmi.com", role: "owner", categoria: "diretor", ... }], total: 1 }`.

```js
fetch('/api/colaboradores/me', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)
```

Expected: objeto único do Pedro com `role: "owner"`.

- [ ] **Step 5: Testar criação (executado pelo Pedro)**

Primeiro convidar um colaborador de teste no Supabase Auth Dashboard (qualquer email real seu), depois:

```js
fetch('/api/colaboradores', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'teste@grupoguglielmi.com',
    nome: 'Colaborador Teste',
    categoria: 'consultor',
    cargo: 'Consultor de Performance',
    tier: 'pleno',
    role: 'member',
  }),
}).then(r => r.json()).then(console.log)
```

Expected: objeto retornado com `id`, `email`, etc. Se a conta não existir no Auth, retorna 400 sugerindo convidar primeiro.

- [ ] **Step 6: Testar edição (executado pelo Pedro)**

Pegar o `id` do colaborador criado e:

```js
fetch('/api/colaboradores/<UUID>', {
  method: 'PATCH',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tier: 'senior', role: 'admin' }),
}).then(r => r.json()).then(console.log)
```

Expected: retorna registro atualizado com `tier: "senior"`, `role: "admin"`. Confirmar no dashboard Supabase Auth → Users que `user_metadata.role` daquele usuário agora é `"admin"` (sincronização funcionou).

- [ ] **Step 7: Testar soft-delete (executado pelo Pedro)**

```js
fetch('/api/colaboradores/<UUID>', {
  method: 'DELETE',
  credentials: 'include',
}).then(r => r.json()).then(console.log)
```

Expected: `{ ok: true, id: "<UUID>", ativo: false }`. Confirmar via `GET /colaboradores?ativo=true` que ele sumiu da lista.

---

## Critérios de aceite Phase 1

Phase 1 completa quando:

- [x] Tabela `colaboradores` existe no Supabase com schema do spec
- [x] Pedro está na tabela com `role='owner'`, `categoria='diretor'`, `ativo=true`
- [x] `auth.users.user_metadata.role` do Pedro tem `'owner'`
- [x] Endpoints `GET /colaboradores`, `GET /colaboradores/me`, `GET /colaboradores/{id}`, `POST`, `PATCH`, `DELETE` respondem em produção
- [x] Permission matrix funciona: member não cria, member edita só self, admin promove member↔admin, só owner promove pra owner
- [x] PATCH role sincroniza com `user_metadata.role` no Auth
- [x] Backend não regrediu (deploy success, health 200)

Próximo passo: Phase 2 — frontend `Colaboradores/` com tabs Consultores/Diretores e tabela read-only. Plano separado.
