# Udaya LMS — Deployment & Cost Guide

> Sizing target: **300 students + 3 teachers** (1 owner/host).
> All prices are **approximate (late 2025 / 2026)** and in **USD** with rough
> **₹INR** conversions (₹1 ≈ $0.012, i.e. $1 ≈ ₹83). **Always re-check the
> provider's live pricing before buying** — cloud prices change often.

---

## TL;DR — what it costs

| Bundle | Backend | Database/Auth | Live class | Static web | **Monthly** | One-time |
|--------|---------|---------------|-----------|------------|-------------|----------|
| **Lean (cheapest)** | Oracle Cloud Always Free ($0) | Supabase Free ($0) | Zoom Pro (~$13) | Vercel Free ($0) | **≈ $13–15 (₹1,100–1,250)** | Play $25 + domain ~$12/yr |
| **Recommended** | DigitalOcean / AWS Lightsail (~$12) | Supabase Pro ($25) | Zoom Pro (~$15) | Vercel Free ($0) | **≈ $50–55 (₹4,200–4,600)** | Play $25 + domain ~$12/yr |
| **Managed-easy** | Render ($7) | Supabase Pro ($25) | Zoom Pro (~$15) | Vercel Free ($0) | **≈ $47 (₹3,900)** | Play $25 + domain ~$12/yr |

> For 300 students + 3 teachers, **most people should start with the Lean bundle**
> (Oracle free VM + Supabase free) and move to the Recommended bundle once usage
> grows or you want backups/reliability guarantees. The single biggest *required*
> recurring cost is **Zoom Pro (~$13–16/mo)** because live classes longer than 40
> minutes need a licensed host.

---

## 1. Architecture — what actually gets deployed

Udaya has **three deployable pieces** plus a few **managed/SaaS services** you
just plug into with API keys:

```
                ┌─────────────────────────────┐
   Browser /    │  FRONTEND (static files)    │   React + Vite build (frontend/dist)
   Capacitor →  │  → Vercel / Netlify / CF    │   PWA, served over CDN
   app          └──────────────┬──────────────┘
                               │ HTTPS + WebSocket
                ┌──────────────▼──────────────┐
                │  BACKEND (FastAPI / uvicorn) │   backend/main.py  (needs a real server)
                │  → VPS or PaaS              │   proxies + WebSocket broadcasts
                └──────┬─────────┬─────────┬───┘
                       │         │         │
              ┌────────▼──┐ ┌────▼────┐ ┌──▼──────────┐
              │ Supabase  │ │  Zoom   │ │  Gemini AI  │   (+ optional Cloudflare Stream
              │ DB/Auth/  │ │ SDK +   │ │  insights   │      for recorded videos)
              │ Storage   │ │ S2S API │ └─────────────┘
              └───────────┘ └─────────┘
```

| Component | Tech | Where it runs | Can be free? |
|-----------|------|---------------|--------------|
| Frontend (web) | React 18 + Vite, PWA, Tailwind | Static CDN host (Vercel/Netlify/Cloudflare Pages) | ✅ Yes |
| Mobile app | Capacitor (already configured) wrapping the web build | Google Play / App Store | App build free; store fees below |
| Backend API | FastAPI + uvicorn (`backend/main.py`) | VPS or PaaS (long-running; uses WebSockets) | ✅ Oracle free tier |
| Database + Auth + File storage | Supabase (Postgres) | Supabase cloud (managed) | ✅ Free tier to start |
| Live classes | Zoom Meeting SDK + Server-to-Server OAuth | Zoom cloud | ❌ host needs Zoom Pro |
| AI report insights | Gemini (OpenAI optional) | Google AI cloud | ✅ mostly free at this scale |
| Recorded video (optional) | Cloudflare Stream, **or** Supabase Storage fallback | Cloudflare / Supabase | ✅ if using Supabase fallback |

> **Why the backend can't be "serverless/free-functions":** it holds a **WebSocket**
> broadcast channel and talks to Zoom/Gemini, so it needs a continuously-running
> process. That's why it goes on a small VM/container rather than Lambda/Edge
> functions.

---

## 2. Backend hosting — provider comparison (the core question)

The FastAPI backend is **lightweight** — it mostly forwards requests to Supabase
and Zoom. For 300 students + 3 teachers, a **1–2 vCPU / 2 GB RAM** box is plenty
(peak load is during a single live class, and the video itself goes through Zoom,
not your server).

| Provider | Plan for 300+3 | vCPU / RAM | **~Monthly USD** | ~₹INR | Notes |
|----------|----------------|------------|------------------|-------|-------|
| **Oracle Cloud** | Always Free (Ampere ARM) | up to 4 / 24 GB | **$0** | ₹0 | 🏆 Best value; "Always Free" VM never expires. Caveat: ARM capacity can be hard to grab in some regions; setup is less hand-holdy. |
| **DigitalOcean** | Basic Droplet | 1 / 2 GB | **$12** | ₹1,000 | Simple, predictable, great docs. App Platform (PaaS, auto-deploy from Git) ≈ $5–12. |
| **AWS** | Lightsail | 1 / 2 GB | **$12** | ₹1,000 | Easiest AWS option, flat price incl. some bandwidth. EC2 `t3.small` ≈ $15 + egress (more knobs, more complexity). |
| **Azure** | B1s VM | 1 / 1 GB | **$8–15** | ₹700–1,250 | App Service B1 ≈ $13/mo (managed). Free $200 credit for 30 days. |
| **Render** | Starter web service | 0.5 / 0.5–1 GB | **$7** | ₹580 | 🏆 Easiest deploy (push-to-deploy, free HTTPS, supports WebSockets). Free tier exists but sleeps — not for production. |
| **Railway / Fly.io** | Hobby | small | **$5–10** | ₹420–830 | Usage-based; convenient. |

**Frontend (static web) hosting: $0.** The built `frontend/dist/` is just static
files. **Vercel**, **Netlify**, and **Cloudflare Pages** all host it free with CDN
+ HTTPS for an audience this size. (You only pay if you exceed generous free
bandwidth, which 300 users won't.)

**Recommendation:**
- **Cheapest, hands-on:** Oracle Always Free VM ($0) for the backend.
- **Easiest, reliable:** Render ($7) or DigitalOcean ($12) for the backend.
- **Frontend:** Vercel free in all cases.

---

## 3. Managed-service costs

### Supabase (database + auth + file storage)
| Tier | Price | What you get | Fits 300+3? |
|------|-------|--------------|-------------|
| **Free** | $0 | 500 MB DB, 1 GB storage, 50,000 monthly active users, 5 GB egress, **projects pause after 1 week idle** | ✅ Fine to launch/pilot |
| **Pro** | **$25/mo (₹2,100)** | 8 GB DB, 100 GB storage, 250 GB egress, **daily backups, no pausing** | ✅ Recommended for real use |

300 students is well within Free-tier *auth* limits. Move to **Pro** when you want
backups, no idle-pausing, and headroom for stored avatars/attachments.

### Zoom (live classes) — *the main required recurring cost*
- The **Meeting SDK is free** to integrate. But to **host meetings longer than 40
  minutes** and host reliably, the **owner account needs Zoom Pro**.
- **Zoom Pro ≈ $13–16/mo (₹1,100–1,350)** for **one** licensed host (your owner).
  Only the owner hosts (students/teachers are view-only), so **1 license is enough**.
- Annual billing is a bit cheaper than monthly.

### Gemini AI (report-card insights)
- Uses `gemini-2.5-flash` — very cheap, and report insights are short/occasional.
- **Effectively $0–5/mo (₹0–420)**; often within the free tier at this scale.
- OpenAI (`gpt-4o-mini`) is supported as an alternative with similar low cost.

### Cloudflare Stream (optional — only if you host recorded videos)
- **$5 per 1,000 minutes stored / month** + **$1 per 1,000 minutes delivered**.
- **$0 if you skip it** — Udaya automatically falls back to **Supabase Storage**
  for videos when Cloudflare isn't configured. For a small library, the Supabase
  fallback is fine and free (within your storage quota).

---

## 4. Total monthly cost — the three realistic setups

> Domain amortized at ~$1/mo; Play Store is a one-time $25 (not monthly).

### A) Lean / cheapest — ≈ **$13–15/mo (₹1,100–1,250)**
- Backend: **Oracle Cloud Always Free** — $0
- DB/Auth/Storage: **Supabase Free** — $0
- Web hosting: **Vercel Free** — $0
- Live classes: **Zoom Pro** — ~$13
- Video: Supabase Storage fallback — $0
- AI: Gemini free tier — ~$0

### B) Recommended production — ≈ **$50–55/mo (₹4,200–4,600)**
- Backend: **DigitalOcean Droplet / AWS Lightsail** — ~$12
- DB/Auth/Storage: **Supabase Pro** (backups, no pausing) — $25
- Web hosting: **Vercel Free** — $0
- Live classes: **Zoom Pro** — ~$15
- AI: Gemini — ~$0–3
- (Optional Cloudflare Stream if you publish many recordings — +~$5)

### C) Managed-easy — ≈ **$47/mo (₹3,900)**
- Backend: **Render Starter** — $7
- DB/Auth/Storage: **Supabase Pro** — $25
- Live classes: **Zoom Pro** — ~$15
- Web hosting: **Vercel Free** — $0

**One-time / yearly across all:** Google Play **$25 one-time**, domain **~$10–13/yr**,
(Apple App Store **$99/yr** only if you also ship iOS).

---

## 5. Deploying the mobile app (best way)

**The project already uses Capacitor** (`@capacitor/android`, `@capacitor/ios`,
and `npm run android` / `npm run ios` scripts), so the best path is already
chosen: **Capacitor wraps your existing web build into a native app** — no
rewrite, one codebase for web + Android + iOS.

### Build & publish to Google Play (Android)
1. Point the app at your **deployed backend** (set `VITE_API_URL` to your live API
   URL) and `npm run build`.
2. `npx cap sync android` → `npx cap open android` (opens Android Studio).
3. In Android Studio: **Build → Generate Signed Bundle (AAB)** with a release
   keystore (keep that keystore safe — you need it for every update).
4. Create a **Google Play Developer account — $25 one-time (₹2,100)**, create the
   app listing, upload the AAB, fill the store listing + privacy policy, submit.
   First review typically takes a few days.

### Apple App Store (only if you want iOS)
- `npm run ios`, build/archive in Xcode (needs a Mac).
- **Apple Developer Program — $99/year (₹8,300)**.

### Zero-cost alternative: PWA "install"
- Udaya is **already a PWA** (`vite-plugin-pwa`). Users can "Add to Home Screen"
  straight from the browser — installable, offline-capable, **no store fees, no
  review**. Good for launch or for users you don't want to route through a store.

**Recommendation:** ship the **PWA immediately ($0)**, and publish the **Capacitor
Android app to Google Play ($25 one-time)** when you want a real Play Store
presence. Add iOS later only if there's demand (it carries the $99/yr cost + a Mac).

---

## 6. Domain for "Udaya"

> Exact availability changes daily — check at a registrar. "udaya.com" itself is
> almost certainly taken/premium, so use a variant.

| TLD | Typical 1st-year | Renewal | Notes |
|-----|------------------|---------|-------|
| `.com` | **$10–13/yr (₹850–1,100)** | ~$13–15 | Most trusted/universal. Best if available. |
| `.in` | **$3–8/yr (₹250–700)** | ~$8–10 | Great for an India-focused tuition brand; cheap first year. |
| `.app` | **~$14/yr (₹1,200)** | ~$14 | Modern, **forces HTTPS** (good for an app). |
| `.org` / `.co` | **$10–30/yr** | varies | `.org` fits education; `.co` is a `.com` alternative. |
| `.edu.in` | restricted | — | Reserved for recognized institutions — likely not eligible. |

**Suggested available-style names:** `udayalms.com`, `udaya.app`,
`udayalearning.in`, `getudaya.com`, `udayaedu.in`, `myudaya.com`.

**Where to buy (registrars):**
- **Cloudflare Registrar** — sells at **wholesale/at-cost** (cheapest renewals, no
  markup) + free DNS & SSL. 🏆 Best long-term value (requires using Cloudflare DNS).
- **Namecheap / Porkbun** — cheap, clean, good support.
- **GoDaddy / Hostinger / BigRock** — popular in India; watch for higher renewal
  prices after a cheap first year.

**Recommendation:** register a `.com` (or `.in` for budget) at **Cloudflare
Registrar** or **Namecheap**, then put the whole site behind **free Cloudflare DNS
+ SSL**.

---

## 7. Step-by-step deploy checklist

**Backend (FastAPI):**
1. Provision the server (Oracle free VM / DigitalOcean / Render).
2. Install Python deps: `pip install -r backend/requirements.txt`.
3. Set environment variables (`backend/.env`):
   - `SUPABASE_URL`, `SUPABASE_KEY` (anon), `SUPABASE_SERVICE_KEY`
   - Zoom: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` (S2S app),
     `ZOOM_SDK_KEY`, `ZOOM_SDK_SECRET` (Meeting SDK app), `ZOOM_WEBHOOK_SECRET_TOKEN`
   - Optional: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`
   - AI key (Gemini/OpenAI) — stored via teacher settings.
4. Run uvicorn under a **process manager** (systemd / `pm2` / Docker) behind a
   reverse proxy (Caddy/Nginx) for **HTTPS** — required for camera/mic + Zoom.
5. Configure the **Zoom webhook** (`meeting.started` / `meeting.ended`) to point at
   your **public** `https://<api-domain>/api/zoom/webhook` so live classes flip to
   "live" automatically.

**Frontend (web):**
1. Set `frontend/.env.local` → `VITE_API_URL=https://<your-api-domain>/api`.
2. `npm run build` → deploy `frontend/dist/` to Vercel/Netlify/Cloudflare Pages.
3. Ensure backend **CORS** allows your web domain.

**Database:** run `backend/schema.sql` in the Supabase SQL editor (tables + RLS),
then bootstrap the first teacher (`backend/seed_teacher.py`).

---

## 8. Scaling beyond ~1,000–2,000 users

- **Backend:** bump to 2 vCPU / 4 GB (DO ~$24, Lightsail ~$24) — still one box.
- **Supabase:** add a compute add-on / larger instance as DB load grows.
- **Zoom:** add licenses only if you need **multiple simultaneous live classes**
  (each concurrent host needs its own license). One owner-host = one license.
- **Video:** move recordings to **Cloudflare Stream** once the library/egress grows
  past Supabase Storage comfort.
- Put **Cloudflare** in front of everything (free) for CDN, caching, and DDoS
  protection.

---

*Prices approximate as of late 2025 / early 2026 — verify on each provider's site
before purchasing. This guide reflects Udaya's actual stack: React/Vite + Capacitor
frontend, FastAPI backend, Supabase, Zoom Meeting SDK, and Gemini AI.*
