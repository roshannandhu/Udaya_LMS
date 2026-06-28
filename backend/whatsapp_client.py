"""Thin async HTTP client for the Baileys WhatsApp microservice.

The Node service (whatsapp-service/) owns the actual WhatsApp connection, the
4s-paced queue, warm-up cap, dedupe and retry. This module is the only thing in
the FastAPI backend that talks to it — `BaileysProvider` (in whatsapp.py) and the
parent routes call these helpers. Internal network only; authenticated with a
shared token.

`ServiceDownError` is raised on a connection failure so callers can distinguish
"the Node service is unreachable" (→ buffer + retry) from "the send was rejected".
"""
import os
from typing import Optional

import httpx

WHATSAPP_SERVICE_URL = os.getenv("WHATSAPP_SERVICE_URL", "").rstrip("/")
SHARED_TOKEN = os.getenv("SHARED_TOKEN", "")
_TIMEOUT = float(os.getenv("WHATSAPP_SERVICE_TIMEOUT", "15"))


class ServiceDownError(Exception):
    """The Baileys microservice could not be reached (connection/timeout)."""


def is_enabled() -> bool:
    """True when a service URL is configured (i.e. Baileys is wired up)."""
    return bool(WHATSAPP_SERVICE_URL)


def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    if SHARED_TOKEN:
        h["X-Service-Token"] = SHARED_TOKEN
    return h


async def send(phone: str, text: str, *, media_url: Optional[str] = None,
               media_type: Optional[str] = None, dedupe_key: Optional[str] = None) -> dict:
    """Enqueue one message on the Node service. Returns the service's JSON reply
    ({queued, id} or {queued:false, duplicate:true}). Raises ServiceDownError if
    the service is unreachable; raises RuntimeError on a 4xx/5xx response."""
    if not WHATSAPP_SERVICE_URL:
        raise ServiceDownError("WHATSAPP_SERVICE_URL is not set")
    payload = {"phone": phone, "text": text,
               "mediaUrl": media_url, "mediaType": media_type, "dedupeKey": dedupe_key}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(f"{WHATSAPP_SERVICE_URL}/send",
                                     json=payload, headers=_headers())
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as e:
        raise ServiceDownError(str(e)) from e
    if resp.status_code >= 400:
        raise RuntimeError(f"whatsapp-service /send {resp.status_code}: {resp.text}")
    return resp.json()


async def status() -> dict:
    """Live connection state from the Node service: {connected, qr, today_count,
    queue_length, warmup_limit}. Raises ServiceDownError if unreachable."""
    if not WHATSAPP_SERVICE_URL:
        raise ServiceDownError("WHATSAPP_SERVICE_URL is not set")
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(f"{WHATSAPP_SERVICE_URL}/status", headers=_headers())
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as e:
        raise ServiceDownError(str(e)) from e
    if resp.status_code >= 400:
        raise RuntimeError(f"whatsapp-service /status {resp.status_code}: {resp.text}")
    return resp.json()


async def health() -> bool:
    """True if the Node service answers /health."""
    if not WHATSAPP_SERVICE_URL:
        return False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{WHATSAPP_SERVICE_URL}/health")
        return resp.status_code == 200
    except Exception:
        return False
