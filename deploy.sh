#!/usr/bin/env bash
# Redeploy the latest code on the EC2 box. Run manually (/opt/udaya/deploy.sh) or
# automatically by the deploy-backend GitHub Action. See LAUNCH_PLAN.md §4.
set -euo pipefail
cd "$(dirname "$0")"
git pull --ff-only
docker compose up -d --build
docker image prune -f

# Health check — retry briefly while the container starts. Non-fatal: a transient
# miss here must not fail the deploy (the container is already up).
echo "Deployed. Health check:"
for i in 1 2 3 4 5 6; do
  if curl -sf http://127.0.0.1:8001/api/health; then echo " <- OK"; break; fi
  echo "  (waiting for api to come up… $i)"; sleep 5
done
true
