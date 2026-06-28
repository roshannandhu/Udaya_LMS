from fastapi import FastAPI, HTTPException, Depends, Header, UploadFile, File, Form, WebSocket, WebSocketDisconnect, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Literal, Any
from datetime import date, datetime, timedelta, timezone
import asyncio
import csv
from io import StringIO
from fastapi.responses import StreamingResponse, Response
import uuid
import re
import os
import subprocess
import json
import base64
import hashlib
import hmac
import time as time_module
import threading
import httpx
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

import whatsapp as wa
import storage as filestore

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

# Error monitoring (Sentry) — dormant unless SENTRY_DSN is set in the host env.
# Guarded so a missing package/DSN can never block startup (e.g. local dev).
try:
    _sentry_dsn = os.getenv("SENTRY_DSN", "")
    if _sentry_dsn:
        import sentry_sdk
        sentry_sdk.init(
            dsn=_sentry_dsn,
            traces_sample_rate=0.1,
            environment=os.getenv("ENVIRONMENT", "production"),
        )
except Exception as _e:
    print(f"[sentry] init skipped: {_e}")

app = FastAPI(title="Tutoria LMS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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


def _harden_postgrest_session(client: Client):
    """postgrest-py hardcodes one shared httpx session with http2=True. Under
    concurrent threaded use (asyncio.to_thread fan-outs + parallel requests)
    all calls multiplex onto a single HTTP/2 connection; when Supabase's load
    balancer drops it, every in-flight call dies with httpx.RemoteProtocolError
    'Server disconnected' → unhandled 500s (seen as intermittent empty lists
    in the UI). Replace the session with an HTTP/1.1 client (one pooled TCP
    connection per concurrent call, 5s keepalive) and retry once when a reused
    connection turns out to be dead."""
    pg = client.postgrest  # lazily instantiates the SyncPostgrestClient
    old = pg.session
    new = httpx.Client(
        base_url=old.base_url,
        headers=old.headers,
        timeout=old.timeout,
        follow_redirects=True,
        transport=httpx.HTTPTransport(retries=2),
    )
    orig_request = new.request

    def request_with_retry(*args, **kwargs):
        try:
            return orig_request(*args, **kwargs)
        except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError):
            return orig_request(*args, **kwargs)

    new.request = request_with_retry
    pg.session = new


if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        _harden_postgrest_session(supabase)
        if SUPABASE_SERVICE_KEY:
            service_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            _harden_postgrest_session(service_supabase)
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
    # Probe first — fast path if everything already exists. Probe the NEWEST
    # column of each table (e.g. teacher_branding.profile_photo_url) so an
    # un-migrated DB falls through and the DDL below runs.
    try:
        service_supabase.table("live_classes").select("thumbnail_url").limit(1).execute()
        service_supabase.table("teacher_branding").select("profile_photo_url").limit(1).execute()
        service_supabase.table("whatsapp_templates").select("media_url").limit(1).execute()
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
        ALTER TABLE teacher_branding ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
        ALTER TABLE teacher_branding ENABLE ROW LEVEL SECURITY;
        ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS media_url TEXT;
        ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS media_type TEXT;
        ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS media_name TEXT;
    """
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/pg-meta/v0/query", headers=headers, json={"query": ddl}
            )
            if resp.is_success:
                print("[*] Auto-migrated: live_classes + teacher_branding + whatsapp_templates media columns")
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
        service_supabase.table("app_settings").select("id").limit(1).execute()
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
        CREATE TABLE IF NOT EXISTS app_settings (
            id         TEXT PRIMARY KEY,
            data       JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ DEFAULT now()
        );
        ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "deny_all_app_settings" ON app_settings;
        CREATE POLICY "deny_all_app_settings" ON app_settings FOR ALL USING (false);
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


async def _ensure_reattempt_table():
    """Auto-add the test_reattempt_requests table + test_attempts.reattempt_allowed
    column if missing (student exam re-attempt request → teacher approval flow)."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY or not service_supabase:
        return
    # Probe first — fast path if everything already exists
    try:
        service_supabase.table("test_reattempt_requests").select("id").limit(1).execute()
        service_supabase.table("test_attempts").select("reattempt_allowed").limit(1).execute()
        service_supabase.table("assignment_reattempt_requests").select("id").limit(1).execute()
        return
    except Exception:
        pass

    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    ddl = """
        ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS reattempt_allowed BOOLEAN DEFAULT false;
        CREATE TABLE IF NOT EXISTS test_reattempt_requests (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            test_id     UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
            student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            reason      TEXT,
            status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
            old_score   NUMERIC,
            created_at  TIMESTAMPTZ DEFAULT now(),
            resolved_at TIMESTAMPTZ,
            resolved_by UUID
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reattempt_pending
            ON test_reattempt_requests(test_id, student_id) WHERE status = 'pending';
        ALTER TABLE test_reattempt_requests ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "deny_all_reattempt" ON test_reattempt_requests;
        CREATE POLICY "deny_all_reattempt" ON test_reattempt_requests FOR ALL USING (false);
        CREATE TABLE IF NOT EXISTS assignment_reattempt_requests (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
            student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            reason        TEXT,
            status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
            old_marks     NUMERIC,
            created_at    TIMESTAMPTZ DEFAULT now(),
            resolved_at   TIMESTAMPTZ,
            resolved_by   UUID
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_assignment_reattempt_pending
            ON assignment_reattempt_requests(assignment_id, student_id) WHERE status = 'pending';
        ALTER TABLE assignment_reattempt_requests ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "deny_all_assignment_reattempt" ON assignment_reattempt_requests;
        CREATE POLICY "deny_all_assignment_reattempt" ON assignment_reattempt_requests FOR ALL USING (false);
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/pg-meta/v0/query", headers=headers, json={"query": ddl}
            )
            if resp.is_success:
                print("[*] Auto-migrated: test_reattempt_requests table + reattempt_allowed column")
            else:
                raise Exception(f"pg-meta query: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"[!] Could not auto-migrate re-attempt table: {e}")
        print("[!] Run backend/schema.sql in the Supabase SQL Editor to apply.")


async def _ensure_video_comments_table():
    """Auto-add the video_comments table if missing (private per-student video
    Q&A → teacher reply). Best-effort like the others; on hosted Supabase the
    pg-meta API is unavailable, so the canonical path is running schema.sql."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY or not service_supabase:
        return
    try:
        service_supabase.table("video_comments").select("id").limit(1).execute()
        return
    except Exception:
        pass

    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    ddl = """
        CREATE TABLE IF NOT EXISTS video_comments (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            video_id      UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
            student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            text          TEXT NOT NULL,
            teacher_reply TEXT,
            replied_at    TIMESTAMPTZ,
            created_at    TIMESTAMPTZ DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_video_comments_video ON video_comments(video_id);
        CREATE INDEX IF NOT EXISTS idx_video_comments_student ON video_comments(student_id);
        ALTER TABLE video_comments ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "deny_all_video_comments" ON video_comments;
        CREATE POLICY "deny_all_video_comments" ON video_comments FOR ALL USING (false);
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/pg-meta/v0/query", headers=headers, json={"query": ddl}
            )
            if resp.is_success:
                print("[*] Auto-migrated: video_comments table (pg-meta)")
                return
            raise Exception(f"pg-meta query: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"[!] pg-meta migrate failed for video_comments: {e}")

    # Fallback: run the DDL directly over the Postgres connection via psql. Hosted
    # Supabase doesn't expose pg-meta, so this is the path that actually works in
    # production. DATABASE_URL is already on the box (used by scripts/backup_db.py)
    # and postgresql-client (psql) ships in the image, so this mirrors that setup.
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("[!] DATABASE_URL not set — cannot self-create video_comments.")
        print("[!] Run the video_comments block from backend/schema.sql in the Supabase SQL Editor.")
        return
    try:
        proc = await asyncio.to_thread(
            lambda: subprocess.run(
                ["psql", db_url, "-v", "ON_ERROR_STOP=1", "-c", ddl],
                capture_output=True, timeout=20,
            )
        )
        if proc.returncode == 0:
            print("[*] Auto-migrated: video_comments table (psql)")
        else:
            print(f"[!] psql migrate failed for video_comments: {proc.stderr.decode(errors='replace')[:300]}")
            print("[!] Run the video_comments block from backend/schema.sql in the Supabase SQL Editor.")
    except Exception as e:
        print(f"[!] psql migrate error for video_comments: {e}")
        print("[!] Run the video_comments block from backend/schema.sql in the Supabase SQL Editor.")


_VIDEO_COMMENTS_OK = None

def _video_comments_enabled() -> bool:
    """True once the video_comments table exists. Same self-healing probe as
    _reattempt_enabled, so the feature degrades gracefully before migration."""
    global _VIDEO_COMMENTS_OK
    if _VIDEO_COMMENTS_OK:
        return True
    if not service_supabase:
        return False
    try:
        service_supabase.table("video_comments").select("id").limit(1).execute()
        _VIDEO_COMMENTS_OK = True
    except Exception:
        _VIDEO_COMMENTS_OK = False
    return bool(_VIDEO_COMMENTS_OK)


async def _ensure_video_likes_table():
    """Auto-add the video_likes table if missing (one like per student per video).
    Same self-heal pattern as _ensure_video_comments_table: try pg-meta, then psql."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY or not service_supabase:
        return
    try:
        service_supabase.table("video_likes").select("id").limit(1).execute()
        return
    except Exception:
        pass

    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    ddl = """
        CREATE TABLE IF NOT EXISTS video_likes (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            video_id    UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
            student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            created_at  TIMESTAMPTZ DEFAULT now(),
            UNIQUE (video_id, student_id)
        );
        CREATE INDEX IF NOT EXISTS idx_video_likes_video ON video_likes(video_id);
        CREATE INDEX IF NOT EXISTS idx_video_likes_student ON video_likes(student_id);
        ALTER TABLE video_likes ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "deny_all_video_likes" ON video_likes;
        CREATE POLICY "deny_all_video_likes" ON video_likes FOR ALL USING (false);
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/pg-meta/v0/query", headers=headers, json={"query": ddl}
            )
            if resp.is_success:
                print("[*] Auto-migrated: video_likes table (pg-meta)")
                return
            raise Exception(f"pg-meta query: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"[!] pg-meta migrate failed for video_likes: {e}")

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("[!] DATABASE_URL not set — cannot self-create video_likes.")
        print("[!] Run the video_likes block from backend/schema.sql in the Supabase SQL Editor.")
        return
    try:
        proc = await asyncio.to_thread(
            lambda: subprocess.run(
                ["psql", db_url, "-v", "ON_ERROR_STOP=1", "-c", ddl],
                capture_output=True, timeout=20,
            )
        )
        if proc.returncode == 0:
            print("[*] Auto-migrated: video_likes table (psql)")
        else:
            print(f"[!] psql migrate failed for video_likes: {proc.stderr.decode(errors='replace')[:300]}")
            print("[!] Run the video_likes block from backend/schema.sql in the Supabase SQL Editor.")
    except Exception as e:
        print(f"[!] psql migrate error for video_likes: {e}")
        print("[!] Run the video_likes block from backend/schema.sql in the Supabase SQL Editor.")


_VIDEO_LIKES_OK = None

def _video_likes_enabled() -> bool:
    """True once the video_likes table exists (graceful degrade before migration)."""
    global _VIDEO_LIKES_OK
    if _VIDEO_LIKES_OK:
        return True
    if not service_supabase:
        return False
    try:
        service_supabase.table("video_likes").select("id").limit(1).execute()
        _VIDEO_LIKES_OK = True
    except Exception:
        _VIDEO_LIKES_OK = False
    return bool(_VIDEO_LIKES_OK)


_REATTEMPT_OK = None

def _reattempt_enabled() -> bool:
    """True once the test_reattempt_requests table exists. The grant is tracked
    by that table's row status ('approved'), NOT by a test_attempts.reattempt_allowed
    column — hosted Supabase doesn't expose the pg-meta API the auto-migration used,
    so that column can never be added programmatically. Keying off the table (which
    DOES exist) makes the whole feature work with no manual migration."""
    global _REATTEMPT_OK
    if _REATTEMPT_OK:
        return True
    if not service_supabase:
        return False
    try:
        service_supabase.table("test_reattempt_requests").select("id").limit(1).execute()
        _REATTEMPT_OK = True
    except Exception:
        _REATTEMPT_OK = False
    return bool(_REATTEMPT_OK)


def _has_approved_reattempt(test_id: str, student_id: str) -> bool:
    """A teacher-approved-but-not-yet-consumed re-attempt grant lives as an
    'approved' row in test_reattempt_requests (source of truth — no DB column)."""
    if not service_supabase:
        return False
    try:
        r = service_supabase.table("test_reattempt_requests").select("id") \
            .eq("test_id", test_id).eq("student_id", student_id).eq("status", "approved").limit(1).execute()
        return bool(r.data)
    except Exception:
        return False


_ASSIGN_REATTEMPT_OK = None

def _assignment_reattempt_enabled() -> bool:
    """True once assignment_reattempt_requests exists. Same self-healing probe as
    _reattempt_enabled so assignment re-attempt degrades gracefully pre-migration."""
    global _ASSIGN_REATTEMPT_OK
    if _ASSIGN_REATTEMPT_OK:
        return True
    if not service_supabase:
        return False
    try:
        service_supabase.table("assignment_reattempt_requests").select("id").limit(1).execute()
        _ASSIGN_REATTEMPT_OK = True
    except Exception:
        _ASSIGN_REATTEMPT_OK = False
    return bool(_ASSIGN_REATTEMPT_OK)


async def _ensure_notes_bucket():
    """Create the public 'notes' storage bucket if it doesn't exist."""
    if not service_supabase or filestore.is_r2_enabled():
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
            now_iso = datetime.now(timezone.utc).isoformat()
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
        await _ensure_reattempt_table()
        await _ensure_video_comments_table()
        await _ensure_video_likes_table()
        await _ensure_notes_bucket()
    except Exception as e:
        print(f"[!] deferred startup migrations error (ignored): {e}")


@app.on_event("startup")
async def startup_event():
    await _ensure_plain_password_column()
    await _ensure_live_class_columns()
    if not _load_fcm_sa():
        print("[!] Android push disabled: FCM_SERVICE_ACCOUNT_JSON is not configured")
    # Fire-and-forget: do NOT await — these must not delay login readiness.
    asyncio.create_task(_deferred_startup_migrations())
    asyncio.create_task(_broadcast_cleanup_loop())
    asyncio.create_task(_whatsapp_scheduler_loop())
    asyncio.create_task(_backup_scheduler_loop())
    # Live-class reminders are now scheduled ON-DEVICE (AlarmManager, see the Android
    # LiveAlarm plugin) for reliable full-screen alarms even when the app is closed.
    # The push-based loop is left in place but NOT started, to avoid double alarms.
    # asyncio.create_task(_live_class_reminder_loop())


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
    parent_phone: Optional[str] = None
    # Simple profile-icon choice ('male' | 'female' | 'default'). Stored in
    # avatar_url as a sentinel ("preset:male") the frontend resolves to a
    # bundled icon; 'default' clears it back to the neutral icon. Uploaded
    # photos go through POST /students/me/avatar instead.
    avatar_preset: Optional[str] = None

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
    phone: Optional[str] = None
    standard_id: Optional[str] = None
    parent_phone: Optional[str] = None

class ResetPasswordRequest(BaseModel):
    new_password: Optional[str] = None

class BulkIdsRequest(BaseModel):
    ids: List[str]

class BulkMoveRequest(BaseModel):
    ids: List[str]
    standard_id: str

class BulkBlockRequest(BaseModel):
    ids: List[str]
    blocked: bool

class BulkResetRequest(BaseModel):
    ids: List[str]
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
            message["created_at"] = datetime.now(timezone.utc).isoformat()
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

class LiveClassManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, standard_id: str):
        await websocket.accept()
        if standard_id not in self.active_connections:
            self.active_connections[standard_id] = []
        self.active_connections[standard_id].append(websocket)
        
    def disconnect(self, websocket: WebSocket, standard_id: str):
        if standard_id in self.active_connections and websocket in self.active_connections[standard_id]:
            self.active_connections[standard_id].remove(websocket)
            
    async def broadcast(self, standard_id: str, message: dict):
        if standard_id in self.active_connections:
            dead = []
            for conn in self.active_connections[standard_id]:
                try:
                    await conn.send_json(message)
                except Exception:
                    dead.append(conn)
            for d in dead:
                self.disconnect(d, standard_id)

lc_manager = LiveClassManager()

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


async def zoom_get_fresh_start_url(meeting_id: str) -> Optional[str]:
    """Fetch a FRESH host start_url from Zoom's Get-a-Meeting endpoint.

    The start_url returned at creation time embeds a host ZAK that EXPIRES (~2h),
    so a class scheduled in advance and started later opens to a BLANK page. Zoom
    regenerates a valid start_url on every GET /meetings/{id}, so we re-fetch at
    'Start class' click time. Returns None on any failure so the caller can fall
    back to the stored URL."""
    import httpx
    if not meeting_id:
        return None
    try:
        token = await zoom_get_token()
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.zoom.us/v2/meetings/{meeting_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0,
            )
        if resp.status_code == 200:
            return resp.json().get("start_url") or None
        print(f"[!] Zoom fresh start_url fetch HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        print(f"[!] Zoom fresh start_url fetch failed (ignored): {e}")
    return None


# Short cache of "is this meeting live?" so the frequently-polled class list
# doesn't hammer the Zoom API. meeting_id -> (True|False|None, expires_at).
_zoom_live_cache: dict = {}
_ZOOM_LIVE_TTL = 60.0


async def zoom_meeting_live_state(meeting_id: str):
    """Tri-state liveness from Zoom's Get-a-Meeting endpoint: True (started),
    False (definitively not running — actual 200 response), None (API error /
    unknown). Auto-END decisions must only act on a definitive False; a
    transient API failure must never end a running class. Cached briefly.
    Never raises."""
    import httpx
    if not meeting_id:
        return False
    hit = _zoom_live_cache.get(meeting_id)
    if hit and time_module.time() < hit[1]:
        return hit[0]
    state = None
    try:
        token = await zoom_get_token()
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.zoom.us/v2/meetings/{meeting_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0,
            )
        if resp.status_code == 200:
            state = resp.json().get("status") == "started"
    except Exception as e:
        print(f"[!] Zoom live-status check failed (state unknown): {e}")
    _zoom_live_cache[meeting_id] = (state, time_module.time() + _ZOOM_LIVE_TTL)
    return state


async def zoom_is_meeting_live(meeting_id: str) -> bool:
    """True only when Zoom definitively reports the meeting started."""
    return (await zoom_meeting_live_state(meeting_id)) is True


# "Only the host can share their screen" — enforced at the Zoom account level so
# even someone joining from a native Zoom app (outside our web client, which
# already hides the Share button for students) cannot share. Best-effort, once
# per process; a failure only means the in-app lockdown stands alone.
_zoom_share_lock_done = False


async def zoom_enforce_host_only_share() -> None:
    global _zoom_share_lock_done
    import httpx
    if _zoom_share_lock_done:
        return
    try:
        token = await zoom_get_token()
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                "https://api.zoom.us/v2/users/me/settings",
                json={"in_meeting": {
                    "screen_sharing": True,
                    "who_can_share_screen": "host",
                    "who_can_share_screen_when_someone_is_sharing": "host",
                }},
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                timeout=10.0,
            )
        if resp.status_code in (200, 204):
            _zoom_share_lock_done = True
            print("[*] Zoom: who_can_share_screen locked to host")
        else:
            print(f"[!] Zoom host-only-share PATCH returned {resp.status_code} (ignored): {resp.text[:200]}")
    except Exception as e:
        print(f"[!] Zoom host-only-share enforcement failed (ignored): {e}")


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


def _invalidate_auth_cache_for_user(user_id: str):
    # Drop every cached token for this user so flag changes (must_change_pwd,
    # role, block) are visible on the very next request instead of after TTL.
    stale = [t for t, v in _auth_cache.items() if v["result"].get("user_id") == user_id]
    for t in stale:
        _auth_cache.pop(t, None)


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
    except Exception:
        raise HTTPException(status_code=401, detail="Token verification failed or session expired")

# Auth
# ─── TWO-STEP VERIFICATION (email OTP, teachers only) ───────────────────────
# Enabled via Settings → Security ("security_two_step_verification" in
# teacher_settings.json). Codes are emailed through Resend (RESEND_API_KEY in
# .env). A device that passes OTP once is trusted for 30 days, keyed by the
# same device_fingerprint the frontend already sends on every login.

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
RESEND_FROM = os.environ.get("RESEND_FROM", "").strip() or "onboarding@resend.dev"
TRUSTED_DEVICES_FILE = Path(__file__).resolve().parent / "trusted_devices.json"
OTP_TTL_SECS = 5 * 60
OTP_MAX_ATTEMPTS = 5
OTP_MAX_RESENDS = 3
OTP_RESEND_COOLDOWN_SECS = 60
TRUSTED_DEVICE_DAYS = 30

_otp_pending: dict = {}   # pending_id -> {otp_hash, email, expires, attempts, resends, last_sent, token, refresh_token, user_info}


def _otp_hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _generate_otp_code() -> str:
    import secrets as _secrets, string as _string
    return ''.join(_secrets.choice(_string.digits) for _ in range(6))


def _mask_email(email: str) -> str:
    try:
        local, domain = email.split("@", 1)
        if len(local) <= 2:
            masked = local[0] + "*"
        else:
            masked = local[0] + "*" * (len(local) - 2) + local[-1]
        return f"{masked}@{domain}"
    except Exception:
        return email


def _load_trusted_devices() -> dict:
    try:
        if TRUSTED_DEVICES_FILE.exists():
            return json.loads(TRUSTED_DEVICES_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _save_trusted_devices(data: dict):
    try:
        TRUSTED_DEVICES_FILE.write_text(json.dumps(data, indent=1), encoding="utf-8")
    except Exception as e:
        print(f"[otp] could not persist trusted devices: {e}")


def _is_device_trusted(user_id: str, fingerprint: str) -> bool:
    if not fingerprint:
        return False
    devices = _load_trusted_devices()
    exp = devices.get(f"{user_id}:{fingerprint}")
    if not exp:
        return False
    try:
        return datetime.fromisoformat(exp) > datetime.now(timezone.utc)
    except Exception:
        return False


def _trust_device(user_id: str, fingerprint: str):
    if not fingerprint:
        return
    devices = _load_trusted_devices()
    now = datetime.now(timezone.utc)
    # prune expired entries while we're here
    pruned = {}
    for k, v in devices.items():
        try:
            if datetime.fromisoformat(v) > now:
                pruned[k] = v
        except Exception:
            pass
    pruned[f"{user_id}:{fingerprint}"] = (now + timedelta(days=TRUSTED_DEVICE_DAYS)).isoformat()
    _save_trusted_devices(pruned)


def send_otp_email(to_email: str, code: str) -> bool:
    """Send the 6-digit login code via Resend. Returns False on any failure."""
    if not RESEND_API_KEY:
        return False
    lms = (get_teacher_settings().get("lms_name") or "Tutoria").strip() or "Tutoria"
    try:
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json={
                "from": f"{lms} <{RESEND_FROM}>",
                "to": [to_email],
                "subject": f"{code} is your {lms} login code",
                "html": (
                    f"<div style='font-family:sans-serif;max-width:420px'>"
                    f"<h2 style='margin-bottom:4px'>{lms}</h2>"
                    f"<p>Your login verification code is:</p>"
                    f"<p style='font-size:32px;font-weight:bold;letter-spacing:6px;margin:12px 0'>{code}</p>"
                    f"<p style='color:#666'>It expires in 5 minutes. If you didn't try to log in, you can ignore this email.</p>"
                    f"</div>"
                ),
            },
            timeout=15,
        )
        if r.status_code in (200, 201):
            return True
        print(f"[otp] Resend send failed: {r.status_code} {r.text[:200]}")
        return False
    except Exception as e:
        print(f"[otp] Resend send error: {e}")
        return False


def _prune_otp_pending():
    now = time_module.time()
    for k in [k for k, v in _otp_pending.items() if v["expires"] < now]:
        _otp_pending.pop(k, None)


class VerifyOtpRequest(BaseModel):
    pending_id: str
    code: str
    device_fingerprint: Optional[str] = None


class ResendOtpRequest(BaseModel):
    pending_id: str


# ── Login rate limiting (Cloudflare-aware, in-memory sliding window) ──
# Keyed on the real client IP (CF-Connecting-IP behind Cloudflare, not the socket
# address). Fails OPEN on any internal error so a bug can never lock users out.
# OTP endpoints already cap attempts/resends separately.
_login_attempts: dict = {}
LOGIN_RL_MAX = 8
LOGIN_RL_WINDOW = 300  # seconds

def _client_ip(request: Request) -> str:
    return (request.headers.get("cf-connecting-ip")
            or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown"))

def login_rate_limit(request: Request):
    try:
        ip = _client_ip(request)
        now = time_module.time()
        hits = [t for t in _login_attempts.get(ip, []) if now - t < LOGIN_RL_WINDOW]
        if len(hits) >= LOGIN_RL_MAX:
            raise HTTPException(status_code=429, detail="Too many login attempts. Please wait a few minutes and try again.")
        hits.append(now)
        _login_attempts[ip] = hits
        if len(_login_attempts) > 5000:  # bound memory
            stale = [k for k, v in _login_attempts.items() if not any(now - t < LOGIN_RL_WINDOW for t in v)]
            for k in stale:
                _login_attempts.pop(k, None)
    except HTTPException:
        raise
    except Exception:
        pass  # fail open

@app.post("/api/auth/login")
def login(request: LoginRequest, _rl: None = Depends(login_rate_limit)):
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
                        "last_active_at": datetime.now(timezone.utc).isoformat()
                    }, on_conflict="student_id").execute()
                except Exception as e:
                    print(f"Session tracking failed: {e}")

        # ── Two-step verification (teachers only, new devices only) ──
        if role == "teacher" and get_teacher_settings().get("security_two_step_verification"):
            if not RESEND_API_KEY:
                # Never lock the teacher out because email isn't configured.
                print("[otp] 2FA enabled but RESEND_API_KEY missing — skipping OTP")
            elif _is_device_trusted(user.id, request.device_fingerprint or ""):
                pass  # trusted device → normal login
            else:
                import secrets as _secrets
                _prune_otp_pending()
                code = _generate_otp_code()
                if not send_otp_email(user.email, code):
                    raise HTTPException(status_code=503, detail="Could not send the verification code. Please try again.")
                pending_id = _secrets.token_urlsafe(32)
                _otp_pending[pending_id] = {
                    "otp_hash": _otp_hash(code),
                    "email": user.email,
                    "user_id": user.id,
                    "expires": time_module.time() + OTP_TTL_SECS,
                    "attempts": 0,
                    "resends": 0,
                    "last_sent": time_module.time(),
                    "token": response.session.access_token,
                    "refresh_token": response.session.refresh_token,
                    "user_info": user_info,
                }
                return {
                    "requires_otp": True,
                    "pending_id": pending_id,
                    "email_masked": _mask_email(user.email),
                }

        return {
            "token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "user": user_info,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid credentials")


@app.post("/api/auth/verify-otp")
def verify_otp(request: VerifyOtpRequest):
    _prune_otp_pending()
    entry = _otp_pending.get(request.pending_id)
    if not entry:
        raise HTTPException(status_code=400, detail="Code expired. Please log in again.")
    entry["attempts"] += 1
    if entry["attempts"] > OTP_MAX_ATTEMPTS:
        _otp_pending.pop(request.pending_id, None)
        raise HTTPException(status_code=429, detail="Too many attempts. Please log in again.")
    if _otp_hash(request.code.strip()) != entry["otp_hash"]:
        raise HTTPException(status_code=401, detail="Incorrect code. Please check your email and try again.")
    # Success — release the held session and trust this device for 30 days.
    _otp_pending.pop(request.pending_id, None)
    _trust_device(entry["user_id"], request.device_fingerprint or "")
    return {
        "token": entry["token"],
        "refresh_token": entry["refresh_token"],
        "user": entry["user_info"],
    }


@app.post("/api/auth/resend-otp")
def resend_otp(request: ResendOtpRequest):
    _prune_otp_pending()
    entry = _otp_pending.get(request.pending_id)
    if not entry:
        raise HTTPException(status_code=400, detail="Code expired. Please log in again.")
    if entry["resends"] >= OTP_MAX_RESENDS:
        raise HTTPException(status_code=429, detail="Resend limit reached. Please log in again.")
    wait = OTP_RESEND_COOLDOWN_SECS - (time_module.time() - entry["last_sent"])
    if wait > 0:
        raise HTTPException(status_code=429, detail=f"Please wait {int(wait)}s before resending.")
    code = _generate_otp_code()
    if not send_otp_email(entry["email"], code):
        raise HTTPException(status_code=503, detail="Could not send the verification code. Please try again.")
    entry["otp_hash"] = _otp_hash(code)            # old code becomes invalid
    entry["resends"] += 1
    entry["last_sent"] = time_module.time()
    entry["expires"] = time_module.time() + OTP_TTL_SECS
    entry["attempts"] = 0
    return {"message": "Code re-sent", "email_masked": _mask_email(entry["email"])}

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
    email: Optional[str] = None

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

    # Email change = login identifier change. Teacher-only (students log in by
    # student code/phone and their email is teacher-managed via /students/{id}).
    new_email = (request.email or "").strip().lower()
    if new_email:
        if user["role"] != "teacher":
            raise HTTPException(status_code=403, detail="Only teachers can change their login email")
        import re as _re
        if not _re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", new_email):
            raise HTTPException(status_code=400, detail="Invalid email address")
        try:
            # email_confirm=True applies it immediately (no confirmation mail) —
            # the teacher logs in with the new address right away.
            service_supabase.auth.admin.update_user_by_id(
                user["user_id"], {"email": new_email, "email_confirm": True})
        except Exception as e:
            msg = str(e)
            if "already" in msg.lower() or "registered" in msg.lower():
                raise HTTPException(status_code=400, detail="That email is already in use by another account")
            raise HTTPException(status_code=400, detail=f"Could not change email: {msg}")
        # Keep the sub_teachers profile row in sync if this account is a team member.
        try:
            service_supabase.table("sub_teachers").update({"email": new_email}).eq("id", user["user_id"]).execute()
        except Exception:
            pass
        return {"message": "Profile updated", "email": new_email}
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
        # The auth cache still holds must_change_pwd=True for this token — drop it
        # so the immediate /auth/me re-check sees the cleared flag (otherwise the
        # frontend guard bounces the student back to the change-password page).
        _invalidate_auth_cache_for_user(user["user_id"])
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

def _parse_answers(raw):
    """test_attempts.answers JSONB → dict (supabase-py may return a JSON string)."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return {}
    return raw if isinstance(raw, dict) else {}

def _detect_copy_suspects(tests, questions_by_test, attempts_by_test, student_name_map,
                          subject_name, class_std):
    """Deterministic answer-similarity check: for each recent test, compare every
    non-topper attempt against the test's top-3 scorers. The load-bearing signal
    is IDENTICAL WRONG answers — two students independently getting the same
    questions wrong with the same wrong option is unlikely; combined with the
    anti-cheat events recorded at submit time it yields a suspicion score.
    Never flags a topper against themselves. Returns at most 10 items."""
    suspects = []
    for t in tests:
        qs = questions_by_test.get(t["id"], [])
        attempts = attempts_by_test.get(t["id"], [])
        if len(attempts) < 3 or len(qs) < 5:
            continue
        correct = {str(q["id"]): q.get("correct_idx") for q in qs}

        parsed = []
        for a in attempts:
            answers = {str(k): v for k, v in _parse_answers(a.get("answers")).items()
                       if v is not None}
            if len(answers) < 5:
                continue
            parsed.append({**a, "_answers": answers})
        if len(parsed) < 3:
            continue

        parsed.sort(key=lambda a: (a.get("score") or 0), reverse=True)
        toppers = parsed[:3]
        topper_ids = {a["student_id"] for a in toppers}

        for a in parsed:
            if a["student_id"] in topper_ids:
                continue
            best = None
            for top in toppers:
                if top["student_id"] == a["student_id"]:
                    continue
                common = [q for q in a["_answers"] if q in top["_answers"]]
                if len(common) < 5:
                    continue
                identical = sum(1 for q in common if str(a["_answers"][q]) == str(top["_answers"][q]))
                wrong_overlap = sum(
                    1 for q in common
                    if str(a["_answers"][q]) == str(top["_answers"][q])
                    and str(a["_answers"][q]) != str(correct.get(q)))
                a_wrong = sum(1 for q in common if str(a["_answers"][q]) != str(correct.get(q)))
                overlap_pct = identical / len(common)
                cand = (wrong_overlap, overlap_pct, top, a_wrong)
                if best is None or (cand[0], cand[1]) > (best[0], best[1]):
                    best = cand
            if not best:
                continue
            wrong_overlap, overlap_pct, top, a_wrong = best
            cheat_events = a.get("cheat_events") or []
            if isinstance(cheat_events, str):
                try: cheat_events = json.loads(cheat_events)
                except Exception: cheat_events = []
            score = 0
            if overlap_pct >= 0.90: score += 2
            if a_wrong >= 3 and wrong_overlap / a_wrong >= 0.8: score += 3
            score += min(2, len(cheat_events))
            if a.get("flagged"): score += 1
            if score < 2:
                continue
            suspects.append({
                "test_id": t["id"],
                "test_title": t.get("title"),
                "subject": subject_name.get(t.get("class_id"), ""),
                "class_id": t.get("class_id"),
                "standard_id": class_std.get(t.get("class_id")),
                "student_id": a["student_id"],
                "student_name": student_name_map.get(a["student_id"], "Student"),
                "score": a.get("score"),
                "overlap_pct": round(overlap_pct * 100),
                "wrong_overlap": wrong_overlap,
                "wrong_count": a_wrong,
                "matched_with": student_name_map.get(top["student_id"], "Topper"),
                "cheat_event_count": len(cheat_events),
                "flagged": bool(a.get("flagged")),
                "suspicion": "high" if score >= 4 else "medium",
                "_score": score,
                "submitted_at": a.get("submitted_at"),
            })
    suspects.sort(key=lambda s: s["_score"], reverse=True)
    for s in suspects:
        s.pop("_score", None)
    return suspects[:10]

@app.get("/api/dashboard/insights")
async def get_dashboard_insights(user = Depends(verify_token)):
    """Heavier companion to /dashboard/overview: actionable class insights —
    suspected answer-copying vs test toppers, students behind on videos, videos
    nobody watches, assignment submission gaps, live-class absentees, and a
    weekly/monthly activity snapshot. Computed on request from existing tables;
    teacher only, never includes student contact info."""
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    teacher_id = user["teacher_id"]
    now = datetime.now(timezone.utc)
    d7 = (now - timedelta(days=7)).isoformat()
    d30 = (now - timedelta(days=30)).isoformat()

    empty = {
        "copy_suspects": {"count": 0, "items": []},
        "video_laggards": {"count": 0, "items": []},
        "cold_videos": {"count": 0, "items": []},
        "assignment_status": {"count": 0, "items": []},
        "live_absentees": {"count": 0, "items": []},
        "period_snapshot": {
            "weekly":  {"avg_score": 0, "attempts": 0, "attendance_pct": 0, "videos_completed": 0, "assignments_submitted": 0},
            "monthly": {"avg_score": 0, "attempts": 0, "attendance_pct": 0, "videos_completed": 0, "assignments_submitted": 0},
        },
        "computed_at": now.isoformat(),
    }

    stds_res = await asyncio.to_thread(lambda: service_supabase.table("standards").select(
        "id, name").eq("teacher_id", teacher_id).execute())
    standards = stds_res.data or []
    if not standards:
        return empty
    standard_ids = [s["id"] for s in standards]
    std_name = {s["id"]: s.get("name", "") for s in standards}

    def fetch_subs(): return service_supabase.table("subject_classes").select(
        "id, name, standard_id").in_("standard_id", standard_ids).execute()
    def fetch_studs(): return service_supabase.table("students").select(
        "id, name, standard_id, avatar_url").in_("standard_id", standard_ids).execute()
    subs_res, studs_res = await asyncio.gather(
        asyncio.to_thread(fetch_subs), asyncio.to_thread(fetch_studs))
    subjects = subs_res.data or []
    students = studs_res.data or []
    if not subjects or not students:
        return empty

    class_ids = [c["id"] for c in subjects]
    subject_name = {c["id"]: c.get("name", "") for c in subjects}
    class_std = {c["id"]: c.get("standard_id") for c in subjects}
    student_ids = [s["id"] for s in students]
    roster_ids = set(student_ids)
    student_name_map = {s["id"]: s.get("name", "Student") for s in students}
    # Students per standard — denominators for video/assignment/live coverage.
    std_rosters: dict = {}
    for s in students:
        std_rosters.setdefault(s.get("standard_id"), []).append(s["id"])

    def fetch_tests(): return service_supabase.table("tests").select(
        "id, title, class_id, created_at").in_("class_id", class_ids).order(
        "created_at", desc=True).limit(10).execute()
    def fetch_videos(): return service_supabase.table("videos").select(
        "id, title, class_id, created_at").in_("class_id", class_ids).execute()
    def fetch_assignments(): return service_supabase.table("assignments").select(
        "id, title, class_id, due_date, created_at").in_("class_id", class_ids).order(
        "created_at", desc=True).limit(10).execute()
    def fetch_live(): return service_supabase.table("live_classes").select(
        "id, title, class_id, scheduled_at").in_("class_id", class_ids).eq(
        "status", "ended").gte("scheduled_at", d30).order(
        "scheduled_at", desc=True).limit(20).execute()
    def fetch_att_30(): return service_supabase.table("attendance_records").select(
        "student_id, status, date").in_("subject_class_id", class_ids).gte(
        "date", d30[:10]).execute()
    def fetch_attempts_30(): return service_supabase.table("test_attempts").select(
        "student_id, score, submitted_at, tests!inner(class_id, total_marks)").in_(
        "student_id", student_ids).gte("submitted_at", d30).execute()
    def fetch_subm_30(): return service_supabase.table("assignment_submissions").select(
        "student_id, submitted_at").in_("student_id", student_ids).gte(
        "submitted_at", d30).execute()

    (tests_res, videos_res, asg_res, live_res,
     att30_res, atm30_res, sub30_res) = await asyncio.gather(
        asyncio.to_thread(fetch_tests), asyncio.to_thread(fetch_videos),
        asyncio.to_thread(fetch_assignments), asyncio.to_thread(fetch_live),
        asyncio.to_thread(fetch_att_30), asyncio.to_thread(fetch_attempts_30),
        asyncio.to_thread(fetch_subm_30))

    tests = tests_res.data or []
    videos = videos_res.data or []
    assignments = asg_res.data or []
    live_classes = live_res.data or []

    test_ids = [t["id"] for t in tests]
    video_ids = [v["id"] for v in videos]
    assignment_ids = [a["id"] for a in assignments]
    live_ids = [lc["id"] for lc in live_classes]

    def fetch_questions():
        if not test_ids: return None
        return service_supabase.table("questions").select(
            "id, test_id, correct_idx").in_("test_id", test_ids).execute()
    def fetch_test_attempts():
        if not test_ids: return None
        return service_supabase.table("test_attempts").select(
            "test_id, student_id, score, answers, flagged, cheat_events, submitted_at").in_(
            "test_id", test_ids).execute()
    def fetch_video_progress():
        if not video_ids: return None
        return service_supabase.table("video_progress").select(
            "video_id, student_id, completed, last_watched_at").in_("video_id", video_ids).execute()
    def fetch_submissions():
        if not assignment_ids: return None
        return service_supabase.table("assignment_submissions").select(
            "assignment_id, student_id").in_("assignment_id", assignment_ids).execute()
    def fetch_live_att():
        if not live_ids: return None
        return service_supabase.table("live_class_attendance").select(
            "live_class_id, student_id, attended").in_("live_class_id", live_ids).execute()

    (q_res, ta_res, vp_res, asub_res, la_res) = await asyncio.gather(
        asyncio.to_thread(fetch_questions), asyncio.to_thread(fetch_test_attempts),
        asyncio.to_thread(fetch_video_progress), asyncio.to_thread(fetch_submissions),
        asyncio.to_thread(fetch_live_att))

    questions = (q_res.data or []) if q_res else []
    attempts = (ta_res.data or []) if ta_res else []
    video_progress = (vp_res.data or []) if vp_res else []
    submissions = (asub_res.data or []) if asub_res else []
    live_att = (la_res.data or []) if la_res else []

    # ── 1. Copy suspects ──────────────────────────────────────────────────────
    questions_by_test: dict = {}
    for q in questions:
        questions_by_test.setdefault(q["test_id"], []).append(q)
    attempts_by_test: dict = {}
    for a in attempts:
        if a.get("student_id") in roster_ids:
            attempts_by_test.setdefault(a["test_id"], []).append(a)
    copy_suspects = _detect_copy_suspects(
        tests, questions_by_test, attempts_by_test, student_name_map, subject_name, class_std)

    # ── 2. Video laggards + cold videos ───────────────────────────────────────
    videos_per_std: dict = {}
    for v in videos:
        sid_std = class_std.get(v.get("class_id"))
        if sid_std:
            videos_per_std.setdefault(sid_std, []).append(v["id"])
    watched_by_student: dict = {}
    watchers_by_video: dict = {}
    for vp in video_progress:
        sid = vp.get("student_id")
        if sid not in roster_ids:
            continue
        watched_by_student.setdefault(sid, set()).add(vp.get("video_id"))
        watchers_by_video.setdefault(vp.get("video_id"), set()).add(sid)

    video_laggards = []
    for s in students:
        std_vids = videos_per_std.get(s.get("standard_id"), [])
        if len(std_vids) < 3:
            continue
        watched = len(watched_by_student.get(s["id"], set()) & set(std_vids))
        pct = round(watched / len(std_vids) * 100)
        if pct < 40:
            video_laggards.append({
                "student_id": s["id"], "name": s.get("name"),
                "standard_name": std_name.get(s.get("standard_id"), ""),
                "videos_watched": watched, "videos_total": len(std_vids),
                "completion_pct": pct,
            })
    video_laggards.sort(key=lambda x: x["completion_pct"])
    laggard_count = len(video_laggards)
    video_laggards = video_laggards[:8]

    cold_videos = []
    cutoff_48h = now - timedelta(hours=48)
    for v in sorted(videos, key=lambda v: v.get("created_at") or "", reverse=True)[:6]:
        created = _parse_ts(v.get("created_at"))
        if created and created > cutoff_48h:
            continue  # too new to judge
        std = class_std.get(v.get("class_id"))
        total = len(std_rosters.get(std, []))
        if not total:
            continue
        watched = len(watchers_by_video.get(v["id"], set()))
        pct = round(watched / total * 100)
        if pct < 50:
            cold_videos.append({
                "video_id": v["id"], "title": v.get("title"),
                "subject": subject_name.get(v.get("class_id"), ""),
                "class_id": v.get("class_id"), "standard_id": std,
                "watched": watched, "total": total, "watch_pct": pct,
                "created_at": v.get("created_at"),
            })
    cold_videos.sort(key=lambda x: x["watch_pct"])
    cold_videos = cold_videos[:6]

    # ── 3. Assignment submission status ───────────────────────────────────────
    submitted_by_asg: dict = {}
    for sub in submissions:
        if sub.get("student_id") in roster_ids:
            submitted_by_asg.setdefault(sub["assignment_id"], set()).add(sub["student_id"])
    assignment_status = []
    for a in assignments:
        std = class_std.get(a.get("class_id"))
        roster = std_rosters.get(std, [])
        if not roster:
            continue
        done = submitted_by_asg.get(a["id"], set())
        missing = [sid for sid in roster if sid not in done]
        if not missing:
            continue
        due = _parse_ts(a.get("due_date"))
        assignment_status.append({
            "assignment_id": a["id"], "title": a.get("title"),
            "subject": subject_name.get(a.get("class_id"), ""),
            "class_id": a.get("class_id"), "standard_id": std,
            "due_date": a.get("due_date"),
            "overdue": bool(due and due < now),
            "submitted": len(done), "total": len(roster),
            "missing_count": len(missing),
            "missing_preview": [student_name_map.get(sid, "Student") for sid in missing[:3]],
        })
    assignment_status.sort(key=lambda x: (not x["overdue"], x["due_date"] or "9999"))
    asg_count = len(assignment_status)
    assignment_status = assignment_status[:8]

    # ── 4. Live class absentees ───────────────────────────────────────────────
    live_by_std: dict = {}
    for lc in live_classes:
        std = class_std.get(lc.get("class_id"))
        if std:
            live_by_std.setdefault(std, []).append(lc)
    attended_set = {(r["live_class_id"], r["student_id"])
                    for r in live_att if r.get("attended")}
    live_absentees = []
    for s in students:
        classes = live_by_std.get(s.get("standard_id"), [])
        if not classes:
            continue
        missed = [lc for lc in classes if (lc["id"], s["id"]) not in attended_set]
        total = len(classes)
        miss_pct = round(len(missed) / total * 100)
        if len(missed) >= 2 or (total >= 2 and miss_pct >= 50):
            live_absentees.append({
                "student_id": s["id"], "name": s.get("name"),
                "standard_name": std_name.get(s.get("standard_id"), ""),
                "missed": len(missed), "total": total, "miss_pct": miss_pct,
                "last_missed_title": missed[0].get("title") if missed else None,
            })
    live_absentees.sort(key=lambda x: (-x["missed"], -x["miss_pct"]))
    absentee_count = len(live_absentees)
    live_absentees = live_absentees[:8]

    # ── 5. Weekly / monthly snapshot (fetch 30d once, split in Python) ────────
    def snapshot(start_iso):
        scores = []
        for a in (atm30_res.data or []):
            if (a.get("submitted_at") or "") < start_iso:
                continue
            t = a.get("tests") or {}
            tm = t.get("total_marks")
            if a.get("score") is not None and tm:
                scores.append(a["score"] / tm * 100)
        att_rows = [r for r in (att30_res.data or [])
                    if (r.get("date") or "") >= start_iso[:10] and r.get("student_id") in roster_ids]
        att_ok = sum(1 for r in att_rows if r.get("status") in ("present", "late"))
        vids = sum(1 for vp in video_progress
                   if vp.get("completed") and (vp.get("last_watched_at") or "") >= start_iso
                   and vp.get("student_id") in roster_ids)
        subs = sum(1 for r in (sub30_res.data or []) if (r.get("submitted_at") or "") >= start_iso)
        return {
            "avg_score": round(sum(scores) / len(scores)) if scores else 0,
            "attempts": len(scores),
            "attendance_pct": round(att_ok / len(att_rows) * 100) if att_rows else 0,
            "videos_completed": vids,
            "assignments_submitted": subs,
        }

    return {
        "copy_suspects": {"count": len(copy_suspects), "items": copy_suspects},
        "video_laggards": {"count": laggard_count, "items": video_laggards},
        "cold_videos": {"count": len(cold_videos), "items": cold_videos},
        "assignment_status": {"count": asg_count, "items": assignment_status},
        "live_absentees": {"count": absentee_count, "items": live_absentees},
        "period_snapshot": {"weekly": snapshot(d7), "monthly": snapshot(d30)},
        "computed_at": now.isoformat(),
    }

# Standards CRUD
# Orphans only ever appear from a one-time DB/migration seed, so claiming them
# once per teacher per process is enough — re-querying Supabase on every
# /standards and /subjects request added a redundant round-trip (~hundreds of ms
# each) to the app's hot boot path. A process restart (every deploy) re-runs it,
# preserving the self-healing behaviour.
_orphans_claimed_for = set()

def _claim_orphan_standards(teacher_id):
    """Assign any orphaned (teacher_id IS NULL) standards to this teacher.
    Such standards come from DB/migration seeds; without an owner they are
    invisible to the teacher in the list AND unmanageable (create_subject etc.
    reject them), yet enrolled students still see their subjects — which looks
    like "students see subjects the teacher can't". This is a single-primary-
    teacher app, so claiming is safe and self-healing, mirroring the claim-on-
    write already done in standard update/delete. Idempotent + best-effort."""
    if not service_supabase or not teacher_id or teacher_id in _orphans_claimed_for:
        return
    try:
        orphans = service_supabase.table("standards").select("id").is_("teacher_id", "null").execute()
        if orphans.data:
            service_supabase.table("standards").update({"teacher_id": teacher_id}).is_("teacher_id", "null").execute()
        _orphans_claimed_for.add(teacher_id)
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
                await asyncio.to_thread(lambda: filestore.remove(service_supabase, "videos", storage_video_paths, public=True))
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
                await asyncio.to_thread(lambda: filestore.remove(service_supabase, "avatars", avatar_paths, public=True))
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
def get_students(standard_id: Optional[str] = None, include_passwords: bool = False, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Safe field list — never include any password column regardless of DB state
    teacher_fields = "id, name, username, student_code, email, phone, avatar_url, standard_id, points, attendance_pct, avg_score, blocked, must_change_pwd, created_at"
    # Students only see safe fields (no phone/email of other students)
    student_public_fields = "id, name, username, standard_id, points, attendance_pct, avg_score, avatar_url"

    if user["role"] == "teacher":
        def _run(sel):
            if standard_id:
                return service_supabase.table("students").select(sel).eq("standard_id", standard_id).execute()
            standards = service_supabase.table("standards").select("id").eq("teacher_id", user["teacher_id"]).execute()
            standard_ids = [s["id"] for s in (standards.data or [])]
            if not standard_ids:
                return None
            return service_supabase.table("students").select(sel).in_("standard_id", standard_ids).execute()

        if include_passwords:
            # The Manage grid asks for plain_password explicitly (teacher-only).
            # Guard the column — older DBs without it must fall back, not 500.
            try:
                response = _run(teacher_fields + ", plain_password")
            except Exception:
                response = _run(teacher_fields)
        else:
            response = _run(teacher_fields)
        if response is None:
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

    # Ownership check — every other standard-scoped endpoint enforces this.
    std_check = service_supabase.table("standards").select("teacher_id").eq("id", standard_id).single().execute()
    if not std_check.data or std_check.data.get("teacher_id") != user["teacher_id"]:
        raise HTTPException(status_code=403, detail="Not your standard")

    # 1. Roster (stored points only — scores/attendance are computed LIVE below so
    #    the KPI cards, roster and subject chart all agree. The cached
    #    students.avg_score/attendance_pct columns drift: they're only refreshed on
    #    submit/marking, never when a test is deleted or attendance edited.)
    students_res = service_supabase.table("students").select(
        "id, name, avatar_url, attendance_pct, avg_score, points"
    ).eq("standard_id", standard_id).execute()
    students = students_res.data or []
    total_students = len(students)
    roster_ids = {s["id"] for s in students}
    total_points = sum(s.get("points") or 0 for s in students)

    # 2. Subjects
    subjects_res = service_supabase.table("subject_classes").select("id, name").eq("standard_id", standard_id).execute()
    subjects = subjects_res.data or []
    subject_ids = [sub["id"] for sub in subjects]

    subject_performance = []
    recent_tests = []
    student_scores: dict = {}   # student_id -> [pct, ...]
    student_att: dict = {}      # student_id -> [pct, ...]

    if subject_ids:
        # Attendance summary — include student_id and keep only CURRENT roster
        # students (the view still carries rows for students who left the standard).
        att_res = service_supabase.table("attendance_summary").select("student_id, subject_class_id, attendance_pct").in_("subject_class_id", subject_ids).execute()
        subject_att = {}
        for row in (att_res.data or []):
            if row.get("attendance_pct") is None or row.get("student_id") not in roster_ids:
                continue
            subject_att.setdefault(row["subject_class_id"], []).append(row["attendance_pct"])
            student_att.setdefault(row["student_id"], []).append(row["attendance_pct"])

        # Tests + attempts (attempts limited to the current roster for the same reason)
        tests_res = service_supabase.table("tests").select("id, class_id, title, created_at").in_("class_id", subject_ids).order("created_at", desc=True).execute()
        tests = tests_res.data or []
        test_ids = [t["id"] for t in tests]

        subject_scores = {}
        test_stats = {}
        if test_ids:
            attempts_res = service_supabase.table("test_attempts").select("test_id, student_id, score, tests!inner(class_id, total_marks)").in_("test_id", test_ids).execute()
            for a in (attempts_res.data or []):
                t = a.get("tests") or {}
                cid = t.get("class_id")
                score = a.get("score")
                tm = t.get("total_marks")
                if not (cid and score is not None and tm) or a.get("student_id") not in roster_ids:
                    continue
                pct = (score / tm) * 100
                subject_scores.setdefault(cid, []).append(pct)
                student_scores.setdefault(a["student_id"], []).append(pct)
                tid = a["test_id"]
                test_stats.setdefault(tid, {"score_sum": 0, "count": 0})
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
                "avg_score": round(sum(sc_list)/len(sc_list)) if sc_list else 0,
            })

        # 3. Recent Tests — avg_score is None (not 0) when nobody attempted yet;
        #    participation is capped at 100 (roster may have shrunk since attempts).
        for t in tests[:5]:
            stats = test_stats.get(t["id"], {"score_sum": 0, "count": 0})
            count = stats["count"]
            sub_name = next((s["name"] for s in subjects if s["id"] == t["class_id"]), "Unknown")
            recent_tests.append({
                "test_id": t["id"],
                "title": t["title"],
                "subject_name": sub_name,
                "avg_score": round(stats["score_sum"] / count) if count > 0 else None,
                "attempt_count": count,
                "participation": min(100, round((count / total_students) * 100)) if total_students else 0,
                "date": t["created_at"],
            })

    # 4. Live per-student stats → roster + overview computed from the SAME data
    #    as the subject chart. has_tests/has_attendance let the UI avoid flagging
    #    brand-new students (no data ≠ at risk).
    for s in students:
        sc = student_scores.get(s["id"])
        at = student_att.get(s["id"])
        s["has_tests"] = bool(sc)
        s["has_attendance"] = bool(at)
        s["avg_score"] = round(sum(sc) / len(sc), 1) if sc else 0
        s["attendance_pct"] = round(sum(at) / len(at), 1) if at else 0

    scored = [s["avg_score"] for s in students if s["has_tests"]]
    attended = [s["attendance_pct"] for s in students if s["has_attendance"]]

    return {
        "overview": {
            "total_students": total_students,
            # Averages over students who actually have data — a class where only
            # 3 of 20 students took a test shouldn't show a 12% "class average".
            "avg_score": round(sum(scored) / len(scored)) if scored else 0,
            "avg_attendance": round(sum(attended) / len(attended)) if attended else 0,
            "total_points": total_points,
        },
        "subject_performance": subject_performance,
        "recent_tests": recent_tests,
        "students": students,
    }

def _parse_ts(value):
    """Best-effort ISO timestamp parse → aware UTC datetime (None on failure)."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None

@app.get("/api/reports/performance")
async def get_period_performance(standard_id: str, class_id: Optional[str] = None,
                                 period: str = "overall", user = Depends(verify_token)):
    """Per-student performance for a standard — or a single subject within it —
    over a weekly / monthly / overall window: avg test score, attendance,
    video + assignment completion, a bucketed trend line, and a score delta vs
    the previous window. Powers the Performance tab on the standard/subject
    detail pages (shared PerformancePanel). Teacher only — never exposes
    student contact info."""
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    if period not in ("weekly", "monthly", "overall"):
        period = "overall"

    std_check = await asyncio.to_thread(lambda: service_supabase.table("standards").select(
        "teacher_id").eq("id", standard_id).single().execute())
    if not std_check.data or std_check.data.get("teacher_id") != user["teacher_id"]:
        raise HTTPException(status_code=403, detail="Not your standard")

    def fetch_roster(): return service_supabase.table("students").select(
        "id, name, avatar_url, points").eq("standard_id", standard_id).execute()
    def fetch_subjects(): return service_supabase.table("subject_classes").select(
        "id, name").eq("standard_id", standard_id).execute()
    roster_res, subs_res = await asyncio.gather(
        asyncio.to_thread(fetch_roster), asyncio.to_thread(fetch_subjects))
    roster = roster_res.data or []
    subjects = subs_res.data or []

    if class_id:
        if not any(s["id"] == class_id for s in subjects):
            raise HTTPException(status_code=404, detail="Subject not in this standard")
        subject_ids = [class_id]
    else:
        subject_ids = [s["id"] for s in subjects]

    now = datetime.now(timezone.utc)
    window_days = {"weekly": 7, "monthly": 30}.get(period)
    period_start = now - timedelta(days=window_days) if window_days else None
    # Fetch back to the PREVIOUS window too so delta_score needs no second query.
    fetch_floor = now - timedelta(days=2 * window_days) if window_days else None

    # Trend buckets: weekly → 7 daily, monthly → 4 weekly, overall → last 8 weekly.
    if period == "weekly":
        bucket_starts = [now - timedelta(days=d) for d in range(6, -1, -1)]
        bucket_starts = [b.replace(hour=0, minute=0, second=0, microsecond=0) for b in bucket_starts]
        bucket_len = timedelta(days=1)
        labels = [b.strftime("%a %d") for b in bucket_starts]
    else:
        n = 4 if period == "monthly" else 8
        bucket_len = timedelta(days=7)
        first = (now - bucket_len * n).replace(hour=0, minute=0, second=0, microsecond=0)
        bucket_starts = [first + bucket_len * i for i in range(n)]
        labels = [b.strftime("%d %b") for b in bucket_starts]

    def bucket_idx(dt):
        if not dt or dt < bucket_starts[0]:
            return None
        i = int((dt - bucket_starts[0]) / bucket_len)
        return i if i < len(bucket_starts) else len(bucket_starts) - 1

    empty_summary = {"avg_score": 0, "avg_attendance": 0, "tests_count": 0,
                     "video_completion_pct": 0, "assignment_completion_pct": 0, "active_students": 0}
    if not roster or not subject_ids:
        return {"period": period, "standard_id": standard_id, "class_id": class_id,
                "summary": empty_summary, "trend": [], "students": []}

    roster_ids = {s["id"] for s in roster}

    def fetch_tests(): return service_supabase.table("tests").select(
        "id, class_id, total_marks").in_("class_id", subject_ids).execute()
    def fetch_videos(): return service_supabase.table("videos").select(
        "id").in_("class_id", subject_ids).execute()
    def fetch_assignments(): return service_supabase.table("assignments").select(
        "id, created_at").in_("class_id", subject_ids).execute()
    tests_res, videos_res, asg_res = await asyncio.gather(
        asyncio.to_thread(fetch_tests), asyncio.to_thread(fetch_videos),
        asyncio.to_thread(fetch_assignments))

    tests = tests_res.data or []
    test_marks = {t["id"]: t.get("total_marks") for t in tests}
    test_ids = list(test_marks.keys())
    video_ids = [v["id"] for v in (videos_res.data or [])]
    assignments = asg_res.data or []
    if period_start:
        assignments_in_window = [a for a in assignments
                                 if (_parse_ts(a.get("created_at")) or now) >= period_start]
    else:
        assignments_in_window = assignments
    assignment_ids = [a["id"] for a in assignments]

    floor_iso = fetch_floor.isoformat() if fetch_floor else None

    def fetch_attempts():
        if not test_ids: return None
        q = service_supabase.table("test_attempts").select(
            "test_id, student_id, score, submitted_at").in_("test_id", test_ids)
        if floor_iso: q = q.gte("submitted_at", floor_iso)
        return q.execute()
    def fetch_attendance():
        q = service_supabase.table("attendance_records").select(
            "student_id, status, date").in_("subject_class_id", subject_ids)
        if fetch_floor: q = q.gte("date", fetch_floor.date().isoformat())
        return q.execute()
    def fetch_video_progress():
        if not video_ids: return None
        q = service_supabase.table("video_progress").select(
            "video_id, student_id, last_watched_at").in_("video_id", video_ids).eq("completed", True)
        if period_start: q = q.gte("last_watched_at", period_start.isoformat())
        return q.execute()
    def fetch_submissions():
        if not assignment_ids: return None
        q = service_supabase.table("assignment_submissions").select(
            "assignment_id, student_id, submitted_at").in_("assignment_id", assignment_ids)
        if period_start: q = q.gte("submitted_at", period_start.isoformat())
        return q.execute()

    att_res, attd_res, vp_res, subm_res = await asyncio.gather(
        asyncio.to_thread(fetch_attempts), asyncio.to_thread(fetch_attendance),
        asyncio.to_thread(fetch_video_progress), asyncio.to_thread(fetch_submissions))

    attempts = (att_res.data or []) if att_res else []
    attendance = (attd_res.data or []) if attd_res else []
    video_done = (vp_res.data or []) if vp_res else []
    submissions = (subm_res.data or []) if subm_res else []

    # ── Tests: current vs previous window score lists per student ─────────────
    cur_scores: dict = {}; prev_scores: dict = {}
    cur_test_ids = set(); tests_taken: dict = {}
    trend_scores = [[] for _ in bucket_starts]
    for a in attempts:
        sid = a.get("student_id")
        tm = test_marks.get(a.get("test_id"))
        score = a.get("score")
        if sid not in roster_ids or score is None or not tm:
            continue
        pct = (score / tm) * 100
        ts = _parse_ts(a.get("submitted_at"))
        in_current = (period_start is None) or (ts is not None and ts >= period_start)
        if in_current:
            cur_scores.setdefault(sid, []).append(pct)
            tests_taken[sid] = tests_taken.get(sid, 0) + 1
            cur_test_ids.add(a["test_id"])
        elif window_days:
            prev_scores.setdefault(sid, []).append(pct)
        bi = bucket_idx(ts)
        if bi is not None and in_current is not False:
            trend_scores[bi].append(pct)

    # ── Attendance: attended = present + late (same as attendance_summary) ────
    cur_att: dict = {}   # sid -> [attended, total]
    trend_att = [[0, 0] for _ in bucket_starts]
    for r in attendance:
        sid = r.get("student_id")
        if sid not in roster_ids:
            continue
        d = _parse_ts(f'{r.get("date")}T00:00:00+00:00')
        in_current = (period_start is None) or (d is not None and d >= period_start)
        attended = 1 if r.get("status") in ("present", "late") else 0
        if in_current:
            ent = cur_att.setdefault(sid, [0, 0])
            ent[0] += attended; ent[1] += 1
        bi = bucket_idx(d)
        if bi is not None and in_current:
            trend_att[bi][0] += attended; trend_att[bi][1] += 1

    # ── Videos / assignments completion in window ─────────────────────────────
    vids_watched: dict = {}
    for v in video_done:
        sid = v.get("student_id")
        if sid in roster_ids:
            vids_watched.setdefault(sid, set()).add(v.get("video_id"))
    asg_submitted: dict = {}
    for s in submissions:
        sid = s.get("student_id")
        if sid in roster_ids:
            asg_submitted.setdefault(sid, set()).add(s.get("assignment_id"))

    videos_total = len(video_ids)
    asg_total = len(assignments_in_window)

    students_out = []
    for s in roster:
        sid = s["id"]
        sc = cur_scores.get(sid)
        at = cur_att.get(sid)
        pv = prev_scores.get(sid)
        watched = len(vids_watched.get(sid, ()))
        submitted = len(asg_submitted.get(sid, ()))
        avg_cur = round(sum(sc) / len(sc), 1) if sc else None
        avg_prev = round(sum(pv) / len(pv), 1) if pv else None
        students_out.append({
            "student_id": sid,
            "name": s.get("name"),
            "avatar_url": s.get("avatar_url"),
            "avg_score": avg_cur if avg_cur is not None else 0,
            "has_tests": bool(sc),
            "tests_taken": tests_taken.get(sid, 0),
            "attendance_pct": round(at[0] / at[1] * 100, 1) if at and at[1] else 0,
            "has_attendance": bool(at and at[1]),
            "videos_watched": watched,
            "videos_total": videos_total,
            "video_pct": min(100, round(watched / videos_total * 100)) if videos_total else 0,
            "assignments_submitted": submitted,
            "assignments_total": asg_total,
            "assignment_pct": min(100, round(submitted / asg_total * 100)) if asg_total else 0,
            "points": int(s.get("points") or 0),
            "delta_score": (round(avg_cur - avg_prev, 1)
                            if window_days and avg_cur is not None and avg_prev is not None else None),
        })
    students_out.sort(key=lambda x: x["avg_score"], reverse=True)

    scored = [x["avg_score"] for x in students_out if x["has_tests"]]
    attended_l = [x["attendance_pct"] for x in students_out if x["has_attendance"]]
    active = {sid for sid in roster_ids
              if cur_scores.get(sid) or vids_watched.get(sid) or asg_submitted.get(sid)}

    trend = []
    for i, label in enumerate(labels):
        sc_list = trend_scores[i]
        att_n, att_d = trend_att[i]
        trend.append({
            "label": label,
            "avg_score": round(sum(sc_list) / len(sc_list)) if sc_list else None,
            "attendance_pct": round(att_n / att_d * 100) if att_d else None,
        })

    return {
        "period": period,
        "standard_id": standard_id,
        "class_id": class_id,
        "summary": {
            "avg_score": round(sum(scored) / len(scored)) if scored else 0,
            "avg_attendance": round(sum(attended_l) / len(attended_l)) if attended_l else 0,
            "tests_count": len(cur_test_ids),
            "video_completion_pct": (min(100, round(sum(len(v) for v in vids_watched.values())
                                                    / (videos_total * len(roster)) * 100))
                                     if videos_total and roster else 0),
            "assignment_completion_pct": (min(100, round(sum(len(v) for v in asg_submitted.values())
                                                         / (asg_total * len(roster)) * 100))
                                          if asg_total and roster else 0),
            "active_students": len(active),
        },
        "trend": trend,
        "students": students_out,
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

# standard_id -> (expires_epoch, class_averages dict). Short TTL: fresh enough
# for a report view, avoids recomputing class-wide stats on every period switch.
_class_avg_cache: dict = {}


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

    # ── Class averages (real baselines for the skill radar overlay) ────────
    # Class-wide aggregates are identical for every student in the standard and
    # for every period tab, but cost 3 extra queries — cache them briefly so
    # switching Weekly/Monthly/Overall doesn't recompute them each time.
    class_averages = None
    _ca_cached = _class_avg_cache.get(std_id) if std_id else None
    if _ca_cached and _ca_cached[0] > time_module.time():
        class_averages = _ca_cached[1]
    elif std_id:
        try:
            cls_res = service_supabase.table("students").select(
                "id, avg_score, attendance_pct, points"
            ).eq("standard_id", std_id).execute()
            cls_rows = cls_res.data or []
            n = len(cls_rows)
            if n > 0:
                ids = [r["id"] for r in cls_rows]

                def _mean(vals):
                    return round(sum(vals) / len(vals), 1) if vals else 0

                class_averages = {
                    "avg_score":      _mean([r.get("avg_score") or 0 for r in cls_rows]),
                    "attendance_pct": _mean([r.get("attendance_pct") or 0 for r in cls_rows]),
                    "points":         _mean([r.get("points") or 0 for r in cls_rows]),
                    "students_counted": n,
                }

                # Class-wide video completion: completed rows / (students × videos)
                video_pct = 0
                if subjects:
                    vids_res = service_supabase.table("videos").select("id").in_(
                        "class_id", [s["id"] for s in subjects]
                    ).execute()
                    n_videos = len(vids_res.data or [])
                    if n_videos > 0:
                        vp_res = service_supabase.table("video_progress").select(
                            "id", count="exact"
                        ).in_("student_id", ids).eq("completed", True).execute()
                        video_pct = round((vp_res.count or 0) / (n * n_videos) * 100, 1)
                class_averages["video_pct"] = video_pct

                # Class consistency (100 − 2σ of all attempt percentages, clamped)
                # and mastery (share of attempts scoring ≥ 75%).
                consistency = 0
                mastery = 0
                ta_res = service_supabase.table("test_attempts").select(
                    "score, tests(total_marks)"
                ).in_("student_id", ids).execute()
                pcts = []
                for a in (ta_res.data or []):
                    tm = (a.get("tests") or {}).get("total_marks") or 0
                    if tm > 0:
                        pcts.append((a.get("score") or 0) / tm * 100)
                if pcts:
                    m = sum(pcts) / len(pcts)
                    sd = (sum((p - m) ** 2 for p in pcts) / len(pcts)) ** 0.5
                    consistency = round(max(0, min(100, 100 - 2 * sd)), 1)
                    mastery = round(sum(1 for p in pcts if p >= 75) / len(pcts) * 100, 1)
                class_averages["consistency"] = consistency
                class_averages["mastery"] = mastery
                _class_avg_cache[std_id] = (time_module.time() + 180, class_averages)
        except Exception as exc:
            print(f"Class averages error (non-fatal): {exc}")
            class_averages = None

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
        "class_averages": class_averages,
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
            "phone": request.phone,
            "standard_id": request.standard_id,
        }
        service_supabase.table("students").insert(student_data).execute()
        try:
            service_supabase.table("students").update({"plain_password": request.password}).eq("id", response.user.id).execute()
        except Exception:
            pass
        # parent_phone via guarded post-insert update (like plain_password) so a DB
        # without the column never blocks student creation. See add_parent_phone.sql.
        if request.parent_phone:
            try:
                service_supabase.table("students").update(
                    {"parent_phone": request.parent_phone}).eq("id", response.user.id).execute()
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


@app.post("/api/admin/backup-now")
async def backup_now(user = Depends(verify_token)):
    """Teacher-triggered immediate backup (full DB dump + students CSV → R2)."""
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not filestore.is_r2_enabled():
        raise HTTPException(status_code=503, detail="Backups require Cloudflare R2 to be configured")
    try:
        produced = await asyncio.to_thread(_run_backups)
        await asyncio.to_thread(_set_backup_state, {"last_run_at": time_module.time()})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup failed: {e}")
    return {"status": "ok", "result": produced}


@app.get("/api/admin/backups")
async def list_backups(user = Depends(verify_token)):
    """List recent backups in R2 with short-lived presigned download URLs."""
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not filestore.is_r2_enabled():
        return {"backups": []}
    bucket = os.environ.get("R2_PRIVATE_BUCKET", "")
    items = []
    for folder, label in (("backups/db/", "Database"), ("backups/students/", "Students CSV")):
        objs = await asyncio.to_thread(lambda p=folder: filestore.list_private(p))
        for o in objs:
            key = o["key"]
            url = await asyncio.to_thread(
                lambda k=key: filestore.signed_url(service_supabase, bucket, k, 3600)
            )
            lm = o.get("last_modified")
            items.append({
                "filename": key.split("/")[-1],
                "type": label,
                "size": o.get("size", 0),
                "modified": lm.isoformat() if hasattr(lm, "isoformat") else (str(lm) if lm else None),
                "download_url": url,
            })
    items.sort(key=lambda x: x["filename"], reverse=True)  # newest first (timestamped names)
    return {"backups": items}

@app.patch("/api/students/me")
def update_student_profile(request: StudentProfileUpdate, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    allowed = {k: v for k, v in request.model_dump().items() if v is not None}
    # avatar_preset isn't a column — translate to the avatar_url sentinel.
    preset = allowed.pop("avatar_preset", None)
    if preset is not None:
        if preset in ("male", "female"):
            allowed["avatar_url"] = f"preset:{preset}"
        elif preset == "default":
            allowed["avatar_url"] = None   # back to the neutral icon
        else:
            raise HTTPException(status_code=400, detail="avatar_preset must be 'male', 'female' or 'default'")
        service_supabase.table("students").update({"avatar_url": allowed["avatar_url"]}).eq("id", user["user_id"]).execute()
        allowed.pop("avatar_url", None)
    if allowed:
        service_supabase.table("students").update(allowed).eq("id", user["user_id"]).execute()
    return {"message": "Profile updated", "avatar_url": (f"preset:{preset}" if preset in ("male", "female") else None) if preset is not None else None}

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

# ── What's New: per-section unseen-content feed for students ────────────────
_SEEN_SECTIONS = ("videos", "tests", "live")

@app.get("/api/student/whats-new")
def get_student_whats_new(user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    student_id = user.get("student_id") or user["user_id"]
    standard_id = user.get("standard_id")

    # Baseline = enrollment date, so a brand-new student isn't flooded with
    # every piece of pre-existing content marked NEW.
    baseline = None
    try:
        row = service_supabase.table("students").select("created_at").eq("id", student_id).single().execute()
        baseline = row.data.get("created_at") if row.data else None
    except Exception:
        pass
    if not baseline:
        baseline = datetime.now(timezone.utc).isoformat()

    seen = {s: baseline for s in _SEEN_SECTIONS}
    try:
        rows = service_supabase.table("student_seen").select("section, seen_at").eq("student_id", student_id).execute()
        for r in (rows.data or []):
            if r.get("section") in seen and r.get("seen_at"):
                seen[r["section"]] = r["seen_at"]
    except Exception:
        pass  # student_seen not migrated yet — enrollment baseline still works

    empty = {"count": 0, "items": []}
    if not standard_id:
        return {"seen": seen, "videos": dict(empty), "tests": dict(empty), "live": dict(empty)}

    subjects = service_supabase.table("subject_classes").select("id, name").eq("standard_id", standard_id).execute()
    if not subjects.data:
        return {"seen": seen, "videos": dict(empty), "tests": dict(empty), "live": dict(empty)}
    class_ids = [s["id"] for s in subjects.data]
    class_names = {s["id"]: s["name"] for s in subjects.data}

    def fetch_new(table, fields, seen_at, refine=None):
        try:
            q = service_supabase.table(table).select(fields).in_("class_id", class_ids).gt("created_at", seen_at)
            if refine:
                q = refine(q)
            items = q.order("created_at", desc=True).limit(20).execute().data or []
        except Exception:
            items = []
        for it in items:
            it["subject_name"] = class_names.get(it.get("class_id"), "Unknown")
        return {"count": len(items), "items": items}

    return {
        "seen": seen,
        "videos": fetch_new("videos", "id, title, class_id, thumbnail_url, source_type, duration_secs, created_at", seen["videos"]),
        "tests": fetch_new("tests", "id, title, class_id, scheduled_for, expires_at, status, created_at", seen["tests"],
                           lambda q: q.neq("status", "draft")),
        "live": fetch_new("live_classes", "id, title, class_id, scheduled_at, status, created_at", seen["live"],
                          lambda q: q.neq("status", "cancelled")),
    }

class MarkSeenRequest(BaseModel):
    section: str

@app.post("/api/student/seen")
def mark_student_seen(request: MarkSeenRequest, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    if request.section not in _SEEN_SECTIONS:
        raise HTTPException(status_code=400, detail="Invalid section")
    try:
        service_supabase.table("student_seen").upsert({
            "student_id": user.get("student_id") or user["user_id"],
            "section": request.section,
            "seen_at": datetime.now(timezone.utc).isoformat()
        }, on_conflict="student_id,section").execute()
    except Exception as e:
        # Table may not be migrated yet — the badge just won't clear until it is.
        print(f"student_seen upsert failed: {e}")
    return {"message": "ok"}

# ── Upload validation (size + extension + lazy MIME sniff) ──
# `magic` is imported lazily so local dev without libmagic still runs (degrades
# to extension + size checks); the Docker image ships libmagic1 for full sniffing.
UPLOAD_MAX_MB = 50
IMAGE_EXTS = {"jpg", "jpeg", "png", "webp", "gif"}
DOC_EXTS = {"pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt"}
VIDEO_EXTS = {"mp4", "mov", "webm", "mkv", "m4v"}
AUDIO_EXTS = {"mp3", "m4a", "ogg", "oga", "wav", "aac", "weba", "webm"}
_UPLOAD_MIME_OK = {
    "application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "application/octet-stream",
    "video/mp4", "video/quicktime", "video/webm", "video/x-matroska",
    "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm", "audio/aac", "audio/x-wav",
}

def validate_upload(filename: str, content: bytes, allowed_exts: set, max_mb: int = UPLOAD_MAX_MB):
    """Reject empty/oversize files, disallowed extensions, and (when libmagic is
    present) disallowed sniffed MIME types. Raises HTTPException(400/422)."""
    if not content:
        raise HTTPException(status_code=422, detail="File is empty.")
    if len(content) > max_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File too large. Max {max_mb} MB.")
    ext = (filename or "").rsplit(".", 1)[-1].lower() if "." in (filename or "") else ""
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"File type '.{ext or '?'}' not allowed.")
    try:
        import magic
        mime = magic.from_buffer(content[:2048], mime=True)
        if mime not in _UPLOAD_MIME_OK and not mime.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"File content '{mime}' not allowed.")
    except HTTPException:
        raise
    except Exception:
        pass  # libmagic unavailable → extension + size check only


# Office binary formats LibreOffice converts to PDF so they open in the in-app
# secure viewer. NOT docx (mammoth renders it client-side), pdf, or images.
_OFFICE_CONVERT_EXTS = {"doc", "ppt", "pptx", "xls", "xlsx"}


async def _maybe_convert_office_to_pdf(filename: str, data: bytes, content_type: str):
    """If `filename` is an office binary format, render it to PDF ONCE at upload (via
    LibreOffice headless) so students can view it in the no-download secure viewer.
    Returns (data, ext, content_type, display_name) — converted to PDF, or the
    originals on any failure so a conversion error never blocks the upload."""
    ext = (filename or "").rsplit(".", 1)[-1].lower() if "." in (filename or "") else ""
    if ext not in _OFFICE_CONVERT_EXTS:
        return data, ext, content_type, filename
    import tempfile
    try:
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, f"in.{ext}")
            with open(src, "wb") as f:
                f.write(data)
            # Per-call UserInstallation avoids profile-lock clashes between concurrent
            # conversions on the box.
            proc = await asyncio.to_thread(lambda: subprocess.run(
                ["soffice", "--headless", f"-env:UserInstallation=file://{tmp}/lo",
                 "--convert-to", "pdf", "--outdir", tmp, src],
                capture_output=True, timeout=120,
            ))
            out = os.path.join(tmp, "in.pdf")
            if proc.returncode == 0 and os.path.exists(out):
                with open(out, "rb") as f:
                    pdf = f.read()
                base = filename.rsplit(".", 1)[0] if "." in (filename or "") else (filename or "file")
                return pdf, "pdf", "application/pdf", f"{base}.pdf"
            print(f"[office] convert failed for {filename}: rc={proc.returncode} "
                  f"{proc.stderr.decode(errors='replace')[:200]}")
    except Exception as e:
        print(f"[office] convert error for {filename}: {e}")
    return data, ext, content_type, filename


@app.post("/api/students/me/avatar")
async def upload_student_avatar(file: UploadFile = File(...), user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    file_bytes = await file.read()
    validate_upload(file.filename or "avatar.jpg", file_bytes, IMAGE_EXTS, max_mb=10)
    file_ext = os.path.splitext(file.filename or "avatar.jpg")[1] or ".jpg"
    file_name = f"avatars/{user['user_id']}{file_ext}"

    try:
        if not filestore.is_r2_enabled():
            try:
                await asyncio.to_thread(lambda: service_supabase.storage.get_bucket("avatars"))
            except:
                await asyncio.to_thread(lambda: service_supabase.storage.create_bucket("avatars", options={"public": True}))
            try:
                await asyncio.to_thread(lambda: service_supabase.storage.from_("avatars").remove([file_name]))
            except:
                pass
        public_url = await asyncio.to_thread(
            lambda: filestore.upload_public(service_supabase, "avatars", file_name, file_bytes, file.content_type or "image/jpeg")
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
        validate_upload(file.filename or "thumb.jpg", file_bytes, IMAGE_EXTS, max_mb=10)
        file_ext = os.path.splitext(file.filename or "thumb.jpg")[1] or ".jpg"
        file_name = f"thumbnails/{user['teacher_id']}{file_ext}"
        try:
            if not filestore.is_r2_enabled():
                try:
                    await asyncio.to_thread(lambda: service_supabase.storage.get_bucket("thumbnails"))
                except Exception:
                    await asyncio.to_thread(lambda: service_supabase.storage.create_bucket("thumbnails", options={"public": True}))
                try:
                    await asyncio.to_thread(lambda: service_supabase.storage.from_("thumbnails").remove([file_name]))
                except Exception:
                    pass
            public_url = await asyncio.to_thread(
                lambda: filestore.upload_public(service_supabase, "thumbnails", file_name, file_bytes, file.content_type or "image/jpeg")
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
        validate_upload(file.filename or "photo.jpg", file_bytes, IMAGE_EXTS, max_mb=10)
        file_ext = os.path.splitext(file.filename or "photo.jpg")[1] or ".jpg"
        file_name = f"profile-photos/{user['teacher_id']}{file_ext}"
        try:
            if not filestore.is_r2_enabled():
                try:
                    await asyncio.to_thread(lambda: service_supabase.storage.get_bucket("profile-photos"))
                except Exception:
                    await asyncio.to_thread(lambda: service_supabase.storage.create_bucket("profile-photos", options={"public": True}))
                try:
                    await asyncio.to_thread(lambda: service_supabase.storage.from_("profile-photos").remove([file_name]))
                except Exception:
                    pass
            public_url = await asyncio.to_thread(
                lambda: filestore.upload_public(service_supabase, "profile-photos", file_name, file_bytes, file.content_type or "image/jpeg")
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
        # Drop the student's cached auth entries so the forced password change
        # takes effect on their next request, not after the cache TTL.
        _invalidate_auth_cache_for_user(student_id)
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

    # These tables have no FK/CASCADE to students — must delete manually first
    service_supabase.table("test_attempts").delete().eq("student_id", student_id).execute()
    service_supabase.table("whatsapp_messages").delete().eq("student_id", student_id).execute()
    service_supabase.table("whatsapp_inbox").delete().eq("student_id", student_id).execute()
    service_supabase.table("students").delete().eq("id", student_id).execute()
    try:
        service_supabase.auth.admin.delete_user(student_id)
    except Exception as e:
        print(f"Auth delete failed for student {student_id}: {e}")
    return {"message": "Student deleted"}

@app.patch("/api/students/{student_id}/unenroll")
def unenroll_student(student_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    service_supabase.table("students").update({"standard_id": None}).eq("id", student_id).execute()
    try:
        service_supabase.table("student_sessions").delete().eq("student_id", student_id).execute()
    except Exception as e:
        print(f"Session clear failed for student {student_id}: {e}")
    return {"message": "Student unenrolled"}


# ─── Bulk student management (teacher-only) ──────────────────────────────────
# Operate on many students at once from the Manage (Excel) grid. Every op is
# scoped to the calling teacher's own standards (defence-in-depth) and uses a
# single `.in_(ids)` query where Supabase allows it; the Auth Admin API is
# per-user, so deletes/password-resets loop.

def _teacher_owned_student_ids(user, ids):
    """Return the subset of `ids` that belong to a student currently in one of
    this teacher's standards — so a teacher can never act on someone else's."""
    if not ids:
        return []
    std = service_supabase.table("standards").select("id").eq("teacher_id", user["teacher_id"]).execute()
    std_ids = [s["id"] for s in (std.data or [])]
    if not std_ids:
        return []
    rows = service_supabase.table("students").select("id").in_("id", ids).in_("standard_id", std_ids).execute()
    return [r["id"] for r in (rows.data or [])]


@app.post("/api/students/bulk-delete")
def bulk_delete_students(req: BulkIdsRequest, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    ids = _teacher_owned_student_ids(user, req.ids)
    if not ids:
        return {"deleted": 0, "failed": 0}

    # Tables with no FK/CASCADE to students — clear first (one query each).
    for tbl in ("test_attempts", "whatsapp_messages", "whatsapp_inbox", "student_sessions"):
        try:
            service_supabase.table(tbl).delete().in_("student_id", ids).execute()
        except Exception as e:
            print(f"Bulk delete cleanup failed on {tbl}: {e}")
    service_supabase.table("students").delete().in_("id", ids).execute()

    failed = 0
    for sid in ids:
        try:
            service_supabase.auth.admin.delete_user(sid)
        except Exception as e:
            failed += 1
            print(f"Auth delete failed for student {sid}: {e}")
        _invalidate_auth_cache_for_user(sid)
    return {"deleted": len(ids), "failed": failed}


@app.post("/api/students/bulk-move")
def bulk_move_students(req: BulkMoveRequest, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    # Target standard must belong to this teacher.
    target = service_supabase.table("standards").select("id").eq("id", req.standard_id).eq("teacher_id", user["teacher_id"]).execute()
    if not target.data:
        raise HTTPException(status_code=404, detail="Target standard not found")

    ids = _teacher_owned_student_ids(user, req.ids)
    if not ids:
        return {"moved": 0}

    service_supabase.table("students").update({"standard_id": req.standard_id}).in_("id", ids).execute()
    # Drop device sessions + cached tokens so the new standard's content is
    # served on the students' very next request (token carries standard_id).
    try:
        service_supabase.table("student_sessions").delete().in_("student_id", ids).execute()
    except Exception as e:
        print(f"Bulk move session clear failed: {e}")
    for sid in ids:
        _invalidate_auth_cache_for_user(sid)
    return {"moved": len(ids)}


@app.post("/api/students/bulk-block")
def bulk_block_students(req: BulkBlockRequest, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    ids = _teacher_owned_student_ids(user, req.ids)
    if not ids:
        return {"updated": 0}

    service_supabase.table("students").update({"blocked": req.blocked}).in_("id", ids).execute()
    for sid in ids:
        _invalidate_auth_cache_for_user(sid)  # block is enforced at login/verify
    return {"updated": len(ids)}


@app.post("/api/students/bulk-reset-password")
def bulk_reset_passwords(req: BulkResetRequest, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    import secrets, string

    ids = _teacher_owned_student_ids(user, req.ids)
    if not ids:
        return {"results": [], "updated": 0, "failed": 0}

    fixed = req.new_password.strip() if (req.new_password and len(req.new_password.strip()) >= 6) else None
    alphabet = string.ascii_letters + string.digits
    results, failed = [], 0
    for sid in ids:
        pw = fixed or ''.join(secrets.choice(alphabet) for _ in range(10))
        try:
            service_supabase.auth.admin.update_user_by_id(sid, {"password": pw})
            try:
                service_supabase.table("students").update({"must_change_pwd": True, "plain_password": pw}).eq("id", sid).execute()
            except Exception:
                service_supabase.table("students").update({"must_change_pwd": True}).eq("id", sid).execute()
            _invalidate_auth_cache_for_user(sid)
            results.append({"id": sid, "new_password": pw})
        except Exception as e:
            failed += 1
            print(f"Bulk reset failed for student {sid}: {e}")
    return {"results": results, "updated": len(results), "failed": failed}

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

    # Embed like_count (both roles) + my_liked (student) in one extra query.
    if videos and _video_likes_enabled():
        try:
            ids = [v["id"] for v in videos]
            likes = service_supabase.table("video_likes").select("video_id, student_id").in_("video_id", ids).execute()
            counts: dict = {}
            mine = set()
            my_sid = user.get("student_id")
            for r in (likes.data or []):
                counts[r["video_id"]] = counts.get(r["video_id"], 0) + 1
                if my_sid and r.get("student_id") == my_sid:
                    mine.add(r["video_id"])
            for v in videos:
                v["like_count"] = counts.get(v["id"], 0)
                if user["role"] == "student":
                    v["my_liked"] = v["id"] in mine
        except Exception:
            for v in videos:
                v.setdefault("like_count", 0)
                if user["role"] == "student":
                    v.setdefault("my_liked", False)
    else:
        for v in videos:
            v.setdefault("like_count", 0)
            if user["role"] == "student":
                v.setdefault("my_liked", False)

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

# ─── PUSH NOTIFICATIONS (Firebase Cloud Messaging, HTTP v1) ──────────────────
# Dormant unless FCM_SERVICE_ACCOUNT_JSON is set (base64 or raw JSON of a Firebase
# service-account key). All push paths are best-effort and never block or fail the
# originating request.

_fcm_sa: Optional[dict] = None          # parsed service-account dict (None = not loaded yet)
_fcm_sa_loaded = False
_fcm_project_id: Optional[str] = None
_fcm_creds = None                        # google.oauth2 Credentials (caches/refreshes the OAuth token)
_fcm_lock = threading.Lock()


def _load_fcm_sa() -> Optional[dict]:
    """Parse FCM_SERVICE_ACCOUNT_JSON once (accepts base64 or raw JSON)."""
    global _fcm_sa, _fcm_sa_loaded, _fcm_project_id
    if _fcm_sa_loaded:
        return _fcm_sa
    _fcm_sa_loaded = True
    raw = (os.getenv("FCM_SERVICE_ACCOUNT_JSON") or "").strip()
    if not raw:
        return None
    try:
        txt = raw if raw.startswith("{") else base64.b64decode(raw).decode("utf-8")
        _fcm_sa = json.loads(txt)
        _fcm_project_id = _fcm_sa.get("project_id")
        print(f"[fcm] service account loaded (project={_fcm_project_id})")
    except Exception as e:
        print(f"[fcm] bad FCM_SERVICE_ACCOUNT_JSON: {e}")
        _fcm_sa = None
    return _fcm_sa


_fcm_last_error: Optional[str] = None  # last OAuth-mint error, surfaced by push-debug


def _fcm_access_token() -> Optional[str]:
    """Mint/refresh a short-lived OAuth token for the FCM HTTP v1 API."""
    global _fcm_creds, _fcm_last_error
    sa = _load_fcm_sa()
    if not sa:
        _fcm_last_error = "no service account loaded"
        return None
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request as GAuthRequest
        with _fcm_lock:
            if _fcm_creds is None:
                _fcm_creds = service_account.Credentials.from_service_account_info(
                    sa, scopes=["https://www.googleapis.com/auth/firebase.messaging"])
            if not _fcm_creds.valid:
                _fcm_creds.refresh(GAuthRequest())
            _fcm_last_error = None
            return _fcm_creds.token
    except Exception as e:
        _fcm_last_error = f"{type(e).__name__}: {e}"
        print(f"[fcm] token error: {e}")
        return None


# Notification channel id — MUST match NotificationChannels.DEFAULT in the Android app.
FCM_DEFAULT_CHANNEL = "udaya_messages_v2"


def _send_fcm(tokens, *, notification: Optional[dict] = None, data: Optional[dict] = None,
              android_high_priority: bool = False):
    """Send one FCM message per token (HTTP v1). `notification` = {title, body} shows a
    system-tray notification when backgrounded (on the udaya_messages channel, which has
    sound); pass None for data-only (the native UdayaMessagingService then builds the
    full-screen alarm). Dead tokens are pruned. Returns a list of per-token
    {token, status, error} so callers (the diagnostic endpoint) can report results."""
    results = []
    if not _load_fcm_sa() or not _fcm_project_id or not tokens:
        return results
    access = _fcm_access_token()
    if not access:
        return results
    url = f"https://fcm.googleapis.com/v1/projects/{_fcm_project_id}/messages:send"
    headers = {"Authorization": f"Bearer {access}", "Content-Type": "application/json"}
    str_data = {k: ("" if v is None else str(v)) for k, v in (data or {}).items()}
    dead = []
    try:
        with httpx.Client(timeout=10) as client:
            for tok in tokens:
                android = {"priority": "high" if android_high_priority else "normal"}
                message = {"token": tok, "data": str_data, "android": android}
                if notification:
                    message["notification"] = {"title": notification.get("title") or "",
                                               "body": notification.get("body") or ""}
                    # Do NOT force a specific channel_id: if the installed APK is older
                    # than that channel, Android 8+ SILENTLY DROPS the notification. By
                    # omitting it, each install falls back to its own manifest
                    # `default_notification_channel_id` (which that app guarantees to
                    # create) — strictly more compatible across APK versions. The latest
                    # app's default channel still carries the sound; `sound:"default"`
                    # covers pre-O devices and the SDK's fallback channel.
                    android["notification"] = {
                        "sound": "default",
                        "default_sound": True,
                        "notification_priority": "PRIORITY_HIGH",
                    }
                tail = tok[-8:]
                try:
                    resp = client.post(url, headers=headers, json={"message": message})
                    if resp.status_code == 200:
                        results.append({"token": tail, "status": 200})
                        continue
                    body_txt = resp.text or ""
                    results.append({"token": tail, "status": resp.status_code, "error": body_txt[:160]})
                    if resp.status_code in (400, 403, 404):
                        low = body_txt.lower()
                        if ("unregistered" in low or "not-registered" in low
                                or "not_found" in low or "invalid_argument" in low
                                or "invalid registration" in low):
                            dead.append(tok)
                            continue
                    print(f"[fcm] send {resp.status_code}: {body_txt[:200]}")
                except Exception as e:
                    results.append({"token": tail, "status": "error", "error": str(e)[:160]})
                    print(f"[fcm] send error: {e}")
    finally:
        if dead and service_supabase:
            try:
                service_supabase.table("device_tokens").delete().in_("token", dead).execute()
                print(f"[fcm] pruned {len(dead)} dead token(s)")
            except Exception as e:
                print(f"[fcm] prune failed: {e}")
    return results


def _tokens_for_recipients(recipient_ids) -> list:
    """All device tokens registered to the given recipient (user) ids."""
    ids = [r for r in (recipient_ids or []) if r]
    if not service_supabase or not ids:
        return []
    try:
        rows = service_supabase.table("device_tokens").select("token").in_("user_id", ids).execute()
        return [r["token"] for r in (rows.data or []) if r.get("token")]
    except Exception as e:
        print(f"[fcm] token lookup failed: {e}")
        return []


def _push_to_recipients(recipient_ids, title: str, body: str = "", data: dict = None):
    """Fire-and-forget standard push to every device of the given recipients. Returns
    immediately (network runs on a daemon thread) so it never delays the request."""
    if not _load_fcm_sa() or not recipient_ids:
        return

    def _work():
        try:
            tokens = _tokens_for_recipients(recipient_ids)
            if tokens:
                _send_fcm(tokens, notification={"title": title, "body": body or ""},
                          data={**(data or {}), "kind": (data or {}).get("kind", "notification")},
                          android_high_priority=True)
        except Exception as e:
            print(f"[push] fan-out failed: {e}")

    threading.Thread(target=_work, daemon=True).start()


def _emit_notification(recipient_id: str, recipient_type: str, ntype: str,
                       title: str, body: str = "", data: dict = None):
    """Insert one notification row AND push it to the recipient's phone(s).
    Best-effort: a failure here must never break the calling action."""
    if not service_supabase or not recipient_id:
        return
    try:
        service_supabase.table("notifications").insert({
            "recipient_id": recipient_id,
            "recipient_type": recipient_type,
            "type": ntype,
            "title": title,
            "body": body,
            "data": data or {},
            "read": False,
        }).execute()
    except Exception as e:
        print(f"Notification insert failed ({ntype}): {e}")
    _push_to_recipients([recipient_id], title, body, {**(data or {}), "kind": ntype})


def _notify_students_of_content(class_id: str, ntype: str, title: str, body: str = "", data: dict = None):
    """Fan out a notification row to every non-blocked student of the standard
    that owns class_id. Best-effort: content creation must never fail because
    notifications did."""
    if not service_supabase:
        return
    try:
        subj = service_supabase.table("subject_classes").select("standard_id, name").eq("id", class_id).single().execute()
        if not subj.data:
            return
        students = service_supabase.table("students").select("id, blocked").eq("standard_id", subj.data["standard_id"]).execute()
        rows = [{
            "recipient_id": s["id"],
            "recipient_type": "student",
            "type": ntype,
            "title": title,
            "body": body or subj.data.get("name") or "",
            "data": {**(data or {}), "class_id": class_id},
            "read": False,
        } for s in (students.data or []) if not s.get("blocked")]
        if rows:
            service_supabase.table("notifications").insert(rows).execute()
            # Also push to every recipient's phone (best-effort, non-blocking).
            _push_to_recipients([r["recipient_id"] for r in rows], title,
                                body or subj.data.get("name") or "",
                                {**(data or {}), "class_id": class_id, "kind": ntype})
    except Exception as e:
        print(f"Notification fan-out failed: {e}")


def _notify_standard_students(standard_id: str, ntype: str, title: str, body: str = "", data: dict = None):
    """Standard-level sibling of _notify_students_of_content (for broadcasts, which
    target a standard not a class). Fans a notification row to every non-blocked
    student of the standard and pushes it. Best-effort."""
    if not service_supabase or not standard_id:
        return
    try:
        students = service_supabase.table("students").select("id, blocked").eq("standard_id", standard_id).execute()
        rows = [{
            "recipient_id": s["id"],
            "recipient_type": "student",
            "type": ntype,
            "title": title,
            "body": body or "",
            "data": {**(data or {}), "standard_id": standard_id},
            "read": False,
        } for s in (students.data or []) if not s.get("blocked")]
        if rows:
            service_supabase.table("notifications").insert(rows).execute()
            _push_to_recipients([r["recipient_id"] for r in rows], title, body or "",
                                {**(data or {}), "standard_id": standard_id, "kind": ntype})
    except Exception as e:
        print(f"Notification fan-out (standard) failed: {e}")

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
    await asyncio.to_thread(_notify_students_of_content, video.class_id, "new_video",
                            f"New video: {video.title}", "", {"content_id": created["id"]})
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
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    _notify_students_of_content(video.class_id, "new_video",
                                f"New video: {video.title}", "", {"content_id": response.data[0]["id"]})
    return {"id": response.data[0]["id"], "message": "Video created"}

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
        validate_upload(file.filename or "video.mp4", file_bytes, VIDEO_EXTS, max_mb=2048)
        safe_name = re.sub(r'[^\w.\-]', '_', file.filename or 'video.mp4')
        storage_path = f"{class_id}/{uuid.uuid4()}_{safe_name}"

        # Auto-create bucket in thread (sync I/O must not block event loop)
        if not filestore.is_r2_enabled():
            try:
                await asyncio.to_thread(
                    lambda: service_supabase.storage.create_bucket("videos", options={"public": True})
                )
            except Exception:
                pass  # Already exists

        # Upload file (R2 when configured, else Supabase) + get its public URL
        try:
            public_url = await asyncio.to_thread(
                lambda: filestore.upload_public(service_supabase, "videos", storage_path, file_bytes, file.content_type or "video/mp4")
            )
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Storage upload failed: {e}")

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
        await asyncio.to_thread(_notify_students_of_content, class_id, "new_video",
                                f"New video: {title}", "", {"content_id": db_resp.data[0]["id"]})
        return db_resp.data[0]

    file_bytes = await file.read()
    validate_upload(file.filename or "video.mp4", file_bytes, VIDEO_EXTS, max_mb=2048)
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
    await asyncio.to_thread(_notify_students_of_content, class_id, "new_video",
                            f"New video: {title}", "", {"content_id": db_resp.data[0]["id"]})
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
                    lambda: filestore.remove(service_supabase, "videos", storage_path, public=True)
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

    # Teacher: return all tests for their standards, enriched with the exam's
    # standard + subject (so callers can scope an exam to its own class).
    stds = service_supabase.table("standards").select("id, name").eq("teacher_id", user["teacher_id"]).execute()
    if not stds.data:
        return []
    std_name = {s["id"]: s["name"] for s in stds.data}
    std_ids = list(std_name.keys())
    subjects = service_supabase.table("subject_classes").select("id, name, standard_id").in_("standard_id", std_ids).execute()
    if not subjects.data:
        return []
    class_meta = {c["id"]: {"standard_id": c.get("standard_id"),
                            "standard_name": std_name.get(c.get("standard_id"), ""),
                            "subject_name": c.get("name")} for c in subjects.data}
    class_ids = list(class_meta.keys())
    response = service_supabase.table("tests").select("*").in_("class_id", class_ids).execute()
    tests = response.data or []
    for t in tests:
        meta = class_meta.get(t.get("class_id"), {})
        t["standard_id"] = meta.get("standard_id")
        t["standard_name"] = meta.get("standard_name")
        t["subject_name"] = meta.get("subject_name")
    return tests

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
    if test.status != "draft":
        _notify_students_of_content(test.class_id, "new_test",
                                    f"New test: {test.title}", "", {"content_id": response.data[0]["id"]})
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
    terminated: bool = False  # exam cancelled (e.g. screenshot detected) → score 0

class ReattemptRequest(BaseModel):
    reason: Optional[str] = None

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

    if data.status != "draft":
        _notify_students_of_content(data.class_id, "new_test",
                                    f"New test: {data.title}", "", {"content_id": test_id})
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

    # A teacher-granted re-attempt may re-open a test whose deadline has passed.
    # The grant is an 'approved' row in test_reattempt_requests (no DB column).
    granted = bool(user.get("student_id") and _reattempt_enabled()
                   and _has_approved_reattempt(test_id, user["student_id"]))

    if test.data.get("expires_at") and not granted:
        try:
            expires = datetime.fromisoformat(test.data["expires_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > expires:
                raise HTTPException(status_code=403, detail="Test has expired")
        except HTTPException:
            raise
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

    # Check if already attempted. A teacher-approved re-attempt lets the student
    # submit again — the new attempt OVERWRITES the old row. The grant is an
    # 'approved' row in test_reattempt_requests (source of truth), so this never
    # depends on a DB column that may not exist.
    existing = service_supabase.table("test_attempts").select("id, points_earned").eq("test_id", test_id).eq("student_id", user["student_id"]).execute()
    prior = existing.data[0] if existing.data else None
    # An approved grant lets the student submit: either OVERWRITING a prior attempt
    # (re-attempt of a test already taken) OR taking a MISSED test (no prior attempt)
    # the teacher re-opened. The grant is an 'approved' row in test_reattempt_requests.
    has_grant = bool(user.get("student_id") and _reattempt_enabled()
                     and _has_approved_reattempt(test_id, user["student_id"]))
    if prior and not has_grant:
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

    # A terminated exam (e.g. screenshot detected) is cancelled: zero score, no
    # points, always flagged. The attempt row is still written so the UNIQUE
    # (test_id, student_id) lock applies → re-entry needs a teacher-approved reattempt.
    if request.terminated:
        correct_count = 0
        wrong_count = len(questions_list)
        marks_deducted = 0
        total_obtained = 0

    # Determine if flagged (cheat events, or a termination)
    flagged = request.terminated or len(request.cheat_events) > 0

    # Calculate percentage
    score_pct = (total_obtained / test.data["total_marks"] * 100) if test.data["total_marks"] > 0 else 0

    # Points earned (based on score). A terminated/cancelled exam earns nothing.
    points_earned = 0
    if request.terminated:
        points_earned = 0
    elif score_pct >= 90:
        points_earned = 100
    elif score_pct >= 75:
        points_earned = 75
    elif score_pct >= 60:
        points_earned = 50
    elif score_pct >= 40:
        points_earned = 25
    else:
        points_earned = 10

    # Write attempt
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
        "started_at": datetime.now(timezone.utc).isoformat(),
        "submitted_at": datetime.now(timezone.utc).isoformat()
    }
    if prior:
        # Overwrite the prior attempt (a re-attempt of a test already taken).
        result = service_supabase.table("test_attempts").update(attempt_data).eq("id", prior["id"]).execute()
    else:
        # First-ever attempt — a normal submission, OR a MISSED test re-opened by a grant.
        result = service_supabase.table("test_attempts").insert(attempt_data).execute()
    if has_grant:
        # Consume the one-shot grant by marking the approved request 'completed'
        # (that status IS the grant — no DB column). Covers BOTH a re-attempt of a
        # prior score and a first attempt of a missed test the teacher re-opened.
        try:
            service_supabase.table("test_reattempt_requests").update({"status": "completed"}) \
                .eq("test_id", test_id).eq("student_id", user["student_id"]).eq("status", "approved").execute()
        except Exception:
            pass

    # Mark the attempt as terminated (cancelled). Best-effort: the column is optional,
    # so an un-migrated DB never blocks submission — the score-0 + flagged above already
    # encode the cancellation; this column only lets the UI label it "Cancelled".
    if request.terminated and result.data:
        try:
            service_supabase.table("test_attempts").update({"terminated": True}).eq("id", result.data[0]["id"]).execute()
        except Exception:
            pass

    # Update student points. On a re-attempt, apply only the DELTA vs the old attempt
    # (which already contributed its points) so totals/leaderboard stay correct.
    points_delta = (points_earned - (prior.get("points_earned") or 0)) if prior else points_earned
    student = service_supabase.table("students").select("points").eq("id", user["student_id"]).single().execute()
    if student.data:
        new_points = (student.data.get("points") or 0) + points_delta
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
        "flagged": flagged,
        "terminated": request.terminated,
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


# ── Test re-attempt requests (student asks → teacher approves) ──────────────────

# Student requests to re-attempt a test they already submitted.
@app.post("/api/tests/{test_id}/reattempt-request")
def request_reattempt(test_id: str, req: ReattemptRequest, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    if not user.get("student_id"):
        raise HTTPException(status_code=400, detail="Student record not found. Contact your teacher.")
    if not _reattempt_enabled():
        raise HTTPException(status_code=503, detail="Re-attempt isn't enabled yet. Please ask your teacher to finish setup.")

    # A re-attempt can be requested either for a test the student ALREADY took
    # (wants to improve / was cut off) OR for one they MISSED entirely (absent /
    # deadline passed) and want the teacher to re-open — so a prior attempt is
    # optional. Can't request if a grant is already open.
    existing = service_supabase.table("test_attempts").select("id, score").eq("test_id", test_id).eq("student_id", user["student_id"]).execute()
    prior_attempt = existing.data[0] if existing.data else None
    if _has_approved_reattempt(test_id, user["student_id"]):
        raise HTTPException(status_code=400, detail="A re-attempt is already approved — just open the test again.")

    # Block a second pending request (partial unique index also guards this).
    pending = service_supabase.table("test_reattempt_requests").select("id").eq("test_id", test_id).eq("student_id", user["student_id"]).eq("status", "pending").execute()
    if pending.data:
        raise HTTPException(status_code=400, detail="You already have a pending request for this test.")

    try:
        service_supabase.table("test_reattempt_requests").insert({
            "test_id": test_id,
            "student_id": user["student_id"],
            "reason": (req.reason or "").strip()[:500] or None,
            "status": "pending",
            "old_score": prior_attempt.get("score") if prior_attempt else None,
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Could not submit request. Please try again.")

    # Best-effort: notify the teacher who owns the test (never blocks the request).
    try:
        test = service_supabase.table("tests").select("title, created_by").eq("id", test_id).single().execute()
        teacher_id = (test.data or {}).get("created_by")
        if teacher_id:
            student = service_supabase.table("students").select("name").eq("id", user["student_id"]).single().execute()
            sname = (student.data or {}).get("name") or "A student"
            ttitle = (test.data or {}).get("title") or "a test"
            _emit_notification(teacher_id, "teacher", "reattempt_request",
                "Re-attempt requested", f"{sname} asked to re-attempt “{ttitle}”.",
                {"test_id": test_id, "student_id": user["student_id"]})
    except Exception as e:
        print(f"Re-attempt teacher notification failed: {e}")

    return {"status": "pending"}


# Teacher lists pending re-attempt requests (optionally for one test).
@app.get("/api/reattempt-requests")
def list_reattempt_requests(test_id: Optional[str] = None, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase or not _reattempt_enabled():
        return []

    q = service_supabase.table("test_reattempt_requests").select(
        "*, students(name, username, avatar_url), tests(title)"
    ).eq("status", "pending")
    if test_id:
        q = q.eq("test_id", test_id)
    rows = q.order("created_at", desc=True).execute()
    return rows.data or []


# Teacher approves a re-attempt → grants the student one overwrite-attempt.
@app.patch("/api/reattempt-requests/{request_id}/approve")
def approve_reattempt(request_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    request = service_supabase.table("test_reattempt_requests").select("*").eq("id", request_id).single().execute()
    if not request.data:
        raise HTTPException(status_code=404, detail="Request not found")
    r = request.data

    # Grant the one-shot re-take by marking the request 'approved' — that status
    # IS the grant (read by _has_approved_reattempt). No test_attempts column write,
    # which would fail on DBs where the reattempt_allowed column was never added.
    service_supabase.table("test_reattempt_requests").update({
        "status": "approved",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
        "resolved_by": user["user_id"],
    }).eq("id", request_id).execute()

    # Best-effort: tell the student they can re-take.
    try:
        test = service_supabase.table("tests").select("title").eq("id", r["test_id"]).single().execute()
        ttitle = (test.data or {}).get("title") or "your test"
        _emit_notification(r["student_id"], "student", "reattempt_approved",
            "Re-attempt approved", f"You can now re-take “{ttitle}”.",
            {"test_id": r["test_id"]})
    except Exception as e:
        print(f"Re-attempt student notification failed: {e}")

    return {"status": "approved"}


# Teacher rejects a re-attempt request.
@app.patch("/api/reattempt-requests/{request_id}/reject")
def reject_reattempt(request_id: str, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    request = service_supabase.table("test_reattempt_requests").select("*").eq("id", request_id).single().execute()
    if not request.data:
        raise HTTPException(status_code=404, detail="Request not found")
    r = request.data

    service_supabase.table("test_reattempt_requests").update({
        "status": "rejected",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
        "resolved_by": user["user_id"],
    }).eq("id", request_id).execute()

    try:
        test = service_supabase.table("tests").select("title").eq("id", r["test_id"]).single().execute()
        ttitle = (test.data or {}).get("title") or "your test"
        _emit_notification(r["student_id"], "student", "reattempt_rejected",
            "Re-attempt not approved", f"Your re-attempt request for “{ttitle}” was declined.",
            {"test_id": r["test_id"]})
    except Exception as e:
        print(f"Re-attempt reject notification failed: {e}")

    return {"status": "rejected"}


# Student's own re-attempt request status per test ({test_id: status}).
@app.get("/api/student/reattempt-requests")
def my_reattempt_requests(user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        return {}
    if not user.get("student_id"):
        return {}
    try:
        rows = service_supabase.table("test_reattempt_requests").select("test_id, status, created_at") \
            .eq("student_id", user["student_id"]).order("created_at", desc=True).execute()
        # Keep the latest status per test (rows already newest-first).
        out: Dict[str, str] = {}
        for row in (rows.data or []):
            out.setdefault(row["test_id"], row["status"])
        return out
    except Exception:
        return {}


# ── Assignment re-attempt requests (graded → request → approve clears grade) ────

def _assignment_teacher_id(class_id: str) -> Optional[str]:
    """Resolve the teacher who owns an assignment's class (for notifications)."""
    try:
        subj = service_supabase.table("subject_classes").select("standard_id").eq("id", class_id).single().execute()
        if not subj.data:
            return None
        std = service_supabase.table("standards").select("teacher_id").eq("id", subj.data["standard_id"]).single().execute()
        return (std.data or {}).get("teacher_id")
    except Exception:
        return None


# Student requests to re-do a GRADED assignment.
@app.post("/api/assignments/{assignment_id}/reattempt-request")
def request_assignment_reattempt(assignment_id: str, req: ReattemptRequest, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    if not user.get("student_id"):
        raise HTTPException(status_code=400, detail="Student record not found. Contact your teacher.")
    if not _assignment_reattempt_enabled():
        raise HTTPException(status_code=503, detail="Re-attempt isn't enabled yet. Please ask your teacher to finish setup.")

    sub = service_supabase.table("assignment_submissions").select("marks_obtained").eq("assignment_id", assignment_id).eq("student_id", user["student_id"]).execute()
    if not sub.data:
        raise HTTPException(status_code=400, detail="You haven't submitted this assignment yet.")
    if sub.data[0].get("marks_obtained") is None:
        raise HTTPException(status_code=400, detail="This assignment isn't graded yet — you can retract and resubmit it directly.")

    pending = service_supabase.table("assignment_reattempt_requests").select("id").eq("assignment_id", assignment_id).eq("student_id", user["student_id"]).eq("status", "pending").execute()
    if pending.data:
        raise HTTPException(status_code=400, detail="You already have a pending request for this assignment.")

    try:
        service_supabase.table("assignment_reattempt_requests").insert({
            "assignment_id": assignment_id,
            "student_id": user["student_id"],
            "reason": (req.reason or "").strip()[:500] or None,
            "status": "pending",
            "old_marks": sub.data[0].get("marks_obtained"),
        }).execute()
    except Exception:
        raise HTTPException(status_code=400, detail="Could not submit request. Please try again.")

    try:
        a = service_supabase.table("assignments").select("title, class_id").eq("id", assignment_id).single().execute()
        teacher_id = _assignment_teacher_id((a.data or {}).get("class_id"))
        if teacher_id:
            student = service_supabase.table("students").select("name").eq("id", user["student_id"]).single().execute()
            sname = (student.data or {}).get("name") or "A student"
            atitle = (a.data or {}).get("title") or "an assignment"
            _emit_notification(teacher_id, "teacher", "assignment_reattempt_request",
                "Assignment re-do requested", f"{sname} asked to redo “{atitle}”.",
                {"assignment_id": assignment_id, "student_id": user["student_id"]})
    except Exception as e:
        print(f"Assignment re-attempt teacher notification failed: {e}")

    return {"status": "pending"}


# Teacher lists pending assignment re-attempt requests (optionally for one assignment).
@app.get("/api/assignment-reattempt-requests")
def list_assignment_reattempt_requests(assignment_id: Optional[str] = None, user = Depends(verify_token)):
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase or not _assignment_reattempt_enabled():
        return []
    q = service_supabase.table("assignment_reattempt_requests").select(
        "*, students(name, username, avatar_url), assignments(title)"
    ).eq("status", "pending")
    if assignment_id:
        q = q.eq("assignment_id", assignment_id)
    rows = q.order("created_at", desc=True).execute()
    return rows.data or []


# Teacher approves → clears the grade so the student can retract + resubmit.
@app.patch("/api/assignment-reattempt-requests/{request_id}/approve")
def approve_assignment_reattempt(request_id: str, user = Depends(verify_token)):
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    request = service_supabase.table("assignment_reattempt_requests").select("*").eq("id", request_id).single().execute()
    if not request.data:
        raise HTTPException(status_code=404, detail="Request not found")
    r = request.data

    # Clear the grade on the student's submission so the existing retract/resubmit
    # path re-opens (it only allows ungraded submissions), and revert the points
    # that the grade awarded so the leaderboard reflects the cleared grade.
    sub = service_supabase.table("assignment_submissions").select("id, points_earned, student_id").eq("assignment_id", r["assignment_id"]).eq("student_id", r["student_id"]).execute()
    if sub.data:
        s = sub.data[0]
        pts = s.get("points_earned") or 0
        if pts > 0:
            try:
                stu = service_supabase.table("students").select("points").eq("id", s["student_id"]).single().execute()
                if stu.data:
                    service_supabase.table("students").update({"points": max(0, (stu.data.get("points") or 0) - pts)}).eq("id", s["student_id"]).execute()
            except Exception:
                pass
        service_supabase.table("assignment_submissions").update({
            "marks_obtained": None, "points_earned": 0, "prev_points_earned": 0, "graded_at": None,
        }).eq("id", s["id"]).execute()

    service_supabase.table("assignment_reattempt_requests").update({
        "status": "approved",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
        "resolved_by": user["user_id"],
    }).eq("id", request_id).execute()

    try:
        a = service_supabase.table("assignments").select("title").eq("id", r["assignment_id"]).single().execute()
        atitle = (a.data or {}).get("title") or "your assignment"
        _emit_notification(r["student_id"], "student", "assignment_reattempt_approved",
            "Re-do approved", f"You can now retract and resubmit “{atitle}”.",
            {"assignment_id": r["assignment_id"]})
    except Exception as e:
        print(f"Assignment re-attempt student notification failed: {e}")

    return {"status": "approved"}


# Teacher rejects an assignment re-attempt request.
@app.patch("/api/assignment-reattempt-requests/{request_id}/reject")
def reject_assignment_reattempt(request_id: str, user = Depends(verify_token)):
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    request = service_supabase.table("assignment_reattempt_requests").select("*").eq("id", request_id).single().execute()
    if not request.data:
        raise HTTPException(status_code=404, detail="Request not found")
    r = request.data

    service_supabase.table("assignment_reattempt_requests").update({
        "status": "rejected",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
        "resolved_by": user["user_id"],
    }).eq("id", request_id).execute()

    try:
        a = service_supabase.table("assignments").select("title").eq("id", r["assignment_id"]).single().execute()
        atitle = (a.data or {}).get("title") or "your assignment"
        _emit_notification(r["student_id"], "student", "assignment_reattempt_rejected",
            "Re-do not approved", f"Your re-do request for “{atitle}” was declined.",
            {"assignment_id": r["assignment_id"]})
    except Exception as e:
        print(f"Assignment re-attempt reject notification failed: {e}")

    return {"status": "rejected"}


# Student's own assignment re-attempt status per assignment ({assignment_id: status}).
@app.get("/api/student/assignment-reattempt-requests")
def my_assignment_reattempt_requests(user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase or not user.get("student_id") or not _assignment_reattempt_enabled():
        return {}
    try:
        rows = service_supabase.table("assignment_reattempt_requests").select("assignment_id, status, created_at") \
            .eq("student_id", user["student_id"]).order("created_at", desc=True).execute()
        out: Dict[str, str] = {}
        for row in (rows.data or []):
            out.setdefault(row["assignment_id"], row["status"])
        return out
    except Exception:
        return {}


# Get leaderboard for a standard.
# period=overall ranks by cumulative students.points; weekly/monthly recompute
# window points from the timestamped events that award them (test attempts,
# assignment submissions, video completions at 10 pts each — same windows as
# the report-v2 period filter).
@app.get("/api/leaderboard")
def get_leaderboard(standard_id: Optional[str] = None, period: str = "overall", user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    if period not in ("overall", "weekly", "monthly"):
        period = "overall"

    if period == "overall":
        if standard_id:
            students = service_supabase.table("students").select("id, name, username, points, avatar_url").eq("standard_id", standard_id).order("points", desc=True).execute()
        else:
            students = service_supabase.table("students").select("id, name, username, points, avatar_url").order("points", desc=True).limit(50).execute()
        return {
            "leaderboard": [
                {"rank": i + 1, **s}
                for i, s in enumerate(students.data or [])
            ],
            "period": period,
        }

    days = 7 if period == "weekly" else 30
    period_start = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    roster_q = service_supabase.table("students").select("id, name, username, avatar_url")
    if standard_id:
        roster_q = roster_q.eq("standard_id", standard_id)
    roster = roster_q.execute().data or []
    ids = [s["id"] for s in roster]
    window_points = {sid: 0 for sid in ids}

    if ids:
        try:
            attempts = service_supabase.table("test_attempts").select("student_id, points_earned") \
                .in_("student_id", ids).gte("submitted_at", period_start).execute()
            for a in (attempts.data or []):
                window_points[a["student_id"]] = window_points.get(a["student_id"], 0) + int(a.get("points_earned") or 0)
        except Exception as e:
            print(f"[!] leaderboard window tests failed (ignored): {e}")
        try:
            subs = service_supabase.table("assignment_submissions").select("student_id, points_earned") \
                .in_("student_id", ids).gte("submitted_at", period_start).execute()
            for s in (subs.data or []):
                window_points[s["student_id"]] = window_points.get(s["student_id"], 0) + int(s.get("points_earned") or 0)
        except Exception as e:
            print(f"[!] leaderboard window assignments failed (ignored): {e}")
        try:
            vids = service_supabase.table("video_progress").select("student_id") \
                .in_("student_id", ids).eq("completed", True).gte("last_watched_at", period_start).execute()
            for v in (vids.data or []):
                window_points[v["student_id"]] = window_points.get(v["student_id"], 0) + 10
        except Exception as e:
            print(f"[!] leaderboard window videos failed (ignored): {e}")

    ranked = sorted(roster, key=lambda s: window_points.get(s["id"], 0), reverse=True)
    if not standard_id:
        ranked = ranked[:50]
    return {
        "leaderboard": [
            {"rank": i + 1, **s, "points": window_points.get(s["id"], 0)}
            for i, s in enumerate(ranked)
        ],
        "period": period,
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
        "last_watched_at": datetime.now(timezone.utc).isoformat()
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
        "last_watched_at": datetime.now(timezone.utc).isoformat()
    }, on_conflict="video_id,student_id").execute()

    return {"status": "ok"}


# ── Private per-student video comments (student asks → teacher replies) ──────────
# Visibility model mirrors the re-attempt requests: a student sees ONLY their own
# comments; the teacher sees ALL comments on the video. Enforced server-side here
# (service key bypasses RLS), exactly like get_broadcasts' role filtering.

class VideoCommentCreate(BaseModel):
    text: str

class VideoCommentReply(BaseModel):
    text: str

@app.get("/api/videos/{video_id}/comments")
def list_video_comments(video_id: str, user = Depends(verify_token)):
    if not service_supabase or not _video_comments_enabled():
        return []
    if user["role"] == "teacher":
        rows = service_supabase.table("video_comments").select(
            "*, students(name, username, avatar_url)"
        ).eq("video_id", video_id).order("created_at", desc=True).execute()
        return rows.data or []
    # Student: only their own comments
    if not user.get("student_id"):
        return []
    rows = service_supabase.table("video_comments").select("*") \
        .eq("video_id", video_id).eq("student_id", user["student_id"]) \
        .order("created_at", desc=True).execute()
    return rows.data or []


@app.post("/api/videos/{video_id}/comments")
def create_video_comment(video_id: str, req: VideoCommentCreate, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    if not user.get("student_id"):
        raise HTTPException(status_code=400, detail="Student record not found. Contact your teacher.")
    if not _video_comments_enabled():
        raise HTTPException(status_code=503, detail="Comments aren't enabled yet. Please ask your teacher to finish setup.")

    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    text = text[:1000]

    try:
        ins = service_supabase.table("video_comments").insert({
            "video_id": video_id,
            "student_id": user["student_id"],
            "text": text,
        }).execute()
    except Exception:
        raise HTTPException(status_code=400, detail="Could not post comment. Please try again.")

    created = ins.data[0] if ins.data else {"video_id": video_id, "student_id": user["student_id"], "text": text}

    # Best-effort: notify the class teacher (never blocks the comment).
    try:
        vid = service_supabase.table("videos").select("title, class_id").eq("id", video_id).single().execute()
        class_id = (vid.data or {}).get("class_id")
        teacher_id = None
        if class_id:
            cls = service_supabase.table("subject_classes").select("standards(teacher_id)").eq("id", class_id).single().execute()
            teacher_id = (((cls.data or {}).get("standards") or {}) or {}).get("teacher_id")
        if teacher_id:
            student = service_supabase.table("students").select("name").eq("id", user["student_id"]).single().execute()
            sname = (student.data or {}).get("name") or "A student"
            vtitle = (vid.data or {}).get("title") or "a video"
            _emit_notification(teacher_id, "teacher", "video_comment",
                "New video question", f"{sname} asked about “{vtitle}”.",
                {"video_id": video_id, "student_id": user["student_id"]})
    except Exception as e:
        print(f"Video comment teacher notification failed: {e}")

    return created


@app.patch("/api/video-comments/{comment_id}/reply")
def reply_video_comment(comment_id: str, req: VideoCommentReply, user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Reply cannot be empty")
    text = text[:1000]

    existing = service_supabase.table("video_comments").select("student_id, video_id").eq("id", comment_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Comment not found")

    replied_at = datetime.now(timezone.utc).isoformat()
    upd = service_supabase.table("video_comments").update({
        "teacher_reply": text,
        "replied_at": replied_at,
    }).eq("id", comment_id).execute()

    # Best-effort: notify the student their question was answered.
    try:
        _emit_notification(existing.data["student_id"], "student", "video_reply",
            "Teacher replied", "Your teacher answered your question.",
            {"video_id": existing.data.get("video_id")})
    except Exception as e:
        print(f"Video reply student notification failed: {e}")

    return upd.data[0] if upd.data else {"id": comment_id, "teacher_reply": text, "replied_at": replied_at}


@app.delete("/api/video-comments/{comment_id}")
def delete_video_comment(comment_id: str, user = Depends(verify_token)):
    """Delete a comment. A student may delete only their OWN message; the teacher
    may delete any (mirrors the reply endpoint's role model)."""
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    existing = service_supabase.table("video_comments").select("student_id").eq("id", comment_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Comment not found")
    if user["role"] == "teacher":
        pass  # teacher can delete any
    elif user["role"] == "student" and existing.data.get("student_id") == user.get("student_id"):
        pass  # student can delete their own
    else:
        raise HTTPException(status_code=403, detail="Not allowed")
    service_supabase.table("video_comments").delete().eq("id", comment_id).execute()
    return {"ok": True}


# ── Video likes (student likes a lesson; teacher sees the count) ─────────────────

def _video_like_count(video_id: str) -> int:
    try:
        res = service_supabase.table("video_likes").select("id", count="exact").eq("video_id", video_id).execute()
        return res.count or 0
    except Exception:
        return 0


@app.post("/api/videos/{video_id}/like")
def like_video(video_id: str, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase or not user.get("student_id"):
        raise HTTPException(status_code=503, detail="Not available")
    if not _video_likes_enabled():
        raise HTTPException(status_code=503, detail="Likes aren't enabled yet.")
    try:
        # Idempotent: ignore the duplicate-key error if already liked.
        service_supabase.table("video_likes").insert(
            {"video_id": video_id, "student_id": user["student_id"]}
        ).execute()
    except Exception:
        pass
    return {"liked": True, "like_count": _video_like_count(video_id)}


@app.delete("/api/videos/{video_id}/like")
def unlike_video(video_id: str, user = Depends(verify_token)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")
    if not service_supabase or not user.get("student_id"):
        raise HTTPException(status_code=503, detail="Not available")
    if not _video_likes_enabled():
        return {"liked": False, "like_count": 0}
    service_supabase.table("video_likes").delete() \
        .eq("video_id", video_id).eq("student_id", user["student_id"]).execute()
    return {"liked": False, "like_count": _video_like_count(video_id)}


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
        raise HTTPException(status_code=503, detail="Notification database unavailable")
    try:
        response = service_supabase.table("notifications").select("*")\
            .eq("recipient_id", user["user_id"])\
            .order("created_at", desc=True)\
            .limit(30)\
            .execute()
        return response.data or []
    except Exception as e:
        print(f"[notifications] list failed: {e}")
        raise HTTPException(status_code=503, detail="Notifications are temporarily unavailable")

@app.patch("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Notification database unavailable")
    try:
        service_supabase.table("notifications").update({"read": True})\
            .eq("id", notification_id)\
            .eq("recipient_id", user["user_id"])\
            .execute()
        return {"ok": True}
    except Exception as e:
        print(f"[notifications] mark read failed: {e}")
        raise HTTPException(status_code=503, detail="Could not update notification")

@app.post("/api/notifications/read-all")
def mark_all_notifications_read(user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Notification database unavailable")
    try:
        service_supabase.table("notifications").update({"read": True})\
            .eq("recipient_id", user["user_id"])\
            .eq("read", False)\
            .execute()
        return {"ok": True}
    except Exception as e:
        print(f"[notifications] mark all read failed: {e}")
        raise HTTPException(status_code=503, detail="Could not update notifications")


# ─── DEVICE TOKENS (push notification registration) ──────────────────────────
class DeviceTokenReq(BaseModel):
    token: str
    platform: str = "android"


@app.post("/api/devices/register")
def register_device_token(req: DeviceTokenReq, user = Depends(verify_token)):
    """Register/refresh this phone's FCM token for the logged-in user. Upserts by
    token so the same device re-binds to whoever is currently logged in (shared
    phones), and a re-login just refreshes updated_at."""
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Device registration database unavailable")
    token = (req.token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="token required")
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        service_supabase.table("device_tokens").upsert({
            "user_id": user["user_id"],
            "token": token,
            "platform": (req.platform or "android")[:16],
            "updated_at": now_iso,
        }, on_conflict="token").execute()
    except Exception as e:
        print(f"[devices] register failed: {e}")
        raise HTTPException(status_code=503, detail="Could not register this device for notifications")
    return {"ok": True}


@app.delete("/api/devices/register")
def unregister_device_token(req: DeviceTokenReq, user = Depends(verify_token)):
    """Remove this phone's token (called on logout) so the previous user stops
    receiving pushes on a shared device."""
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Device registration database unavailable")
    token = (req.token or "").strip()
    if not token:
        return {"ok": True}
    try:
        service_supabase.table("device_tokens").delete().eq("token", token).execute()
    except Exception as e:
        print(f"[devices] unregister failed: {e}")
        raise HTTPException(status_code=503, detail="Could not unregister this device")
    return {"ok": True}


@app.get("/api/admin/push-debug")
def push_debug(test: int = 0, test_all: int = 0, user = Depends(verify_token)):
    """Diagnose push delivery. Reports whether FCM is configured, the caller's token
    count, and the TOTAL token count across all users. With ?test=1 sends to the caller's
    own phones; with ?test_all=1 sends a test to EVERY registered token and returns the
    raw per-token FCM result — so the true failure (API-not-enabled / auth / sender
    mismatch / 200-delivered) is visible without guessing. Teacher only."""
    if user["role"] not in ("teacher", "sub_teacher"):
        raise HTTPException(status_code=403, detail="Teacher only")
    configured = bool(_load_fcm_sa())
    out = {
        "fcm_configured": configured,
        "project_id": _fcm_project_id,
        "my_user_id": user["user_id"],
        "my_token_count": 0,
        "total_tokens": 0,
        "tested": False,
    }
    # Surface OAuth-mint health explicitly (a None token = SA/scope/clock problem).
    if configured:
        out["oauth_token_ok"] = bool(_fcm_access_token())
        if not out["oauth_token_ok"]:
            out["oauth_error"] = _fcm_last_error
        # Confirm the google-auth dependency is actually importable in this image.
        try:
            import google.oauth2.service_account  # noqa: F401
            out["google_auth_installed"] = True
        except Exception as e:
            out["google_auth_installed"] = False
            out["google_auth_import_error"] = f"{type(e).__name__}: {e}"

    toks, all_toks = [], []
    if service_supabase:
        try:
            rows = service_supabase.table("device_tokens").select("token, platform, user_id").eq("user_id", user["user_id"]).execute()
            toks = [r["token"] for r in (rows.data or []) if r.get("token")]
            out["my_token_count"] = len(toks)
            out["platforms"] = list({r.get("platform") for r in (rows.data or [])})
        except Exception as e:
            out["token_lookup_error"] = str(e)[:160]
        try:
            allrows = service_supabase.table("device_tokens").select("token, user_id, platform, updated_at").execute()
            all_rows = allrows.data or []
            all_toks = [r["token"] for r in all_rows if r.get("token")]
            out["total_tokens"] = len(all_toks)
            # Label each token's owner as student vs teacher so we can see if any
            # STUDENT is actually registered (broadcasts push to students).
            uids = list({r.get("user_id") for r in all_rows if r.get("user_id")})
            student_ids = set()
            if uids:
                srows = service_supabase.table("students").select("id").in_("id", uids).execute()
                student_ids = {r["id"] for r in (srows.data or [])}
            out["tokens_detail"] = [{
                "user": (r.get("user_id") or "")[:8],
                "role": "student" if r.get("user_id") in student_ids else "teacher/other",
                "platform": r.get("platform"),
                "updated_at": r.get("updated_at"),
            } for r in all_rows]
            out["student_token_count"] = sum(1 for r in all_rows if r.get("user_id") in student_ids)
        except Exception as e:
            out["all_token_lookup_error"] = str(e)[:160]

    target = all_toks if test_all else toks
    if (test or test_all) and configured and target:
        out["tested"] = True
        out["tested_token_count"] = len(target)
        out["results"] = _send_fcm(
            target,
            notification={"title": "Udaya test", "body": "Push notifications are working 🎉"},
            data={"kind": "test"}, android_high_priority=True,
        )
    elif test or test_all:
        out["tested"] = False
        out["test_skipped_reason"] = ("fcm not configured" if not configured
                                      else "no device tokens to send to")
    return out


# --- WebSockets & Broadcasts & Uploads ---

@app.websocket("/api/ws/broadcasts/{standard_id}")
async def websocket_endpoint(websocket: WebSocket, standard_id: str, token: Optional[str] = None):
    if not token:
        await websocket.close(code=4001)
        return
    # Reuse verify_token's short-TTL auth cache: the broadcast page just made
    # authenticated HTTP calls, so this token is almost always warm — skipping a
    # blocking Supabase Auth round-trip that was the main "broadcast loading"
    # delay. On a cache miss, validate OFF the event loop so it doesn't stall
    # other connections.
    cached = _auth_cache.get(token)
    valid = bool(cached and cached["expires_at"] > time_module.time())
    if not valid:
        try:
            ur = await asyncio.to_thread(lambda: supabase.auth.get_user(token))
            valid = bool(ur and ur.user)
        except Exception:
            valid = False
    if not valid:
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
                expires_at = (datetime.now(timezone.utc) + timedelta(hours=ttl)).isoformat()
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
        payload["created_at"] = datetime.now(timezone.utc).isoformat()
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
        # Notify + push every student in the standard (best-effort, non-blocking).
        snippet = (req.message or ("📎 Attachment" if req.attachment_url else "New message"))[:120]
        await asyncio.to_thread(_notify_standard_students, req.standard_id, "broadcast",
            "New message", snippet, {"standard_id": req.standard_id})

    return {"status": "success", "data": payload}

@app.get("/api/broadcasts")
def get_broadcasts(standard_id: Optional[str] = None, user = Depends(verify_token)):
    history = manager.broadcast_history
    if standard_id:
        history = [b for b in history if b.get("standard_id") == standard_id]
    now_iso = datetime.now(timezone.utc).isoformat()
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
        now = datetime.now(timezone.utc).isoformat()
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

    # Persist to the DB FIRST — it's the source of truth. Previously the edit only
    # touched the in-memory history (+ a JSON file), both of which are wiped on
    # every backend restart/redeploy. So the DB kept the old text, and any student
    # reconnecting (or after a server restart) saw the OLD message loaded from the
    # DB. Also both `message` and `text` columns are coalesced on read, so update
    # both to be safe.
    std_id = None
    if service_supabase:
        try:
            res = await asyncio.to_thread(lambda: service_supabase.table("broadcasts").update(
                {"message": req.message, "text": req.message, "edited": True}
            ).eq("id", broadcast_id).execute())
            if res.data:
                std_id = res.data[0].get("standard_id")
        except Exception:
            # Some DBs may not have a `text` column — retry message-only.
            try:
                res = await asyncio.to_thread(lambda: service_supabase.table("broadcasts").update(
                    {"message": req.message, "edited": True}
                ).eq("id", broadcast_id).execute())
                if res.data:
                    std_id = res.data[0].get("standard_id")
            except Exception as e:
                print(f"[!] broadcast edit DB update failed: {e}")

    # Update the in-memory snapshot used for the WS history-on-connect.
    updated_b = None
    for b in manager.broadcast_history:
        if b.get("id") == broadcast_id:
            b["message"] = req.message
            b["text"] = req.message
            b["edited"] = True
            updated_b = b
            std_id = std_id or b.get("standard_id")
            break
    manager.save_history()

    if std_id is None:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    if updated_b is None:
        # Not in the in-memory snapshot (e.g. after a restart) — still push a
        # minimal payload so live clients update immediately.
        updated_b = {"id": broadcast_id, "message": req.message, "edited": True, "standard_id": std_id}

    # Notify connected clients in real-time
    if std_id in manager.active_connections:
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
    created = (result.data or [{}])[0]
    # Notify + push every student of the class (best-effort, non-blocking).
    await asyncio.to_thread(_notify_students_of_content, req.class_id, "new_note",
        f"New note: {req.title}", "", {"note_id": created.get("id")})
    return created

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
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
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
            await asyncio.to_thread(lambda: filestore.remove(service_supabase, "notes", path, public=False))
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
    contents = await file.read()
    validate_upload(file.filename, contents, IMAGE_EXTS | DOC_EXTS | AUDIO_EXTS)
    ct = file.content_type or "application/octet-stream"
    # Office files (ppt/xls/doc/…) → PDF once at upload so they open in the viewer.
    contents, ext, ct, _ = await _maybe_convert_office_to_pdf(file.filename, contents, ct)
    path = f"{class_id}/{uuid.uuid4()}.{ext or 'bin'}"
    # PRIVATE bucket: the file is never publicly reachable. Students view it only
    # through the authed streaming endpoint GET /api/notes/{id}/file (no URL, no
    # download). We return the storage key, not a public URL.
    await asyncio.to_thread(lambda: filestore.upload_private(service_supabase, "notes", path, contents, ct))
    return {"url": None, "path": path, "type": ct}


# ── Secure file viewing: authed byte-streaming so students never get a file URL ──
# Files live in the PRIVATE bucket; these endpoints verify the caller may see the
# resource (enrolled student OR owning teacher), then proxy the bytes inline. No
# presigned URL ever reaches the client → no download, no shareable link.

def _require_class_access(class_id: str, user: dict):
    """Raise 403 unless `user` is a student enrolled in this class's standard, or
    the teacher who owns it. Mirrors the video-token check (main.py:4866)."""
    cls = service_supabase.table("subject_classes").select("standard_id").eq("id", class_id).single().execute()
    if not cls.data:
        raise HTTPException(status_code=404, detail="Not found")
    standard_id = cls.data["standard_id"]
    if user["role"] == "teacher":
        owns = service_supabase.table("standards").select("id") \
            .eq("id", standard_id).eq("teacher_id", user["teacher_id"]).single().execute()
        if not owns.data:
            raise HTTPException(status_code=403, detail="Not your class")
    else:
        if user.get("standard_id") != standard_id:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")
        blocked = service_supabase.table("students").select("blocked").eq("id", user["user_id"]).single().execute()
        if not blocked.data or blocked.data.get("blocked"):
            raise HTTPException(status_code=403, detail="Account blocked")


async def _stream_stored_file(storage_path: Optional[str], legacy_url: Optional[str],
                              bucket: str, content_type: Optional[str], filename: str = "file"):
    """Return the file bytes inline. Resilient across the public→private migration:
    try the PRIVATE bucket first; if the key isn't there (a legacy note whose file
    is still in the PUBLIC bucket), try the public bucket with the same key; finally
    fall back to proxying a stored legacy public URL. So existing files keep working
    with NO migration required, while new uploads are private."""
    data = None
    if storage_path:
        try:
            data = await asyncio.to_thread(lambda: filestore.get_bytes(service_supabase, bucket, storage_path, private=True))
        except Exception:
            try:  # legacy: file may still live in the PUBLIC bucket under the same key
                data = await asyncio.to_thread(lambda: filestore.get_bytes(service_supabase, bucket, storage_path, private=False))
            except Exception:
                data = None
    if data is None and legacy_url and legacy_url.startswith("http"):
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(legacy_url)
            if r.status_code == 200:
                data = r.content
                content_type = content_type or r.headers.get("content-type")
    if data is None:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(
        content=data,
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{filename}"', "Cache-Control": "private, no-store"},
    )


def _require_app_for_students(user: dict, x_udaya_client: Optional[str]):
    """App-only viewing for students: protected files may only be fetched from the
    native app (where screenshots are blocked), never from student web. Teachers
    (content owners) are exempt. The header is set by the app in api.js — a soft
    gate (a determined user could spoof it), but it closes the casual web path."""
    if user["role"] == "student" and x_udaya_client != "app":
        raise HTTPException(status_code=451, detail="Open in the Udaya app to view this file.")


@app.get("/api/notes/{note_id}/file")
async def get_note_file(note_id: str, user = Depends(verify_token),
                        x_udaya_client: Optional[str] = Header(None, alias="X-Udaya-Client")):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="DB not configured")
    _require_app_for_students(user, x_udaya_client)
    note = await asyncio.to_thread(lambda: service_supabase.table("notes")
        .select("class_id, storage_path, file_url, file_type, title").eq("id", note_id).single().execute())
    if not note.data:
        raise HTTPException(status_code=404, detail="Note not found")
    await asyncio.to_thread(lambda: _require_class_access(note.data["class_id"], user))
    return await _stream_stored_file(
        note.data.get("storage_path"), note.data.get("file_url"),
        "notes", note.data.get("file_type"), note.data.get("title") or "note",
    )


@app.get("/api/assignment-attachments/{attachment_id}/file")
async def get_assignment_attachment_file(attachment_id: str, user = Depends(verify_token),
                                         x_udaya_client: Optional[str] = Header(None, alias="X-Udaya-Client")):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="DB not configured")
    _require_app_for_students(user, x_udaya_client)
    att = await asyncio.to_thread(lambda: service_supabase.table("assignment_attachments")
        .select("assignment_id, storage_path, file_url, file_type, file_name").eq("id", attachment_id).single().execute())
    if not att.data:
        raise HTTPException(status_code=404, detail="Attachment not found")
    asg = await asyncio.to_thread(lambda: service_supabase.table("assignments")
        .select("class_id").eq("id", att.data["assignment_id"]).single().execute())
    if not asg.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await asyncio.to_thread(lambda: _require_class_access(asg.data["class_id"], user))
    return await _stream_stored_file(
        att.data.get("storage_path"), att.data.get("file_url"),
        "assignments", att.data.get("file_type"), att.data.get("file_name") or "file",
    )


@app.get("/api/assignment-submissions/{submission_id}/file")
async def get_assignment_submission_file(submission_id: str, user = Depends(verify_token),
                                         x_udaya_client: Optional[str] = Header(None, alias="X-Udaya-Client")):
    """View-only stream of a student's submitted file (no download, app-only for
    students). The owning student sees only their own; the owning teacher can view
    any submission in their class. A different student is refused even if enrolled."""
    if not service_supabase:
        raise HTTPException(status_code=503, detail="DB not configured")
    _require_app_for_students(user, x_udaya_client)
    sub = await asyncio.to_thread(lambda: service_supabase.table("assignment_submissions")
        .select("assignment_id, student_id, storage_path, file_url, file_type, file_name")
        .eq("id", submission_id).single().execute())
    if not sub.data:
        raise HTTPException(status_code=404, detail="Submission not found")
    if user["role"] == "student":
        # Students may only ever open their OWN submission.
        if sub.data.get("student_id") != user.get("student_id"):
            raise HTTPException(status_code=403, detail="Not your submission")
    else:
        # Teacher: must own the class the assignment belongs to.
        asg = await asyncio.to_thread(lambda: service_supabase.table("assignments")
            .select("class_id").eq("id", sub.data["assignment_id"]).single().execute())
        if not asg.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        await asyncio.to_thread(lambda: _require_class_access(asg.data["class_id"], user))
    return await _stream_stored_file(
        sub.data.get("storage_path"), sub.data.get("file_url"),
        "assignments", sub.data.get("file_type"), sub.data.get("file_name") or "file",
    )


def _require_standard_access(standard_id: str, user: dict):
    """Raise 403 unless the user is a student in this standard or its owning teacher."""
    if user["role"] == "teacher":
        owns = service_supabase.table("standards").select("id") \
            .eq("id", standard_id).eq("teacher_id", user["teacher_id"]).single().execute()
        if not owns.data:
            raise HTTPException(status_code=403, detail="Not your class")
    else:
        if user.get("standard_id") != standard_id:
            raise HTTPException(status_code=403, detail="Not in this class")
        blocked = service_supabase.table("students").select("blocked").eq("id", user["user_id"]).single().execute()
        if not blocked.data or blocked.data.get("blocked"):
            raise HTTPException(status_code=403, detail="Account blocked")


@app.get("/api/broadcasts/{broadcast_id}/file")
async def get_broadcast_file(broadcast_id: str, user = Depends(verify_token),
                             x_udaya_client: Optional[str] = Header(None, alias="X-Udaya-Client")):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="DB not configured")
    _require_app_for_students(user, x_udaya_client)
    b = await asyncio.to_thread(lambda: service_supabase.table("broadcasts")
        .select("standard_id, attachment_url, attachment_type").eq("id", broadcast_id).single().execute())
    if not b.data:
        raise HTTPException(status_code=404, detail="Not found")
    await asyncio.to_thread(lambda: _require_standard_access(b.data["standard_id"], user))
    att = b.data.get("attachment_url")
    # Document broadcast attachments store the private-bucket KEY; legacy/public
    # rows store a full URL which _stream_stored_file proxies for backward compat.
    storage_path = None if (att or "").startswith("http") else att
    legacy_url = att if (att or "").startswith("http") else None
    return await _stream_stored_file(storage_path, legacy_url, "broadcasts", b.data.get("attachment_type"), "attachment")


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), user = Depends(verify_token)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    file_bytes = await file.read()
    validate_upload(file.filename, file_bytes, IMAGE_EXTS | DOC_EXTS | AUDIO_EXTS)
    ct = file.content_type or "application/octet-stream"
    # Office files → PDF once at upload so they open in the in-app viewer.
    file_bytes, conv_ext, ct, _ = await _maybe_convert_office_to_pdf(file.filename, file_bytes, ct)
    file_name = f"{uuid.uuid4()}.{conv_ext}" if conv_ext else f"{uuid.uuid4()}{os.path.splitext(file.filename)[1]}"
    # Only VOICE NOTES (audio) stay public/inline in the chat. Images and documents
    # both go to the PRIVATE bucket and are viewed only through the authed, app-only
    # secure viewer (no download, no public URL) — the `secure` flag tells the client
    # to store the key and open it via /broadcasts/{id}/file.
    is_inline_media = ct.startswith("audio/")

    try:
        if is_inline_media:
            if not filestore.is_r2_enabled():
                try:
                    await asyncio.to_thread(lambda: service_supabase.storage.get_bucket("broadcasts"))
                except:
                    await asyncio.to_thread(lambda: service_supabase.storage.create_bucket("broadcasts", options={"public": True}))
            public_url = await asyncio.to_thread(
                lambda: filestore.upload_public(service_supabase, "broadcasts", file_name, file_bytes, ct)
            )
            return {"url": public_url, "type": ct, "filename": file.filename, "secure": False}

        # Document → private bucket; store the KEY (not a URL) in attachment_url.
        # `type` reflects any office→PDF conversion so the viewer classifies correctly.
        await asyncio.to_thread(
            lambda: filestore.upload_private(service_supabase, "broadcasts", file_name, file_bytes, ct)
        )
        return {"url": file_name, "type": ct, "filename": file.filename, "secure": True}
    except Exception as e:
        # Never embed the file as a base64 data: URL — that would store a large
        # binary inside the broadcasts table. Fail loudly so the file genuinely
        # lands in file storage (the teacher can retry).
        print("Upload error:", e)
        raise HTTPException(status_code=502, detail="File storage upload failed. Please try again.")

# --- Bulk Student Import ---

class BulkStudentItem(BaseModel):
    name: str
    username: str
    email: Optional[str] = None
    phone: Optional[str] = None
    parent_phone: Optional[str] = None
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
            # 0. Check if student already exists by username or email to update instead of skipping
            existing = []
            if s.username:
                existing = service_supabase.table("students").select("id, student_code").eq("username", s.username).execute().data or []
            if not existing and s.email:
                existing = service_supabase.table("students").select("id, student_code").eq("email", s.email).execute().data or []
            
            if existing:
                auth_user_id = existing[0]["id"]
                student_code = existing[0].get("student_code") or ""
                
                # Update base student info
                update_data = {
                    "name": s.name,
                    "standard_id": s.standard_id,
                }
                if s.email:
                    update_data["email"] = s.email
                if s.phone:
                    update_data["phone"] = s.phone
                service_supabase.table("students").update(update_data).eq("id", auth_user_id).execute()
                
                if s.parent_phone:
                    try:
                        service_supabase.table("students").update({"parent_phone": s.parent_phone}).eq("id", auth_user_id).execute()
                    except Exception:
                        pass
                
                if s.temp_password:
                    try:
                        service_supabase.table("students").update({"plain_password": s.temp_password}).eq("id", auth_user_id).execute()
                        service_supabase.auth.admin.update_user_by_id(auth_user_id, {"password": s.temp_password})
                    except Exception:
                        pass
                
                created.append({
                    "id": auth_user_id,
                    "standard_id": s.standard_id,
                    "name": s.name,
                    "username": s.username,
                    "student_code": student_code,
                    "email": s.email,
                    "phone": s.phone,
                    "parent_phone": s.parent_phone or "",
                    "standard_name": std_name_map.get(s.standard_id),
                    "temp_password": s.temp_password,
                })
                success_count += 1
                continue

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

            # parent_phone via guarded post-insert update — a DB without the column
            # must never block the import. See migrations/add_parent_phone.sql.
            if s.parent_phone:
                try:
                    service_supabase.table("students").update(
                        {"parent_phone": s.parent_phone}).eq("id", auth_user_id).execute()
                except Exception:
                    pass

            # 3. Generate + persist the student code (post-insert, like single create)
            student_code = assign_student_code(auth_user_id, s.standard_id, seq_cache=seq_cache)

            created.append({
                # id + standard_id let the in-grid "Add students" flow merge the
                # new rows in place (id is needed for later inline PATCH edits)
                # without a full refetch. The file-import modal ignores them.
                "id": auth_user_id,
                "standard_id": s.standard_id,
                "name": s.name,
                "username": s.username,
                "student_code": student_code,
                "email": s.email,
                "phone": s.phone,
                "parent_phone": s.parent_phone or "",
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
            "created_at": datetime.now(timezone.utc).isoformat()
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
        "created_at": datetime.now(timezone.utc).isoformat(),
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

def _lc_parse_when(lc: dict):
    """(start_dt, end_dt) of a class's plausible window, tz-aware, or (None, None)."""
    raw = lc.get("scheduled_at")
    if not raw:
        return None, None
    try:
        start = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
    except ValueError:
        return None, None
    end = start + timedelta(minutes=int(lc.get("duration_mins") or 60))
    return start, end


# Lead times (minutes before scheduled_at) at which a full-screen alarm fires.
# 0 == "starting now". One list so it's trivially tunable.
LIVE_CLASS_REMINDER_OFFSETS = [15, 10, 5, 0]


def _send_live_class_alarm(lc: dict, off: int):
    """Data-only, high-priority FCM to every student of the class's standard so the
    native UdayaMessagingService can raise a full-screen alarm. Best-effort."""
    try:
        subj = service_supabase.table("subject_classes").select("standard_id, name").eq("id", lc["class_id"]).single().execute()
        if not subj.data:
            return
        students = service_supabase.table("students").select("id, blocked").eq("standard_id", subj.data["standard_id"]).execute()
        ids = [s["id"] for s in (students.data or []) if not s.get("blocked")]
        tokens = _tokens_for_recipients(ids)
        if not tokens:
            return
        _send_fcm(tokens, notification=None, android_high_priority=True, data={
            "kind": "live_class_reminder",
            "live_class_id": lc["id"],
            "title": lc.get("title") or subj.data.get("name") or "Live class",
            "subject": subj.data.get("name") or "",
            "scheduled_at": lc.get("scheduled_at") or "",
            "offset_min": off,
            "when": "now" if off == 0 else f"in {off} min",
        })
    except Exception as e:
        print(f"[live-class reminders] send failed: {e}")


def _run_due_live_class_reminders():
    """Find scheduled classes whose current lead-time bracket just became due and
    fire one alarm each. The live_class_reminders UNIQUE(live_class_id, offset_min)
    is the lock that makes each (class, offset) fire exactly once."""
    now = datetime.now(timezone.utc)
    max_off = max(LIVE_CLASS_REMINDER_OFFSETS) if LIVE_CLASS_REMINDER_OFFSETS else 0
    floor = (now - timedelta(minutes=3)).isoformat()          # catch the 0-min "now" within grace
    ceil = (now + timedelta(minutes=max_off + 1)).isoformat()
    res = service_supabase.table("live_classes").select(
        "id, class_id, title, scheduled_at, duration_mins, status"
    ).eq("status", "scheduled").gte("scheduled_at", floor).lte("scheduled_at", ceil).execute()
    pos_offsets = sorted([o for o in LIVE_CLASS_REMINDER_OFFSETS if o > 0])
    for lc in (res.data or []):
        start, _end = _lc_parse_when(lc)
        if not start:
            continue
        mins_until = (start - now).total_seconds() / 60.0
        # The single "due" bracket: smallest positive offset still ahead, or 0 at start.
        due = None
        for off in pos_offsets:
            if mins_until <= off:
                due = off
                break
        if 0 in LIVE_CLASS_REMINDER_OFFSETS and -3 <= mins_until <= 0:
            due = 0
        if due is None:
            continue
        # Claim it — a unique-violation means another tick/instance already sent it.
        try:
            service_supabase.table("live_class_reminders").insert(
                {"live_class_id": lc["id"], "offset_min": due}).execute()
        except Exception:
            continue
        _send_live_class_alarm(lc, due)


async def _live_class_reminder_loop():
    """Every 60s, fire due full-screen live-class alarms. Dormant until FCM is
    configured. Mirrors the other background-loop tasks."""
    await asyncio.sleep(45)  # let startup settle
    while True:
        try:
            if service_supabase and _load_fcm_sa():
                await asyncio.to_thread(_run_due_live_class_reminders)
        except Exception as e:
            print(f"[live-class reminders] loop error: {e}")
        await asyncio.sleep(60)


async def _sync_live_class_statuses(classes: list) -> None:
    """Reconcile DB status with Zoom's reality, so cards go LIVE/ENDED on their
    own — the host runs the class from the Zoom phone app and never touches the
    portal. zoom_is_meeting_live is 60s-cached per meeting, and we only look at
    classes inside their plausible time window, so the 15s page polls stay cheap.
    Fully best-effort: a Zoom hiccup must never break the class list."""
    GRACE = timedelta(minutes=30)
    MAX_CHECKS = 5
    now = datetime.now(timezone.utc)
    checks = 0
    try:
        for lc in classes:
            if checks >= MAX_CHECKS:
                break
            status = lc.get("status")
            mid = lc.get("zoom_meeting_id")
            if not mid or status not in ("scheduled", "live"):
                continue
            start, end = _lc_parse_when(lc)
            if not start:
                continue

            if status == "scheduled":
                # Host may start a bit early; stop checking once the window is long over.
                if not (start - timedelta(minutes=10) <= now <= end + GRACE):
                    continue
                checks += 1
                if await zoom_is_meeting_live(mid):
                    lc["status"] = "live"
                    await asyncio.to_thread(lambda i=lc["id"]: service_supabase.table("live_classes")
                        .update({"status": "live"}).eq("id", i).execute())
            else:  # live — the host hanging up on their phone IS the end of class
                # Small safety margin after start so a just-started meeting that
                # Zoom hasn't registered yet can't be insta-ended.
                if now < start + timedelta(minutes=5):
                    continue
                checks += 1
                # Tri-state: only a DEFINITIVE "not running" (real Zoom 200) may
                # end the class — an API hiccup (None) must never kick a live
                # class to ended (join-token would then refuse new joiners).
                if (await zoom_meeting_live_state(mid)) is False:
                    lc["status"] = "ended"
                    await asyncio.to_thread(lambda i=lc["id"]: service_supabase.table("live_classes")
                        .update({"status": "ended"}).eq("id", i).execute())

                    # Finalize attendance in the background (absent rows + Zoom durations).
                    async def _finalize_bg(row=dict(lc)):
                        try:
                            await _finalize_live_class_attendance(row)
                        except Exception as e:
                            print(f"[!] auto-end attendance finalize failed (ignored): {e}")
                    asyncio.create_task(_finalize_bg())
    except Exception as e:
        print(f"[!] live-class status sync failed (ignored): {e}")


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
            # Branding is decorative — never let a missing column/row (e.g.
            # teacher_branding.profile_photo_url absent on an un-migrated DB) raise
            # here, since this runs inside asyncio.gather() and would otherwise 500
            # the entire live-classes list and show zero cards.
            try:
                return service_supabase.table("teacher_branding").select("thumbnail_url, thumbnail_text_side, profile_photo_url").eq("teacher_id", owner_id).single().execute()
            except Exception:
                return None
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

        # Reconcile scheduled/live with Zoom before zoom_meeting_id is stripped:
        # the host starts & ends the class from their phone app, so this poll is
        # the only way cards go LIVE/ENDED (and attendance finalizes) on their own.
        await _sync_live_class_statuses(classes)

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

    # Reconcile with Zoom (host starts/ends from the phone app): flips
    # scheduled→live and live→ended automatically, finalizing attendance.
    await _sync_live_class_statuses(classes)

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
    # Account-level "only host can share" — once per process, best-effort.
    asyncio.create_task(zoom_enforce_host_only_share())

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
    await asyncio.to_thread(_notify_students_of_content, data.class_id, "new_live_class",
                            f"Live class scheduled: {data.title}", "", {"content_id": result.data[0]["id"]})
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
        # Intentionally marked at token issuance — "opened the class" counts as
        # attended (no false negatives); the end-of-class finalize pass enriches
        # real durations from Zoom's report. Fire-and-forget so the token returns
        # immediately; best-effort, errors are swallowed.
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


@app.get("/api/live-classes/{live_class_id}/host-link")
async def get_host_link(live_class_id: str, user=Depends(verify_token)):
    """Zoom start_url for the owning teacher only — lets them start the class from
    the web portal (opens the Zoom client as host). Students never see this; the
    list endpoints keep stripping zoom_start_url from every response."""
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")

    lc_result = await asyncio.to_thread(lambda: service_supabase.table("live_classes") \
        .select("id, class_id, status, zoom_meeting_id, zoom_start_url").eq("id", live_class_id).single().execute())
    if not lc_result.data:
        raise HTTPException(status_code=404, detail="Live class not found")
    lc = lc_result.data

    if lc["status"] in ("ended", "cancelled"):
        raise HTTPException(status_code=400, detail=f"This class has {lc['status']}")
    if not lc.get("zoom_start_url") and not lc.get("zoom_meeting_id"):
        raise HTTPException(status_code=400, detail="No Zoom start link for this class")

    class_result = await asyncio.to_thread(lambda: service_supabase.table("subject_classes") \
        .select("standard_id").eq("id", lc["class_id"]).single().execute())
    required_std = class_result.data["standard_id"] if class_result.data else None
    std_check = await asyncio.to_thread(lambda: service_supabase.table("standards") \
        .select("id").eq("id", required_std).eq("teacher_id", user["teacher_id"]).single().execute())
    if not std_check.data:
        raise HTTPException(status_code=403, detail="Not your class")

    # The stored start_url's host token expires (~2h) → opening it later shows a
    # BLANK page and the teacher never becomes host. Re-fetch a fresh one from
    # Zoom at click time; fall back to the stored URL only if the fetch fails.
    fresh = await zoom_get_fresh_start_url(lc.get("zoom_meeting_id"))
    return {"start_url": fresh or lc.get("zoom_start_url")}


async def _finalize_live_class_attendance(lc: dict) -> dict:
    """Final attendance pass for a finished live class: merge Zoom's participant
    report over the join-time records (which are the source of truth — never
    downgrade a student who actually joined), write absent rows for everyone
    else. Shared by the End-Class button and the automatic ended-detection in
    the list endpoint."""
    live_class_id = lc["id"]
    participants = await zoom_get_participants(lc.get("zoom_meeting_id", ""))

    class_result = await asyncio.to_thread(lambda: service_supabase.table("subject_classes") \
        .select("standard_id").eq("id", lc["class_id"]).single().execute())
    if not class_result.data:
        return {"attended": 0, "absent": 0, "total": 0}

    students_result = await asyncio.to_thread(lambda: service_supabase.table("students") \
        .select("id, name, email") \
        .eq("standard_id", class_result.data["standard_id"]).execute())
    all_students = students_result.data or []

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

    return {"attended": attended_count, "absent": absent_count, "total": len(all_students)}


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

    summary = await _finalize_live_class_attendance(lc)
    return {"message": "Class ended", **summary}


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
        lc = service_supabase.table("live_classes") \
            .select("id, class_id").eq("zoom_meeting_id", meeting_id).eq("status", "scheduled").single().execute()
        if lc.data:
            lc_id = lc.data["id"]
            service_supabase.table("live_classes") \
                .update({"status": "live"}).eq("id", lc_id).execute()
            
            # Broadcast update
            sc = service_supabase.table("subject_classes").select("standard_id").eq("id", lc.data["class_id"]).single().execute()
            if sc.data:
                std_id = sc.data["standard_id"]
                msg = {"type": "status_update", "id": lc_id, "status": "live"}
                asyncio.create_task(lc_manager.broadcast(std_id, msg))
                asyncio.create_task(lc_manager.broadcast("teacher", msg))

    elif event == "meeting.ended":
        lc = service_supabase.table("live_classes") \
            .select("id, class_id").eq("zoom_meeting_id", meeting_id).single().execute()
        if lc.data:
            lc_id = lc.data["id"]
            service_supabase.table("live_classes") \
                .update({"status": "ended"}).eq("id", lc_id).execute()
            
            # Broadcast update
            sc = service_supabase.table("subject_classes").select("standard_id").eq("id", lc.data["class_id"]).single().execute()
            if sc.data:
                std_id = sc.data["standard_id"]
                msg = {"type": "status_update", "id": lc_id, "status": "ended"}
                asyncio.create_task(lc_manager.broadcast(std_id, msg))
                asyncio.create_task(lc_manager.broadcast("teacher", msg))
            
            # Note: Teacher should click "End class" to pull full attendance.
            # Webhook just marks it ended. Attendance pull requires Zoom report API
            # which may not be ready immediately after meeting ends.

    return {"status": "ok"}


@app.websocket("/api/ws/live-classes/{standard_id}")
async def ws_live_classes(websocket: WebSocket, standard_id: str):
    await lc_manager.connect(websocket, standard_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        lc_manager.disconnect(websocket, standard_id)


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
    if filestore.is_r2_enabled():
        return  # R2 needs no pre-created bucket; files go to R2_PRIVATE_BUCKET
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
            validate_upload(f.filename, file_bytes, IMAGE_EXTS | DOC_EXTS)
            ct = f.content_type or "application/octet-stream"
            # Office files → PDF once at upload so students view them in the secure viewer.
            file_bytes, _ext, ct, disp_name = await _maybe_convert_office_to_pdf(f.filename, file_bytes, ct)
            safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in disp_name)
            storage_path = f"question-files/{assignment_id}/{uuid.uuid4()}_{safe_name}"
            await asyncio.to_thread(
                lambda path=storage_path, b=file_bytes, c=ct: filestore.upload_private(service_supabase, "assignments", path, b, c)
            )
            public_url = await asyncio.to_thread(
                lambda path=storage_path: filestore.signed_url(service_supabase, "assignments", path, 3600)
            )
            att_row = service_supabase.table("assignment_attachments").insert({
                "assignment_id": assignment_id,
                "file_url": str(public_url),
                "file_name": disp_name,
                "file_type": ct,
                "storage_path": storage_path,
            }).execute()
            if att_row.data:
                attachments.append(att_row.data[0])

    assignment["assignment_attachments"] = attachments
    # Notify + push every student of the class (best-effort, non-blocking).
    await asyncio.to_thread(_notify_students_of_content, class_id, "new_assignment",
        f"New assignment: {title.strip()}", "", {"assignment_id": assignment_id})
    return assignment


@app.get("/api/assignments")
async def list_assignments(class_id: str, user = Depends(verify_token)):
    if not service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    res = service_supabase.table("assignments").select(
        "*, assignment_attachments(*)"
    ).eq("class_id", class_id).order("created_at", desc=True).execute()
    assignments = res.data or []

    # Students NEVER get a usable file URL (no download/share) — they view files
    # only through the authed, app-only endpoint /assignment-attachments/{id}/file.
    # Teachers keep a 1-hour signed URL for their own web flows.
    is_teacher = user["role"] in ("teacher", "sub_teacher")
    for a in assignments:
        for att in (a.get("assignment_attachments") or []):
            sp = att.get("storage_path")
            if not is_teacher:
                att["file_url"] = None
                continue
            if not sp:
                continue
            try:
                signed = await asyncio.to_thread(
                    lambda p=sp: filestore.signed_url_dict(service_supabase, "assignments", p, 3600)
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
                                lambda p=sp: filestore.signed_url_dict(service_supabase, "assignments", p, 3600)
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
        validate_upload(f.filename, file_bytes, IMAGE_EXTS | DOC_EXTS)
        ct = f.content_type or "application/octet-stream"
        # Office files → PDF once at upload so students view them in the secure viewer.
        file_bytes, _ext, ct, disp_name = await _maybe_convert_office_to_pdf(f.filename, file_bytes, ct)
        safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in disp_name)
        storage_path = f"question-files/{assignment_id}/{uuid.uuid4()}_{safe_name}"
        await asyncio.to_thread(
            lambda path=storage_path, b=file_bytes, c=ct: filestore.upload_private(service_supabase, "assignments", path, b, c)
        )
        public_url = await asyncio.to_thread(
            lambda path=storage_path: filestore.signed_url(service_supabase, "assignments", path, 3600)
        )
        att_row = service_supabase.table("assignment_attachments").insert({
            "assignment_id": assignment_id,
            "file_url": str(public_url),
            "file_name": disp_name,
            "file_type": ct,
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
                lambda: filestore.remove(service_supabase, "assignments", path, public=False)
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
                lambda: filestore.remove(service_supabase, "assignments", paths, public=False)
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
    validate_upload(file.filename, file_bytes, IMAGE_EXTS | DOC_EXTS)

    safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in file.filename)
    storage_path = f"submissions/{assignment_id}/{student_id}_{uuid.uuid4()}_{safe_name}"

    await _ensure_assignments_bucket()
    ct = file.content_type or "application/octet-stream"
    await asyncio.to_thread(
        lambda: filestore.upload_private(service_supabase, "assignments", storage_path, file_bytes, ct)
    )
    public_url = await asyncio.to_thread(
        lambda: filestore.signed_url(service_supabase, "assignments", storage_path, 3600)
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
                    lambda p=sp: filestore.signed_url_dict(service_supabase, "assignments", p, 3600)
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
            await asyncio.to_thread(lambda: filestore.remove(service_supabase, "assignments", sp, public=False))
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
            await asyncio.to_thread(lambda: filestore.remove(service_supabase, "assignments", sp, public=False))
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

    # Teacher-uploaded files: NO downloadable URL for students — they view only
    # through the authed, app-only endpoint /assignment-attachments/{id}/file.
    for a in assignments:
        for att in (a.get("assignment_attachments") or []):
            att["file_url"] = None

    # Student's submissions for all these assignments
    assign_ids = [a["id"] for a in assignments]
    subs2_res  = service_supabase.table("assignment_submissions").select(
        "assignment_id, id, file_url, file_name, marks_obtained, points_earned, submitted_at, graded_at, storage_path"
    ).eq("student_id", student_id).in_("assignment_id", assign_ids).execute()

    sub_by_assign: dict = {}
    for s in (subs2_res.data or []):
        # Drop the private key and any downloadable URL — the student opens their
        # own submission only through the authed, app-only, view-only endpoint
        # /assignment-submissions/{id}/file (built from `id` on the client).
        s.pop("storage_path", None)
        s["file_url"] = None
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
_SETTINGS_ROW_ID = "global"  # single-institution: one global settings row

def _load_settings_from_db():
    """Durable settings copy from the app_settings table (None if unavailable)."""
    if not service_supabase:
        return None
    try:
        row = service_supabase.table("app_settings").select("data").eq("id", _SETTINGS_ROW_ID).limit(1).execute()
        if row.data:
            return row.data[0].get("data") or {}
    except Exception:
        return None
    return None

def get_teacher_settings():
    # Fast path: on-disk cache (rewritten on every save). On Render the disk is
    # ephemeral, so a redeploy wipes this file — fall back to the durable DB copy
    # and rehydrate the cache (same self-healing pattern as broadcast history).
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    db = _load_settings_from_db()
    if db is not None:
        try:
            SETTINGS_FILE.write_text(json.dumps(db, indent=2), encoding="utf-8")
        except Exception:
            pass
        return db
    return {}

def save_teacher_settings(data: dict):
    # Write-through: the DB is the durable source of truth; the file is the cache.
    if service_supabase:
        try:
            service_supabase.table("app_settings").upsert(
                {"id": _SETTINGS_ROW_ID, "data": data, "updated_at": datetime.now(timezone.utc).isoformat()},
                on_conflict="id").execute()
        except Exception as e:
            print(f"[settings] DB persist failed (file-only until migration runs): {e}")
    try:
        SETTINGS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception:
        pass


# ─── BACKUPS (scheduler + manual) ──────────────────────────────────────────
# Auto-backup cadence is driven by the `backup_frequency` setting (off/daily/
# weekly/monthly), enforced by _backup_scheduler_loop(). Runtime state (last run
# time) lives in the app_settings table under its own row so it survives redeploys
# and never races teacher-settings writes. Backups go to R2 udaya-private via the
# standalone scripts; old ones are pruned to keep storage bounded.

_BACKUP_INTERVALS = {"daily": 86400, "weekly": 604800, "monthly": 2592000}
_BACKUP_KEEP = 30  # keep newest N per folder


def _get_backup_frequency() -> str:
    f = (get_teacher_settings() or {}).get("backup_frequency", "daily")
    return f if f in ("off", "daily", "weekly", "monthly") else "daily"


def _get_backup_state() -> dict:
    if not service_supabase:
        return {}
    try:
        row = service_supabase.table("app_settings").select("data").eq("id", "backup_state").limit(1).execute()
        return (row.data[0].get("data") if row.data else {}) or {}
    except Exception:
        return {}


def _set_backup_state(d: dict):
    if not service_supabase:
        return
    try:
        service_supabase.table("app_settings").upsert(
            {"id": "backup_state", "data": d, "updated_at": datetime.now(timezone.utc).isoformat()},
            on_conflict="id").execute()
    except Exception as e:
        print(f"[backup state] persist failed: {e}")


def _prune_backups(keep: int = _BACKUP_KEEP):
    """Keep only the newest `keep` objects per backup folder (names are timestamped
    so lexical sort == chronological)."""
    if not filestore.is_r2_enabled():
        return
    for prefix in ("backups/db/", "backups/students/"):
        try:
            objs = sorted(filestore.list_private(prefix), key=lambda o: o["key"])
            old = [o["key"] for o in objs[:-keep]] if len(objs) > keep else []
            if old:
                filestore.remove(service_supabase, os.environ.get("R2_PRIVATE_BUCKET", ""), old, public=False)
        except Exception as e:
            print(f"[backup prune] {prefix}: {e}")


def _run_backups() -> list:
    """Run the DB + students backup scripts (standalone, isolated subprocesses),
    prune old backups, and return their stdout lines. Raises on any failure."""
    import subprocess
    base = str(Path(__file__).resolve().parent)  # /app/backend
    produced = []
    for script, label in (("scripts/backup_db.py", "db"), ("scripts/backup_students.py", "students")):
        r = subprocess.run(["python", script], cwd=base, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"backup {label} failed: {(r.stderr or r.stdout).strip()}")
        produced.append((r.stdout or "").strip())
    _prune_backups()
    return produced


async def _backup_scheduler_loop():
    """Periodic auto-backup driven by the `backup_frequency` setting. Checks every
    30 min; runs a backup when the configured interval has elapsed since last run."""
    await asyncio.sleep(120)  # let startup settle
    while True:
        try:
            freq = await asyncio.to_thread(_get_backup_frequency)
            if freq != "off" and filestore.is_r2_enabled():
                interval = _BACKUP_INTERVALS.get(freq, 86400)
                state = await asyncio.to_thread(_get_backup_state)
                last = float(state.get("last_run_at", 0) or 0)
                now = time_module.time()
                if now - last >= interval:
                    await asyncio.to_thread(_run_backups)
                    await asyncio.to_thread(_set_backup_state, {"last_run_at": now})
                    print(f"[backup] auto backup complete (freq={freq})")
        except Exception as e:
            print(f"[backup scheduler] error: {e}")
        await asyncio.sleep(1800)  # every 30 min


def _store_branding_logo(data_url: str) -> Optional[str]:
    """Move an inline base64 logo (data: URL) into file storage; return its public
    URL. Keeps large images out of the settings record / DB. None on failure."""
    if not service_supabase:
        return None
    try:
        header, b64 = data_url.split(",", 1)
        ctype = header.split(":", 1)[1].split(";", 1)[0] or "image/png"
        ext = {"image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg",
               "image/webp": ".webp", "image/svg+xml": ".svg", "image/gif": ".gif"}.get(ctype, ".png")
        raw = base64.b64decode(b64)
        if not filestore.is_r2_enabled():
            try:
                service_supabase.storage.get_bucket("branding")
            except Exception:
                service_supabase.storage.create_bucket("branding", options={"public": True})
        path = f"logo-{uuid.uuid4().hex[:8]}{ext}"
        return filestore.upload_public(service_supabase, "branding", path, raw, ctype)
    except Exception as e:
        print(f"[branding] logo storage failed, keeping inline: {e}")
        return None

class TeacherSettingsInput(BaseModel):
    # NOTE: the AI provider/key are configured on the backend via env vars
    # (AI_PROVIDER, GEMINI_API_KEY, …) — see _resolve_ai_config — NOT here. The
    # old ai_provider/ai_api_key fields were removed: a stale ai_provider in the
    # shared settings DB used to shadow GEMINI_API_KEY and break insights.
    # Branding
    lms_name: Optional[str] = None
    lms_logo: Optional[str] = None  # base64 data URL or "" to clear
    # Student defaults
    default_student_password: Optional[str] = None
    # Security
    termination_pin: Optional[str] = None
    security_single_device: Optional[bool] = None
    security_auto_logout: Optional[bool] = None
    security_two_step_verification: Optional[bool] = None  # email OTP on new-device teacher logins
    # Notifications
    notif_test_submission: Optional[bool] = None
    notif_new_student: Optional[bool] = None
    notif_broadcast_reply: Optional[bool] = None
    notif_weekly_report: Optional[bool] = None
    # Student portal
    students_can_view_report: Optional[bool] = None
    # Backups — auto-backup cadence: off | daily | weekly | monthly
    backup_frequency: Optional[str] = None

@app.get("/api/teacher/settings")
def get_settings(user: dict = Depends(get_current_user)):
    if user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Not authorized")
    settings = dict(get_teacher_settings())
    # The AI provider/key now live in backend env vars, not in settings. Never
    # ship them to the client even if a stale value is still persisted in the DB.
    settings.pop("ai_api_key", None)
    settings.pop("ai_provider", None)
    # Read-only hint for the Security UI: OTP emails need RESEND_API_KEY in .env.
    settings["otp_email_ready"] = bool(RESEND_API_KEY)
    settings.setdefault("backup_frequency", "daily")
    return settings

@app.post("/api/teacher/settings")
def update_settings(data: TeacherSettingsInput, user: dict = Depends(get_current_user)):
    if user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Not authorized")
    settings = get_teacher_settings()
    # Persist only the fields the client actually sent. exclude_unset lets the
    # caller clear a value by sending "" (omitted fields are left untouched).
    for key, value in data.model_dump(exclude_unset=True).items():
        settings[key] = value
    # A logo arrives as a base64 data: URL — store the image in file storage and
    # keep only its URL, so the settings record never carries a large inline blob.
    logo = settings.get("lms_logo")
    if isinstance(logo, str) and logo.startswith("data:"):
        stored = _store_branding_logo(logo)
        if stored:
            settings["lms_logo"] = stored
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
# replies. maxOutputTokens caps a 180-350 word answer so generation can't run long.
# Low temperature keeps the mentor factual: it must only restate real data, never
# invent test names or numbers, so creative sampling is a liability here.
GEMINI_GEN_CONFIG = {
    "temperature": 0.3,
    "maxOutputTokens": 1500,
    "thinkingConfig": {"thinkingBudget": 0},
}
OPENAI_TEMPERATURE = 0.3


def _resolve_ai_config() -> dict:
    """Single source of truth for which AI provider/model/key to use.

    Driven ENTIRELY by backend env vars — never the frontend or the (shared,
    DB-backed) teacher settings. This is deliberate: the old code read the
    provider from teacher_settings, so a stale `ai_provider="openai"` saved once
    via the now-removed Settings dropdown silently shadowed GEMINI_API_KEY in
    every environment. Resolving from env means the feature works wherever the
    key is set, and swapping to Groq later is a pure config change (Groq exposes
    an OpenAI-compatible API, so it reuses the openai_compatible branch).

    Returns a dict with `kind` ("gemini" | "openai_compatible"), `api_key`, and
    either `models` (gemini, with a fallback model) or `base_url`+`model`.
    """
    provider = (os.getenv("AI_PROVIDER") or "gemini").strip().lower()
    if provider == "gemini":
        return {
            "kind": "gemini",
            "api_key": os.getenv("GEMINI_API_KEY"),
            "models": [os.getenv("GEMINI_MODEL") or "gemini-2.5-flash", "gemini-flash-latest"],
        }
    if provider == "groq":  # Groq is OpenAI-compatible → reuse the openai branch
        return {
            "kind": "openai_compatible",
            "api_key": os.getenv("GROQ_API_KEY"),
            "base_url": os.getenv("GROQ_BASE_URL") or "https://api.groq.com/openai/v1",
            "model": os.getenv("GROQ_MODEL") or "llama-3.3-70b-versatile",
        }
    # openai (or any other OpenAI-compatible endpoint)
    return {
        "kind": "openai_compatible",
        "api_key": os.getenv("OPENAI_API_KEY"),
        "base_url": os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1",
        "model": os.getenv("OPENAI_MODEL") or "gpt-4o-mini",
    }


def build_insights_prompt(stats: dict, viewer_role: str) -> str:
    """Build the LLM prompt from the (enriched) stats payload sent by the frontend."""
    if viewer_role == "teacher":
        role_context = (
            "Write as if reporting to the teacher about the student. Use third-person "
            '(e.g. "<student name> is improving in <subject>"), never address the student directly.'
        )
        greeting_rule = "Open with a one-line objective summary of the student's progress."
    else:
        role_context = "Write as if you are talking directly to the student."
        greeting_rule = "Open with a warm greeting using the student's first name."

    # Real calendar anchor — the model cannot know today's date by itself, and an
    # unanchored timetable would guess weekday placements (a hallucination vector).
    from datetime import datetime as _dt, timedelta as _td
    _today = _dt.now()
    _days = [(_today + _td(days=i)).strftime("%A %d %B %Y") for i in range(8)]
    calendar_block = (
        f"Today is {_days[0]}. The Weekly Timetable covers the next 7 days, in exactly this "
        f"order: {', '.join(d.rsplit(' ', 1)[0] for d in _days[1:])}. Use exactly these day "
        "names in this order, and place each scheduled event on the day matching its listed date."
    )

    period = stats.get("period", "overall")
    if period == "weekly":
        period_rule = (
            "This is a WEEKLY report: be tactical. Anchor every recommendation to the next 7 days "
            "and to what changed since last week."
        )
    elif period == "monthly":
        period_rule = (
            "This is a MONTHLY report: balance quick wins with one habit change that compounds "
            "over the coming month."
        )
    else:
        period_rule = (
            "This is an OVERALL report: take the long view — trajectory, habits and one strategic "
            "priority matter more than any single test."
        )

    return f"""You are an expert learning mentor and student-success coach for a private tuition academy. Your job is to diagnose the student's learning BEHAVIOUR from the data and coach them — never just restate statistics back.

{role_context}
{period_rule}

GROUNDING — ABSOLUTE RULES (these override everything else):
* Every subject, topic, test, video, number, date and streak you mention MUST appear verbatim in the STUDENT DATA below. NEVER invent or guess a name, score, percentage, date or event.
* Quote numbers exactly as given — do not round differently, extrapolate, or combine them into new statistics.
* If a field says "N/A", "None", "No data", "unknown" or is missing, that information does not exist: do not write about it, do not guess at it, and do not fill the gap with a plausible-sounding detail. Work only with what IS present.
* If there is too little data for a section (e.g. no tests yet), say so honestly in one short sentence and pivot to what the data does support (e.g. attendance or videos). An honest "not enough tests yet to see a trend" is always better than an invented trend.
* Only claim a cause-effect pattern (e.g. "unwatched video → low score") when BOTH sides of it are literally present in the data.
* Never promise specific outcomes you cannot know ("you will score 80%") — frame targets as goals, not predictions.
* The examples in these instructions use <angle-bracket> placeholders and are FORMAT examples only. NEVER copy an example's subject, name, title or number into your answer — every real value must come from STUDENT DATA.

{calendar_block}

LANGUAGE — KEEP IT SIMPLE:
* Write so a school student understands instantly: short sentences (about 15 words max), everyday words, no jargon.
* If you must use a study term, explain it in brackets the first time, e.g. "active recall (testing yourself from memory)".
* One idea per sentence or bullet. Prefer concrete verbs: watch, practise, ask, revise, attempt.

YOU SEE THE STUDENT'S COMPLETE LMS RECORD: profile and class standing, every subject's numbers, full recent test history, weak topics with lesson-video status, day-by-day activity patterns and streaks, assignment status, the class baseline, AND the actual upcoming week (scheduled tests, live classes, assignment due dates, unwatched videos). Analyse ALL of it together — the diagnosis must connect history, habits and the week ahead.

HOW TO DIAGNOSE (reason silently, output only conclusions):
1. Cross-reference signals before concluding. Examples of patterns to look for:
   - Weak topic + lesson video NOT watched → a preparation gap, not an ability gap. The fix is watching the lesson before reattempting.
   - Weak topic + video watched → a comprehension gap. The fix is active recall: notes, practice questions, asking the teacher.
   - High video completion but flat test scores → passive watching; prescribe self-testing.
   - Falling improvement trend or "Erratic" consistency → cramming/irregular routine; prescribe a fixed daily slot (use the streak and "most active days" pattern).
   - Strong best-subject vs weak weakest-subject gap → time is being spent where it's comfortable, not where it's needed.
   - Low test coverage or an OPEN test in the upcoming week → missed tests are silent score killers; schedule it explicitly.
2. Use the streak: a live streak is momentum to protect (say so); a broken/short streak is the first habit to rebuild.
3. Compare against the class baseline and rank only to motivate, never to shame.

RULES:
* {greeting_rule}
* Praise 2 concrete, real wins first (name the subject/test/streak — no empty praise).
* For each weakness: likely root cause in one sentence, then the fix.
* "Solutions & Study Ideas" must give 3-4 study techniques, each tied to a diagnosed cause and naming the real subject/topic/video it applies to (e.g. active-recall flashcards for a watched-but-weak topic; watch-then-summarise for an unwatched one). No generic advice.
* "Goals" must be 2-3 measurable targets, each with a number and a deadline (e.g. "Hit a 5-day study streak by <day>", "Score 70%+ on the next <weakest subject from the data> test"). Goals, not predictions.
* "Weekly Timetable" is a 7-day plan, one line per day, formatted exactly like: **<Day>:** 30 min — watch "<video title from the data>" (<subject>), then 5 recall questions.
  - Place every real upcoming event on its actual day: live classes at their listed day, open/scheduled tests before they close, pending assignments before their due dates.
  - Put unwatched videos for the weakest subjects early in the week.
  - 30-90 minutes per day; include exactly ONE light/rest day with only a 10-minute review.
  - Apart from the real items, only revision of topics named in the data is allowed — never invent lessons or events.
  - If the upcoming week has no scheduled events, say so in one clause and build the week from weak-topic revision and unwatched videos.
* Be specific everywhere: name the actual subjects, topics, videos and tests from the data. No generic "study harder".
* End with one short, personal line of encouragement. Never say you are an AI, never mention "the data".

SECTIONS (use these exact markdown headings, in this order):
Performance Summary
What's Going Well
What Needs Attention
Solutions & Study Ideas
Goals
Weekly Timetable
Mentor Message

STUDENT DATA:
Name: {stats.get("student_name", "Student")}
Standard: {stats.get("standard_name", "N/A")}
Report period: {period}
Profile & standing: {stats.get("profile", stats.get("standing_data", "N/A"))}
Study streak & activity patterns: {stats.get("activity_patterns", stats.get("streak_data", "N/A"))}
Score trend: {stats.get("trend_data", "N/A")}
Best subject: {stats.get("best_subject", "N/A")}
Weakest subject: {stats.get("weakest_subject", "N/A")}
Per-subject detail: {stats.get("subjects_detail", stats.get("subject_breakdown", "N/A"))}
Test history (oldest → newest): {stats.get("test_history", stats.get("recent_tests", "N/A"))}
Weak topics (topic — score — video watched?): {stats.get("weak_topics_detail", stats.get("topic_data", "N/A"))}
Assignments: {stats.get("assignments_detail", stats.get("assignment_data", "N/A"))}
Class baseline: {stats.get("class_baseline", "N/A")}
Attendance: {stats.get("attendance_data", "N/A")}
Video progress: {stats.get("video_progress_data", "N/A")}
UPCOMING WEEK (real scheduled events — anchor the timetable to these): {stats.get("upcoming_week", "N/A")}

OUTPUT REQUIREMENTS:
* Markdown, 350-600 words total.
* "Performance Summary" is 2-3 sentences capturing the whole picture, including class standing.
* Lead with what to do next, not a recap of the past.
* Only cite a percentage when it makes a point clearer.
"""


def fetch_upcoming_for_student(student_id: str, standard_id: str, weak_subject_ids: list) -> dict:
    """Forward-looking LMS data the mentor needs to build a real weekly timetable:
    upcoming tests, scheduled live classes, pending assignments and unwatched
    videos (weak subjects first). Every failure degrades to an honest 'none'."""
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    horizon = (now + timedelta(days=14)).isoformat()
    out = {"tests": "None scheduled", "live": "None scheduled", "assignments": "None pending", "videos": "None"}
    if not standard_id or not service_supabase:
        return out
    try:
        subs = service_supabase.table("subject_classes").select("id, name").eq("standard_id", standard_id).execute().data or []
        sub_name = {s["id"]: s["name"] for s in subs}
        class_ids = list(sub_name.keys())
        if not class_ids:
            return out

        def d(s):  # short readable date
            try:
                return datetime.fromisoformat(str(s).replace("Z", "+00:00")).strftime("%a %d %b")
            except Exception:
                return str(s)[:10]

        try:
            tests = service_supabase.table("tests").select(
                "title, class_id, status, scheduled_for, expires_at"
            ).in_("class_id", class_ids).in_("status", ["scheduled", "active"]).execute().data or []
            lines = []
            for t in tests:
                sched = t.get("scheduled_for")
                if t["status"] == "active":
                    exp = t.get("expires_at")
                    if exp and exp < now_iso:
                        continue
                    lines.append(f"{t['title']} ({sub_name.get(t['class_id'], '?')}) — OPEN NOW{f', closes {d(exp)}' if exp else ''}")
                elif sched and now_iso <= sched <= horizon:
                    lines.append(f"{t['title']} ({sub_name.get(t['class_id'], '?')}) — opens {d(sched)}")
            out["tests"] = "; ".join(lines[:6]) or "None scheduled"
        except Exception:
            pass

        try:
            lcs = service_supabase.table("live_classes").select(
                "title, class_id, scheduled_at, status"
            ).in_("class_id", class_ids).in_("status", ["scheduled", "live"]).execute().data or []
            lines = [
                f"{l.get('title') or sub_name.get(l['class_id'], 'Live class')} ({sub_name.get(l['class_id'], '?')}) — {('LIVE NOW' if l['status'] == 'live' else d(l.get('scheduled_at')))}"
                for l in lcs
                if l["status"] == "live" or (l.get("scheduled_at") and now_iso <= l["scheduled_at"] <= horizon)
            ]
            out["live"] = "; ".join(lines[:6]) or "None scheduled"
        except Exception:
            pass

        try:
            assigns = service_supabase.table("assignments").select(
                "id, title, class_id, due_date"
            ).in_("class_id", class_ids).execute().data or []
            if assigns:
                subs_res = service_supabase.table("assignment_submissions").select("assignment_id").eq(
                    "student_id", student_id
                ).in_("assignment_id", [a["id"] for a in assigns]).execute().data or []
                done = {s["assignment_id"] for s in subs_res}
                pending = [a for a in assigns if a["id"] not in done]
                pending.sort(key=lambda a: a.get("due_date") or "9999")
                out["assignments"] = "; ".join(
                    f"{a['title']} ({sub_name.get(a['class_id'], '?')}) — due {d(a['due_date']) if a.get('due_date') else 'no due date'}"
                    for a in pending[:6]
                ) or "None pending"
        except Exception:
            pass

        try:
            vids = service_supabase.table("videos").select("id, title, class_id").in_("class_id", class_ids).execute().data or []
            vp = service_supabase.table("video_progress").select("video_id, completed").eq("student_id", student_id).execute().data or []
            done_ids = {v["video_id"] for v in vp if v.get("completed")}
            unwatched = [v for v in vids if v["id"] not in done_ids]
            # weak subjects first so the timetable attacks the right gaps
            order = {cid: i for i, cid in enumerate(weak_subject_ids)}
            unwatched.sort(key=lambda v: order.get(v["class_id"], 99))
            out["videos"] = "; ".join(
                f"{v['title']} ({sub_name.get(v['class_id'], '?')})" for v in unwatched[:6]
            ) or "None"
        except Exception:
            pass
    except Exception as exc:
        print(f"Upcoming-for-student error (non-fatal): {exc}")
    return out


def compose_student_analysis(report: dict, upcoming: dict, period: str) -> dict:
    """Distill the full report-v2 payload into the structured digest the mentor
    prompt consumes. Server-computed — the model sees the whole LMS record."""
    s = report.get("student") or {}
    radar = report.get("subject_radar") or []
    timeline = sorted(report.get("test_timeline") or [], key=lambda t: t.get("date") or "")
    topics = report.get("topic_map") or []
    ca = report.get("class_averages") or {}
    astats = report.get("assignment_stats") or {}
    live = report.get("live_classes_stats") or {}
    rank, total = report.get("rank"), report.get("total_students") or 0

    profile = (
        f"{s.get('name', 'Student')}, {s.get('standard_name', 'N/A')}. "
        f"Average score {round(s.get('avg_score') or 0)}%, attendance {round(s.get('attendance_pct') or 0)}%, "
        f"{s.get('points') or 0} points"
        + (f", rank {rank}/{total} (top {max(1, round(rank / total * 100))}%)" if rank and total else "")
        + f". Live class attendance {live.get('attendance_pct') or 0}%."
    )

    subjects_detail = " | ".join(
        f"{r['subject']}: {r.get('test_count') or 0} tests avg {round(r.get('test_avg') or 0)}%, "
        f"videos {r.get('video_done') or 0}/{r.get('video_total') or 0}, "
        f"attendance {round(r.get('attendance_pct') or 0)}%, "
        f"assignments {r.get('assignment_submitted') or 0}/{r.get('assignment_total') or 0}"
        for r in radar
    ) or "No subject data"

    test_history = "; ".join(
        f"{(t.get('date') or '')[:10]} {t.get('test_title')} ({t.get('subject') or '?'}) {round(t.get('score_pct') or 0)}%"
        + (" FLAGGED" if t.get("flagged") else "")
        for t in timeline[-15:]
    ) or "No tests taken"

    weak = sorted(topics, key=lambda t: t.get("score_pct") or 0)[:8]
    weak_topics = "; ".join(
        f"{t.get('topic')} ({t.get('subject') or '?'}) {round(t.get('score_pct') or 0)}% — video {'watched' if t.get('video_completed') else 'NOT watched'}"
        for t in weak
    ) or "None identified"

    # Activity patterns: streak + busiest weekdays from the four heatmaps
    active_days = set()
    for key, pred in (
        ("attendance_heatmap", lambda r: (r.get("present") or 0) + (r.get("late") or 0) > 0),
        ("test_heatmap", lambda r: (r.get("count") or 0) > 0),
        ("video_heatmap", lambda r: (r.get("minutes") or 0) > 0),
        ("assignment_heatmap", lambda r: (r.get("count") or 0) > 0),
    ):
        for row in report.get(key) or []:
            if row.get("date") and pred(row):
                active_days.add(row["date"][:10])
    from datetime import datetime, timedelta
    sorted_days = sorted(active_days)
    best = run = 0
    prev = None
    for day in sorted_days:
        try:
            cur_d = datetime.fromisoformat(day)
        except ValueError:
            continue
        run = run + 1 if prev and (cur_d - prev).days == 1 else 1
        best = max(best, run)
        prev = cur_d
    current = 0
    cursor = datetime.now()
    if cursor.strftime("%Y-%m-%d") not in active_days:
        cursor -= timedelta(days=1)
    while cursor.strftime("%Y-%m-%d") in active_days:
        current += 1
        cursor -= timedelta(days=1)
    weekday_counts = {}
    for day in sorted_days:
        try:
            wd = datetime.fromisoformat(day).strftime("%A")
            weekday_counts[wd] = weekday_counts.get(wd, 0) + 1
        except ValueError:
            continue
    busiest = ", ".join(w for w, _ in sorted(weekday_counts.items(), key=lambda x: -x[1])[:2]) or "no clear pattern"
    total_mins = round(sum((r.get("minutes") or 0) for r in (report.get("video_heatmap") or [])))
    activity_patterns = (
        f"Current study streak {current} day(s), best {best} day(s); {len(active_days)} active day(s) in this period; "
        f"{total_mins} total video minutes; most active on: {busiest}."
    )
    streak_data = f"Current study streak {current} day(s), best ever {best} day(s)"

    scores = [t.get("score_pct") or 0 for t in timeline]
    if len(scores) >= 4:
        mid = len(scores) // 2
        improvement = round(sum(scores[mid:]) / len(scores[mid:]) - sum(scores[:mid]) / mid)
        trend = f"Score trend {'+' if improvement > 0 else ''}{improvement}% (recent tests vs earlier ones)"
    else:
        trend = "Not enough tests for a trend yet"
    if len(scores) >= 3:
        mean = sum(scores) / len(scores)
        sd = (sum((x - mean) ** 2 for x in scores) / len(scores)) ** 0.5
        label = "Steady" if sd <= 10 else "Variable" if sd <= 20 else "Erratic"
        trend += f"; consistency is {label} (±{round(sd)}%)"
    coverage = report.get("total_tests_in_standard") or 0
    trend += f". Tests taken {len(timeline)}/{coverage if coverage else 'unknown'} available."

    class_baseline = (
        f"Class averages ({ca.get('students_counted')} students): score {round(ca.get('avg_score') or 0)}%, "
        f"attendance {round(ca.get('attendance_pct') or 0)}%, video completion {round(ca.get('video_pct') or 0)}%, "
        f"points {round(ca.get('points') or 0)}."
        if ca else "Class baseline not available"
    )

    assignments_detail = (
        f"Submitted {astats.get('submitted') or 0}/{astats.get('total') or 0}, "
        f"average marks {astats.get('avg_marks_pct') or 0}%. Pending: {upcoming.get('assignments', 'unknown')}"
    )

    upcoming_week = (
        f"Tests: {upcoming.get('tests')}. Live classes: {upcoming.get('live')}. "
        f"Pending assignments: {upcoming.get('assignments')}. "
        f"Unwatched videos (weakest subjects first): {upcoming.get('videos')}."
    )

    tested = [r for r in radar if (r.get("test_count") or 0) > 0]
    best_sub = max(tested, key=lambda r: r.get("test_avg") or 0) if tested else None
    worst_sub = min(tested, key=lambda r: r.get("test_avg") or 0) if len(tested) > 1 else None

    # These two prompt fields used to arrive only from the browser payload; the
    # prompt must stay fully server-fed now that client stats are ignored.
    vid_total = sum(r.get("video_total") or 0 for r in radar)
    vid_done = sum(r.get("video_done") or 0 for r in radar)
    attendance_data = f"Attendance is {round(s.get('attendance_pct') or 0)}%"
    video_progress_data = (
        f"Video completion is {round(vid_done / vid_total * 100) if vid_total else 0}% ({vid_done}/{vid_total} videos)"
    )

    return {
        "student_name": s.get("name") or "Student",
        "standard_name": s.get("standard_name") or "N/A",
        "period": period,
        "attendance_data": attendance_data,
        "video_progress_data": video_progress_data,
        "profile": profile,
        "subjects_detail": subjects_detail,
        "test_history": test_history,
        "weak_topics_detail": weak_topics,
        "activity_patterns": activity_patterns,
        "streak_data": streak_data,
        "trend_data": trend,
        "class_baseline": class_baseline,
        "assignments_detail": assignments_detail,
        "upcoming_week": upcoming_week,
        "best_subject": f"{best_sub['subject']} ({round(best_sub.get('test_avg') or 0)}% avg)" if best_sub else "N/A",
        "weakest_subject": f"{worst_sub['subject']} ({round(worst_sub.get('test_avg') or 0)}% avg)" if worst_sub else "N/A",
    }


def _insights_period(req: "InsightsRequest") -> str:
    """The ONLY thing the client controls about mentor input is the period tab."""
    period = (req.stats or {}).get("period", "overall")
    return period if period in ("weekly", "monthly", "overall") else "overall"


def _assert_insights_access(user: dict, student_id: str):
    """Students may only generate/read their own analysis. Must run BEFORE any
    enrichment — get_student_report_v2's own 403 used to be swallowed by the
    old fallback, letting tampered browser stats reach the prompt."""
    if user.get("role") == "student" and user.get("student_id") != student_id:
        raise HTTPException(status_code=403, detail="Not authorized")


async def enrich_insights_stats(req: "InsightsRequest", user: dict) -> dict:
    """All mentor data is assembled server-side from the student's real record.
    Client-sent stats never reach the prompt (a tampered browser could inject
    fake numbers); on failure we error out instead of trusting the client."""
    period = _insights_period(req)
    try:
        report = await asyncio.to_thread(get_student_report_v2, req.student_id, period, user)
        radar = sorted(report.get("subject_radar") or [], key=lambda r: r.get("test_avg") if (r.get("test_count") or 0) > 0 else 101)
        weak_subject_ids = [r.get("subject_id") for r in radar if r.get("subject_id")]
        standard_id = (report.get("student") or {}).get("standard_id")
        upcoming = await asyncio.to_thread(fetch_upcoming_for_student, req.student_id, standard_id, weak_subject_ids)
        return compose_student_analysis(report, upcoming, period)
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[!] Insights server-side enrichment failed: {exc}")
        raise HTTPException(status_code=503, detail="Could not load the student's data for analysis. Please try again.")


# ─── AI MENTOR: response cache + load guards (one API key, ~300 students) ────
# Cache: JSON file beside teacher_settings.json (same pattern). Most mentor
# opens are then served instantly with zero LLM calls; only Regenerate and
# first-ever opens hit the provider. Losing the file on redeploy is fine.
INSIGHTS_CACHE_FILE = Path(__file__).resolve().parent / "ai_insights_cache.json"

def _load_insights_cache() -> dict:
    if INSIGHTS_CACHE_FILE.exists():
        try:
            return json.loads(INSIGHTS_CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}

_insights_cache: dict = _load_insights_cache()

def _store_insights(cache_key: str, text: str):
    _insights_cache[cache_key] = {
        "text": text,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        INSIGHTS_CACHE_FILE.write_text(json.dumps(_insights_cache, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"[!] insights cache save failed (ignored): {e}")

# At most this many upstream LLM streams at once — a class-wide burst queues
# here instead of opening hundreds of connections on one API key.
_AI_SEMAPHORE = asyncio.Semaphore(3)
# Single-flight: one generation per student:period at a time.
_insights_inflight: set = set()
# Cooldown: regenerate-spamming within this window replays the cached text.
_insights_last_gen: dict = {}
INSIGHTS_COOLDOWN_SECS = 30

AI_BUSY_MSG = "The AI is busy right now — please try again in a minute."


@app.get("/api/insights/cached/{student_id}")
async def get_cached_insights(student_id: str, period: str = "overall", user: dict = Depends(get_current_user)):
    """Last generated mentor analysis for this student+period (no LLM call)."""
    _assert_insights_access(user, student_id)
    if period not in ("weekly", "monthly", "overall"):
        period = "overall"
    entry = _insights_cache.get(f"{student_id}:{period}")
    return {
        "insights": entry.get("text") if entry else None,
        "generated_at": entry.get("generated_at") if entry else None,
    }


@app.post("/api/insights/generate")
async def generate_ai_insights(req: InsightsRequest, user: dict = Depends(get_current_user)):
    _assert_insights_access(user, req.student_id)
    # Provider + key + model come ONLY from backend env vars (see _resolve_ai_config).
    # This keeps the key off the frontend and makes a future provider swap (Gemini →
    # Groq) a pure config change.
    cfg = _resolve_ai_config()
    api_key = cfg["api_key"]
    if not api_key:
        raise HTTPException(status_code=400, detail="AI API key not configured on the server.")

    cache_key = f"{req.student_id}:{_insights_period(req)}"
    stats = await enrich_insights_stats(req, user)
    prompt = build_insights_prompt(stats, user.get("role", "student"))

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            if cfg["kind"] == "gemini":
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": GEMINI_GEN_CONFIG,
                }
                resp = None
                for idx, model in enumerate(cfg["models"]):
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                    resp = await client.post(url, json=payload)
                    # 404 on the first model → retry with the fallback model name
                    if resp.status_code == 404 and idx + 1 < len(cfg["models"]):
                        continue
                    break
                if not resp.is_success:
                    raise Exception(f"Gemini API error: {resp.text}")
                data = resp.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
            else:  # openai_compatible (openai, groq, …)
                url = f"{cfg['base_url'].rstrip('/')}/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}"}
                payload = {
                    "model": cfg["model"],
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": OPENAI_TEMPERATURE,
                }
                resp = await client.post(url, headers=headers, json=payload)
                if not resp.is_success:
                    raise Exception(f"AI API error: {resp.text}")
                data = resp.json()
                text = data["choices"][0]["message"]["content"]

            # For the new conversational prompt, we just return the raw text
            text = text.strip()
            if text:
                _store_insights(cache_key, text)
            return {"insights": text}
    except Exception as e:
        print(f"[!] AI Generation Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/insights/generate/stream")
async def generate_ai_insights_stream(req: InsightsRequest, user: dict = Depends(get_current_user)):
    """Stream coaching insights token-by-token via Server-Sent Events.

    Emits `data: {"text": "<delta>"}` events as the model generates, and a final
    `data: {"error": "..."}` event if the upstream call fails mid-stream.

    Scale guards (one shared API key, hundreds of students): completed analyses
    are cached per student:period; a cooldown replays the cache instead of
    re-billing the key; single-flight stops duplicate generations; a global
    semaphore caps concurrent upstream streams.
    """
    _assert_insights_access(user, req.student_id)
    # Provider + key + model come ONLY from backend env vars (see _resolve_ai_config).
    cfg = _resolve_ai_config()
    api_key = cfg["api_key"]
    if not api_key:
        raise HTTPException(status_code=400, detail="AI API key not configured on the server.")

    def sse(obj: dict) -> str:
        return f"data: {json.dumps(obj)}\n\n"

    def sse_response(gen):
        return StreamingResponse(
            gen,
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    cache_key = f"{req.student_id}:{_insights_period(req)}"

    # Cooldown: regenerate within the window replays the cached text — no LLM hit.
    cached = _insights_cache.get(cache_key)
    if cached and (time_module.time() - _insights_last_gen.get(cache_key, 0)) < INSIGHTS_COOLDOWN_SECS:
        async def replay():
            yield sse({"text": cached["text"]})
            yield sse({"done": True, "cached": True})
        return sse_response(replay())

    # Single-flight: one generation per student:period.
    if cache_key in _insights_inflight:
        async def busy():
            yield sse({"error": "Analysis is already being generated — try again in a few seconds."})
        return sse_response(busy())

    stats = await enrich_insights_stats(req, user)
    prompt = build_insights_prompt(stats, user.get("role", "student"))

    async def gemini_stream():
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": GEMINI_GEN_CONFIG,
        }
        models = cfg["models"]
        async with httpx.AsyncClient(timeout=60) as client:
            for idx, model in enumerate(models):
                url = (
                    f"https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{model}:streamGenerateContent?alt=sse&key={api_key}"
                )
                try:
                    async with client.stream("POST", url, json=payload) as resp:
                        # 404 on this model → retry with the next fallback model name
                        if resp.status_code == 404 and idx + 1 < len(models):
                            continue
                        if resp.status_code == 429:
                            yield {"error": AI_BUSY_MSG}
                            return
                        if resp.status_code >= 400:
                            body = (await resp.aread()).decode("utf-8", "ignore")
                            yield {"error": f"Gemini API error: {body[:400]}"}
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
                                    yield {"text": delta}
                            except (KeyError, IndexError, json.JSONDecodeError):
                                continue
                        yield {"done": True}
                        return
                except httpx.HTTPError as e:
                    yield {"error": f"Connection error: {e}"}
                    return

    async def openai_compatible_stream():
        url = f"{cfg['base_url'].rstrip('/')}/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}"}
        payload = {
            "model": cfg["model"],
            "messages": [{"role": "user", "content": prompt}],
            "stream": True,
            "temperature": OPENAI_TEMPERATURE,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            try:
                async with client.stream("POST", url, headers=headers, json=payload) as resp:
                    if resp.status_code == 429:
                        yield {"error": AI_BUSY_MSG}
                        return
                    if resp.status_code >= 400:
                        body = (await resp.aread()).decode("utf-8", "ignore")
                        yield {"error": f"AI API error: {body[:400]}"}
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
                                yield {"text": delta}
                        except (KeyError, IndexError, json.JSONDecodeError):
                            continue
                    yield {"done": True}
            except httpx.HTTPError as e:
                yield {"error": f"Connection error: {e}"}

    async def event_generator():
        _insights_inflight.add(cache_key)
        _insights_last_gen[cache_key] = time_module.time()
        acc, finished = "", False
        try:
            async with _AI_SEMAPHORE:
                gen = gemini_stream() if cfg["kind"] == "gemini" else openai_compatible_stream()
                async for obj in gen:
                    if obj.get("text"):
                        acc += obj["text"]
                    if obj.get("done"):
                        finished = True
                    yield sse(obj)
        except Exception as e:  # noqa: BLE001 — surface to client instead of hanging
            print(f"[!] AI Stream Error: {e}")
            yield sse({"error": str(e)})
        finally:
            _insights_inflight.discard(cache_key)
        if finished and acc.strip():
            _store_insights(cache_key, acc.strip())

    return sse_response(event_generator())


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
    api_key: Optional[str] = None          # WANotifier secret — only overwritten when sent non-empty
    sender: Optional[str] = None
    currency: Optional[str] = None
    rates: Optional[dict] = None
    auto_welcome: Optional[bool] = None
    welcome_template: Optional[str] = None
    quiet_hours: Optional[dict] = None
    # Meta WhatsApp Cloud API
    meta_access_token: Optional[str] = None    # secret — only overwritten when sent non-empty
    meta_phone_number_id: Optional[str] = None
    meta_waba_id: Optional[str] = None

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
    variables: Optional[list] = None        # legacy (ignored by the named-tag engine)
    manual_values: Optional[dict] = None    # {"Fee Amount": "5000", ...} for "ask" variables
    body_text: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    category: str = "utility"
    test_to_self: Optional[str] = None      # if set, send a single message to this phone only

class WhatsAppTemplateInput(BaseModel):
    name: str
    category: str = "utility"
    language: str = "en"
    header_type: str = "none"               # derived from media on save
    body_text: str
    media_url: Optional[str] = None         # optional file attached to the template
    media_type: Optional[str] = None
    media_name: Optional[str] = None
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
    included_student_ids: Optional[List[str]] = None
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


# ── Variables (single source of truth) ────────────────────────────────────────
# Human-friendly variables a teacher can drop into a message. "auto" variables are
# filled from real data per student; "ask" variables prompt the teacher to type a
# value once before sending. The frontend picker is driven by this exact list
# (GET /api/teacher/whatsapp/variables) so nothing drifts.
WA_VARIABLES = [
    {"name": "Student Name",       "kind": "auto", "group": "Student",     "example": "Arjun",            "description": "The student's name"},
    {"name": "Student ID",         "kind": "auto", "group": "Student",     "example": "25UDAYA100001",    "description": "The login Student ID"},
    {"name": "Class",              "kind": "auto", "group": "Student",     "example": "10th Standard",    "description": "The student's class / standard"},
    {"name": "Username",           "kind": "auto", "group": "Login",       "example": "arjun01",          "description": "Login username"},
    {"name": "Password",           "kind": "auto", "group": "Login",       "example": "••••••",           "description": "Login password"},
    {"name": "Login Link",         "kind": "auto", "group": "Login",       "example": "your portal link", "description": "Link to your portal"},
    {"name": "Attendance",         "kind": "auto", "group": "Performance", "example": "92%",              "description": "Attendance percentage"},
    {"name": "Score",              "kind": "auto", "group": "Performance", "example": "88%",              "description": "Average score"},
    {"name": "Points",             "kind": "auto", "group": "Performance", "example": "120",              "description": "Reward points earned"},
    {"name": "Latest Exam",        "kind": "auto", "group": "Academics",   "example": "Unit Test 2",      "description": "Most recent exam name"},
    {"name": "Latest Assignment",  "kind": "auto", "group": "Academics",   "example": "Algebra Worksheet","description": "Most recent assignment"},
    {"name": "Study Material",     "kind": "auto", "group": "Academics",   "example": "Chapter 5 Notes",  "description": "Latest study material"},
    {"name": "Live Class",         "kind": "auto", "group": "Academics",   "example": "Physics Doubts",   "description": "Upcoming live class"},
    {"name": "Institute Name",     "kind": "auto", "group": "General",     "example": "Udaya Academy",    "description": "Your institute's name"},
    {"name": "Date",               "kind": "auto", "group": "General",     "example": "08 Jun 2026",      "description": "Today's date"},
    {"name": "Time",               "kind": "auto", "group": "General",     "example": "03:45 PM",         "description": "Current time"},
    {"name": "Fee Amount",         "kind": "ask",  "group": "You type this", "example": "5000",           "description": "You'll type this before sending"},
    {"name": "Due Date",           "kind": "ask",  "group": "You type this", "example": "15 Jun",         "description": "You'll type this before sending"},
    {"name": "Class Date",         "kind": "ask",  "group": "You type this", "example": "Monday",         "description": "You'll type this before sending"},
    {"name": "Class Time",         "kind": "ask",  "group": "You type this", "example": "5:00 PM",        "description": "You'll type this before sending"},
    {"name": "Teacher Name",       "kind": "ask",  "group": "You type this", "example": "Mr. Rao",        "description": "You'll type this before sending"},
]

# Every key an "auto" variable can resolve to (canonical, lower-cased). Includes a
# couple of resolvable-but-unlisted ones ({Parent Name}, {Student Phone}).
_WA_AUTO_KEYS = {
    "student name", "student id", "class", "username", "password", "login link",
    "institute name", "attendance", "score", "points", "latest exam",
    "latest assignment", "study material", "live class", "date", "time",
    "month", "year", "parent name", "student phone",
}

# Legacy / loose spellings → canonical auto key. Keeps old templates and snake-case
# tags ({student_name}, {school_name}…) working with the new named engine.
_WA_ALIAS = {
    "student_name": "student name", "name": "student name", "child": "student name",
    "student_code": "student id", "studentid": "student id", "roll no": "student id", "id": "student id",
    "class_name": "class", "standard": "class", "grade": "class",
    "school_name": "institute name", "school": "institute name", "institute": "institute name",
    "login_url": "login link", "link": "login link", "url": "login link",
    "parent_name": "parent name", "guardian": "parent name",
    "student_phone": "student phone", "phone": "student phone", "mobile": "student phone",
    "test": "latest exam", "exam": "latest exam", "latest_test": "latest exam",
    "assignment": "latest assignment", "homework": "latest assignment", "latest_assignment": "latest assignment",
    "study_material": "study material", "material": "study material", "notes": "study material",
    "live_class": "live class", "zoom": "live class", "meeting": "live class",
    "marks": "score", "average": "score", "percentage": "score",
}


def _wa_auto_value(key: str, recip: dict) -> str:
    """Resolve a canonical auto-variable key to a string for one recipient."""
    now = datetime.now()
    table = {
        "student name":      recip.get("name") or "Student",
        "student id":        recip.get("student_code") or "",
        "class":             recip.get("standard_name") or "",
        "username":          recip.get("username") or "",
        "password":          recip.get("plain_password") or "******",
        "login link":        _wa_login_url() or "",
        "institute name":    _wa_branding_name() or "our institute",
        "parent name":       "Parent",
        "student phone":     recip.get("phone") or "",
        "attendance":        f"{recip.get('attendance_pct') or 0}%",
        "score":             f"{recip.get('avg_score') or 0}%",
        "points":            str(recip.get("points") or 0),
        "latest exam":       recip.get("latest_test") or "",
        "latest assignment": recip.get("latest_assignment") or "",
        "study material":    recip.get("latest_material") or "",
        "live class":        recip.get("upcoming_live_class") or "",
        "date":              now.strftime("%d %b %Y"),
        "time":              now.strftime("%I:%M %p"),
        "month":             now.strftime("%B"),
        "year":              now.strftime("%Y"),
    }
    return table.get(key, "")


def _wa_canonical(raw: str) -> str:
    key = str(raw or "").strip().lower()
    return _WA_ALIAS.get(key, key)


def _wa_normalize_body(body: str) -> str:
    """Forgiving clean-up of a freshly typed body: collapse accidental {{x}} to {x}
    and drop empty {} so they never reach a parent as broken placeholders."""
    if not body:
        return body or ""
    b = body.replace("{{", "{").replace("}}", "}")
    return re.sub(r"\{\s*\}", "", b)


def _wa_render(text_or_list, recip: dict, manual_values: Optional[dict] = None):
    """THE single template engine. Replace every {Named Tag} in a body (or list of
    strings) with its value for this recipient: auto tags from data, the rest from
    the teacher's manual_values map. Unknown / empty tags are stripped, never sent
    as raw braces. Replaces the old positional {{1}} system + guess heuristics."""
    mv = {str(k).strip().lower(): ("" if v is None else str(v))
          for k, v in (manual_values or {}).items()}

    def render_one(s: str) -> str:
        s = str(s or "").replace("{{", "{").replace("}}", "}")

        def repl(m):
            raw = m.group(1).strip()
            key = raw.lower()
            canon = _WA_ALIAS.get(key, key)
            if canon in _WA_AUTO_KEYS:
                return _wa_auto_value(canon, recip)
            if key in mv:
                return mv[key]
            if canon in mv:
                return mv[canon]
            return ""  # unknown / unfilled → strip (no broken placeholder)

        out = re.sub(r"\{([^{}]+)\}", repl, s)
        return out.replace("{}", "")

    if isinstance(text_or_list, list):
        return [render_one(v) for v in text_or_list]
    return render_one(text_or_list)


def _wa_parse_variables(body: str) -> list:
    """List the variables used in a body (de-duplicated, in order). Each is tagged
    auto|ask so the UI knows which ones to prompt for. Drives template-save responses
    and the composer's 'fill in the blanks' inputs."""
    body = _wa_normalize_body(body)
    out, seen = [], set()
    for m in re.finditer(r"\{([^{}]+)\}", body or ""):
        raw = m.group(1).strip()
        if not raw:
            continue
        key = raw.lower()
        if key in seen:
            continue
        seen.add(key)
        canon = _WA_ALIAS.get(key, key)
        is_auto = canon in _WA_AUTO_KEYS
        out.append({"name": raw, "kind": "auto" if is_auto else "ask"})
    return out


def _wa_to_meta_body(body: str):
    """Convert a named-tag body to Meta's positional {{1}}, {{2}}… format and return
    (positional_body, [ordered_names]). Used ONLY at Meta template-submit/send time."""
    body = _wa_normalize_body(body)
    names = []

    def repl(m):
        raw = m.group(1).strip()
        if raw.lower() not in [n.lower() for n in names]:
            names.append(raw)
        idx = [n.lower() for n in names].index(raw.lower())
        return "{{%d}}" % (idx + 1)

    out = re.sub(r"\{([^{}]+)\}", repl, body or "")
    return out, names


def _wa_positional_values(body: str, recip: dict, manual_values: Optional[dict] = None) -> list:
    """Resolve a named-tag body's variables to an ordered value list aligned with the
    {{1}}, {{2}}… produced by _wa_to_meta_body — for Meta send_template()."""
    _, names = _wa_to_meta_body(body)
    mv = {str(k).strip().lower(): ("" if v is None else str(v))
          for k, v in (manual_values or {}).items()}
    vals = []
    for raw in names:
        key = raw.strip().lower()
        canon = _WA_ALIAS.get(key, key)
        if canon in _WA_AUTO_KEYS:
            vals.append(str(_wa_auto_value(canon, recip)))
        else:
            vals.append(mv.get(key, mv.get(canon, "")))
    return vals


def _wa_migrate_legacy_body(body: str, labels) -> str:
    """One-way: turn an old stored body with Meta positional {{1}}/{{2}} back into
    named tags using the stored variable labels, so legacy templates open correctly
    in the new editor. Best-effort; stray placeholders are dropped."""
    if not body or "{{" not in body:
        return body
    labels = labels or []

    def repl(m):
        i = int(m.group(1)) - 1
        if 0 <= i < len(labels) and str(labels[i]).strip():
            return "{" + str(labels[i]).strip() + "}"
        return ""

    return re.sub(r"\{\{\s*(\d+)\s*\}\}", repl, body)


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
    whatsapp_opt_out or parent_phone columns yet (graceful-degrade)."""
    if not standard_ids:
        return []
    
    # 1. Try to select all columns (fully migrated DB)
    try:
        return service_supabase.table("students").select(
            "id, name, username, phone, parent_phone, student_code, standard_id, whatsapp_opt_out, attendance_pct, avg_score, points, plain_password"
        ).in_("standard_id", standard_ids).execute().data or []
    except Exception:
        pass

    # 2. Try to select without whatsapp_opt_out (parent_phone exists, opt_out doesn't)
    try:
        rows = service_supabase.table("students").select(
            "id, name, username, phone, parent_phone, student_code, standard_id, attendance_pct, avg_score, points, plain_password"
        ).in_("standard_id", standard_ids).execute().data or []
        for r in rows:
            r["whatsapp_opt_out"] = False
        return rows
    except Exception:
        pass

    # 3. Try to select without parent_phone and whatsapp_opt_out (old baseline DB)
    try:
        rows = service_supabase.table("students").select(
            "id, name, username, phone, student_code, standard_id, attendance_pct, avg_score, points, plain_password"
        ).in_("standard_id", standard_ids).execute().data or []
        for r in rows:
            r["whatsapp_opt_out"] = False
            r["parent_phone"] = None
        return rows
    except Exception:
        return []


def _wa_fetch_standard_events(standard_ids: List[str]) -> dict:
    """Fetches the latest assignment, test, and upcoming live class for each standard."""
    out = {sid: {} for sid in standard_ids}
    try:
        classes = service_supabase.table("subject_classes").select("id, standard_id").in_("standard_id", standard_ids).execute().data or []
        class_to_std = {c["id"]: c["standard_id"] for c in classes}
        class_ids = list(class_to_std.keys())
        if not class_ids: return out
        
        assigns = service_supabase.table("assignments").select("title, class_id").in_("class_id", class_ids).order("created_at", desc=True).execute().data or []
        for a in assigns:
            std = class_to_std.get(a["class_id"])
            if std and "latest_assignment" not in out[std]:
                out[std]["latest_assignment"] = a["title"]
                
        tests = service_supabase.table("tests").select("title, class_id").in_("class_id", class_ids).order("created_at", desc=True).execute().data or []
        for t in tests:
            std = class_to_std.get(t["class_id"])
            if std and "latest_test" not in out[std]:
                out[std]["latest_test"] = t["title"]
                
        lives = service_supabase.table("live_classes").select("title, class_id").in_("class_id", class_ids).eq("status", "scheduled").order("scheduled_at").execute().data or []
        for l in lives:
            std = class_to_std.get(l["class_id"])
            if std and "upcoming_live_class" not in out[std]:
                out[std]["upcoming_live_class"] = l["title"]
                
        videos = service_supabase.table("videos").select("title, class_id").in_("class_id", class_ids).order("created_at", desc=True).execute().data or []
        for v in videos:
            std = class_to_std.get(v["class_id"])
            if std and "latest_video" not in out[std]:
                out[std]["latest_video"] = v["title"]
                
        # "Study materials" live in the `notes` table (per-subject teacher notes).
        # There is no study_materials table — querying it raised on every call.
        materials = service_supabase.table("notes").select("title, class_id").in_("class_id", class_ids).order("created_at", desc=True).execute().data or []
        for m in materials:
            std = class_to_std.get(m["class_id"])
            if std and "latest_material" not in out[std]:
                out[std]["latest_material"] = m["title"]
    except Exception as e:
        print(f"Error fetching contextual standard events: {e}")
    return out


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
    # Distinguish "not provided" (None → no per-student filter, e.g. exam reports
    # scoped by standard) from "explicitly empty" ([] → the teacher selected nobody).
    # A falsy `[]` used to collapse to None here and silently message EVERYONE.
    inc = set(included_student_ids) if included_student_ids is not None else None
    if inc is not None and not inc:
        return []  # explicit empty selection → no recipients (never "everyone")
    out = []
    events = _wa_fetch_standard_events(target)
    for r in _wa_fetch_students(target):
        if inc is not None and r["id"] not in inc:
            continue
        if not include_opted_out and r.get("whatsapp_opt_out"):
            continue
            
        std_id = r.get("standard_id")
        out.append({
            "id": r["id"],
            "name": r.get("name") or "",
            "username": r.get("username") or "",
            "phone": r.get("parent_phone") or r.get("phone") or "",
            "parent_phone": r.get("parent_phone") or "",
            "student_phone": r.get("phone") or "",
            "student_code": r.get("student_code") or "",
            "standard_id": std_id,
            "standard_name": std_name.get(std_id, ""),
            "opted_out": bool(r.get("whatsapp_opt_out")),
            "attendance_pct": r.get("attendance_pct") or 0,
            "avg_score": r.get("avg_score") or 0,
            "points": r.get("points") or 0,
            "plain_password": r.get("plain_password") or "",
            "latest_assignment": events.get(std_id, {}).get("latest_assignment") or "N/A",
            "latest_test": events.get(std_id, {}).get("latest_test") or "N/A",
            "upcoming_live_class": events.get(std_id, {}).get("upcoming_live_class") or "N/A",
            "latest_video": events.get(std_id, {}).get("latest_video") or "N/A",
            "latest_material": events.get(std_id, {}).get("latest_material") or "N/A",
        })
    return out


async def _wa_ensure_bucket():
    if filestore.is_r2_enabled():
        return
    try:
        await asyncio.to_thread(lambda: service_supabase.storage.get_bucket("whatsapp"))
    except Exception:
        await asyncio.to_thread(lambda: service_supabase.storage.create_bucket(
            "whatsapp", options={"public": True}))


async def _wa_upload_bytes(data: bytes, ext: str, content_type: str) -> str:
    await _wa_ensure_bucket()
    fname = f"whatsapp/{uuid.uuid4()}{ext}"
    return await asyncio.to_thread(lambda: filestore.upload_public(service_supabase, "whatsapp", fname, data, content_type))


_WA_MESSAGES_TEST_ID_OK = False


def _wa_messages_have_test_id() -> bool:
    """True once whatsapp_messages has the test_id column. Self-heals after the
    one-time ALTER (see schema.sql) so sends never crash before it's run, and the
    pending detector can dedupe by exam once it's present."""
    global _WA_MESSAGES_TEST_ID_OK
    if _WA_MESSAGES_TEST_ID_OK:
        return True
    try:
        service_supabase.table("whatsapp_messages").select("test_id").limit(1).execute()
        _WA_MESSAGES_TEST_ID_OK = True
    except Exception:
        _WA_MESSAGES_TEST_ID_OK = False
    return _WA_MESSAGES_TEST_ID_OK


async def _wa_send_and_log(provider, teacher_id, recipient, *, mode, template_name=None,
                           variables=None, body_text=None, manual_values=None,
                           template_body=None, meta_approved=False,
                           media_url=None, media_type=None,
                           category="utility", language="en", standard_id=None, job_id=None,
                           test_id=None):
    """Send one message and write a whatsapp_messages row. Returns a per-recipient
    result dict. Never raises — provider/network errors become a 'failed' status.

    The message body (named {Tags}) is rendered once via the single _wa_render engine.
    A true Meta template is only used when the active provider is Meta AND the named
    template has a Meta-approved counterpart; otherwise the rendered text is sent as a
    normal message."""
    to = (recipient.get("phone") or "").strip()
    if not to:
        return {"student_id": recipient.get("id"), "name": recipient.get("name"),
                "status": "failed", "error": "No phone number", "cost": 0}

    # Resolve the named-tag body to render. Callers may pass body_text directly
    # (reports/credentials), or just a template_name we look up.
    raw_body = body_text
    if raw_body is None and mode == "template" and template_name:
        raw_body = template_body
        if raw_body is None:
            try:
                t_rows = service_supabase.table("whatsapp_templates").select("body_text").eq(
                    "name", template_name).eq("teacher_id", teacher_id).execute().data
                raw_body = (t_rows[0].get("body_text") if t_rows else "") or ""
            except Exception as e:
                print(f"[wa] template body fetch failed: {e}")
                raw_body = ""
    rendered = _wa_render(raw_body or "", recipient, manual_values)

    use_meta_template = (provider.name == "meta" and mode == "template"
                         and bool(template_name) and meta_approved)
    try:
        if use_meta_template:
            positional = _wa_positional_values(template_body or raw_body or "", recipient, manual_values)
            res = await provider.send_template(to, template_name, positional, media_url, media_type, language)
        else:
            res = await provider.send_freeform(to, rendered, media_url, media_type)
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
        "body_text": rendered,
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
    if test_id and _wa_messages_have_test_id():
        row["test_id"] = test_id
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
def _wa_is_configured(cfg: dict) -> bool:
    """True when the active provider has the credentials it needs to send. An
    unset/unknown provider is NEVER 'configured'. WANotifier counts as configured
    only once its adapter is verified (wanotifier_verified) — see the safety gate
    in whatsapp.py — so the UI stops claiming a broken provider is connected."""
    provider = (cfg.get("provider") or "").lower()
    if provider == "baileys":
        import whatsapp_client as client
        return client.is_enabled()
    if provider == "meta":
        return bool((cfg.get("meta_access_token") or "").strip()
                    and (cfg.get("meta_phone_number_id") or "").strip())
    if provider == "wanotifier":
        return bool((cfg.get("api_key") or "").strip()) and bool(cfg.get("wanotifier_verified"))
    return False


@app.get("/api/teacher/whatsapp/config")
def wa_get_config(user = Depends(verify_token)):
    _wa_require_teacher(user)
    cfg = wa.get_wa_config()
    return {
        "configured": _wa_is_configured(cfg),
        "provider": cfg.get("provider", ""),
        "sender": cfg.get("sender", ""),
        "api_key_masked": wa.mask_key(cfg.get("api_key")),
        # Meta Cloud API (token masked; ids are not secret)
        "meta_phone_number_id": cfg.get("meta_phone_number_id", ""),
        "meta_waba_id": cfg.get("meta_waba_id", ""),
        "meta_token_masked": wa.mask_key(cfg.get("meta_access_token")),
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
    # Never wipe a stored secret with a blank/masked value.
    for secret in ("api_key", "meta_access_token"):
        if secret in patch:
            new_val = (patch.pop(secret) or "").strip()
            if new_val and not new_val.startswith("••••"):
                cfg[secret] = new_val
    for k, v in patch.items():
        cfg[k] = v
    wa.save_wa_config(cfg)
    return {"success": True, "configured": _wa_is_configured(cfg)}


# ── Connection / QR pairing (WhatsApp-Web-style setup) ─────────────────────────
@app.get("/api/teacher/whatsapp/connection")
async def wa_connection(user = Depends(verify_token)):
    _wa_require_teacher(user)
    cfg = wa.get_wa_config()
    provider = (cfg.get("provider") or "").lower()
    # WANotifier sending is paused until its adapter is verified (safety gate).
    if provider == "wanotifier" and (cfg.get("api_key") or "").strip() and not cfg.get("wanotifier_verified"):
        return {"provider": provider, "connected": False, "state": "setup_incomplete", "number": "",
                "error": "WhatsApp sending is paused while setup is being finished."}
    # Meta / WANotifier don't QR-pair — "connected" just means credentials are present.
    configured = _wa_is_configured(cfg)
    return {"provider": provider, "connected": configured,
            "state": "open" if configured else "close", "number": ""}


@app.post("/api/teacher/whatsapp/disconnect")
async def wa_disconnect(user = Depends(verify_token)):
    _wa_require_teacher(user)
    cfg = wa.get_wa_config()
    provider = (cfg.get("provider") or "").lower()
    if provider == "baileys":
        import httpx
        import whatsapp_client as client
        try:
            async with httpx.AsyncClient(timeout=10) as http_client:
                headers = {"Content-Type": "application/json"}
                if client.SHARED_TOKEN:
                    headers["X-Service-Token"] = client.SHARED_TOKEN
                await http_client.post(f"{client.WHATSAPP_SERVICE_URL}/disconnect", headers=headers)
        except Exception as e:
            print(f"[wa] baileys disconnect failed: {e}")
    return {"success": True}


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


# ── Variables (picker source of truth) ────────────────────────────────────────
@app.get("/api/teacher/whatsapp/variables")
def wa_variables(user = Depends(verify_token)):
    _wa_require_teacher(user)
    return {"variables": [{**v, "token": "{" + v["name"] + "}"} for v in WA_VARIABLES]}


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


def _parse_dynamic_tags(text_or_list, recip):
    """Backward-compatible shim — the real work now lives in the single engine
    _wa_render(). Kept so any older call site still resolves named tags."""
    if not text_or_list:
        return text_or_list
    return _wa_render(text_or_list, recip, None)


def _wa_missing_manual(body: str, manual_values: Optional[dict]) -> list:
    """Names of "ask" variables used in the body that the teacher hasn't filled in.
    Drives the friendly 'Please fill in: …' send-time validation."""
    filled = {str(k).strip().lower()
              for k, v in (manual_values or {}).items() if str(v).strip()}
    missing = []
    for var in _wa_parse_variables(body):
        if var["kind"] == "ask" and var["name"].strip().lower() not in filled:
            missing.append(var["name"])
    return missing

# ── Send (manual) ─────────────────────────────────────────────────────────────
# ── Background batch sends ─────────────────────────────────────────────────
# A class-wide send to hundreds of parents can take a while — past an HTTP
# timeout. Above this threshold the send endpoints enqueue a background task and
# return a batch_id the client polls; below it they stay synchronous (instant
# result alert).
WA_BATCH_THRESHOLD = 10
_wa_batches: dict = {}  # batch_id -> progress dict (in-memory; messages table is the audit trail)


def _wa_new_batch(total: int, kind: str) -> str:
    batch_id = uuid.uuid4().hex[:12]
    _wa_batches[batch_id] = {
        "id": batch_id, "kind": kind, "total": total, "sent": 0, "failed": 0,
        "total_cost": 0.0, "done": False,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    # Bounded registry: drop the oldest finished entries past 200.
    if len(_wa_batches) > 200:
        for k in [k for k, v in list(_wa_batches.items()) if v.get("done")][:-100]:
            _wa_batches.pop(k, None)
    return batch_id


def _wa_batch_track(batch_id: Optional[str], result: dict):
    b = _wa_batches.get(batch_id) if batch_id else None
    if not b:
        return
    if result.get("status") in ("failed", "not_configured"):
        b["failed"] += 1
    else:
        b["sent"] += 1
    b["total_cost"] = round(b["total_cost"] + (result.get("cost") or 0), 2)


async def _wa_run_batch(runner, batch_id: str):
    """Background wrapper: a crashed worker must still mark the batch done so
    the client's progress poll terminates."""
    try:
        await runner(batch_id)
    except Exception as e:
        print(f"[wa] batch {batch_id} crashed: {e}")
    finally:
        b = _wa_batches.get(batch_id)
        if b:
            b["done"] = True


@app.get("/api/teacher/whatsapp/batches/{batch_id}")
def wa_batch_status(batch_id: str, user = Depends(verify_token)):
    _wa_require_teacher(user)
    b = _wa_batches.get(batch_id)
    if not b:
        raise HTTPException(status_code=404, detail="Batch not found (server may have restarted — check Sent history)")
    return b


@app.post("/api/teacher/whatsapp/send")
async def wa_send(data: WhatsAppSendInput, user = Depends(verify_token)):
    _wa_require_teacher(user)
    provider = wa.get_provider()
    teacher_id = user["teacher_id"]

    # Resolve the chosen template once: its canonical named-tag body + whether it has
    # a Meta-approved counterpart (only relevant when the Meta provider is active).
    template_body = None
    meta_approved = False
    if data.mode == "template":
        if not data.template_name:
            raise HTTPException(status_code=400, detail="Please choose a template first.")
        try:
            t = service_supabase.table("whatsapp_templates").select(
                "body_text, status, provider_template_id").eq(
                "name", data.template_name).eq("teacher_id", teacher_id).limit(1).execute().data
            if t:
                template_body = t[0].get("body_text") or ""
                meta_approved = bool(t[0].get("provider_template_id")) and t[0].get("status") == "approved"
        except Exception:
            pass
        body_for_check = template_body if template_body is not None else (data.body_text or "")
    else:
        body_for_check = data.body_text or ""
        if not body_for_check.strip() and not data.media_url:
            raise HTTPException(status_code=400, detail="Type a message or attach a file first.")

    # Friendly validation: every "ask" blank must be filled before we send.
    missing = _wa_missing_manual(body_for_check, data.manual_values)
    if missing:
        raise HTTPException(status_code=400, detail="Please fill in: " + ", ".join(missing))

    free_body = None if data.mode == "template" else data.body_text

    # Test-to-self: single message to a teacher-supplied number.
    if data.test_to_self:
        recip = {"id": None, "name": "Test", "phone": data.test_to_self, "standard_id": None,
                 "standard_name": "Test Class", "student_code": "", "username": "",
                 "plain_password": "", "attendance_pct": 0, "avg_score": 0, "points": 0}
        r = await _wa_send_and_log(provider, teacher_id, recip, mode=data.mode,
                                   template_name=data.template_name,
                                   body_text=free_body, manual_values=data.manual_values,
                                   template_body=template_body, meta_approved=meta_approved,
                                   media_url=data.media_url,
                                   media_type=data.media_type, category=data.category,
                                   language=data.language)
        return {"results": [r], "sent": 1 if r["status"] not in ("failed", "not_configured") else 0,
                "total_cost": r["cost"], "configured": provider.configured}

    # SAFETY: never let a manual send resolve to "everyone" by accident. Require an
    # explicit recipient selection — a class (standard_ids) or specific students.
    if data.included_student_ids is None and not data.standard_ids:
        raise HTTPException(status_code=400, detail="Select recipients first.")

    recips = [r for r in _wa_resolve_recipients(teacher_id, data.standard_ids,
                                                data.included_student_ids) if r["phone"]]
    if not recips:
        raise HTTPException(status_code=400, detail="No recipients with a phone number")

    async def run(batch_id=None):
        results = []
        for idx, r in enumerate(recips):
            res = await _wa_send_and_log(
                provider, teacher_id, r, mode=data.mode, template_name=data.template_name,
                body_text=free_body, manual_values=data.manual_values,
                template_body=template_body, meta_approved=meta_approved,
                media_url=data.media_url,
                media_type=data.media_type, category=data.category, language=data.language)
            results.append(res)
            _wa_batch_track(batch_id, res)
        return results

    if len(recips) > WA_BATCH_THRESHOLD:
        batch_id = _wa_new_batch(len(recips), "send")
        asyncio.create_task(_wa_run_batch(run, batch_id))
        return {"queued": True, "batch_id": batch_id, "total": len(recips),
                "configured": provider.configured}

    results = await run()
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
def _wa_template_out(row: dict) -> dict:
    """Normalize a stored template for the API/UI: migrate any legacy positional
    {{n}} body back to named {Tags}, and attach the parsed variable list
    (each {name, kind}). Persists the migration once, best-effort."""
    body = row.get("body_text") or ""
    if "{{" in body:
        migrated = _wa_migrate_legacy_body(body, row.get("variables"))
        if migrated != body:
            row["body_text"] = migrated
            body = migrated
            try:
                service_supabase.table("whatsapp_templates").update(
                    {"body_text": migrated}).eq("id", row["id"]).execute()
            except Exception:
                pass
    row["variables"] = _wa_parse_variables(body)
    return row


def _wa_header_from_media(media_type: Optional[str]) -> str:
    """Derive a template header_type from an attached file's MIME type."""
    if not media_type:
        return "none"
    if media_type.startswith("image"):
        return "image"
    if media_type.startswith("audio"):
        return "audio"
    return "document"


_WA_TEMPLATE_MEDIA_OK = False


def _wa_templates_have_media() -> bool:
    """True once whatsapp_templates has the media columns. Self-heals after the
    one-time ALTER (see schema.sql) so template saves never crash before it's run."""
    global _WA_TEMPLATE_MEDIA_OK
    if _WA_TEMPLATE_MEDIA_OK:
        return True
    try:
        service_supabase.table("whatsapp_templates").select("media_url").limit(1).execute()
        _WA_TEMPLATE_MEDIA_OK = True
    except Exception:
        _WA_TEMPLATE_MEDIA_OK = False
    return _WA_TEMPLATE_MEDIA_OK


async def _wa_meta_create(provider, name, category, language, body_text, header_type):
    """Submit a named-tag body to Meta in its required positional {{1}} format."""
    pos_body, names = _wa_to_meta_body(body_text)
    return await provider.create_template(name, category, language, pos_body, header_type, names)


@app.get("/api/teacher/whatsapp/templates")
def wa_list_templates(user = Depends(verify_token)):
    _wa_require_teacher(user)
    try:
        rows = service_supabase.table("whatsapp_templates").select("*").eq(
            "teacher_id", user["teacher_id"]).order("created_at", desc=True).execute().data or []
    except Exception:
        rows = []
    return {"templates": [_wa_template_out(r) for r in rows]}


@app.post("/api/teacher/whatsapp/templates")
async def wa_create_template(data: WhatsAppTemplateInput, user = Depends(verify_token)):
    _wa_require_teacher(user)
    body = _wa_normalize_body(data.body_text)
    header_type = _wa_header_from_media(data.media_type)
    row = {
        "teacher_id": user["teacher_id"],
        "name": data.name.strip(),
        "category": data.category,
        "language": data.language,
        "header_type": header_type,
        "body_text": body,
        "variables": _wa_parse_variables(body),
        "status": "draft",
    }
    if _wa_templates_have_media():
        row.update({"media_url": data.media_url, "media_type": data.media_type, "media_name": data.media_name})
    submit_error = None
    if data.submit:
        provider = wa.get_provider()
        res = await _wa_meta_create(provider, data.name, data.category, data.language,
                                    body, header_type)
        row["provider_template_id"] = res.get("provider_template_id")
        row["status"] = res.get("status", "pending") if res.get("status") != "not_configured" else "draft"
        submit_error = res.get("error")
    try:
        ins = service_supabase.table("whatsapp_templates").insert(row).execute()
        return {"template": (ins.data or [row])[0], "error": submit_error}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save template: {e}")


@app.put("/api/teacher/whatsapp/templates/{template_id}")
async def wa_update_template(template_id: str, data: WhatsAppTemplateInput, user = Depends(verify_token)):
    _wa_require_teacher(user)
    body = _wa_normalize_body(data.body_text)
    header_type = _wa_header_from_media(data.media_type)
    update = {
        "name": data.name.strip(),
        "category": data.category,
        "language": data.language,
        "header_type": header_type,
        "body_text": body,
        "variables": _wa_parse_variables(body),
        # Editing the wording invalidates any prior Meta approval — back to draft.
        "status": "draft",
        "provider_template_id": None,
    }
    if _wa_templates_have_media():
        update.update({"media_url": data.media_url, "media_type": data.media_type, "media_name": data.media_name})
    submit_error = None
    if data.submit:
        provider = wa.get_provider()
        res = await _wa_meta_create(provider, data.name, data.category, data.language,
                                    body, header_type)
        update["provider_template_id"] = res.get("provider_template_id")
        update["status"] = res.get("status", "pending") if res.get("status") != "not_configured" else "draft"
        submit_error = res.get("error")
    try:
        upd = service_supabase.table("whatsapp_templates").update(update).eq(
            "id", template_id).eq("teacher_id", user["teacher_id"]).execute()
        if not upd.data:
            raise HTTPException(status_code=404, detail="Template not found")
        return {"template": _wa_template_out(upd.data[0]), "error": submit_error}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not update template: {e}")


@app.post("/api/teacher/whatsapp/templates/{template_id}/submit")
async def wa_submit_template(template_id: str, user = Depends(verify_token)):
    _wa_require_teacher(user)
    res = service_supabase.table("whatsapp_templates").select("*").eq(
        "id", template_id).eq("teacher_id", user["teacher_id"]).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Template not found")
    t = res.data
    body = _wa_migrate_legacy_body(t["body_text"] or "", t.get("variables")) if "{{" in (t.get("body_text") or "") else (t.get("body_text") or "")
    provider = wa.get_provider()
    r = await _wa_meta_create(provider, t["name"], t["category"], t["language"],
                              body, t.get("header_type", "none"))
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
def _wa_exam_standard_id(test_id: str):
    """Resolve a test's owning standard: tests.class_id → subject_classes.standard_id."""
    try:
        t = (service_supabase.table("tests").select("class_id").eq(
            "id", test_id).limit(1).execute().data or [None])[0]
        if not t or not t.get("class_id"):
            return None
        sc = (service_supabase.table("subject_classes").select("standard_id").eq(
            "id", t["class_id"]).limit(1).execute().data or [None])[0]
        return sc.get("standard_id") if sc else None
    except Exception:
        return None


def _wa_build_report_rows(teacher_id, std_ids, included_ids, test_id, period, criteria):
    """Shared between preview and send: resolve students → fetch report → score →
    band. Returns (recipients_with_report). Each item carries the report dict.
    Exam mode (test_id): recipients are forced to the exam's own standard, so an
    exam report can never reach another standard — regardless of what the client sent."""
    if test_id:
        exam_std = _wa_exam_standard_id(test_id)
        std_ids = [exam_std] if exam_std else std_ids
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
    # SAFETY: require an explicit selection (except exam mode, which is auto-scoped
    # to the exam's own standard) so a report send can never blast everyone.
    if not data.test_id and data.included_student_ids is None and not data.standard_ids:
        raise HTTPException(status_code=400, detail="Select recipients first.")
    rows = _wa_build_report_rows(teacher_id, data.standard_ids, data.included_student_ids,
                                 data.test_id, data.period, data.criteria)
    # Pre-filter to actually-sendable rows so batch progress totals are honest.
    sendable = [
        r for r in rows
        if r["phone"]
        # Exam mode: only students who actually took THIS exam get a result.
        and not (data.test_id and r["score"] is None)
        and not (data.criteria and not r["band"])  # no matching band → skip
    ]

    async def run(batch_id=None):
        results = []
        for idx, r in enumerate(sendable):
            band = r["band"] or {}
            msg = band.get("message") or data.default_message or ""
            attach = band.get("attach_report", True)
            template_name = band.get("template_name") or data.template_name
            media_url = media_type = None
            body_text = msg

            report = r["_report"]
            try:
                if attach and data.report_format == "pdf":
                    pdf = await asyncio.to_thread(wa.build_report_pdf, report, lms, data.test_id)
                    media_url = await _wa_upload_bytes(pdf, ".pdf", "application/pdf")
                    media_type = "application/pdf"
                elif attach and data.report_format == "image":
                    png = await asyncio.to_thread(wa.build_report_image, report, lms, data.test_id)
                    media_url = await _wa_upload_bytes(png, ".png", "image/png")
                    media_type = "image/png"
                elif data.report_format == "text":
                    txt = wa.build_report_text(report, lms, data.test_id)
                    body_text = (txt + ("\n\n" + msg if msg else "")).strip()
            except Exception as e:
                print(f"[wa] report artifact build failed for {r['id']}: {e}")

            mode = "template" if template_name else "freeform"
            res = await _wa_send_and_log(
                provider, teacher_id, r, mode=mode, template_name=template_name,
                body_text=body_text, media_url=media_url,
                media_type=media_type, category=data.category, standard_id=r["standard_id"],
                test_id=data.test_id)
            results.append(res)
            _wa_batch_track(batch_id, res)
        return results

    if len(sendable) > WA_BATCH_THRESHOLD:
        batch_id = _wa_new_batch(len(sendable), "reports")
        asyncio.create_task(_wa_run_batch(run, batch_id))
        return {"queued": True, "batch_id": batch_id, "total": len(sendable),
                "configured": provider.configured}

    results = await run()
    sent = sum(1 for x in results if x["status"] not in ("failed", "not_configured"))
    return {"results": results, "sent": sent,
            "total_cost": round(sum(x["cost"] for x in results), 2), "configured": provider.configured}


# ── Pending Actions (auto-detected exam-result notifications) ──────────────────
_WA_PENDING_DAYS = 30


@app.get("/api/teacher/whatsapp/pending")
def wa_pending(user = Depends(verify_token)):
    """Auto-detected 'Pending Actions' for the WhatsApp dashboard. Currently exam
    results: recent exams (attempts in the last _WA_PENDING_DAYS days) whose parents
    haven't been notified yet and that the teacher hasn't dismissed. The envelope
    leaves room to add attendance/fee tiles later without breaking the client."""
    _wa_require_teacher(user)
    tid = user["teacher_id"]
    empty = {"exam_results": {"total_parents": 0, "exams": []}}
    if not service_supabase:
        return empty

    try:
        stds = service_supabase.table("standards").select("id, name").eq("teacher_id", tid).execute().data or []
    except Exception:
        stds = []
    if not stds:
        return empty
    std_name = {s["id"]: s["name"] for s in stds}

    try:
        subs = service_supabase.table("subject_classes").select(
            "id, name, standard_id").in_("standard_id", list(std_name.keys())).execute().data or []
    except Exception:
        subs = []
    if not subs:
        return empty
    class_meta = {c["id"]: {"standard_id": c.get("standard_id"),
                            "standard_name": std_name.get(c.get("standard_id"), ""),
                            "subject_name": c.get("name")} for c in subs}
    class_ids = list(class_meta.keys())

    # Teacher's tests (+ dismissed flag, guarded for pre-migration DBs).
    have_dismiss = True
    try:
        tests = service_supabase.table("tests").select(
            "id, title, class_id, results_notify_dismissed").in_("class_id", class_ids).execute().data or []
    except Exception:
        have_dismiss = False
        tests = service_supabase.table("tests").select(
            "id, title, class_id").in_("class_id", class_ids).execute().data or []
    if not tests:
        return empty
    test_meta = {t["id"]: t for t in tests}
    test_ids = list(test_meta.keys())

    # Only consider exams with recent attempts.
    cutoff = (datetime.now(timezone.utc) - timedelta(days=_WA_PENDING_DAYS)).isoformat()
    try:
        attempts = service_supabase.table("test_attempts").select(
            "test_id, student_id, submitted_at").in_("test_id", test_ids).gte(
            "submitted_at", cutoff).execute().data or []
    except Exception:
        attempts = []
    if not attempts:
        return empty

    took = {}            # test_id -> set(student_id who took it)
    last_attempt = {}    # test_id -> latest submitted_at
    student_ids = set()
    for a in attempts:
        t, s = a.get("test_id"), a.get("student_id")
        if not t or not s:
            continue
        took.setdefault(t, set()).add(s)
        student_ids.add(s)
        sa = a.get("submitted_at")
        if sa and (t not in last_attempt or sa > last_attempt[t]):
            last_attempt[t] = sa

    # Keep only students with a phone and not opted out (the real notifiable parents).
    try:
        srows = service_supabase.table("students").select(
            "id, phone, parent_phone, whatsapp_opt_out").in_("id", list(student_ids)).execute().data or []
    except Exception:
        try:
            srows = service_supabase.table("students").select(
                "id, phone, parent_phone").in_("id", list(student_ids)).execute().data or []
            for s in srows:
                s["whatsapp_opt_out"] = False
        except Exception:
            try:
                srows = service_supabase.table("students").select(
                    "id, phone").in_("id", list(student_ids)).execute().data or []
                for s in srows:
                    s["whatsapp_opt_out"] = False
                    s["parent_phone"] = None
            except Exception:
                srows = []
    eligible = {s["id"] for s in srows
                if (s.get("parent_phone") or s.get("phone") or "").strip() and not s.get("whatsapp_opt_out")}

    # Already-notified (test_id, student_id) pairs — needs the migrated test_id column.
    # Only count real sends: a failed/not_configured row must NOT clear the parent,
    # so a teacher who clicks "Send all" while disconnected can retry later.
    notified = set()
    if _wa_messages_have_test_id():
        try:
            mrows = service_supabase.table("whatsapp_messages").select(
                "test_id, student_id, status").eq("teacher_id", tid).in_("test_id", test_ids).execute().data or []
            notified = {(m.get("test_id"), m.get("student_id")) for m in mrows
                        if m.get("status") not in ("failed", "not_configured")}
        except Exception:
            notified = set()

    exams = []
    total = 0
    for t_id, students in took.items():
        meta = test_meta.get(t_id) or {}
        if have_dismiss and meta.get("results_notify_dismissed"):
            continue
        cm = class_meta.get(meta.get("class_id"), {})
        took_eligible = {s for s in students if s in eligible}
        pending = {s for s in took_eligible if (t_id, s) not in notified}
        if not pending:
            continue
        total += len(pending)
        exams.append({
            "test_id": t_id,
            "title": meta.get("title") or "Exam",
            "standard_name": cm.get("standard_name", ""),
            "subject_name": cm.get("subject_name", ""),
            "pending_parents": len(pending),
            "took": len(took_eligible),
            "last_attempt_at": last_attempt.get(t_id),
        })
    exams.sort(key=lambda e: e.get("last_attempt_at") or "", reverse=True)
    return {"exam_results": {"total_parents": total, "exams": exams}}


class WhatsAppPendingDismissInput(BaseModel):
    test_id: str


@app.post("/api/teacher/whatsapp/pending/dismiss")
def wa_pending_dismiss(data: WhatsAppPendingDismissInput, user = Depends(verify_token)):
    """Dismiss an exam from the Pending Actions list ('Later'/✕). Scoped to the
    teacher who owns the exam's standard. No-ops gracefully pre-migration."""
    _wa_require_teacher(user)
    tid = user["teacher_id"]
    std_id = _wa_exam_standard_id(data.test_id)
    if not std_id:
        raise HTTPException(status_code=404, detail="Exam not found")
    try:
        owner = (service_supabase.table("standards").select("teacher_id").eq(
            "id", std_id).limit(1).execute().data or [None])[0]
    except Exception:
        owner = None
    if not owner or owner.get("teacher_id") != tid:
        raise HTTPException(status_code=403, detail="Not authorized")
    try:
        service_supabase.table("tests").update(
            {"results_notify_dismissed": True}).eq("id", data.test_id).execute()
    except Exception as e:
        print(f"[wa] pending dismiss skipped (missing column?): {e}")
    return {"ok": True}


# ── Welcome / credentials (onboarding) ────────────────────────────────────────
@app.post("/api/teacher/whatsapp/send-welcome")
async def wa_send_welcome(data: WhatsAppWelcomeInput, user = Depends(verify_token)):
    _wa_require_teacher(user)
    provider = wa.get_provider()
    teacher_id = user["teacher_id"]
    # SAFETY: require an explicit selection — never resolve to "everyone".
    if data.included_student_ids is None and not data.standard_ids:
        raise HTTPException(status_code=400, detail="Select recipients first.")
    recips = [r for r in _wa_resolve_recipients(teacher_id, data.standard_ids,
                                                data.included_student_ids) if r["phone"]]
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

    async def run(batch_id=None):
        results = []
        for idx, r in enumerate(recips):
            try:
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
                res = await _wa_send_and_log(
                    provider, teacher_id, r, mode=mode, template_name=template_name,
                    body_text=body, category=data.category, standard_id=r["standard_id"])
                results.append(res)
                _wa_batch_track(batch_id, res)
            except Exception as e:
                print(f"[wa] skipping welcome for {r.get('id')}: {e}")
                err_res = {"student_id": r.get("id"), "status": "failed", "error": f"Internal error: {str(e)}"}
                results.append(err_res)
                _wa_batch_track(batch_id, err_res)
        return results

    if len(recips) > WA_BATCH_THRESHOLD:
        batch_id = _wa_new_batch(len(recips), "welcome")
        asyncio.create_task(_wa_run_batch(run, batch_id))
        return {"queued": True, "batch_id": batch_id, "total": len(recips),
                "configured": provider.configured}

    results = await run()
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
        rows = []
        try:
            rows = service_supabase.table("students").select(
                "id, name, phone, parent_phone, standard_id, student_code, plain_password, whatsapp_opt_out").eq(
                "id", student_id).limit(1).execute().data or []
        except Exception:
            try:
                rows = service_supabase.table("students").select(
                    "id, name, phone, parent_phone, standard_id, student_code, plain_password").eq(
                    "id", student_id).limit(1).execute().data or []
                for s in rows:
                    s["whatsapp_opt_out"] = False
            except Exception:
                try:
                    rows = service_supabase.table("students").select(
                        "id, name, phone, standard_id, student_code, plain_password").eq(
                        "id", student_id).limit(1).execute().data or []
                    for s in rows:
                        s["whatsapp_opt_out"] = False
                        s["parent_phone"] = None
                except Exception:
                    pass

        if not rows:
            return
        s = rows[0]
        phone = (s.get("parent_phone") or s.get("phone") or "").strip()
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
    job_test_id = (job.get("trigger_config") or {}).get("test_id")
    if job.get("mode") == "report" or report_format != "none":
        rows = _wa_build_report_rows(teacher_id, std_ids, None,
                                     job_test_id, "overall", criteria)
        for idx, r in enumerate(rows):
            if not r["phone"] or r["id"] in recent_ids:
                continue
            if criteria and not r["band"]:
                continue
            band = r["band"] or {}
            body = band.get("message") or job.get("body_text") or ""
            media_url = media_type = None
            try:
                if report_format == "pdf":
                    pdf = await asyncio.to_thread(wa.build_report_pdf, r["_report"], lms, job_test_id)
                    media_url = await _wa_upload_bytes(pdf, ".pdf", "application/pdf"); media_type = "application/pdf"
                elif report_format == "image":
                    png = await asyncio.to_thread(wa.build_report_image, r["_report"], lms, job_test_id)
                    media_url = await _wa_upload_bytes(png, ".png", "image/png"); media_type = "image/png"
                elif report_format == "text":
                    body = (wa.build_report_text(r["_report"], lms, job_test_id) + ("\n\n" + body if body else "")).strip()
            except Exception as e:
                print(f"[wa job] artifact failed: {e}")
            tn = band.get("template_name") or job.get("template_name")
            mode = "template" if (job.get("mode") == "template" and tn) else "freeform"
            results.append(await _wa_send_and_log(
                provider, teacher_id, r, mode=mode, template_name=tn, body_text=body,
                media_url=media_url, media_type=media_type, category=category,
                standard_id=r["standard_id"], job_id=job["id"], test_id=job_test_id))
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


# ── Parent WhatsApp notifications (additive; reuses the pipeline above) ─────────
# Endpoints live in whatsapp_parent_routes.py and lazy-import the _wa_* helpers
# defined above, so this include must come after they are all declared.
from whatsapp_parent_routes import router as parent_wa_router  # noqa: E402
app.include_router(parent_wa_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
