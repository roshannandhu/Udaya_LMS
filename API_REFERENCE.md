# Udaya LMS — API Reference

Base URL: `http://localhost:8001/api` (dev) | configure via `VITE_API_URL`

All endpoints require `Authorization: Bearer <token>` unless marked `[public]`.
`[teacher]` = returns 403 if caller role ≠ teacher.
`[student]` = returns 403 if caller role ≠ student.

---

## Auth

| Method | Path | Auth | Request Body | Response |
|---|---|---|---|---|
| POST | `/auth/login` | public | `{ email_or_username, password, device_fingerprint? }` | `{ token, user: { id, name, role, email, username, must_change_pwd } }` |
| POST | `/auth/logout` | any | — | `{ message }` |
| GET | `/auth/me` | any | — | `{ user_id, role, email, name, username, avatar_url, must_change_pwd }` (students also get `points, avg_score, attendance_pct, phone, standard_id, standard_name`) |
| POST | `/auth/verify-device` | student | `{ device_fingerprint }` | `{ allowed: bool }` |
| PATCH | `/auth/profile` | any | `{ name?, email?, phone? }` | `{ message }` |
| POST | `/auth/change-password` | any | `{ password }` | `{ message }` |

**Notes:**
- Login resolves `email_or_username` — if it contains `@` it's treated as email; otherwise a username lookup is performed against the `students` table
- `must_change_pwd` in the login response drives the force-change redirect in `ProtectedStudentRoute`
- `verify-device` compares the sent fingerprint against `student_sessions.device_fingerprint`

---

## Dashboard

| Method | Path | Auth | Query | Response |
|---|---|---|---|---|
| GET | `/dashboard/stats` | teacher | — | `{ standards, students, subjects, videos }` counts |
| GET | `/dashboard/activity` | teacher | — | Array of 20 recent activity objects |

---

## Standards

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| GET | `/standards` | teacher | — | `[{ id, name, short, emoji, teacher_id, start_date, end_date, attendance_threshold, created_at }]` |
| GET | `/standards/{standard_id}` | teacher | — | Single standard object |
| POST | `/standards` | teacher | `{ name, short?, emoji? }` | Created standard object |
| PATCH | `/standards/{standard_id}` | teacher | `{ name?, short?, emoji?, start_date?, end_date? }` | Updated standard |
| DELETE | `/standards/{standard_id}` | teacher | — | `{ message }` |

**Notes:** All standards endpoints verify `teacher_id == current user`. Deleting cascades to `subject_classes` and `broadcasts`.

---

## Subjects (subject_classes)

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| GET | `/subjects` | teacher | `?standard_id=` | `[{ id, standard_id, name, emoji, end_date, video_count, test_count }]` |
| POST | `/subjects` | teacher | `{ standard_id, name, emoji?, end_date? }` | Created subject |
| PATCH | `/subjects/{subject_id}` | teacher | `{ name?, emoji?, end_date? }` | Updated subject |
| DELETE | `/subjects/{subject_id}` | teacher | — | `{ message }` |

**Notes:** PATCH/DELETE verify ownership through `subject_classes → standards.teacher_id`.

---

## Students

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| GET | `/students` | teacher | `?standard_id=` optional | `[student objects]` |
| GET | `/students/{student_id}` | teacher | — | Single student object |
| GET | `/students/{student_id}/report` | teacher | — | `{ student, attendance_summary, test_results, video_progress }` |
| GET | `/students/{student_id}/attendance` | teacher/student | — | Student's attendance records (student can only view own) |
| POST | `/admin/create-student` | teacher | `{ email?, password, name, username, standard_id? }` | `{ id, name, username, temp_password }` |
| POST | `/students/bulk` | teacher | `{ filename, students: [BulkStudentItem] }` | `{ created, skipped, errors }` |
| PATCH | `/students/me` | student | `{ name?, email?, phone? }` | Updated student |
| PATCH | `/students/{student_id}` | teacher | `{ name?, email?, phone?, standard_id?, username? }` | Updated student |
| PATCH | `/students/{student_id}/block` | teacher | `?blocked=true/false` | `{ message }` |
| POST | `/students/{student_id}/reset-password` | teacher | — | `{ new_password }` (auto-generated) |
| DELETE | `/students/{student_id}` | teacher | — | `{ message }` |

**BulkStudentItem:** `{ name, username, email?, phone?, standard_id, temp_password }`

**Notes:**
- `POST /admin/create-student` creates both Supabase Auth user AND `students` row
- Bulk import skips (not errors) duplicates — detects "already exists" in exception message
- DELETE removes both `students` row AND Supabase Auth user
- Reset-password auto-generates 10-char password, sets `must_change_pwd = true`
- Blocked students: login returns 403

---

## Videos

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| GET | `/videos` | any | `?class_id=` | `[{ id, class_id, title, description, source_type, cloudflare_video_id, duration_secs, allow_download, created_by, created_at }]` |
| POST | `/videos` | teacher | `{ class_id, title, description?, cloudflare_video_id?, duration_secs?, allow_download? }` | Created video |
| POST | `/videos/upload` | teacher | multipart: `file, class_id, title, description?, allow_download?` | Video object with `cloudflare_video_id` (CF UID or Supabase Storage HTTPS URL) |
| POST | `/videos/youtube` | teacher | `{ class_id, title, description?, youtube_video_id, youtube_url }` | Created video object without `youtube_video_id` |
| GET | `/videos/{video_id}/token` | any | — | `{ token: youtube_video_id, source_type, title }` |
| GET | `/videos/{video_id}/thumbnail` | any | — | `{ thumbnail_url, source_type }` |
| POST | `/students/me/avatar` | student | multipart: `file` | `{ avatar_url }` — Supabase Storage URL |
| PATCH | `/videos/{video_id}` | teacher | `{ title?, description?, allow_download? }` | Updated video |
| DELETE | `/videos/{video_id}` | teacher | — | `{ message }` — also deletes from Cloudflare |
| GET | `/videos/{video_id}/stats` | teacher | — | `{ watch_count, completion_count, download_count }` |
| POST | `/videos/{video_id}/complete` | student | `{ progress_secs?, downloaded? }` | `{ message }` — awards points |

**Notes:**
- `GET /videos` intentionally strips `youtube_video_id` from the response.
- `GET /videos/{video_id}/token` verifies standard enrollment before returning the YouTube video ID as a `token` to load the custom player.
- `POST /videos/upload` uses Cloudflare Stream when `CLOUDFLARE_ACCOUNT_ID`+`CLOUDFLARE_STREAM_API_TOKEN` are set; otherwise falls back to Supabase Storage `videos` bucket (auto-created). In the fallback path, `cloudflare_video_id` contains a full HTTPS URL — detect with `startsWith('https://')`.
- `POST /students/me/avatar` stores in Supabase Storage `avatars` bucket and writes URL to `students.avatar_url`.
- PATCH/DELETE verify `created_by == current user`
- `POST /videos` (JSON) is for manually adding video records without uploading

---

## Live Classes

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| GET | `/live-classes` | any | `?class_id=` | `[live_class objects]` |
| POST | `/live-classes` | teacher | `{ class_id, title, scheduled_at, duration_mins? }` | Created live class object with zoom IDs |
| GET | `/live-classes/{live_class_id}/join-token` | any | — | `{ meeting_id, signature, sdk_key, role, display_name }` |
| POST | `/live-classes/{live_class_id}/end` | teacher | — | `{ message, attended, absent, total }` |
| POST | `/live-classes/{live_class_id}/cancel` | teacher | — | `{ message }` |
| GET | `/live-classes/{live_class_id}/attendance` | teacher | — | `[{ student_id, attended, joined_at, left_at, duration_mins }]` |
| POST | `/zoom/webhook` | public | Zoom webhook payload | Processing result |

**Notes:**
- `POST /live-classes` uses Zoom Server-to-Server OAuth to automatically create a Zoom meeting.
- `GET .../join-token` generates an HMAC-SHA256 signature for the Zoom Web SDK. The raw Zoom URL is never sent.
- `POST .../end` queries the Zoom API for the participant list and generates the `live_class_attendance` records.

---

## Tests

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| GET | `/tests` | any | `?class_id=` | Students: non-draft only. Teachers: all statuses. |
| POST | `/tests` | teacher | `{ class_id, title, duration_mins, total_marks, negative_marking?, penalty?, status?, scheduled_for? }` | Created test |
| POST | `/tests/with-questions` | teacher | `{ test: TestBody, questions: [QuestionBody] }` | `{ test, questions }` atomic create |
| PATCH | `/tests/{test_id}` | teacher | Any TestUpdate fields | Updated test |
| DELETE | `/tests/{test_id}` | teacher | — | `{ message }` |
| GET | `/tests/{test_id}/questions` | any | — | Questions array. **`correct_idx` stripped for students.** |
| POST | `/questions` | teacher | `{ test_id, question, options: [4 strings], correct_idx, order_num }` | Created question |
| GET | `/tests/{test_id}/take` | student | — | Test + questions (no correct answers) + validates not already attempted |
| GET | `/tests/{test_id}/attempt-status` | student | — | `{ attempted: bool, attempt?: {...} }` |
| POST | `/tests/{test_id}/submit` | student | `{ answers: { question_id: chosen_idx }, cheat_events?, flagged? }` | `{ score, correct_count, wrong_count, points_earned }` |
| GET | `/tests/{test_id}/results` | teacher | — | All student attempts with scores |
| GET | `/student/tests/history` | student | — | Student's own test history |

**Notes:**
- `correct_idx` is NEVER sent to students — stripped on `GET /questions` and `GET /{id}/take`
- One attempt per student per test (UNIQUE constraint — attempting twice returns 403)
- Scoring: `score = (correct × marks_per_q) - (wrong × penalty)`
- `flagged` set by frontend if cheat events detected (tab switches etc.)
- PATCH/DELETE verify `created_by == current user`

---

## Attendance

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| GET | `/subjects/{subject_id}/attendance` | teacher | `?date=YYYY-MM-DD` | `[{ student_id, student_name, status }]` |
| GET | `/subjects/{subject_id}/attendance/week` | teacher | `?start=YYYY-MM-DD` | 7-day grid `{ week_start, students: [...], dates: [...] }` |
| POST | `/subjects/{subject_id}/attendance` | teacher | `{ date: "YYYY-MM-DD", records: [{ student_id, status }] }` | `{ saved }` count |
| DELETE | `/subjects/{subject_id}/attendance/{student_id}/{date}` | teacher | — | `{ message }` |
| GET | `/reports/attendance` | teacher | `?standard_id=&from=&to=&below_pct=` | `[{ student, attendance_pct, present, absent, late }]` |
| GET | `/reports/export/attendance` | teacher | same query params | CSV file (StreamingResponse) |

**Notes:**
- Attendance status values: `"present"`, `"absent"`, `"late"`
- `POST` upserts — sending same student+date overwrites existing record
- DELETE clears a specific record (returns student to "unmarked")
- `GET /reports/attendance` uses `attendance_summary` view

---

## Broadcasts & WebSocket

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| WS | `/ws/broadcasts/{standard_id}?token=<jwt>` | any | — | Real-time stream. Closes 4001 if token invalid. Sends history on connect. |
| POST | `/broadcasts` | teacher | `{ standard_id, message, attachment_url?, attachment_type?, scheduled_for? }` | Broadcast object |
| GET | `/broadcasts` | any | `?standard_id=` | `[broadcast objects]` ordered by created_at |
| DELETE | `/broadcasts/{broadcast_id}` | teacher | — | Soft-delete (`deleted = true`), pushes `delete_broadcast` WS event |
| PATCH | `/broadcasts/{broadcast_id}` | teacher | `{ message }` | Sets `edited = true`, pushes `edit_broadcast` WS event |
| GET | `/broadcasts/reads` | teacher | `?standard_id=` | `{ broadcast_id: read_count }` map |
| POST | `/broadcast-reads` | student | `{ broadcast_ids: [uuid] }` | `{ message }` — upserts read receipts |

**WS event types received by client:**
```json
{ "type": "history",          "data": [broadcast, ...] }
{ "type": "new_broadcast",    "data": broadcast }
{ "type": "delete_broadcast", "id": "uuid" }
{ "type": "edit_broadcast",   "data": { "id": "uuid", "message": "text" } }
```

**Notes:**
- Token must be passed as query param `?token=` — browsers cannot send custom headers for WebSocket connections
- `deleted` and `edited` flags in history events reflect actual DB state — do not hardcode them on the client
- `GET /broadcasts/reads` returns a flat object keyed by broadcast UUID; used by teacher to show `N/Total read`
- `scheduled_for` (ISO datetime) — if set and in the future, the broadcast is saved but NOT pushed via WebSocket. Students cannot see future-scheduled broadcasts. Teachers see all.

---

## Reminders

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/reminders` | teacher | — | `[reminder objects]` ordered by scheduled_for |
| POST | `/reminders` | teacher | `{ title, scheduled_for?, context? }` | Created reminder |
| PATCH | `/reminders/{reminder_id}` | teacher | `{ title?, done?, scheduled_for? }` | Updated reminder |
| DELETE | `/reminders/{reminder_id}` | teacher | — | `{ message }` |

---

## Reports & Leaderboard

| Method | Path | Auth | Query | Response |
|---|---|---|---|---|
| GET | `/reports/attendance` | teacher | `?standard_id=&from=&to=&below_pct=` | Attendance summary array |
| GET | `/reports/export/attendance` | teacher | same | CSV StreamingResponse |
| GET | `/leaderboard` | any | `?standard_id=` | `[{ id, name, username, points, avatar_url, rank }]` sorted by points desc |

---

## Invite Links

| Method | Path | Auth | Body / Param | Response |
|---|---|---|---|---|
| POST | `/invite-links` | teacher | `{ standard_id, max_uses?, expires_at? }` | `{ id, code, standard_id, max_uses, expires_at }` |
| GET | `/invite-links` | teacher | `?standard_id=` | `[invite link objects]` |
| DELETE | `/invite-links/{link_id}` | teacher | — | `{ message }` |
| GET | `/join/{code}` | public | — | `{ standard_name, valid: bool }` |
| POST | `/join/{code}` | public | `{ student_name, student_email? }` | `{ message }` — creates invite_request |
| GET | `/join-requests` | teacher | — | `[pending join requests]` |
| PATCH | `/join-requests/{request_id}/approve` | teacher | — | Creates student account, returns `{ student, temp_password }` |
| PATCH | `/join-requests/{request_id}/reject` | teacher | — | `{ message }` |

---

## Notifications

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| GET | `/notifications` | any | — | Latest 30 notifications for the caller |
| PATCH | `/notifications/{notification_id}/read` | any | — | Marks single notification read |
| POST | `/notifications/read-all` | any | — | Marks all caller's notifications read |

**Notes:** Table exists. Bell icon in TopBar (`NotificationBell.jsx`) exists but is not yet wired to live data — currently shows static UI.

---

## File Upload

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/upload` | teacher | multipart: `file` | `{ url, type, filename }` — Supabase Storage `broadcasts` bucket URL |

Used for broadcast attachment uploads (images, PDFs).

---

## Misc

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/health` | public | `{ status: "ok", database: "connected"/"disconnected" }` |
| POST | `/demo/create-accounts` | teacher | Creates demo teacher + 5 students. Dev only. |
