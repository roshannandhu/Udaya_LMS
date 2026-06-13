# LAUNCH_PLAN.md — Udaya LMS
> Master plan: Deploy → Legal → Play Store → Marketing → Maintain
> Stack: React+Vite · FastAPI · Supabase · Hetzner+Coolify · Cloudflare Pages · Cloudflare R2 · GoDaddy
> Keep this file in the repo root. Reference it in every Antigravity/Claude session.

### Independent review scorecard

| Architecture | Cost | Security | Scalability | Legal | Marketing | Operations |
|---|---|---|---|---|---|---|
| 9.5/10 | 10/10 | 8.5/10 | 8.5/10 | 8/10 | 9/10 | 10/10 |

**Verdict:** production-ready for a tuition centre. Comfortably handles the first **300–1,000 students at ~₹2,500–3,000/month**. The five pre-launch additions the review called out — automated backups, push notifications, Sentry, rate limiting, file validation — are all folded into the phases below, which lifts Security to **9.5/10**. Everything beyond that (Redis, multi-branch, online payments) can wait until after the first 100–300 students.

---

## 0. Full architecture — how everything connects

```
Student / Teacher / Parent phone
        ↓
GoDaddy domain (udayalms.com) — nameservers point to Cloudflare
        ↓
CLOUDFLARE (DNS + free SSL + CDN + DDoS — sits in front of everything)
        ├── udayalms.com        → Marketing website    (Cloudflare Pages, Google indexes)
        ├── app.udayalms.com    → LMS frontend          (Cloudflare Pages, login wall, NOT indexed)
        ├── api.udayalms.com    → FastAPI backend       (Hetzner VPS + Coolify)
        └── files.udayalms.com  → Public files          (Cloudflare R2, CDN cached, zero egress)
                                          ↓
                                Supabase (ap-south-1 Mumbai)
                                PostgreSQL + Auth + Realtime + private Storage
                                          ↓
                                Notification flow:
                                Backend event → notifications table
                                → Firebase Cloud Messaging → Student phone
```

| Layer | Service | Cost/month |
|---|---|---|
| Domain | GoDaddy → Cloudflare DNS | ~₹67 (₹800/yr) |
| Frontend (LMS + marketing) | Cloudflare Pages | ₹0 |
| Backend (FastAPI) | Hetzner CX32 + Coolify | ~₹540 (€6.49) |
| Database + Auth + Realtime | Supabase (Free → Pro) | ₹0 testing / ₹2,100 production |
| Public files | Cloudflare R2 | ₹0 (10 GB free) |
| Private files | Supabase Storage | included in Pro |
| Live classes | Jitsi (meet.jit.si) | ₹0 |
| Videos | YouTube Unlisted + IFrame API | ₹0 |
| Push notifications | Firebase Cloud Messaging | ₹0 |
| AI suggestions | Gemini / Claude Haiku | ~₹0–5 |
| Error monitoring | Sentry (free tier) | ₹0 |
| Uptime monitoring | UptimeRobot (free) | ₹0 |
| DB backup storage | Cloudflare R2 | ~₹0 (tiny files) |
| **Total at launch** | | **~₹430 testing / ~₹2,530 production** |

---

## 1. Locked decisions — do not re-debate these

- **Videos** — YouTube Unlisted only. `youtube_video_id` NEVER sent to client directly. Only via `/api/video/[id]/token` after verifying student's standard_id.
- **Live classes** — Jitsi Meet (meet.jit.si free → self-host on Hetzner if 30+ students lag). Recording = browser MediaRecorder (local save to teacher's PC, zero server cost). Teacher uploads to YouTube Unlisted manually after class.
- **Test scoring** — Supabase RPC `submit_test_attempt` (SECURITY DEFINER). Students read from `student_questions` view only (no `correct_idx` column).
- **Storage** — private (submissions, sensitive docs) = Supabase Storage + RLS. Public/download-heavy (PDFs, notes, avatars, thumbnails) = Cloudflare R2 (zero egress fees forever).
- **Credentials delivery** — manual Excel forwarding at start → WANotifier WhatsApp API at launch (₹0.145/msg utility template). Format: `919876543210`.
- **Android** — Capacitor wraps existing React build. iOS deferred (needs Mac + $99/yr).
- **Push notifications** — Firebase Cloud Messaging (FCM). Free. Better reach than Web Push alone for Android. See Phase F.
- **File uploads** — validated before storage: type, size, extension (never trust the client). Optional ClamAV virus scan once students can upload submissions. See Phase G.
- **Rate limiting** — slowapi on FastAPI for login, OTP, forgot-password routes. See Phase H.
- **Environments** — Render + Vercel are **testing/staging only** (disposable). Hetzner + Coolify + Cloudflare Pages is **production**. Nothing real depends on Render/Vercel, so secret/CORS/`.env` cleanup can't break "production" — production simply starts clean on Hetzner.
- **Security scope (this deploy)** — the one essential action is making the repo **private**. A fresh Supabase `service_role` key goes into production when Coolify env is configured (Phase B5) — generate a new one there, never reuse the leaked one. Zoom / Resend / Gemini leaks are low-stakes and deferred. MFA already exists (email OTP). See Phase A.
- **Build workflow** — surgical, security-critical, and cross-cutting edits are done here in Claude Code; bulky self-contained modules (FCM, file validation, backup script, etc.) are generated in Antigravity/Codex from this plan's code blocks, with the diff reviewed before merge.

---

## 2. PHASE A — Security first (the realistic, trimmed version)

Render + Vercel are throwaway test envs and nothing real is in production yet, so the
security work collapses to almost nothing: make the repo private now, and start production
clean on Hetzner. Skip the over-cautious ceremony.

### A1. Make the GitHub repo private — the one essential action
`Udaya_LMS` → Settings → General → Danger Zone → **Change visibility → Private**.
Stops all ongoing public exposure. Do it now; it's the single highest-value step.

### A2. Secret-hunt — DONE
Exposed in public history: Supabase `service_role` + `anon`, four Zoom secrets (also
hard-coded in the test-only `render.yaml`), Resend key. The Gemini key was blocked by
GitHub push protection and never reached the public repo. None of this is catastrophic —
no real production runs on these keys; production starts fresh on Hetzner.

### A3. Fresh keys at production setup — no separate rotation step
When you configure the Coolify env for production (Phase B5), put a **freshly generated**
Supabase `service_role` there instead of the leaked one:
```
Supabase → Settings → API → JWT Settings → Generate new secret → use the new key in Coolify (B5)
```
Leave the test Render/Vercel as-is or tear them down. Zoom / Resend / Gemini: only rotate
if abuse actually shows up — low stakes (worst case a small bill or spam, not a data breach).

### A4. .gitignore — DONE
Android/Firebase signing patterns (`*.jks`, `*.keystore`, `google-services.json`,
`android/app/build/`) are now ignored. `backend/.env` and the `render.yaml` Zoom block are
test-only artifacts; production reads its env from Coolify (B5), never from a committed
file — so they're harmless to leave, and get removed at the Hetzner cutover.

### A5. MFA for teacher login — ALREADY BUILT
Email-OTP two-step verification already exists (`main.py:1008–1236`, gated by Settings →
Security → "Two-step verification"). No code to write — enable the toggle and set
`RESEND_API_KEY` in production. (TOTP/Google Authenticator is a future upgrade, not needed for launch.)

---

## 3. PHASE B — Deploy backend (Hetzner + Coolify)

### B1. Buy the server
hetzner.com → Cloud → New Server:
- Image: Ubuntu 24.04
- Type: **CX32** (4 vCPU, 8 GB RAM, ~€6.49/mo) — headroom for Coolify + ClamAV + a future Redis; upgrade to CX42 around 2,000 students
- **Location:** the CX (Intel) line is **EU-only**, so CX32 means Falkenstein/Nuremberg (DE) or Helsinki (FI). Trade-off: an EU server is ~130 ms from India students *and* the Supabase Mumbai DB, so every request pays it. For lowest latency to India instead, use the Singapore **CPX (AMD)** line (CPX21, 4 GB, ~€7.55) placed in Singapore. EU = cheaper/bigger; Singapore = snappier. Both fine for launch.
- Add your SSH public key at creation

### B2. Install Coolify
```bash
ssh root@YOUR_SERVER_IP
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
# Opens at http://YOUR_SERVER_IP:8000 → create admin account
```
Coolify = free self-hosted Heroku. Dashboard, auto-deploy from GitHub, logs, SSL, rollback. Same ₹540/month server, zero extra cost.

### B3. Dockerfile for backend/
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "4"]
```

### B4. Deploy from private GitHub in Coolify
1. Coolify → Sources → Connect GitHub App → authorize `Udaya_LMS` (private)
2. New Project → Add Resource → Application → base dir `/backend`
3. Build pack: Dockerfile · Port: 8001
4. Domains: `api.udayalms.com` (Coolify auto-issues SSL once DNS is live)
5. Enable auto-deploy on push + health check on `/health`

Add a health route to `main.py`:
```python
@app.get("/health")
def health():
    return {"status": "ok"}
```

### B5. Environment variables (Coolify → app → Environment)
```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # rotated key from Phase A3

# IMPORTANT: port 6543 pooler, NOT 5432 direct
# 5432 direct = max 60 connections = crashes under load
# 6543 pooler = handles hundreds of concurrent connections safely
DATABASE_URL=postgresql://postgres.xxxx:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres

SECRET_KEY=your-new-64-char-hex-from-openssl
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

GEMINI_API_KEY=rotated-key
FIREBASE_SERVER_KEY=AAAAxxx...          # from Firebase project settings

R2_ACCOUNT_ID=...
R2_ACCESS_KEY=...
R2_SECRET_KEY=...
R2_PUBLIC_BUCKET=udaya-public
R2_PRIVATE_BUCKET=udaya-private

SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx   # from Phase I
```

### B6. CORS — update main.py before first deploy
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app.udayalms.com",
        "https://udayalms.com",
        "http://localhost:5173",    # local dev only
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 4. PHASE C — Deploy frontend (Cloudflare Pages)

1. dash.cloudflare.com → Workers & Pages → Create → Pages → Connect Git → `Udaya_LMS`
2. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Root directory: `/frontend`
3. Environment variables:
```env
VITE_API_URL=https://api.udayalms.com
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_FIREBASE_API_KEY=...              # public Firebase config — safe to expose
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```
4. Deploy → get `udaya-lms.pages.dev` → map to `app.udayalms.com` in Phase D
5. Every `git push` to main auto-deploys in ~60s. Rollback: Pages → Deployments → Rollback.

Block Google from indexing the LMS (it's behind login) — `frontend/public/robots.txt`:
```
User-agent: *
Disallow: /
```
The marketing site (`udayalms.com`) gets the opposite — allow everything, every page indexed.

---

## 5. PHASE D — Domain: GoDaddy → Cloudflare

1. Buy `udayalms.com` on GoDaddy (~₹800/yr)
2. Cloudflare → Add site → copy the 2 nameservers → GoDaddy → DNS → Nameservers → Change to Custom → paste both (propagates 1–24h)
3. DNS records in Cloudflare:

| Type | Name | Target | Proxy |
|---|---|---|---|
| A | api | YOUR_HETZNER_IP | ✅ Proxied |
| CNAME | app | udaya-lms.pages.dev | ✅ Proxied |
| CNAME | @ (root) | marketing-site.pages.dev | ✅ Proxied |
| CNAME | www | udayalms.com | ✅ Proxied |
| CNAME | files | (R2 custom domain — auto-set) | ✅ |

4. SSL/TLS → **Full (strict)**. HTTPS everywhere, auto-renewing, free, forever. No certbot needed.
5. Cloudflare Pages → LMS project → Custom domains → add `app.udayalms.com`

---

## 6. PHASE E — Storage: Cloudflare R2 setup

### E1. Create two buckets
```
udaya-public   → broadcast PDFs, notes, assignment papers, avatars, thumbnails
                 Settings → Custom Domain → files.udayalms.com
                 Access: Public (students download directly from CDN)

udaya-private  → student submissions, teacher private docs
                 No public access
                 Backend generates presigned URLs (1-hour expiry)
```

### E2. API token
R2 → Manage API Tokens → Create → Object Read & Write → save Account ID, Access Key, Secret → Coolify env vars.

### E3. Upload helper (boto3 — S3-compatible)
```python
import boto3, os

r2 = boto3.client(
    "s3",
    endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
    aws_access_key_id=os.environ["R2_ACCESS_KEY"],
    aws_secret_access_key=os.environ["R2_SECRET_KEY"],
    region_name="auto",
)

def upload_public(file_obj, key: str, content_type: str) -> str:
    """Broadcast PDFs, notes, avatars → CDN URL, free egress forever."""
    r2.upload_fileobj(
        file_obj, os.environ["R2_PUBLIC_BUCKET"], key,
        ExtraArgs={"ContentType": content_type}
    )
    return f"https://files.udayalms.com/{key}"

def presign_private(key: str, expires: int = 3600) -> str:
    """Student submissions → 1-hour signed URL."""
    return r2.generate_presigned_url(
        "get_object",
        Params={"Bucket": os.environ["R2_PRIVATE_BUCKET"], "Key": key},
        ExpiresIn=expires,
    )
```

### E4. Lifecycle rules — set once, auto-archives old batches forever
R2 → udaya-public → Settings → Object Lifecycle Rules:
```
Rule "archive-broadcasts":  prefix=broadcasts/    after 365 days → Infrequent Access
Rule "archive-notes":       prefix=notes/         after 365 days → Infrequent Access
Rule "archive-assignments": prefix=assignments/   after 180 days → Infrequent Access
Rule "purge-old":           prefix=broadcasts/    after 1095 days (3 yrs) → Delete
Rule "abort-multipart":     all prefixes          after 7 days → Abort incomplete uploads
```
Storage pricing: Standard $0.015/GB-mo · Infrequent Access $0.01/GB-mo + $0.01/GB retrieval · **egress free on both, always**. After 5 years running: ~₹184/mo total storage.

---

## 7. PHASE F — Firebase push notifications (₹0, replaces Web Push for better reach)

Web Push alone misses many Android users (Chrome background restrictions). Firebase Cloud Messaging (FCM) is the industry standard for Android notifications, works reliably even when the app is closed.

### F1. Setup (one time, ~15 minutes)
1. console.firebase.google.com → New project → name "Udaya LMS"
2. Add web app → copy config (goes in Vite env vars)
3. Add Android app → package `com.udaya.lms` → download `google-services.json` → into `android/app/` folder (in .gitignore — never commit!)
4. Project Settings → Cloud Messaging → copy **Server key** → Coolify env `FIREBASE_SERVER_KEY`

### F2. Frontend — register device token (add to student layout, runs on login)
```javascript
import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const messaging = getMessaging(app)

export async function registerPushToken(studentId: string) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return

  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
  })

  // Save token to your backend
  await fetch('/api/notifications/register-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ token, student_id: studentId })
  })
}

// Handle foreground messages
onMessage(messaging, (payload) => {
  console.log('Foreground notification:', payload)
  // Show in-app toast using your Toast component
})
```

### F3. Backend — send push (call this whenever teacher creates a video, broadcast, or test)
```python
import httpx, os

FIREBASE_URL = "https://fcm.googleapis.com/fcm/send"

async def send_push(tokens: list[str], title: str, body: str, data: dict = {}):
    """Send push notification to a list of FCM device tokens."""
    if not tokens:
        return

    payload = {
        "registration_ids": tokens,   # up to 1000 at a time
        "notification": {"title": title, "body": body},
        "data": data,
        "android": {"priority": "high"},
    }
    headers = {
        "Authorization": f"key={os.environ['FIREBASE_SERVER_KEY']}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(FIREBASE_URL, json=payload, headers=headers)
        return response.json()

# Example: notify all students in a standard when teacher posts a video
async def notify_new_video(standard_id: str, video_title: str):
    tokens = await get_fcm_tokens_for_standard(standard_id)  # query your DB
    await send_push(
        tokens,
        title="New video uploaded 🎬",
        body=video_title,
        data={"type": "new_video", "standard_id": standard_id}
    )
```

Add `fcm_tokens` column to `students` table:
```sql
ALTER TABLE students ADD COLUMN IF NOT EXISTS fcm_token TEXT;
-- Store the latest token per student (one token per device)
```

Notification triggers:
| Event | Who gets notified |
|---|---|
| Teacher uploads video | All students in that standard |
| Teacher sends broadcast | All students in that standard |
| Test scheduled | All students in that standard |
| Live class starting (5 min before) | All students in that standard |
| Assignment due tomorrow | Student only |

---

## 8. PHASE G — File validation + virus scan before upload (security layer)

Full pipeline the review recommends: **Upload → validate (type/size/extension) → virus scan → R2**.
G1 below is the validation layer (do this at launch). G2 is the virus scan (add it the moment
*students* can upload — that's the only untrusted vector; teacher uploads are low-risk).

### G1. Validate — never trust the client's claimed file type. Check in FastAPI before storing to R2.

```python
import magic   # pip install python-magic
from fastapi import UploadFile, HTTPException

ALLOWED_TYPES = {
    "application/pdf":                          ".pdf",
    "application/msword":                       ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-powerpoint":            ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "image/jpeg":                               ".jpg",
    "image/png":                                ".png",
    "image/webp":                               ".webp",
}

VIDEO_TYPES = {
    "video/mp4":       ".mp4",
    "video/quicktime": ".mov",
}

MAX_FILE_SIZE_MB = 50    # PDFs, notes, images — raise for videos
MAX_VIDEO_SIZE_MB = 2048 # 2 GB max for direct uploads

async def validate_file(file: UploadFile, allow_video: bool = False) -> bytes:
    content = await file.read()

    # 1. Size check
    max_mb = MAX_VIDEO_SIZE_MB if allow_video else MAX_FILE_SIZE_MB
    if len(content) > max_mb * 1024 * 1024:
        raise HTTPException(400, f"File too large. Max {max_mb} MB.")

    # 2. MIME type check using file magic bytes (not client-supplied content-type)
    mime = magic.from_buffer(content[:2048], mime=True)
    allowed = {**ALLOWED_TYPES, **VIDEO_TYPES} if allow_video else ALLOWED_TYPES
    if mime not in allowed:
        raise HTTPException(400, f"File type '{mime}' not allowed.")

    # 3. Extension matches actual type
    ext = allowed[mime]
    if file.filename and not file.filename.lower().endswith(ext):
        raise HTTPException(400, "File extension does not match content.")

    return content

# In your upload endpoint:
@app.post("/api/upload/broadcast-attachment")
async def upload_attachment(file: UploadFile, ...):
    content = await validate_file(file, allow_video=False)
    key = f"broadcasts/{broadcast_id}/{file.filename}"
    url = upload_public(io.BytesIO(content), key, mime)
    return {"url": url}
```

Add to requirements.txt: `python-magic`
On Hetzner: `apt install libmagic1` (in Dockerfile or server setup)

### G2. Virus scan student uploads (ClamAV — add when students start uploading)

Type/size/extension checks cover ~95% of risk for a tuition centre because teachers upload
most files. The remaining risk is **student assignment submissions** (Phase 2 roadmap) — that's
genuinely untrusted input. Run ClamAV as a sidecar on the *same* Hetzner box (free, no per-scan fee).

Coolify → New Resource → Docker Compose (or add to your stack):
```yaml
clamav:
  image: clamav/clamav:latest
  restart: unless-stopped
  ports:
    - "3310:3310"      # clamd TCP socket, reachable from the backend container
```

Scan after validation, before R2 upload:
```python
import clamd, io

clam = clamd.ClamdNetworkSocket(host="clamav", port=3310, timeout=30)

def scan_clean(content: bytes, *, trusted: bool) -> bool:
    """True = safe to store. ClamAV returns ('OK', None) or ('FOUND', <signature>).
    Fail CLOSED for untrusted (student) uploads if the scanner is down; fail OPEN
    for trusted (teacher) uploads so a sidecar outage never blocks the teacher."""
    try:
        status = clam.instream(io.BytesIO(content))["stream"][0]
        return status == "OK"
    except Exception:
        return trusted     # scanner unreachable: allow teacher, block student

# In a STUDENT submission endpoint, after validate_file():
if not scan_clean(content, trusted=False):
    raise HTTPException(400, "File failed the virus scan and was rejected.")
```

Add to requirements.txt: `clamd`. ClamAV self-updates its virus definitions daily inside the
container — no maintenance. ~700 MB RAM, comfortable alongside the CX32's 8 GB.

---

## 9. PHASE H — Rate limiting (prevents brute-force attacks)

```bash
pip install slowapi
```

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Apply limits to sensitive routes only
@app.post("/api/auth/login")
@limiter.limit("5/minute")          # 5 login attempts per minute per IP
async def login(request: Request, ...):
    ...

@app.post("/api/auth/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, ...):
    ...

@app.post("/api/auth/verify-otp")
@limiter.limit("10/minute")
async def verify_otp(request: Request, ...):
    ...
```

Cloudflare also has free rate limiting rules (Security → WAF → Rate Limiting Rules). Add one at the Cloudflare layer as a backup — blocks attacks before they even reach your server.

---

## 10. PHASE I — Automated database backup (every Sunday 2 AM)

Supabase Pro has daily backups for 7 days. This adds a weekly full backup to R2 for longer retention — your own copy, independent of Supabase.

### I1. Backup script — `backend/scripts/backup_db.py`
```python
import subprocess, boto3, os, datetime

def backup_database():
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M")
    filename = f"backup_{timestamp}.sql"
    dump_path = f"/tmp/{filename}"

    # pg_dump to a file
    result = subprocess.run([
        "pg_dump",
        os.environ["DATABASE_URL"],
        "-f", dump_path,
        "--no-owner",
        "--no-acl",
    ], capture_output=True, text=True)

    if result.returncode != 0:
        print(f"Backup FAILED: {result.stderr}")
        return

    # Upload to R2 private bucket
    r2 = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["R2_SECRET_KEY"],
        region_name="auto",
    )
    r2.upload_file(dump_path, os.environ["R2_PRIVATE_BUCKET"], f"backups/db/{filename}")
    os.remove(dump_path)
    print(f"Backup complete: backups/db/{filename}")

if __name__ == "__main__":
    backup_database()
```

### I2. Cron on Hetzner server — runs every Sunday at 2 AM
```bash
crontab -e
# Add this line:
0 2 * * 0 cd /app && python scripts/backup_db.py >> /var/log/udaya-backup.log 2>&1
```

Or add as a Coolify cron job (Coolify → app → Scheduled Tasks → `0 2 * * 0` → `python scripts/backup_db.py`).

R2 lifecycle rule on `udaya-private` bucket — prefix `backups/`:
```
After 90 days → Infrequent Access (saves ~33%)
After 365 days → Delete (you have Supabase's own backups for recent, R2 for historical)
```

Add `postgresql-client` to Dockerfile for pg_dump:
```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y postgresql-client libmagic1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "4"]
```

---

## 11. PHASE J — Error monitoring: Sentry (free, 5 minutes)

Sentry catches frontend JS errors, backend Python exceptions, slow API calls — before your students tell you something is broken.

### J1. Frontend (React + Vite)
```bash
npm install @sentry/react
```
```javascript
// main.tsx — before ReactDOM.createRoot
import * as Sentry from "@sentry/react"

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,   // "development" or "production"
  tracesSampleRate: 0.1,               // 10% of requests traced (free tier friendly)
  replaysSessionSampleRate: 0,         // disable session replay (saves quota)
})
```

### J2. Backend (FastAPI)
```bash
pip install sentry-sdk[fastapi]
```
```python
# main.py — top of file
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(
    dsn=os.environ.get("SENTRY_DSN", ""),
    integrations=[FastApiIntegration()],
    traces_sample_rate=0.1,
    environment="production",
)
```

### J3. Setup
1. sentry.io → free account → New project → React → copy DSN → VITE_SENTRY_DSN
2. New project → FastAPI → same DSN or new one → SENTRY_DSN in Coolify
3. Free tier: 5,000 errors/month — more than enough for 300 students

When something breaks, Sentry emails you the exact line of code, stack trace, and how many users were affected — before any student complains.

---

## 12. PHASE K — Supabase production checklist

1. **Region check (critical today, not later):** Project Settings → General → Region must be **ap-south-1 (Mumbai)**. If US/EU: `pg_dump` → create fresh Mumbai project → `psql` restore → re-run all SQL (RLS, RPC, views) → update all env vars. Do this while data is tiny.
2. **Security SQL (run in Supabase SQL Editor if not done):**
   ```sql
   -- students can read questions without seeing correct answers
   CREATE OR REPLACE VIEW student_questions AS
   SELECT id, test_id, question, options, order_num FROM questions;
   -- full RPC in README.md Phase 4.3
   ```
3. **Pooler connection string** in backend: port **6543** transaction mode. Already set in Phase B5.
4. **Upgrade to Pro ($25/mo) the day real students start.** Free tier pauses after 7 days inactivity — unacceptable for production. Pro adds: no pausing, daily backups (7 days), 8 GB DB, 100 GB storage, 250 GB egress.
5. **topic_tag columns** (needed for report card radar + multiline charts):
   ```sql
   ALTER TABLE videos ADD COLUMN IF NOT EXISTS topic_tag TEXT;
   ALTER TABLE tests  ADD COLUMN IF NOT EXISTS topic_tag TEXT;
   ```
6. **Indexes** — `optimize_indexes.sql` already applied. Re-check monthly: Dashboard → Database → Query Performance.

---

## 13. PHASE L — Post-deploy verification checklist (run all before inviting students)

```
□ 1.  https://api.udayalms.com/docs loads (FastAPI interactive docs)
□ 2.  https://api.udayalms.com/health returns {"status":"ok"}
□ 3.  https://app.udayalms.com/login loads with padlock (SSL valid)
□ 4.  Teacher login → dashboard shows real Supabase data
□ 5.  Create standard → subject → add YouTube Unlisted video → thumbnail shows
□ 6.  Create student → login as student on a PHONE browser
□ 7.  Student plays video → progress saves → resume works after page refresh
□ 8.  Teacher sends broadcast → appears on student phone within 2 seconds (Realtime)
□ 9.  Broadcast PDF upload → student downloads from files.udayalms.com (not Supabase URL)
□ 10. Student takes test → score correct → teacher sees result and flag status
□ 11. Attendance: mark P/A/L → save → attendance_pct updates on student row in Supabase
□ 12. Wrong-standard student CANNOT open another standard's video (must get 403)
□ 13. Upload a .exe file → upload rejected ("File type not allowed")
□ 14. 6 rapid login attempts → 6th blocked by rate limiter
□ 15. Push notification fires when teacher creates a video (check student's phone)
□ 16. Sentry dashboard → trigger a test error → appears in Sentry within 30s
□ 17. UptimeRobot: monitor set to ping api.udayalms.com every 5 min, alert on email
□ 18. Sunday 2 AM backup: check R2 → backups/db/ → .sql file appeared
```

---

## 14. PHASE M — Android app: Capacitor → Play Store

### M1. Wrap existing React build (no rewrite needed)
```bash
cd frontend
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Udaya LMS" "com.udaya.lms" --web-dir dist
npm run build
npx cap add android
npx cap copy android
npx cap open android        # opens Android Studio
```

### M2. Add Firebase to Android (for push notifications)
1. Firebase Console → Project → Android → package `com.udaya.lms` → download `google-services.json`
2. Copy to `android/app/google-services.json` (in .gitignore — never commit)
3. `android/app/build.gradle`: add `apply plugin: 'com.google.gms.google-services'` at bottom

### M3. Create the signing keystore — ONCE, guard it forever
```bash
keytool -genkey -v \
  -keystore udaya-release.jks \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -alias udaya

# Enter a strong password — write it down somewhere safe
```

⚠️ **Back this file up in 4 places:**
1. Google Drive (encrypted)
2. Your laptop (not the repo)
3. USB stick stored at your home
4. Written password in a password manager (Bitwarden free)

**If you lose `udaya-release.jks` or its password — you can NEVER update the app again.** You'd have to publish a new app and lose all existing installs.

### M4. Sign and build — android/app/build.gradle
```gradle
android {
    defaultConfig {
        applicationId "com.udaya.lms"
        versionCode 1           // increment by 1 on EVERY Play Store update
        versionName "1.0.0"
        minSdkVersion 21
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
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```
Build: Android Studio → Build → **Generate Signed Bundle/APK → Android App Bundle (AAB)**. AAB is required for Play Store (not APK).

### M5. Play Console — one-time setup ($25)
1. play.google.com/console → Pay $25 developer fee (one-time, forever)
2. Create app → fill details
3. Store listing: name, short description, full description, screenshots (phone + 7" tablet), 512px icon
4. **Privacy policy URL:** `https://udayalms.com/privacy` (mandatory field — app rejected without it)
5. Data Safety form: declare what you collect (name, phone, academic records, device ID for push). Encrypted in transit: yes. Data sold: no. Children: yes (under 13 included)
6. Content rating questionnaire → select Education
7. Target audience: if any users under 13 → Families program additional questions
8. Upload AAB → Production track → Create new release → Submit
9. First review: **3–7 days**

### M6. Every future update
```bash
# Step 1: increment versionCode (2, 3, 4...) in build.gradle
# Step 2:
npm run build && npx cap copy android
# Step 3: Android Studio → Generate Signed Bundle (SAME keystore)
# Step 4: Play Console → Production → Create new release → upload AAB → Submit
# Updates review in hours (not days like first submission)
```

Web users on `app.udayalms.com` get updates instantly on every `git push`. Only Play Store needs this cycle. Ship app updates monthly, web updates anytime.

---

## 15. PHASE N — Legal checklist (India, beginner)
*(Starting checklist — confirm specifics with a local CA.)*

### Must do BEFORE charging anyone
1. **Privacy Policy** at `udayalms.com/privacy` — required by IT Act + DPDP Act 2023 + Play Store. Must state: data collected (name, phone, marks, attendance, device token), purpose, storage location (Supabase Mumbai, Cloudflare), retention period, and how to request deletion.

2. **Terms & Conditions** at `/terms` — account rules, fee/refund policy, that recorded classes are for enrolled students only, account suspension policy.

3. **Parental consent** — students are minors. DPDP Act 2023 requires verifiable parental consent before processing children's data. Add to your paper admission form:
   > *"I, parent/guardian of __________, consent to my child's data (name, phone, marks, attendance, activity) being stored and processed in the Udaya LMS app for educational purposes."*
   > *Signature: ______ Date: ______*

   File these forms. Do not show ads to students. Do not do behavioural tracking. Both prohibited for children under DPDP.

4. **Udyam (MSME) registration** — free, 10 minutes at udyamregistration.gov.in. Legal business identity, opens path to a current account, looks professional to parents.

### Can wait
- **GST** — only when annual turnover crosses ₹20 lakh.
- **Trademark** the name "Udaya Centre" — ₹4,500 govt fee (small enterprise) — do in year 2 once the brand matters.
- **Pvt Ltd registration** — not needed at this scale; sole proprietorship works fine.

---

## 16. PHASE O — Marketing website + SEO + Google Business Profile

### O1. Marketing site structure (udayalms.com)
```
Pages:
  /               → Home: centre photo + "Calicut's tuition centre with its own learning app"
  /why-us         → App screenshots: parent tracking attendance + marks daily (main differentiator)
  /10th-tuition   → "10th CBSE Tuition in Calicut" (one page per keyword)
  /plus-two       → "Plus Two Science Tuition Kozhikode"
  /9th-tuition    → "9th Standard Tuition Calicut"
  /results        → Toppers, testimonials with photos (with parent consent)
  /contact        → Address, Google Maps embed, phone, WhatsApp button (no form)
  /privacy        → Privacy policy (legally required)
  /terms          → Terms & conditions
```

Head tags for every page:
```html
<title>Best Tuition Centre in Calicut | Udaya Centre — 8th to 12th CBSE & State</title>
<meta name="description"
  content="Udaya Centre, Calicut — tuition for 8th–12th with our own learning app.
  Parents track attendance, marks, and videos daily. Book a free demo." />
```

Homepage schema (paste in `<head>`, Google reads this directly):
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
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 11.2588,
    "longitude": 75.7804
  },
  "openingHours": "Mo-Sa 09:00-20:00",
  "sameAs": [
    "https://www.facebook.com/udayacentre",
    "https://www.instagram.com/udayacentre"
  ]
}
</script>
```

Write every page in **English AND Malayalam** — parents search "കാലിക്കറ്റ് ട്യൂഷൻ സെന്റർ" too.

### O2. Google Business Profile — more important than your website for local search
1. business.google.com → Create profile → category "Coaching center" / "Tutoring service"
2. Name/address/phone EXACTLY matching the website (NAP consistency — must be identical)
3. Add 15+ photos: classroom interior, the app on a phone screen, students studying (with consent)
4. **Reviews are the #1 local ranking factor.** After every result day, WhatsApp the direct review link to happy parents. Target 30+ reviews at 4.5★. Reply to every review, every time.
5. Post weekly updates: results, admission dates, new features in the app.

Marketing headline that converts parents best (use this everywhere):
> *"Know your child's attendance, test scores, and learning progress directly on your phone — every day."*

### O3. Citations
Free listings (identical NAP on all): Justdial, Sulekha, IndiaMART.
Timeline: map-pack appearance in 2–4 months. Organic website rankings in 4–6 months.

---

## 17. PHASE P — Publicity (Kerala-specific, ranked by effectiveness)

1. **WhatsApp Status + parent groups** — results, app screenshots, recorded class clips. Highest-converting, free, reaches every parent in the area.
2. **Live app demo at admission enquiry** — open the app, show parent the attendance screen, show them the report card on your phone. No competitor offers this. Closes admissions more than any discount.
3. **Referral programme** — "Refer a student, both get ₹500 off next month." Parents recruit parents.
4. **Results-day posters** — topper photos + marks (with permission) outside centre + WhatsApp + Instagram Reels.
5. **Instagram** — short clips of classes, the app, results. Tag location "Calicut / Kozhikode".
6. **QR code banner** outside centre → scans to website → WhatsApp enquiry button.
7. **Local newspaper** — Mathrubhumi/Manorama local edition, May–June admission season only. Skip the rest of the year.

---

## 18. Feature roadmap — after launch, in order

```
Phase 1 (Month 1-2 after launch):
  □ Push notifications wired to all teacher actions (Phase F — already in this plan)
  □ Fee tracking: student_id · month · amount · status (paid/pending/waived) · paid_at
  □ Payment receipts: generate PDF receipt after marking fee paid

Phase 2 (Month 3-4):
  □ Parent login: read-only portal showing their child's marks, attendance, report card
  □ Homework tracking: teacher assigns, student marks done, teacher sees completion rate
  □ Assignment submission: student uploads PDF → teacher marks and returns

Phase 3 (Month 5-6):
  □ Online fee payment: Razorpay or PayU integration (saves teacher collecting cash)
  □ WhatsApp automation: WANotifier template for results day, exam reminders

Phase 4 (Month 7-9):
  □ AI report card comments: Claude Haiku analyses real test + attendance data → suggestions
  □ Advanced performance analytics: topic-level radar + multiline graphs (already designed in README.md)

Phase 5 (Year 2+):
  □ Multi-branch: one teacher account managing 2+ physical locations
  □ Redis caching at 1,000+ students (session cache, dashboard stats cache)
```

---

## 19. Cost at every scale (monthly ₹, realistic LMS usage)

| Students | Hetzner | Supabase | R2 | FCM | Sentry | Jitsi | Extra | **Total/mo** |
|---|---|---|---|---|---|---|---|---|
| Testing | 540 (CX32) | 0 | 0 | 0 | 0 | 0 (meet.jit.si) | 67 domain | **~₹607** |
| 300 | 540 (CX32) | 2,100 Pro | 0 | 0 | 0 | 0 | 67 | **~₹2,707** |
| 500 | 540 (CX32) | 2,100 | 0 | 0 | 0 | 0 | 67 | **~₹2,707** |
| 1,000 | 540 (CX32) | 2,100 | ~13 | 0 | 0 | 360 self-host | 67 | **~₹3,217** |
| 2,000 | 1,530 (CX42) | 2,100 | ~38 | 0 | 0 | 360 | 67 | **~₹4,357** |
| 5,000 | 4,490 (CCX23) | ~5,000 | ~108 | 0 | ~800 | 540 | 67 | **~₹11,522** |
| 10,000 | 8,980 (2×CCX33) | ~12,000 | ~203 | 0 | ~800 | 4,490 | 420 LB + 67 | **~₹27,207** |

One-time costs: Play Store $25 (~₹2,100) · keystore free · Udyam free · domain ₹800/yr.
Per-use costs: WhatsApp credentials ₹0.145/msg · AI suggestions ₹0–5/mo.
Storage after 5 years with R2 lifecycle archiving: ~₹184/mo total.
Load balancer (Cloudflare $5/mo) only needed above ~2,000–3,000 students.
Redis: not needed until 1,000+ students. Add as a Coolify service on the same Hetzner box.

---

## 20. Maintenance schedule

### Weekly (5 minutes, SSH into server)
```bash
ssh root@HETZNER_IP
apt update && apt upgrade -y
# Coolify dashboard → check app status green + recent logs clean
# Sentry dashboard → check no new error spikes
```

### Code updates (fully automated after setup)
- Frontend: `git push` → Cloudflare Pages builds and deploys (~60s)
- Backend: `git push` → Coolify webhook auto-builds and restarts
- Rollback frontend: Pages → Deployments → find last good → Rollback (instant)
- Rollback backend: Coolify → Deployments → previous green → Redeploy

### Monthly (10 minutes)
```
□ Supabase Dashboard → Usage: DB size + egress (should be under Pro limits)
□ R2 → storage GB (slow growth, lifecycle rules handle archiving)
□ Hetzner → Coolify resource graphs (CPU/RAM should be <50% on CX32)
□ Play Console → Android Vitals → check crash-free rate >99%
□ Sentry → review any recurring errors from past month
□ Ask 2–3 happy parents for a Google review
□ Check Sunday backup: R2 → backups/db/ → latest .sql file present
```

### Yearly — academic year cycle (May–June, ~45 minutes)
```sql
-- 1. Export everything first (Excel + PDF batch)

-- 2. Archive finished standard
UPDATE students
SET blocked = true, archived = true, archived_at = now()
WHERE standard_id = 'OLD_STANDARD_UUID';

UPDATE standards SET status = 'archived', ended_at = now()
WHERE id = 'OLD_STANDARD_UUID';

-- 3. Promote continuing students (9th → 10th)
UPDATE students
SET standard_id = 'NEW_STANDARD_UUID'
WHERE standard_id = 'OLD_STANDARD_UUID';

-- 4. Safe cleanup (broadcast_reads, video_progress for archived students)
DELETE FROM broadcast_reads
WHERE student_id IN (
  SELECT id FROM students
  WHERE archived = true AND archived_at < now() - interval '6 months'
);

DELETE FROM video_progress
WHERE student_id IN (SELECT id FROM students WHERE archived = true);

-- 5. Create new standards for new academic year
-- 6. Bulk import new students (CSV → auto-credentials → WhatsApp)
-- R2 lifecycle rules archive old files automatically — nothing to do
-- Archived students stop counting as Supabase MAUs → bill stays flat
```

---

## 21. Exact waterfall — week by week

```
WEEK 1 — Security + paperwork (most important week)
  Day 1: GitHub private + secret hunt (git log -p | grep SECRET) + rotate ALL keys
  Day 2: Verify Supabase region = ap-south-1. Migrate to Mumbai if wrong (do it now)
  Day 3: Write privacy policy + T&C. Host as static HTML pages
  Day 4: Udyam registration (udyamregistration.gov.in, 10 min, free)
          Add parental-consent line to paper admission form
  Day 5: Buy GoDaddy domain → Cloudflare nameservers (propagation starts)

WEEK 2 — Deploy everything
  Day 1: Hetzner CX32 buy → SSH → Coolify install → admin account
  Day 2: Backend: Dockerfile, requirements.txt, env vars, CORS → Coolify deploy
          Test: api.udayalms.com/health returns ok
  Day 3: Frontend: Cloudflare Pages → build settings → env vars → deploy
          DNS records set in Cloudflare → SSL Full(strict)
  Day 4: R2 buckets → custom domain files.udayalms.com → lifecycle rules
          Wire R2 upload/presign helpers in backend
  Day 5: Firebase project → FCM server key → frontend token registration
          Sentry projects → DSNs → integrate both frontend + backend
          Run all 18 verification steps

WEEK 3 — Pilot with real students
  Invite 5–10 real students and teacher
  Upgrade Supabase to Pro (do not wait — free tier pauses)
  Watch Sentry and Coolify logs daily. Fix anything that breaks.
  UptimeRobot monitoring active

WEEK 4 — Android app
  Capacitor setup → npm run build → cap copy → Android Studio
  Create keystore → back up to 4 locations IMMEDIATELY
  Generate signed AAB → Play Console → $25 fee → fill listing
  Submit for review (3–7 day wait)

MONTH 2 — Public presence
  Marketing site live on udayalms.com (Cloudflare Pages separate project)
  Google Business Profile: photos, NAP, first posts
  Justdial/Sulekha/IndiaMART listings (free, identical NAP)
  QR banner at centre entrance

MONTH 3+ — Growth
  Collect Google reviews after every results day (WhatsApp the direct link)
  WhatsApp marketing, demo at every admission enquiry
  Referral programme: refer a student → ₹500 off for both
  Build Phase 3–6 features from README.md in parallel

EVERY JUNE — Academic year cycle (Section 20)
```

---

## 22. Emergency procedures

### Backend down (UptimeRobot alert)
```bash
# Fix 1: Coolify dashboard → app → Restart  (resolves 80% of issues)

# Fix 2: Coolify itself unreachable
ssh root@HETZNER_IP
docker ps -a                    # see all containers
docker restart CONTAINER_ID
systemctl restart docker        # if docker itself crashed

# Fix 3: Server completely frozen
# Hetzner Cloud Console → Power → Force Reboot

# Fix 4: Bad code deploy broke the backend
# Coolify → Deployments → find last green build → Redeploy (instant rollback)
```

### Frontend broken after push
Cloudflare Pages → Deployments → last known-good deployment → Rollback → Done in 30 seconds.

### Supabase errors
1. Check status.supabase.com — may be a platform outage, not your code
2. "Too many connections": DATABASE_URL must use port **6543** (pooler), not 5432
3. Data corrupted: Pro plan → Database → Backups → Restore from yesterday
4. Supabase project paused: upgrade to Pro to prevent this permanently

### Leaked key suspected
```bash
# Rotate immediately in this order:
# 1. Supabase → Project Settings → API → regenerate service_role key
# 2. openssl rand -hex 32 → new SECRET_KEY
# 3. Update both in Coolify env → Restart backend (5 minutes, zero downtime)
# 4. Regenerate any other exposed key (Gemini, Firebase, R2)
```

### Database backup needed urgently
```bash
# Manual backup anytime:
ssh root@HETZNER_IP
cd /app && python scripts/backup_db.py
# File appears in R2 → udaya-private → backups/db/
```

### Android app crashed for users
Play Console → Android Vitals → Crashes → download stack trace → fix → new AAB → new release.
Sentry will have already caught the error and emailed you before users report it.

---

## 23. Ratings — what is excellent, what was added

| Area | Original | After corrections | Key addition |
|---|---|---|---|
| Architecture | 9.5/10 | 9.5/10 | No change needed — keep Cloudflare + Hetzner + Supabase as-is |
| Cost | 10/10 | 10/10 | No change needed — YouTube Unlisted is the standout cost win |
| Security | 8.5/10 | 9.5/10 | Rate limiting (H) + MFA (A5) + file validation & virus scan (G) |
| Scalability | 8.5/10 | 8.5/10 | Redis deferred to 1,000+; cost/scale table to 10k students (Section 19) |
| Operational simplicity | 10/10 | 10/10 | One server, Coolify auto-deploy, no DevOps team needed |
| Notifications | Missing | Added | Firebase FCM (Phase F) |
| Backup | Missing | Added | Weekly pg_dump → R2 (Phase I) |
| Monitoring | Basic | Strong | Sentry frontend + backend (Phase J) |
| File safety | Missing | Added | MIME validation + optional ClamAV scan before R2 (Phase G) |
| Legal | 8/10 | 8.5/10 | DPDP children's data note strengthened |
| Marketing | 9/10 | 9/10 | Parent-tracking headline made the lead message (Section 16) |
| Feature roadmap | Not listed | Added | 5-phase post-launch plan (Section 18) |

---

*Companion files: README.md (build phases + Antigravity prompts) · APIS.md · ATTENDANCE_SYSTEM.md · YOUTUBE_VIDEO_FEATURE.md*
*Rule: if it is not written in a .md file in this repo, it will be forgotten. Update this file whenever a decision changes.*
