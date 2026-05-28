# PLAN_2.md — Phase-by-Phase Implementation Prompts
## For OpenCode + DeepSeek v4 Flash

> **How to use:** Paste each phase prompt completely into OpenCode as one message.
> Run phases IN ORDER. Do NOT skip phases. Each phase depends on the previous.
> After each phase, verify the checklist at the bottom of that phase before proceeding.

---

## Overview of All Phases

| Phase | What it builds | Prerequisite |
|-------|----------------|-------------|
| 1 | SQL database migrations | None — run in Supabase SQL Editor |
| 2 | Backend: YouTube video endpoints | Phase 1 done |
| 3 | Backend: Live class endpoints + Zoom helpers | Phase 2 done |
| 4 | Frontend: VideoAddModal (two-tab: YouTube + Upload) | Phase 2 done |
| 5 | Frontend: Student video thumbnail card grid | Phase 2 done |
| 6 | Frontend: Student YouTube video player | Phase 2 done |
| 7 | Frontend: Bottom nav Live button (both portals) | None |
| 8 | Frontend: Teacher Live Classes page | Phase 3 + Phase 7 done |
| 9 | Frontend: Student Live Classes page | Phase 3 + Phase 7 done |
| 10 | Frontend: ZoomMeetingView component (shared) | Phase 3 done |

---

---

# PHASE 1 — SQL Database Migrations

> Paste this entire block into OpenCode as one message.

```
You are working on the Tutoria LMS project.
Stack: React 18 + Vite frontend, FastAPI Python backend, Supabase (Postgres) database.

TASK: Run ONLY the SQL below in the Supabase SQL Editor.
Do NOT write any application code yet.
After running, confirm with the verification queries at the bottom.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MIGRATION 1 — Extend videos table for YouTube support
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'upload'
    CHECK (source_type IN ('upload', 'youtube'));

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS youtube_video_id TEXT,
  ADD COLUMN IF NOT EXISTS youtube_url TEXT;

-- storage_path becomes optional (YouTube videos have no storage path)
ALTER TABLE videos ALTER COLUMN storage_path DROP NOT NULL;

-- Backfill existing rows so source_type is never NULL
UPDATE videos SET source_type = 'upload' WHERE source_type IS NULL;

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MIGRATION 2 — Create live_classes table
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS live_classes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        UUID NOT NULL REFERENCES subject_classes(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  duration_mins   INTEGER NOT NULL DEFAULT 60,
  zoom_meeting_id TEXT,
  zoom_join_url   TEXT,
  zoom_start_url  TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_classes_class_id   ON live_classes(class_id);
CREATE INDEX IF NOT EXISTS idx_live_classes_status     ON live_classes(status);
CREATE INDEX IF NOT EXISTS idx_live_classes_scheduled  ON live_classes(scheduled_at);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MIGRATION 3 — Create live_class_attendance table
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS live_class_attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_class_id   UUID NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ,
  left_at         TIMESTAMPTZ,
  duration_mins   INTEGER,
  attended        BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (live_class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_lca_live_class ON live_class_attendance(live_class_id);
CREATE INDEX IF NOT EXISTS idx_lca_student    ON live_class_attendance(student_id);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MIGRATION 4 — Row Level Security (deny all direct access)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE live_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_class_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_live_classes" ON live_classes;
DROP POLICY IF EXISTS "deny_all_lca" ON live_class_attendance;

CREATE POLICY "deny_all_live_classes" ON live_classes FOR ALL USING (false);
CREATE POLICY "deny_all_lca" ON live_class_attendance FOR ALL USING (false);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION — Run and confirm output matches expected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. Check videos columns (expect 4 rows)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'videos'
  AND column_name IN ('source_type','youtube_video_id','youtube_url','storage_path')
ORDER BY column_name;

-- 2. Check new tables exist (expect 2 rows)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('live_classes','live_class_attendance');

-- 3. Confirm RLS enabled (expect rowsecurity=true for both)
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('live_classes','live_class_attendance');

Once all 3 queries return expected results, reply "Phase 1 complete" and stop.
Do NOT write any code.
```

### Phase 1 checklist before proceeding
- [ ] `source_type`, `youtube_video_id`, `youtube_url` columns exist on videos table
- [ ] `storage_path` is now nullable
- [ ] `live_classes` table created with all columns
- [ ] `live_class_attendance` table created with all columns
- [ ] RLS enabled on both new tables

---

---

# PHASE 2 — Backend: YouTube Video Endpoints

> Paste this entire block into OpenCode as one message.
> Phase 1 must be complete before this phase.

```
You are working on the Tutoria LMS project.
File to edit: backend/main.py (single file, ~2250 lines, all FastAPI routes).

CONTEXT:
- verify_token() is a FastAPI dependency at ~line 271 that returns a dict with:
  id, user_id, role ('teacher'|'student'), standard_id (students only), name
- service_supabase is the Supabase service_role client (bypasses RLS) — use for ALL DB queries
- All video endpoints are around lines 1117-1397 in main.py
- The Video Pydantic model is around line 119
- Videos table now has: source_type, youtube_video_id, youtube_url, storage_path (nullable)

TASK: Add 3 new video-related endpoints to backend/main.py and update one existing endpoint.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2-A: Add YouTubeVideo Pydantic model
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find the Video and VideoUpdate Pydantic models (~line 119-131).
Add this NEW model immediately after VideoUpdate:

class YouTubeVideo(BaseModel):
    class_id: str
    title: str
    description: Optional[str] = None
    youtube_video_id: str
    youtube_url: str

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2-B: Update GET /api/videos to strip youtube_video_id
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find the get_videos() function (GET /api/videos, ~line 1117).
Before the return statement, add this loop to strip sensitive YouTube fields
from EVERY video in the response (both teacher and student paths):

    # Strip YouTube ID from client response — it is only returned via /token endpoint
    for v in videos_data:
        v.pop('youtube_video_id', None)
        v.pop('youtube_url', None)

Apply this stripping in ALL return paths of the function (there may be separate
branches for teacher role and student role — strip from both).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2-C: Add POST /api/videos/youtube endpoint
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add this endpoint BEFORE the existing POST /api/videos endpoint (to avoid route conflict):

@app.post("/api/videos/youtube")
async def create_youtube_video(video: YouTubeVideo, user=Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    # Verify the subject class belongs to this teacher's standard
    class_check = service_supabase.table("subject_classes") \
        .select("id, standard_id").eq("id", video.class_id).single().execute()
    if not class_check.data:
        raise HTTPException(status_code=404, detail="Subject not found")

    std_check = service_supabase.table("standards") \
        .select("id") \
        .eq("id", class_check.data["standard_id"]) \
        .eq("teacher_id", user["user_id"]) \
        .single().execute()
    if not std_check.data:
        raise HTTPException(status_code=403, detail="Not your standard")

    insert_data = {
        "class_id": video.class_id,
        "title": video.title,
        "description": video.description,
        "source_type": "youtube",
        "youtube_video_id": video.youtube_video_id,
        "youtube_url": video.youtube_url,
        "allow_download": False,
        "created_by": user["user_id"],
    }
    result = service_supabase.table("videos").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create video")

    created = result.data[0]
    # Strip before returning
    created.pop("youtube_video_id", None)
    created.pop("youtube_url", None)
    return created

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2-D: Add GET /api/videos/{video_id}/token endpoint
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECURITY NOTE: This endpoint is the ONLY place youtube_video_id is ever sent
to the browser. It is renamed 'token' in the response so it is not obvious.
It verifies standard enrollment before returning.

Add this after the existing video endpoints:

@app.get("/api/videos/{video_id}/token")
async def get_video_token(video_id: str, user=Depends(verify_token)):
    # Fetch video including the sensitive field
    video_result = service_supabase.table("videos") \
        .select("id, source_type, youtube_video_id, class_id, title") \
        .eq("id", video_id).single().execute()

    if not video_result.data:
        raise HTTPException(status_code=404, detail="Video not found")

    video = video_result.data

    if video.get("source_type") != "youtube":
        raise HTTPException(status_code=400, detail="Not a YouTube video")

    # Get standard_id for this subject class
    class_result = service_supabase.table("subject_classes") \
        .select("standard_id").eq("id", video["class_id"]).single().execute()
    if not class_result.data:
        raise HTTPException(status_code=404, detail="Subject not found")

    required_standard_id = class_result.data["standard_id"]

    if user["role"] == "teacher":
        # Teacher must own the standard
        std_check = service_supabase.table("standards") \
            .select("id") \
            .eq("id", required_standard_id) \
            .eq("teacher_id", user["user_id"]) \
            .single().execute()
        if not std_check.data:
            raise HTTPException(status_code=403, detail="Not your class")
    else:
        # Student must be in the correct standard and not blocked
        if not user.get("standard_id"):
            raise HTTPException(status_code=403, detail="No standard assigned")
        if user["standard_id"] != required_standard_id:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")
        student_check = service_supabase.table("students") \
            .select("blocked").eq("id", user["user_id"]).single().execute()
        if not student_check.data or student_check.data.get("blocked"):
            raise HTTPException(status_code=403, detail="Account blocked")

    # Return token (deliberately NOT named youtube_video_id)
    return {
        "token": video["youtube_video_id"],
        "source_type": video["source_type"],
        "title": video["title"],
    }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2-E: Add GET /api/videos/{video_id}/thumbnail endpoint
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add this endpoint immediately after the token endpoint:

@app.get("/api/videos/{video_id}/thumbnail")
async def get_video_thumbnail(video_id: str, user=Depends(verify_token)):
    video_result = service_supabase.table("videos") \
        .select("id, source_type, youtube_video_id, class_id") \
        .eq("id", video_id).single().execute()

    if not video_result.data:
        raise HTTPException(status_code=404, detail="Video not found")

    video = video_result.data

    if video.get("source_type") != "youtube":
        return {"thumbnail_url": None, "source_type": "upload"}

    # Verify access (lighter check — thumbnail URL itself is public knowledge)
    class_result = service_supabase.table("subject_classes") \
        .select("standard_id").eq("id", video["class_id"]).single().execute()
    if class_result.data and user["role"] == "student":
        if user.get("standard_id") != class_result.data["standard_id"]:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")

    yt_id = video["youtube_video_id"]
    return {
        "thumbnail_url": f"https://img.youtube.com/vi/{yt_id}/mqdefault.jpg",
        "source_type": "youtube",
    }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2-F: Update delete_video to handle YouTube (no storage path)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find the delete_video function (~line 1349).
It likely has code that tries to delete from Cloudflare or Supabase Storage.
Update the storage deletion logic to skip when storage_path is None:

  # Existing pattern — wrap with None check:
  storage_path = video_data.get("storage_path")
  cf_id = video_data.get("cloudflare_video_id")

  if cf_id and not str(cf_id).startswith("https://"):
      # Cloudflare Stream deletion (existing code, unchanged)
      pass
  elif storage_path:
      # Supabase Storage deletion (existing code, unchanged)
      await asyncio.to_thread(
          lambda: service_supabase.storage.from_("videos").remove([storage_path])
      )
  # If source_type == 'youtube': neither branch runs — only DB row deleted

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2-G: Add YouTube methods to videoApi in frontend/src/lib/api.js
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE: frontend/src/lib/api.js

Find the videoApi object. Add these three methods:

  createYouTube: (data) =>
    apiClient('/videos/youtube', { method: 'POST', body: JSON.stringify(data) }),

  getToken: (videoId) =>
    apiClient(`/videos/${videoId}/token`),

  getThumbnail: (videoId) =>
    apiClient(`/videos/${videoId}/thumbnail`),

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION FOR PHASE 2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Restart backend: uvicorn main:app --reload --port 8001
2. Open http://localhost:8001/docs
3. Confirm these endpoints are listed:
   - POST /api/videos/youtube
   - GET  /api/videos/{video_id}/token
   - GET  /api/videos/{video_id}/thumbnail
4. In docs, test GET /api/videos?class_id=<any_id> with teacher token
   → Confirm response does NOT contain 'youtube_video_id' field in any row
5. Test GET /api/videos/{any_id}/token with a student token from a different standard
   → Should return 403

Reply "Phase 2 complete" when all verifications pass.
```

### Phase 2 checklist before proceeding
- [ ] `POST /api/videos/youtube` endpoint exists and returns 200 on valid input
- [ ] `GET /api/videos/{id}/token` returns 403 for wrong-standard students
- [ ] `GET /api/videos/{id}/thumbnail` returns `thumbnail_url` for YouTube videos
- [ ] `GET /api/videos` response never contains `youtube_video_id` field
- [ ] `videoApi.createYouTube`, `videoApi.getToken`, `videoApi.getThumbnail` added to api.js

---

---

# PHASE 3 — Backend: Zoom Helpers + Live Class Endpoints

> Paste this entire block into OpenCode as one message.
> Phase 1 must be complete before this phase.

```
You are working on the Tutoria LMS project.
File to edit: backend/main.py (single FastAPI file).

TASK: Add Zoom integration helpers and 6 new live class API endpoints.

ZOOM SETUP REQUIRED FIRST (one-time, done by developer):
  1. Go to marketplace.zoom.us → Develop → Build App → Server-to-Server OAuth
  2. Create app → copy Account ID, Client ID, Client Secret
  3. Scopes: meeting:write:admin, meeting:read:admin, report:read:admin
  4. Build a second app → SDK App → copy SDK Key + SDK Secret
  5. Add to backend/.env:
       ZOOM_ACCOUNT_ID=
       ZOOM_CLIENT_ID=
       ZOOM_CLIENT_SECRET=
       ZOOM_SDK_KEY=
       ZOOM_SDK_SECRET=
       ZOOM_WEBHOOK_SECRET_TOKEN=

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3-A: Add imports and environment variables
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

At the top of backend/main.py, add to the existing imports:
  import base64
  import hashlib
  import hmac
  import time as time_module

After the existing os.environ.get() calls for SUPABASE_URL etc., add:
  ZOOM_ACCOUNT_ID           = os.environ.get("ZOOM_ACCOUNT_ID", "")
  ZOOM_CLIENT_ID            = os.environ.get("ZOOM_CLIENT_ID", "")
  ZOOM_CLIENT_SECRET        = os.environ.get("ZOOM_CLIENT_SECRET", "")
  ZOOM_SDK_KEY              = os.environ.get("ZOOM_SDK_KEY", "")
  ZOOM_SDK_SECRET           = os.environ.get("ZOOM_SDK_SECRET", "")
  ZOOM_WEBHOOK_SECRET_TOKEN = os.environ.get("ZOOM_WEBHOOK_SECRET_TOKEN", "")

Add module-level token cache dict (after env vars):
  _zoom_token_cache = {"token": None, "expires_at": 0.0}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3-B: Add Zoom helper functions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add httpx to backend/requirements.txt: httpx>=0.27.0
Then: pip install httpx

Add these helper functions to main.py BEFORE the route handlers (place them
after the existing helper functions like verify_token):

async def zoom_get_token() -> str:
    """Get Zoom Server-to-Server OAuth access token. Cached for 55 minutes."""
    import httpx
    now = time_module.time()
    if _zoom_token_cache["token"] and now < _zoom_token_cache["expires_at"]:
        return _zoom_token_cache["token"]
    if not all([ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET]):
        raise HTTPException(
            status_code=500,
            detail="Zoom credentials not configured. Add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET to backend/.env"
        )
    creds = base64.b64encode(f"{ZOOM_CLIENT_ID}:{ZOOM_CLIENT_SECRET}".encode()).decode()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://zoom.us/oauth/token?grant_type=account_credentials&account_id={ZOOM_ACCOUNT_ID}",
            headers={"Authorization": f"Basic {creds}"},
            timeout=10.0,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Zoom auth failed: {resp.text}")
    token = resp.json()["access_token"]
    _zoom_token_cache["token"] = token
    _zoom_token_cache["expires_at"] = now + 3300.0
    return token


async def zoom_create_meeting(topic: str, start_time: str, duration_mins: int) -> dict:
    """Create a Zoom meeting. start_time is ISO 8601, e.g. '2026-06-01T09:00:00'.
    Returns {meeting_id, join_url, start_url}."""
    import httpx
    token = await zoom_get_token()
    payload = {
        "topic": topic,
        "type": 2,
        "start_time": start_time,
        "duration": duration_mins,
        "timezone": "Asia/Kolkata",
        "settings": {
            "host_video": True,
            "participant_video": True,
            "join_before_host": False,
            "waiting_room": True,
            "auto_recording": "none",
            "approval_type": 2,
        },
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.zoom.us/v2/users/me/meetings",
            json=payload,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=15.0,
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Zoom meeting creation failed: {resp.text}")
    data = resp.json()
    return {"meeting_id": str(data["id"]), "join_url": data["join_url"], "start_url": data["start_url"]}


async def zoom_get_participants(meeting_id: str) -> list:
    """Fetch participant list from Zoom report API after meeting ends."""
    import httpx
    try:
        token = await zoom_get_token()
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.zoom.us/v2/report/meetings/{meeting_id}/participants",
                headers={"Authorization": f"Bearer {token}"},
                timeout=15.0,
            )
        if resp.status_code != 200:
            return []
        return resp.json().get("participants", [])
    except Exception:
        return []


def zoom_generate_sdk_signature(meeting_id: str, role: int) -> str:
    """Generate Zoom Web SDK join signature. role: 0=participant, 1=host."""
    if not ZOOM_SDK_KEY or not ZOOM_SDK_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Zoom SDK credentials not configured. Add ZOOM_SDK_KEY and ZOOM_SDK_SECRET to backend/.env"
        )
    ts = int(time_module.time() * 1000) - 30000
    msg = base64.b64encode(f"{ZOOM_SDK_KEY}{meeting_id}{ts}{role}".encode()).decode()
    hash_b64 = base64.b64encode(
        hmac.new(ZOOM_SDK_SECRET.encode(), msg.encode(), hashlib.sha256).digest()
    ).decode()
    import json
    payload = json.dumps({
        "sdkKey": ZOOM_SDK_KEY, "mn": meeting_id, "role": role,
        "iat": ts, "exp": ts + 86400000,
        "appKey": ZOOM_SDK_KEY, "tokenExp": ts + 86400000,
    })
    payload_b64 = base64.b64encode(payload.encode()).decode()
    return f"{payload_b64}.{hash_b64}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3-C: Add Pydantic models for live classes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add these models after the existing Pydantic models (~line 131):

class LiveClassCreate(BaseModel):
    class_id: str
    title: str
    scheduled_at: str   # ISO 8601: "2026-06-01T09:00:00"
    duration_mins: int = 60

class LiveClassUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3-D: Add 6 live class API endpoints
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add ALL of these endpoints to main.py near the end of the file, before the
if __name__ == "__main__" block.

─── 1. GET /api/live-classes ─────────────────────────────────────

@app.get("/api/live-classes")
async def get_live_classes(class_id: Optional[str] = None, user=Depends(verify_token)):
    if not class_id:
        raise HTTPException(status_code=400, detail="class_id is required")

    class_result = service_supabase.table("subject_classes") \
        .select("id, standard_id").eq("id", class_id).single().execute()
    if not class_result.data:
        raise HTTPException(status_code=404, detail="Subject not found")

    std_id = class_result.data["standard_id"]

    if user["role"] == "teacher":
        std_check = service_supabase.table("standards") \
            .select("id").eq("id", std_id).eq("teacher_id", user["user_id"]).single().execute()
        if not std_check.data:
            raise HTTPException(status_code=403, detail="Not your class")
    else:
        if user.get("standard_id") != std_id:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")

    result = service_supabase.table("live_classes") \
        .select("*").eq("class_id", class_id) \
        .order("scheduled_at", desc=True).execute()
    classes = result.data or []

    for lc in classes:
        att = service_supabase.table("live_class_attendance") \
            .select("attended").eq("live_class_id", lc["id"]).execute()
        att_data = att.data or []
        lc["attended_count"] = sum(1 for a in att_data if a["attended"])
        lc["total_registered"] = len(att_data)
        if user["role"] == "student":
            lc.pop("zoom_join_url", None)
            lc.pop("zoom_start_url", None)
            # Attach this student's own attendance
            my_att = next((a for a in att_data if a.get("student_id") == user["user_id"]), None)
            lc["my_attended"] = my_att["attended"] if my_att else None

    return classes

─── 2. POST /api/live-classes ────────────────────────────────────

@app.post("/api/live-classes")
async def create_live_class(data: LiveClassCreate, user=Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    class_result = service_supabase.table("subject_classes") \
        .select("id, standard_id").eq("id", data.class_id).single().execute()
    if not class_result.data:
        raise HTTPException(status_code=404, detail="Subject not found")

    std_check = service_supabase.table("standards") \
        .select("id") \
        .eq("id", class_result.data["standard_id"]) \
        .eq("teacher_id", user["user_id"]).single().execute()
    if not std_check.data:
        raise HTTPException(status_code=403, detail="Not your class")

    zoom_data = await zoom_create_meeting(
        topic=data.title,
        start_time=data.scheduled_at,
        duration_mins=data.duration_mins,
    )

    insert = {
        "class_id": data.class_id,
        "title": data.title,
        "scheduled_at": data.scheduled_at,
        "duration_mins": data.duration_mins,
        "zoom_meeting_id": zoom_data["meeting_id"],
        "zoom_join_url": zoom_data["join_url"],
        "zoom_start_url": zoom_data["start_url"],
        "status": "scheduled",
        "created_by": user["user_id"],
    }
    result = service_supabase.table("live_classes").insert(insert).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create live class")
    return result.data[0]

─── 3. GET /api/live-classes/{live_class_id}/join-token ──────────

@app.get("/api/live-classes/{live_class_id}/join-token")
async def get_join_token(live_class_id: str, user=Depends(verify_token)):
    lc_result = service_supabase.table("live_classes") \
        .select("*").eq("id", live_class_id).single().execute()
    if not lc_result.data:
        raise HTTPException(status_code=404, detail="Live class not found")
    lc = lc_result.data

    if lc["status"] == "cancelled":
        raise HTTPException(status_code=400, detail="This class has been cancelled")

    class_result = service_supabase.table("subject_classes") \
        .select("standard_id").eq("id", lc["class_id"]).single().execute()
    required_std = class_result.data["standard_id"] if class_result.data else None

    if user["role"] == "teacher":
        std_check = service_supabase.table("standards") \
            .select("id").eq("id", required_std).eq("teacher_id", user["user_id"]).single().execute()
        if not std_check.data:
            raise HTTPException(status_code=403, detail="Not your class")
        role_num = 1
        display_name = user.get("name", "Teacher")
    else:
        if user.get("standard_id") != required_std:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")
        student = service_supabase.table("students") \
            .select("blocked, name").eq("id", user["user_id"]).single().execute()
        if not student.data or student.data.get("blocked"):
            raise HTTPException(status_code=403, detail="Account blocked")
        role_num = 0
        display_name = student.data.get("name", user.get("name", "Student"))

    if not lc.get("zoom_meeting_id"):
        raise HTTPException(status_code=400, detail="Zoom meeting not created yet")

    signature = zoom_generate_sdk_signature(lc["zoom_meeting_id"], role_num)

    return {
        "meeting_id": lc["zoom_meeting_id"],
        "signature": signature,
        "sdk_key": ZOOM_SDK_KEY,
        "role": role_num,
        "display_name": display_name,
    }

─── 4. POST /api/live-classes/{live_class_id}/end ────────────────

@app.post("/api/live-classes/{live_class_id}/end")
async def end_live_class(live_class_id: str, user=Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    lc_result = service_supabase.table("live_classes") \
        .select("*").eq("id", live_class_id).single().execute()
    if not lc_result.data:
        raise HTTPException(status_code=404, detail="Not found")
    lc = lc_result.data

    service_supabase.table("live_classes") \
        .update({"status": "ended"}).eq("id", live_class_id).execute()

    participants = await zoom_get_participants(lc.get("zoom_meeting_id", ""))

    class_result = service_supabase.table("subject_classes") \
        .select("standard_id").eq("id", lc["class_id"]).single().execute()
    if not class_result.data:
        return {"message": "ended", "attended": 0, "absent": 0}

    students_result = service_supabase.table("students") \
        .select("id, name, email") \
        .eq("standard_id", class_result.data["standard_id"]).execute()
    all_students = students_result.data or []

    p_by_email = {(p.get("user_email") or "").lower(): p for p in participants}
    p_by_name  = {(p.get("user_name")  or "").lower(): p for p in participants}

    attended_count = 0
    absent_count   = 0

    for student in all_students:
        em  = (student.get("email") or "").lower()
        nm  = (student.get("name")  or "").lower()
        match = p_by_email.get(em) or p_by_name.get(nm)

        if match:
            attended_count += 1
            dur_secs = match.get("duration", 0)
            service_supabase.table("live_class_attendance").upsert({
                "live_class_id": live_class_id,
                "student_id":    student["id"],
                "attended":      True,
                "joined_at":     match.get("join_time"),
                "left_at":       match.get("leave_time"),
                "duration_mins": dur_secs // 60 if dur_secs else None,
            }, on_conflict="live_class_id,student_id").execute()
        else:
            absent_count += 1
            service_supabase.table("live_class_attendance").upsert({
                "live_class_id": live_class_id,
                "student_id":    student["id"],
                "attended":      False,
            }, on_conflict="live_class_id,student_id").execute()

    return {"message": "Class ended", "attended": attended_count, "absent": absent_count, "total": len(all_students)}

─── 5. POST /api/live-classes/{live_class_id}/cancel ─────────────

@app.post("/api/live-classes/{live_class_id}/cancel")
async def cancel_live_class(live_class_id: str, user=Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    service_supabase.table("live_classes") \
        .update({"status": "cancelled"}) \
        .eq("id", live_class_id) \
        .eq("created_by", user["user_id"]).execute()
    return {"message": "cancelled"}

─── 6. GET /api/live-classes/{live_class_id}/attendance ──────────

@app.get("/api/live-classes/{live_class_id}/attendance")
async def get_live_class_attendance(live_class_id: str, user=Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    result = service_supabase.table("live_class_attendance") \
        .select("*, students(id, name, username, avatar_url)") \
        .eq("live_class_id", live_class_id).execute()
    return result.data or []

─── 7. POST /api/zoom/webhook ────────────────────────────────────

@app.post("/api/zoom/webhook")
async def zoom_webhook(request: Request):
    body = await request.body()
    timestamp = request.headers.get("x-zm-request-timestamp", "")
    signature = request.headers.get("x-zm-signature", "")

    if ZOOM_WEBHOOK_SECRET_TOKEN:
        msg = f"v0:{timestamp}:{body.decode()}"
        expected = "v0=" + hmac.new(
            ZOOM_WEBHOOK_SECRET_TOKEN.encode(), msg.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    import json
    data = json.loads(body)
    event = data.get("event", "")

    # Zoom URL validation challenge (required when registering webhook)
    if event == "endpoint.url_validation":
        plain = data.get("payload", {}).get("plainToken", "")
        hashed = hmac.new(
            ZOOM_WEBHOOK_SECRET_TOKEN.encode() if ZOOM_WEBHOOK_SECRET_TOKEN else b"",
            plain.encode(), hashlib.sha256
        ).hexdigest()
        return {"plainToken": plain, "encryptedToken": hashed}

    meeting_id = str(data.get("payload", {}).get("object", {}).get("id", ""))

    if event == "meeting.started":
        service_supabase.table("live_classes") \
            .update({"status": "live"}) \
            .eq("zoom_meeting_id", meeting_id) \
            .eq("status", "scheduled").execute()

    elif event == "meeting.ended":
        lc = service_supabase.table("live_classes") \
            .select("id").eq("zoom_meeting_id", meeting_id).single().execute()
        if lc.data:
            service_supabase.table("live_classes") \
                .update({"status": "ended"}).eq("id", lc.data["id"]).execute()
            # Note: Teacher should click "End class" to pull full attendance.
            # Webhook just marks it ended. Attendance pull requires Zoom report API
            # which may not be ready immediately after meeting ends.

    return {"status": "ok"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3-E: Add liveClassApi to frontend/src/lib/api.js
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE: frontend/src/lib/api.js

Add this export at the end of the file:

export const liveClassApi = {
  getByClass:    (classId)      => apiClient(`/live-classes?class_id=${classId}`),
  create:        (data)         => apiClient('/live-classes', { method: 'POST', body: JSON.stringify(data) }),
  getJoinToken:  (liveClassId)  => apiClient(`/live-classes/${liveClassId}/join-token`),
  end:           (liveClassId)  => apiClient(`/live-classes/${liveClassId}/end`, { method: 'POST' }),
  cancel:        (liveClassId)  => apiClient(`/live-classes/${liveClassId}/cancel`, { method: 'POST' }),
  getAttendance: (liveClassId)  => apiClient(`/live-classes/${liveClassId}/attendance`),
};

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION FOR PHASE 3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. pip install httpx (if not done)
2. Restart backend
3. Open http://localhost:8001/docs
4. Confirm these endpoints exist:
   - GET  /api/live-classes
   - POST /api/live-classes
   - GET  /api/live-classes/{live_class_id}/join-token
   - POST /api/live-classes/{live_class_id}/end
   - POST /api/live-classes/{live_class_id}/cancel
   - GET  /api/live-classes/{live_class_id}/attendance
   - POST /api/zoom/webhook
5. Without Zoom credentials: POST /api/live-classes should return 500 with
   "Zoom credentials not configured" message (this is correct behavior)
6. liveClassApi object exists in api.js

Reply "Phase 3 complete" when done.
```

### Phase 3 checklist before proceeding
- [ ] All 7 live class endpoints listed in `/docs`
- [ ] `liveClassApi` exported from `frontend/src/lib/api.js`
- [ ] `httpx` in requirements.txt and installed
- [ ] Without Zoom creds: POST returns 500 with helpful error message

---

---

# PHASE 4 — Frontend: VideoAddModal (Two Tabs)

> Paste this entire block into OpenCode as one message.
> Phase 2 must be complete before this phase.

```
You are working on the Tutoria LMS project.
File to edit: frontend/src/pages/teacher/SubjectDetailPage.jsx

CONTEXT:
- The existing UploadVideoModal component handles direct file upload with XHR progress tracking
- It is used in SubjectDetailPage.jsx and opened by a button labeled "Upload"
- UI primitives available: Modal, Btn, Input, Textarea, Toggle from frontend/src/components/ui.jsx
- apiClient is imported from ../../lib/api
- videoApi is available in the api.js imports

TASK: Convert UploadVideoModal into VideoAddModal with two tabs.
Tab 1 (default): YouTube link
Tab 2: Upload file (keep existing upload logic exactly)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4-A: Rename and restructure the component
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Change the function name from UploadVideoModal to VideoAddModal.
Keep the same props: { classId, subjectName, open, onClose, onAdded }

Add to the component's state (new state, alongside existing upload state):
  const [activeTab, setActiveTab] = useState('youtube');

  // YouTube tab state
  const [youtubeUrl, setYoutubeUrl]       = useState('');
  const [ytVideoId, setYtVideoId]         = useState(null);
  const [ytPreviewTitle, setYtPreviewTitle] = useState('');
  const [ytPreviewLoading, setYtPreviewLoading] = useState(false);
  const [ytPreviewError, setYtPreviewError] = useState(null);
  const [ytTitle, setYtTitle]             = useState('');
  const [ytDescription, setYtDescription] = useState('');
  const [ytAdding, setYtAdding]           = useState(false);

  const debounceRef = useRef(null);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4-B: Add YouTube helper functions inside the component
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add these functions inside VideoAddModal (before the return statement):

  function extractYouTubeId(url) {
    const patterns = [
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  }

  async function fetchYtPreview(url) {
    const id = extractYouTubeId(url);
    if (!id) {
      setYtPreviewError('Invalid YouTube URL. Use youtube.com/watch?v=... or youtu.be/...');
      setYtVideoId(null);
      return;
    }
    setYtVideoId(id);
    setYtPreviewLoading(true);
    setYtPreviewError(null);
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`
      );
      if (!res.ok) throw new Error('inaccessible');
      const data = await res.json();
      setYtPreviewTitle(data.title || '');
      setYtTitle(data.title || '');
    } catch {
      setYtPreviewError(
        "Could not load video. Make sure the video is set to Unlisted (not Private) on YouTube."
      );
      setYtVideoId(null);
    } finally {
      setYtPreviewLoading(false);
    }
  }

  function onYoutubeUrlChange(e) {
    const url = e.target.value;
    setYoutubeUrl(url);
    setYtVideoId(null);
    setYtPreviewError(null);
    setYtPreviewTitle('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (url.trim()) {
      debounceRef.current = setTimeout(() => fetchYtPreview(url.trim()), 600);
    }
  }

  async function handleAddYouTubeVideo() {
    if (!ytVideoId || !ytTitle.trim() || ytAdding) return;
    setYtAdding(true);
    try {
      await apiClient('/videos/youtube', {
        method: 'POST',
        body: JSON.stringify({
          class_id: classId,
          title: ytTitle.trim(),
          description: ytDescription.trim() || null,
          youtube_video_id: ytVideoId,
          youtube_url: youtubeUrl,
        }),
      });
      onAdded();
      onClose();
      resetYtState();
    } catch (err) {
      setYtPreviewError('Failed to add video. Please try again.');
    } finally {
      setYtAdding(false);
    }
  }

  function resetYtState() {
    setYoutubeUrl(''); setYtVideoId(null); setYtPreviewTitle('');
    setYtPreviewError(null); setYtTitle(''); setYtDescription('');
    setYtAdding(false);
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4-C: Replace the modal's return JSX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Replace the ENTIRE return statement of VideoAddModal with this structure:

  return (
    <Modal open={open} onClose={onClose} title="Add video" size="md">

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg mb-5">
        {['youtube', 'upload'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {tab === 'youtube' ? 'YouTube link' : 'Upload file'}
          </button>
        ))}
      </div>

      {/* ── YOUTUBE TAB ── */}
      {activeTab === 'youtube' && (
        <div className="space-y-4">

          {/* Amber info box */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 leading-relaxed">
            <strong>Important:</strong> Set your YouTube video to <strong>Unlisted</strong> — not Private.
            Unlisted videos are hidden from YouTube search. Students watch inside this app only — they never see the URL.
          </div>

          {/* URL input */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">YouTube video URL</label>
            <input
              type="url"
              value={youtubeUrl}
              onChange={onYoutubeUrlChange}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-neutral-400"
            />
          </div>

          {/* Loading spinner */}
          {ytPreviewLoading && (
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <div className="w-4 h-4 border-2 border-neutral-200 border-t-neutral-500 rounded-full animate-spin" />
              Checking video...
            </div>
          )}

          {/* Error */}
          {ytPreviewError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {ytPreviewError}
            </p>
          )}

          {/* Preview card */}
          {ytVideoId && !ytPreviewError && !ytPreviewLoading && (
            <div className="flex gap-3 p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
              <img
                src={`https://img.youtube.com/vi/${ytVideoId}/mqdefault.jpg`}
                alt="preview"
                className="w-28 flex-shrink-0 rounded-md object-cover"
                style={{ aspectRatio: '16/9' }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800 truncate">{ytPreviewTitle}</p>
                <span className="inline-flex items-center gap-1 mt-1 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                  ✓ Unlisted — ready to add
                </span>
              </div>
            </div>
          )}

          {/* Form fields — shown after preview loads */}
          {ytVideoId && !ytPreviewError && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Title</label>
                <input
                  type="text"
                  value={ytTitle}
                  onChange={e => setYtTitle(e.target.value)}
                  placeholder="Video title"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Description (optional)</label>
                <textarea
                  value={ytDescription}
                  onChange={e => setYtDescription(e.target.value)}
                  placeholder="What this video covers..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                />
              </div>
              <p className="text-xs text-neutral-400">Download: not available for YouTube videos</p>
              <Btn
                onClick={handleAddYouTubeVideo}
                disabled={!ytVideoId || !ytTitle.trim() || ytAdding}
                className="w-full"
              >
                {ytAdding ? 'Adding...' : 'Add video'}
              </Btn>
            </>
          )}
        </div>
      )}

      {/* ── UPLOAD TAB ── */}
      {activeTab === 'upload' && (
        <div>
          {/* KEEP EXISTING UPLOAD FORM JSX HERE EXACTLY AS IT WAS.
              Do not change any upload logic, state, or XHR code.
              Only move it inside this tab div. */}
        </div>
      )}

    </Modal>
  );

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4-D: Update references in SubjectDetailPage.jsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Find every <UploadVideoModal and replace with <VideoAddModal
2. Find the button that opens the modal — change its label from "Upload" to "Add video"
3. The state variable controlling modal visibility can stay the same name

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4-E: Show YT badge + thumbnail in teacher video list
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In SubjectDetailPage.jsx, add this state for thumbnail URLs:
  const [thumbnailUrls, setThumbnailUrls] = useState({});

After fetchVideosData() sets the videos array, call:
  async function loadTeacherThumbnails(videosList) {
    const ytVids = videosList.filter(v => v.source_type === 'youtube');
    if (!ytVids.length) return;
    const pairs = await Promise.all(
      ytVids.map(async v => {
        try {
          const r = await apiClient(`/videos/${v.id}/thumbnail`);
          return [v.id, r.thumbnail_url];
        } catch { return [v.id, null]; }
      })
    );
    setThumbnailUrls(Object.fromEntries(pairs));
  }

In the video list row JSX, before the title text, add a small thumbnail:
  <div className="flex-shrink-0 w-14 rounded overflow-hidden bg-neutral-100 relative" style={{aspectRatio:'16/9'}}>
    {v.source_type === 'youtube' && thumbnailUrls[v.id] ? (
      <img src={thumbnailUrls[v.id]} alt="" className="w-full h-full object-cover" />
    ) : (
      <div className="w-full h-full flex items-center justify-center">
        <Play size={12} className="text-neutral-400" />
      </div>
    )}
    {v.source_type === 'youtube' && (
      <span className="absolute bottom-0.5 right-0.5 text-[8px] px-1 bg-red-600 text-white rounded font-bold leading-tight">YT</span>
    )}
  </div>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION FOR PHASE 4
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Open teacher portal → any subject → Videos tab
2. Button now says "Add video" (not "Upload")
3. Click "Add video" → modal opens with two tabs: "YouTube link" | "Upload file"
4. YouTube tab is selected by default
5. Amber info box about Unlisted is visible
6. Paste: https://www.youtube.com/watch?v=jNQXAC9IVRw
   → After ~600ms: thumbnail appears + "Me at the zoo" auto-fills title field
7. Change title → click "Add video" → toast and modal closes
8. Video appears in list with red "YT" badge and thumbnail image
9. Switch to "Upload file" tab → existing upload form works as before
10. Delete YouTube video → no errors

Reply "Phase 4 complete" when all checks pass.
```

### Phase 4 checklist before proceeding
- [ ] "Add video" button (not "Upload") visible in Subject Videos tab
- [ ] Modal has two tabs, YouTube is default
- [ ] Pasting YouTube URL triggers thumbnail preview
- [ ] YouTube video added → appears with YT badge in teacher list
- [ ] Upload tab still works

---

---

# PHASE 5 — Frontend: Student Video Thumbnail Card Grid

> Paste this entire block into OpenCode as one message.
> Phase 2 must be complete before this phase.

```
You are working on the Tutoria LMS project.
File to edit: frontend/src/pages/student/StudentSubjectViewPage.jsx

CONTEXT:
- The Videos tab currently renders a plain list of video rows (play icon + title + completion status)
- Each video row navigates to /student/subjects/{classId}/video/{videoId}
- The video objects returned from API now have a source_type field ('upload' or 'youtube')
- youtube_video_id is NOT in the API response — thumbnails must be fetched via the /thumbnail endpoint
- UI imports: lucide-react icons already used; no new UI library imports needed
- apiClient is imported from ../../lib/api

TASK: Replace the plain video list with a thumbnail card grid.
This applies to ALL videos — both YouTube (shows real thumbnail) and upload (shows dark placeholder).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5-A: Add thumbnail fetching state + effect
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Inside StudentSubjectViewPage, add this state and effect:

  const [thumbnailUrls, setThumbnailUrls] = useState({});  // { videoId: url | null }

  useEffect(() => {
    async function loadThumbnails() {
      if (!videos.length) return;
      const ytVids = videos.filter(v => v.source_type === 'youtube');
      if (!ytVids.length) return;
      const pairs = await Promise.all(
        ytVids.map(async v => {
          try {
            const r = await apiClient(`/videos/${v.id}/thumbnail`);
            return [v.id, r.thumbnail_url || null];
          } catch { return [v.id, null]; }
        })
      );
      setThumbnailUrls(Object.fromEntries(pairs));
    }
    loadThumbnails();
  }, [videos]);

Make sure to import CheckCircle from lucide-react if not already imported.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5-B: Replace the video list JSX with thumbnail card grid
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find the section in the Videos tab that maps over the videos array and renders
each video as a row/button. Replace it entirely with:

  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {videos.map(v => {
      const isYT = v.source_type === 'youtube';
      const thumbUrl = isYT ? (thumbnailUrls[v.id] || null) : null;
      const progressPct = v.progress_secs && v.duration_secs
        ? Math.min(100, Math.round((v.progress_secs / v.duration_secs) * 100))
        : 0;

      return (
        <button
          key={v.id}
          onClick={() => navigate(`/student/subjects/${classId}/video/${v.id}`)}
          className="group text-left rounded-xl overflow-hidden border border-neutral-200 bg-white hover:shadow-md transition-all duration-200 active:scale-[0.98]"
        >
          {/* ── Thumbnail area ── */}
          <div className="relative overflow-hidden bg-neutral-900" style={{ aspectRatio: '16/9' }}>
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt={v.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-neutral-900">
                <Play size={28} className="text-white/40" />
              </div>
            )}

            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`
                w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200
                ${thumbUrl
                  ? 'bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 group-hover:scale-110'
                  : 'bg-white/10 opacity-100'}
              `}>
                <Play size={20} className="text-white" fill="white" />
              </div>
            </div>

            {/* Duration badge */}
            {v.duration_secs > 0 && (
              <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-medium pointer-events-none">
                {Math.floor(v.duration_secs / 60)}:{String(v.duration_secs % 60).padStart(2, '0')}
              </div>
            )}

            {/* Completed badge */}
            {v.my_completed && (
              <div className="absolute top-2 left-2 flex items-center gap-1 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded font-medium pointer-events-none">
                <CheckCircle size={9} />
                Done
              </div>
            )}

            {/* YouTube badge */}
            {isYT && (
              <div className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 bg-red-600 text-white rounded font-bold pointer-events-none">
                YT
              </div>
            )}

            {/* Progress bar */}
            {progressPct > 0 && !v.my_completed && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 pointer-events-none">
                <div className="h-full bg-white" style={{ width: `${progressPct}%` }} />
              </div>
            )}
          </div>

          {/* ── Card footer ── */}
          <div className="p-3">
            <p className="text-sm font-medium text-neutral-900 line-clamp-2 leading-snug">{v.title}</p>
            {v.description && (
              <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{v.description}</p>
            )}
          </div>
        </button>
      );
    })}
  </div>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION FOR PHASE 5
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Open student portal → any subject → Videos tab
2. Videos display as cards with 16:9 aspect ratio thumbnails
3. YouTube videos: real YouTube thumbnail loads (red YT badge in top-right)
4. Upload videos: dark placeholder with play icon
5. Hover over thumbnail card: play button appears with scale effect (YouTube videos only)
6. Completed videos: green "Done" badge in top-left corner
7. In-progress videos: white progress bar strip at bottom of thumbnail
8. Duration badge in bottom-right corner (if duration available)
9. Tap card → navigates to video player page
10. On a narrow mobile screen (375px): single column; on wider screen: 2 columns

Reply "Phase 5 complete" when done.
```

### Phase 5 checklist before proceeding
- [ ] Video list now shows thumbnail cards (not plain list)
- [ ] YouTube videos show real thumbnails
- [ ] Upload videos show dark placeholder
- [ ] Completed/in-progress badges show correctly
- [ ] Grid layout works on mobile and tablet

---

---

# PHASE 6 — Frontend: Student YouTube Video Player

> Paste this entire block into OpenCode as one message.
> Phase 2 and Phase 5 must be complete before this phase.

```
You are working on the Tutoria LMS project.
File to edit: frontend/src/pages/student/StudentVideoPlayerPage.jsx

CONTEXT:
- The existing player handles 3 modes: Cloudflare Stream iframe, HTML5 video, offline blob
- The video object is fetched from the API (does NOT include youtube_video_id)
- For YouTube videos: must call GET /api/videos/{id}/token to get the video ID as 'token'
- Only then can the YouTube IFrame Player API be initialized
- Progress tracking should use the same upsert pattern as the existing player
- apiClient is already imported

TASK: Add YouTube IFrame Player support as a 4th player mode.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6-A: Add new state variables
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Inside StudentVideoPlayerPage, add:

  const [ytToken, setYtToken]         = useState(null);
  const [ytPlayerReady, setYtPlayerReady] = useState(false);
  const [ytError, setYtError]         = useState(null);
  const ytPlayerRef   = useRef(null);
  const ytProgressRef = useRef(null);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6-B: Fetch token when source_type is youtube
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After the video object is loaded (where the existing useEffect fetches video data),
add a secondary effect:

  useEffect(() => {
    if (video?.source_type !== 'youtube') return;
    apiClient(`/videos/${videoId}/token`)
      .then(res => setYtToken(res.token))
      .catch(err => {
        if (err?.status === 403 || err?.message?.includes('403')) {
          setYtError('You do not have access to this video.');
        } else {
          setYtError('Could not load video. Please try again.');
        }
      });
  }, [video?.source_type, videoId]);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6-C: Load YouTube IFrame API and init player when token is ready
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  useEffect(() => {
    if (!ytToken) return;

    function loadYTApi() {
      return new Promise(resolve => {
        if (window.YT?.Player) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
        window.onYouTubeIframeAPIReady = resolve;
        // Immediate resolve if already loaded
        if (window.YT?.Player) resolve();
      });
    }

    loadYTApi().then(() => {
      ytPlayerRef.current = new window.YT.Player('yt-player-mount', {
        videoId: ytToken,
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, modestbranding: 1, fs: 1, iv_load_policy: 3, controls: 1 },
        events: {
          onReady: e => {
            setYtPlayerReady(true);
            const saved = progress?.progress_secs || 0;
            if (saved > 30) e.target.seekTo(saved, true);
          },
          onStateChange: e => {
            const S = window.YT.PlayerState;
            if (e.data === S.PLAYING) startYtProgress(e.target);
            else stopYtProgress();
            if (e.data === S.ENDED) markComplete();
          },
          onError: () => {
            setYtError('Video cannot be played. Make sure the video is Unlisted on YouTube.');
          },
        },
      });
    });

    return () => {
      stopYtProgress();
      ytPlayerRef.current?.destroy?.();
    };
  }, [ytToken]);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6-D: Progress tracking functions for YouTube player
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function startYtProgress(player) {
    stopYtProgress();
    ytProgressRef.current = setInterval(async () => {
      try {
        const currentTime = Math.floor(player.getCurrentTime());
        const duration    = Math.floor(player.getDuration());
        // Save progress
        await apiClient('/video-progress', {
          method: 'POST',
          body: JSON.stringify({ video_id: videoId, progress_secs: currentTime }),
        });
        // Auto-complete at 90%
        if (duration > 0 && currentTime / duration >= 0.9 && !completed) {
          markComplete();
        }
      } catch { /* silent — do not interrupt playback */ }
    }, 5000);
  }

  function stopYtProgress() {
    if (ytProgressRef.current) {
      clearInterval(ytProgressRef.current);
      ytProgressRef.current = null;
    }
  }

Note: markComplete() and the 'completed' state variable already exist in the
component for the existing player. Reuse them — do NOT create duplicate state.
If markComplete() is defined inline, ensure it sets 'completed' to true and
calls POST /videos/{videoId}/complete via the existing apiClient pattern.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6-E: Add YouTube player branch to the render
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find the part of the render that decides which player to show.
ADD this check BEFORE the existing if/else chain (so YouTube is checked first):

  if (video?.source_type === 'youtube') {
    return (
      <div className="min-h-screen bg-black flex flex-col">

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 z-20 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white"
        >
          <ArrowLeft size={18} />
        </button>

        {/* Player container */}
        <div className="w-full bg-black" style={{ aspectRatio: '16/9', position: 'relative' }}>
          {ytError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
              <p className="text-white/70 text-sm">{ytError}</p>
              <button onClick={() => navigate(-1)} className="text-white/50 text-xs underline mt-1">Go back</button>
            </div>
          ) : (
            <>
              {!ytPlayerReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              )}
              <div id="yt-player-mount" className="w-full h-full" />
            </>
          )}
        </div>

        {/* Info below player */}
        <div className="flex-1 bg-[#FAFAF9] px-4 py-4 space-y-2">
          <h1 className="text-base font-semibold text-neutral-900">{video.title}</h1>
          {video.description && (
            <p className="text-sm text-neutral-500 leading-relaxed">{video.description}</p>
          )}
          {completed && (
            <div className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
              <CheckCircle size={14} />
              Completed · +10 points
            </div>
          )}
        </div>

      </div>
    );
  }
  // ... existing player JSX continues below (Cloudflare/HTML5/offline)

Make sure to import ArrowLeft and CheckCircle from lucide-react if not already present.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION FOR PHASE 6
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Log in as a student who is in the correct standard
2. Open a subject → Videos tab → tap a YouTube video card
3. Player loads: YouTube video plays inside the app
4. Back button works (navigates back to subject page)
5. Watch 30 seconds → navigate away → come back → player resumes at ~30s
6. Watch past 90% → "Completed · +10 points" badge appears below player
7. Open browser DevTools → Network tab → search for "youtube_video_id" → 0 results in API responses
8. The only request containing a YouTube ID is to /api/videos/{id}/token (field named 'token')
   and then the YouTube IFrame embed request itself

SECURITY CHECK:
9. Log in as a student from a DIFFERENT standard
10. Navigate to the video URL directly: /student/subjects/{classId}/video/{videoId}
11. Should see the error message: "You do not have access to this video."
12. YouTube player should NOT load at all

Reply "Phase 6 complete" when all checks pass.
```

### Phase 6 checklist before proceeding
- [ ] YouTube video plays inside the app via IFrame API
- [ ] Wrong-standard student sees error, player never loads
- [ ] `youtube_video_id` never appears in API response fields
- [ ] Progress saves every 5 seconds, resumes on return
- [ ] 90% watched → completed + 10 points

---

---

# PHASE 7 — Frontend: Live Class Nav Button

> Paste this entire block into OpenCode as one message.
> No backend dependency — can run independently.

```
You are working on the Tutoria LMS project.
Files to edit:
  1. frontend/src/components/shared/BottomNav.jsx
  2. frontend/src/pages/teacher/TeacherLayout.jsx
  3. frontend/src/pages/student/StudentLayout.jsx
  4. frontend/src/App.jsx

TASK: Add a "Live" nav button to the bottom tab bar for BOTH teacher and student portals.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 7-A: Update BottomNav.jsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE: frontend/src/components/shared/BottomNav.jsx

Add Video to the lucide-react import at the top:
  import { Home, BookOpen, MessageSquare, Calendar, MoreHorizontal, Users, Video } from 'lucide-react';

Replace TEACHER_ITEMS array with (6 items, "Live" before "More"):
  const TEACHER_ITEMS = [
    { id: 'today',      label: 'Home',       icon: Home },
    { id: 'subjects',   label: 'Classes',    icon: BookOpen },
    { id: 'broadcasts', label: 'Broadcasts', icon: MessageSquare },
    { id: 'attendance', label: 'Attendance', icon: Calendar },
    { id: 'live',       label: 'Live',       icon: Video },
    { id: 'more',       label: 'More',       icon: MoreHorizontal },
  ];

Replace STUDENT_ITEMS array with (6 items, "Live" after "Broadcasts", before "Profile"):
  const STUDENT_ITEMS = [
    { id: 'home',       label: 'Home',       icon: Home },
    { id: 'subjects',   label: 'Subjects',   icon: BookOpen },
    { id: 'broadcasts', label: 'Broadcasts', icon: MessageSquare },
    { id: 'live',       label: 'Live',       icon: Video },
    { id: 'profile',    label: 'Profile',    icon: Users },
    { id: 'more',       label: 'More',       icon: MoreHorizontal },
  ];

In the nav item rendering (the map over items), reduce label font size for 6 items:
  Find where the label text is rendered (likely className with text-xs or text-[10px]).
  Change to text-[10px] to fit 6 items without overflow on mobile.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 7-B: Update TeacherLayout.jsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE: frontend/src/pages/teacher/TeacherLayout.jsx

In the getActiveTab() function, add BEFORE the return 'home' fallback:
  if (path.startsWith('/teacher/live-classes')) return 'live';

In the routes map object (the one with today, subjects, attendance, etc.), add:
  live: '/teacher/live-classes',

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 7-C: Update StudentLayout.jsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE: frontend/src/pages/student/StudentLayout.jsx

In the getActiveTab() function, add:
  if (path.startsWith('/student/live-classes')) return 'live';

In the routes map, add:
  live: '/student/live-classes',

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 7-D: Add routes in App.jsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE: frontend/src/App.jsx

In the teacher routes block (inside ProtectedTeacherRoute → TeacherLayout), add:
  import TeacherLiveClassesPage from './pages/teacher/TeacherLiveClassesPage';
  // Add route:
  <Route path="live-classes" element={<TeacherLiveClassesPage />} />

In the student routes block (inside ProtectedStudentRoute → StudentLayout), add:
  import StudentLiveClassesPage from './pages/student/StudentLiveClassesPage';
  // Add route:
  <Route path="live-classes" element={<StudentLiveClassesPage />} />

NOTE: These page files do not exist yet — they will be created in Phase 8 and Phase 9.
For now, create placeholder files so the routes don't crash:

Create frontend/src/pages/teacher/TeacherLiveClassesPage.jsx with:
  export default function TeacherLiveClassesPage() {
    return <div className="p-8 text-neutral-500 text-sm">Live Classes — coming in Phase 8</div>;
  }

Create frontend/src/pages/student/StudentLiveClassesPage.jsx with:
  export default function StudentLiveClassesPage() {
    return <div className="p-8 text-neutral-500 text-sm">Live Classes — coming in Phase 9</div>;
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION FOR PHASE 7
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Open teacher portal — bottom nav shows 6 tabs: Home, Classes, Broadcasts, Attendance, Live, More
2. Click "Live" → navigates to /teacher/live-classes → placeholder text shown
3. "Live" tab is highlighted/active when on the live-classes route
4. Open student portal — bottom nav shows 6 tabs: Home, Subjects, Broadcasts, Live, Profile, More
5. Click "Live" → navigates to /student/live-classes → placeholder text shown
6. "Live" tab is highlighted when on the route
7. All other nav tabs still work correctly (no regressions)

Reply "Phase 7 complete" when done.
```

### Phase 7 checklist before proceeding
- [ ] Teacher nav has 6 items with "Live" visible
- [ ] Student nav has 6 items with "Live" visible
- [ ] Clicking Live navigates to correct route
- [ ] Active state highlights correctly
- [ ] No other nav tabs broken

---

---

# PHASE 8 — Frontend: Teacher Live Classes Page

> Paste this entire block into OpenCode as one message.
> Phase 3 and Phase 7 must be complete before this phase.

```
You are working on the Tutoria LMS project.
File to REPLACE: frontend/src/pages/teacher/TeacherLiveClassesPage.jsx
(Replace the Phase 7 placeholder with the full implementation)

CONTEXT:
- liveClassApi is exported from frontend/src/lib/api.js (added in Phase 3)
- useAppCache() from frontend/src/store.js provides { standards, subjects } (cached data)
- UI primitives: Modal, Sheet, Btn, Tag, Avatar from frontend/src/components/ui.jsx
- Icons: Video, Calendar, Clock, Users, Plus, CheckCircle, AlertCircle, ArrowLeft from lucide-react
- TopBar is at frontend/src/components/shared/TopBar.jsx

TASK: Build the full teacher live classes page.
The page shows ALL live classes across ALL subjects. Teacher can schedule, start, end, and view attendance.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write the complete file content below
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The file must contain:

1. TeacherLiveClassesPage (default export) — main page component:
   STATE:
     liveClasses (array), loading, showScheduleModal, activeJoin (join token data | null), attendanceSheetId (string | null)
   
   ON MOUNT:
     For each subject in useAppCache().subjects, call liveClassApi.getByClass(s.id)
     Flatten results, attach subject object to each live class, sort by scheduled_at desc
   
   RENDER:
     - TopBar with title="Live Classes" and a "Schedule" Btn (Plus icon) in action slot
     - List of live class cards (see below)
     - ScheduleLiveClassModal (conditionally)
     - LiveClassAttendanceSheet (conditionally, keyed by attendanceSheetId)
     - If activeJoin is set: render ZoomMeetingView full-screen (import from ../../components/ZoomMeetingView)

   LIVE CLASS CARD structure:
     - Title + status badge (amber=Scheduled, green=Live, gray=Ended, red=Cancelled)
     - Live status shows pulsing green dot
     - Subject name (smaller, neutral-500)
     - Date/time formatted as: "Wed 28 May at 9:00 AM" + duration "60 min"
     - Ended: "22/28 attended" with Users icon
     - Action buttons:
       - Scheduled + within 15 min of start: "Start class" Btn + "Cancel" ghost Btn
       - Scheduled + more than 15 min away: "Starts in X min" text + "Cancel" ghost Btn
       - Live: "Join class" Btn + "End class" danger Btn
       - Ended: "View attendance" ghost Btn

   HANDLERS:
     handleStartClass(lc): call liveClassApi.getJoinToken(lc.id) → set activeJoin
     handleEndClass(lc): confirm dialog → liveClassApi.end(lc.id) → refetch
     handleCancelClass(lc): confirm dialog → liveClassApi.cancel(lc.id) → refetch

2. ScheduleLiveClassModal (local function component):
   PROPS: open, onClose, subjects (array with id, name, standard_name), onScheduled
   
   FIELDS:
     - Subject dropdown (select from subjects list, grouped by standard if possible, or flat list with "Name — Standard")
     - Title text input
     - Date picker (min = today)
     - Time picker (24h or 12h, whatever browser default gives)
     - Duration dropdown: 30, 45, 60, 90, 120 minutes
   
   SUBMIT:
     Combines date + time into ISO 8601: `${date}T${time}:00`
     Calls liveClassApi.create({ class_id, title, scheduled_at, duration_mins })
     On success: call onScheduled() + onClose() + reset form
     On error (e.g. Zoom creds missing): show red error message inside modal

3. LiveClassAttendanceSheet (local function component):
   PROPS: liveClassId, onClose
   
   ON MOUNT: fetch liveClassApi.getAttendance(liveClassId)
   
   RENDER (inside Sheet component):
     - Summary line: "22 attended · 6 absent"
     - For each attendance record:
       - Avatar + student name
       - If attended: green "Attended ✓" badge + join time + duration
       - If absent: red "Absent" badge
     - Loading skeleton while fetching

4. Import ZoomMeetingView:
   import ZoomMeetingView from '../../components/ZoomMeetingView';
   (This file is created in Phase 10. Add the import now so it's ready.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION FOR PHASE 8
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Teacher portal → Live tab → page renders (no crash, no import errors)
2. Empty state: shows "No live classes scheduled yet" with Video icon + Schedule button
3. "Schedule" button → modal opens with all 5 fields
4. Select a subject, fill all fields → click Schedule:
   - If Zoom creds are configured: success toast, class appears in list
   - If Zoom creds are NOT configured: red error shown inside modal (not a blank crash)
5. Scheduled class card shows correct title, date/time, subject name, amber badge
6. "Cancel" button works → card disappears or shows "Cancelled" badge
7. Ended class (after Phase 10): "View attendance" → sheet slides in with per-student data

Reply "Phase 8 complete" when done.
```

### Phase 8 checklist before proceeding
- [ ] Teacher Live Classes page renders without errors
- [ ] Schedule modal opens and validates all fields
- [ ] Error message shown when Zoom creds missing (not a crash)
- [ ] Live class cards show correct status badges
- [ ] Attendance sheet renders per-student data

---

---

# PHASE 9 — Frontend: Student Live Classes Page

> Paste this entire block into OpenCode as one message.
> Phase 3 and Phase 7 must be complete before this phase.

```
You are working on the Tutoria LMS project.
File to REPLACE: frontend/src/pages/student/StudentLiveClassesPage.jsx
(Replace the Phase 7 placeholder with the full implementation)

CONTEXT:
- liveClassApi exported from frontend/src/lib/api.js
- useAuthStore from frontend/src/lib/auth.js — provides user with { standard_id, name }
- apiClient from frontend/src/lib/api.js
- UI primitives: Btn, Tag from frontend/src/components/ui.jsx
- Icons: Video, Calendar, Clock, CheckCircle from lucide-react
- TopBar at frontend/src/components/shared/TopBar.jsx
- IMPORTANT: zoom_join_url and zoom_start_url are stripped by the backend for students
  Students join via ZoomMeetingView using the join-token endpoint, NOT via direct URL

TASK: Build the full student live classes page.
Shows live classes for all subjects in the student's standard. Student can join classes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write the complete file content below
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The file must contain:

1. StudentLiveClassesPage (default export):
   STATE:
     liveClasses (array), loading, activeJoin (join token data | null), now (Date.now() — updated every 30s)
   
   ON MOUNT:
     1. Fetch all subjects for user.standard_id: GET /api/subjects?standard_id={user.standard_id}
     2. For each subject, fetch liveClassApi.getByClass(subject.id)
     3. Flatten, attach subject, filter out 'cancelled', sort by scheduled_at desc
     4. Start interval to update 'now' every 30 seconds (for countdown refresh)

   RENDER:
     - TopBar with title="Live Classes"
     - If activeJoin: show ZoomMeetingView full-screen
     - Live classes list (cards)
     - Empty state when no classes

   LIVE CLASS CARD structure (student view):
     - Title + subject name
     - Scheduled date/time
     - Duration
     
     STATUS DISPLAY:
       - status='live': pulsing green "Live now" badge + "Join class" button (always active)
       - status='scheduled':
           - If within 5 minutes of start: "Join class" button + "Starting soon" amber badge
           - If more than 5 minutes away: amber countdown text "Starts in Xh Ym" (no join button)
       - status='ended':
           - my_attended=true: green "You attended ✓"
           - my_attended=false: gray "You missed this class"
           - my_attended=null: gray "Class ended"
     
     IMPORTANT: Never show zoom_join_url or any Zoom URL anywhere on the page.
     The "Join class" button calls the join-token endpoint and opens ZoomMeetingView.

   HANDLER:
     handleJoin(lc):
       call liveClassApi.getJoinToken(lc.id)
       on success: setActiveJoin(tokenData)
       on error: show toast/alert with error message

2. Import ZoomMeetingView:
   import ZoomMeetingView from '../../components/ZoomMeetingView';

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION FOR PHASE 9
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Student portal → Live tab → page renders (no crash)
2. Empty state: "No live classes scheduled yet" + Video icon
3. If a class was scheduled in Phase 8:
   - Class card appears with title, subject, date/time
   - Correct countdown text (e.g. "Starts in 2h 30m")
4. zoom_join_url is NOT visible anywhere on the page or in DevTools network tab responses
5. Student from a different standard: that student's Live page does NOT show this class
6. "Join class" button visible only when within 5 min (scheduled) or when live

Reply "Phase 9 complete" when done.
```

### Phase 9 checklist before proceeding
- [ ] Student Live Classes page renders without errors
- [ ] Countdown timer updates every 30 seconds
- [ ] Zoom URL never visible in student's browser
- [ ] "Join" button only active at correct times
- [ ] my_attended status shown for ended classes

---

---

# PHASE 10 — Frontend: ZoomMeetingView Component

> Paste this entire block into OpenCode as one message.
> Phase 3, 8, and 9 must be complete before this phase.
> This phase requires the @zoom/meetingsdk npm package.

```
You are working on the Tutoria LMS project.
File to create: frontend/src/components/ZoomMeetingView.jsx

PREREQUISITE: Install Zoom Web SDK in the frontend:
  cd frontend
  npm install @zoom/meetingsdk

This command must be run first. After it completes, proceed with the file.

CONTEXT:
- This component is used by BOTH TeacherLiveClassesPage and StudentLiveClassesPage
- Props: { meeting_id, signature, sdk_key, role (0|1), display_name, onLeave }
- role=1: teacher (host), role=0: student (participant)
- The Zoom SDK renders its UI into a div with id="zmmtg-root" which it auto-creates
- On leave: call onLeave() to return the user to the live classes page
- The component covers the full screen (position: fixed, z-index: 50)

TASK: Build the ZoomMeetingView component.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write the complete file content
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, AlertCircle, Loader } from 'lucide-react';

export default function ZoomMeetingView({ meeting_id, signature, sdk_key, role, display_name, onLeave }) {
  const [status, setStatus] = useState('loading');  // 'loading' | 'joining' | 'joined' | 'error'
  const [error, setError] = useState(null);
  const initialized = useRef(false);
  const zoomRef = useRef(null);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    initZoomMeeting();

    return () => {
      try { zoomRef.current?.leaveMeeting({}); } catch { /* ignore */ }
    };
  }, []);

  async function initZoomMeeting() {
    try {
      setStatus('loading');
      const { ZoomMtg } = await import('@zoom/meetingsdk');
      zoomRef.current = ZoomMtg;

      ZoomMtg.setZoomJSLib('https://source.zoom.us/3.x.x/lib', '/av');
      ZoomMtg.preLoadWasm();
      ZoomMtg.prepareWebSDK();

      setStatus('joining');

      ZoomMtg.init({
        leaveUrl: window.location.href,
        patchJsMedia: true,
        success: () => {
          ZoomMtg.join({
            meetingNumber: meeting_id,
            userName: display_name,
            signature: signature,
            sdkKey: sdk_key,
            passWord: '',
            success: () => setStatus('joined'),
            error: (e) => {
              setError(e?.errorMessage || e?.reason || 'Could not join the meeting. Please try again.');
              setStatus('error');
            },
          });
        },
        error: (e) => {
          setError(e?.errorMessage || 'Could not initialize Zoom. Please check your connection.');
          setStatus('error');
        },
      });
    } catch (err) {
      setError('Failed to load Zoom. Please check your internet connection and try again.');
      setStatus('error');
    }
  }

  function handleLeave() {
    try {
      zoomRef.current?.leaveMeeting({
        success: () => onLeave(),
        error: () => onLeave(),
      });
    } catch { onLeave(); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">

      {/* Leave button — always visible */}
      <button
        onClick={handleLeave}
        className="absolute top-4 left-4 z-[60] flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-sm text-white text-sm rounded-full hover:bg-black/80 transition-colors"
      >
        <ArrowLeft size={14} />
        Leave
      </button>

      {/* Loading state */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Loader size={28} className="text-white/60 animate-spin" />
          <p className="text-white/60 text-sm">Loading Zoom...</p>
        </div>
      )}

      {/* Joining state */}
      {status === 'joining' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Connecting to class...</p>
          <p className="text-white/40 text-xs">This may take a few seconds</p>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <AlertCircle size={36} className="text-red-400" />
          <p className="text-white text-sm leading-relaxed">{error}</p>
          <button
            onClick={onLeave}
            className="mt-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
          >
            Go back
          </button>
        </div>
      )}

      {/* Zoom SDK mounts here automatically */}
      <div id="zmmtg-root" className="w-full h-full" />

    </div>
  );
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 10-B: Final wiring check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Verify that:
1. TeacherLiveClassesPage.jsx imports ZoomMeetingView from '../../components/ZoomMeetingView'
   and renders it when activeJoin is not null:
     if (activeJoin) return <ZoomMeetingView {...activeJoin} onLeave={() => { setActiveJoin(null); fetchAll(); }} />;

2. StudentLiveClassesPage.jsx imports ZoomMeetingView from '../../components/ZoomMeetingView'
   and renders it when activeJoin is not null:
     if (activeJoin) return <ZoomMeetingView {...activeJoin} onLeave={() => { setActiveJoin(null); fetchAll(); }} />;

If these imports are missing from Phase 8 or Phase 9, add them now.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION FOR PHASE 10 (Full end-to-end)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SETUP (required before testing):
- Add Zoom credentials to backend/.env (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, etc.)
- Zoom plan must be Pro for classes > 40 minutes with 3+ people

TEST SEQUENCE:
1. Teacher schedules a class for 5 minutes from now
2. Zoom meeting appears in Supabase live_classes table with zoom_meeting_id populated
3. Student can see the class in their Live tab with countdown
4. Wait for countdown → student's "Join class" button activates
5. Teacher clicks "Start class" → ZoomMeetingView loads → teacher is in meeting as host
6. Student clicks "Join class" → ZoomMeetingView loads → student is in meeting as participant
7. Both can see/hear each other inside the app (no redirect to zoom.us)
8. Teacher clicks "Leave" → returns to Teacher Live Classes page
9. Teacher clicks "End class" → confirm → status → 'ended'
10. live_class_attendance rows created for all students in the standard
11. Teacher clicks "View attendance" → attendance sheet shows correct data
12. Student's Live tab shows "You attended ✓" or "You missed this class"

WITHOUT ZOOM CREDENTIALS (offline testing):
1. Schedule class: error shown in modal "Zoom credentials not configured" — ✓ expected
2. All pages load without crashing — ✓ expected
3. Nav buttons work, cards render — ✓ expected

Reply "Phase 10 complete — all phases done!" when finished.
```

### Phase 10 checklist — Final
- [ ] `npm install @zoom/meetingsdk` ran successfully
- [ ] ZoomMeetingView.jsx created at correct path
- [ ] Both live class pages import and render ZoomMeetingView
- [ ] Teacher and student join Zoom meeting inside the app (requires credentials)
- [ ] "Leave" button returns to correct page
- [ ] Attendance data written after class ends

---

---

## Environment Variables Checklist

Before running Phase 3 / Phase 8 / Phase 10, have these ready in `backend/.env`:

```env
# Zoom Server-to-Server OAuth
# Get from: marketplace.zoom.us → Develop → Build App → Server-to-Server OAuth
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=

# Zoom Web SDK
# Get from: marketplace.zoom.us → Develop → Build App → SDK App
ZOOM_SDK_KEY=
ZOOM_SDK_SECRET=

# Zoom Webhook (optional — for auto-attendance)
# Get from your Zoom app → Feature → Event Subscriptions → Secret Token
ZOOM_WEBHOOK_SECRET_TOKEN=
```

## Zoom Pricing Note

| Plan | Group meeting limit | Cost |
|------|---------------------|------|
| Free | 40 min (3+ people) | $0 |
| **Pro** | Unlimited | **$15/month per host** |
| Daily.co (alternative SDK) | Free up to 2000 min/day | $0–$35/month |

For regular hour-long classes with students: **Zoom Pro** is recommended.

---

*Generated: May 2026 · Udaya LMS · For use with OpenCode + DeepSeek v4 Flash*

---

---

# ANTIGRAVITY PROMPT — Complete Frontend Implementation

> **This is a single, self-contained prompt. Paste the entire block below into Antigravity.**
> Run this AFTER Phase 1 (SQL) and Phase 2+3 (backend endpoints) are complete.
> The backend endpoints this frontend calls must already exist.

---

```
Read CLAUDE.md fully before writing a single line of code.

PROJECT: Tutoria LMS
Stack: React 18 + Vite (JSX, NOT TypeScript for page files), Tailwind CSS, Zustand, lucide-react.
Frontend root: frontend/src/
All UI primitives (Modal, Sheet, Btn, Input, Textarea, Avatar, Tag, Toggle, Skeleton) are in frontend/src/components/ui.jsx — import from there, do not create new ones.
HTTP client: apiClient() in frontend/src/lib/api.js — auto-injects Bearer token from localStorage 'tutoria_token'.
Auth store: useAuthStore() from frontend/src/lib/auth.js — provides { user, role }.
App cache: useAppCache() from frontend/src/store.js — provides { standards, subjects }.
Icons: lucide-react throughout.
Design tokens: background #FAFAF9, borders border-neutral-200, surfaces bg-white, rounded-xl cards.

TASK: Implement ALL of the following frontend changes. Build them in the exact order listed.
Do not skip any step. After completing all steps, run the verification checks at the bottom.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — Install Zoom Web SDK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run in the frontend/ directory:
  npm install @zoom/meetingsdk

Then confirm it appears in frontend/package.json dependencies before proceeding.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — Add API methods to frontend/src/lib/api.js
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE: frontend/src/lib/api.js

Find the existing videoApi object (it has getVideos, markComplete, getViewers).
Add these three methods to it:

  getToken:     (videoId) => apiClient(`/videos/${videoId}/token`),
  getThumbnail: (videoId) => apiClient(`/videos/${videoId}/thumbnail`),
  createYouTube: (data)   => apiClient('/videos/youtube', { method: 'POST', body: JSON.stringify(data) }),

Then at the END of the file, add this new export:

export const liveClassApi = {
  getByClass:    (classId)     => apiClient(`/live-classes?class_id=${classId}`),
  create:        (data)        => apiClient('/live-classes', { method: 'POST', body: JSON.stringify(data) }),
  getJoinToken:  (id)          => apiClient(`/live-classes/${id}/join-token`),
  end:           (id)          => apiClient(`/live-classes/${id}/end`, { method: 'POST' }),
  cancel:        (id)          => apiClient(`/live-classes/${id}/cancel`, { method: 'POST' }),
  getAttendance: (id)          => apiClient(`/live-classes/${id}/attendance`),
};

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — Add "Live" tab to bottom nav (both portals)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE: frontend/src/components/shared/BottomNav.jsx

CURRENT import line:
  import { Home, BookOpen, Users, MessageSquare, MoreHorizontal, FileQuestion, Trophy, Calendar } from 'lucide-react';

REPLACE with (adds Video):
  import { Home, BookOpen, Users, MessageSquare, MoreHorizontal, FileQuestion, Trophy, Calendar, Video } from 'lucide-react';

CURRENT TEACHER_ITEMS (5 items):
  const TEACHER_ITEMS = [
    { id: 'today',      label: 'Home',       icon: Home },
    { id: 'subjects',   label: 'Classes',    icon: BookOpen },
    { id: 'broadcasts', label: 'Broadcasts', icon: MessageSquare },
    { id: 'attendance', label: 'Attendance', icon: Calendar },
    { id: 'more',       label: 'More',       icon: MoreHorizontal },
  ];

REPLACE with (6 items — Live added before More):
  const TEACHER_ITEMS = [
    { id: 'today',      label: 'Home',       icon: Home },
    { id: 'subjects',   label: 'Classes',    icon: BookOpen },
    { id: 'broadcasts', label: 'Broadcasts', icon: MessageSquare },
    { id: 'attendance', label: 'Attendance', icon: Calendar },
    { id: 'live',       label: 'Live',       icon: Video },
    { id: 'more',       label: 'More',       icon: MoreHorizontal },
  ];

CURRENT STUDENT_ITEMS (5 items):
  const STUDENT_ITEMS = [
    { id: 'home',       label: 'Home',       icon: Home },
    { id: 'subjects',   label: 'Subjects',   icon: BookOpen },
    { id: 'broadcasts', label: 'Broadcasts', icon: MessageSquare },
    { id: 'profile',    label: 'Profile',    icon: Users },
    { id: 'more',       label: 'More',       icon: MoreHorizontal },
  ];

REPLACE with (6 items — Live added between Broadcasts and Profile):
  const STUDENT_ITEMS = [
    { id: 'home',       label: 'Home',       icon: Home },
    { id: 'subjects',   label: 'Subjects',   icon: BookOpen },
    { id: 'broadcasts', label: 'Broadcasts', icon: MessageSquare },
    { id: 'live',       label: 'Live',       icon: Video },
    { id: 'profile',    label: 'Profile',    icon: Users },
    { id: 'more',       label: 'More',       icon: MoreHorizontal },
  ];

The nav item render loop already uses flex-1 so it auto-distributes width.
The label already uses text-[10px] so 6 items fit without overflow.
No other changes needed in this file.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — Update TeacherLayout.jsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE: frontend/src/pages/teacher/TeacherLayout.jsx

CURRENT getActiveTab function:
  function getActiveTab(path) {
    if (path === '/teacher' || path === '/teacher/') return 'today';
    if (path.startsWith('/teacher/subjects'))    return 'subjects';
    if (path.startsWith('/teacher/attendance'))  return 'attendance';
    if (path.startsWith('/teacher/broadcasts'))  return 'broadcasts';
    if (path.startsWith('/teacher/more') || path.startsWith('/teacher/students')) return 'more';
    return 'home';
  }

REPLACE with (adds live-classes case):
  function getActiveTab(path) {
    if (path === '/teacher' || path === '/teacher/') return 'today';
    if (path.startsWith('/teacher/subjects'))         return 'subjects';
    if (path.startsWith('/teacher/attendance'))       return 'attendance';
    if (path.startsWith('/teacher/broadcasts'))       return 'broadcasts';
    if (path.startsWith('/teacher/live-classes'))     return 'live';
    if (path.startsWith('/teacher/more') || path.startsWith('/teacher/students')) return 'more';
    return 'home';
  }

CURRENT routes object inside setActive:
    const routes = {
      today:      '/teacher',
      subjects:   '/teacher/subjects',
      attendance: '/teacher/attendance',
      broadcasts: '/teacher/broadcasts',
      more:       '/teacher/more'
    };

REPLACE with (adds live entry):
    const routes = {
      today:      '/teacher',
      subjects:   '/teacher/subjects',
      attendance: '/teacher/attendance',
      broadcasts: '/teacher/broadcasts',
      live:       '/teacher/live-classes',
      more:       '/teacher/more'
    };

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — Update StudentLayout.jsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE: frontend/src/pages/student/StudentLayout.jsx

CURRENT getActiveTab function:
  function getActiveTab(path) {
    if (path === '/student' || path === '/student/') return 'home';
    if (path.startsWith('/student/subjects'))     return 'subjects';
    if (path.startsWith('/student/broadcasts'))   return 'broadcasts';
    if (path.startsWith('/student/profile'))      return 'profile';
    if (path.startsWith('/student/more') || path.startsWith('/student/tests') || path.startsWith('/student/leaderboard')) return 'more';
    return 'home';
  }

REPLACE with (adds live-classes case):
  function getActiveTab(path) {
    if (path === '/student' || path === '/student/') return 'home';
    if (path.startsWith('/student/subjects'))         return 'subjects';
    if (path.startsWith('/student/broadcasts'))       return 'broadcasts';
    if (path.startsWith('/student/live-classes'))     return 'live';
    if (path.startsWith('/student/profile'))          return 'profile';
    if (path.startsWith('/student/more') || path.startsWith('/student/tests') || path.startsWith('/student/leaderboard')) return 'more';
    return 'home';
  }

CURRENT map object inside setActive:
    const map = {
      home: '/student',
      subjects: '/student/subjects',
      broadcasts: '/student/broadcasts',
      profile: '/student/profile',
      more: '/student/more'
    };

REPLACE with (adds live entry):
    const map = {
      home:       '/student',
      subjects:   '/student/subjects',
      broadcasts: '/student/broadcasts',
      live:       '/student/live-classes',
      profile:    '/student/profile',
      more:       '/student/more'
    };

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6 — Update App.jsx (add routes + imports)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE: frontend/src/App.jsx

After the existing import for AttendancePage (line 23), add:
  import TeacherLiveClassesPage from './pages/teacher/TeacherLiveClassesPage';

After the existing import for StudentLeaderboardPage (line 37), add:
  import StudentLiveClassesPage from './pages/student/StudentLiveClassesPage';

In the teacher <Route> block, after the existing line:
  <Route path="attendance" element={<AttendancePage />} />
Add:
  <Route path="live-classes" element={<TeacherLiveClassesPage />} />

In the student <Route> block, after the existing line:
  <Route path="leaderboard" element={<StudentLeaderboardPage />} />
Add:
  <Route path="live-classes" element={<StudentLiveClassesPage />} />

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 7 — VideoAddModal in SubjectDetailPage.jsx (two tabs)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE: frontend/src/pages/teacher/SubjectDetailPage.jsx

The existing UploadVideoModal component handles direct file upload with XHR progress.
Rename it to VideoAddModal and wrap it with a two-tab interface.

─── 7-A: Rename and add tab state ──────────────────────────────────

Change the function declaration from:
  function UploadVideoModal({ classId, subjectName, open, onClose, onAdded })
To:
  function VideoAddModal({ classId, subjectName, open, onClose, onAdded })

Add these new state variables at the TOP of the component (before the existing upload state):
  const [activeTab, setActiveTab] = useState('youtube');

  // YouTube tab state
  const [youtubeUrl, setYoutubeUrl]             = useState('');
  const [ytVideoId, setYtVideoId]               = useState(null);
  const [ytPreviewTitle, setYtPreviewTitle]     = useState('');
  const [ytPreviewLoading, setYtPreviewLoading] = useState(false);
  const [ytPreviewError, setYtPreviewError]     = useState(null);
  const [ytTitle, setYtTitle]                   = useState('');
  const [ytDescription, setYtDescription]       = useState('');
  const [ytAdding, setYtAdding]                 = useState(false);
  const debounceRef                             = useRef(null);

Add useRef to the React import if it is not already there.

─── 7-B: Add YouTube helper functions inside VideoAddModal ─────────

Add these functions inside the component body, before the return statement:

  function extractYouTubeId(url) {
    const patterns = [
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  }

  async function fetchYtPreview(url) {
    const id = extractYouTubeId(url);
    if (!id) {
      setYtPreviewError('Invalid YouTube URL. Use youtube.com/watch?v=... or youtu.be/...');
      setYtVideoId(null);
      return;
    }
    setYtVideoId(id);
    setYtPreviewLoading(true);
    setYtPreviewError(null);
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
      if (!res.ok) throw new Error('inaccessible');
      const data = await res.json();
      setYtPreviewTitle(data.title || '');
      setYtTitle(data.title || '');
    } catch {
      setYtPreviewError("Could not load preview. Make sure the video is set to Unlisted (not Private) on YouTube.");
      setYtVideoId(null);
    } finally {
      setYtPreviewLoading(false);
    }
  }

  function onYoutubeUrlChange(e) {
    const url = e.target.value;
    setYoutubeUrl(url);
    setYtVideoId(null);
    setYtPreviewError(null);
    setYtPreviewTitle('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (url.trim()) {
      debounceRef.current = setTimeout(() => fetchYtPreview(url.trim()), 600);
    }
  }

  async function handleAddYouTubeVideo() {
    if (!ytVideoId || !ytTitle.trim() || ytAdding) return;
    setYtAdding(true);
    try {
      await apiClient('/videos/youtube', {
        method: 'POST',
        body: JSON.stringify({
          class_id: classId,
          title: ytTitle.trim(),
          description: ytDescription.trim() || null,
          youtube_video_id: ytVideoId,
          youtube_url: youtubeUrl,
        }),
      });
      onAdded();
      onClose();
      resetYt();
    } catch {
      setYtPreviewError('Failed to add video. Please try again.');
    } finally {
      setYtAdding(false);
    }
  }

  function resetYt() {
    setYoutubeUrl(''); setYtVideoId(null); setYtPreviewTitle('');
    setYtPreviewError(null); setYtTitle(''); setYtDescription('');
    setYtAdding(false);
  }

─── 7-C: Wrap the modal body with tabs ─────────────────────────────

The existing return statement returns a <Modal> with the upload form directly inside.
Wrap its contents with the tab switcher. The FULL new return should be:

  return (
    <Modal open={open} onClose={onClose} title="Add video" size="md">

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg mb-5">
        {['youtube', 'upload'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {tab === 'youtube' ? 'YouTube link' : 'Upload file'}
          </button>
        ))}
      </div>

      {/* ── YOUTUBE TAB ── */}
      {activeTab === 'youtube' && (
        <div className="space-y-4">

          {/* Amber warning */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 leading-relaxed">
            <strong>Important:</strong> Set your YouTube video to <strong>Unlisted</strong> — not Private.
            Unlisted videos are hidden from YouTube search. Students only watch inside this app — they never see the URL.
          </div>

          {/* URL input */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">YouTube video URL</label>
            <input
              type="url"
              value={youtubeUrl}
              onChange={onYoutubeUrlChange}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
            />
          </div>

          {ytPreviewLoading && (
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <div className="w-4 h-4 border-2 border-neutral-200 border-t-neutral-500 rounded-full animate-spin" />
              Checking video...
            </div>
          )}

          {ytPreviewError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{ytPreviewError}</p>
          )}

          {ytVideoId && !ytPreviewError && !ytPreviewLoading && (
            <div className="flex gap-3 p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
              <img
                src={`https://img.youtube.com/vi/${ytVideoId}/mqdefault.jpg`}
                alt="preview"
                className="w-28 flex-shrink-0 rounded-md object-cover"
                style={{ aspectRatio: '16/9' }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800 truncate">{ytPreviewTitle}</p>
                <span className="inline-flex items-center gap-1 mt-1 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                  ✓ Unlisted — ready to add
                </span>
              </div>
            </div>
          )}

          {ytVideoId && !ytPreviewError && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Title</label>
                <input
                  type="text"
                  value={ytTitle}
                  onChange={e => setYtTitle(e.target.value)}
                  placeholder="Video title"
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Description (optional)</label>
                <textarea
                  value={ytDescription}
                  onChange={e => setYtDescription(e.target.value)}
                  placeholder="What this video covers..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                />
              </div>
              <p className="text-xs text-neutral-400">Download not available for YouTube videos.</p>
              <Btn
                onClick={handleAddYouTubeVideo}
                disabled={!ytVideoId || !ytTitle.trim() || ytAdding}
                className="w-full"
              >
                {ytAdding ? 'Adding...' : 'Add video'}
              </Btn>
            </>
          )}
        </div>
      )}

      {/* ── UPLOAD TAB — keep ALL existing upload JSX here exactly as it was ── */}
      {activeTab === 'upload' && (
        <div>
          {/* PASTE the ENTIRE existing upload form body here unchanged.
              All existing state (file, title, description, allowDownload, progress, error),
              all existing handlers (handleUpload, handleFileChange etc.),
              and all existing JSX (file picker, progress bar, submit button)
              stay EXACTLY the same — just moved inside this div. */}
        </div>
      )}

    </Modal>
  );

─── 7-D: Replace references and rename button ───────────────────────

1. Find every occurrence of <UploadVideoModal in SubjectDetailPage.jsx and replace with <VideoAddModal
2. Find the button that opens the modal (it likely says "Upload" or has an Upload icon) and change its label to "Add video"
3. No other state, handler, or logic changes needed

─── 7-E: Show YT thumbnail + badge in teacher video list ────────────

In SubjectDetailPage.jsx, inside the component that renders the video list (the Videos tab),
add a thumbnails state:
  const [thumbUrls, setThumbUrls] = useState({});

After the call that sets the videos array (inside fetchVideosData or equivalent), add:
  async function loadThumbsForTeacher(list) {
    const yt = list.filter(v => v.source_type === 'youtube');
    if (!yt.length) return;
    const pairs = await Promise.all(yt.map(async v => {
      try { const r = await apiClient(`/videos/${v.id}/thumbnail`); return [v.id, r.thumbnail_url]; }
      catch { return [v.id, null]; }
    }));
    setThumbUrls(Object.fromEntries(pairs));
  }
  // call: loadThumbsForTeacher(fetchedVideos)

In the video list row JSX, BEFORE the title text, insert a small thumbnail/placeholder:
  <div className="flex-shrink-0 w-14 rounded overflow-hidden bg-neutral-100 relative" style={{aspectRatio:'16/9'}}>
    {v.source_type === 'youtube' && thumbUrls[v.id]
      ? <img src={thumbUrls[v.id]} alt="" className="w-full h-full object-cover" />
      : <div className="w-full h-full flex items-center justify-center"><Play size={11} className="text-neutral-400" /></div>
    }
    {v.source_type === 'youtube' && (
      <span className="absolute bottom-0.5 right-0.5 text-[8px] px-1 bg-red-600 text-white rounded font-bold leading-tight">YT</span>
    )}
  </div>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 8 — Student video thumbnail card grid (StudentSubjectViewPage.jsx)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE: frontend/src/pages/student/StudentSubjectViewPage.jsx

The Videos tab currently renders a plain list of video rows (play icon + title + completion icon).
Replace the entire video list with a thumbnail card grid.

Add state:
  const [thumbUrls, setThumbUrls] = useState({});

Add useEffect after videos state is populated:
  useEffect(() => {
    async function load() {
      const yt = (videos || []).filter(v => v.source_type === 'youtube');
      if (!yt.length) return;
      const pairs = await Promise.all(yt.map(async v => {
        try { const r = await apiClient(`/videos/${v.id}/thumbnail`); return [v.id, r.thumbnail_url || null]; }
        catch { return [v.id, null]; }
      }));
      setThumbUrls(Object.fromEntries(pairs));
    }
    load();
  }, [videos]);

Make sure CheckCircle is imported from lucide-react.

Replace the video list JSX entirely with this card grid:

  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {videos.map(v => {
      const isYT = v.source_type === 'youtube';
      const thumb = isYT ? (thumbUrls[v.id] || null) : null;
      const pct = v.progress_secs && v.duration_secs
        ? Math.min(100, Math.round((v.progress_secs / v.duration_secs) * 100)) : 0;
      return (
        <button
          key={v.id}
          onClick={() => navigate(`/student/subjects/${classId}/video/${v.id}`)}
          className="group text-left rounded-xl overflow-hidden border border-neutral-200 bg-white hover:shadow-md transition-all duration-200 active:scale-[0.98]"
        >
          {/* Thumbnail */}
          <div className="relative overflow-hidden bg-neutral-900" style={{ aspectRatio: '16/9' }}>
            {thumb
              ? <img src={thumb} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              : <div className="w-full h-full flex items-center justify-center bg-neutral-900"><Play size={28} className="text-white/40" /></div>
            }
            {/* Play overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${thumb ? 'bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 group-hover:scale-110' : 'bg-white/10 opacity-100'}`}>
                <Play size={20} className="text-white" fill="white" />
              </div>
            </div>
            {/* Duration */}
            {v.duration_secs > 0 && (
              <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-medium pointer-events-none">
                {Math.floor(v.duration_secs / 60)}:{String(v.duration_secs % 60).padStart(2, '0')}
              </div>
            )}
            {/* Completed badge */}
            {v.my_completed && (
              <div className="absolute top-2 left-2 flex items-center gap-1 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded font-medium pointer-events-none">
                <CheckCircle size={9} /> Done
              </div>
            )}
            {/* YT badge */}
            {isYT && (
              <div className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 bg-red-600 text-white rounded font-bold pointer-events-none">YT</div>
            )}
            {/* Progress strip */}
            {pct > 0 && !v.my_completed && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 pointer-events-none">
                <div className="h-full bg-white" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
          {/* Footer */}
          <div className="p-3">
            <p className="text-sm font-medium text-neutral-900 line-clamp-2 leading-snug">{v.title}</p>
            {v.description && <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{v.description}</p>}
          </div>
        </button>
      );
    })}
  </div>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 9 — YouTube IFrame player in StudentVideoPlayerPage.jsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE: frontend/src/pages/student/StudentVideoPlayerPage.jsx

The existing player supports Cloudflare Stream, HTML5, and offline blob.
Add a 4th mode: YouTube IFrame Player API.
The mode is detected by video.source_type === 'youtube'.

─── 9-A: Add state + refs ──────────────────────────────────────────

Inside the component, add:
  const [ytToken, setYtToken]               = useState(null);
  const [ytPlayerReady, setYtPlayerReady]   = useState(false);
  const [ytError, setYtError]               = useState(null);
  const ytPlayerRef    = useRef(null);
  const ytTimerRef     = useRef(null);

─── 9-B: Fetch token when video is YouTube ─────────────────────────

After the useEffect that fetches the video object, add:

  useEffect(() => {
    if (video?.source_type !== 'youtube') return;
    apiClient(`/videos/${videoId}/token`)
      .then(r => setYtToken(r.token))
      .catch(err => setYtError(
        (err?.status === 403 || String(err).includes('403'))
          ? 'You do not have access to this video.'
          : 'Could not load video. Please try again.'
      ));
  }, [video?.source_type, videoId]);

─── 9-C: Load YouTube IFrame API + init player ─────────────────────

  useEffect(() => {
    if (!ytToken) return;
    function loadApi() {
      return new Promise(resolve => {
        if (window.YT?.Player) { resolve(); return; }
        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
          const s = document.createElement('script');
          s.src = 'https://www.youtube.com/iframe_api';
          document.head.appendChild(s);
        }
        window.onYouTubeIframeAPIReady = resolve;
        if (window.YT?.Player) resolve();
      });
    }
    loadApi().then(() => {
      ytPlayerRef.current = new window.YT.Player('yt-player-mount', {
        videoId: ytToken,
        width: '100%', height: '100%',
        playerVars: { rel: 0, modestbranding: 1, fs: 1, iv_load_policy: 3, controls: 1 },
        events: {
          onReady: e => {
            setYtPlayerReady(true);
            const saved = progress?.progress_secs || 0;
            if (saved > 30) e.target.seekTo(saved, true);
          },
          onStateChange: e => {
            const S = window.YT.PlayerState;
            if (e.data === S.PLAYING) startYtTimer(e.target);
            else stopYtTimer();
            if (e.data === S.ENDED) markComplete();
          },
          onError: () => setYtError('Video cannot be played. Make sure the video is Unlisted on YouTube.'),
        },
      });
    });
    return () => { stopYtTimer(); ytPlayerRef.current?.destroy?.(); };
  }, [ytToken]);

  function startYtTimer(player) {
    stopYtTimer();
    ytTimerRef.current = setInterval(async () => {
      try {
        const cur = Math.floor(player.getCurrentTime());
        const dur = Math.floor(player.getDuration());
        await apiClient('/video-progress', {
          method: 'POST',
          body: JSON.stringify({ video_id: videoId, progress_secs: cur }),
        });
        if (dur > 0 && cur / dur >= 0.9 && !completed) markComplete();
      } catch { /* silent */ }
    }, 5000);
  }

  function stopYtTimer() {
    if (ytTimerRef.current) { clearInterval(ytTimerRef.current); ytTimerRef.current = null; }
  }

Note: markComplete() and the completed state variable already exist in the component.
Do NOT redefine them. Reuse the existing ones.
Make sure ArrowLeft and CheckCircle are imported from lucide-react.

─── 9-D: Add YouTube render branch ────────────────────────────────

BEFORE the existing player render logic (the if/else checking for cloudflare_video_id etc.),
add this block at the very top of the return statement:

  if (video?.source_type === 'youtube') {
    return (
      <div className="min-h-screen bg-black flex flex-col">
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 z-20 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="w-full bg-black relative" style={{ aspectRatio: '16/9' }}>
          {ytError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
              <p className="text-white/70 text-sm">{ytError}</p>
              <button onClick={() => navigate(-1)} className="text-white/50 text-xs underline mt-1">Go back</button>
            </div>
          ) : (
            <>
              {!ytPlayerReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              )}
              <div id="yt-player-mount" className="w-full h-full" />
            </>
          )}
        </div>

        <div className="flex-1 bg-[#FAFAF9] px-4 py-4 space-y-2">
          <h1 className="text-base font-semibold text-neutral-900">{video.title}</h1>
          {video.description && <p className="text-sm text-neutral-500 leading-relaxed">{video.description}</p>}
          {completed && (
            <div className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
              <CheckCircle size={14} /> Completed · +10 points
            </div>
          )}
        </div>
      </div>
    );
  }
  // existing Cloudflare / HTML5 / offline render continues below...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 10 — Create ZoomMeetingView component
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE FILE: frontend/src/components/ZoomMeetingView.jsx

This is a shared component used by both teacher and student portals.
It renders a Zoom meeting full-screen inside the app using the Zoom Web SDK.
Props: { meeting_id, signature, sdk_key, role (0|1), display_name, onLeave }

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, AlertCircle } from 'lucide-react';

export default function ZoomMeetingView({ meeting_id, signature, sdk_key, role, display_name, onLeave }) {
  const [status, setStatus] = useState('loading'); // 'loading' | 'joining' | 'joined' | 'error'
  const [error, setError]   = useState(null);
  const initialized         = useRef(false);
  const zoomRef             = useRef(null);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    startZoom();
    return () => { try { zoomRef.current?.leaveMeeting({}); } catch { } };
  }, []);

  async function startZoom() {
    try {
      const { ZoomMtg } = await import('@zoom/meetingsdk');
      zoomRef.current = ZoomMtg;
      ZoomMtg.setZoomJSLib('https://source.zoom.us/3.x.x/lib', '/av');
      ZoomMtg.preLoadWasm();
      ZoomMtg.prepareWebSDK();
      setStatus('joining');
      ZoomMtg.init({
        leaveUrl: window.location.href,
        patchJsMedia: true,
        success: () => {
          ZoomMtg.join({
            meetingNumber: meeting_id,
            userName: display_name,
            signature: signature,
            sdkKey: sdk_key,
            passWord: '',
            success: () => setStatus('joined'),
            error: e => { setError(e?.errorMessage || e?.reason || 'Could not join the meeting.'); setStatus('error'); },
          });
        },
        error: e => { setError(e?.errorMessage || 'Could not initialize Zoom.'); setStatus('error'); },
      });
    } catch (err) {
      setError('Failed to load Zoom. Check your internet connection and try again.');
      setStatus('error');
    }
  }

  function handleLeave() {
    try { zoomRef.current?.leaveMeeting({ success: onLeave, error: onLeave }); }
    catch { onLeave(); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Leave button — always on top */}
      <button
        onClick={handleLeave}
        className="absolute top-4 left-4 z-[60] flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-sm text-white text-sm rounded-full hover:bg-black/80 transition-colors"
      >
        <ArrowLeft size={14} /> Leave
      </button>

      {/* Loading */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Loading Zoom...</p>
        </div>
      )}

      {/* Joining */}
      {status === 'joining' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Connecting to class...</p>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <AlertCircle size={36} className="text-red-400" />
          <p className="text-white text-sm leading-relaxed">{error}</p>
          <button onClick={onLeave} className="mt-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg">Go back</button>
        </div>
      )}

      {/* Zoom SDK mounts here */}
      <div id="zmmtg-root" className="w-full h-full" />
    </div>
  );
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 11 — Create TeacherLiveClassesPage.jsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE FILE: frontend/src/pages/teacher/TeacherLiveClassesPage.jsx

Imports needed:
  import React, { useState, useEffect, useCallback, useRef } from 'react';
  import { useNavigate } from 'react-router-dom';
  import { Video, Calendar, Clock, Users, Plus, CheckCircle, AlertCircle, X } from 'lucide-react';
  import { Btn, Tag, Modal, Sheet, Avatar } from '../../components/ui';
  import { apiClient, liveClassApi } from '../../lib/api';
  import { useAppCache } from '../../store';
  import TopBar from '../../components/shared/TopBar';
  import ZoomMeetingView from '../../components/ZoomMeetingView';

─── TeacherLiveClassesPage (default export) ────────────────────────

export default function TeacherLiveClassesPage() {
  const { subjects } = useAppCache();
  const [liveClasses, setLiveClasses] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [activeJoin, setActiveJoin]     = useState(null);   // join-token response
  const [attSheetId, setAttSheetId]     = useState(null);   // live_class_id to view attendance

  const fetchAll = useCallback(async () => {
    if (!subjects?.length) return;
    setLoading(true);
    try {
      const results = await Promise.all(
        subjects.map(s => liveClassApi.getByClass(s.id).catch(() => []))
      );
      const flat = results
        .flatMap((list, i) => list.map(lc => ({ ...lc, subject: subjects[i] })))
        .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
      setLiveClasses(flat);
    } finally { setLoading(false); }
  }, [subjects]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleStart(lc) {
    try { setActiveJoin(await liveClassApi.getJoinToken(lc.id)); }
    catch (e) { alert('Could not start class: ' + (e?.message || 'Error')); }
  }

  async function handleEnd(lc) {
    if (!window.confirm('End this class and pull attendance?')) return;
    try { await liveClassApi.end(lc.id); fetchAll(); }
    catch (e) { alert('Failed to end: ' + (e?.message || 'Error')); }
  }

  async function handleCancel(lc) {
    if (!window.confirm('Cancel this class?')) return;
    await liveClassApi.cancel(lc.id);
    fetchAll();
  }

  function fmt(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
      + ' at ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function minsUntil(iso) { return Math.round((new Date(iso) - Date.now()) / 60000); }

  const statusColor = { scheduled: 'amber', live: 'green', ended: 'gray', cancelled: 'red' };

  if (activeJoin) {
    return <ZoomMeetingView {...activeJoin} onLeave={() => { setActiveJoin(null); fetchAll(); }} />;
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] pb-24">
      <TopBar title="Live Classes" action={
        <Btn size="sm" onClick={() => setScheduleOpen(true)}>
          <Plus size={14} className="mr-1" /> Schedule
        </Btn>
      } />

      <div className="px-4 pt-2 space-y-3">
        {loading && [1,2,3].map(i => (
          <div key={i} className="h-28 rounded-xl bg-neutral-200 animate-pulse" />
        ))}

        {!loading && liveClasses.length === 0 && (
          <div className="text-center py-16">
            <Video size={40} className="mx-auto text-neutral-300 mb-3" />
            <p className="text-sm text-neutral-500 mb-4">No live classes scheduled yet</p>
            <Btn size="sm" onClick={() => setScheduleOpen(true)}>Schedule first class</Btn>
          </div>
        )}

        {liveClasses.map(lc => {
          const mu = minsUntil(lc.scheduled_at);
          const canStart = lc.status === 'scheduled' && mu <= 15 && mu > -120;
          return (
            <div key={lc.id} className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-neutral-900">{lc.title}</p>
                    <Tag color={statusColor[lc.status] || 'gray'}>
                      {lc.status === 'live' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1 animate-pulse" />}
                      {lc.status.charAt(0).toUpperCase() + lc.status.slice(1)}
                    </Tag>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">{lc.subject?.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-neutral-500 flex-wrap">
                <span className="flex items-center gap-1"><Calendar size={11} />{fmt(lc.scheduled_at)}</span>
                <span className="flex items-center gap-1"><Clock size={11} />{lc.duration_mins} min</span>
                {lc.status === 'ended' && lc.total_registered > 0 && (
                  <span className="flex items-center gap-1 text-green-700">
                    <Users size={11} />{lc.attended_count}/{lc.total_registered} attended
                  </span>
                )}
              </div>

              <div className="flex gap-2 flex-wrap items-center">
                {lc.status === 'scheduled' && canStart && (
                  <Btn size="sm" onClick={() => handleStart(lc)}>Start class</Btn>
                )}
                {lc.status === 'scheduled' && !canStart && mu > 15 && (
                  <p className="text-xs text-neutral-400">Starts in {mu} min</p>
                )}
                {lc.status === 'scheduled' && (
                  <Btn size="sm" variant="ghost" onClick={() => handleCancel(lc)}>Cancel</Btn>
                )}
                {lc.status === 'live' && (
                  <>
                    <Btn size="sm" onClick={() => handleStart(lc)}>Join class</Btn>
                    <Btn size="sm" variant="dangerSolid" onClick={() => handleEnd(lc)}>End class</Btn>
                  </>
                )}
                {lc.status === 'ended' && (
                  <Btn size="sm" variant="ghost" onClick={() => setAttSheetId(lc.id)}>View attendance</Btn>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        subjects={subjects || []}
        onDone={() => { setScheduleOpen(false); fetchAll(); }}
      />

      {attSheetId && (
        <AttendanceSheet liveClassId={attSheetId} onClose={() => setAttSheetId(null)} />
      )}
    </div>
  );
}

─── ScheduleModal (local component in same file) ────────────────────

function ScheduleModal({ open, onClose, subjects, onDone }) {
  const [classId, setClassId]   = useState('');
  const [title, setTitle]       = useState('');
  const [date, setDate]         = useState('');
  const [time, setTime]         = useState('');
  const [duration, setDuration] = useState(60);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const today = new Date().toISOString().split('T')[0];

  async function submit(e) {
    e.preventDefault();
    if (!classId || !title.trim() || !date || !time) { setError('All fields are required'); return; }
    setLoading(true); setError('');
    try {
      await liveClassApi.create({ class_id: classId, title: title.trim(), scheduled_at: `${date}T${time}:00`, duration_mins: duration });
      onDone();
      setClassId(''); setTitle(''); setDate(''); setTime(''); setDuration(60);
    } catch (e) {
      setError(e?.message || 'Failed to schedule. Check Zoom credentials in backend/.env');
    } finally { setLoading(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Schedule live class" size="md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Subject</label>
          <select value={classId} onChange={e => setClassId(e.target.value)} required
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20">
            <option value="">Select subject...</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Class title</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} required
            placeholder="e.g. Chapter 5 Live Revision"
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20" />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-neutral-500 mb-1">Date</label>
            <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20" />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-neutral-500 mb-1">Time</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Duration</label>
          <select value={duration} onChange={e => setDuration(Number(e.target.value))}
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20">
            {[30,45,60,90,120].map(d => <option key={d} value={d}>{d < 60 ? `${d} minutes` : d === 60 ? '1 hour' : `${d/60} hours`}</option>)}
          </select>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
        <Btn type="submit" disabled={loading} className="w-full">
          {loading ? 'Creating Zoom meeting...' : 'Schedule class'}
        </Btn>
      </form>
    </Modal>
  );
}

─── AttendanceSheet (local component in same file) ──────────────────

function AttendanceSheet({ liveClassId, onClose }) {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    liveClassApi.getAttendance(liveClassId)
      .then(d => setData(d || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [liveClassId]);

  const attended = data.filter(a => a.attended);
  const absent   = data.filter(a => !a.attended);

  function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  return (
    <Sheet open onClose={onClose} title="Attendance">
      <div className="space-y-4">
        <div className="flex gap-4 p-3 bg-neutral-50 rounded-lg text-sm">
          <span className="text-green-700 font-medium">{attended.length} attended</span>
          <span className="text-neutral-400">·</span>
          <span className="text-red-600 font-medium">{absent.length} absent</span>
        </div>
        {loading && [1,2,3,4].map(i => <div key={i} className="h-12 bg-neutral-100 rounded-lg animate-pulse" />)}
        {!loading && data.map(a => (
          <div key={a.id} className="flex items-center gap-3 py-1.5">
            <Avatar name={a.students?.name || '?'} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900">{a.students?.name}</p>
              {a.attended && a.joined_at && (
                <p className="text-xs text-neutral-500">Joined {fmtTime(a.joined_at)}{a.duration_mins ? ` · ${a.duration_mins} min` : ''}</p>
              )}
            </div>
            {a.attended
              ? <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium flex items-center gap-1"><CheckCircle size={10} /> Attended</span>
              : <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded font-medium flex items-center gap-1"><AlertCircle size={10} /> Absent</span>
            }
          </div>
        ))}
      </div>
    </Sheet>
  );
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 12 — Create StudentLiveClassesPage.jsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE FILE: frontend/src/pages/student/StudentLiveClassesPage.jsx

Imports:
  import React, { useState, useEffect, useCallback } from 'react';
  import { Video, Calendar, Clock, CheckCircle } from 'lucide-react';
  import { Btn } from '../../components/ui';
  import { apiClient, liveClassApi } from '../../lib/api';
  import { useAuthStore } from '../../lib/auth';
  import TopBar from '../../components/shared/TopBar';
  import ZoomMeetingView from '../../components/ZoomMeetingView';

export default function StudentLiveClassesPage() {
  const { user }                          = useAuthStore();
  const [classes, setClasses]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [activeJoin, setActiveJoin]       = useState(null);
  const [now, setNow]                     = useState(Date.now());

  // Refresh 'now' every 30 s so countdowns stay accurate
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const fetchAll = useCallback(async () => {
    if (!user?.standard_id) return;
    setLoading(true);
    try {
      const subs = await apiClient(`/subjects?standard_id=${user.standard_id}`);
      const results = await Promise.all(
        (subs || []).map(s => liveClassApi.getByClass(s.id).catch(() => []))
      );
      const flat = results
        .flatMap((list, i) => list.map(lc => ({ ...lc, subject: subs[i] })))
        .filter(lc => lc.status !== 'cancelled')
        .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
      setClasses(flat);
    } finally { setLoading(false); }
  }, [user?.standard_id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleJoin(lc) {
    try { setActiveJoin(await liveClassApi.getJoinToken(lc.id)); }
    catch (e) { alert('Could not join: ' + (e?.message || 'Error')); }
  }

  function countdown(iso) {
    const diff = new Date(iso) - now;
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `Starts in ${h}h ${m}m` : m > 0 ? `Starts in ${m}m` : 'Starting now';
  }

  function canJoin(lc) {
    if (lc.status === 'live') return true;
    if (lc.status === 'scheduled') {
      const m = (new Date(lc.scheduled_at) - now) / 60000;
      return m <= 5 && m > -120;
    }
    return false;
  }

  function fmt(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
      + ' at ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  if (activeJoin) {
    return <ZoomMeetingView {...activeJoin} onLeave={() => { setActiveJoin(null); fetchAll(); }} />;
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] pb-24">
      <TopBar title="Live Classes" />
      <div className="px-4 pt-2 space-y-3">
        {loading && [1,2,3].map(i => (
          <div key={i} className="h-28 rounded-xl bg-neutral-200 animate-pulse" />
        ))}

        {!loading && classes.length === 0 && (
          <div className="text-center py-16">
            <Video size={40} className="mx-auto text-neutral-300 mb-3" />
            <p className="text-sm text-neutral-500">No live classes scheduled yet</p>
          </div>
        )}

        {classes.map(lc => {
          const cd = lc.status === 'scheduled' ? countdown(lc.scheduled_at) : null;
          const joinable = canJoin(lc);
          return (
            <div key={lc.id} className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-neutral-900">{lc.title}</p>
                  {lc.status === 'live' && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live now
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">{lc.subject?.name}</p>
              </div>

              <div className="flex items-center gap-4 text-xs text-neutral-500 flex-wrap">
                <span className="flex items-center gap-1"><Calendar size={11} />{fmt(lc.scheduled_at)}</span>
                <span className="flex items-center gap-1"><Clock size={11} />{lc.duration_mins} min</span>
              </div>

              {lc.status === 'scheduled' && cd && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 font-medium">{cd}</p>
              )}

              {joinable && (
                <Btn size="sm" onClick={() => handleJoin(lc)}>
                  {lc.status === 'live' ? 'Join live class' : 'Join class'}
                </Btn>
              )}

              {lc.status === 'ended' && (
                <p className={`text-xs font-medium flex items-center gap-1 ${lc.my_attended ? 'text-green-700' : 'text-neutral-400'}`}>
                  {lc.my_attended === true
                    ? <><CheckCircle size={12} /> You attended ✓</>
                    : lc.my_attended === false
                    ? 'You missed this class'
                    : 'Class ended'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFICATION — Run ALL of these after completing all 12 steps
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Start the dev server: cd frontend && npm run dev

─── API wiring ──────────────────────────────────────────────────────
✓ videoApi.getToken, videoApi.getThumbnail, videoApi.createYouTube exist in api.js
✓ liveClassApi is exported from api.js

─── Navigation ──────────────────────────────────────────────────────
✓ Teacher portal bottom nav shows 6 tabs: Home · Classes · Broadcasts · Attendance · Live · More
✓ Student portal bottom nav shows 6 tabs: Home · Subjects · Broadcasts · Live · Profile · More
✓ Clicking "Live" highlights that tab and navigates to the correct page
✓ All other nav tabs still work (no regressions)

─── Video upload modal ──────────────────────────────────────────────
✓ Teacher → any subject → Videos tab → "Add video" button (not "Upload")
✓ Modal opens with two tabs: "YouTube link" (default) and "Upload file"
✓ Amber info box about Unlisted is visible in the YouTube tab
✓ Paste https://www.youtube.com/watch?v=jNQXAC9IVRw →
    thumbnail loads + "Me at the zoo" auto-fills title after ~600ms
✓ Paste a Private video URL → error shown, no thumbnail
✓ Click "Add video" → video appears in list with red YT badge + thumbnail
✓ Upload tab still works exactly as before

─── Student video grid ──────────────────────────────────────────────
✓ Student → any subject → Videos tab shows thumbnail card grid (not plain list)
✓ YouTube videos show real YouTube thumbnails with YT badge
✓ Upload/Cloudflare videos show dark placeholder with play icon
✓ Completed videos show green "Done" badge
✓ In-progress videos show white progress strip at bottom
✓ Tap card → navigates to video player

─── YouTube player ──────────────────────────────────────────────────
✓ Student taps a YouTube video card → YouTube video plays inside the app
✓ Browser DevTools → Network tab → search for "youtube_video_id" → 0 results in API responses
✓ Watch 30 seconds → navigate away → return → player resumes at ~30s
✓ Watch past 90% → "Completed · +10 points" badge appears below player
✓ Student from different standard → "You do not have access to this video." message
✓ Existing Cloudflare/Supabase upload videos still play as before (no regression)

─── Teacher live classes ────────────────────────────────────────────
✓ Teacher → Live tab → TeacherLiveClassesPage renders without errors
✓ Empty state shown if no classes scheduled
✓ "Schedule" button opens ScheduleModal
✓ Fill form and submit:
    - With Zoom credentials → class appears with zoom_meeting_id in Supabase
    - Without Zoom credentials → red error shown inside modal (not a blank crash)
✓ Live class card shows title, subject, date/time, status badge
✓ "Cancel" removes the class from the list
✓ "End class" → attendance pulled → "View attendance" button appears
✓ Attendance sheet shows per-student attended/absent with join time

─── Student live classes ────────────────────────────────────────────
✓ Student → Live tab → StudentLiveClassesPage renders without errors
✓ Classes show for the student's standard only
✓ Countdown timer visible for scheduled classes
✓ zoom_join_url NOT visible anywhere in student's Network tab responses
✓ "Join class" button activates within 5 minutes of start time or when live
✓ Ended class shows "You attended ✓" or "You missed this class"

─── ZoomMeetingView ─────────────────────────────────────────────────
✓ (Requires Zoom SDK credentials in backend/.env for full test)
✓ "Start class" / "Join class" button opens ZoomMeetingView full-screen
✓ Loading and joining spinners show before meeting connects
✓ "Leave" button returns user to Live Classes page
✓ Without credentials: error state shown inside ZoomMeetingView (not a crash)
```
