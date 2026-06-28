"""Tiny file-backed outbox for the FastAPI↔Baileys gap.

The Node microservice is the durable, paced queue. This buffer only covers the
short window where the Node service is briefly unreachable (a restart/redeploy):
`BaileysProvider` appends the rendered send here instead of dropping it, and a
single background loop drains it once the service answers `/health` again.

Kept deliberately small and dependency-light (only `whatsapp_client`) so both the
provider (whatsapp.py) and the routes can use it without import cycles.
"""
import asyncio
import json
import os
from typing import Optional

_FILE = os.path.join(os.path.dirname(__file__), "whatsapp_outbox.json")
_loop_started = False


def _read() -> list:
    try:
        with open(_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _write(items: list):
    try:
        with open(_FILE, "w", encoding="utf-8") as f:
            json.dump(items, f)
    except Exception as e:
        print(f"[wa-outbox] write failed: {e}")


def append(phone: str, text: str, *, media_url: Optional[str] = None,
           media_type: Optional[str] = None, dedupe_key: Optional[str] = None):
    """Buffer one send for later delivery and make sure the drain loop is running."""
    items = _read()
    items.append({"phone": phone, "text": text, "media_url": media_url,
                  "media_type": media_type, "dedupe_key": dedupe_key})
    _write(items)
    ensure_loop()


def pending_count() -> int:
    return len(_read())


def ensure_loop():
    """Start the drain loop once, if an event loop is available."""
    global _loop_started
    if _loop_started:
        return
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return  # no loop yet — append() will try again on the next call
    _loop_started = True
    asyncio.create_task(_drain_loop())


async def _drain_loop():
    import whatsapp_client as client
    while True:
        items = _read()
        if not items:
            await asyncio.sleep(30)
            continue
        if not await client.health():
            await asyncio.sleep(30)  # still down — keep the buffer intact
            continue
        remaining = []
        for p in items:
            try:
                await client.send(p["phone"], p.get("text") or "",
                                  media_url=p.get("media_url"), media_type=p.get("media_type"),
                                  dedupe_key=p.get("dedupe_key"))
            except client.ServiceDownError:
                remaining.append(p)  # went down mid-drain — keep for next pass
            except Exception as e:
                print(f"[wa-outbox] dropping (permanent error): {e}")
        _write(remaining)
        await asyncio.sleep(5)
