-- ============================================================
-- Tutoria LMS — Phase 1: Database Schema
-- Run this in Supabase SQL Editor first
-- ============================================================

-- Teachers extend Supabase auth.users
CREATE TABLE IF NOT EXISTS teachers (
  id          UUID PRIMARY KEY REFERENCES auth.users(id),
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  avatar_url  TEXT,
  is_admin    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Standards (10th, 11th, 12th…)
CREATE TABLE IF NOT EXISTS standards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  short            TEXT,
  emoji            TEXT DEFAULT '📚',
  teacher_id       UUID REFERENCES auth.users(id),
  start_date       DATE,
  end_date         DATE,
  auto_delete_days INTEGER,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Subject classes (Maths, Physics…)
CREATE TABLE IF NOT EXISTS subject_classes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id UUID REFERENCES standards(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  emoji       TEXT DEFAULT '📐',
  end_date    DATE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Students (separate auth pool from teachers)
CREATE TABLE IF NOT EXISTS students (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_user_id UUID UNIQUE REFERENCES auth.users(id),
  name             TEXT NOT NULL,
  username         TEXT UNIQUE NOT NULL,
  email            TEXT,
  phone            TEXT,
  avatar_url       TEXT,
  standard_id      UUID REFERENCES standards(id),
  points           INTEGER DEFAULT 0,
  attendance       NUMERIC DEFAULT 0,
  avg_score        NUMERIC DEFAULT 0,
  blocked          BOOLEAN DEFAULT false,
  must_change_pwd  BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Single-device enforcement
CREATE TABLE IF NOT EXISTS student_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID REFERENCES students(id) ON DELETE CASCADE,
  device_fingerprint  TEXT NOT NULL,
  last_active_at      TIMESTAMPTZ DEFAULT now(),
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id)
);

-- Videos
CREATE TABLE IF NOT EXISTS videos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id       UUID REFERENCES subject_classes(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  storage_path   TEXT,
  cloudflare_video_id TEXT,
  duration_secs  INTEGER,
  size_bytes     BIGINT,
  allow_download BOOLEAN DEFAULT true,
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Per-student video progress
CREATE TABLE IF NOT EXISTS video_progress (
  video_id         UUID REFERENCES videos(id) ON DELETE CASCADE,
  student_id       UUID REFERENCES students(id) ON DELETE CASCADE,
  progress_secs    INTEGER DEFAULT 0,
  completed        BOOLEAN DEFAULT false,
  downloaded       BOOLEAN DEFAULT false,
  last_watched_at  TIMESTAMPTZ,
  PRIMARY KEY (video_id, student_id)
);

-- Tests
CREATE TABLE IF NOT EXISTS tests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id         UUID REFERENCES subject_classes(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  duration_mins    INTEGER NOT NULL,
  total_marks      NUMERIC NOT NULL,
  negative_marking BOOLEAN DEFAULT false,
  penalty          NUMERIC DEFAULT 0,
  status           TEXT DEFAULT 'draft',
  scheduled_for    TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- MCQ Questions
CREATE TABLE IF NOT EXISTS questions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id      UUID REFERENCES tests(id) ON DELETE CASCADE,
  question     TEXT NOT NULL,
  options      JSONB NOT NULL,
  correct_idx  INTEGER NOT NULL,
  order_num    INTEGER NOT NULL
);

-- Test attempts (one per student per test)
CREATE TABLE IF NOT EXISTS test_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id        UUID REFERENCES tests(id),
  student_id     UUID REFERENCES students(id),
  answers        JSONB,
  score          NUMERIC,
  correct_count  INTEGER,
  wrong_count    INTEGER,
  marks_deducted NUMERIC DEFAULT 0,
  points_earned  INTEGER DEFAULT 0,
  flagged        BOOLEAN DEFAULT false,
  cheat_events   JSONB,
  started_at     TIMESTAMPTZ,
  submitted_at   TIMESTAMPTZ,
  UNIQUE (test_id, student_id)
);

-- Broadcasts (WhatsApp-style per standard)
CREATE TABLE IF NOT EXISTS broadcasts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id   UUID REFERENCES standards(id) ON DELETE CASCADE,
  sender_id     UUID REFERENCES auth.users(id),
  text          TEXT,
  attachments   JSONB DEFAULT '[]',
  pinned        BOOLEAN DEFAULT false,
  deleted       BOOLEAN DEFAULT false,
  edited        BOOLEAN DEFAULT false,
  scheduled_for TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Read receipts
CREATE TABLE IF NOT EXISTS broadcast_reads (
  broadcast_id UUID REFERENCES broadcasts(id) ON DELETE CASCADE,
  student_id   UUID REFERENCES students(id) ON DELETE CASCADE,
  read_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (broadcast_id, student_id)
);

-- Invite links
CREATE TABLE IF NOT EXISTS invite_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  standard_id UUID REFERENCES standards(id),
  created_by  UUID REFERENCES auth.users(id),
  expires_at  TIMESTAMPTZ,
  max_uses    INTEGER DEFAULT 50,
  use_count   INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Join requests (manual approval)
CREATE TABLE IF NOT EXISTS invite_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code   TEXT REFERENCES invite_links(code),
  student_name  TEXT,
  student_email TEXT,
  status        TEXT DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    UUID REFERENCES auth.users(id),
  title         TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  context       TEXT,
  done          BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- In-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id   UUID NOT NULL,
  recipient_type TEXT NOT NULL,
  type           TEXT NOT NULL,
  title          TEXT,
  body           TEXT,
  data           JSONB,
  read           BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Admin delegation
CREATE TABLE IF NOT EXISTS teacher_admins (
  teacher_id UUID REFERENCES auth.users(id),
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (teacher_id, granted_by)
);

-- Enable realtime for broadcasts and notifications
ALTER PUBLICATION supabase_realtime ADD TABLE broadcasts;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;