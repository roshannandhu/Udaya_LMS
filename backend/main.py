from fastapi import FastAPI, HTTPException, Depends, Header, UploadFile, File, Form, WebSocket, WebSocketDisconnect, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Literal, Any
from datetime import date, datetime, timedelta, timezone
import asyncio
import csv
from io import StringIO
from fastapi.responses import StreamingResponse
import uuid
import re
import os
import json
import base64
import hashlib
import hmac
import time as time_module
import httpx
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

import whatsapp as wa

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

app = FastAPI(title="Tutoria LMS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

ZOOM_ACCOUNT_ID           = os.environ.get("ZOOM_ACCOUNT_ID", "")
ZOOM_CLIENT_ID            = os.environ.get("ZOOM_CLIENT_ID", "")
ZOOM_CLIENT_SECRET        = os.environ.get("ZOOM_CLIENT_SECRET", "")
ZOOM_SDK_KEY              = os.environ.get("ZOOM_SDK_KEY", "")
ZOOM_SDK_SECRET           = os.environ.get("ZOOM_SDK_SECRET", "")
ZOOM_WEBHOOK_SECRET_TOKEN = os.environ.get("ZOOM_WEBHOOK_SECRET_TOKEN", "")

_zoom_token_cache: dict = {"token": None, "expires_at": 0.0}

supabase: Optional[Client] = None
service_supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        if SUPABASE_SERVICE_KEY:
            service_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        print("[*] Supabase connected successfully")
    except Exception as e:
        print(f"[!] Supabase connection failed: {e}")


async def _ensure_plain_password_column():
    """Auto-add plain_password column to students table if missing (uses Supabase pg-meta API)."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY or not service_supabase:
        return
    # Probe first — fast path if column already exists
    try:
        service_supabase.table("students").select("plain_password").limit(1).execute()
        return
    except Exception:
        pass

    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Get the students table ID from pg-meta
            resp = await client.get(f"{SUPABASE_URL}/pg-meta/v0/tables", headers=headers, params={"schema": "public"})
            if not resp.is_success:
                raise Exception(f"pg-meta tables: {resp.status_code} {resp.text[:200]}")
            students_table = next((t for t in resp.json() if t["name"] == "students"), None)
            if not students_table:
                raise Exception("students table not found in pg-meta response")
            # Add the column
            add_resp = await client.post(
                f"{SUPABASE_URL}/pg-meta/v0/columns",
                headers=headers,
                json={"table_id": students_table["id"], "name": "plain_password", "type": "text", "is_nullable": True},
            )
            if add_resp.is_success:
                print("[*] Auto-migrated: plain_password column added to students table")
            else:
                raise Exception(f"add column: {add_resp.status_code} {add_resp.text[:200]}")
    except Exception as e:
        print(f"[!] Could not auto-add plain_password column: {e}")
        print("[!] Run this in Supabase SQL Editor:")
        print("    ALTER TABLE students ADD COLUMN IF NOT EXISTS plain_password TEXT;")


async def _ensure_live_class_columns():
    """Auto-add live-class auto-thumbnail/passcode columns + teacher_branding table if missing."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY or not service_supabase:
        return
    # Probe first — fast path if everything already exists
    try:
        service_supabase.table("live_classes").select("thumbnail_url").limit(1).execute()
        service_supabase.table("teacher_branding").select("teacher_id").limit(1).execute()
        return
    except Exception:
        pass

    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    ddl = """
        ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS zoom_passcode TEXT;
        ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
        ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS thumbnail_text_side TEXT DEFAULT 'right';
        CREATE TABLE IF NOT EXISTS teacher_branding (
            teacher_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            thumbnail_url       TEXT,
            thumbnail_text_side TEXT DEFAULT 'right',
            updated_at          TIMESTAMPTZ DEFAULT now()
        );
        ALTER TABLE teacher_branding ENABLE ROW LEVEL SECURITY;
    """
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/pg-meta/v0/query", headers=headers, json={"query": ddl}
            )
            if resp.is_success:
                print("[*] Auto-migrated: live_classes thumbnail/passcode columns + teacher_branding table")
            else:
                raise Exception(f"pg-meta query: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"[!] Could not auto-migrate live-class columns: {e}")
        print("[!] Run backend/schema.sql in the Supabase SQL Editor to apply.")


async def _ensure_notes_and_broadcast_columns():
    """Auto-add notes table, broadcast_reactions table, and broadcast TTL/reply columns if missing."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY or not service_supabase:
        return
    # Probe first — fast path if everything already exists
    try:
        service_supabase.table("notes").select("id").limit(1).execute()
        service_supabase.table("broadcast_reactions").select("broadcast_id").limit(1).execute()
        service_supabase.table("broadcasts").select("expires_at").limit(1).execute()
        service_supabase.table("standards").select("broadcast_ttl_hours").limit(1).execute()
        return
    except Exception:
        pass

    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    ddl = """
        CREATE TABLE IF NOT EXISTS notes (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            class_id    UUID NOT NULL REFERENCES subject_classes(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            body        TEXT,
            file_url    TEXT,
            file_type   TEXT,
            storage_path TEXT,
            is_pinned   BOOLEAN DEFAULT false,
            created_by  UUID NOT NULL,
            created_at  TIMESTAMPTZ DEFAULT now(),
            updated_at  TIMESTAMPTZ DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_notes_class ON notes(class_id);
        ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "deny_all_notes" ON notes;
        CREATE POLICY "deny_all_notes" ON notes FOR ALL USING (false);
        ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
        ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES broadcasts(id);
        ALTER TABLE standards  ADD COLUMN IF NOT EXISTS broadcast_ttl_hours INT;
        CREATE TABLE IF NOT EXISTS broadcast_reactions (
            broadcast_id UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
            user_id      UUID NOT NULL,
            emoji        TEXT NOT NULL,
            created_at   TIMESTAMPTZ DEFAULT now(),
            PRIMARY KEY (broadcast_id, user_id, emoji)
        );
        CREATE INDEX IF NOT EXISTS idx_reactions_broadcast ON broadcast_reactions(broadcast_id);
        ALTER TABLE broadcast_reactions ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "deny_all_reactions" ON broadcast_reactions;
        CREATE POLICY "deny_all_reactions" ON broadcast_reactions FOR ALL USING (false);
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/pg-meta/v0/query", headers=headers, json={"query": ddl}
            )
            if resp.is_success:
                print("[*] Auto-migrated: notes table + broadcast reactions/TTL/reply columns")
            else:
                raise Exception(f"pg-meta query: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"[!] Could not auto-migrate notes/broadcast columns: {e}")
        print("[!] Run backend/schema.sql in the Supabase SQL Editor to apply.")


async def _ensure_notes_bucket():
    """Create the public 'notes' storage bucket if it doesn't exist."""
    if not service_supabase:
        return
    try:
        buckets = await asyncio.to_thread(lambda: service_supabase.storage.list_buckets())
        names = [b.name if hasattr(b, "name") else b.get("name") for b in (buckets or [])]
        if "notes" not in names:
            await asyncio.to_thread(lambda: service_supabase.storage.create_bucket(
                "notes", options={"public": True}))
            print("[*] Created 'notes' storage bucket")
    except Exception as e:
        print(f"[!] Could not ensure notes bucket (will retry on first upload): {e}")


async def _broadcast_cleanup_loop():
    """Hourly task: delete broadcasts whose expires_at has passed."""
    while True:
        await asyncio.sleep(3600)
        try:
            now_iso = datetime.utcnow().isoformat()
            expired_ids = [
                b["id"] for b in manager.broadcast_history
                if b.get("expires_at") and not b.get("deleted")
                and b["expires_at"] < now_iso
            ]
            if expired_ids:
                for b in manager.broadcast_history:
                    if b.get("id") in expired_ids:
                        b["deleted"] = True
                        b["message"] = ""
                        b["attachment_url"] = None
                manager.save_history()
                if service_supabase:
                    service_supabase.table("broadcasts").update({"deleted": True}).in_("id", expired_ids).execute()
                # Notify connected WS clients
                std_ids = {b.get("standard_id") for b in manager.broadcast_history if b.get("id") in expired_ids}
                for std_id in std_ids:
                    if std_id in manager.active_connections:
                        for bid in expired_ids:
                            dead = []
                            for conn in manager.active_connections.get(std_id, []):
                                try:
                                    await conn.send_json({"type": "delete_broadcast", "id": bid})
                                except Exception:
                                    dead.append(conn)
                            for d in dead:
                                manager.disconnect(d, std_id)
        except Exception as e:
            print(f"[broadcast cleanup] error: {e}")


async def _deferred_startup_migrations():
    """Run non-critical migrations in the background so they never delay the
    server becoming ready to serve logins. In production the notes/reactions
    tables are created via the Supabase SQL Editor, so the pg-meta attempt here
    just fails fast and logs — it must not block startup (esp. on Render cold
    starts, where this delay was added to every wake-up)."""
    try:
        await _ensure_notes_and_broadcast_columns()
        await _ensure_notes_bucket()
    except Exception as e:
        print(f"[!] deferred startup migrations error (ignored): {e}")


@app.on_event("startup")
async def startup_event():
    await _ensure_plain_password_column()
    await _ensure_live_class_columns()
    # Fire-and-forget: do NOT await — these must not delay login readiness.
    asyncio.create_task(_deferred_startup_migrations())
    asyncio.create_task(_broadcast_cleanup_loop())
    asyncio.create_task(_whatsapp_scheduler_loop())


# Models
class SubTeacherRequest(BaseModel):
    name: str
    email: str
    password: str
    phone: Optional[str] = None

class Standard(BaseModel):
    name: str
    short: Optional[str] = None
    emoji: Optional[str] = 'graduation'  # lucide icon key (legacy rows may hold an emoji char)

class StandardUpdate(BaseModel):
    name: Optional[str] = None
    short: Optional[str] = None
    emoji: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class SubjectClass(BaseModel):
    standard_id: str
    name: str
    emoji: Optional[str] = 'book'  # lucide icon key (legacy rows may hold an emoji char)
    end_date: Optional[str] = None

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    end_date: Optional[str] = None

class Video(BaseModel):
    class_id: str
    title: str
    description: Optional[str] = None
    cloudflare_video_id: Optional[str] = None
    duration_secs: Optional[int] = None
    allow_download: bool = True

class VideoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    allow_download: Optional[bool] = None
    chapters: Optional[List[Any]] = None
    youtube_video_id: Optional[str] = None

class YouTubeVideo(BaseModel):
    class_id: str
    title: str
    description: Optional[str] = None
    youtube_video_id: str
    youtube_url: str

class Test(BaseModel):
    class_id: str
    title: str
    duration_mins: int
    total_marks: float
    negative_marking: bool = False
    penalty: float = 0
    status: str = 'draft'
    scheduled_for: Optional[str] = None
    expires_at: Optional[str] = None

class TestUpdate(BaseModel):
    title: Optional[str] = None
    duration_mins: Optional[int] = None
    total_marks: Optional[float] = None
    negative_marking: Optional[bool] = None
    penalty: Optional[float] = None
    status: Optional[str] = None
    scheduled_for: Optional[str] = None
    expires_at: Optional[str] = None

class StudentProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

class Question(BaseModel):
    test_id: str
    question: str
    options: List[str]
    correct_idx: int
    order_num: int

class InviteLinkCreate(BaseModel):
    standard_id: str
    max_uses: int = 50
    expires_at: Optional[str] = None

class CreateStudentRequest(BaseModel):
    email: Optional[str] = None
    password: str
    name: str
    username: str
    standard_id: Optional[str] = None

class ResetPasswordRequest(BaseModel):
    new_password: Optional[str] = None

class LoginRequest(BaseModel):
    email_or_username: str
    password: str
    device_fingerprint: Optional[str] = None

class AttendanceRecord(BaseModel):
    student_id: str
    status: Literal["present", "absent", "late"]

class MarkAttendanceRequest(BaseModel):
    date: str
    records: List[AttendanceRecord]

class BroadcastRequest(BaseModel):
    standard_id: str
    message: str
    attachment_url: Optional[str] = None
    attachment_type: Optional[str] = None
    scheduled_for: Optional[str] = None
    reply_to: Optional[str] = None

class NoteCreate(BaseModel):
    class_id: str
    title: str
    body: Optional[str] = None
    file_url: Optional[str] = None
    file_type: Optional[str] = None
    storage_path: Optional[str] = None
    is_pinned: bool = False

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    file_url: Optional[str] = None
    file_type: Optional[str] = None
    storage_path: Optional[str] = None
    is_pinned: Optional[bool] = None

class BroadcastTTLRequest(BaseModel):
    ttl_hours: Optional[int] = None

class BroadcastReactionRequest(BaseModel):
    emoji: str

class LiveClassCreate(BaseModel):
    class_id: str
    title: str
    scheduled_at: str  # ISO 8601: "2026-06-01T09:00:00"
    duration_mins: int = 60

class LiveClassUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None

class AssignmentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None

class GradeSubmissionRequest(BaseModel):
    marks_obtained: float

# --- WebSocket Connection Manager ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.broadcast_history = []
        self.load_history()

    def load_history(self):
        if os.path.exists("broadcasts.json"):
            try:
                with open("broadcasts.json", "r") as f:
                    self.broadcast_history = json.load(f)
            except:
                pass

    def save_history(self):
        with open("broadcasts.json", "w") as f:
            json.dump(self.broadcast_history, f)

    async def connect(self, websocket: WebSocket, standard_id: str):
        await websocket.accept()
        if standard_id not in self.active_connections:
            self.active_connections[standard_id] = []
        self.active_connections[standard_id].append(websocket)
        history = [b for b in self.broadcast_history if b.get("standard_id") == standard_id]
        if history:
            await websocket.send_json({"type": "history", "data": history})

    def disconnect(self, websocket: WebSocket, standard_id: str):
        if standard_id in self.active_connections and websocket in self.active_connections[standard_id]:
            self.active_connections[standard_id].remove(websocket)

    async def broadcast_to_standard(self, standard_id: str, message: dict):
        message["standard_id"] = standard_id
        if "id" not in message:
            message["id"] = str(uuid.uuid4())
        if "created_at" not in message:
            message["created_at"] = datetime.now().isoformat()
        self.broadcast_history.append(message)
        def save_and_insert():
            self.save_history()
            if service_supabase:
                try:
                    service_supabase.table("broadcasts").insert({
                        "id": message["id"],
                        "standard_id": standard_id,
                        "message": message.get("message", ""),
                        "attachment_url": message.get("attachment_url"),
                        "attachment_type": message.get("attachment_type"),
                        "scheduled_for": message.get("scheduled_for"),
                        "reply_to": message.get("reply_to"),
                        "expires_at": message.get("expires_at"),
                        "created_at": message["created_at"]
                    }).execute()
                except Exception as e:
                    print("Supabase broadcast insert failed:", e)

        asyncio.create_task(asyncio.to_thread(save_and_insert))

        if standard_id in self.active_connections:
            disconnected = []
            for connection in self.active_connections[standard_id]:
                try:
                    await connection.send_json({"type": "new_broadcast", "data": message})
                except Exception:
                    disconnected.append(connection)
            for d in disconnected:
                self.disconnect(d, standard_id)

manager = ConnectionManager()

# --- Zoom helpers ---

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


async def zoom_get_zak() -> str:
    """Fetch the host (S2S app owner) ZAK token.
    The Web SDK CANNOT start/host a meeting created via S2S OAuth without this token,
    so the teacher would never become a real host and students stay stuck in the lobby."""
    import httpx
    token = await zoom_get_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.zoom.us/v2/users/me/token?type=zak",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Zoom ZAK fetch failed: {resp.text}")
    return resp.json()["token"]


async def zoom_create_meeting(topic: str, start_time: str, duration_mins: int) -> dict:
    """Create a Zoom meeting. start_time is ISO 8601, e.g. '2026-06-01T09:00:00'.
    Returns {meeting_id, join_url, start_url, password}."""
    import httpx
    token = await zoom_get_token()
    payload = {
        "topic": topic,
        "type": 2,
        "start_time": start_time,
        "duration": duration_mins,
        "timezone": "Asia/Kolkata",
        "settings": {
            # One host (the Zoom-credential owner, hosting from their phone) and
            # many view-only watchers. Watchers enter muted with no camera.
            "host_video": True,
            "participant_video": False,
            # Host must start the class first; watchers can only enter once the
            # webhook has flipped the class to "live". No waiting room because the
            # owner is on mobile and can't admit people one-by-one.
            "join_before_host": False,
            "waiting_room": False,
            "mute_upon_entry": True,
            "allow_participants_to_rename": False,
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
    return {
        "meeting_id": str(data["id"]),
        "join_url": data["join_url"],
        "start_url": data["start_url"],
        "password": data.get("password", ""),
    }


async def zoom_delete_meeting(meeting_id: str) -> None:
    """Best-effort delete of a Zoom meeting. Never raises — a missing/already-gone
    meeting should not block deleting the local record."""
    import httpx
    if not meeting_id:
        return
    try:
        token = await zoom_get_token()
        async with httpx.AsyncClient() as client:
            await client.delete(
                f"https://api.zoom.us/v2/meetings/{meeting_id}",
                headers={"Authorization": f"Bearer {token}"},
                params={"schedule_for_reminder": "false"},
                timeout=10.0,
            )
    except Exception as e:
        print(f"[!] Zoom meeting delete failed (ignored): {e}")


async def zoom_ensure_joinable(meeting_id: str) -> None:
    """Best-effort: make sure the meeting has no waiting room, so view-only
    watchers aren't trapped in a lobby (the host still has to start the class
    first). Applied to meetings created before this default existed. Never raises."""
    import httpx
    if not meeting_id:
        return
    try:
        token = await zoom_get_token()
        async with httpx.AsyncClient() as client:
            await client.patch(
                f"https://api.zoom.us/v2/meetings/{meeting_id}",
                json={"settings": {
                    "waiting_room": False,
                }},
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                timeout=10.0,
            )
    except Exception as e:
        print(f"[!] Zoom ensure-joinable failed (ignored): {e}")


# Short cache of "is this meeting live?" so the frequently-polled class list
# doesn't hammer the Zoom API. meeting_id -> (is_live_bool, expires_at).
_zoom_live_cache: dict = {}
_ZOOM_LIVE_TTL = 60.0


async def zoom_is_meeting_live(meeting_id: str) -> bool:
    """Ask Zoom directly whether the meeting has been started by the host.

    This is the source of truth for "go live" so we don't depend on the
    meeting.started webhook reaching us (it can't reach localhost). Zoom's
    Get-a-Meeting endpoint returns status 'waiting' (not started) or 'started'.
    Cached briefly. Never raises."""
    import httpx
    if not meeting_id:
        return False
    hit = _zoom_live_cache.get(meeting_id)
    if hit and time_module.time() < hit[1]:
        return hit[0]
    is_live = False
    try:
        token = await zoom_get_token()
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.zoom.us/v2/meetings/{meeting_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0,
            )
        if resp.status_code == 200:
            is_live = resp.json().get("status") == "started"
    except Exception as e:
        print(f"[!] Zoom live-status check failed (treated as not live): {e}")
    _zoom_live_cache[meeting_id] = (is_live, time_module.time() + _ZOOM_LIVE_TTL)
    return is_live


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
    """Generate Zoom Web SDK join signature as a proper JWT (required by @zoom/meetingsdk v3+).
    role: 0=participant, 1=host."""
    if not ZOOM_SDK_KEY or not ZOOM_SDK_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Zoom SDK credentials not configured. Add ZOOM_SDK_KEY and ZOOM_SDK_SECRET to backend/.env"
        )

    def b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

    iat = int(time_module.time()) - 30
    exp = iat + 7200  # 2-hour token

    header  = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(',', ':')).encode())
    payload = b64url(json.dumps({
        "sdkKey": ZOOM_SDK_KEY, "appKey": ZOOM_SDK_KEY,
        "mn": meeting_id, "role": role,
        "iat": iat, "exp": exp, "tokenExp": exp,
    }, separators=(',', ':')).encode())

    signing_input = f"{header}.{payload}"
    sig = b64url(hmac.new(ZOOM_SDK_SECRET.encode(), signing_input.encode(), hashlib.sha256).digest())
    return f"{signing_input}.{sig}"


# Token validation is on the hot path of EVERY request. Without caching, each request
# makes a blocking network round-trip to Supabase Auth (supabase.auth.get_user) plus,
# for students, two more DB queries — which is the dominant source of UI sluggishness.
# This short-TTL cache makes that work happen at most once per token per _AUTH_TTL window.
_auth_cache: dict = {}
_AUTH_TTL = 30.0  # seconds — short enough that role/block/standard changes propagate quickly


def _prune_auth_cache():
    now = time_module.time()
    expired = [t for t, v in _auth_cache.items() if v["expires_at"] <= now]
    for t in expired:
        _auth_cache.pop(t, None)
    # If still oversized after dropping expired entries, clear the rest (cheap + bounded).
    if len(_auth_cache) > 500:
        _auth_cache.clear()


def verify_token(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")

    token = authorization.replace("Bearer ", "")

    cached = _auth_cache.get(token)
    if cached and cached["expires_at"] > time_module.time():
        return cached["result"]

    try:
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")

        user = user_response.user
        user_metadata = user.user_metadata or {}
        role = user_metadata.get("role", "student")

        teacher_type       = user_metadata.get("teacher_type", "primary")
        primary_teacher_id = user_metadata.get("primary_teacher_id")
        # For sub-teachers, teacher_id resolves to the primary teacher's UUID so that
        # all standard/subject ownership checks work transparently.
        effective_teacher_id = (
            primary_teacher_id if teacher_type == "sub" and primary_teacher_id else user.id
        )

        result = {
            "id": user.id,
            "user_id": user.id,              # always the real user (for created_by / profile ops)
            "teacher_id": effective_teacher_id,  # primary's UUID for sub-teachers
            "email": user.email,
            "name": user_metadata.get("name", ""),
            "role": role,
            "username": user_metadata.get("username", ""),
            "student_id": None,
            "standard_id": None,
            "teacher_type": teacher_type,              # "primary" | "sub"
            "primary_teacher_id": primary_teacher_id,  # None for primary teachers
        }

        if role == "student" and service_supabase:
            try:
                lookup = service_supabase.table("students").select("id, standard_id, name, username, student_code, avatar_url, points, avg_score, attendance_pct, phone, must_change_pwd").eq("id", user.id).single().execute()
                if lookup.data:
                    result["student_id"] = lookup.data["id"]
                    result["standard_id"] = lookup.data.get("standard_id")
                    if lookup.data.get("name"):
                        result["name"] = lookup.data["name"]
                    if lookup.data.get("username"):
                        result["username"] = lookup.data["username"]
                    result["student_code"] = lookup.data.get("student_code")
                    result["points"] = lookup.data.get("points", 0)
                    result["avg_score"] = lookup.data.get("avg_score", 0)
                    result["attendance_pct"] = lookup.data.get("attendance_pct")
                    result["phone"] = lookup.data.get("phone")
                    result["must_change_pwd"] = bool(lookup.data.get("must_change_pwd"))
                    result["avatar_url"] = lookup.data.get("avatar_url")
                    # Fetch standard name
                    if lookup.data.get("standard_id"):
                        try:
                            std = service_supabase.table("standards").select("name, emoji").eq("id", lookup.data["standard_id"]).single().execute()
                            result["standard_name"] = std.data["name"] if std.data else None
                            result["standard_emoji"] = std.data.get("emoji") if std.data else None
                        except Exception:
                            result["standard_name"] = None
            except Exception:
                pass

        _auth_cache[token] = {"result": result, "expires_at": time_module.time() + _AUTH_TTL}
        if len(_auth_cache) > 500:
            _prune_auth_cache()
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")

# Auth
@app.post("/api/auth/login")
def login(request: LoginRequest):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    identifier = request.email_or_username.strip()
    email_to_use = identifier

    if "@" not in identifier:
        # No "@" → either a Student ID (e.g. UDAYA202510001) or a phone number.
        if not service_supabase:
            raise HTTPException(status_code=503, detail="Login unavailable")

        # 1. Try Student ID first. Codes lead with a 2-digit year but always
        #    contain the institution letters (e.g. 25UDAYA100001), so a pure-digit
        #    phone input can never equal one here. Stored codes are uppercase.
        try:
            code_lookup = service_supabase.table("students").select("email").eq("student_code", identifier.upper()).single().execute()
            if code_lookup.data and code_lookup.data.get("email"):
                email_to_use = code_lookup.data["email"]
        except Exception:
            pass

    if "@" not in email_to_use:
        # Still unresolved → fall back to phone number lookup
        try:
            digits_only = re.sub(r'\D', '', identifier)
            if len(digits_only) < 7:
                raise HTTPException(status_code=401, detail="Invalid credentials")
            # Try exact match first
            phone_lookup = service_supabase.table("students").select("email").eq("phone", identifier).single().execute()
            if not phone_lookup.data or not phone_lookup.data.get("email"):
                # Digits-normalized match (handles +91 prefix variations)
                all_students = service_supabase.table("students").select("email, phone").not_.is_("phone", "null").execute()
                phone_lookup = None
                for s in (all_students.data or []):
                    stored_digits = re.sub(r'\D', '', s.get("phone", ""))
                    if stored_digits.endswith(digits_only) or digits_only.endswith(stored_digits):
                        phone_lookup = type('obj', (object,), {'data': s})()
                        break
            if phone_lookup and getattr(phone_lookup, 'data', None) and phone_lookup.data.get("email"):
                email_to_use = phone_lookup.data["email"]
            else:
                raise HTTPException(status_code=401, detail="Invalid credentials")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid credentials")

    try:
        response = supabase.auth.sign_in_with_password({
            "email": email_to_use,
            "password": request.password
        })

        if not response.user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        user = response.user
        user_metadata = user.user_metadata or {}
        role = user_metadata.get("role", "student")

        user_info = {
            "id": user.id,
            "email": user.email,
            "name": user_metadata.get("name", ""),
            "role": role,
            "username": user_metadata.get("username", ""),
            "standard_id": None,
            "student_id": None,
        }

        # For students, fetch standard_id and real name/username from students table
        if role == "student" and service_supabase:
            try:
                s = service_supabase.table("students").select("id, standard_id, name, username, must_change_pwd, blocked").eq("id", user.id).single().execute()
                if s.data:
                    if s.data.get("blocked"):
                        raise HTTPException(status_code=403, detail="Your account has been blocked. Contact your teacher.")
                    user_info["standard_id"] = s.data.get("standard_id")
                    user_info["student_id"] = s.data["id"]
                    user_info["must_change_pwd"] = bool(s.data.get("must_change_pwd"))
                    if s.data.get("name"):
                        user_info["name"] = s.data["name"]
                    if s.data.get("username"):
                        user_info["username"] = s.data["username"]
            except HTTPException:
                raise
            except Exception:
                pass

            # Record device fingerprint — overwrites any previous session (single-device enforcement)
            if request.device_fingerprint:
                try:
                    service_supabase.table("student_sessions").upsert({
                        "student_id": user.id,
                        "device_fingerprint": request.device_fingerprint,
                        "last_active_at": datetime.now().isoformat()
                    }, on_conflict="student_id").execute()
                except Exception as e:
                    print(f"Session tracking failed: {e}")

        return {
            "token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "user": user_info,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid credentials")

class RefreshTokenRequest(BaseModel):
    refresh_token: str

@app.post("/api/auth/refresh")
def refresh_access_token(request: RefreshTokenRequest):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        response = supabase.auth.refresh_session(request.refresh_token)
        if not response.session:
            raise HTTPException(status_code=401, detail="Refresh failed")
        return {
            "token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Refresh failed")

@app.post("/api/auth/logout")
def logout():
    return {"message": "Logged out"}

class VerifyDeviceRequest(BaseModel):
    device_fingerprint: str

@app.post("/api/auth/verify-device")
def verify_device(request: VerifyDeviceRequest, user = Depends(verify_token)):
    if user.get("role") != "student":
        return {"allowed": True}
    if not service_supabase:
        return {"allowed": True}
    try:
        session = service_supabase.table("student_sessions").select("device_fingerprint").eq("student_id", user["id"]).single().execute()
        if not session.data:
            return {"allowed": True}
        return {"allowed": session.data["device_fingerprint"] == request.device_fingerprint}
    except Exception:
        return {"allowed": True}

@app.get("/api/auth/me")
def get_current_user(user = Depends(verify_token)):
    return user

class ChangePasswordRequest(BaseModel):
    password: str

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None

@app.patch("/api/auth/profile")
def update_profile(request: UpdateProfileRequest, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    updates = {}
    if request.name:
        updates["name"] = request.name
    if updates:
        current_meta = service_supabase.auth.admin.get_user_by_id(user["user_id"]).user.user_metadata or {}
        current_meta.update(updates)
        service_supabase.auth.admin.update_user_by_id(user["user_id"], {"user_metadata": current_meta})
    return {"message": "Profile updated"}

@app.post("/api/auth/change-password")
def change_password(request: ChangePasswordRequest, user = Depends(verify_token)):
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    try:
        service_supabase.auth.admin.update_user_by_id(user["user_id"], {"password": request.password})
        if user["role"] == "student":
            try:
                # Clear must_change_pwd and any plain_password column that may exist
                service_supabase.table("students").update({"must_change_pwd": False, "plain_password": None}).eq("id", user["user_id"]).execute()
            except Exception:
                # plain_password column may not exist — that's fine
                try:
                    service_supabase.table("students").update({"must_change_pwd": False}).eq("id", user["user_id"]).execute()
                except Exception:
                    pass
        return {"message": "Password changed successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Dashboard Stats
@app.get("/api/dashboard/stats")
async def get_dashboard_stats(user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    teacher_id = user["teacher_id"]
    standards = await asyncio.to_thread(lambda: service_supabase.table("standards").select("id").eq("teacher_id", teacher_id).execute())
    standard_ids = [s["id"] for s in standards.data] if standards.data else []

    if not standard_ids:
        return {
            "students_count": 0,
            "subjects_count": 0,
            "scheduled_tests_count": 0,
            "broadcasts_count": 0,
            "standards_count": 0
        }

    # Parallelize counts
    def fetch_students(): return service_supabase.table("students").select("id", count="exact").in_("standard_id", standard_ids).execute()
    def fetch_subjects(): return service_supabase.table("subject_classes").select("id", count="exact").in_("standard_id", standard_ids).execute()
    def fetch_broadcasts(): return service_supabase.table("broadcasts").select("id", count="exact").in_("standard_id", standard_ids).eq("deleted", False).execute()
    def fetch_class_ids(): return service_supabase.table("subject_classes").select("id").in_("standard_id", standard_ids).execute()

    students_res, subjects_res, broadcasts_res, classes_res = await asyncio.gather(
        asyncio.to_thread(fetch_students),
        asyncio.to_thread(fetch_subjects),
        asyncio.to_thread(fetch_broadcasts),
        asyncio.to_thread(fetch_class_ids)
    )

    class_ids = [c["id"] for c in classes_res.data] if classes_res.data else []
    scheduled_tests_count = 0
    if class_ids:
        tests_res = await asyncio.to_thread(lambda: service_supabase.table("tests").select("id", count="exact").in_("class_id", class_ids).eq("status", "scheduled").execute())
        scheduled_tests_count = tests_res.count or 0

    return {
        "students_count": students_res.count or 0,
        "subjects_count": subjects_res.count or 0,
        "scheduled_tests_count": scheduled_tests_count,
        "broadcasts_count": broadcasts_res.count or 0,
        "standards_count": len(standard_ids)
    }

@app.get("/api/dashboard/activity")
def get_dashboard_activity(user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    teacher_id = user["teacher_id"]

    # Get teacher's standards
    standards = service_supabase.table("standards").select("id").eq("teacher_id", teacher_id).execute()
    standard_ids = [s["id"] for s in standards.data] if standards.data else []

    if not standard_ids:
        return {"activities": []}

    # Get students in teacher's standards
    students_result = service_supabase.table("students").select("id, name").in_("standard_id", standard_ids).execute()
    student_map = {s["id"]: s["name"] for s in (students_result.data or [])}

    activities = []

    # Recent video progress
    student_ids = list(student_map.keys())
    if student_ids:
        video_progress = service_supabase.table("video_progress").select("*, videos(title)").in_("student_id", student_ids).order("last_watched_at", desc=True).limit(10).execute()
        for vp in (video_progress.data or []):
            student_name = student_map.get(vp["student_id"], "Unknown")
            activities.append({
                "type": "video_progress",
                "student": student_name,
                "detail": f"Watched video",
                "timestamp": vp.get("last_watched_at"),
                "video_title": vp.get("videos", {}).get("title", "Unknown") if vp.get("videos") else "Unknown"
            })

        # Recent test attempts
        test_attempts = service_supabase.table("test_attempts").select("*, tests(title)").in_("student_id", student_ids).order("submitted_at", desc=True).limit(10).execute()
        for ta in (test_attempts.data or []):
            student_name = student_map.get(ta["student_id"], "Unknown")
            score = ta.get("score", 0)
            activities.append({
                "type": "test_attempt",
                "student": student_name,
                "detail": f"Scored {score}% in test",
                "timestamp": ta.get("submitted_at"),
                "test_title": ta.get("tests", {}).get("title", "Unknown") if ta.get("tests") else "Unknown",
                "score": score
            })

    # Sort by timestamp
    activities.sort(key=lambda x: x.get("timestamp") or "", reverse=True)

    return {"activities": activities[:20]}

@app.get("/api/dashboard/overview")
async def get_dashboard_overview(user = Depends(verify_token)):
    """Single aggregate feed for the teacher home dashboard: overview counts,
    class performance, top students, and the 'needs attention' queues (ungraded
    submissions, pending join requests, today's live classes, upcoming tests,
    low-attendance students). One bounded pass — no client-side N+1."""
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    teacher_id = user["teacher_id"]

    empty = {
        "counts": {"students": 0, "subjects": 0, "standards": 0, "scheduled_tests": 0},
        "performance": {"avg_score": 0.0, "avg_attendance": 0.0, "total_points": 0},
        "top_students": [],
        "grading_queue": {"count": 0, "items": []},
        "join_requests": {"count": 0, "items": []},
        "today_live": [],
        "upcoming_tests": [],
        "low_attendance": {"count": 0, "items": []},
    }

    # ── Scope: standards → subjects → students ────────────────────────────────
    stds_res = await asyncio.to_thread(lambda: service_supabase.table("standards").select(
        "id, name, attendance_threshold"
    ).eq("teacher_id", teacher_id).execute())
    standards = stds_res.data or []
    if not standards:
        return empty
    standard_ids = [s["id"] for s in standards]
    std_name = {s["id"]: s.get("name", "") for s in standards}

    def fetch_subs(): return service_supabase.table("subject_classes").select("id, name, standard_id").in_("standard_id", standard_ids).execute()
    def fetch_studs(): return service_supabase.table("students").select("id, name, username, points, avg_score, attendance_pct, avatar_url").in_("standard_id", standard_ids).execute()
    def fetch_links(): return service_supabase.table("invite_links").select("code, standard_id").eq("created_by", teacher_id).execute()

    subs_res, studs_res, links_res = await asyncio.gather(
        asyncio.to_thread(fetch_subs),
        asyncio.to_thread(fetch_studs),
        asyncio.to_thread(fetch_links)
    )

    subjects = subs_res.data or []
    class_ids = [c["id"] for c in subjects]
    subject_name = {c["id"]: c.get("name", "") for c in subjects}

    students = studs_res.data or []
    links = links_res.data or []

    # ── Counts ────────────────────────────────────────────────────────────────
    scheduled_tests = 0
    if class_ids:
        def fetch_tests_cnt(): return service_supabase.table("tests").select("id", count="exact").in_("class_id", class_ids).eq("status", "scheduled").execute()
        def fetch_asg(): return service_supabase.table("assignments").select("id, title, class_id").in_("class_id", class_ids).execute()
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        def fetch_lc(): return service_supabase.table("live_classes").select("id, title, class_id, scheduled_at, status").in_("class_id", class_ids).in_("status", ["scheduled", "live"]).gte("scheduled_at", today_start).order("scheduled_at").execute()
        def fetch_upc_tests(): return service_supabase.table("tests").select("id, title, class_id, scheduled_for, expires_at, status").in_("class_id", class_ids).in_("status", ["scheduled", "active"]).order("scheduled_for", nullsfirst=False).execute()
        
        st_res, asg_res, lc_res, tst_res = await asyncio.gather(
            asyncio.to_thread(fetch_tests_cnt),
            asyncio.to_thread(fetch_asg),
            asyncio.to_thread(fetch_lc),
            asyncio.to_thread(fetch_upc_tests)
        )
        scheduled_tests = st_res.count or 0
        assignments = asg_res.data or []
        today_live_data = lc_res.data or []
        upcoming_tests_data = tst_res.data or []
    else:
        assignments = []
        today_live_data = []
        upcoming_tests_data = []

    counts = {
        "students": len(students),
        "subjects": len(subjects),
        "standards": len(standards),
        "scheduled_tests": scheduled_tests,
    }

    # ── Performance + top students ────────────────────────────────────────────
    scores = [float(s["avg_score"]) for s in students if s.get("avg_score") is not None]
    atts = [float(s["attendance_pct"]) for s in students if s.get("attendance_pct") is not None]
    performance = {
        "avg_score": round(sum(scores) / len(scores), 1) if scores else 0.0,
        "avg_attendance": round(sum(atts) / len(atts), 1) if atts else 0.0,
        "total_points": sum(int(s.get("points") or 0) for s in students),
    }
    top_students = [
        {"id": s["id"], "name": s.get("name"), "username": s.get("username"),
         "points": int(s.get("points") or 0), "avatar_url": s.get("avatar_url")}
        for s in sorted(students, key=lambda s: int(s.get("points") or 0), reverse=True)[:5]
        if int(s.get("points") or 0) > 0
    ]

    # ── Grading queue: ungraded submissions across the teacher's classes ──────
    grading_items = []
    grading_count = 0
    if class_ids:
        asg_map = {a["id"]: a for a in assignments}
        if assignments:
            subs2 = await asyncio.to_thread(lambda: service_supabase.table("assignment_submissions").select(
                "id, assignment_id, submitted_at, graded_at, students(name)"
            ).in_("assignment_id", list(asg_map.keys())).is_("graded_at", "null").execute())
            ungraded = subs2.data or []
            grading_count = len(ungraded)
            ungraded.sort(key=lambda x: x.get("submitted_at") or "", reverse=True)
            for sub in ungraded[:6]:
                a = asg_map.get(sub["assignment_id"], {})
                stu = sub.get("students") or {}
                grading_items.append({
                    "submission_id": sub["id"],
                    "assignment_id": sub["assignment_id"],
                    "assignment_title": a.get("title", "Assignment"),
                    "subject": subject_name.get(a.get("class_id"), ""),
                    "class_id": a.get("class_id"),
                    "student_name": stu.get("name", "Student"),
                    "submitted_at": sub.get("submitted_at"),
                })

    # ── Pending join requests across the teacher's invite links ───────────────
    join_items = []
    join_count = 0
    if links:
        code_std = {l["code"]: l.get("standard_id") for l in links}
        reqs = await asyncio.to_thread(lambda: service_supabase.table("invite_requests").select("*").in_(
            "invite_code", list(code_std.keys())).eq("status", "pending").execute())
        pending = reqs.data or []
        join_count = len(pending)
        pending.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        for r in pending[:6]:
            join_items.append({
                "id": r["id"],
                "student_name": r.get("student_name", "Student"),
                "student_email": r.get("student_email"),
                "standard_name": std_name.get(code_std.get(r.get("invite_code")), ""),
                "invite_code": r.get("invite_code"),
                "created_at": r.get("created_at"),
            })

    # ── Today's live classes (today + upcoming, scheduled/live) ───────────────
    today_live = []
    upcoming_tests = []
    if class_ids:
        for lc in today_live_data[:6]:
            today_live.append({
                "id": lc["id"], "title": lc.get("title"), "class_id": lc.get("class_id"),
                "subject": subject_name.get(lc.get("class_id"), ""),
                "scheduled_at": lc.get("scheduled_at"), "status": lc.get("status"),
            })

        for t in upcoming_tests_data[:6]:
            upcoming_tests.append({
                "id": t["id"], "title": t.get("title"), "class_id": t.get("class_id"),
                "subject": subject_name.get(t.get("class_id"), ""),
                "scheduled_for": t.get("scheduled_for"), "expires_at": t.get("expires_at"),
                "status": t.get("status"),
            })

    # ── Low attendance students ───────────────────────────────────────────────
    # Use the lowest configured standard threshold (fallback 75).
    thresholds = [s.get("attendance_threshold") for s in standards if s.get("attendance_threshold")]
    threshold = min(thresholds) if thresholds else 75
    low = [s for s in students if s.get("attendance_pct") is not None and float(s["attendance_pct"]) < threshold]
    low.sort(key=lambda s: float(s.get("attendance_pct") or 0))
    low_items = [
        {"student_id": s["id"], "name": s.get("name"), "attendance_pct": round(float(s["attendance_pct"]), 1)}
        for s in low[:6]
    ]

    return {
        "counts": counts,
        "performance": performance,
        "top_students": top_students,
        "grading_queue": {"count": grading_count, "items": grading_items},
        "join_requests": {"count": join_count, "items": join_items},
        "today_live": today_live,
        "upcoming_tests": upcoming_tests,
        "low_attendance": {"count": len(low), "items": low_items},
    }

# Standards CRUD
def _claim_orphan_standards(teacher_id):
    """Assign any orphaned (teacher_id IS NULL) standards to this teacher.
    Such standards come from DB/migration seeds; without an owner they are
    invisible to the teacher in the list AND unmanageable (create_subject etc.
    reject them), yet enrolled students still see their subjects — which looks
    like "students see subjects the teacher can't". This is a single-primary-
    teacher app, so claiming is safe and self-healing, mirroring the claim-on-
    write already done in standard update/delete. Idempotent + best-effort."""
    if not service_supabase or not teacher_id:
        return
    try:
        orphans = service_supabase.table("standards").select("id").is_("teacher_id", "null").execute()
        if orphans.data:
            service_supabase.table("standards").update({"teacher_id": teacher_id}).is_("teacher_id", "null").execute()
    except Exception:
        pass

@app.get("/api/standards")
def get_standards(user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    if user["role"] == "teacher":
        _claim_orphan_standards(user["teacher_id"])
        response = service_supabase.table("standards").select("*").eq("teacher_id", user["teacher_id"]).order("created_at", desc=True).execute()
    else:
        response = service_supabase.table("standards").select("*").execute()

    return response.data or []

@app.get("/api/standards/{standard_id}")
def get_standard(standard_id: str, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    response = service_supabase.table("standards").select("*").eq("id", standard_id).single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Standard not found")
    return response.data

@app.post("/api/standards")
def create_standard(standard: Standard, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    data = {
        "name": standard.name,
        "short": standard.short,
        "emoji": standard.emoji,
        "teacher_id": user["teacher_id"]
    }
    try:
        response = service_supabase.table("standards").insert(data).execute()
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.patch("/api/standards/{standard_id}")
def update_standard(standard_id: str, updates: StandardUpdate, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Verify ownership — also accept standards where teacher_id is NULL (created via DB/migration)
    existing = service_supabase.table("standards").select("teacher_id").eq("id", standard_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Standard not found")
    stored_tid = existing.data.get("teacher_id")
    if stored_tid and stored_tid != user["teacher_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    # Auto-claim ownership for unclaimed standards
    if not stored_tid:
        service_supabase.table("standards").update({"teacher_id": user["teacher_id"]}).eq("id", standard_id).execute()

    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if update_data:
        service_supabase.table("standards").update(update_data).eq("id", standard_id).execute()

    return {"message": "Standard updated"}

@app.delete("/api/standards/{standard_id}")
async def delete_standard(standard_id: str, pin: Optional[str] = None, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Termination PIN gate — when a PIN is configured it must match. This makes the
    # destructive delete safe even if the client-side check is bypassed.
    required_pin = (get_teacher_settings().get("termination_pin") or "").strip()
    if required_pin and (pin or "").strip() != required_pin:
        raise HTTPException(status_code=403, detail="Incorrect termination PIN")

    # Ownership check — also accept standards where teacher_id is NULL (created via DB/migration)
    existing = service_supabase.table("standards").select("teacher_id").eq("id", standard_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Standard not found")
    stored_tid = existing.data.get("teacher_id")
    if stored_tid and stored_tid != user["teacher_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # 1. Fetch all student IDs + avatar_urls BEFORE any deletes
    students_res = service_supabase.table("students").select("id, avatar_url").eq("standard_id", standard_id).execute()
    student_ids = [s["id"] for s in (students_res.data or [])]
    student_avatar_urls = [s["avatar_url"] for s in (students_res.data or []) if s.get("avatar_url")]

    # 2. Fetch all subject_class IDs for this standard
    subjects_res = service_supabase.table("subject_classes").select("id").eq("standard_id", standard_id).execute()
    subject_ids = [s["id"] for s in (subjects_res.data or [])]

    # 3. Fetch invite codes BEFORE CASCADE removes invite_links
    invite_codes_res = service_supabase.table("invite_links").select("code").eq("standard_id", standard_id).execute()
    invite_codes = [r["code"] for r in (invite_codes_res.data or [])]

    # 4. Delete Cloudflare Stream + Supabase Storage videos before DB rows cascade
    if subject_ids:
        videos_res = service_supabase.table("videos").select("cloudflare_video_id").in_("class_id", subject_ids).execute()
        all_video_ids = [v["cloudflare_video_id"] for v in (videos_res.data or []) if v.get("cloudflare_video_id")]
        cf_ids = [v for v in all_video_ids if not v.startswith("https://")]
        storage_video_paths = []
        for url in all_video_ids:
            if url.startswith("https://") and "/object/public/videos/" in url:
                storage_video_paths.append(url.split("/object/public/videos/")[-1])

        if cf_ids:
            CF_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
            CF_TOKEN = os.getenv("CLOUDFLARE_STREAM_API_TOKEN", "")
            if CF_ACCOUNT_ID and CF_TOKEN:
                import httpx
                async with httpx.AsyncClient() as client:
                    for cf_id in cf_ids:
                        try:
                            await client.delete(
                                f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/stream/{cf_id}",
                                headers={"Authorization": f"Bearer {CF_TOKEN}"},
                                timeout=10.0
                            )
                        except Exception as e:
                            print(f"Cloudflare delete failed for {cf_id}: {e}")

        if storage_video_paths:
            try:
                await asyncio.to_thread(lambda: service_supabase.storage.from_("videos").remove(storage_video_paths))
            except Exception as e:
                print(f"Storage video delete failed: {e}")

    # 5. Delete test_attempts for students (no CASCADE on student_id FK)
    if student_ids:
        service_supabase.table("test_attempts").delete().in_("student_id", student_ids).execute()

    # 6. Delete broadcast_reads for students
    if student_ids:
        service_supabase.table("broadcast_reads").delete().in_("student_id", student_ids).execute()

    # 7. Delete notifications for students
    if student_ids:
        try:
            service_supabase.table("notifications").delete().in_("recipient_id", student_ids).execute()
        except Exception as e:
            print(f"Notification delete failed: {e}")

    # 8. Delete invite_requests matched by invite codes (no FK cascade)
    if invite_codes:
        try:
            service_supabase.table("invite_requests").delete().in_("invite_code", invite_codes).execute()
        except Exception as e:
            print(f"Invite request delete failed: {e}")

    # 9. Delete Supabase Storage avatar files
    if student_avatar_urls:
        avatar_paths = [url.split("/object/public/avatars/")[-1] for url in student_avatar_urls if "/object/public/avatars/" in url]
        if avatar_paths:
            try:
                await asyncio.to_thread(lambda: service_supabase.storage.from_("avatars").remove(avatar_paths))
            except Exception as e:
                print(f"Storage avatar delete failed: {e}")

    # 10. Delete Supabase Auth accounts for all students
    for sid in student_ids:
        try:
            service_supabase.auth.admin.delete_user(sid)
        except Exception as e:
            print(f"Auth delete failed for student {sid}: {e}")

    # 11. Delete students DB rows (safe now — test_attempts already removed)
    if student_ids:
        service_supabase.table("students").delete().in_("id", student_ids).execute()

    # 12. Clear in-memory broadcast history for this standard and persist
    manager.broadcast_history = [b for b in manager.broadcast_history if b.get("standard_id") != standard_id]
    try:
        import json as _json
        with open("broadcasts.json", "w") as f:
            _json.dump(manager.broadcast_history, f)
    except Exception:
        pass

    # 13. Delete the standard — PostgreSQL CASCADE removes:
    #     subject_classes, videos (DB), video_progress, tests, questions,
    #     attendance_records, broadcasts, invite_links, student_sessions
    service_supabase.table("standards").delete().eq("id", standard_id).execute()
    return {"message": "Standard terminated"}

# Subjects CRUD
@app.get("/api/subjects")
def get_subjects(standard_id: Optional[str] = None, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    if standard_id:
        response = service_supabase.table("subject_classes").select("*").eq("standard_id", standard_id).execute()
        return response.data or []
    elif user["role"] == "student":
        student = service_supabase.table("students").select("standard_id").eq("id", user["user_id"]).single().execute()
        if not student.data or not student.data.get("standard_id"):
            return []
        response = service_supabase.table("subject_classes").select("*").eq("standard_id", student.data["standard_id"]).execute()
        return response.data or []
    else:
        # Teacher: return all subjects for their standards. Claim any orphaned
        # (teacher_id IS NULL) standards first so seeded/migrated standards — whose
        # subjects students can already see — become visible & manageable here too.
        _claim_orphan_standards(user["teacher_id"])
        stds = service_supabase.table("standards").select("id").eq("teacher_id", user["teacher_id"]).execute()
        if not stds.data:
            return []
        std_ids = [s["id"] for s in stds.data]
        response = service_supabase.table("subject_classes").select("*").in_("standard_id", std_ids).execute()
        return response.data or []

@app.post("/api/subjects")
def create_subject(subject: SubjectClass, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Verify standard ownership
    standard = service_supabase.table("standards").select("teacher_id").eq("id", subject.standard_id).single().execute()
    if not standard.data or standard.data["teacher_id"] != user["teacher_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    data = {
        "standard_id": subject.standard_id,
        "name": subject.name,
        "emoji": subject.emoji,
        "end_date": subject.end_date
    }
    response = service_supabase.table("subject_classes").insert(data).execute()
    return response.data[0]

@app.patch("/api/subjects/{subject_id}")
def update_subject(subject_id: str, updates: SubjectUpdate, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    subj = service_supabase.table("subject_classes").select("standard_id").eq("id", subject_id).single().execute()
    if not subj.data:
        raise HTTPException(status_code=404, detail="Subject not found")
    std = service_supabase.table("standards").select("teacher_id").eq("id", subj.data["standard_id"]).single().execute()
    if not std.data or std.data["teacher_id"] != user["teacher_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if update_data:
        service_supabase.table("subject_classes").update(update_data).eq("id", subject_id).execute()

    return {"message": "Subject updated"}

@app.delete("/api/subjects/{subject_id}")
def delete_subject(subject_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    subj = service_supabase.table("subject_classes").select("standard_id").eq("id", subject_id).single().execute()
    if not subj.data:
        raise HTTPException(status_code=404, detail="Subject not found")
    std = service_supabase.table("standards").select("teacher_id").eq("id", subj.data["standard_id"]).single().execute()
    if not std.data or std.data["teacher_id"] != user["teacher_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    service_supabase.table("subject_classes").delete().eq("id", subject_id).execute()
    return {"message": "Subject deleted"}

# Students
@app.get("/api/students")
def get_students(standard_id: Optional[str] = None, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Safe field list — never include any password column regardless of DB state
    teacher_fields = "id, name, username, student_code, email, phone, avatar_url, standard_id, points, attendance_pct, avg_score, blocked, must_change_pwd, created_at"
    # Students only see safe fields (no phone/email of other students)
    student_public_fields = "id, name, username, standard_id, points, attendance_pct, avg_score, avatar_url"

    if user["role"] == "teacher":
        if standard_id:
            response = service_supabase.table("students").select(teacher_fields).eq("standard_id", standard_id).execute()
        else:
            standards = service_supabase.table("standards").select("id").eq("teacher_id", user["teacher_id"]).execute()
            standard_ids = [s["id"] for s in (standards.data or [])]
            if standard_ids:
                response = service_supabase.table("students").select(teacher_fields).in_("standard_id", standard_ids).execute()
            else:
                return []
    else:
        # Students can see classmates but not their phone/email
        if standard_id:
            response = service_supabase.table("students").select(student_public_fields).eq("standard_id", standard_id).execute()
        else:
            student_std = user.get("standard_id")
            if student_std:
                response = service_supabase.table("students").select(student_public_fields).eq("standard_id", student_std).execute()
            else:
                return []

    return response.data or []

@app.get("/api/students/{student_id}")
def get_student(student_id: str, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    # Explicit safe field list — never include any password column regardless of DB state
    safe_fields = "id, name, username, student_code, email, phone, avatar_url, standard_id, points, attendance_pct, avg_score, blocked, must_change_pwd, created_at"
    if user["role"] == "teacher":
        fields = safe_fields
    elif user.get("user_id") == student_id or user.get("student_id") == student_id:
        fields = safe_fields
    else:
        raise HTTPException(status_code=403, detail="Not authorized")
    response = service_supabase.table("students").select(fields).eq("id", student_id).single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Student not found")
    return response.data

@app.get("/api/reports/standard/{standard_id}/analytics")
def get_standard_analytics(standard_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # 1. Overview & Students
    students_res = service_supabase.table("students").select(
        "id, name, avatar_url, attendance_pct, avg_score, points"
    ).eq("standard_id", standard_id).execute()
    students = students_res.data or []
    
    total_students = len(students)
    avg_score = sum(s.get("avg_score") or 0 for s in students) / total_students if total_students else 0
    avg_attendance = sum(s.get("attendance_pct") or 0 for s in students) / total_students if total_students else 0
    total_points = sum(s.get("points") or 0 for s in students)
    
    # 2. Subject-wise performance
    subjects_res = service_supabase.table("subject_classes").select("id, name").eq("standard_id", standard_id).execute()
    subjects = subjects_res.data or []
    subject_ids = [sub["id"] for sub in subjects]
    
    subject_performance = []
    recent_tests = []
    
    if subject_ids:
        # Get attendance summary
        att_res = service_supabase.table("attendance_summary").select("subject_class_id, attendance_pct").in_("subject_class_id", subject_ids).execute()
        att_data = att_res.data or []
        
        subject_att = {}
        for row in att_data:
            sid = row["subject_class_id"]
            if sid not in subject_att:
                subject_att[sid] = []
            if row.get("attendance_pct") is not None:
                subject_att[sid].append(row["attendance_pct"])
        
        # Get tests for these subjects
        tests_res = service_supabase.table("tests").select("id, class_id, title, created_at").in_("class_id", subject_ids).order("created_at", desc=True).execute()
        tests = tests_res.data or []
        test_ids = [t["id"] for t in tests]
        
        subject_scores = {}
        test_stats = {} 
        if test_ids:
            attempts_res = service_supabase.table("test_attempts").select("test_id, score, tests!inner(class_id, total_marks)").in_("test_id", test_ids).execute()
            for a in (attempts_res.data or []):
                t = a.get("tests") or {}
                cid = t.get("class_id")
                score = a.get("score")
                tm = t.get("total_marks")
                if cid and score is not None and tm:
                    pct = (score / tm) * 100
                    if cid not in subject_scores:
                        subject_scores[cid] = []
                    subject_scores[cid].append(pct)
                    
                    tid = a["test_id"]
                    if tid not in test_stats:
                        test_stats[tid] = {"score_sum": 0, "count": 0}
                    test_stats[tid]["score_sum"] += pct
                    test_stats[tid]["count"] += 1
        
        for sub in subjects:
            sid = sub["id"]
            att_list = subject_att.get(sid, [])
            sc_list = subject_scores.get(sid, [])
            
            subject_performance.append({
                "subject_id": sid,
                "subject_name": sub["name"],
                "avg_attendance": round(sum(att_list)/len(att_list)) if att_list else 0,
                "avg_score": round(sum(sc_list)/len(sc_list)) if sc_list else 0
            })
            
        # 3. Recent Tests
        for t in tests[:5]:
            stats = test_stats.get(t["id"], {"score_sum": 0, "count": 0})
            count = stats["count"]
            sc_avg = round(stats["score_sum"] / count) if count > 0 else 0
            participation = round((count / total_students) * 100) if total_students else 0
            sub_name = next((s["name"] for s in subjects if s["id"] == t["class_id"]), "Unknown")
            recent_tests.append({
                "test_id": t["id"],
                "title": t["title"],
                "subject_name": sub_name,
                "avg_score": sc_avg,
                "participation": participation,
                "date": t["created_at"]
            })
        
    return {
        "overview": {
            "total_students": total_students,
            "avg_score": round(avg_score),
            "avg_attendance": round(avg_attendance),
            "total_points": total_points
        },
        "subject_performance": subject_performance,
        "recent_tests": recent_tests,
        "students": students
    }

@app.get("/api/students/{student_id}/report")
def get_student_report(student_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Get student info — explicit fields, no password columns
    student_res = service_supabase.table("students").select(
        "id, name, username, email, phone, avatar_url, standard_id, points, attendance_pct, avg_score, blocked, must_change_pwd, created_at"
    ).eq("id", student_id).single().execute()
    if not student_res.data:
        raise HTTPException(status_code=404, detail="Student not found")

    # Get all test attempts with test titles
    attempts_res = service_supabase.table("test_attempts").select("*, tests(title, total_marks, created_at)").eq("student_id", student_id).order("submitted_at").execute()

    # Calculate performance history
    history = []
    for a in (attempts_res.data or []):
        test = a.get("tests", {})
        score_pct = (a["score"] / (test.get("total_marks") or 100)) * 100 if a.get("score") is not None else 0
        history.append({
            "test_title": test.get("title", "Unknown Test"),
            "score_pct": round(score_pct, 1),
            "date": a["created_at"],
            "flagged": a.get("flagged", False)
        })

    # Get video watch history
    video_progress_res = service_supabase.table("video_progress").select(
        "video_id, completed, progress_secs, last_watched_at, videos(title, duration_secs, subject_classes(name))"
    ).eq("student_id", student_id).order("last_watched_at", desc=True).execute()

    video_history = []
    for r in (video_progress_res.data or []):
        vid = r.get("videos") or {}
        sc = vid.get("subject_classes") or {}
        video_history.append({
            "video_id": r["video_id"],
            "title": vid.get("title", "Unknown Video"),
            "subject_name": sc.get("name", ""),
            "completed": r.get("completed", False),
            "progress_secs": r.get("progress_secs", 0),
            "duration_secs": vid.get("duration_secs"),
            "last_watched_at": r.get("last_watched_at"),
        })

    return {
        "student": student_res.data,
        "history": history,
        "video_history": video_history,
    }

@app.get("/api/students/{student_id}/report/v2")
def get_student_report_v2(student_id: str, period: str = "overall", user = Depends(verify_token)):
    """Enhanced report with radar data, heatmaps, topic map, period filtering.
    Pass student_id='me' to fetch the logged-in student's own report."""
    if user["role"] not in ("teacher", "student"):
        raise HTTPException(status_code=403, detail="Not authorized")
    # Resolve 'me' alias — avoids route shadowing by /{student_id}/report
    if student_id == "me":
        if user["role"] != "student":
            raise HTTPException(status_code=403, detail="Student only for /me/ routes")
        student_id = user.get("student_id") or user.get("user_id") or ""
    # Students can only fetch their own report
    if user["role"] == "student" and user.get("student_id") != student_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    if period == "weekly":
        period_start = (now - timedelta(days=7)).isoformat()
    elif period == "monthly":
        period_start = (now - timedelta(days=30)).isoformat()
    else:
        period_start = None  # overall — no filter

    # ── Student profile ──────────────────────────────────────────────
    student_res = service_supabase.table("students").select(
        "id, name, username, student_code, email, avatar_url, standard_id, points, attendance_pct, avg_score, blocked, created_at"
    ).eq("id", student_id).single().execute()
    if not student_res.data:
        raise HTTPException(status_code=404, detail="Student not found")
    student = student_res.data

    # Fetch last_active_at from student_sessions
    try:
        sess_res = service_supabase.table("student_sessions").select("last_active_at").eq("student_id", student_id).single().execute()
        student["last_active_at"] = sess_res.data.get("last_active_at") if sess_res.data else None
    except Exception:
        student["last_active_at"] = None

    # ── Get all subjects for this standard ───────────────────────────
    std_id = student.get("standard_id")
    std_name = None
    if std_id:
        subjects_res = service_supabase.table("subject_classes").select("id, name, emoji").eq("standard_id", std_id).execute()
        subjects = subjects_res.data or []
        try:
            std_res = service_supabase.table("standards").select("name").eq("id", std_id).single().execute()
            std_name = std_res.data["name"] if std_res.data else None
        except Exception:
            pass
    else:
        subjects = []
    student["standard_name"] = std_name
    sub_map = {s["id"]: s for s in subjects}

    # ── Test attempts (period filtered) ──────────────────────────────
    q = service_supabase.table("test_attempts").select(
        "id, score, correct_count, wrong_count, submitted_at, flagged, tests(id, title, total_marks, class_id)"
    ).eq("student_id", student_id).order("submitted_at")
    if period_start:
        q = q.gte("submitted_at", period_start)
    attempts_res = q.execute()
    attempts = attempts_res.data or []

    # Build test timeline
    test_timeline = []
    for a in attempts:
        t = a.get("tests") or {}
        total = t.get("total_marks") or 100
        score_pct = round((a.get("score") or 0) / total * 100, 1)
        class_id = t.get("class_id", "")
        sub = sub_map.get(class_id, {})
        test_timeline.append({
            "date": a.get("submitted_at") or a.get("created_at"),
            "test_title": t.get("title", "Test"),
            "test_id": t.get("id"),
            "subject_id": class_id,
            "subject": sub.get("name", ""),
            "emoji": sub.get("emoji", "book"),
            "score_pct": score_pct,
            "flagged": a.get("flagged", False),
        })

    # ── Video progress (period filtered) ─────────────────────────────
    vq = service_supabase.table("video_progress").select(
        "video_id, completed, progress_secs, last_watched_at, videos(id, title, duration_secs, class_id)"
    ).eq("student_id", student_id)
    if period_start:
        vq = vq.gte("last_watched_at", period_start)
    vp_res = vq.execute()
    vp_rows = vp_res.data or []

    # All videos per subject (total count for video_pct)
    all_vids_res = service_supabase.table("videos").select("id, class_id, title").in_("class_id", [s["id"] for s in subjects]).execute() if subjects else None
    all_vids = all_vids_res.data if all_vids_res else []

    # ── Attendance records (period filtered) ─────────────────────────
    aq = service_supabase.table("attendance_records").select(
        "date, status, subject_class_id"
    ).eq("student_id", student_id).order("date")
    if period_start:
        aq = aq.gte("date", period_start[:10])
    att_res = aq.execute()
    att_rows = att_res.data or []

    # ── Subject-level aggregates (for radar) ─────────────────────────
    subject_scores: dict = {}  # class_id → {scores:[], video_total, video_done, present, total}
    for s in subjects:
        subject_scores[s["id"]] = {"scores": [], "video_total": 0, "video_done": 0, "present": 0, "absent": 0, "late": 0, "att_total": 0}

    for t in test_timeline:
        sid = t["subject_id"]
        if sid in subject_scores:
            subject_scores[sid]["scores"].append(t["score_pct"])

    for v in all_vids:
        sid = v["class_id"]
        if sid in subject_scores:
            subject_scores[sid]["video_total"] += 1

    for vp in vp_rows:
        vid = vp.get("videos") or {}
        sid = vid.get("class_id", "")
        if sid in subject_scores and vp.get("completed"):
            subject_scores[sid]["video_done"] += 1

    for ar in att_rows:
        sid = ar.get("subject_class_id", "")
        if sid in subject_scores:
            subject_scores[sid]["att_total"] += 1
            status = ar.get("status", "absent")
            if status == "present":
                subject_scores[sid]["present"] += 1
            elif status == "late":
                subject_scores[sid]["late"] += 1
            else:
                subject_scores[sid]["absent"] += 1

    subject_radar = []
    for s in subjects:
        sid = s["id"]
        d = subject_scores[sid]
        test_avg = round(sum(d["scores"]) / len(d["scores"]), 1) if d["scores"] else 0
        video_pct = round(d["video_done"] / d["video_total"] * 100, 1) if d["video_total"] > 0 else 0
        att_pct = round((d["present"] + d["late"] * 0.5) / d["att_total"] * 100, 1) if d["att_total"] > 0 else 0
        subject_radar.append({
            "subject_id": sid,
            "subject": s["name"],
            "emoji": s.get("emoji", "book"),
            "test_avg": test_avg,
            "video_pct": video_pct,
            "attendance_pct": att_pct,
            "test_count": len(d["scores"]),
            "video_total": d["video_total"],
            "video_done": d["video_done"],
            "att_present": d["present"],
            "att_total": d["att_total"],
        })

    # ── Topic map (video ↔ test matching by word overlap) ────────────
    STOPWORDS = {"the","a","an","of","in","on","for","to","and","with","chapter","test","weekly","unit","lesson","class","intro","introduction","part","section","basic","basics","advanced"}
    def keywords(title: str):
        return {w for w in title.lower().split() if w not in STOPWORDS and len(w) > 2}

    topic_map = []
    vp_by_vid = {vp["video_id"]: vp for vp in vp_rows}
    for t in test_timeline:
        t_kw = keywords(t["test_title"])
        best_vid = None
        best_score_overlap = 0
        for v in all_vids:
            if v.get("class_id") != t["subject_id"]:
                continue
            overlap = len(t_kw & keywords(v["title"]))
            if overlap > best_score_overlap:
                best_score_overlap = overlap
                best_vid = v
        if best_vid and best_score_overlap >= 1:
            vp = vp_by_vid.get(best_vid["id"], {})
            # derive a clean topic name from overlapping words
            overlap_words = t_kw & keywords(best_vid["title"])
            topic_name = " ".join(w.capitalize() for w in sorted(overlap_words)[:3]) or t["test_title"]
            topic_map.append({
                "topic": topic_name,
                "subject": t["subject"],
                "video_title": best_vid["title"],
                "test_title": t["test_title"],
                "score_pct": t["score_pct"],
                "video_completed": bool(vp.get("completed")),
            })

    # ── Attendance heatmap (daily) ────────────────────────────────────
    att_by_date: dict = {}
    for ar in att_rows:
        d = ar["date"]
        if d not in att_by_date:
            att_by_date[d] = {"present": 0, "absent": 0, "late": 0, "total": 0}
        att_by_date[d]["total"] += 1
        s = ar.get("status", "absent")
        if s in ("present", "absent", "late"):
            att_by_date[d][s] += 1
    attendance_heatmap = [{"date": d, **v} for d, v in sorted(att_by_date.items())]

    # ── Video heatmap (daily minutes) ────────────────────────────────
    vid_by_date: dict = {}
    for vp in vp_rows:
        ts = vp.get("last_watched_at", "")
        if not ts:
            continue
        day = ts[:10]
        vid = vp.get("videos") or {}
        # estimate minutes watched from progress_secs (fallback to duration if completed)
        watched_secs = vp.get("progress_secs") or 0
        if vp.get("completed") and watched_secs == 0:
            watched_secs = vid.get("duration_secs") or 600  # fallback to 10 mins if null
        if day not in vid_by_date:
            vid_by_date[day] = {"minutes": 0, "count": 0}
        vid_by_date[day]["minutes"] += round(watched_secs / 60, 1)
        vid_by_date[day]["count"] += 1
    video_heatmap = [{"date": d, **v} for d, v in sorted(vid_by_date.items())]

    # ── Test participation heatmap (days when student submitted tests) ────
    test_by_date: dict = {}
    for a in attempts:
        ts = a.get("submitted_at", "")
        if not ts:
            continue
        day = ts[:10]
        if day not in test_by_date:
            test_by_date[day] = {"count": 0}
        test_by_date[day]["count"] += 1
    test_heatmap = [{"date": d, **v} for d, v in sorted(test_by_date.items())]

    # ── Total tests available in standard (for participation KPI) ────────
    total_tests_in_standard = 0
    if subjects:
        try:
            all_tests_res = service_supabase.table("tests").select("id, class_id, created_at").in_(
                "class_id", [s["id"] for s in subjects]
            ).in_("status", ["active", "scheduled"]).execute()
            avail = all_tests_res.data or []
            if period_start:
                avail = [t for t in avail if (t.get("created_at") or "") >= period_start]
            total_tests_in_standard = len(avail)
        except Exception:
            pass

    # ── Student rank in standard ──────────────────────────────────────────
    rank = None
    total_students = 0
    if std_id:
        try:
            ranked_res = service_supabase.table("students").select("id, points").eq(
                "standard_id", std_id
            ).order("points", desc=True).execute()
            ranked_list = ranked_res.data or []
            total_students = len(ranked_list)
            for i, s in enumerate(ranked_list):
                if s["id"] == student_id:
                    rank = i + 1
                    break
        except Exception:
            pass

    # ── Topic mastery pct (topics where score >= 60%) ─────────────────────
    mastered = sum(1 for t in topic_map if t["score_pct"] >= 60)
    topic_mastery_pct = round(mastered / len(topic_map) * 100, 1) if topic_map else 0

    # ── Assignment data ────────────────────────────────────────────────────
    assignment_stats: dict = {"total": 0, "submitted": 0, "graded": 0, "avg_marks_pct": 0, "total_points_from_assignments": 0}
    assignment_scores: list = []
    assignment_heatmap: list = []
    try:
        if subjects:
            class_ids_for_assign = [s["id"] for s in subjects]
            all_assigns_res = service_supabase.table("assignments").select(
                "id, class_id, title"
            ).in_("class_id", class_ids_for_assign).execute()
            all_assigns = all_assigns_res.data or []
            assign_ids = [a["id"] for a in all_assigns]

            if assign_ids:
                subs_res = service_supabase.table("assignment_submissions").select(
                    "assignment_id, marks_obtained, points_earned, submitted_at, graded_at"
                ).eq("student_id", student_id).in_("assignment_id", assign_ids).execute()
                my_assign_subs = subs_res.data or []
            else:
                my_assign_subs = []

            assign_sub_map = {s["assignment_id"]: s for s in my_assign_subs}

            for a in all_assigns:
                sub = assign_sub_map.get(a["id"])
                subj = sub_map.get(a["class_id"], {})
                assignment_scores.append({
                    "assignment_id": a["id"],
                    "assignment_title": a["title"],
                    "class_id": a["class_id"],
                    "subject_name": subj.get("name", ""),
                    "emoji": subj.get("emoji", "book"),
                    "submitted_at": sub.get("submitted_at") if sub else None,
                    "marks_obtained": sub.get("marks_obtained") if sub else None,
                    "points_earned": sub.get("points_earned") if sub else None,
                    "graded_at": sub.get("graded_at") if sub else None,
                })

            graded_subs = [s for s in my_assign_subs if s.get("marks_obtained") is not None]
            avg_marks_pct = round(sum(float(s["marks_obtained"]) for s in graded_subs) / len(graded_subs), 1) if graded_subs else 0
            assignment_stats = {
                "total": len(all_assigns),
                "submitted": len(my_assign_subs),
                "graded": len(graded_subs),
                "avg_marks_pct": avg_marks_pct,
                "total_points_from_assignments": sum((s.get("points_earned") or 0) for s in my_assign_subs),
            }

            from collections import defaultdict as _defaultdict
            assign_heat: dict = _defaultdict(int)
            for s in my_assign_subs:
                ts = s.get("submitted_at") or ""
                if ts:
                    assign_heat[ts[:10]] += 1
            assignment_heatmap = [{"date": d, "count": c} for d, c in sorted(assign_heat.items())]

            for sr in subject_radar:
                sid = sr["subject_id"]
                subj_assigns = [a for a in all_assigns if a["class_id"] == sid]
                subj_graded = [assign_sub_map[a["id"]] for a in subj_assigns if a["id"] in assign_sub_map and assign_sub_map[a["id"]].get("marks_obtained") is not None]
                sr["assignment_avg"] = round(sum(float(s["marks_obtained"]) for s in subj_graded) / len(subj_graded), 1) if subj_graded else 0
                sr["assignment_total"] = len(subj_assigns)
                sr["assignment_submitted"] = len([a for a in subj_assigns if a["id"] in assign_sub_map])
    except Exception as _exc:
        print(f"Assignment report data error (non-fatal): {_exc}")
        for sr in subject_radar:
            sr.setdefault("assignment_avg", 0)
            sr.setdefault("assignment_total", 0)
            sr.setdefault("assignment_submitted", 0)

    # ── Per-subject heatmaps (wrapped so any error can't crash the endpoint) ─
    attendance_heatmap_by_subject: dict = {}
    video_heatmap_by_subject: dict = {}
    test_heatmap_by_subject: dict = {}
    try:
        # Attendance by subject
        att_by_subj: dict = {}
        for ar in att_rows:
            subj_id = ar.get("subject_class_id") or ""
            if not subj_id:
                continue
            day_key = ar.get("date") or ""
            if not day_key:
                continue
            if subj_id not in att_by_subj:
                att_by_subj[subj_id] = {}
            if day_key not in att_by_subj[subj_id]:
                att_by_subj[subj_id][day_key] = {"present": 0, "absent": 0, "late": 0, "total": 0}
            att_by_subj[subj_id][day_key]["total"] += 1
            status_val = ar.get("status") or "absent"
            if status_val in ("present", "absent", "late"):
                att_by_subj[subj_id][day_key][status_val] += 1
        attendance_heatmap_by_subject = {
            subj_id: [{"date": dk, **dv} for dk, dv in sorted(days_dict.items())]
            for subj_id, days_dict in att_by_subj.items()
        }

        # Video watching by subject
        vid_by_subj: dict = {}
        for vp_item in vp_rows:
            vid_info = vp_item.get("videos") or {}
            subj_id = vid_info.get("class_id") or ""
            if not subj_id:
                continue
            ts_val = vp_item.get("last_watched_at") or ""
            if not ts_val:
                continue
            day_key = ts_val[:10]
            if subj_id not in vid_by_subj:
                vid_by_subj[subj_id] = {}
            if day_key not in vid_by_subj[subj_id]:
                vid_by_subj[subj_id][day_key] = {"minutes": 0, "count": 0}
            watched_secs = vp_item.get("progress_secs") or 0
            if vp_item.get("completed") and watched_secs == 0:
                watched_secs = vid_info.get("duration_secs") or 600  # fallback to 10 mins if null
            vid_by_subj[subj_id][day_key]["minutes"] += round(watched_secs / 60, 1)
            vid_by_subj[subj_id][day_key]["count"] += 1
        video_heatmap_by_subject = {
            subj_id: [{"date": dk, **dv} for dk, dv in sorted(days_dict.items())]
            for subj_id, days_dict in vid_by_subj.items()
        }

        # Test participation by subject
        test_by_subj: dict = {}
        for attempt_item in attempts:
            test_info = attempt_item.get("tests") or {}
            subj_id = test_info.get("class_id") or ""
            if not subj_id:
                continue
            ts_val = attempt_item.get("submitted_at") or ""
            if not ts_val:
                continue
            day_key = ts_val[:10]
            if subj_id not in test_by_subj:
                test_by_subj[subj_id] = {}
            if day_key not in test_by_subj[subj_id]:
                test_by_subj[subj_id][day_key] = {"count": 0}
            test_by_subj[subj_id][day_key]["count"] += 1
        test_heatmap_by_subject = {
            subj_id: [{"date": dk, **dv} for dk, dv in sorted(days_dict.items())]
            for subj_id, days_dict in test_by_subj.items()
        }
    except Exception as exc:
        print(f"Per-subject heatmap error (non-fatal): {exc}")

    # ── Live Class Attendance ───────────────────────────────────────────────
    live_classes_stats = {"total": 0, "attended": 0, "attendance_pct": 0}
    try:
        if subjects:
            class_ids = [s["id"] for s in subjects]
            lc_res = service_supabase.table("live_classes").select("id").in_("class_id", class_ids).in_("status", ["ended", "live"]).execute()
            lcs = lc_res.data or []
            live_classes_stats["total"] = len(lcs)
            if lcs:
                lc_ids = [lc["id"] for lc in lcs]
                lca_res = service_supabase.table("live_class_attendance").select("attended").eq("student_id", student_id).in_("live_class_id", lc_ids).execute()
                lca_rows = lca_res.data or []
                attended = sum(1 for r in lca_rows if r.get("attended"))
                live_classes_stats["attended"] = attended
                live_classes_stats["attendance_pct"] = round((attended / len(lcs)) * 100, 1)
    except Exception as exc:
        print(f"Live class stats error (non-fatal): {exc}")

    return {
        "student": student,
        "period": period,
        "subject_radar": subject_radar,
        "test_timeline": test_timeline,
        "topic_map": topic_map,
        "attendance_heatmap": attendance_heatmap,
        "video_heatmap": video_heatmap,
        "test_heatmap": test_heatmap,
        "assignment_stats": assignment_stats,
        "assignment_scores": assignment_scores,
        "assignment_heatmap": assignment_heatmap,
        "attendance_heatmap_by_subject": attendance_heatmap_by_subject,
        "video_heatmap_by_subject":      video_heatmap_by_subject,
        "test_heatmap_by_subject":       test_heatmap_by_subject,
        "total_tests_in_standard": total_tests_in_standard,
        "rank": rank,
        "total_students": total_students,
        "topic_mastery_pct": topic_mastery_pct,
        "subjects": subjects,
        "live_classes_stats": live_classes_stats,
    }


# /students/me/report removed — use /students/me/report/v2 instead
# (literal 'me' path would be shadowed by /{student_id}/report in FastAPI's route order)


# ─── STUDENT ID (human-readable code) GENERATION ───────────────────────────
# Format (no separators): {YY}{INSTITUTION}{STD}{SEQ}  e.g. 25UDAYA100001
#   YY          = admission year, last 2 digits (e.g. 2025 -> "25")
#   INSTITUTION = branding name, A-Z0-9 only, capped 8 chars (default "Udaya")
#   STD         = standard number (zero-padded 2) or first 2 alnum chars
#   SEQ         = running roll number per {YY}{INSTITUTION}{STD} prefix, 4+ digits
# Fixed widths keep the glued code decodable; a partial unique index on
# students.student_code is the hard uniqueness guarantee. The institution letters
# always sit between the two numeric groups, so the code stays unambiguous even
# though it now leads with digits.

def _institution_prefix() -> str:
    name = (get_teacher_settings().get("lms_name") or "Udaya")
    code = re.sub(r'[^A-Za-z0-9]', '', name).upper()
    return code[:8] or "TUT"

def _std_token(standard: dict) -> str:
    src = ((standard or {}).get("short") or (standard or {}).get("name") or "")
    digits = re.sub(r'\D', '', src)
    if digits:
        return digits.zfill(2)
    alpha = re.sub(r'[^A-Za-z0-9]', '', src).upper()
    return alpha[:2] or "00"

def _max_seq_for_prefix(prefix: str) -> int:
    try:
        existing = service_supabase.table("students").select("student_code").ilike("student_code", f"{prefix}%").execute()
    except Exception:
        return 0
    max_seq = 0
    for row in (existing.data or []):
        code = row.get("student_code") or ""
        tail = code[len(prefix):]
        if tail.isdigit():
            max_seq = max(max_seq, int(tail))
    return max_seq

def generate_student_code(standard_id, year=None, seq_cache=None):
    """Return a unique student code, or None when no standard can be resolved.
    Pass a shared `seq_cache` dict across a batch (bulk import) to avoid
    re-querying the max sequence — and to prevent in-batch collisions — for each row."""
    if not standard_id or not service_supabase:
        return None
    try:
        std = service_supabase.table("standards").select("name, short").eq("id", standard_id).single().execute()
        standard = std.data or {}
    except Exception:
        standard = {}
    yr = year or datetime.now().year
    prefix = f"{str(yr)[-2:]}{_institution_prefix()}{_std_token(standard)}"
    if seq_cache is not None and prefix in seq_cache:
        seq = seq_cache[prefix] + 1
    else:
        seq = _max_seq_for_prefix(prefix) + 1
    if seq_cache is not None:
        seq_cache[prefix] = seq
    return f"{prefix}{seq:04d}"

def assign_student_code(student_db_id, standard_id, year=None, seq_cache=None):
    """Generate + persist a student_code as a post-insert UPDATE (mirrors the
    plain_password pattern). Resilient: if the column is missing or a rare unique
    collision occurs, it retries with a fresh sequence, then gives up silently so
    student creation is never blocked. Returns the code written, or None."""
    if not standard_id or not service_supabase:
        return None
    for _ in range(3):
        code = generate_student_code(standard_id, year=year, seq_cache=seq_cache)
        if not code:
            return None
        try:
            service_supabase.table("students").update({"student_code": code}).eq("id", student_db_id).execute()
            return code
        except Exception as e:
            # On a unique-violation retry with a bumped sequence; bust the cache
            # so the next attempt re-reads the true max from the DB.
            if seq_cache is not None:
                seq_cache.clear()
            err = str(e).lower()
            if not any(k in err for k in ["duplicate", "unique"]):
                return None
    return None


@app.post("/api/admin/create-student")
def create_student_admin(request: CreateStudentRequest, background_tasks: BackgroundTasks, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=500, detail="Database not available")

    auth_email = request.email or f"{request.username}@tutoria.local"

    try:
        response = service_supabase.auth.admin.create_user({
            "email": auth_email,
            "password": request.password,
            "email_confirm": True,
            "user_metadata": {
                "role": "student",
                "name": request.name,
                "username": request.username
            }
        })

        if not response.user:
            raise HTTPException(status_code=400, detail="Failed to create student")

        student_data = {
            "id": response.user.id,
            "name": request.name,
            "username": request.username,
            "email": auth_email,
            "standard_id": request.standard_id,
        }
        service_supabase.table("students").insert(student_data).execute()
        try:
            service_supabase.table("students").update({"plain_password": request.password}).eq("id", response.user.id).execute()
        except Exception:
            pass

        student_code = assign_student_code(response.user.id, request.standard_id)

        # Fire auto-welcome (credentials) if enabled — guarded, never blocks creation.
        background_tasks.add_task(_wa_auto_welcome, response.user.id)

        return {
            "id": response.user.id,
            "email": auth_email,
            "username": request.username,
            "student_code": student_code,
            "role": "student",
            "password": request.password
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/admin/backfill-student-codes")
def backfill_student_codes(force: bool = False, user = Depends(verify_token)):
    """Assign student codes. Two modes:
      - default (force=False): one-time fill — students that already have a code
        are skipped (idempotent).
      - force=True: regenerate ALL codes into the current format. Clears every
        code first so numbering restarts at 0001 per {YY}{INST}{STD} prefix in
        created_at order, which makes the action deterministic and re-runnable.
        NOTE: this changes existing students' login IDs.
    Year is each student's admission year (from created_at); sequence is per
    standard/year."""
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Limit to this teacher's students (those inside their standards)
    standards = service_supabase.table("standards").select("id").eq("teacher_id", user["teacher_id"]).execute()
    standard_ids = [s["id"] for s in (standards.data or [])]
    if not standard_ids:
        return {"updated": 0, "skipped": 0}

    rows = service_supabase.table("students").select(
        "id, standard_id, student_code, created_at"
    ).in_("standard_id", standard_ids).order("created_at").execute()

    if force:
        # Wipe existing codes so regeneration is deterministic and re-runnable.
        # The partial unique index ignores NULLs, so this can't collide.
        service_supabase.table("students").update({"student_code": None}).in_("standard_id", standard_ids).execute()

    seq_cache = {}
    updated = skipped = 0
    for s in (rows.data or []):
        if not s.get("standard_id"):
            skipped += 1
            continue
        if not force and s.get("student_code"):
            skipped += 1
            continue
        year = None
        ca = s.get("created_at")
        if ca:
            try:
                year = int(str(ca)[:4])
            except Exception:
                year = None
        if assign_student_code(s["id"], s["standard_id"], year=year, seq_cache=seq_cache):
            updated += 1
        else:
            skipped += 1
    return {"updated": updated, "skipped": skipped}

@app.patch("/api/students/me")
def update_student_profile(request: StudentProfileUpdate, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    allowed = {k: v for k, v in request.model_dump().items() if v is not None}
    if allowed:
        service_supabase.table("students").update(allowed).eq("id", user["user_id"]).execute()
    return {"message": "Profile updated"}

@app.get("/api/students/me/videos")
def get_my_videos(user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    student_id = user["user_id"]
    res = service_supabase.table("video_progress").select(
        "video_id, completed, progress_secs, last_watched_at, videos(title, duration_secs, subject_classes(name))"
    ).eq("student_id", student_id).order("last_watched_at", desc=True).execute()

    result = []
    for r in (res.data or []):
        vid = r.get("videos") or {}
        sc = vid.get("subject_classes") or {}
        result.append({
            "video_id": r["video_id"],
            "title": vid.get("title", "Unknown Video"),
            "subject_name": sc.get("name", ""),
            "completed": r.get("completed", False),
            "progress_secs": r.get("progress_secs", 0),
            "duration_secs": vid.get("duration_secs"),
            "last_watched_at": r.get("last_watched_at"),
        })
    return result

@app.get("/api/student/calendar-events")
def get_student_calendar_events(start_date: str, end_date: str, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    standard_id = user.get("standard_id")
    if not standard_id:
        return []

    # Get class IDs for the student's standard
    subjects = service_supabase.table("subject_classes").select("id, name").eq("standard_id", standard_id).execute()
    if not subjects.data:
        return []
        
    class_ids = [s["id"] for s in subjects.data]
    class_names = {s["id"]: s["name"] for s in subjects.data}

    events = []

    # 1. Fetch Tests
    tests_res = service_supabase.table("tests") \
        .select("id, class_id, title, scheduled_for, duration_mins") \
        .in_("class_id", class_ids) \
        .neq("status", "draft") \
        .gte("scheduled_for", start_date) \
        .lte("scheduled_for", end_date + "T23:59:59Z") \
        .execute()
    
    for t in tests_res.data:
        events.append({
            "id": t["id"],
            "type": "test",
            "title": t["title"],
            "date": t["scheduled_for"],
            "duration": t["duration_mins"],
            "subject": class_names.get(t["class_id"], "Unknown"),
            "class_id": t["class_id"]
        })

    # 2. Fetch Live Classes
    live_res = service_supabase.table("live_classes") \
        .select("id, class_id, title, scheduled_at, duration_mins, zoom_join_url") \
        .in_("class_id", class_ids) \
        .gte("scheduled_at", start_date) \
        .lte("scheduled_at", end_date + "T23:59:59Z") \
        .execute()

    for l in live_res.data:
        events.append({
            "id": l["id"],
            "type": "live",
            "title": l["title"],
            "date": l["scheduled_at"],
            "duration": l["duration_mins"],
            "link": l["zoom_join_url"],
            "subject": class_names.get(l["class_id"], "Unknown"),
            "class_id": l["class_id"]
        })

    # 3. Fetch Uploaded Videos
    vid_res = service_supabase.table("videos") \
        .select("id, class_id, title, created_at") \
        .in_("class_id", class_ids) \
        .gte("created_at", start_date) \
        .lte("created_at", end_date + "T23:59:59Z") \
        .execute()

    for v in vid_res.data:
        events.append({
            "id": v["id"],
            "type": "video",
            "title": v["title"],
            "date": v["created_at"],
            "subject": class_names.get(v["class_id"], "Unknown"),
            "class_id": v["class_id"]
        })

    # 4. Fetch Assignments
    assign_res = service_supabase.table("assignments") \
        .select("id, class_id, title, due_date") \
        .in_("class_id", class_ids) \
        .gte("due_date", start_date) \
        .lte("due_date", end_date + "T23:59:59Z") \
        .execute()

    for a in assign_res.data:
        events.append({
            "id": a["id"],
            "type": "assignment",
            "title": a["title"],
            "date": a["due_date"],
            "subject": class_names.get(a["class_id"], "Unknown"),
            "class_id": a["class_id"]
        })

    return events

@app.post("/api/students/me/avatar")
async def upload_student_avatar(file: UploadFile = File(...), user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    file_bytes = await file.read()
    file_ext = os.path.splitext(file.filename or "avatar.jpg")[1] or ".jpg"
    file_name = f"avatars/{user['user_id']}{file_ext}"

    try:
        try:
            await asyncio.to_thread(lambda: service_supabase.storage.get_bucket("avatars"))
        except:
            await asyncio.to_thread(lambda: service_supabase.storage.create_bucket("avatars", options={"public": True}))
        try:
            await asyncio.to_thread(lambda: service_supabase.storage.from_("avatars").remove([file_name]))
        except:
            pass
        await asyncio.to_thread(
            lambda: service_supabase.storage.from_("avatars").upload(file_name, file_bytes, {"content-type": file.content_type or "image/jpeg"})
        )
        public_url = await asyncio.to_thread(
            lambda: service_supabase.storage.from_("avatars").get_public_url(file_name)
        )
        # The storage path is the same on every re-upload, so the URL is identical
        # and browsers serve the cached OLD image. Append a version so each upload
        # yields a unique URL — forcing a fresh fetch on both student and teacher.
        versioned_url = f"{str(public_url).split('?')[0]}?v={int(time_module.time())}"
        await asyncio.to_thread(
            lambda: service_supabase.table("students").update({"avatar_url": versioned_url}).eq("id", user["user_id"]).execute()
        )
        return {"avatar_url": versioned_url}
    except Exception as e:
        print("Avatar upload error:", e)
        raise HTTPException(status_code=500, detail="Upload failed")


@app.get("/api/teacher/thumbnail")
async def get_teacher_thumbnail(user=Depends(verify_token)):
    """Return the teacher's universal live-class base thumbnail + blank-side preference."""
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    try:
        row = service_supabase.table("teacher_branding") \
            .select("thumbnail_url, thumbnail_text_side, profile_photo_url") \
            .eq("teacher_id", user["teacher_id"]).single().execute()
        if row.data:
            return {
                "thumbnail_url": row.data.get("thumbnail_url"),
                "thumbnail_text_side": row.data.get("thumbnail_text_side") or "right",
                "profile_photo_url": row.data.get("profile_photo_url"),
            }
    except Exception:
        pass
    return {"thumbnail_url": None, "thumbnail_text_side": "right", "profile_photo_url": None}


@app.post("/api/teacher/thumbnail")
async def upload_teacher_thumbnail(
    file: UploadFile = File(None),
    text_side: str = Form("right"),
    user=Depends(verify_token),
):
    """Upload the teacher's universal base thumbnail image (face + blank space on one side).
    text_side ('left'|'right') is the blank side where class/subject/topic text is overlaid."""
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    side = "left" if str(text_side).lower() == "left" else "right"
    public_url = None

    if file is not None:
        file_bytes = await file.read()
        file_ext = os.path.splitext(file.filename or "thumb.jpg")[1] or ".jpg"
        file_name = f"thumbnails/{user['teacher_id']}{file_ext}"
        try:
            try:
                await asyncio.to_thread(lambda: service_supabase.storage.get_bucket("thumbnails"))
            except Exception:
                await asyncio.to_thread(lambda: service_supabase.storage.create_bucket("thumbnails", options={"public": True}))
            try:
                await asyncio.to_thread(lambda: service_supabase.storage.from_("thumbnails").remove([file_name]))
            except Exception:
                pass
            await asyncio.to_thread(
                lambda: service_supabase.storage.from_("thumbnails").upload(
                    file_name, file_bytes, {"content-type": file.content_type or "image/jpeg"}
                )
            )
            public_url = await asyncio.to_thread(
                lambda: service_supabase.storage.from_("thumbnails").get_public_url(file_name)
            )
        except Exception as e:
            print("Thumbnail upload error:", e)
            raise HTTPException(status_code=500, detail="Upload failed")

    # Upsert branding row. If no new file, keep the existing URL and just update the side.
    payload = {"teacher_id": user["teacher_id"], "thumbnail_text_side": side}
    if public_url is not None:
        payload["thumbnail_url"] = str(public_url)
    await asyncio.to_thread(
        lambda: service_supabase.table("teacher_branding").upsert(payload, on_conflict="teacher_id").execute()
    )
    return await get_teacher_thumbnail(user)


@app.post("/api/teacher/profile-photo")
async def upload_teacher_profile_photo(
    file: UploadFile = File(...),
    user=Depends(verify_token),
):
    """Upload the teacher's profile photo."""
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    public_url = None
    if file is not None:
        file_bytes = await file.read()
        file_ext = os.path.splitext(file.filename or "photo.jpg")[1] or ".jpg"
        file_name = f"profile-photos/{user['teacher_id']}{file_ext}"
        try:
            try:
                await asyncio.to_thread(lambda: service_supabase.storage.get_bucket("profile-photos"))
            except Exception:
                await asyncio.to_thread(lambda: service_supabase.storage.create_bucket("profile-photos", options={"public": True}))
            try:
                await asyncio.to_thread(lambda: service_supabase.storage.from_("profile-photos").remove([file_name]))
            except Exception:
                pass
            await asyncio.to_thread(
                lambda: service_supabase.storage.from_("profile-photos").upload(
                    file_name, file_bytes, {"content-type": file.content_type or "image/jpeg"}
                )
            )
            public_url = await asyncio.to_thread(
                lambda: service_supabase.storage.from_("profile-photos").get_public_url(file_name)
            )
        except Exception as e:
            print("Profile photo upload error:", e)
            raise HTTPException(status_code=500, detail="Upload failed")

    payload = {"teacher_id": user["teacher_id"]}
    if public_url is not None:
        payload["profile_photo_url"] = str(public_url)
    await asyncio.to_thread(
        lambda: service_supabase.table("teacher_branding").upsert(payload, on_conflict="teacher_id").execute()
    )
    return await get_teacher_thumbnail(user)


@app.patch("/api/students/{student_id}/block")
def block_student(student_id: str, blocked: bool, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    service_supabase.table("students").update({"blocked": blocked}).eq("id", student_id).execute()
    return {"message": f"Student {'blocked' if blocked else 'unblocked'} successfully"}

@app.post("/api/students/{student_id}/reset-password")
def reset_student_password(student_id: str, body: ResetPasswordRequest = None, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    import secrets
    import string
    if body and body.new_password and len(body.new_password.strip()) >= 6:
        new_password = body.new_password.strip()
    else:
        alphabet = string.ascii_letters + string.digits
        new_password = ''.join(secrets.choice(alphabet) for _ in range(10))
    try:
        service_supabase.auth.admin.update_user_by_id(student_id, {"password": new_password})
        try:
            service_supabase.table("students").update({"must_change_pwd": True, "plain_password": new_password}).eq("id", student_id).execute()
        except Exception:
            service_supabase.table("students").update({"must_change_pwd": True}).eq("id", student_id).execute()
        return {"new_password": new_password}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/students/{student_id}/password")
def get_student_password(student_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        row = service_supabase.table("students").select("plain_password,must_change_pwd").eq("id", student_id).single().execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Student not found")
        plain_password = row.data.get("plain_password")
        must_change_pwd = row.data.get("must_change_pwd", True)
        # null + must_change_pwd=True  → password never stored (old student, pre-migration)
        # null + must_change_pwd=False → student changed their own password
        if plain_password is None and must_change_pwd:
            return {"plain_password": None, "status": "never_stored"}
        if plain_password is None:
            return {"plain_password": None, "status": "changed"}
        return {"plain_password": plain_password, "status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        err_str = str(e).lower()
        if "plain_password" in err_str or "column" in err_str or "42703" in err_str:
            raise HTTPException(
                status_code=503,
                detail="column_missing: ALTER TABLE students ADD COLUMN IF NOT EXISTS plain_password TEXT;"
            )
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/students/{student_id}")
def update_student(student_id: str, request: StudentProfileUpdate, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    allowed = {k: v for k, v in request.model_dump().items() if v is not None}
    if allowed:
        service_supabase.table("students").update(allowed).eq("id", student_id).execute()
    return {"message": "Student updated"}

@app.delete("/api/students/{student_id}")
def delete_student(student_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    service_supabase.table("students").delete().eq("id", student_id).execute()
    try:
        service_supabase.auth.admin.delete_user(student_id)
    except Exception as e:
        print(f"Auth delete failed for student {student_id}: {e}")
    return {"message": "Student deleted"}

# Videos
@app.get("/api/videos")
def get_videos(class_id: Optional[str] = None, limit: Optional[int] = None, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    if class_id:
        response = service_supabase.table("videos").select("*").eq("class_id", class_id).execute()
        videos = response.data or []
    elif user["role"] == "student" and user.get("standard_id"):
        # No class_id — for students return all videos for their standard's subjects
        subjects = service_supabase.table("subject_classes").select("id").eq("standard_id", user["standard_id"]).execute()
        if not subjects.data:
            return []
        sub_ids = [s["id"] for s in subjects.data]
        response = service_supabase.table("videos").select("*").in_("class_id", sub_ids).execute()
        videos = response.data or []
    else:
        # For teachers without class_id, return empty (they should always specify class_id)
        return []

    # Embed view/completion counts for teachers (single extra query, no N+1)
    if videos and user["role"] == "teacher":
        try:
            ids = [v["id"] for v in videos]
            prog = service_supabase.table("video_progress").select("video_id, completed").in_("video_id", ids).execute()
            stats: dict = {}
            for r in (prog.data or []):
                e = stats.setdefault(r["video_id"], {"view_count": 0, "completed_count": 0})
                e["view_count"] += 1
                if r.get("completed"):
                    e["completed_count"] += 1
            for v in videos:
                s = stats.get(v["id"], {"view_count": 0, "completed_count": 0})
                v["view_count"] = s["view_count"]
                v["completed_count"] = s["completed_count"]
        except Exception:
            for v in videos:
                v.setdefault("view_count", 0)
                v.setdefault("completed_count", 0)

    # Embed each student's own completion status + progress (single extra query, no N+1)
    if videos and user["role"] == "student" and user.get("student_id"):
        try:
            ids = [v["id"] for v in videos]
            my_prog = service_supabase.table("video_progress").select("video_id, completed, progress_secs")\
                .in_("video_id", ids).eq("student_id", user["student_id"]).execute()
            my_status = {r["video_id"]: r for r in (my_prog.data or [])}
            for v in videos:
                row = my_status.get(v["id"])
                v["my_completed"] = bool(row.get("completed")) if row else False
                v["progress_secs"] = row.get("progress_secs") if row else None
        except Exception:
            for v in videos:
                v.setdefault("my_completed", False)
                v.setdefault("progress_secs", None)

    if limit:
        videos = videos[:limit]

    # Add virtual source_type + thumbnail_url; never expose raw cloudflare_video_id for YouTube
    for v in videos:
        cf = v.get("cloudflare_video_id") or ""
        if cf.startswith("yt:"):
            yt_id = cf[3:]
            v["source_type"] = "youtube"
            v["thumbnail_url"] = f"https://img.youtube.com/vi/{yt_id}/mqdefault.jpg"
            v["cloudflare_video_id"] = None
        elif cf and not cf.startswith("https://"):
            # Cloudflare Stream UID → CDN auto-generated thumbnail (1s in, 360p)
            v["source_type"] = "upload"
            v["thumbnail_url"] = f"https://videodelivery.net/{cf}/thumbnails/thumbnail.jpg?time=1s&height=360"
        else:
            # Supabase Storage fallback (full https URL to an mp4) → no stream thumbnail
            v["source_type"] = "upload"
            v["thumbnail_url"] = None
        v.pop("youtube_video_id", None)
        v.pop("youtube_url", None)

    return videos

@app.get("/api/videos/{video_id}/viewers")
def get_video_viewers(video_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teachers only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    # Resolve video → class → standard
    video = service_supabase.table("videos").select("class_id").eq("id", video_id).single().execute()
    if not video.data:
        raise HTTPException(status_code=404, detail="Video not found")
    subject = service_supabase.table("subject_classes").select("standard_id").eq("id", video.data["class_id"]).single().execute()
    if not subject.data:
        raise HTTPException(status_code=404, detail="Subject not found")
    # All students in the standard
    students_res = service_supabase.table("students").select("id, name, username, avatar_url").eq("standard_id", subject.data["standard_id"]).execute()
    # Progress records for this video
    prog = service_supabase.table("video_progress").select("student_id, completed, last_watched_at").eq("video_id", video_id).execute()
    prog_map = {r["student_id"]: r for r in (prog.data or [])}
    result = []
    for s in (students_res.data or []):
        p = prog_map.get(s["id"])
        result.append({
            "id": s["id"],
            "name": s["name"],
            "username": s["username"],
            "avatar_url": s.get("avatar_url"),
            "watched": p is not None,
            "completed": p["completed"] if p else False,
            "last_watched_at": p["last_watched_at"] if p else None,
        })
    # Sort: completed first, then watched-not-completed, then not watched; alpha within each group
    result.sort(key=lambda x: (0 if x["completed"] else 1 if x["watched"] else 2, x["name"]))
    return result

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
        .eq("teacher_id", user["teacher_id"]) \
        .single().execute()
    if not std_check.data:
        raise HTTPException(status_code=403, detail="Not your standard")

    # Store YouTube video ID in cloudflare_video_id with "yt:" prefix.
    # This works without any schema migration and is detected at read time.
    insert_data = {
        "class_id": video.class_id,
        "title": video.title,
        "description": video.description,
        "cloudflare_video_id": f"yt:{video.youtube_video_id}",
        "allow_download": False,
        "created_by": user["user_id"],
    }
    try:
        result = service_supabase.table("videos").insert(insert_data).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create video record")

    created = result.data[0]
    # Add virtual source_type for the response
    cf = created.get("cloudflare_video_id", "")
    created["source_type"] = "youtube" if cf.startswith("yt:") else "upload"
    return created

@app.post("/api/videos")
def create_video(video: Video, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    data = {
        "class_id": video.class_id,
        "title": video.title,
        "allow_download": video.allow_download,
        "created_by": user["id"],
    }
    if video.description: data["description"] = video.description
    if video.cloudflare_video_id: data["cloudflare_video_id"] = video.cloudflare_video_id
    if video.duration_secs: data["duration_secs"] = video.duration_secs
    try:
        response = service_supabase.table("videos").insert(data).execute()
        return {"id": response.data[0]["id"], "message": "Video created"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/videos/upload")
async def upload_video(
    file: UploadFile = File(...),
    class_id: str = Form(...),
    title: str = Form(...),
    description: str = Form(""),
    allow_download: str = Form("true"),
    user = Depends(verify_token)
):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
    CLOUDFLARE_STREAM_API_TOKEN = os.getenv("CLOUDFLARE_STREAM_API_TOKEN", "")

    if not CLOUDFLARE_ACCOUNT_ID or not CLOUDFLARE_STREAM_API_TOKEN:
        # Fallback: store video in Supabase Storage "videos" bucket
        if not service_supabase:
            raise HTTPException(status_code=503, detail="Database not available")

        file_bytes = await file.read()
        safe_name = re.sub(r'[^\w.\-]', '_', file.filename or 'video.mp4')
        storage_path = f"{class_id}/{uuid.uuid4()}_{safe_name}"

        # Auto-create bucket in thread (sync I/O must not block event loop)
        try:
            await asyncio.to_thread(
                lambda: service_supabase.storage.create_bucket("videos", options={"public": True})
            )
        except Exception:
            pass  # Already exists

        # Upload file in thread
        try:
            await asyncio.to_thread(
                lambda: service_supabase.storage.from_("videos").upload(
                    storage_path, file_bytes,
                    {"content-type": file.content_type or "video/mp4"}
                )
            )
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Storage upload failed: {e}")

        # Get public URL in thread
        try:
            public_url = await asyncio.to_thread(
                lambda: service_supabase.storage.from_("videos").get_public_url(storage_path)
            )
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Could not get video URL: {e}")

        allow_dl = allow_download.lower() not in ("false", "0", "no")
        try:
            db_resp = service_supabase.table("videos").insert({
                "class_id": class_id,
                "title": title,
                "description": description or None,
                "cloudflare_video_id": str(public_url),
                "allow_download": allow_dl,
                "duration_secs": None,
                "created_by": user["id"],
            }).execute()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Database insert failed: {e}")

        if not db_resp.data:
            raise HTTPException(status_code=500, detail="Video uploaded but database record creation failed")
        return db_resp.data[0]

    file_bytes = await file.read()
    allow_dl = allow_download.lower() not in ("false", "0", "no")

    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(
            f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/stream",
            headers={"Authorization": f"Bearer {CLOUDFLARE_STREAM_API_TOKEN}"},
            files={"file": (file.filename or "video.mp4", file_bytes, file.content_type or "video/mp4")},
            data={"meta": json.dumps({"name": title})}
        )

    cf = resp.json()
    if not cf.get("success"):
        errors = cf.get("errors", [])
        raise HTTPException(status_code=502, detail=f"Cloudflare upload failed: {errors}")

    result = cf["result"]
    cloudflare_video_id = result["uid"]
    duration_secs = int(result.get("duration") or 0) or None

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    video_data = {
        "class_id": class_id,
        "title": title,
        "description": description or None,
        "cloudflare_video_id": cloudflare_video_id,
        "allow_download": allow_dl,
        "duration_secs": duration_secs,
        "created_by": user["id"],
    }
    db_resp = service_supabase.table("videos").insert(video_data).execute()
    return db_resp.data[0]

@app.patch("/api/videos/{video_id}")
def update_video(video_id: str, updates: VideoUpdate, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    existing = service_supabase.table("videos").select(
        "created_by, subject_classes(standards(teacher_id))"
    ).eq("id", video_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Video not found")

    uid = user["user_id"]
    creator = existing.data.get("created_by")
    sc = existing.data.get("subject_classes") or {}
    std = (sc.get("standards") or {}) if isinstance(sc, dict) else {}
    teacher_via_std = std.get("teacher_id") if isinstance(std, dict) else None
    if creator != uid and teacher_via_std != uid:
        raise HTTPException(status_code=403, detail="Not authorized")

    raw = updates.model_dump()
    update_data = {k: v for k, v in raw.items() if v is not None and k != "youtube_video_id"}
    if raw.get("youtube_video_id"):
        update_data["cloudflare_video_id"] = f"yt:{raw['youtube_video_id']}"
    if update_data:
        service_supabase.table("videos").update(update_data).eq("id", video_id).execute()

    return {"message": "Video updated"}

@app.delete("/api/videos/{video_id}")
async def delete_video(video_id: str, user=Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    vid = service_supabase.table("videos").select(
        "cloudflare_video_id, created_by, subject_classes(standards(teacher_id))"
    ).eq("id", video_id).single().execute()
    if not vid.data:
        raise HTTPException(status_code=404, detail="Video not found")

    uid = user["user_id"]
    creator = vid.data.get("created_by")
    sc = vid.data.get("subject_classes") or {}
    std = (sc.get("standards") or {}) if isinstance(sc, dict) else {}
    teacher_via_std = std.get("teacher_id") if isinstance(std, dict) else None
    # Allow if: created_by matches OR teacher owns the standard (handles old videos with NULL created_by)
    if creator != uid and teacher_via_std != uid:
        raise HTTPException(status_code=403, detail="Not authorized")

    cf_id = vid.data.get("cloudflare_video_id") or ""

    if cf_id.startswith("yt:"):
        pass  # YouTube video — only DB row needs to be deleted
    elif cf_id.startswith("https://"):
        # Supabase Storage URL — extract the path and delete
        try:
            # Path is everything after "/object/public/videos/"
            marker = "/object/public/videos/"
            if marker in cf_id:
                storage_path = cf_id.split(marker, 1)[1]
                await asyncio.to_thread(
                    lambda: service_supabase.storage.from_("videos").remove([storage_path])
                )
        except Exception as e:
            print(f"Supabase Storage delete failed: {e}")
    elif cf_id:
        # Cloudflare Stream UID
        CF_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
        CF_TOKEN = os.getenv("CLOUDFLARE_STREAM_API_TOKEN", "")
        if CF_ACCOUNT_ID and CF_TOKEN:
            try:
                async with httpx.AsyncClient() as client:
                    await client.delete(
                        f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/stream/{cf_id}",
                        headers={"Authorization": f"Bearer {CF_TOKEN}"},
                        timeout=10.0
                    )
            except Exception as e:
                print(f"Cloudflare Stream delete failed: {e}")

    service_supabase.table("videos").delete().eq("id", video_id).execute()
    return {"message": "Video deleted"}

@app.get("/api/videos/{video_id}/stats")
def get_video_stats(video_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Count total students who watched
    watch_count = service_supabase.table("video_progress").select("student_id", count="exact").eq("video_id", video_id).execute()

    # Count students who completed
    completed_count = service_supabase.table("video_progress").select("student_id", count="exact").eq("video_id", video_id).eq("completed", True).execute()

    return {
        "watch_count": watch_count.count or 0,
        "completed_count": completed_count.count or 0
    }

@app.get("/api/videos/{video_id}/token")
async def get_video_token(video_id: str, user=Depends(verify_token)):
    video_result = service_supabase.table("videos") \
        .select("id, cloudflare_video_id, class_id, title") \
        .eq("id", video_id).single().execute()

    if not video_result.data:
        raise HTTPException(status_code=404, detail="Video not found")

    video = video_result.data
    cf = video.get("cloudflare_video_id") or ""

    if not cf.startswith("yt:"):
        raise HTTPException(status_code=400, detail="Not a YouTube video")

    yt_id = cf[3:]  # strip "yt:" prefix

    # Get standard_id for this subject class
    class_result = service_supabase.table("subject_classes") \
        .select("standard_id").eq("id", video["class_id"]).single().execute()
    if not class_result.data:
        raise HTTPException(status_code=404, detail="Subject not found")

    required_standard_id = class_result.data["standard_id"]

    if user["role"] == "teacher":
        std_check = service_supabase.table("standards") \
            .select("id") \
            .eq("id", required_standard_id) \
            .eq("teacher_id", user["teacher_id"]) \
            .single().execute()
        if not std_check.data:
            raise HTTPException(status_code=403, detail="Not your class")
    else:
        if not user.get("standard_id"):
            raise HTTPException(status_code=403, detail="No standard assigned")
        if user["standard_id"] != required_standard_id:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")
        student_check = service_supabase.table("students") \
            .select("blocked").eq("id", user["user_id"]).single().execute()
        if not student_check.data or student_check.data.get("blocked"):
            raise HTTPException(status_code=403, detail="Account blocked")

    return {
        "token": yt_id,
        "source_type": "youtube",
        "title": video["title"],
    }


@app.get("/api/videos/{video_id}/thumbnail")
async def get_video_thumbnail(video_id: str, user=Depends(verify_token)):
    video_result = service_supabase.table("videos") \
        .select("id, cloudflare_video_id, class_id") \
        .eq("id", video_id).single().execute()

    if not video_result.data:
        raise HTTPException(status_code=404, detail="Video not found")

    video = video_result.data
    cf = video.get("cloudflare_video_id") or ""

    if not cf.startswith("yt:"):
        # Cloudflare Stream UID → CDN thumbnail; Supabase fallback (https URL) has none
        if cf and not cf.startswith("https://"):
            return {
                "thumbnail_url": f"https://videodelivery.net/{cf}/thumbnails/thumbnail.jpg?time=1s&height=360",
                "source_type": "upload",
            }
        return {"thumbnail_url": None, "source_type": "upload"}

    yt_id = cf[3:]

    # Verify access
    class_result = service_supabase.table("subject_classes") \
        .select("standard_id").eq("id", video["class_id"]).single().execute()
    if class_result.data and user["role"] == "student":
        if user.get("standard_id") != class_result.data["standard_id"]:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")

    return {
        "thumbnail_url": f"https://img.youtube.com/vi/{yt_id}/mqdefault.jpg",
        "source_type": "youtube",
    }


# Tests
@app.get("/api/tests")
def get_tests(class_id: Optional[str] = None, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    if class_id:
        if user["role"] == "student":
            response = service_supabase.table("tests").select("*").eq("class_id", class_id).neq("status", "draft").execute()
        else:
            response = service_supabase.table("tests").select("*").eq("class_id", class_id).execute()
        return response.data or []

    if user["role"] == "student":
        standard_id = user.get("standard_id")
        if not standard_id:
            return []
        subjects = service_supabase.table("subject_classes").select("id").eq("standard_id", standard_id).execute()
        if not subjects.data:
            return []
        class_ids = [s["id"] for s in subjects.data]
        response = service_supabase.table("tests").select("*").in_("class_id", class_ids).neq("status", "draft").execute()
        return response.data or []

    # Teacher: return all tests for their standards
    stds = service_supabase.table("standards").select("id").eq("teacher_id", user["teacher_id"]).execute()
    if not stds.data:
        return []
    std_ids = [s["id"] for s in stds.data]
    subjects = service_supabase.table("subject_classes").select("id").in_("standard_id", std_ids).execute()
    if not subjects.data:
        return []
    class_ids = [s["id"] for s in subjects.data]
    response = service_supabase.table("tests").select("*").in_("class_id", class_ids).execute()
    return response.data or []

@app.post("/api/tests")
def create_test(test: Test, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    data = {
        "class_id": test.class_id,
        "title": test.title,
        "duration_mins": test.duration_mins,
        "total_marks": test.total_marks,
        "negative_marking": test.negative_marking,
        "penalty": test.penalty,
        "status": test.status,
        "scheduled_for": test.scheduled_for,
        "created_by": user["user_id"]
    }
    response = service_supabase.table("tests").insert(data).execute()
    return {"id": response.data[0]["id"], "message": "Test created"}

@app.patch("/api/tests/{test_id}")
def update_test(test_id: str, updates: TestUpdate, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    existing = service_supabase.table("tests").select("created_by, status, scheduled_for").eq("id", test_id).single().execute()
    if not existing.data or existing.data.get("created_by") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Block content edits once the exam has started (allow status-only changes like publish/close)
    content_fields = {"title", "duration_mins", "total_marks", "negative_marking", "penalty", "scheduled_for", "expires_at"}
    incoming = {k: v for k, v in updates.model_dump().items() if v is not None}
    has_content_change = bool(incoming.keys() & content_fields)
    edata = existing.data
    if has_content_change:
        if edata.get("status") not in ("draft", "scheduled"):
            raise HTTPException(status_code=403, detail="Cannot edit a test that is already active or completed")
        if edata.get("scheduled_for"):
            try:
                sched = datetime.fromisoformat(edata["scheduled_for"].replace("Z", "+00:00"))
                if datetime.now(timezone.utc) >= sched:
                    raise HTTPException(status_code=403, detail="Cannot edit a test after the scheduled start time")
            except HTTPException:
                raise
            except Exception:
                pass

    update_data = incoming
    if update_data:
        service_supabase.table("tests").update(update_data).eq("id", test_id).execute()

    return {"message": "Test updated"}

@app.delete("/api/tests/{test_id}")
def delete_test(test_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    existing = service_supabase.table("tests").select("created_by").eq("id", test_id).single().execute()
    if not existing.data or existing.data.get("created_by") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Delete attempts first (no ON DELETE CASCADE on this FK); questions cascade automatically
    service_supabase.table("test_attempts").delete().eq("test_id", test_id).execute()
    service_supabase.table("tests").delete().eq("id", test_id).execute()
    return {"message": "Test deleted"}

# Questions
@app.get("/api/tests/{test_id}/questions")
def get_questions(test_id: str, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    response = service_supabase.table("questions").select("id, question, options, order_num").eq("test_id", test_id).order("order_num").execute()
    return response.data or []

@app.post("/api/questions")
def create_question(question: Question, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    data = {
        "test_id": question.test_id,
        "question": question.question,
        "options": question.options,
        "correct_idx": question.correct_idx,
        "order_num": question.order_num
    }
    response = service_supabase.table("questions").insert(data).execute()
    return {"id": response.data[0]["id"], "message": "Question created"}

# Invite Links
@app.post("/api/invite-links")
def create_invite_link(data: InviteLinkCreate, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Generate unique code
    code = uuid.uuid4().hex[:8]

    link_data = {
        "code": code,
        "standard_id": data.standard_id,
        "created_by": user["user_id"],
        "max_uses": data.max_uses,
        "expires_at": data.expires_at
    }
    response = service_supabase.table("invite_links").insert(link_data).execute()
    return {"id": response.data[0]["id"], "code": code, "message": "Invite link created"}

@app.get("/api/invite-links")
def get_invite_links(standard_id: Optional[str] = None, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    if standard_id:
        response = service_supabase.table("invite_links").select("*").eq("standard_id", standard_id).eq("created_by", user["teacher_id"]).execute()
    else:
        response = service_supabase.table("invite_links").select("*").eq("created_by", user["teacher_id"]).execute()

    return response.data or []

@app.delete("/api/invite-links/{link_id}")
def delete_invite_link(link_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    service_supabase.table("invite_links").delete().eq("id", link_id).eq("created_by", user["user_id"]).execute()
    return {"message": "Invite link deleted"}

# Join requests
@app.get("/api/join-requests")
def get_join_requests(invite_code: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    response = service_supabase.table("invite_requests").select("*").eq("invite_code", invite_code).eq("status", "pending").execute()
    return response.data or []

@app.patch("/api/join-requests/{request_id}/approve")
def approve_join_request(request_id: str, background_tasks: BackgroundTasks, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Get the request
    request = service_supabase.table("invite_requests").select("*").eq("id", request_id).single().execute()
    if not request.data:
        raise HTTPException(status_code=404, detail="Request not found")

    # Get invite link to find standard_id
    invite_link = service_supabase.table("invite_links").select("standard_id").eq("code", request.data["invite_code"]).single().execute()
    if not invite_link.data:
        raise HTTPException(status_code=404, detail="Invite link not found")

    # Generate temp password
    temp_password = uuid.uuid4().hex[:12]

    # Create student account
    if service_supabase:
        auth_email = f"{request.data['student_email'] or request.data['student_name']}@tutoria.local"
        try:
            new_user = service_supabase.auth.admin.create_user({
                "email": auth_email,
                "password": temp_password,
                "email_confirm": True,
                "user_metadata": {
                    "role": "student",
                    "name": request.data["student_name"]
                }
            })

            if new_user.user:
                service_supabase.table("students").insert({
                    "id": new_user.user.id,
                    "name": request.data["student_name"],
                    "email": auth_email,
                    "username": request.data["student_email"] or request.data["student_name"].lower().replace(" ", "."),
                    "standard_id": invite_link.data["standard_id"],
                    "must_change_pwd": True,
                }).execute()

                # Persist the generated temp password so it can be resent to
                # parents later (guarded — like single create / bulk import).
                try:
                    service_supabase.table("students").update(
                        {"plain_password": temp_password}).eq("id", new_user.user.id).execute()
                except Exception:
                    pass

                student_code = assign_student_code(new_user.user.id, invite_link.data["standard_id"])

                # Update request status
                service_supabase.table("invite_requests").update({"status": "approved"}).eq("id", request_id).execute()

                # Fire auto-welcome (credentials) if enabled — guarded, never blocks approval.
                background_tasks.add_task(_wa_auto_welcome, new_user.user.id)

                return {
                    "message": "Student approved",
                    "username": request.data["student_email"] or request.data["student_name"].lower().replace(" ", "."),
                    "student_code": student_code,
                    "temp_password": temp_password
                }
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    return {"message": "Request approved"}

@app.patch("/api/join-requests/{request_id}/reject")
def reject_join_request(request_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    service_supabase.table("invite_requests").update({"status": "rejected"}).eq("id", request_id).execute()
    return {"message": "Request rejected"}

# Public join endpoint
@app.post("/api/join/{code}")
def join_with_code(code: str, name: str, email: Optional[str] = None):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Check if code exists
    link = service_supabase.table("invite_links").select("*").eq("code", code).single().execute()
    if not link.data:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    # Check if expired
    if link.data.get("expires_at"):
        from datetime import datetime
        if datetime.now() > datetime.fromisoformat(link.data["expires_at"]):
            raise HTTPException(status_code=400, detail="Invite link expired")

    # Check use count
    if link.data.get("use_count", 0) >= link.data.get("max_uses", 50):
        raise HTTPException(status_code=400, detail="Invite link max uses reached")

    # Create request
    request_data = {
        "invite_code": code,
        "student_name": name,
        "student_email": email,
        "status": "pending"
    }
    service_supabase.table("invite_requests").insert(request_data).execute()

    # Increment use count
    service_supabase.table("invite_links").update({"use_count": link.data.get("use_count", 0) + 1}).eq("id", link.data["id"]).execute()

    return {"message": "Request submitted. Waiting for teacher approval."}

# Health
@app.get("/api/health")
def health_check():
    db_status = "connected" if supabase else "disconnected"
    return {"status": "ok", "database": db_status}

# ─── Teacher Team Management ─────────────────────────────────────────────────

@app.post("/api/teachers")
def create_sub_teacher(req: SubTeacherRequest, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if user.get("teacher_type") == "sub":
        raise HTTPException(status_code=403, detail="Only the primary teacher can add team members")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        new_auth = service_supabase.auth.admin.create_user({
            "email": req.email,
            "password": req.password,
            "email_confirm": True,
            "user_metadata": {
                "role": "teacher",
                "name": req.name,
                "teacher_type": "sub",
                "primary_teacher_id": user["user_id"],
            },
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create account: {str(e)}")

    try:
        service_supabase.table("sub_teachers").insert({
            "id": new_auth.user.id,
            "primary_teacher_id": user["user_id"],
            "name": req.name,
            "email": req.email,
            "phone": req.phone or None,
        }).execute()
    except Exception:
        # If DB insert fails, clean up the auth user so it's not orphaned
        try:
            service_supabase.auth.admin.delete_user(new_auth.user.id)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to save teacher record")

    return {"id": new_auth.user.id, "name": req.name, "email": req.email, "phone": req.phone}


@app.get("/api/teachers")
def list_sub_teachers(user = Depends(verify_token)):
    if user["role"] != "teacher" or user.get("teacher_type") == "sub":
        raise HTTPException(status_code=403, detail="Primary teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    result = service_supabase.table("sub_teachers").select("*").eq(
        "primary_teacher_id", user["user_id"]
    ).order("created_at").execute()
    return result.data or []


@app.delete("/api/teachers/{teacher_id}")
def remove_sub_teacher(teacher_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher" or user.get("teacher_type") == "sub":
        raise HTTPException(status_code=403, detail="Primary teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    existing = service_supabase.table("sub_teachers").select("id").eq(
        "id", teacher_id
    ).eq("primary_teacher_id", user["user_id"]).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Teacher not found")

    try:
        service_supabase.auth.admin.delete_user(teacher_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to delete account: {str(e)}")

    service_supabase.table("sub_teachers").delete().eq("id", teacher_id).execute()
    return {"message": "Teacher removed"}


# Demo accounts — teacher-only, for seeding demo data
@app.post("/api/demo/create-accounts")
def create_demo_accounts(user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=500, detail="Database not available")

    results = []

    try:
        teacher_response = service_supabase.auth.admin.create_user({
            "email": "teacher@tutoria.com",
            "password": "teacher123",
            "email_confirm": True,
            "user_metadata": {"role": "teacher", "name": "Priya Sharma"}
        })

        if teacher_response.user:
            results.append({
                "role": "teacher",
                "email": "teacher@tutoria.com",
                "password": "teacher123",
                "name": "Priya Sharma"
            })

        students_data = [
            {"name": "Aarav Patel", "username": "aarav.p"},
            {"name": "Meera Singh", "username": "meera.s"},
            {"name": "Rohan Kumar", "username": "rohan.k"},
            {"name": "Sneha Reddy", "username": "sneha.r"},
            {"name": "Vivaan Sharma", "username": "vivaan.s"},
        ]

        for student in students_data:
            auth_email = f"{student['username']}@tutoria.local"
            student_response = service_supabase.auth.admin.create_user({
                "email": auth_email,
                "password": "student123",
                "email_confirm": True,
                "user_metadata": {"role": "student", "name": student["name"], "username": student["username"]}
            })

            if student_response.user:
                service_supabase.table("students").insert({
                    "id": student_response.user.id,
                    "name": student["name"],
                    "username": student["username"],
                    "email": auth_email,
                }).execute()

                results.append({
                    "role": "student",
                    "username": student["username"],
                    "password": "student123",
                    "name": student["name"]
                })

        return {"message": "Demo accounts created", "accounts": results}

    except Exception as e:
        return {"message": "Some accounts may already exist", "error": str(e), "accounts": results}

# Attendance
@app.get("/api/subjects/{subject_id}/attendance")
def get_subject_attendance(subject_id: str, date: str = None, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    # Get standard_id from subject
    subject = service_supabase.table("subject_classes").select("standard_id").eq("id", subject_id).single().execute()
    if not subject.data:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    standard_id = subject.data["standard_id"]

    # Get all students in standard
    students = service_supabase.table("students").select("id, name, username, avatar_url").eq("standard_id", standard_id).execute()
    
    # Get attendance records for date
    records = service_supabase.table("attendance_records").select("student_id, status").eq("subject_class_id", subject_id).eq("date", date).execute()
    
    status_map = {r["student_id"]: r["status"] for r in records.data} if records.data else {}
    
    result = []
    if students.data:
        for s in students.data:
            result.append({
                "student_id": s["id"],
                "name": s["name"],
                "username": s["username"],
                "avatar_url": s.get("avatar_url"),
                "status": status_map.get(s["id"])
            })
    return result

@app.post("/api/subjects/{subject_id}/attendance")
def mark_subject_attendance(subject_id: str, req: MarkAttendanceRequest, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    if not req.records:
        return {"marked": 0, "date": req.date}

    # ── Batch upsert all records in a single call ─────────────────
    upsert_data = [
        {
            "student_id": rec.student_id,
            "subject_class_id": subject_id,
            "date": req.date,
            "status": rec.status,
            "marked_by": user["user_id"],
        }
        for rec in req.records
    ]
    service_supabase.table("attendance_records").upsert(
        upsert_data,
        on_conflict="student_id,subject_class_id,date"
    ).execute()

    # ── Batch recompute attendance_pct ────────────────────────────
    # Fetch ALL records for ALL affected students in ONE query
    student_ids = list({r.student_id for r in req.records})

    all_recs = service_supabase.table("attendance_records") \
        .select("student_id, status") \
        .in_("student_id", student_ids) \
        .execute()

    # Group by student
    from collections import defaultdict
    by_student = defaultdict(list)
    for r in (all_recs.data or []):
        by_student[r["student_id"]].append(r["status"])

    # Compute pct and update in batch (one update per student, still N but fast)
    for sid, statuses in by_student.items():
        total = len(statuses)
        present_or_late = sum(1 for s in statuses if s in ("present", "late"))
        pct = round((present_or_late / total) * 100, 1) if total > 0 else 0.0
        service_supabase.table("students").update({"attendance_pct": pct}).eq("id", sid).execute()

    return {"marked": len(req.records), "date": req.date}

@app.delete("/api/subjects/{subject_id}/attendance/{student_id}/{date}")
def clear_attendance_record(subject_id: str, student_id: str, date: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    service_supabase.table("attendance_records").delete().eq("subject_class_id", subject_id).eq("student_id", student_id).eq("date", date).execute()
    return {"message": "Record cleared"}

@app.get("/api/subjects/{subject_id}/attendance/week")
def get_subject_attendance_week(subject_id: str, start: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    
    start_date = datetime.strptime(start, "%Y-%m-%d")
    end_date = start_date + timedelta(days=6)
    
    subject = service_supabase.table("subject_classes").select("standard_id").eq("id", subject_id).single().execute()
    if not subject.data:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    standard_id = subject.data["standard_id"]
    students = service_supabase.table("students").select("id, name, username, attendance_pct").eq("standard_id", standard_id).execute()
    
    records = service_supabase.table("attendance_records").select("*").eq("subject_class_id", subject_id).gte("date", start_date.strftime("%Y-%m-%d")).lte("date", end_date.strftime("%Y-%m-%d")).execute()
    
    student_map = {}
    if students.data:
        student_map = {s["id"]: {"student_id": s["id"], "student_name": s["name"], "days": {}, "overall_pct": s.get("attendance_pct")} for s in students.data}
    
    if records.data:
        for r in records.data:
            sid = r["student_id"]
            if sid in student_map:
                student_map[sid]["days"][r["date"]] = r["status"]
                
    return list(student_map.values())

@app.get("/api/students/{student_id}/attendance")
def get_student_attendance(student_id: str, user = Depends(verify_token)):
    if user["role"] == "student" and user.get("student_id") != student_id and user.get("user_id") != student_id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
        
    student = service_supabase.table("students").select("attendance_pct").eq("id", student_id).single().execute()
    overall_pct = student.data.get("attendance_pct") if student.data else None
    
    thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    recent_records = service_supabase.table("attendance_records").select("status").eq("student_id", student_id).gte("date", thirty_days_ago).execute()
    
    absent_days = 0
    late_days = 0
    if recent_records.data:
        absent_days = sum(1 for r in recent_records.data if r["status"] == "absent")
        late_days = sum(1 for r in recent_records.data if r["status"] == "late")
        
    summary = service_supabase.table("attendance_summary").select("*").eq("student_id", student_id).execute()
    by_subject = []
    if summary.data:
        for s in summary.data:
            by_subject.append({
                "subject_name": s["subject_name"],
                "pct": s["attendance_pct"],
                "present": s["present_count"],
                "absent": s["absent_count"],
                "late": s["late_count"],
                "total": s["total_sessions"]
            })
            
    eight_weeks_ago = (datetime.now() - timedelta(weeks=8)).strftime("%Y-%m-%d")
    records_8w = service_supabase.table("attendance_records").select("date, status").eq("student_id", student_id).gte("date", eight_weeks_ago).execute()
    
    by_week = []
    if records_8w.data:
        weeks = {}
        for r in records_8w.data:
            r_date = datetime.strptime(r["date"], "%Y-%m-%d")
            week_start = r_date - timedelta(days=r_date.weekday())
            week_label = week_start.strftime("W%W") # Use week number to be safe or "%b %d"
            
            if week_label not in weeks:
                weeks[week_label] = {"total": 0, "present_late": 0}
            weeks[week_label]["total"] += 1
            if r["status"] in ["present", "late"]:
                weeks[week_label]["present_late"] += 1
                
        for label, stats in sorted(weeks.items()):
            pct = round((stats["present_late"] / stats["total"]) * 100, 1)
            by_week.append({"week": label, "pct": pct})
            
    return {
        "overall_pct": overall_pct,
        "absent_days": absent_days,
        "late_days": late_days,
        "by_subject": by_subject,
        "by_week": by_week[-8:]
    }

@app.get("/api/reports/attendance")
def get_low_attendance(standard_id: str, below_pct: float = None, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
        
    threshold = below_pct
    
    if standard_id == "all":
        standards = service_supabase.table("standards").select("id, name, attendance_threshold").eq("teacher_id", user["teacher_id"]).execute()
        if not standards.data:
            return {"students": [], "count": 0}
            
        all_students = []
        for std in standards.data:
            t = threshold if threshold is not None else (std.get("attendance_threshold") or 75)
            students = service_supabase.table("students").select("id, name, username, attendance_pct").eq("standard_id", std["id"]).execute()
            if students.data:
                for s in students.data:
                    if s.get("attendance_pct") is not None and float(s["attendance_pct"]) < t:
                        all_students.append({
                            "student_id": s["id"],
                            "name": s["name"],
                            "username": s["username"],
                            "attendance_pct": s["attendance_pct"],
                            "standard_name": std["name"]
                        })
        return {"students": sorted(all_students, key=lambda x: x["attendance_pct"]), "count": len(all_students)}
    else:
        standard = service_supabase.table("standards").select("name, attendance_threshold").eq("id", standard_id).single().execute()
        if not standard.data:
            raise HTTPException(status_code=404, detail="Standard not found")
            
        t = threshold if threshold is not None else (standard.data.get("attendance_threshold") or 75)
        
        students = service_supabase.table("students").select("id, name, username, attendance_pct").eq("standard_id", standard_id).execute()
        flagged = []
        if students.data:
            for s in students.data:
                if s.get("attendance_pct") is not None and float(s["attendance_pct"]) < t:
                    thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
                    absent_records = service_supabase.table("attendance_records").select("id", count="exact").eq("student_id", s["id"]).eq("status", "absent").gte("date", thirty_days_ago).execute()
                    
                    flagged.append({
                        "student_id": s["id"],
                        "name": s["name"],
                        "username": s["username"],
                        "attendance_pct": s["attendance_pct"],
                        "absent_days": absent_records.count or 0,
                        "standard_name": standard.data["name"]
                    })
                    
        return {
            "threshold": t,
            "standard_name": standard.data["name"],
            "flagged_count": len(flagged),
            "students": sorted(flagged, key=lambda x: x["attendance_pct"])
        }

@app.get("/api/reports/export/attendance")
def export_attendance(standard_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
        
    summary = service_supabase.table("attendance_summary").select("*").eq("standard_id", standard_id).execute()
    
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Student Name", "Username", "Subject", "Total Sessions", "Present", "Absent", "Late", "Attendance %"])
    
    if summary.data:
        for row in summary.data:
            writer.writerow([
                row.get("student_name", ""),
                row.get("username", ""),
                row.get("subject_name", ""),
                row.get("total_sessions", 0),
                row.get("present_count", 0),
                row.get("absent_count", 0),
                row.get("late_count", 0),
                row.get("attendance_pct", 0)
            ])
            
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=attendance_report.csv"}
    )

# Test with questions (bulk create)
class TestWithQuestions(BaseModel):
    class_id: str
    title: str
    duration_mins: int
    total_marks: float
    negative_marking: bool = False
    penalty: float = 0
    status: str = 'draft'
    scheduled_for: Optional[str] = None
    expires_at: Optional[str] = None
    questions: List[dict] = []  # [{question, options: [], correct_idx, order_num}]

# Full test update request
class TestUpdateFull(BaseModel):
    class_id: str
    title: str
    duration_mins: int
    total_marks: float
    negative_marking: bool = False
    penalty: float = 0
    status: str = 'draft'
    scheduled_for: Optional[str] = None
    expires_at: Optional[str] = None
    questions: List[dict] = []  # [{id, question, options: [], correct_idx, order_num}]

# Submit test request
class SubmitTestRequest(BaseModel):
    answers: dict  # {question_id: selected_idx}
    cheat_events: List[dict] = []

# Test attempt for results
@app.post("/api/tests/with-questions")
def create_test_with_questions(data: TestWithQuestions, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Create test
    test_data = {
        "class_id": data.class_id,
        "title": data.title,
        "duration_mins": data.duration_mins,
        "total_marks": data.total_marks,
        "negative_marking": data.negative_marking,
        "penalty": data.penalty,
        "status": data.status,
        "scheduled_for": data.scheduled_for,
        "expires_at": data.expires_at,
        "created_by": user["user_id"]
    }
    test_response = service_supabase.table("tests").insert(test_data).execute()
    test_id = test_response.data[0]["id"]

    # Create questions
    if data.questions:
        questions_data = []
        for q in data.questions:
            questions_data.append({
                "test_id": test_id,
                "question": q["question"],
                "options": q["options"],
                "correct_idx": q["correct_idx"],
                "order_num": q["order_num"]
            })
        service_supabase.table("questions").insert(questions_data).execute()

    return {"id": test_id, "message": f"Test created with {len(data.questions)} questions"}

# Get full test for editing
@app.get("/api/tests/{test_id}/edit")
def get_test_for_edit(test_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Get test
    test = service_supabase.table("tests").select("*").eq("id", test_id).single().execute()
    if not test.data:
        raise HTTPException(status_code=404, detail="Test not found")

    # Verify via standard ownership (supports sub-teachers)
    _subj = service_supabase.table("subject_classes").select("standard_id").eq("id", test.data["class_id"]).single().execute()
    _std  = service_supabase.table("standards").select("teacher_id").eq("id", (_subj.data or {}).get("standard_id", "")).single().execute() if _subj.data else None
    if not _std or not _std.data or _std.data["teacher_id"] != user["teacher_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Get questions WITH correct answers
    questions = service_supabase.table("questions").select("*").eq("test_id", test_id).order("order_num").execute()

    return {
        "test": test.data,
        "questions": questions.data
    }

def recalculate_test_attempts(test_id: str):
    if not service_supabase: return
    try:
        test = service_supabase.table("tests").select("*").eq("id", test_id).single().execute()
        if not test.data: return
        tdata = test.data

        questions = service_supabase.table("questions").select("id, correct_idx").eq("test_id", test_id).execute()
        q_list = questions.data or []
        
        attempts = service_supabase.table("test_attempts").select("*").eq("test_id", test_id).execute()
        if not attempts.data: return
        
        for attempt in attempts.data:
            answers = attempt.get("answers", {})
            correct_count = 0
            wrong_count = 0
            marks_deducted = 0
            total_obtained = 0
            marks_per_question = tdata["total_marks"] / len(q_list) if q_list else 1
            
            for q in q_list:
                q_id = str(q["id"])
                if q_id in answers:
                    if answers[q_id] == q["correct_idx"]:
                        correct_count += 1
                        total_obtained += marks_per_question
                    else:
                        wrong_count += 1
                        if tdata["negative_marking"]:
                            deduction = marks_per_question * tdata["penalty"]
                            marks_deducted += deduction
                            total_obtained -= deduction
            
            score_pct = (total_obtained / tdata["total_marks"] * 100) if tdata["total_marks"] > 0 else 0
            points_earned = 0
            if score_pct >= 90: points_earned = 100
            elif score_pct >= 75: points_earned = 75
            elif score_pct >= 60: points_earned = 50
            elif score_pct >= 40: points_earned = 25
            else: points_earned = 10

            update_payload = {
                "correct_count": correct_count,
                "wrong_count": wrong_count,
                "marks_deducted": marks_deducted,
                "score": round(total_obtained, 2),
                "points_earned": points_earned
            }
            service_supabase.table("test_attempts").update(update_payload).eq("id", attempt["id"]).execute()
    except Exception as e:
        print(f"Error recalculating attempts for test {test_id}: {e}")

# Update full test
@app.put("/api/tests/{test_id}/full")
def update_test_full(test_id: str, data: TestUpdateFull, background_tasks: BackgroundTasks, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    existing = service_supabase.table("tests").select("created_by, status, scheduled_for, class_id").eq("id", test_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Test not found")
    # Verify via standard ownership (supports sub-teachers)
    _subj2 = service_supabase.table("subject_classes").select("standard_id").eq("id", existing.data["class_id"]).single().execute()
    _std2  = service_supabase.table("standards").select("teacher_id").eq("id", (_subj2.data or {}).get("standard_id", "")).single().execute() if _subj2.data else None
    if not _std2 or not _std2.data or _std2.data["teacher_id"] != user["teacher_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Block editing once the exam has started
    edata = existing.data
    if edata.get("status") not in ("draft", "scheduled"):
        raise HTTPException(status_code=403, detail="Cannot edit a test that is already active or completed")
    if edata.get("scheduled_for"):
        try:
            sched = datetime.fromisoformat(edata["scheduled_for"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) >= sched:
                raise HTTPException(status_code=403, detail="Cannot edit a test after the scheduled start time")
        except HTTPException:
            raise
        except Exception:
            pass

    # Update test metadata
    test_data = {
        "class_id": data.class_id,
        "title": data.title,
        "duration_mins": data.duration_mins,
        "total_marks": data.total_marks,
        "negative_marking": data.negative_marking,
        "penalty": data.penalty,
        "status": data.status,
        "scheduled_for": data.scheduled_for,
        "expires_at": data.expires_at,
    }
    service_supabase.table("tests").update(test_data).eq("id", test_id).execute()

    # Update questions (UPSERT and DELETE)
    existing_q_response = service_supabase.table("questions").select("id").eq("test_id", test_id).execute()
    existing_q_ids = {str(q["id"]) for q in existing_q_response.data} if existing_q_response.data else set()

    incoming_q_ids = set()
    for q in data.questions:
        q_id = q.get("id")
        q_payload = {
            "test_id": test_id,
            "question": q["question"],
            "options": q["options"],
            "correct_idx": q["correct_idx"],
            "order_num": q["order_num"]
        }
        if q_id and str(q_id) in existing_q_ids:
            service_supabase.table("questions").update(q_payload).eq("id", q_id).execute()
            incoming_q_ids.add(str(q_id))
        else:
            service_supabase.table("questions").insert(q_payload).execute()

    to_delete = existing_q_ids - incoming_q_ids
    if to_delete:
        for qid in to_delete:
            service_supabase.table("questions").delete().eq("id", qid).execute()

    background_tasks.add_task(recalculate_test_attempts, test_id)
    return {"message": "Test fully updated"}

# Get test with questions (for students taking test)
@app.get("/api/tests/{test_id}/take")
def get_test_for_taking(test_id: str, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Get test details
    test = service_supabase.table("tests").select("*").eq("id", test_id).single().execute()
    if not test.data:
        raise HTTPException(status_code=404, detail="Test not found")

    if test.data.get("expires_at"):
        try:
            from datetime import datetime, timezone
            expires = datetime.fromisoformat(test.data["expires_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > expires:
                raise HTTPException(status_code=403, detail="Test has expired")
        except Exception as e:
            print("Error parsing expires_at:", e)

    # Get questions (without correct answers for students)
    questions = service_supabase.table("questions").select("id, question, options, order_num").eq("test_id", test_id).order("order_num").execute()

    return {
        "test": {
            "id": test.data["id"],
            "title": test.data["title"],
            "duration_mins": test.data["duration_mins"],
            "total_marks": test.data["total_marks"],
            "negative_marking": test.data["negative_marking"],
            "penalty": test.data["penalty"],
            "scheduled_for": test.data.get("scheduled_for"),
            "expires_at": test.data.get("expires_at")
        },
        "questions": questions.data
    }

# Check if student already attempted
@app.get("/api/tests/{test_id}/attempt-status")
def get_attempt_status(test_id: str, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    attempt = service_supabase.table("test_attempts").select("*").eq("test_id", test_id).eq("student_id", user["student_id"]).single().execute()

    return {
        "attempted": attempt.data is not None,
        "attempt": attempt.data
    }

# Submit test attempt
@app.post("/api/tests/{test_id}/submit")
def submit_test(test_id: str, request: SubmitTestRequest, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    if not user.get("student_id"):
        raise HTTPException(status_code=400, detail="Student record not found. Contact your teacher.")

    # Get test details
    test = service_supabase.table("tests").select("*").eq("id", test_id).single().execute()
    if not test.data:
        raise HTTPException(status_code=404, detail="Test not found")

    # Check if already attempted
    existing = service_supabase.table("test_attempts").select("id").eq("test_id", test_id).eq("student_id", user["student_id"]).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Test already attempted")

    # Get questions with correct answers
    questions = service_supabase.table("questions").select("id, correct_idx, order_num").eq("test_id", test_id).execute()
    questions_list = questions.data or []

    # Calculate score
    correct_count = 0
    wrong_count = 0
    marks_deducted = 0
    total_obtained = 0
    marks_per_question = test.data["total_marks"] / len(questions_list) if questions_list else 1

    for q in questions_list:
        q_id = q["id"]
        if q_id in request.answers:
            if request.answers[q_id] == q["correct_idx"]:
                correct_count += 1
                total_obtained += marks_per_question
            else:
                wrong_count += 1
                if test.data["negative_marking"]:
                    deduction = marks_per_question * test.data["penalty"]
                    marks_deducted += deduction
                    total_obtained -= deduction

    # Determine if flagged (cheat events)
    flagged = len(request.cheat_events) > 0

    # Calculate percentage
    score_pct = (total_obtained / test.data["total_marks"] * 100) if test.data["total_marks"] > 0 else 0

    # Points earned (based on score)
    points_earned = 0
    if score_pct >= 90:
        points_earned = 100
    elif score_pct >= 75:
        points_earned = 75
    elif score_pct >= 60:
        points_earned = 50
    elif score_pct >= 40:
        points_earned = 25
    else:
        points_earned = 10

    # Insert attempt
    attempt_data = {
        "test_id": test_id,
        "student_id": user["student_id"],
        "answers": request.answers,
        "score": round(total_obtained, 2),
        "correct_count": correct_count,
        "wrong_count": wrong_count,
        "marks_deducted": round(marks_deducted, 2),
        "points_earned": points_earned,
        "flagged": flagged,
        "cheat_events": request.cheat_events,
        "started_at": datetime.now().isoformat(),
        "submitted_at": datetime.now().isoformat()
    }
    result = service_supabase.table("test_attempts").insert(attempt_data).execute()

    # Update student points
    student = service_supabase.table("students").select("points").eq("id", user["student_id"]).single().execute()
    if student.data:
        new_points = (student.data.get("points") or 0) + points_earned
        service_supabase.table("students").update({"points": new_points}).eq("id", user["student_id"]).execute()

    # Update avg_score (stored as percentage)
    attempts = service_supabase.table("test_attempts").select("score, tests(total_marks)").eq("student_id", user["student_id"]).execute()
    if attempts.data:
        pcts = []
        for a in attempts.data:
            tm = (a.get("tests") or {}).get("total_marks") or 0
            if tm > 0:
                pcts.append((a["score"] / tm) * 100)
        if pcts:
            avg_pct = sum(pcts) / len(pcts)
            service_supabase.table("students").update({"avg_score": round(avg_pct, 1)}).eq("id", user["student_id"]).execute()

    return {
        "attempt_id": result.data[0]["id"],
        "score": round(total_obtained, 2),
        "total_marks": test.data["total_marks"],
        "percentage": round(score_pct, 1),
        "correct_count": correct_count,
        "wrong_count": wrong_count,
        "marks_deducted": round(marks_deducted, 2),
        "points_earned": points_earned,
        "flagged": flagged
    }

# Get test results for a specific test (teacher view)
@app.get("/api/tests/{test_id}/results")
def get_test_results(test_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Get test details
    test = service_supabase.table("tests").select("*, subject_classes(name, standards(name))").eq("id", test_id).single().execute()
    if not test.data:
        raise HTTPException(status_code=404, detail="Test not found")

    # Get all attempts with student info
    attempts = service_supabase.table("test_attempts").select("*, students(name, username)").eq("test_id", test_id).execute()
    attempts_list = attempts.data or []

    # Calculate stats
    scores = [a["score"] for a in attempts_list if a.get("score") is not None]
    avg_score = sum(scores) / len(scores) if scores else 0
    flagged_count = sum(1 for a in attempts_list if a.get("flagged"))

    return {
        "test": test.data,
        "attempts": sorted(attempts_list, key=lambda x: x.get("score") or 0, reverse=True),
        "stats": {
            "total_attempts": len(attempts.data),
            "avg_score": round(avg_score, 2),
            "highest_score": max(scores) if scores else 0,
            "lowest_score": min(scores) if scores else 0,
            "flagged_count": flagged_count
        }
    }

# Get student's test history
@app.get("/api/student/tests/history")
def get_student_test_history(user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    attempts = service_supabase.table("test_attempts").select("*, tests(title, total_marks)").eq("student_id", user["student_id"]).order("submitted_at", desc=True).execute()

    return attempts.data or []

# Get attempt review with correct answers (student views their own completed attempt)
@app.get("/api/tests/{test_id}/attempt-review")
def get_attempt_review(test_id: str, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # students.id = auth.users.id; use student_id from token if set, else fall back to user id
    sid = user.get("student_id") or user.get("id")
    if not sid:
        raise HTTPException(status_code=401, detail="Student identity not resolved")

    attempt = service_supabase.table("test_attempts").select("answers").eq("test_id", test_id).eq("student_id", sid).execute()
    if not attempt.data:
        raise HTTPException(status_code=404, detail="No attempt found for this test")

    raw_answers = attempt.data[0].get("answers") or {}
    # supabase-py may return JSONB as a string in some versions
    if isinstance(raw_answers, str):
        import json
        try:
            raw_answers = json.loads(raw_answers)
        except Exception:
            raw_answers = {}

    questions = service_supabase.table("questions").select("id, question, options, correct_idx, order_num").eq("test_id", test_id).order("order_num").execute()

    return {
        "questions": questions.data or [],
        "answers": raw_answers
    }

# Get leaderboard for a standard
@app.get("/api/leaderboard")
def get_leaderboard(standard_id: Optional[str] = None, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    if standard_id:
        students = service_supabase.table("students").select("id, name, username, points, avatar_url").eq("standard_id", standard_id).order("points", desc=True).execute()
    else:
        students = service_supabase.table("students").select("id, name, username, points, avatar_url").order("points", desc=True).limit(50).execute()

    return {
        "leaderboard": [
            {"rank": i + 1, **s}
            for i, s in enumerate(students.data or [])
        ]
    }

# Video completion points
@app.post("/api/videos/{video_id}/complete")
def mark_video_complete(video_id: str, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Check if already completed — only award points once
    existing = service_supabase.table("video_progress").select("completed").eq("video_id", video_id).eq("student_id", user["student_id"]).execute()
    already_done = bool(existing.data and existing.data[0].get("completed"))

    # Upsert progress record
    service_supabase.table("video_progress").upsert({
        "video_id": video_id,
        "student_id": user["student_id"],
        "completed": True,
        "downloaded": False,
        "progress_secs": 0,
        "last_watched_at": datetime.now().isoformat()
    }, on_conflict="video_id,student_id").execute()

    POINTS_PER_VIDEO = 10
    points_earned = 0
    new_points = 0

    if not already_done:
        student = service_supabase.table("students").select("points").eq("id", user["student_id"]).single().execute()
        if student.data:
            new_points = (student.data.get("points") or 0) + POINTS_PER_VIDEO
            service_supabase.table("students").update({"points": new_points}).eq("id", user["student_id"]).execute()
            points_earned = POINTS_PER_VIDEO

    return {"points_earned": points_earned, "total_points": new_points}

@app.post("/api/video-progress")
def update_video_progress(data: dict, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    video_id = data.get("video_id")
    progress_secs = int(data.get("progress_secs", 0))
    student_id = user["student_id"]

    if not video_id:
        raise HTTPException(status_code=400, detail="Missing video_id")

    # Check if a progress record already exists to preserve completed flag
    existing = service_supabase.table("video_progress").select("completed").eq("video_id", video_id).eq("student_id", student_id).execute()
    already_completed = bool(existing.data and existing.data[0].get("completed"))

    # Upsert progress record
    service_supabase.table("video_progress").upsert({
        "video_id": video_id,
        "student_id": student_id,
        "progress_secs": progress_secs,
        "completed": already_completed,
        "last_watched_at": datetime.now().isoformat()
    }, on_conflict="video_id,student_id").execute()

    return {"status": "ok"}

# --- Reminders ---
@app.get("/api/reminders")
def get_reminders(user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    response = service_supabase.table("reminders").select("*").eq("teacher_id", user["teacher_id"]).order("done").order("scheduled_for", nullsfirst=True).execute()
    return response.data or []

class ReminderCreate(BaseModel):
    title: str
    context: Optional[str] = None
    scheduled_for: Optional[str] = None

class ReminderUpdate(BaseModel):
    done: Optional[bool] = None
    title: Optional[str] = None
    context: Optional[str] = None
    scheduled_for: Optional[str] = None

@app.post("/api/reminders")
def create_reminder(reminder: ReminderCreate, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    data = {
        "teacher_id": user["teacher_id"],
        "title": reminder.title,
        "scheduled_for": reminder.scheduled_for,
        "context": reminder.context,
        "done": False
    }
    response = service_supabase.table("reminders").insert(data).execute()
    return response.data[0]

@app.patch("/api/reminders/{reminder_id}")
def update_reminder(reminder_id: str, updates: ReminderUpdate, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    update_data = updates.model_dump(exclude_none=True)
    if not update_data:
        return {}
    response = service_supabase.table("reminders").update(update_data).eq("id", reminder_id).eq("teacher_id", user["teacher_id"]).execute()
    return response.data[0] if response.data else {}

@app.delete("/api/reminders/{reminder_id}")
def delete_reminder(reminder_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    service_supabase.table("reminders").delete().eq("id", reminder_id).eq("teacher_id", user["teacher_id"]).execute()
    return {"message": "Deleted"}

# --- Notifications ---
@app.get("/api/notifications")
def get_notifications(user = Depends(verify_token)):
    if not service_supabase:
        return []
    try:
        response = service_supabase.table("notifications").select("*")\
            .eq("recipient_id", user["user_id"])\
            .order("created_at", desc=True)\
            .limit(30)\
            .execute()
        return response.data or []
    except Exception:
        return []

@app.patch("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, user = Depends(verify_token)):
    if not service_supabase:
        return {"ok": True}
    try:
        service_supabase.table("notifications").update({"read": True})\
            .eq("id", notification_id)\
            .eq("recipient_id", user["user_id"])\
            .execute()
        return {"ok": True}
    except Exception:
        return {"ok": True}

@app.post("/api/notifications/read-all")
def mark_all_notifications_read(user = Depends(verify_token)):
    if not service_supabase:
        return {"ok": True}
    try:
        service_supabase.table("notifications").update({"read": True})\
            .eq("recipient_id", user["user_id"])\
            .eq("read", False)\
            .execute()
        return {"ok": True}
    except Exception:
        return {"ok": True}


# --- WebSockets & Broadcasts & Uploads ---

@app.websocket("/api/ws/broadcasts/{standard_id}")
async def websocket_endpoint(websocket: WebSocket, standard_id: str, token: Optional[str] = None):
    if not token:
        await websocket.close(code=4001)
        return
    try:
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return
    await manager.connect(websocket, standard_id)

    # DB fallback: if in-memory history is empty for this standard, load from DB
    in_memory = [b for b in manager.broadcast_history if b.get("standard_id") == standard_id]
    if not in_memory and service_supabase:
        try:
            db_rows = await asyncio.to_thread(
                lambda: service_supabase.table("broadcasts")
                    .select("id, message, text, attachment_url, attachment_type, created_at, edited, deleted, scheduled_for, reply_to, expires_at, standard_id")
                    .eq("standard_id", standard_id)
                    .order("created_at")
                    .execute()
            )
            rows = db_rows.data or []
            if rows:
                # Normalize: coalesce message<-text, then enrich reply_to_text from parent
                id_to_msg = {}
                for row in rows:
                    if not row.get("message") and row.get("text"):
                        row["message"] = row["text"]
                    id_to_msg[row["id"]] = row.get("message") or ""
                for row in rows:
                    if row.get("reply_to"):
                        parent = id_to_msg.get(row["reply_to"], "")
                        row["reply_to_text"] = parent[:120] if parent else None
                    else:
                        row["reply_to_text"] = None
                    if not any(b.get("id") == row["id"] for b in manager.broadcast_history):
                        manager.broadcast_history.append(row)
                manager.save_history()
                await websocket.send_json({"type": "history", "data": rows})
        except Exception as e:
            print(f"WS DB history fallback error: {e}")

    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, standard_id)

@app.post("/api/broadcasts")
async def create_broadcast(req: BroadcastRequest, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    # Compute expires_at from standard's broadcast_ttl_hours if set
    expires_at = None
    if service_supabase:
        try:
            std_row = await asyncio.to_thread(lambda: service_supabase.table("standards").select("broadcast_ttl_hours").eq("id", req.standard_id).single().execute())
            ttl = std_row.data.get("broadcast_ttl_hours") if std_row.data else None
            if ttl:
                expires_at = (datetime.utcnow() + timedelta(hours=ttl)).isoformat()
        except Exception:
            pass

    # Look up reply_to_text for quote preview
    reply_to_text = None
    if req.reply_to:
        ref = next((b for b in manager.broadcast_history if b.get("id") == req.reply_to and not b.get("deleted")), None)
        if ref:
            reply_to_text = (ref.get("message") or "")[:120]

    payload = {
        "message": req.message,
        "attachment_url": req.attachment_url,
        "attachment_type": req.attachment_type,
        "sender": user["user_id"],
        "scheduled_for": req.scheduled_for,
        "reply_to": req.reply_to,
        "reply_to_text": reply_to_text,
        "expires_at": expires_at,
    }

    # For scheduled broadcasts, save to history/DB but do NOT push WS event yet
    is_future_scheduled = bool(req.scheduled_for and datetime.fromisoformat(req.scheduled_for.replace("Z", "+00:00")).replace(tzinfo=None) > datetime.utcnow())
    if is_future_scheduled:
        payload["id"] = str(uuid.uuid4())
        payload["created_at"] = datetime.now().isoformat()
        payload["standard_id"] = req.standard_id
        manager.broadcast_history.append(payload)
        def _save_scheduled():
            manager.save_history()
            if service_supabase:
                try:
                    service_supabase.table("broadcasts").insert({
                        "id": payload["id"],
                        "standard_id": req.standard_id,
                        "message": req.message,
                        "attachment_url": req.attachment_url,
                        "attachment_type": req.attachment_type,
                        "scheduled_for": req.scheduled_for,
                        "reply_to": req.reply_to,
                        "expires_at": expires_at,
                        "created_at": payload["created_at"],
                    }).execute()
                except Exception as e:
                    print("Supabase scheduled broadcast insert failed:", e)
        asyncio.create_task(asyncio.to_thread(_save_scheduled))
    else:
        await manager.broadcast_to_standard(req.standard_id, payload)

    return {"status": "success", "data": payload}

@app.get("/api/broadcasts")
def get_broadcasts(standard_id: Optional[str] = None, user = Depends(verify_token)):
    history = manager.broadcast_history
    if standard_id:
        history = [b for b in history if b.get("standard_id") == standard_id]
    now_iso = datetime.utcnow().isoformat()
    # Filter out expired messages
    history = [b for b in history if not (b.get("expires_at") and b["expires_at"] < now_iso and not b.get("deleted"))]
    # Students never see future-scheduled broadcasts
    if user["role"] == "student":
        now = datetime.utcnow()
        history = [b for b in history if not (
            b.get("scheduled_for") and
            datetime.fromisoformat(b["scheduled_for"].replace("Z", "+00:00")).replace(tzinfo=None) > now
        )]
    # Enrich with reply_to_text if missing (for older records)
    id_to_msg = {b["id"]: b.get("message", "") for b in manager.broadcast_history}
    result = []
    for b in history:
        item = dict(b)
        if item.get("reply_to") and not item.get("reply_to_text"):
            parent_msg = id_to_msg.get(item["reply_to"], "")
            item["reply_to_text"] = parent_msg[:120] if parent_msg else None
        result.append(item)
    return result

class BroadcastReadRequest(BaseModel):
    broadcast_ids: List[str]

@app.post("/api/broadcast-reads")
async def mark_broadcasts_read(req: BroadcastReadRequest, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase or not req.broadcast_ids:
        return {"marked": 0}
        
    # students.id = auth.users.id by schema design
    student_id = user["user_id"]
    try:
        s_res = service_supabase.table("students").select("id").eq("id", student_id).limit(1).execute()
        if not s_res.data:
            return {"marked": 0}
    except Exception:
        return {"marked": 0}

    try:
        now = datetime.now().isoformat()
        rows = [{"broadcast_id": bid, "student_id": student_id, "read_at": now} for bid in req.broadcast_ids]
        service_supabase.table("broadcast_reads").upsert(rows, on_conflict="broadcast_id,student_id").execute()
        
        standard_ids = set()
        for b in manager.broadcast_history:
            if b.get("id") in req.broadcast_ids:
                if b.get("standard_id"):
                    standard_ids.add(b.get("standard_id"))

        # Fallback: if memory was cleared (server restart), query DB for standard_ids
        if not standard_ids:
            try:
                res = service_supabase.table("broadcasts").select("standard_id").in_("id", list(req.broadcast_ids)).execute()
                for row in (res.data or []):
                    if row.get("standard_id"):
                        standard_ids.add(row["standard_id"])
            except Exception:
                pass

        for std_id in standard_ids:
            if std_id in manager.active_connections:
                event = {"type": "read_receipt_update", "broadcast_ids": req.broadcast_ids}
                disconnected = []
                for conn in manager.active_connections[std_id]:
                    try:
                        await conn.send_json(event)
                    except Exception:
                        disconnected.append(conn)
                for d in disconnected:
                    manager.disconnect(d, std_id)
        
        return {"marked": len(rows)}
    except Exception as e:
        print(f"Error marking broadcasts read: {e}")
        return {"marked": 0}

@app.get("/api/broadcasts/reads")
def get_broadcast_read_counts(standard_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        return {}
    try:
        broadcast_ids = [b["id"] for b in manager.broadcast_history
                         if b.get("standard_id") == standard_id and not b.get("deleted")]
        # Fallback: query DB if memory was cleared (server restart)
        if not broadcast_ids:
            try:
                res = service_supabase.table("broadcasts").select("id").eq("standard_id", standard_id).execute()
                broadcast_ids = [r["id"] for r in (res.data or [])]
            except Exception:
                pass
        if not broadcast_ids:
            return {}
        # Only count reads from students CURRENTLY in this standard, so the count
        # stays consistent with the read-details modal and the "all read" blue tick.
        students_res = service_supabase.table("students").select("id").eq("standard_id", standard_id).execute()
        valid_student_ids = {s["id"] for s in (students_res.data or [])}
        reads = service_supabase.table("broadcast_reads").select("broadcast_id, student_id").in_("broadcast_id", broadcast_ids).execute()
        counts = {}
        for row in (reads.data or []):
            if row.get("student_id") not in valid_student_ids:
                continue
            bid = row["broadcast_id"]
            counts[bid] = counts.get(bid, 0) + 1
        return counts
    except Exception:
        return {}

@app.get("/api/broadcasts/{broadcast_id}/reads/details")
def get_broadcast_read_details(broadcast_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        return {"read_by": [], "not_read_by": []}
    try:
        # Get standard_id
        b_res = service_supabase.table("broadcasts").select("standard_id").eq("id", broadcast_id).limit(1).execute()
        if not b_res.data:
            return {"read_by": [], "not_read_by": []}
        standard_id = b_res.data[0]["standard_id"]

        # Get all students in standard
        students_res = service_supabase.table("students").select("id, name, avatar_url").eq("standard_id", standard_id).execute()
        all_students = {s["id"]: s for s in (students_res.data or [])}

        # Get read receipts
        reads_res = service_supabase.table("broadcast_reads").select("student_id, read_at").eq("broadcast_id", broadcast_id).execute()
        read_dict = {r["student_id"]: r["read_at"] for r in (reads_res.data or [])}

        read_by = []
        not_read_by = []
        
        for sid, s in all_students.items():
            stu_data = {
                "student_id": sid,
                "name": s.get("name", "Unknown"),
                "avatar_url": s.get("avatar_url")
            }
            if sid in read_dict:
                stu_data["read_at"] = read_dict[sid]
                read_by.append(stu_data)
            else:
                stu_data["read_at"] = None
                not_read_by.append(stu_data)

        # Sort by name
        read_by.sort(key=lambda x: x["name"].lower())
        not_read_by.sort(key=lambda x: x["name"].lower())

        return {"read_by": read_by, "not_read_by": not_read_by}
    except Exception as e:
        print(f"Error fetching read details: {e}")
        return {"read_by": [], "not_read_by": []}


@app.delete("/api/broadcasts/{broadcast_id}")
async def delete_broadcast(broadcast_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    found = False
    std_id = None
    for b in manager.broadcast_history:
        if b.get("id") == broadcast_id:
            b["deleted"] = True
            b["message"] = ""
            b["attachment_url"] = None
            std_id = b.get("standard_id")
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    def db_delete():
        manager.save_history()
        if service_supabase:
            try:
                service_supabase.table("broadcasts").update({"deleted": True}).eq("id", broadcast_id).execute()
            except Exception as e:
                print("Supabase broadcast delete failed:", e)
    
    import asyncio
    asyncio.create_task(asyncio.to_thread(db_delete))
    # Notify connected clients in real-time
    if std_id and std_id in manager.active_connections:
        dead = []
        for conn in manager.active_connections[std_id]:
            try:
                await conn.send_json({"type": "delete_broadcast", "id": broadcast_id})
            except Exception:
                dead.append(conn)
        for d in dead:
            manager.disconnect(d, std_id)
    return {"status": "deleted"}

class EditBroadcastRequest(BaseModel):
    message: str

@app.patch("/api/broadcasts/{broadcast_id}")
async def edit_broadcast(broadcast_id: str, req: EditBroadcastRequest, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    found = False
    updated_b = None
    for b in manager.broadcast_history:
        if b.get("id") == broadcast_id:
            b["message"] = req.message
            b["edited"] = True
            updated_b = b
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    manager.save_history()
    # Notify connected clients in real-time
    std_id = updated_b.get("standard_id") if updated_b else None
    if std_id and std_id in manager.active_connections:
        dead = []
        for conn in manager.active_connections[std_id]:
            try:
                await conn.send_json({"type": "edit_broadcast", "data": updated_b})
            except Exception:
                dead.append(conn)
        for d in dead:
            manager.disconnect(d, std_id)
    return {"status": "updated"}

# ── Broadcast TTL (auto-delete) settings ─────────────────────────────────────

@app.get("/api/standards/{standard_id}/broadcast-ttl")
def get_broadcast_ttl(standard_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        return {"ttl_hours": None}
    try:
        row = service_supabase.table("standards").select("broadcast_ttl_hours").eq("id", standard_id).single().execute()
        return {"ttl_hours": row.data.get("broadcast_ttl_hours") if row.data else None}
    except Exception:
        return {"ttl_hours": None}

@app.patch("/api/standards/{standard_id}/broadcast-ttl")
def set_broadcast_ttl(standard_id: str, req: BroadcastTTLRequest, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="DB not configured")
    service_supabase.table("standards").update({"broadcast_ttl_hours": req.ttl_hours}).eq("id", standard_id).execute()
    return {"ttl_hours": req.ttl_hours}


# ── Broadcast reactions ────────────────────────────────────────────────────────

@app.get("/api/broadcasts/reactions")
def get_broadcast_reactions(standard_id: str, user = Depends(verify_token)):
    if not service_supabase:
        return {}
    try:
        broadcast_ids = [b["id"] for b in manager.broadcast_history if b.get("standard_id") == standard_id and not b.get("deleted")]
        if not broadcast_ids:
            return {}
        rows = service_supabase.table("broadcast_reactions").select("broadcast_id, user_id, emoji").in_("broadcast_id", broadcast_ids).execute()
        result: Dict[str, Dict[str, int]] = {}
        my_reactions: Dict[str, List[str]] = {}
        for r in (rows.data or []):
            bid, emoji = r["broadcast_id"], r["emoji"]
            result.setdefault(bid, {})
            result[bid][emoji] = result[bid].get(emoji, 0) + 1
            if r["user_id"] == user["user_id"]:
                my_reactions.setdefault(bid, []).append(emoji)
        return {"counts": result, "mine": my_reactions}
    except Exception:
        return {"counts": {}, "mine": {}}

@app.post("/api/broadcasts/{broadcast_id}/reactions")
async def add_reaction(broadcast_id: str, req: BroadcastReactionRequest, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="DB not configured")
    b = next((x for x in manager.broadcast_history if x.get("id") == broadcast_id), None)
    if not b:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    await asyncio.to_thread(lambda: service_supabase.table("broadcast_reactions").upsert(
        {"broadcast_id": broadcast_id, "user_id": user["user_id"], "emoji": req.emoji},
        on_conflict="broadcast_id,user_id,emoji"
    ).execute())
    # Notify standard via WS
    std_id = b.get("standard_id")
    if std_id and std_id in manager.active_connections:
        dead = []
        for conn in manager.active_connections[std_id]:
            try:
                await conn.send_json({"type": "reaction_update", "broadcast_id": broadcast_id})
            except Exception:
                dead.append(conn)
        for d in dead:
            manager.disconnect(d, std_id)
    return {"status": "ok"}

@app.delete("/api/broadcasts/{broadcast_id}/reactions/{emoji}")
async def remove_reaction(broadcast_id: str, emoji: str, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="DB not configured")
    b = next((x for x in manager.broadcast_history if x.get("id") == broadcast_id), None)
    await asyncio.to_thread(lambda: service_supabase.table("broadcast_reactions").delete()
        .eq("broadcast_id", broadcast_id).eq("user_id", user["user_id"]).eq("emoji", emoji).execute())
    std_id = b.get("standard_id") if b else None
    if std_id and std_id in manager.active_connections:
        dead = []
        for conn in manager.active_connections[std_id]:
            try:
                await conn.send_json({"type": "reaction_update", "broadcast_id": broadcast_id})
            except Exception:
                dead.append(conn)
        for d in dead:
            manager.disconnect(d, std_id)
    return {"status": "ok"}


# ── Notes CRUD ────────────────────────────────────────────────────────────────

@app.get("/api/notes")
async def get_notes(class_id: str, user = Depends(verify_token)):
    if not service_supabase:
        return []
    try:
        rows = await asyncio.to_thread(lambda: service_supabase.table("notes").select("*")
            .eq("class_id", class_id).order("is_pinned", desc=True).order("created_at", desc=False).execute())
        return rows.data or []
    except Exception as e:
        print(f"get_notes error: {e}")
        return []

@app.post("/api/notes")
async def create_note(req: NoteCreate, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="DB not configured")
    row = {
        "class_id": req.class_id,
        "title": req.title,
        "body": req.body,
        "file_url": req.file_url,
        "file_type": req.file_type,
        "storage_path": req.storage_path,
        "is_pinned": req.is_pinned,
        "created_by": user["user_id"],
    }
    result = await asyncio.to_thread(lambda: service_supabase.table("notes").insert(row).execute())
    return (result.data or [{}])[0]

@app.patch("/api/notes/{note_id}")
async def update_note(note_id: str, req: NoteUpdate, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="DB not configured")
    # exclude_unset: only apply fields the client actually sent (explicit nulls
    # are kept, so an attachment can be cleared, while a pin-only toggle leaves
    # the other fields untouched).
    updates = req.dict(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    updates["updated_at"] = datetime.utcnow().isoformat()
    result = await asyncio.to_thread(lambda: service_supabase.table("notes").update(updates).eq("id", note_id).execute())
    return (result.data or [{}])[0]

@app.delete("/api/notes/{note_id}")
async def delete_note(note_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="DB not configured")
    # Delete file from Supabase Storage if present
    try:
        row = await asyncio.to_thread(lambda: service_supabase.table("notes").select("storage_path").eq("id", note_id).single().execute())
        path = row.data.get("storage_path") if row.data else None
        if path:
            await asyncio.to_thread(lambda: service_supabase.storage.from_("notes").remove([path]))
    except Exception as e:
        print(f"Note file delete failed (ignored): {e}")
    await asyncio.to_thread(lambda: service_supabase.table("notes").delete().eq("id", note_id).execute())
    return {"status": "deleted"}

@app.post("/api/notes/upload")
async def upload_note_file(file: UploadFile = File(...), class_id: str = Form(...), user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="DB not configured")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    path = f"{class_id}/{uuid.uuid4()}.{ext}"
    contents = await file.read()
    await asyncio.to_thread(lambda: service_supabase.storage.from_("notes").upload(path, contents, {"content-type": file.content_type or "application/octet-stream"}))
    url = service_supabase.storage.from_("notes").get_public_url(path)
    return {"url": url, "path": path, "type": file.content_type or "application/octet-stream"}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    file_bytes = await file.read()
    file_ext = os.path.splitext(file.filename)[1]
    file_name = f"{uuid.uuid4()}{file_ext}"

    try:
        try:
            await asyncio.to_thread(lambda: service_supabase.storage.get_bucket("broadcasts"))
        except:
            await asyncio.to_thread(lambda: service_supabase.storage.create_bucket("broadcasts", options={"public": True}))

        await asyncio.to_thread(
            lambda: service_supabase.storage.from_("broadcasts").upload(file_name, file_bytes, {"content-type": file.content_type})
        )
        public_url = await asyncio.to_thread(
            lambda: service_supabase.storage.from_("broadcasts").get_public_url(file_name)
        )
        return {"url": public_url, "type": file.content_type, "filename": file.filename}
    except Exception as e:
        print("Upload error:", e)
        b64 = base64.b64encode(file_bytes).decode('utf-8')
        return {"url": f"data:{file.content_type};base64,{b64}", "type": file.content_type, "filename": file.filename}

# --- Bulk Student Import ---

class BulkStudentItem(BaseModel):
    name: str
    username: str
    email: Optional[str] = None
    phone: Optional[str] = None
    standard_id: str
    temp_password: str

class BulkImportRequest(BaseModel):
    students: List[BulkStudentItem]
    filename: str

@app.post("/api/students/bulk")
def bulk_import_students(req: BulkImportRequest, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    success_count = 0
    error_count = 0
    skipped_count = 0
    created = []                 # successful rows, with their generated student_code
    seq_cache = {}              # shared per-prefix counter so codes don't collide in-batch

    # Map standard_id → name so the credentials export can show a readable standard
    std_name_map = {}
    try:
        std_ids = list({s.standard_id for s in req.students if s.standard_id})
        if std_ids:
            std_rows = service_supabase.table("standards").select("id, name").in_("id", std_ids).execute()
            std_name_map = {r["id"]: r.get("name") for r in (std_rows.data or [])}
    except Exception:
        pass

    for s in req.students:
        auth_user_id = None
        try:
            # 1. Create Supabase Auth user
            email_to_use = s.email if s.email else f"{s.username}@tutoria.internal"
            auth_res = service_supabase.auth.admin.create_user({
                "email": email_to_use,
                "password": s.temp_password,
                "user_metadata": {
                    "role": "student",
                    "username": s.username,
                    "name": s.name
                },
                "email_confirm": True
            })

            if not auth_res.user:
                # Already exists or creation silently failed — skip
                skipped_count += 1
                continue

            auth_user_id = auth_res.user.id

            # 2. Insert into students table
            service_supabase.table("students").insert({
                "id": auth_user_id,
                "name": s.name,
                "username": s.username,
                "email": s.email,
                "phone": s.phone,
                "standard_id": s.standard_id,
                "must_change_pwd": True
            }).execute()

            # Persist the plaintext temp password (post-insert, like single create)
            # so it can be resent to parents later. Guarded — a missing column
            # must never block student creation.
            try:
                service_supabase.table("students").update(
                    {"plain_password": s.temp_password}).eq("id", auth_user_id).execute()
            except Exception:
                pass

            # 3. Generate + persist the student code (post-insert, like single create)
            student_code = assign_student_code(auth_user_id, s.standard_id, seq_cache=seq_cache)

            created.append({
                "name": s.name,
                "username": s.username,
                "student_code": student_code,
                "email": s.email,
                "phone": s.phone,
                "standard_name": std_name_map.get(s.standard_id),
                "temp_password": s.temp_password,
            })
            success_count += 1
        except Exception as e:
            err_str = str(e).lower()
            # "already registered" / "already exists" / duplicate key — treat as skipped
            if any(kw in err_str for kw in ["already", "duplicate", "unique", "exists", "registered"]):
                skipped_count += 1
            else:
                print(f"Error importing student {s.username}:", e)
                error_count += 1
                # Clean up orphan auth user if DB insert failed
                if auth_user_id:
                    try:
                        service_supabase.auth.admin.delete_user(auth_user_id)
                    except Exception as del_err:
                        print(f"Failed to clean up orphan auth user {auth_user_id}:", del_err)

    # 3. Log bulk import
    try:
        service_supabase.table("bulk_imports").insert({
            "teacher_id": user["teacher_id"],
            "filename": req.filename,
            "total_rows": len(req.students),
            "created": success_count,
            "skipped": skipped_count,
            "errors": error_count,
            "created_at": datetime.now().isoformat()
        }).execute()
    except Exception as e:
        print("Failed to insert audit log (table might not exist):", e)

    return {"status": "success", "created": success_count, "skipped": skipped_count, "errors": error_count, "students": created}


# ─── Question Bank ───────────────────────────────────────────────────────────

class QuestionBankItem(BaseModel):
    question: str
    options: List[str]
    correct_idx: int
    subject: Optional[str] = None

class QuestionBankImport(BaseModel):
    test_id: str
    question_ids: List[str]

@app.get("/api/question-bank")
def get_question_bank(user=Depends(verify_token)):
    if user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teachers only")
    result = service_supabase.table("question_bank").select("*").eq("teacher_id", user["teacher_id"]).order("created_at", desc=True).execute()
    return result.data or []

@app.post("/api/question-bank")
def create_question_bank_item(item: QuestionBankItem, user=Depends(verify_token)):
    if user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teachers only")
    result = service_supabase.table("question_bank").insert({
        "teacher_id": user["teacher_id"],
        "question": item.question,
        "options": item.options,
        "correct_idx": item.correct_idx,
        "subject": item.subject,
        "created_at": datetime.now().isoformat(),
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save question")
    return result.data[0]

@app.delete("/api/question-bank/{question_id}")
def delete_question_bank_item(question_id: str, user=Depends(verify_token)):
    if user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teachers only")
    existing = service_supabase.table("question_bank").select("id, teacher_id").eq("id", question_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Question not found")
    if existing.data["teacher_id"] != user["teacher_id"]:
        raise HTTPException(status_code=403, detail="Not your question")
    service_supabase.table("question_bank").delete().eq("id", question_id).execute()
    return {"status": "deleted"}

@app.post("/api/question-bank/import")
def import_from_question_bank(req: QuestionBankImport, user=Depends(verify_token)):
    """Copy selected bank questions into a test's questions table."""
    if user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teachers only")
    # Verify teacher owns the test
    test = service_supabase.table("tests").select("id, class_id").eq("id", req.test_id).single().execute()
    if not test.data:
        raise HTTPException(status_code=404, detail="Test not found")
    # Fetch bank questions
    bank_qs = service_supabase.table("question_bank").select("*").in_("id", req.question_ids).eq("teacher_id", user["teacher_id"]).execute()
    if not bank_qs.data:
        raise HTTPException(status_code=404, detail="No matching questions found")
    # Get current max order_num for the test
    existing = service_supabase.table("questions").select("order_num").eq("test_id", req.test_id).order("order_num", desc=True).limit(1).execute()
    next_order = (existing.data[0]["order_num"] + 1) if existing.data else 1
    rows = []
    for i, bq in enumerate(bank_qs.data):
        rows.append({
            "test_id": req.test_id,
            "question": bq["question"],
            "options": bq["options"],
            "correct_idx": bq["correct_idx"],
            "order_num": next_order + i,
        })
    service_supabase.table("questions").insert(rows).execute()
    return {"status": "imported", "count": len(rows)}


# --- Live Classes ---

@app.get("/api/live-classes")
async def get_live_classes(class_id: Optional[str] = None, standard_id: Optional[str] = None, user=Depends(verify_token)):
    # ── Fast path: fetch ALL live classes for a standard in one shot ──────────
    if standard_id:
        # Access check
        if user["role"] == "teacher":
            std_check = await asyncio.to_thread(lambda: service_supabase.table("standards")
                .select("id, teacher_id").eq("id", standard_id).eq("teacher_id", user["teacher_id"]).single().execute())
            if not std_check.data:
                raise HTTPException(status_code=403, detail="Not your standard")
            owner_id = std_check.data["teacher_id"]
        else:
            if user.get("standard_id") != standard_id:
                raise HTTPException(status_code=403, detail="Not enrolled in this standard")
            owner_result = await asyncio.to_thread(lambda: service_supabase.table("standards")
                .select("teacher_id").eq("id", standard_id).single().execute())
            owner_id = owner_result.data.get("teacher_id") if owner_result.data else None

        # Parallelize independent queries: subjects, branding, and enrolled_count
        def fetch_subs():
            return service_supabase.table("subject_classes").select("id, name").eq("standard_id", standard_id).execute()
        def fetch_brand():
            if not owner_id: return None
            return service_supabase.table("teacher_branding").select("thumbnail_url, thumbnail_text_side, profile_photo_url").eq("teacher_id", owner_id).single().execute()
        def fetch_enroll():
            return service_supabase.table("students").select("id", count="exact").eq("standard_id", standard_id).execute()

        subs_result, brand_result, enrolled_result = await asyncio.gather(
            asyncio.to_thread(fetch_subs),
            asyncio.to_thread(fetch_brand),
            asyncio.to_thread(fetch_enroll)
        )

        sub_map = {s["id"]: s for s in (subs_result.data or [])}
        class_ids = list(sub_map.keys())
        enrolled_count = enrolled_result.count or 0

        if not class_ids:
            return []

        # Now fetch classes and attendance in parallel
        def fetch_classes():
            return service_supabase.table("live_classes").select("*").in_("class_id", class_ids).order("scheduled_at", desc=True).execute()

        lc_result = await asyncio.to_thread(fetch_classes)
        classes = lc_result.data or []
        ids = [lc["id"] for lc in classes]

        att_by_class: dict = {}
        if ids:
            def fetch_att():
                return service_supabase.table("live_class_attendance").select("live_class_id, attended, student_id").in_("live_class_id", ids).execute()
            att_all = await asyncio.to_thread(fetch_att)
            for a in (att_all.data or []):
                att_by_class.setdefault(a["live_class_id"], []).append(a)

        cur_url = cur_side = cur_photo = None
        if brand_result and brand_result.data:
            cur_url = brand_result.data.get("thumbnail_url")
            cur_side = brand_result.data.get("thumbnail_text_side") or "right"
            cur_photo = brand_result.data.get("profile_photo_url")

        for lc in classes:
            if cur_url or cur_photo:
                lc["thumbnail_url"]       = cur_url
                lc["thumbnail_text_side"] = cur_side
                lc["teacher_photo_url"]   = cur_photo
            
            att_data = att_by_class.get(lc["id"], [])
            lc["attended_count"]   = sum(1 for a in att_data if a["attended"])
            lc["total_registered"] = enrolled_count
            lc["class_name"]       = sub_map.get(lc.get("class_id"), {}).get("name", "")
            lc.pop("zoom_join_url",    None)
            lc.pop("zoom_start_url",   None)
            lc.pop("zoom_meeting_id",  None)
            lc.pop("zoom_passcode",    None)
            if user["role"] == "student":
                my_att = next((a for a in att_data if a.get("student_id") == user["user_id"]), None)
                lc["my_attended"] = my_att["attended"] if my_att else None

        return classes

    # ── Original per-class path (kept for backwards compat) ──────────────────
    if not class_id:
        raise HTTPException(status_code=400, detail="class_id or standard_id is required")

    class_result = service_supabase.table("subject_classes") \
        .select("id, standard_id").eq("id", class_id).single().execute()
    if not class_result.data:
        raise HTTPException(status_code=404, detail="Subject not found")

    std_id = class_result.data["standard_id"]

    if user["role"] == "teacher":
        std_check = service_supabase.table("standards") \
            .select("id").eq("id", std_id).eq("teacher_id", user["teacher_id"]).single().execute()
        if not std_check.data:
            raise HTTPException(status_code=403, detail="Not your class")
    else:
        if user.get("standard_id") != std_id:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")

    result = service_supabase.table("live_classes") \
        .select("*").eq("class_id", class_id) \
        .order("scheduled_at", desc=True).execute()
    classes = result.data or []

    try:
        owner = service_supabase.table("standards") \
            .select("teacher_id").eq("id", std_id).single().execute()
        owner_id = owner.data.get("teacher_id") if owner.data else None
        if owner_id:
            brand = service_supabase.table("teacher_branding") \
                .select("thumbnail_url, thumbnail_text_side") \
                .eq("teacher_id", owner_id).single().execute()
            if brand.data and brand.data.get("thumbnail_url"):
                cur_url = brand.data.get("thumbnail_url")
                cur_side = brand.data.get("thumbnail_text_side") or "right"
                for lc in classes:
                    lc["thumbnail_url"] = cur_url
                    lc["thumbnail_text_side"] = cur_side
    except Exception:
        pass

    # Status is updated to "live" by the join-token endpoint when the teacher
    # starts the meeting. No Zoom polling here — keeps the list endpoint fast.

    att_by_class: dict = {}
    ids = [lc["id"] for lc in classes]
    if ids:
        att_all = service_supabase.table("live_class_attendance") \
            .select("live_class_id, attended, student_id").in_("live_class_id", ids).execute()
        for a in (att_all.data or []):
            att_by_class.setdefault(a["live_class_id"], []).append(a)

    enrolled_count = service_supabase.table("students") \
        .select("id", count="exact").eq("standard_id", std_id).execute().count or 0

    for lc in classes:
        att_data = att_by_class.get(lc["id"], [])
        lc["attended_count"] = sum(1 for a in att_data if a["attended"])
        lc["total_registered"] = enrolled_count
        lc.pop("zoom_join_url", None)
        lc.pop("zoom_start_url", None)
        lc.pop("zoom_meeting_id", None)
        lc.pop("zoom_passcode", None)
        if user["role"] == "student":
            my_att = next((a for a in att_data if a.get("student_id") == user["user_id"]), None)
            lc["my_attended"] = my_att["attended"] if my_att else None

    return classes


@app.post("/api/live-classes")
async def create_live_class(data: LiveClassCreate, user=Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    class_result = await asyncio.to_thread(lambda: service_supabase.table("subject_classes") \
        .select("id, standard_id").eq("id", data.class_id).single().execute())
    if not class_result.data:
        raise HTTPException(status_code=404, detail="Subject not found")

    std_check = await asyncio.to_thread(lambda: service_supabase.table("standards") \
        .select("id") \
        .eq("id", class_result.data["standard_id"]) \
        .eq("teacher_id", user["teacher_id"]).single().execute())
    if not std_check.data:
        raise HTTPException(status_code=403, detail="Not your class")

    zoom_data = await zoom_create_meeting(
        topic=data.title,
        start_time=data.scheduled_at,
        duration_mins=data.duration_mins,
    )

    db_scheduled_at = data.scheduled_at
    if len(db_scheduled_at) == 19 and "+" not in db_scheduled_at and "Z" not in db_scheduled_at:
        db_scheduled_at += "+05:30"

    # Snapshot the teacher's universal auto-thumbnail onto this class so it stays
    # fixed even if the teacher later changes their base image.
    thumb_url, thumb_side = None, "right"
    try:
        brand = await asyncio.to_thread(lambda: service_supabase.table("teacher_branding") \
            .select("thumbnail_url, thumbnail_text_side") \
            .eq("teacher_id", user["teacher_id"]).single().execute())
        if brand.data:
            thumb_url = brand.data.get("thumbnail_url")
            thumb_side = brand.data.get("thumbnail_text_side") or "right"
    except Exception:
        pass

    insert = {
        "class_id": data.class_id,
        "title": data.title,
        "scheduled_at": db_scheduled_at,
        "duration_mins": data.duration_mins,
        "zoom_meeting_id": zoom_data["meeting_id"],
        "zoom_join_url": zoom_data["join_url"],
        "zoom_start_url": zoom_data["start_url"],
        "zoom_passcode": zoom_data.get("password", ""),
        "thumbnail_url": thumb_url,
        "thumbnail_text_side": thumb_side,
        "status": "scheduled",
        "created_by": user["user_id"],
    }
    result = await asyncio.to_thread(lambda: service_supabase.table("live_classes").insert(insert).execute())
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create live class")
    return result.data[0]


@app.get("/api/live-classes/{live_class_id}/join-token")
async def get_join_token(live_class_id: str, user=Depends(verify_token)):
    lc_result = await asyncio.to_thread(lambda: service_supabase.table("live_classes") \
        .select("*").eq("id", live_class_id).single().execute())
    if not lc_result.data:
        raise HTTPException(status_code=404, detail="Live class not found")
    lc = lc_result.data

    if lc["status"] == "cancelled":
        raise HTTPException(status_code=400, detail="This class has been cancelled")
    if lc["status"] == "ended":
        raise HTTPException(status_code=400, detail="This class has already ended")

    if not lc.get("zoom_meeting_id"):
        raise HTTPException(status_code=400, detail="Zoom meeting not created yet")

    # The owner is the only host and starts the class from their Zoom phone app.
    # Source of truth is Zoom itself (the webhook can't reach localhost): only let
    # watchers in once Zoom reports the meeting has actually started.
    if lc["status"] != "live":
        if await zoom_is_meeting_live(lc["zoom_meeting_id"]):
            await asyncio.to_thread(lambda: service_supabase.table("live_classes")
                .update({"status": "live"}).eq("id", live_class_id).execute())
        else:
            raise HTTPException(status_code=400, detail="Class has not started yet")

    class_result = await asyncio.to_thread(lambda: service_supabase.table("subject_classes") \
        .select("standard_id").eq("id", lc["class_id"]).single().execute())
    required_std = class_result.data["standard_id"] if class_result.data else None

    # Everyone here is a VIEW-ONLY watcher (role 0). Hosting happens only from the
    # owner's phone app, so we never issue a ZAK or a host-role signature.
    if user["role"] == "teacher":
        std_check = await asyncio.to_thread(lambda: service_supabase.table("standards") \
            .select("id").eq("id", required_std).eq("teacher_id", user["teacher_id"]).single().execute())
        if not std_check.data:
            raise HTTPException(status_code=403, detail="Not your class")
        display_name = user.get("name", "Teacher")
    else:
        if user.get("standard_id") != required_std:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")
        student = await asyncio.to_thread(lambda: service_supabase.table("students") \
            .select("blocked, name").eq("id", user["user_id"]).single().execute())
        if not student.data or student.data.get("blocked"):
            raise HTTPException(status_code=403, detail="Account blocked")
        display_name = student.data.get("name", user.get("name", "Student"))

        # Deterministic attendance: the authenticated student is joining now. This is
        # the source of truth (independent of Zoom's report API / name matching).
        # Fire-and-forget so the token returns immediately (no DB round-trip on the
        # click path); best-effort, errors are swallowed.
        async def _record_attendance():
            try:
                await asyncio.to_thread(lambda: service_supabase.table("live_class_attendance").upsert({
                    "live_class_id": live_class_id,
                    "student_id":    user["user_id"],
                    "attended":      True,
                    "joined_at":     datetime.now(timezone.utc).isoformat(),
                }, on_conflict="live_class_id,student_id").execute())
            except Exception as e:
                print(f"[!] join attendance record failed (ignored): {e}")
        asyncio.create_task(_record_attendance())

    role_num = 0  # view-only for all portal watchers

    # Ensure the meeting has no waiting room so watchers aren't trapped in a lobby
    # (covers meetings created before this became the default). Run in the background
    # so it doesn't add a Zoom round-trip to the click→watch latency.
    async def _ensure_joinable_bg():
        try:
            await zoom_ensure_joinable(lc["zoom_meeting_id"])
        except Exception as e:
            print(f"[!] ensure-joinable failed (ignored): {e}")
    asyncio.create_task(_ensure_joinable_bg())

    signature = zoom_generate_sdk_signature(lc["zoom_meeting_id"], role_num)
    return {
        "meeting_id": lc["zoom_meeting_id"],
        "signature": signature,
        "sdk_key": ZOOM_SDK_KEY,
        "role": role_num,
        "display_name": display_name,
        "passcode": lc.get("zoom_passcode", "") or "",
    }


@app.post("/api/live-classes/{live_class_id}/end")
async def end_live_class(live_class_id: str, user=Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    lc_result = await asyncio.to_thread(lambda: service_supabase.table("live_classes") \
        .select("*").eq("id", live_class_id).single().execute())
    if not lc_result.data:
        raise HTTPException(status_code=404, detail="Not found")
    lc = lc_result.data

    await asyncio.to_thread(lambda: service_supabase.table("live_classes") \
        .update({"status": "ended"}).eq("id", live_class_id).execute())

    participants = await zoom_get_participants(lc.get("zoom_meeting_id", ""))

    class_result = await asyncio.to_thread(lambda: service_supabase.table("subject_classes") \
        .select("standard_id").eq("id", lc["class_id"]).single().execute())
    if not class_result.data:
        return {"message": "ended", "attended": 0, "absent": 0}

    students_result = await asyncio.to_thread(lambda: service_supabase.table("students") \
        .select("id, name, email") \
        .eq("standard_id", class_result.data["standard_id"]).execute())
    all_students = students_result.data or []

    # Join-time attendance is the source of truth — load it so we never downgrade a
    # student who actually joined to "absent" just because Zoom's report is empty/late.
    existing = await asyncio.to_thread(lambda: service_supabase.table("live_class_attendance") \
        .select("student_id, attended, joined_at").eq("live_class_id", live_class_id).execute())
    already = {r["student_id"]: r for r in (existing.data or [])}

    p_by_email = {(p.get("user_email") or "").lower(): p for p in participants}
    p_by_name  = {(p.get("user_name")  or "").lower(): p for p in participants}

    attended_count = 0
    absent_count   = 0
    rows = []

    for student in all_students:
        em  = (student.get("email") or "").lower()
        nm  = (student.get("name")  or "").lower()
        match = p_by_email.get(em) or p_by_name.get(nm)
        prior = already.get(student["id"])
        was_present = bool(prior and prior.get("attended"))

        if match or was_present:
            attended_count += 1
            row = {
                "live_class_id": live_class_id,
                "student_id":    student["id"],
                "attended":      True,
                # Prefer the recorded join time; fall back to Zoom's.
                "joined_at":     (prior or {}).get("joined_at") or (match or {}).get("join_time"),
            }
            if match:  # enrich with Zoom-reported duration when available
                dur_secs = match.get("duration", 0)
                row["left_at"] = match.get("leave_time")
                row["duration_mins"] = dur_secs // 60 if dur_secs else None
            rows.append(row)
        else:
            absent_count += 1
            rows.append({
                "live_class_id": live_class_id,
                "student_id":    student["id"],
                "attended":      False,
            })

    # Single batched upsert instead of one query per student (was a 50+ query N+1).
    if rows:
        await asyncio.to_thread(lambda: service_supabase.table("live_class_attendance") \
            .upsert(rows, on_conflict="live_class_id,student_id").execute())

    return {"message": "Class ended", "attended": attended_count, "absent": absent_count, "total": len(all_students)}


@app.post("/api/live-classes/{live_class_id}/cancel")
def cancel_live_class(live_class_id: str, user=Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    # Verify ownership via standard chain (supports sub-teachers)
    lc = service_supabase.table("live_classes").select("class_id").eq("id", live_class_id).single().execute()
    if lc.data:
        _sc = service_supabase.table("subject_classes").select("standard_id").eq("id", lc.data["class_id"]).single().execute()
        _st = service_supabase.table("standards").select("teacher_id").eq("id", (_sc.data or {}).get("standard_id", "")).single().execute() if _sc.data else None
        if not _st or not _st.data or _st.data["teacher_id"] != user["teacher_id"]:
            raise HTTPException(status_code=403, detail="Not your class")
    service_supabase.table("live_classes") \
        .update({"status": "cancelled"}) \
        .eq("id", live_class_id).execute()
    return {"message": "cancelled"}


@app.delete("/api/live-classes/{live_class_id}")
async def delete_live_class(live_class_id: str, user=Depends(verify_token)):
    """Permanently delete a live class (and its attendance records + the Zoom meeting)."""
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    lc = await asyncio.to_thread(lambda: service_supabase.table("live_classes") \
        .select("class_id, status, zoom_meeting_id").eq("id", live_class_id).single().execute())
    if not lc.data:
        raise HTTPException(status_code=404, detail="Live class not found")

    # Verify ownership via standard chain (supports sub-teachers)
    _sc = await asyncio.to_thread(lambda: service_supabase.table("subject_classes").select("standard_id").eq("id", lc.data["class_id"]).single().execute())
    _st = await asyncio.to_thread(lambda: service_supabase.table("standards").select("teacher_id").eq("id", (_sc.data or {}).get("standard_id", "")).single().execute()) if _sc.data else None
    if not _st or not _st.data or _st.data["teacher_id"] != user["teacher_id"]:
        raise HTTPException(status_code=403, detail="Not your class")

    if lc.data.get("status") == "live":
        raise HTTPException(status_code=400, detail="End the class before deleting it.")

    # Best-effort: remove the Zoom meeting too (ignored if already gone)
    await zoom_delete_meeting(lc.data.get("zoom_meeting_id"))

    # Remove attendance rows first (FK), then the class itself
    await asyncio.to_thread(lambda: service_supabase.table("live_class_attendance").delete().eq("live_class_id", live_class_id).execute())
    await asyncio.to_thread(lambda: service_supabase.table("live_classes").delete().eq("id", live_class_id).execute())
    return {"message": "deleted"}


@app.get("/api/live-classes/{live_class_id}/attendance")
def get_live_class_attendance(live_class_id: str, user=Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    # Resolve the class → standard so we can show the FULL enrolled roster, not just
    # whoever happens to have an attendance row. Attendance is recorded at join time,
    # so this is accurate whether or not "End class" was ever pressed.
    lc = service_supabase.table("live_classes").select("class_id").eq("id", live_class_id).single().execute()
    if not lc.data:
        raise HTTPException(status_code=404, detail="Live class not found")
    sc = service_supabase.table("subject_classes").select("standard_id").eq("id", lc.data["class_id"]).single().execute()
    std_id = sc.data["standard_id"] if sc.data else None

    students = service_supabase.table("students") \
        .select("id, name, username, avatar_url") \
        .eq("standard_id", std_id).execute().data or []

    att_rows = service_supabase.table("live_class_attendance") \
        .select("student_id, attended, joined_at, left_at, duration_mins") \
        .eq("live_class_id", live_class_id).execute().data or []
    att_by_student = {a["student_id"]: a for a in att_rows}

    roster = []
    for s in students:
        a = att_by_student.get(s["id"])
        roster.append({
            "student_id":    s["id"],
            "attended":      bool(a and a.get("attended")),
            "joined_at":     a.get("joined_at") if a else None,
            "left_at":       a.get("left_at") if a else None,
            "duration_mins": a.get("duration_mins") if a else None,
            "students": {
                "id": s["id"], "name": s.get("name"),
                "username": s.get("username"), "avatar_url": s.get("avatar_url"),
            },
        })
    # Attended first, then by name
    roster.sort(key=lambda r: (not r["attended"], (r["students"]["name"] or "").lower()))
    return roster


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


# ══════════════════════════════════════════════════════════════════════════════
# ASSIGNMENTS
# ══════════════════════════════════════════════════════════════════════════════

ALLOWED_ASSIGNMENT_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

def _calc_assignment_points(marks_pct: float) -> int:
    if marks_pct >= 90: return 100
    elif marks_pct >= 75: return 75
    elif marks_pct >= 60: return 50
    elif marks_pct >= 40: return 25
    else: return 10

def _verify_teacher_owns_class(class_id: str, teacher_id: str):
    subj = service_supabase.table("subject_classes").select("standard_id").eq("id", class_id).single().execute()
    if not subj.data:
        raise HTTPException(status_code=404, detail="Class not found")
    std = service_supabase.table("standards").select("teacher_id").eq("id", subj.data["standard_id"]).single().execute()
    if not std.data or std.data["teacher_id"] != teacher_id:
        raise HTTPException(status_code=403, detail="Not authorized")

async def _ensure_assignments_bucket():
    try:
        await asyncio.to_thread(lambda: service_supabase.storage.get_bucket("assignments"))
    except Exception:
        await asyncio.to_thread(lambda: service_supabase.storage.create_bucket(
            "assignments", options={"public": True}
        ))


@app.post("/api/assignments/create")
async def create_assignment(
    class_id: str = Form(...),
    title: str = Form(...),
    description: str = Form(""),
    due_date: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    user = Depends(verify_token)
):
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    teacher_id = user["teacher_id"]
    _verify_teacher_owns_class(class_id, teacher_id)

    row = service_supabase.table("assignments").insert({
        "class_id": class_id,
        "title": title.strip(),
        "description": description.strip(),
        "due_date": due_date or None,
        "created_by": user["user_id"],
    }).execute()
    assignment = row.data[0] if row.data else {}
    assignment_id = assignment["id"]

    attachments = []
    valid_files = [f for f in files if f and f.filename]
    if valid_files:
        await _ensure_assignments_bucket()
        for f in valid_files:
            file_bytes = await f.read()
            if not file_bytes:
                continue
            safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in f.filename)
            storage_path = f"question-files/{assignment_id}/{uuid.uuid4()}_{safe_name}"
            ct = f.content_type or "application/octet-stream"
            await asyncio.to_thread(
                lambda path=storage_path, b=file_bytes, c=ct: service_supabase.storage.from_("assignments").upload(
                    path, b, {"content-type": c}
                )
            )
            public_url = await asyncio.to_thread(
                lambda path=storage_path: service_supabase.storage.from_("assignments").get_public_url(path)
            )
            att_row = service_supabase.table("assignment_attachments").insert({
                "assignment_id": assignment_id,
                "file_url": str(public_url),
                "file_name": f.filename,
                "file_type": f.content_type,
                "storage_path": storage_path,
            }).execute()
            if att_row.data:
                attachments.append(att_row.data[0])

    assignment["assignment_attachments"] = attachments
    return assignment


@app.get("/api/assignments")
async def list_assignments(class_id: str, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    res = service_supabase.table("assignments").select(
        "*, assignment_attachments(*)"
    ).eq("class_id", class_id).order("created_at", desc=True).execute()
    assignments = res.data or []

    # Replace stored public URLs with 1-hour signed URLs so files open
    # regardless of whether the assignments bucket is configured as public.
    for a in assignments:
        for att in (a.get("assignment_attachments") or []):
            sp = att.get("storage_path")
            if not sp:
                continue
            try:
                signed = await asyncio.to_thread(
                    lambda p=sp: service_supabase.storage.from_("assignments").create_signed_url(p, 3600)
                )
                url = (signed or {}).get("signedUrl") or (signed or {}).get("signedURL") or (signed or {}).get("signed_url")
                if url:
                    att["file_url"] = url
            except Exception:
                pass  # fall back to stored URL

    if user["role"] in ("teacher", "sub_teacher"):
        for a in assignments:
            sub_res = service_supabase.table("assignment_submissions").select("id", count="exact").eq("assignment_id", a["id"]).execute()
            a["submitted_count"] = sub_res.count if sub_res.count is not None else len(sub_res.data or [])
    else:
        student_id = user.get("student_id")
        for a in assignments:
            if student_id:
                sub_res = service_supabase.table("assignment_submissions").select(
                    "id, file_url, file_name, marks_obtained, points_earned, submitted_at, graded_at, storage_path"
                ).eq("assignment_id", a["id"]).eq("student_id", student_id).execute()
                if sub_res.data:
                    my_sub = dict(sub_res.data[0])
                    sp = my_sub.pop("storage_path", None)
                    if sp:
                        try:
                            signed = await asyncio.to_thread(
                                lambda p=sp: service_supabase.storage.from_("assignments").create_signed_url(p, 3600)
                            )
                            url = (signed or {}).get("signedUrl") or (signed or {}).get("signedURL") or (signed or {}).get("signed_url")
                            if url:
                                my_sub["file_url"] = url
                        except Exception:
                            pass
                    a["my_submission"] = my_sub
                else:
                    a["my_submission"] = None
            else:
                a["my_submission"] = None

    return {"assignments": assignments}


@app.patch("/api/assignments/{assignment_id}")
async def update_assignment(assignment_id: str, body: AssignmentUpdate, user = Depends(verify_token)):
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    a_res = service_supabase.table("assignments").select("class_id").eq("id", assignment_id).single().execute()
    if not a_res.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    _verify_teacher_owns_class(a_res.data["class_id"], user["teacher_id"])

    updates: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.title is not None: updates["title"] = body.title.strip()
    if body.description is not None: updates["description"] = body.description.strip()
    if body.due_date is not None: updates["due_date"] = body.due_date or None

    row = service_supabase.table("assignments").update(updates).eq("id", assignment_id).execute()
    return row.data[0] if row.data else {}


@app.post("/api/assignments/{assignment_id}/attachments")
async def add_assignment_attachments(
    assignment_id: str,
    files: List[UploadFile] = File(...),
    user = Depends(verify_token)
):
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    a_res = service_supabase.table("assignments").select("class_id").eq("id", assignment_id).single().execute()
    if not a_res.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    _verify_teacher_owns_class(a_res.data["class_id"], user["teacher_id"])

    await _ensure_assignments_bucket()
    attachments = []
    for f in files:
        if not f or not f.filename:
            continue
        file_bytes = await f.read()
        if not file_bytes:
            continue
        safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in f.filename)
        storage_path = f"question-files/{assignment_id}/{uuid.uuid4()}_{safe_name}"
        ct = f.content_type or "application/octet-stream"
        await asyncio.to_thread(
            lambda path=storage_path, b=file_bytes, c=ct: service_supabase.storage.from_("assignments").upload(
                path, b, {"content-type": c}
            )
        )
        public_url = await asyncio.to_thread(
            lambda path=storage_path: service_supabase.storage.from_("assignments").get_public_url(path)
        )
        att_row = service_supabase.table("assignment_attachments").insert({
            "assignment_id": assignment_id,
            "file_url": str(public_url),
            "file_name": f.filename,
            "file_type": f.content_type,
            "storage_path": storage_path,
        }).execute()
        if att_row.data:
            attachments.append(att_row.data[0])
    return {"attachments": attachments}


@app.delete("/api/assignments/{assignment_id}/attachments/{attachment_id}")
async def delete_assignment_attachment(assignment_id: str, attachment_id: str, user = Depends(verify_token)):
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    a_res = service_supabase.table("assignments").select("class_id").eq("id", assignment_id).single().execute()
    if not a_res.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    _verify_teacher_owns_class(a_res.data["class_id"], user["teacher_id"])

    att_res = service_supabase.table("assignment_attachments").select("storage_path").eq("id", attachment_id).single().execute()
    if att_res.data and att_res.data.get("storage_path"):
        try:
            path = att_res.data["storage_path"]
            await asyncio.to_thread(
                lambda: service_supabase.storage.from_("assignments").remove([path])
            )
        except Exception:
            pass
    service_supabase.table("assignment_attachments").delete().eq("id", attachment_id).execute()
    return {"ok": True}


@app.delete("/api/assignments/{assignment_id}")
async def delete_assignment(assignment_id: str, user = Depends(verify_token)):
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    a_res = service_supabase.table("assignments").select("class_id").eq("id", assignment_id).single().execute()
    if not a_res.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    _verify_teacher_owns_class(a_res.data["class_id"], user["teacher_id"])

    att_res = service_supabase.table("assignment_attachments").select("storage_path").eq("assignment_id", assignment_id).execute()
    sub_res = service_supabase.table("assignment_submissions").select("storage_path, student_id, points_earned").eq("assignment_id", assignment_id).execute()

    for sub in (sub_res.data or []):
        pts = sub.get("points_earned") or 0
        if pts > 0:
            try:
                stu = service_supabase.table("students").select("points").eq("id", sub["student_id"]).single().execute()
                if stu.data:
                    new_pts = max(0, (stu.data.get("points") or 0) - pts)
                    service_supabase.table("students").update({"points": new_pts}).eq("id", sub["student_id"]).execute()
            except Exception:
                pass

    paths = [r["storage_path"] for r in (att_res.data or []) if r.get("storage_path")]
    paths += [r["storage_path"] for r in (sub_res.data or []) if r.get("storage_path")]
    if paths:
        try:
            await asyncio.to_thread(
                lambda: service_supabase.storage.from_("assignments").remove(paths)
            )
        except Exception:
            pass

    service_supabase.table("assignments").delete().eq("id", assignment_id).execute()
    return {"ok": True}


@app.post("/api/assignments/{assignment_id}/submit")
async def submit_assignment(
    assignment_id: str,
    file: UploadFile = File(...),
    user = Depends(verify_token)
):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    student_id = user.get("student_id")
    if not student_id:
        raise HTTPException(status_code=403, detail="Student account required")

    if file.content_type not in ALLOWED_ASSIGNMENT_TYPES:
        raise HTTPException(status_code=422, detail="File type not allowed. Upload an image, PDF, or Word document.")

    existing = service_supabase.table("assignment_submissions").select("id").eq("assignment_id", assignment_id).eq("student_id", student_id).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="You have already submitted this assignment.")

    a_res = service_supabase.table("assignments").select("id").eq("id", assignment_id).single().execute()
    if not a_res.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=422, detail="File is empty")

    safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in file.filename)
    storage_path = f"submissions/{assignment_id}/{student_id}_{uuid.uuid4()}_{safe_name}"

    await _ensure_assignments_bucket()
    ct = file.content_type or "application/octet-stream"
    await asyncio.to_thread(
        lambda: service_supabase.storage.from_("assignments").upload(
            storage_path, file_bytes, {"content-type": ct}
        )
    )
    public_url = await asyncio.to_thread(
        lambda: service_supabase.storage.from_("assignments").get_public_url(storage_path)
    )

    row = service_supabase.table("assignment_submissions").insert({
        "assignment_id": assignment_id,
        "student_id": student_id,
        "file_url": str(public_url),
        "file_name": file.filename,
        "file_type": file.content_type,
        "storage_path": storage_path,
    }).execute()
    return row.data[0] if row.data else {}


@app.get("/api/assignments/{assignment_id}/submissions")
async def get_assignment_submissions(assignment_id: str, user = Depends(verify_token)):
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    a_res = service_supabase.table("assignments").select("class_id, title").eq("id", assignment_id).single().execute()
    if not a_res.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    _verify_teacher_owns_class(a_res.data["class_id"], user["teacher_id"])

    subs = service_supabase.table("assignment_submissions").select(
        "*, students(id, name, username, avatar_url)"
    ).eq("assignment_id", assignment_id).order("submitted_at").execute()

    # Generate signed URLs so the teacher can open student submission files
    for sub in (subs.data or []):
        sp = sub.get("storage_path")
        if sp:
            try:
                signed = await asyncio.to_thread(
                    lambda p=sp: service_supabase.storage.from_("assignments").create_signed_url(p, 3600)
                )
                url = (signed or {}).get("signedUrl") or (signed or {}).get("signedURL") or (signed or {}).get("signed_url")
                if url:
                    sub["file_url"] = url
            except Exception:
                pass

    return {"submissions": subs.data or [], "assignment": a_res.data}


@app.post("/api/assignments/{assignment_id}/submissions/{submission_id}/grade")
async def grade_assignment_submission(
    assignment_id: str,
    submission_id: str,
    body: GradeSubmissionRequest,
    user = Depends(verify_token)
):
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    if body.marks_obtained < 0 or body.marks_obtained > 100:
        raise HTTPException(status_code=422, detail="Marks must be between 0 and 100")

    sub_res = service_supabase.table("assignment_submissions").select(
        "student_id, prev_points_earned"
    ).eq("id", submission_id).eq("assignment_id", assignment_id).single().execute()
    if not sub_res.data:
        raise HTTPException(status_code=404, detail="Submission not found")
    sub = sub_res.data
    student_id = sub["student_id"]

    a_res = service_supabase.table("assignments").select("class_id").eq("id", assignment_id).single().execute()
    if not a_res.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    _verify_teacher_owns_class(a_res.data["class_id"], user["teacher_id"])

    new_pts = _calc_assignment_points(body.marks_obtained)
    prev_pts = sub.get("prev_points_earned") or 0

    stu_res = service_supabase.table("students").select("points").eq("id", student_id).single().execute()
    if stu_res.data:
        current_pts = stu_res.data.get("points") or 0
        updated_pts = max(0, current_pts - prev_pts + new_pts)
        service_supabase.table("students").update({"points": updated_pts}).eq("id", student_id).execute()

    updated = service_supabase.table("assignment_submissions").update({
        "marks_obtained": body.marks_obtained,
        "points_earned": new_pts,
        "prev_points_earned": new_pts,
        "graded_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", submission_id).execute()

    return updated.data[0] if updated.data else {}


@app.delete("/api/assignments/{assignment_id}/submissions/{submission_id}")
async def teacher_delete_submission(
    assignment_id: str,
    submission_id: str,
    user = Depends(verify_token)
):
    """Teacher removes a student submission (reverts points if graded)."""
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    a_res = service_supabase.table("assignments").select("class_id").eq("id", assignment_id).single().execute()
    if not a_res.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    _verify_teacher_owns_class(a_res.data["class_id"], user["teacher_id"])

    sub_res = service_supabase.table("assignment_submissions").select(
        "storage_path, student_id, points_earned"
    ).eq("id", submission_id).eq("assignment_id", assignment_id).single().execute()
    if not sub_res.data:
        raise HTTPException(status_code=404, detail="Submission not found")

    sub = sub_res.data

    # Revert student points if the submission was graded
    pts = sub.get("points_earned") or 0
    if pts > 0:
        try:
            stu = service_supabase.table("students").select("points").eq("id", sub["student_id"]).single().execute()
            if stu.data:
                new_pts = max(0, (stu.data.get("points") or 0) - pts)
                service_supabase.table("students").update({"points": new_pts}).eq("id", sub["student_id"]).execute()
        except Exception:
            pass

    sp = sub.get("storage_path")
    if sp:
        try:
            await asyncio.to_thread(lambda: service_supabase.storage.from_("assignments").remove([sp]))
        except Exception:
            pass

    service_supabase.table("assignment_submissions").delete().eq("id", submission_id).execute()
    return {"ok": True}


@app.delete("/api/assignments/{assignment_id}/my-submission")
async def student_delete_own_submission(
    assignment_id: str,
    user = Depends(verify_token)
):
    """Student retracts their own submission — only allowed when not yet graded."""
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    student_id = user.get("student_id")
    if not student_id:
        raise HTTPException(status_code=403, detail="Student account required")

    sub_res = service_supabase.table("assignment_submissions").select(
        "id, storage_path, marks_obtained"
    ).eq("assignment_id", assignment_id).eq("student_id", student_id).single().execute()
    if not sub_res.data:
        raise HTTPException(status_code=404, detail="No submission found")

    sub = sub_res.data
    if sub.get("marks_obtained") is not None:
        raise HTTPException(status_code=403, detail="Graded submissions cannot be retracted. Contact your teacher.")

    sp = sub.get("storage_path")
    if sp:
        try:
            await asyncio.to_thread(lambda: service_supabase.storage.from_("assignments").remove([sp]))
        except Exception:
            pass

    service_supabase.table("assignment_submissions").delete().eq("id", sub["id"]).execute()
    return {"ok": True}


@app.get("/api/student/assignments")
async def get_all_student_assignments(user = Depends(verify_token)):
    """All assignments across all of the student's subjects, with my_submission and signed URLs."""
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    student_id = user.get("student_id")
    std_id     = user.get("standard_id")
    if not student_id or not std_id:
        return {"assignments": []}

    # All subjects in the student's standard
    subs_res = service_supabase.table("subject_classes").select("id, name, emoji").eq("standard_id", std_id).execute()
    subjects  = subs_res.data or []
    if not subjects:
        return {"assignments": []}

    class_ids = [s["id"] for s in subjects]
    sub_map   = {s["id"]: s for s in subjects}

    # All assignments for those subjects (with teacher attachments)
    res = service_supabase.table("assignments").select(
        "*, assignment_attachments(*)"
    ).in_("class_id", class_ids).order("created_at", desc=True).execute()
    assignments = res.data or []
    if not assignments:
        return {"assignments": []}

    # Signed URLs for teacher-uploaded question files
    for a in assignments:
        for att in (a.get("assignment_attachments") or []):
            sp = att.get("storage_path")
            if not sp:
                continue
            try:
                signed = await asyncio.to_thread(
                    lambda p=sp: service_supabase.storage.from_("assignments").create_signed_url(p, 3600)
                )
                url = (signed or {}).get("signedUrl") or (signed or {}).get("signedURL")
                if url:
                    att["file_url"] = url
            except Exception:
                pass

    # Student's submissions for all these assignments
    assign_ids = [a["id"] for a in assignments]
    subs2_res  = service_supabase.table("assignment_submissions").select(
        "assignment_id, id, file_url, file_name, marks_obtained, points_earned, submitted_at, graded_at, storage_path"
    ).eq("student_id", student_id).in_("assignment_id", assign_ids).execute()

    sub_by_assign: dict = {}
    for s in (subs2_res.data or []):
        sp2 = s.pop("storage_path", None)
        if sp2:
            try:
                signed2 = await asyncio.to_thread(
                    lambda p=sp2: service_supabase.storage.from_("assignments").create_signed_url(p, 3600)
                )
                url2 = (signed2 or {}).get("signedUrl") or (signed2 or {}).get("signedURL")
                if url2:
                    s["file_url"] = url2
            except Exception:
                pass
        sub_by_assign[s["assignment_id"]] = s

    # Attach subject info and submission data to each assignment
    for a in assignments:
        cls_info = sub_map.get(a["class_id"], {})
        a["subject_name"]  = cls_info.get("name", "")
        a["subject_emoji"] = cls_info.get("emoji", "book")
        a["my_submission"] = sub_by_assign.get(a["id"])

    return {"assignments": assignments}

# ─── TEACHER SETTINGS (AI API KEYS) ────────────────────────────────────────

SETTINGS_FILE = Path(__file__).resolve().parent / "teacher_settings.json"

def get_teacher_settings():
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}

def save_teacher_settings(data: dict):
    SETTINGS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")

class TeacherSettingsInput(BaseModel):
    ai_provider: Optional[str] = None
    ai_api_key: Optional[str] = None
    # Branding
    lms_name: Optional[str] = None
    lms_logo: Optional[str] = None  # base64 data URL or "" to clear
    # Student defaults
    default_student_password: Optional[str] = None
    # Security
    termination_pin: Optional[str] = None
    security_single_device: Optional[bool] = None
    security_auto_logout: Optional[bool] = None
    # Notifications
    notif_test_submission: Optional[bool] = None
    notif_new_student: Optional[bool] = None
    notif_broadcast_reply: Optional[bool] = None
    notif_weekly_report: Optional[bool] = None
    # Student portal
    students_can_view_report: Optional[bool] = None

@app.get("/api/teacher/settings")
def get_settings(user: dict = Depends(get_current_user)):
    if user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Not authorized")
    return get_teacher_settings()

@app.post("/api/teacher/settings")
def update_settings(data: TeacherSettingsInput, user: dict = Depends(get_current_user)):
    if user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Not authorized")
    settings = get_teacher_settings()
    # Persist only the fields the client actually sent. exclude_unset lets the
    # caller clear a value by sending "" (omitted fields are left untouched).
    for key, value in data.model_dump(exclude_unset=True).items():
        settings[key] = value
    save_teacher_settings(settings)
    return {"success": True}

@app.get("/api/branding")
def get_branding():
    """Public — login page reads this so the logo/name show on any device,
    before the user has authenticated."""
    settings = get_teacher_settings()
    return {
        "lms_name": settings.get("lms_name") or "",
        "lms_logo": settings.get("lms_logo") or "",
    }

# ─── AI INSIGHTS GENERATION ──────────────────────────────────────────────

class InsightsRequest(BaseModel):
    student_id: str
    stats: dict  # Passed from the frontend (attendance, test avg, etc.)

# Gemini generation tuning. thinkingBudget=0 disables gemini-2.5-flash's
# default "thinking" pass — the single biggest latency win for short coaching
# replies. maxOutputTokens caps a 150-300 word answer so generation can't run long.
GEMINI_GEN_CONFIG = {
    "temperature": 0.7,
    "maxOutputTokens": 512,
    "thinkingConfig": {"thinkingBudget": 0},
}


def build_insights_prompt(stats: dict, viewer_role: str) -> str:
    """Build the LLM prompt from the (enriched) stats payload sent by the frontend."""
    if viewer_role == "teacher":
        role_context = (
            "Write as if reporting to the teacher about the student. Use third-person "
            '("Aisha is improving in Physics"), never address the student directly.'
        )
        greeting_rule = "Open with a one-line objective summary of the student's progress."
    else:
        role_context = "Write as if you are talking directly to the student."
        greeting_rule = "Open with a warm greeting using the student's name."

    return f"""You are an expert learning mentor and student-success coach. Diagnose the student's learning behaviour and give specific, encouraging, actionable guidance — do NOT just restate statistics.

{role_context}

RULES:
* {greeting_rule}
* Praise real strengths before naming weaknesses.
* Explain the likely root cause behind any weak area, then give concrete actions the student can do THIS week.
* Be specific: name the actual subjects, topics, videos and tests from the data. No generic "study harder".
* Reference the recent test trend and weak topics directly.
* End with one short line of encouragement. Never say you are an AI.

SECTIONS (use these exact markdown headings):
Focus of the Week
What's Going Well
What I Noticed
Recommended Actions
Next Level Goal
AI Mentor Message

STUDENT DATA:
Name: {stats.get("student_name", "Student")}
Standard: {stats.get("standard_name", "N/A")}
Attendance: {stats.get("attendance_data", "N/A")}
Video Progress: {stats.get("video_progress_data", "N/A")}
Assignment Performance: {stats.get("assignment_data", "N/A")}
Test Performance: {stats.get("test_data", "N/A")}
Per-subject breakdown: {stats.get("subject_breakdown", "N/A")}
Recent test trend: {stats.get("recent_tests", "N/A")}
Weak topics (topic — score — video watched?): {stats.get("weak_topics_detail", stats.get("topic_data", "N/A"))}

OUTPUT REQUIREMENTS:
* Markdown, 150-300 words total.
* Lead with actionable next steps, not a recap of the past.
* Only cite a percentage when it makes a point clearer.
"""


@app.post("/api/insights/generate")
async def generate_ai_insights(req: InsightsRequest, user: dict = Depends(get_current_user)):
    # Read API key
    settings = get_teacher_settings()
    provider = settings.get("ai_provider", "gemini")
    api_key = settings.get("ai_api_key")

    if not api_key:
        raise HTTPException(status_code=400, detail="AI API key not configured in settings.")

    prompt = build_insights_prompt(req.stats, user.get("role", "student"))

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            if provider == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": GEMINI_GEN_CONFIG,
                }
                resp = await client.post(url, json=payload)
                if resp.status_code == 404:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={api_key}"
                    resp = await client.post(url, json=payload)
                if not resp.is_success:
                    raise Exception(f"Gemini API error: {resp.text}")
                data = resp.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
            elif provider == "openai":
                url = "https://api.openai.com/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}"}
                payload = {
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}]
                }
                resp = await client.post(url, headers=headers, json=payload)
                if not resp.is_success:
                    raise Exception(f"OpenAI API error: {resp.text}")
                data = resp.json()
                text = data["choices"][0]["message"]["content"]
            else:
                raise Exception("Unknown provider")

            # For the new conversational prompt, we just return the raw text
            text = text.strip()
            return {"insights": text}
    except Exception as e:
        print(f"[!] AI Generation Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/insights/generate/stream")
async def generate_ai_insights_stream(req: InsightsRequest, user: dict = Depends(get_current_user)):
    """Stream coaching insights token-by-token via Server-Sent Events.

    Emits `data: {"text": "<delta>"}` events as the model generates, and a final
    `data: {"error": "..."}` event if the upstream call fails mid-stream.
    """
    settings = get_teacher_settings()
    provider = settings.get("ai_provider", "gemini")
    api_key = settings.get("ai_api_key")

    if not api_key:
        raise HTTPException(status_code=400, detail="AI API key not configured in settings.")

    prompt = build_insights_prompt(req.stats, user.get("role", "student"))

    def sse(obj: dict) -> str:
        return f"data: {json.dumps(obj)}\n\n"

    async def gemini_stream():
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": GEMINI_GEN_CONFIG,
        }
        models = ["gemini-2.5-flash", "gemini-flash-latest"]
        async with httpx.AsyncClient(timeout=60) as client:
            for idx, model in enumerate(models):
                url = (
                    f"https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{model}:streamGenerateContent?alt=sse&key={api_key}"
                )
                try:
                    async with client.stream("POST", url, json=payload) as resp:
                        # 404 on the first model → retry with the fallback model name
                        if resp.status_code == 404 and idx == 0:
                            continue
                        if resp.status_code >= 400:
                            body = (await resp.aread()).decode("utf-8", "ignore")
                            yield sse({"error": f"Gemini API error: {body[:400]}"})
                            return
                        async for line in resp.aiter_lines():
                            if not line or not line.startswith("data:"):
                                continue
                            chunk = line[5:].strip()
                            if not chunk or chunk == "[DONE]":
                                continue
                            try:
                                obj = json.loads(chunk)
                                parts = obj["candidates"][0]["content"]["parts"]
                                delta = "".join(p.get("text", "") for p in parts)
                                if delta:
                                    yield sse({"text": delta})
                            except (KeyError, IndexError, json.JSONDecodeError):
                                continue
                        yield sse({"done": True})
                        return
                except httpx.HTTPError as e:
                    yield sse({"error": f"Connection error: {e}"})
                    return

    async def openai_stream():
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}"}
        payload = {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}],
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            try:
                async with client.stream("POST", url, headers=headers, json=payload) as resp:
                    if resp.status_code >= 400:
                        body = (await resp.aread()).decode("utf-8", "ignore")
                        yield sse({"error": f"OpenAI API error: {body[:400]}"})
                        return
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        chunk = line[5:].strip()
                        if not chunk or chunk == "[DONE]":
                            continue
                        try:
                            obj = json.loads(chunk)
                            delta = obj["choices"][0]["delta"].get("content")
                            if delta:
                                yield sse({"text": delta})
                        except (KeyError, IndexError, json.JSONDecodeError):
                            continue
                    yield sse({"done": True})
            except httpx.HTTPError as e:
                yield sse({"error": f"Connection error: {e}"})

    async def event_generator():
        try:
            gen = openai_stream() if provider == "openai" else gemini_stream()
            async for evt in gen:
                yield evt
        except Exception as e:  # noqa: BLE001 — surface to client instead of hanging
            print(f"[!] AI Stream Error: {e}")
            yield sse({"error": str(e)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ════════════════════════════════════════════════════════════════════════════
# ─── WHATSAPP MESSAGE CONTROLLER ────────────────────────────────────────────
# Parent messaging: config, recipients (by class), manual send (template/free-
# form + media), cost estimate, report cards + criteria-based sends, templates,
# history, and scheduled/automatic jobs. Provider logic + report rendering live
# in whatsapp.py (imported as `wa`); routes stay here per convention. The
# provider degrades gracefully (UnconfiguredProvider) when no API key is set.
# ════════════════════════════════════════════════════════════════════════════

class WhatsAppConfigInput(BaseModel):
    provider: Optional[str] = None
    api_key: Optional[str] = None          # secret — only overwritten when sent non-empty
    sender: Optional[str] = None
    currency: Optional[str] = None
    rates: Optional[dict] = None
    auto_welcome: Optional[bool] = None
    welcome_template: Optional[str] = None
    quiet_hours: Optional[dict] = None

class WhatsAppEstimateInput(BaseModel):
    standard_ids: Optional[List[str]] = None
    included_student_ids: Optional[List[str]] = None
    category: str = "utility"

class WhatsAppSendInput(BaseModel):
    standard_ids: Optional[List[str]] = None
    included_student_ids: Optional[List[str]] = None
    mode: str = "template"                  # template|freeform
    template_name: Optional[str] = None
    language: str = "en"
    variables: Optional[list] = None
    body_text: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    category: str = "utility"
    test_to_self: Optional[str] = None      # if set, send a single message to this phone only

class WhatsAppTemplateInput(BaseModel):
    name: str
    category: str = "utility"
    language: str = "en"
    header_type: str = "none"
    body_text: str
    variables: Optional[list] = None
    submit: bool = False                    # also push to provider for approval

class WhatsAppReportSendInput(BaseModel):
    standard_ids: Optional[List[str]] = None
    included_student_ids: Optional[List[str]] = None
    test_id: Optional[str] = None
    period: str = "overall"
    report_format: str = "pdf"              # pdf|image|text
    category: str = "utility"
    mode: str = "freeform"                  # template|freeform for the message part
    template_name: Optional[str] = None
    default_message: Optional[str] = None
    criteria: Optional[List[dict]] = None   # [{min,max,message,template_name,attach_report}]

class WhatsAppWelcomeInput(BaseModel):
    student_ids: Optional[List[str]] = None
    standard_ids: Optional[List[str]] = None
    template_name: Optional[str] = None
    message: Optional[str] = None
    category: str = "utility"
    include_credentials: bool = True        # include Student ID + password + login URL

class WhatsAppJobInput(BaseModel):
    name: str
    target_type: str = "all"               # class|classes|all
    target_ids: Optional[list] = None
    trigger_type: str = "interval"         # interval|post_exam|fixed_date
    trigger_config: Optional[dict] = None  # {every:"1 week"} / {days:N} / {test_id} / {at}
    mode: str = "template"                 # template|freeform|report
    template_name: Optional[str] = None
    body_text: Optional[str] = None
    category: str = "utility"
    report_format: str = "none"
    criteria: Optional[list] = None
    quiet_hours: Optional[dict] = None
    active: bool = True


def _wa_require_teacher(user):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")


def _wa_branding_name() -> str:
    try:
        return (get_teacher_settings().get("lms_name") or "").strip()
    except Exception:
        return ""


def _wa_login_url() -> str:
    try:
        return (get_teacher_settings().get("login_url") or "").strip()
    except Exception:
        return ""


def _wa_fetch_credentials(student_ids: List[str]) -> dict:
    """Map student_id → {student_code, plain_password, must_change_pwd}. Sensitive —
    only used by the credentials/welcome send path. Graceful-degrades."""
    if not student_ids:
        return {}
    try:
        rows = service_supabase.table("students").select(
            "id, student_code, plain_password, must_change_pwd").in_(
            "id", student_ids).execute().data or []
    except Exception:
        rows = []
    return {r["id"]: r for r in rows}


def _wa_credentials_body(name: str, student_code: str, password: str, lms: str) -> str:
    """Friendly login-details message. `password` may be '' → a safe fallback line."""
    inst = lms or "our institution"
    lines = [f"Welcome to {inst}! Login details for {name or 'your child'}:"]
    if student_code:
        lines.append(f"Student ID: {student_code}")
    if password:
        lines.append(f"Password: {password}")
    else:
        lines.append("Password: please use ‘Forgot password’ on the login page or contact the teacher.")
    url = _wa_login_url()
    if url:
        lines.append(f"Login here: {url}")
    return "\n".join(lines)


def _wa_fetch_students(standard_ids: List[str]) -> list:
    """Fetch students for the given standards, tolerating a DB without the
    whatsapp_opt_out column yet (graceful-degrade)."""
    if not standard_ids:
        return []
    try:
        rows = service_supabase.table("students").select(
            "id, name, phone, student_code, standard_id, whatsapp_opt_out"
        ).in_("standard_id", standard_ids).execute().data or []
    except Exception:
        rows = service_supabase.table("students").select(
            "id, name, phone, student_code, standard_id"
        ).in_("standard_id", standard_ids).execute().data or []
        for r in rows:
            r["whatsapp_opt_out"] = False
    return rows


def _wa_resolve_recipients(teacher_id, standard_ids=None, included_student_ids=None,
                           include_opted_out=False):
    """Resolve the parent-message recipient list for a teacher, scoped to their
    standards. Returns a flat list of dicts; opted-out parents excluded by default."""
    stds = service_supabase.table("standards").select("id, name").eq(
        "teacher_id", teacher_id).execute().data or []
    std_name = {s["id"]: s["name"] for s in stds}
    target = [sid for sid in (standard_ids or list(std_name.keys())) if sid in std_name]
    if not target:
        return []
    inc = set(included_student_ids) if included_student_ids else None
    out = []
    for r in _wa_fetch_students(target):
        if inc is not None and r["id"] not in inc:
            continue
        if not include_opted_out and r.get("whatsapp_opt_out"):
            continue
        out.append({
            "id": r["id"],
            "name": r.get("name") or "",
            "phone": r.get("phone") or "",
            "student_code": r.get("student_code") or "",
            "standard_id": r.get("standard_id"),
            "standard_name": std_name.get(r.get("standard_id"), ""),
            "opted_out": bool(r.get("whatsapp_opt_out")),
            "session_open": False,   # conservative: free-form only when known-open
        })
    return out


async def _wa_ensure_bucket():
    try:
        await asyncio.to_thread(lambda: service_supabase.storage.get_bucket("whatsapp"))
    except Exception:
        await asyncio.to_thread(lambda: service_supabase.storage.create_bucket(
            "whatsapp", options={"public": True}))


async def _wa_upload_bytes(data: bytes, ext: str, content_type: str) -> str:
    await _wa_ensure_bucket()
    fname = f"{uuid.uuid4()}{ext}"
    await asyncio.to_thread(lambda: service_supabase.storage.from_("whatsapp").upload(
        fname, data, {"content-type": content_type}))
    return await asyncio.to_thread(lambda: service_supabase.storage.from_("whatsapp").get_public_url(fname))


async def _wa_send_and_log(provider, teacher_id, recipient, *, mode, template_name=None,
                           variables=None, body_text=None, media_url=None, media_type=None,
                           category="utility", language="en", standard_id=None, job_id=None):
    """Send one message and write a whatsapp_messages row. Returns a per-recipient
    result dict. Never raises — provider/network errors become a 'failed' status."""
    to = (recipient.get("phone") or "").strip()
    if not to:
        return {"student_id": recipient.get("id"), "name": recipient.get("name"),
                "status": "failed", "error": "No phone number", "cost": 0}
    try:
        if mode == "template":
            res = await provider.send_template(to, template_name, variables, media_url, media_type, language)
        else:
            res = await provider.send_freeform(to, body_text or "", media_url, media_type)
    except Exception as e:
        res = {"status": "failed", "provider_message_id": None, "error": str(e)}

    status = res.get("status", "failed")
    billable = status not in ("failed", "not_configured")
    est = wa.estimate_cost(1, category)
    cost = est["amount"] if billable else 0
    row = {
        "teacher_id": teacher_id,
        "standard_id": standard_id or recipient.get("standard_id"),
        "student_id": recipient.get("id"),
        "to_phone": to,
        "template_name": template_name if mode == "template" else None,
        "body_text": body_text,
        "media_url": media_url,
        "media_type": media_type,
        "category": category,
        "status": status,
        "provider_message_id": res.get("provider_message_id"),
        "cost_amount": cost,
        "currency": est["currency"],
        "error": res.get("error"),
        "job_id": job_id,
        "sent_at": datetime.now(timezone.utc).isoformat() if billable else None,
    }
    try:
        service_supabase.table("whatsapp_messages").insert(row).execute()
    except Exception as e:
        print(f"[wa] message log insert failed: {e}")
    return {"student_id": recipient.get("id"), "name": recipient.get("name"),
            "status": status, "error": res.get("error"), "cost": cost}


def _wa_student_score(report: dict, test_id: Optional[str] = None):
    """Pick the score used for criteria banding: the test's score if test_id is
    given, else the student's overall average."""
    if test_id:
        for t in report.get("test_timeline") or []:
            if t.get("test_id") == test_id:
                return t.get("score_pct")
        return None
    s = (report.get("student") or {}).get("avg_score")
    try:
        return float(s) if s is not None else None
    except (TypeError, ValueError):
        return None


# ── Config ───────────────────────────────────────────────────────────────────
@app.get("/api/teacher/whatsapp/config")
def wa_get_config(user = Depends(verify_token)):
    _wa_require_teacher(user)
    cfg = wa.get_wa_config()
    return {
        "configured": bool((cfg.get("api_key") or "").strip()),
        "provider": cfg.get("provider", "wanotifier"),
        "sender": cfg.get("sender", ""),
        "api_key_masked": wa.mask_key(cfg.get("api_key")),
        "rates": wa.get_rates(cfg),
        "currency": cfg.get("currency", wa.DEFAULT_CURRENCY),
        "auto_welcome": bool(cfg.get("auto_welcome")),
        "welcome_template": cfg.get("welcome_template", ""),
        "quiet_hours": cfg.get("quiet_hours") or {},
    }


@app.post("/api/teacher/whatsapp/config")
def wa_set_config(data: WhatsAppConfigInput, user = Depends(verify_token)):
    _wa_require_teacher(user)
    cfg = wa.get_wa_config()
    patch = data.model_dump(exclude_unset=True)
    # Never wipe the stored key with a blank/masked value.
    if "api_key" in patch:
        new_key = (patch.pop("api_key") or "").strip()
        if new_key and not new_key.startswith("••••"):
            cfg["api_key"] = new_key
    for k, v in patch.items():
        cfg[k] = v
    wa.save_wa_config(cfg)
    return {"success": True, "configured": bool((cfg.get("api_key") or "").strip())}


# ── Recipients (grouped by class) ─────────────────────────────────────────────
@app.get("/api/teacher/whatsapp/recipients")
def wa_recipients(standard_ids: Optional[str] = None, user = Depends(verify_token)):
    _wa_require_teacher(user)
    sid_list = [s for s in (standard_ids.split(",") if standard_ids else []) if s]
    recips = _wa_resolve_recipients(user["teacher_id"], sid_list or None, include_opted_out=True)
    groups: Dict[str, dict] = {}
    for r in recips:
        g = groups.setdefault(r["standard_id"], {
            "standard_id": r["standard_id"], "standard_name": r["standard_name"], "students": []})
        g["students"].append(r)
    return {
        "groups": list(groups.values()),
        "total": len([r for r in recips if not r["opted_out"]]),
        "with_phone": len([r for r in recips if r["phone"] and not r["opted_out"]]),
    }


# ── Media upload ──────────────────────────────────────────────────────────────
@app.post("/api/teacher/whatsapp/upload-media")
async def wa_upload_media(file: UploadFile = File(...), user = Depends(verify_token)):
    _wa_require_teacher(user)
    data = await file.read()
    ext = os.path.splitext(file.filename or "")[1] or ""
    ctype = file.content_type or "application/octet-stream"
    try:
        url = await _wa_upload_bytes(data, ext, ctype)
        return {"url": url, "type": ctype, "filename": file.filename}
    except Exception as e:
        print(f"[wa] media upload error: {e}")
        b64 = base64.b64encode(data).decode("utf-8")
        return {"url": f"data:{ctype};base64,{b64}", "type": ctype, "filename": file.filename}


# ── Cost estimate ─────────────────────────────────────────────────────────────
@app.post("/api/teacher/whatsapp/estimate")
def wa_estimate(data: WhatsAppEstimateInput, user = Depends(verify_token)):
    _wa_require_teacher(user)
    recips = _wa_resolve_recipients(user["teacher_id"], data.standard_ids, data.included_student_ids)
    count = len([r for r in recips if r["phone"]])
    return wa.estimate_cost(count, data.category)


# ── Send (manual) ─────────────────────────────────────────────────────────────
@app.post("/api/teacher/whatsapp/send")
async def wa_send(data: WhatsAppSendInput, user = Depends(verify_token)):
    _wa_require_teacher(user)
    provider = wa.get_provider()
    teacher_id = user["teacher_id"]

    # Test-to-self: single message to a teacher-supplied number.
    if data.test_to_self:
        recip = {"id": None, "name": "Test", "phone": data.test_to_self, "standard_id": None}
        r = await _wa_send_and_log(provider, teacher_id, recip, mode=data.mode,
                                   template_name=data.template_name, variables=data.variables,
                                   body_text=data.body_text, media_url=data.media_url,
                                   media_type=data.media_type, category=data.category,
                                   language=data.language)
        return {"results": [r], "sent": 1 if r["status"] not in ("failed", "not_configured") else 0,
                "total_cost": r["cost"], "configured": provider.configured}

    recips = [r for r in _wa_resolve_recipients(teacher_id, data.standard_ids,
                                                data.included_student_ids) if r["phone"]]
    if not recips:
        raise HTTPException(status_code=400, detail="No recipients with a phone number")

    # Free-form is only allowed when EVERY recipient has an open 24h session.
    if data.mode == "freeform" and not all(r["session_open"] for r in recips):
        raise HTTPException(status_code=400,
                            detail="Free-form messages require an open 24h session for every recipient. Use a template instead.")
    if data.mode == "template" and not data.template_name:
        raise HTTPException(status_code=400, detail="A template is required for template mode")

    results = []
    for r in recips:
        results.append(await _wa_send_and_log(
            provider, teacher_id, r, mode=data.mode, template_name=data.template_name,
            variables=data.variables, body_text=data.body_text, media_url=data.media_url,
            media_type=data.media_type, category=data.category, language=data.language))
    sent = sum(1 for x in results if x["status"] not in ("failed", "not_configured"))
    return {"results": results, "sent": sent, "total_cost": round(sum(x["cost"] for x in results), 2),
            "configured": provider.configured}


# ── History + spend total ─────────────────────────────────────────────────────
def _wa_enrich_messages(rows):
    """Add `student_name` + `standard_name` to message rows (for the History /
    Recent tables). Best-effort: a failed lookup just leaves the field None."""
    if not rows:
        return rows
    sid_ids = list({r["student_id"] for r in rows if r.get("student_id")})
    std_ids = list({r["standard_id"] for r in rows if r.get("standard_id")})
    names, stds = {}, {}
    if sid_ids:
        try:
            for s in (service_supabase.table("students").select("id, name").in_(
                    "id", sid_ids).execute().data or []):
                names[s["id"]] = s.get("name")
        except Exception:
            pass
    if std_ids:
        try:
            for s in (service_supabase.table("standards").select("id, name").in_(
                    "id", std_ids).execute().data or []):
                stds[s["id"]] = s.get("name")
        except Exception:
            pass
    for r in rows:
        r["student_name"] = names.get(r.get("student_id"))
        r["standard_name"] = stds.get(r.get("standard_id"))
    return rows


@app.get("/api/teacher/whatsapp/messages")
def wa_messages(limit: int = 100, status: Optional[str] = None, user = Depends(verify_token)):
    _wa_require_teacher(user)
    try:
        q = service_supabase.table("whatsapp_messages").select("*").eq(
            "teacher_id", user["teacher_id"]).order("created_at", desc=True).limit(limit)
        if status:
            q = q.eq("status", status)
        rows = q.execute().data or []
        _wa_enrich_messages(rows)
        spend = service_supabase.table("whatsapp_messages").select("cost_amount").eq(
            "teacher_id", user["teacher_id"]).execute().data or []
        total = round(sum(float(r.get("cost_amount") or 0) for r in spend), 2)
    except Exception:
        return {"messages": [], "spend_total": 0, "count": 0}
    return {"messages": rows, "spend_total": total, "count": len(rows)}


# ── Dashboard stats (KPIs + donut + month spend + recent + scheduled) ──────────
@app.get("/api/teacher/whatsapp/stats")
def wa_stats(user = Depends(verify_token)):
    _wa_require_teacher(user)
    tid = user["teacher_id"]
    currency = wa.get_wa_config().get("currency", wa.DEFAULT_CURRENCY)

    counts = {"queued": 0, "sent": 0, "delivered": 0, "read": 0, "failed": 0}
    total_spend = month_spend = 0.0
    now = datetime.now(timezone.utc)
    try:
        agg = service_supabase.table("whatsapp_messages").select(
            "status, cost_amount, created_at").eq("teacher_id", tid).execute().data or []
    except Exception:
        agg = []
    for r in agg:
        st = r.get("status") or "queued"
        if st == "not_configured":
            st = "queued"
        counts[st] = counts.get(st, 0) + 1
        c = float(r.get("cost_amount") or 0)
        total_spend += c
        ts = r.get("created_at")
        if ts:
            try:
                d = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                if (d.year, d.month) == (now.year, now.month):
                    month_spend += c
            except Exception:
                pass

    total = sum(counts.values())
    # Recent (enriched) for the dashboard table.
    try:
        recent = service_supabase.table("whatsapp_messages").select(
            "id, to_phone, student_id, standard_id, template_name, body_text, "
            "media_type, category, status, cost_amount, created_at"
        ).eq("teacher_id", tid).order("created_at", desc=True).limit(10).execute().data or []
        _wa_enrich_messages(recent)
    except Exception:
        recent = []
    # Scheduled jobs summary.
    try:
        jobs = service_supabase.table("whatsapp_scheduled_jobs").select(
            "id, name, active, next_run_at, target_type, target_ids, trigger_type, trigger_config, mode"
        ).eq("teacher_id", tid).order("next_run_at", desc=False).execute().data or []
    except Exception:
        jobs = []

    return {
        "counts": counts,
        "totals": {
            "total": total,
            "delivered": counts.get("delivered", 0) + counts.get("read", 0),
            "read": counts.get("read", 0),
            "failed": counts.get("failed", 0),
        },
        "spend": {"month": round(month_spend, 2), "total": round(total_spend, 2), "currency": currency},
        "performance": [
            {"status": "delivered", "count": counts.get("delivered", 0)},
            {"status": "read", "count": counts.get("read", 0)},
            {"status": "sent", "count": counts.get("sent", 0)},
            {"status": "failed", "count": counts.get("failed", 0)},
            {"status": "queued", "count": counts.get("queued", 0)},
        ],
        "recent": recent,
        "jobs": jobs,
    }


# ── Templates ─────────────────────────────────────────────────────────────────
@app.get("/api/teacher/whatsapp/templates")
def wa_list_templates(user = Depends(verify_token)):
    _wa_require_teacher(user)
    try:
        rows = service_supabase.table("whatsapp_templates").select("*").eq(
            "teacher_id", user["teacher_id"]).order("created_at", desc=True).execute().data or []
    except Exception:
        rows = []
    return {"templates": rows}


@app.post("/api/teacher/whatsapp/templates")
async def wa_create_template(data: WhatsAppTemplateInput, user = Depends(verify_token)):
    _wa_require_teacher(user)
    row = {
        "teacher_id": user["teacher_id"],
        "name": data.name.strip(),
        "category": data.category,
        "language": data.language,
        "header_type": data.header_type,
        "body_text": data.body_text,
        "variables": data.variables or [],
        "status": "draft",
    }
    if data.submit:
        provider = wa.get_provider()
        res = await provider.create_template(data.name, data.category, data.language,
                                             data.body_text, data.header_type, data.variables)
        row["provider_template_id"] = res.get("provider_template_id")
        row["status"] = res.get("status", "pending") if res.get("status") != "not_configured" else "draft"
    try:
        ins = service_supabase.table("whatsapp_templates").insert(row).execute()
        return {"template": (ins.data or [row])[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save template: {e}")


@app.post("/api/teacher/whatsapp/templates/{template_id}/submit")
async def wa_submit_template(template_id: str, user = Depends(verify_token)):
    _wa_require_teacher(user)
    res = service_supabase.table("whatsapp_templates").select("*").eq(
        "id", template_id).eq("teacher_id", user["teacher_id"]).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Template not found")
    t = res.data
    provider = wa.get_provider()
    r = await provider.create_template(t["name"], t["category"], t["language"],
                                       t["body_text"], t.get("header_type", "none"),
                                       t.get("variables"))
    update = {"provider_template_id": r.get("provider_template_id"),
              "status": r.get("status", "pending") if r.get("status") != "not_configured" else "draft"}
    service_supabase.table("whatsapp_templates").update(update).eq("id", template_id).execute()
    return {"status": update["status"], "error": r.get("error")}


@app.get("/api/teacher/whatsapp/templates/{template_id}/status")
async def wa_template_status(template_id: str, user = Depends(verify_token)):
    _wa_require_teacher(user)
    res = service_supabase.table("whatsapp_templates").select("*").eq(
        "id", template_id).eq("teacher_id", user["teacher_id"]).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Template not found")
    pid = res.data.get("provider_template_id")
    if not pid:
        return {"status": res.data.get("status", "draft")}
    r = await wa.get_provider().get_template_status(pid)
    new_status = r.get("status")
    if new_status and new_status != res.data.get("status"):
        service_supabase.table("whatsapp_templates").update({"status": new_status}).eq("id", template_id).execute()
    return {"status": new_status or res.data.get("status")}


@app.delete("/api/teacher/whatsapp/templates/{template_id}")
def wa_delete_template(template_id: str, user = Depends(verify_token)):
    _wa_require_teacher(user)
    service_supabase.table("whatsapp_templates").delete().eq(
        "id", template_id).eq("teacher_id", user["teacher_id"]).execute()
    return {"success": True}


# ── Reports + criteria ────────────────────────────────────────────────────────
def _wa_build_report_rows(teacher_id, std_ids, included_ids, test_id, period, criteria):
    """Shared between preview and send: resolve students → fetch report → score →
    band. Returns (recipients_with_report). Each item carries the report dict."""
    recips = _wa_resolve_recipients(teacher_id, std_ids, included_ids)
    teacher_user = {"role": "teacher", "teacher_id": teacher_id, "user_id": teacher_id}
    rows = []
    for r in recips:
        try:
            report = get_student_report_v2(r["id"], period=period, user=teacher_user)
        except Exception as e:
            print(f"[wa] report fetch failed for {r['id']}: {e}")
            continue
        score = _wa_student_score(report, test_id)
        band = wa.resolve_band(score, criteria) if criteria else None
        rows.append({**r, "score": score, "band": band, "_report": report})
    return rows


@app.post("/api/teacher/whatsapp/preview-criteria")
def wa_preview_criteria(data: WhatsAppReportSendInput, user = Depends(verify_token)):
    _wa_require_teacher(user)
    rows = _wa_build_report_rows(user["teacher_id"], data.standard_ids, data.included_student_ids,
                                 data.test_id, data.period, data.criteria)
    preview = []
    skipped = 0
    skipped_no_exam = 0
    for r in rows:
        # Exam mode: only students who actually took THIS exam get a result.
        if data.test_id and r["score"] is None:
            skipped_no_exam += 1
            continue
        band = r["band"] or {}
        if data.criteria and not r["band"]:
            skipped += 1
        msg = band.get("message") or data.default_message or ""
        preview.append({
            "student_id": r["id"], "name": r["name"], "phone": r["phone"],
            "standard_name": r["standard_name"], "score": r["score"],
            "band": {"min": band.get("min"), "max": band.get("max")} if r["band"] else None,
            "message": msg, "attach_report": band.get("attach_report", True),
            "has_phone": bool(r["phone"]),
        })
    count = len([p for p in preview if p["has_phone"] and (not data.criteria or p["band"])])
    return {"preview": preview, "skipped_no_band": skipped, "skipped_no_exam": skipped_no_exam,
            "estimate": wa.estimate_cost(count, data.category)}


@app.post("/api/teacher/whatsapp/send-reports")
async def wa_send_reports(data: WhatsAppReportSendInput, user = Depends(verify_token)):
    _wa_require_teacher(user)
    provider = wa.get_provider()
    teacher_id = user["teacher_id"]
    lms = _wa_branding_name()
    rows = _wa_build_report_rows(teacher_id, data.standard_ids, data.included_student_ids,
                                 data.test_id, data.period, data.criteria)
    results = []
    for r in rows:
        if not r["phone"]:
            continue
        # Exam mode: only students who actually took THIS exam get a result.
        if data.test_id and r["score"] is None:
            continue
        band = r["band"] or {}
        if data.criteria and not r["band"]:
            continue  # no matching band → skip
        msg = band.get("message") or data.default_message or ""
        attach = band.get("attach_report", True)
        template_name = band.get("template_name") or data.template_name
        media_url = media_type = None
        body_text = msg

        report = r["_report"]
        try:
            if attach and data.report_format == "pdf":
                pdf = await asyncio.to_thread(wa.build_report_pdf, report, lms)
                media_url = await _wa_upload_bytes(pdf, ".pdf", "application/pdf")
                media_type = "document"
            elif attach and data.report_format == "image":
                png = await asyncio.to_thread(wa.build_report_image, report, lms)
                media_url = await _wa_upload_bytes(png, ".png", "image/png")
                media_type = "image"
            elif data.report_format == "text":
                txt = wa.build_report_text(report, lms)
                body_text = (txt + ("\n\n" + msg if msg else "")).strip()
        except Exception as e:
            print(f"[wa] report artifact build failed for {r['id']}: {e}")

        mode = "template" if (data.mode == "template" and template_name) else "freeform"
        results.append(await _wa_send_and_log(
            provider, teacher_id, r, mode=mode, template_name=template_name,
            variables=data.criteria and None, body_text=body_text, media_url=media_url,
            media_type=media_type, category=data.category, standard_id=r["standard_id"]))
    sent = sum(1 for x in results if x["status"] not in ("failed", "not_configured"))
    return {"results": results, "sent": sent,
            "total_cost": round(sum(x["cost"] for x in results), 2), "configured": provider.configured}


# ── Welcome / credentials (onboarding) ────────────────────────────────────────
@app.post("/api/teacher/whatsapp/send-welcome")
async def wa_send_welcome(data: WhatsAppWelcomeInput, user = Depends(verify_token)):
    _wa_require_teacher(user)
    provider = wa.get_provider()
    teacher_id = user["teacher_id"]
    recips = [r for r in _wa_resolve_recipients(teacher_id, data.standard_ids,
                                                data.student_ids) if r["phone"]]
    if not recips:
        raise HTTPException(status_code=400, detail="No recipients with a phone number")
    lms = _wa_branding_name()
    cfg = wa.get_wa_config()
    template_name = data.template_name or cfg.get("welcome_template")
    default_pwd = ""
    try:
        default_pwd = (get_teacher_settings().get("default_student_password") or "").strip()
    except Exception:
        pass
    creds = _wa_fetch_credentials([r["id"] for r in recips if r.get("id")]) if data.include_credentials else {}
    results = []
    for r in recips:
        if data.message:
            body = data.message
        elif data.include_credentials:
            c = creds.get(r["id"], {})
            pwd = (c.get("plain_password") or "").strip() or default_pwd
            body = _wa_credentials_body(r["name"], c.get("student_code") or r.get("student_code"), pwd, lms)
        else:
            body = (f"Welcome to {lms or 'our institution'}! Your child {r['name']} has been enrolled. "
                    f"Student ID: {r['student_code']}.")
        mode = "template" if template_name else "freeform"
        results.append(await _wa_send_and_log(
            provider, teacher_id, r, mode=mode, template_name=template_name,
            body_text=body, category=data.category, standard_id=r["standard_id"]))
    sent = sum(1 for x in results if x["status"] not in ("failed", "not_configured"))
    return {"results": results, "sent": sent,
            "total_cost": round(sum(x["cost"] for x in results), 2), "configured": provider.configured}


async def _wa_auto_welcome(student_id: str):
    """Fire a credentials welcome to a single new student's parent — only when the
    teacher enabled auto_welcome and a phone exists. Fully guarded: never raises
    into the student-creation flow (runs as a FastAPI background task)."""
    try:
        cfg = wa.get_wa_config()
        if not cfg.get("auto_welcome"):
            return
        rows = service_supabase.table("students").select(
            "id, name, phone, standard_id, student_code, plain_password, whatsapp_opt_out").eq(
            "id", student_id).limit(1).execute().data or []
        if not rows:
            return
        s = rows[0]
        phone = (s.get("phone") or "").strip()
        if not phone or s.get("whatsapp_opt_out"):
            return
        std = (service_supabase.table("standards").select("id, name, teacher_id").eq(
            "id", s.get("standard_id")).limit(1).execute().data or [None])[0]
        if not std or not std.get("teacher_id"):
            return
        default_pwd = (get_teacher_settings().get("default_student_password") or "").strip()
        pwd = (s.get("plain_password") or "").strip() or default_pwd
        lms = _wa_branding_name()
        template_name = cfg.get("welcome_template")
        recip = {"id": s["id"], "name": s.get("name") or "", "phone": phone,
                 "student_code": s.get("student_code") or "", "standard_id": std["id"]}
        provider = wa.get_provider()
        await _wa_send_and_log(
            provider, std["teacher_id"], recip,
            mode="template" if template_name else "freeform", template_name=template_name,
            body_text=_wa_credentials_body(recip["name"], recip["student_code"], pwd, lms),
            category="utility", standard_id=std["id"])
    except Exception as e:
        print(f"[wa] auto-welcome skipped: {e}")


class WhatsAppInboxReadInput(BaseModel):
    from_phone: Optional[str] = None
    message_ids: Optional[List[str]] = None


def _wa_phone_variants(phone: str):
    """Generate plausible stored-phone variants for an inbound sender number so we
    can match it to `students.phone` despite +/country-code formatting differences."""
    phone = (phone or "").strip()
    digits = "".join(c for c in phone if c.isdigit())
    variants = set()
    if phone:
        variants.add(phone)
    if digits:
        variants.add(digits)
        variants.add("+" + digits)
        last10 = digits[-10:]
        if len(digits) >= 10:
            variants.add(last10)
            variants.add("91" + last10)
            variants.add("+91" + last10)
    return [v for v in variants if v]


def _wa_match_inbound(from_phone: str):
    """Resolve an inbound sender phone to {teacher_id, student_id, name, standard}."""
    variants = _wa_phone_variants(from_phone)
    if not variants:
        return None
    try:
        srows = service_supabase.table("students").select(
            "id, name, standard_id").in_("phone", variants).execute().data or []
    except Exception:
        srows = []
    if not srows:
        return None
    s = srows[0]
    std = None
    if s.get("standard_id"):
        try:
            std = (service_supabase.table("standards").select("id, name, teacher_id").eq(
                "id", s["standard_id"]).limit(1).execute().data or [None])[0]
        except Exception:
            std = None
    if not std or not std.get("teacher_id"):
        return None
    return {
        "teacher_id": std.get("teacher_id"),
        "student_id": s["id"],
        "student_name": s.get("name"),
        "standard_id": std.get("id"),
        "standard_name": std.get("name"),
    }


# ── Webhook (no auth — provider-signed callbacks). Handles BOTH outbound delivery
#    status updates AND inbound parent replies (read-only inbox). ───────────────
@app.post("/api/teacher/whatsapp/webhook")
async def wa_webhook(request: Request):
    try:
        body = await request.json()
    except Exception:
        return {"ok": True}
    if not service_supabase:
        return {"ok": True}

    pid = body.get("id") or body.get("message_id")
    status = body.get("status")

    # 1) Delivery-status update for a message we sent.
    if pid and status:
        try:
            service_supabase.table("whatsapp_messages").update(
                {"status": status}).eq("provider_message_id", pid).execute()
        except Exception as e:
            print(f"[wa] webhook status update failed: {e}")

    # 2) Inbound parent reply → inbox.
    from_phone = (body.get("from") or body.get("sender") or body.get("wa_id")
                  or body.get("phone") or "")
    text = body.get("text")
    if isinstance(text, dict):
        text = text.get("body")
    msg_body = text or body.get("body") or body.get("message")
    if isinstance(msg_body, dict):
        msg_body = msg_body.get("body") or msg_body.get("text")
    media_url = body.get("media_url") or body.get("media")
    direction = str(body.get("direction") or body.get("type") or "").lower()
    is_inbound = bool(from_phone) and (bool(msg_body) or bool(media_url)) and not status
    if direction in ("inbound", "incoming", "message", "reply"):
        is_inbound = bool(from_phone)
    if is_inbound:
        match = _wa_match_inbound(from_phone)
        if match:
            try:
                service_supabase.table("whatsapp_inbox").insert({
                    "teacher_id": match["teacher_id"],
                    "from_phone": from_phone,
                    "student_id": match.get("student_id"),
                    "student_name": match.get("student_name"),
                    "standard_id": match.get("standard_id"),
                    "standard_name": match.get("standard_name"),
                    "body": msg_body or "",
                    "media_url": media_url,
                    "media_type": body.get("media_type"),
                    "provider_message_id": pid,
                }).execute()
            except Exception as e:
                print(f"[wa] inbox insert failed: {e}")
    return {"ok": True}


# ── Inbox (read-only parent replies, grouped by parent) ────────────────────────
@app.get("/api/teacher/whatsapp/inbox")
def wa_inbox(limit: int = 200, user = Depends(verify_token)):
    _wa_require_teacher(user)
    try:
        rows = service_supabase.table("whatsapp_inbox").select("*").eq(
            "teacher_id", user["teacher_id"]).order("received_at", desc=True).limit(limit).execute().data or []
    except Exception:
        return {"threads": [], "unread": 0, "count": 0}
    threads: Dict[str, dict] = {}
    unread = 0
    for r in rows:
        is_unread = not r.get("read_by_teacher")
        if is_unread:
            unread += 1
        key = r.get("from_phone") or "?"
        t = threads.get(key)
        if not t:
            t = {"from_phone": key, "student_id": r.get("student_id"),
                 "student_name": r.get("student_name"), "standard_name": r.get("standard_name"),
                 "last_at": r.get("received_at"), "unread": 0, "messages": []}
            threads[key] = t
        t["messages"].append({
            "id": r["id"], "body": r.get("body"), "media_url": r.get("media_url"),
            "media_type": r.get("media_type"), "received_at": r.get("received_at"),
            "read": bool(r.get("read_by_teacher")),
        })
        if is_unread:
            t["unread"] += 1
    return {"threads": list(threads.values()), "unread": unread, "count": len(rows)}


@app.post("/api/teacher/whatsapp/inbox/mark-read")
def wa_inbox_mark_read(data: WhatsAppInboxReadInput, user = Depends(verify_token)):
    _wa_require_teacher(user)
    try:
        q = service_supabase.table("whatsapp_inbox").update(
            {"read_by_teacher": True}).eq("teacher_id", user["teacher_id"])
        if data.from_phone:
            q = q.eq("from_phone", data.from_phone)
        if data.message_ids:
            q = q.in_("id", data.message_ids)
        q.execute()
    except Exception as e:
        print(f"[wa] inbox mark-read failed: {e}")
    return {"ok": True}


# ── Scheduled / automatic jobs ────────────────────────────────────────────────
def _wa_parse_interval(cfg: dict) -> timedelta:
    cfg = cfg or {}
    if cfg.get("days"):
        try:
            return timedelta(days=int(cfg["days"]))
        except (TypeError, ValueError):
            pass
    e = str(cfg.get("every", "1 week")).lower()
    if "month" in e:
        return timedelta(days=30)
    if "week" in e:
        return timedelta(days=7)
    digits = "".join(ch for ch in e if ch.isdigit())
    if "day" in e:
        return timedelta(days=int(digits) if digits else 1)
    return timedelta(days=7)


def _wa_initial_next_run(job_input: WhatsAppJobInput):
    now = datetime.now(timezone.utc)
    cfg = job_input.trigger_config or {}
    if job_input.trigger_type == "interval":
        return now + _wa_parse_interval(cfg)
    if job_input.trigger_type in ("fixed_date", "post_exam"):
        at = cfg.get("at")
        if at:
            try:
                return datetime.fromisoformat(at.replace("Z", "+00:00"))
            except Exception:
                return now
        return now
    return now


def _wa_quiet_now(quiet: dict) -> bool:
    """True if the current UTC time is inside the configured quiet-hours window
    (sends should be deferred). Window is {start:'HH:MM', end:'HH:MM'} as allowed
    hours; outside = quiet."""
    if not quiet or not quiet.get("start") or not quiet.get("end"):
        return False
    try:
        now = datetime.now(timezone.utc).strftime("%H:%M")
        start, end = quiet["start"], quiet["end"]
        if start <= end:
            allowed = start <= now <= end
        else:  # window wraps midnight
            allowed = now >= start or now <= end
        return not allowed
    except Exception:
        return False


async def _wa_execute_job(job: dict, force: bool = False):
    """Run a single scheduled job: resolve recipients, honour quiet hours + dedupe,
    send, then advance next_run_at / deactivate one-shot triggers."""
    teacher_id = job["teacher_id"]
    quiet = job.get("quiet_hours") or wa.get_wa_config().get("quiet_hours") or {}
    if not force and _wa_quiet_now(quiet):
        return {"deferred": True}  # leave next_run_at; retry next poll

    provider = wa.get_provider()
    target_type = job.get("target_type", "all")
    std_ids = job.get("target_ids") if target_type in ("class", "classes") else None
    criteria = job.get("criteria") or None
    category = job.get("category", "utility")
    report_format = job.get("report_format", "none")
    lms = _wa_branding_name()

    # Dedupe: skip a student already messaged by THIS job in the last 12h.
    since = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat()
    recent_ids = set()
    try:
        dd = service_supabase.table("whatsapp_messages").select("student_id").eq(
            "job_id", job["id"]).gte("created_at", since).execute().data or []
        recent_ids = {d["student_id"] for d in dd if d.get("student_id")}
    except Exception:
        pass

    results = []
    if job.get("mode") == "report" or report_format != "none":
        rows = _wa_build_report_rows(teacher_id, std_ids, None,
                                     (job.get("trigger_config") or {}).get("test_id"),
                                     "overall", criteria)
        for r in rows:
            if not r["phone"] or r["id"] in recent_ids:
                continue
            if criteria and not r["band"]:
                continue
            band = r["band"] or {}
            body = band.get("message") or job.get("body_text") or ""
            media_url = media_type = None
            try:
                if report_format == "pdf":
                    pdf = await asyncio.to_thread(wa.build_report_pdf, r["_report"], lms)
                    media_url = await _wa_upload_bytes(pdf, ".pdf", "application/pdf"); media_type = "document"
                elif report_format == "image":
                    png = await asyncio.to_thread(wa.build_report_image, r["_report"], lms)
                    media_url = await _wa_upload_bytes(png, ".png", "image/png"); media_type = "image"
                elif report_format == "text":
                    body = (wa.build_report_text(r["_report"], lms) + ("\n\n" + body if body else "")).strip()
            except Exception as e:
                print(f"[wa job] artifact failed: {e}")
            tn = band.get("template_name") or job.get("template_name")
            mode = "template" if (job.get("mode") == "template" and tn) else "freeform"
            results.append(await _wa_send_and_log(
                provider, teacher_id, r, mode=mode, template_name=tn, body_text=body,
                media_url=media_url, media_type=media_type, category=category,
                standard_id=r["standard_id"], job_id=job["id"]))
    else:
        recips = [r for r in _wa_resolve_recipients(teacher_id, std_ids)
                  if r["phone"] and r["id"] not in recent_ids]
        for r in recips:
            mode = "template" if (job.get("mode") == "template" and job.get("template_name")) else "freeform"
            results.append(await _wa_send_and_log(
                provider, teacher_id, r, mode=mode, template_name=job.get("template_name"),
                body_text=job.get("body_text"), category=category,
                standard_id=r["standard_id"], job_id=job["id"]))

    # Advance schedule.
    now = datetime.now(timezone.utc)
    update = {"last_run_at": now.isoformat()}
    if job.get("trigger_type") == "interval":
        update["next_run_at"] = (now + _wa_parse_interval(job.get("trigger_config") or {})).isoformat()
    else:
        update["active"] = False
        update["next_run_at"] = None
    try:
        service_supabase.table("whatsapp_scheduled_jobs").update(update).eq("id", job["id"]).execute()
    except Exception as e:
        print(f"[wa job] schedule update failed: {e}")
    sent = sum(1 for x in results if x["status"] not in ("failed", "not_configured"))
    return {"sent": sent, "results": results}


async def _whatsapp_run_due_jobs():
    if not service_supabase:
        return
    now = datetime.now(timezone.utc).isoformat()
    try:
        due = service_supabase.table("whatsapp_scheduled_jobs").select("*").eq(
            "active", True).lte("next_run_at", now).execute().data or []
    except Exception:
        return  # table may not exist yet — degrade quietly
    for job in due:
        try:
            await _wa_execute_job(job)
        except Exception as e:
            print(f"[wa scheduler] job {job.get('id')} failed: {e}")


async def _whatsapp_scheduler_loop():
    """In-process poller (single uvicorn worker). Mirrors _broadcast_cleanup_loop."""
    await asyncio.sleep(25)  # let startup settle
    while True:
        try:
            await _whatsapp_run_due_jobs()
        except Exception as e:
            print(f"[wa scheduler] loop error: {e}")
        await asyncio.sleep(60)


@app.get("/api/teacher/whatsapp/jobs")
def wa_list_jobs(user = Depends(verify_token)):
    _wa_require_teacher(user)
    try:
        rows = service_supabase.table("whatsapp_scheduled_jobs").select("*").eq(
            "teacher_id", user["teacher_id"]).order("created_at", desc=True).execute().data or []
    except Exception:
        rows = []
    return {"jobs": rows}


@app.post("/api/teacher/whatsapp/jobs")
def wa_create_job(data: WhatsAppJobInput, user = Depends(verify_token)):
    _wa_require_teacher(user)
    row = {
        "teacher_id": user["teacher_id"],
        "name": data.name.strip(),
        "target_type": data.target_type,
        "target_ids": data.target_ids or [],
        "trigger_type": data.trigger_type,
        "trigger_config": data.trigger_config or {},
        "mode": data.mode,
        "template_name": data.template_name,
        "body_text": data.body_text,
        "category": data.category,
        "report_format": data.report_format,
        "criteria": data.criteria or [],
        "quiet_hours": data.quiet_hours or {},
        "active": data.active,
        "next_run_at": _wa_initial_next_run(data).isoformat(),
    }
    try:
        ins = service_supabase.table("whatsapp_scheduled_jobs").insert(row).execute()
        return {"job": (ins.data or [row])[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not create job: {e}")


@app.put("/api/teacher/whatsapp/jobs/{job_id}")
def wa_update_job(job_id: str, data: WhatsAppJobInput, user = Depends(verify_token)):
    _wa_require_teacher(user)
    update = {
        "name": data.name.strip(),
        "target_type": data.target_type,
        "target_ids": data.target_ids or [],
        "trigger_type": data.trigger_type,
        "trigger_config": data.trigger_config or {},
        "mode": data.mode,
        "template_name": data.template_name,
        "body_text": data.body_text,
        "category": data.category,
        "report_format": data.report_format,
        "criteria": data.criteria or [],
        "quiet_hours": data.quiet_hours or {},
        "active": data.active,
        "next_run_at": _wa_initial_next_run(data).isoformat(),
    }
    service_supabase.table("whatsapp_scheduled_jobs").update(update).eq(
        "id", job_id).eq("teacher_id", user["teacher_id"]).execute()
    return {"success": True}


@app.delete("/api/teacher/whatsapp/jobs/{job_id}")
def wa_delete_job(job_id: str, user = Depends(verify_token)):
    _wa_require_teacher(user)
    service_supabase.table("whatsapp_scheduled_jobs").delete().eq(
        "id", job_id).eq("teacher_id", user["teacher_id"]).execute()
    return {"success": True}


@app.post("/api/teacher/whatsapp/jobs/{job_id}/toggle")
def wa_toggle_job(job_id: str, user = Depends(verify_token)):
    _wa_require_teacher(user)
    res = service_supabase.table("whatsapp_scheduled_jobs").select("active").eq(
        "id", job_id).eq("teacher_id", user["teacher_id"]).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Job not found")
    new_active = not res.data.get("active")
    service_supabase.table("whatsapp_scheduled_jobs").update(
        {"active": new_active}).eq("id", job_id).execute()
    return {"active": new_active}


@app.post("/api/teacher/whatsapp/jobs/{job_id}/run-now")
async def wa_run_job_now(job_id: str, user = Depends(verify_token)):
    _wa_require_teacher(user)
    res = service_supabase.table("whatsapp_scheduled_jobs").select("*").eq(
        "id", job_id).eq("teacher_id", user["teacher_id"]).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return await _wa_execute_job(res.data, force=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
