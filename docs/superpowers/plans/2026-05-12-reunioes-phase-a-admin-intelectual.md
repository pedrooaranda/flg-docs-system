# Reuniões da Jornada — Phase A: Admin Intelectual

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Spec:** [docs/superpowers/specs/2026-05-12-reunioes-jornada-design.md](../specs/2026-05-12-reunioes-jornada-design.md)

**Goal:** Habilitar Pedro a escrever a parte intelectual de cada encontro 5-15 num formato simples (`SLIDE N / Título / Conteúdo`) via IntelecFLG e gerar HTML válido do design system via Claude (Sonnet 4.6 com prompt caching), salvando em `encontros_base.html_intelecto` pra ser usado depois pelos consultores na apresentação.

**Architecture:** Migration adiciona 4 colunas em `encontros_base` (estrutura textual + HTML gerado + count + timestamp). Backend ganha serviço `claude_html_generator.py` que monta system prompt com `cache_control:ephemeral` no design system + valida HTML retornado contra whitelist de classes CSS via BeautifulSoup. Endpoints novos: `GET /encontros/:numero` (público autenticado), `POST /admin/encontros/:numero/intelecto` (admin only — salva texto), `POST /admin/encontros/:numero/gerar-html` (admin only — chama Claude e salva HTML). Frontend `IntelecFLG.jsx` ganha 2 abas novas: "Estrutura" (textarea formato simples) e "HTML" (iframe preview + edit raw + botão Gerar).

**Tech Stack:** Backend Python + FastAPI + anthropic SDK (`>=0.40.0`, já em requirements.txt) + Supabase service role. Frontend React + Tailwind + lucide-react. Modelo Claude Sonnet 4.6. HTML parsing via `beautifulsoup4` (adicionar a requirements.txt — não tem hoje).

**Não-objetivos (Phases B-E):**
- Frontend consultor (`/materiais/reunioes`)
- Chat geração parte prática
- Apresentação fullscreen via slug
- Sub-rotas em Materiais

---

## File Structure

**Migration (manual via Supabase Dashboard):**
- Schema `encontros_base` ganha 4 colunas (idempotente, `ADD COLUMN IF NOT EXISTS`)
- Doc evidência: `docs/migrations/005-encontros-intelecto-html.sql`

**Criar (backend):**
- `backend/services/claude_html_generator.py` — serviço encapsulando Claude API + validação HTML
- `backend/routes/encontros_intelecto.py` — endpoints REST (GET detail + POST estrutura + POST gerar-html)

**Modificar (backend):**
- `backend/requirements.txt` — adicionar `beautifulsoup4>=4.12.0`
- `backend/main.py` — registrar router + nota da migration 005

**Modificar (frontend):**
- `frontend/src/components/admin/IntelecFLG.jsx` — adicionar 2 tabs "Estrutura" e "HTML"
- `frontend/src/components/admin/IntelecFLG/EstruturaTab.jsx` — extraído (textarea + dicas de formato)
- `frontend/src/components/admin/IntelecFLG/HtmlTab.jsx` — extraído (preview iframe + edit raw + botão Gerar)

(Se `IntelecFLG.jsx` for grande demais pra adicionar 2 tabs inline, fazemos refactor leve criando uma pasta `IntelecFLG/`.)

---

## Tarefas

### Task 1: Migration SQL — schema + doc evidência

**Files:**
- External SQL (Supabase Dashboard) — Pedro executa
- Create: `docs/migrations/005-encontros-intelecto-html.sql`

- [ ] **Step 1: Pedro executa SQL no Supabase Dashboard SQL Editor**

URL: `https://app.supabase.com/project/ygvclagcsbdbsfyeeeil/sql/new`

Bloco SQL:

```sql
-- Migration 005: encontros_base ganha colunas pra estrutura textual + HTML gerado
ALTER TABLE encontros_base
  ADD COLUMN IF NOT EXISTS intelecto_estrutura TEXT,
  ADD COLUMN IF NOT EXISTS html_intelecto TEXT,
  ADD COLUMN IF NOT EXISTS num_slides_intelecto INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS html_gerado_at TIMESTAMPTZ;

-- Verificação
SELECT numero, nome,
       (intelecto_estrutura IS NOT NULL) AS tem_estrutura,
       (html_intelecto IS NOT NULL) AS tem_html,
       num_slides_intelecto,
       html_gerado_at
FROM encontros_base
ORDER BY numero;
```

Expected: query roda sem erro + SELECT mostra todos os encontros (5-15) com `tem_estrutura=false, tem_html=false, num_slides_intelecto=0`.

- [ ] **Step 2: Criar doc evidência**

```bash
cat > docs/migrations/005-encontros-intelecto-html.sql <<'EOF'
-- Migration 005 — Aplicada manualmente no Supabase Dashboard em 2026-05-12
-- (VPS sem IPv6 → padrão da repo, ver memory/vps_supabase_ipv6_issue.md)
-- Adiciona colunas em encontros_base pra estrutura textual + HTML gerado da parte intelectual.
-- SQL exato em docs/superpowers/plans/2026-05-12-reunioes-phase-a-admin-intelectual.md Task 1.
-- Status: aplicado em produção em 2026-05-12.
EOF
```

```bash
git add docs/migrations/005-encontros-intelecto-html.sql
git commit -m "docs(migrations): registra migration 005 encontros_intelecto_html aplicada manualmente"
```

---

### Task 2: Adicionar `beautifulsoup4` em `requirements.txt`

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Adicionar a dep**

Localizar a linha que tem `anthropic>=0.40.0`. Imediatamente abaixo (ou no bloco apropriado), adicionar:

```
beautifulsoup4>=4.12.0
```

- [ ] **Step 2: Verificar que esbuild/compile passa (não vai instalar ainda, só registrar)**

```bash
python3 -m py_compile backend/main.py
```

Expected: exit 0 (não importamos beautifulsoup ainda, só registramos).

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore(deps): adiciona beautifulsoup4 pra validação HTML do design system"
```

---

### Task 3: Criar `backend/services/claude_html_generator.py`

**Files:**
- Create: `backend/services/claude_html_generator.py`

Serviço encapsula chamada Claude API com prompt caching do design system + validação do HTML retornado.

- [ ] **Step 1: Criar o arquivo**

```python
"""
Geração de HTML do design system FLG via Claude Sonnet 4.6.

Pipeline:
  1. Lê os 3 arquivos do design system (FLG-DESIGN-SYSTEM.md + flg.css + deck-template.html)
     UMA VEZ em memória no startup do módulo (evita I/O por request).
  2. Monta system prompt com cache_control:ephemeral nos blocos grandes
     (design system) — Anthropic faz cache server-side por ~5min.
  3. Chama Claude com max_tokens=8000, temperature=0.3 (HTML estruturado, não criativo),
     stop_sequences=["</body>"] pra cortar lixo no fim.
  4. Valida HTML retornado: parsing via BeautifulSoup, checa que todas as
     classes CSS usadas estão em WHITELIST_CLASSES (extraído do flg.css).
  5. Conta slides (<section class="slide">) e retorna (html, num_slides).

Cache de prompt economiza ~90% do custo de input em runs sequenciais.
"""

import logging
import re
from pathlib import Path
from typing import Tuple

import anthropic
from bs4 import BeautifulSoup

from config import settings

logger = logging.getLogger("flg.claude_html")

_claude = anthropic.Anthropic(api_key=settings.anthropic_api_key)

# Caminho da pasta do design system (relativo à raiz do repo)
_DS_DIR = Path(__file__).parent.parent.parent / "flg-design-system"


def _read_ds_file(rel_path: str) -> str:
    """Lê arquivo do design system. Retorna string vazia se não existir."""
    p = _DS_DIR / rel_path
    if not p.exists():
        logger.warning(f"Design system file não encontrado: {p}")
        return ""
    return p.read_text(encoding="utf-8")


# Cache em memória dos arquivos do design system (lidos UMA vez no import)
_DS_MD = _read_ds_file("FLG-DESIGN-SYSTEM.md")
_DS_CSS = _read_ds_file("css/flg.css")
_DS_TEMPLATE = _read_ds_file("templates/deck-template.html")


def _extract_allowed_classes(css_content: str) -> set[str]:
    """
    Extrai todas as classes CSS definidas no flg.css.
    Match `.classe-nome { ... }` ou `.classe-nome,` ou `.classe-nome.outra`.
    Retorna set de strings sem o ponto.
    """
    pattern = re.compile(r"\.([a-zA-Z][a-zA-Z0-9_-]*)(?=[\s.,:{])")
    classes = set(pattern.findall(css_content))
    # Adiciona classes que aparecem no template HTML mas podem não estar no CSS direto
    template_classes = re.findall(r'class="([^"]+)"', _DS_TEMPLATE)
    for cls_attr in template_classes:
        for cls in cls_attr.split():
            classes.add(cls)
    return classes


_ALLOWED_CLASSES = _extract_allowed_classes(_DS_CSS)
logger.info(f"claude_html_generator: {_ALLOWED_CLASSES.__len__()} classes CSS no allowlist")


def _build_system_prompt() -> list:
    """
    Monta system prompt com cache_control:ephemeral nos blocos grandes.

    Blocos:
      1. Role + regras curtas (sem cache — instrução curta varia pouco)
      2. FLG-DESIGN-SYSTEM.md inteiro (cache — ~13K tokens, estável)
      3. flg.css inteiro (cache — ~25K tokens, estável)
      4. deck-template.html (cache — ~5K tokens, estável)
      5. Output rules (sem cache — pode ajustar por chamada)
    """
    return [
        {
            "type": "text",
            "text": (
                "Você é o gerador oficial de slides HTML da FLG Brasil. "
                "Sua função é converter uma estrutura textual simples "
                "(blocos no formato 'SLIDE N / Título / Conteúdo') em HTML "
                "100% válido seguindo o design system FLG (preto + dourado, sóbrio, cinematográfico)."
            ),
        },
        {
            "type": "text",
            "text": f"<design_system_docs>\n{_DS_MD}\n</design_system_docs>",
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": f"<css_flg>\n{_DS_CSS}\n</css_flg>",
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": f"<deck_template_html>\n{_DS_TEMPLATE}\n</deck_template_html>",
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": (
                "<output_rules>\n"
                "1. Retorne APENAS HTML válido. Sem markdown, sem ```html, sem texto fora das tags.\n"
                "2. Cada slide é uma <section class=\"slide\" data-screen-label=\"NN Título\">.\n"
                "3. Slide 1 é capa: use .stage--center + logo FLG centralizada (.flg-mark) + .d-mega + .gold-divider.\n"
                "4. Slides intermediários: logo no canto via <img class=\"flg-mark--corner\"> + .stage com .stage-bg.\n"
                "5. Último slide: logo centralizada novamente + frase de fechamento sóbria.\n"
                "6. Use APENAS classes que existem no css_flg acima. Não invente classes.\n"
                "7. Para listas numeradas (1./2./3.): use componente .entries com .entry/.entry-num/.entry-text.\n"
                "8. Para 2-4 pilares com título+descrição: use .pillars com .pillar.\n"
                "9. Para citações/destaques: use .body-lg com <em> dourado pra grifo (max 1-3 por slide).\n"
                "10. SEM travessões longos (—). Use pontos ou vírgulas.\n"
                "11. SEM nome de cliente nos slides (HTML é reutilizável pra qualquer founder).\n"
                "12. Saída completa começa com a primeira <section class=\"slide\"> e termina com a última </section>. NÃO inclua <html>, <head>, <body> wrapper — o backend monta o documento completo.\n"
                "</output_rules>"
            ),
        },
    ]


def _validate_html(html: str) -> Tuple[bool, str]:
    """
    Valida HTML gerado:
      - É parseável?
      - Todas as classes usadas estão no allowlist?
      - Tem pelo menos 1 <section class="slide">?

    Returns (ok, error_message).
    """
    if not html or not html.strip():
        return False, "HTML vazio"

    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception as e:
        return False, f"HTML não parseável: {e}"

    slides = soup.select("section.slide")
    if not slides:
        return False, "Nenhuma <section class='slide'> encontrada"

    used_classes = set()
    for element in soup.find_all(class_=True):
        cls_attr = element.get("class")
        if isinstance(cls_attr, list):
            used_classes.update(cls_attr)
        elif isinstance(cls_attr, str):
            used_classes.update(cls_attr.split())

    unknown = used_classes - _ALLOWED_CLASSES
    # Permite classes utilitárias semânticas que Claude pode inventar
    # (ex: state classes que aparecem só com JS). Filtramos as óbvias.
    UTILITY_WHITELIST = {"active", "current", "visible", "hidden", "open"}
    unknown -= UTILITY_WHITELIST

    if unknown:
        # Falha apenas se mais de 3 classes desconhecidas (tolera ruído pequeno)
        if len(unknown) > 3:
            return False, f"Classes CSS não permitidas: {sorted(unknown)[:10]}"
        logger.warning(f"_validate_html: tolerando {len(unknown)} classe(s) desconhecida(s): {sorted(unknown)}")

    return True, ""


def _extract_html_only(raw: str) -> str:
    """
    Claude pode retornar com markdown wrapper ou texto extra antes/depois.
    Extrai apenas a primeira <section> até a última </section>.
    """
    raw = raw.strip()
    # Remove markdown wrapper se houver
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:html)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
    # Pega tudo entre primeira <section e última </section>
    match = re.search(r"<section[^>]*class=[\"']slide[\"'][^>]*>.*</section>", raw, re.DOTALL)
    if match:
        return match.group(0).strip()
    return raw.strip()


def generate_intelecto_html(intelecto_estrutura: str, encontro_numero: int) -> dict:
    """
    Chama Claude pra converter estrutura textual em HTML do design system.

    Args:
      intelecto_estrutura: texto formato "SLIDE N / Título / Conteúdo"
      encontro_numero: número do encontro (pra logging)

    Returns:
      {
        "html": str,           # HTML válido (apenas as <section class="slide">)
        "num_slides": int,     # count de slides gerados
        "cached_input_tokens": int,  # quantos tokens vieram de cache (info)
        "input_tokens": int,
        "output_tokens": int,
      }

    Levanta ValueError se estrutura está vazia. Levanta RuntimeError se Claude
    falha ou HTML retornado é inválido após 1 retry.
    """
    if not intelecto_estrutura or not intelecto_estrutura.strip():
        raise ValueError("intelecto_estrutura vazia — escreva pelo menos um SLIDE")

    user_message = (
        f"Encontro {encontro_numero}. Estrutura abaixo. "
        f"Converta em HTML do design system FLG. "
        f"Retorne APENAS as <section class=\"slide\">, sem html/head/body wrapper.\n\n"
        f"<estrutura>\n{intelecto_estrutura.strip()}\n</estrutura>"
    )

    last_error = None
    for attempt in range(2):  # 1 tentativa + 1 retry
        try:
            logger.info(f"generate_intelecto_html: encontro {encontro_numero}, attempt {attempt+1}")
            response = _claude.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=8000,
                temperature=0.3,
                stop_sequences=["</body>", "```"],
                system=_build_system_prompt(),
                messages=[{"role": "user", "content": user_message}],
            )
            raw = response.content[0].text
            html = _extract_html_only(raw)

            ok, err = _validate_html(html)
            if not ok:
                last_error = err
                logger.warning(f"generate_intelecto_html: validação falhou (attempt {attempt+1}): {err}")
                if attempt == 0:
                    # Próximo turno: pedir pro Claude corrigir
                    continue
                raise RuntimeError(f"HTML inválido após 2 tentativas: {err}")

            soup = BeautifulSoup(html, "html.parser")
            num_slides = len(soup.select("section.slide"))

            # Métricas de uso da API (pra log + UI)
            usage = response.usage
            return {
                "html": html,
                "num_slides": num_slides,
                "cached_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
            }
        except (anthropic.APIError, anthropic.APIConnectionError) as e:
            logger.error(f"generate_intelecto_html: Claude API erro (attempt {attempt+1}): {e}")
            last_error = str(e)
            if attempt == 0:
                continue
            raise RuntimeError(f"Claude API falhou após 2 tentativas: {last_error}")

    raise RuntimeError(f"Falha inesperada: {last_error}")
```

- [ ] **Step 2: Syntax check**

```bash
python3 -m py_compile backend/services/claude_html_generator.py
```

Expected: exit 0. Pode dar warning de "No module named 'bs4'" se beautifulsoup4 não foi instalado ainda no venv local — ok, ignore (a verificação real é em runtime no container Docker que terá a dep instalada após o requirements.txt mergeado).

- [ ] **Step 3: Commit**

```bash
git add backend/services/claude_html_generator.py
git commit -m "feat(reunioes): cria serviço claude_html_generator com prompt cache + validação HTML"
```

---

### Task 4: Criar `backend/routes/encontros_intelecto.py` (endpoints)

**Files:**
- Create: `backend/routes/encontros_intelecto.py`

- [ ] **Step 1: Criar o arquivo**

```python
"""
Rotas REST de Encontros — parte Intelectual.

Endpoints:
  GET  /encontros/:numero                       — detalhe encontro (todos autenticados)
  POST /admin/encontros/:numero/intelecto       — salva intelecto_estrutura (admin+)
  POST /admin/encontros/:numero/gerar-html      — gera HTML via Claude (admin+)
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import get_current_user, supabase_client
from services.claude_html_generator import generate_intelecto_html

logger = logging.getLogger("flg.encontros_intelecto")
router = APIRouter(tags=["encontros-intelecto"])
_supabase = supabase_client


# ─── Helpers ─────────────────────────────────────────────────────────────────

ROLE_LEVEL = {"member": 0, "admin": 1, "owner": 2}


def _require_admin(user):
    """Garante caller tem role admin+ via colaboradores. Fallback: pedro hardcoded."""
    email = (user.email or "").strip().lower()
    # Fallback owner
    if email == "pedroaranda@grupoguglielmi.com":
        return
    r = _supabase.table("colaboradores").select("role").eq("email", email).eq("ativo", True).maybe_single().execute()
    role = (r.data or {}).get("role") if r else None
    if ROLE_LEVEL.get(role or "member", 0) < ROLE_LEVEL["admin"]:
        raise HTTPException(status_code=403, detail="Operação requer role admin+")


# ─── Modelos ─────────────────────────────────────────────────────────────────

class EstruturaInput(BaseModel):
    intelecto_estrutura: str


class HtmlInput(BaseModel):
    html_intelecto: str  # admin pode editar raw e salvar diretamente


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/encontros/{numero}")
async def get_encontro(numero: int, user=Depends(get_current_user)):
    """Detalhe do encontro. Todos autenticados podem ver."""
    r = (
        _supabase.table("encontros_base")
        .select("*")
        .eq("numero", numero)
        .maybe_single()
        .execute()
    )
    if not r or not r.data:
        raise HTTPException(status_code=404, detail=f"Encontro {numero} não encontrado")
    return r.data


@router.post("/admin/encontros/{numero}/intelecto")
async def save_intelecto_estrutura(
    numero: int,
    payload: EstruturaInput,
    user=Depends(get_current_user),
):
    """Salva intelecto_estrutura (admin+). Não dispara geração HTML — admin
    precisa chamar /gerar-html separado pra recriar o HTML cacheado."""
    _require_admin(user)

    try:
        r = (
            _supabase.table("encontros_base")
            .update({
                "intelecto_estrutura": payload.intelecto_estrutura,
                "intelecto_updated_at": datetime.now(timezone.utc).isoformat(),
                "intelecto_updated_by": user.email,
            })
            .eq("numero", numero)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar estrutura: {e}")

    updated = (r.data or [None])[0]
    if not updated:
        raise HTTPException(status_code=404, detail=f"Encontro {numero} não encontrado")
    return updated


@router.post("/admin/encontros/{numero}/gerar-html")
async def gerar_html_intelecto(numero: int, user=Depends(get_current_user)):
    """Gera HTML via Claude a partir de intelecto_estrutura. Salva em html_intelecto."""
    _require_admin(user)

    # Buscar encontro pra pegar estrutura
    r = (
        _supabase.table("encontros_base")
        .select("numero, intelecto_estrutura")
        .eq("numero", numero)
        .maybe_single()
        .execute()
    )
    encontro = r.data if r else None
    if not encontro:
        raise HTTPException(status_code=404, detail=f"Encontro {numero} não encontrado")
    if not (encontro.get("intelecto_estrutura") or "").strip():
        raise HTTPException(status_code=400, detail="Encontro sem intelecto_estrutura — salve a estrutura textual primeiro")

    # Chamada Claude
    try:
        result = generate_intelecto_html(
            intelecto_estrutura=encontro["intelecto_estrutura"],
            encontro_numero=numero,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Salvar HTML + metadata
    try:
        upd = (
            _supabase.table("encontros_base")
            .update({
                "html_intelecto": result["html"],
                "num_slides_intelecto": result["num_slides"],
                "html_gerado_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("numero", numero)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar HTML: {e}")

    return {
        "ok": True,
        "num_slides": result["num_slides"],
        "input_tokens": result["input_tokens"],
        "cached_input_tokens": result["cached_input_tokens"],
        "output_tokens": result["output_tokens"],
        "html_intelecto": result["html"],
    }


@router.post("/admin/encontros/{numero}/html")
async def save_html_intelecto_raw(
    numero: int,
    payload: HtmlInput,
    user=Depends(get_current_user),
):
    """Permite admin salvar HTML editado raw (após ajustes manuais no preview).
    Sobrescreve html_intelecto sem chamar Claude."""
    _require_admin(user)

    try:
        # Conta slides via regex simples (sem dep BeautifulSoup aqui — ok)
        import re
        num_slides = len(re.findall(r'<section[^>]*class=["\'][^"\']*\bslide\b', payload.html_intelecto))

        r = (
            _supabase.table("encontros_base")
            .update({
                "html_intelecto": payload.html_intelecto,
                "num_slides_intelecto": num_slides,
                "html_gerado_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("numero", numero)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar HTML: {e}")

    updated = (r.data or [None])[0]
    if not updated:
        raise HTTPException(status_code=404, detail=f"Encontro {numero} não encontrado")
    return updated
```

- [ ] **Step 2: Syntax check**

```bash
python3 -m py_compile backend/routes/encontros_intelecto.py
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/encontros_intelecto.py
git commit -m "feat(reunioes): endpoints REST encontros intelecto (GET + POST estrutura + gerar-html + html raw)"
```

---

### Task 5: Registrar router em `backend/main.py`

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Localizar bloco de imports de routers**

```bash
grep -n "from routes\." backend/main.py | head -10
```

- [ ] **Step 2: Adicionar import**

Após o último `from routes.* import router as *`, adicionar:

```python
from routes.encontros_intelecto import router as encontros_intelecto_router
```

- [ ] **Step 3: Localizar bloco de include_router**

```bash
grep -n "app.include_router" backend/main.py | head -10
```

- [ ] **Step 4: Adicionar include + comentário sobre migration 005**

Após o último `app.include_router(...)`, adicionar:

```python
app.include_router(encontros_intelecto_router)

# Migration 005 (encontros_base ganha intelecto_estrutura, html_intelecto,
# num_slides_intelecto, html_gerado_at) é aplicada manualmente via Supabase
# Dashboard — VPS sem IPv6 não consegue conexão direta. Schema em
# docs/superpowers/plans/2026-05-12-reunioes-phase-a-admin-intelectual.md Task 1.
# Status: aplicado em 2026-05-12.
```

- [ ] **Step 5: Syntax check**

```bash
python3 -m py_compile backend/main.py
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py
git commit -m "feat(reunioes): registra router encontros_intelecto em main.py + nota migration 005"
```

---

### Task 6: Frontend — refatorar `IntelecFLG.jsx` em pasta com 2 novas tabs

**Files:**
- Modify: `frontend/src/components/admin/IntelecFLG.jsx`

A abordagem mínima: **adicionar 2 tabs no array TABS** + 2 componentes inline `EstruturaTab` e `HtmlTab`. Sem refactor pra pasta (arquivo continua aceitável em tamanho).

- [ ] **Step 1: Localizar o array TABS atual**

```bash
grep -n "const TABS" frontend/src/components/admin/IntelecFLG.jsx
```

Expected: linha 11 — `const TABS = [`.

Atual:

```jsx
const TABS = [
  { id: 'conteudo', icon: MessageSquare, label: 'Conteúdo' },
  { id: 'imagens',  icon: Image,         label: 'Imagens' },
  { id: 'chat',     icon: MessageSquare, label: 'Chat de Intelecto' },
]
```

Substituir por:

```jsx
const TABS = [
  { id: 'conteudo',   icon: MessageSquare, label: 'Conteúdo' },
  { id: 'estrutura',  icon: FileText,      label: 'Estrutura' },
  { id: 'html',       icon: Code2,         label: 'HTML' },
  { id: 'imagens',    icon: Image,         label: 'Imagens' },
  { id: 'chat',       icon: MessageSquare, label: 'Chat de Intelecto' },
]
```

- [ ] **Step 2: Adicionar imports dos ícones novos**

Localizar a linha de import do `lucide-react`. Atual:

```jsx
import { Check, X, Clock, Image, MessageSquare, ChevronRight, RotateCcw, Wand2 } from 'lucide-react'
```

Substituir por:

```jsx
import { Check, X, Clock, Image, MessageSquare, ChevronRight, RotateCcw, Wand2, FileText, Code2, Sparkles, Loader2 } from 'lucide-react'
```

- [ ] **Step 3: Adicionar componente `EstruturaTab` (após `ConteudoTab`)**

Localizar o fim da função `ConteudoTab`. Imediatamente após o fechamento dela (`}` final), adicionar:

```jsx
function EstruturaTab({ enc, onSaved }) {
  const toast = useToast()
  const [valor, setValor] = useState(enc.intelecto_estrutura || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await api(`/admin/encontros/${enc.numero}/intelecto`, {
        method: 'POST',
        body: JSON.stringify({ intelecto_estrutura: valor }),
      })
      toast({ title: 'Estrutura salva', variant: 'success' })
      onSaved && onSaved()
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const numSlides = (valor.match(/^SLIDE\s+\d+/gim) || []).length

  return (
    <div className="space-y-4">
      <div className="rounded-lg p-4" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.20)' }}>
        <p className="text-xs font-semibold text-amber-400 mb-2">Formato (simples)</p>
        <pre className="text-[11px] text-white/65 leading-relaxed whitespace-pre-wrap font-mono">{`SLIDE 1
Título do slide
Conteúdo: texto livre, ou
- bullet 1
- bullet 2
ou lista numerada:
1. Item um
2. Item dois

SLIDE 2
Próximo título
...`}</pre>
        <p className="text-[10px] text-white/40 mt-2">
          Sistema converte automaticamente em HTML do design system na aba HTML.
        </p>
      </div>

      <textarea
        value={valor}
        onChange={e => setValor(e.target.value)}
        rows={20}
        placeholder="SLIDE 1&#10;Título&#10;Conteúdo..."
        className="w-full px-4 py-3 rounded-lg text-sm font-mono bg-[var(--flg-bg-raised)] border border-[var(--flg-border)] text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A84C]/50 resize-y"
        style={{ minHeight: 400 }}
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-white/55">
          {numSlides} slide{numSlides === 1 ? '' : 's'} detectado{numSlides === 1 ? '' : 's'}
        </p>
        <button
          onClick={handleSave}
          disabled={saving || !valor.trim()}
          className="px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: '#C9A84C', color: '#080808' }}
        >
          {saving ? 'Salvando…' : 'Salvar estrutura'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Adicionar componente `HtmlTab` (logo após `EstruturaTab`)**

```jsx
function HtmlTab({ enc, onSaved }) {
  const toast = useToast()
  const [html, setHtml] = useState(enc.html_intelecto || '')
  const [showRaw, setShowRaw] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [savingRaw, setSavingRaw] = useState(false)

  const hasEstrutura = !!(enc.intelecto_estrutura || '').trim()
  const hasHtml = !!(enc.html_intelecto || '').trim()

  async function handleGenerate() {
    if (!hasEstrutura) {
      toast({ title: 'Salve a estrutura primeiro', description: 'Aba Estrutura precisa estar preenchida', variant: 'error' })
      return
    }
    setGenerating(true)
    try {
      const r = await api(`/admin/encontros/${enc.numero}/gerar-html`, { method: 'POST' })
      setHtml(r.html_intelecto)
      toast({
        title: `${r.num_slides} slides gerados`,
        description: `Tokens: ${r.input_tokens} in (${r.cached_input_tokens} cached) + ${r.output_tokens} out`,
        variant: 'success',
      })
      onSaved && onSaved()
    } catch (e) {
      toast({ title: 'Erro ao gerar HTML', description: e.message, variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  async function handleSaveRaw() {
    setSavingRaw(true)
    try {
      await api(`/admin/encontros/${enc.numero}/html`, {
        method: 'POST',
        body: JSON.stringify({ html_intelecto: html }),
      })
      toast({ title: 'HTML salvo', variant: 'success' })
      onSaved && onSaved()
    } catch (e) {
      toast({ title: 'Erro ao salvar HTML', description: e.message, variant: 'error' })
    } finally {
      setSavingRaw(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating || !hasEstrutura}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#C9A84C', color: '#080808' }}
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {generating ? 'Gerando HTML…' : hasHtml ? 'Regerar HTML' : 'Gerar HTML do Design System'}
          </button>
          {enc.num_slides_intelecto > 0 && (
            <span className="text-xs text-white/55">
              {enc.num_slides_intelecto} slide{enc.num_slides_intelecto === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowRaw(s => !s)}
          className="text-xs text-white/55 hover:text-white/85 cursor-pointer transition-colors"
        >
          {showRaw ? '◄ Preview' : 'Editar HTML raw ►'}
        </button>
      </div>

      {!hasHtml && !generating && (
        <div className="rounded-lg p-6 text-center" style={{ background: 'var(--flg-bg-raised)', border: '1px dashed var(--flg-border)' }}>
          <Code2 size={24} className="mx-auto mb-2 text-white/30" />
          <p className="text-sm text-white/55">Nenhum HTML gerado ainda.</p>
          <p className="text-xs text-white/35 mt-1">
            {hasEstrutura
              ? 'Click em "Gerar HTML do Design System" pra Claude converter a estrutura.'
              : 'Salve a estrutura textual na aba Estrutura primeiro.'}
          </p>
        </div>
      )}

      {hasHtml && !showRaw && (
        <iframe
          srcDoc={`<!DOCTYPE html><html><head><link rel="stylesheet" href="/flg-design-system/css/flg.css"></head><body class="flg-deck" style="overflow:auto"><canvas id="stage-canvas"></canvas><div class="grain"></div><div class="deck">${html}</div></body></html>`}
          className="w-full rounded-lg"
          style={{ height: 600, border: '1px solid var(--flg-border)', background: 'var(--flg-bg-raised)' }}
          title="Preview do HTML intelectual"
        />
      )}

      {showRaw && (
        <>
          <textarea
            value={html}
            onChange={e => setHtml(e.target.value)}
            rows={25}
            className="w-full px-4 py-3 rounded-lg text-[11px] font-mono bg-[var(--flg-bg-raised)] border border-[var(--flg-border)] text-white/85 focus:outline-none focus:border-[#C9A84C]/50 resize-y"
            style={{ minHeight: 500 }}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setHtml(enc.html_intelecto || '')}
              className="px-3 py-2 rounded-lg text-xs text-white/65 hover:text-white cursor-pointer transition-colors"
            >
              Reverter
            </button>
            <button
              onClick={handleSaveRaw}
              disabled={savingRaw || !html.trim()}
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#C9A84C', color: '#080808' }}
            >
              {savingRaw ? 'Salvando…' : 'Salvar HTML editado'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Renderizar os 2 novos tabs no main component**

Localizar onde o tab `chat` é renderizado (próximo do final do componente principal). Vai ter um padrão tipo:

```jsx
{activeTab === 'conteudo' && <ConteudoTab enc={selected} onSaved={refresh} />}
{activeTab === 'imagens'  && <ImagensTab  enc={selected} onSaved={refresh} />}
{activeTab === 'chat'     && <ChatAgente agente="intelecto" ... />}
```

(O exato pode variar — usar Grep pra localizar.)

Adicionar **antes** do `imagens`:

```jsx
{activeTab === 'estrutura' && <EstruturaTab enc={selected} onSaved={refresh} />}
{activeTab === 'html'      && <HtmlTab      enc={selected} onSaved={refresh} />}
```

- [ ] **Step 6: Syntax check**

```bash
cd frontend && node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/admin/IntelecFLG.jsx > /dev/null
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/admin/IntelecFLG.jsx
git commit -m "feat(intelecto): adiciona tabs Estrutura + HTML em IntelecFLG.jsx"
```

---

### Task 7: Backend serve `flg-design-system/` como static files

**Files:**
- Modify: `backend/main.py`

O frontend (preview iframe) precisa carregar `/flg-design-system/css/flg.css` e (Phase D) `/flg-design-system/js/flg-deck.js`. Backend precisa servir esses arquivos.

- [ ] **Step 1: Adicionar import + mount em main.py**

Localizar o bloco onde outros mounts/middlewares são registrados (próximo aos `app.include_router` ou `app.mount`).

Adicionar import no topo do arquivo (com outros imports FastAPI):

```python
from fastapi.staticfiles import StaticFiles
from pathlib import Path
```

E logo após o último `app.include_router(...)`, adicionar:

```python
# Servir o flg-design-system/ como assets estáticos
# Acessível em /flg-design-system/css/flg.css, /flg-design-system/js/flg-deck.js, etc.
# Usado pelo preview do IntelecFLG (Phase A) e pela apresentação fullscreen (Phase D)
_DS_PATH = Path(__file__).parent.parent / "flg-design-system"
if _DS_PATH.exists():
    app.mount("/flg-design-system", StaticFiles(directory=str(_DS_PATH)), name="flg_design_system")
else:
    import logging
    logging.getLogger("flg.main").warning(f"flg-design-system/ não encontrado em {_DS_PATH} — preview não vai carregar CSS")
```

- [ ] **Step 2: Syntax check**

```bash
python3 -m py_compile backend/main.py
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat(reunioes): mount flg-design-system como static files em /flg-design-system/"
```

---

### Task 8: Deploy + smoke test em produção

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Aguardar deploy + verificar bundle**

```bash
DEPLOY_ID=$(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
echo "Run: $DEPLOY_ID"
until gh run view "$DEPLOY_ID" --json status -q '.status' 2>/dev/null | grep -q completed; do sleep 10; done
CONCL=$(gh run view "$DEPLOY_ID" --json conclusion -q '.conclusion')
echo "Conclusion: $CONCL"
if [ "$CONCL" = "failure" ]; then
  echo "Retry deploy (provavelmente SSH timeout intermitente)..."
  gh workflow run deploy.yml -f force_rebuild=false
fi
```

Expected: `success`. Se falhar, retry uma vez.

- [ ] **Step 3: Verificar health + static files servindo**

```bash
curl -s https://docs.foundersledgrowth.online/api/health
curl -s -o /dev/null -w "%{http_code}\n" https://docs.foundersledgrowth.online/flg-design-system/css/flg.css
```

Expected: health = `{"status":"ok",...}` + static = `200`.

- [ ] **Step 4: Smoke test manual pelo Pedro**

Critérios de aceite (Cmd+Shift+R em `/admin/intelecto` pra cache fresco):

**Aba Estrutura:**
- Tab "Estrutura" aparece entre "Conteúdo" e "Imagens" (ícone FileText)
- Selecione qualquer encontro (5-15) → abre tab Estrutura
- Card amarelo no topo mostra o formato sugerido (SLIDE N / Título / Conteúdo)
- Cole 3 slides no formato:
  ```
  SLIDE 1
  Teste de Intelectual
  Conteúdo de capa do encontro X.

  SLIDE 2
  Os 3 pilares
  1. Identidade
  2. Posicionamento
  3. Voz

  SLIDE 3
  Encerramento
  Frase de fechamento sóbria.
  ```
- Counter mostra "3 slides detectados"
- Click "Salvar estrutura" → toast verde

**Aba HTML:**
- Tab "HTML" (ícone Code2) aparece logo após "Estrutura"
- Click → mostra empty state porque ainda não tem HTML
- Click "Gerar HTML do Design System" → spinner enquanto Claude trabalha (~5-15s)
- Toast verde aparece: "3 slides gerados. Tokens: N in (M cached) + K out"
- Preview iframe carrega mostrando 3 slides com fonte Fraunces + cores corretas (preto+dourado)
- Click "Editar HTML raw" → textarea com HTML aparece
- Faça edit pequeno (mudar uma palavra) + "Salvar HTML editado" → toast verde
- Toggle de volta pra preview → mostra a edição

**Verificar persistência:**
- Recarregar a página → tab "Estrutura" mantém texto + tab "HTML" mantém preview
- Selecionar OUTRO encontro → tabs mostram conteúdo novo (vazio se ainda não preenchido)

Se algum item falhar, ajustar e re-deployar.

---

## Critérios de aceite Phase A

- [x] Migration 005 aplicada no Supabase
- [x] `encontros_base` ganha 4 colunas: `intelecto_estrutura`, `html_intelecto`, `num_slides_intelecto`, `html_gerado_at`
- [x] Backend serviço `claude_html_generator.py` com prompt cache do design system + validação HTML
- [x] Endpoints `GET /encontros/:numero`, `POST /admin/encontros/:numero/intelecto`, `POST /admin/encontros/:numero/gerar-html`, `POST /admin/encontros/:numero/html` funcionando com permissão admin+
- [x] `flg-design-system/` servido como static files em `/flg-design-system/*`
- [x] IntelecFLG.jsx ganha 2 tabs: "Estrutura" (textarea) e "HTML" (preview iframe + edit raw)
- [x] Botão "Gerar HTML" chama Claude e popula preview
- [x] Token usage mostrado no toast (input + cached + output)
- [x] Deploy ok, static files acessíveis, smoke do Pedro passa

Próximo passo: **Phase B** (refactor Materiais em sub-rotas /diarios e /reunioes + grid de reuniões cliente×encontro).
