FROM python:3.11-slim

# postgresql-client → pg_dump for weekly DB backups (Phase 7)
# libmagic1 → python-magic MIME sniffing for upload validation (Phase 7)
# libreoffice (impress/writer/calc, headless) + fonts → convert office files
#   (ppt/xls/doc) to PDF at upload so they open in the in-app no-download viewer.
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client libmagic1 \
    libreoffice-impress libreoffice-writer libreoffice-calc \
    fonts-dejavu fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/

ENV PYTHONPATH=/app/backend

CMD ["sh", "-c", "cd /app/backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}"]
