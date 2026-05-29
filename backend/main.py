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

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

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


@app.on_event("startup")
async def startup_event():
    await _ensure_plain_password_column()


# Models
class Standard(BaseModel):
    name: str
    short: Optional[str] = None
    emoji: Optional[str] = '📚'

class StandardUpdate(BaseModel):
    name: Optional[str] = None
    short: Optional[str] = None
    emoji: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class SubjectClass(BaseModel):
    standard_id: str
    name: str
    emoji: Optional[str] = '📐'
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

class LiveClassCreate(BaseModel):
    class_id: str
    title: str
    scheduled_at: str  # ISO 8601: "2026-06-01T09:00:00"
    duration_mins: int = 60

class LiveClassUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None

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
        import asyncio
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


def verify_token(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")

    token = authorization.replace("Bearer ", "")

    try:
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")

        user = user_response.user
        user_metadata = user.user_metadata or {}
        role = user_metadata.get("role", "student")

        result = {
            "id": user.id,
            "user_id": user.id,
            "teacher_id": user.id,
            "email": user.email,
            "name": user_metadata.get("name", ""),
            "role": role,
            "username": user_metadata.get("username", ""),
            "student_id": None,
            "standard_id": None,
        }

        if role == "student" and service_supabase:
            try:
                lookup = service_supabase.table("students").select("id, standard_id, name, username, avatar_url, points, avg_score, attendance_pct, phone, must_change_pwd").eq("id", user.id).single().execute()
                if lookup.data:
                    result["student_id"] = lookup.data["id"]
                    result["standard_id"] = lookup.data.get("standard_id")
                    if lookup.data.get("name"):
                        result["name"] = lookup.data["name"]
                    if lookup.data.get("username"):
                        result["username"] = lookup.data["username"]
                    result["points"] = lookup.data.get("points", 0)
                    result["avg_score"] = lookup.data.get("avg_score", 0)
                    result["attendance_pct"] = lookup.data.get("attendance_pct")
                    result["phone"] = lookup.data.get("phone")
                    result["must_change_pwd"] = bool(lookup.data.get("must_change_pwd"))
                    result["avatar_url"] = lookup.data.get("avatar_url")
                    # Fetch standard name
                    if lookup.data.get("standard_id"):
                        try:
                            std = service_supabase.table("standards").select("name").eq("id", lookup.data["standard_id"]).single().execute()
                            result["standard_name"] = std.data["name"] if std.data else None
                        except Exception:
                            result["standard_name"] = None
            except Exception:
                pass

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
        # Phone number login — look up the student's email by phone
        if not service_supabase:
            raise HTTPException(status_code=503, detail="Phone login unavailable")
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
def get_dashboard_stats(user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    teacher_id = user["user_id"]
    standards = service_supabase.table("standards").select("id").eq("teacher_id", teacher_id).execute()
    standard_ids = [s["id"] for s in standards.data] if standards.data else []

    students_count = 0
    if standard_ids:
        students_result = service_supabase.table("students").select("id", count="exact").in_("standard_id", standard_ids).execute()
        students_count = students_result.count or 0

    subject_classes_count = 0
    if standard_ids:
        subjects_result = service_supabase.table("subject_classes").select("id", count="exact").in_("standard_id", standard_ids).execute()
        subject_classes_count = subjects_result.count or 0

    if standard_ids:
        class_ids_result = service_supabase.table("subject_classes").select("id").in_("standard_id", standard_ids).execute()
        class_ids = [c["id"] for c in class_ids_result.data] if class_ids_result.data else []
        scheduled_tests_count = 0
        if class_ids:
            tests_result = service_supabase.table("tests").select("id", count="exact").in_("class_id", class_ids).eq("status", "scheduled").execute()
            scheduled_tests_count = tests_result.count or 0
    else:
        scheduled_tests_count = 0

    broadcasts_count = 0
    if standard_ids:
        broadcasts_result = service_supabase.table("broadcasts").select("id", count="exact").in_("standard_id", standard_ids).eq("deleted", False).execute()
        broadcasts_count = broadcasts_result.count or 0

    return {
        "students_count": students_count,
        "subjects_count": subject_classes_count,
        "scheduled_tests_count": scheduled_tests_count,
        "broadcasts_count": broadcasts_count,
        "standards_count": len(standard_ids)
    }

@app.get("/api/dashboard/activity")
def get_dashboard_activity(user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    teacher_id = user["user_id"]

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

# Standards CRUD
@app.get("/api/standards")
def get_standards(user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    if user["role"] == "teacher":
        response = service_supabase.table("standards").select("*").eq("teacher_id", user["user_id"]).order("created_at", desc=True).execute()
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
        "teacher_id": user["user_id"]
    }
    try:
        response = service_supabase.table("standards").insert(data).execute()
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.patch("/api/standards/{standard_id}")
def update_standard(standard_id: str, updates: StandardUpdate, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Verify ownership
    existing = service_supabase.table("standards").select("teacher_id").eq("id", standard_id).single().execute()
    if not existing.data or existing.data["teacher_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if update_data:
        service_supabase.table("standards").update(update_data).eq("id", standard_id).execute()

    return {"message": "Standard updated"}

@app.delete("/api/standards/{standard_id}")
async def delete_standard(standard_id: str, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Ownership check
    existing = service_supabase.table("standards").select("teacher_id").eq("id", standard_id).single().execute()
    if not existing.data or existing.data["teacher_id"] != user["user_id"]:
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
        # Teacher: return all subjects for their standards
        stds = service_supabase.table("standards").select("id").eq("teacher_id", user["user_id"]).execute()
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
    if not standard.data or standard.data["teacher_id"] != user["user_id"]:
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
    if not std.data or std.data["teacher_id"] != user["user_id"]:
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
    if not std.data or std.data["teacher_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    service_supabase.table("subject_classes").delete().eq("id", subject_id).execute()
    return {"message": "Subject deleted"}

# Students
@app.get("/api/students")
def get_students(standard_id: Optional[str] = None, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Safe field list — never include any password column regardless of DB state
    teacher_fields = "id, name, username, email, phone, avatar_url, standard_id, points, attendance_pct, avg_score, blocked, must_change_pwd, created_at"
    # Students only see safe fields (no phone/email of other students)
    student_public_fields = "id, name, username, standard_id, points, attendance_pct, avg_score, avatar_url"

    if user["role"] == "teacher":
        if standard_id:
            response = service_supabase.table("students").select(teacher_fields).eq("standard_id", standard_id).execute()
        else:
            standards = service_supabase.table("standards").select("id").eq("teacher_id", user["user_id"]).execute()
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
    safe_fields = "id, name, username, email, phone, avatar_url, standard_id, points, attendance_pct, avg_score, blocked, must_change_pwd, created_at"
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
        "id, name, username, email, avatar_url, standard_id, points, attendance_pct, avg_score, blocked, created_at"
    ).eq("id", student_id).single().execute()
    if not student_res.data:
        raise HTTPException(status_code=404, detail="Student not found")
    student = student_res.data

    # ── Get all subjects for this standard ───────────────────────────
    std_id = student.get("standard_id")
    if std_id:
        subjects_res = service_supabase.table("subject_classes").select("id, name, emoji").eq("standard_id", std_id).execute()
        subjects = subjects_res.data or []
    else:
        subjects = []
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
            "emoji": sub.get("emoji", "📐"),
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
            "emoji": s.get("emoji", "📐"),
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
        # estimate minutes watched from progress_secs
        watched_secs = vp.get("progress_secs") or 0
        if day not in vid_by_date:
            vid_by_date[day] = {"minutes": 0, "count": 0}
        vid_by_date[day]["minutes"] += round(watched_secs / 60, 1)
        vid_by_date[day]["count"] += 1
    video_heatmap = [{"date": d, **v} for d, v in sorted(vid_by_date.items())]

    return {
        "student": student,
        "period": period,
        "subject_radar": subject_radar,
        "test_timeline": test_timeline,
        "topic_map": topic_map,
        "attendance_heatmap": attendance_heatmap,
        "video_heatmap": video_heatmap,
        "subjects": subjects,
    }


# /students/me/report removed — use /students/me/report/v2 instead
# (literal 'me' path would be shadowed by /{student_id}/report in FastAPI's route order)


@app.post("/api/admin/create-student")
def create_student_admin(request: CreateStudentRequest, user = Depends(verify_token)):
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

        return {
            "id": response.user.id,
            "email": auth_email,
            "username": request.username,
            "role": "student",
            "password": request.password
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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
        await asyncio.to_thread(
            lambda: service_supabase.table("students").update({"avatar_url": str(public_url)}).eq("id", user["user_id"]).execute()
        )
        return {"avatar_url": public_url}
    except Exception as e:
        print("Avatar upload error:", e)
        raise HTTPException(status_code=500, detail="Upload failed")

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
        else:
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
        .eq("teacher_id", user["user_id"]) \
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
            .eq("teacher_id", user["user_id"]) \
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
    stds = service_supabase.table("standards").select("id").eq("teacher_id", user["user_id"]).execute()
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
        response = service_supabase.table("invite_links").select("*").eq("standard_id", standard_id).eq("created_by", user["user_id"]).execute()
    else:
        response = service_supabase.table("invite_links").select("*").eq("created_by", user["user_id"]).execute()

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
def approve_join_request(request_id: str, user = Depends(verify_token)):
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
                }).execute()

                # Update request status
                service_supabase.table("invite_requests").update({"status": "approved"}).eq("id", request_id).execute()

                return {
                    "message": "Student approved",
                    "username": request.data["student_email"] or request.data["student_name"].lower().replace(" ", "."),
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
    students = service_supabase.table("students").select("id, name, username").eq("standard_id", standard_id).execute()
    
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
        standards = service_supabase.table("standards").select("id, name, attendance_threshold").eq("teacher_id", user["user_id"]).execute()
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
        
    if test.data.get("created_by") != user["user_id"]:
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

    existing = service_supabase.table("tests").select("created_by, status, scheduled_for").eq("id", test_id).single().execute()
    if not existing.data or existing.data.get("created_by") != user["user_id"]:
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

# --- Reminders ---
@app.get("/api/reminders")
def get_reminders(user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    response = service_supabase.table("reminders").select("*").eq("teacher_id", user["user_id"]).order("done").order("scheduled_for", nullsfirst=True).execute()
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
        "teacher_id": user["user_id"],
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
    response = service_supabase.table("reminders").update(update_data).eq("id", reminder_id).eq("teacher_id", user["user_id"]).execute()
    return response.data[0] if response.data else {}

@app.delete("/api/reminders/{reminder_id}")
def delete_reminder(reminder_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    service_supabase.table("reminders").delete().eq("id", reminder_id).eq("teacher_id", user["user_id"]).execute()
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
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, standard_id)

@app.post("/api/broadcasts")
async def create_broadcast(req: BroadcastRequest, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    payload = {
        "message": req.message,
        "attachment_url": req.attachment_url,
        "attachment_type": req.attachment_type,
        "sender": user["user_id"],
        "scheduled_for": req.scheduled_for,
    }

    # For scheduled broadcasts, save to history/DB but do NOT push WS event yet
    is_future_scheduled = bool(req.scheduled_for and datetime.fromisoformat(req.scheduled_for.replace("Z", "+00:00")).replace(tzinfo=None) > datetime.utcnow())
    if is_future_scheduled:
        payload["id"] = str(uuid.uuid4())
        payload["created_at"] = datetime.now().isoformat()
        payload["standard_id"] = req.standard_id
        manager.broadcast_history.append(payload)
        import asyncio as _asyncio
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
                        "created_at": payload["created_at"],
                    }).execute()
                except Exception as e:
                    print("Supabase scheduled broadcast insert failed:", e)
        _asyncio.create_task(_asyncio.to_thread(_save_scheduled))
    else:
        await manager.broadcast_to_standard(req.standard_id, payload)

    return {"status": "success", "data": payload}

@app.get("/api/broadcasts")
def get_broadcasts(standard_id: Optional[str] = None, user = Depends(verify_token)):
    history = manager.broadcast_history
    if standard_id:
        history = [b for b in history if b.get("standard_id") == standard_id]
    # Students never see future-scheduled broadcasts
    if user["role"] == "student":
        now = datetime.utcnow()
        history = [b for b in history if not (
            b.get("scheduled_for") and
            datetime.fromisoformat(b["scheduled_for"].replace("Z", "+00:00")).replace(tzinfo=None) > now
        )]
    return history

class BroadcastReadRequest(BaseModel):
    broadcast_ids: List[str]

@app.post("/api/broadcast-reads")
def mark_broadcasts_read(req: BroadcastReadRequest, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase or not user.get("student_id") or not req.broadcast_ids:
        return {"marked": 0}
    try:
        now = datetime.now().isoformat()
        rows = [{"broadcast_id": bid, "student_id": user["student_id"], "read_at": now} for bid in req.broadcast_ids]
        service_supabase.table("broadcast_reads").upsert(rows, on_conflict="broadcast_id,student_id").execute()
        return {"marked": len(rows)}
    except Exception as e:
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
        if not broadcast_ids:
            return {}
        reads = service_supabase.table("broadcast_reads").select("broadcast_id").in_("broadcast_id", broadcast_ids).execute()
        counts = {}
        for row in (reads.data or []):
            bid = row["broadcast_id"]
            counts[bid] = counts.get(bid, 0) + 1
        return counts
    except Exception:
        return {}

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
            "teacher_id": user["user_id"],
            "filename": req.filename,
            "total_rows": len(req.students),
            "created": success_count,
            "skipped": skipped_count,
            "errors": error_count,
            "created_at": datetime.now().isoformat()
        }).execute()
    except Exception as e:
        print("Failed to insert audit log (table might not exist):", e)

    return {"status": "success", "created": success_count, "skipped": skipped_count, "errors": error_count}


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
    result = service_supabase.table("question_bank").select("*").eq("teacher_id", user["user_id"]).order("created_at", desc=True).execute()
    return result.data or []

@app.post("/api/question-bank")
def create_question_bank_item(item: QuestionBankItem, user=Depends(verify_token)):
    if user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teachers only")
    result = service_supabase.table("question_bank").insert({
        "teacher_id": user["user_id"],
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
    if existing.data["teacher_id"] != user["user_id"]:
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
    bank_qs = service_supabase.table("question_bank").select("*").in_("id", req.question_ids).eq("teacher_id", user["user_id"]).execute()
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
            .select("attended, student_id").eq("live_class_id", lc["id"]).execute()
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


@app.get("/api/live-classes/{live_class_id}/join-token")
async def get_join_token(live_class_id: str, user=Depends(verify_token)):
    lc_result = service_supabase.table("live_classes") \
        .select("*").eq("id", live_class_id).single().execute()
    if not lc_result.data:
        raise HTTPException(status_code=404, detail="Live class not found")
    lc = lc_result.data

    if lc["status"] == "cancelled":
        raise HTTPException(status_code=400, detail="This class has been cancelled")
    if lc["status"] == "ended":
        raise HTTPException(status_code=400, detail="This class has already ended")

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
        # Transition to live when teacher joins
        if lc["status"] == "scheduled":
            service_supabase.table("live_classes").update({"status": "live"}).eq("id", live_class_id).execute()
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


@app.post("/api/live-classes/{live_class_id}/cancel")
async def cancel_live_class(live_class_id: str, user=Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    service_supabase.table("live_classes") \
        .update({"status": "cancelled"}) \
        .eq("id", live_class_id) \
        .eq("created_by", user["user_id"]).execute()
    return {"message": "cancelled"}


@app.get("/api/live-classes/{live_class_id}/attendance")
async def get_live_class_attendance(live_class_id: str, user=Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    result = service_supabase.table("live_class_attendance") \
        .select("*, students(id, name, username, avatar_url)") \
        .eq("live_class_id", live_class_id).execute()
    return result.data or []


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
