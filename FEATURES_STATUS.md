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
- [x] Attach file to broadcast (Supabase Storage)
- [x] Real-time WebSocket delivery
- [x] Broadcast history persisted to DB + broadcasts.json
- [x] Soft-delete broadcast
- [x] Edit broadcast message
- [x] Standard selector in BroadcastsPage

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

### Teacher Portal — Settings
- [x] Default student password (saved to localStorage, used in bulk + individual add)
- [x] Change teacher's own password
- [x] Notifications toggle UI (not yet wired to backend)
- [x] Security toggle UI (not yet wired to backend)

### Student Portal
- [x] Student home (welcome + quick stats)
- [x] Subjects list
- [x] Subject view (videos list)
- [x] Video player (Cloudflare Stream embed)
- [x] Video progress tracking (POST /videos/{id}/complete)
- [x] Offline video download + playback (Cache API)
- [x] Test list (non-draft only)
- [x] Test taking with timer
- [x] Anti-cheat (tab switch detection, flagged flag)
- [x] Test submit + scoring + points
- [x] Test result page
- [x] Test history
- [x] Real-time broadcasts (WebSocket)
- [x] Student profile view + edit
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

- [ ] **Push notifications** — `notifications` table exists, no endpoint yet. Build `GET /notifications`, `POST /notifications`, `PATCH /notifications/{id}/read`. Add bell icon to TopBar.
- [ ] **Student profile photo** — Add `avatar_url` upload to `PATCH /api/students/me`. Supabase Storage bucket needs creation. Show in StudentProfilePage + Avatar component.
- [ ] **Test scheduling** — `tests.scheduled_for` column exists. Wire it in `NewTestModal` date picker. Backend already accepts `scheduled_for` in TestUpdate. Add frontend display.
- [ ] **Broadcast scheduling** — `broadcasts.scheduled_for` column exists. Add scheduled send UI in BroadcastThread. Backend needs filter: `scheduled_for IS NULL OR scheduled_for <= now()`.
- [ ] **Read receipts display** — `broadcast_reads` table exists. Add read count badge on broadcast messages for teacher. Student side: `POST /broadcast-reads` on message visible (upsert).

### P2 — Medium effort

- [ ] **PDF report export** — `jspdf` + `jspdf-autotable` already installed. Wire in `ReportsPage` alongside existing CSV export button.
- [ ] **Question bank** — New table `question_bank(id, test_id, question, options, correct_idx, teacher_id)`. New page. Import from bank into test.
- [ ] **Teacher profile page** — Expand `MorePage` or create `TeacherProfilePage`. Show name, email, created standards count.
- [ ] **Video chapters** — Add `chapters JSONB` column to `videos` table. Timeline UI in `StudentVideoPlayerPage`.
- [ ] **Multi-teacher admin** — Add `teachers` table or `is_admin` column. Admin can create other teacher accounts.

### P3 — Future

- [ ] PWA manifest + Service Worker
- [ ] Parent portal (read-only role)
- [ ] Live class (WebRTC integration)
- [ ] Mobile app (React Native)
