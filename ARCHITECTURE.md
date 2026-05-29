# Tutoria LMS — Architecture Reference

## Stack (Exact, No Hallucinations)

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Frontend framework | React | 18.3.1 | Plain JSX — NOT TypeScript |
| Frontend build | Vite | 5.2.0 | Port 3001 in dev |
| Routing | React Router DOM | 6.22.3 | |
| State management | Zustand | 4.5.2 | 3 stores — see below |
| Styling | Tailwind CSS | 3.4.3 | Heavy glassmorphism |
| Icons | lucide-react | 0.344.0 | |
| Charts | recharts | 3.8.1 | Used in ReportsPage |
| PDF export | jspdf + jspdf-autotable | 4.2.1 / 5.0.8 | Installed, not yet wired |
| Excel | xlsx (SheetJS) | 0.18.5 | Bulk import + credential export |
| CSV | papaparse | 5.5.3 | CSV parsing in bulk import |
| DOCX | mammoth | 1.12.0 | DOCX parsing in bulk import |
| Backend | FastAPI | 0.109.2 | Single file: `backend/main.py` |
| Backend runtime | Uvicorn | 0.27.1 | Port 8001 in dev |
| Python validation | Pydantic | 2.6.1 | Request body models |
| Database client | supabase-py | 2.3.4 | REST-based, NOT raw SQL |
| Database | PostgreSQL | (Supabase managed) | |
| Auth | Supabase Auth | (via supabase-py) | JWT issued by Supabase |
| Video hosting | Cloudflare Stream | — | Upload + playback |
| File storage | Supabase Storage | — | Broadcast attachments, avatars |
| SQLAlchemy | 2.0.25 | **IN requirements.txt BUT NOT USED** | Do not add SQLAlchemy code |
| @clerk/clerk-react | 5.61.6 | **IN package.json BUT NOT USED** | Do not use Clerk |

---

## Project Root Layout

```
E:\IMP projects\Udaya\
├── backend/
│   ├── main.py              ← ALL FastAPI routes + Pydantic models (~2250 lines)
│   ├── schema.sql           ← Complete PostgreSQL DDL — run in Supabase SQL Editor
│   ├── broadcasts.json      ← WebSocket broadcast history (file-based fallback)
│   ├── .env                 ← Secrets (never commit)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── shared/      TopBar.jsx, BottomNav.jsx, Sidebar.jsx, SearchPalette.jsx
│   │   │   ├── teacher/     AttendanceGrid.jsx, AttendanceTab.jsx, BroadcastThread.jsx
│   │   │   │                BulkImportModal.jsx, Modals.jsx, NewTestModal.jsx
│   │   │   │                StudentReportModal.jsx, TestResultsSheet.jsx
│   │   │   │                AttendanceStudentCard.jsx
│   │   │   └── ui.jsx       Btn, Input, Textarea, Modal, Toggle, Divider, Avatar,
│   │   │                    Tag, Select, Skeleton, SectionHeader — ALL shared primitives
│   │   ├── lib/
│   │   │   ├── api.js        apiClient() + attendanceApi + testApi + videoApi + leaderboardApi
│   │   │   ├── auth.js       useAuthStore (Zustand)
│   │   │   ├── bulkImport.js parseImportFile() — CSV/XLSX/DOCX student parser
│   │   │   └── offlineVideos.js Cache API wrapper for offline video storage
│   │   ├── pages/
│   │   │   ├── teacher/
│   │   │   │   ├── TodayPage.jsx            Dashboard — stats + activity
│   │   │   │   ├── SubjectsPage.jsx         Standards grid
│   │   │   │   ├── StandardDetailPage.jsx   Students + subjects tabs per standard
│   │   │   │   ├── SubjectDetailPage.jsx    Videos + tests + attendance per subject
│   │   │   │   ├── StudentsPage.jsx         All students across all standards
│   │   │   │   ├── StudentDetailPage.jsx    Single student profile + reports
│   │   │   │   ├── BroadcastsPage.jsx       Standard selector + BroadcastThread
│   │   │   │   ├── TestsPage.jsx            Tests list + NewTestModal
│   │   │   │   ├── ReportsPage.jsx          Attendance reports + CSV export
│   │   │   │   ├── RemindersPage.jsx        Personal reminders
│   │   │   │   ├── SettingsPage.jsx         Default password + notifications + security
│   │   │   │   ├── AttendancePage.jsx       Attendance grid entry point
│   │   │   │   ├── MorePage.jsx             Profile + nav to settings/reports
│   │   │   │   └── TeacherLayout.jsx        Sidebar + outlet
│   │   │   └── student/
│   │   │       ├── StudentHomePage.jsx
│   │   │       ├── StudentSubjectsPage.jsx
│   │   │       ├── StudentSubjectViewPage.jsx   Video list per subject
│   │   │       ├── StudentVideoPlayerPage.jsx   Video player + offline download
│   │   │       ├── StudentTestsPage.jsx
│   │   │       ├── StudentTestTakingPage.jsx    Anti-cheat + timer
│   │   │       ├── StudentTestResultPage.jsx
│   │   │       ├── StudentBroadcastsPage.jsx    Real-time WebSocket broadcasts
│   │   │       ├── StudentProfilePage.jsx
│   │   │       ├── StudentChangePasswordPage.jsx
│   │   │       ├── StudentLeaderboardPage.jsx
│   │   │       └── StudentLayout.jsx            Bottom tab bar + outlet
│   │   ├── App.jsx          Router + ProtectedTeacherRoute + ProtectedStudentRoute + AuthHandler
│   │   ├── store.js         useAppCache + useStore + useSettingsStore
│   │   ├── data.js          Legacy mock data file — NOT imported by any page (safe to ignore)
│   │   └── main.jsx
│   ├── public/
│   ├── .env.local           VITE_API_URL=http://localhost:8001/api
│   └── package.json
├── PLAN.md
├── ARCHITECTURE.md          ← This file
├── API_REFERENCE.md
├── DATABASE.md
├── AI_CONTEXT.md
├── FEATURES_STATUS.md
├── CHANGELOG.md
├── SYSTEM_ARCHITECTURE.md   (comprehensive version — kept for reference)
└── CLAUDE.md                (Claude Code project rules)
```

---

## Authentication Architecture

### Token Flow
```
Client → POST /api/auth/login { email_or_username, password, device_fingerprint }
Backend → supabase.auth.sign_in_with_password({ email, password })
        → returns Supabase JWT
Backend → upserts student_sessions for student role (device enforcement)
Backend → returns { token: <supabase_jwt>, user: { id, name, role, email, username, must_change_pwd } }
Client → stores token in localStorage as "tutoria_token"
Client → stores role in localStorage as "tutoria_user_role"

All subsequent requests → Authorization: Bearer <token>
Backend verify_token() → supabase.auth.get_user(token)
                       → returns { user_id, role, email }
```

### Key Auth Files
- `backend/main.py` — `verify_token(authorization: str = Header(...))` FastAPI dependency
- `frontend/src/lib/auth.js` — `useAuthStore` (Zustand, not persisted — uses raw localStorage)
- `frontend/src/App.jsx` — `AuthHandler`, `ProtectedTeacherRoute`, `ProtectedStudentRoute`

### Single-Device Enforcement
- Login upserts `student_sessions(student_id, device_fingerprint)` — one row per student
- `ProtectedStudentRoute` calls `enforceSingleDevice()` on mount
- `enforceSingleDevice()` → `POST /api/auth/verify-device { device_fingerprint }`
- Backend compares fingerprint to `student_sessions` — returns `{ allowed: bool }`
- If `allowed: false` → client calls `clearAuth()` and redirects to login

### Force Password Change
- New students have `must_change_pwd = true` in `students` table
- `ProtectedStudentRoute` redirects to `/student/change-password` if `user.must_change_pwd`
- `POST /api/auth/change-password` clears the flag in Supabase auth + students table

---

## State Management (3 Zustand Stores)

### `useAuthStore` — `src/lib/auth.js`
NOT persisted via Zustand middleware. Uses raw `localStorage` directly.
```
user, role, isLoading, deviceFingerprint
login(identifier, password)
logout / clearAuth()
verifyWithBackend()
enforceSingleDevice(userId)
changePassword(newPassword)
getToken()
```

### `useAppCache` — `src/store.js`
Persisted to `localStorage` key `tutoria-app-cache`. 2-minute TTL.
```
standards[], subjects[], students[]        ← cached arrays
prefetchAll()                              ← parallel fetch on app start
refreshStandards/Subjects/Students()       ← individual refreshers
getSubjectsFor(stdId)                      ← filtered selector
getStudentsFor(stdId)                      ← filtered selector
invalidate()                               ← clear all TTLs (call after mutations)
invalidateStudents()                       ← clear only students TTL
```

### `useSettingsStore` — `src/store.js`
Persisted to `localStorage` key `tutoria-settings`.
```
defaultStudentPassword: ''
setDefaultStudentPassword(pwd)
```
Used by: BulkImportModal (parseImportFile), StandardDetailPage (AddStudentModal pre-fill).

### `useStore` — `src/store.js`
NOT persisted. In-memory broadcast cache.
```
broadcastsByStandard: {}
updateBroadcasts(standardId, updaterFn)
```

---

## API Client Pattern

`src/lib/api.js` exports:
- `apiClient(endpoint, options)` — base fetch wrapper, reads token from localStorage
- `attendanceApi` — named methods for attendance endpoints
- `testApi` — named methods for test endpoints
- `videoApi` — named methods for video endpoints
- `leaderboardApi` — named methods for leaderboard

**Never use `axios`** — the project uses native `fetch` via `apiClient`.

---

## Backend Architecture

Single file: `backend/main.py` (~2250 lines)

Sections in order:
1. Imports + CORS setup
2. Supabase client initialization (`supabase` + `service_supabase`)
3. Pydantic models (request body schemas)
4. WebSocket `ConnectionManager` class
5. `verify_token` dependency
6. All route handlers

**Two Supabase clients:**
- `supabase` — anon key, used for auth operations
- `service_supabase` — service role key, **bypasses RLS**, used for all data operations

**DB pattern** (PostgREST via supabase-py, NOT raw SQL):
```python
service_supabase.table("students").select("*").eq("standard_id", sid).execute()
service_supabase.table("students").insert({...}).execute()
service_supabase.table("students").update({...}).eq("id", uid).execute()
service_supabase.table("students").delete().eq("id", uid).execute()
```

---

## Broadcast / WebSocket Architecture

```
Teacher sends → POST /api/broadcasts
             → saves to broadcasts DB table
             → appends to broadcasts.json (file fallback)
             → broadcasts via ConnectionManager to all WS clients in that standard

Student connects → WS /api/ws/broadcasts/{standard_id}?token=<jwt>
                → token validated on connect (closes 4001 if invalid)
                → receives full history on connect
                → receives real-time messages as teacher sends

ConnectionManager → Dict[standard_id → List[WebSocket]]
                 → load_history() reads broadcasts.json on startup
```

⚠️ `broadcasts.json` is a file on the server — breaks with multiple server instances.

---

## Video Architecture

```
Upload: POST /api/videos/upload (multipart)
      → FastAPI streams to Cloudflare Stream API
      → stores { cloudflare_video_id, duration_secs, source_type='upload' } in videos table
      → requires CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_STREAM_API_TOKEN in .env

YouTube: POST /api/videos/youtube
      → stores { youtube_video_id, youtube_url, source_type='youtube' } in videos table

Playback: Cloudflare Stream embed, native `<video>`, or custom YouTube IFrame player
        → Student watches via StudentVideoPlayerPage
        → YouTube uses `/api/videos/{id}/token` to retrieve the video ID
        → Custom transparent overlay prevents URL copy for YouTube videos
        → Progress saved via POST /api/videos/{id}/complete

Offline: src/lib/offlineVideos.js
       → downloads from videodelivery.net/{cloudflare_video_id}/downloads/default.mp4 (or Supabase URL)
       → stores in browser Cache API (not IndexedDB)
       → isVideoSaved(), saveVideoOffline(), removeVideoOffline(), getCachedVideoBlobUrl()
```

---

## Live Class Architecture

```
Schedule: POST /api/live-classes
        → Generates Zoom meeting via S2S OAuth API
        → Saves zoom_meeting_id, zoom_join_url, zoom_start_url to DB

Join (Student): GET /api/live-classes/{id}/join-token
              → Generates HMAC-SHA256 signature
              → Student joins directly in browser using Zoom Web SDK
              → URL is never exposed

End & Attendance: POST /api/live-classes/{id}/end
                → Queries Zoom participant report API
                → Calculates duration and saves to `live_class_attendance`
                → Marks class as 'ended'
```

---

## Design System

All UI uses glassmorphism. Key Tailwind patterns:
- **Card/panel:** `glass-panel` CSS class (defined in index.css) = `bg-white/40 backdrop-blur-2xl border border-white/60 shadow-sm`
- **Sticky header:** `glass-nav` CSS class
- **Background:** `#FAFAF9`
- **Borders:** `#EBEAE7` / `border-white/60`
- **No gradients on surfaces**
- **All icons:** lucide-react only

Shared primitives in `components/ui.jsx`: `Btn`, `Input`, `Textarea`, `Modal`, `Toggle`, `Divider`, `Avatar`, `Tag`, `Select`, `Skeleton`, `SectionHeader`

---

## CORS

Currently allows: `http://localhost:5173`, `http://localhost:3001`, `http://127.0.0.1:3001`
**Must update before production deployment.**

---

## Environment Variables

### `backend/.env`
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJ...           # anon key
SUPABASE_SERVICE_KEY=eyJ...   # service role key — bypasses RLS
CLOUDFLARE_ACCOUNT_ID=        # required for video upload
CLOUDFLARE_STREAM_API_TOKEN=  # required for video upload
ZOOM_ACCOUNT_ID=              # required for Zoom S2S OAuth
ZOOM_CLIENT_ID=               # required for Zoom S2S OAuth
ZOOM_CLIENT_SECRET=           # required for Zoom S2S OAuth
ZOOM_SDK_KEY=                 # required for Zoom Web SDK
ZOOM_SDK_SECRET=              # required for Zoom Web SDK
ZOOM_WEBHOOK_SECRET_TOKEN=    # required for Zoom Webhooks
```

### `frontend/.env.local`
```
VITE_API_URL=http://localhost:8001/api
```

---

## Development Commands

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
# Swagger: http://localhost:8001/docs

# Frontend
cd frontend
npm install
npm run dev      # → http://localhost:3001
npm run build    # → frontend/dist/
```
