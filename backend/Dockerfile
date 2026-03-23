FROM python:3.12-slim

# ─── Dependências de sistema para WeasyPrint + Docling ───────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ─── Dependências Python ──────────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ─── Código da aplicação ──────────────────────────────────────────────────────
COPY . .

# ─── Assets (imagens estáticas dos encontros) ─────────────────────────────────
# Montado como volume no docker-compose: ./backend/assets:/app/assets
RUN mkdir -p /app/assets/images

# ─── Git SHA do build (injetado pelo agente de deploy) ───────────────────────
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
