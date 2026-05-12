# Colaboradores — Phase 3.1: Auto-Provisioning Auth + Password Reveal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Spec parent:** [docs/superpowers/specs/2026-05-10-colaboradores-design.md](../specs/2026-05-10-colaboradores-design.md)
**Hotfix de:** [docs/superpowers/plans/2026-05-12-colaboradores-phase3.md](2026-05-12-colaboradores-phase3.md)

**Goal:** Eliminar a etapa manual de "convidar via Supabase Dashboard" antes de criar colaborador. Ao clicar "Criar" no modal, o backend (1) valida domínio `@grupoguglielmi.com`, (2) cria a conta em `auth.users` automaticamente via `supabase.auth.admin.create_user` com senha aleatória, (3) retorna a senha gerada na resposta. O frontend exibe a senha num modal de "revelação única" com botão de copiar.

**Architecture:** Backend ganha helper `_generate_password()` (`secrets`) + função `_create_auth_user_if_missing(email, nome)`. POST `/colaboradores` agora orquestra: validação de domínio → resolve auth user (existente OU recém-criado) → cria registro colaborador → retorna shape `{...colaborador, temporary_password?, auth_user_created?}`. Frontend ganha componente `PasswordRevealModal` mostrado quando resposta tem `temporary_password`. Validação client-side de domínio dispara erro imediato antes do submit.

**Tech Stack:** Backend Python (`secrets`, `string`), supabase-py `auth.admin.create_user(AdminUserAttributes)`. Frontend React (clipboard via `navigator.clipboard.writeText`).

**Premissas de segurança:**
- Senha = 16 caracteres alfanuméricos com pelo menos 1 maiúscula + 1 minúscula + 1 dígito (forte o suficiente pra temporária, simples o suficiente pra ditar via call/Slack se preciso).
- Senha aparece UMA vez na response — não é logada, não é persistida. Admin é responsável por copiar/transmitir.
- User metadata `needs_password_change=true` setado na criação — Phase 4 vai usar isso pra forçar tela de trocar senha no primeiro login.
- Email lowercase + trim antes de qualquer operação (mantém consistência com Phase 1).

**Não-objetivos (Phase 4):**
- Tela de trocar senha no primeiro login
- `isOwner()` helper extraído
- Loading skeletons / mobile responsive / yellow nits do code review

---

## File Structure

**Modificar:**
- `backend/routes/colaboradores.py` — adicionar helper `_generate_password`, `_validate_email_domain`, refatorar POST endpoint
- `frontend/src/components/Colaboradores/shared/ColaboradorFormModal.jsx` — adicionar validação client-side de domínio + passar senha gerada via `onSaved`
- `frontend/src/components/Colaboradores/index.jsx` — capturar `temporary_password` de `onSaved` + mostrar `PasswordRevealModal`

**Criar:**
- `frontend/src/components/Colaboradores/shared/PasswordRevealModal.jsx` — modal de revelação de senha temporária

---

## Tarefas

### Task 1: Backend — helpers de senha + validação de domínio + refactor do POST

**Files:**
- Modify: `backend/routes/colaboradores.py`

- [ ] **Step 1: Adicionar imports e constantes no topo do arquivo**

Localizar o bloco de imports (linhas iniciais). Adicionar `secrets` e `string` aos imports stdlib:

```python
import logging
import re
import secrets
import string
from datetime import datetime, timezone
from typing import Optional
```

Adicionar abaixo das constantes existentes (após `OWNER_FALLBACK_EMAILS`):

```python
# Domínio corporativo obrigatório pra novos colaboradores. Match case-insensitive
# pelo sufixo. Hardcoded — se a empresa adicionar mais domínios, virar env var ou
# tabela de configuração.
ALLOWED_EMAIL_DOMAIN = "@grupoguglielmi.com"

# Tamanho da senha temporária gerada quando o backend cria auth.user automaticamente.
TEMP_PASSWORD_LENGTH = 16
```

- [ ] **Step 2: Adicionar helpers `_generate_password` e `_validate_email_domain`**

Adicionar logo após as funções existentes `_validate_role`, `_validate_tier`, `_validate_categoria` (busque pela última `_validate_*`):

```python
def _validate_email_domain(email: str):
    """Garante que o email termina com ALLOWED_EMAIL_DOMAIN. Case-insensitive."""
    if not (email or "").strip().lower().endswith(ALLOWED_EMAIL_DOMAIN):
        raise HTTPException(
            status_code=400,
            detail=f"Email deve usar o domínio corporativo {ALLOWED_EMAIL_DOMAIN}",
        )


def _generate_password(length: int = TEMP_PASSWORD_LENGTH) -> str:
    """
    Gera senha aleatória forte. Garante diversidade mínima (pelo menos 1 maiúscula,
    1 minúscula, 1 dígito). Usa `secrets.choice` (CSPRNG).
    """
    alphabet = string.ascii_letters + string.digits
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in password)
            and any(c.isupper() for c in password)
            and any(c.isdigit() for c in password)
        ):
            return password


def _create_auth_user(email: str, nome: str) -> tuple[bool, Optional[str]]:
    """
    Cria conta em auth.users com senha temporária e marca `needs_password_change=true`
    no user_metadata. Idempotente: se o user já existir, retorna (False, None) sem erro.

    Returns: (was_created: bool, temporary_password: Optional[str])
      - (True,  password) → criou agora, retorna senha pra revelar
      - (False, None)     → user já existia, fluxo normal

    Levanta HTTPException 500 se Supabase falhar de fato (não "já existe").
    """
    target = email.strip().lower()

    # Verifica se já existe
    try:
        users = _supabase.auth.admin.list_users(page=1, per_page=200)
        existing = any(
            (getattr(u, "email", "") or "").strip().lower() == target for u in users
        )
        if existing:
            return False, None
    except Exception as e:
        logger.error(f"_create_auth_user: list_users falhou pra {target}: {e}")
        # Não trava criação — tenta create_user mesmo assim; se já existe, retorna erro distinto.

    # Cria novo
    password = _generate_password()
    try:
        _supabase.auth.admin.create_user({
            "email": target,
            "password": password,
            "email_confirm": True,  # skip verification email — admin já validou
            "user_metadata": {
                "full_name": nome,
                "needs_password_change": True,
            },
        })
        logger.info(f"_create_auth_user: criada conta auth.users pra {target}")
        return True, password
    except Exception as e:
        msg = str(e)
        # Race: já existia mas list_users não retornou — trata como existente
        if "already" in msg.lower() or "exists" in msg.lower() or "duplicate" in msg.lower():
            logger.warning(f"_create_auth_user: {target} já existia (race com list_users)")
            return False, None
        logger.error(f"_create_auth_user: create_user falhou pra {target}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Falha ao criar conta no Supabase Auth: {msg[:200]}",
        )
```

- [ ] **Step 3: Refatorar o endpoint POST**

Localizar `@router.post("")` (linha ~178). Substituir o corpo COMPLETO da função `create_colaborador` por:

```python
@router.post("")
async def create_colaborador(payload: ColaboradorCreate, user=Depends(get_current_user)):
    """
    Cria colaborador. Admin+ apenas. Promoção a 'owner' requer caller=owner.

    Auto-provisioning (Phase 3.1): se o email não tem conta em auth.users, o backend
    cria automaticamente com senha aleatória e retorna a senha temporária na resposta
    (campo `temporary_password`). Admin é responsável por transmitir a senha ao novo
    colaborador.

    Validação de domínio: email deve terminar em ALLOWED_EMAIL_DOMAIN
    (@grupoguglielmi.com). Retorna 400 caso contrário.
    """
    caller = _require_role(user, "admin")

    _validate_email_domain(payload.email)
    _validate_categoria(payload.categoria)
    _validate_tier(payload.tier)
    _validate_role(payload.role)

    # Apenas owner pode criar outro owner
    if payload.role == "owner" and caller.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Apenas Owner pode criar outro Owner")

    target_email = payload.email.strip().lower()

    # Auto-provisioning: cria auth user se ainda não existe
    auth_user_created, temporary_password = _create_auth_user(target_email, payload.nome)

    # Insert colaborador (sempre, independente de auth.user já existir ou ter sido criado)
    data = payload.model_dump(exclude_none=True)
    data["email"] = target_email  # normaliza pra lowercase
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_at"] = data["created_at"]

    try:
        r = _supabase.table("colaboradores").insert(data).execute()
    except Exception as e:
        msg = str(e)
        # Se criamos auth user agora MAS DB insert falhou, sobra órfão no Auth.
        # Loga ERROR pra cleanup manual. Não tenta rollback automático (risco maior
        # que orfão isolado).
        if auth_user_created:
            logger.error(
                f"create_colaborador: insert DB falhou DEPOIS de criar auth user pra "
                f"{target_email} — ÓRFÃO no auth.users, limpeza manual necessária. Erro: {msg}"
            )
        if "unique" in msg.lower() or "duplicate" in msg.lower():
            raise HTTPException(status_code=409, detail=f"Email {target_email} já cadastrado como colaborador")
        raise HTTPException(status_code=500, detail=f"Erro ao criar colaborador: {msg}")

    novo = (r.data or [None])[0]
    if not novo:
        raise HTTPException(status_code=500, detail="Colaborador não foi criado")

    # Sync role pra auth metadata
    sync_role_to_auth_metadata(_supabase, novo["email"], novo["role"])

    # Resposta: colaborador + (opcional) senha temporária
    response = {**novo}
    if temporary_password:
        response["temporary_password"] = temporary_password
        response["auth_user_created"] = True
    return response
```

- [ ] **Step 4: Syntax check**

```bash
python3 -m py_compile backend/routes/colaboradores.py
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/colaboradores.py
git commit -m "feat(colaboradores): auto-provisiona auth.users no POST + valida domínio @grupoguglielmi.com"
```

---

### Task 2: Frontend — criar `PasswordRevealModal.jsx`

**Files:**
- Create: `frontend/src/components/Colaboradores/shared/PasswordRevealModal.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
import { useState, useEffect } from 'react'
import { X, Copy, CheckCircle2, AlertTriangle } from 'lucide-react'

/**
 * Modal de revelação de senha temporária. Aparece UMA vez após admin criar
 * colaborador novo (com auth.users criado automaticamente pelo backend).
 *
 * @param open - boolean
 * @param password - string da senha gerada
 * @param email - email do colaborador criado
 * @param nome - nome pra contexto humano
 * @param onClose - fecha modal (depois disso senha some — admin precisa ter copiado)
 */
export default function PasswordRevealModal({ open, password, email, nome, onClose }) {
  const [copied, setCopied] = useState(false)

  // Reset estado quando modal abre
  useEffect(() => {
    if (open) setCopied(false)
  }, [open])

  // ESC fecha
  useEffect(() => {
    if (!open) return
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (e) {
      // Fallback se clipboard API não disponível (HTTP sem TLS ou navegador antigo)
      console.warn('Clipboard não disponível, selecione a senha manualmente')
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-md"
        style={{ background: 'var(--flg-bg-secondary)', border: '1px solid rgba(201,168,76,0.30)' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between p-5 border-b"
          style={{ borderColor: 'var(--flg-border)' }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-emerald-400" />
            <h2 className="font-display text-lg font-bold text-white">Colaborador criado</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white cursor-pointer transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm text-white/85">
              <span className="font-semibold text-white">{nome}</span> foi cadastrado(a).
            </p>
            <p className="text-xs text-white/55 mt-1">
              Conta criada no Supabase Auth com senha temporária. Compartilhe a senha abaixo
              com o(a) colaborador(a) — ele(a) poderá trocar no primeiro login.
            </p>
          </div>

          <div>
            <label className="block text-[10px] tracking-widest uppercase text-white/45 font-semibold mb-2">
              Email
            </label>
            <div
              className="px-3 py-2 rounded-lg text-sm text-white/85 font-mono"
              style={{ background: 'var(--flg-bg-raised)', border: '1px solid var(--flg-border)' }}
            >
              {email}
            </div>
          </div>

          <div>
            <label className="block text-[10px] tracking-widest uppercase text-white/45 font-semibold mb-2">
              Senha temporária
            </label>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 px-3 py-2.5 rounded-lg text-base font-mono tracking-wider select-all"
                style={{
                  background: 'var(--flg-bg-raised)',
                  border: '1px solid rgba(201,168,76,0.40)',
                  color: '#C9A84C',
                }}
              >
                {password}
              </div>
              <button
                onClick={copyPassword}
                className="px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                style={{
                  background: copied ? 'rgba(52,211,153,0.20)' : '#C9A84C',
                  color: copied ? '#34D399' : '#080808',
                  border: copied ? '1px solid rgba(52,211,153,0.40)' : 'none',
                }}
              >
                {copied ? (
                  <>
                    <CheckCircle2 size={13} /> Copiado
                  </>
                ) : (
                  <>
                    <Copy size={13} /> Copiar
                  </>
                )}
              </button>
            </div>
          </div>

          <div
            className="rounded-lg p-3 flex items-start gap-2"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}
          >
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-400">Senha aparece apenas uma vez</p>
              <p className="text-[11px] text-white/55 mt-0.5">
                Após fechar este modal, a senha não será mostrada de novo. Salve em local seguro.
              </p>
            </div>
          </div>
        </div>

        <div
          className="flex items-center justify-end p-5 border-t"
          style={{ borderColor: 'var(--flg-border)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer"
            style={{ background: '#C9A84C', color: '#080808' }}
          >
            Entendi, senha salva
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Colaboradores/shared/PasswordRevealModal.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Colaboradores/shared/PasswordRevealModal.jsx
git commit -m "feat(colaboradores): cria PasswordRevealModal pra revelar senha temporária após create"
```

---

### Task 3: Frontend — adicionar validação de domínio no `ColaboradorFormModal.jsx`

**Files:**
- Modify: `frontend/src/components/Colaboradores/shared/ColaboradorFormModal.jsx`

- [ ] **Step 1: Adicionar constante de domínio**

Localizar a importação do `constants` (linha ~5-9). Adicionar ao final do arquivo a constante junto com as existentes. Mas como `constants.js` já existe, é mais limpo adicionar lá. Modificar `frontend/src/components/Colaboradores/shared/constants.js`:

Adicionar AO FINAL de `constants.js`:

```javascript

// Domínio corporativo obrigatório pra emails de colaboradores. Espelha
// ALLOWED_EMAIL_DOMAIN no backend (backend/routes/colaboradores.py) —
// manter sincronizado.
export const ALLOWED_EMAIL_DOMAIN = '@grupoguglielmi.com'
```

- [ ] **Step 2: Importar em `ColaboradorFormModal.jsx`**

Localizar o import de constants no modal (linha ~5-9):

```jsx
import {
  TIERS, ROLES, CATEGORIAS, CATEGORIA_CONFIG,
  SELF_EDITABLE_FIELDS, INPUT_CLASS,
} from './constants'
```

Substituir por:

```jsx
import {
  TIERS, ROLES, CATEGORIAS, CATEGORIA_CONFIG,
  SELF_EDITABLE_FIELDS, INPUT_CLASS, ALLOWED_EMAIL_DOMAIN,
} from './constants'
```

- [ ] **Step 3: Adicionar validação client-side no `handleSubmit`**

Localizar a função `handleSubmit` (linha ~85). No início do `try` block (logo após `setError(null)` e antes de construir `payload`), adicionar:

Antes:

```jsx
  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      // Limpa strings vazias pra não mandar campos opcionais como ""
      const payload = { ...form }
```

Depois:

```jsx
  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      // Validação client-side de domínio (só pra create — email não é editável no edit)
      if (mode === 'create') {
        const normalized = (form.email || '').trim().toLowerCase()
        if (!normalized.endsWith(ALLOWED_EMAIL_DOMAIN)) {
          setError(`Email deve usar o domínio corporativo ${ALLOWED_EMAIL_DOMAIN}`)
          setSubmitting(false)
          return
        }
      }

      // Limpa strings vazias pra não mandar campos opcionais como ""
      const payload = { ...form }
```

- [ ] **Step 4: Atualizar placeholder do input de email**

Localizar o input de email (linha ~155 aprox):

```jsx
              <input
                type="email"
                value={form.email}
                onChange={e => update('email', e.target.value)}
                disabled={fieldDisabled('email')}
                required={mode === 'create'}
                className={INPUT_CLASS}
                placeholder="usuario@grupoguglielmi.com"
              />
```

Substituir o helper text logo abaixo (atualmente fala "convide o user no Auth"):

```jsx
              {mode === 'create' && (
                <p className="text-[10px] text-white/35 mt-1">
                  O usuário precisa existir no Supabase Auth antes — convide pelo dashboard se ainda não tiver conta.
                </p>
              )}
```

Por:

```jsx
              {mode === 'create' && (
                <p className="text-[10px] text-white/35 mt-1">
                  Apenas emails {ALLOWED_EMAIL_DOMAIN}. Se o usuário não tem conta no Auth, o sistema cria automaticamente com senha temporária.
                </p>
              )}
```

- [ ] **Step 5: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Colaboradores/shared/constants.js src/components/Colaboradores/shared/ColaboradorFormModal.jsx > /dev/null 2>&1 || (cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Colaboradores/shared/constants.js > /dev/null && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Colaboradores/shared/ColaboradorFormModal.jsx > /dev/null)
```

Expected: exit 0 (esbuild aceita só um arquivo por vez sem --outdir; comando faz fallback sequencial).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Colaboradores/shared/constants.js frontend/src/components/Colaboradores/shared/ColaboradorFormModal.jsx
git commit -m "feat(colaboradores): validação client-side de domínio @grupoguglielmi.com no modal"
```

---

### Task 4: Frontend — integrar `PasswordRevealModal` no `Colaboradores/index.jsx`

**Files:**
- Modify: `frontend/src/components/Colaboradores/index.jsx`

- [ ] **Step 1: Adicionar import**

Localizar os imports no topo do arquivo. Após o import de `ColaboradorFormModal`, adicionar:

```jsx
import PasswordRevealModal from './shared/PasswordRevealModal'
```

- [ ] **Step 2: Adicionar state pra password reveal**

Localizar o bloco de `useState` (perto do início da função, junto com `modalOpen`, `modalMode`, `editingColaborador`). Adicionar logo após:

```jsx
  // Password reveal modal — aparece quando POST retorna temporary_password
  const [passwordReveal, setPasswordReveal] = useState(null)
  // shape: { password: string, email: string, nome: string } ou null
```

- [ ] **Step 3: Atualizar `handleSaved` pra capturar senha**

Localizar a função `handleSaved` (linha ~101 aprox):

```jsx
  function handleSaved() {
    // PATCH/POST atualizou DB — re-fetch pra puxar relações + ordering atualizados
    loadColaboradores()
  }
```

Substituir por:

```jsx
  function handleSaved(result) {
    // PATCH/POST atualizou DB — re-fetch pra puxar relações + ordering atualizados
    loadColaboradores()

    // Se o POST criou auth user novo, mostra modal de revelação da senha temporária.
    // result.temporary_password só vem em POST e só quando _create_auth_user retornou
    // um password novo. Em PATCH não vem.
    if (result?.temporary_password) {
      setPasswordReveal({
        password: result.temporary_password,
        email: result.email,
        nome: result.nome,
      })
    }
  }
```

- [ ] **Step 4: Renderizar `PasswordRevealModal`**

Localizar o final do JSX onde `ColaboradorFormModal` é renderizado:

```jsx
      <ColaboradorFormModal
        open={modalOpen}
        mode={modalMode}
        initialData={editingColaborador}
        isAdminPlus={isAdminPlus}
        isOwner={isOwner}
        allColaboradores={colaboradores}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  )
}
```

Inserir o `PasswordRevealModal` imediatamente antes do `</div>` que fecha o componente:

```jsx
      <ColaboradorFormModal
        open={modalOpen}
        mode={modalMode}
        initialData={editingColaborador}
        isAdminPlus={isAdminPlus}
        isOwner={isOwner}
        allColaboradores={colaboradores}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />

      <PasswordRevealModal
        open={passwordReveal !== null}
        password={passwordReveal?.password || ''}
        email={passwordReveal?.email || ''}
        nome={passwordReveal?.nome || ''}
        onClose={() => setPasswordReveal(null)}
      />
    </div>
  )
}
```

- [ ] **Step 5: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Colaboradores/index.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 6: Bundle check completo**

```bash
cd frontend && node_modules/.bin/esbuild --bundle --loader:.jsx=jsx --jsx=automatic --external:react --external:react-dom --external:react-router-dom --external:framer-motion --external:lucide-react --external:@radix-ui/react-toast src/components/Colaboradores/index.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Colaboradores/index.jsx
git commit -m "feat(colaboradores): integra PasswordRevealModal após criação com senha temporária"
```

---

### Task 5: Deploy + smoke test

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Aguardar deploy**

```bash
DEPLOY_ID=$(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
until gh run view "$DEPLOY_ID" --json status -q '.status' 2>/dev/null | grep -q completed; do sleep 10; done
gh run view "$DEPLOY_ID" --json conclusion -q '.conclusion'
```

Expected: `success`. Se `failure` por SSH timeout, re-disparar com `gh workflow run deploy.yml -f force_rebuild=false`.

- [ ] **Step 3: Verificar bundles rebuildaram**

```bash
curl -s https://docs.foundersledgrowth.online/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1
curl -s https://docs.foundersledgrowth.online/api/health
```

Expected: bundle hash NOVO (diferente do `index-DvhrwZY_.js` da Phase 3) + health 200.

- [ ] **Step 4: Smoke test manual (executado pelo Pedro)**

Critérios de aceite:

**Validação de domínio:**
- Modal de criar → email `teste@outrodominio.com` → erro inline "Email deve usar o domínio corporativo @grupoguglielmi.com" (não chega no backend)
- Email vazio → erro padrão de form (HTML5 required)

**Auto-provisioning happy path:**
- Modal de criar → email `lucasnery@grupoguglielmi.com` (que NÃO existe em auth.users) + nome + categoria + role=member → click Criar
- Toast verde "Colaborador criado"
- Modal `PasswordRevealModal` abre mostrando: email, senha temporária (16 chars), botão Copiar, banner amarelo "Senha aparece apenas uma vez"
- Click Copiar → muda pra "Copiado" verde por 2.5s, senha vai pro clipboard (Cmd+V em outro lugar pra verificar)
- Click "Entendi, senha salva" → modal fecha, colaborador aparece na lista

**Idempotência:**
- Criar outro colaborador com email que JÁ existe em auth.users (ex: outro user que você convidou manualmente antes) → toast verde criou colaborador, MAS PasswordRevealModal NÃO abre (porque backend não retornou `temporary_password`)

**Verificar Supabase Auth:**
- No dashboard Supabase → Authentication → Users, confirma que `lucasnery@grupoguglielmi.com` foi criado, com `user_metadata.needs_password_change=true` e `user_metadata.full_name="Lucas Nery"`

**Testar login com a senha gerada:**
- Logout do Pedro
- Login com `lucasnery@grupoguglielmi.com` + senha que você copiou → deve conseguir entrar
- (Phase 4 vai adicionar o prompt automático de trocar senha; por enquanto, login funciona com a temp e usuário pode usar "Esqueci minha senha" pra resetar)

Se algum item falhar, voltar e corrigir antes de marcar Phase 3.1 completa.

---

## Critérios de aceite Phase 3.1

- [x] Backend valida domínio `@grupoguglielmi.com` (HTTP 400 caso contrário)
- [x] Backend cria conta em `auth.users` automaticamente quando não existe
- [x] Senha temporária gerada com 16 chars + diversidade (maiúscula + minúscula + dígito)
- [x] Resposta do POST inclui `temporary_password` apenas quando auth user foi criado agora
- [x] Frontend valida domínio client-side antes de submit
- [x] `PasswordRevealModal` aparece com botão Copiar funcional + banner de aviso
- [x] Race com user existente é graciosa (não revela senha)
- [x] User criado tem `user_metadata.needs_password_change=true` (pronto pra Phase 4)
- [x] Deploy ok, smoke test do Pedro passa

Próximo passo: **Phase 4** — tela de trocar senha no primeiro login + polish + isOwner helper + responsive.
