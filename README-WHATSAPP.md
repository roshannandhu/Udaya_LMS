# Parent WhatsApp Notifications

Send report cards, attendance alerts, exam results, bulk reports and broadcasts to
**parents** over WhatsApp, addressed to a new `students.parent_phone` number.

## Why this is NOT a Baileys/Node microservice

The original request asked for a Baileys (`@whiskeysockets/baileys`) Node microservice.
We did **not** build that, on purpose:

- The repo already has a complete **official** WhatsApp pipeline (Meta Cloud API +
  WANotifier) in `backend/whatsapp.py`, with message logging (`whatsapp_messages`),
  opt-out handling, background batching, scheduled jobs and delivery webhooks.
- The most recent commit (`e7e81ff`) **deliberately removed the Evolution API provider**
  — an unofficial, QR-based WhatsApp-Web integration. Baileys is the *same category*
  (unofficial WhatsApp Web automation) and carries a real risk of the WhatsApp number
  being **banned**. Re-adding it would undo that decision.

So the parent-notification features were wired into the existing official pipeline
instead. There is **no Node service, no QR scan, no extra port, and no
`docker-compose` change.** Everything runs inside the existing FastAPI backend.

## What was added

| File | Purpose |
|------|---------|
| `backend/migrations/add_parent_phone.sql` | Adds `students.parent_phone` |
| `backend/parent_templates.py` | The 5 fixed message templates (report/attendance/exam/fee/broadcast) |
| `backend/whatsapp_parent_routes.py` | An `APIRouter` with the 6 `/api/whatsapp/*` endpoints |
| `frontend/src/pages/teacher/WhatsAppStatus.jsx` | Status dashboard |
| `backend/main.py` | **Additive only**: `parent_phone` on the two student-create paths + one `include_router(...)` line |
| `backend/.env.example` | New `DAILY_MESSAGE_LIMIT=50` |

> The migration lives in `backend/migrations/` (the repo's real convention, e.g.
> `notifications_push.sql`) — not `/database/migrations/`.

## Setup

### 1. Run the migration
In the Supabase SQL Editor, run `backend/migrations/add_parent_phone.sql`:

```sql
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT;
```

It is idempotent — safe to run repeatedly.

### 2. Configure a WhatsApp provider (once)
Provider credentials are **not** in `.env`. In the teacher portal go to
**WhatsApp → Settings** (or `POST /api/teacher/whatsapp/config`) and configure either:
- **Meta Cloud API** — `meta_access_token` + `meta_phone_number_id`, or
- **WANotifier** — `api_key` (and complete verification).

This writes `backend/whatsapp_config.json`. `GET /api/whatsapp/status` reports
`connected: true` once a provider is fully configured.

### 3. Set the daily cap (optional)
In `backend/.env`:

```env
DAILY_MESSAGE_LIMIT=50
```

A soft per-teacher daily cap. Sending past it returns **HTTP 429**. Default `50`.

### 4. Capture parent phone numbers
- **Single student**: `POST /api/admin/create-student` now accepts `parent_phone`.
- **Bulk import**: each `BulkStudentItem` now accepts `parent_phone`.
- Numbers are normalised to India format on send: a bare 10-digit number gets a `91`
  prefix automatically (`9876543210` → `919876543210`). `+`, spaces and a leading `0`
  are stripped.

## Endpoints

All require a teacher JWT (`Authorization: Bearer …`) and respect `whatsapp_opt_out`.
Each logs a row to `whatsapp_messages` exactly like the rest of the WhatsApp module.

| Method · Path | Body | What it does |
|---|---|---|
| `POST /api/whatsapp/send-report/{student_id}` | `{ "term"?: "June 2026" }` | Builds the student's report PDF, uploads it, and sends the **Report Card** template (subject scores pulled from real data) |
| `POST /api/whatsapp/send-attendance-alert/{student_id}` | `{ "date"?: "28 Jun 2026" }` | Sends the **Attendance Alert** template with the student's current attendance % |
| `POST /api/whatsapp/send-exam-result/{exam_id}/{student_id}` | — | Sends the **Exam Result** template (score/total/subject/grade from the attempt); reuses the existing 12h + `test_id` dedup |
| `POST /api/whatsapp/send-bulk-reports` | `{ "standard_id": "…", "term"?: "…" }` | Report card to **every parent** in a standard; >10 recipients run as a background batch |
| `POST /api/whatsapp/send-broadcast-to-parents` | `{ "standard_id": "…", "message": "…" }` | **Broadcast** template to all parents in a standard; batched when large |
| `GET /api/whatsapp/status` | — | `{ connected, provider, today_count, daily_limit, queue_length, recent[20] }` |

Bulk endpoints return `{ "queued": true, "batch_id": "…" }` past 10 recipients; poll
progress with the existing `GET /api/teacher/whatsapp/batches/{batch_id}`.

### Message templates
Defined verbatim in `backend/parent_templates.py`. Report-card subject scores
(Mathematics / Science / English) come from the student's real `subject_radar`,
matched by name, falling back to `—` when a subject isn't present. The Fee Reminder
template is included for use via the broadcast/bulk path (no dedicated fee data source
exists yet).

## Status dashboard

Frontend page: **`/teacher/whatsapp/status`** (`WhatsAppStatus.jsx`). Shows:
- Green/red connection dot (provider configured — official providers have no QR scan)
- Messages sent today vs. the daily limit
- Queue length (messages in flight across running batches)
- The last 20 messages with per-status colour dots

It reads `GET /api/whatsapp/status` via the shared `apiClient`. The route sits under
the existing teacher `whatsapp` nav tab; link to it from the WhatsApp Center if you
want a visible entry point.

## Notes
- `docker-compose.yml` is unchanged — there is no separate service to run.
- `students.phone` (the student's own number) is untouched; parent messages always use
  `students.parent_phone`.
- All edits to `main.py` are additive (two model fields, two guarded post-insert
  updates, and one `include_router` line). No existing behaviour changed.
