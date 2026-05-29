# Tutoria LMS — Database Reference

All tables live in Supabase (PostgreSQL). The full DDL is in `backend/schema.sql` — run it in the Supabase SQL Editor to create/migrate tables.

**Critical:** The FastAPI backend uses the `service_role` key which **bypasses RLS**. All queries go through FastAPI. Direct client-side DB access is blocked by RLS policies.

---

## Table Inventory

| Table | Purpose |
|---|---|
| `standards` | Teacher's classes (10th, 11th etc.) |
| `subject_classes` | Subjects inside a standard (Maths, Physics etc.) |
| `students` | Student records — `id` = `auth.users.id` |
| `student_sessions` | Single-device enforcement — one row per student |
| `attendance_records` | Day-by-day attendance marks |
| `attendance_summary` | **VIEW** — computed attendance % per student per subject |
| `videos` | Video metadata (Cloudflare IDs, YouTube URLs) |
| `live_classes` | Zoom meeting instances for subjects |
| `live_class_attendance` | Per-student join/leave tracking for live classes |
| `video_progress` | Per-student per-video watch progress |
| `tests` | MCQ test definitions |
| `questions` | MCQ questions — `correct_idx` must NEVER reach students |
| `test_attempts` | Student test submissions + scores |
| `broadcasts` | Teacher broadcast messages per standard |
| `broadcast_reads` | Read receipts per student per broadcast |
| `reminders` | Teacher personal reminders |
| `notifications` | In-app notifications (table exists, endpoint not yet built) |
| `bulk_imports` | Audit log for bulk student imports |
| `invite_links` | Invite codes per standard |
| `invite_requests` | Students requesting to join via invite code |
| `sub_teachers` | Sub-teachers team management (multi-teacher support) |

---

## Detailed Schema

### `standards`
```sql
id                  UUID PK DEFAULT gen_random_uuid()
name                TEXT NOT NULL
short               TEXT
emoji               TEXT DEFAULT '📚'
teacher_id          UUID                    -- references auth.users.id
start_date          DATE
end_date            DATE
attendance_threshold INTEGER DEFAULT 75
created_at          TIMESTAMPTZ DEFAULT NOW()
```

### `subject_classes`
```sql
id          UUID PK DEFAULT gen_random_uuid()
standard_id UUID FK → standards(id) ON DELETE CASCADE
name        TEXT NOT NULL
emoji       TEXT DEFAULT '📐'
end_date    DATE
created_at  TIMESTAMPTZ DEFAULT NOW()
```

### `students`
```sql
id              UUID PK                          -- SAME as auth.users.id, set explicitly on insert
name            TEXT NOT NULL
username        TEXT UNIQUE NOT NULL
email           TEXT
phone           TEXT
avatar_url      TEXT
standard_id     UUID FK → standards(id)
points          INTEGER DEFAULT 0
attendance_pct  NUMERIC DEFAULT 0
avg_score       NUMERIC DEFAULT 0
blocked         BOOLEAN DEFAULT false
must_change_pwd BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ DEFAULT NOW()
```
⚠️ `students.id` is NOT auto-generated — it is set to the Supabase auth user's UUID on creation.

### `student_sessions`
```sql
id                 UUID PK DEFAULT gen_random_uuid()
student_id         UUID FK → students(id) ON DELETE CASCADE UNIQUE
device_fingerprint TEXT NOT NULL
last_active_at     TIMESTAMPTZ DEFAULT NOW()
created_at         TIMESTAMPTZ DEFAULT NOW()
```
UNIQUE constraint on `student_id` — one device per student.

### `attendance_records`
```sql
id               UUID PK DEFAULT gen_random_uuid()
student_id       UUID FK → students(id) ON DELETE CASCADE
subject_class_id UUID FK → subject_classes(id) ON DELETE CASCADE
date             DATE NOT NULL
status           TEXT NOT NULL CHECK (status IN ('present','absent','late'))
marked_by        UUID                    -- teacher's auth.users.id
created_at       TIMESTAMPTZ DEFAULT NOW()
UNIQUE(student_id, subject_class_id, date)
```

### `attendance_summary` (VIEW — not a table)
```sql
-- Computed from attendance_records JOIN subject_classes
student_id, standard_id, subject_class_id, subject_name,
total_sessions, present_count, absent_count, late_count,
attendance_pct   NUMERIC     -- (present+late)/total * 100
```
Used by: `GET /reports/attendance`, `GET /students/{id}/report`

### `videos`
```sql
id                UUID PK DEFAULT gen_random_uuid()
class_id          UUID FK → subject_classes(id) ON DELETE CASCADE
title             TEXT NOT NULL
description       TEXT
source_type       TEXT DEFAULT 'upload' CHECK (source_type IN ('upload', 'youtube'))
youtube_video_id  TEXT
youtube_url       TEXT
cloudflare_video_id TEXT
storage_path      TEXT
duration_secs     INTEGER
size_bytes        BIGINT
allow_download    BOOLEAN DEFAULT true
created_by        UUID                    -- teacher's auth.users.id
created_at        TIMESTAMPTZ DEFAULT NOW()
```

### `live_classes`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
class_id        UUID NOT NULL REFERENCES subject_classes(id) ON DELETE CASCADE
title           TEXT NOT NULL
scheduled_at    TIMESTAMPTZ NOT NULL
duration_mins   INTEGER NOT NULL DEFAULT 60
zoom_meeting_id TEXT
zoom_join_url   TEXT
zoom_start_url  TEXT
status          TEXT NOT NULL DEFAULT 'scheduled'
created_by      UUID REFERENCES auth.users(id)
created_at      TIMESTAMPTZ DEFAULT now()
```

### `live_class_attendance`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
live_class_id   UUID NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE
student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE
joined_at       TIMESTAMPTZ
left_at         TIMESTAMPTZ
duration_mins   INTEGER
attended        BOOLEAN NOT NULL DEFAULT false
UNIQUE (live_class_id, student_id)
```

### `video_progress`
```sql
video_id        UUID FK → videos(id) ON DELETE CASCADE
student_id      UUID FK → students(id) ON DELETE CASCADE
progress_secs   INTEGER DEFAULT 0
completed       BOOLEAN DEFAULT false
downloaded      BOOLEAN DEFAULT false
last_watched_at TIMESTAMPTZ
PRIMARY KEY (video_id, student_id)
```

### `tests`
```sql
id               UUID PK DEFAULT gen_random_uuid()
class_id         UUID FK → subject_classes(id) ON DELETE CASCADE
title            TEXT NOT NULL
duration_mins    INTEGER NOT NULL
total_marks      NUMERIC NOT NULL
negative_marking BOOLEAN DEFAULT false
penalty          NUMERIC DEFAULT 0
status           TEXT DEFAULT 'draft'     -- 'draft' | 'published' | 'archived'
scheduled_for    TIMESTAMPTZ
created_by       UUID                    -- teacher's auth.users.id
created_at       TIMESTAMPTZ DEFAULT NOW()
```

### `questions`
```sql
id          UUID PK DEFAULT gen_random_uuid()
test_id     UUID FK → tests(id) ON DELETE CASCADE
question    TEXT NOT NULL
options     JSONB NOT NULL               -- array of 4 strings
correct_idx INTEGER NOT NULL             -- 0-based. NEVER sent to students.
order_num   INTEGER NOT NULL
```
⚠️ `correct_idx` must be stripped from ANY response going to a student role.

### `test_attempts`
```sql
id              UUID PK DEFAULT gen_random_uuid()
test_id         UUID FK → tests(id)
student_id      UUID FK → students(id)
answers         JSONB                    -- { "question_id": chosen_idx }
score           NUMERIC
correct_count   INTEGER
wrong_count     INTEGER
marks_deducted  NUMERIC DEFAULT 0
points_earned   INTEGER DEFAULT 0
flagged         BOOLEAN DEFAULT false
cheat_events    JSONB
started_at      TIMESTAMPTZ
submitted_at    TIMESTAMPTZ DEFAULT NOW()
created_at      TIMESTAMPTZ DEFAULT NOW()
UNIQUE(test_id, student_id)              -- one attempt per student per test
```

### `broadcasts`
```sql
id              UUID PK DEFAULT gen_random_uuid()
standard_id     UUID FK → standards(id) ON DELETE CASCADE
sender_id       UUID                    -- references auth.users.id
message         TEXT
attachment_url  TEXT
attachment_type TEXT
deleted         BOOLEAN DEFAULT false
edited          BOOLEAN DEFAULT false
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

### `broadcast_reads`
```sql
broadcast_id UUID FK → broadcasts(id) ON DELETE CASCADE
student_id   UUID FK → students(id) ON DELETE CASCADE
read_at      TIMESTAMPTZ DEFAULT NOW()
PRIMARY KEY (broadcast_id, student_id)
```

### `reminders`
```sql
id            UUID PK DEFAULT gen_random_uuid()
teacher_id    UUID                    -- references auth.users.id
title         TEXT NOT NULL
scheduled_for TIMESTAMPTZ
context       TEXT
done          BOOLEAN DEFAULT false
created_at    TIMESTAMPTZ DEFAULT NOW()
```

### `notifications`
```sql
id             UUID PK DEFAULT gen_random_uuid()
recipient_id   UUID NOT NULL
recipient_type TEXT NOT NULL
type           TEXT NOT NULL
title          TEXT
body           TEXT
data           JSONB
read           BOOLEAN DEFAULT false
created_at     TIMESTAMPTZ DEFAULT NOW()
```
**Status:** Table exists. No backend endpoint yet. See PLAN.md P1 roadmap.

### `bulk_imports` (audit log)
```sql
id         UUID PK DEFAULT gen_random_uuid()
teacher_id UUID
filename   TEXT
total_rows INTEGER DEFAULT 0
created    INTEGER DEFAULT 0
skipped    INTEGER DEFAULT 0
errors     INTEGER DEFAULT 0
created_at TIMESTAMPTZ DEFAULT NOW()
```

### `invite_links`
```sql
id          UUID PK DEFAULT gen_random_uuid()
code        TEXT UNIQUE NOT NULL           -- 8-char random code
standard_id UUID FK → standards(id) ON DELETE CASCADE
created_by  UUID                           -- teacher's auth.users.id
max_uses    INTEGER DEFAULT 50
use_count   INTEGER DEFAULT 0
expires_at  TIMESTAMPTZ
created_at  TIMESTAMPTZ DEFAULT NOW()
```

### `invite_requests`
```sql
id            UUID PK DEFAULT gen_random_uuid()
invite_code   TEXT NOT NULL
student_name  TEXT NOT NULL
student_email TEXT
status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected'))
created_at    TIMESTAMPTZ DEFAULT NOW()
```

### `sub_teachers`
```sql
id                 UUID PRIMARY KEY           -- sub-teacher's auth.users.id
primary_teacher_id UUID NOT NULL              -- primary teacher's auth.users.id
name               TEXT NOT NULL
email              TEXT
phone              TEXT
created_at         TIMESTAMPTZ DEFAULT NOW()
```

---

## Row Level Security

All tables have RLS enabled. All access via `service_role` key (FastAPI backend) bypasses RLS.
`anon` and `authenticated` keys are denied on all tables via `deny_anon_*` policies.

This means: **no direct frontend DB access**. All data goes through FastAPI.

---

## Supabase Storage Buckets

Storage buckets are **not PostgreSQL tables** — they live in Supabase Storage alongside the database. The backend auto-creates them on first use via `storage.create_bucket()`, or create them manually in Supabase Dashboard → Storage → New bucket.

| Bucket | Public | Used By | Column Stored In |
|---|---|---|---|
| `videos` | ✅ | `POST /api/videos/upload` (Cloudflare fallback) | `videos.cloudflare_video_id` (full HTTPS URL) |
| `avatars` | ✅ | `POST /api/students/me/avatar` | `students.avatar_url` |
| `broadcasts` | ✅ | `POST /api/upload` (broadcast attachments) | `broadcasts.attachment_url` |

**Dual-purpose column — `videos.cloudflare_video_id`:**
- When Cloudflare Stream is configured: stores the short Cloudflare video UID (e.g. `abc123def`)
- When using the Supabase Storage fallback: stores the full public HTTPS URL (e.g. `https://xxxx.supabase.co/storage/v1/object/public/videos/...`)

The student video player detects which mode by checking `cloudflare_video_id.startsWith('https://')` and renders either a Cloudflare Stream embed or a native `<video>` element accordingly.

---

## Migrations

When adding columns to existing tables, add a migration comment in `schema.sql`:
```sql
ALTER TABLE standards ADD COLUMN IF NOT EXISTS attendance_threshold INTEGER DEFAULT 75;
```

Existing migration helpers (already applied) are in `schema.sql` at the bottom.

---

## Supabase Query Patterns (FastAPI backend)

```python
# Select
service_supabase.table("students").select("*").eq("standard_id", sid).execute()

# Select with join (PostgREST syntax)
service_supabase.table("test_attempts").select("*, tests(title, class_id)").eq("student_id", uid).execute()

# Insert
service_supabase.table("students").insert({ "id": uid, "name": name }).execute()

# Upsert (insert or update on conflict)
service_supabase.table("student_sessions").upsert(
    { "student_id": uid, "device_fingerprint": fp },
    on_conflict="student_id"
).execute()

# Update
service_supabase.table("tests").update({ "status": "published" }).eq("id", tid).execute()

# Delete
service_supabase.table("videos").delete().eq("id", vid).execute()

# Filter: in_, neq, gte, lte, ilike
.in_("standard_id", [id1, id2])
.neq("status", "draft")
.gte("created_at", from_date)
.ilike("name", f"%{search}%")

# Auth admin (service role only)
service_supabase.auth.admin.create_user({ "email": ..., "password": ..., "email_confirm": True })
service_supabase.auth.admin.update_user_by_id(uid, { "password": new_pwd })
service_supabase.auth.admin.delete_user(uid)
```
