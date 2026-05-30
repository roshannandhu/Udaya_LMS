# Setup — Run Tutoria / Udaya LMS Locally

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

**Why didn't changing the password in the SQL editor work?**
- Login passwords are NOT in `schema.sql` / the `students` table. They live in
  Supabase's internal `auth.users` table, managed by Supabase Auth. To change a
  login, use the teacher portal (student management → reset password) or the
  Supabase dashboard → Authentication → Users.

---

## Important: everyone shares ONE database

Because all `.env` files point at the same Supabase project, **every collaborator
reads and writes the same live data.** Creating/deleting students, standards,
videos, etc. affects everyone. If you want an isolated copy, create your own
Supabase project, run `backend/schema.sql` + `backend/rls_policies.sql` in its
SQL Editor, put your own keys in the `.env` files, then create a teacher account
from the Supabase dashboard (Authentication → Users → Add user, and set
`user_metadata` to `{ "role": "teacher", "name": "Your Name" }`).
