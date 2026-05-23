# Tutoria LMS — AGENTS.md

## Project state

This repo contains **two artifacts**:

- **`lms-v3_9.jsx`** — Monolithic UI prototype (2951 lines). Design reference.
- **`frontend/`** — Active Vite 5 + React 18 frontend.
- **`backend/`** — FastAPI Python backend with Clerk auth.

## Current stack

| Layer | Technology |
|-------|------------|
| Frontend | Vite 5 + React 18 + React Router 6 + Zustand |
| Backend | FastAPI (Python) |
| Auth | Clerk (frontend + backend verification) |
| Styling | Tailwind CSS 3, Inter font |

## Running the app

```bash
# Terminal 1: Backend
cd backend
python main.py
# Runs on http://localhost:8000

# Terminal 2: Frontend
cd frontend
npm run dev
# Runs on http://localhost:5173
```

## Auth flow

1. **Frontend** — Clerk handles login UI, gets JWT token
2. **Backend** — Verifies token via Clerk API, returns user with role
3. **Routing** — `/teacher/*` or `/student/*` based on backend response

## Key files

- `tutoria/src/lib/auth.js` — Auth store with backend verification
- `tutoria/src/lib/api.js` — API client for backend calls
- `backend/main.py` — FastAPI with Clerk token verification

## Environment setup

**Frontend** (`tutoria/.env.local`):
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxx
VITE_API_URL=http://localhost:8000/api
```

**Backend** (`backend/.env`):
```
CLERK_SECRET_KEY=sk_test_xxx
CLERK_JWT_KEY=
```

## Clerk setup

1. Go to clerk.com → Your App → API Keys
2. Copy publishable key → frontend `.env.local`
3. Copy secret key → backend `.env`
4. In Clerk Dashboard → Users → Select user → Metadata → Set `{"role": "teacher"}` or `{"role": "student"}`

## PLAN.md (`/PLAN.md`)

Full implementation plan (note: uses Supabase for DB, current implementation uses FastAPI for API + Clerk for auth).