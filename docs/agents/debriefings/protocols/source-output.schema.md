# Source Output Schema

> Saída consolidada do Source Squad. Detalhes de cada sub-componente neste documento.

**Implementação:** `backend/agents/debriefings/schemas/source_output.py`

---

```python
class SourceFindings(BaseModel):
    """Output universal do Source Squad — entry pro Synthesis Squad."""
    debriefing_id: str
    clickup: ClickUpFindings
    drive: DriveFindings
    period: tuple[date, date]
    total_items: int                       # tasks + docs combinados
    issues: list[Issue]
    metadata: SquadMetadata
```

---

## ClickUpFindings (do `clickup-fetcher`)

```python
class TaskFinding(BaseModel):
    id: str
    title: str
    status: str
    assignees: list[str]
    tags: list[str]
    date_created: datetime
    date_updated: datetime
    date_closed: Optional[datetime]
    description_excerpt: str               # ≤1500 chars
    top_comments: list[Comment]
    citation_uri: str                      # OBRIGATÓRIO

class Comment(BaseModel):
    author: str
    date: datetime
    text: str                              # ≤500 chars

class MilestoneFinding(BaseModel):
    task_id: str
    type: Literal["decisao", "entrega", "alerta", "pivot"]
    description: str
    date: datetime
    citation_uri: str

class CommentThread(BaseModel):
    """Comentários sem resposta há 7+ dias."""
    task_id: str
    task_title: str
    open_since: datetime
    last_comment: Comment
    citation_uri: str

class ClickUpFindings(BaseModel):
    tasks: list[TaskFinding]
    milestones: list[MilestoneFinding]
    open_threads: list[CommentThread]
    summary: str                           # 3-5 bullets
    truncated: bool
    issues: list[Issue]
    metadata: AgentMetadata
```

---

## DriveFindings (do `drive-fetcher` + `classifier`)

```python
class DriveRawItem(BaseModel):
    """Output cru do drive-fetcher, antes do classifier."""
    id: str
    name: str
    mime_type: str
    modified_time: datetime
    web_view_link: str                     # citation_uri
    content_preview: str                   # ≤4000 chars
    raw_metadata: dict

class DriveItemClassified(BaseModel):
    """Output final, depois do classifier."""
    id: str
    name: str
    type: Literal["transcricao", "relatorio_entregas",
                   "documento_estrategico", "outro", "desconhecido"]
    confidence: Literal["high", "medium", "low"]
    layer_used: Literal["regex", "embedding", "llm", "none"]
    key_points: list[str]                  # extraídos por tipo
    citation_uri: str
    modified_time: datetime
    content_excerpt: str

class DriveFindings(BaseModel):
    items: list[DriveItemClassified]
    by_type: dict[str, int]                # contagem por categoria
    issues: list[Issue]
    metadata: AgentMetadata
```

---

## Invariantes que o Source Squad GARANTE

Validados por Pydantic + asserts adicionais antes do output:

1. **Todo item tem `citation_uri` populado.** Sem citation = item rejeitado.
2. **Datas estão no período.** `min(item.date) >= period_inicio` e `max <= period_fim` (modulo casos de tasks atualizadas após period_fim).
3. **`total_items = len(clickup.tasks) + len(drive.items)`**
4. **Metadata batem com soma de individuais.**

---

## Exemplo de output (mini)

```json
{
  "debriefing_id": "uuid-1234",
  "clickup": {
    "tasks": [
      {
        "id": "ck_abc",
        "title": "Aprovação de copy do post quarta",
        "status": "Concluído",
        "assignees": ["lucas_nery"],
        "tags": ["copy", "instagram"],
        "date_created": "2026-01-15T10:00:00Z",
        "date_updated": "2026-01-17T16:30:00Z",
        "date_closed": "2026-01-17T16:30:00Z",
        "description_excerpt": "Roteiro do post: cadeira vazia do Founder...",
        "top_comments": [
          {"author": "cliente", "date": "...", "text": "Gostei muito, aprovado!"}
        ],
        "citation_uri": "https://app.clickup.com/t/ck_abc"
      }
    ],
    "milestones": [...],
    "open_threads": [],
    "summary": "47 tasks no ciclo, 38 fechadas. Destaque: campanha piloto encontros 7-8.",
    "truncated": false,
    "issues": [],
    "metadata": {...}
  },
  "drive": {
    "items": [
      {
        "id": "gd_xyz",
        "name": "Relatório de Entregas — Abril 2026",
        "type": "relatorio_entregas",
        "confidence": "high",
        "layer_used": "regex",
        "key_points": [
          "Engajamento +18% vs Mar",
          "Reach 145k",
          "3 reels viralizaram (>10k views cada)"
        ],
        "citation_uri": "https://drive.google.com/file/d/gd_xyz/view",
        "modified_time": "2026-04-30T09:00:00Z",
        "content_excerpt": "..."
      }
    ],
    "by_type": {"transcricao": 5, "relatorio_entregas": 6, "documento_estrategico": 2, "outro": 1},
    "issues": [],
    "metadata": {...}
  },
  "period": ["2025-12-01", "2026-05-30"],
  "total_items": 21,
  "issues": [],
  "metadata": {...}
}
```
