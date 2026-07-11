-- ============================================================
-- Udaya LMS — Row Level Security Policies
-- Run this in Supabase SQL Editor AFTER schema.sql
-- ============================================================
-- NOTE: Backend uses service role key → bypasses RLS (correct).
-- These policies protect direct Supabase client access and
-- are enforced whenever the anon/user JWT is used.
-- ============================================================

-- ─── Helper functions ────────────────────────────────────────

-- Returns true if the current JWT belongs to a teacher
CREATE OR REPLACE FUNCTION auth_is_teacher()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'role') = 'teacher'
$$;

-- Returns true if the current JWT belongs to a student
CREATE OR REPLACE FUNCTION auth_is_student()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'role') = 'student'
$$;

-- Returns the students.id (PK) for the currently logged-in student
-- students.id directly references auth.users(id)
CREATE OR REPLACE FUNCTION get_my_student_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM students WHERE id = auth.uid() LIMIT 1
$$;

-- Returns the standard_id the currently logged-in student belongs to
CREATE OR REPLACE FUNCTION get_my_standard_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT standard_id FROM students WHERE id = auth.uid() LIMIT 1
$$;

-- ─── Enable RLS on every table ───────────────────────────────

ALTER TABLE standards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_classes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE students         ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_progress   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_attempts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_reads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_admins   ENABLE ROW LEVEL SECURITY;

-- ─── standards ───────────────────────────────────────────────
-- Teacher: CRUD their own standards
-- Student: read the one standard they belong to

DROP POLICY IF EXISTS "teacher_crud_own_standards" ON standards;
CREATE POLICY "teacher_crud_own_standards" ON standards
  FOR ALL TO authenticated
  USING    (auth_is_teacher() AND teacher_id = auth.uid()::text)
  WITH CHECK (auth_is_teacher() AND teacher_id = auth.uid()::text);

DROP POLICY IF EXISTS "student_read_own_standard" ON standards;
CREATE POLICY "student_read_own_standard" ON standards
  FOR SELECT TO authenticated
  USING (auth_is_student() AND id = get_my_standard_id());

-- ─── subject_classes ─────────────────────────────────────────
-- Teacher: CRUD subjects inside their standards
-- Student: read subjects inside their standard

DROP POLICY IF EXISTS "teacher_crud_own_subjects" ON subject_classes;
CREATE POLICY "teacher_crud_own_subjects" ON subject_classes
  FOR ALL TO authenticated
  USING (
    auth_is_teacher() AND
    standard_id IN (SELECT id FROM standards WHERE teacher_id = auth.uid()::text)
  )
  WITH CHECK (
    auth_is_teacher() AND
    standard_id IN (SELECT id FROM standards WHERE teacher_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "student_read_own_subjects" ON subject_classes;
CREATE POLICY "student_read_own_subjects" ON subject_classes
  FOR SELECT TO authenticated
  USING (auth_is_student() AND standard_id = get_my_standard_id());

-- ─── students ────────────────────────────────────────────────
-- Teacher: CRUD students in their standards
-- Student: read and update their own row only

DROP POLICY IF EXISTS "teacher_crud_own_students" ON students;
CREATE POLICY "teacher_crud_own_students" ON students
  FOR ALL TO authenticated
  USING (
    auth_is_teacher() AND
    standard_id IN (SELECT id FROM standards WHERE teacher_id = auth.uid()::text)
  )
  WITH CHECK (
    auth_is_teacher() AND
    standard_id IN (SELECT id FROM standards WHERE teacher_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "student_read_own_row" ON students;
CREATE POLICY "student_read_own_row" ON students
  FOR SELECT TO authenticated
  USING (auth_is_student() AND id = auth.uid());

DROP POLICY IF EXISTS "student_update_own_row" ON students;
CREATE POLICY "student_update_own_row" ON students
  FOR UPDATE TO authenticated
  USING    (auth_is_student() AND id = auth.uid())
  WITH CHECK (auth_is_student() AND id = auth.uid());

-- ─── student_sessions ────────────────────────────────────────
-- Teacher: none
-- Student: read and upsert their own session

DROP POLICY IF EXISTS "student_manage_own_session" ON student_sessions;
CREATE POLICY "student_manage_own_session" ON student_sessions
  FOR ALL TO authenticated
  USING    (auth_is_student() AND student_id = get_my_student_id())
  WITH CHECK (auth_is_student() AND student_id = get_my_student_id());

-- ─── videos ──────────────────────────────────────────────────
-- Teacher: CRUD videos in their subjects
-- Student: read videos in their standard's subjects

DROP POLICY IF EXISTS "teacher_crud_own_videos" ON videos;
CREATE POLICY "teacher_crud_own_videos" ON videos
  FOR ALL TO authenticated
  USING (
    auth_is_teacher() AND
    class_id IN (
      SELECT sc.id FROM subject_classes sc
      JOIN standards s ON sc.standard_id = s.id
      WHERE s.teacher_id = auth.uid()::text
    )
  )
  WITH CHECK (
    auth_is_teacher() AND
    class_id IN (
      SELECT sc.id FROM subject_classes sc
      JOIN standards s ON sc.standard_id = s.id
      WHERE s.teacher_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "student_read_standard_videos" ON videos;
CREATE POLICY "student_read_standard_videos" ON videos
  FOR SELECT TO authenticated
  USING (
    auth_is_student() AND
    class_id IN (
      SELECT id FROM subject_classes WHERE standard_id = get_my_standard_id()
    )
  );

-- ─── video_progress ──────────────────────────────────────────
-- Teacher: read progress for all students in their standards
-- Student: read and upsert their own progress

DROP POLICY IF EXISTS "teacher_read_student_progress" ON video_progress;
CREATE POLICY "teacher_read_student_progress" ON video_progress
  FOR SELECT TO authenticated
  USING (
    auth_is_teacher() AND
    student_id IN (
      SELECT id FROM students
      WHERE standard_id IN (SELECT id FROM standards WHERE teacher_id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "student_manage_own_progress" ON video_progress;
CREATE POLICY "student_manage_own_progress" ON video_progress
  FOR ALL TO authenticated
  USING    (auth_is_student() AND student_id = get_my_student_id())
  WITH CHECK (auth_is_student() AND student_id = get_my_student_id());

-- ─── tests ───────────────────────────────────────────────────
-- Teacher: CRUD tests in their subjects
-- Student: read published/scheduled tests in their standard

DROP POLICY IF EXISTS "teacher_crud_own_tests" ON tests;
CREATE POLICY "teacher_crud_own_tests" ON tests
  FOR ALL TO authenticated
  USING (
    auth_is_teacher() AND
    class_id IN (
      SELECT sc.id FROM subject_classes sc
      JOIN standards s ON sc.standard_id = s.id
      WHERE s.teacher_id = auth.uid()::text
    )
  )
  WITH CHECK (
    auth_is_teacher() AND
    class_id IN (
      SELECT sc.id FROM subject_classes sc
      JOIN standards s ON sc.standard_id = s.id
      WHERE s.teacher_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "student_read_standard_tests" ON tests;
CREATE POLICY "student_read_standard_tests" ON tests
  FOR SELECT TO authenticated
  USING (
    auth_is_student() AND
    status IN ('active', 'scheduled') AND
    class_id IN (
      SELECT id FROM subject_classes WHERE standard_id = get_my_standard_id()
    )
  );

-- ─── questions ───────────────────────────────────────────────
-- Teacher: CRUD questions for their tests
-- Student: read questions for tests in their standard
-- NOTE: correct_idx must be stripped at the API layer — RLS cannot hide a column

DROP POLICY IF EXISTS "teacher_crud_own_questions" ON questions;
CREATE POLICY "teacher_crud_own_questions" ON questions
  FOR ALL TO authenticated
  USING (
    auth_is_teacher() AND
    test_id IN (
      SELECT t.id FROM tests t
      JOIN subject_classes sc ON t.class_id = sc.id
      JOIN standards s ON sc.standard_id = s.id
      WHERE s.teacher_id = auth.uid()::text
    )
  )
  WITH CHECK (
    auth_is_teacher() AND
    test_id IN (
      SELECT t.id FROM tests t
      JOIN subject_classes sc ON t.class_id = sc.id
      JOIN standards s ON sc.standard_id = s.id
      WHERE s.teacher_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "student_read_standard_questions" ON questions;
CREATE POLICY "student_read_standard_questions" ON questions
  FOR SELECT TO authenticated
  USING (
    auth_is_student() AND
    test_id IN (
      SELECT t.id FROM tests t
      JOIN subject_classes sc ON t.class_id = sc.id
      WHERE sc.standard_id = get_my_standard_id()
    )
  );

-- ─── test_attempts ───────────────────────────────────────────
-- Teacher: read all attempts for students in their standards
-- Student: insert and read their own attempts

DROP POLICY IF EXISTS "teacher_read_student_attempts" ON test_attempts;
CREATE POLICY "teacher_read_student_attempts" ON test_attempts
  FOR SELECT TO authenticated
  USING (
    auth_is_teacher() AND
    student_id IN (
      SELECT id FROM students
      WHERE standard_id IN (SELECT id FROM standards WHERE teacher_id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "student_insert_own_attempt" ON test_attempts;
CREATE POLICY "student_insert_own_attempt" ON test_attempts
  FOR INSERT TO authenticated
  WITH CHECK (auth_is_student() AND student_id = get_my_student_id());

DROP POLICY IF EXISTS "student_read_own_attempt" ON test_attempts;
CREATE POLICY "student_read_own_attempt" ON test_attempts
  FOR SELECT TO authenticated
  USING (auth_is_student() AND student_id = get_my_student_id());

-- ─── broadcasts ──────────────────────────────────────────────
-- Teacher: CRUD broadcasts in their standards
-- Student: read non-deleted broadcasts in their standard

DROP POLICY IF EXISTS "teacher_crud_own_broadcasts" ON broadcasts;
CREATE POLICY "teacher_crud_own_broadcasts" ON broadcasts
  FOR ALL TO authenticated
  USING (
    auth_is_teacher() AND
    standard_id IN (SELECT id FROM standards WHERE teacher_id = auth.uid()::text)
  )
  WITH CHECK (
    auth_is_teacher() AND
    standard_id IN (SELECT id FROM standards WHERE teacher_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "student_read_standard_broadcasts" ON broadcasts;
CREATE POLICY "student_read_standard_broadcasts" ON broadcasts
  FOR SELECT TO authenticated
  USING (
    auth_is_student() AND
    deleted = false AND
    standard_id = get_my_standard_id()
  );

-- ─── broadcast_reads ─────────────────────────────────────────
-- Teacher: read all receipts for their broadcasts
-- Student: insert their own read receipt

DROP POLICY IF EXISTS "teacher_read_broadcast_receipts" ON broadcast_reads;
CREATE POLICY "teacher_read_broadcast_receipts" ON broadcast_reads
  FOR SELECT TO authenticated
  USING (
    auth_is_teacher() AND
    broadcast_id IN (
      SELECT id FROM broadcasts
      WHERE standard_id IN (SELECT id FROM standards WHERE teacher_id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "student_insert_own_read" ON broadcast_reads;
CREATE POLICY "student_insert_own_read" ON broadcast_reads
  FOR INSERT TO authenticated
  WITH CHECK (auth_is_student() AND student_id = get_my_student_id());

DROP POLICY IF EXISTS "student_read_own_receipts" ON broadcast_reads;
CREATE POLICY "student_read_own_receipts" ON broadcast_reads
  FOR SELECT TO authenticated
  USING (auth_is_student() AND student_id = get_my_student_id());

-- ─── invite_links ────────────────────────────────────────────
-- Teacher: CRUD their own invite links
-- Student: read any link by code (needed during join flow)

DROP POLICY IF EXISTS "teacher_crud_own_invite_links" ON invite_links;
CREATE POLICY "teacher_crud_own_invite_links" ON invite_links
  FOR ALL TO authenticated
  USING    (auth_is_teacher() AND created_by = auth.uid())
  WITH CHECK (auth_is_teacher() AND created_by = auth.uid());

DROP POLICY IF EXISTS "student_read_invite_link_by_code" ON invite_links;
CREATE POLICY "student_read_invite_link_by_code" ON invite_links
  FOR SELECT TO authenticated
  USING (auth_is_student());

-- ─── invite_requests ─────────────────────────────────────────
-- Teacher: read and update requests for their invite links
-- Student: insert a join request

DROP POLICY IF EXISTS "teacher_manage_invite_requests" ON invite_requests;
CREATE POLICY "teacher_manage_invite_requests" ON invite_requests
  FOR ALL TO authenticated
  USING (
    auth_is_teacher() AND
    invite_code IN (SELECT code FROM invite_links WHERE created_by = auth.uid())
  )
  WITH CHECK (
    auth_is_teacher() AND
    invite_code IN (SELECT code FROM invite_links WHERE created_by = auth.uid())
  );

DROP POLICY IF EXISTS "student_insert_invite_request" ON invite_requests;
CREATE POLICY "student_insert_invite_request" ON invite_requests
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ─── reminders ───────────────────────────────────────────────
-- Teacher: CRUD their own reminders
-- Student: none (no policy = no access)

DROP POLICY IF EXISTS "teacher_crud_own_reminders" ON reminders;
CREATE POLICY "teacher_crud_own_reminders" ON reminders
  FOR ALL TO authenticated
  USING    (auth_is_teacher() AND teacher_id = auth.uid()::text)
  WITH CHECK (auth_is_teacher() AND teacher_id = auth.uid()::text);

-- ─── notifications ───────────────────────────────────────────
-- Both teacher and student: read their own notifications

DROP POLICY IF EXISTS "read_own_notifications" ON notifications;
CREATE POLICY "read_own_notifications" ON notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "mark_own_notification_read" ON notifications;
CREATE POLICY "mark_own_notification_read" ON notifications
  FOR UPDATE TO authenticated
  USING    (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- ─── teacher_admins ──────────────────────────────────────────
-- Teacher: read their own admin grants

DROP POLICY IF EXISTS "teacher_read_admin_grants" ON teacher_admins;
CREATE POLICY "teacher_read_admin_grants" ON teacher_admins
  FOR SELECT TO authenticated
  USING (auth_is_teacher() AND (teacher_id = auth.uid() OR granted_by = auth.uid()));
