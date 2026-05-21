# Debriefings — Setup Operacional (Pedro)

Passos manuais necessários antes do feature funcionar em produção.
Cada um leva poucos minutos. Faça em ordem.

---

## 1. Aplicar migration 007 (Supabase Dashboard)

VPS não tem IPv6 → migrations rodam direto no Dashboard.

1. Abra https://supabase.com/dashboard → projeto FLG → **SQL Editor**
2. New query
3. Cole o conteúdo de [docs/migrations/007-debriefings.sql](../migrations/007-debriefings.sql)
4. Run

Verificação:
```sql
SELECT * FROM debriefings LIMIT 1;
```
Deve retornar vazio (0 rows) — tabela criada com sucesso.

---

## 2. Criar bucket de storage `debriefings`

1. Supabase Dashboard → **Storage** → **New bucket**
2. Nome: `debriefings`
3. **Public bucket:** desligado (privado)
4. Click "Save"

(O backend tem fallback que cria o bucket automaticamente no primeiro upload, mas
melhor criar manualmente pra ter controle visual.)

### Policies — NÃO criar nenhuma ❌

Diferente do que docs Supabase costumam sugerir, **este feature não precisa de policies**:

- Backend usa **service_role key** (ver `backend/config.py:12` + `backend/deps.py:11`), que bypassa RLS automaticamente. Uploads funcionam sem policy.
- Frontend não acessa Storage direto. Backend gera **signed URL** (token embutido, expira em 1h) via `create_signed_url()`. Signed URLs também bypassam RLS — auth está na própria URL.

⚠️ **Cuidado:** se você abrir "Add policy" no Supabase, o modal sugere por default a função `getPublicUrl` (verde no UI). NÃO clique Review/Save com isso — abriria o bucket público pra qualquer pessoa na internet. Fecha o modal sem salvar.

**Resultado seguro:** bucket privado, zero policies, fluxo todo via service_role + signed URLs. É a configuração mais simples e mais segura.

(Se um dia você quiser listar PDFs direto pela UI sem signed URL, aí cria 1 policy de SELECT pra role `authenticated` com expressão `bucket_id = 'debriefings'`. Não é o caso hoje.)

---

## 3. Configurar Google Drive Service Account (opcional, grace-degraded)

⚠️ Se você pular este passo, o debriefing roda mas usa **só ClickUp**. Sem Drive,
documentos como PEs, scripts e manifestos não entram na análise. Recomendo configurar.

### 3.1 — Criar service account no Google Cloud

1. https://console.cloud.google.com/ → criar projeto "FLG Debriefings" (se não existe)
2. **APIs & Services → Library** → habilitar **Google Drive API**
3. **IAM & Admin → Service Accounts** → **Create service account**
   - Name: `flg-debriefings-reader`
   - Role: nenhuma (só leitura de Drive, configurada por compartilhamento)
4. Após criar, click no service account → **Keys** → **Add key → Create new key** → JSON
   - Baixa o JSON. Guarde em local seguro (1Password).

### 3.2 — Compartilhar pastas com o service account

O service account tem um email tipo `flg-debriefings-reader@projeto.iam.gserviceaccount.com`.

No Google Drive da FLG:
1. Click direito na **pasta raiz dos clientes** (a que contém subpastas por cliente)
2. **Compartilhar** → adicionar o email do service account
3. Permissão: **Visualizador** (read-only)
4. Click "Enviar"

O service account agora consegue listar e ler tudo dentro daquela pasta.

### 3.3 — Adicionar credencial no servidor FLG

SSH na VPS:
```bash
ssh root@72.61.54.192
```

Edita o `.env` do projeto:
```bash
cd /root/flg-docs-system  # ou o path do deploy
nano backend/.env
```

Adiciona a linha (cole o JSON inteiro como string única, sem quebras):
```
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"flg-debriefings-reader@...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

⚠️ Importante: o JSON precisa estar em **uma única linha**. Use jq pra compactar:
```bash
jq -c < /path/to/downloaded-key.json
```

Salva (Ctrl+O → Enter → Ctrl+X).

Aplica reiniciando o backend:
```bash
docker compose restart backend
```

Ou simplesmente faz um push qualquer no GitHub que dispara redeploy.

### 3.4 — Validar

Pela UI: gere um debriefing de teste pra um cliente que tenha pasta no Drive
compartilhada. Se o card final mostra `num_docs > 0`, está funcionando.

---

## 4. Configurar `CLICKUP_WORKSPACE_ID` (opcional fallback)

Se você não quer ter que fornecer manualmente o `clickup_list_id` ao criar cada
debriefing, configure o workspace ID. O backend então busca a lista por nome do cliente.

1. ClickUp → click na engrenagem do workspace → **Settings**
2. URL muda pra `app.clickup.com/{WORKSPACE_ID}/v/s/settings/...`
3. Copie o `{WORKSPACE_ID}`
4. Adiciona no `backend/.env`:
   ```
   CLICKUP_WORKSPACE_ID=12345678
   ```
5. Reinicia backend (`docker compose restart backend`)

Se não configurar, o comercial precisa colar o `clickup_list_id` no modal.
Pra pegar o ID de uma lista: abra a lista → URL contém `/l/li/{LIST_ID}`.

---

## 5. (Importante) Atualizar Meta App Review pra incluir Anthropic

A FLG declarou na App Review que Anthropic não recebe Platform Data IG
(ver memory `meta_ig_only_tester_needed.md` + `meta_app_setup_pendencias.md`).

**Esta feature muda isso.** O debriefing envia métricas IG (extraídas de docs
no Drive — PEs, relatórios) pro Claude. Tecnicamente, Anthropic passa a processar
dados que se originam da Meta Graph API.

Antes de submeter a App Review (se ainda não submeteu), edite a seção Data Handling
e adicione:

- **Operador:** Anthropic, PBC
- **Categoria:** Para fornecer serviços de jogos ou soluções de TI, incluindo armazenamento e processamento em nuvem
- **Países:** Estados Unidos

Se já submeteu, atualize o formulário e re-submeta (Meta permite editar até
a análise começar).

---

## 6. Fluxo de uso pelo comercial

Depois do setup 1-5, o comercial usa assim:

1. Loga em https://docs.foundersledgrowth.online/
2. Vai em **Clientes** → seleciona o cliente que vai renovar
3. Click na tab **Debriefings**
4. Click **Novo Debriefing**
5. Preenche:
   - **Ciclo:** auto-sugerido (próximo número)
   - **Período:** auto-sugerido (últimos 6 meses) — ajusta se preciso
   - **ClickUp List ID:** colar se souber, senão deixa em branco (backend busca)
   - **Drive Folder ID:** colar se souber, senão deixa em branco (backend busca)
6. Click **Gerar Debriefing**
7. Acompanha as 4 fases ao vivo (~60-90 segundos)
8. Quando termina, click no card → vê o debriefing renderizado
9. Click **Baixar PDF** → arquivo abre em nova aba

---

## Custos por debriefing

- API Anthropic (Sonnet 4.6): ~R$3-12 por debriefing
- Storage Supabase: desprezível (~1MB por PDF)
- Google Drive API: gratuita até 1.000 requisições/dia
- ClickUp API: gratuita até 100/min (rate limit)

Projeção 30 renovações/mês: **~R$90-360/mês** em API total.

---

## Troubleshooting

### "Cliente não encontrado" no modal
- Verifica se o cliente_id da URL é válido (existe em `clientes` table)

### Status "falhou" no debriefing
- Click no debriefing → ver campo `erro` no banco
- Erros comuns:
  - `ANTHROPIC_API_KEY não configurado` → setar env var
  - `Lista do ClickUp não encontrada` → fornecer clickup_list_id manualmente
  - `[Google Drive não configurado]` → seguir Passo 3 acima

### PDF não baixa (404)
- Verifica se bucket `debriefings` existe no Supabase Storage
- Verifica se `pdf_storage_path` está populado na row do debriefings

### Custo muito alto (>R$20)
- Cliente com >300 tasks no ClickUp + >50 docs no Drive estoura context window
- Reduzir período do debriefing OU truncar manualmente
- (Futuro) implementar chunking automático

---

## Arquivos relevantes

- Backend:
  - [backend/routes/debriefings.py](../../backend/routes/debriefings.py) — endpoints REST + SSE
  - [backend/services/debriefing_generator.py](../../backend/services/debriefing_generator.py) — orquestrador 4 fases
  - [backend/services/clickup_debriefing.py](../../backend/services/clickup_debriefing.py) — extração ClickUp
  - [backend/services/google_drive_service.py](../../backend/services/google_drive_service.py) — extração Drive
  - [backend/services/debriefing_pdf.py](../../backend/services/debriefing_pdf.py) — markdown→PDF→storage
  - [backend/prompts/debriefing_prompt.py](../../backend/prompts/debriefing_prompt.py) — prompt v1.0

- Frontend:
  - [frontend/src/components/Debriefings/](../../frontend/src/components/Debriefings/) — hub, modal, stream panel, viewer

- DB:
  - [docs/migrations/007-debriefings.sql](../migrations/007-debriefings.sql)
