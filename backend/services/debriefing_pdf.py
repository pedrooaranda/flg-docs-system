"""
Geração de PDF do debriefing estratégico FLG.

Pipeline:
  Markdown -> HTML (markdown lib) -> PDF (WeasyPrint) -> upload Supabase Storage

CSS embutido aplica branding FLG: fundo claro (PDF imprimível), tipografia
profissional, headings em destaque, tabelas estilizadas, footer em todas as
páginas.

Storage:
  Bucket 'debriefings' no Supabase. Caminho `debriefings/{debriefing_id}.pdf`.
  Bucket precisa ser criado manualmente (instrução na migration 007).
"""

import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger("flg.debriefing_pdf")


# CSS no estilo identidade FLG mas em fundo claro pra PDF (legibilidade + impressão).
# Cores ajustadas: gold accent #C9A84C, neutros escuros, fonte serif premium.
_PDF_CSS = """
@page {
  size: A4;
  margin: 22mm 18mm 22mm 18mm;

  @top-left {
    content: "FLG Brasil · Debriefing Estratégico";
    font-family: 'Georgia', serif;
    font-size: 9pt;
    color: #8a7c5a;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  @bottom-right {
    content: "Página " counter(page) " de " counter(pages);
    font-family: 'Helvetica', sans-serif;
    font-size: 9pt;
    color: #999;
  }

  @bottom-left {
    content: "Documento confidencial — uso interno FLG Brasil";
    font-family: 'Helvetica', sans-serif;
    font-size: 8pt;
    color: #bbb;
  }
}

* {
  box-sizing: border-box;
}

body {
  font-family: 'Helvetica', 'Arial', sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: #1f1f1f;
  margin: 0;
  padding: 0;
}

h1 {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 22pt;
  font-weight: 400;
  color: #1f1f1f;
  margin: 0 0 14pt 0;
  padding-bottom: 12pt;
  border-bottom: 2px solid #C9A84C;
  page-break-after: avoid;
}

h2 {
  font-family: 'Georgia', serif;
  font-size: 14pt;
  font-weight: 500;
  color: #C9A84C;
  margin: 22pt 0 8pt 0;
  padding-bottom: 4pt;
  border-bottom: 1px solid #eadfb8;
  page-break-after: avoid;
}

h3 {
  font-family: 'Helvetica', sans-serif;
  font-size: 11.5pt;
  font-weight: 600;
  color: #2a2a2a;
  margin: 14pt 0 4pt 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  page-break-after: avoid;
}

h4 {
  font-size: 10.5pt;
  font-weight: 600;
  color: #444;
  margin: 10pt 0 4pt 0;
}

p {
  margin: 0 0 8pt 0;
  text-align: justify;
}

blockquote {
  margin: 0 0 14pt 0;
  padding: 10pt 14pt;
  background: #fbf7eb;
  border-left: 3px solid #C9A84C;
  font-size: 10pt;
  color: #3a3a3a;
}

blockquote p {
  margin: 0;
}

ul, ol {
  margin: 0 0 10pt 0;
  padding-left: 22pt;
}

li {
  margin-bottom: 3pt;
}

strong {
  color: #1a1a1a;
  font-weight: 600;
}

em {
  color: #5a5a5a;
}

code {
  font-family: 'Courier New', monospace;
  font-size: 9.5pt;
  background: #f3f0e8;
  padding: 1pt 4pt;
  border-radius: 2pt;
  color: #6e4f0d;
}

hr {
  border: none;
  border-top: 1px solid #d4cdb5;
  margin: 16pt 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 8pt 0 14pt 0;
  font-size: 9.5pt;
  page-break-inside: avoid;
}

th {
  background: #2a2a2a;
  color: #f5e6b3;
  padding: 6pt 8pt;
  text-align: left;
  font-weight: 600;
  font-size: 9pt;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

td {
  padding: 5pt 8pt;
  border-bottom: 1px solid #e8e3d4;
  vertical-align: top;
}

tr:nth-child(even) td {
  background: #fbfaf6;
}

/* Header bloco do topo (Período, Consultor, etc.) */
.flg-meta {
  background: #fbf7eb;
  border-left: 3px solid #C9A84C;
  padding: 12pt 16pt;
  margin-bottom: 24pt;
  font-size: 10pt;
  page-break-after: avoid;
}

.flg-meta p {
  margin: 2pt 0;
}

/* Footer institucional final */
.flg-footer {
  margin-top: 24pt;
  padding-top: 10pt;
  border-top: 1px solid #e8e3d4;
  font-size: 8.5pt;
  color: #888;
  font-style: italic;
  text-align: center;
}
"""


def markdown_to_html(markdown_text: str) -> str:
    """Converte Markdown -> HTML usando python-markdown com extensões úteis."""
    import markdown as md

    html = md.markdown(
        markdown_text,
        extensions=[
            "tables",
            "fenced_code",
            "sane_lists",
            "attr_list",
            "nl2br",
        ],
    )

    # Wrappa a meta inicial (linhas com `>`) numa div estilizada se markdown gerou blockquote.
    # python-markdown gera <blockquote>...</blockquote>. CSS já trata isso, mas
    # adicionamos uma classe se o blockquote estiver logo após o h1.
    return html


def build_full_html(markdown_text: str, titulo: str) -> str:
    """Monta o HTML completo pronto pra WeasyPrint."""
    html_body = markdown_to_html(markdown_text)

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>{_escape_html(titulo)}</title>
  <style>{_PDF_CSS}</style>
</head>
<body>
  {html_body}
  <div class="flg-footer">
    Gerado em {datetime.now().strftime("%d/%m/%Y às %H:%M")} ·
    FLG Brasil · Founders Led Growth
  </div>
</body>
</html>"""


def _escape_html(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def render_pdf_bytes(markdown_text: str, titulo: str) -> bytes:
    """Renderiza Markdown -> PDF e retorna bytes. Não toca em storage."""
    from weasyprint import HTML

    html_str = build_full_html(markdown_text, titulo)
    pdf_bytes = HTML(string=html_str).write_pdf()
    return pdf_bytes


# ─── Supabase Storage upload ──────────────────────────────────────────────────

_BUCKET = "debriefings"


def upload_pdf(pdf_bytes: bytes, debriefing_id: str) -> str:
    """
    Sobe os bytes do PDF pro bucket 'debriefings'.
    Retorna o storage path (relativo ao bucket).

    Reusa o cliente supabase do deps (service_role, bypassa RLS).
    """
    from deps import supabase_client

    path = f"{debriefing_id}.pdf"
    try:
        # upsert=true substitui se já existir (re-gerar mesmo debriefing)
        supabase_client.storage.from_(_BUCKET).upload(
            path=path,
            file=pdf_bytes,
            file_options={
                "content-type": "application/pdf",
                "upsert": "true",
            },
        )
    except Exception as e:
        # Tenta criar o bucket caso não exista (idempotente)
        logger.warning(f"[debriefing_pdf] upload falhou ({e}); tentando criar bucket")
        try:
            supabase_client.storage.create_bucket(_BUCKET, options={"public": False})
            supabase_client.storage.from_(_BUCKET).upload(
                path=path,
                file=pdf_bytes,
                file_options={"content-type": "application/pdf", "upsert": "true"},
            )
        except Exception as e2:
            raise RuntimeError(f"Falha ao subir PDF: {e2}")

    return f"{_BUCKET}/{path}"


def get_signed_url(storage_path: str, expires_in: int = 3600) -> Optional[str]:
    """
    Gera URL assinada pra download do PDF.
    storage_path no formato 'bucket/file.pdf' (retorno de upload_pdf).
    """
    from deps import supabase_client

    if "/" not in storage_path:
        return None
    bucket, file_path = storage_path.split("/", 1)

    try:
        resp = supabase_client.storage.from_(bucket).create_signed_url(file_path, expires_in)
        return resp.get("signedURL") or resp.get("signed_url")
    except Exception as e:
        logger.warning(f"[debriefing_pdf] signed_url falhou: {e}")
        return None


# ─── Top-level usado pelo debriefing_generator ────────────────────────────────

def render_and_upload(debriefing_id: str, markdown_text: str, titulo: str) -> str:
    """
    Pipeline completo: Markdown -> PDF bytes -> upload Storage -> retorna storage_path.
    """
    pdf_bytes = render_pdf_bytes(markdown_text, titulo)
    return upload_pdf(pdf_bytes, debriefing_id)
