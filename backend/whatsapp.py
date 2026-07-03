"""WhatsApp parent-messaging support module.

Holds the swappable **provider adapter** (WANotifier today, Meta-direct/AiSensy
later), the **report generators** (text / PDF / PNG) and the **cost helper**.

The FastAPI *routes* live in ``main.py`` (the project's "routes in main.py"
convention). This module is import-safe with no DB or FastAPI dependencies so it
can be unit-tested in isolation.

Secrets (API key + sender number) live in a server-only ``whatsapp_config.json``
beside this file — never returned to the client in full (see ``mask_key``).
"""

from __future__ import annotations

import json
import io
from pathlib import Path
from typing import Optional, Dict, Any, List

import httpx

# ── Config (server-only, secret) ────────────────────────────────────────────
CONFIG_FILE = Path(__file__).resolve().parent / "whatsapp_config.json"

# Default per-category send rates (India INR). Editable in Settings.
DEFAULT_RATES = {"utility": 0.14, "marketing": 0.78, "auth": 0.13}
DEFAULT_CURRENCY = "INR"


def get_wa_config() -> dict:
    """Read the server-only WhatsApp config. Returns {} if missing/corrupt."""
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_wa_config(data: dict) -> None:
    CONFIG_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def mask_key(key: Optional[str]) -> str:
    """Mask a secret so the UI can show "••••1234" without leaking the key."""
    if not key:
        return ""
    if len(key) <= 4:
        return "••••"
    return "••••" + key[-4:]


def get_rates(config: Optional[dict] = None) -> Dict[str, float]:
    config = config if config is not None else get_wa_config()
    rates = dict(DEFAULT_RATES)
    for k, v in (config.get("rates") or {}).items():
        try:
            rates[k] = float(v)
        except (TypeError, ValueError):
            continue
    return rates


def estimate_cost(recipient_count: int, category: str = "utility",
                  config: Optional[dict] = None) -> dict:
    """Live cost estimate: count × per-category rate. The Baileys QR transport
    sends from your own number at no per-message cost, so it always estimates 0 —
    which lets the whole UI drop the ₹ / category chips on the free path."""
    config = config if config is not None else get_wa_config()
    currency = config.get("currency") or DEFAULT_CURRENCY
    if type(get_provider(config)).__name__ == "BaileysProvider":
        return {"count": recipient_count, "rate": 0, "amount": 0, "currency": currency}
    rates = get_rates(config)
    rate = float(rates.get(category, DEFAULT_RATES.get(category, 0.14)))
    amount = round(recipient_count * rate, 2)
    return {"count": recipient_count, "rate": rate, "amount": amount, "currency": currency}


# ── Provider adapter ─────────────────────────────────────────────────────────
class WhatsAppProvider:
    """Abstract provider. Concrete impls return a normalized result dict:
    ``{"status": str, "provider_message_id": str|None, "error": str|None}``.
    ``status`` is one of: queued|sent|delivered|read|failed|not_configured.
    """

    name = "base"
    configured = False

    async def send_template(self, to: str, template: str, variables: Optional[list] = None,
                            media_url: Optional[str] = None, media_type: Optional[str] = None,
                            language: str = "en") -> dict:
        raise NotImplementedError

    async def send_freeform(self, to: str, text: str, media_url: Optional[str] = None,
                            media_type: Optional[str] = None) -> dict:
        raise NotImplementedError

    async def create_template(self, name: str, category: str, language: str,
                              body_text: str, header_type: str = "none",
                              variables: Optional[list] = None) -> dict:
        raise NotImplementedError

    async def get_template_status(self, provider_template_id: str) -> dict:
        raise NotImplementedError

    async def get_session_state(self, to: str) -> bool:
        """True if a 24h customer-service window is currently open for ``to``."""
        return False


class UnconfiguredProvider(WhatsAppProvider):
    """Graceful-degrade provider used when no API key is set. Every send returns
    a clear ``not_configured`` status so the UI works end-to-end without creds."""

    name = "unconfigured"
    configured = False

    _NC = {"status": "not_configured", "provider_message_id": None,
           "error": "WhatsApp is not configured. Add an API key in Settings."}

    async def send_template(self, *a, **k) -> dict:
        return dict(self._NC)

    async def send_freeform(self, *a, **k) -> dict:
        return dict(self._NC)

    async def create_template(self, *a, **k) -> dict:
        return {"status": "not_configured", "provider_template_id": None,
                "error": "WhatsApp is not configured."}

    async def get_template_status(self, provider_template_id: str) -> dict:
        return {"status": "unknown"}

    async def get_session_state(self, to: str) -> bool:
        return False


class WANotifierProvider(WhatsAppProvider):
    """WANotifier (BSP) REST adapter.

    WANotifier exposes a REST API keyed by an account API key. The exact request
    shapes can be tuned without touching the rest of the app — everything funnels
    through ``_post`` and returns the normalized result dict. Endpoint paths follow
    WANotifier's documented v1 API; adjust ``BASE``/paths if the account differs.
    """

    name = "wanotifier"
    configured = True
    BASE = "https://app.wanotifier.com/api/v1"

    # SAFETY GATE: the current WANotifier request shapes are unverified guesses and
    # were delivering to ALL contacts (a broadcast) instead of the single `to` number.
    # Until the adapter is rewritten against WANotifier's real send-message API and
    # `verified` is set true, every send is BLOCKED so no wrong messages go out.
    _PAUSED = {"status": "not_configured", "provider_message_id": None,
               "error": "WhatsApp sending is paused while setup is finished. Please try again shortly."}

    def __init__(self, api_key: str, sender: Optional[str] = None, verified: bool = False):
        self.api_key = api_key
        self.sender = sender
        self.verified = verified

    async def _post(self, path: str, payload: dict) -> dict:
        url = f"{self.BASE}/{path.lstrip('/')}"
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(url, params={"key": self.api_key}, json=payload)
            data = {}
            try:
                data = resp.json()
            except Exception:
                data = {"raw": resp.text}
            if resp.status_code >= 400:
                return {"status": "failed", "provider_message_id": None,
                        "error": data.get("message") or f"HTTP {resp.status_code}"}
            return {"status": data.get("status", "sent"),
                    "provider_message_id": data.get("id") or data.get("message_id"),
                    "error": None, "raw": data}
        except Exception as e:  # network / timeout — never raise into the request path
            return {"status": "failed", "provider_message_id": None, "error": str(e)}

    async def send_template(self, to, template, variables=None, media_url=None,
                            media_type=None, language="en") -> dict:
        if not self.verified:
            return dict(self._PAUSED)
        payload: Dict[str, Any] = {
            "to": to,
            "type": "template",
            "template": {
                "name": template,
                "language": language,
                "variables": variables or [],
            },
        }
        if self.sender:
            payload["from"] = self.sender
        if media_url:
            payload["template"]["header"] = {"type": media_type or "document", "url": media_url}
        return await self._post("messages", payload)

    async def send_freeform(self, to, text, media_url=None, media_type=None) -> dict:
        if not self.verified:
            return dict(self._PAUSED)
        payload: Dict[str, Any] = {"to": to, "type": "text", "text": {"body": text}}
        if self.sender:
            payload["from"] = self.sender
        if media_url:
            payload["type"] = media_type or "document"
            payload[payload["type"]] = {"url": media_url, "caption": text}
        return await self._post("messages", payload)

    async def create_template(self, name, category, language, body_text,
                              header_type="none", variables=None) -> dict:
        payload = {
            "name": name,
            "category": (category or "utility").upper(),
            "language": language or "en",
            "body": body_text,
            "header_type": header_type,
            "variables": variables or [],
        }
        res = await self._post("templates", payload)
        return {"status": res.get("status", "pending"),
                "provider_template_id": (res.get("raw") or {}).get("id") if res.get("raw") else res.get("provider_message_id"),
                "error": res.get("error")}

    async def get_template_status(self, provider_template_id: str) -> dict:
        url = f"{self.BASE}/templates/{provider_template_id}"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(url, params={"key": self.api_key})
            data = resp.json() if resp.content else {}
            return {"status": data.get("status", "pending")}
        except Exception:
            return {"status": "pending"}

    async def get_session_state(self, to: str) -> bool:
        # Without an inbound-message store we conservatively assume the 24h window
        # is closed, so the UI only enables free-form when a session is known-open.
        return False


class MetaCloudProvider(WhatsAppProvider):
    """Official Meta WhatsApp Cloud API (Graph) adapter.

    Matches the app's model: send free-form text/media, send an approved template
    by name + body variables, create templates, and poll their status. Sending uses
    the phone-number-id node; template create/status use the WABA-id node.
    """

    name = "meta"
    configured = True
    BASE = "https://graph.facebook.com/v21.0"

    def __init__(self, access_token: str, phone_number_id: str, waba_id: Optional[str] = None):
        self.token = access_token
        self.phone_number_id = phone_number_id
        self.waba_id = waba_id

    @staticmethod
    def _digits(to: str) -> str:
        # Cloud API wants the number in international format; tolerate +, spaces.
        return "".join(c for c in (to or "") if c.isdigit())

    async def _graph(self, method: str, node: str, *, json_body: dict = None, params: dict = None) -> dict:
        url = f"{self.BASE}/{node.lstrip('/')}"
        headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.request(method, url, headers=headers, json=json_body, params=params)
            try:
                data = resp.json()
            except Exception:
                data = {"raw": resp.text}
            if resp.status_code >= 400:
                err = (data.get("error") or {})
                msg = err.get("error_user_msg") or err.get("message") or f"HTTP {resp.status_code}"
                return {"_ok": False, "error": msg, "raw": data}
            return {"_ok": True, "raw": data}
        except Exception as e:  # network/timeout — never raise into the request path
            return {"_ok": False, "error": str(e)}

    async def send_freeform(self, to, text, media_url=None, media_type=None) -> dict:
        payload: Dict[str, Any] = {"messaging_product": "whatsapp",
                                   "recipient_type": "individual", "to": self._digits(to)}
        if media_url:
            kind = "image" if (media_type or "").startswith("image") else (
                "audio" if (media_type or "").startswith("audio") else "document")
            payload["type"] = kind
            obj: Dict[str, Any] = {"link": media_url}
            if kind != "audio" and text:
                obj["caption"] = text
            if kind == "document":
                obj["filename"] = "attachment"
            payload[kind] = obj
        else:
            payload["type"] = "text"
            payload["text"] = {"preview_url": False, "body": text or ""}
        res = await self._graph("POST", f"{self.phone_number_id}/messages", json_body=payload)
        return self._send_result(res)

    async def send_template(self, to, template, variables=None, media_url=None,
                            media_type=None, language="en") -> dict:
        components: list = []
        if media_url:
            kind = "image" if (media_type or "").startswith("image") else (
                "video" if (media_type or "").startswith("video") else "document")
            header_obj = {"link": media_url}
            if kind == "document":
                header_obj["filename"] = "attachment"
            components.append({"type": "header",
                               "parameters": [{"type": kind, kind: header_obj}]})
        if variables:
            components.append({"type": "body",
                               "parameters": [{"type": "text", "text": str(v)} for v in variables]})
        tpl: Dict[str, Any] = {"name": template, "language": {"code": language or "en"}}
        if components:
            tpl["components"] = components
        payload = {"messaging_product": "whatsapp", "to": self._digits(to),
                   "type": "template", "template": tpl}
        res = await self._graph("POST", f"{self.phone_number_id}/messages", json_body=payload)
        return self._send_result(res)

    @staticmethod
    def _send_result(res: dict) -> dict:
        if not res.get("_ok"):
            return {"status": "failed", "provider_message_id": None, "error": res.get("error")}
        raw = res.get("raw") or {}
        msgs = raw.get("messages") or [{}]
        return {"status": "sent", "provider_message_id": msgs[0].get("id"), "error": None}

    async def create_template(self, name, category, language, body_text,
                              header_type="none", variables=None) -> dict:
        if not self.waba_id:
            return {"status": "failed", "provider_template_id": None,
                    "error": "WhatsApp Business Account ID is required to create templates."}
        components = [{"type": "BODY", "text": body_text}]
        payload = {"name": name, "language": language or "en",
                   "category": (category or "utility").upper(), "components": components}
        res = await self._graph("POST", f"{self.waba_id}/message_templates", json_body=payload)
        if not res.get("_ok"):
            return {"status": "failed", "provider_template_id": None, "error": res.get("error")}
        raw = res.get("raw") or {}
        return {"status": raw.get("status", "pending").lower(),
                "provider_template_id": raw.get("id"), "error": None}

    async def get_template_status(self, provider_template_id: str) -> dict:
        if not self.waba_id:
            return {"status": "pending"}
        res = await self._graph("GET", f"{self.waba_id}/message_templates",
                                params={"name": provider_template_id})
        if not res.get("_ok"):
            return {"status": "pending"}
        data = (res.get("raw") or {}).get("data") or []
        return {"status": (data[0].get("status", "pending").lower()) if data else "pending"}


class BaileysProvider(WhatsAppProvider):
    """Unofficial WhatsApp-Web transport via the Baileys Node microservice.

    This adapter is intentionally thin: the FastAPI side has already rendered the
    full message text (parent_templates.py), so we just hand text/media to the Node
    service, which owns the WhatsApp connection, the 4s-paced queue, the warm-up
    cap, dedupe and retry. ``dedupe_key`` lets the queue drop exact repeats.

    Note: Baileys has no native message templates — ``send_template`` just sends the
    already-rendered body as a normal message.
    """

    name = "baileys"
    configured = True  # "wired up"; live connection state is surfaced via /status

    @staticmethod
    def _map(reply: dict) -> dict:
        # The queue accepts and will deliver → treat as 'queued'. A refused duplicate
        # is not an error (the original is already on its way / delivered).
        if reply.get("duplicate"):
            return {"status": "sent", "provider_message_id": None, "error": None}
        if reply.get("queued"):
            return {"status": "queued", "provider_message_id": reply.get("id"), "error": None}
        return {"status": "failed", "provider_message_id": None,
                "error": reply.get("error") or "send rejected"}

    async def send_freeform(self, to, text, media_url=None, media_type=None) -> dict:
        import hashlib
        import whatsapp_client as client
        # Stable (process-independent) dedupe key: digits + content digest. Built-in
        # hash() is salted per-process, so it would break cross-restart dedup.
        # The digest MUST cover text AND media together: keying on text alone made
        # every report re-send with an unchanged message body a silent "duplicate"
        # (dropped by the queue but shown as sent) — the "PDF not sending" bug.
        digits = "".join(c for c in (to or "") if c.isdigit())
        digest = hashlib.md5(f"{text or ''}|{media_url or ''}".encode("utf-8")).hexdigest()[:16]
        dedupe_key = f"{digits}:{digest}"
        try:
            reply = await client.send(to, text or "", media_url=media_url,
                                      media_type=media_type, dedupe_key=dedupe_key)
        except client.ServiceDownError:
            # Node service briefly unreachable — buffer for delivery on recovery
            # rather than dropping the message. Counts as queued, not failed.
            import whatsapp_outbox
            whatsapp_outbox.append(to, text or "", media_url=media_url,
                                   media_type=media_type, dedupe_key=dedupe_key)
            return {"status": "queued", "provider_message_id": None, "error": None}
        except Exception as e:
            return {"status": "failed", "provider_message_id": None, "error": str(e)}
        return self._map(reply)

    async def send_template(self, to, template, variables=None, media_url=None,
                            media_type=None, language="en") -> dict:
        # No native templates on Baileys — caller passes the rendered body via
        # _wa_send_and_log's body_text path, so this is only hit defensively.
        return await self.send_freeform(to, template or "", media_url, media_type)

    async def create_template(self, name, category, language, body_text,
                              header_type="none", variables=None) -> dict:
        # Baileys has no Meta-style template approval — never throw; the message is
        # just sent as normal text. (The UI hides "Save & submit" off Meta anyway.)
        return {"status": "not_configured", "provider_template_id": None,
                "error": "Templates don't need approval on this provider — just save and use it."}

    async def get_template_status(self, provider_template_id: str) -> dict:
        return {"status": "approved"}


def get_provider(config: Optional[dict] = None) -> WhatsAppProvider:
    """Factory: real provider when credentials exist, else the degrade provider.

    SAFETY: an UNSET or unknown `provider` resolves to UnconfiguredProvider (no
    sends) — it must NEVER silently fall back to a real sending provider, so a
    blank/misconfigured config can't blast anyone."""
    config = config if config is not None else get_wa_config()
    provider = (config.get("provider") or "").lower()

    # Self-heal a legacy/unknown/blank provider (e.g. an old "evolution" config)
    # to Baileys whenever the Node service is wired. Safe: Baileys sends nothing
    # until a phone is explicitly QR-paired, so this never auto-blasts via a
    # credentialed provider (the invariant that guards Meta/WANotifier below).
    if provider not in ("baileys", "meta", "wanotifier"):
        import whatsapp_client as client
        if client.is_enabled():
            provider = "baileys"

    if provider == "baileys":
        import whatsapp_client as client
        # Only a sending provider when the Node service URL is actually configured.
        return BaileysProvider() if client.is_enabled() else UnconfiguredProvider()

    if provider == "meta":
        token = (config.get("meta_access_token") or "").strip()
        phone_id = (config.get("meta_phone_number_id") or "").strip()
        if token and phone_id:
            return MetaCloudProvider(token, phone_id, (config.get("meta_waba_id") or "").strip() or None)
        return UnconfiguredProvider()

    if provider == "wanotifier":
        api_key = (config.get("api_key") or "").strip()
        if not api_key:
            return UnconfiguredProvider()
        sender = config.get("sender") or None
        # Gated until the adapter is rewritten against the real API (see WANotifierProvider).
        return WANotifierProvider(api_key, sender, verified=bool(config.get("wanotifier_verified")))

    # Unset / unknown provider → no sending.
    return UnconfiguredProvider()


# ── Report rendering (consumes the GET /students/{id}/report/v2 shape) ────────

# Small module-level cache so the branding logo (same URL for every student in a
# bulk send) is fetched once per process, not once per PDF.
_image_cache: Dict[str, Optional[bytes]] = {}
DEFAULT_LOGO_PATH = Path(__file__).resolve().parents[1] / "frontend" / "public" / "logo.jpeg"


def _default_logo_bytes() -> Optional[bytes]:
    try:
        return DEFAULT_LOGO_PATH.read_bytes() if DEFAULT_LOGO_PATH.exists() else None
    except Exception:
        return None


def _fetch_image_bytes(url: Optional[str], cache: bool = False) -> Optional[bytes]:
    """Download an image for embedding in a PDF/PNG artifact.

    Returns None for missing URLs, ``preset:`` avatar sentinels and any network
    failure — artifacts must render fine without images.
    """
    if not url or not isinstance(url, str) or url.startswith("preset:"):
        return None
    if cache and url in _image_cache:
        return _image_cache[url]
    data: Optional[bytes] = None
    try:
        resp = httpx.get(url, timeout=8.0, follow_redirects=True)
        if resp.status_code == 200 and resp.content:
            data = resp.content
    except Exception:
        data = None
    if cache:
        _image_cache[url] = data
    return data


def _period_label(period: str, is_exam: bool) -> str:
    """Human document title + date range for the report header."""
    from datetime import date, timedelta

    if is_exam:
        return "Exam Result"
    today = date.today()
    fmt = "%d %b %Y"
    if period == "weekly":
        return f"Weekly Progress Report | {(today - timedelta(days=7)).strftime(fmt)} - {today.strftime(fmt)}"
    if period == "monthly":
        return f"Monthly Progress Report | {(today - timedelta(days=30)).strftime(fmt)} - {today.strftime(fmt)}"
    return "Progress Report | Overall"


def _report_fields(report: dict, test_id: Optional[str] = None) -> dict:
    """Pull the common fields used by all three renderers from a report/v2 dict.

    Scopes the figures to *what is being sent* so the artifact matches the message:
    - exam (``test_id`` given): only that one exam's result — its score + title, no
      history and no lifetime averages;
    - weekly/monthly: the period's OWN average + attendance (computed from the
      already date-filtered data), not the student's lifetime figures;
    - overall: the student's lifetime figures.
    """
    student = report.get("student") or {}
    radar = report.get("subject_radar") or []
    timeline = report.get("test_timeline") or []
    period = report.get("period") or "overall"

    is_exam = bool(test_id)
    exam = None
    exam_rank = exam_total = None
    if is_exam:
        exam = next((t for t in timeline if t.get("test_id") == test_id), None)
        recent_tests = [exam] if exam else []
        radar = []  # a single-exam result shows no subject radar / history
        avg_score = exam.get("score_pct") if exam else None
        attendance_pct = None
        points = rank = total_students = None
        if exam:
            exam_rank = exam.get("rank")
            exam_total = exam.get("total_attempts")
    else:
        recent_tests = timeline if timeline else []
        if period in ("weekly", "monthly"):
            # Average of THIS period's tests (timeline is already date-filtered upstream).
            pcts = [t.get("score_pct") for t in timeline if t.get("score_pct") is not None]
            avg_score = round(sum(pcts) / len(pcts), 1) if pcts else None
            # Records-weighted mean of per-subject attendance (each already counts late).
            att_total = sum((s.get("att_total") or 0) for s in radar)
            attendance_pct = round(
                sum((s.get("attendance_pct") or 0) * (s.get("att_total") or 0) for s in radar)
                / att_total, 1) if att_total else None
        else:
            avg_score = student.get("avg_score")
            attendance_pct = student.get("attendance_pct")
        points = student.get("points")
        rank = report.get("rank")
        total_students = report.get("total_students")

    return {
        "name": student.get("name") or "Student",
        "standard": student.get("standard_name") or "",
        "student_code": student.get("student_code") or "",
        "username": student.get("username") or "",
        "email": student.get("email") or "",
        "avatar_url": student.get("avatar_url") or "",
        "attendance_pct": attendance_pct,
        "avg_score": avg_score,
        "points": report.get("period_points") if report.get("period_points") is not None else points,
        "rank": rank,
        "total_students": total_students,
        "exam_rank": exam_rank,
        "exam_total": exam_total,
        "radar": radar,
        "recent_tests": recent_tests,
        "assignments": report.get("assignment_scores") or [],
        "assignment_stats": report.get("assignment_stats") or {},
        "live_classes_stats": report.get("live_classes_stats") or {},
        "class_averages": report.get("class_averages") or {},
        "topic_mastery_pct": report.get("topic_mastery_pct"),
        "attendance_heatmap": report.get("attendance_heatmap") or [],
        "video_heatmap": report.get("video_heatmap") or [],
        "test_heatmap": report.get("test_heatmap") or [],
        "assignment_heatmap": report.get("assignment_heatmap") or [],
        "period": period,
        "period_label": _period_label(period, is_exam),
        "is_exam": is_exam,
        "exam_title": (exam.get("test_title") if exam else None),
    }


def build_report_text(report: dict, lms_name: str = "", test_id: Optional[str] = None) -> str:
    """A clean, WhatsApp-friendly text summary of a student's report (or one exam)."""
    f = _report_fields(report, test_id)
    is_exam = f["is_exam"]
    lines: List[str] = []
    header = lms_name.strip() or ("Exam Result" if is_exam else "Udaya")
    lines.append(f"*{header}*")
    lines.append(f"Student: {f['name']}" + (f" ({f['standard']})" if f["standard"] else ""))
    if is_exam and f["exam_title"]:
        lines.append(f"Exam: {f['exam_title']}")
    if f["attendance_pct"] is not None:
        lines.append(f"Attendance: {f['attendance_pct']}%")
    if f["avg_score"] is not None:
        lines.append((f"Score: {f['avg_score']}%") if is_exam else (f"Average score: {f['avg_score']}%"))
    if is_exam and f["exam_rank"] and f["exam_total"]:
        lines.append(f"Rank in exam: {f['exam_rank']} of {f['exam_total']}")
    if f["rank"] and f["total_students"]:
        lines.append(f"Class rank: {f['rank']} / {f['total_students']}")
    # Subjects + history are only meaningful for a multi-test report, not one exam.
    if not is_exam and f["radar"]:
        lines.append("")
        lines.append("*Subjects*")
        for s in f["radar"]:
            lines.append(f"- {s.get('subject', '')}: {s.get('test_avg', 0)}% avg")
    if not is_exam and f["recent_tests"]:
        lines.append("")
        lines.append("*Recent tests*")
        for t in f["recent_tests"]:
            lines.append(f"- {t.get('test_title', 'Test')}: {t.get('score_pct', 0)}%")
    return "\n".join(lines)


def build_report_pdf(report: dict, lms_name: str = "", test_id: Optional[str] = None,
                     logo_url: Optional[str] = None) -> bytes:
    """Render the report as a professional branded PDF (reportlab).

    Branded header (logo + institution name), student identity block with photo,
    KPI cards (incl. exam rank), ruled tables, footer with page numbers.
    """
    try:
        from datetime import date
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.lib.utils import ImageReader
        from reportlab.pdfgen import canvas
    except ImportError as e:  # pragma: no cover
        raise RuntimeError("reportlab is required for PDF reports") from e

    f = _report_fields(report, test_id)
    is_exam = f["is_exam"]
    brand = lms_name.strip() or "Udaya"
    today_str = date.today().strftime("%d %b %Y")

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    M = 16 * mm  # page margin
    page_num = 1

    DARK = colors.HexColor("#0f1014")
    INK = colors.HexColor("#111111")
    GRAY = colors.HexColor("#777777")
    LIGHT = colors.HexColor("#F4F2EF")
    BORDER = colors.HexColor("#EBEAE7")
    INDIGO = colors.HexColor("#6366f1")

    def _image_reader(data: Optional[bytes]):
        if not data:
            return None
        try:
            reader = ImageReader(io.BytesIO(data))
            reader.getSize()  # force decode so bad bytes fail here, not mid-draw
            return reader
        except Exception:
            return None

    logo_img = _image_reader(_fetch_image_bytes(logo_url, cache=True) or _default_logo_bytes())
    photo_img = _image_reader(_fetch_image_bytes(f["avatar_url"]))

    def footer():
        c.setFont("Helvetica", 8)
        c.setFillColor(GRAY)
        c.drawString(M, 10 * mm, f"Generated by {brand} | {today_str}")
        c.drawRightString(W - M, 10 * mm, f"Page {page_num}")
        c.setStrokeColor(BORDER)
        c.line(M, 13 * mm, W - M, 13 * mm)

    def new_page():
        nonlocal page_num, y
        footer()
        c.showPage()
        page_num += 1
        y = H - 20 * mm

    # ── Header band ────────────────────────────────────────────────────────
    band_h = 30 * mm
    c.setFillColor(DARK)
    c.rect(0, H - band_h, W, band_h, stroke=0, fill=1)
    hx = M
    if logo_img:
        chip = 18 * mm
        cy = H - band_h / 2 - chip / 2
        c.setFillColor(colors.white)
        c.roundRect(hx, cy, chip, chip, 3 * mm, stroke=0, fill=1)
        c.drawImage(logo_img, hx + 1.5 * mm, cy + 1.5 * mm, chip - 3 * mm, chip - 3 * mm,
                    preserveAspectRatio=True, anchor="c", mask="auto")
        hx += chip + 5 * mm
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 17)
    c.drawString(hx, H - band_h / 2 + 1.5 * mm, brand[:42])
    c.setFillColor(colors.HexColor("#b9bcc7"))
    c.setFont("Helvetica", 10)
    c.drawString(hx, H - band_h / 2 - 4.5 * mm, f["period_label"])
    c.setFont("Helvetica", 8.5)
    c.drawRightString(W - M, H - band_h / 2 - 4.5 * mm, f"Generated {today_str}")

    y = H - band_h - 12 * mm

    # ── Identity block (photo right) ───────────────────────────────────────
    photo_w, photo_h = 24 * mm, 28 * mm
    if photo_img:
        px, py = W - M - photo_w, y - photo_h + 6 * mm
        c.setStrokeColor(BORDER)
        c.setFillColor(colors.white)
        c.roundRect(px - 1 * mm, py - 1 * mm, photo_w + 2 * mm, photo_h + 2 * mm, 2 * mm, stroke=1, fill=1)
        c.drawImage(photo_img, px, py, photo_w, photo_h, preserveAspectRatio=True, anchor="c", mask="auto")
    else:
        px, py = W - M - photo_w, y - photo_h + 6 * mm
        c.setStrokeColor(BORDER)
        c.setFillColor(colors.white)
        c.roundRect(px - 1 * mm, py - 1 * mm, photo_w + 2 * mm, photo_h + 2 * mm, 2 * mm, stroke=1, fill=1)
        c.setFillColor(LIGHT)
        c.roundRect(px, py, photo_w, photo_h, 1.5 * mm, stroke=0, fill=1)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 14)
        initials = "".join(part[:1] for part in f["name"].split()[:2]).upper() or "S"
        c.drawCentredString(px + photo_w / 2, py + photo_h / 2 - 2 * mm, initials)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(M, y, f["name"])
    y -= 6.5 * mm
    c.setFont("Helvetica", 10)
    c.setFillColor(GRAY)
    sub_bits = []
    if f["student_code"]:
        sub_bits.append(f"Student ID: {f['student_code']}")
    if f["standard"]:
        sub_bits.append(f["standard"])
    if f["username"]:
        sub_bits.append(f"@{f['username']}")
    if sub_bits:
        c.drawString(M, y, " | ".join(sub_bits)[:88])
        y -= 6 * mm
    if is_exam and f["exam_title"]:
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(M, y, f"Exam: {f['exam_title']}")
        y -= 6 * mm
    y = min(y, H - band_h - 12 * mm - photo_h - 2 * mm)
    y -= 4 * mm

    # ── KPI cards ──────────────────────────────────────────────────────────
    kpis = []
    if f["avg_score"] is not None:
        kpis.append((("Score" if is_exam else "Avg Score"), f"{f['avg_score']}%"))
    if is_exam and f["exam_rank"] and f["exam_total"]:
        kpis.append(("Exam Rank", f"{f['exam_rank']} of {f['exam_total']}"))
    if f["attendance_pct"] is not None:
        kpis.append(("Attendance", f"{f['attendance_pct']}%"))
    if f["rank"] and f["total_students"]:
        kpis.append(("Class Rank", f"{f['rank']} / {f['total_students']}"))
    if f["points"] is not None:
        kpis.append(("Points", f"{f['points']}"))
    if kpis:
        card_gap = 4 * mm
        card_w = min(42 * mm, (W - 2 * M - card_gap * (len(kpis) - 1)) / len(kpis))
        card_h = 18 * mm
        x = M
        for label, value in kpis:
            c.setFillColor(LIGHT)
            c.roundRect(x, y - card_h, card_w, card_h, 2.5 * mm, stroke=0, fill=1)
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 14)
            c.drawString(x + 4 * mm, y - 8 * mm, value)
            c.setFillColor(GRAY)
            c.setFont("Helvetica", 7.5)
            c.drawString(x + 4 * mm, y - 14 * mm, label.upper())
            x += card_w + card_gap
        y -= card_h + 10 * mm

    def cell_text(value, max_chars=34):
        if value is None or value == "":
            return "-"
        text = str(value)
        return text if len(text) <= max_chars else text[:max_chars - 1] + "..."

    # ── Table helper ───────────────────────────────────────────────────────
    def table(title, headers, rows, col_widths):
        nonlocal y
        if not rows:
            return
        row_h = 7.5 * mm
        if y < 46 * mm:
            new_page()
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(M, y, title)
        y -= 8 * mm
        # header row
        c.setFillColor(INDIGO)
        c.rect(M, y - row_h + 2 * mm, W - 2 * M, row_h, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 9)
        x = M
        for htext, wcol in zip(headers, col_widths):
            c.drawString(x + 2.5 * mm, y - row_h / 2, cell_text(htext, 18))
            x += wcol
        y -= row_h
        for i, row in enumerate(rows):
            if y < 25 * mm:
                new_page()
            if i % 2 == 1:
                c.setFillColor(LIGHT)
                c.rect(M, y - row_h + 2 * mm, W - 2 * M, row_h, stroke=0, fill=1)
            c.setFillColor(colors.HexColor("#333333"))
            c.setFont("Helvetica", 9)
            x = M
            for val, wcol in zip(row, col_widths):
                c.drawString(x + 2.5 * mm, y - row_h / 2, cell_text(val, max(8, int(wcol / mm * 1.65))))
                x += wcol
            c.setStrokeColor(BORDER)
            c.line(M, y - row_h + 2 * mm, W - M, y - row_h + 2 * mm)
            y -= row_h
        y -= 8 * mm

    cw = W - 2 * M

    details_rows = [
        ["Student ID", f["student_code"] or "-"],
        ["Standard", f["standard"] or "-"],
        ["Username", f"@{f['username']}" if f["username"] else "-"],
        ["Email", f["email"] or "-"],
        ["Report", f["period_label"]],
    ]
    if is_exam and f["exam_title"]:
        details_rows.append(["Exam", f["exam_title"]])
    table("Student Details", ["Field", "Value"], details_rows, [cw * 0.28, cw * 0.72])

    if not is_exam:
        attendance_total = sum((d.get("total") or 0) for d in f["attendance_heatmap"])
        attendance_present = sum((d.get("present") or 0) + (d.get("late") or 0) for d in f["attendance_heatmap"])
        test_count = sum((d.get("count") or 0) for d in f["test_heatmap"])
        video_minutes = round(sum((d.get("minutes") or 0) for d in f["video_heatmap"]))
        video_sessions = sum((d.get("count") or 0) for d in f["video_heatmap"])
        assign_count = sum((d.get("count") or 0) for d in f["assignment_heatmap"])
        live = f["live_classes_stats"] or {}
        table(
            "Activity Summary",
            ["Activity", "Result"],
            [
                ["Attendance Records", f"{attendance_present}/{attendance_total} present or late" if attendance_total else "-"],
                ["Tests Taken", test_count or "-"],
                ["Video Study", f"{video_minutes} min across {video_sessions} sessions" if video_sessions else "-"],
                ["Assignments Submitted", assign_count or "-"],
                ["Live Classes", f"{live.get('attended') or 0}/{live.get('total')} attended" if live.get("total") else "-"],
            ],
            [cw * 0.38, cw * 0.62],
        )

    if f["radar"]:
        table(
            "Subject Performance",
            ["Subject", "Avg Score", "Attendance", "Videos", "Assignments"],
            [[
                s.get("subject", ""),
                (f"{round(s.get('test_avg') or 0)}%" if (s.get("test_count") or 0) > 0 else "-"),
                (f"{round(s.get('attendance_pct') or 0)}%" if (s.get("att_total") or 0) > 0 else "-"),
                (f"{s.get('video_done', 0)}/{s.get('video_total', 0)}" if (s.get("video_total") or 0) > 0 else "-"),
                (f"{s.get('assignment_submitted', 0)}/{s.get('assignment_total', 0)}" if (s.get("assignment_total") or 0) > 0 else "-"),
            ] for s in f["radar"]],
            [cw * 0.32, cw * 0.17, cw * 0.17, cw * 0.17, cw * 0.17],
        )

    if f["recent_tests"]:
        def _fmt_date(iso):
            try:
                return (iso or "")[:10]
            except Exception:
                return ""
        table(
            "Exam Result" if is_exam else "Recent Tests",
            ["Date", "Test", "Score", "Rank"],
            [[
                _fmt_date(t.get("date")),
                (t.get("test_title") or "Test")[:48],
                f"{t.get('score_pct', 0)}%",
                (f"{t.get('rank')} of {t.get('total_attempts')}" if t.get("rank") and t.get("total_attempts") else "-"),
            ] for t in f["recent_tests"] if t],
            [cw * 0.16, cw * 0.48, cw * 0.16, cw * 0.20],
        )

    if not is_exam and f["assignments"]:
        table(
            "Assignments",
            ["Assignment", "Subject", "Status", "Marks", "Points"],
            [[
                a.get("assignment_title") or "Assignment",
                a.get("subject_name") or "-",
                "Graded" if a.get("marks_obtained") is not None else ("Submitted" if a.get("submitted_at") else "Pending"),
                (f"{round(a.get('marks_obtained') or 0)}%" if a.get("marks_obtained") is not None else "-"),
                a.get("points_earned") if a.get("points_earned") is not None else "-",
            ] for a in f["assignments"]],
            [cw * 0.34, cw * 0.22, cw * 0.16, cw * 0.14, cw * 0.14],
        )

    if not is_exam and f["class_averages"]:
        ca = f["class_averages"]
        table(
            "Performance vs Class Average",
            ["Metric", "Student", "Class Avg"],
            [
                ["Average Score", f"{f['avg_score']}%" if f["avg_score"] is not None else "-", f"{round(ca.get('avg_score') or 0)}%"],
                ["Attendance", f"{f['attendance_pct']}%" if f["attendance_pct"] is not None else "-", f"{round(ca.get('attendance_pct') or 0)}%"],
                ["Points", f["points"] if f["points"] is not None else "-", round(ca.get("points") or 0)],
                ["Video Completion", "-", f"{round(ca.get('video_pct') or 0)}%"],
                ["Mastery", f"{round(f['topic_mastery_pct'] or 0)}%" if f["topic_mastery_pct"] is not None else "-", f"{round(ca.get('mastery') or 0)}%"],
            ],
            [cw * 0.40, cw * 0.30, cw * 0.30],
        )

    footer()
    c.showPage()
    c.save()
    return buf.getvalue()


def build_report_image(report: dict, lms_name: str = "", test_id: Optional[str] = None,
                       logo_url: Optional[str] = None) -> bytes:
    """Render the report as a professional branded PNG card (Pillow)."""
    try:
        from datetime import date
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as e:  # pragma: no cover
        raise RuntimeError("Pillow is required for image reports") from e

    f = _report_fields(report, test_id)
    is_exam = f["is_exam"]
    brand = lms_name.strip() or "Udaya"
    today_str = date.today().strftime("%d %b %Y")
    W, H = 900, 1200
    img = Image.new("RGB", (W, H), "#FAFAF9")
    d = ImageDraw.Draw(img)

    def font(size, bold=False):
        candidates = (["DejaVuSans-Bold.ttf", "arialbd.ttf"] if bold
                      else ["DejaVuSans.ttf", "arial.ttf"])
        for name in candidates:
            try:
                return ImageFont.truetype(name, size)
            except Exception:
                continue
        try:
            return ImageFont.load_default(size)  # Pillow ≥ 10.1 supports sized default
        except Exception:
            return ImageFont.load_default()

    def open_image(data):
        if not data:
            return None
        try:
            return Image.open(io.BytesIO(data)).convert("RGBA")
        except Exception:
            return None

    logo = open_image(_fetch_image_bytes(logo_url, cache=True) or _default_logo_bytes())
    photo = open_image(_fetch_image_bytes(f["avatar_url"]))

    pad = 48

    # ── Header band ────────────────────────────────────────────────────────
    band_h = 150
    d.rectangle([(0, 0), (W, band_h)], fill="#0f1014")
    hx = pad
    if logo:
        chip = 96
        chip_img = Image.new("RGBA", (chip, chip), "#ffffff")
        inner = logo.copy()
        inner.thumbnail((chip - 12, chip - 12))
        chip_img.paste(inner, ((chip - inner.width) // 2, (chip - inner.height) // 2), inner)
        img.paste(chip_img, (hx, (band_h - chip) // 2), chip_img)
        hx += chip + 24
    d.text((hx, band_h // 2 - 38), brand, fill="#ffffff", font=font(38, True))
    d.text((hx, band_h // 2 + 12), f["period_label"], fill="#b9bcc7", font=font(20))
    date_txt = f"Generated {today_str}"
    d.text((W - pad - d.textlength(date_txt, font=font(17)), band_h // 2 + 14), date_txt, fill="#8a8d98", font=font(17))

    y = band_h + 44

    # ── Identity block (photo right) ───────────────────────────────────────
    if photo:
        pw, ph = 130, 150
        thumb = photo.copy()
        thumb.thumbnail((pw, ph))
        px = W - pad - pw
        d.rounded_rectangle([(px - 6, y - 6), (px + pw + 6, y + ph + 6)], radius=10, fill="#ffffff", outline="#EBEAE7", width=2)
        img.paste(thumb, (px + (pw - thumb.width) // 2, y + (ph - thumb.height) // 2), thumb)
    d.text((pad, y), f["name"], fill="#111111", font=font(34, True))
    y += 48
    sub_bits = []
    if f["student_code"]:
        sub_bits.append(f"Student ID: {f['student_code']}")
    if f["standard"]:
        sub_bits.append(f["standard"])
    if sub_bits:
        d.text((pad, y), "   •   ".join(sub_bits), fill="#777777", font=font(20))
        y += 36
    if is_exam and f["exam_title"]:
        d.text((pad, y), f"Exam: {f['exam_title']}", fill="#111111", font=font(24, True))
        y += 40
    if photo:
        y = max(y, band_h + 44 + 150 + 24)
    y += 12

    # ── KPI cards ──────────────────────────────────────────────────────────
    kpis = []
    if f["avg_score"] is not None:
        kpis.append((("Score" if is_exam else "Avg Score"), f"{f['avg_score']}%"))
    if is_exam and f["exam_rank"] and f["exam_total"]:
        kpis.append(("Exam Rank", f"{f['exam_rank']} of {f['exam_total']}"))
    if f["attendance_pct"] is not None:
        kpis.append(("Attendance", f"{f['attendance_pct']}%"))
    if f["rank"] and f["total_students"]:
        kpis.append(("Class Rank", f"{f['rank']}/{f['total_students']}"))
    if f["points"] is not None:
        kpis.append(("Points", f"{f['points']}"))
    if kpis:
        gap = 16
        card_w = (W - 2 * pad - gap * (len(kpis) - 1)) // len(kpis)
        card_h = 100
        x = pad
        for label, value in kpis:
            d.rounded_rectangle([(x, y), (x + card_w, y + card_h)], radius=14, fill="#F4F2EF")
            d.text((x + 18, y + 18), value, fill="#111111", font=font(30, True))
            d.text((x + 18, y + 64), label.upper(), fill="#888888", font=font(15))
            x += card_w + gap
        y += card_h + 40

    # ── Tables ─────────────────────────────────────────────────────────────
    def table(title, headers, rows, col_fracs):
        nonlocal y
        if not rows:
            return
        d.text((pad, y), title, fill="#111111", font=font(26, True))
        y += 44
        row_h = 44
        tw = W - 2 * pad
        cols = [pad + int(tw * sum(col_fracs[:i])) for i in range(len(col_fracs))]
        d.rectangle([(pad, y), (W - pad, y + row_h)], fill="#6366f1")
        for htext, cx in zip(headers, cols):
            d.text((cx + 12, y + 11), htext, fill="#ffffff", font=font(18, True))
        y += row_h
        for i, row in enumerate(rows):
            if i % 2 == 1:
                d.rectangle([(pad, y), (W - pad, y + row_h)], fill="#F4F2EF")
            for val, cx in zip(row, cols):
                d.text((cx + 12, y + 11), str(val), fill="#333333", font=font(18))
            d.line([(pad, y + row_h), (W - pad, y + row_h)], fill="#EBEAE7", width=1)
            y += row_h
        y += 36

    if f["radar"]:
        table(
            "Subject Performance",
            ["Subject", "Avg Score", "Attendance", "Videos"],
            [[
                (s.get("subject") or "")[:22],
                (f"{round(s.get('test_avg') or 0)}%" if (s.get("test_count") or 0) > 0 else "-"),
                (f"{round(s.get('attendance_pct') or 0)}%" if (s.get("att_total") or 0) > 0 else "-"),
                (f"{s.get('video_done', 0)}/{s.get('video_total', 0)}" if (s.get("video_total") or 0) > 0 else "-"),
            ] for s in f["radar"]],
            [0.40, 0.20, 0.20, 0.20],
        )

    if f["recent_tests"]:
        table(
            "Exam Result" if is_exam else "Recent Tests",
            ["Test", "Score", "Rank"],
            [[
                (t.get("test_title") or "Test")[:34],
                f"{t.get('score_pct', 0)}%",
                (f"{t.get('rank')} of {t.get('total_attempts')}" if t.get("rank") and t.get("total_attempts") else "-"),
            ] for t in f["recent_tests"] if t],
            [0.56, 0.20, 0.24],
        )

    # ── Footer ─────────────────────────────────────────────────────────────
    d.line([(pad, H - 70), (W - pad, H - 70)], fill="#EBEAE7", width=2)
    d.text((pad, H - 52), f"Generated by {brand} | {today_str}", fill="#999999", font=font(16))

    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def resolve_band(score: Optional[float], criteria: Optional[list]) -> Optional[dict]:
    """Given a numeric score and criteria bands [{min,max,message,template_name,
    attach_report}], return the first matching band (inclusive min, exclusive max
    unless max is None)."""
    if score is None or not criteria:
        return None
    for band in criteria:
        lo = band.get("min")
        hi = band.get("max")
        lo_ok = lo is None or score >= float(lo)
        hi_ok = hi is None or score < float(hi)
        if lo_ok and hi_ok:
            return band
    return None
