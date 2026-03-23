# Agente de Deploy Automático — FLG Jornada System

> Este arquivo define as regras, comportamento e procedimentos do agente de deploy automático do sistema FLG. Qualquer agente de IA (ou humano) que trabalhe com deploys neste projeto DEVE seguir estas diretrizes.

---

## O que é este agente

O Agente de Deploy é um GitHub Actions workflow (`.github/workflows/deploy.yml`) que monitora o repositório e sincroniza a VPS automaticamente. Ele:

- **Monitora** o branch `main` no GitHub
- **Compara** o código do GitHub com o que está rodando na VPS
- **Reconstrói** apenas os serviços que mudaram (backend e/ou frontend)
- **Valida** a saúde do serviço após cada deploy
- **Faz rollback** automaticamente se o healthcheck falhar

---

## Arquitetura do Sistema

```
GitHub (main branch)
       ↓ push
GitHub Actions (ubuntu-latest)
       ↓ SSH (appleboy/ssh-action)
VPS: 72.61.54.192
  /opt/flg-jornada/
       ↓ git pull
Docker Compose
  ├── backend  (FastAPI + AgentOS) → porta 8000
  └── frontend (React/Nginx)       → porta 80
       ↓ Traefik reverse proxy
docs.foundersledgrowth.online
  ├── /api/* → backend
  └── /*     → frontend
```

---

## Configuração Inicial (GitHub Secrets)

Adicionar em **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Valor |
|--------|-------|
| `VPS_HOST` | `72.61.54.192` |
| `VPS_USER` | `root` |
| `VPS_SSH_PASS` | Senha da VPS |

> ⚠️ Nunca commitar credenciais no código. Sempre usar Secrets do GitHub.

---

## Regras de Disparo

### O deploy RODA quando:
- Push para `main` com mudanças em `backend/**`
- Push para `main` com mudanças em `frontend/**`
- Trigger manual (`workflow_dispatch`) com ou sem `force_rebuild`

### O deploy é IGNORADO quando:
- Mudanças apenas em arquivos `.md`
- Mudanças em `clients/**` (materiais de clientes)
- Mudanças em `document_template/**`
- Commit com `[skip ci]` na mensagem

---

## Regras de Rebuild Seletivo

O agente é inteligente: **só reconstrói o que mudou**.

| Mudança | Ação |
|---------|------|
| `backend/**` | `docker compose build backend` + `up --no-deps backend` |
| `frontend/**` | `docker compose build frontend` + `up --no-deps frontend` |
| Ambos | Rebuild de backend primeiro, depois frontend |
| Nenhum (já atualizado) | Skip — nenhuma ação |
| `force_rebuild=true` | Rebuild completo de backend + frontend |

---

## Healthcheck e Rollback

### Healthcheck após deploy do backend:
1. Aguarda até 30 segundos (6 tentativas × 5s)
2. Faz `curl http://localhost:8000/health`
3. Se retornar 200 → deploy bem-sucedido ✅
4. Se todas as tentativas falharem → **rollback automático**

### Rollback automático:
```bash
git reset --hard HEAD~1        # Volta para o commit anterior
docker compose build backend   # Reconstrói com código antigo
docker compose up -d --no-deps backend
```

> O rollback é silencioso para o usuário — o serviço continua funcionando com a versão anterior.

---

## Verificação de Deploy

Para verificar se a VPS está atualizada:

```bash
# Versão do deploy em produção
curl https://docs.foundersledgrowth.online/api/deploy-status

# Saída esperada:
# {
#   "git_sha": "abc1234...",
#   "service": "FLG Jornada System",
#   "status": "running"
# }

# Health check
curl https://docs.foundersledgrowth.online/api/health
```

---

## Deploy Manual de Emergência

Se o agente falhar ou houver necessidade de intervenção manual:

```bash
# Conectar à VPS
ssh root@72.61.54.192

# Ir para o projeto
cd /opt/flg-jornada

# Atualizar código
git pull

# Rebuild apenas o backend
docker compose build backend
docker compose up -d --no-deps backend

# Rebuild apenas o frontend
docker compose build frontend
docker compose up -d --no-deps frontend

# Rebuild completo
docker compose build
docker compose up -d

# Ver logs em tempo real
docker compose logs -f backend --tail=50
docker compose logs -f frontend --tail=20

# Ver status dos containers
docker compose ps
```

---

## Forçar Rebuild Completo

Quando precisar reconstruir tudo do zero (ex: mudança em variáveis de ambiente, Dockerfile, etc.):

1. Ir para **GitHub → Actions → FLG — Agente de Deploy Automático**
2. Clicar em **"Run workflow"**
3. Marcar **"Forçar rebuild completo? ✅"**
4. Clicar **"Run workflow"**

---

## Regras para o Agente de IA (Claude Code)

Quando estiver trabalhando neste projeto como agente de IA, siga estas regras:

### DEVE fazer:
- Sempre fazer `git push` após commits para disparar o deploy automático
- Usar mensagens de commit descritivas (o deploy loga o SHA, facilita rastreamento)
- Verificar `GET /api/deploy-status` para confirmar que o deploy foi aplicado
- Aguardar 2-3 minutos após o push antes de confirmar que o deploy está ativo
- Informar o usuário quando um push foi feito e o deploy deve estar ativo em breve

### NÃO DEVE fazer:
- Fazer SSH na VPS manualmente para deploys (use o workflow)
- Commitar em branches que não sejam `main` esperando deploy (só `main` dispara)
- Alterar credenciais no `.env` da VPS diretamente — sempre atualizar via SSH + restart
- Fazer rollback manual sem verificar os logs do backend primeiro

### Em caso de erro no deploy:
1. Verificar **GitHub → Actions** para ver o log do workflow
2. SSH na VPS e rodar `docker compose logs backend --tail=50`
3. Se o serviço não responder, checar `docker compose ps`
4. Rollback manual se necessário (ver seção acima)

---

## Estrutura de Pastas Relevante

```
/opt/flg-jornada/          ← raiz do projeto na VPS
├── .env                   ← variáveis de ambiente (NUNCA commitar)
├── docker-compose.yml     ← orquestração dos serviços
├── backend/
│   ├── Dockerfile
│   ├── main.py            ← FastAPI + AgentOS
│   └── ...
└── frontend/
    ├── Dockerfile
    └── ...
```

---

## Variáveis de Ambiente da VPS

As variáveis estão em `/opt/flg-jornada/.env`. Para alterar:

```bash
ssh root@72.61.54.192
nano /opt/flg-jornada/.env

# Após alterar variáveis do backend, reiniciar sem rebuild:
cd /opt/flg-jornada
docker compose up -d --no-deps backend
```

> Variáveis do frontend (prefixo `VITE_`) requerem rebuild completo do container frontend.

---

## Manutenção Periódica

O agente de deploy cuida do código. Para manutenção da infraestrutura:

```bash
# Limpar imagens Docker antigas (mensal)
docker image prune -f

# Ver uso de disco
df -h

# Ver uso de memória dos containers
docker stats --no-stream

# Atualizar Traefik (quando necessário)
cd /opt/traefik
docker compose pull
docker compose up -d
```
