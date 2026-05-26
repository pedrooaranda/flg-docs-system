# Synthesis Squad

**Missão:** transformar os findings estruturados do Source Squad em prosa estratégica seguindo o template FLG fixo de 11 seções (~20 páginas). Aplica metodologia FLG (Cadeira Vazia, Tríades, Schwartz, Progressão de Autoridade). Sequencial: outline ANTES da prosa.

## Agentes deste squad (2)

| Agente | Tipo | Modelo | Spec |
|---|---|---|---|
| `sectionizer` | LLM | Sonnet 4.6 (Opus opt-in) | [`sectionizer.agent.md`](sectionizer.agent.md) |
| `compositor` | LLM | Sonnet 4.6 (Opus opt-in) | [`compositor.agent.md`](compositor.agent.md) |

## Schema de output do squad

```python
class SectionOutline(BaseModel):
    """Output do sectionizer."""
    section_num: str                # "1", "2.1", "7.3" etc.
    section_title: str              # "Resumo Executivo", "Métricas Quantitativas" etc.
    bullets_prioritarios: list[str] # 3-7 bullets que devem aparecer nesta seção
    source_refs: list[str]          # IDs dos findings que embasam esta seção

class SynthesisOutput(BaseModel):
    """Output consolidado do Synthesis Squad."""
    debriefing_id: str
    outline: list[SectionOutline]   # do sectionizer
    markdown: str                   # do compositor — Markdown completo do debriefing
    metadata: SquadMetadata
```

## Princípios

1. **Sequencial obrigatório.** `sectionizer` ANTES de `compositor`. Compositor precisa do outline pra escrever.
2. **Sectionizer decide ESTRUTURA, compositor decide PROSA.** Separação clara de responsabilidade. Permite tunar prompts independentemente.
3. **Citação obrigatória no markdown.** Cada bullet factual escrito pelo compositor referencia source_refs do outline. Quality Squad valida.
4. **Anti-hallucination by design.** Compositor NÃO inventa fatos — só pega de `findings`. Quality squad verifica.
5. **Modelo grande.** Sonnet 4.6 default. Opus 4.7 via `USE_OPUS=true` pra clientes high-touch.

## Fluxo interno

```
       ┌──────────────────┐
       │  Orchestrator    │
       │ dispatch_synth() │
       └────────┬─────────┘
                │
       ┌────────▼──────────┐
       │   sectionizer     │
       │   (Sonnet 4.6)    │
       │   cria outline    │
       └────────┬──────────┘
                │
       ┌────────▼──────────┐
       │   compositor      │
       │   (Sonnet 4.6)    │
       │   preenche prosa  │
       └────────┬──────────┘
                │
       ┌────────▼──────────┐
       │ SynthesisOutput   │
       └───────────────────┘
```

## Cost / Latency baseline do squad

| Métrica | Esperado | P95 (com Opus opt-in) |
|---|---|---|
| Custo USD | $0,36 | $1,20 |
| Latência (sequencial) | 45-75s | 180s |
| Tokens markdown output | ~12k | 20k |

## Owner

`pedroaranda@grupoguglielmi.com`
