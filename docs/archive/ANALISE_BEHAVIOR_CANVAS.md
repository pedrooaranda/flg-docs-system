# Análise & Melhorias — FLG Behavior Canvas

**Data:** 08/04/2026
**Status:** Stack validada, melhorias identificadas

---

## Stack Validada (tudo real e estável)

| Tecnologia | Versão Real | Status |
|---|---|---|
| AI SDK (Vercel) | v6.0.153 | Estável, `streamText` + adaptive thinking OK |
| @ai-sdk/anthropic | v3.0.68 | Suporte completo Claude Opus 4.6 |
| Next.js | 15.5.14 (ou 16.2.2) | App Router estável, Turbopack produção |
| Tailwind CSS | v4.2.2 | Estável, config via CSS (`@theme`) |
| shadcn/ui | CLI latest | Suporte Tailwind v4 com `--tw4` |
| Drizzle ORM | v0.45.2 | Produção, melhor que Prisma p/ Edge |
| @react-pdf/renderer | v4.4.0 | Funciona em Route Handler (NÃO em RSC) |
| Resend | v6.10.0 | Padrão de mercado, sem rival melhor |
| Upstash Redis | v1.37.0 | Rate limiting Edge-compatible |

---

## Melhorias sobre o briefing original

### 1. Next.js 16 em vez de 15
Next.js 16.2.2 é a versão `latest` atual. Recomendo usar 16 — tem melhorias de performance e o React 19 completo (Server Actions mais estáveis, Suspense refinado). Se preferir conservador, 15.5.14 funciona igualmente.

**Decisão:** Usar Next.js 15.5.14 (mais testado em produção com AI SDK v6).

### 2. Tailwind v4 — config via CSS, não via JS
Tailwind v4 mudou radicalmente: não usa mais `tailwind.config.js`. A config fica dentro do CSS com `@theme`. O shadcn/ui suporta com flag `--tw4`. Isso simplifica o setup mas muda o mental model.

**Decisão:** Usar Tailwind v4 — é o futuro e evita dívida técnica.

### 3. Paleta de cores — DIFERENTE do Jornada System (correto)
O briefing define cores diferentes do sistema principal:
- **Behavior Canvas:** `#002239` (dark blue) + `#b8915a` (gold quente) + `#f4f4f3` (off-white)
- **Jornada System:** `#080808` (preto) + `#C9A84C` (gold brilhante) + `#FAFAF8` (branco)

Isso faz sentido — o Canvas é um produto público (lead gen), precisa de personalidade visual diferente do painel interno.

**Decisão:** Manter paleta do Canvas como no briefing. O "padrão intelectual" compartilhado é a qualidade e patterns de código, não as cores.

### 4. PDF geração — Route Handler, NÃO Server Component
@react-pdf/renderer não funciona em Server Components do Next.js. Deve ser usado em `app/api/pdf/[id]/route.ts` que retorna um stream.

**Decisão:** Implementar PDF via Route Handler com `new Response(pdfStream)`.

### 5. Autosave — Supabase Realtime, não polling
O briefing menciona "autosave em sessão". A melhor implementação:
- Debounce de 2s no client
- Server Action que faz upsert no `canvas_clients`
- Progress bar atualiza baseada nos dados salvos no banco
- Se o usuário fecha e volta, retoma exatamente de onde parou via `sessionId` no cookie

### 6. Segurança do System Prompt
O briefing corretamente diz que o system prompt é IP sensível. Melhoria: em vez de env var (que aparece em logs de deploy), usar Supabase como vault:
- Tabela `system_prompts` com RLS que só service role lê
- Versionamento do prompt com timestamp
- Nunca no código-fonte, nunca em env var visível

### 7. Mobile-first — Formulário multi-step, não página longa
O briefing diz que o empresário vai preencher do celular. Melhoria no UX:
- 1 pergunta por tela (não 7 de uma vez)
- Swipe/slide horizontal entre perguntas
- Keyboard nativo otimizado (inputMode="numeric" p/ ticket, etc.)
- Botão "Próximo" fixo no bottom
- Animação de transição entre perguntas (framer-motion)

### 8. Analytics — Funil por etapa no PostHog
Adicionar eventos granulares:
- `canvas_started` → landing → start
- `onboarding_completed` → start → fill
- `client_N_completed` → cada cliente preenchido (N=1..15)
- `lead_captured` → modal de captura
- `analysis_started` → início da análise IA
- `analysis_completed` → canvas renderizado
- `pdf_downloaded` → exportou PDF
- `cta_clicked` → clicou em agendar diagnóstico

Isso dá visibilidade completa do funil de conversão.

### 9. Rate Limiting — Mais granular
Além do limite por sessão (3 análises/hora), adicionar:
- IP-based: 10 análises/hora por IP (contra bots)
- Canvas-based: 1 análise por canvas (re-análise só com novo dado)
- Global: circuit breaker se custo de API ultrapassa threshold diário

### 10. Email nurturing — 5 emails em sequência
Implementar com Resend + Supabase cron (pg_cron):
- Email 1 (imediato): PDF do Canvas + "Seus padrões foram identificados"
- Email 2 (dia +2): "O que significa cada sinal detectado"
- Email 3 (dia +5): "O gap entre sinais e estratégia"
- Email 4 (dia +8): Caso de estudo de um cliente FLG (genérico)
- Email 5 (dia +12): "Última chance de diagnóstico gratuito" + CTA

---

## Decisão Arquitetural Final

Dado que a stack é DIFERENTE do Jornada System (Next.js vs React+Vite, Vercel vs Docker/VPS), o compartilhamento de código-fonte direto não faz sentido. O que compartilhamos é:

| Compartilhado | Como |
|---|---|
| Qualidade de código | CLAUDE.md rules + code-style.md |
| Padrões de API | Mesmo approach (Zod validation, streaming, auth) |
| Supabase patterns | RLS, service role, Realtime |
| Design sensibility | Gold palette (adaptada), premium feel, dark-first |
| Deploy mindset | CI/CD automático, healthcheck, rollback |

**NÃO compartilhado** (e tá certo):
- Componentes React (diferentes frameworks)
- CSS (Tailwind v4 syntax vs v3)
- Deploy target (Vercel vs VPS/Docker)
- Paleta de cores (public vs internal)

---

## Próximo passo

Criar o repositório `flg-behavior-canvas`, colocar o CLAUDE.md refinado na raiz, e executar a Fase 1 do bootstrap. Aguardando confirmação do Pedro.
