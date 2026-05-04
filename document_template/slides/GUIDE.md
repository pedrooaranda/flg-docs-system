# Guia de Uso — Template de Slides FLG

> Para consultores FLG. Leia antes de usar o template.

---

## Passo a Passo Rápido

```
1. ./scripts/new-client.sh slug "Nome" "Empresa" "Pedro Aranda" "2026" "Setor"
2. Abra clients/slug/slides.html no editor
3. Substitua todos os {{PLACEHOLDERS}} com os dados do cliente
4. Adicione/remova slides conforme necessário
5. Adicione imagens (veja ai-image-prompts.md)
6. Abra no navegador, pressione P para exportar PDF
```

---

## Placeholders — Referência Completa

| Placeholder | Exemplo | Onde usar |
|-------------|---------|-----------|
| `{{EMPRESA}}` | Go Fit | `<title>`, capa, rodapé |
| `{{CLIENTES}}` | Rosane & Antonella | Capa, encerramento |
| `{{ESTRATEGISTA}}` | Pedro Aranda | Encerramento, rodapé |
| `{{ANO}}` | 2026 | Capa, encerramento |
| `{{DATA}}` | Março 2026 | Capa, rodapé |
| `{{SETOR}}` | Academia / Fitness | Prompts de imagem (interno) |
| `{{TITULO}}` | Debriefing Estratégico | Capa h1 |
| `{{SUBTITULO}}` | 6 meses de... | Capa subtítulo |
| `{{TOTAL}}` | 10 | Todos os `.slide-num` |

---

## Slides Disponíveis no Template

| ID | Tipo | Classe CSS | Quando usar |
|----|------|-----------|------------|
| s1 | Capa | `slide-cover` | Sempre primeiro |
| s2 | Agenda | `slide` | Após a capa |
| s3 | Seção | `slide-section` | Separar blocos |
| s4 | 3 Colunas | `slide` | 3 conceitos/entregas |
| s5 | Dados | `slide-dark` | Números e métricas |
| s6 | Perfil A | `slide-person-a` | Fundador(a) principal |
| s7 | Citação | `slide-dark` | Frases de impacto |
| s8 | 2 Colunas | `slide` | Comparativos, listas |
| s9 | Próximos Passos | `slide` | Penúltimo slide |
| s10 | Encerramento | `slide-cover` | Sempre último |

---

## Adicionando Slides

Copie qualquer bloco `<div class="slide...">` e:

1. Incremente o id: `id="s11"`, `id="s12"`, etc.
2. Atualize o `.slide-num`: `11 / {{TOTAL}}`
3. Substitua o conteúdo interno
4. **Ao final, atualize `{{TOTAL}}`** com o total real de slides
5. Também atualize o `#nav-counter` no JS: `1 / {{TOTAL}}`

---

## Componentes Disponíveis

### Card
```html
<div class="card">
  <span class="card-icon">◈</span>
  <h3>Título</h3>
  <p>Descrição.</p>
</div>
```

### Grid 2 ou 3 colunas
```html
<div class="grid-2">
  <div class="card">...</div>
  <div class="card">...</div>
</div>

<div class="grid-3">
  <div class="card">...</div>
  <div class="card">...</div>
  <div class="card">...</div>
</div>
```

### Stat Box (número em destaque)
```html
<div class="stat-row">
  <div class="stat-box">
    <div class="stat-num">6</div>
    <div class="stat-label">Meses</div>
  </div>
</div>
```

### Lista com marcadores
```html
<ul class="list-items">
  <li>Item um</li>
  <li>Item dois</li>
</ul>
```

### Canal (channel row)
```html
<div class="channel-row">
  <div class="channel-icon">📸</div>
  <div>
    <div class="channel-name">Instagram</div>
    <div class="channel-desc">Descrição da estratégia.</div>
  </div>
</div>
```

### Mês (para plano de conteúdo)
```html
<div class="month-block">
  <div class="month-label">Mês 01</div>
  <div class="month-theme">Tema do Mês</div>
  <ul>
    <li>Conteúdo 1</li>
    <li>Conteúdo 2</li>
  </ul>
</div>
```

### Citação grande
```html
<div class="quote">"Frase impactante aqui."</div>
<div class="quote-attr">— Atribuição</div>
```

### Texto dourado
```html
<span class="gold">texto dourado</span>
<span class="gold-grad">texto com gradiente dourado</span>
```

---

## Customizando Cores por Cliente

Para um cliente com cores diferentes (ex: azul em vez de dourado), altere as variáveis CSS no `:root`:

```css
:root {
  --gold-light: #A8C8FF;   /* azul claro */
  --gold-mid:   #4A90D9;   /* azul médio */
  --gold-dark:  #1A4A7A;   /* azul escuro */
  --gold-grad:  linear-gradient(135deg, #A8C8FF 0%, #4A90D9 50%, #1A4A7A 100%);
}
```

**Paletas prontas:**
- **Azul corporativo:** `#C8DEFF → #4A90E2 → #1A3A7A`
- **Verde natural:** `#C8F0C8 → #4A9E4A → #1A5A1A`
- **Roxo criativo:** `#E8C8FF → #9B4AE2 → #4A1A7A`
- **Vermelho energia:** `#FFD0C8 → #E24A4A → #7A1A1A`

---

## Exportar como PDF

1. Abra o arquivo no **Google Chrome** (melhor suporte para `print-color-adjust`)
2. Pressione **P** no teclado (ou Ctrl/Cmd + P)
3. Selecione **"Salvar como PDF"**
4. Configurações recomendadas:
   - Tamanho: **A4 horizontal** ou **Letter horizontal**
   - Margens: **Nenhuma**
   - Escala: **100%**
   - Ativar: **Gráficos de fundo** (Background graphics)
5. Clique em Salvar

> **Chrome é obrigatório** para preservar os fundos escuros. Safari e Firefox podem clarear o fundo.

---

## Checklist Antes de Entregar

- [ ] Todos os `{{PLACEHOLDERS}}` substituídos
- [ ] `{{TOTAL}}` atualizado com o número correto de slides
- [ ] Logo do cliente em `assets/` (se houver)
- [ ] Imagens de fundo adicionadas (opcional, mas recomendado)
- [ ] PDF testado no Chrome
- [ ] Navegação por teclado testada (←→ e Espaço)
- [ ] Testado em tela cheia (F11)

---

*FLG · FLG Brazil · Guia interno v1.0*
