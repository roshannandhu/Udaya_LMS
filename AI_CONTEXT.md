# Tutoria LMS — AI Development Context

> Read this file at the start of every AI-assisted development session.
> These rules prevent the most common mistakes that break this codebase.

---

## The Stack (Exact)

| What | Reality | Common Mistake to Avoid |
|---|---|---|
| Frontend language | **JavaScript (JSX)** | Do NOT write TypeScript or add `.ts`/`.tsx` files |
| Backend ORM | **Supabase Python client** | Do NOT use SQLAlchemy (in requirements.txt but UNUSED) |
| Auth system | **Supabase JWT** via `supabase.auth.get_user(token)` | Do NOT decode JWT manually with python-jose |
| HTTP client | **native `fetch` via `apiClient`** | Do NOT install or use axios |
| Auth library | **Zustand `useAuthStore`** | Do NOT use `@clerk/clerk-react` (installed but unused) |
| CSS framework | **Tailwind CSS** | Do NOT write inline CSS or CSS modules |
| Icon library | **lucide-react** | Do NOT use react-icons, heroicons, or other icon libraries |
| State | **Zustand (3 stores)** | Do NOT install react-query, SWR, or Redux |

---

## Before Writing Any Code

### 1. Check if it already exists

**Endpoints:** Read `API_REFERENCE.md` — all 70+ endpoints are documented. 90% of what you need is already built.

**Components:** Read `ARCHITECTURE.md` folder structure. Key reusable components:
- `components/ui.jsx` — `Btn`, `Input`, `Textarea`, `Modal`, `Toggle`, `Divider`, `Avatar`, `Tag`, `Select`, `Skeleton`, `SectionHeader`
- `components/teacher/AttendanceGrid.jsx` — full attendance grid
- `components/teacher/BulkImportModal.jsx` — bulk student import
- `components/teacher/BroadcastThread.jsx` — real-time chat UI
- `components/teacher/NewTestModal.jsx` — test creation

**Pages:** Every teacher and student page is already built. See `ARCHITECTURE.md` for the full list.

**API helpers:** `src/lib/api.js` exports `attendanceApi`, `testApi`, `videoApi`, `leaderboardApi` alongside `apiClient`.

### 2. Check if the DB table exists

Read `DATABASE.md`. All 17 tables are documented. Do NOT create duplicate tables.

If adding a new column: add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to `backend/schema.sql`.

### 3. Check `FEATURES_STATUS.md`

Shows exactly what's done and what's pending. Don't build something that's ✅.

---

## Inviolable Rules

### API
- **Never change a response shape** without updating all frontend consumers.
- **Never remove a field** from a response — old frontend code may depend on it.
- **Always add new endpoints** to `API_REFERENCE.md`.
- **Always verify ownership** on PATCH/DELETE — check `teacher_id` or `created_by` matches `user["user_id"]`.
- **HTTPException must propagate** — use `except HTTPException: raise` before outer `except Exception` blocks.

### Database
- **`students.id` = `auth.users.id`** — always set explicitly, never auto-generate.
- **`correct_idx` never reaches students** — strip it from every question response for student role.
- **Use `service_supabase`** for all data operations in FastAPI. Never use the anon `supabase` client for DB writes.
- **New tables need RLS** — add `ENABLE ROW LEVEL SECURITY` + `deny_anon_*` policies.

### Frontend
- **No spinners on page mount** — data hydrates from `useAppCache` instantly. Add spinners only for user-triggered actions.
- **Call `cache.invalidate()` or `cache.invalidateStudents()` after mutations** — so the Zustand cache reflects new data.
- **Use `glass-panel` for cards** — not ad-hoc Tailwind bg/border combinations.
- **Use `glass-nav` for sticky headers** — not inline styles.
- **No new localStorage keys** without documenting them in `ARCHITECTURE.md`.

### Auth / Security
- **WebSocket token in query param** — `?token=<jwt>`. Browsers can't set headers for WS connections.
- **Blocked students** — `POST /auth/login` checks `students.blocked` and returns 403.
- **`must_change_pwd`** — `ProtectedStudentRoute` redirects to `/student/change-password` if true. Never bypass this.
- **Secrets never in frontend** — `SUPABASE_SERVICE_KEY` and `CLOUDFLARE_STREAM_API_TOKEN` are backend-only.

---

## Common Patterns to Reuse

### Adding a new teacher-only endpoint
```python
@app.post("/api/new-feature")
async def new_feature(req: NewFeatureRequest, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        # ... your logic using service_supabase
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Adding a new frontend page
1. Create `frontend/src/pages/teacher/NewPage.jsx` or `frontend/src/pages/student/NewPage.jsx`
2. Import and add a `<Route>` in `frontend/src/App.jsx`
3. Follow glassmorphism pattern: `glass-panel`, `glass-nav`
4. Use shared primitives from `components/ui.jsx`
5. Fetch data with `apiClient(...)` — NOT raw `fetch`

### Fetching data in a component
```jsx
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  apiClient('/some-endpoint')
    .then(d => setData(d || []))
    .catch(console.error)
    .finally(() => setLoading(false));
}, []);
```

### After a mutation (create/update/delete)
```jsx
// Invalidate cache so other pages see fresh data
const { invalidate, invalidateStudents } = useAppCache();
invalidateStudents(); // or invalidate() for all
```

---

## What's Genuinely Missing (Safe to Build)

See `PLAN.md` Pending section for the full list. Short version:
- Push notifications (`/api/notifications` endpoint)
- Student profile photo upload
- Test scheduling (column exists, UI not wired)
- Broadcast scheduling (column exists, UI not wired)
- Read receipts UI (table exists)
- PDF export (jspdf installed, not wired in ReportsPage)

---

## Known Tech Debt

| Issue | File | Notes |
|---|---|---|
| `broadcasts.json` file-based history | `backend/main.py` ConnectionManager | Breaks on multi-instance deploy |
| All backend routes in one file | `backend/main.py` (~2250 lines) | Should split into `/routers/` eventually |
| Video upload blocks server thread | `POST /api/videos/upload` | Large files can timeout — future: pre-signed upload |
| `data.js` unused mock file | `frontend/src/data.js` | Safe to delete; no page imports it |
| SQLAlchemy in requirements.txt | `backend/requirements.txt` | Unused — don't add SQLAlchemy code |
| `@clerk/clerk-react` in package.json | `frontend/package.json` | Unused — don't use Clerk |

---

## Deployment Checklist

Before deploying to production:
1. Update CORS origins in `main.py` (currently only allows localhost)
2. Set all env vars on the server (SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY, CLOUDFLARE_*)
3. Run `frontend/npm run build` → serve `frontend/dist/` statically
4. Run backend with `uvicorn main:app --host 0.0.0.0 --port 8001` (not `--reload`)
5. Update `VITE_API_URL` in frontend to production backend URL
6. Run `backend/schema.sql` in Supabase SQL Editor if tables don't exist
