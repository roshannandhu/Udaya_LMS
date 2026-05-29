# Tutoria LMS — Complete Deployment Guide

> **Updated:** May 2026  
> **Stack:** React 18 + Vite (frontend) · FastAPI Python (backend) · Supabase PostgreSQL (DB) · YouTube Unlisted (video) · Zoom Server-to-Server OAuth (live classes)  
> **Scale assumption:** 500 students · 4–5 teachers · Indian market

---

## How the App Splits for Deployment

| Part | What it is | Hosting type needed |
|---|---|---|
| **Frontend** | React + Vite static build (`frontend/dist/`) | Static file host / CDN |
| **Backend** | FastAPI Python server (`backend/main.py`) | **Always-on server** (WebSocket!) |
| **Database** | Supabase PostgreSQL | Already cloud-hosted ✅ |
| **Video** | YouTube Unlisted (embed via IFrame API) | **Free — no hosting needed** ✅ |
| **Live Classes** | Zoom Server-to-Server OAuth | Zoom account (see below) ✅ |
| **File Storage** | Supabase Storage (avatars, broadcast attachments) | Already cloud-hosted ✅ |

> ⚠️ **Critical:** The backend uses **WebSockets** for real-time broadcasts. You **cannot** deploy to serverless platforms (AWS Lambda, Vercel Functions, Netlify Functions). The server must run continuously.

---

## ✅ Current Video Architecture: YouTube Unlisted

Videos are **no longer uploaded to the server**. Teachers paste a YouTube Unlisted URL into the app. The video is embedded using the sandboxed YouTube IFrame API inside the student portal. Students **cannot** copy the URL or open YouTube — the player is fully sandboxed.

**Cost: ₹0/month** — Google pays for all video storage and delivery.

### YouTube Video Requirements for Teachers
1. Upload video to YouTube
2. Set visibility to **Unlisted** (not Private, not Public)
3. Copy the URL and paste it in the Tutoria subject detail page
4. The app validates it and stores only the video ID, never the raw URL

---

## ✅ Live Classes: Zoom Server-to-Server OAuth

Live classes are created via the Zoom API and joined inside the app using the Zoom Web SDK. Students never see the Zoom meeting URL.

### Zoom Credentials Required (add to `backend/.env`)
```
ZOOM_ACCOUNT_ID=...
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
ZOOM_SDK_KEY=...
ZOOM_SDK_SECRET=...
ZOOM_WEBHOOK_SECRET_TOKEN=...
```

### Zoom Plan Costs

| Plan | Price | Meeting Limit | Best for |
|---|---|---|---|
| **Zoom Basic (Free)** | $0/month | 40 min/meeting, 100 participants | Testing only |
| **Zoom Pro** | $15.99/month (~₹1,350) | 30 hr/meeting, 100 participants | ✅ Small class (up to 100 students) |
| **Zoom Business** | $19.99/month (~₹1,680) | 30 hr/meeting, 300 participants | Large classes |
| **Zoom Education** | Contact sales | Unlimited | Schools/colleges |

> 💡 **Recommendation:** Zoom Pro ($15.99/month) — handles live classes for up to 100 students at a time. If you split batches, one Pro account is enough for 500 students across multiple time slots.

---

## Pre-Deployment Checklist

Before going live on any platform:

**1. Update CORS in `backend/main.py`:**
```python
allow_origins=["https://yourdomain.com", "https://www.yourdomain.com"]
```

**2. Update frontend API URL in `frontend/.env.local`:**
```
VITE_API_URL=https://your-backend-domain.com/api
```

**3. Build frontend:**
```bash
cd frontend && npm run build
```

**4. Set all backend environment variables on the server:**
```
SUPABASE_URL=...
SUPABASE_KEY=...
SUPABASE_SERVICE_KEY=...
ZOOM_ACCOUNT_ID=...
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
ZOOM_SDK_KEY=...
ZOOM_SDK_SECRET=...
ZOOM_WEBHOOK_SECRET_TOKEN=...
```

**5. Start backend:**
```bash
uvicorn main:app --host 0.0.0.0 --port 8001 --workers 2
```

**6. Update WebSocket URL in frontend from `ws://` to `wss://` for HTTPS**

**7. Run database indexes** (paste `backend/optimize_indexes.sql` in Supabase SQL Editor)

**8. Delete the demo endpoint** before going live:
```
# Remove or comment out: POST /api/demo/create-accounts
```

---

## OPTION 1 — 100% Free (Development / Early Testing)

**Monthly cost: ₹0 / $0** (not for production with 500 students)

| Service | Provider | Free Tier Limit |
|---|---|---|
| Frontend | Vercel or Netlify | Unlimited static builds |
| Backend | Render.com Free | 512 MB RAM, spins down after 15 min idle |
| Database | Supabase Free | 500 MB DB, 1 GB storage, 50,000 MAU |
| Video | YouTube Unlisted | ✅ Free |
| Live Classes | Zoom Basic | 40 min limit per class |

### ⚠️ Free Tier Critical Warning
- Render free tier **sleeps after 15 minutes of no traffic**
- Cold start takes **30–60 seconds** — students will see loading screens
- **WebSocket drops when server is asleep**
- **Not suitable for 500 students in production**

---

## OPTION 2 — Railway ⭐ Simplest Paid Option

Railway is the easiest platform for deploying FastAPI with zero DevOps knowledge.

### Pricing

| Plan | Price | What you get |
|---|---|---|
| **Hobby** | $5/month base + usage | 8 GB RAM, 8 vCPU, 100 GB egress |
| **Pro** | $20/month | Teams, priority support |
| **Usage billing** | ~$0.000463/vCPU-hour + $0.000231/GB-hour | Pay for what you use |

### Estimated Monthly Railway Cost for Tutoria Backend

| Usage | Estimated Cost |
|---|---|
| 1 vCPU + 1 GB RAM, always-on (30 days) | ~$8–12/month |
| 1 vCPU + 2 GB RAM, always-on (30 days) | ~$12–16/month |
| $5 base fee included | ✅ |

### Railway Full Stack Estimate

| Component | Provider | Monthly Cost |
|---|---|---|
| Backend (FastAPI) | Railway Hobby | $10–15 (usage-based) |
| Frontend | Netlify (free) | $0 |
| Database | Supabase Free | $0 |
| Video | YouTube Unlisted | $0 |
| Zoom Live Classes | Zoom Pro | $16 (~₹1,350) |
| Domain | Namecheap .com | ~$1 (~₹85) |
| **Total** | | **~$27–32/month (~₹2,300–2,750)** |

### Railway Deployment Steps
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and init
railway login
railway init

# Deploy backend
cd backend
railway up

# Set environment variables
railway variables set SUPABASE_URL=... SUPABASE_KEY=... # etc.

# Get your deployed URL
railway open
```

### Railway Pros & Cons

| ✅ Pros | ❌ Cons |
|---|---|
| Zero-config deployment | Usage billing can be unpredictable |
| GitHub auto-deploy on push | Less control than VPS |
| Built-in HTTPS & custom domains | More expensive than DO at scale |
| Excellent for small teams | |

---

## OPTION 3 — Render.com ⭐ Best Value Managed Platform

### Pricing

| Plan | Price | RAM | CPU | Always-on? |
|---|---|---|---|---|
| Free | $0 | 512 MB | 0.1 vCPU | ❌ Sleeps |
| **Starter** | **$7/month** | 512 MB | 0.5 vCPU | ✅ Yes |
| Standard | $25/month | 2 GB | 1 vCPU | ✅ Yes |
| Pro | $85/month | 4 GB | 2 vCPU | ✅ Yes |

### Render Full Stack Estimate

| Component | Provider | Monthly Cost |
|---|---|---|
| Backend (FastAPI) | Render Starter | $7 (~₹600) |
| Frontend | Netlify (free) | $0 |
| Database | Supabase Free | $0 |
| Video | YouTube Unlisted | $0 |
| Zoom Live Classes | Zoom Pro | $16 (~₹1,350) |
| Domain | Namecheap .com | ~$1 (~₹85) |
| **Total** | | **~$24/month (~₹2,060)** |

### Render Deployment Steps
1. **Backend → Render:**
   - New Web Service → connect GitHub repo
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Add all env vars in the Environment tab
   - Plan: Starter ($7/month)

2. **Frontend → Netlify:**
   - New Site → connect GitHub repo
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `frontend/dist`
   - Add `VITE_API_URL` env var

---

## OPTION 4 — DigitalOcean Droplet ⭐ Best Control-to-Price

A virtual private server (VPS) gives you full control. DigitalOcean is the most popular choice for solo developers.

### Pricing

| Droplet Size | RAM | vCPU | SSD | Monthly | Best for |
|---|---|---|---|---|---|
| Basic 1 GB | 1 GB | 1 vCPU | 25 GB | **$6/month** | Too small |
| **Basic 2 GB** | 2 GB | 1 vCPU | 50 GB | **$12/month** | ✅ Tutoria |
| Basic 4 GB | 4 GB | 2 vCPU | 80 GB | $24/month | Future scale |
| Basic 8 GB | 8 GB | 4 vCPU | 160 GB | $48/month | Heavy load |

### DigitalOcean Full Stack Estimate

| Component | Provider | Monthly Cost |
|---|---|---|
| Backend (FastAPI) | DO Droplet 2 GB | $12 (~₹1,030) |
| Frontend | Netlify (free) | $0 |
| Database | Supabase Free | $0 |
| Video | YouTube Unlisted | $0 |
| Zoom Live Classes | Zoom Pro | $16 (~₹1,350) |
| Domain | Namecheap .com | ~$1 (~₹85) |
| **Total** | | **~$29/month (~₹2,490)** |

### DigitalOcean Setup (Ubuntu 22.04)

```bash
# Connect to droplet
ssh -i ~/.ssh/id_rsa root@<your-droplet-ip>

# System setup
apt update && apt upgrade -y
apt install python3-pip python3-venv nginx certbot python3-certbot-nginx -y

# Clone and setup app
git clone https://github.com/yourusername/tutoria /opt/tutoria
cd /opt/tutoria/backend
pip3 install -r requirements.txt

# Create .env file
nano /opt/tutoria/backend/.env
# Paste all your environment variables

# Create systemd service (auto-restart on crash/reboot)
nano /etc/systemd/system/tutoria.service
```

```ini
[Unit]
Description=Tutoria FastAPI Backend
After=network.target

[Service]
User=root
WorkingDirectory=/opt/tutoria/backend
EnvironmentFile=/opt/tutoria/backend/.env
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable tutoria && systemctl start tutoria

# Nginx with WebSocket support
nano /etc/nginx/sites-available/tutoria
```

```nginx
server {
    server_name api.yourdomain.com;
    
    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/tutoria /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Free SSL certificate
certbot --nginx -d api.yourdomain.com
```

---

## OPTION 5 — AWS (Enterprise / Scalable)

AWS is the most powerful option but also the most complex to manage and most expensive.

### Architecture on AWS

```
Students / Teachers
      ↓
Route 53 (DNS) → CloudFront (CDN) → S3 (frontend static files)
                                  → ALB → EC2 (FastAPI backend)
                                               ↓
                                         Supabase (DB)
                                         YouTube (video)
                                         Zoom (live classes)
```

### EC2 Instance Pricing (ap-south-1 Mumbai — best for India)

| Instance | RAM | vCPU | On-Demand/month | Reserved 1yr/month | Best for |
|---|---|---|---|---|---|
| t3.micro | 1 GB | 2 | ~$8 | ~$5 | Too small |
| **t3.small** | 2 GB | 2 | **~$16** | **~$10** | ✅ Light use |
| **t3.medium** | 4 GB | 2 | **~$33** | **~$21** | ✅ Recommended |
| t3.large | 8 GB | 2 | ~$66 | ~$42 | Heavy load |
| t3.xlarge | 16 GB | 4 | ~$133 | ~$84 | Very heavy |

> 💡 **For Tutoria with 500 students:** `t3.small` (reserved) is sufficient since video is on YouTube, not on EC2. `t3.medium` gives comfortable headroom.

### AWS Full Cost Breakdown (Monthly, no upfront)

| AWS Service | Spec | Monthly Cost |
|---|---|---|
| EC2 t3.small (On-Demand) | 2 GB, 2 vCPU | ~$16 |
| EC2 t3.small (1yr Reserved) | 2 GB, 2 vCPU | ~$10 |
| EC2 t3.medium (On-Demand) | 4 GB, 2 vCPU | ~$33 |
| S3 (frontend, ~5 MB dist) | Storage + requests | ~$0.10 |
| CloudFront (frontend CDN) | First 1 TB/month | $0 |
| Route 53 (DNS) | 1 hosted zone | $0.50 |
| ACM (SSL certificate) | With CloudFront | $0 |
| EC2 data transfer out | ~10 GB API/month | ~$0.90 |

### AWS Full Stack Estimates

| Configuration | Infrastructure | Zoom | Total/month |
|---|---|---|---|
| t3.small On-Demand + S3/CF | ~$17.50 | $16 | **~$33.50 (~₹2,880)** |
| t3.small Reserved 1yr + S3/CF | ~$11.50 | $16 | **~$27.50 (~₹2,360)** |
| t3.medium On-Demand + S3/CF | ~$34.50 | $16 | **~$50.50 (~₹4,340)** |
| t3.medium Reserved 1yr + S3/CF | ~$22.50 | $16 | **~$38.50 (~₹3,310)** |

> 💡 **AWS Free Tier (first 12 months):** 750 hours t2.micro, 5 GB S3, 15 GB data transfer. Good for testing — not enough for production.

### AWS Step-by-Step Setup

**1. Launch EC2**
```
- AMI: Ubuntu 22.04 LTS
- Instance: t3.small or t3.medium
- Region: ap-south-1 (Mumbai)
- Security Group: ports 22, 80, 443
- Allocate Elastic IP (fixed public IP)
```

**2. Deploy backend (same as DigitalOcean steps above)**

**3. Frontend on S3 + CloudFront**
```bash
cd frontend && npm run build
aws s3 sync dist/ s3://tutoria-frontend --delete

# Create CloudFront distribution:
# Origin: S3 bucket (with OAC)
# Alternate domain: yourdomain.com
# SSL: Use ACM certificate (free)
# Default root object: index.html
# Error page: 404 → /index.html (for React Router)
```

**4. Route 53 DNS**
```
A record:   api.yourdomain.com → EC2 Elastic IP
CNAME:      yourdomain.com    → CloudFront domain
```

**5. Set billing alert**
```
AWS Console → Billing → Budgets → Create budget → Alert at $60/month
```

---

## OPTION 6 — GoDaddy

GoDaddy is primarily a **domain registrar**, not a developer platform.

### What GoDaddy is good for ✅
| Item | Price |
|---|---|
| `.com` domain | ~$12–15/year (~₹1,000–1,300/year) |
| `.in` domain | ~$3–5/year |
| `.co.in` domain | ~$2–3/year |

### GoDaddy Hosting Plans Reality Check

| Plan | Price | Can run FastAPI + WebSocket? |
|---|---|---|
| Shared Hosting | $3–6/month | ❌ PHP-only, no Python |
| Managed WordPress | $5–10/month | ❌ WordPress only |
| VPS 1 (1 CPU, 1 GB) | $5–8/month | ✅ But too small |
| **VPS 2 (2 CPU, 2 GB)** | **$15–18/month** | ✅ Usable, overpriced |
| VPS 3 (4 CPU, 4 GB) | $30–35/month | ✅ Good, overpriced |
| Dedicated Server | $80+/month | ✅ Overkill |

**GoDaddy VPS ($15–18/month) vs DigitalOcean Droplet ($12/month):**  
Identical specs, GoDaddy costs more and has worse developer tooling.

### GoDaddy Verdict
- ✅ **Buy your domain here** if you prefer their UI
- ❌ **Do not host the app on GoDaddy** — inferior value
- ✅ **Point GoDaddy DNS to DigitalOcean / Render / Railway:**
  - GoDaddy Dashboard → DNS → Add A Record → point to your server IP

---

## OPTION 7 — Other Hosting Services Compared

| Provider | Monthly | Always-On | Ease | Best For |
|---|---|---|---|---|
| **Fly.io** | $5–8 | ✅ | ⭐⭐⭐⭐ | Low-budget always-on |
| **Heroku Eco** | $5 + $7/dyno | ✅ | ⭐⭐⭐⭐ | Easy deploy |
| **Azure App Service B1** | ~$13 | ✅ | ⭐⭐⭐ | Microsoft stack |
| **Google Cloud Run** | ~$5–15 (pay-per-use) | ⚠️ | ⭐⭐⭐ | Serverless (WebSocket tricky) |
| **Hetzner Cloud CX21** | €4/month (~₹370) | ✅ | ⭐⭐⭐ | Cheapest VPS in Europe |
| **Linode/Akamai 2 GB** | $12/month | ✅ | ⭐⭐⭐⭐ | Good alternative to DO |

### Fly.io Quick Deploy
```bash
cd backend
fly launch            # creates fly.toml
fly secrets set SUPABASE_URL=... SUPABASE_KEY=...  # all env vars
fly deploy
```

---

## Deploying as an Android App

### Method 1 — PWA (Already Configured — Recommended ✅)

**Cost: ₹0 — No developer account needed**

Your app **already has PWA support** via `vite-plugin-pwa`. Students install it from Chrome browser without any app store.

**How students install:**
1. Open the Tutoria URL in Chrome on Android
2. Chrome shows a banner: **"Add Tutoria to Home Screen"** (auto-appears)
3. Or: Chrome menu (⋮) → **"Install app"**
4. A full-screen app icon appears on the home screen
5. It launches without a browser bar — looks and feels like a native app

**PWA Features in Tutoria:**
- Offline support (Workbox service worker)
- App icon (192×192 and 512×512 configured in `vite.config.js`)
- Standalone display mode (no browser UI)
- Background sync-ready architecture
- Auto-update on new deployments

---

### Method 2 — Google Play Store via PWA Builder

**Cost: $25 one-time (~₹2,100)**

| Item | Cost |
|---|---|
| Google Play Developer Account | **$25 one-time** |
| Annual renewal | $0 |
| Publishing a free app | $0 |
| PWA Builder tool | Free (Microsoft) |

**Steps (no native code required):**
1. Deploy your app to HTTPS (any option above)
2. Go to [pwabuilder.com](https://www.pwabuilder.com) → enter your URL
3. Click **Android** → click **Generate Package**
4. Download the `.aab` file (Android App Bundle)
5. Sign the AAB (PWA Builder includes instructions)
6. Upload to [Google Play Console](https://play.google.com/console)
7. Fill in app details, screenshots, privacy policy
8. Submit for review (~2–3 business day review time)

**Play Store Listing Tips:**
- App name: "Tutoria — Your Learning Platform" (or your custom name from Settings)
- Category: Education
- Screenshots: Take them from Chrome DevTools mobile emulator
- Privacy Policy: Use a free generator like [privacypolicygenerator.info](https://privacypolicygenerator.info)

---

### Method 3 — Apple App Store (iOS)

| Item | Cost |
|---|---|
| Apple Developer Program | **$99/year (~₹8,500/year)** |
| Mac required for building | ✅ Required |

PWA on iOS has limitations (no push notifications, no background sync). For iOS, consider React Native as a future upgrade. **Not recommended until you have budget.**

---

## Full Monthly Cost Comparison Table

### Infrastructure + Zoom (Video is always free via YouTube)

| Platform | Backend Plan | Monthly (INR) | Monthly (USD) | Difficulty |
|---|---|---|---|---|
| Render + Netlify | Starter ($7) | **~₹2,060** | ~$24 | ⭐ Easiest |
| Railway + Netlify | Hobby (~$12) | **~₹2,400** | ~$28 | ⭐⭐ Easy |
| Fly.io + Netlify | shared-cpu-1x (~$6) | **~₹1,900** | ~$22 | ⭐⭐ Easy |
| DigitalOcean + Netlify | 2 GB Droplet ($12) | **~₹2,490** | ~$29 | ⭐⭐⭐ Medium |
| AWS t3.small Reserved + S3 | Reserved 1yr | **~₹2,360** | ~$27.50 | ⭐⭐⭐⭐ Hard |
| AWS t3.medium On-Demand + S3 | On-Demand | **~₹4,340** | ~$50.50 | ⭐⭐⭐⭐ Hard |
| GoDaddy VPS 2 + Netlify | VPS 2 ($16) | **~₹2,750** | ~$32 | ⭐⭐⭐ Medium |

> All prices include Zoom Pro ($16/month). Remove Zoom if using Zoom Basic (free, 40 min limit).

---

## Recommended Plans by Budget

### 🟢 Budget Plan — ₹2,000–2,500/month

**Best pick: Render Starter + Netlify + Namecheap**

| Component | Choice | Cost |
|---|---|---|
| Backend | Render Starter | $7 (~₹600) |
| Frontend | Netlify free | $0 |
| Database | Supabase free | $0 |
| Video | YouTube Unlisted | $0 |
| Live Classes | Zoom Pro | $16 (~₹1,350) |
| Domain | Namecheap `.com` | ~$1 (~₹85) |
| **Total** | | **~₹2,035/month** |

One-time costs:
- Domain registration: ₹1,000–1,300 (1 year)
- Google Play (optional): ₹2,100 (one-time)

---

### 🔵 Best Value Plan — ₹2,400–2,800/month

**Best pick: DigitalOcean 2 GB + Netlify + Namecheap**

| Component | Choice | Cost |
|---|---|---|
| Backend | DigitalOcean 2 GB Droplet | $12 (~₹1,030) |
| Frontend | Netlify free | $0 |
| Database | Supabase free | $0 |
| Video | YouTube Unlisted | $0 |
| Live Classes | Zoom Pro | $16 (~₹1,350) |
| Domain | Namecheap `.com` | ~$1 (~₹85) |
| **Total** | | **~₹2,465/month** |

**Why DigitalOcean over Render:** Full VPS control, no memory limits, can run Nginx + backend on one machine, permanent storage on disk. Harder to set up but more stable.

---

### 🔴 Enterprise Plan — ₹3,000–5,000/month

**Best pick: AWS t3.small Reserved + S3 + CloudFront**

| Component | Choice | Cost |
|---|---|---|
| Backend | AWS EC2 t3.small (1yr Reserved) | ~$10 (~₹860) |
| Frontend | AWS S3 + CloudFront | ~$0.50 (~₹43) |
| Database | Supabase Pro (if needed) | $25 (~₹2,150) |
| Video | YouTube Unlisted | $0 |
| Live Classes | Zoom Pro | $16 (~₹1,350) |
| Domain | Namecheap or Route 53 | ~$1–$0.50 |
| **Total** | | **~₹4,400/month** |

**Why AWS:** Best reliability (99.99% SLA), full control, automatic scaling groups, CloudWatch monitoring, RDS if you move off Supabase later.

---

## Supabase Free vs Pro

The free Supabase tier is good enough to start. Upgrade when you hit limits.

| Limit | Free Tier | Pro ($25/month) |
|---|---|---|
| Database size | 500 MB | 8 GB |
| Storage | 1 GB | 100 GB |
| Monthly Active Users | 50,000 | Unlimited |
| Realtime connections | 200 | 500 |
| Database backups | None | Daily |
| Point-in-time recovery | ❌ | ✅ |

> 💡 For 500 students with text data only (no video), you will comfortably stay within the free tier for at least 6–12 months.

---

## Domain Options

| Provider | `.com` / year | `.in` / year | Notes |
|---|---|---|---|
| **Namecheap** | $9–11 | $3–5 | Best price, easy DNS |
| **GoDaddy** | $12–15 | $3–5 | Good UI, slightly pricier |
| **Porkbun** | $9–10 | $3–4 | Cheapest, great for devs |
| **Google Domains** | $12 | N/A | Acquired by Squarespace |
| **AWS Route 53** | $11 | N/A | Best if using AWS |

> 💡 Buy `.com` for professional credibility. `.in` is cheaper and good for India-only platforms.

---

## One-Time Cost Summary

| Item | Cost |
|---|---|
| Domain name (.com, 1 year) | ₹1,000–1,300 |
| Google Play Developer Account | ₹2,100 (optional) |
| Apple Developer Program | ₹8,500/year (not recommended now) |
| Initial server setup (your time) | 4–8 hours |

---

## Before Going Live — Final Checklist

- [ ] Update CORS in `backend/main.py` with production domain
- [ ] Set `VITE_API_URL` to production backend URL and rebuild frontend
- [ ] Confirm `SUPABASE_SERVICE_KEY` is **only in backend env vars**, never in frontend
- [ ] Enable HTTPS on all services (all platforms above provide free SSL)
- [ ] Update WebSocket URL in frontend from `ws://` to `wss://`
- [ ] Remove or disable `POST /api/demo/create-accounts` endpoint
- [ ] Set up Supabase DB backups (Supabase Dashboard → Settings → Database → Backups)
- [ ] Set up billing alerts (AWS: CloudWatch Billing, Render: email alerts, DO: billing alerts)
- [ ] Test WebSocket broadcasts on production domain
- [ ] Test single-device enforcement with 2 phones on the same student account
- [ ] Run the performance index SQL from `backend/optimize_indexes.sql` in Supabase SQL Editor
- [ ] Test Zoom live class creation and join flow end-to-end
- [ ] Test YouTube video playback — confirm students cannot see the URL
- [ ] Share PWA "Add to Home Screen" instructions with all 500 students
- [ ] Set up error monitoring (optional: free tier of [Sentry.io](https://sentry.io))

---

*Stack: React 18 + Vite 5 (frontend) · FastAPI Python (backend) · Supabase PostgreSQL (DB) · YouTube Unlisted (video — free) · Zoom Server-to-Server OAuth (live classes)*
