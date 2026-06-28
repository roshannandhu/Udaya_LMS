-- Tutoria LMS Database Schema (Supabase / PostgreSQL)
-- Uses UUID primary keys. students.id = auth.users.id (set explicitly on insert).
--
-- ── PORTABILITY (AWS RDS / plain PostgreSQL) ─────────────────────────────────
-- This file targets Supabase, but is the single source of truth for the schema.
-- To provision a NON-Supabase Postgres (e.g. AWS RDS), do these 3 things first:
--
-- 1. gen_random_uuid() is built into PostgreSQL 13+. On PG <13 run:
--      CREATE EXTENSION IF NOT EXISTS pgcrypto;
--
-- 2. Several FKs reference Supabase's auth schema (auth.users). Plain Postgres
--    has no auth schema — create a stub BEFORE running this file:
--      CREATE SCHEMA IF NOT EXISTS auth;
--      CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
--    (Your new auth system must insert a row into auth.users for every
--    teacher/student account, mirroring what Supabase Auth did. Affected FKs:
--    standards.teacher_id, live_classes.created_by, teacher_branding.teacher_id,
--    teacher_admins.*)
--
-- 3. RLS policies below reference Supabase roles (anon, authenticated). On
--    plain Postgres those roles don't exist; either create them as NOLOGIN
--    roles (CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;) or
--    skip the policy blocks — the FastAPI backend connects with full
--    privileges and enforces all authorization itself.
--
-- 4. Storage buckets (bottom of file) are Supabase Storage, NOT SQL. On AWS,
--    replace with S3 buckets and update the backend storage calls.
--
-- ── TEACHER CREDENTIALS (read before migrating!) ─────────────────────────────
-- There is NO teachers table. A teacher account is a row in Supabase Auth's
-- internal auth.users with user_metadata.role = 'teacher' (created via
-- supabase.auth.admin.create_user in main.py). This file CANNOT recreate them.
--
-- To migrate teacher logins to AWS:
--   1. Export auth.users from Supabase (Dashboard → Database → full pg_dump
--      includes the auth schema, or use the Auth admin API to list users).
--   2. Recreate each teacher in the new auth system WITH THE SAME UUID, and
--      insert that UUID into the auth.users stub (portability note 2 above).
--      KEEPING THE UUID IS CRITICAL — standards.teacher_id,
--      teacher_branding.teacher_id, whatsapp_*.teacher_id, live_classes.created_by
--      and students.id all point at auth.users.id. New UUIDs = orphaned data.
--   3. Passwords exist ONLY as bcrypt hashes inside Supabase Auth — there is no
--      plaintext copy anywhere. If the new auth system can't import bcrypt
--      hashes, issue teachers a password reset on first login after migration.
--      (Student passwords are easier: students.plain_password holds the
--      teacher-set password for most students.)

-- Standards (8th, 9th, 10th, 11th, 12th)
CREATE TABLE IF NOT EXISTS standards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    short TEXT,
    emoji TEXT DEFAULT 'graduation',  -- lucide icon key (legacy rows may hold an emoji char)
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
    emoji TEXT DEFAULT 'book',  -- lucide icon key (legacy rows may hold an emoji char)
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Students
-- Tutoria LMS Database Schema (Supabase / PostgreSQL)
-- Uses UUID primary keys. students.id = auth.users.id (set explicitly on insert).
--
-- ── PORTABILITY (AWS RDS / plain PostgreSQL) ─────────────────────────────────
-- This file targets Supabase, but is the single source of truth for the schema.
-- To provision a NON-Supabase Postgres (e.g. AWS RDS), do these 3 things first:
--
-- 1. gen_random_uuid() is built into PostgreSQL 13+. On PG <13 run:
--      CREATE EXTENSION IF NOT EXISTS pgcrypto;
--
-- 2. Several FKs reference Supabase's auth schema (auth.users). Plain Postgres
--    has no auth schema — create a stub BEFORE running this file:
--      CREATE SCHEMA IF NOT EXISTS auth;
--      CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
--    (Your new auth system must insert a row into auth.users for every
--    teacher/student account, mirroring what Supabase Auth did. Affected FKs:
--    standards.teacher_id, live_classes.created_by, teacher_branding.teacher_id,
--    teacher_admins.*)
--
-- 3. RLS policies below reference Supabase roles (anon, authenticated). On
--    plain Postgres those roles don't exist; either create them as NOLOGIN
--    roles (CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;) or
--    skip the policy blocks — the FastAPI backend connects with full
--    privileges and enforces all authorization itself.
--
-- 4. Storage buckets (bottom of file) are Supabase Storage, NOT SQL. On AWS,
--    replace with S3 buckets and update the backend storage calls.
--
-- ── TEACHER CREDENTIALS (read before migrating!) ─────────────────────────────
-- There is NO teachers table. A teacher account is a row in Supabase Auth's
-- internal auth.users with user_metadata.role = 'teacher' (created via
-- supabase.auth.admin.create_user in main.py). This file CANNOT recreate them.
--
-- To migrate teacher logins to AWS:
--   1. Export auth.users from Supabase (Dashboard → Database → full pg_dump
--      includes the auth schema, or use the Auth admin API to list users).
--   2. Recreate each teacher in the new auth system WITH THE SAME UUID, and
--      insert that UUID into the auth.users stub (portability note 2 above).
--      KEEPING THE UUID IS CRITICAL — standards.teacher_id,
--      teacher_branding.teacher_id, whatsapp_*.teacher_id, live_classes.created_by
--      and students.id all point at auth.users.id. New UUIDs = orphaned data.
--   3. Passwords exist ONLY as bcrypt hashes inside Supabase Auth — there is no
--      plaintext copy anywhere. If the new auth system can't import bcrypt
--      hashes, issue teachers a password reset on first login after migration.
--      (Student passwords are easier: students.plain_password holds the
--      teacher-set password for most students.)

-- Standards (8th, 9th, 10th, 11th, 12th)
CREATE TABLE IF NOT EXISTS standards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    short TEXT,
    emoji TEXT DEFAULT 'graduation',  -- lucide icon key (legacy rows may hold an emoji char)
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
    emoji TEXT DEFAULT 'book',  -- lucide icon key (legacy rows may hold an emoji char)
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Students
-- id = auth.users.id (set explicitly from Supabase auth on create)
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    student_code TEXT,            -- human-readable Student ID, e.g. UDAYA202510001 (auto-generated)
    email TEXT,
    phone TEXT,
    parent_phone TEXT,
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
-- NOTE: the unique index on student_code lives in the migration block below, AFTER
-- the ALTER that guarantees the column exists. (On an existing DB the CREATE TABLE
-- above is a no-op, so the column is only added by that ALTER.)

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
    note TEXT,                                -- optional per-record remark
    updated_at TIMESTAMPTZ,                   -- set when a record is re-marked
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
    terminated BOOLEAN DEFAULT false,  -- exam cancelled (e.g. screenshot detected) → score 0
    started_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reattempt_allowed BOOLEAN DEFAULT false,  -- teacher-granted one-shot re-take
    UNIQUE (test_id, student_id)
);

-- Test Re-attempt Requests (student asks teacher to re-take a test they already attempted)
CREATE TABLE IF NOT EXISTS test_reattempt_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id     UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    reason      TEXT,
    status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
    old_score   NUMERIC,                 -- snapshot of the discarded attempt's score
    created_at  TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID
);
-- at most one OPEN request per student per test
CREATE UNIQUE INDEX IF NOT EXISTS idx_reattempt_pending
    ON test_reattempt_requests(test_id, student_id) WHERE status = 'pending';

-- Assignment Re-attempt Requests (student asks teacher to redo a GRADED assignment;
-- approval clears the grade so the existing retract/resubmit flow re-opens)
CREATE TABLE IF NOT EXISTS assignment_reattempt_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    reason        TEXT,
    status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
    old_marks     NUMERIC,
    created_at    TIMESTAMPTZ DEFAULT now(),
    resolved_at   TIMESTAMPTZ,
    resolved_by   UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignment_reattempt_pending
    ON assignment_reattempt_requests(assignment_id, student_id) WHERE status = 'pending';

-- Private per-student video comments (student asks a doubt on a lesson; teacher
-- replies). A student sees ONLY their own; the teacher sees all. Visibility is
-- enforced in the API (role-based), and RLS denies all direct client access.
CREATE TABLE IF NOT EXISTS video_comments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id      UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    text          TEXT NOT NULL,
    teacher_reply TEXT,
    replied_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_video_comments_video ON video_comments(video_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_student ON video_comments(student_id);
ALTER TABLE video_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_video_comments" ON video_comments;
CREATE POLICY "deny_all_video_comments" ON video_comments FOR ALL USING (false);

-- Video likes (one like per student per lesson; teacher sees the count). RLS
-- denies direct client access — the API computes counts with the service key.
CREATE TABLE IF NOT EXISTS video_likes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id    UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (video_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_video_likes_video ON video_likes(video_id);
CREATE INDEX IF NOT EXISTS idx_video_likes_student ON video_likes(student_id);
ALTER TABLE video_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_video_likes" ON video_likes;
CREATE POLICY "deny_all_video_likes" ON video_likes FOR ALL USING (false);

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

-- What's New: per-student per-section "last seen" markers. A section's badge
-- counts content with created_at > seen_at; missing row falls back to
-- students.created_at in the backend.
CREATE TABLE IF NOT EXISTS student_seen (
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    section TEXT NOT NULL CHECK (section IN ('videos', 'tests', 'live')),
    seen_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (student_id, section)
);
ALTER TABLE student_seen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_student_seen" ON student_seen;
CREATE POLICY "deny_anon_student_seen" ON student_seen FOR ALL TO anon, authenticated USING (false);

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
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
-- Fix missing CASCADE so student deletes don't fail when test attempts exist
ALTER TABLE test_attempts DROP CONSTRAINT IF EXISTS test_attempts_student_id_fkey;
ALTER TABLE test_attempts ADD CONSTRAINT test_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS plain_password TEXT;

-- ── Student ID (human-readable code) Migration ──────────────────────────────
ALTER TABLE students ADD COLUMN IF NOT EXISTS student_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_student_code ON students(student_code) WHERE student_code IS NOT NULL;

-- ── Broadcast Scheduling Migration ──────────────────────────────────────────
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

-- ── Video Chapters Migration ────────────────────────────────────────────────
ALTER TABLE videos ADD COLUMN IF NOT EXISTS chapters JSONB DEFAULT '[]';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS topic_tag TEXT;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS topic_tag TEXT;
-- Let a teacher dismiss an exam from the WhatsApp "Pending Actions" list ("Later"/✕):
ALTER TABLE tests ADD COLUMN IF NOT EXISTS results_notify_dismissed BOOLEAN DEFAULT false;

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
ALTER TABLE test_reattempt_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_reattempt_requests ENABLE ROW LEVEL SECURITY;
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

DROP POLICY IF EXISTS "deny_anon_standards"          ON standards;
CREATE POLICY "deny_anon_standards"          ON standards          FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_subject_classes"    ON subject_classes;
CREATE POLICY "deny_anon_subject_classes"    ON subject_classes    FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_students"           ON students;
CREATE POLICY "deny_anon_students"           ON students           FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_student_sessions"   ON student_sessions;
CREATE POLICY "deny_anon_student_sessions"   ON student_sessions   FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_attendance_records" ON attendance_records;
CREATE POLICY "deny_anon_attendance_records" ON attendance_records  FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_videos"             ON videos;
CREATE POLICY "deny_anon_videos"             ON videos             FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_video_progress"     ON video_progress;
CREATE POLICY "deny_anon_video_progress"     ON video_progress     FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_tests"              ON tests;
CREATE POLICY "deny_anon_tests"              ON tests              FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_questions"          ON questions;
CREATE POLICY "deny_anon_questions"          ON questions          FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_test_attempts"      ON test_attempts;
CREATE POLICY "deny_anon_test_attempts"      ON test_attempts      FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_test_reattempt_requests" ON test_reattempt_requests;
CREATE POLICY "deny_anon_test_reattempt_requests" ON test_reattempt_requests FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_assignment_reattempt_requests" ON assignment_reattempt_requests;
CREATE POLICY "deny_anon_assignment_reattempt_requests" ON assignment_reattempt_requests FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_broadcasts"         ON broadcasts;
CREATE POLICY "deny_anon_broadcasts"         ON broadcasts         FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_broadcast_reads"    ON broadcast_reads;
CREATE POLICY "deny_anon_broadcast_reads"    ON broadcast_reads    FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_reminders"          ON reminders;
CREATE POLICY "deny_anon_reminders"          ON reminders          FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_notifications"      ON notifications;
CREATE POLICY "deny_anon_notifications"      ON notifications      FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_bulk_imports"       ON bulk_imports;
CREATE POLICY "deny_anon_bulk_imports"       ON bulk_imports       FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_invite_links"       ON invite_links;
CREATE POLICY "deny_anon_invite_links"       ON invite_links       FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_invite_requests"    ON invite_requests;
CREATE POLICY "deny_anon_invite_requests"    ON invite_requests    FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_anon_question_bank"      ON question_bank;
CREATE POLICY "deny_anon_question_bank"      ON question_bank      FOR ALL TO anon, authenticated USING (false);

-- ── Supabase Storage Buckets ──────────────────────────────────────────────────
-- These are NOT SQL tables — they live in Supabase Storage.
-- The backend auto-creates them on first use via storage.create_bucket().
-- You can also create them manually: Supabase Dashboard → Storage → New bucket.
-- NOTE: this section documents the 3 original buckets in detail; the COMPLETE
-- 7-bucket list from the live project is in the SYNC MIGRATION block at the
-- bottom of this file (adds: assignments, thumbnails, notes, whatsapp).
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
  zoom_passcode   TEXT,
  thumbnail_url       TEXT,                    -- snapshot of teacher's auto-thumbnail base image
  thumbnail_text_side TEXT DEFAULT 'right',    -- blank side ('left'|'right') where text overlays
  status          TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Idempotent upgrades for existing databases
ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS zoom_passcode TEXT;
ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS thumbnail_text_side TEXT DEFAULT 'right';

CREATE INDEX IF NOT EXISTS idx_live_classes_class_id   ON live_classes(class_id);
CREATE INDEX IF NOT EXISTS idx_live_classes_status     ON live_classes(status);
CREATE INDEX IF NOT EXISTS idx_live_classes_scheduled  ON live_classes(scheduled_at);

-- ── teacher_branding: one universal auto-thumbnail base image per teacher ─────
CREATE TABLE IF NOT EXISTS teacher_branding (
  teacher_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  thumbnail_url       TEXT,                    -- snapshot of teacher's auto-thumbnail base image
  thumbnail_text_side TEXT DEFAULT 'right',    -- 'left' or 'right'
  profile_photo_url   TEXT,                    -- teacher's profile photo
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Global app/teacher settings (durable home for what used to live only in the
-- ephemeral teacher_settings.json: branding name + logo URL, default student
-- password, termination PIN, AI provider key, security/notification prefs).
CREATE TABLE IF NOT EXISTS app_settings (
  id         TEXT PRIMARY KEY,                 -- single 'global' row (one institution)
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_app_settings" ON app_settings;
CREATE POLICY "deny_all_app_settings" ON app_settings FOR ALL USING (false);

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
ALTER TABLE teacher_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_live_classes" ON live_classes;
DROP POLICY IF EXISTS "deny_all_lca" ON live_class_attendance;
DROP POLICY IF EXISTS "deny_all_teacher_branding" ON teacher_branding;

CREATE POLICY "deny_all_live_classes" ON live_classes FOR ALL USING (false);
CREATE POLICY "deny_all_lca" ON live_class_attendance FOR ALL USING (false);
CREATE POLICY "deny_all_teacher_branding" ON teacher_branding FOR ALL USING (false);

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
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications(recipient_id, created_at DESC) WHERE read = false;
    from_phone          TEXT NOT NULL,
    student_id          UUID,
    student_name        TEXT,
    standard_id         UUID,
    standard_name       TEXT,
    body                TEXT,
    media_url           TEXT,
    media_type          TEXT,
    provider_message_id TEXT,
    read_by_teacher     BOOLEAN DEFAULT false,
    received_at         TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_inbox_teacher ON whatsapp_inbox(teacher_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_inbox_phone   ON whatsapp_inbox(from_phone);
ALTER TABLE whatsapp_inbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_wa_inbox" ON whatsapp_inbox;
CREATE POLICY "deny_all_wa_inbox" ON whatsapp_inbox FOR ALL USING (false);

-- ══════════════════════════════════════════════════════════════════════════════
-- SYNC MIGRATION (June 2026) — full live-DB ⇄ schema.sql reconciliation
-- Produced by introspecting the production Supabase project. Running this whole
-- file (or just this block) is idempotent and brings any environment — the
-- current Supabase project OR a fresh AWS Postgres — to the same final schema.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── A. Columns that exist in the live DB but were missing from this file ──────

-- attendance_records extras (also added to the CREATE TABLE above)
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- broadcasts: legacy columns from the first WhatsApp-style iteration. Current
-- code writes `message` / `attachment_url`; these stay for data parity so a
-- dump/restore to AWS round-trips without "column does not exist" surprises.
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS text        TEXT;     -- legacy (pre-`message`)
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS attachments JSONB;    -- legacy (pre-`attachment_url`)
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS pinned      BOOLEAN DEFAULT false;  -- legacy, UI hardcodes false

-- students: legacy column (code reads/writes attendance_pct instead)
ALTER TABLE students ADD COLUMN IF NOT EXISTS attendance NUMERIC;     -- legacy

-- teacher_admins: legacy table from the original migration set
-- (frontend/supabase/migrations/001_schema.sql). Unused by current backend code
-- but present in production — kept so a full data migration round-trips.
CREATE TABLE IF NOT EXISTS teacher_admins (
    teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (teacher_id, granted_by)
);
ALTER TABLE teacher_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_teacher_admins" ON teacher_admins;
CREATE POLICY "deny_anon_teacher_admins" ON teacher_admins FOR ALL TO anon, authenticated USING (false);

-- ── B. Columns defined above but missing from the LIVE DB (catch-up ALTERs) ───
-- The CREATE TABLE statements are no-ops on an existing DB, so columns added to
-- them later never materialize without an explicit ALTER. These make running
-- this file catch the live Supabase project up:

ALTER TABLE standards        ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE standards        ADD COLUMN IF NOT EXISTS end_date   DATE;
ALTER TABLE teacher_branding ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE teacher_branding ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
-- (tests.results_notify_dismissed, whatsapp_messages.test_id and the
--  whatsapp_templates media_* columns already have ALTERs earlier in this file.)

-- ── Migration: Push notifications (FCM) + live-class reminders ───────────────
-- device_tokens: one row per (user, device). user_id == notifications.recipient_id
-- (a student's id, or a teacher's auth id), so a notification can be pushed to all
-- of that recipient's phones. token is the FCM registration token (globally unique).
CREATE TABLE IF NOT EXISTS device_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    token       TEXT NOT NULL UNIQUE,
    platform    TEXT NOT NULL DEFAULT 'android',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_device_tokens" ON device_tokens;
CREATE POLICY "deny_anon_device_tokens" ON device_tokens FOR ALL TO anon, authenticated USING (false);

-- live_class_reminders: dedup ledger so each (class, lead-time) full-screen alarm
-- fires exactly once, even across reminder-loop ticks and server restarts.
CREATE TABLE IF NOT EXISTS live_class_reminders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_class_id UUID NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
    offset_min    INTEGER NOT NULL,
    sent_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (live_class_id, offset_min)
);
ALTER TABLE live_class_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_live_class_reminders" ON live_class_reminders;
CREATE POLICY "deny_anon_live_class_reminders" ON live_class_reminders FOR ALL TO anon, authenticated USING (false);


-- ── C. Supabase Storage buckets — COMPLETE list from the live project ─────────
-- Not SQL. The backend auto-creates missing buckets on first use. On AWS,
-- recreate these as S3 buckets/prefixes and swap the storage layer:
--   videos       (public)  - video files when Cloudflare Stream isn't configured
--   avatars      (public)  - student profile photos        → students.avatar_url
--   broadcasts   (public)  - broadcast attachments         → broadcasts.attachment_url
--   assignments  (public)  - assignment files/submissions  → assignment_attachments.file_url,
--                                                            assignment_submissions.file_url
--   thumbnails   (public)  - live-class thumbnails + teacher profile photos
--                                                          → teacher_branding.*
--   notes        (public)  - study-material note files     → notes.file_url
--   whatsapp     (public)  - WhatsApp template/message media → whatsapp_templates.media_url,
--                                                              whatsapp_messages.media_url
