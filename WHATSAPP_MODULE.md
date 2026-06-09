# WhatsApp Module — Full Working Reference (Architecture · UI · Logic)

> Parent-messaging console for the Tutoria/Udaya LMS. This document explains the **whole**
> module after the beginner-friendly rebuild: the idea, the architecture, the UI, every
> endpoint, the database — and the **actual logic/algorithms** behind each flow.
>
> **Branch:** `whatsapp-message-controller` · **Route:** `/teacher/whatsapp`
> **Stack:** FastAPI (`backend/main.py` + `backend/whatsapp.py`) · React + Vite + Tailwind ·
> Supabase (Postgres + Storage) · Evolution API (default provider) / Meta Cloud API / WANotifier.

---

## Table of contents
1. [What it is](#1-what-it-is)
2. [Mental model & user journey](#2-mental-model--user-journey)
3. [Architecture](#3-architecture)
4. [Providers](#4-providers)
5. [Connecting WhatsApp — QR setup (logic)](#5-connecting-whatsapp--qr-setup-logic)
6. [The variable engine (logic)](#6-the-variable-engine-logic)
7. [Templates (logic)](#7-templates-logic)
8. [Sending a message (logic)](#8-sending-a-message-logic)
9. [Progress reports (logic)](#9-progress-reports-logic)
10. [Login details / Welcome](#10-login-details--welcome)
11. [Automations / scheduler (logic)](#11-automations--scheduler-logic)
12. [Inbox & webhook (logic)](#12-inbox--webhook-logic)
13. [Dashboard & delivery reports](#13-dashboard--delivery-reports)
14. [Cost model (logic)](#14-cost-model-logic)
15. [UI map — every screen & component](#15-ui-map--every-screen--component)
16. [Backend endpoint reference](#16-backend-endpoint-reference)
17. [Database schema](#17-database-schema)
18. [Configuration & environment](#18-configuration--environment)
19. [One-time DB setup for template files](#19-one-time-db-setup-for-template-files)
20. [Design decisions & fixed bugs](#20-design-decisions--fixed-bugs)
21. [File map](#21-file-map)

---

## 1. What it is

A teacher (or office staff) sends WhatsApp messages to **students' parents** — progress
reports, fee reminders, login details, exam results, absence alerts — straight from the LMS,
with each student's real data filled in automatically. It is built so a **first-time computer
user understands the whole flow in under two minutes**. Everything technical (providers,
tokens, approval, cost categories) is hidden behind an **Advanced** area.

The simple path uses the **Evolution** provider, which links by **QR code like WhatsApp Web**
and sends from the institute's own number — no Meta business verification, no template
approval, no per-message cost.

---

## 2. Mental model & user journey

```
Connect WhatsApp (scan QR) → ①Write message → ②Choose students → ③Preview → ④Send → ⑤Delivery report
```

A persistent **FlowStepper** bar (`FlowStepper.jsx`) sits on top of the Send screen and lights
up the current step. Every screen answers: **What am I doing? Why? What happens next?**

The stepper's "current step" is derived live (`ComposeTab` in the page):
```
hasMessage = (template chosen) OR (free-form body non-empty) OR (a file attached)
currentStep = !hasMessage ? 1 : (selectedCount === 0 ? 2 : 3)
```

---

## 3. Architecture

```
┌──────────────────────────┐   HTTPS (Bearer JWT)   ┌─────────────────────────────┐
│ Frontend (React + Vite)  │ ─────────────────────▶ │ Backend (FastAPI, main.py)  │
│ whatsappApi (api.js)     │ ◀───────────────────── │ /api/teacher/whatsapp/*     │
│ WhatsAppMessageCtrlPage  │                        │  ┌───────────────────────┐  │
└──────────────────────────┘                        │  │ Variable engine        │  │
                                                     │  │ (_wa_render, registry) │  │
                                                     │  └───────────────────────┘  │
                                                     │  ┌───────────────────────┐  │
                                                     │  │ Provider adapter        │  │
                                                     │  │ (whatsapp.py)           │  │
                                                     │  └──────────┬─────────────┘  │
                              Supabase (Postgres)                 │ provider API
                       templates / messages / jobs / inbox        ▼
                                                       ┌───────────────────────┐
                                                       │ Evolution API server   │ → WhatsApp
                                                       │ (or Meta / WANotifier) │
                                                       └───────────────────────┘
```

- The frontend never talks to WhatsApp directly — it calls the backend; the backend calls the
  active **provider**, which calls WhatsApp.
- Secrets (provider keys, Evolution server address) live server-side in `whatsapp_config.json`,
  masked before reaching the browser (`mask_key`).
- Every endpoint requires a teacher JWT (`verify_token` + `_wa_require_teacher`), except the
  provider webhook.

---

## 4. Providers

`backend/whatsapp.py`. Factory `get_provider(config)` returns the right adapter from
`whatsapp_config.json`. All adapters return a uniform result
`{status, provider_message_id, error}`, which keeps everything above them provider-agnostic.

| Provider | Class | Links by | Templates | Cost |
|----------|-------|----------|-----------|------|
| **Evolution** (default/simple) | `EvolutionProvider` | **QR scan** | sent as normal text | **free** |
| **Meta Cloud API** | `MetaCloudProvider` | token + phone-id + WABA-id | real approved templates `{{1}}` | per-msg |
| **WANotifier** | `WANotifierProvider` | api key + sender | Meta-style templates | per-msg |
| **Unconfigured** | `UnconfiguredProvider` | — | — | — (returns `not_configured`, never crashes) |

**Factory logic** (`get_provider`):
```
provider = config.provider or "wanotifier"
if provider == "meta":      return Meta if (token and phone_id) else Unconfigured
if provider == "evolution": return Evolution if (base_url and api_key and instance) else Unconfigured
else (wanotifier):          return WANotifier if api_key else Unconfigured
```

---

## 5. Connecting WhatsApp — QR setup (logic)

The Evolution **server** (address + key + instance) is configured **once by a developer** in
`whatsapp_config.json`; the teacher only **scans a QR**.

**Backend (Evolution API v2 calls in `EvolutionProvider`):**
```
connection_state(): GET /instance/connectionState/{instance} → "open" | "connecting" | "close"
ensure_instance():  GET /instance/fetchInstances?instanceName=… ; if missing → POST /instance/create
get_qr():           ensure_instance(); GET /instance/connect/{instance} → { base64 (QR image), pairingCode }
owner_number():     GET /instance/fetchInstances?instanceName=… → linked number (strip @s.whatsapp.net)
logout():           DELETE /instance/logout/{instance}
```

**Endpoint logic:**
```
GET /connection:
    if provider == evolution and server configured:
        state = connection_state(); connected = (state == "open")
        number = owner_number() if connected else ""
        return {provider, connected, state, number}
    else (meta/wanotifier): connected = credentials present  (no QR)

GET /qr:
    if provider != evolution: return {error: "use credentials under Advanced"}
    if server not configured: return {state: "no_server", error: "ask your admin"}
    if connection_state() == "open": return {state:"open"}     # already linked
    return get_qr()  → {qr_base64, pairing_code}

POST /disconnect: evolution → logout()
```

**Frontend logic** (`SettingsTab` → "Connect WhatsApp" card):
```
on open: getConnection()
if not connected → "Connect" → getQr() → show <img src=qr_base64> + pairing code + steps
while QR visible: every 3s → getConnection(); if connected → hide QR, refresh banner
if connected → green "Connected ✓ +number" + Send-test + Disconnect
```
The page-level banner ("WhatsApp isn't connected — scan the QR") is keyed on the **live
connection state**, not on whether credentials exist.

---

## 6. The variable engine (logic)

**One** variable format: human-friendly named tags like `{Student Name}`, `{Fee Amount}`. No
`{{1}}` positions and no `[Label]` brackets in the teacher's world. (The old module had three
coexisting formats with a lossy round-trip and ~120 lines of regex "guessing" — all deleted.)

### Source of truth — `WA_VARIABLES` (in `main.py`)
A single registry exposed via `GET /variables`. Each entry: `{name, kind, group, example,
description}` (+ `token` = `{Name}`). Two kinds:

- **auto** — filled from data per student: `{Student Name}`, `{Student ID}`, `{Class}`,
  `{Username}`, `{Password}`, `{Login Link}`, `{Attendance}`, `{Score}`, `{Points}`,
  `{Latest Exam}`, `{Latest Assignment}`, `{Study Material}`, `{Live Class}`,
  `{Institute Name}`, `{Date}`, `{Time}` (+ alias-resolvable `{Parent Name}`, `{Student Phone}`,
  `{Month}`, `{Year}`).
- **ask** — teacher types one value before sending (same for everyone in that send):
  `{Fee Amount}`, `{Due Date}`, `{Class Date}`, `{Class Time}`, `{Teacher Name}`. **Any unknown
  `{tag}` is also treated as "ask".**

### `_wa_render(text, recipient, manual_values)` — THE engine
```
manual = { lower(key): str(value) for key,value in manual_values }      # case-insensitive
text   = text.replace("{{","{").replace("}}","}")                       # forgive {{x}}
for each {token} matched by /\{([^{}]+)\}/:
    key   = lower(token.strip())
    canon = ALIAS[key] or key                                           # snake → canonical
    if canon in AUTO_KEYS:   replace with _wa_auto_value(canon, recipient)
    elif key   in manual:    replace with manual[key]
    elif canon in manual:    replace with manual[canon]
    else:                    replace with ""                            # strip unknown/empty
out = out.replace("{}","")                                              # no broken artifacts
```
Result: parents **never** see `{...}` or `{{1}}`. `_wa_auto_value` maps a canonical key to the
recipient's value (name, code, class, attendance%, avg score%, points, latest exam/etc., today's
date) — and crucially `{Institute Name}` → `_wa_branding_name()` (settings `lms_name`) and
`{Login Link}` → `_wa_login_url()` (settings `login_url`).

### `_wa_parse_variables(body)` — classify what's used
```
normalize body; for each unique {token}:
    classify "auto" if canonical(token) in AUTO_KEYS else "ask"
return [ {name, kind}, … ]                # drives the builder + "fill the blanks"
```

### `_wa_missing_manual(body, manual_values)` — send-time validation
```
filled = { lower(k) for k,v in manual_values if v.strip() }
return [ var.name for var in parse(body) if var.kind=="ask" and lower(var.name) not in filled ]
# non-empty → HTTP 400 "Please fill in: Fee Amount, Due Date"
```

### Meta compatibility (only when provider = meta)
```
_wa_to_meta_body(body)      → ("Hi {{1}}, {{2}}", ["Student Name","Score"])   # named → positional
_wa_positional_values(body, recipient, manual) → ["Arjun","88%"]              # ordered values
```

### Legacy migration (lazy, on read)
```
_wa_migrate_legacy_body("Hi {{1}}, {{2}}", labels=["Student Name","Score"]) → "Hi {Student Name}, {Score}"
```
Run inside `_wa_template_out` when a stored body still contains `{{`, then persisted once.

---

## 7. Templates (logic)

A template = a **saved, reusable message** with named variables. On the simple path there is no
"approval": pick → fill blanks → send.

### `_wa_template_out(row)` — normalize a stored template for the UI
```
if body has "{{":  body = _wa_migrate_legacy_body(body, row.variables); persist once
row.variables = _wa_parse_variables(body)     # always return parsed {name,kind}
return row                                     # media_url/type/name pass through select("*")
```

### Create / Update
```
POST /templates:
    body = _wa_normalize_body(input.body)
    header_type = _wa_header_from_media(input.media_type)        # image|audio|document|none
    row = { name, category, language, header_type, body, variables=parse(body), status:"draft" }
    if _wa_templates_have_media():  row += { media_url, media_type, media_name }   # graceful if columns absent
    if input.submit (meta):  create Meta template from _wa_to_meta_body(body)
    insert row

PUT /templates/{id}:  same, but resets status→draft + clears provider_template_id (edit invalidates Meta approval)
```

### `_wa_templates_have_media()` — self-healing guard
```
cached True once whatsapp_templates.media_url probes OK;
until then media fields are omitted so saves never crash (templates degrade to text-only).
```

### Ready-made library — `templateLibrary.js`
Categorized starter templates ("Use this" = duplicate & edit): **Admissions** (Admission
Confirmation, Welcome) · **Fees** (Fee Reminder, Payment Received) · **Classes** (Class Reminder,
Class Rescheduled) · **Exams** (Exam Notification, Result Published) · **Attendance** (Absent
Alert, Attendance Warning) · **General** (Login Details, Holiday Notice).

### Templates carry a real file
A template can hold an uploaded PDF/image/audio (`media_url/type/name`). When the template is
**chosen in the composer**, its file is **auto-attached** to the send (the composer copies the
template's media into the send payload).

---

## 8. Sending a message (logic)

**Frontend payload** (`POST /send`): `{included_student_ids, mode, template_name,
manual_values, body_text, media_url, media_type, category}`.

### `wa_send` (endpoint) — decision tree
```
if mode == "template":
    require template_name
    fetch template → template_body (canonical named), status, provider_template_id
    meta_approved = (provider_template_id present) AND (status == "approved")
    body_for_check = template_body
else (freeform):
    body_for_check = body_text
    require body_for_check non-empty OR media_url

missing = _wa_missing_manual(body_for_check, manual_values)
if missing: 400 "Please fill in: " + missing

if test_to_self:  send one message to that number; return
recipients = _wa_resolve_recipients(teacher, standard_ids, included_ids) filtered to those WITH a phone
if none: 400 "No recipients with a phone number"

for each recipient (Evolution sleeps 2.5s between, to avoid rate-limits):
    result = _wa_send_and_log(...)
return { results, sent, total_cost, configured }
```

### `_wa_send_and_log(...)` — render once, choose the send method
```
raw_body = body_text  OR  template_body  OR  (fetch template body by name)
rendered = _wa_render(raw_body, recipient, manual_values)        # the single engine

use_meta_template = provider=="meta" AND mode=="template" AND template_name AND meta_approved
if use_meta_template:
    positional = _wa_positional_values(template_body, recipient, manual_values)
    res = provider.send_template(to, template_name, positional, media_url, media_type, language)
else:
    res = provider.send_freeform(to, rendered, media_url, media_type)   # Evolution / default path

# log one whatsapp_messages row: store the RENDERED text, status, cost (billable only), provider id
```
Key point: **for the beginner/Evolution path everything is rendered text sent free-form**; the
Meta true-template branch only triggers when the Meta provider is active *and* an approved
template exists.

### `_wa_resolve_recipients(...)` — who & with what data
```
standards = teacher's standards (scoping — a teacher can never message another teacher's students)
events    = _wa_fetch_standard_events(standards)   # latest exam/assignment/material/live class per standard
for each student in target standards:
    skip if not in included_ids (when provided)
    skip if whatsapp_opt_out
    emit { id,name,phone,student_code,standard_name,username,plain_password,
           attendance_pct,avg_score,points, latest_test/assignment/material/live_class }
```

---

## 9. Progress reports (logic)

**Endpoints:** `POST /preview-criteria` (dry-run), `POST /send-reports`.

### `_wa_build_report_rows(...)` — shared by preview & send
```
if test_id:  standard = _wa_exam_standard_id(test_id)   # exam report can ONLY go to its own standard
recipients = _wa_resolve_recipients(...)
for each recipient:
    report = get_student_report_v2(id, period)          # reuse the existing report endpoint shape
    score  = _wa_student_score(report, test_id)         # the test's score, else overall avg
    band   = resolve_band(score, criteria)              # first band where min <= score < max
    row += { …recipient, score, band, _report: report }
```

### `wa_send_reports` per recipient
```
skip if no phone
if exam mode and score is None: skip          # only students who actually took the exam
if criteria set and no band matched: skip
message = band.message or default_message
artifact (when attach):
    pdf   → build_report_pdf(report)   → upload → media_url (application/pdf)   [DEFAULT format]
    image → build_report_image(report) → upload → media_url (image/png)
    text  → build_report_text(report)  → appended to the message body
send via _wa_send_and_log(...)
```
Report artifacts (`whatsapp.py`): `build_report_text` (WhatsApp-friendly summary),
`build_report_pdf` (reportlab A4), `build_report_image` (Pillow PNG card). Uploaded to the public
Supabase `whatsapp` bucket to get an attachable URL. **PDF is the default attachment**.

---

## 10. Login details / Welcome

`POST /send-welcome` (`include_credentials`). `_wa_credentials_body()` builds the message;
`_wa_fetch_credentials()` reads the sensitive Student ID + password; `{Login Link}` resolves from
settings. An **auto-welcome** (`_wa_auto_welcome`) can fire when a new student is created if the
teacher enabled it. UI: the `CredentialsTab` (reached from the compose "Send login details" link).

---

## 11. Automations / scheduler (logic)

UI: `AutomationTab.jsx`. A job has: target (all/selected classes), trigger (interval / fixed
date / after-an-exam), message (template / free-form / report+criteria), quiet hours, on/off.
Each job has **Test** (send its exact message to your own number — safe), **Run now** (to
everyone, with confirm), Edit, Delete.

**Runner** — `_whatsapp_scheduler_loop()` (in-process poller, FastAPI always-on):
```
every ~60s:
    due = jobs where active AND next_run_at <= now
    for job in due: _wa_execute_job(job)

_wa_execute_job(job):
    if in quiet hours (and not forced): defer
    recipients = resolve(job.target)
    skip any recipient this job already messaged in the last 12h     # dedupe
    send each (template/freeform/report) via the normal send path, tagging whatsapp_messages.job_id
    advance next_run_at by the interval  (or deactivate one-shot fixed_date/post_exam)
```

**Test logic** (`AutomationTab.testJob`): prompts for a number (remembered in localStorage) and
sends the job's exact content via `/send` with `test_to_self` — template jobs send the real
template, report jobs send the message wording (the report file only attaches on the real run).

---

## 12. Inbox & webhook (logic)

`POST /api/teacher/whatsapp/webhook` is **unauthenticated** (provider-signed) and handles two
payload kinds:
```
if payload has message id + status:   update matching whatsapp_messages.status (sent→delivered→read / failed)
elif payload has a sender phone + body/media (inbound):
    student = match phone via _wa_phone_variants()    # tolerates "+", country code 91, last-10-digits
    derive teacher + class from the student's standard
    insert into whatsapp_inbox
always return {ok:true}   # every branch guarded — a malformed payload never errors
```
UI: `InboxTab.jsx` — read-only threads grouped by parent (`GET /inbox`), unread badges,
mark-read on open (`POST /inbox/mark-read`). Replies are sent from the WhatsApp app itself.

---

## 13. Dashboard & delivery reports

- **Dashboard** (`OverviewTab.jsx`, under Advanced) from `GET /stats`: KPIs
  (queued/sent/delivered/read/failed), `MessagePerformanceDonut`, month/total spend, recent
  messages (`RecentMessagesTable`), scheduled jobs, `QuickActions`.
- **Delivery Reports** (`HistoryTab.jsx`, Essentials) from `GET /messages`: per-recipient send
  log — status, cost, and the **rendered text that was actually sent**.

---

## 14. Cost model (logic)

```
backend estimate_cost(count, category):
    if provider == evolution: return amount 0          # self-hosted = free
    else: amount = count × rates[category]              # utility 0.14 / marketing 0.78 / auth 0.13 (INR, editable)

frontend estimateFor(category):
    if provider == evolution: return { rate:0, amount:0 }
    else: { rate, amount: selectedCount × rate }

CostEstimate.jsx: if amount === 0 → show "N parents · Ready to send" + plain "Send" (no ₹)
                  else → "N parents · est. ₹X" + "Send (₹X)"
```
Because Evolution returns 0, the **entire** UI drops ₹ and the utility/marketing/auth category
chips on the simple path. Actual spend = sum of billable `whatsapp_messages.cost_amount`.

---

## 15. UI map — every screen & component

**Page shell** — `pages/teacher/WhatsAppMessageControllerPage.jsx`
- Left sidebar: **Essentials** (Send a Message, Templates, Delivery Reports) + a collapsible
  **Advanced** group (Dashboard, Progress Reports, Inbox, Automations, Settings). Mobile = a
  scrollable pill row.
- `tab` state selects the view. `SettingsTab` = "Connect WhatsApp" + `AdvancedSettings` (the old
  provider/token/rate/quiet-hour form, kept under a `<details>`).

| File | Role |
|------|------|
| `FlowStepper.jsx` | 5-step mental-model bar atop the Send screen. |
| `Composer.jsx` | Write a message (template/free-form), `VariablePicker`, ask-var inputs, media; category hidden on Evolution; auto-attaches a template's file. |
| `VariablePicker.jsx` | Shared "Add student info" chips + "What is a variable?" explainer. |
| `RecipientPicker.jsx` | Choose classes/students, counts, inline phone edit, opt-out aware. |
| `CostEstimate.jsx` | Sticky send footer (hides ₹ when free). |
| `WhatsAppPreview.jsx` | Faithful WhatsApp chat-bubble preview. |
| `previewText.jsx` | `renderPreview` (named-tag preview) + `formatWhatsApp` (safe `*bold*`/`_italic_`/`~strike~`) + `mediaKind`. |
| `TemplatesTab.jsx` | Ready-made library + guided builder (real file upload + live preview) + saved templates (Edit/Delete; Meta status only on Meta). |
| `templateLibrary.js` | Categorized starter templates. |
| `CriteriaBuilder.jsx` | Score-band rules for reports (min/max → message/template + attach). |
| `AutomationTab.jsx` | Scheduled jobs (Test / Run now / Edit / Delete). |
| `InboxTab.jsx` | Parent replies (read-only). |
| `HistoryTab.jsx` | Delivery report (send log, status filter + search). |
| `OverviewTab.jsx` + `MessagePerformanceDonut.jsx` + `RecentMessagesTable.jsx` + `QuickActions.jsx` | Dashboard. |

**Frontend preview logic** (`previewText.renderPreview` + `Composer.findAskVars`):
```
renderPreview(body, registry, manualValues, sampleStudent):
    for each {token}: typed manual value → use it; auto → sample/registry example; ask → example; unknown → the word
findAskVars(body, registry):
    tokens that are NOT auto in the registry → render a labelled input feeding manual_values
```

**API client** — `frontend/src/lib/api.js` → `whatsappApi`: `getConfig/setConfig`,
`getConnection/getQr/disconnect`, `getRecipients`, `getVariables`, `estimate/send`,
`getMessages/getStats`, `getInbox/markInboxRead`, `listTemplates/createTemplate/updateTemplate/
submitTemplate/templateStatus/deleteTemplate`, `previewCriteria/sendReports`, `sendWelcome`,
`listJobs/createJob/updateJob/deleteJob/toggleJob/runJobNow`, `uploadMedia`.

---

## 16. Backend endpoint reference

All under `/api/teacher/whatsapp`, teacher-auth required (except the public webhook).

| Method | Path | Purpose |
|--------|------|---------|
| GET / POST | `/config` | Read (masked) / save config (never wipes a secret with a blank/masked value). |
| GET | `/connection` | Live status `{connected, state, number}`. |
| GET | `/qr` | QR image + pairing code (Evolution). |
| POST | `/disconnect` | Log the phone out (Evolution). |
| GET | `/recipients` | Students grouped by class (phone/opt-out). |
| GET | `/variables` | The variable registry. |
| POST | `/upload-media` | Upload a file → Supabase `whatsapp` bucket (base64 fallback). |
| POST | `/estimate` | Cost estimate. |
| POST | `/send` | **Core send** (template or free-form, `manual_values`, `test_to_self`). |
| GET | `/messages` | Delivery log + total spend. |
| GET | `/stats` | Dashboard KPIs. |
| GET / POST | `/templates` | List / create. |
| PUT / DELETE | `/templates/{id}` | Edit / delete. |
| POST | `/templates/{id}/submit` · GET `/templates/{id}/status` | Meta approval (advanced). |
| POST | `/preview-criteria` | Dry-run a banded report send. |
| POST | `/send-reports` | Send progress reports (pdf/image/text + bands). |
| POST | `/send-welcome` | Send login details / welcome. |
| POST | `/webhook` | Inbound statuses + parent replies (no auth). |
| GET | `/inbox` · POST `/inbox/mark-read` | Parent replies / mark read. |
| GET / POST | `/jobs` · PUT/DELETE `/jobs/{id}` · POST `/jobs/{id}/toggle` · POST `/jobs/{id}/run-now` | Automations. |

---

## 17. Database schema

`backend/schema.sql` — all RLS `deny_all` to the anon role; the backend uses the service key.

| Table | Holds |
|-------|-------|
| `whatsapp_templates` | Saved templates: named-tag `body_text`, optional `media_url/type/name`, `variables` (JSONB), `category`, `header_type`, Meta `status`/`provider_template_id`. |
| `whatsapp_messages` | One row per recipient per send — `to_phone`, rendered `body_text`, `media_*`, `category`, `status`, `provider_message_id`, `cost_amount`, `error`, `job_id`, `sent_at`. |
| `whatsapp_scheduled_jobs` | Automations: `target_*`, `trigger_*`, `mode`, message, `report_format`, `criteria`, `quiet_hours`, `active`, `next_run_at`. |
| `whatsapp_inbox` | Inbound parent replies (matched to student/teacher by phone). |
| `students.whatsapp_opt_out` | Per-student opt-out (excluded from every resolver). |

---

## 18. Configuration & environment

**Server-only** — `backend/whatsapp_config.json` (never sent to the browser):
```json
{
  "provider": "evolution",
  "evolution_base_url": "http://<host>:8080",
  "evolution_api_key": "…",
  "evolution_instance": "udaya-lms",
  "meta_access_token": "…", "meta_phone_number_id": "…", "meta_waba_id": "…",
  "api_key": "…", "sender": "…",
  "currency": "INR",
  "rates": { "utility": 0.14, "marketing": 0.78, "auth": 0.13 },
  "auto_welcome": false, "welcome_template": "", "quiet_hours": {}
}
```
`{Institute Name}` / `{Login Link}` come from **teacher settings** (`lms_name`, `login_url`) via
`_wa_branding_name()` / `_wa_login_url()`.

**Run locally:** `cd backend && uvicorn main:app --reload --port 8001` · `cd frontend && npm run dev`
(→ http://localhost:3001).

---

## 19. One-time DB setup for template files

This hosted Supabase does **not** expose `pg-meta`, so the app's auto-migration can't add
columns; they're added by hand (the convention for the rest of the schema). Template **file
attachments** need three columns — run once in the Supabase SQL editor:
```sql
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS media_url  TEXT;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS media_name TEXT;
```
Until then templates still save/send **text-only** — `_wa_templates_have_media()` detects the
missing columns and degrades gracefully (no crash).

---

## 20. Design decisions & fixed bugs

- **One variable system** replaced three coexisting formats (`{tag}` / `{{1}}` / `[Label]`) and
  the regex "guessing" that silently lost data. Now: named tags only, one render engine, the
  registry as source of truth.
- **No approval jargon** on the simple path; Meta's approval/pending/24h-window only surfaces
  when the Meta provider is selected.
- **`{Institute Name}` / `{Login Link}`** were hardcoded ("Tutoria LMS"/"udaya.app") — now from settings.
- **Template editing** was impossible (create/delete only) — added `PUT /templates/{id}`.
- **Missing/broken placeholders** — validated on save + before send; unknown/empty tags stripped.
- **Setup was developer-grade** (paste tokens/URLs) — replaced with **scan-a-QR** pairing.
- **"Attach a file?" was a lie** — no media column existed, so it did nothing on Evolution. Now
  templates carry a **real** file that auto-attaches in the composer.
- **Cost jargon on Evolution** (₹0.00, utility/marketing/auth) — hidden, since Evolution is free.
- **Automations got a safe "Test"** (to your own number), distinct from "Run now" (to everyone).
- **Progress reports default to PDF**.

---

## 21. File map

**Backend**
- `backend/main.py` — all `whatsapp/*` endpoints + the variable engine + send/report/job/inbox
  logic + the scheduler loop + Pydantic models.
- `backend/whatsapp.py` — provider adapters (Evolution/Meta/WANotifier/Unconfigured), QR/
  connection methods, report builders, cost helper, config I/O.
- `backend/schema.sql` — `whatsapp_*` tables + RLS (+ the template media ALTERs).
- `backend/whatsapp_config.json` — server-only secrets.

**Frontend**
- `frontend/src/pages/teacher/WhatsAppMessageControllerPage.jsx` — the page shell, `ComposeTab`,
  `ReportsTab`, `CredentialsTab`, `SettingsTab` (Connect WhatsApp), `AdvancedSettings`.
- `frontend/src/components/teacher/whatsapp/*` — `FlowStepper`, `Composer`, `VariablePicker`,
  `RecipientPicker`, `CostEstimate`, `WhatsAppPreview`, `previewText`, `TemplatesTab`,
  `templateLibrary`, `CriteriaBuilder`, `AutomationTab`, `InboxTab`, `HistoryTab`, `OverviewTab`,
  `MessagePerformanceDonut`, `RecentMessagesTable`, `QuickActions`.
- `frontend/src/lib/api.js` — `whatsappApi`.

---

*Status: beginner-friendly rebuild complete on `whatsapp-message-controller` — one named-tag
variable engine, scan-a-QR setup, templates that carry real files, Evolution-free cost UX,
compose/reports/credentials/automation/inbox/dashboard all wired through the shared engine.*
