-- Tutoria LMS Database Schema (Supabase / PostgreSQL)
-- Uses UUID primary keys. students.id = auth.users.id (set explicitly on insert).

-- Standards (8th, 9th, 10th, 11th, 12th)
CREATE TABLE IF NOT EXISTS standards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    short TEXT,
    emoji TEXT DEFAULT '📚',
    teacher_id UUID,  -- references auth.users.id
    start_date DATE,
    end_date DATE,
    attendance_threshold INTEGER DEFAULT 75,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subject Classes (Maths, Physics, Chemistry, etc.)
CREATE TABLE IF NOT EXISTS subject_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    standard_id UUID REFERENCES standards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '📐',
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Students
-- id = auth.users.id (set explicitly from Supabase auth on create)
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    standard_id UUID REFERENCES standards(id),
    points INTEGER DEFAULT 0,
    attendance_pct NUMERIC DEFAULT 0,
    avg_score NUMERIC DEFAULT 0,
    blocked BOOLEAN DEFAULT false,
    must_change_pwd BOOLEAN DEFAULT true,
    plain_password TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Single device enforcement
CREATE TABLE IF NOT EXISTS student_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    device_fingerprint TEXT NOT NULL,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id)
);

-- Attendance Records (one row per student per subject per day)
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject_class_id UUID NOT NULL REFERENCES subject_classes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')),
    marked_by UUID,  -- teacher's auth.users.id
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, subject_class_id, date)
);

-- Attendance Summary View (per student per subject, computed from attendance_records)
DROP VIEW IF EXISTS attendance_summary CASCADE;
CREATE OR REPLACE VIEW attendance_summary AS
SELECT
    ar.student_id,
    sc.standard_id,
    sc.id AS subject_class_id,
    sc.name AS subject_name,
    COUNT(*) AS total_sessions,
    SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present_count,
    SUM(CASE WHEN ar.status = 'absent'  THEN 1 ELSE 0 END) AS absent_count,
    SUM(CASE WHEN ar.status = 'late'    THEN 1 ELSE 0 END) AS late_count,
    ROUND(
        (SUM(CASE WHEN ar.status IN ('present', 'late') THEN 1 ELSE 0 END)::NUMERIC
         / NULLIF(COUNT(*), 0)) * 100, 1
    ) AS attendance_pct
FROM attendance_records ar
JOIN subject_classes sc ON ar.subject_class_id = sc.id
GROUP BY ar.student_id, sc.id, sc.name, sc.standard_id;

-- Videos
CREATE TABLE IF NOT EXISTS videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES subject_classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    cloudflare_video_id TEXT,
    duration_secs INTEGER,
    size_bytes BIGINT,
    allow_download BOOLEAN DEFAULT true,
    topic_tag TEXT,
    chapters JSONB DEFAULT '[]',
    created_by UUID,  -- references auth.users.id
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video Progress
CREATE TABLE IF NOT EXISTS video_progress (
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    progress_secs INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT false,
    downloaded BOOLEAN DEFAULT false,
    last_watched_at TIMESTAMPTZ,
    PRIMARY KEY (video_id, student_id)
);

-- Tests
CREATE TABLE IF NOT EXISTS tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES subject_classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    duration_mins INTEGER NOT NULL,
    total_marks NUMERIC NOT NULL,
    negative_marking BOOLEAN DEFAULT false,
    penalty NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'draft',
    scheduled_for TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    topic_tag TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questions
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_idx INTEGER NOT NULL,
    order_num INTEGER NOT NULL
);

-- Test Attempts
CREATE TABLE IF NOT EXISTS test_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID REFERENCES tests(id),
    student_id UUID REFERENCES students(id),
    answers JSONB,
    score NUMERIC,
    correct_count INTEGER,
    wrong_count INTEGER,
    marks_deducted NUMERIC DEFAULT 0,
    points_earned INTEGER DEFAULT 0,
    flagged BOOLEAN DEFAULT false,
    cheat_events JSONB,
    started_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (test_id, student_id)
);

-- Broadcasts (WhatsApp-style per standard)
CREATE TABLE IF NOT EXISTS broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    standard_id UUID REFERENCES standards(id) ON DELETE CASCADE,
    sender_id UUID,  -- references auth.users.id
    message TEXT,
    attachment_url TEXT,
    attachment_type TEXT,
    deleted BOOLEAN DEFAULT false,
    edited BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Broadcast Read Receipts
CREATE TABLE IF NOT EXISTS broadcast_reads (
    broadcast_id UUID REFERENCES broadcasts(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (broadcast_id, student_id)
);

-- Reminders (teacher personal task list)
CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID,  -- references auth.users.id
    title TEXT NOT NULL,
    scheduled_for TIMESTAMPTZ,
    context TEXT,
    done BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL,
    recipient_type TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT,
    body TEXT,
    data JSONB,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bulk Import Audit Log
CREATE TABLE IF NOT EXISTS bulk_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID,
    filename TEXT,
    total_rows INTEGER DEFAULT 0,
    created INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invite Links (teacher-generated join codes)
CREATE TABLE IF NOT EXISTS invite_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    standard_id UUID REFERENCES standards(id) ON DELETE CASCADE,
    created_by UUID,  -- references auth.users.id
    max_uses INTEGER DEFAULT 50,
    use_count INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invite Requests (students requesting to join via invite code)
CREATE TABLE IF NOT EXISTS invite_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code TEXT NOT NULL,
    student_name TEXT NOT NULL,
    student_email TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Question Bank
CREATE TABLE IF NOT EXISTS question_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL,
    subject TEXT,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_idx INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Migration helpers (run these if upgrading an existing DB) ──────────────
-- ALTER TABLE standards ADD COLUMN IF NOT EXISTS attendance_threshold INTEGER DEFAULT 75;
-- ALTER TABLE students RENAME COLUMN attendance TO attendance_pct;
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS must_change_pwd BOOLEAN DEFAULT true;
-- ALTER TABLE students DROP COLUMN IF EXISTS supabase_user_id;
-- ALTER TABLE students DROP COLUMN IF EXISTS first_login;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS attachment_type TEXT;
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE students ADD COLUMN IF NOT EXISTS plain_password TEXT;

-- ── Broadcast Scheduling Migration ──────────────────────────────────────────
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

-- ── Video Chapters Migration ────────────────────────────────────────────────
ALTER TABLE videos ADD COLUMN IF NOT EXISTS chapters JSONB DEFAULT '[]';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS topic_tag TEXT;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS topic_tag TEXT;

-- ── Row Level Security ────────────────────────────────────────────────────────
-- The FastAPI backend uses the service_role key which bypasses RLS.
-- RLS protects against direct anon/user key access to the database.
-- Run these after creating all tables.

ALTER TABLE standards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_classes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE students           ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_progress     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests              ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_attempts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_reads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_imports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_bank      ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS — FastAPI backend always uses this.
-- No additional policies needed for service role.
-- Deny all access via anon/authenticated keys (everything goes through FastAPI).

CREATE POLICY "deny_anon_standards"          ON standards          FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_subject_classes"    ON subject_classes    FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_students"           ON students           FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_student_sessions"   ON student_sessions   FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_attendance_records" ON attendance_records  FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_videos"             ON videos             FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_video_progress"     ON video_progress     FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_tests"              ON tests              FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_questions"          ON questions          FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_test_attempts"      ON test_attempts      FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_broadcasts"         ON broadcasts         FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_broadcast_reads"    ON broadcast_reads    FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_reminders"          ON reminders          FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_notifications"      ON notifications      FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_bulk_imports"       ON bulk_imports       FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_invite_links"       ON invite_links       FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_invite_requests"    ON invite_requests    FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "deny_anon_question_bank"      ON question_bank      FOR ALL TO anon, authenticated USING (false);

-- ── Supabase Storage Buckets ──────────────────────────────────────────────────
-- These are NOT SQL tables — they live in Supabase Storage.
-- The backend auto-creates them on first use via storage.create_bucket().
-- You can also create them manually: Supabase Dashboard → Storage → New bucket.
--
-- Bucket: videos   (public: true)
--   Used by: POST /api/videos/upload when Cloudflare Stream is NOT configured.
--   Path pattern: {class_id}/{uuid}_{sanitized_filename}
--   Stored in column: videos.cloudflare_video_id  (as full public HTTPS URL)
--   Note: videos.cloudflare_video_id is dual-purpose — it holds either a short
--         Cloudflare video UID or a full Supabase Storage HTTPS URL depending
--         on which upload path was used. Detect by checking startsWith('https://').
--
-- Bucket: avatars  (public: true)
--   Used by: POST /api/students/me/avatar
--   Path pattern: avatars/{student_id}.{ext}
--   Stored in column: students.avatar_url
--
-- Bucket: broadcasts  (public: true)
--   Used by: POST /api/upload  (broadcast file attachments — images, PDFs)
--   Path pattern: {uuid}-{filename}
-- Stored in column: broadcasts.attachment_url

-- ── Broadcast Scheduling Migration ─────────────────────────────────────────────
-- ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

-- ── Video Chapters Migration ───────────────────────────────────────────────────
-- ALTER TABLE videos ADD COLUMN IF NOT EXISTS chapters JSONB DEFAULT '[]';

-- ══════════════════════════════════════════════════════════════════════════════
-- FEATURE MIGRATIONS — YouTube Videos + Live Classes
-- Run the four blocks below IN ORDER in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Migration 1: Extend videos table for YouTube support ──────────────────────

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'upload'
    CHECK (source_type IN ('upload', 'youtube'));

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS youtube_video_id TEXT,
  ADD COLUMN IF NOT EXISTS youtube_url TEXT;

-- storage_path becomes optional (YouTube videos have no storage path)
-- ALTER TABLE videos ALTER COLUMN storage_path DROP NOT NULL;

-- ── Migration 2: Create live_classes table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS live_classes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        UUID NOT NULL REFERENCES subject_classes(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  duration_mins   INTEGER NOT NULL DEFAULT 60,
  zoom_meeting_id TEXT,
  zoom_join_url   TEXT,
  zoom_start_url  TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_classes_class_id   ON live_classes(class_id);
CREATE INDEX IF NOT EXISTS idx_live_classes_status     ON live_classes(status);
CREATE INDEX IF NOT EXISTS idx_live_classes_scheduled  ON live_classes(scheduled_at);

-- ── Migration 3: Create live_class_attendance table ───────────────────────────

CREATE TABLE IF NOT EXISTS live_class_attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_class_id   UUID NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ,
  left_at         TIMESTAMPTZ,
  duration_mins   INTEGER,
  attended        BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (live_class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_lca_live_class ON live_class_attendance(live_class_id);
CREATE INDEX IF NOT EXISTS idx_lca_student    ON live_class_attendance(student_id);

-- ── Migration 4: Row Level Security (deny all direct access) ─────────────────

ALTER TABLE live_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_class_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_live_classes" ON live_classes;
DROP POLICY IF EXISTS "deny_all_lca" ON live_class_attendance;

CREATE POLICY "deny_all_live_classes" ON live_classes FOR ALL USING (false);
CREATE POLICY "deny_all_lca" ON live_class_attendance FOR ALL USING (false);

-- ── Verification queries (run to confirm migrations applied) ──────────────────

-- 1. Check videos columns (expect 4 rows)
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'videos'
--   AND column_name IN ('source_type','youtube_video_id','youtube_url','storage_path')
-- ORDER BY column_name;

-- 2. Check new tables exist (expect 2 rows)
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('live_classes','live_class_attendance');

-- 3. Confirm RLS enabled (expect rowsecurity=true for both)
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE tablename IN ('live_classes','live_class_attendance');

-- ══════════════════════════════════════════════════════════════════════════════
-- PERFORMANCE OPTIMIZATION INDEXES
-- Added to prevent Sequential Scans and eliminate loading lags for dashboard queries.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_students_standard ON students(standard_id);
CREATE INDEX IF NOT EXISTS idx_students_phone ON students(phone);
CREATE INDEX IF NOT EXISTS idx_subject_classes_standard ON subject_classes(standard_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_subject ON attendance_records(subject_class_id);
CREATE INDEX IF NOT EXISTS idx_videos_class ON videos(class_id);
CREATE INDEX IF NOT EXISTS idx_video_progress_student ON video_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_tests_class ON tests(class_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_student ON test_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_standard ON broadcasts(standard_id);
