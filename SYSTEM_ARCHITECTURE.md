# Tutoria LMS — System Architecture & Developer Reference

> **For AI agents**: Read this entire document before touching any file. Section 19 (AI Rules) is mandatory. Every endpoint, table, and component listed here is real and tested — do not invent alternatives.

---

## 1. Project Overview

**Tutoria** is a two-portal LMS for private tuition teachers and their students.

- **Teacher Portal** — Dashboard, Classes, Subjects, Students, Tests, Broadcasts, Attendance, Reports, Reminders
- **Student Portal** — Dashboard, Subjects, Video Player, Tests, Broadcasts, Profile, Leaderboard

**Production Stack:**

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 (port 3001) |
| Backend | FastAPI (Python 3.12+), single file `backend/main.py` (port 8001) |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (JWT) validated by FastAPI `verify_token` dependency |
| State | Zustand 4 — three stores (see Section 12) |
| Styling | Tailwind CSS 3, heavy glassmorphism (`glass-panel`, `glass-nav`) |
| Icons | lucide-react |
| Video | Cloudflare Stream (upload + playback) |
| Files | Supabase Storage (attachments) |

---

## 2. Environment Variables

### `backend/.env`
```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJ...          # anon key (public)
SUPABASE_SERVICE_KEY=eyJ...  # service role key (bypasses RLS — keep secret)
CLOUDFLARE_ACCOUNT_ID=       # required for video upload
CLOUDFLARE_STREAM_API_TOKEN= # required for video upload
```

### `frontend/.env.local`
```env
VITE_API_URL=http://localhost:8001/api
```

---

## 3. Folder Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── shared/          TopBar.jsx, BottomNav.jsx, Sidebar.jsx, SearchPalette.jsx
│   │   ├── teacher/         AttendanceGrid.jsx, AttendanceTab.jsx, BroadcastThread.jsx,
│   │   │                    BulkImportModal.jsx, Modals.jsx, NewTestModal.jsx,
│   │   │                    StudentReportModal.jsx, TestResultsSheet.jsx,
│   │   │                    AttendanceStudentCard.jsx
│   │   └── ui.jsx           Btn, Input, Modal, Toggle, Divider, Select (shared primitives)
│   ├── lib/
│   │   ├── api.js            apiClient(endpoint, options) — fetch wrapper with Bearer token
│   │   ├── auth.js           useAuthStore — login/logout/verify/changePassword
│   │   └── bulkImport.js     parseImportFile — CSV/XLSX/DOCX parser for bulk student import
│   ├── pages/
│   │   ├── teacher/          TodayPage, SubjectsPage, StandardDetailPage, SubjectDetailPage,
│   │   │                     StudentsPage, StudentDetailPage, BroadcastsPage, TestsPage,
│   │   │                     ReportsPage, RemindersPage, SettingsPage, AttendancePage,
│   │   │                     MorePage, TeacherLayout
│   │   └── student/          StudentHomePage, StudentSubjectsPage, StudentSubjectViewPage,
│   │                         StudentVideoPlayerPage, StudentTestsPage, StudentTestTakingPage,
│   │                         StudentTestResultPage, StudentBroadcastsPage, StudentProfilePage,
│   │                         StudentChangePasswordPage, StudentLeaderboardPage, StudentLayout
│   ├── App.jsx               Router, ProtectedTeacherRoute, ProtectedStudentRoute, AuthHandler
│   ├── store.js              useAppCache + useStore + useSettingsStore (Zustand)
│   └── main.jsx

backend/
├── main.py                   All FastAPI routes, Pydantic models, WebSocket manager
├── schema.sql                PostgreSQL DDL — run in Supabase SQL Editor
├── broadcasts.json           WebSocket broadcast history (file-based fallback)
├── .env                      Secrets
└── requirements.txt
```

---

## 4. Authentication System

### Flow
1. Client POSTs to `POST /api/auth/login` with `email_or_username`, `password`, `device_fingerprint`
2. Backend resolves username→email if needed (queries `students` table), then calls `supabase.auth.sign_in_with_password`
3. On success, backend upserts `student_sessions` (student only) and returns `{ token, user: { id, name, role, email, username, must_change_pwd } }`
4. Token stored in `localStorage` as `tutoria_token`; role as `tutoria_user_role`
5. All subsequent API calls send `Authorization: Bearer <token>` header
6. `verify_token` FastAPI dependency validates via `supabase.auth.get_user(token)` — returns `{ user_id, role, email }`

### Single-Device Enforcement
- On login, backend upserts `student_sessions` with the device fingerprint
- `ProtectedStudentRoute` calls `enforceSingleDevice(userId)` from `useAuthStore`
- That calls `POST /api/auth/verify-device` with current fingerprint
- If mismatch → `{ allowed: false }` → client force-logs out

### First-Login Password Change
- Students have `must_change_pwd = true` on creation
- `ProtectedStudentRoute` checks `user.must_change_pwd` — if true, redirects to `/student/change-password`
- After successful password change, flag is cleared

### Key Implementation Detail
- `students.id` = Supabase `auth.users.id` — same UUID, set explicitly on insert
- Teacher accounts are created via `POST /api/admin/create-teacher` (Supabase auth only, no students row)
- Backend uses `service_supabase` (service role key) for all admin DB operations — this bypasses RLS

---

## 5. Database Schema

All tables use UUID PKs. `service_role` key bypasses RLS — never expose it to the client.

### `standards`
```sql
id UUID PK, name TEXT, short TEXT, emoji TEXT DEFAULT '📚',
teacher_id UUID,           -- references auth.users.id
start_date DATE, end_date DATE,
attendance_threshold INTEGER DEFAULT 75,
created_at TIMESTAMPTZ
```

### `subject_classes`
```sql
id UUID PK,
standard_id UUID FK → standards(id) ON DELETE CASCADE,
name TEXT, emoji TEXT DEFAULT '📐', end_date DATE, created_at TIMESTAMPTZ
```

### `students`
```sql
id UUID PK,               -- same as auth.users.id, set explicitly on insert
name TEXT, username TEXT UNIQUE, email TEXT, phone TEXT, avatar_url TEXT,
standard_id UUID FK → standards(id),
points INTEGER DEFAULT 0, attendance_pct NUMERIC DEFAULT 0, avg_score NUMERIC DEFAULT 0,
blocked BOOLEAN DEFAULT false, must_change_pwd BOOLEAN DEFAULT true,
created_at TIMESTAMPTZ
```

### `student_sessions`  (single-device enforcement)
```sql
id UUID PK, student_id UUID FK → students(id) ON DELETE CASCADE UNIQUE,
device_fingerprint TEXT, last_active_at TIMESTAMPTZ, created_at TIMESTAMPTZ
```

### `attendance_records`
```sql
id UUID PK,
student_id UUID FK → students(id) ON DELETE CASCADE,
subject_class_id UUID FK → subject_classes(id) ON DELETE CASCADE,
date DATE, status TEXT CHECK IN ('present','absent','late'),
marked_by UUID,           -- teacher's auth.users.id
UNIQUE(student_id, subject_class_id, date)
```

### `attendance_summary` (VIEW — not a table)
Computed from `attendance_records`. Returns per-student per-subject attendance percentages.
Columns: `student_id, standard_id, subject_class_id, subject_name, total_sessions, present_count, absent_count, late_count, attendance_pct`

### `videos`
```sql
id UUID PK, class_id UUID FK → subject_classes(id) ON DELETE CASCADE,
title TEXT, description TEXT, source_type TEXT DEFAULT 'upload',
youtube_video_id TEXT, youtube_url TEXT,
cloudflare_video_id TEXT, storage_path TEXT, duration_secs INTEGER,
size_bytes BIGINT, allow_download BOOLEAN DEFAULT true,
created_by UUID,          -- teacher's auth.users.id
created_at TIMESTAMPTZ
```

### `live_classes`
```sql
id UUID PK, class_id UUID FK → subject_classes(id) ON DELETE CASCADE,
title TEXT, scheduled_at TIMESTAMPTZ, duration_mins INTEGER DEFAULT 60,
zoom_meeting_id TEXT, zoom_join_url TEXT, zoom_start_url TEXT,
status TEXT DEFAULT 'scheduled',
created_by UUID, created_at TIMESTAMPTZ
```

### `live_class_attendance`
```sql
id UUID PK, live_class_id UUID FK → live_classes(id) ON DELETE CASCADE,
student_id UUID FK → students(id) ON DELETE CASCADE,
joined_at TIMESTAMPTZ, left_at TIMESTAMPTZ, duration_mins INTEGER,
attended BOOLEAN DEFAULT false, UNIQUE(live_class_id, student_id)
```

### `video_progress`
```sql
video_id UUID FK → videos(id) ON DELETE CASCADE,
student_id UUID FK → students(id) ON DELETE CASCADE,
progress_secs INTEGER DEFAULT 0, completed BOOLEAN DEFAULT false,
downloaded BOOLEAN DEFAULT false, last_watched_at TIMESTAMPTZ,
PRIMARY KEY (video_id, student_id)
```

### `tests`
```sql
id UUID PK, class_id UUID FK → subject_classes(id) ON DELETE CASCADE,
title TEXT, duration_mins INTEGER, total_marks NUMERIC,
negative_marking BOOLEAN DEFAULT false, penalty NUMERIC DEFAULT 0,
status TEXT DEFAULT 'draft',   -- 'draft' | 'published' | 'archived'
scheduled_for TIMESTAMPTZ, created_by UUID, created_at TIMESTAMPTZ
```

### `questions`
```sql
id UUID PK, test_id UUID FK → tests(id) ON DELETE CASCADE,
question TEXT, options JSONB,  -- array of 4 strings
correct_idx INTEGER,           -- 0-based index. NEVER sent to students.
order_num INTEGER
```

### `test_attempts`
```sql
id UUID PK, test_id UUID FK, student_id UUID FK,
answers JSONB,                 -- { "question_id": chosen_idx }
score NUMERIC, correct_count INTEGER, wrong_count INTEGER,
marks_deducted NUMERIC DEFAULT 0, points_earned INTEGER DEFAULT 0,
flagged BOOLEAN DEFAULT false, cheat_events JSONB,
started_at TIMESTAMPTZ, submitted_at TIMESTAMPTZ,
UNIQUE(test_id, student_id)    -- one attempt per student per test
```

### `broadcasts`
```sql
id UUID PK, standard_id UUID FK → standards(id) ON DELETE CASCADE,
sender_id UUID, message TEXT, attachment_url TEXT, attachment_type TEXT,
deleted BOOLEAN DEFAULT false, edited BOOLEAN DEFAULT false,
created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
```

### `broadcast_reads`
```sql
broadcast_id UUID FK → broadcasts(id) ON DELETE CASCADE,
student_id UUID FK → students(id) ON DELETE CASCADE,
read_at TIMESTAMPTZ, PRIMARY KEY (broadcast_id, student_id)
```

### `reminders`
```sql
id UUID PK, teacher_id UUID,  -- auth.users.id
title TEXT, scheduled_for TIMESTAMPTZ, context TEXT,
done BOOLEAN DEFAULT false, created_at TIMESTAMPTZ
```

### `notifications`
```sql
id UUID PK, recipient_id UUID, recipient_type TEXT, type TEXT,
title TEXT, body TEXT, data JSONB, read BOOLEAN DEFAULT false, created_at TIMESTAMPTZ
```

### `bulk_imports`  (audit log only)
```sql
id UUID PK, teacher_id UUID, filename TEXT,
total_rows INTEGER, created INTEGER, skipped INTEGER, errors INTEGER,
created_at TIMESTAMPTZ
```

### `invite_links`
```sql
id UUID PK, code TEXT UNIQUE, standard_id UUID FK → standards(id) ON DELETE CASCADE,
created_by UUID, max_uses INTEGER DEFAULT 50, use_count INTEGER DEFAULT 0,
expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ
```

### `invite_requests`
```sql
id UUID PK, invite_code TEXT, student_name TEXT, student_email TEXT,
status TEXT DEFAULT 'pending' CHECK IN ('pending','approved','rejected'),
created_at TIMESTAMPTZ
```

---

## 6. Entity Relationship

```
Teacher (auth.users)
  └── Standards
        ├── Broadcasts ← → broadcast_reads (student read receipts)
        ├── Students
        │     ├── student_sessions  (1:1 — device enforcement)
        │     ├── video_progress    (m:m with videos)
        │     └── test_attempts     (m:m with tests)
        ├── invite_links / invite_requests
        └── subject_classes (Subjects)
              ├── videos
              ├── attendance_records
              └── tests
                    └── questions
```

---

## 7. Complete API Reference

All endpoints require `Authorization: Bearer <token>` unless marked `[public]`.
`[teacher]` = 403 if role ≠ teacher. `[student]` = 403 if role ≠ student.

---

### Auth

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | public | Body: `{ email_or_username, password, device_fingerprint? }`. Returns `{ token, user }` |
| POST | `/api/auth/logout` | any | Calls supabase signOut |
| GET | `/api/auth/me` | any | Returns current user from token |
| POST | `/api/auth/verify-device` | student | Body: `{ student_id, device_fingerprint }`. Returns `{ allowed: bool }` |
| PATCH | `/api/auth/profile` | any | Body: `{ name?, email?, phone? }`. Updates auth user_metadata |
| POST | `/api/auth/change-password` | any | Body: `{ new_password }`. Updates Supabase auth password, clears `must_change_pwd` flag |

---

### Dashboard

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/dashboard/stats` | teacher | Returns `{ standards, students, subjects, videos }` counts |
| GET | `/api/dashboard/activity` | teacher | Returns recent 20 activities (test submissions, video watches, new students) |

---

### Standards

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/standards` | teacher | Returns all standards owned by the logged-in teacher |
| GET | `/api/standards/{standard_id}` | teacher | Returns single standard with ownership check |
| POST | `/api/standards` | teacher | Body: `{ name, short?, emoji? }` |
| PATCH | `/api/standards/{standard_id}` | teacher | Body: `{ name?, short?, emoji?, start_date?, end_date? }`. Ownership checked. |
| DELETE | `/api/standards/{standard_id}` | teacher | Cascades to subjects, broadcasts. Ownership checked. |

---

### Subjects (subject_classes)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/subjects` | teacher | Query: `?standard_id=`. Returns subjects + video/test counts |
| POST | `/api/subjects` | teacher | Body: `{ standard_id, name, emoji?, end_date? }` |
| PATCH | `/api/subjects/{subject_id}` | teacher | Body: `{ name?, emoji?, end_date? }`. Ownership verified via standard. |
| DELETE | `/api/subjects/{subject_id}` | teacher | Ownership verified via standard. |

---

### Students

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/students` | teacher | Query: `?standard_id=` optional. Returns students array. |
| GET | `/api/students/{student_id}` | teacher | Returns single student record |
| GET | `/api/students/{student_id}/report` | teacher | Returns full report: attendance summary, test results, video progress |
| GET | `/api/students/{student_id}/attendance` | teacher/student | Returns attendance records for a student. Student can only view own. |
| POST | `/api/admin/create-student` | teacher | Body: `{ email?, password, name, username, standard_id? }`. Creates Supabase auth user + students row. |
| POST | `/api/students/bulk` | teacher | Body: `{ filename, students: [{name, username, email?, phone?, standard_id, temp_password}] }`. Returns `{ created, skipped, errors }`. Cleans up orphan auth users on DB failure. |
| PATCH | `/api/students/me` | student | Body: `{ name?, email?, phone? }`. Student updates own profile. |
| PATCH | `/api/students/{student_id}` | teacher | Body: `{ name?, email?, phone?, standard_id?, username? }` |
| PATCH | `/api/students/{student_id}/block` | teacher | Body: `{ blocked: bool }`. Blocked students cannot log in. |
| POST | `/api/students/{student_id}/reset-password` | teacher | Body: `{ new_password }`. Resets student password, sets `must_change_pwd = true`. |
| DELETE | `/api/students/{student_id}` | teacher | Deletes students row + Supabase auth user. |

---

### Videos

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/videos` | any | Query: `?class_id=`. Students get same response (no access restriction beyond auth). |
| POST | `/api/videos` | teacher | Body JSON: `{ class_id, title, description?, cloudflare_video_id?, duration_secs?, allow_download? }`. For already-uploaded videos. |
| POST | `/api/videos/upload` | teacher | Multipart form: `file` + `class_id` + `title` + optional fields. Uploads to Cloudflare Stream. Requires `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_STREAM_API_TOKEN` in env. |
| POST | `/api/videos/youtube` | teacher | Body: `{ class_id, title, description?, youtube_video_id, youtube_url }`. Creates an unlisted YouTube video link. |
| GET | `/api/videos/{video_id}/token` | any | Returns the YouTube video ID for the iframe API. Requires standard enrollment match. |
| GET | `/api/videos/{video_id}/thumbnail` | any | Returns the YouTube thumbnail URL. |
| PATCH | `/api/videos/{video_id}` | teacher | Body: `{ title?, description?, allow_download? }`. Ownership checked via `created_by`. |
| DELETE | `/api/videos/{video_id}` | teacher | Deletes from Cloudflare Stream + DB. Ownership checked. |
| GET | `/api/videos/{video_id}/stats` | teacher | Returns watch count, completion count, download count for a video. |
| POST | `/api/videos/{video_id}/complete` | student | Body: `{ progress_secs?, downloaded? }`. Marks video as completed/updates progress in `video_progress`. Adds points to student. |

---

### Live Classes & Zoom

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/live-classes` | any | Query: `?class_id=`. Returns scheduled, live, and ended classes. |
| POST | `/api/live-classes` | teacher | Body: `{ class_id, title, scheduled_at, duration_mins? }`. Creates a Zoom meeting via S2S OAuth. |
| GET | `/api/live-classes/{live_class_id}/join-token` | any | Returns Zoom SDK signature for joining within app. URL is never exposed. |
| POST | `/api/live-classes/{live_class_id}/end` | teacher | Ends the class and fetches attendance from Zoom participant reports. |
| POST | `/api/live-classes/{live_class_id}/cancel` | teacher | Cancels a scheduled class. |
| GET | `/api/live-classes/{live_class_id}/attendance` | teacher | Returns the attendance list. |
| POST | `/api/zoom/webhook` | public | Zoom webhook endpoint to receive meeting events (ended, joined, left). |

---

### Tests

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/tests` | any | Query: `?class_id=`. Teachers see all statuses. Students only see non-draft tests. |
| POST | `/api/tests` | teacher | Body: `{ class_id, title, duration_mins, total_marks, negative_marking?, penalty?, status?, scheduled_for? }` |
| POST | `/api/tests/with-questions` | teacher | Body: `{ test: {...}, questions: [{question, options, correct_idx, order_num}] }`. Atomic create. |
| PATCH | `/api/tests/{test_id}` | teacher | Body: any TestUpdate fields. Ownership checked via `created_by`. |
| DELETE | `/api/tests/{test_id}` | teacher | Ownership checked. Cascades to questions and test_attempts. |
| GET | `/api/tests/{test_id}/questions` | any | Returns questions. Students: `correct_idx` is stripped from response. |
| POST | `/api/questions` | teacher | Body: `{ test_id, question, options, correct_idx, order_num }`. Add question to existing test. |
| GET | `/api/tests/{test_id}/take` | student | Returns test + questions (no correct answers) + validates not already attempted. Sets `started_at`. |
| GET | `/api/tests/{test_id}/attempt-status` | student | Returns `{ attempted: bool, attempt?: {...} }` |
| POST | `/api/tests/{test_id}/submit` | student | Body: `{ answers: { question_id: chosen_idx }, cheat_events?, flagged? }`. Scores the attempt, awards points. |
| GET | `/api/tests/{test_id}/results` | teacher | Returns all student attempts for a test with scores. |
| GET | `/api/student/tests/history` | student | Returns all test attempts for the logged-in student. |

---

### Attendance

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/subjects/{subject_id}/attendance` | teacher | Query: `?date=YYYY-MM-DD`. Returns attendance records for all students in that subject on that date. |
| GET | `/api/subjects/{subject_id}/attendance/week` | teacher | Returns 7-day attendance grid (Mon–Sun of current week). |
| POST | `/api/subjects/{subject_id}/attendance` | teacher | Body: `{ date: "YYYY-MM-DD", records: [{ student_id, status }] }`. Upserts records. |
| DELETE | `/api/subjects/{subject_id}/attendance/{student_id}/{date}` | teacher | Removes a single attendance mark. |
| GET | `/api/reports/attendance` | teacher | Query: `?standard_id=&from=&to=`. Returns per-student attendance summary. |
| GET | `/api/reports/export/attendance` | teacher | Same query params. Returns CSV download (`StreamingResponse`). |

---

### Broadcasts & WebSocket

| Method | Path | Auth | Notes |
|---|---|---|---|
| WS | `/api/ws/broadcasts/{standard_id}?token=<jwt>` | any | Real-time broadcast channel. Token validated on connect (closes with 4001 if invalid). History replayed on connect. |
| POST | `/api/broadcasts` | teacher | Body: `{ standard_id, message, attachment_url?, attachment_type? }`. Saves to DB + broadcasts via WebSocket + appends to `broadcasts.json`. |
| GET | `/api/broadcasts` | any | Query: `?standard_id=`. Returns broadcast history from DB. |
| DELETE | `/api/broadcasts/{broadcast_id}` | teacher | Soft-deletes (sets `deleted=true`). |
| PATCH | `/api/broadcasts/{broadcast_id}` | teacher | Body: `{ message }`. Sets `edited=true`. |

**WebSocket message format:**
```json
{ "id": "uuid", "standard_id": "uuid", "message": "text",
  "sender_name": "Teacher Name", "created_at": "ISO8601",
  "attachment_url": null, "attachment_type": null }
```

---

### Reminders

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/reminders` | teacher | Returns all reminders for the teacher, ordered by scheduled_for. |
| POST | `/api/reminders` | teacher | Body: `{ title, scheduled_for?, context? }` |
| PATCH | `/api/reminders/{reminder_id}` | teacher | Body: `{ title?, done?, scheduled_for? }` |
| DELETE | `/api/reminders/{reminder_id}` | teacher | Hard delete. |

---

### Reports & Leaderboard

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/reports/attendance` | teacher | See Attendance section |
| GET | `/api/reports/export/attendance` | teacher | See Attendance section |
| GET | `/api/leaderboard` | any | Query: `?standard_id=`. Returns students sorted by points desc. |

---

### Invite Links

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/invite-links` | teacher | Body: `{ standard_id, max_uses?, expires_at? }`. Generates a unique 8-char code. |
| GET | `/api/invite-links` | teacher | Query: `?standard_id=`. Returns all invite links for teacher's standards. |
| DELETE | `/api/invite-links/{link_id}` | teacher | Ownership checked via `created_by`. |
| GET | `/api/join/{code}` | public | Returns `{ standard_name, valid: bool }` for a given invite code. |
| POST | `/api/join/{code}` | public | Body: `{ student_name, student_email? }`. Creates invite request. |
| GET | `/api/join-requests` | teacher | Returns pending join requests for teacher's standards. |
| PATCH | `/api/join-requests/{request_id}/approve` | teacher | Creates student account (Supabase auth + students row), updates request status to 'approved'. |
| PATCH | `/api/join-requests/{request_id}/reject` | teacher | Sets request status to 'rejected'. |

---

### Misc

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | public | Returns `{ status: "ok", supabase: bool }` |
| POST | `/api/upload` | teacher | Multipart: `file`. Uploads to Supabase Storage, returns `{ url }`. Used for broadcast attachments. |
| POST | `/api/demo/create-accounts` | teacher | Creates demo teacher+student accounts. Dev/demo only. |

---

## 8. Pydantic Models (Backend Request Bodies)

```python
Standard:            name, short?, emoji?
StandardUpdate:      name?, short?, emoji?, start_date?, end_date?
SubjectClass:        standard_id, name, emoji?, end_date?
SubjectUpdate:       name?, emoji?, end_date?
Video:               class_id, title, description?, cloudflare_video_id?, duration_secs?, allow_download?
VideoUpdate:         title?, description?
Test:                class_id, title, duration_mins, total_marks, negative_marking?, penalty?, status?, scheduled_for?
TestUpdate:          title?, duration_mins?, total_marks?, negative_marking?, penalty?, status?, scheduled_for?
TestWithQuestions:   test: Test, questions: List[Question]
Question:            test_id, question, options: List[str], correct_idx, order_num
SubmitTestRequest:   answers: Dict[str,int], cheat_events?, flagged?
CreateStudentRequest: email?, password, name, username, standard_id?
BulkStudentItem:     name, username, email?, phone?, standard_id, temp_password
BulkImportRequest:   filename, students: List[BulkStudentItem]
LoginRequest:        email_or_username, password, device_fingerprint?
AttendanceRecord:    student_id, status (present|absent|late)
MarkAttendanceRequest: date, records: List[AttendanceRecord]
BroadcastRequest:    standard_id, message, attachment_url?, attachment_type?
EditBroadcastRequest: message
InviteLinkCreate:    standard_id, max_uses?, expires_at?
ReminderCreate:      title, scheduled_for?, context?
ReminderUpdate:      title?, done?, scheduled_for?
StudentProfileUpdate: name?, email?, phone?
UpdateProfileRequest: name?, email?, phone?
ChangePasswordRequest: new_password
VerifyDeviceRequest: student_id, device_fingerprint
```

---

## 9. Frontend Route Map

```
/login                            → LoginPage

/teacher/*                        → ProtectedTeacherRoute → TeacherLayout
  /teacher                        → TodayPage (dashboard — stats + activity)
  /teacher/subjects               → SubjectsPage (all standards grid)
  /teacher/subjects/:standardId   → StandardDetailPage (students + subjects tabs)
  /teacher/subjects/:standardId/:classId → SubjectDetailPage (videos + tests + attendance tabs)
  /teacher/students               → StudentsPage (all students across all standards)
  /teacher/students/:studentId    → StudentDetailPage
  /teacher/broadcasts             → BroadcastsPage (standard selector + chat UI)
  /teacher/tests                  → TestsPage
  /teacher/reports                → ReportsPage (attendance reports + CSV export)
  /teacher/reminders              → RemindersPage
  /teacher/settings               → SettingsPage
  /teacher/attendance             → AttendancePage
  /teacher/more                   → MorePage

/student/*                        → ProtectedStudentRoute → StudentLayout
  /student                        → StudentHomePage
  /student/subjects               → StudentSubjectsPage
  /student/subjects/:classId      → StudentSubjectViewPage (videos list)
  /student/subjects/:classId/video/:videoId → StudentVideoPlayerPage
  /student/tests                  → StudentTestsPage
  /student/tests/:testId/take     → StudentTestTakingPage (anti-cheat, timer)
  /student/tests/result           → StudentTestResultPage
  /student/broadcasts             → StudentBroadcastsPage (real-time WebSocket)
  /student/profile                → StudentProfilePage
  /student/change-password        → StudentChangePasswordPage (forced on first login)
  /student/leaderboard            → StudentLeaderboardPage
```

**Route Guards:**
- `ProtectedTeacherRoute` — redirects to `/login` if no user, to `/student` if role ≠ teacher
- `ProtectedStudentRoute` — same, plus redirects to `/student/change-password` if `must_change_pwd = true`
- `AuthHandler` — calls `verifyWithBackend()` on app mount, kicks off `prefetchAll()` once verified

---

## 10. State Management (Zustand)

### `useAuthStore` (`src/lib/auth.js`)
```js
{ user, role, isLoading, token }
login(email, password, fingerprint) → calls POST /api/auth/login
logout() → calls POST /api/auth/logout, clears localStorage
verifyWithBackend() → calls GET /api/auth/me, sets user/role
enforceSingleDevice(userId) → calls POST /api/auth/verify-device, force-logs out if not allowed
changePassword(newPwd) → calls POST /api/auth/change-password
```
Persists: `tutoria_token`, `tutoria_user_role` in localStorage.

### `useAppCache` (`src/store.js`)
Global data cache with 2-minute TTL. Hydrates instantly from localStorage on reload.
```js
{ standards[], subjects[], students[] }
prefetchAll()         → parallel fetch of all three if stale
refreshStandards()    → individual refresh
refreshSubjects()
refreshStudents()
getSubjectsFor(stdId) → filtered selector
getStudentsFor(stdId) → filtered selector
invalidate()          → clears all TTLs (call after any create/delete)
invalidateStudents()  → clears only students TTL
```
Persists to localStorage key `tutoria-app-cache`.

### `useSettingsStore` (`src/store.js`)
Teacher preferences, persisted.
```js
{ defaultStudentPassword: '' }
setDefaultStudentPassword(pwd)
```
Persists to localStorage key `tutoria-settings`.
Used by: `BulkImportModal` (passed to `parseImportFile`), `AddStudentModal` in `StandardDetailPage` (pre-fills password field).

### `useStore` (`src/store.js`)
In-memory broadcast cache (not persisted).
```js
{ broadcastsByStandard: {} }
updateBroadcasts(standardId, updaterFn)
```

---

## 11. Key Frontend Components

### `BulkImportModal.jsx`
4-step flow: upload → preview → importing → done.
- Accepts `.csv`, `.xlsx`, `.xls`, `.docx`
- Uses `parseImportFile` from `lib/bulkImport.js` for client-side parsing/validation
- `downloadTemplate()` generates a starter Excel with Name/Email/Phone/Standard columns
- Passes `defaultStudentPassword` from `useSettingsStore` to `parseImportFile`
- On import: single bulk POST to `/api/students/bulk`
- Done step: shows created/skipped/errors counts + credential sheet download

### `lib/bulkImport.js`
```js
parseImportFile(file, existingStandards, existingUsernames, fixedPassword = null)
```
- Parses CSV (PapaParse), XLSX/XLS (SheetJS), DOCX (mammoth)
- Fuzzy column detection for Name/Email/Phone/Standard
- Generates usernames (firstname.lastinitial, deduped) and temp passwords
- Returns `{ students[], column_map, unrecognised_standards[], ready_count, warning_count, error_count }`

### `AttendanceGrid.jsx`
- Weekly grid (Mon–Sun) per subject
- Cells cycle: unmarked → present → absent → late → unmarked
- Saves only explicit marks to backend via `POST /api/subjects/{id}/attendance`

### `BroadcastThread.jsx` (teacher) / `StudentBroadcastsPage.jsx` (student)
- WebSocket URL: `ws://localhost:8001/api/ws/broadcasts/{standard_id}?token=<jwt>`
- Token passed as query param (browsers cannot set custom WS headers)
- Replays history on connect
- Falls back to REST `GET /api/broadcasts?standard_id=` on WS failure

---

## 12. Video System

**Upload flow:**
1. Teacher uploads via `POST /api/videos/upload` (multipart form)
2. FastAPI streams file to Cloudflare Stream via their API
3. Returns Cloudflare `video_id`, duration; inserts into `videos` table
4. Requires `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_STREAM_API_TOKEN` in `backend/.env`

**Playback:**
- Frontend fetches Cloudflare Stream embed URL using `cloudflare_video_id`
- Completion tracked via `POST /api/videos/{id}/complete`

**Without Cloudflare credentials:**
- `POST /api/videos/upload` will fail with 503
- Use `POST /api/videos` (JSON body) to manually add video records with an existing `cloudflare_video_id`

---

## 13. Test System

- Tests have statuses: `draft` (not visible to students), `published`, `archived`
- Students only see non-draft tests via `GET /api/tests?class_id=`
- `correct_idx` is **always stripped** from question responses sent to students
- One attempt per student per test (UNIQUE constraint on `test_attempts`)
- Scoring: `score = correct * (total_marks/num_questions) - wrong * penalty`
- Cheat detection: frontend tracks tab-switch events (`cheat_events` JSON array), sets `flagged=true`
- Points awarded on submission stored in `students.points` (used for leaderboard)

---

## 14. Security

- **All data access through FastAPI** — RLS blocks direct DB access via anon/user keys
- **`service_supabase`** (service role) used for all inserts/updates in FastAPI — bypasses RLS intentionally
- **Ownership checks** on PATCH/DELETE: standards, subjects, videos, tests, invite-links all verify `teacher_id` / `created_by` matches the requesting user
- **WebSocket auth** — token validated on connect; invalid token closes with code 4001
- **Student isolation** — students can only access their own data (profile, attendance, test history); teacher endpoints return 403 for student role
- **Correct answers** — `correct_idx` stripped from all question responses to students
- **Blocked students** — login returns 403 if `students.blocked = true`
- **Orphan cleanup** — bulk import deletes the Supabase auth user if the `students` table insert fails

---

## 15. CORS Configuration

Currently allows origins:
- `http://localhost:5173`
- `http://localhost:3001`
- `http://127.0.0.1:3001`

**Update this list** before deploying to production.

---

## 16. Known Limitations & Tech Debt

| Issue | Location | Impact |
|---|---|---|
| `broadcasts.json` used for WS history fallback | `backend/main.py` ConnectionManager | Breaks on horizontal scaling (multiple server instances) |
| All routes in one `main.py` | Backend | Increasing file length (~2200 lines). Future: split into `/routers/` |
| Video upload blocks FastAPI thread | `POST /api/videos/upload` | Large files can time out. Future: direct-to-Cloudflare pre-signed upload |
| Username resolution in login is O(n) | `POST /api/auth/login` | Queries full students table to find email by username. Add index on `username` column. |

---

## 17. Development Commands

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
# Swagger docs: http://localhost:8001/docs

# Frontend
cd frontend
npm install
npm run dev          # → http://localhost:3001
npm run build        # → frontend/dist/
```

---

## 18. AI Agent Rules (READ BEFORE ANY CHANGE)

### What is implemented and working
Every endpoint in Section 7 is implemented in `backend/main.py`. Every route in Section 9 has a corresponding page component. Do not re-implement anything already listed — check first.

### Critical constraints
1. **`students.id` = `auth.users.id`** — always set explicitly on insert. Never generate a separate UUID for students.
2. **Never send `correct_idx` to students** — strip it in any endpoint that returns questions to students.
3. **Students enroll at standard level only** — no per-subject enrollment exists or should be added.
4. **Broadcasts are per-standard** — never per-subject.
5. **Delete = delete from cloud too** — video delete must call Cloudflare API; attachment delete must call Supabase Storage.
6. **Service role only in backend** — never use `SUPABASE_SERVICE_KEY` or `service_supabase` in any frontend code.
7. **WebSocket token in query param** — browsers cannot set custom headers for WS; always `?token=<jwt>`.
8. **`useAppCache` is the global data store** — do not create a parallel caching system. Call `invalidate()` or `invalidateStudents()` after mutations.

### Before adding a new feature
1. Check if an endpoint already exists in Section 7 — don't duplicate.
2. Check if a table already exists in Section 5 — don't create duplicates.
3. If adding a new column to an existing table, add an `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration comment in `schema.sql`.
4. If changing an API response shape, update all frontend consumers.
5. Use `glass-panel` CSS class for cards. Use `glass-nav` for sticky headers. No generic Tailwind cards.
6. No loading spinners on page mount — data hydrates from `useAppCache` instantly.
7. Update this document after any significant architectural change.

### What NOT to do
- Do not use `Axios` — the project uses native `fetch` via `apiClient` in `src/lib/api.js`
- Do not use `@clerk/clerk-react` — it's in package.json but unused. Auth is entirely Supabase.
- Do not add `react-query` or `SWR` — `useAppCache` handles all caching.
- Do not hallucinate column names. Every column is documented in Section 5.
- Do not create new localStorage keys without adding them to Section 10.

---

## 19. Supabase Query Patterns Used in Backend

```python
# Fetch with filter
supabase.table("students").select("*").eq("standard_id", sid).execute()

# Insert
service_supabase.table("students").insert({ "id": uid, "name": name, ... }).execute()

# Upsert (single-device enforcement)
service_supabase.table("student_sessions").upsert({
    "student_id": uid, "device_fingerprint": fp
}, on_conflict="student_id").execute()

# Update
service_supabase.table("tests").update({ "status": "published" }).eq("id", test_id).execute()

# Delete
service_supabase.table("videos").delete().eq("id", video_id).execute()

# Create Supabase auth user (service role only)
service_supabase.auth.admin.create_user({
    "email": email, "password": pwd,
    "user_metadata": { "role": "student", "name": name },
    "email_confirm": True
})

# Delete Supabase auth user (service role only)
service_supabase.auth.admin.delete_user(auth_user_id)
```

---

*Last updated: May 2026*
*Backend: FastAPI Python · Frontend: React 18 + Vite · DB: Supabase PostgreSQL · Video: Cloudflare Stream*
