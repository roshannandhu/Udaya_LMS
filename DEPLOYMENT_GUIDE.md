# Tutoria LMS — Deployment Guide

> Costs and options for deploying Tutoria for **500 students + 4–5 teachers** as a web app + Android app.
> **Video load assumption**: 10 videos/day × 500 MB each = 5 GB/day, 150 GB/month new uploads.
> Last updated: May 2026

---

## How the App Splits for Deployment

| Part | What it is | Hosting type needed |
|---|---|---|
| **Frontend** | React + Vite static build (`frontend/dist/`) | Any static file host / CDN |
| **Backend** | FastAPI Python server (`backend/main.py`) | **Always-on server** (WebSocket!) |
| **Database** | Supabase PostgreSQL | Already cloud-hosted (Supabase) |
| **Video** | Cloudflare Stream (or alternative — see below) | Cloud video host |
| **File Storage** | Supabase Storage (avatars, attachments) | Already cloud-hosted (Supabase) |

> ⚠️ **Critical**: The backend uses **WebSocket** for real-time broadcasts. You **cannot** deploy to serverless platforms like AWS Lambda, Vercel Functions, or Netlify Functions. The server must stay alive continuously.

---

## ⚠️ VIDEO IS THE DOMINANT COST — Read This First

With 10 videos/day × 500 MB each, video hosting will be **the largest single expense** — far exceeding backend and database costs combined. You must choose a video strategy before picking a hosting plan.

### Video Load Numbers

| Metric | Calculation | Result |
|---|---|---|
| Upload per day | 10 videos × 500 MB | **5 GB/day** |
| Upload per month | 5 GB × 30 days | **150 GB/month** |
| Video duration (est.) | 500 MB at 720p / 3 Mbps | **~20 min per video** |
| New minutes stored/month | 10 × 20 min × 30 days | **6,000 min/month** |
| Delivery (moderate) | 150 students/day × 1.5 videos × 20 min | **135,000 min/month** |
| Delivery (heavy) | 300 students/day × 2 videos × 20 min | **360,000 min/month** |

> ⚠️ Storage is **cumulative** — every video you upload stays stored every following month unless you delete it.

---

## Video Hosting Options Compared

### Option A — Cloudflare Stream (Current Setup, Most Expensive)

Cloudflare Stream pricing: **$5 per 1,000 minutes stored/month** + **$1 per 1,000 minutes delivered**

**Storage grows every month because old videos stay stored:**

| Month | Total Minutes Stored | Storage Cost | Delivery Cost (moderate) | **Total/month** |
|---|---|---|---|---|
| Month 1 | 6,000 min | $30 | $135 | **$165** (~₹14,000) |
| Month 2 | 12,000 min | $60 | $135 | **$195** (~₹16,700) |
| Month 3 | 18,000 min | $90 | $135 | **$225** (~₹19,300) |
| Month 6 | 36,000 min | $180 | $135 | **$315** (~₹27,000) |
| Month 12 | 72,000 min | $360 | $135 | **$495** (~₹42,500) |

**Verdict**: Starts manageable but becomes very expensive. Only viable if you regularly delete old videos to cap total storage.

**To control costs on Cloudflare Stream**: Delete videos from subjects/standards that have ended. Keep max ~6,000 stored minutes at any time → cap at ~$30/month storage.

---

### Option B — Backblaze B2 + Cloudflare CDN ⭐ Best Value

Backblaze B2 + Cloudflare are **bandwidth alliance partners** — data delivered via Cloudflare is **free** from Backblaze. You only pay for storage.

| Metric | Cost |
|---|---|
| Storage | $0.006/GB/month |
| Delivery via Cloudflare CDN | **$0** (Bandwidth Alliance) |
| Month 1 (150 GB stored) | **$0.90/month** |
| Month 3 (450 GB stored) | **$2.70/month** |
| Month 6 (900 GB stored) | **$5.40/month** |
| Month 12 (1,800 GB stored) | **$10.80/month** |

**Trade-off**: Requires a code change — the app currently uploads to Cloudflare Stream. You'd change the backend to upload to B2 and use a native `<video>` player or HLS.js instead of the Stream embed. This is a moderate change (~2–3 hours of work).

---

### Option C — Cloudflare R2 (No Egress Fees via Cloudflare)

| Metric | Cost |
|---|---|
| Storage | $0.015/GB/month (first 10 GB free) |
| Delivery via Cloudflare Workers/Pages | **$0** (no egress fees) |
| Month 1 (150 GB stored) | **$2.25/month** |
| Month 3 (450 GB stored) | **$6.75/month** |
| Month 6 (900 GB stored) | **$13.50/month** |
| Month 12 (1,800 GB stored) | **$27/month** |

**Trade-off**: Same as B2 — requires code change. Advantage: stays entirely within Cloudflare ecosystem, no separate account.

---

### Option D — Bunny.net (Easy, Affordable)

Bunny.net is a video CDN with a simple API.

| Metric | Cost |
|---|---|
| Storage | $0.01/GB/month |
| CDN delivery (Asia/India) | $0.04/GB |
| Month 1 storage (150 GB) | $1.50 |
| Delivery: 1,500 GB/month (moderate) | $60 |
| **Total month 1** | **~$62/month** (~₹5,300) |
| Month 6 storage (900 GB) | $9 |
| **Total month 6** | **~$69/month** (~₹5,900) |

More stable than Cloudflare Stream (flat delivery cost). Requires code change.

---

### Option E — YouTube Unlisted (Free)

Upload teacher videos to YouTube as **Unlisted** (not public, only accessible with the link). Embed the YouTube player in the app.

| Metric | Cost |
|---|---|
| Storage | **Free** (unlimited) |
| Delivery | **Free** (Google pays) |
| Monthly cost | **$0** |

**Trade-offs**:
- YouTube ads may appear (unless teacher has YouTube Premium)
- Students can use 3rd-party tools to download
- No reliable download tracking (current `allow_download` feature won't work)
- Videos could be found if someone shares the URL
- Requires code change to swap Cloudflare Stream embed for YouTube embed

**Best for**: Lowest budget. Perfectly fine if you accept the trade-offs.

---

### Video Hosting Decision Table

| Option | Month 6 Cost | Code Change? | Best For |
|---|---|---|---|
| **YouTube Unlisted** | **$0** | Yes (iframe swap) | Tightest budget |
| **Backblaze B2 + Cloudflare** | **~$5.40** | Yes (upload + player) | Best value overall ⭐ |
| **Cloudflare R2** | **~$13.50** | Yes (upload + player) | Stay in CF ecosystem |
| **Bunny.net** | **~$69** | Yes (API + player) | Good balance |
| **Cloudflare Stream (current)** | **~$315** | No change needed | High budget only |

> 💡 **Recommendation**: For long-term cost, switch to **Backblaze B2 + Cloudflare** or **YouTube Unlisted**. If you want zero code changes for now, use Cloudflare Stream but implement a **video deletion policy** — delete videos when a term/standard ends to keep stored minutes under 6,000 (≈ $30/month storage).

---

## Pre-Deployment Checklist (All Options)

Before deploying anywhere:

1. **Update CORS** in `backend/main.py`:
   ```python
   allow_origins=["https://yourdomain.com", "https://www.yourdomain.com"]
   ```

2. **Update frontend API URL** in `frontend/.env.local`:
   ```
   VITE_API_URL=https://your-backend-domain.com/api
   ```

3. **Build frontend**:
   ```bash
   cd frontend && npm run build
   ```

4. **Set backend env vars** on your server:
   ```
   SUPABASE_URL=...
   SUPABASE_KEY=...
   SUPABASE_SERVICE_KEY=...
   CLOUDFLARE_ACCOUNT_ID=...
   CLOUDFLARE_STREAM_API_TOKEN=...
   ```

5. **Run backend**: `uvicorn main:app --host 0.0.0.0 --port 8001`

6. **Replace WebSocket URL** in frontend from `ws://` to `wss://` for HTTPS production

---

## Option 1 — Completely Free (Testing Only)

**Cost: ₹0 / $0 per month** (video cost extra — see above)

| Service | Provider | Free Tier |
|---|---|---|
| Frontend | Vercel or Netlify | Unlimited static sites |
| Backend | Render.com free tier | 750 hours/month, 512 MB RAM |
| Database | Supabase free tier | 500 MB DB, 1 GB storage, 50K MAU |
| Video | YouTube Unlisted | Free (requires code change) |

### Steps
1. **Frontend → Vercel**: New Project → set root to `frontend/` → add `VITE_API_URL` env → deploy
2. **Backend → Render.com**: New Web Service → root `backend/` → build: `pip install -r requirements.txt` → start: `uvicorn main:app --host 0.0.0.0 --port $PORT` → add env vars

### ⚠️ Free Tier Limitations
- Render free tier **spins down after 15 minutes of inactivity** → 30–60 second cold start for students
- WebSocket drops when server is asleep
- **Not suitable for live production with 500 students**

---

## Option 2 — Budget-Friendly (Recommended for Production)

**Infrastructure cost: ~₹600–1,000/month + video cost on top**

### Option 2A — Render Starter (Simplest)

| Service | Provider | Monthly Cost |
|---|---|---|
| Frontend | Netlify (free) | $0 |
| Backend | Render Starter | $7/month (~₹600) |
| Database | Supabase free tier | $0 |
| Domain | Namecheap .com | ~$1/month (~₹85) |
| Video | See video table above | $0–315/month |
| **Infrastructure total** | | **~$8/month (~₹700)** |

Render Starter: always-on, 512 MB RAM, 0.5 CPU. Enough for API + WebSocket for 500 students. Upgrade to $25/month if RAM is insufficient during peak upload times.

> ⚠️ **Upload note**: Uploading 10 × 500 MB videos/day through the backend is intensive. The current code streams each upload to Cloudflare through FastAPI — consider staggering uploads (not all at once) on Render Starter.

### Option 2B — Railway

| Service | Provider | Monthly Cost |
|---|---|---|
| Frontend | Netlify (free) | $0 |
| Backend | Railway Hobby | $5 base + ~$3–5 usage |
| Database | Supabase free tier | $0 |
| Domain | Namecheap | ~$1/month |
| **Infrastructure total** | | **~$9–11/month** |

### Option 2C — DigitalOcean Droplet

| Service | Provider | Monthly Cost |
|---|---|---|
| Frontend | Netlify (free) | $0 |
| Backend | DO Droplet 2 GB RAM | $12/month (~₹1,030) |
| Database | Supabase free tier | $0 |
| Domain | Namecheap | ~$1/month |
| **Infrastructure total** | | **~$13/month (~₹1,115)** |

Use the **2 GB Droplet ($12)** instead of 1 GB — the 1 GB will struggle when teachers upload 500 MB video files.

```bash
# Ubuntu 22.04 on the droplet:
sudo apt update && sudo apt install python3-pip nginx certbot python3-certbot-nginx -y
pip3 install -r requirements.txt

# Systemd auto-restart:
sudo nano /etc/systemd/system/tutoria.service
```
```ini
[Unit]
Description=Tutoria FastAPI
After=network.target
[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/tutoria/backend
EnvironmentFile=/home/ubuntu/tutoria/backend/.env
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable tutoria && sudo systemctl start tutoria
# Nginx + SSL:
sudo certbot --nginx -d api.yourdomain.com
```

### Option 2D — Fly.io (Cheapest Always-On)

| Service | Provider | Monthly Cost |
|---|---|---|
| Frontend | Netlify (free) | $0 |
| Backend | Fly.io shared-cpu-1x 1 GB | ~$5–7/month |
| **Infrastructure total** | | **~$6–8/month (~₹520–690)** |

```bash
cd backend
fly launch
fly secrets set SUPABASE_URL=... SUPABASE_KEY=... SUPABASE_SERVICE_KEY=...
fly deploy
```

---

## Option 3 — AWS (Enterprise / Scalable)

**Infrastructure cost: ~$25–45/month + video cost on top**

### Architecture

```
Students/Teachers
     ↓
Route 53 → CloudFront → S3 (frontend, static)
                     → ALB → EC2 (FastAPI backend)
                               ↓
                          Supabase (DB)
                          Video host (CF Stream / B2 / R2)
```

### Per-Service Cost Breakdown (Infrastructure only, excludes video)

| AWS Service | Spec | Monthly Cost |
|---|---|---|
| **EC2 t3.small** | 2 vCPU, 2 GB RAM | ~$15–16 |
| **EC2 t3.medium** (for heavy uploads) | 2 vCPU, 4 GB RAM | ~$30–33 |
| **S3** (frontend ~5 MB) | Storage + requests | ~$0.10 |
| **CloudFront** (frontend CDN) | First 1 TB/month free | $0 |
| **Route 53** (DNS) | 1 hosted zone | $0.50 |
| **ACM** (SSL) | Free with CloudFront | $0 |
| **EC2 data transfer** | ~10 GB API/month | ~$0.90 |
| **Total (t3.small)** | | **~$17–20/month** |
| **Total (t3.medium)** | | **~$32–35/month** |

> **EC2 size for video uploads**: With 10 × 500 MB uploads/day going through FastAPI, a **t3.medium (4 GB RAM)** is strongly recommended. The t3.small may run out of memory buffering large uploads. Region: **ap-south-1 (Mumbai)** for India.

### Step-by-Step AWS Setup

**1. Launch EC2**
- AMI: Ubuntu 22.04 LTS, Instance: t3.medium, Region: ap-south-1
- Security group: ports 22, 80, 443

**2. Install and configure**
```bash
ssh -i key.pem ubuntu@<ip>
sudo apt update && sudo apt install python3-pip nginx certbot python3-certbot-nginx -y
git clone <repo> /home/ubuntu/tutoria
cd /home/ubuntu/tutoria/backend && pip3 install -r requirements.txt
# Create .env with all keys
sudo systemctl enable tutoria && sudo systemctl start tutoria
sudo certbot --nginx -d api.yourdomain.com
```

**3. Nginx config (with WebSocket support)**
```nginx
server {
    server_name api.yourdomain.com;
    client_max_body_size 600M;   # allow 500 MB video uploads
    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }
}
```

**4. S3 + CloudFront (frontend)**
```bash
cd frontend && npm run build
aws s3 sync dist/ s3://tutoria-frontend --delete
# Create CloudFront distribution → point to S3 → attach domain
```

### AWS Billing Setup
- AWS Console → Billing → Budgets → Create budget → alert at $50/month
- Free tier first 12 months: 750 hours t2.micro, 5 GB S3, 15 GB transfer

### AWS Infrastructure Cost Summary (no video)

| EC2 Size | Monthly (infra only) | Recommended for |
|---|---|---|
| t3.small (2 GB) | ~$17–20 | Low upload frequency |
| t3.medium (4 GB) | ~$32–35 | 10 videos/day uploads ✅ |
| t3.large (8 GB) | ~$60–65 | Future scaling |

---

## Full Monthly Cost Estimates (Infrastructure + Video Combined)

This table shows **realistic total monthly costs** for your scenario (10 videos/day × 500 MB, 500 students):

### With Cloudflare Stream (no code change needed)

| Setup | Infra | Video (Month 1) | Video (Month 6) | Total Month 1 | Total Month 6 |
|---|---|---|---|---|---|
| Render + Netlify | $8 | $165 | $315 | **$173** (₹14,800) | **$323** (₹27,700) |
| DigitalOcean 2 GB | $13 | $165 | $315 | **$178** (₹15,300) | **$328** (₹28,200) |
| AWS t3.medium | $33 | $165 | $315 | **$198** (₹17,000) | **$348** (₹29,900) |

### With Backblaze B2 + Cloudflare (code change required)

| Setup | Infra | Video (Month 1) | Video (Month 6) | Total Month 1 | Total Month 6 |
|---|---|---|---|---|---|
| Render + Netlify | $8 | $0.90 | $5.40 | **$8.90** (₹765) | **$13.40** (₹1,150) ⭐ |
| DigitalOcean 2 GB | $13 | $0.90 | $5.40 | **$13.90** (₹1,195) | **$18.40** (₹1,580) |
| AWS t3.medium | $33 | $0.90 | $5.40 | **$33.90** (₹2,915) | **$38.40** (₹3,300) |

### With YouTube Unlisted (code change required, free video)

| Setup | Infra | Video | Total/month |
|---|---|---|---|
| Render + Netlify | $8 | $0 | **$8** (₹690) |
| DigitalOcean 2 GB | $13 | $0 | **$13** (₹1,115) |
| AWS t3.medium | $33 | $0 | **$33** (₹2,835) |

---

## Option 4 — GoDaddy

GoDaddy is primarily a domain registrar. **Not suitable for Python/FastAPI hosting.**

### Domain (what GoDaddy IS good for)
- `.com` domain: ~$12–15/year (₹1,000–1,300/year)
- `.in` domain: ~$3–5/year

### Hosting Plans Reality

| Plan | Price | FastAPI + WebSocket? |
|---|---|---|
| Shared Hosting | $3–6/month | ❌ PHP only, no Python |
| VPS 1 (1 CPU, 1 GB) | $5–8/month | ✅ But too small for video uploads |
| VPS 2 (2 CPU, 2 GB) | $15–18/month | ✅ Usable, overpriced vs alternatives |
| Dedicated | $80+/month | ✅ Overkill |

**GoDaddy VPS ($15–18/month) vs DigitalOcean Droplet ($12/month)**: identical specs, GoDaddy costs more and has less developer-friendly tooling.

### Verdict on GoDaddy
- ✅ **Buy your domain here** if you prefer their UI
- ❌ **Do not host the app on GoDaddy** — use Render, DigitalOcean, or AWS instead
- Point your GoDaddy domain DNS (A/CNAME records) to your actual host

---

## Option 5 — Android App

### Free: PWA (Already Configured — Use This)

Your app **already has PWA support** (vite-plugin-pwa + manifest.json + service worker). Students can install it from their Android phone without the Play Store.

**How students install:**
1. Open the web app in Chrome on Android
2. Tap "Add to Home Screen" banner (auto-appears) or Chrome menu → "Install app"
3. A full-screen app icon appears on the home screen
4. It opens without a browser bar — indistinguishable from a native app

**Cost: ₹0** — no developer account, no Play Store.

---

### Optional: Google Play Store Listing

A Play Store listing improves discoverability but is not required for 500 known students.

| Item | Cost |
|---|---|
| Google Play Developer Account | **$25 one-time (~₹2,100)** |
| Annual renewal | $0 |
| App publishing (free app) | $0 |

**Build the APK from your existing PWA** using PWA Builder (free Microsoft tool):
1. Deploy your web app to HTTPS
2. Go to pwabuilder.com → enter your URL → validate
3. Click Android → download the `.aab` file
4. Sign the AAB (instructions in PWA Builder)
5. Upload to Google Play Console

No native code required — it wraps your PWA in a TWA (Trusted Web Activity).

---

## Summary Comparison Table

### Infrastructure Only (excluding video)

| Option | Monthly (INR) | Always-On | Upload 500 MB videos? |
|---|---|---|---|
| Render free + Vercel | ₹0 | ❌ (cold starts) | Limited |
| Fly.io + Netlify | ₹520–690 | ✅ | OK if staggered |
| Render Starter + Netlify | ₹600–700 | ✅ | OK if staggered |
| DigitalOcean 2 GB + Netlify | ₹1,030–1,115 | ✅ | ✅ Comfortable |
| AWS t3.medium + S3/CF | ₹2,750–3,000 | ✅ | ✅ Best for uploads |
| GoDaddy VPS 2 | ₹1,300–1,550 | ✅ | OK, overpriced |

### Total Monthly (Infrastructure + Video, Month 6)

| Setup | Cloudflare Stream | Backblaze B2 + CF | YouTube Free |
|---|---|---|---|
| Render + Netlify | ₹27,700 | **₹1,150** ⭐ | ₹690 |
| DigitalOcean 2 GB | ₹28,200 | ₹1,580 | ₹1,115 |
| AWS t3.medium | ₹29,900 | ₹3,300 | ₹2,835 |

---

## Recommended Setup for Your Use Case

**500 students · 4–5 teachers · 10 videos/day × 500 MB · Web + Android · India**

### Phase 1: Launch (minimal cost, Cloudflare Stream as-is)

| Component | Choice | Monthly |
|---|---|---|
| Backend | Render Starter | $7 (~₹600) |
| Frontend | Netlify free | $0 |
| Database | Supabase free | $0 |
| Video | Cloudflare Stream | ~$165 (~₹14,200) — Month 1 |
| Domain | Namecheap .com | ~$1 (~₹85) |
| **Total Month 1** | | **~₹14,900/month** |
| **Total Month 6** | | **~₹27,800/month** |

⚠️ Cloudflare Stream cost keeps rising. Implement a video deletion policy (delete old terms) to cap stored minutes.

---

### Phase 2: Cost Optimization (switch video storage)

Switch video uploads from Cloudflare Stream to **Backblaze B2 + Cloudflare** (code change, ~2–4 hours):

| Component | Choice | Monthly |
|---|---|---|
| Backend | Render Starter | $7 (~₹600) |
| Frontend | Netlify free | $0 |
| Database | Supabase free | $0 |
| Video | Backblaze B2 + CF CDN | ~$5 (~₹430) |
| Domain | Namecheap .com | ~$1 (~₹85) |
| **Total (stable)** | | **~₹1,115/month** |

This is the best long-term choice — video costs stay nearly flat as your library grows.

---

### Android

- **Share the PWA link** → students install from Chrome → zero cost ✅
- **Play Store** (optional, later): $25 one-time + PWA Builder

---

### One-Time Costs

| Item | Cost |
|---|---|
| Domain name (.com, 1 year) | ₹1,000–1,300 |
| Google Play Developer (optional) | ₹2,100 |

---

## Before Going Live — Final Checklist

- [ ] Update CORS in `backend/main.py` with production domain
- [ ] Set `VITE_API_URL` to production backend URL and rebuild frontend
- [ ] Confirm `SUPABASE_SERVICE_KEY` is only in backend env vars, never in frontend
- [ ] Enable HTTPS on all services (Render/Netlify/Fly.io all provide free SSL)
- [ ] Update WebSocket URL in frontend from `ws://` to `wss://`
- [ ] Set `client_max_body_size 600M` in Nginx if using it (allows 500 MB uploads)
- [ ] Disable or delete `POST /api/demo/create-accounts` endpoint before going live
- [ ] Set up Supabase DB backups (Supabase dashboard → Settings → Database → Backups)
- [ ] Set up billing alerts (AWS: CloudWatch → Billing, Render: email alerts)
- [ ] Test WebSocket broadcasts on production domain
- [ ] Test single-device enforcement with 2 phones on the same account
- [ ] Test video upload on production with a 500 MB file before giving to teachers
- [ ] Share PWA "Add to Home Screen" instructions with all 500 students

---

*Stack: React 18 + Vite (frontend) · FastAPI Python (backend) · Supabase PostgreSQL (DB) · Video: Cloudflare Stream (current) or Backblaze B2 / YouTube (recommended for cost)*
