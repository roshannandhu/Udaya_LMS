# LAUNCH_PLAN.md — Udaya LMS
> Version 2.1 — **DECISION CHANGED: stay on MANAGED Supabase (Pro); move only the FastAPI backend
>   to Hetzner CX33 + Coolify.** The self-hosted PostgreSQL / PgBouncer / Redis-for-DB /
>   self-hosted-Supabase / self-hosted-Jitsi sections further below are **SUPERSEDED — do NOT
>   implement them.** Trust the "Locked decisions" block immediately below for what actually applies.
> Stack: React+Vite (Cloudflare Pages) · FastAPI (Hetzner CX33 + Coolify) · MANAGED Supabase
>        (Postgres + Auth + Storage + Realtime · Mumbai · Pro) · GoDaddy · Firebase FCM · Sentry
> Keep this file in repo root. Reference in every Antigravity/Claude session.

---

## 0. Full architecture — how everything connects

```
Student / Teacher / Parent phone
          ↓
GoDaddy domain (udayalms.com)
  → nameservers point to Cloudflare
          ↓
CLOUDFLARE (DNS + free SSL + CDN + DDoS — front of everything)
  ├── udayalms.com        → Marketing site     (Cloudflare Pages · Google indexes)
  ├── app.udayalms.com    → LMS frontend        (Cloudflare Pages · login wall · NOT indexed)
  ├── api.udayalms.com    → FastAPI backend     (Hetzner CX33 · Coolify · Docker)
  └── files.udayalms.com  → Public files        (Cloudflare R2 · zero egress · CDN)
                                    ↓
                    ┌───── Hetzner CX33 (one server, all services) ─────┐
                    │                                                     │
                    │  FastAPI (port 8001)   ←→  PostgreSQL (port 5432)  │
                    │       ↓                      ↑                      │
                    │  PgBouncer (port 6432)  ←── connection pooler       │
                    │       ↓                                             │
                    │  Redis (port 6379)  ← sessions, cache, FCM queue   │
                    │       ↓                                             │
                    │  Jitsi Meet (self-hosted, port 8443)               │
                    │       ↓                                             │
                    │  Backup cron → pg_dump → R2 (every Sunday 2AM)    │
                    └─────────────────────────────────────────────────────┘
                                    ↓
                    Cloudflare R2  ←→  Firebase FCM  ←→  Sentry
                    (files+backups)     (push alerts)      (error tracking)
```

### What each piece does

| Service | What it does | Cost/month |
|---|---|---|
| GoDaddy domain | Buy `udayalms.com`, then point to Cloudflare and forget | ₹67 (₹800/yr) |
| Cloudflare | DNS + SSL (free auto) + CDN + DDoS + proxy for all subdomains | ₹0 |
| Cloudflare Pages | Hosts React+Vite frontend, auto-deploys on git push | ₹0 |
| Hetzner CX33 | Your main server — backend + DB + Jitsi + Redis all on one box | ~₹900 (€9.99) |
| PostgreSQL 16 | Self-hosted DB on CX33. You own your data, no per-row billing | ₹0 (on server) |
| PgBouncer | Connection pooler in front of Postgres. Prevents connection overload | ₹0 (on server) |
| Redis | Session cache, FCM notification queue, dashboard cache | ₹0 (on server) |
| Coolify | Free self-hosted deployment dashboard on same CX33. GitHub auto-deploy | ₹0 |
| Cloudflare R2 | Public files (PDFs, avatars) + DB backups. Zero egress fees | ₹0 (10GB free) |
| Jitsi Meet | Self-hosted live classes on same CX33 | ₹0 |
| Firebase FCM | Push notifications to students (new video, broadcast, test) | ₹0 |
| Sentry | Error tracking: frontend crashes + backend exceptions | ₹0 (free tier) |
| UptimeRobot | Pings api.udayalms.com every 5 min, alerts if down | ₹0 |
| YouTube Unlisted | Video hosting, infinite bandwidth, zero cost | ₹0 |
| WANotifier | WhatsApp credential delivery — ₹0.145/student msg | ~₹4–50 |
| Gemini / Claude Haiku | AI report suggestions | ~₹0–5 |
| **Total at 300 students** | | **~₹970/month** |
| **Total at launch/testing** | | **~₹970/month** |

> Why CX33 over CX22? CX33 (4 vCPU, 8GB RAM) at €9.99 runs PostgreSQL + FastAPI + Redis + Jitsi + Coolify safely on one box. CX22 (2 vCPU, 4GB) runs out of RAM when PostgreSQL + Jitsi run together. CX33 is the minimum for full self-hosted.

---

## 1. Locked decisions — do not re-debate these

- **Database / Auth / Storage / Realtime** — **MANAGED Supabase** (Mumbai), upgraded to **Pro** when real students start. Keep Supabase Auth, Storage, and Realtime exactly as the app uses them today; the ~721 existing `supabase.*` calls stay unchanged. Scale by bumping Supabase compute, never by self-hosting.
- **Backend host** — FastAPI runs on **Hetzner CX33 + Coolify** (Docker), talking to managed Supabase over the network (~40 ms CX33-Singapore ↔ Supabase-Mumbai). **No** self-hosted Postgres / PgBouncer / Redis-for-DB.
- **Videos** — YouTube Unlisted. `youtube_video_id` NEVER sent to client. Only via `/api/video/{id}/token` after verifying student standard_id.
- **Live classes** — Jitsi Meet via **meet.jit.si** (do NOT self-host Jitsi on the CX33 — too heavy for one box). MediaRecorder for local recording. Teacher uploads to YouTube Unlisted after class.
- **Test scoring** — PostgreSQL function `submit_test_attempt` (SECURITY DEFINER). Students read from `student_questions` view (no `correct_idx`).
- **Storage** — **Supabase Storage** (current `videos`/`avatars`/`broadcasts` buckets), included in Pro. Cloudflare R2 is optional/deferred — move public files there only if egress ever grows.
- **Push notifications** — Firebase Cloud Messaging (FCM). Free, works on Android + iOS.
- **Credentials delivery** — manual Excel now → WANotifier WhatsApp API at launch.
- **Android** — Capacitor wraps React build. iOS deferred.
- **File validation** — MIME type + size + extension checked in FastAPI before any upload reaches R2.
- **Rate limiting** — slowapi on FastAPI for login/OTP routes.
- **MFA** — TOTP (Google Authenticator) for teacher/admin only. Not students.

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
```
PostgreSQL root password   → change in Phase B4
FastAPI SECRET_KEY         → openssl rand -hex 32
Gemini API key             → Google AI Studio → regenerate
Firebase server key        → Firebase Console → Project Settings → regenerate
Any other API key          → regenerate in its dashboard
```
Paste new values into Coolify env only — never in code.

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

## 3. PHASE B — Hetzner CX33 server setup

### B1. Buy the server
```
hetzner.com → Cloud → New Server
Location: Singapore (closest to India)
Image:    Ubuntu 24.04 LTS
Type:     CX33 (4 vCPU · 8 GB RAM · 80 GB SSD · €9.99/mo ≈ ₹900)
SSH key:  add your public key at creation
```

### B2. Initial server hardening
```bash
ssh root@YOUR_CX33_IP

# Update everything
apt update && apt upgrade -y

# Create non-root user
adduser udaya
usermod -aG sudo udaya

# Disable root SSH login
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd

# Basic firewall
ufw allow 22      # SSH
ufw allow 80      # HTTP (Cloudflare → Coolify → backend)
ufw allow 443     # HTTPS
ufw allow 8000    # Coolify dashboard (restrict to your IP only in production)
ufw allow 8443    # Jitsi Meet
ufw allow 3478    # Jitsi STUN/TURN
ufw enable
```

### B3. Install Coolify (your free deploy dashboard)
```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
# Visit http://YOUR_CX33_IP:8000
# Create admin account → this is how you deploy everything without SSH commands
```
Coolify runs as Docker containers. It manages: FastAPI backend, PgBouncer, Redis, Jitsi — all from one dashboard.

### B4. Install PostgreSQL 16
```bash
# Install
apt install -y postgresql-16 postgresql-contrib-16

# Secure it immediately
sudo -u postgres psql

-- Inside psql:
ALTER USER postgres PASSWORD 'STRONG_PASSWORD_HERE_64_CHARS';
CREATE DATABASE udaya_lms;
CREATE USER udaya_app WITH ENCRYPTED PASSWORD 'APP_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE udaya_lms TO udaya_app;
\q

# Configure PostgreSQL to listen on localhost only (not public internet)
# /etc/postgresql/16/main/postgresql.conf:
listen_addresses = 'localhost'

# /etc/postgresql/16/main/pg_hba.conf — allow local connections:
local   all   all   md5
host    all   all   127.0.0.1/32   md5

systemctl restart postgresql
```

Your `DATABASE_URL` in backend will be:
```
postgresql://udaya_app:APP_PASSWORD@127.0.0.1:6432/udaya_lms
```
Port **6432** = PgBouncer (not 5432 direct). Never connect FastAPI directly to Postgres.

### B5. Install PgBouncer (connection pooler — critical)
```bash
apt install -y pgbouncer

# /etc/pgbouncer/pgbouncer.ini:
[databases]
udaya_lms = host=127.0.0.1 port=5432 dbname=udaya_lms

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction        # transaction mode: safest for FastAPI async
max_client_conn = 200          # max connections from FastAPI workers
default_pool_size = 20         # actual connections to Postgres
min_pool_size = 5
reserve_pool_size = 5
server_idle_timeout = 600

# /etc/pgbouncer/userlist.txt:
"udaya_app" "md5HASH_OF_PASSWORD"

systemctl enable pgbouncer && systemctl start pgbouncer
```
Why this matters: FastAPI with 4 workers each keeping 5 connections = 20 connections. Without PgBouncer, 100 concurrent requests = 100 Postgres connections = server crash. PgBouncer pools them to 20 real connections safely.

### B6. Install Redis (cache + notification queue)
```bash
apt install -y redis-server

# /etc/redis/redis.conf:
bind 127.0.0.1       # localhost only, never public
maxmemory 512mb
maxmemory-policy allkeys-lru

systemctl enable redis && systemctl start redis
```
Use Redis for: OTP cache (5-min TTL), session tokens, dashboard query cache (30-sec TTL), FCM notification job queue.

### B7. Run schema and RPC SQL
```bash
psql -U udaya_app -d udaya_lms -h 127.0.0.1 -f backend/schema.sql
psql -U udaya_app -d udaya_lms -h 127.0.0.1 -f backend/optimize_indexes.sql

# Critical security SQL — run these BEFORE any students use the app:
# 1. student_questions view (strips correct_idx — students never see answers)
psql -U udaya_app -d udaya_lms -h 127.0.0.1 << 'SQL'
CREATE OR REPLACE VIEW student_questions AS
SELECT id, test_id, question, options, order_num FROM questions;
SQL

# 2. submit_test_attempt function (server-side scoring — correct_idx stays server-only)
# Full SQL is in README.md Phase 4 Step 4.3
```

---

## 4. PHASE C — Deploy FastAPI backend via Coolify

### C1. Dockerfile for backend/
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "4"]
```

### C2. Health check endpoint in main.py
```python
@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
```

### C3. CORS — update before first deploy
```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app.udayalms.com",
        "https://udayalms.com",
        "http://localhost:5173",   # local dev only
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### C4. Coolify deploy steps
```
Coolify → Sources → Connect GitHub App → authorize Udaya_LMS (private repo)
New Project → Add Resource → Application
  Base directory: /backend
  Build pack: Dockerfile
  Port: 8001
  Domain: api.udayalms.com
  Health check: /health
  Auto-deploy on push: ON
```

### C5. Environment variables in Coolify
```env
# Database — PgBouncer pooler, NOT direct Postgres
DATABASE_URL=postgresql://udaya_app:APP_PASSWORD@127.0.0.1:6432/udaya_lms

# Auth
SECRET_KEY=64-char-hex-from-openssl-rand
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# Redis
REDIS_URL=redis://127.0.0.1:6379/0

# AI
GEMINI_API_KEY=your-key

# Firebase FCM
FIREBASE_SERVER_KEY=AAAAxxx...

# Cloudflare R2
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY=your-access-key
R2_SECRET_KEY=your-secret-key
R2_PUBLIC_BUCKET=udaya-public
R2_PRIVATE_BUCKET=udaya-private
R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com

# Sentry
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# YouTube
YOUTUBE_API_KEY=your-data-api-key
```

---

## 5. PHASE D — Auth: FastAPI + JWT (replaces Supabase Auth)

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

# In-memory connection store (fine for single-server deployment)
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

## 12. PHASE K — Jitsi Meet self-hosted on same CX33

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
  A      @          YOUR_CX33_IP           → marketing site (Coolify)
  A      api        YOUR_CX33_IP           → FastAPI backend (Coolify)
  A      meet       YOUR_CX33_IP           → Jitsi Meet
  CNAME  app        udaya-lms.pages.dev    → LMS frontend (Cloudflare Pages)
  CNAME  www        udayalms.com           → redirect to root
  CNAME  files      (auto-created by R2 custom domain setup)

SSL/TLS → Full (strict)
```
That's it. HTTPS is automatic, free, never needs renewal, covers all subdomains.

---

## 15. Post-deploy verification checklist (run all 18 before inviting students)

```
□ 1.  https://api.udayalms.com/health → {"status":"ok"}
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

Privacy policy must state: what you collect (name, phone, marks, attendance, activity), why, where stored (Hetzner server, India region), retention period, how to request deletion (your email).

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

| Students | Hetzner | R2 | FCM | Jitsi | DB backup | Domain | Total/mo |
|---|---|---|---|---|---|---|---|
| Testing | ₹900 CX33 | ₹0 | ₹0 | ₹0 on CX33 | ₹0 | ₹67 | **~₹967** |
| 300 | ₹900 CX33 | ₹0 | ₹0 | ₹0 | ₹0 | ₹67 | **~₹967** |
| 500 | ₹900 CX33 | ₹0 | ₹0 | ₹0 | ₹0 | ₹67 | **~₹967** |
| 1,000 | ₹900 CX33 | ~₹13 | ₹0 | ₹0 | ₹0 | ₹67 | **~₹980** |
| 2,000 | ₹1,800 CX43 | ~₹38 | ₹0 | ₹0 | ₹0 | ₹67 | **~₹1,905** |
| 5,000 | ₹4,500 CCX23 | ~₹108 | ₹0 | separate CX33 ₹900 | ₹0 | ₹67 | **~₹5,575** |
| 10,000 | ₹9,000 2×CCX33 | ~₹203 | ₹0 | CCX23 ₹4,500 | ₹0 | ₹420 LB + ₹67 | **~₹14,190** |

**No Supabase Pro bill = saves ₹2,100/month vs previous plan.**
WhatsApp (WANotifier): ₹0.145/student one-time at enrollment. 300 students = ₹43.50/year.
AI suggestions (Gemini): ~₹0–5/month.
One-time costs: Play Store $25 (~₹2,100) · Udyam free · domain ₹800/yr.

---

## 22. Maintenance schedule

### Weekly (5 minutes)
```bash
ssh udaya@HETZNER_IP
sudo apt update && sudo apt upgrade -y
# Check Coolify dashboard → all services green
# Check Sentry → no new error spikes
# Check logs: docker logs CONTAINER_ID --tail 50
```

### Code updates (automated after setup)
```
Frontend push → Cloudflare Pages auto-deploys in ~60s
Backend push  → Coolify webhook auto-builds and restarts
Rollback frontend: Pages → Deployments → last good → Rollback (instant)
Rollback backend: Coolify → Deployments → previous green → Redeploy
```

### Monthly (10 minutes)
```
□ R2 storage GB (slow growth, lifecycle auto-archives)
□ Hetzner Coolify graphs: CPU/RAM should be <60% on CX33
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

WEEK 2 — Server setup
  Day 1: Buy Hetzner CX33 → SSH → server hardening (firewall, non-root user)
  Day 2: Install PostgreSQL 16 → PgBouncer → Redis → run schema.sql + indexes
          Run student_questions view + submit_test_attempt RPC SQL
  Day 3: Install Coolify → connect GitHub → deploy FastAPI backend
          Test: https://api.udayalms.com/health → ok
  Day 4: Install Jitsi Meet (meet.udayalms.com)
          Cron job for Sunday backup → manual test run
  Day 5: Cloudflare Pages → deploy frontend
          DNS records → SSL Full(strict) → custom domains

WEEK 3 — Storage + notifications
  Day 1: R2 buckets → custom domain → lifecycle rules
          Wire R2 upload/presign in backend
  Day 2: Firebase project → FCM → integrate frontend token registration
          Backend send_push function → test on your own phone
  Day 3: Sentry DSNs → integrate frontend + backend
          UptimeRobot monitor on api.udayalms.com
  Day 4: Run all 18 verification steps
  Day 5: Pilot: 5–10 real students + teacher → watch Sentry + Coolify logs daily

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

### Backend down (UptimeRobot alert emails you)
```bash
# Fix 1: Coolify dashboard → app → Restart  (fixes 80% of issues, 30 seconds)

# Fix 2: Coolify itself unreachable
ssh udaya@HETZNER_IP
sudo docker ps -a                   # see which container is stopped
sudo docker restart CONTAINER_ID
sudo systemctl restart docker       # if docker daemon crashed

# Fix 3: Server completely frozen
# Hetzner Cloud Console → server → Power → Force Reboot (last resort)

# Fix 4: Bad code deploy
# Coolify → Deployments → last green build → Redeploy (instant rollback)
```

### Frontend broken after push
```
Cloudflare Pages → Deployments → last known-good → Rollback
Done in 30 seconds. Zero downtime.
```

### Database corruption / data mistake
```bash
# Restore from last Sunday backup
ssh udaya@HETZNER_IP
# Download backup from R2
aws s3 cp s3://udaya-private/backups/db/udaya_lms_LATEST.sql.gz . \
  --endpoint-url https://ACCOUNT_ID.r2.cloudflarestorage.com
gunzip udaya_lms_LATEST.sql.gz
# STOP the backend first (prevent writes during restore)
sudo docker stop FASTAPI_CONTAINER
psql -U udaya_app -d udaya_lms -h 127.0.0.1 -f udaya_lms_LATEST.sql
sudo docker start FASTAPI_CONTAINER
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
# 1. FastAPI SECRET_KEY: openssl rand -hex 32 → update Coolify env → restart
# 2. PostgreSQL password: ALTER USER udaya_app PASSWORD 'NEW_PASSWORD'
#                        → update DATABASE_URL in Coolify → restart
# 3. Any API key: regenerate in its dashboard → update Coolify → restart
# Total time: 5 minutes, zero user downtime if done in this order
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
