# FLG Jornada System

> **FLG Brasil** — Plataforma de gestão estratégica de clientes com IA

---

## Sobre

O **FLG Jornada System** é uma plataforma interna que apoia consultores da FLG Brasil na condução da jornada de 15 encontros com founders. O sistema centraliza o perfil de cada cliente, histórico de conversas, geração de materiais estratégicos e sincronização de dados operacionais.

---

## Arquitetura

```
docs.foundersledgrowth.online          → Frontend React (consultor)
docs.foundersledgrowth.online/api/*    → Backend FastAPI + Agente IA
```

| Camada      | Tecnologia                        |
|-------------|-----------------------------------|
| Frontend    | React + Vite + Tailwind CSS       |
| Backend     | Python / FastAPI + Agno           |
| Agente IA   | Claude (Anthropic) via Agno       |
| Banco       | Supabase (PostgreSQL)             |
| Storage     | Supabase Storage                  |
| Auth        | Supabase Auth (JWT)               |
| PDF         | WeasyPrint                        |
| Deploy      | Docker Compose + Traefik (VPS)    |

---

## Funcionalidades

- **Dashboard de clientes** — visão geral da jornada de cada founder
- **Chat com agente IA** — assistente especializado no perfil do cliente e na metodologia FLG
- **Geração de slides HTML + PDF** — materiais personalizados por encontro
- **Upload e processamento de documentos** — planejamento estratégico e estudos de mercado via Docling
- **Base de conhecimento dinâmica** — injeção de conteúdo metodológico no agente via painel admin
- **Sincronização ClickUp** — agente de rotina que lê comentários e atualiza perfis automaticamente

---

## Estrutura do Repositório

```
documentos_oficiais/
│
├── backend/                    ← FastAPI + Agno (agente IA)
│   ├── agents/                 ← Definição dos agentes
│   ├── tools/                  ← Ferramentas do agente (cliente, slides, ClickUp)
│   ├── prompts/                ← System prompt e prompt de slides
│   ├── routes/                 ← Endpoints REST
│   ├── assets/images/          ← Imagens estáticas dos 15 encontros
│   ├── main.py
│   ├── config.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                   ← React + Vite
│   ├── src/
│   │   ├── components/         ← Login, Dashboard, Chat, Slides, Admin
│   │   └── lib/                ← Supabase client + API wrapper
│   ├── nginx.conf
│   └── Dockerfile
│
├── supabase/
│   └── migrations/             ← Schema SQL + seeds
│
├── document_template/          ← Templates visuais FLG (referência)
│   ├── slides/
│   └── documento/
│
└── docker-compose.yml
```

---

## Padrão Visual

| Elemento       | Valor                               |
|----------------|--------------------------------------|
| Fundo          | `#080808`                           |
| Texto          | `#FAFAF8`                           |
| Gold principal | `#C9A84C`                           |
| Gold claro     | `#F5D68A`                           |
| Gold escuro    | `#8B6914`                           |
| Título         | Playfair Display                    |
| Corpo          | Poppins                             |

---

## Deploy

O sistema roda em VPS com Docker Compose + Traefik (HTTPS automático via Let's Encrypt).

Variáveis de ambiente necessárias estão documentadas em `.env.example`.

---

*FLG Brasil · São Paulo*
