# ATTENDANCE_SYSTEM.md
# ─────────────────────────────────────────────────────────────
# You already have your Supabase Postgres database built.
# This file tells you EXACTLY what to add and where.
#
# Three parts:
#   PART A — SQL  → paste into Supabase SQL Editor
#   PART B — Backend prompt → paste into OpenCode
#   PART C — Frontend prompt → paste into OpenCode
#
# Do them in order: A → B → C
# ─────────────────────────────────────────────────────────────


# ═══════════════════════════════════════════════════════════════
# PART A — SQL
# WHERE: Supabase dashboard → SQL Editor → New query → paste → Run
# ═══════════════════════════════════════════════════════════════

## ── A1. Add attendance_records table ──────────────────────────
## Paste this first. Run it. Confirm it succeeds before A2.

```sql
-- Attendance records table
-- One row = one student + one subject + one date + status
CREATE TABLE IF NOT EXISTS attendance_records (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID        NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  subject_class_id  UUID        NOT NULL REFERENCES subject_classes(id) ON DELETE CASCADE,
  date              DATE        NOT NULL,
  status            TEXT        NOT NULL CHECK (status IN ('present', 'absent', 'late')),
  marked_by         UUID        REFERENCES teacher_profiles(id),
  note              TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  -- One record per student per subject per day
  UNIQUE (student_id, subject_class_id, date)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_attendance_student
  ON attendance_records(student_id);

CREATE INDEX IF NOT EXISTS idx_attendance_subject_date
  ON attendance_records(subject_class_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON attendance_records(date);

-- Row Level Security
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- FastAPI uses service role key which bypasses RLS
-- This blocks all direct client access
CREATE POLICY "service role only"
  ON attendance_records
  USING (false);
```


## ── A2. Add attendance_threshold to standards ─────────────────
## Lets teacher set the minimum attendance % per standard.
## Paste and run after A1.

```sql
-- Add configurable threshold per standard
-- Default 75% — below this = flagged in dashboard
ALTER TABLE standards
  ADD COLUMN IF NOT EXISTS attendance_threshold INTEGER DEFAULT 75;

-- Add overall_attendance_pct cache on student_profiles
-- Recomputed whenever attendance is marked (in backend)
-- Avoids expensive aggregate on every report load
ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS attendance_pct DECIMAL DEFAULT NULL;
```


## ── A3. Add attendance export view ───────────────────────────
## A read-only SQL view for the CSV export endpoint.
## Paste and run after A2.

```sql
CREATE OR REPLACE VIEW attendance_summary AS
SELECT
  sp.id                                          AS student_id,
  u.username,
  sp.name                                        AS student_name,
  sc.id                                          AS subject_class_id,
  sc.name                                        AS subject_name,
  s.id                                           AS standard_id,
  s.name                                         AS standard_name,
  COUNT(*)                                       AS total_sessions,
  COUNT(*) FILTER (WHERE ar.status = 'present') AS present_count,
  COUNT(*) FILTER (WHERE ar.status = 'absent')  AS absent_count,
  COUNT(*) FILTER (WHERE ar.status = 'late')    AS late_count,
  ROUND(
    COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))::DECIMAL
    / NULLIF(COUNT(*), 0) * 100,
    1
  )                                              AS attendance_pct
FROM attendance_records ar
JOIN student_profiles sp   ON ar.student_id = sp.id
JOIN users u               ON sp.id = u.id
JOIN subject_classes sc    ON ar.subject_class_id = sc.id
JOIN standards s           ON sc.standard_id = s.id
GROUP BY
  sp.id, u.username, sp.name,
  sc.id, sc.name,
  s.id, s.name;
```


## ── A4. Verify everything was created ─────────────────────────
## Run this query to confirm. Should return 1 row per table.

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('attendance_records')
ORDER BY table_name;

-- Also check the columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'standards'
  AND column_name = 'attendance_threshold';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'student_profiles'
  AND column_name = 'attendance_pct';
```

Expected output:
  attendance_records → 1 row
  attendance_threshold → integer
  attendance_pct → numeric


# ═══════════════════════════════════════════════════════════════
# PART B — BACKEND
# WHERE: paste into OpenCode in your project root
# WHEN: after Part A SQL is confirmed working
# ═══════════════════════════════════════════════════════════════

## Paste this entire block into OpenCode as one prompt:

```
Read CLAUDE.md and BUILD_STEPS.md before starting.

I have already run the attendance SQL migrations. The following now exist in Supabase:
- attendance_records table (student_id, subject_class_id, date, status, marked_by, note)
- standards.attendance_threshold column (integer, default 75)
- student_profiles.attendance_pct column (decimal, cached percentage)
- attendance_summary view (pre-aggregated per student per subject)

TASK: Build the attendance backend in FastAPI.

─── Step B1: Model ───────────────────────────────────────────
Create app/models/attendance.py with a SQLAlchemy model for attendance_records.
Fields match the SQL above exactly.

─── Step B2: Schemas ─────────────────────────────────────────
Create app/schemas/attendance.py with these Pydantic schemas:

AttendanceRecord:
  student_id: UUID
  status: Literal["present", "absent", "late"]

MarkAttendanceRequest:
  date: date
  records: list[AttendanceRecord]
  # One call marks the whole class for one day

AttendanceDay:
  date: date
  status: str | None   # None = not marked yet

StudentAttendanceSummary:
  student_id: UUID
  student_name: str
  username: str
  overall_pct: float
  present_count: int
  absent_count: int
  late_count: int
  total_sessions: int

SubjectAttendanceRow:
  # Used in weekly grid view
  student_id: UUID
  student_name: str
  days: dict[str, str | None]   # {"2026-05-20": "present", "2026-05-21": None}
  overall_pct: float

StudentFullAttendance:
  # Used in student report
  overall_pct: float
  absent_days: int
  late_days: int
  by_subject: list[dict]    # [{subject_name, pct, present, absent, late, total}]
  by_week: list[dict]       # [{week_label, pct}] last 8 weeks

─── Step B3: Router ──────────────────────────────────────────
Create app/routers/attendance.py with these endpoints.
Register it in app/main.py with prefix="/api".

────────────────────────────────────────────────────────
GET /api/subjects/{subject_id}/attendance?date=YYYY-MM-DD
────────────────────────────────────────────────────────
- Teacher only
- date param defaults to today if not provided
- Return: list of ALL students in this subject's standard
- For each student: {student_id, name, username, status (present/absent/late/null)}
- status=null means not marked yet for that date
- Query: JOIN student_profiles on standard_id, LEFT JOIN attendance_records on (student_id, subject_class_id, date)

────────────────────────────────────────────────────────
POST /api/subjects/{subject_id}/attendance
────────────────────────────────────────────────────────
- Teacher only
- Body: MarkAttendanceRequest {date, records: [{student_id, status}]}
- For each record: INSERT INTO attendance_records ... ON CONFLICT (student_id, subject_class_id, date) DO UPDATE SET status=excluded.status, marked_by=excluded.marked_by, updated_at=now()
- After upserting all records: recompute attendance_pct for each affected student and UPDATE student_profiles.attendance_pct
  Formula: SELECT (COUNT(*) FILTER (WHERE status IN ('present','late'))::decimal / COUNT(*)) * 100 FROM attendance_records WHERE student_id = X
- Return: {marked: N, date: date}

────────────────────────────────────────────────────────
GET /api/subjects/{subject_id}/attendance/week?start=YYYY-MM-DD
────────────────────────────────────────────────────────
- Teacher only
- start defaults to Monday of current week
- Return 7 days (start to start+6) for all students in this subject's standard
- Shape: list of SubjectAttendanceRow
  Each row: student_id, student_name, days (dict of date_string → status or null), overall_pct
- Query: fetch all attendance_records for this subject WHERE date BETWEEN start AND start+6
  Then pivot in Python into the dict shape

────────────────────────────────────────────────────────
GET /api/students/{student_id}/attendance
────────────────────────────────────────────────────────
- Teacher OR the student themselves (check: if student role, student_id must match their own id)
- Return StudentFullAttendance:
  overall_pct: aggregate across ALL their subjects
  absent_days: count of 'absent' records in last 30 days
  late_days: count of 'late' records in last 30 days
  by_subject: [{subject_name, present, absent, late, total, pct}]
    Query from attendance_summary view filtered by student_id
  by_week: last 8 weeks [{week_label (e.g. "W20"), pct}]
    Group by date_trunc('week', date), compute present+late / total * 100

────────────────────────────────────────────────────────
GET /api/reports/attendance?standard_id={id}&below_pct={n}
────────────────────────────────────────────────────────
- Teacher only
- standard_id: required
- below_pct: optional, defaults to standards.attendance_threshold for this standard
- Return: list of students in this standard whose attendance_pct < below_pct
  Include: student_id, name, username, attendance_pct, absent_days (last 30 days)
- Also return: {threshold: int, standard_name: str, flagged_count: int}

────────────────────────────────────────────────────────
GET /api/reports/export/attendance?standard_id={id}
────────────────────────────────────────────────────────
- Teacher only
- Query the attendance_summary view filtered by standard_id
- Return CSV with headers:
  Student Name, Username, Subject, Total Sessions, Present, Absent, Late, Attendance %
- Content-Type: text/csv
- Content-Disposition: attachment; filename=attendance_report.csv

─── Step B4: Update existing report endpoint ─────────────────
In app/routers/reports.py, update GET /api/reports/student/{student_id}
to include the attendance data block:

Add to the response:
  "attendance": {
    "overall_pct": float,
    "absent_days": int,
    "late_days": int,
    "by_subject": [{"subject_name", "pct", "present", "absent", "late", "total"}],
    "by_week": [{"week", "pct"}]
  }

Fetch this from the attendance_records table using the same student_id.
If student has no attendance records yet, return overall_pct=null, empty lists.

─── Step B5: Update dashboard endpoint ───────────────────────
In app/routers/reports.py or wherever the dashboard "needs attention" data lives,
add a check for low attendance:

GET /api/dashboard/attention (or add to existing dashboard endpoint)
Include:
  "low_attendance": {
    "count": int,
    "students": [{"name", "attendance_pct", "standard_name"}],
    "threshold": int
  }
Query: SELECT sp.name, sp.attendance_pct, s.name as standard_name
  FROM student_profiles sp
  JOIN standards s ON sp.standard_id = s.id
  WHERE sp.attendance_pct IS NOT NULL
    AND sp.attendance_pct < s.attendance_threshold
  ORDER BY sp.attendance_pct ASC
  LIMIT 5

─── Step B6: Test all endpoints ──────────────────────────────
After building, test with these curl commands:

# Get today's attendance for a subject (all students, status=null initially)
curl "http://localhost:8000/api/subjects/$SUBJECT_ID/attendance?date=2026-05-20" \
  -H "Authorization: Bearer $TEACHER_TOKEN"
# → list of students all with status=null

# Mark attendance
curl -X POST "http://localhost:8000/api/subjects/$SUBJECT_ID/attendance" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-05-20",
    "records": [
      {"student_id": "STUDENT_UUID_1", "status": "present"},
      {"student_id": "STUDENT_UUID_2", "status": "absent"},
      {"student_id": "STUDENT_UUID_3", "status": "late"}
    ]
  }'
# → {marked: 3, date: "2026-05-20"}

# Confirm student_profiles.attendance_pct updated
# Check in Supabase Table Editor → student_profiles → attendance_pct column should have a value

# Get student attendance report
curl "http://localhost:8000/api/students/$STUDENT_ID/attendance" \
  -H "Authorization: Bearer $TEACHER_TOKEN"
# → {overall_pct: 33.3, by_subject: [...], by_week: [...]}

# Get low attendance list
curl "http://localhost:8000/api/reports/attendance?standard_id=$STANDARD_ID&below_pct=75" \
  -H "Authorization: Bearer $TEACHER_TOKEN"
# → flagged students

# Download CSV
curl "http://localhost:8000/api/reports/export/attendance?standard_id=$STANDARD_ID" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -o attendance.csv
# → opens cleanly in Excel
```


# ═══════════════════════════════════════════════════════════════
# PART C — FRONTEND
# WHERE: paste into OpenCode after Part B is tested and working
# WHEN: backend endpoints confirmed working via curl
# ═══════════════════════════════════════════════════════════════

## Paste this entire block into OpenCode as one prompt:

```
Read CLAUDE.md and BUILD_STEPS.md before starting.

The attendance backend is working. These endpoints exist and are tested:
  GET  /api/subjects/{id}/attendance?date=YYYY-MM-DD
  POST /api/subjects/{id}/attendance
  GET  /api/subjects/{id}/attendance/week?start=YYYY-MM-DD
  GET  /api/students/{id}/attendance
  GET  /api/reports/attendance?standard_id={id}&below_pct={n}
  GET  /api/reports/export/attendance?standard_id={id}

TASK: Build the attendance frontend in React + Vite.
Design system: Notion-style (flat white, 1px borders, Inter font, neutral colors).
Match the existing style in lms-v3.jsx exactly.

─── Step C1: API functions ───────────────────────────────────
Add to frontend/src/lib/api.js:

export const attendance = {
  getDay: (subjectId, date) =>
    api.get(`/api/subjects/${subjectId}/attendance?date=${date}`),

  markDay: (subjectId, date, records) =>
    api.post(`/api/subjects/${subjectId}/attendance`, { date, records }),

  getWeek: (subjectId, startDate) =>
    api.get(`/api/subjects/${subjectId}/attendance/week?start=${startDate}`),

  getStudent: (studentId) =>
    api.get(`/api/students/${studentId}/attendance`),

  getLowAttendance: (standardId, belowPct) =>
    api.get(`/api/reports/attendance?standard_id=${standardId}&below_pct=${belowPct}`),

  exportCsv: (standardId) =>
    api.get(`/api/reports/export/attendance?standard_id=${standardId}`, {
      responseType: 'blob'
    }),
}

─── Step C2: AttendanceTab component ─────────────────────────
Create frontend/src/components/teacher/AttendanceTab.jsx

This is the main teacher attendance marking UI.
It goes inside SubjectDetailPage.jsx as the fourth tab (Videos | Tests | Students | Attendance).

LAYOUT:
  Top bar:
    - Week navigator: "< prev week"  |  "20 May – 26 May 2026"  |  "next week >"
    - Date chips row: Mon 20 · Tue 21 · Wed 22 · Thu 23 · Fri 24 · Sat 25 · Sun 26
      Active date highlighted with dark border
    - "Save" button (dark, disabled until changes made, shows "Saving…" during POST)

  Attendance grid:
    - One row per student
    - Columns: student name | dot for each day of the week | overall % bar
    - Each day dot: click cycles P → A → L → unmarked (–)
      P = green dot (bg #EAF3DE text #3B6D11)
      A = red dot (bg #FCEBEB text #A32D2D)
      L = amber dot (bg #FAEEDA text #854F0B)
      – = gray outlined circle (unmarked)
    - Overall % bar: thin horizontal bar (bg neutral-100, fill based on %)
      green fill if pct >= 75, amber if 50-74, red if < 50
      show percentage text right of bar
    - Clicking a row's name → navigates to student detail page

  Empty state:
    No students in this subject yet → show "No students enrolled. Add students from the standard page."

STATE MANAGEMENT:
  - dateRange: array of 7 Date objects for current week
  - activeDate: which date is selected (default today)
  - dayData: Map of date_string → {student_id → status | null}
  - weekData: all 7 days loaded at once from /attendance/week
  - changes: Set of student_ids that have been changed on activeDate
  - isSaving: boolean

DATA LOADING:
  On mount and when week changes:
    GET /api/subjects/:id/attendance/week?start=weekStart
    Populate dayData for all 7 days at once

  On date chip click:
    If dayData[date] already loaded → just switch activeDate
    If not loaded → GET /api/subjects/:id/attendance?date=date → populate dayData[date]

SAVE:
  POST /api/subjects/:id/attendance with {date: activeDate, records: changedRecords}
  changedRecords = students in `changes` set mapped to {student_id, status}
  On success: clear changes set, show "Saved" toast
  On error: show error toast, keep changes so user can retry

─── Step C3: AttendanceStudentCard component ─────────────────
Create frontend/src/components/teacher/AttendanceStudentCard.jsx

Used inside StudentDetailPage.jsx (teacher view of a student).
Shows the student's attendance breakdown.

LAYOUT (matches existing stat card style):
  Section header: "Attendance"

  Stats row (4 cards):
    Overall %  |  Present days  |  Absent days  |  Late days
    Number large, label small below

  Per-subject bars:
    For each subject the student is enrolled in:
      Subject name (left, 100px) | bar | percentage (right)
    Bar color: green ≥75%, amber 50-74%, red <50%

  Weekly trend (last 8 weeks):
    Small bar chart — 8 mini bars, each is a week
    Taller = higher attendance that week
    X-axis: W18, W19, W20, etc.
    Use inline divs (no chart library needed) — same style as the weekly score chart in lms-v3.jsx

  Low attendance warning:
    If overall_pct < 75: show amber box
    "Attendance below threshold (75%). Student has been absent X days this month."

DATA:
  Fetch GET /api/students/:id/attendance on mount
  If no data yet (null): show "No attendance recorded yet"

─── Step C4: Add to SubjectDetailPage ────────────────────────
In frontend/src/pages/teacher/SubjectDetailPage.jsx:

Add "Attendance" as the fourth tab after Videos | Tests | Students.
When tab = 'attendance':
  Render <AttendanceTab subjectId={classId} />

The tab label shows a count badge if any student is below threshold:
  "Attendance" → "Attendance (3)" if 3 students below 75%
  Fetch this count from the low-attendance endpoint when the page loads.

─── Step C5: Add to StudentDetailPage ───────────────────────
In frontend/src/pages/teacher/StudentDetailPage.jsx:

After the stats row (avg score, attendance %, points, subjects):
  Add <AttendanceStudentCard studentId={studentId} />

The existing attendance_pct stat card should read from:
  user.attendance_pct (already cached in student_profiles)
  Not a new fetch — it's already in the student profile response.

─── Step C6: Add to ReportsPage ─────────────────────────────
In frontend/src/pages/teacher/ReportsPage.jsx:

Add a new "Attendance" section below the existing performance section.

Low attendance table:
  Header: "Students below attendance threshold"
  Fetch GET /api/reports/attendance?standard_id={selectedStandardId}&below_pct=75
  Table rows: student name | standard | attendance % (red if very low) | absent days
  Empty state: "All students are above the attendance threshold."

Export button:
  "Export attendance CSV" button (same style as existing export buttons)
  On click: GET /api/reports/export/attendance?standard_id={selectedStandardId}
  Download with filename "attendance_report.csv"

─── Step C7: Update Dashboard ───────────────────────────────
In frontend/src/pages/teacher/DashboardPage.jsx:

In the "Needs attention" section, add:
  Fetch GET /api/reports/attendance?standard_id=all&below_pct=75
  (you may need to loop over all standards and merge results)

  Show item: "N students below attendance threshold"
  Clicking → navigates to /teacher/reports with attendance tab pre-selected

─── Step C8: Student portal attendance ──────────────────────
In frontend/src/pages/student/ProfilePage.jsx:

In the stats grid (Points | Avg Score | Attendance | Active device):
  The Attendance card already shows user.attendance_pct from authStore
  If attendance_pct is null: show "—" instead of 0

Add below the stats grid, a new section "Attendance by subject":
  Fetch GET /api/students/{user.id}/attendance
  Show per-subject bars (same style as AttendanceStudentCard but read-only)
  If overall_pct < 75: show amber notice "Your attendance is below 75%. Please talk to your teacher."

─── Step C9: Test the full flow ──────────────────────────────
Manual test steps:
1. Open SubjectDetailPage → Attendance tab → see all students with no marks
2. Click dots for 3 students: one P, one A, one L → Save
3. "Saved" toast appears
4. Navigate to the absent student's detail page → see attendance section updated
5. Check Reports page → low-attendance table if any student < 75%
6. Check student portal profile → attendance % shows for the logged-in student
7. Export CSV → opens in Excel with correct columns

─── Design rules to follow ──────────────────────────────────
Match lms-v3.jsx exactly:
  bg: white (#FFFFFF) and subtle (#FAFAF9)
  borders: 1px solid #EBEAE7
  text: #1A1A19 primary, #787774 secondary
  font: Inter
  border-radius: 8px for most elements, 12px for cards
  No gradients, no colored backgrounds except status dots
  Status colors only:
    green: bg #EAF3DE text #3B6D11
    amber: bg #FBF3DB text #CB912F
    red:   bg #FDEBEC text #E03E3E
```


# ═══════════════════════════════════════════════════════════════
# SUMMARY — What gets added where
# ═══════════════════════════════════════════════════════════════

## Database (Supabase SQL Editor)
  attendance_records table        → A1
  standards.attendance_threshold  → A2
  student_profiles.attendance_pct → A2
  attendance_summary view         → A3

## Backend (FastAPI)
  app/models/attendance.py        → B1
  app/schemas/attendance.py       → B2
  app/routers/attendance.py       → B3 (6 endpoints)
  app/routers/reports.py updated  → B4 (student report gains attendance block)
  dashboard endpoint updated      → B5 (low attendance in "needs attention")

## Frontend (React + Vite)
  src/lib/api.js                  → C1 (attendance API functions)
  src/components/teacher/AttendanceTab.jsx      → C2 (mark attendance grid)
  src/components/teacher/AttendanceStudentCard.jsx → C3 (student breakdown)
  src/pages/teacher/SubjectDetailPage.jsx       → C4 (4th tab added)
  src/pages/teacher/StudentDetailPage.jsx       → C5 (card added below stats)
  src/pages/teacher/ReportsPage.jsx             → C6 (low attendance table)
  src/pages/teacher/DashboardPage.jsx           → C7 (needs attention item)
  src/pages/student/ProfilePage.jsx             → C8 (student sees own attendance)
