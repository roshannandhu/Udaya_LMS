# Tutoria LMS — Changelog

Format: newest first. Each entry includes what changed, which files, and why.

---

## May 2026 — Sub-Teacher Team Management, Idempotent RLS Policies & Connection Stability

### Feature: Sub-Teacher Team Management (Multi-Teacher Support)
- **Files:** `backend/main.py`, `backend/schema.sql`, `frontend/src/lib/api.js`, `frontend/src/pages/teacher/SettingsPage.jsx`.
- Allows primary teachers to register and manage multiple sub-teacher team members.
- Created `sub_teachers` table and RLS deny policies.
- Automatically creates sub-teacher accounts under Supabase Auth.
- Implemented settings panel on settings page for team addition and removal (primary only; blocked for sub-teachers).
- Updated backend standard/subject database checks to use primary teacher's ID (`user["teacher_id"]`), enabling shared team visibility and administrative management of the primary teacher's classes.

### Feature: Idempotent RLS Policies DDL
- **Files:** `backend/schema.sql`, `backend/rls_policies.sql`.
- Added `DROP POLICY IF EXISTS` prefix queries to all RLS policy definitions.
- Avoids duplicate policy errors (`ERROR: 42710`) when re-running database schemas.

### Feature: Connection Stability & Offline Graceful Handling
- **Files:** `frontend/src/lib/api.js`, `frontend/src/lib/auth.js`.
- Refactored `tryRefreshToken` and mount authentication logic to prevent automatic logout on network timeouts or temporary backend outages.
- Added graceful offline warnings to keep cached student/teacher sessions active until connection recovers.

### Refactor: Reusable Student Report Card Redesign
- **Files:** `frontend/src/components/shared/StudentReportCard.jsx`, `frontend/src/components/teacher/StudentReportModal.jsx`, `frontend/src/pages/student/StudentReportPage.jsx`, `frontend/src/pages/teacher/StudentDetailPage.jsx`, `backend/main.py`.
- Extracted metrics, attendance heatmaps, and test charts into a shared `StudentReportCard` component.
- Cleaned up repetitive layouts across the teacher and student report views.
- Updated report endpoint (`get_student_report_v2`) to compute rank, total standard tests, and per-subject activity heatmaps.

---

## May 2026 — Zoom Live Classes & YouTube Integration

### Feature: Zoom Live Classes
- **Files:** `backend/main.py`, `backend/schema.sql`, frontend components.
- Teacher can schedule a live class, which automatically creates a Zoom meeting via Zoom Server-to-Server OAuth.
- Students can join the live class inside the app using the Zoom Web SDK without the URL ever being exposed.
- Zoom webhooks and API are used to track participant duration and save attendance.

### Feature: YouTube Unlisted Video Support
- **Files:** `backend/main.py`, `backend/schema.sql`, frontend components.
- Teacher can provide a YouTube URL for unlisted videos instead of uploading.
- App embeds a custom YouTube IFrame player for students.
- Native YouTube controls are hidden to prevent students from copying the video URL.

---

## May 2026 — Standard Termination: Full Storage Lifecycle Fix

### Bugfix: Orphaned Storage files after standard termination

**File:** `backend/main.py` — `DELETE /api/standards/{standard_id}`

**Problem (before fix):**
When a standard was terminated, DB rows and auth accounts were deleted but Supabase Storage files were never touched. Over time this caused:
- Avatar files (`avatars/` bucket) left behind with no owner
- Fallback video files (`videos/` bucket) left behind with no owner
- `invite_requests` rows orphaned (no FK cascade)
- `notifications` rows orphaned for deleted students
- Storage bucket kept growing indefinitely
- Higher storage costs, messy buckets, impossible to maintain

**Fix — termination now performs full lifecycle cleanup in order:**
1. Collect student avatar URLs and invite link codes upfront (before any CASCADE removes them)
2. Delete Cloudflare Stream videos (existing)
3. **Delete Supabase Storage video files** — detects fallback-uploaded videos by `startsWith('https://')` vs short Cloudflare UIDs, extracts path, calls `storage.from_("videos").remove()`
4. Delete `test_attempts`, `broadcast_reads` (existing)
5. **Delete `notifications`** for all students in this standard
6. **Delete `invite_requests`** matched by invite link codes
7. **Delete Supabase Storage avatar files** — extracts path from avatar URL, calls `storage.from_("avatars").remove()`
8. Delete Supabase Auth accounts, then students DB rows (existing)
9. Delete standard → PostgreSQL CASCADE cleans up subject_classes, videos, tests, attendance, broadcasts, invite_links, video_progress, student_sessions

All Storage operations wrapped in `asyncio.to_thread` (sync supabase-py client, non-blocking).

---

## May 2026 — Student Profile Photos

### Feature: Student profile photo — full app-wide display

**Files changed:**
- `backend/main.py` — `verify_token()`, `GET /leaderboard`
- `frontend/src/components/ui.jsx` — `Avatar` component
- `frontend/src/pages/student/StudentLeaderboardPage.jsx`
- `frontend/src/pages/teacher/StudentDetailPage.jsx`

**Backend fixes:**
- `verify_token()`: Added `avatar_url` to the student select query and to the returned result dict. `/auth/me` now includes `avatar_url` — previously the profile page lost the photo on every page reload because the field was never returned.
- `GET /leaderboard`: Added `avatar_url` to both select branches (by standard and global top-50).

**Frontend — `Avatar` component (`ui.jsx`):**
- Added `src` prop with `imgError` fallback state. When `src` is provided and loads successfully, renders `<img>` with `rounded-full object-cover`. On load error (or no src), falls back to the existing colored initials circle. Fully backward-compatible — all existing `<Avatar name=...>` usages unchanged.

**Frontend — pages updated to pass `src`:**
- `StudentLeaderboardPage`: All 4 Avatar instances (podium 1st/2nd/3rd + full list row) now pass `src={...avatar_url}`
- `StudentDetailPage` (teacher view): Student header Avatar now passes `src={student.avatar_url}` — data already came from `GET /students/{id}` which returns `*`

**No database changes** — `students.avatar_url TEXT` already existed in schema.sql. Upload endpoint (`POST /api/students/me/avatar`) and profile page upload UI were already complete.

---

## May 2026 — Branding, Video Storage Fallback, Broadcast Fixes

### Feature: LMS Branding (custom name + logo)
- **Files:** `frontend/src/store.js`, `frontend/src/pages/teacher/SettingsPage.jsx`, `frontend/src/pages/LoginPage.jsx`, `frontend/src/components/shared/Sidebar.jsx`, `frontend/index.html`
- Added `lmsName` (text) and `lmsLogo` (base64 data URL) to `useSettingsStore` (persisted to `tutoria-settings` localStorage key)
- SettingsPage: new Branding section — logo upload (FileReader → base64 data URL) + name input with Save button
- LoginPage and Sidebar dynamically read `lmsName`/`lmsLogo` and display them; fall back to "Tutoria" / diamond icon if unset
- `document.title` in LoginPage updates from `lmsName` on mount
- `index.html` `<title>` changed from "Tutoria" to "LMS" (JS overrides at runtime from the store)
- **No PostgreSQL change** — stored entirely in localStorage via Zustand persist

### Feature: Video Supabase Storage fallback
- **Files:** `backend/main.py` (`upload_video`), `frontend/src/pages/student/StudentVideoPlayerPage.jsx`, `frontend/src/pages/teacher/SubjectDetailPage.jsx`
- When `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_STREAM_API_TOKEN` are not set, videos upload to Supabase Storage `videos` bucket (auto-created on first upload if missing)
- Public HTTPS URL stored in `videos.cloudflare_video_id` (dual-purpose — CF UID or Storage HTTPS URL)
- `StudentVideoPlayerPage` detects storage URLs (`startsWith('https://')`) and renders a native `<video>` tag instead of the Cloudflare Stream embed
- Teacher upload progress label changed from "Uploading to Cloudflare Stream…" to "Uploading…"
- Offline save disabled for storage-backed videos (download security)

### Bugfix: Video/avatar upload "Network error" on Windows
- **File:** `backend/main.py` (`upload_video`, `upload_student_avatar`)
- Root cause: synchronous Supabase Storage calls (`create_bucket`, `upload`, `get_public_url`) were running inside `async def` endpoints, blocking the uvicorn event loop (Windows ProactorEventLoop). The ASGI transport reset the connection before a response was sent, causing the browser XHR `onerror` to fire with "Network error."
- Fixed by wrapping all sync storage calls in `asyncio.to_thread(lambda: ...)` so they run in a thread-pool worker

### Feature: Student avatar upload
- **File:** `backend/main.py` (`upload_student_avatar` — `POST /api/students/me/avatar`)
- Now fully working after `asyncio.to_thread` fix
- Stores file in Supabase Storage `avatars` bucket; saves public URL to `students.avatar_url`
- `students.avatar_url TEXT` column already existed in schema — no migration needed

### Bugfix: Broadcast context menu clipping
- **File:** `frontend/src/components/teacher/BroadcastThread.jsx`
- Context menu was rendered inside the `overflow-y-auto` scroll container and clipped at the container boundary
- Fixed: menu now uses `position: fixed` anchored with `getBoundingClientRect()` coordinates, rendering above the scroll container at viewport level

### Bugfix: "Delete for everyone" message persisting
- **File:** `frontend/src/components/teacher/BroadcastThread.jsx`
- Two causes: (1) WebSocket `history` handler hardcoded `deleted: false` on every reconnect, overriding actual deleted state. Fixed to `deleted: !!b.deleted` and `edited: !!b.edited`. (2) `onUpdate` was called before the DELETE API call succeeded. Fixed: moved inside the `try` block — only fires on API success.
- Added `delete_broadcast` and `edit_broadcast` WebSocket event handlers (were missing)

### Bugfix: Broadcast menu always empty
- **File:** `frontend/src/components/teacher/BroadcastThread.jsx`
- Fixed menu item lookup referencing undefined `broadcastsByStandard_ref.current` → corrected to `broadcasts.find(x => x.id === menuId)` (the correct prop)

### Feature: Broadcast read count display (teacher view)
- **File:** `frontend/src/components/teacher/BroadcastThread.jsx`
- Each broadcast bubble now shows `✓✓ N/Total read` (blue tint when any student has read, grey when zero)
- Uses `broadcastApi.getReadCounts(standard_id)` → `GET /broadcasts/reads`
- Refreshes whenever the broadcasts list changes (standard switch or new message)

---

## May 2026 — Security Hardening + Bulk Import Fix

### Security: WebSocket Authentication
- **Files:** `backend/main.py` (WS endpoint), `frontend/src/components/teacher/BroadcastThread.jsx`, `frontend/src/pages/student/StudentBroadcastsPage.jsx`
- Added token validation to `/api/ws/broadcasts/{standard_id}?token=<jwt>` — closes with code 4001 if token missing or invalid
- Updated both frontend WS clients to pass token as query param
- **Why:** WebSocket connections from any unauthenticated client were previously accepted

### Security: HTTPException propagation fix
- **File:** `backend/main.py` `verify_token()`
- Added `except HTTPException: raise` before outer `except Exception` in `verify_token`
- **Why:** 401/403 exceptions were being swallowed and replaced with generic 500 errors

### Security: Ownership checks on PATCH/DELETE
- **File:** `backend/main.py`
- Subjects PATCH/DELETE: verify ownership via `standard → teacher_id`
- Tests PATCH/DELETE: verify `created_by == user["user_id"]`
- Videos PATCH/DELETE: verify `created_by == user["user_id"]`
- Invite links DELETE: verify `created_by`
- **Why:** Any authenticated teacher could modify another teacher's data

### Security: Teacher-only guards added
- **File:** `backend/main.py`
- Added `[teacher]` guard to: `GET /reports/attendance`, `GET /students/{id}/report`, `GET /join-requests`, `POST /demo/create-accounts`, `POST /videos`, `POST /tests`, `GET /videos/{id}/stats`
- Students filter: `GET /tests?class_id=` now filters `.neq("status", "draft")` for student callers
- **Why:** Student accounts could access teacher-only endpoints

### Schema: Missing tables added
- **File:** `backend/schema.sql`
- Added `invite_links` and `invite_requests` tables with RLS policies
- **Why:** Tables were used in backend code but not defined in schema

### Feature: Excel template download
- **File:** `frontend/src/components/teacher/BulkImportModal.jsx`
- Added `downloadTemplate()` function and "Download Excel Template" button below drag-drop zone
- Template pre-fills Standard column with current standard name if opened from StandardDetailPage
- Example rows use empty email fields (not `aarav@example.com`) to avoid duplicate email errors on re-import

### Feature: Default student password
- **Files:** `frontend/src/store.js`, `frontend/src/pages/teacher/SettingsPage.jsx`, `frontend/src/lib/bulkImport.js`, `frontend/src/components/teacher/BulkImportModal.jsx`, `frontend/src/pages/teacher/StandardDetailPage.jsx`
- Added `useSettingsStore` (persisted to `tutoria-settings` localStorage key)
- Settings → Students section with visible input + Save button
- Used as `fixedPassword` in `parseImportFile()` — bulk import uses it for all student passwords
- AddStudentModal pre-fills password field with default, shows masked hint

### Bugfix: Bulk import error handling
- **File:** `backend/main.py` bulk_import_students()
- Fixed None-safety: `auth_res.user.id` now has `if not auth_res.user: skipped_count += 1; continue`
- Duplicates (already-existing email/username) now counted as `skipped`, not `errors`
- Orphan cleanup: if `students` table insert fails after auth user was created, delete the auth user
- Return now includes `skipped` count: `{ created, skipped, errors }`
- **File:** `frontend/src/components/teacher/BulkImportModal.jsx`
- Done step now shows skipped count in amber text
- Template example rows no longer include `aarav@example.com`

### Bugfix: Students not appearing after bulk import
- **Files:** `frontend/src/components/teacher/BulkImportModal.jsx`, `frontend/src/pages/teacher/StandardDetailPage.jsx`
- Added `useEffect([step])` in BulkImportModal to fire `onImportComplete` immediately when step becomes 'done' — not waiting for button click
- `onImportComplete` now also calls `setTab('students')` and `cache.invalidateStudents()`
- **Why:** (1) If user closed modal with X instead of button, refresh never fired. (2) User stayed on Subjects tab after import. (3) Cache wasn't invalidated so navigating away+back showed 0 students.

### Docs: SYSTEM_ARCHITECTURE.md rewritten
- **File:** `E:\IMP projects\Udaya\SYSTEM_ARCHITECTURE.md`
- Full rewrite with all 70+ endpoints, all 17 tables, correct stack info, AI rules
- Previous version had ~8 endpoints documented, missing 10 tables, wrong video/auth descriptions

### Docs: New documentation suite created
- **Files:** `PLAN.md` (updated), `ARCHITECTURE.md`, `API_REFERENCE.md`, `DATABASE.md`, `AI_CONTEXT.md`, `FEATURES_STATUS.md`, `CHANGELOG.md`
- **Why:** Old PLAN.md was for a different architecture (Next.js 14 + TypeScript + Antigravity). Replaced with accurate documentation matching the actual React 18 + Vite + FastAPI stack.

---

## Earlier — Initial Build (Phases 1–8)

All features below were built before this changelog was started.

- Auth system (login/logout/verify/single-device/force-password-change)
- Teacher portal: standards, subjects, student management, video upload, tests, attendance, broadcasts, reminders, reports, leaderboard, dashboard
- Student portal: home, subjects, video player (with offline caching), test taking (anti-cheat), broadcasts (real-time WebSocket), profile, leaderboard
- Zustand state management with cache TTL and localStorage persistence
- RLS policies on all tables
- Cloudflare Stream integration
- Supabase Storage for broadcast attachments
