/**
 * PreviewIntelecto — renderiza o deck completo (intelectual + prática) em iframe.
 *
 * Carrega /flg-design-system/css/flg.css (servido pelo Nginx do frontend) pra
 * estilizar os slides exatamente como vão aparecer na apresentação real.
 *
 * Não carrega o js/flg-deck.js aqui — preview é estático (sem navigation engine).
 * Slides aparecem empilhados verticalmente pra revisão visual.
 */

import { useMemo } from 'react'

export default function PreviewIntelecto({ htmlIntelecto, htmlPratica }) {
  const combinedHtml = useMemo(() => {
    const slidesIntelecto = htmlIntelecto || ''
    const slidesPratica = htmlPratica || ''
    const total = (slidesIntelecto + slidesPratica).trim()

    if (!total) {
      return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="background:#080808;color:#666;font-family:system-ui;padding:40px;text-align:center;">
<p style="opacity:0.5">Sem conteúdo pra mostrar ainda.</p>
</body></html>`
    }

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/flg-design-system/css/flg.css">
  <style>
    body { margin: 0; background: #080808; padding: 16px; }
    .preview-stack { display: flex; flex-direction: column; gap: 16px; }
    .preview-stack > section.slide {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      max-width: 100%;
      transform: none;
      transform-origin: center;
    }
    .preview-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: rgba(201,168,76,0.5);
      padding: 4px 8px;
    }
    .preview-divider {
      border-top: 1px dashed rgba(201,168,76,0.2);
      margin: 8px 0 4px;
    }
  </style>
</head>
<body class="flg-deck">
  <div class="preview-stack">
    ${slidesIntelecto ? `<div class="preview-label">Parte intelectual</div>${slidesIntelecto}` : ''}
    ${slidesPratica ? `<div class="preview-divider"></div><div class="preview-label">Parte prática</div>${slidesPratica}` : ''}
  </div>
</body>
</html>`
  }, [htmlIntelecto, htmlPratica])

  return (
    <iframe
      title="Preview do encontro"
      srcDoc={combinedHtml}
      sandbox="allow-same-origin"
      className="w-full h-full border-0"
      style={{ background: '#080808' }}
    />
  )
}
