# Migrating Zoom + Resend to Your Own Accounts

> Guide for switching the LMS's third-party integrations off the **client's** accounts and onto
> **your own**. Nothing in `backend/main.py` changes — every credential is read from
> `/opt/udaya/backend/.env` on the EC2 box. You recreate the apps/keys under your accounts and swap
> environment variables, then reload the container.

**Where credentials come from in code:** Zoom → `backend/main.py:56-61`; Resend → `backend/main.py:1090-1091`.
**Where they live in production:** `/opt/udaya/backend/.env` (server-only, git-ignored).
**Reload after any `.env` change:** `cd /opt/udaya && docker compose up -d`.

---

## PART A — ZOOM

Live classes use **two separate Zoom Marketplace apps + one webhook**, all owned by whichever account
created them. Moving accounts = recreate all three and replace **6 env vars**.

| Credential (env var) | Source | Used by (`backend/main.py`) |
|---|---|---|
| `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | **Server-to-Server OAuth app** | `zoom_get_token()` → create/patch/delete meeting, meeting status, ZAK host token, lock screen-share, attendance report |
| `ZOOM_SDK_KEY`, `ZOOM_SDK_SECRET` | **Meeting SDK app** | `zoom_generate_sdk_signature()` → in-browser embedded meeting (`ZoomMeetingView.jsx`) |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | **Webhook (Event Subscription)** on the S2S app | `zoom_webhook()` (`main.py:8217`) → flips class status live/ended |

Webhook endpoint (already coded): **`POST https://api.udaya-learn.com/api/zoom/webhook`**

### 1. Account & plan
- Sign in to Zoom with **your own** account. This account is also the **host** — meetings are created
  under `users/me`, so whoever starts a class (e.g. from the Zoom mobile app) logs in with *this*
  account.
- **Use Zoom Pro or higher.** Free caps group meetings at **40 minutes** and restricts the participant
  **Report API** (attendance) — `zoom_get_participants()` returns empty on Free.

### 2. Server-to-Server OAuth app
`marketplace.zoom.us` → **Develop → Build App → Server-to-Server OAuth**
- **App Credentials** tab → copy **Account ID, Client ID, Client Secret**.
- **Scopes** tab → add (matching the exact API calls the code makes):
  - `meeting:read:admin` — get-a-meeting status (`zoom_meeting_live_state`)
  - `meeting:write:admin` — create / patch / delete meeting
  - `user:read:admin` — `GET /users/me/token?type=zak` (ZAK) + `users/me`
  - `user:write:admin` — `PATCH /users/me/settings` (host-only screen share)
  - `report:read:admin` — `GET /report/meetings/{id}/participants` (attendance)
  - *(If Zoom shows granular scopes, pick the read/write items under each group.)*
- **Activate** the app.

### 3. Webhook (on that same S2S app)
**Feature / Event Subscriptions** → add a subscription:
- **Endpoint URL:** `https://api.udaya-learn.com/api/zoom/webhook`
- **Events:** Meeting → **Meeting Started** + **Meeting Ended** (only these two are handled).
- Copy the **Secret Token** → `ZOOM_WEBHOOK_SECRET_TOKEN`.
- The backend auto-answers Zoom's `endpoint.url_validation` challenge (`main.py:8236`) using that
  token — so set the env var (step 5) and reload **before** clicking *Validate*, or just re-validate
  after the restart.

### 4. Meeting SDK app
`Develop → Build App → Meeting SDK` (a General app with Meeting SDK embed also works)
- Copy **Client ID → `ZOOM_SDK_KEY`** and **Client Secret → `ZOOM_SDK_SECRET`**. **Activate.**

### 5. Put the 6 values on the box
`/opt/udaya/backend/.env`:
```
ZOOM_ACCOUNT_ID=...
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
ZOOM_SDK_KEY=...
ZOOM_SDK_SECRET=...
ZOOM_WEBHOOK_SECRET_TOKEN=...
```
Then `cd /opt/udaya && docker compose up -d`.

### 6. Verify
1. **Auth:** `docker compose exec -T api python backend/test_zoom.py` → expect a token, not a 4xx.
2. **Webhook:** Event Subscription shows **Validated**.
3. **Full flow:** teacher portal → schedule a **live class** → meeting/join URL created → start it from
   the Zoom app (signed in as your account) → class flips **live** (webhook) → end → flips **ended** →
   "End class" pulls the attendance roster (Pro plan).

### Gotchas
- **Recreate, don't transfer** — Zoom apps can't move between accounts; all 6 values change.
- **Two distinct apps** — S2S OAuth ≠ Meeting SDK; different credentials, different code paths.
- **One host identity** — the design assumes a single host = the S2S app owner (`main.py:784`). Host
  with the same account that owns the apps.

---

## PART B — RESEND (transactional email)

### What it does here
- Used by **one** function: `send_otp_email()` (`main.py:1169`) → `POST https://api.resend.com/emails`.
- Sends the **teacher two-step-verification (2FA) login code** only (Settings → Security →
  `security_two_step_verification`). Students never trigger it.
- **Optional & fail-soft:** if `RESEND_API_KEY` is empty, the OTP step is skipped and login still works
  (`main.py:1355`). Nothing breaks without Resend.
- Env vars (`main.py:1090-1091`): `RESEND_API_KEY`, `RESEND_FROM` (defaults to `onboarding@resend.dev`).

### The sender catch
`onboarding@resend.dev` only delivers to the **email that owns the Resend account**. To send OTP codes
to *any* teacher, you must **verify a domain** in Resend and send from it (e.g. `noreply@udaya-learn.com`).

### Decision
- **No teacher 2FA?** → skip Resend entirely. Leave `RESEND_API_KEY` blank. Zero impact.
- **Want 2FA codes to send?** → do B1–B4 under your own Resend account.

### B1. Account + key
`resend.com` → **API Keys → Create** → copy `re_...` → `RESEND_API_KEY`.

### B2. Verify `udaya-learn.com` in Resend
Resend → **Domains → Add Domain** → `udaya-learn.com`, then add the shown records in **Cloudflare**:
- **DKIM** TXT (e.g. `resend._domainkey …`)
- **SPF/Return-Path** on a **`send.` subdomain** (MX + `v=spf1 include:amazonses.com ~all` on
  `send.udaya-learn.com`)
- Skip Resend's suggested DMARC — **keep your existing `_dmarc`**.
- Set the added CNAME/TXT records to **DNS only (grey cloud)**.

> ⚠️ **No conflict with the GoDaddy mailbox.** Resend uses the **`send.` subdomain** for SPF/MX and its
> own DKIM selector, so the root `@` MX (`smtp.secureserver.net`) and root SPF
> (`v=spf1 include:secureserver.net -all`) are untouched. DMARC `p=reject` still passes for Resend mail
> via **DKIM alignment**.

### B3. Env vars
`/opt/udaya/backend/.env`:
```
RESEND_API_KEY=re_...
RESEND_FROM=noreply@udaya-learn.com
```
Then `cd /opt/udaya && docker compose up -d`.

### B4. Verify
1. Resend Domains page shows **Verified**.
2. Teacher portal → Settings → Security: OTP-ready hint on (`otp_email_ready`, `main.py:9033`).
3. Enable 2FA, log in from an untrusted device → code email arrives from `noreply@udaya-learn.com`,
   lands in Inbox, passes SPF/DKIM/DMARC.

---

## Shared notes
- **Secrets only in `/opt/udaya/backend/.env`** (git-ignored) — never commit them.
- Reload the single uvicorn worker after each change: `docker compose up -d` in `/opt/udaya`.
- The Cloudflare zone now carries website/api/files + GoDaddy mailbox + (optionally) Resend `send.`
  records — they coexist via distinct names/subdomains. Don't touch the existing
  website/api/files/mailbox records.
- **Revoke the old client's** Zoom apps and Resend key once cutover is verified.
