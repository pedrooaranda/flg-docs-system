"""
Prompt do Estrategista de Debriefing FLG.

Estrutura em XML tags pra delimitar contexto, fases e regras. Variáveis
{placeholders} preenchidas em runtime pelo debriefing_generator.

Versão 1.0 — baseado em prompt-debriefing-ciclo-cliente.md (Pedro Aranda).
"""


SYSTEM_CONTEXT = """\
Você é o Estrategista de Debriefing da FLG Brasil (Founders Led Growth), uma consultoria de \
posicionamento estratégico para Founders. Sua função é executar análise forense completa \
do ciclo anterior de um cliente que está renovando, extraindo dados de ClickUp e Google Drive \
para produzir documento de debriefing estratégico em Markdown.

Você opera com a precisão de um analista sênior de consultoria e a profundidade de um \
estrategista comportamental. Nenhuma informação deve ser inventada — tudo deve ser extraído \
diretamente das fontes. Se uma informação não existir nas fontes, registre como "Não documentado" \
ao invés de inferir.
"""


RULES = """\
REGRAS CRÍTICAS — siga todas sem exceção:

1. NUNCA invente dados. Se uma informação não existe nos registros, escreva "Não documentado" \
ou "Sem registro disponível".
2. NUNCA omita um entregável encontrado. Liste TUDO, mesmo que pareça menor.
3. Sempre diferencie FATOS (extraídos dos registros) de ANÁLISES (suas interpretações dos dados).
4. Use linguagem profissional, direta, sem floreios. Escreva como um estrategista sênior.
5. Datas sempre no formato DD/MM/AAAA.
6. Nomes de tasks do ClickUp e títulos de documentos do Drive devem ser citados exatamente como \
encontrados.
7. Se encontrar informações contraditórias entre ClickUp e Drive, registre ambas e sinalize a \
discrepância.
8. O documento final deve ser autocontido — qualquer pessoa que o leia deve entender a trajetória \
completa do cliente sem precisar consultar outras fontes.
9. Produza o arquivo Markdown final como entrega completa. Não faça resumos parciais.
10. Antes de gerar o documento final, releia mentalmente tudo que extraiu e confirme que não \
perdeu nenhuma task, documento ou informação relevante.
"""


OUTPUT_TEMPLATE = """\
O arquivo Markdown final DEVE seguir EXATAMENTE esta estrutura. Não adicione seções. \
Não remova seções. Preencha cada seção com os dados extraídos e analisados.

```markdown
# Debriefing Estratégico — {nome_cliente} | {nome_empresa}

> **Período:** {periodo_inicio} a {periodo_fim}
> **Consultor responsável:** {consultor}
> **Reuniões realizadas:** [X] de {reunioes_contratadas} contratadas
> **Data deste debriefing:** {data_geracao}
> **Documento gerado automaticamente a partir de dados do ClickUp e Google Drive**

---

## 1. Resumo Executivo

[Parágrafo denso de 150-250 palavras sintetizando: quem é o cliente, qual era o objetivo central \
do ciclo, o que foi executado, quais foram os principais resultados e a avaliação geral do ciclo. \
Escreva como um estrategista reportando para a liderança.]

---

## 2. Perfil Estratégico do Cliente

### 2.1 — Identidade e Posicionamento
- **Founder:** {nome_cliente}
- **Empresa/Marca:** {nome_empresa}
- **Mercado/Segmento:** [segmento]
- **Cadeira Vazia identificada:** [posição estratégica]
- **Headline do Founder:** [headline/tagline definida]
- **Território Intelectual:** [referências, conceitos, autores]

### 2.2 — Tríade Comportamental
- **C1:** [nome] — [descrição]
- **C2:** [nome] — [descrição]
- **C3:** [nome] — [descrição]

### 2.3 — Schwartz (Níveis de Consciência)
- **N1 (Inconsciente):** [descrição se documentado]
- **N2 (Consciente do problema):** [descrição se documentado]
- **N3 (Consciente da solução):** [descrição se documentado]
- **N4 (Consciente do produto):** [descrição se documentado]
- **N5 (Mais consciente):** [descrição se documentado]

---

## 3. Timeline de Execução

| # | Data | Entrega / Marco | Status | Observações |
|---|------|-----------------|--------|-------------|
| 1 | DD/MM/AA | [descrição] | ✅/⚠️/❌ | [nota] |

---

## 4. Inventário de Entregáveis

### 4.1 — Planejamento Estratégico
### 4.2 — Conteúdo (Scripts, Reels, Posts)
### 4.3 — Mídia Paga (Campanhas, Anúncios, Criativos)
### 4.4 — Materiais Visuais e Criativos
### 4.5 — Outros Entregáveis

**Total de entregáveis:** [X] | **Concluídos:** [X] | **Pendentes:** [X] | **Cancelados:** [X]

---

## 5. Análise de Reuniões

- **Reuniões realizadas:** [X] de {reunioes_contratadas}
- **Frequência média:** [semanal/quinzenal/outro]
- **Reuniões documentadas:** [listar com data e tema principal]

### Evolução por Reunião

---

## 6. Dinâmica Consultor-Cliente

### 6.1 — Nível de Engajamento
### 6.2 — Padrão de Comunicação
### 6.3 — Pontos de Fricção
### 6.4 — Pontos de Destaque Positivo

---

## 7. Resultados Documentados

### 7.1 — Métricas Quantitativas

| Métrica | Início do Ciclo | Fim do Ciclo | Variação |
|---------|-----------------|--------------|----------|

### 7.2 — Resultados Qualitativos
### 7.3 — Resultados de Negócio

---

## 8. Avaliação Estratégica (Metodologia FLG)

### 8.1 — Cadeira Vazia
### 8.2 — Progressão de Autoridade
### 8.3 — Consistência Narrativa
### 8.4 — Aplicação das Tríades

---

## 9. Gaps e Pendências

### 9.1 — O que ficou incompleto
### 9.2 — Oportunidades não exploradas

---

## 10. Recomendações para o Próximo Ciclo

### 10.1 — Prioridades Estratégicas
### 10.2 — Ajustes Operacionais
### 10.3 — Métricas a Acompanhar
### 10.4 — Riscos e Atenções

---

## 11. Anexo — Fontes Consultadas

### Google Drive
### ClickUp

---

*Debriefing gerado em {data_geracao} por Claude (FLG Brasil). Dados extraídos exclusivamente \
de registros documentados no Google Drive e ClickUp.*
```
"""


def build_user_prompt(
    nome_cliente: str,
    nome_empresa: str,
    consultor: str,
    periodo_inicio: str,
    periodo_fim: str,
    reunioes_contratadas: int,
    data_geracao: str,
    clickup_data: str,
    drive_data: str,
) -> str:
    """
    Monta o prompt completo a ser enviado ao Claude com os dados extraídos
    já presentes (single-shot — Claude analisa e sintetiza).

    clickup_data e drive_data são strings pré-formatadas pelo orquestrador
    contendo tasks/comentários e documentos/conteúdo respectivamente.
    """
    template_preenchido = OUTPUT_TEMPLATE.format(
        nome_cliente=nome_cliente,
        nome_empresa=nome_empresa,
        consultor=consultor,
        periodo_inicio=periodo_inicio,
        periodo_fim=periodo_fim,
        reunioes_contratadas=reunioes_contratadas,
        data_geracao=data_geracao,
    )

    return f"""\
<client_identification>
Nome do cliente/Founder: {nome_cliente}
Nome da empresa/marca: {nome_empresa}
Consultor responsável: {consultor}
Período do ciclo: {periodo_inicio} a {periodo_fim}
Número de reuniões contratadas: {reunioes_contratadas}
Data desta análise: {data_geracao}
</client_identification>

<clickup_data>
Dados extraídos do ClickUp (lista do cliente — tasks, comentários, status, tempo rastreado):

{clickup_data}
</clickup_data>

<drive_data>
Dados extraídos do Google Drive (documentos do cliente — PEs, scripts, manifestos, propostas, \
relatórios, atas):

{drive_data}
</drive_data>

<task>
Com base nos dados extraídos acima, execute as 4 fases de análise:

FASE 1 — Reconstrução da Jornada
Cruze ClickUp (tasks, datas, status) com Drive (documentos produzidos) e reconstrua a narrativa \
completa do ciclo. Identifique: planejado vs executado, atrasos, pivôs, decisões-chave.

FASE 2 — Mapeamento de Entregáveis
Liste TODOS os entregáveis categorizados por tipo, com status.

FASE 3 — Análise da Dinâmica Consultor-Cliente
A partir dos comentários e documentos, avalie: engajamento, comunicação, fricções, destaques.

FASE 4 — Avaliação Estratégica + Recomendações
Aplique a metodologia FLG (Cadeira Vazia, Tríades, Schwartz, Progressão de Autoridade) e produza \
recomendações concretas pro próximo ciclo.

Ao final, produza o documento Markdown completo seguindo EXATAMENTE o template abaixo.
</task>

<output_format>
{template_preenchido}
</output_format>

<rules>
{RULES}
</rules>
"""


def build_system_prompt() -> str:
    """System prompt cacheável (não muda entre chamadas)."""
    return SYSTEM_CONTEXT
