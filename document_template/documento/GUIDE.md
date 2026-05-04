# Guia de Uso — Template de Documento Estratégico FLG

---

## Quando usar este template

O **documento estratégico** é o material de leitura complementar à apresentação. Enquanto os slides são para a reunião ao vivo, o documento é para:
- Leitura aprofundada após a entrega
- Referência escrita do planejamento
- Envio por e-mail / WhatsApp como PDF
- Arquivo permanente do cliente

---

## Passo a Passo Rápido

```
1. Execute ./scripts/new-client.sh para criar a estrutura do cliente
2. Abra clients/slug/documento.html no editor
3. Substitua os {{PLACEHOLDERS}} com dados do cliente
4. Adicione/remova seções conforme o escopo
5. Atualize o sumário .toc
6. Abra no Chrome, clique "Imprimir / PDF"
```

---

## Estrutura Recomendada por Tipo de Entrega

### Debriefing Estratégico (6 meses)
1. Debriefing — O que foi feito
2. Diagnóstico — Onde estamos
3. Resultados — O que conquistamos
4. Protagonistas — Perfil dos fundadores
5. Plano dos próximos 6 meses
6. Calendário de conteúdo
7. Próximos Passos

### Diagnóstico de Marca
1. Contexto e objetivo
2. Análise do mercado
3. Posicionamento atual
4. Oportunidades identificadas
5. Recomendações estratégicas
6. Roadmap de implementação

### Plano de Conteúdo
1. Visão geral e objetivos
2. Persona e público-alvo
3. Estratégia por canal
4. Calendário editorial
5. Formatos e frequência
6. Métricas e acompanhamento

---

## Componentes Disponíveis

### Seção (copie e ajuste o id)
```html
<div class="section-header" id="s6">
  <span class="section-tag">06 · Tema</span>
  <h2>Título da Seção</h2>
</div>
```

### Card simples
```html
<div class="card">
  <h3>Título</h3>
  <p>Conteúdo descritivo.</p>
</div>
```

### Grid 2 colunas
```html
<div class="grid-2">
  <div class="card"><h3>Esquerda</h3><p>...</p></div>
  <div class="card"><h3>Direita</h3><p>...</p></div>
</div>
```

### Destaque (caixa dourada)
```html
<div class="highlight">
  <p>Texto em destaque, ideal para conclusões importantes ou alertas.</p>
</div>
```

### Citação
```html
<blockquote>
  <p>"Frase impactante que resume o ponto."</p>
</blockquote>
```

### Lista com marcadores
```html
<ul class="styled">
  <li>Item um</li>
  <li>Item dois</li>
</ul>
```

### Lista numerada
```html
<ol class="styled">
  <li><strong>Primeiro passo:</strong> Descrição.</li>
  <li><strong>Segundo passo:</strong> Descrição.</li>
</ol>
```

### Tabela
```html
<table>
  <thead>
    <tr>
      <th>Canal</th>
      <th>Frequência</th>
      <th>Responsável</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Instagram</td>
      <td>5x por semana</td>
      <td>Rosane</td>
    </tr>
  </tbody>
</table>
```

### Divisor horizontal
```html
<hr>
```

---

## Exportar como PDF

1. Abra no **Google Chrome**
2. Clique no botão **"Imprimir / PDF"** no cabeçalho
3. Configurações:
   - Tamanho: **A4**
   - Margens: **Padrão** ou **Mínimas**
   - Ativar: **Gráficos de fundo**
4. Salvar como PDF

---

## Checklist Antes de Entregar

- [ ] Todos os `{{PLACEHOLDERS}}` substituídos
- [ ] Sumário `.toc` atualizado com seções reais
- [ ] IDs das seções batem com os `href="#sN"` do sumário
- [ ] PDF testado e fundo escuro preservado
- [ ] Revisão ortográfica feita

---

*FLG · FLG Brazil · Guia interno v1.0*
