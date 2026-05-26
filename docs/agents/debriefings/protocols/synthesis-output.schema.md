# Synthesis Output Schema

> Saída do Synthesis Squad (sectionizer + compositor). Entry pro Quality Squad.

**Implementação:** `backend/agents/debriefings/schemas/synthesis_output.py`

---

```python
class SynthesisOutput(BaseModel):
    """Output universal do Synthesis Squad — entry pro Quality Squad."""
    debriefing_id: str
    outline: list[SectionOutline]         # do sectionizer
    markdown: str                          # do compositor — ~12-20k chars
    metadata: SquadMetadata
```

---

## SectionOutline (do sectionizer)

```python
class BulletWithRefs(BaseModel):
    text: str                              # ≤200 chars, factual
    source_refs: list[str]                 # IDs únicos dos findings
    flg_category: Optional[Literal[
        "cadeira_vazia",
        "triade_comportamental",
        "schwartz_consciousness",
        "progressao_autoridade",
        "fato_geral"
    ]]

class SectionOutline(BaseModel):
    section_num: str                       # "1", "2.1", "7.3"
    section_title: str
    bullets_prioritarios: list[BulletWithRefs]
    source_refs_consolidated: list[str]    # union dos source_refs dos bullets
```

---

## Invariantes que o Synthesis Squad GARANTE

1. **Exatamente 11 seções** (todas obrigatórias do template FLG).
2. **Cada bullet tem `source_refs` não-vazio** (rastreabilidade).
3. **Markdown final cita explicitamente `source_refs`** via `[fonte: source_id]` inline.
4. **Sem invenção:** todo bullet refere a um source_ref existente em `SourceFindings`.
5. **Markdown válido (Markdown CommonMark).**

---

## Seções obrigatórias (sectionizer garante)

```
1. Resumo Executivo
2. Perfil Estratégico do Cliente
   2.1 Identidade e Posicionamento
   2.2 Tríade Comportamental
   2.3 Schwartz (Níveis de Consciência)
3. Timeline de Execução
4. Inventário de Entregáveis
5. Análise de Reuniões
6. Dinâmica Consultor↔Cliente
7. Resultados Documentados
   7.1 Métricas Quantitativas
   7.2 Resultados Qualitativos
   7.3 Resultados de Negócio
8. Avaliação Estratégica (Metodologia FLG)
   8.1 Cadeira Vazia
   8.2 Progressão de Autoridade
   8.3 Consistência Narrativa
   8.4 Aplicação das Tríades
9. Gaps e Pendências
10. Recomendações para o Próximo Ciclo
11. Anexo — Fontes Consultadas
```

Se sectionizer não produz alguma seção, **bullets_prioritarios** fica `[]` mas a seção AINDA APARECE no outline. Compositor preenche com nota "Sem dados suficientes neste ciclo" pra essa seção. Quality não falha por isso (template está completo).

---

## Exemplo de outline (mini)

```json
{
  "debriefing_id": "uuid-1234",
  "outline": [
    {
      "section_num": "8.1",
      "section_title": "Cadeira Vazia",
      "bullets_prioritarios": [
        {
          "text": "Founder consolidou posicionamento como 'arquiteto de marca pessoal pra advogados B2B'",
          "source_refs": ["gd_pe_v2", "ck_milestone_42"],
          "flg_category": "cadeira_vazia"
        },
        {
          "text": "3 posts em maio reforçando essa cadeira tiveram engagement 2x média do ciclo",
          "source_refs": ["gd_relatorio_mai"],
          "flg_category": "cadeira_vazia"
        }
      ],
      "source_refs_consolidated": ["gd_pe_v2", "ck_milestone_42", "gd_relatorio_mai"]
    }
  ],
  "markdown": "# Debriefing Estratégico — ...\n\n## 8.1 Cadeira Vazia\n\nA FLG observa que o Founder consolidou seu posicionamento como 'arquiteto de marca pessoal pra advogados B2B' [fonte: gd_pe_v2, ck_milestone_42]. ...",
  "metadata": {
    "squad_name": "synthesis",
    "agents": [
      {"agent_name": "sectionizer", "cost_usd": 0.08, ...},
      {"agent_name": "compositor", "cost_usd": 0.28, ...}
    ],
    "total_cost_usd": 0.36,
    "total_duration_ms": 75000,
    "parallelism": "sequential"
  }
}
```
