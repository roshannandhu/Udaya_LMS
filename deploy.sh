#!/usr/bin/env bash
# Redeploy the latest code on the EC2 box (Phase 1). See LAUNCH_PLAN.md §4.
# Usage on the box:  /opt/udaya/deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
git pull --ff-only
docker compose up -d --build
docker image prune -f
echo "Deployed. Health check:"
curl -sf http://127.0.0.1:8001/api/health && echo
