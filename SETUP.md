# Setup — Run Udaya / Udaya LMS Locally

This repo is configured for **clone-and-run**. The `.env` files (with the shared
Supabase credentials) are committed, so you do **not** need to create them.

> ⚠️ **Keep this GitHub repo PRIVATE.** The committed `backend/.env` contains the
> Supabase `service_role` key, which grants full read/write/delete access to the
> database. Anyone who can see the repo can wipe all data.

---

## Prerequisites

- **Node.js 18+** (for the frontend) → https://nodejs.org
- **Python 3.10+** (for the backend) → https://python.org

Check:
```bash
node --version
python --version   # on Windows you may need:  py --version
```

---

## 1. Backend (FastAPI) — port 8001

```bash
cd backend
pip install -r requirements.txt          # first time only
uvicorn main:app --reload --port 8001
```
On Windows, if `python`/`uvicorn` aren't on PATH, use:
```bash
py -m pip install -r requirements.txt
py -m uvicorn main:app --reload --port 8001
```

Verify it's connected — open http://localhost:8001/api/health
You should see: `{"status":"ok","database":"connected"}`

API docs: http://localhost:8001/docs

---

## 2. Frontend (React + Vite) — port 3001

In a **second terminal**:
```bash
cd frontend
npm install          # first time only
npm run dev
```
Open the URL it prints (http://localhost:3001).

---

## 3. Log in

The accounts live in **Supabase Auth** (not in `schema.sql`), and they already
exist in the shared project. Use:

| Role    | Email / Login        | Password    |
|---------|----------------------|-------------|
| Teacher | `admin@udaya.com`    | `Admin1234` |

- Teacher login → Teacher portal.
- Students log in with the **email or phone number** their teacher set when
  creating their account (students cannot self-register).

---

## Troubleshooting

**"Invalid credentials" on login**
- Make sure the backend says `"database":"connected"` at `/api/health`.
- Confirm you're using the committed `backend/.env` (don't overwrite it with a
  blank/placeholder file). It must point at
  `https://qbwrygaxnblqchejkxqs.supabase.co`.

**Backend health says `"database":"disconnected"` or login returns `503`**
- `backend/.env` is missing or has placeholder values. Restore it from git:
  `git checkout backend/.env`.

**Login worked but pages are empty / 401 after a bit**
- Token refresh needs the backend running. Keep the backend terminal open.

**"Database error querying schema" (HTTP 500) on login**
- This means a login account was created with a raw `INSERT INTO auth.users`
  (a "seed SQL"). That leaves required token columns NULL and breaks Supabase
  Auth for that user. It is NOT an infrastructure problem — recreating the
  project will not help if you insert users via SQL again.
- Fix: run `backend/fix_auth_users_nulls.sql` in the Supabase SQL Editor, then
  log in again. If it still fails, delete the user (Authentication → Users) and
  recreate it with `python seed_teacher.py`.
- Prevention: **never** create accounts with `INSERT INTO auth.users`. Use
  `seed_teacher.py` (Auth admin API) or the dashboard → Authentication → Users.

**Why didn't changing the password in the SQL editor work?**
- Login passwords are NOT in `schema.sql` / the `students` table. They live in
  Supabase's internal `auth.users` table, managed by Supabase Auth. To change a
  login, use the teacher portal (student management → reset password) or the
  Supabase dashboard → Authentication → Users.

---

## Important: everyone shares ONE database

Because all `.env` files point at the same Supabase project, **every collaborator
reads and writes the same live data.** Creating/deleting students, standards,
videos, etc. affects everyone.

---

## Optional: run your own isolated copy (own Supabase project)

If you'd rather have an independent database instead of sharing:

1. Create a free Supabase project at https://supabase.com.
2. In **Project Settings → API**, copy your `Project URL`, `anon` key, and
   `service_role` key.
3. Put them into `backend/.env` and `frontend/.env.local` (replace the shared
   values). `VITE_API_URL` stays `http://localhost:8001/api`.
4. In the Supabase **SQL Editor**, paste the entire contents of
   `backend/schema.sql` and run it. That one file is self-contained — it creates
   every table, index, and RLS policy. (You don't need `rls_policies.sql`; it's
   an alternative, more granular policy set. Don't run both.)
5. Create your first teacher login (accounts live in Supabase Auth, NOT in the
   SQL, so this step is required):
   ```bash
   cd backend
   python seed_teacher.py
   # or:  py seed_teacher.py        (Windows)
   ```
   This creates `admin@udaya.com` / `Admin1234`. To use your own:
   ```bash
   python seed_teacher.py --email you@example.com --password YourPass123 --name "Your Name"
   ```
   The script is idempotent — re-running it just resets the password.
6. Start the backend and frontend (steps 1–2 above) and log in. Create students
   from inside the teacher portal.
