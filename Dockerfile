FROM python:3.11-slim

# postgresql-client → pg_dump for weekly DB backups (Phase 7)
# libmagic1 → python-magic MIME sniffing for upload validation (Phase 7)
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client libmagic1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/

ENV PYTHONPATH=/app/backend

CMD ["sh", "-c", "cd /app/backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}"]
