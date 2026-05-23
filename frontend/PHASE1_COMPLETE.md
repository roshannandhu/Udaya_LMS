# Phase 1 — Foundation Complete

## What was built

### Authentication (Supabase Auth)
- **lib/auth.js** — Updated to use Supabase Auth directly via `@supabase/supabase-js`
  - Teacher login: `supabase.auth.signInWithPassword({ email, password })`
  - Student login: looks up email from `students.username` → `signInWithPassword`
  - Forces password change on first student login (`must_change_pwd = true`)
  - Single device enforcement for students
  - Auth state listener for real-time session handling

- **pages/LoginPage.jsx** — Wired to new Supabase auth
  - Teacher/Student toggle mode
  - Username lookup for students
  - Error handling and loading states

- **pages/student/StudentChangePasswordPage.jsx** — First-time password change
  - Required before accessing student portal

- **App.jsx** — Added `/student/change-password` route

### Database (Supabase)
- **supabase/migrations/001_schema.sql** — Full schema
  - 14 tables matching PLAN.md DB schema
  - Realtime enabled for broadcasts/notifications

- **supabase/migrations/002_rls_policies.sql** — Row Level Security
  - Teacher: CRUD own data
  - Student: read own data, read-only for broadcasts
  - Helper functions: `auth_is_teacher()`, `get_my_student_id()`, etc.

### Supabase Client
- **lib/supabase/client.ts** — Browser Supabase client
- **lib/supabase/server.ts** — Server components (Next.js)
- **lib/types.ts** — TypeScript interfaces for all tables

### Custom Hooks
- useStandards, useStudents, useVideos, useBroadcasts, useTests, useReminders, useNotifications

### PWA
- **public/manifest.json** — PWA manifest
- **public/sw.js** — Service Worker for offline video caching

## To complete Phase 1

1. **Run SQL migrations** in Supabase SQL Editor:
   ```
   Copy contents of supabase/migrations/001_schema.sql → Run
   Copy contents of supabase/migrations/002_rls_policies.sql → Run
   ```

2. **Create a teacher account** in Supabase Dashboard → Authentication

3. **Run the app**:
   ```bash
   cd frontend
   npm run dev
   ```