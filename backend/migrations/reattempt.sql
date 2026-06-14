-- ============================================================================
-- Re-attempt feature migration (EXAMS + ASSIGNMENTS)
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query
-- → paste → Run). The app's auto-migration does NOT work on hosted Supabase,
-- so this must be applied manually. Safe to re-run (idempotent).
-- ============================================================================

-- ── Exam re-attempt ─────────────────────────────────────────────────────────
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS reattempt_allowed BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS test_reattempt_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id     UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    reason      TEXT,
    status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
    old_score   NUMERIC,
    created_at  TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reattempt_pending
    ON test_reattempt_requests(test_id, student_id) WHERE status = 'pending';
ALTER TABLE test_reattempt_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_reattempt" ON test_reattempt_requests;
CREATE POLICY "deny_all_reattempt" ON test_reattempt_requests FOR ALL USING (false);

-- ── Assignment re-attempt ───────────────────────────────────────────────────
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
ALTER TABLE assignment_reattempt_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_assignment_reattempt" ON assignment_reattempt_requests;
CREATE POLICY "deny_all_assignment_reattempt" ON assignment_reattempt_requests FOR ALL USING (false);
