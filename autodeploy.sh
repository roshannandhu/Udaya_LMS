#!/usr/bin/env bash
# Poll origin/main and redeploy the backend when backend-relevant files change.
# Run by cron on the EC2 box every couple of minutes — the simple, no-secrets
# alternative to a push-triggered CI deploy. Frontend-only pushes are ignored
# (Cloudflare auto-builds the frontend); we just fast-forward so we don't loop.
set -euo pipefail
cd "$(dirname "$0")"

git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] && exit 0

echo "$(date -u +%FT%TZ): change ${LOCAL:0:7} -> ${REMOTE:0:7}"
if git diff --name-only "$LOCAL" "$REMOTE" | grep -qE '^(backend/|whatsapp-service/|Dockerfile|docker-compose\.yml|deploy\.sh|autodeploy\.sh)'; then
  echo "$(date -u +%FT%TZ): server-side change — deploying"
  bash "$(dirname "$0")/deploy.sh"
else
  git merge --ff-only origin/main --quiet || true
  echo "$(date -u +%FT%TZ): non-backend change — fast-forwarded only"
fi
