-- ============================================================
-- FIX: "Database error querying schema" (HTTP 500) on login
-- ============================================================
-- Cause: a login account was created with a raw `INSERT INTO auth.users`
-- (e.g. a "seed SQL"). That leaves several token columns NULL, and Supabase
-- Auth (GoTrue) cannot read NULL there — every login then fails with
-- "Database error querying schema" / "converting NULL to string is unsupported".
--
-- This is NOT an infrastructure problem and recreating the project will NOT
-- help if you again insert users via SQL. The correct way to create accounts
-- is the Auth admin API (use backend/seed_teacher.py) or the dashboard
-- (Authentication -> Users -> Add user). NEVER `INSERT INTO auth.users`.
--
-- Run this in the Supabase SQL Editor to repair already-inserted users.
-- ------------------------------------------------------------

UPDATE auth.users SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  email_change               = COALESCE(email_change, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change               = COALESCE(phone_change, ''),
  phone_change_token         = COALESCE(phone_change_token, ''),
  reauthentication_token     = COALESCE(reauthentication_token, '')
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change IS NULL
   OR email_change_token_new IS NULL
   OR email_change_token_current IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL
   OR reauthentication_token IS NULL;

-- After running this, try logging in again. If the account still fails,
-- delete it (Authentication -> Users) and recreate it with seed_teacher.py.
