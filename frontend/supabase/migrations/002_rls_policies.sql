-- ============================================================
-- Tutoria LMS — Phase 1: Row Level Security Policies
-- Run this in Supabase SQL Editor AFTER 001_schema.sql
-- ============================================================
-- NOTE: Backend uses service role key → bypasses RLS (correct).
-- These policies protect direct Supabase client access and
-- are enforced whenever the anon/user JWT is used.
-- ============================================================

-- ─── Helper functions ────────────────────────────────────────

CREATE OR REPLACE FUNCTION auth_is_teacher()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'role') = 'teacher'
$$;

CREATE OR REPLACE FUNCTION auth_is_student()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'role') = 'student'
$$;

CREATE OR REPLACE FUNCTION get_my_student_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM students WHERE supabase_user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION get_my_standard_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT standard_id FROM students WHERE supabase_user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION is_own_standard(standard_id UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM standards
    WHERE id = standard_id AND teacher_id = auth.uid()
  );
END;
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
ALTER TABLE test_attempts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_reads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_admins   ENABLE ROW LEVEL SECURITY;

-- ─── standards ───────────────────────────────────────────────

CREATE POLICY "teacher_crud_own_standards" ON standards
  FOR ALL TO authenticated
  USING (auth_is_teacher() AND teacher_id = auth.uid());

CREATE POLICY "student_read_own_standard" ON standards
  FOR SELECT TO authenticated
  USING (auth_is_student() AND id = get_my_standard_id());

-- ─── subject_classes ─────────────────────────────────────────

CREATE POLICY "teacher_crud_own_subjects" ON subject_classes
  FOR ALL TO authenticated
  USING (
    auth_is_teacher() AND
    EXISTS (SELECT 1 FROM standards WHERE id = standard_id AND teacher_id = auth.uid())
  );

CREATE POLICY "student_read_own_subjects" ON subject_classes
  FOR SELECT TO authenticated
  USING (auth_is_student() AND standard_id = get_my_standard_id());

-- ─── students ────────────────────────────────────────────────

CREATE POLICY "teacher_crud_own_students" ON students
  FOR ALL TO authenticated
  USING (
    auth_is_teacher() AND
    EXISTS (SELECT 1 FROM standards WHERE id = standard_id AND teacher_id = auth.uid())
  );

CREATE POLICY "student_read_own_row" ON students
  FOR SELECT TO authenticated
  USING (auth_is_student() AND supabase_user_id = auth.uid());

CREATE POLICY "student_update_own_row" ON students
  FOR UPDATE TO authenticated
  USING (auth_is_student() AND supabase_user_id = auth.uid());

-- ─── student_sessions ────────────────────────────────────────

CREATE POLICY "student_manage_own_session" ON student_sessions
  FOR ALL TO authenticated
  USING (auth_is_student() AND student_id = get_my_student_id());

-- ─── videos ──────────────────────────────────────────────────

CREATE POLICY "teacher_crud_own_videos" ON videos
  FOR ALL TO authenticated
  USING (
    auth_is_teacher() AND
    EXISTS (
      SELECT 1 FROM subject_classes sc
      JOIN standards s ON sc.standard_id = s.id
      WHERE sc.id = class_id AND s.teacher_id = auth.uid()
    )
  );

CREATE POLICY "student_read_standard_videos" ON videos
  FOR SELECT TO authenticated
  USING (
    auth_is_student() AND
    EXISTS (
      SELECT 1 FROM subject_classes WHERE id = class_id AND standard_id = get_my_standard_id()
    )
  );

-- ─── video_progress ──────────────────────────────────────────

CREATE POLICY "teacher_read_student_progress" ON video_progress
  FOR SELECT TO authenticated
  USING (
    auth_is_teacher() AND
    EXISTS (
      SELECT 1 FROM students
      WHERE id = student_id AND EXISTS (
        SELECT 1 FROM standards WHERE id = standard_id AND teacher_id = auth.uid()
      )
    )
  );

CREATE POLICY "student_manage_own_progress" ON video_progress
  FOR ALL TO authenticated
  USING (auth_is_student() AND student_id = get_my_student_id());

-- ─── tests ───────────────────────────────────────────────────

CREATE POLICY "teacher_crud_own_tests" ON tests
  FOR ALL TO authenticated
  USING (
    auth_is_teacher() AND
    EXISTS (
      SELECT 1 FROM subject_classes sc
      JOIN standards s ON sc.standard_id = s.id
      WHERE sc.id = class_id AND s.teacher_id = auth.uid()
    )
  );

CREATE POLICY "student_read_standard_tests" ON tests
  FOR SELECT TO authenticated
  USING (
    auth_is_student() AND
    status IN ('active', 'scheduled') AND
    EXISTS (
      SELECT 1 FROM subject_classes WHERE id = class_id AND standard_id = get_my_standard_id()
    )
  );

-- ─── questions ───────────────────────────────────────────────

CREATE POLICY "teacher_crud_own_questions" ON questions
  FOR ALL TO authenticated
  USING (
    auth_is_teacher() AND
    EXISTS (
      SELECT 1 FROM tests t
      JOIN subject_classes sc ON t.class_id = sc.id
      JOIN standards s ON sc.standard_id = s.id
      WHERE t.id = test_id AND s.teacher_id = auth.uid()
    )
  );

CREATE POLICY "student_read_standard_questions" ON questions
  FOR SELECT TO authenticated
  USING (
    auth_is_student() AND
    EXISTS (
      SELECT 1 FROM tests t
      JOIN subject_classes sc ON t.class_id = sc.id
      WHERE t.id = test_id AND sc.standard_id = get_my_standard_id()
    )
  );

-- ─── test_attempts ───────────────────────────────────────────

CREATE POLICY "teacher_read_student_attempts" ON test_attempts
  FOR SELECT TO authenticated
  USING (
    auth_is_teacher() AND
    EXISTS (
      SELECT 1 FROM students
      WHERE id = student_id AND EXISTS (
        SELECT 1 FROM standards WHERE id = standard_id AND teacher_id = auth.uid()
      )
    )
  );

CREATE POLICY "student_insert_own_attempt" ON test_attempts
  FOR INSERT TO authenticated
  WITH CHECK (auth_is_student() AND student_id = get_my_student_id());

CREATE POLICY "student_read_own_attempt" ON test_attempts
  FOR SELECT TO authenticated
  USING (auth_is_student() AND student_id = get_my_student_id());

-- ─── broadcasts ──────────────────────────────────────────────

CREATE POLICY "teacher_crud_own_broadcasts" ON broadcasts
  FOR ALL TO authenticated
  USING (
    auth_is_teacher() AND
    EXISTS (SELECT 1 FROM standards WHERE id = standard_id AND teacher_id = auth.uid())
  );

CREATE POLICY "student_read_standard_broadcasts" ON broadcasts
  FOR SELECT TO authenticated
  USING (
    auth_is_student() AND
    deleted = false AND
    standard_id = get_my_standard_id()
  );

-- ─── broadcast_reads ─────────────────────────────────────────

CREATE POLICY "teacher_read_broadcast_receipts" ON broadcast_reads
  FOR SELECT TO authenticated
  USING (
    auth_is_teacher() AND
    EXISTS (
      SELECT 1 FROM broadcasts b
      JOIN standards s ON b.standard_id = s.id
      WHERE b.id = broadcast_id AND s.teacher_id = auth.uid()
    )
  );

CREATE POLICY "student_insert_own_read" ON broadcast_reads
  FOR INSERT TO authenticated
  WITH CHECK (auth_is_student() AND student_id = get_my_student_id());

CREATE POLICY "student_read_own_receipts" ON broadcast_reads
  FOR SELECT TO authenticated
  USING (auth_is_student() AND student_id = get_my_student_id());

-- ─── invite_links ────────────────────────────────────────────

CREATE POLICY "teacher_crud_own_invite_links" ON invite_links
  FOR ALL TO authenticated
  USING (auth_is_teacher() AND created_by = auth.uid());

CREATE POLICY "student_read_invite_link_by_code" ON invite_links
  FOR SELECT TO authenticated
  USING (auth_is_student());

-- ─── invite_requests ─────────────────────────────────────────

CREATE POLICY "teacher_manage_invite_requests" ON invite_requests
  FOR ALL TO authenticated
  USING (
    auth_is_teacher() AND
    EXISTS (
      SELECT 1 FROM invite_links WHERE code = invite_code AND created_by = auth.uid()
    )
  );

CREATE POLICY "student_insert_invite_request" ON invite_requests
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ─── reminders ───────────────────────────────────────────────

CREATE POLICY "teacher_crud_own_reminders" ON reminders
  FOR ALL TO authenticated
  USING (auth_is_teacher() AND teacher_id = auth.uid());

-- ─── notifications ───────────────────────────────────────────

CREATE POLICY "read_own_notifications" ON notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "mark_own_notification_read" ON notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid());

-- ─── teacher_admins ──────────────────────────────────────────

CREATE POLICY "teacher_read_admin_grants" ON teacher_admins
  FOR SELECT TO authenticated
  USING (auth_is_teacher() AND (teacher_id = auth.uid() OR granted_by = auth.uid()));

-- ─── Enable realtime subscriptions ──────────────────────────
-- Note: These are enabled in 001_schema.sql via ALTER PUBLICATION