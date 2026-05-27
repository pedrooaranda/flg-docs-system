# ConsultorFilter Universal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover `ConsultorFilter` pra `components/ui/` (compartilhado), mover utilitário `listConsultoresFromClientes` pra `lib/consultores.js`, atualizar 2 importers existentes (Dashboard, Materiais/index), e adicionar uso em `Clientes.jsx` substituindo o `<select>` de consultor.

**Architecture:** Refactor sem mudança de comportamento. API do componente preservada (adiciona prop opcional `consultores` pra override). Foundation pros Streams 8.2-8.4 (polish UI das telas).

**Tech Stack:** React 18 + Vite + Tailwind + lucide-react. Validação via esbuild (sem suite de tests UI).

**Spec:** [docs/superpowers/specs/2026-05-26-consultor-filter-universal-design.md](../specs/2026-05-26-consultor-filter-universal-design.md)

---

## Task 1: Criar lib/consultores.js (move listConsultoresFromClientes)

**Files:**
- Create: `frontend/src/lib/consultores.js`
- Modify: `frontend/src/components/Materiais/shared/consultor-utils.js`

- [ ] **Step 1: Criar lib/consultores.js**

```javascript
/**
 * Utilitários relacionados a consultores — compartilhado entre telas (Clientes,
 * Métricas, Ranking, Dashboard). Antes vivia em Materiais/shared/consultor-utils.js,
 * mas foi movido pra cá porque componentes em `components/ui/` não devem importar
 * de namespace específico de Materiais.
 *
 * Funções específicas de matching (matchConsultor) e auth (isAdminFromSession)
 * continuam em Materiais/shared/consultor-utils.js — uso restrito àquela área.
 */

/**
 * Lista de consultores distintos extraída do array de clientes.
 * Retorna [{ nome, count }] ordenado por count desc.
 */
export function listConsultoresFromClientes(clientes) {
  const counts = new Map()
  for (const c of clientes || []) {
    const nome = (c.consultor_responsavel || '').trim()
    if (!nome) continue
    counts.set(nome, (counts.get(nome) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([nome, count]) => ({ nome, count }))
    .sort((a, b) => b.count - a.count)
}
```

- [ ] **Step 2: Remover listConsultoresFromClientes de Materiais/shared/consultor-utils.js**

Abrir `frontend/src/components/Materiais/shared/consultor-utils.js` e DELETAR o bloco da função `listConsultoresFromClientes` (linhas ~49-63 aproximadamente). O arquivo continua exportando `matchConsultor`, `isAdminFromSession`, `ALLOWED_DOMAIN`.

Localize:
```javascript
/**
 * Lista de consultores distintos extraída do array de clientes.
 * Retorna [{ nome, count }] ordenado por count desc.
 */
export function listConsultoresFromClientes(clientes) {
  const counts = new Map()
  for (const c of clientes || []) {
    const nome = (c.consultor_responsavel || '').trim()
    if (!nome) continue
    counts.set(nome, (counts.get(nome) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([nome, count]) => ({ nome, count }))
    .sort((a, b) => b.count - a.count)
}
```

Deletar inteiro.

- [ ] **Step 3: Validar esbuild dos arquivos modificados**

Run pra cada:
```
cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/lib/consultores.js > /dev/null && echo "consultores OK"
cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Materiais/shared/consultor-utils.js > /dev/null && echo "consultor-utils OK"
```
Expected: ambos `OK`

- [ ] **Step 4: Verificar quem ainda referencia listConsultoresFromClientes**

Run: `cd frontend/src && grep -rn "listConsultoresFromClientes" --include="*.js" --include="*.jsx"`

Expected: APENAS os arquivos `lib/consultores.js` (definição) e `Materiais/shared/ConsultorFilter.jsx` (que importa). Outros que aparecerem precisam atualizar imports em tasks posteriores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/consultores.js frontend/src/components/Materiais/shared/consultor-utils.js
git commit -m "refactor(consultores): move listConsultoresFromClientes pra lib/consultores"
```

---

## Task 2: Mover ConsultorFilter pra components/ui/ + adicionar prop consultores

**Files:**
- Create: `frontend/src/components/ui/ConsultorFilter.jsx`
- Delete: `frontend/src/components/Materiais/shared/ConsultorFilter.jsx`

- [ ] **Step 1: Criar components/ui/ConsultorFilter.jsx**

```jsx
/**
 * ConsultorFilter — tabs/pills "CONSULTOR · Todos · Pedro Aranda · Lucas Nery · ...".
 *
 * Componente compartilhado de filtro por consultor — usado em todas as telas
 * com lista de clientes (Clientes, Métricas, Ranking, Dashboard, Materiais).
 * Substitui dropdowns `<select>` vanilla por UI consistente.
 *
 * Source de consultores:
 *   - Por padrão deriva de `clientes` (DISTINCT consultor_responsavel)
 *   - Override explícito via prop `consultores: string[]` quando a tela não
 *     tem array de clientes acessível (ex: Métricas top-level)
 *
 * Sempre inclui CONSULTORES_OFICIAIS hardcoded como fallback, pra garantir
 * que os 3 nomes oficiais aparecem mesmo quando lista vazia (estado inicial).
 */

import { useMemo } from 'react'
import { listConsultoresFromClientes } from '../../lib/consultores'

const CONSULTORES_OFICIAIS = ['Pedro Aranda', 'Lucas Nery', 'Rebecca Rachel']

export default function ConsultorFilter({ value, onChange, clientes, consultores }) {
  const lista = useMemo(() => {
    // Source: prop explícita (consultores) tem precedência sobre derivado de clientes
    const fromSource = consultores
      ? consultores
      : listConsultoresFromClientes(clientes).map(c => c.nome)
    // Une com lista oficial (mantém oficiais mesmo sem dados ainda).
    const setAll = new Set([...CONSULTORES_OFICIAIS, ...fromSource])
    // Ordena: oficiais primeiro (na ordem definida), depois outros alfabético
    const oficiais = CONSULTORES_OFICIAIS.filter(n => setAll.has(n))
    const outros = Array.from(setAll)
      .filter(n => !CONSULTORES_OFICIAIS.includes(n))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return [...oficiais, ...outros]
  }, [clientes, consultores])

  const opcoes = [
    { key: 'todos', label: 'Todos' },
    ...lista.map(nome => ({ key: nome, label: nome })),
  ]

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[9px] tracking-[0.2em] uppercase text-white/30 font-monodeck mr-2">
        Consultor
      </span>
      {opcoes.map(opt => {
        const ativo = value === opt.key
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
            style={ativo
              ? {
                  background: 'rgba(201,168,76,0.18)',
                  color: '#C9A84C',
                  border: '1px solid rgba(201,168,76,0.45)',
                  boxShadow: '0 0 0 1px rgba(201,168,76,0.08) inset',
                }
              : {
                  background: 'rgba(255,255,255,0.03)',
                  color: 'rgba(255,255,255,0.45)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }
            }
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Deletar arquivo antigo**

Run: `rm frontend/src/components/Materiais/shared/ConsultorFilter.jsx`

- [ ] **Step 3: Validar esbuild do novo**

Run: `cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/ui/ConsultorFilter.jsx > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 4: Confirmar arquivo antigo deletado**

Run: `ls frontend/src/components/Materiais/shared/ConsultorFilter.jsx 2>&1`
Expected: `No such file or directory`

- [ ] **Step 5: Commit (mas NÃO push ainda — vai quebrar build até Task 3 atualizar imports)**

```bash
git add frontend/src/components/ui/ConsultorFilter.jsx frontend/src/components/Materiais/shared/ConsultorFilter.jsx
git commit -m "refactor(consultor-filter): move pra components/ui/ + prop consultores override"
```

(Esse commit deixa Dashboard.jsx e Materiais/index.jsx com import quebrado. Task 3 conserta — não pushar até lá.)

---

## Task 3: Atualizar imports em Dashboard.jsx + Materiais/index.jsx

**Files:**
- Modify: `frontend/src/components/Dashboard.jsx` (linha 29)
- Modify: `frontend/src/components/Materiais/index.jsx` (linha 17)

- [ ] **Step 1: Atualizar Dashboard.jsx**

Localize linha 29:
```javascript
import ConsultorFilter from './Materiais/shared/ConsultorFilter'
```

Substituir por:
```javascript
import ConsultorFilter from './ui/ConsultorFilter'
```

- [ ] **Step 2: Atualizar Materiais/index.jsx**

Localize linha 17:
```javascript
import ConsultorFilter from './shared/ConsultorFilter'
```

Substituir por:
```javascript
import ConsultorFilter from '../ui/ConsultorFilter'
```

- [ ] **Step 3: Validar esbuild de ambos**

Run:
```
cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Dashboard.jsx > /dev/null && echo "Dashboard OK"
cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Materiais/index.jsx > /dev/null && echo "Materiais OK"
```
Expected: ambos `OK`

- [ ] **Step 4: Final check — grep pra confirmar zero referências ao path antigo**

Run: `cd frontend/src && grep -rn "Materiais/shared/ConsultorFilter\|shared/ConsultorFilter" --include="*.jsx" --include="*.js"`
Expected: **vazio** (sem matches)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard.jsx frontend/src/components/Materiais/index.jsx
git commit -m "refactor(consultor-filter): atualiza imports Dashboard + Materiais pra novo path"
```

---

## Task 4: Adicionar ConsultorFilter em Clientes.jsx (substitui select)

**Files:**
- Modify: `frontend/src/components/Clientes.jsx`

- [ ] **Step 1: Adicionar import**

No topo de `frontend/src/components/Clientes.jsx` (junto com outros imports de components), adicionar:

```jsx
import ConsultorFilter from './ui/ConsultorFilter'
```

- [ ] **Step 2: Remover o <select> de consultor (linhas ~405-410)**

Localize EXATAMENTE este bloco em `Clientes.jsx`:

```jsx
        {canSeeAll && (
          <select value={filterConsultor} onChange={e => setFilterConsultor(e.target.value)} className="input-flg w-auto pr-8 cursor-pointer">
            <option value="todos">Todos os consultores</option>
            {consultores.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
```

Deletar inteiro (deixar só o `<select>` de status acima dele, intacto).

- [ ] **Step 3: Adicionar ConsultorFilter em linha própria abaixo do bloco de filtros**

Procure o `</div>` que fecha o container de filtros (provavelmente em torno de linha 411). Após ele, adicionar:

```jsx
      {/* Filtro de consultor — só admin/diretor vê (consultor regular já recebe lista filtrada do backend) */}
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

Ou seja: substitui o select inline por linha própria abaixo dos demais filtros.

- [ ] **Step 4: Verificar que `consultores` (const useMemo) ainda é usado em outro lugar — se não, remover**

Run: `grep -n "consultores" frontend/src/components/Clientes.jsx`

Se a única menção restante for o `useMemo` da linha 313-316:
```jsx
  const consultores = useMemo(
    () => [...new Set(allClientes.map(c => c.consultor_responsavel).filter(Boolean))],
    [allClientes]
  )
```

Pode REMOVER (já não é usado depois do select sair — ConsultorFilter deriva internamente). Se aparecer em outros lugares, MANTER.

- [ ] **Step 5: Validar esbuild**

Run: `cd frontend && ./node_modules/.bin/esbuild --bundle=false --loader:.jsx=jsx src/components/Clientes.jsx > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit + push (todos os commits Stream 8.1 vão juntos)**

```bash
git add frontend/src/components/Clientes.jsx
git commit -m "feat(clientes): adopt ConsultorFilter universal (substitui select vanilla)"
git push
```

---

## Task 5: Smoke test manual (Pedro)

**Files:** nenhum

- [ ] **Step 1: Aguardar deploy passar**

Run: `gh run list --workflow=deploy.yml --limit=1 --json status,conclusion,headSha`
Expected: status=completed, conclusion=success

- [ ] **Step 2: Smoke Dashboard (caminho que JÁ usava o componente — zero regressão esperada)**

- [ ] Abrir `/` (Home)
- [ ] ConsultorFilter renderiza no header da Home com tabs "Todos · Pedro Aranda · Lucas Nery · Rebecca Rachel · …"
- [ ] Click em cada tab muda dados mostrados

- [ ] **Step 3: Smoke Materiais (caminho que JÁ usava)**

- [ ] Abrir `/materiais`
- [ ] ConsultorFilter renderiza com mesma UX

- [ ] **Step 4: Smoke Clientes (caminho NOVO)**

- [ ] Abrir `/clientes`
- [ ] ConsultorFilter renderiza em linha própria abaixo dos filtros de busca/status
- [ ] Click em pill "Lucas Nery" → lista mostra só clientes do Lucas
- [ ] Click "Todos" → mostra todos
- [ ] Filtro de status (Ativos/Pausados) continua funcionando independente

- [ ] **Step 5: Verificar imports sem 404 no Network tab do DevTools**

- [ ] DevTools → Network → carregar `/clientes`
- [ ] Sem requests 404 (especialmente `ConsultorFilter*.js`)

---

## Verificação de cobertura da spec

| Spec section | Task(s) que cobre |
|---|---|
| 2.1 Mover componente pra UI compartilhada | Tasks 1 + 2 |
| 2.2 API estável + prop consultores | Task 2 (Step 1 código) |
| 2.3 Atualizar imports existentes | Task 3 |
| 2.4 Nova adoção em Clientes.jsx | Task 4 |
| 2.5 Out of scope (Streams 8.2-8.4) | Não cobrir — defer |
| 3 Testes (esbuild + smoke) | Steps de validação em cada task + Task 5 |
| 5 Métricas de sucesso | Task 5 smoke |
