# Tutoria LMS — Feature Status

Last updated: May 2026

---

## ✅ Completed Features

### Authentication
- [x] Teacher login (email + password)
- [x] Student login (username → synthetic email → Supabase auth)
- [x] JWT token stored in localStorage
- [x] Background token verification (`GET /auth/me`) on app mount
- [x] Single-device enforcement (fingerprint via `student_sessions` table)
- [x] Force password change on first login (`must_change_pwd` flag)
- [x] Change password (`POST /auth/change-password`)
- [x] Logout (`POST /auth/logout`)
- [x] Blocked student login rejection

### Teacher Portal — Standards & Subjects
- [x] Standards grid (SubjectsPage)
- [x] Create / edit / delete standard
- [x] Standard detail page (students + subjects tabs)
- [x] Create / edit / delete subject
- [x] Subject detail page (videos + tests + attendance tabs)

### Teacher Portal — Student Management
- [x] Add student individually (creates Supabase auth + students row)
- [x] Bulk import via CSV / XLSX / DOCX (`BulkImportModal`)
- [x] Download Excel template for bulk import
- [x] Duplicate detection (skipped, not errored) in bulk import
- [x] Credential sheet download after bulk import
- [x] Default student password setting (persisted to localStorage)
- [x] Student list with search
- [x] Block / unblock student
- [x] Reset student password (auto-generates, sets must_change_pwd)
- [x] Delete student (removes auth + DB row)
- [x] Student detail page (profile + report)
- [x] Invite link generation (QR code)
- [x] Join flow via invite code
- [x] Approve / reject join requests

### Teacher Portal — Videos
- [x] Upload video to Cloudflare Stream
- [x] Upload video to Supabase Storage fallback (when Cloudflare not configured — auto-creates `videos` bucket)
- [x] YouTube Unlisted Video support (adds URL instead of uploading file)
- [x] Manual video entry (without uploading)
- [x] Edit video title / description / allow_download
- [x] Delete video (removes from Cloudflare + DB)
- [x] Video stats (watch count, completion count)

### Teacher Portal — Tests
- [x] Create test (title, duration, marks, negative marking)
- [x] Create test with questions atomically
- [x] Add questions to existing test
- [x] Edit test (title, duration, status, marks, scheduling)
- [x] Delete test
- [x] Publish / unpublish test (draft → published)
- [x] View test results (all student attempts)
- [x] Results sheet with scores and flagged indicators

### Teacher Portal — Attendance
- [x] Weekly attendance grid per subject
- [x] Mark present / absent / late per student per day
- [x] Undo / clear a mark
- [x] Attendance summary per student (attendance_summary view)
- [x] Low-attendance report (`GET /reports/attendance`)
- [x] CSV export of attendance report

### Teacher Portal — Broadcasts
- [x] Send broadcast message to a standard
- [x] Attach file to broadcast (Supabase Storage `broadcasts` bucket)
- [x] Real-time WebSocket delivery
- [x] Broadcast history persisted to DB + broadcasts.json
- [x] Soft-delete broadcast (WebSocket `delete_broadcast` event propagates to all clients)
- [x] Edit broadcast message (WebSocket `edit_broadcast` event propagates)
- [x] Standard selector in BroadcastsPage
- [x] Read count display per message (teacher view — `✓✓ N/Total read` via `broadcast_reads` table)

### Teacher Portal — Reports & Dashboard
- [x] Dashboard stats (standards / students / subjects / videos counts)
- [x] Dashboard activity feed (recent submissions, watches, new students)
- [x] Attendance reports with filters (standard, date range, threshold)
- [x] CSV export
- [x] Leaderboard (students ranked by points)

### Teacher Portal — Reminders
- [x] Create reminder with optional scheduled date
- [x] Mark reminder done
- [x] Edit reminder
- [x] Delete reminder

### Teacher Portal — Live Classes
- [x] Schedule live class with Zoom Server-to-Server OAuth
- [x] Auto-create Zoom meetings via API
- [x] Start class as host within app using Zoom Web SDK
- [x] End class and fetch participant list automatically
- [x] View attendance sheet for past live classes

### Teacher Portal — Team Management
- [x] Create team member sub-teacher accounts (automatic Supabase Auth user registration)
- [x] List existing team members under primary teacher settings
- [x] Remove team members (deletes Supabase Auth account and deletes `sub_teachers` DB entry)
- [x] Restrict Settings page (only available to primary teacher; sub-teachers are blocked with custom ShieldOff view)
- [x] Namespace data sharing: all database queries use primary teacher's ID as `teacher_id` instead of caller's own ID, so sub-teachers can view and manage their primary teacher's standards, classes, and students

### Teacher Portal — Settings
- [x] Default student password (saved to localStorage, used in bulk + individual add)
- [x] Change teacher's own password
- [x] LMS branding — custom name + logo (base64, persisted to localStorage via Zustand)
- [x] Notifications toggle UI (not yet wired to backend)
- [x] Security toggle UI (not yet wired to backend)

### Student Portal
- [x] Student home (welcome + quick stats)
- [x] Subjects list
- [x] Subject view (videos list)
- [x] Video player (Cloudflare Stream embed, native `<video>`, or custom YouTube IFrame player without URL leak)
- [x] Video progress tracking (POST /videos/{id}/complete)
- [x] Offline video download + playback (Cache API)
- [x] Live classes tab with scheduled/live/ended status
- [x] Join live class within app using Zoom Web SDK (URL hidden)
- [x] Test list (non-draft only)
- [x] Test taking with timer
- [x] Anti-cheat (tab switch detection, flagged flag)
- [x] Test submit + scoring + points
- [x] Test result page
- [x] Test history
- [x] Real-time broadcasts (WebSocket)
- [x] Student profile view + edit
- [x] Student profile photo upload (POST /api/students/me/avatar → Supabase Storage `avatars` bucket)
- [x] Avatar displayed on: StudentProfilePage (header), StudentDetailPage (teacher view), StudentLeaderboardPage (podium + list)
- [x] Avatar persists across page reloads — `/auth/me` now returns `avatar_url`
- [x] Avatar component supports `src` prop with graceful fallback to colored initials on load error
- [x] Change password (forced on first login)
- [x] Leaderboard (with current student highlighted)

### Security & Infrastructure
- [x] WebSocket authentication via query param token
- [x] Ownership checks on all PATCH/DELETE endpoints
- [x] Teacher-only guards on all teacher endpoints
- [x] draft tests filtered for students
- [x] `correct_idx` stripped from question responses for students
- [x] RLS enabled on all tables (schema.sql)
- [x] Orphan auth user cleanup in bulk import
- [x] Invite link ownership check on delete

---

## ⬜ Pending Features

### P1 — High value, low effort

- [x] **Push notifications** — `notifications` table exists, endpoints exist (`GET /notifications`, `POST /notifications/read-all`, `PATCH /notifications/{id}/read`) — bell UI in TopBar wired to live data with polling.
- [x] **Test scheduling** — `tests.scheduled_for` column exists. Date picker in `NewTestModal`, future-scheduled tests hidden from students, "Publishes on" label on teacher test cards.
- [x] **Broadcast scheduling** — `scheduled_for` column added, schedule UI in BroadcastThread, future-scheduled hidden from students, "Scheduled" pill on teacher bubbles.
- [x] **Student read receipts (student side)** — Student portal calls `POST /broadcast-reads` when broadcasts load/arrive via WebSocket, with a `markedReadRef` Set dedup to avoid re-sending on reconnect.

### P2 — Medium effort

- [x] **PDF report export** — Two PDF exports on `ReportsPage`: "Class Report" (full student table + low-attendance section) via `handleExportPDF`, and "Export PDF" (low-attendance only) via `exportAttendancePDF`. Client-side generation with jspdf + jspdf-autotable.
- [x] **Question bank** — `question_bank` table in schema.sql. 4 backend endpoints (GET/POST/DELETE/import). `QuestionBankPage` at `/teacher/question-bank` with search, add form, delete. `ImportFromBankModal` in `NewTestModal`.
- [x] **Teacher profile page** — New `TeacherProfilePage` at `/teacher/profile` with avatar, stats row, inline name edit (PATCH /auth/profile), and link to change password. Linked from MorePage "My Profile" row.
- [x] **Video chapters** — `chapters JSONB` column (migration comment in schema.sql). EditVideoModal in Modals.jsx for teacher (title + MM:SS inputs). Chapter timeline in StudentVideoPlayerPage with click-to-seek (native video ref + Cloudflare postMessage) and active-chapter highlighting via onTimeUpdate.
- [x] **Multi-teacher team management** — `sub_teachers` table in schema.sql. Team Members management UI added to SettingsPage (primary teacher only, sub-teachers blocked from settings). Namespace isolation via primary teacher's ID ensures team members share the same standard, subjects, and student data.

### P3 — Future

- [x] PWA manifest + Service Worker — `vite-plugin-pwa` with auto-update SW, manifest.webmanifest, Workbox caching (glob precache + Supabase Storage runtime cache), icon-192.png + icon-512.png, theme-color meta tag.
- [ ] Parent portal (read-only role)
- [ ] Mobile app (React Native)
