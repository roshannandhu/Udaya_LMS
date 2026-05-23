# Tutoria LMS — Master Plan

> **Stack:** React 18 + Vite · FastAPI (Python) · Supabase (Auth + PostgreSQL + Storage) · Cloudflare Stream · Tailwind CSS
> **Frontend language:** JavaScript (JSX) — NOT TypeScript
> **ORM:** Supabase Python client — NOT SQLAlchemy (it's in requirements.txt but unused)
> **Auth:** Supabase JWT validated via `supabase.auth.get_user(token)` — NOT custom JWT
> **Rule:** Read ARCHITECTURE.md + AI_CONTEXT.md before touching any file.

---

## Current Status

| Phase | Feature | Status |
|---|---|---|
| Foundation | Auth (login/logout/verify/single-device/force-pwd-change) | ✅ |
| Foundation | Teacher portal routing + layout | ✅ |
| Foundation | Student portal routing + layout | ✅ |
| Core | Standards CRUD | ✅ |
| Core | Subjects CRUD | ✅ |
| Core | Student management (create/edit/block/delete/reset-pwd) | ✅ |
| Core | Bulk student import (CSV/XLSX/DOCX + credential download) | ✅ |
| Core | Invite links + join flow | ✅ |
| Core | Video upload (Cloudflare Stream) + playback | ✅ |
| Core | Offline video caching (Cache API) | ✅ |
| Core | Tests (MCQ, negative marking, anti-cheat, scoring) | ✅ |
| Core | Attendance (week grid, per-subject, CSV export) | ✅ |
| Core | Broadcasts (real-time WebSocket + DB persistence) | ✅ |
| Core | Reminders | ✅ |
| Core | Reports + attendance CSV export | ✅ |
| Core | Leaderboard | ✅ |
| Core | Dashboard stats + activity feed | ✅ |
| Core | Default student password setting | ✅ |
| Core | Standard termination (PIN-gated + student backup Excel export) | ✅ |
| Security | WebSocket token auth | ✅ |
| Security | Endpoint ownership checks (all PATCH/DELETE) | ✅ |
| Security | RLS policies in schema.sql | ✅ |

---

## Pending / Roadmap

These are features not yet built. Prioritize top-to-bottom.

### P1 — High value, low effort

| Feature | Where | Notes |
|---|---|---|
| Push notifications (browser) | Frontend + backend `/api/notifications` | Table exists, endpoint not built |
| Student profile photo upload | `StudentProfilePage` + `PATCH /api/students/me` | Supabase Storage bucket exists |
| Test scheduling (publish at future time) | `NewTestModal` + backend | `scheduled_for` column exists in tests table |
| Broadcast scheduling | `BroadcastThread` + backend | `scheduled_for` exists in broadcasts table |
| Read receipts UI | `BroadcastThread` / `StudentBroadcastsPage` | `broadcast_reads` table exists |

### P2 — Medium effort

| Feature | Where | Notes |
|---|---|---|
| Question bank (reusable questions) | New page + `question_bank` table | Table in plan, not in schema yet |
| Student import via invite QR scan | `BulkImportModal` + `/join/:code` | Partial — join requests exist |
| Teacher profile page | New `TeacherProfilePage` | Only MorePage exists currently |
| Multi-teacher / admin delegation | `SettingsPage` + new endpoint | `teachers.is_admin` column needed |
| PDF export of reports | `ReportsPage` | jspdf + jspdf-autotable already installed |
| Video chapters / timestamps | `SubjectDetailPage` + videos table | New column `chapters` JSONB |

### P3 — Future / nice-to-have

| Feature | Notes |
|---|---|
| PWA Service Worker | manifest.json + sw.js |
| Parent portal (read-only) | New role + routing |
| Live class (WebRTC/Zoom) | Complex — external integration |
| AI attendance from camera | Very complex — future |
| Mobile app | React Native — separate project |

---

## Development Rules

1. Read `AI_CONTEXT.md` before every session.
2. Check `FEATURES_STATUS.md` to avoid building something that already exists.
3. Every new column → add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to `schema.sql`.
4. Every new endpoint → add to `API_REFERENCE.md`.
5. Mark features ✅ in this file and `FEATURES_STATUS.md` when complete and tested.
