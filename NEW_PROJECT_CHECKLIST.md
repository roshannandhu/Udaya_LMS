# New Supabase Project — Copy-Paste Checklist

Follow this **in order** to run Udaya on your *own* Supabase project.

> ❌ **Do NOT create the teacher with SQL.** Never run `INSERT INTO auth.users`.
> It leaves required columns NULL and you'll get **"Database error querying
> schema"** on every login. Use `seed_teacher.py` (step 6) — it does it correctly.

---

### 1. Create the project
- Go to https://supabase.com → **New project**. Pick a name + database password.
- Wait until it finishes provisioning (the dashboard stops showing "Setting up…").

### 2. Get your keys
- **Project Settings → API**, copy these three:
  - **Project URL** (e.g. `https://abcd1234.supabase.co`)
  - **anon public** key
  - **service_role** key (secret)

### 3. Create the tables
- Left sidebar → **SQL Editor** → **New query**.
- Open `backend/schema.sql`, copy the **entire** file, paste, click **Run**.
- It should say "Success. No rows returned." (Don't run `rls_policies.sql` too — `schema.sql` already includes the policies.)

### 4. Put your keys in the app
- Edit **`backend/.env`**:
  ```env
  SUPABASE_URL=https://YOUR-PROJECT.supabase.co
  SUPABASE_KEY=YOUR_ANON_KEY
  SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY
  ```
- Edit **`frontend/.env.local`**:
  ```env
  VITE_API_URL=http://localhost:8001/api
  VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
  VITE_SUPABASE_KEY=YOUR_ANON_KEY
  ```

### 5. Install dependencies (first time only)
```bash
cd backend
pip install -r requirements.txt      # or:  py -m pip install -r requirements.txt

cd ../frontend
npm install
```

### 6. Create the teacher login (the RIGHT way — not SQL)
```bash
cd ../backend
py seed_teacher.py
```
This creates **admin@udaya.com / Admin1234**. (To use your own:
`py seed_teacher.py --email you@x.com --password YourPass123 --name "Your Name"`)

### 7. Start both servers
- Terminal 1:
  ```bash
  cd backend
  py -m uvicorn main:app --reload --port 8001
  ```
  Check http://localhost:8001/api/health → must say `{"status":"ok","database":"connected"}`
- Terminal 2:
  ```bash
  cd frontend
  npm run dev
  ```
  Open the printed URL (http://localhost:3001).

### 8. Log in
- **admin@udaya.com / Admin1234** → Teacher portal.
- Create students from inside the teacher portal (not by SQL). Students log in
  with the email or phone you give them.

---

## If you see "Database error querying schema" on login
You created a user with SQL. Fix it: run **`backend/fix_auth_users_nulls.sql`**
in the SQL Editor, then log in again. If it still fails, delete the user in
**Authentication → Users** and re-run `py seed_teacher.py`.

## Even simpler: skip your own project
You don't actually need your own Supabase. The repo's committed `.env` files
already point at the shared project — just `git pull`, do steps 5 + 7, and log
in. Make your own project only if you want a separate, private database.
