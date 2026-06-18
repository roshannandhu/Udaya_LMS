# DEPLOYMENT.md — Udaya LMS

> Operational source of truth for how Udaya LMS is deployed and run in production.
> Live as of June 2026. For the broader launch/roadmap plan see `LAUNCH_PLAN.md`.

---

## 1. Live architecture

```
                         git push  →  main
                       /                       \
         Cloudflare (auto-build)        EC2 cron poller (autodeploy.sh, */2 min)
                 │                                  │
                 ▼                                  ▼
   ┌─────────────────────────┐        ┌──────────────────────────────────┐
   │ udaya-learn.com         │        │ api.udaya-learn.com              │
   │ Cloudflare Worker        │  XHR   │ Cloudflare proxy (Full-strict)   │
   │ (React/Vite static app)  │ ─────► │   → Caddy (Origin cert) on EC2   │
   └─────────────────────────┘        │   → FastAPI (uvicorn, 1 worker)  │
                                       └───────────────┬──────────────────┘
                                                       │
                        ┌──────────────────────────────┼───────────────────────────┐
                        ▼                               ▼                            ▼
            Supabase (Postgres + Auth)      Cloudflare R2 (files)        Cloudflare R2 (backups)
            ap-northeast-1 (Tokyo)          udaya-public  →               udaya-private/backups/
                                            files.udaya-learn.com         (db + students, presigned)
```

- **Frontend:** Cloudflare (static React build), custom domain `udaya-learn.com` + `www`.
- **Backend:** AWS EC2 `t3.micro`, Elastic IP `40.192.44.164`, region **ap-south-2 (Hyderabad)**, Ubuntu 24.04, Docker at `/opt/udaya`.
- **Database + Auth:** managed Supabase (Tokyo). The app uses `supabase.auth.*` and validates tokens with `supabase.auth.get_user(token)`.
- **File storage + backups:** Cloudflare R2 (zero egress). All app files go to R2; Supabase is DB + auth only.

---

## 2. Components & hosts

| Layer | Where | Notes |
|---|---|---|
| Frontend | Cloudflare Worker project **`udaya-learn`** (Git-connected) | Built from `frontend/` via `wrangler.jsonc`; serves `frontend/dist`; SPA fallback via `not_found_handling`. |
| Backend | EC2 `t3.micro` @ `40.192.44.164`, `/opt/udaya` | `docker compose` runs **api** (FastAPI) + **caddy** (TLS/reverse proxy). Single uvicorn worker (in-memory WebSocket/OTP/scheduler state). |
| Database / Auth | Supabase (managed, Tokyo) | Postgres + Auth + (legacy) Storage. Keys in `backend/.env`. |
| File storage | Cloudflare R2 — `udaya-public` (served at `files.udaya-learn.com`) + `udaya-private` (presigned URLs only) | All uploads route through `backend/storage.py`. |
| DNS / SSL / CDN | Cloudflare (domain on CF nameservers) | SSL mode **Full (strict)**; origin uses a Cloudflare **Origin Certificate** on the box (`/opt/udaya/cf-origin/{cert,key}.pem`, git-ignored). |
| Domain registrar | GoDaddy | Registrar only; DNS is managed at Cloudflare. |

---

## 3. Repo deploy files

| File | Purpose |
|---|---|
| `Dockerfile` | Python 3.11-slim image; installs `postgresql-client` + `libmagic1`; runs `uvicorn main:app` from `/app/backend`. |
| `docker-compose.yml` | Two services: `api` (built from Dockerfile, bound to `127.0.0.1:8001`) + `caddy` (ports 80/443, mounts `Caddyfile` + `cf-origin/`). |
| `Caddyfile` | Reverse proxy `api.udaya-learn.com` → `api:8001`, TLS via the Cloudflare Origin cert. |
| `deploy.sh` | `git pull` → `docker compose up -d --build` → prune → health-check (with retry). Manual or poller-invoked. |
| `autodeploy.sh` | Cron-run poller: fetches `origin/main`; runs `deploy.sh` only when `backend/`, `Dockerfile`, or `docker-compose.yml` changed; otherwise fast-forwards. |
| `wrangler.jsonc` | Cloudflare build config: `cd frontend && npm install --legacy-peer-deps && npm run build`, assets `./frontend/dist`, SPA `not_found_handling`. |
| `backend/.env.example` | Template of all backend env vars. |
| `backend/scripts/backup_db.py` / `backup_students.py` | Standalone backup scripts (see §7). |

---

## 4. How deploys work (`git push` → live)

- **Frontend:** Cloudflare watches the repo and **auto-builds** `frontend/` on every push to `main`.
- **Backend:** an EC2 **cron poller** runs every 2 minutes:
  ```
  */2 * * * * /opt/udaya/autodeploy.sh >> /opt/udaya/autodeploy.log 2>&1
  ```
  When backend files change it runs `deploy.sh` (pull + rebuild + restart). Verified end-to-end (~45–75 s after a push).
- **Manual deploy** (anytime, e.g. to force it): 
  ```bash
  cd /opt/udaya && git pull && docker compose up -d --build api
  ```

> History: a GitHub Actions SSH workflow was tried first but removed in favour of the simpler, no-secrets poller.

---

## 5. Environment variables

**Backend** — `/opt/udaya/backend/.env` (git-ignored, **server-only**; template in `backend/.env.example`):
```
SUPABASE_URL, SUPABASE_KEY (anon), SUPABASE_SERVICE_KEY (sb_secret_…)
ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_SDK_KEY, ZOOM_SDK_SECRET, ZOOM_WEBHOOK_SECRET_TOKEN
RESEND_API_KEY, GEMINI_API_KEY
R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_PUBLIC_BUCKET=udaya-public, R2_PRIVATE_BUCKET=udaya-private,
R2_PUBLIC_BASE_URL=https://files.udaya-learn.com
DATABASE_URL=postgresql://postgres.<ref>:<pw>@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres   # backups only
# STORAGE_ALLOW_SUPABASE=1   # local dev only — opts back into the Supabase Storage fallback
```
After editing `.env`: `docker compose up -d --force-recreate api`.

**Frontend** — `frontend/.env.production` (committed): `VITE_API_URL=https://api.udaya-learn.com/api`.

---

## 6. Storage (Cloudflare R2)

- All file ops go through `backend/storage.py` (imported as `filestore`): `upload_public`, `upload_private`, `signed_url`, `signed_url_dict`, `remove`, `list_private`.
- `is_r2_enabled()` is true when `R2_ACCOUNT_ID` + `R2_ACCESS_KEY` + `R2_SECRET_KEY` + `R2_PUBLIC_BUCKET` are set (they are).
- **Fail-closed:** if R2 is not configured, storage operations **raise** instead of silently writing to Supabase. Local dev can opt into the Supabase fallback with `STORAGE_ALLOW_SUPABASE=1`.
- **Public** files (avatars, notes, broadcast/branding/whatsapp/video-fallback) → `udaya-public`, served via `https://files.udaya-learn.com/<key>`.
- **Private** files (assignment attachments, student submissions, backups) → `udaya-private`, served only via short-lived presigned URLs.

---

## 7. Backups

- **What:** the whole database (students, attendance, marks, tests, broadcasts, assignments, settings — everything) via `backup_db.py`, plus a human-readable students CSV via `backup_students.py`. Media files are already durable in R2 and are **not** re-copied.
- **Where:** R2 `udaya-private/backups/db/*.sql.gz` and `udaya-private/backups/students/*.csv.gz`.
- **Schedule:** in-app scheduler (`_backup_scheduler_loop` in `backend/main.py`) driven by the **`backup_frequency`** teacher setting — `off | daily | weekly | monthly` (default **daily**). Change it in the app: **Settings → Backups**. Runtime state (`last_run_at`) is stored in the Supabase `app_settings` row `id=backup_state` (survives redeploys). Retention: newest **30** per folder (auto-pruned).
- **Manual:** **Settings → Backups → Backup now** (or `POST /api/admin/backup-now`). The same page lists recent backups with **download** links (`GET /api/admin/backups`, presigned).
- **Restore:**
  ```bash
  # download a dump from R2 (or the Cloudflare dashboard), then:
  gunzip udaya_lms_YYYY-MM-DD_HH-MM.sql.gz
  psql "$DATABASE_URL" -f udaya_lms_YYYY-MM-DD_HH-MM.sql
  ```
  Or use **Supabase → Database → Backups / PITR** for a point-in-time restore.

---

## 8. Runbook

```bash
# Connect
ssh -i udaya.pem ubuntu@40.192.44.164

# Status / logs
cd /opt/udaya
docker compose ps
docker compose logs -f api          # backend logs
tail -f /opt/udaya/autodeploy.log   # auto-deploy poller log

# Restart / rebuild
docker compose restart api
docker compose up -d --build api

# Rotate a secret (e.g. a key in backend/.env)
nano backend/.env
docker compose up -d --force-recreate api

# Health
curl -s http://127.0.0.1:8001/api/health        # on the box
curl -s https://api.udaya-learn.com/api/health   # through Cloudflare
```

**Frontend redeploy:** just `git push` (Cloudflare rebuilds). Rollback: Cloudflare dashboard → Workers & Pages → `udaya-learn` → Deployments → roll back.

---

## 9. Security posture

- Secrets live only in `backend/.env` on the box (git-ignored); `backend/.env` was removed from git history tracking.
- Supabase **service key** and the **R2 API token** were rotated after setup.
- Email anti-spoofing: Cloudflare DNS `TXT @ = v=spf1 -all` and `TXT _dmarc = v=DMARC1; p=reject; rua=mailto:roshannandhu1100@gmail.com`.
- SSH: key-only auth + `fail2ban`. Port 22 is open to all by choice (solo operator on a changing home IP); the security group is editable anytime to lock it to a fixed IP.
- CORS is currently permissive (`*`) — tighten to the real origins when convenient.

---

## 10. Outstanding follow-ups (optional)

- Reset the Supabase **DB password** (it was shared during setup) → update `DATABASE_URL` → it auto-deploys.
- Rotate **Zoom / Resend / Gemini** keys (deferred).
- Update the **Zoom webhook URL** → `https://api.udaya-learn.com/...`.
- Delete the now-unused GitHub repo secrets `EC2_HOST` / `EC2_USER` / `EC2_SSH_KEY` (left over from the abandoned Actions deploy).

---

## 11. Scaling (when one box isn't enough)

Today is a single EC2 instance (fine for ~300 students). For multi-instance (3,000+), follow **LAUNCH_PLAN.md → "Phase C-SCALE"**: Auto Scaling Group + Application Load Balancer + ElastiCache (Redis). Before running >1 instance (or >1 uvicorn worker), the in-process state must be externalised — WebSocket fan-out via Redis pub/sub, and a Redis lock so the **backup scheduler** and other background loops run on only one instance.
