# Parent WhatsApp Notifications (Baileys)

Send report cards, attendance alerts, exam results, bulk reports and broadcasts to
**parents** over WhatsApp, using a **Baileys** Node microservice as the transport:
it logs into a WhatsApp number by QR scan (once) and sends as an ordinary WhatsApp
Web client. The FastAPI backend renders the messages and calls the microservice.

## ⚠️ Read this first — ban risk

Baileys is an **unofficial** WhatsApp Web client. WhatsApp can **permanently ban** the
number with no appeal. **Use a dedicated / spare SIM, never your personal or main
business number.** The warm-up ramp and 4-second pacing below exist to reduce (not
eliminate) that risk. If you want zero ban risk, use the official Meta Cloud API /
WANotifier providers instead — those are still wired into `backend/whatsapp.py`.

## Architecture

```
Teacher → /teacher/whatsapp/status ──┐
                                     ▼
FastAPI (backend)  ──renders text/PDF──►  whatsapp-service (Node + Baileys)
  • parent_templates.py (5 templates)        • QR login (persisted, scan once)
  • whatsapp_parent_routes.py (endpoints)    • queue: 4s gap, warm-up, dedupe, retry
  • BaileysProvider → whatsapp_client.py     • logs/messages.log
                                             • WhatsApp ──► parent phones
```

Templating, recipient resolution, opt-out and `whatsapp_messages` logging stay in
FastAPI (the official pipeline). Baileys is **only the transport** — chosen via
`provider: "baileys"` in `whatsapp_config.json`.

## Files

| File | Purpose |
|------|---------|
| `whatsapp-service/index.js` | Baileys socket (QR, auto-reconnect) + internal HTTP API |
| `whatsapp-service/queue.js` | 4s-paced queue: warm-up cap, dedupe, retry-once, log file |
| `whatsapp-service/package.json` · `Dockerfile` · `.env.example` | service deps / image / config |
| `backend/whatsapp_client.py` | async HTTP client FastAPI → Node |
| `backend/whatsapp.py` → `BaileysProvider` | provider adapter (`get_provider()` returns it) |
| `backend/whatsapp_outbox.py` | buffers sends while the Node service is briefly down |
| `backend/whatsapp_parent_routes.py` | the 6 `/api/whatsapp/*` endpoints + `enable-baileys` |
| `backend/parent_templates.py` | the 5 fixed message templates |
| `backend/migrations/add_parent_phone.sql` | `students.parent_phone` |
| `frontend/src/pages/teacher/WhatsAppStatus.jsx` | dashboard with QR + status |
| `docker-compose.yml` | adds the `whatsapp` service + persisted volumes |

> The migration lives in `backend/migrations/` (repo convention, e.g.
> `notifications_push.sql`), not `/database/migrations/`. Port is **3100** (3001 is the
> Vite dev server).

## Setup

### 1. Run the migration
In the Supabase SQL Editor, run `backend/migrations/add_parent_phone.sql`:

```sql
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT;
```

### 2. Configure secrets
Pick one long random string as the shared token and put the **same value** in both env
files:

`whatsapp-service/.env` (copy from `.env.example`):
```env
PORT=3100
SHARED_TOKEN=<long-random-string>
DAILY_MESSAGE_LIMIT=50
WARMUP_ENABLED=true
SESSION_DIR=./session
LOG_FILE=./logs/messages.log
```

`backend/.env`:
```env
WHATSAPP_SERVICE_URL=http://whatsapp:3100
SHARED_TOKEN=<same-long-random-string>
DAILY_MESSAGE_LIMIT=50
```

### 3. Start everything
```bash
docker compose up -d --build
```
This runs the existing `api` + `caddy` **and** the new internal `whatsapp` service
together. The `whatsapp` service has **no published port** — it's only reachable inside
the compose network at `http://whatsapp:3100`, so no Cloudflare / security-group change
is needed.

### 4. Pair your number (scan once)
1. Open **`/teacher/whatsapp/status`** in the teacher portal.
2. If no transport is active, click **Connect WhatsApp** (this sets `provider: baileys`).
3. A **QR code** appears. On your **dedicated phone**: WhatsApp → **Linked Devices** →
   *Link a device* → scan it.
4. The dot turns **green** (`connected: true`) and the QR disappears. The login is saved
   to the `wa_session` volume — **you never scan again**, even across redeploys.

### Auto-deploy note (EC2)
`autodeploy.sh` rebuilds containers when `backend/`, `Dockerfile`, or
`docker-compose.yml` change. The WhatsApp login and warm-up/dedupe state live on the
**`wa_session` named volume**, so those rebuilds do **not** force a re-scan. (A naive
Baileys setup that stores the session inside the image would re-pair on every deploy —
this avoids that.)

### 5. Capture parent phone numbers
- **Single student**: `POST /api/admin/create-student` accepts `parent_phone`.
- **Bulk import**: each row accepts `parent_phone`.
- Numbers are normalised to India format on send: a bare 10-digit number gets a `91`
  prefix (`9876543210` → `919876543210`); `+`, spaces and a leading `0` are stripped.

## Endpoints

All require a teacher JWT and respect `whatsapp_opt_out`. Each logs a `whatsapp_messages`
row, and the Node service writes a `logs/messages.log` line.

| Method · Path | Body | What it does |
|---|---|---|
| `POST /api/whatsapp/send-report/{student_id}` | `{ "term"?: "June 2026" }` | Builds the report PDF, uploads it, sends the **Report Card** template (subject scores from real data) |
| `POST /api/whatsapp/send-attendance-alert/{student_id}` | `{ "date"?: "28 Jun 2026" }` | **Attendance Alert** with current attendance % |
| `POST /api/whatsapp/send-exam-result/{exam_id}/{student_id}` | — | **Exam Result** (score/total/subject/grade); reuses the 12h + `test_id` dedup |
| `POST /api/whatsapp/send-bulk-reports` | `{ "standard_id": "…", "term"?: "…" }` | Report card to **every parent** in a standard; >10 → background batch |
| `POST /api/whatsapp/send-broadcast-to-parents` | `{ "standard_id": "…", "message": "…" }` | **Broadcast** to all parents in a standard |
| `GET /api/whatsapp/status` | — | `{ connected, provider, qr, today_count, queue_length, warmup_limit, recent[20] }` |
| `POST /api/whatsapp/enable-baileys` | — | Sets `provider: baileys` so pairing + sends use the microservice |

Bulk endpoints return `{ "queued": true, "batch_id": "…" }` past 10 recipients; poll
`GET /api/teacher/whatsapp/batches/{batch_id}`.

## How the transport behaves (queue.js)

- **4-second gap** between every send.
- **Warm-up cap** by week since first connect: **50 → 100 → 200 → 500** per day
  (`DAILY_MESSAGE_LIMIT` sets the week-1 number; `WARMUP_ENABLED=false` uses a flat cap).
  Past the cap the queue holds; `queue_length` reflects what's waiting.
- **Dedupe**: the same message (per-recipient content) is never sent twice — persisted to
  `session/dedupe.json`.
- **Retry**: a failed send is retried **once after 60s**, then logged as `failed`.
- **Node-down buffer**: if the microservice is briefly unreachable, FastAPI buffers the
  send to `backend/whatsapp_outbox.json` and a background loop delivers it once the
  service answers `/health` again.
- **Log**: `whatsapp-service/logs/messages.log` — `ISO-timestamp · phone · status · error`.

## Message templates
Defined verbatim in `backend/parent_templates.py` (report card, attendance, exam, fee
reminder, broadcast). Report-card subject scores come from the student's real
`subject_radar`, falling back to `—` when a subject isn't present. Baileys sends the
pre-rendered text — there is no separate `templates.js`, since templating stays in Python
(the provider-adapter design).

## Troubleshooting
- **Dot won't turn green / no QR**: check the `whatsapp` container logs
  (`docker compose logs -f whatsapp`); confirm `SHARED_TOKEN` matches in both `.env`s.
- **Re-asked to scan after a deploy**: the `wa_session` volume isn't mounted — verify the
  `volumes:` block in `docker-compose.yml`.
- **Sends log as failed `whatsapp-service unreachable`**: the Node container is down;
  messages buffer in `whatsapp_outbox.json` and drain on recovery.
- **Number got restricted/banned**: that's the inherent Baileys risk — switch to a new
  dedicated number (delete the `wa_session` volume to force a fresh pairing) or move to
  the official Meta/WANotifier provider.
