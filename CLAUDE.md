# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Full project brief for AI agents. Read this before touching any file.
> Also read **BUILD_STEPS.md** — it has the step-by-step implementation guide with exact prompts and test checklists.
> Build module-by-module. Each module must be complete and tested before starting the next.

---

## Development Commands

### Frontend (React + Vite)
```bash
cd frontend
npm install          # first-time setup
npm run dev          # dev server → http://localhost:3001
npm run build        # production build → frontend/dist/
npm run preview      # preview production build
```

### Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt          # first-time setup
uvicorn main:app --reload --port 8001    # dev server → http://localhost:8001
# API docs: http://localhost:8001/docs
```

### Environment files
- `backend/.env` — must have `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`. Cloudflare vars are optional — omitting them enables the Supabase Storage video fallback.
- `frontend/.env.local` — must have `VITE_API_URL=http://localhost:8001/api`

---

## What This Is

**Udaya** is a two-portal web app for private tuition teachers and their students. A teacher runs multiple classes ("standards"), each containing multiple subjects. Students enroll at the standard level and automatically get access to every subject inside it.

```
User → Login → Teacher portal
             → Student portal
```

---

## Tech Stack (Actual)

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite (NOT Next.js) |
| Routing | React Router v6 |
| State | Zustand (`src/lib/auth.js` for auth, `src/store.js` for UI state) |
| Styling | Tailwind CSS |
| Icons | lucide-react |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth — JWT tokens validated via `supabase.auth.get_user(token)` in FastAPI |
| Backend | FastAPI (Python), single file: `backend/main.py` |
| Video hosting | Cloudflare Stream (primary) — falls back to Supabase Storage `videos` bucket if CF not configured |
| File storage | Supabase Storage — `videos` (fallback), `avatars` (student photos), `broadcasts` (attachments) |
| Mobile | Not yet started |

> `@clerk/clerk-react` is in `frontend/package.json` but is **not used** — ignore it.

---

## Architecture

### Auth Flow
- Login POSTs to `/api/auth/login` → backend calls `supabase.auth.sign_in_with_password` → returns Supabase JWT
- Token stored in `localStorage` as `udaya_token`; role stored as `udaya_user_role`
- All API calls send `Authorization: Bearer <token>` header
- FastAPI validates the token by calling `supabase.auth.get_user(token)` (not custom JWT decode)
- Role and name are stored in Supabase `user_metadata` (set at signup time)
- Auth state lives in Zustand store at `frontend/src/lib/auth.js` — `useAuthStore`

### API Client
`frontend/src/lib/api.js` exports `apiClient(endpoint, options)` — a thin wrapper around `fetch` that reads the token from `localStorage` and throws on non-2xx.

### Frontend Route Structure
```
/login                          → LoginPage
/teacher/*                      → ProtectedTeacherRoute → TeacherLayout (Outlet)
  /teacher                      → TodayPage (dashboard)
  /teacher/subjects             → SubjectsPage
  /teacher/subjects/:standardId → StandardDetailPage
  /teacher/subjects/:standardId/:classId → SubjectDetailPage
  /teacher/students             → StudentsPage
  /teacher/students/:studentId  → StudentDetailPage
  /teacher/broadcasts           → BroadcastsPage
  /teacher/tests                → TestsPage
  /teacher/reports              → ReportsPage
  /teacher/reminders            → RemindersPage
  /teacher/settings             → SettingsPage
/student/*                      → ProtectedStudentRoute → StudentLayout (Outlet)
  /student                      → StudentHomePage
  /student/subjects             → StudentSubjectsPage
  /student/subjects/:classId    → StudentSubjectViewPage
  /student/subjects/:classId/video/:videoId → StudentVideoPlayerPage
  /student/tests                → StudentTestsPage
  /student/tests/:testId/take   → StudentTestTakingPage
  /student/tests/result         → StudentTestResultPage
  /student/broadcasts           → StudentBroadcastsPage
  /student/profile              → StudentProfilePage
```

### Mock Data vs Real Data
Most pages currently import mock data from `frontend/src/data.js`. Only the backend endpoints below are wired to real Supabase data. When implementing a module, replace the `data.js` imports with `apiClient` calls.

### Device Enforcement (Current State)
Single-device enforcement is implemented **client-side only** via `localStorage` fingerprint in `useAuthStore.enforceSingleDevice()`. The server-side check (deleting `active_sessions` on new login) is not yet built. See Module 1, Step 1.13 in BUILD_STEPS.md.

---

## Current Backend Endpoints (Implemented)

All in `backend/main.py`, prefix `/api`:

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/login` | Supabase sign-in, returns JWT |
| POST | `/auth/logout` | Signs out Supabase session |
| GET | `/auth/me` | Returns user from JWT |
| GET | `/standards` | List all standards |
| POST | `/standards` | Create standard |
| GET | `/students` | List students (optional `?standard_id=`) |
| POST | `/students` | Create student record |
| GET | `/subjects` | List subjects (`?standard_id=` required) |
| POST | `/subjects` | Create subject |
| POST | `/admin/create-teacher` | Create teacher Supabase account |
| POST | `/admin/create-student` | Create student Supabase account + DB record |
| GET | `/health` | Health check |

---

## Database Schema (Actual — from `backend/schema.sql`)

The actual schema differs slightly from the spec in the Data Hierarchy section. Key differences:
- `standards` uses `teacher_id` (not `created_by`) referencing `auth.users.id`
- `subject_classes` uses `class_id` FK in `videos` (not `subject_class_id`)
- Students table is `students` (not `student_profiles`) with `supabase_user_id` column
- Device enforcement uses `student_sessions` table (not `active_sessions`)

Run `backend/schema.sql` in Supabase SQL Editor to create tables.

---

## Data Hierarchy

```
Standard (e.g. "10th Standard")
  └── Subject-class (e.g. "Mathematics", "Physics", "Chemistry")
        ├── Videos
        └── Tests (MCQ)

Student
  └── Belongs to one Standard
  └── Auto-enrolled in ALL subjects inside that standard
  └── Cannot enroll in individual subjects (enrollment is always at standard level)

Broadcast
  └── Sent to a Standard (not a subject)
  └── ALL students in that standard receive it
```

---

## UI Reference

`lms-v3_9.jsx` — complete prototype with all screens, mock data, and design tokens. When building real screens, match the component patterns in this file. Don't redesign.

Design tokens to preserve:
- Background: `#FAFAF9`, borders: `#EBEAE7`, flat surfaces, no gradients
- Bottom tab bar navigation (both portals)
- Standards grouped with expand/collapse in Subjects screen
- Test results in a side sheet (not modal)

Shared UI primitives are in `frontend/src/components/ui.jsx`.

---

## Key Rules for AI Agents

1. **Build one module at a time.** Do not start Module 3 until Module 2 is fully working.
2. **Students enroll at standard level only.** Never build per-subject enrollment.
3. **Broadcasts go to a standard, not a subject.**
4. **Single device per student.** New login must invalidate all existing sessions for that student.
5. **Teacher creates student accounts.** Students cannot self-register.
6. **Video files live in Cloudflare Stream when configured.** If `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_STREAM_API_TOKEN` are absent, the backend falls back to Supabase Storage `videos` bucket. The `videos.cloudflare_video_id` column is dual-purpose: it holds a short CF UID *or* a full Supabase Storage HTTPS URL. Detect by `startsWith('https://')`.
7. **Attachment files (PDFs, images) go in Supabase Storage** `broadcasts` bucket. Not Cloudflare.
8. **Delete = delete from cloud too.** Video delete → Cloudflare. Attachment delete → Supabase Storage.
9. **Never expose student phone/email to other students.** Only returned for teacher-role sessions.
10. **Correct answers must never be sent to the student.** Strip `correct_option` from the questions API response for students.
11. **Match the prototype UI.** Replicate component structure from `lms-v3_9.jsx`.
12. **Use Supabase Row Level Security.** Every table needs RLS policies.
13. **Sync Supabase Storage calls must use `asyncio.to_thread`.** The supabase-py storage client is synchronous. Calling it directly inside an `async def` FastAPI endpoint blocks the event loop and causes connection resets on Windows. Always wrap: `await asyncio.to_thread(lambda: supabase.storage.from_(...).upload(...))`.
14. **Teacher settings are backend-backed (`teacher_settings.json` via `/api/teacher/settings`).** Branding (name + logo), default student password, termination PIN, notification/security/report prefs all persist server-side so they sync across devices. Zustand `useSettingsStore` (`udaya-settings` localStorage) is only an instant cache: every setter writes through to the backend, and `hydrateFromServer()` pulls the truth back after teacher login/boot. The login page reads the public `GET /api/branding` (no auth) to show the logo/name on a fresh device. The termination PIN is also enforced server-side in `DELETE /api/standards/{id}?pin=`.
15. **Student ID = `students.student_code` (DB column), labelled "Student ID" in the UI.** Do NOT confuse it with `student_id`, which means the UUID throughout `main.py`. Format is glued, no separators: `{YY}{INSTITUTION}{STD}{SEQ}` e.g. `25UDAYA100001` (= `25` + `UDAYA` + `10` + `0001`) — 2-digit admission year, then institution auto-derived from the branding name (`_institution_prefix`), standard number, then a running 4-digit roll sequence per `{YY}{INSTITUTION}{STD}` prefix. The code leads with digits but always has the institution letters between the two numeric groups, so it stays unambiguous and a pure-digit phone input never matches the exact `student_code` lookup. Generated by `generate_student_code()` / persisted by `assign_student_code()` (post-insert UPDATE, like `plain_password`, so a missing column never blocks student creation) on all three create paths (`create_student_admin`, `bulk_import_students`, `approve_join_request`). A partial unique index (`idx_students_student_code … WHERE student_code IS NOT NULL`) is the hard uniqueness guarantee. Students can log in with it: `login()` resolves a no-`@` identifier as a student code first, then falls back to phone. Backfill existing students via `POST /api/admin/backfill-student-codes` (teacher-only, idempotent fill; Settings → Students button). Pass `?force=true` to regenerate EVERY code into the current format (clears all codes first, deterministic & re-runnable, in `created_at` order; changes existing login IDs — Settings → "Regenerate all Student IDs").

---

## Build Order

Build one module completely (schema + API + UI + tested) before the next. See BUILD_STEPS.md for exact steps and test checklists.

| Module | Status |
|--------|--------|
| UI Prototype (lms-v3_9.jsx) | ✅ Complete |
| Auth | ✅ Complete — login/logout/me, first-login forced change, server-side single-device enforcement via student_sessions |
| Standards + Subjects | ✅ Complete — full CRUD backend + frontend live API |
| Student Management | ✅ Complete — create/edit/delete/reset-password/block, bulk import, invite links |
| Videos | ✅ Complete — Cloudflare Stream upload + Supabase Storage fallback (auto-created `videos` bucket) |
| Broadcasts | ✅ Complete — WebSocket real-time + JSON file persistence + Supabase DB + read counts + delete/edit propagation |
| Tests | ✅ Complete — create with questions, student take, anti-cheat, scoring, results |
| Reports + Leaderboard | ✅ Complete — attendance reports, CSV export, student report modal, leaderboard |
| RLS Policies | ✅ Added to schema.sql — run in Supabase SQL Editor to apply |

---

## Environment Variables

### Backend (`backend/.env`)
```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJ...              # anon key
SUPABASE_SERVICE_KEY=eyJ...      # service role key
CLOUDFLARE_ACCOUNT_ID=           # Module 4
CLOUDFLARE_STREAM_API_TOKEN=     # Module 4
RESEND_API_KEY=                  # optional
```

### Frontend (`frontend/.env.local`)
```env
VITE_API_URL=http://localhost:8001/api
```

---

## Android app & Google Play

- The app is a **Capacitor** wrapper of the web build. Package/`applicationId`:
  **`com.udayalearn.lms`** (permanent). Play Store display name: **"Udaya Learn"**
  (set in `android/.../res/values/strings.xml` `app_name` + `capacitor.config.json`
  `appName`). The *in-app* name comes from teacher Branding (backend), not code.
- **Release build:** push a `vX.Y.Z` tag → `.github/workflows/android-release.yml`
  builds a **signed APK** (→ Cloudflare R2, powers `/app` + in-app updater) **and a
  signed `.aab`** (Play Store artifact, hand-uploaded to Play Console). Tags must be
  monotonic; the live version name comes from the tag.
- **Play Console:** personal accounts must run a **closed test (12+ testers, 14 days)**
  before production. Public pages required by Play: **`/privacy`** and
  **`/delete-account`** (both React routes in `App.jsx`; also static copies in
  `frontend/public/`). Public contact email: **`udayatuitionhome@gmail.com`** (never
  the personal Google-login address).
- Play Console's Angular questionnaires (content rating, data safety, app access) often
  won't commit values via automation. Workaround: fill, **Save draft, reload the page**
  (drafts hydrate into a working form), then Save/Submit.

## Frontend deployment (Cloudflare)

- The frontend deploys via a **Git-connected Cloudflare Workers build** (project
  `udaya-learn`, connected to this repo's `main`). The Cloudflare build runs
  `npm ci` at the **repo root** before `npx wrangler deploy`, so a **root
  `package.json` + `package-lock.json` must exist** (the app itself lives in
  `frontend/` and is built by `wrangler.jsonc` `build.command`). Removing the root
  manifest breaks every deploy with `ENOENT: no package.json`.
- `wrangler.jsonc` serves `frontend/dist` with `not_found_handling:
  single-page-application`, so unknown paths fall through to the SPA — **add public
  pages as React routes**, not just static `public/*.html` (those get shadowed).
- There is **no** GitHub Actions deploy workflow — the old `cloudflare-pages.yml`
  was redundant and always failed (missing `CLOUDFLARE_API_TOKEN`); it was removed.

---

*Last updated: July 2026*
*UI prototype: lms-v3_9.jsx · Build guide: BUILD_STEPS.md*
*Stack: React + Vite · FastAPI · Supabase · Cloudflare (Stream + Workers) · Capacitor (Android)*

---

## Skills
- **graphify** (`.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.
