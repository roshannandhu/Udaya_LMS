# Tutoria LMS — Changelog

Format: newest first. Each entry includes what changed, which files, and why.

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
