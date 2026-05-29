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
| Auth | Supabase Auth (JWT) |
| Database | PostgreSQL via Supabase |
| Styling | Tailwind CSS 3, Inter font |
| Video | Cloudflare Stream & YouTube Unlisted |
| Live Classes| Zoom Server-to-Server OAuth |

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

1. **Frontend** — Custom login UI posts to backend `/api/auth/login`
2. **Backend** — Authenticates via Supabase Auth, returns JWT token + user data
3. **Routing** — `/teacher/*` or `/student/*` based on role in user data

## Key files

- `backend/main.py` — All FastAPI routes, endpoints, and WS manager
- `frontend/src/store.js` — Zustand state management
- `backend/schema.sql` — Supabase PostgreSQL DDL

## Environment setup

**Frontend** (`frontend/.env.local`):
```
VITE_API_URL=http://localhost:8001/api
```

**Backend** (`backend/.env`):
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_STREAM_API_TOKEN=
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_SDK_KEY=
ZOOM_SDK_SECRET=
ZOOM_WEBHOOK_SECRET_TOKEN=
```

## PLAN.md (`/PLAN.md`)

Full implementation plan (note: uses Supabase for DB, current implementation uses FastAPI for API + Clerk for auth).