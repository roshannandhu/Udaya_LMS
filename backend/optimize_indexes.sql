-- Performance Optimization Indexes
-- Run these in your Supabase SQL Editor to drastically improve query performance
-- and eliminate loading lags for dashboards.

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
