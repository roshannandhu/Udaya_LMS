# WhatsApp Management Module — Full Working Reference

> Teacher-facing WhatsApp communication console for the Tutoria/Udaya LMS.
> Lets a teacher message **parents** (the phone captured at student import) with
> manual broadcasts, criteria-based report cards, automated schedules, templates,
> a dashboard, and a read-only inbox — all billed through the **WhatsApp Business
> API via WANotifier (BSP)**.

- **Branch:** `whatsapp-message-controller`
- **Page route:** `/teacher/whatsapp`
- **Stack:** FastAPI (`backend/main.py` + `backend/whatsapp.py`) · React + Vite + Tailwind + recharts · Supabase (Postgres + Storage)

---

## Table of contents
1. [What it does & why](#1-what-it-does--why)
2. [The hard WhatsApp constraint (24h window + templates)](#2-the-hard-whatsapp-constraint)
3. [Architecture overview](#3-architecture-overview)
4. [Data model (tables)](#4-data-model)
5. [Configuration & secrets](#5-configuration--secrets)
6. [Provider adapter (`whatsapp.py`)](#6-provider-adapter)
7. [Cost model](#7-cost-model)
8. [Report generators](#8-report-generators)
9. [Backend API reference](#9-backend-api-reference)
10. [Webhook (delivery status + inbound inbox)](#10-webhook)
11. [Automation / scheduler](#11-automation--scheduler)
12. [Frontend page & components](#12-frontend-page--components)
13. [End-to-end flows](#13-end-to-end-flows)
14. [Setup & deployment](#14-setup--deployment)
15. [Decisions & deferred scope](#15-decisions--deferred-scope)
16. [File map](#16-file-map)

---

## 1. What it does & why

The product goal is **keeping parents looped into their child's learning** with
near-zero effort and near-zero cost. Three outcomes:

| Outcome | Examples |
|---|---|
| **Onboarding** | Welcome + login credentials the moment a student is created |
| **Awareness** | Periodic report digests, exam mark reports, attendance status |
| **Intervention** | "Marks < 20 → needs to focus", low-attendance alerts, with guidance |

Design principles: right message at the right moment at the lowest cost (cheap
**Utility** templates); teacher always in control (nothing auto-sends unconfigured);
respect the parent (opt-out, quiet hours); personal, not robotic.

---

## 2. The hard WhatsApp constraint

WhatsApp Business API does **not** let you freely send arbitrary text/media to a
parent. There are two send modes:

| Mode | When allowed |
|---|---|
| **Free-form** (any text/media) | Only inside a **24-hour customer-service window**, opened when the *parent* messages you first |
| **Template** (pre-approved by Meta, fixed body with `{{1}}` slots + optional media header) | Anytime — this is the path for business-initiated messages |

Consequences baked into the module:
- The **primary send path is template-based**. Free-form is gated: the backend
  rejects a free-form send unless **every** recipient has an open session
  (`session_open`), which is conservatively `False` until inbound tracking proves otherwise.
- A full **Template management** UI exists (create → submit to Meta → track approval).
- Reports/credentials use the **Utility** category (cheapest, transactional, legitimate).

---

## 3. Architecture overview

```
Teacher (browser)
  │  /teacher/whatsapp  (React page, tabs)
  ▼
FastAPI  /api/teacher/whatsapp/*   (backend/main.py — endpoints + auth + scheduler)
  │
  ├── backend/whatsapp.py          (provider adapter, report builders, cost helper, config I/O)
  │        └── WANotifierProvider → https://api.wanotifier.com   (the BSP → Meta)
  │
  ├── Supabase Postgres            (whatsapp_templates / _messages / _scheduled_jobs / _inbox)
  └── Supabase Storage             (public "whatsapp" bucket — media + generated report PDFs/images)

Provider → (delivery status & inbound replies) → POST /api/teacher/whatsapp/webhook
```

- **Endpoints live in `main.py`** (preserving the repo's "routes in main.py" convention).
- **Adapter + report rendering + config live in `whatsapp.py`** to keep `main.py` lean.
- **Provider is swappable** behind `WhatsAppProvider`; WANotifier is the first implementation.

---

## 4. Data model

All tables are service-role only (RLS `deny_all`) — the backend uses the service
key; the frontend never touches them directly. Defined in `backend/schema.sql`.

### `whatsapp_templates`
| Column | Notes |
|---|---|
| `id`, `teacher_id` | owner scope |
| `name` | lowercase_with_underscores (Meta requirement) |
| `category` | `utility` \| `marketing` \| `auth` |
| `language` | default `en` |
| `header_type` | `none` \| `image` \| `document` \| `audio` \| `text` |
| `body_text` | body with `{{1}}`, `{{2}}` slots |
| `variables` | JSONB array of labels |
| `provider_template_id` | id returned by WANotifier |
| `status` | `draft` \| `pending` \| `approved` \| `rejected` |

### `whatsapp_messages` (outbound send log — drives History, spend, donut)
| Column | Notes |
|---|---|
| `id`, `teacher_id`, `standard_id`, `student_id` | scope + joins |
| `to_phone`, `template_name`, `body_text`, `media_url`, `media_type`, `category` | message content |
| `status` | `queued` \| `sent` \| `delivered` \| `read` \| `failed` \| `not_configured` |
| `provider_message_id` | matched by the delivery webhook |
| `cost_amount`, `currency` | billed only on a billable (non-failed) status |
| `error`, `job_id`, `sent_at`, `created_at` | diagnostics + automation link |

### `whatsapp_scheduled_jobs` (automation)
| Column | Notes |
|---|---|
| `name`, `target_type` (`all`\|`classes`), `target_ids` | who |
| `trigger_type` (`interval`\|`post_exam`\|`fixed_date`), `trigger_config` | when (`{every:"1 week"}` / `{at}` / `{test_id}`) |
| `mode` (`template`\|`freeform`\|`report`), `template_name`, `body_text`, `report_format`, `criteria` | what |
| `category`, `quiet_hours`, `active`, `next_run_at`, `last_run_at` | controls |

### `whatsapp_inbox` (read-only inbound replies)
| Column | Notes |
|---|---|
| `id`, `teacher_id` | scope |
| `from_phone`, `student_id`, `student_name`, `standard_id`, `standard_name` | resolved by phone match |
| `body`, `media_url`, `media_type`, `provider_message_id` | message |
| `read_by_teacher`, `received_at`, `created_at` | unread tracking |

### `students.whatsapp_opt_out` (BOOLEAN)
Per-parent opt-out. Opted-out parents are excluded from every recipient resolver
and cost estimate (DLT / policy compliance).

---

## 5. Configuration & secrets

- WhatsApp credentials (API key, sender, provider) are stored **server-side only**
  via `wa.get_wa_config()` / `wa.save_wa_config()` (a JSON file), **never** returned
  to the client in full. `GET /config` returns the key **masked** (`••••1234`)
  through `wa.mask_key()`.
- Non-secret prefs also live there: per-category `rates`, `currency`, `quiet_hours`,
  `auto_welcome`, `welcome_template`.
- The Settings tab writes config via `POST /config`; a blank/masked API-key field
  never overwrites the stored key.

---

## 6. Provider adapter

`backend/whatsapp.py`:

```python
class WhatsAppProvider:              # abstract contract
    name, configured
    async send_template(to, template, variables, media_url, media_type, language)
    async send_freeform(to, text, media_url, media_type)
    async create_template(name, category, language, body_text, header_type, variables)
    async get_template_status(provider_template_id)
    async get_session_state(to)      # is the 24h window open?

class UnconfiguredProvider(WhatsAppProvider):   # graceful no-op when no API key
    # every send returns {status: "not_configured"} — nothing goes out, nothing billed

class WANotifierProvider(WhatsAppProvider):     # concrete BSP
    BASE = "https://api.wanotifier.com/v1"
    # _post() wraps auth; send_*/create_template/get_template_status call the REST API
    # get_session_state() → False (no inbound store assumed, so free-form stays gated)

def get_provider(config=None) -> WhatsAppProvider   # factory; picks WANotifier or Unconfigured
```

Every send returns a uniform dict: `{status, provider_message_id, error}`. This is
what makes the rest of the system provider-agnostic.

---

## 7. Cost model

```python
DEFAULT_RATES = {"utility": 0.14, "marketing": 0.78, "auth": 0.13}   # INR, editable in Settings
estimate_cost(recipient_count, category) -> {count, rate, amount, currency}
```

- **Pre-send estimate:** Compose/Reports footer shows `count × rate = ₹total`
  (`POST /estimate`).
- **Actual spend:** summed from `whatsapp_messages.cost_amount`. A row is billed
  only when the provider returns a billable status (not `failed`/`not_configured`).
- **Dashboard:** `GET /stats` returns `spend.month` (current calendar month) and
  `spend.total`.

Example: 30 parents × ₹0.14 utility ≈ **₹4.20**.

---

## 8. Report generators

In `whatsapp.py`, consuming the existing `GET /api/students/{id}/report/v2` shape
(avg score, attendance, rank, subject radar, recent tests):

| Function | Output | Used for |
|---|---|---|
| `build_report_text(report)` | WhatsApp-friendly text summary | text format |
| `build_report_pdf(report)` | A4 PDF bytes (reportlab) | PDF attachment |
| `build_report_image(report)` | 800×1000 PNG card (Pillow) | image card |
| `resolve_band(score, criteria)` | matches a score to a criteria band | rule-based messaging |

Generated PDFs/images are uploaded to the public **`whatsapp` Supabase bucket** to
get a URL the provider can attach.

Requires `reportlab` and `Pillow` (in `backend/requirements.txt`).

---

## 9. Backend API reference

All under `/api/teacher/whatsapp`, teacher-only (`_wa_require_teacher`), except the
webhook (provider-signed, unauthenticated).

### Config
| Method | Path | Purpose |
|---|---|---|
| GET | `/config` | `{configured, provider, sender, api_key_masked, rates, currency, auto_welcome, welcome_template, quiet_hours}` |
| POST | `/config` | Update config; blank/masked key never overwrites stored key |

### Recipients & media
| Method | Path | Purpose |
|---|---|---|
| GET | `/recipients?standard_ids=` | Parents grouped by class: `{groups:[{standard_id, standard_name, students:[{id,name,phone,student_code,opted_out,session_open}]}], total, with_phone}` |
| POST | `/upload-media` | FormData → `whatsapp` bucket → `{url, type, filename}` |

### Send & estimate
| Method | Path | Purpose |
|---|---|---|
| POST | `/estimate` | `{count, rate, amount, currency}` |
| POST | `/send` | Manual send (template or free-form, optional media, `test_to_self`). Writes one `whatsapp_messages` row per recipient → `{results, sent, total_cost, configured}` |

### History & dashboard
| Method | Path | Purpose |
|---|---|---|
| GET | `/messages?limit=&status=` | History rows (enriched with `student_name` + `standard_name`) + `spend_total` |
| GET | `/stats` | Dashboard: `{counts, totals, spend:{month,total}, performance:[{status,count}], recent:[…enriched], jobs:[…]}` |

### Templates
| Method | Path | Purpose |
|---|---|---|
| GET | `/templates` | List teacher templates |
| POST | `/templates` | Create (draft, or `submit:true`) |
| POST | `/templates/{id}/submit` | Submit a draft to Meta via WANotifier |
| GET | `/templates/{id}/status` | Refresh approval status |
| DELETE | `/templates/{id}` | Delete |

### Reports & criteria
| Method | Path | Purpose |
|---|---|---|
| POST | `/preview-criteria` | Dry-run: per student → resolved band + message (no send) |
| POST | `/send-reports` | Generate (pdf/image/text) + send per criteria band |
| POST | `/send-welcome` | Onboarding credentials/welcome |

### Automation jobs
| Method | Path | Purpose |
|---|---|---|
| GET | `/jobs` | List |
| POST | `/jobs` | Create |
| PUT | `/jobs/{id}` | Update |
| DELETE | `/jobs/{id}` | Delete |
| POST | `/jobs/{id}/toggle` | Active on/off |
| POST | `/jobs/{id}/run-now` | Execute immediately |

### Inbox (read-only)
| Method | Path | Purpose |
|---|---|---|
| GET | `/inbox` | Inbound replies grouped by parent: `{threads:[{from_phone, student_name, standard_name, unread, messages:[…]}], unread, count}` |
| POST | `/inbox/mark-read` | Mark a thread / messages read |

### Webhook
| Method | Path | Purpose |
|---|---|---|
| POST | `/webhook` | Provider callbacks — delivery status **and** inbound replies (see §10) |

---

## 10. Webhook

`POST /api/teacher/whatsapp/webhook` is **unauthenticated** (provider-signed) and
handles two payload kinds in one endpoint:

1. **Delivery status update** — if the payload has `id`/`message_id` + `status`, it
   updates the matching `whatsapp_messages.status` (`sent → delivered → read`, or `failed`).
2. **Inbound parent reply** — if the payload carries a sender phone + body/media (and
   no status, or an explicit `direction`/`type` of inbound), it:
   - resolves the parent via `_wa_match_inbound()` (phone → `students.phone` using
     `_wa_phone_variants()`, which tolerates `+`, country code `91`, last-10-digits),
   - derives the owning teacher + class from the student's standard,
   - inserts a row into `whatsapp_inbox`.

All branches are exception-guarded — a malformed payload just returns `{"ok": true}`.

> Configure this URL in the WANotifier dashboard as the status + incoming-message webhook.

---

## 11. Automation / scheduler

- A lightweight **in-process poller** `_whatsapp_scheduler_loop()` runs on FastAPI
  startup (~25s settle, then every 60s). The backend is always-on uvicorn (not serverless).
- `_wa_execute_job(job)` resolves recipients, honours **quiet hours**, applies a
  **12-hour dedupe** (a job won't re-message the same parent within 12h), sends via
  the normal send path, then advances `next_run_at` (or deactivates one-shot triggers).
- Triggers: `interval` (every 1 day/week/month), `fixed_date` (`{at}`), `post_exam`.
- Jobs can send a template, free-form, or a **criteria-based report** (reusing §8 + bands).

---

## 12. Frontend page & components

**Page:** `frontend/src/pages/teacher/WhatsAppMessageControllerPage.jsx` — a tabbed
shell (pill tab bar, `max-w-5xl`). On load it fetches config + templates + recipients.
A banner prompts for setup until an API key is saved.

**Tabs:** `Overview · Compose · Reports · Automation · Templates · Inbox · History · Settings`
(Overview is the default landing tab).

| Tab / component | File | What it does |
|---|---|---|
| **Overview** | `whatsapp/OverviewTab.jsx` | Dashboard from `GET /stats`: month/total spend pills, 4 KPI `StatCard`s (Total/Delivered/Read/Failed), performance donut, quick actions, recent-messages table, automation-rules summary with live toggles |
| Performance donut | `whatsapp/MessagePerformanceDonut.jsx` | recharts `PieChart` (donut) over delivered/read/sent/pending/failed |
| Quick actions | `whatsapp/QuickActions.jsx` | Tiles that jump to Compose/Reports/Templates/Automation/Inbox |
| Recent messages | `whatsapp/RecentMessagesTable.jsx` | Styled table + status pills (also exports `fmtDate`, `msgType`) |
| **Compose** | page-local `ComposeTab` | `RecipientPicker` + `Composer` + test-to-self + `CostEstimate` |
| Recipient picker | `whatsapp/RecipientPicker.jsx` | Class accordions, per-student include toggles, opt-out aware |
| Composer | `whatsapp/Composer.jsx` | Template/free-form switch, variable fields, category, media attach |
| Cost estimate | `whatsapp/CostEstimate.jsx` | Sticky `count × rate = ₹total` + Send |
| **Reports** | page-local `ReportsTab` | Format (pdf/image/text) + period + `CriteriaBuilder` + criteria preview |
| Criteria builder | `whatsapp/CriteriaBuilder.jsx` | Score bands (min/max → message/template + attach-report); presets `<20 / 20–50 / 50+` |
| **Automation** | `whatsapp/AutomationTab.jsx` | Job list + on/off toggles + run-now + create/edit modal |
| **Templates** | `whatsapp/TemplatesTab.jsx` | Create/submit/track approval; 4 presets |
| **Inbox** | `whatsapp/InboxTab.jsx` | Read-only threads grouped by parent, unread badges, conversation view; marks read on open |
| **History** | `whatsapp/HistoryTab.jsx` | Filterable/searchable table (status filter + name/number search) + total spend |
| **Settings** | page-local `SettingsTab` | Provider, masked API key, sender, rates, quiet hours |

**API client:** `frontend/src/lib/api.js` → `whatsappApi` (config, recipients,
estimate, send, getMessages, getStats, templates CRUD, previewCriteria, sendReports,
sendWelcome, jobs CRUD, getInbox, markInboxRead, uploadMedia).

**Theme:** WhatsApp-green accent token in `tailwind.config.js` + `cards/pastel.js`
(`whatsapp`), layered on the app's flat pastel design system.

---

## 13. End-to-end flows

**Manual broadcast (template):** Compose → pick class(es) in RecipientPicker →
choose an **approved** template + fill variables (+ optional media) → see live cost
→ Send → backend resolves recipients, sends each via the provider, logs rows → History
+ Overview update; provider webhook later flips statuses to delivered/read.

**Report cards by criteria:** Reports → pick recipients + format + period → define
bands (e.g. `<20 → "needs to focus"`, `20–50 → "average"`, `50+ → "great work"`) →
**Preview criteria** (per-student band/message, no send) → Send → backend fetches each
report, resolves the band, renders pdf/image/text, uploads, sends.

**Automation:** Automation → New job (target, trigger, message/report, quiet hours,
active) → poller fires due jobs (or **Run now**) → logged to History with `job_id`.

**Inbox:** Parent replies on WhatsApp → WANotifier posts to `/webhook` → matched to
student/teacher by phone → stored in `whatsapp_inbox` → appears in the Inbox tab with
an unread badge (read-only; reply from the WhatsApp Business app).

**Onboarding:** `send-welcome` pushes a credentials/welcome template to a new student's parent.

---

## 14. Setup & deployment

1. **Database** — run `backend/schema.sql` in the Supabase SQL Editor so the
   `whatsapp_templates`, `whatsapp_messages`, `whatsapp_scheduled_jobs`, **`whatsapp_inbox`**
   tables + `students.whatsapp_opt_out` exist.
2. **Backend deps** — `pip install -r backend/requirements.txt` (includes
   `reportlab`, `Pillow`).
3. **WANotifier** — create a Meta Business account, verify the business, connect your
   number in WANotifier, then in the app **Settings** tab enter the API key + sender number.
4. **Templates** — create your Utility templates and submit them for Meta approval
   (24–48h). Only approved templates can be sent.
5. **Webhook** — point WANotifier's delivery + incoming-message webhook at
   `https://<your-host>/api/teacher/whatsapp/webhook`.
6. **Storage** — the public `whatsapp` bucket is auto-created on first media/report upload.

Local dev: `uvicorn main:app --reload --port 8001` + `npm run dev` (port 3001).
Until an API key is configured, the `UnconfiguredProvider` makes every send a logged
no-op (`status: not_configured`) — safe to click through the whole UI.

---

## 15. Decisions & deferred scope

**Decisions made:** WANotifier (behind a swappable adapter) · reuse `students.phone`
as the parent number · support all 3 report formats · class-only grouping · read-only
inbox · pastel + green visual style.

**Deferred (not built this round):**
- **Parent Name / Section / Batch / Academic Year** fields (and the `{{ParentName}}`
  variable) — current contact scope is **Class-only**; `student_code` = Admission No.
- **Two-way reply composer** / live realtime inbox — inbox is **read-only** capture.
- **Queue + automatic retry** of failed sends — current send is single-attempt
  (failures are logged, not auto-retried).

---

## 16. File map

**Backend**
- `backend/main.py` — all `whatsapp/*` endpoints, Pydantic models, helpers
  (`_wa_resolve_recipients`, `_wa_send_and_log`, `_wa_enrich_messages`,
  `_wa_match_inbound`, `_wa_phone_variants`), webhook, scheduler loop.
- `backend/whatsapp.py` — provider adapter, report builders, cost helper, config I/O.
- `backend/schema.sql` — `whatsapp_*` tables + RLS.
- `backend/requirements.txt` — `reportlab`, `Pillow`.

**Frontend**
- `frontend/src/pages/teacher/WhatsAppMessageControllerPage.jsx`
- `frontend/src/components/teacher/whatsapp/` — `OverviewTab`, `MessagePerformanceDonut`,
  `QuickActions`, `RecentMessagesTable`, `RecipientPicker`, `Composer`, `CostEstimate`,
  `CriteriaBuilder`, `TemplatesTab`, `InboxTab`, `HistoryTab`, `AutomationTab`
- `frontend/src/lib/api.js` — `whatsappApi`
- `frontend/tailwind.config.js`, `frontend/src/components/cards/pastel.js` — green token

---

*Module status: dashboard + manual + reports/criteria + automation + templates +
read-only inbox implemented and building clean on branch `whatsapp-message-controller`.*
