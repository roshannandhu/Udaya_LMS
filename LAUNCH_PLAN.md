# LAUNCH_PLAN.md — Udaya LMS

> ⚠️ **AS-BUILT NOTE (June 2026): the app is now LIVE. For the actual production setup + ops
> runbook, see [`DEPLOYMENT.md`](DEPLOYMENT.md) — that is the source of truth.** This file remains
> the broader strategic plan (architecture rationale, cost, security, marketing, legal, Android,
> roadmap, Phase-2 scaling). A few Phase-1 deploy specifics below drifted from what was actually
> deployed — trust DEPLOYMENT.md where they differ:
> - EC2 is **t3.micro** (free tier), region **ap-south-2 (Hyderabad)** — *not* t3.small / ap-south-1.
> - Supabase is in **ap-northeast-1 (Tokyo)**; backup `DATABASE_URL` uses the `aws-1-ap-northeast-1` pooler.
> - Backend auto-deploy is a **cron poller** (`autodeploy.sh`), *not* GitHub Actions.
> - Backups run via an **in-app scheduler** (Settings → Backups, off/daily/weekly/monthly), *not* a crontab.
> - SSH lockdown (port 22 → My IP) was **intentionally skipped** (key-only + fail2ban).

> Version 3.0 — **DECISION CHANGED: backend compute moves to AWS EC2 (was Hetzner CX33 + Coolify).**
>   Two-phase plan: **Phase 1 (today, ~300 students)** = a single EC2 `t3.small` running FastAPI in
>   Docker, no load balancer. **Phase 2 (3,000+ students)** = Auto Scaling Group (1–10 instances)
>   behind an Application Load Balancer, with ElastiCache (Redis) for shared WebSocket pub/sub.
>   Database / Auth / Storage stay on **MANAGED Supabase** (unchanged). The self-hosted PostgreSQL /
>   PgBouncer / Redis-for-DB / self-hosted-Supabase / self-hosted-Jitsi / custom-JWT-auth /
>   custom-WebSocket sections further below are **SUPERSEDED — do NOT implement them.** Trust the
>   "Locked decisions" block immediately below for what actually applies.
> Stack: React+Vite (Cloudflare Pages) · FastAPI (AWS EC2 · Docker) · MANAGED Supabase
>        (Postgres + Auth + Storage + Realtime · Mumbai · Pro) · GoDaddy + Cloudflare · Firebase FCM · Sentry
> Keep this file in repo root. Reference in every Antigravity/Claude session.

---

## 0. Full architecture — how everything connects

**PHASE 1 — today (~300 students): one EC2 box, no load balancer**
```
Student / Teacher / Parent phone
          ↓
GoDaddy domain (udayalms.com)
  → nameservers point to Cloudflare
          ↓
CLOUDFLARE (DNS + free SSL + CDN + DDoS — front of everything)
  ├── udayalms.com        → Marketing site     (Cloudflare Pages · Google indexes)
  ├── app.udayalms.com    → LMS frontend        (Cloudflare Pages · login wall · NOT indexed)
  ├── api.udayalms.com    → FastAPI backend     (AWS EC2 · Elastic IP · proxied)
  └── files.udayalms.com  → Public files        (Cloudflare R2 · zero egress · CDN)
                                    ↓  (Cloudflare proxy, SSL Full-strict)
                    ┌──── AWS EC2 t3.small · Ubuntu 24.04 · Elastic IP ────┐
                    │                                                       │
                    │  Caddy / Nginx :443  →  FastAPI :8001 (Docker)        │
                    │                         uvicorn — ONE worker          │
                    │                         (in-memory WS + caches)       │
                    │  Backup cron → pg_dump (Supabase) → R2 (Sun 2AM)      │
                    └───────────────────────────────────────────────────────┘
                                    ↓ network (≈40 ms to Mumbai)
   MANAGED Supabase (Postgres + Auth + Storage + Realtime · Mumbai · Pro)
                                    ↓
   Cloudflare R2 ←→ Firebase FCM ←→ Sentry ←→ Zoom (live classes, external SaaS)
   (files+backups)   (push alerts)   (errors)
```

**PHASE 2 — 3,000+ students: Auto Scaling Group + ALB + ElastiCache**
```
            CLOUDFLARE (DNS · DDoS) → api.udayalms.com → ACM cert
                                    ↓
                    Application Load Balancer (HTTPS :443, WebSocket-aware)
                                    ↓  health check /api/health
        ┌───────────── Auto Scaling Group (min 1 · max 10) ─────────────┐
        │  EC2 #1 (FastAPI)   EC2 #2 (FastAPI)   …   EC2 #N (FastAPI)    │
        │     ↑ scales out/in on CPU% + ALBRequestCountPerTarget         │
        └───────────────────────────────┬───────────────────────────────┘
                                         ↓ shared state (see Phase C-SCALE)
                    ElastiCache (Redis)  —  WebSocket pub/sub,
                    OTP/session state, rate-limit counters, caches
                                         ↓
            MANAGED Supabase (unchanged)  ·  R2  ·  FCM  ·  Sentry  ·  Zoom
```
> ⚠️ Going from Phase 1 → Phase 2 is **not** just "add an ALB + Redis." The backend currently
> holds correctness-critical state in-process (WebSocket connections, OTP, rate limits, scheduler
> loops, four local JSON files). That state must be externalized **before** running 2+ instances —
> or even 2+ uvicorn workers on one box. The full prerequisite checklist is in **Phase C-SCALE**.

### What each piece does

| Service | What it does | Cost/month |
|---|---|---|
| GoDaddy domain | Buy `udayalms.com`, then point to Cloudflare and forget | ₹67 (₹800/yr) |
| Cloudflare | DNS + SSL (free auto) + CDN + DDoS + proxy for all subdomains | ₹0 |
| Cloudflare Pages | Hosts React+Vite frontend, auto-deploys on git push | ₹0 |
| **AWS EC2 `t3.small`** | **Phase 1 backend box — FastAPI in Docker (1 vCPU-bound worker + async I/O)** | **~₹1,250 ($15) on-demand · ~₹800 on a 1-yr Savings Plan** |
| Elastic IP | Stable public IP for the EC2 box (free while attached) | ₹0 |
| EBS gp3 (30 GB) | Root volume for the EC2 box | ~₹250 ($3) |
| MANAGED Supabase (Pro) | Postgres + Auth + Storage + Realtime · Mumbai. Unchanged from today. | ~₹2,100 ($25) |
| Cloudflare R2 | Public files (PDFs, avatars) + DB backups. Zero egress fees | ₹0 (10GB free) |
| Firebase FCM | Push notifications to students (new video, broadcast, test) | ₹0 |
| Sentry | Error tracking: frontend crashes + backend exceptions | ₹0 (free tier) |
| UptimeRobot / CloudWatch | Pings api.udayalms.com, alerts if down | ₹0 / ~₹0 |
| Zoom | Live classes (external SaaS, already integrated) | per Zoom plan |
| WANotifier | WhatsApp credential delivery — ₹0.145/student msg | ~₹4–50 |
| Gemini / Claude Haiku | AI report suggestions | ~₹0–5 |
| **Phase 2 only — ALB** | Application Load Balancer (base + LCU) | ~₹1,700 ($20) |
| **Phase 2 only — ElastiCache** | Redis `cache.t4g.micro` for pub/sub + shared state | ~₹1,000 ($12) |
| **Total at 300 students (Phase 1)** | EC2 + EBS + Supabase Pro + domain | **~₹3,700/month** |

> Why `t3.small` for Phase 1? 2 vCPU / 2 GB RAM comfortably runs a single-worker FastAPI container
> for ~300 students (the workload is async I/O-bound — most time is spent waiting on Supabase, not
> on CPU). Burstable credits cover login spikes. Move to `t3.medium` (4 GB) only if memory pressure
> shows up in CloudWatch. **Do not raise uvicorn `--workers` above 1 on a single box** until the
> Phase C-SCALE state externalization is done — extra workers are separate processes and would each
> get their own in-memory WebSocket manager / OTP store, silently breaking broadcasts and OTP.

---

## 1. Locked decisions — do not re-debate these

- **Database / Auth / Storage / Realtime** — **MANAGED Supabase** (Mumbai), upgraded to **Pro** when real students start. Keep Supabase Auth, Storage, and Realtime exactly as the app uses them today; the ~721 existing `supabase.*` calls stay unchanged. Scale by bumping Supabase compute, never by self-hosting.
- **Backend host** — FastAPI runs on **AWS EC2** (Docker), in region **ap-south-1 (Mumbai)** next to Supabase (~40 ms EC2 ↔ Supabase-Mumbai). **Phase 1** = one `t3.small`, single uvicorn worker, reverse-proxied by Caddy/Nginx, no load balancer. **Phase 2** = Auto Scaling Group (1–10) behind an Application Load Balancer, with **ElastiCache (Redis)** for shared WebSocket pub/sub + session state (see **Phase C-SCALE**). **No** self-hosted Postgres / PgBouncer / Redis-for-DB — Redis enters only in Phase 2, for pub/sub and ephemeral shared state, never as the database. Deploy is Docker (reuse the repo `Dockerfile`); config via a `.env` file on the box in Phase 1, AWS SSM Parameter Store in Phase 2.
- **Videos** — YouTube Unlisted. `youtube_video_id` NEVER sent to client. Only via `/api/video/{id}/token` after verifying student standard_id.
- **Live classes** — the app integrates **Zoom** (see `ZOOM_*` env vars). Do NOT self-host Jitsi on the EC2 box (Phase K below is superseded). MediaRecorder for local recording where used.
- **Test scoring** — PostgreSQL function `submit_test_attempt` (SECURITY DEFINER). Students read from `student_questions` view (no `correct_idx`).
- **Storage** — **Supabase Storage** (current `videos`/`avatars`/`broadcasts` buckets), included in Pro. Cloudflare R2 is optional/deferred — move public files there only if egress ever grows.
- **Push notifications** — Firebase Cloud Messaging (FCM). Free, works on Android + iOS.
- **Credentials delivery** — manual Excel now → WANotifier WhatsApp API at launch.
- **Android** — Capacitor wraps React build. iOS deferred.
- **File validation** — MIME type + size + extension checked in FastAPI before any upload reaches R2.
- **Rate limiting** — slowapi on FastAPI for login/OTP routes.
- **MFA** — TOTP (Google Authenticator) for teacher/admin only. Not students.

---

## ✅ Implemented this session (in-repo, verified)

Done locally — these carry over to the EC2 backend + Cloudflare Pages on deploy:
- **Sentry (env-gated)** — backend `main.py` guarded init + frontend `main.jsx` (`@sentry/react`). Dormant until `SENTRY_DSN` / `VITE_SENTRY_DSN` are set.
- **Login rate limiting** — Cloudflare-aware in-memory limiter (8 / 5 min per real client IP via `CF-Connecting-IP`) on `/api/auth/login`; fails open so it can never lock users out. (OTP routes already cap attempts.)
- **File validation** — `validate_upload()` (size + extension + lazy `magic` MIME sniff) wired into **all** uploads: student (avatar, submission) and teacher (thumbnail, profile-photo, video, note, broadcast, assignment files).
- **DB backup script** — `backend/scripts/backup_db.py` (`pg_dump → gzip → R2`); standalone, schedule as a cron on the EC2 box (Phase 2: EventBridge) once R2 creds exist.
- **Deps/infra** — `Dockerfile` ships `postgresql-client` + `libmagic1`; `requirements.txt` adds `sentry-sdk[fastapi]`, `python-magic`, `boto3`. All new imports are lazy/guarded so local dev (no libmagic) and the test backend keep working.

Verified: `py -m py_compile main.py scripts/backup_db.py`, `py -c "import main"`, and `npm run build` all pass.

---

## 2. PHASE A — Security first (Day 1, non-negotiable)

### A1. Make GitHub repo private immediately
```
GitHub → Udaya_LMS → Settings → General → Danger Zone
→ Change visibility → Private
```
Anyone who cloned while public retains their copy. Rotating keys is the only full protection.

### A2. Hunt leaked secrets in git history
```bash
git log --all --full-history -- .env backend/.env frontend/.env
git log -p | grep -iE "secret|password|api_key|database_url|gemini|firebase" | head -80
```

### A3. Rotate ALL keys — no exceptions
The repo currently commits secrets in `backend/.env` **and** `render.yaml` (Zoom client secret,
webhook token, SDK secret). Treat every one of these as leaked and rotate it:
```
Supabase service_role key  → Supabase → Project Settings → API → roll service_role
Supabase anon key          → roll if it was ever committed
Zoom client/SDK secrets    → Zoom Marketplace → app → regenerate (they are in render.yaml)
Gemini API key             → Google AI Studio → regenerate
Resend API key             → Resend dashboard → regenerate
Firebase server key        → Firebase Console → Project Settings → regenerate
Any other API key          → regenerate in its dashboard
```
After rotating, **delete `render.yaml`** (Render is being retired) and move all secrets out of
git: Phase 1 → a `.env` file on the EC2 box (chmod 600, git-ignored); Phase 2 → AWS SSM Parameter
Store (SecureString) read at boot via the instance IAM role. Never paste secrets back into code.

### A4. Final .gitignore
```gitignore
# Secrets
.env
.env.*
*.local
backend/teacher_settings.json

# Android signing — losing this = can never update the app again
*.jks
*.keystore
google-services.json

# Build outputs
dist/
build/
__pycache__/
*.pyc
node_modules/
android/app/build/

# Database dumps (never commit)
*.sql
*.dump
```

### A5. MFA for teacher/admin accounts only
```python
# requirements.txt: add pyotp
import pyotp

def generate_teacher_totp_secret() -> str:
    return pyotp.random_base32()  # store encrypted in teachers table

def verify_totp(secret: str, token: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(token, valid_window=1)

# Login flow:
# 1. Teacher submits email + password
# 2. Backend validates password (bcrypt)
# 3. If teacher.totp_secret exists → require 6-digit code from Google Authenticator
# 4. verify_totp() → issue JWT only if both pass
```

### A6. Rate limiting — prevent brute force attacks
```python
# requirements.txt: add slowapi
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/auth/login")
@limiter.limit("5/minute")       # 5 login attempts per minute per IP
async def login(request: Request, ...):
    ...

@app.post("/auth/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, ...):
    ...
```

---

## 3. PHASE B — AWS EC2 server setup

> Managed Supabase stays the database — there is **no** Postgres / PgBouncer / Redis to install on
> this box in Phase 1. This phase is just: launch one hardened EC2 instance with Docker on it.

### B1. Launch the EC2 instance
```
AWS Console → EC2 → Launch instance
Name:       udaya-backend
Region:     ap-south-1 (Mumbai) — same region as Supabase
AMI:        Ubuntu Server 24.04 LTS (x86_64)
Type:       t3.small (2 vCPU · 2 GB RAM)   ← move to t3.medium if CloudWatch shows memory pressure
Key pair:   create/select an SSH key pair (download the .pem, store it safely)
Storage:    30 GB gp3 root volume
IAM role:   attach an instance profile with AmazonSSMManagedInstanceCore
            (enables SSM Session Manager + Parameter Store — needed in Phase 2)
```

### B2. Elastic IP (stable public address)
```
EC2 → Elastic IPs → Allocate → Associate with the udaya-backend instance.
```
Point the Cloudflare DNS A record for `api.udayalms.com` at this IP (Phase C). Without an Elastic
IP the public IP changes on every stop/start. Free while attached to a running instance.

### B3. Security group (firewall)
```
Inbound:
  22/tcp    SSH    → MY_ADMIN_IP/32 only   (best: skip 22 entirely, use SSM Session Manager)
  80/tcp    HTTP   → Cloudflare IP ranges  (ACME challenge / http→https redirect)
  443/tcp   HTTPS  → Cloudflare IP ranges  (https://www.cloudflare.com/ips/)
Outbound: allow all (must reach Supabase, R2, FCM, Zoom, package mirrors).
Never open 8001 — FastAPI binds to 127.0.0.1 only, behind the reverse proxy.
```

### B4. Connect and harden
```bash
ssh -i udaya.pem ubuntu@YOUR_ELASTIC_IP        # or: aws ssm start-session --target i-xxxxxxxx

# Update everything
sudo apt update && sudo apt upgrade -y

# Automatic security updates + brute-force protection
sudo apt install -y unattended-upgrades fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades

# Optional host firewall (the security group is the primary gate; this is belt-and-suspenders)
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw --force enable
```
On Ubuntu the default `ubuntu` user is already non-root with sudo — no need to create one or to
touch root SSH (key-only login is the AMI default).

### B5. Install Docker + Compose
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu      # log out / back in for group membership to apply
docker --version && docker compose version
```

### B6. Database — nothing to install (managed Supabase)
The database stays on **managed Supabase** — do **not** install Postgres, PgBouncer, or Redis on
this box in Phase 1. The schema, RLS policies, the `student_questions` view (strips `correct_idx`
so students never see answers), and the `submit_test_attempt` scoring RPC already live in your
Supabase project. If any are missing, run them once in the **Supabase SQL Editor**:
```
backend/schema.sql
backend/optimize_indexes.sql
```
The only Supabase value the EC2 box itself needs (for the weekly backup script in Phase I) is the
pooler connection string — the app code talks to Supabase over HTTPS via `SUPABASE_*` keys, not
this URL:
```
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
```

---

## 4. PHASE C — Deploy FastAPI backend on EC2 (Docker + Caddy)

### C1. Use the existing repo Dockerfile (single worker)
The repo already ships a working `Dockerfile` (Python 3.11-slim; installs `postgresql-client` +
`libmagic1`; runs `uvicorn main:app`). Keep it as-is. Its default is **one** uvicorn worker — and
that is required: the WebSocket connection manager plus the in-memory OTP / rate-limit / cache state
all live inside a single process. **Do not add `--workers 2+`** until Phase C-SCALE moves that state
to Redis (each extra worker is a separate process and would silently break broadcasts and OTP).

### C2. Health check — already implemented
`GET /api/health` already exists and returns `{"status":"ok","database":"connected"}`. Use this path
for the reverse-proxy / UptimeRobot check now, and for the ALB target-group check in Phase 2. No
code change needed — ignore the `/health` path mentioned in older drafts.

### C3. CORS — tighten before first deploy
The backend currently ships `allow_origins=["*"]`. Lock it to your real origins in `backend/main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app.udayalms.com",
        "https://udayalms.com",
        "http://localhost:3001",   # local Vite dev only
    ],
    allow_credentials=False,       # the app sends the token in an Authorization header, not cookies
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### C4. Reverse proxy + HTTPS (Caddy + Cloudflare Origin cert)
Cloudflare proxies `api.udayalms.com` → the Elastic IP. Set Cloudflare **SSL/TLS → Full (strict)**
and install a Cloudflare **Origin Certificate** on the box so the CF→origin hop is encrypted and
trusted. Run the API and Caddy as containers with Compose.

`/opt/udaya/docker-compose.yml`:
```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    env_file: .env
    environment: [ "PORT=8001" ]
    expose: ["8001"]            # internal only — never published to the host's public IP
    restart: unless-stopped

  caddy:
    image: caddy:2
    depends_on: [api]
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./cf-origin:/etc/caddy/cf-origin:ro     # cert.pem + key.pem from Cloudflare
    restart: unless-stopped
```

`/opt/udaya/Caddyfile`:
```
api.udayalms.com {
    tls /etc/caddy/cf-origin/cert.pem /etc/caddy/cf-origin/key.pem
    reverse_proxy api:8001
}
```
WebSockets pass through `reverse_proxy` automatically — no extra config for `/api/ws/...`.

### C5. Bring it up
```bash
sudo mkdir -p /opt/udaya && sudo chown ubuntu:ubuntu /opt/udaya && cd /opt/udaya
git clone <your-private-repo-url> .            # or copy backend/ + Dockerfile here
# create .env (next step) + cf-origin/cert.pem + cf-origin/key.pem, then:
docker compose up -d --build
docker compose logs -f api                     # watch startup
curl -sf https://api.udayalms.com/api/health   # → {"status":"ok","database":"connected"}
```

One-command redeploy on new code (`/opt/udaya/deploy.sh`):
```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/udaya
git pull --ff-only
docker compose up -d --build
docker image prune -f
```
(Phase 2 replaces this pull-and-build with GitHub Actions → ECR → SSM; see Phase C-SCALE.)

### C6. Environment variables (`/opt/udaya/.env`, chmod 600)
Mirror the **real** backend config. There is no custom `SECRET_KEY`/JWT or `REDIS_URL` in Phase 1 —
auth is Supabase, and Redis only arrives in Phase 2:
```env
# Supabase (database + auth + storage) — REQUIRED
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
SUPABASE_SERVICE_KEY=<service-role-key>

# Zoom (live classes) — REQUIRED for live-class features
ZOOM_ACCOUNT_ID=...
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
ZOOM_SDK_KEY=...
ZOOM_SDK_SECRET=...
ZOOM_WEBHOOK_SECRET_TOKEN=...

# Email + AI
RESEND_API_KEY=re_...
GEMINI_API_KEY=...

# Optional — Cloudflare R2 (public files + backups). Omit to use the Supabase Storage fallback.
R2_ACCOUNT_ID=...
R2_ACCESS_KEY=...
R2_SECRET_KEY=...
R2_PRIVATE_BUCKET=udaya-private

# Optional — error monitoring + weekly DB backup target
SENTRY_DSN=https://...
DATABASE_URL=postgresql://postgres.<ref>:<pw>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
```
After the box is healthy: update the **Zoom webhook URL** to `https://api.udayalms.com/...`, and set
the frontend's `VITE_API_URL=https://api.udayalms.com/api` (Cloudflare Pages env → redeploy).

---

## 4b. PHASE C-SCALE — One EC2 → Auto Scaling Group (the 3,000-student path)

Do this when one box is no longer enough — sustained CPU > ~60% in CloudWatch, or you want
redundancy (no single point of failure). The AWS infra (ALB + ASG + ElastiCache) is the *easy*
half. The hard half is **code**: the backend currently keeps correctness-critical state inside one
Python process. **Those changes must land before `desired > 1` — or even before raising uvicorn
`--workers` above 1 — otherwise things break silently.**

### The blocker — per-process state in `backend/main.py`

| State (location) | What breaks with 2+ processes/instances | Severity | Fix |
|---|---|---|---|
| `ConnectionManager.active_connections` (WebSocket) | A broadcast only reaches clients on the *same* process; others never get it | **Critical** | Redis pub/sub fan-out |
| `_whatsapp_scheduler_loop` (background loop) | Runs on **every** instance → each due job sends WhatsApp messages **N times** to students | **Critical** | Distributed lock — one runner only |
| `_otp_pending` (2-step verify) | OTP started on instance A can't be verified on B → "OTP not found" | High | Redis key w/ TTL |
| `_login_attempts` (rate limiter) | Per-process → attacker gets 8×N login attempts via round-robin | Medium | Redis counter |
| `_wa_batches` (WhatsApp send progress) | Status poll 404s if it lands on a different instance | Medium | Redis / Supabase row |
| `broadcasts.json`, `trusted_devices.json`, `ai_insights_cache.json` | Local disk, not shared, wiped on instance replace | Medium | Supabase tables / Redis |
| `teacher_settings.json` | Already write-through to DB — file is just a cache | Low | Rely on DB; keep file optional |
| `_broadcast_cleanup_loop`, `_deferred_startup_migrations` | Run on every instance (idempotent but wasteful/noisy) | Low | Same distributed lock |
| `_auth_cache` (30 s TTL) | Per-process; eventual consistency is acceptable | Low | Optional Redis |

### Step 1 — ElastiCache (Redis)
`cache.t4g.micro`, same VPC/subnets as the instances; its security group allows `6379` **from the
app instances' security group only**. Add `REDIS_URL=redis://<endpoint>:6379/0` to config. Add
`redis` (async client) to `requirements.txt`.

### Step 2 — Code changes (the prerequisites — do these FIRST)
1. **WebSocket fan-out via Redis.** In `ConnectionManager.broadcast_to_standard`, `PUBLISH` the
   payload to channel `broadcasts:{standard_id}` instead of writing only to local sockets. On
   startup each instance runs a Redis `SUBSCRIBE` task that relays incoming messages to its *own*
   connected sockets. Sketch:
   ```python
   # publish (replaces the direct local send)
   await redis.publish(f"broadcasts:{standard_id}", json.dumps(payload))

   # one subscriber task per instance, started in startup_event()
   async def _ws_relay():
       pubsub = redis.pubsub()
       await pubsub.psubscribe("broadcasts:*")
       async for msg in pubsub.listen():
           if msg["type"] == "pmessage":
               std = msg["channel"].split(":", 1)[1]
               await manager.fan_out_local(std, json.loads(msg["data"]))
   ```
2. **Move ephemeral state to Redis** (keys with TTL): `_otp_pending`, `_login_attempts`,
   `_wa_batches`, optionally `_auth_cache`.
3. **Retire the local JSON files**: `broadcasts.json` and `teacher_settings.json` already write
   through to Supabase — stop reading the file as source of truth; move `trusted_devices.json` to a
   Supabase table and `ai_insights_cache.json` to Redis.
4. **Single-runner background loops.** Guard `_whatsapp_scheduler_loop` (and the two cleanup/
   migration loops) with a Redis lease so exactly one instance runs them:
   ```python
   # only the lease holder runs the scheduler tick
   if await redis.set("lock:wa-scheduler", INSTANCE_ID, nx=True, ex=90):
       await _wa_scheduler_tick()
   ```
   (Alternative: run schedulers only on a single designated instance, or move them to EventBridge +
   a dedicated worker outside the ASG.)
5. **Health check depth.** Make `/api/health` also ping Redis and return `503` if it's down, so the
   ALB drains a broken instance.

> Until Step 2 is fully done, you can buy time by leaving the ASG at `desired = 1` (the ALB still
> gives you zero-downtime deploys + health-based replacement) and/or enabling ALB **stickiness** as
> a stopgap for OTP/rate-limit. Stickiness does **not** fix WebSocket fan-out or duplicate scheduler
> sends — Steps 1 and 4 are mandatory before true multi-instance.

### Step 3 — Image delivery via ECR
GitHub Actions builds the image and pushes to **ECR** on each `main` push. Instances pull the
tagged image at boot — no more `git pull && build` on the box.

### Step 4 — Launch template
`t3.small`/`t3.medium`, IAM instance profile (SSM + ECR pull + CloudWatch), and **user-data** that:
reads the `.env` from **SSM Parameter Store**, `docker run` (or compose) the ECR image. Once Step 2
is done you may also set uvicorn `--workers` to match vCPUs for more throughput per box.

### Step 5 — Application Load Balancer
HTTPS `:443` listener with an **ACM** cert for `api.udayalms.com`; target group → instance port,
health check `/api/health` (30 s, healthy 2 / unhealthy 3); **idle timeout 300 s** (WebSockets);
stickiness **off** once state is externalized. The ALB supports WebSockets natively.

### Step 6 — Auto Scaling Group
Launch template + ALB target group; **min 1 · desired 1–2 · max 10**; target-tracking policies on
**CPU 60%** and **ALBRequestCountPerTarget**; health-check type **ELB**; instance-scale-in
protection during deploys.

### Step 7 — DNS cutover
Cloudflare: repoint `api.udayalms.com` from the Elastic IP **A record** to a **CNAME → the ALB DNS
name**. ACM is publicly trusted, so Cloudflare **Full (strict)** keeps working (or set the record to
DNS-only and let ACM terminate TLS at the ALB).

> **Order matters:** finish Step 2 → set up Steps 1,3–7 → only then raise ASG `desired` above 1.

---

## 5. PHASE D — Auth: FastAPI + JWT (replaces Supabase Auth)

> ⚠️ **SUPERSEDED.** Auth stays on **managed Supabase** (locked decision) — the app keeps using
> `supabase.auth.*` and validates tokens with `supabase.auth.get_user(token)`. This custom-JWT
> section is left over from the abandoned self-hosted plan; do **not** build it.

Since you are off Supabase, you handle auth yourself in FastAPI.

### D1. Password hashing
```python
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
```

### D2. JWT tokens
```python
from datetime import datetime, timedelta
from jose import JWTError, jwt

def create_access_token(data: dict, expires_minutes: int = 10080) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=expires_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

### D3. Login flow (teacher)
```python
@app.post("/auth/teacher/login")
@limiter.limit("5/minute")
async def teacher_login(request: Request, email: str, password: str, db: AsyncSession = Depends(get_db)):
    teacher = await db.execute(
        select(Teacher).where(Teacher.email == email)
    )
    teacher = teacher.scalar_one_or_none()
    if not teacher or not verify_password(password, teacher.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if teacher.totp_secret:
        # Require TOTP code — handled separately
        return {"requires_totp": True, "temp_token": create_temp_token(teacher.id)}
    token = create_access_token({"sub": str(teacher.id), "role": "teacher"})
    return {"access_token": token, "token_type": "bearer"}
```

### D4. Student login (username → password)
```python
@app.post("/auth/student/login")
@limiter.limit("5/minute")
async def student_login(request: Request, username: str, password: str, db: AsyncSession = Depends(get_db)):
    student = await db.execute(
        select(Student).where(Student.username == username)
    )
    student = student.scalar_one_or_none()
    if not student or not verify_password(password, student.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if student.blocked:
        raise HTTPException(status_code=403, detail="Account blocked")
    token = create_access_token({"sub": str(student.id), "role": "student"})
    return {"access_token": token, "token_type": "bearer", "must_change_pwd": student.must_change_pwd}
```

---

## 6. PHASE E — Realtime broadcasts (replaces Supabase Realtime)

Since you are off Supabase, realtime is handled by FastAPI WebSockets.

```python
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List

# In-memory store — OK for Phase 1 (ONE process/worker). Multi-instance OR multi-worker
# needs Redis pub/sub — see Phase C-SCALE Step 1. (Real manager lives in backend/main.py.)
class BroadcastManager:
    def __init__(self):
        self.connections: Dict[str, List[WebSocket]] = {}
        # key = standard_id, value = list of connected sockets

    async def connect(self, standard_id: str, ws: WebSocket):
        await ws.accept()
        self.connections.setdefault(standard_id, []).append(ws)

    def disconnect(self, standard_id: str, ws: WebSocket):
        if standard_id in self.connections:
            self.connections[standard_id].remove(ws)

    async def broadcast(self, standard_id: str, message: dict):
        dead = []
        for ws in self.connections.get(standard_id, []):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.connections[standard_id].remove(ws)

manager = BroadcastManager()

@app.websocket("/ws/broadcasts/{standard_id}")
async def broadcast_ws(ws: WebSocket, standard_id: str, token: str):
    # Validate JWT from query param
    payload = decode_token(token)
    await manager.connect(standard_id, ws)
    try:
        while True:
            await ws.receive_text()  # keep alive
    except WebSocketDisconnect:
        manager.disconnect(standard_id, ws)

# When teacher sends a broadcast — push to all connected students instantly
@app.post("/broadcasts/")
async def create_broadcast(data: BroadcastCreate, ...):
    broadcast = await save_broadcast_to_db(data)
    await manager.broadcast(data.standard_id, {
        "type": "new_broadcast",
        "broadcast": broadcast.dict()
    })
    return broadcast
```

Frontend connects with:
```javascript
const token = localStorage.getItem('access_token')
const ws = new WebSocket(`wss://api.udayalms.com/ws/broadcasts/${standardId}?token=${token}`)
ws.onmessage = (e) => {
  const data = JSON.parse(e.data)
  if (data.type === 'new_broadcast') addMessageToUI(data.broadcast)
}
```

---

## 7. PHASE F — Push notifications: Firebase FCM

FCM sends push to students when: new video uploaded, broadcast sent, test scheduled, live class about to start.

### F1. Firebase setup (5 minutes, free)
```
1. console.firebase.google.com → Create project "udaya-lms"
2. Project Settings → Cloud Messaging → Server Key → copy
3. Add to web app → copy firebaseConfig object
4. Download google-services.json → put in android/ (in .gitignore)
```

### F2. Frontend — register device token
```javascript
// In student layout, after login:
import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

const app = initializeApp(firebaseConfig)
const messaging = getMessaging(app)

async function registerFCMToken() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return
  const token = await getToken(messaging, { vapidKey: VAPID_KEY })
  // Send token to backend — saved in student row
  await fetch('/api/students/fcm-token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ fcm_token: token })
  })
}

// Handle foreground messages
onMessage(messaging, (payload) => {
  // Show in-app notification toast
  showToast(payload.notification.title, payload.notification.body)
})
```

### F3. Backend — send push notification
```python
import httpx

async def send_push(fcm_token: str, title: str, body: str, data: dict = {}):
    """Send FCM push notification to one device."""
    async with httpx.AsyncClient() as client:
        await client.post(
            "https://fcm.googleapis.com/fcm/send",
            headers={
                "Authorization": f"key={FIREBASE_SERVER_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "to": fcm_token,
                "notification": {"title": title, "body": body},
                "data": data,
                "android": {"priority": "high"},
            }
        )

async def notify_standard(standard_id: str, title: str, body: str, db: AsyncSession):
    """Notify all students in a standard."""
    students = await db.execute(
        select(Student.fcm_token).where(
            Student.standard_id == standard_id,
            Student.fcm_token.isnot(None),
            Student.blocked == False
        )
    )
    for (token,) in students:
        await send_push(token, title, body)

# Call after broadcast:
await notify_standard(broadcast.standard_id, "New announcement", broadcast.text[:80], db)

# Call after video upload:
await notify_standard(video.standard_id, "New video added",
                       f"{video.title} is now available", db)
```

---

## 8. PHASE G — Cloudflare R2 storage

### G1. Create two buckets in Cloudflare dashboard
```
udaya-public   → broadcast PDFs, notes, avatars, thumbnails
                 → Settings → Custom Domain → files.udayalms.com
                 → Allow public access ON (served via Cloudflare CDN globally)

udaya-private  → student submissions, teacher private docs
                 → No public access (presigned URLs from backend only)
```

### G2. Lifecycle rules — set once, runs forever
```
R2 → udaya-public → Settings → Object Lifecycle Rules:

Rule "archive-broadcasts":  prefix=broadcasts/  after=365 days → Infrequent Access
Rule "archive-notes":       prefix=notes/        after=365 days → Infrequent Access
Rule "purge-old":           prefix=broadcasts/  after=1095 days → Delete
Rule "abort-multipart":     all                  after=7 days   → Abort incomplete
```
Standard $0.015/GB-mo · Infrequent Access $0.01/GB-mo + $0.01/GB retrieval · egress free always.
After 5 years of running: ~₹184/mo total storage. Negligible.

### G3. Backend upload code (boto3 — same API as S3)
```python
import boto3, os

r2 = boto3.client(
    "s3",
    endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
    aws_access_key_id=os.environ["R2_ACCESS_KEY"],
    aws_secret_access_key=os.environ["R2_SECRET_KEY"],
    region_name="auto",
)

def upload_public(file_bytes: bytes, key: str, content_type: str) -> str:
    """Broadcast PDFs, notes, avatars → CDN URL."""
    r2.put_object(Bucket="udaya-public", Key=key,
                  Body=file_bytes, ContentType=content_type)
    return f"https://files.udayalms.com/{key}"

def presign_private(key: str, expires: int = 3600) -> str:
    """Student submissions → 1-hour signed URL, teacher reads once."""
    return r2.generate_presigned_url(
        "get_object",
        Params={"Bucket": "udaya-private", "Key": key},
        ExpiresIn=expires,
    )
```

### G4. File validation before any upload (no exceptions)
```python
import magic    # python-magic library: pip install python-magic
from fastapi import UploadFile, HTTPException

ALLOWED_TYPES = {
    "application/pdf",
    "image/jpeg", "image/png", "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
MAX_SIZE_BYTES = 20 * 1024 * 1024   # 20 MB hard limit

async def validate_file(file: UploadFile) -> bytes:
    content = await file.read()
    # 1. Size check
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(400, f"File too large. Maximum size is 20 MB.")
    # 2. MIME type from file CONTENTS (not just extension — prevents spoofing)
    mime = magic.from_buffer(content, mime=True)
    if mime not in ALLOWED_TYPES:
        raise HTTPException(400, f"File type '{mime}' not allowed.")
    # 3. Extension check (double validation)
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in {"pdf","jpg","jpeg","png","webp","doc","docx","ppt","pptx"}:
        raise HTTPException(400, f"Extension '.{ext}' not allowed.")
    return content
```

---

## 9. PHASE H — YouTube video token route (security critical)

```python
# app/api/video_token.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

@router.get("/api/video/{video_id}/token")
async def get_video_token(
    video_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # 1. Fetch video (only server sees youtube_video_id)
    video = await db.execute(
        select(Video).where(Video.id == video_id)
    )
    video = video.scalar_one_or_none()
    if not video or video.source_type != "youtube":
        raise HTTPException(404)

    # 2. Get standard_id for this video's subject class
    subject = await db.execute(
        select(SubjectClass.standard_id).where(SubjectClass.id == video.class_id)
    )
    standard_id = subject.scalar_one_or_none()

    # 3. Check access — teacher always yes, student must be in right standard
    if current_user["role"] == "student":
        student = await db.execute(
            select(Student.standard_id, Student.blocked)
            .where(Student.id == current_user["sub"])
        )
        student = student.one_or_none()
        if not student or student.blocked or student.standard_id != standard_id:
            raise HTTPException(403, "Access denied")

    # 4. Return token (deliberately NOT named youtube_video_id)
    return {"token": video.youtube_video_id, "source_type": "youtube"}
```

---

## 10. PHASE I — Automated database backups (every Sunday 2 AM)

### I1. Backup script: backend/scripts/backup_db.py
```python
import subprocess, boto3, os, datetime, gzip

def backup_database():
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M")
    filename = f"udaya_lms_{timestamp}.sql.gz"
    local_path = f"/tmp/{filename}"

    # pg_dump → gzip in one step
    dump = subprocess.run(
        ["pg_dump", "-h", "127.0.0.1", "-U", "udaya_app",
         "-d", "udaya_lms", "--no-password"],
        capture_output=True, env={**os.environ, "PGPASSWORD": os.environ["DB_PASSWORD"]}
    )
    if dump.returncode != 0:
        raise RuntimeError(f"pg_dump failed: {dump.stderr.decode()}")

    with gzip.open(local_path, "wb") as f:
        f.write(dump.stdout)

    # Upload to R2 private bucket
    r2 = boto3.client("s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["R2_SECRET_KEY"],
        region_name="auto")
    r2.upload_file(local_path, "udaya-private", f"backups/db/{filename}")
    os.remove(local_path)
    print(f"✓ Backup uploaded: backups/db/{filename}")

if __name__ == "__main__":
    backup_database()
```

### I2. Cron job on the server (runs automatically every Sunday 2 AM)
```bash
crontab -e
# Add this line:
0 2 * * 0 cd /app && python scripts/backup_db.py >> /var/log/udaya_backup.log 2>&1
```

### I3. Verify backup is working (check monthly)
```bash
# List backups in R2 via CLI
aws s3 ls s3://udaya-private/backups/db/ \
  --endpoint-url https://ACCOUNT_ID.r2.cloudflarestorage.com
```

### I4. Restore from backup if disaster happens
```bash
# Download latest backup from R2
aws s3 cp s3://udaya-private/backups/db/udaya_lms_YYYY-MM-DD.sql.gz . \
  --endpoint-url https://ACCOUNT_ID.r2.cloudflarestorage.com

# Restore
gunzip udaya_lms_YYYY-MM-DD.sql.gz
psql -U udaya_app -d udaya_lms -h 127.0.0.1 -f udaya_lms_YYYY-MM-DD.sql
```

---

## 11. PHASE J — Sentry error monitoring (free tier, 5 minutes setup)

### J1. Create Sentry projects
```
sentry.io → Create account (free) → New Project
  Project 1: "udaya-frontend" → React
  Project 2: "udaya-backend"  → FastAPI / Python
Copy both DSNs
```

### J2. Frontend integration
```bash
npm install @sentry/react
```
```javascript
// main.jsx — before rendering the app
import * as Sentry from "@sentry/react"
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,       // "production" or "development"
  tracesSampleRate: 0.1,                   // 10% of requests traced
  replaysOnErrorSampleRate: 1.0,           // full replay on errors
})
```

### J3. Backend integration
```python
# requirements.txt: add sentry-sdk[fastapi]
import sentry_sdk
sentry_sdk.init(
    dsn=os.environ["SENTRY_DSN"],
    environment="production",
    traces_sample_rate=0.05,
)
# Sentry auto-captures all unhandled exceptions from FastAPI
```
Free tier: 5,000 errors/month. More than enough for a tuition LMS.

---

## 12. PHASE K — Jitsi Meet self-hosted (SUPERSEDED)

> ⚠️ **SUPERSEDED.** Do not self-host Jitsi. The app uses **Zoom** for live classes (`ZOOM_*` env
> vars), and there is no CX33 — the backend is a single EC2 box. Kept only for historical reference.

```bash
# Install Jitsi Meet on the same CX33 server
curl https://download.jitsi.org/jitsi-key.gpg.key | sudo apt-key add -
echo "deb https://download.jitsi.org stable/" | sudo tee /etc/apt/sources.list.d/jitsi.list
apt update && apt install -y jitsi-meet

# During install: enter your hostname → meet.udayalms.com
# Select: "Let's Encrypt" for SSL certificate
```

Frontend uses Jitsi IFrame API inside your app:
```javascript
import { JitsiMeeting } from '@jitsi/react-sdk'

<JitsiMeeting
  domain="meet.udayalms.com"      // YOUR self-hosted server, not meet.jit.si
  roomName={roomName}             // stored in live_classes table, never shown to students
  displayName={userName}
  configOverwrite={{
    startWithAudioMuted: true,    // all join muted
    disableDeepLinking: true,
    prejoinPageEnabled: false,
  }}
  interfaceConfigOverwrite={{
    TOOLBAR_BUTTONS: isModerator
      ? ['microphone','camera','chat','raisehand','tileview','hangup']
      : ['raisehand','chat','hangup'],
    SHOW_JITSI_WATERMARK: false,
  }}
  onApiReady={(api) => {
    if (isModerator) {
      api.executeCommand('muteEveryone', 'audio')
      api.executeCommand('toggleModeration', true, 'audio') // force-mute, students can't unmute
    }
    api.addEventListener('participantJoined', (e) => {
      saveAttendance(e.id, e.displayName, 'joined', new Date())
    })
    api.addEventListener('participantLeft', (e) => {
      saveAttendance(e.id, e.displayName, 'left', new Date())
    })
  }}
/>
```

MediaRecorder for local recording (teacher's browser saves to their PC):
```javascript
const startLocalRecording = async () => {
  const screen = await navigator.mediaDevices.getDisplayMedia({
    video: { width: 1280, height: 720 }, audio: true
  })
  const recorder = new MediaRecorder(screen, {
    mimeType: 'video/webm;codecs=vp9,opus'
  })
  const chunks = []
  recorder.ondataavailable = (e) => chunks.push(e.data)
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `class-${new Date().toISOString().split('T')[0]}.webm`
    a.click()   // saves to teacher's Downloads folder — zero server cost
  }
  recorder.start(1000)
  return recorder
}
```

---

## 13. PHASE L — Frontend: Cloudflare Pages

```
dash.cloudflare.com → Workers & Pages → Create → Pages
→ Connect GitHub → Udaya_LMS (private) → /frontend

Build settings:
  Framework:    Vite
  Build cmd:    npm run build
  Output dir:   dist

Environment variables:
  VITE_API_URL=https://api.udayalms.com
  VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
  VITE_FIREBASE_API_KEY=...
  VITE_FIREBASE_PROJECT_ID=...
  VITE_FIREBASE_MESSAGING_SENDER_ID=...
  VITE_FIREBASE_APP_ID=...
```

Block Google from indexing the login-walled LMS:
```
# frontend/public/robots.txt
User-agent: *
Disallow: /
```

Custom domain → Pages project Settings → Custom domains → `app.udayalms.com`.

---

## 14. PHASE M — Domain: GoDaddy → Cloudflare

```
1. Buy udayalms.com at GoDaddy (~₹800/yr)
2. Cloudflare → Add site → enter udayalms.com
3. Cloudflare shows 2 nameservers (e.g. ada.ns.cloudflare.com)
4. GoDaddy → DNS → Nameservers → Change → paste Cloudflare's nameservers
5. Wait 1–24h for propagation

DNS records in Cloudflare (all Proxied ✅):
  A      api        EC2_ELASTIC_IP         → FastAPI backend (Phase 1)
                    ── Phase 2: change to  CNAME api → <alb-dns-name>  (ASG behind ALB)
  CNAME  app        udaya-lms.pages.dev    → LMS frontend (Cloudflare Pages)
  CNAME  @          udaya-mkt.pages.dev    → marketing site (Cloudflare Pages, optional)
  CNAME  www        udayalms.com           → redirect to root
  CNAME  files      (auto-created by R2 custom domain setup)

SSL/TLS → Full (strict)   (origin uses a Cloudflare Origin cert on EC2 in Phase 1; ACM on the ALB in Phase 2)
```
That's it. HTTPS is automatic, free, never needs renewal, covers all subdomains.

---

## 15. Post-deploy verification checklist (run all 18 before inviting students)

```
□ 1.  https://api.udayalms.com/api/health → {"status":"ok","database":"connected"}
□ 2.  https://api.udayalms.com/docs → FastAPI interactive docs load
□ 3.  https://app.udayalms.com/login → page loads with padlock (SSL valid)
□ 4.  Teacher login → JWT returned → dashboard loads with real DB data
□ 5.  Student login with username → JWT returned → student home loads
□ 6.  Create standard → subject → add YouTube Unlisted video → thumbnail shows
□ 7.  Student plays video → /api/video/{id}/token returns token → video plays
□ 8.  Wrong-standard student tries video → gets 403 Forbidden
□ 9.  Teacher sends broadcast → WebSocket pushes message to student within 2s
□ 10. FCM: student receives push notification on phone (new broadcast)
□ 11. Student takes test → score calculated server-side by RPC → correct result
□ 12. Attendance: mark P/A/L → save → DB row updated correctly
□ 13. Upload broadcast PDF → file appears at files.udayalms.com/broadcasts/...
□ 14. Upload .exe file → rejected with "file type not allowed" error
□ 15. Upload 25MB file → rejected with "file too large" error
□ 16. Jitsi: teacher starts class at meet.udayalms.com → students join → muted
□ 17. R2: check backups/db/ has a .sql.gz file (manual backup: python scripts/backup_db.py)
□ 18. UptimeRobot monitor green on api.udayalms.com (set 5-min interval)
```

---

## 16. Android app: Capacitor → Play Store

### Step 1 — Wrap React app with Capacitor
```bash
cd frontend
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Udaya LMS" "com.udaya.lms" --web-dir dist
npm run build
npx cap add android
npx cap copy android
npx cap open android        # opens Android Studio
```

### Step 2 — Create signing keystore (ONCE — never lose this file)
```bash
keytool -genkey -v -keystore udaya-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias udaya
# You will be asked for: name, org, city, country, passwords
# BACK UP .jks FILE TO: your PC + Google Drive + USB stick + password manager
```
⚠️ **Losing the .jks file or its password means you can NEVER update the app. You would need to publish a brand-new app and lose all users.**

### Step 3 — android/app/build.gradle
```gradle
android {
    defaultConfig {
        applicationId "com.udaya.lms"
        versionCode 1        // increment by 1 on every release
        versionName "1.0.0"
        minSdkVersion 24
        targetSdkVersion 34
    }
    signingConfigs {
        release {
            storeFile file("../../udaya-release.jks")
            storePassword "YOUR_STORE_PASSWORD"
            keyAlias "udaya"
            keyPassword "YOUR_KEY_PASSWORD"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
        }
    }
}
```

### Step 4 — Build & submit
```
Android Studio → Build → Generate Signed Bundle/APK → Android App Bundle (AAB)
```
```
play.google.com/console
→ Pay $25 one-time developer registration
→ Create app → fill: name, description, screenshots, icon (512px)
→ Privacy policy URL: https://udayalms.com/privacy   ← MANDATORY
→ Data Safety form: name, phone, marks, attendance collected; encrypted; no ads; not sold
→ Content rating questionnaire → Education
→ Target audience: includes under-18 → complete Families section
→ Upload AAB → create Production release → Submit
→ First review: 3–7 days
```

### Step 5 — Every future update
```bash
# 1. Increment versionCode in build.gradle (2, 3, 4…)
# 2. npm run build → npx cap copy android
# 3. Android Studio → generate new signed AAB (same keystore)
# 4. Play Console → Production → Create new release → upload → rollout
# Future updates: approved in hours, not days
```

---

## 17. Legal checklist (India)

### Must do before charging anyone
| Item | What it is | How | Cost |
|---|---|---|---|
| Privacy Policy | Required by IT Act + DPDP Act 2023 + Play Store | Static page at udayalms.com/privacy | ₹0 |
| Terms & Conditions | Account rules, fees, recorded class policy | Static page at udayalms.com/terms | ₹0 |
| Parental consent | DPDP requires consent for minors' data | Add line to paper admission form | ₹0 |
| Udyam registration | Legal business identity, opens current account | udyamregistration.gov.in, 10 min | ₹0 |

Privacy policy must state: what you collect (name, phone, marks, attendance, activity), why, where stored (AWS Mumbai `ap-south-1` + managed Supabase, India region), retention period, how to request deletion (your email).

Parental consent line for admission form:
> *"I, parent/guardian of __________, consent to my child's data (name, phone, marks, attendance, learning activity) being stored and processed in the Udaya LMS platform for educational purposes. I understand I may request deletion by contacting udayacentre@gmail.com. Signature: ______ Date: ______"*

### Can wait
- **GST** — only when turnover > ₹20L/year
- **Trademark** — year 2, ~₹4,500 govt fee
- **Pvt Ltd** — not needed at this scale

---

## 18. Marketing website + SEO + Google Business Profile

### Marketing site (udayalms.com — separate Cloudflare Pages project)
One page per keyword target:
```
/               → home: "Calicut's tuition centre with its own app"
/10th-tuition   → "10th CBSE Tuition in Calicut"
/11th-tuition   → "Plus One Science Tuition Kozhikode"
/12th-tuition   → "Plus Two Science Tuition Kozhikode"
/contact        → address + Google Map + WhatsApp button
```

Title tag for every page:
```html
<title>Best Tuition Centre in Calicut | Udaya Centre — 8th to 12th CBSE & State</title>
<meta name="description" content="Udaya Centre Calicut — tuition with our own learning app.
Parents track attendance and marks daily from their phone. Book a free demo.">
```

LocalBusiness schema on homepage:
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "name": "Udaya Centre",
  "url": "https://udayalms.com",
  "telephone": "+91XXXXXXXXXX",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Your street address",
    "addressLocality": "Calicut",
    "addressRegion": "Kerala",
    "postalCode": "673001",
    "addressCountry": "IN"
  },
  "openingHours": "Mo-Sa 09:00-20:00",
  "sameAs": [
    "https://www.justdial.com/your-listing",
    "https://www.instagram.com/udayacentre"
  ]
}
</script>
```

### Google Business Profile (most important for local search — do this week)
```
1. business.google.com → Create profile
2. Category: "Coaching center"
3. Name/address/phone exactly matching website (NAP consistency)
4. 15+ photos: classroom, the app on phone, board results, centre exterior
5. Add website and WhatsApp number
6. Post weekly updates (results day, admission dates, app features)
```
Reviews = #1 local ranking factor. After every result day → WhatsApp direct review link to happy parents.
Target: 30+ reviews at 4.5★. This puts you in the map pack above all website results.

### Local citations (free, identical NAP)
```
Justdial   → justdial.com/addlisting
Sulekha    → sulekha.com/addlisting
IndiaMART  → indiamart.com/addlisting
```

### Malayalam pages
Add Malayalam version of key pages. Parents search:
`കാലിക്കറ്റ് ട്യൂഷൻ സെന്റർ` and `കോഴിക്കോട് ട്യൂഷൻ`

Timeline: map pack in 2–4 months, organic rankings 4–6 months.

---

## 19. Publicity — ranked by what works in Kerala

| Rank | Method | Cost | Why it works |
|---|---|---|---|
| 1 | WhatsApp Status + parent groups | ₹0 | Highest conversion in Kerala |
| 2 | App demo at every admission | ₹0 | "Parents see marks daily" closes admissions |
| 3 | Referral: refer a student → ₹500 off | ₹500 discount | Parents recruit parents |
| 4 | Results-day poster (topper photos + marks) | Printing cost | Visible social proof |
| 5 | Instagram Reels (tag Calicut location) | ₹0 | Students live there |
| 6 | QR banner at centre → website → WhatsApp | Printing cost | Offline to online conversion |
| 7 | Justdial/Sulekha listing | ₹0 | Local search traffic |
| 8 | Newspaper ad (May–June only) | ₹2,000–5,000 | Admission season reach |

**Your headline everywhere:**
> "Know your child's attendance, test scores, and learning progress directly from your phone — every day."
This converts better than anything about recorded classes or videos.

---

## 20. Post-launch feature roadmap

### Phase 1 (Month 1–2 after launch)
- Push notifications wired to all teacher actions
- Fee management: student → month → amount → paid/pending/waived

### Phase 2 (Month 3–4)
- Parent portal login (read-only: attendance, marks, broadcasts)
- Homework / assignment submission with file upload

### Phase 3 (Month 5–6)
- WhatsApp automation (WANotifier) for fee reminders + credential delivery
- Bulk student import (CSV/Excel/Word → auto classify by standard)

### Phase 4 (Month 7+)
- AI report card (Gemini / Claude Haiku) wired to real student data
- Performance analytics with radar + multiline charts + heatmaps

### Phase 5 (Year 2)
- Multi-teacher support (admin delegation)
- Multi-branch support (different centres under one account)

---

## 21. Cost at every student scale

Figures are approximate (ap-south-1, on-demand, ~₹85/$). EBS + modest data-transfer folded in. A
1-year Compute Savings Plan cuts EC2 ~40%. FCM/Sentry are free tiers and omitted.

| Students | Phase | EC2 compute | ALB + Redis | Supabase Pro | R2 | Domain | Total/mo (≈) |
|---|---|---|---|---|---|---|---|
| Testing | 1 | t3.small ~₹1,250 | — | ₹2,100 | ₹0 | ₹67 | **~₹3,600** |
| 300 | 1 | t3.small ~₹1,250 | — | ₹2,100 | ₹0 | ₹67 | **~₹3,600** |
| 500 | 1 | t3.small ~₹1,250 | — | ₹2,100 | ₹0 | ₹67 | **~₹3,600** |
| 1,000 | 1 | t3.medium ~₹2,550 | — | ₹2,100 | ~₹13 | ₹67 | **~₹4,950** |
| 2,000 | 2 | 1–2× t3.medium ~₹2,550–5,100 | ~₹2,700 | ₹2,100 | ~₹38 | ₹67 | **~₹7,500–10,000** |
| 5,000 | 2 | ASG 2–4× t3.medium ~₹5,100–10,200 | ~₹2,700 | ₹2,100 + compute add-on | ~₹108 | ₹67 | **~₹10,000–15,500** |
| 10,000 | 2 | ASG 4–8× ~₹10,000–20,000 | ~₹2,700 + LCU | larger Supabase compute | ~₹203 | ₹67 | **~₹16,000–25,000** |

Supabase Pro (~₹2,100/mo) is a fixed line from day one — it is the database/auth/storage and is
unchanged by this AWS move. WhatsApp (WANotifier): ₹0.145/student one-time at enrollment (300
students = ₹43.50/year). AI suggestions (Gemini): ~₹0–5/month.
One-time costs: Play Store $25 (~₹2,100) · Udyam free · domain ₹800/yr.

---

## 22. Maintenance schedule

### Weekly (5 minutes)
```bash
ssh -i udaya.pem ubuntu@ELASTIC_IP          # or: aws ssm start-session --target i-xxxx
sudo apt update && sudo apt upgrade -y       # (unattended-upgrades already handles security)
docker compose -f /opt/udaya/docker-compose.yml ps          # all containers Up
docker compose -f /opt/udaya/docker-compose.yml logs --tail 50 api
# Check Sentry → no new error spikes; CloudWatch → CPU/mem trend healthy
```

### Code updates (automated after setup)
```
Frontend push → Cloudflare Pages auto-deploys in ~60s
Backend (Phase 1) → ssh in → /opt/udaya/deploy.sh        (git pull + rebuild)
Backend (Phase 2) → push to main → GitHub Actions → ECR → ASG instance refresh
Rollback frontend: Pages → Deployments → last good → Rollback (instant)
Rollback backend (Phase 1): git -C /opt/udaya checkout <prev-sha> && /opt/udaya/deploy.sh
Rollback backend (Phase 2): deploy the previous ECR image tag → ASG instance refresh
```
> Retire `.github/workflows/keep-alive.yml` — it exists only to stop the Render free tier sleeping.
> EC2 never sleeps. Use UptimeRobot (or a CloudWatch alarm on ALB/target health) for liveness alerts.

### Monthly (10 minutes)
```
□ R2 storage GB (slow growth, lifecycle auto-archives)
□ CloudWatch: EC2 CPU/RAM should be <60% (Phase 1) · ASG scaling healthy (Phase 2)
□ AWS Cost Explorer: month-to-date spend tracks the §21 table (watch for surprise data-transfer)
□ Play Console: crash-free rate should be >99%
□ Sentry: review any recurring errors
□ Check Sunday backup exists: R2 → backups/db/ → latest .sql.gz file
□ Ask 2–3 happy parents for a Google review
□ Google Business Profile: add a post (results / admission / feature update)
```

### Yearly — academic year cycle (May–June, ~45 minutes)
```sql
-- 1. Export all marks + attendance to Excel, report cards to PDF

-- 2. Archive finished standard
UPDATE students
SET blocked = true, archived = true, archived_at = now()
WHERE standard_id = 'OLD_STANDARD_UUID';

UPDATE standards
SET status = 'archived', ended_at = now()
WHERE id = 'OLD_STANDARD_UUID';

-- 3. Promote continuing students (9th → 10th)
UPDATE students
SET standard_id = 'NEW_10TH_UUID'
WHERE standard_id = 'OLD_9TH_UUID';

-- 4. Safe cleanup
DELETE FROM broadcast_reads
WHERE student_id IN (
  SELECT id FROM students
  WHERE archived = true AND archived_at < now() - interval '6 months'
);
DELETE FROM video_progress
WHERE student_id IN (SELECT id FROM students WHERE archived = true);

-- 5. Create new standards for new academic year
-- 6. Bulk import new students → auto-credentials → WhatsApp
-- R2 lifecycle rules archive old files automatically — nothing to do
```

---

## 23. Exact waterfall — week by week

```
WEEK 1 — Security + paperwork
  Day 1: GitHub private + git log secret hunt + rotate ALL keys
  Day 2: Write privacy policy + T&C (host as static HTML on Cloudflare Pages)
  Day 3: Udyam registration (free, 10 min, udyamregistration.gov.in)
          Add parental-consent line to paper admission form
  Day 4: Buy GoDaddy domain → paste Cloudflare nameservers (propagation starts)
  Day 5: Sentry accounts created + DSNs copied

WEEK 2 — Server setup (AWS, Phase 1)
  Day 1: Launch EC2 t3.small (ap-south-1) + Elastic IP + security group → harden (Phase B)
  Day 2: Confirm Supabase has schema + RLS + student_questions view + submit_test_attempt RPC
          (run schema.sql / optimize_indexes.sql in the Supabase SQL Editor if missing)
  Day 3: Install Docker → docker compose up (api + Caddy) → tighten CORS
          Test: https://api.udayalms.com/api/health → {"status":"ok"}
  Day 4: Cloudflare Origin cert + DNS A record → Full(strict)
          Cron job for Sunday DB backup (pg_dump → R2) → manual test run
  Day 5: Cloudflare Pages → deploy frontend (VITE_API_URL → https://api.udayalms.com/api)
          DNS records → SSL Full(strict) → custom domains

WEEK 3 — Storage + notifications
  Day 1: R2 buckets → custom domain → lifecycle rules
          Wire R2 upload/presign in backend
  Day 2: Firebase project → FCM → integrate frontend token registration
          Backend send_push function → test on your own phone
  Day 3: Sentry DSNs → integrate frontend + backend
          UptimeRobot monitor on api.udayalms.com
  Day 4: Run all 18 verification steps
  Day 5: Pilot: 5–10 real students + teacher → watch Sentry + container logs (docker compose logs) daily

WEEK 4 — Android app
  Day 1: Capacitor setup → npm run build → npx cap copy android
  Day 2: Create keystore → BACK UP TO 4 LOCATIONS IMMEDIATELY
  Day 3: Build signed AAB in Android Studio
  Day 4: Play Console: $25 + listing + privacy URL + data safety form → submit
  Day 5: Wait for review (3–7 days) — use time to set up marketing site

MONTH 2 — Visibility
  Marketing site live on udayalms.com
  Google Business Profile: create + 15 photos + first posts
  Justdial / Sulekha / IndiaMART listings (free, identical NAP)
  QR banner at centre entrance

MONTH 3+ — Growth
  Collect reviews after every results day (WhatsApp direct link)
  Demo the app at every admission enquiry ("parents see marks daily")
  Referral programme ₹500 off
  Build Phase 3–6 features in README.md in parallel

EVERY JUNE — Academic year cycle (Section 22)
```

---

## 24. Emergency procedures

### Backend down (UptimeRobot / CloudWatch alarm emails you)
```bash
# Fix 1: restart the containers (fixes most issues, ~30 s)
ssh -i udaya.pem ubuntu@ELASTIC_IP          # or: aws ssm start-session --target i-xxxx
cd /opt/udaya && docker compose restart

# Fix 2: a container won't come up
docker compose ps                            # see what's down
docker compose logs --tail 100 api
sudo systemctl restart docker                # if the docker daemon itself crashed

# Fix 3: instance frozen / unreachable
# EC2 Console → Instances → Reboot (or Stop/Start — the Elastic IP stays attached)

# Fix 4: bad code deploy
git -C /opt/udaya checkout <previous-good-sha> && /opt/udaya/deploy.sh   # Phase 1
# Phase 2: redeploy the previous ECR image tag → ASG instance refresh

# Phase 2 only: the ALB auto-replaces an instance that fails /api/health — usually no action needed
```

### Frontend broken after push
```
Cloudflare Pages → Deployments → last known-good → Rollback
Done in 30 seconds. Zero downtime.
```

### Database corruption / data mistake
The database is **managed Supabase** — restore there, not on the EC2 box.
```bash
# Preferred: Supabase Dashboard → Database → Backups → Point-in-Time Recovery (Pro plan)
#   pick a timestamp just before the mistake → Restore.

# Fallback: restore the weekly pg_dump (Phase I) from R2 into Supabase
aws s3 cp s3://udaya-private/backups/db/udaya_lms_LATEST.sql.gz . \
  --endpoint-url https://ACCOUNT_ID.r2.cloudflarestorage.com
gunzip udaya_lms_LATEST.sql.gz
# pause writes first (Phase 1: docker compose stop api  /  Phase 2: set ASG desired = 0)
psql "$DATABASE_URL" -f udaya_lms_LATEST.sql       # DATABASE_URL = Supabase pooler
# then bring the backend back up
```

### Database running slow under load
```sql
-- Run in psql to find slow queries
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE tablename IN ('students','test_attempts','video_progress','attendance_records')
ORDER BY n_distinct DESC;
```

### Leaked key suspected
```bash
# 1. Supabase service_role key: Supabase → Settings → API → roll → update .env / SSM → restart
# 2. Any API key (Zoom / Gemini / Resend / R2): regenerate in its dashboard, then update + restart
#    Phase 1: edit /opt/udaya/.env  →  docker compose up -d
#    Phase 2: update SSM Parameter Store  →  ASG instance refresh
# Total time: ~5 minutes, zero user downtime if done in this order
```

### Android app crashed
```
Play Console → Android Vitals → Crashes → download stack trace
Sentry will have the error with full context before users even report it
Fix → increment versionCode → new signed AAB → Play Console → rollout
```

---

## 25. Ratings after all corrections

| Area | Before corrections | After rebuild | Key change |
|---|---|---|---|
| Architecture | 9.5/10 | 9.5/10 | Supabase → self-hosted Postgres (same quality, lower cost) |
| Cost | 10/10 | 10/10 | ₹2,100/mo Supabase Pro eliminated — all-in ~₹970/mo |
| Security | 8.5/10 | 9.5/10 | Rate limiting + MFA + file MIME validation added |
| Notifications | Missing | Added | Firebase FCM (Phase F) |
| Backups | Missing | Added | Weekly pg_dump → R2 (Phase I) |
| Monitoring | Basic | Strong | Sentry frontend + backend (Phase J) |
| File safety | Missing | Added | MIME + size + extension validation before R2 |
| Realtime | Supabase | WebSocket | FastAPI WebSocket broadcast manager |
| Auth | Supabase Auth | FastAPI JWT | bcrypt + jose + TOTP MFA |
| Legal | 8/10 | 8.5/10 | DPDP parental consent strengthened |
| Marketing | 9/10 | 9/10 | Parent-tracking headline confirmed as #1 pitch |
| Feature roadmap | Not listed | Added | 5-phase post-launch plan (Section 20) |

---

*Companion files in repo:*
- *README.md — build phases + all Antigravity prompts*
- *APIS.md — which API for which feature + costs*
- *ATTENDANCE_SYSTEM.md — attendance SQL + frontend*
- *YOUTUBE_VIDEO_FEATURE.md — YouTube security architecture*
- *LAUNCH_PLAN.md — this file*

*Rule: if it is not written in a .md file in this repo, it will be forgotten.*
*Update this file immediately whenever a decision changes.*
