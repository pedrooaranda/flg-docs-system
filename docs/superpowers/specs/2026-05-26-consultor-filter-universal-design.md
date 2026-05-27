# ConsultorFilter Universal — design

**Data:** 2026-05-26
**Stream:** 8.1 (1º sub-stream do Stream 8 polish UI)
**Status:** spec aprovada, plano e implementação na sequência
**Escopo:** refactor de localização + 1 nova adoção em Clientes.jsx. Streams 8.2-8.4 (polish Clientes/Métricas/Ranking) virão depois.

---

## 1. Objetivo

Padronizar o componente `ConsultorFilter` (tabs pill "Todos · Pedro Aranda · Lucas Nery · Rebecca Rachel · ...") em todas as telas com filtro por consultor. Hoje vive em `Materiais/shared/` (usado só por Dashboard e Materiais). Outras telas (Clientes.jsx) usam `<select>` vanilla.

Pedro: "Acredito que pode usar essa UI para os filtros dos consultores em todas as páginas, sacou? Aí já padronizamos" (2026-05-26).

---

## 2. Mudanças

### 2.1 Mover componente pra UI compartilhada

| Antes | Depois |
|---|---|
| `frontend/src/components/Materiais/shared/ConsultorFilter.jsx` | `frontend/src/components/ui/ConsultorFilter.jsx` |
| `frontend/src/components/Materiais/shared/consultor-utils.js` (função `listConsultoresFromClientes`) | `frontend/src/lib/consultores.js` (apenas `listConsultoresFromClientes`) |

`consultor-utils.js` original **fica em Materiais/shared/** porque ainda exporta `matchConsultor` e `isAdminFromSession` usados em Materiais. Importa de `lib/consultores.js` em vez de duplicar a função.

### 2.2 API do componente (sem breaking change)

```jsx
<ConsultorFilter
  value={filterConsultor}      // 'todos' | <nome>
  onChange={setFilterConsultor}
  clientes={allClientes}       // deriva consultores (DISTINCT consultor_responsavel)
  consultores={undefined}      // NOVO opcional: override explícito quando tela não tem array
/>
```

Comportamento:
- Se `consultores` (array) for fornecido, usa direto
- Senão, deriva de `clientes` (comportamento atual)
- Mantém fallback hardcoded `['Pedro Aranda', 'Lucas Nery', 'Rebecca Rachel']`

### 2.3 Imports a atualizar

Files que importam `Materiais/shared/ConsultorFilter`:
- `frontend/src/components/Dashboard.jsx` (linha de import)
- `frontend/src/components/Materiais/index.jsx`
- Outros que `grep -rln "Materiais/shared/ConsultorFilter"` retornar

Novo path: `from '../ui/ConsultorFilter'` (ou caminho relativo correto).

### 2.4 Nova adoção: Clientes.jsx

**Antes** (linhas ~405-410):
```jsx
{canSeeAll && (
  <select value={filterConsultor} onChange={e => setFilterConsultor(e.target.value)} className="input-flg w-auto pr-8 cursor-pointer">
    <option value="todos">Todos os consultores</option>
    {consultores.map(c => <option key={c} value={c}>{c}</option>)}
  </select>
)}
```

**Depois:** remover o `<select>` daquele bloco. Adicionar abaixo do bloco de filtros em linha própria:

```jsx
{canSeeAll && (
  <div className="mb-6">
    <ConsultorFilter
      value={filterConsultor}
      onChange={setFilterConsultor}
      clientes={allClientes}
    />
  </div>
)}
```

Layout final:
```
Header (Todos os Clientes | Sync ClickUp | Novo Cliente)
─────────────────────────────────────────────────────────
[🔍 Buscar...]  [Todos os status ▾]
CONSULTOR  (Todos) (Pedro) (Lucas) (Rebecca) (Letícia)
─────────────────────────────────────────────────────────
Cards...
```

### 2.5 Out of scope (Streams 8.2-8.4)

- Adicionar ConsultorFilter em telas Métricas (8.3) e Ranking (8.4)
- Skeleton loading states
- Empty states ilustrados
- Micro-animações
- Polish visual de Clientes (8.2)

---

## 3. Testes

Sem testes automatizados de UI no projeto. Validação:
- `esbuild` confirma syntax JSX
- Smoke manual: Dashboard ainda carrega, Materiais ainda funciona, Clientes mostra pills funcionais

---

## 4. Rollback

`git revert` do commit. Imports voltam ao path antigo, Clientes.jsx volta ao `<select>`.

---

## 5. Métricas de sucesso

- ✅ ConsultorFilter renderiza em `/clientes` quando `canSeeAll=true`
- ✅ Click em pill atualiza `filterConsultor` e filtra lista
- ✅ Dashboard e Materiais continuam funcionando (zero regressão)
- ✅ Bundle não cresce (move + 1 uso novo ≈ neutro)

---

## 6. Decisões consolidadas

| # | Decisão | Justificativa |
|---|---|---|
| 1 | Mover pra `components/ui/` | Compartilhado entre telas; saída de namespace específico de Materiais |
| 2 | Util `listConsultoresFromClientes` → `lib/consultores.js` | UI components não devem importar de `Materiais/shared/` |
| 3 | API estável + prop opcional `consultores` | Permite futuro switch pra fonte canônica (`/colaboradores`) sem breaking change |
| 4 | Layout em linha própria abaixo dos filtros | Pedro aprovou preview. Mais respiração visual, suporta muitos consultores |
| 5 | Remove `<select>` de Clientes.jsx (sem coexistência) | UX consistente — pill ou select, nunca os dois pra mesma coisa |
