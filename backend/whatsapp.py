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
    """Live cost estimate: count × per-category rate."""
    config = config if config is not None else get_wa_config()
    rates = get_rates(config)
    rate = float(rates.get(category, DEFAULT_RATES.get(category, 0.14)))
    currency = config.get("currency") or DEFAULT_CURRENCY
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
    BASE = "https://api.wanotifier.com/v1"

    def __init__(self, api_key: str, sender: Optional[str] = None):
        self.api_key = api_key
        self.sender = sender

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


def get_provider(config: Optional[dict] = None) -> WhatsAppProvider:
    """Factory: real provider when an API key exists, else the degrade provider."""
    config = config if config is not None else get_wa_config()
    api_key = (config.get("api_key") or "").strip()
    if not api_key:
        return UnconfiguredProvider()
    provider = (config.get("provider") or "wanotifier").lower()
    sender = config.get("sender") or None
    if provider == "wanotifier":
        return WANotifierProvider(api_key, sender)
    # Unknown provider id → fall back to WANotifier shape.
    return WANotifierProvider(api_key, sender)


# ── Report rendering (consumes the GET /students/{id}/report/v2 shape) ────────
def _report_fields(report: dict) -> dict:
    """Pull the common fields used by all three renderers from a report/v2 dict."""
    student = report.get("student") or {}
    radar = report.get("subject_radar") or []
    timeline = report.get("test_timeline") or []
    last_tests = timeline[-5:] if timeline else []
    return {
        "name": student.get("name") or "Student",
        "standard": student.get("standard_name") or "",
        "student_code": student.get("student_code") or "",
        "attendance_pct": student.get("attendance_pct"),
        "avg_score": student.get("avg_score"),
        "points": student.get("points"),
        "rank": report.get("rank"),
        "total_students": report.get("total_students"),
        "radar": radar,
        "recent_tests": last_tests,
        "period": report.get("period") or "overall",
    }


def build_report_text(report: dict, lms_name: str = "") -> str:
    """A clean, WhatsApp-friendly text summary of a student's report."""
    f = _report_fields(report)
    lines: List[str] = []
    header = lms_name.strip() or "Progress Report"
    lines.append(f"*{header}*")
    lines.append(f"Student: {f['name']}" + (f" ({f['standard']})" if f["standard"] else ""))
    if f["attendance_pct"] is not None:
        lines.append(f"Attendance: {f['attendance_pct']}%")
    if f["avg_score"] is not None:
        lines.append(f"Average score: {f['avg_score']}%")
    if f["rank"] and f["total_students"]:
        lines.append(f"Class rank: {f['rank']} / {f['total_students']}")
    if f["radar"]:
        lines.append("")
        lines.append("*Subjects*")
        for s in f["radar"]:
            lines.append(f"• {s.get('subject', '')}: {s.get('test_avg', 0)}% avg")
    if f["recent_tests"]:
        lines.append("")
        lines.append("*Recent tests*")
        for t in f["recent_tests"]:
            lines.append(f"• {t.get('test_title', 'Test')}: {t.get('score_pct', 0)}%")
    return "\n".join(lines)


def build_report_pdf(report: dict, lms_name: str = "") -> bytes:
    """Render the report as a PDF (reportlab). Layout mirrors StudentReportCard."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.pdfgen import canvas
    except ImportError as e:  # pragma: no cover
        raise RuntimeError("reportlab is required for PDF reports") from e

    f = _report_fields(report)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    y = H - 25 * mm

    c.setFillColor(colors.HexColor("#111111"))
    c.setFont("Helvetica-Bold", 20)
    c.drawString(20 * mm, y, (lms_name.strip() or "Progress Report"))
    y -= 9 * mm
    c.setFont("Helvetica", 12)
    c.setFillColor(colors.HexColor("#444444"))
    c.drawString(20 * mm, y, f"{f['name']}" + (f"  •  {f['standard']}" if f["standard"] else ""))
    if f["student_code"]:
        c.drawRightString(W - 20 * mm, y, f"ID: {f['student_code']}")
    y -= 4 * mm
    c.setStrokeColor(colors.HexColor("#EBEAE7"))
    c.line(20 * mm, y, W - 20 * mm, y)
    y -= 12 * mm

    # KPI row
    kpis = []
    if f["attendance_pct"] is not None:
        kpis.append(("Attendance", f"{f['attendance_pct']}%"))
    if f["avg_score"] is not None:
        kpis.append(("Avg score", f"{f['avg_score']}%"))
    if f["rank"] and f["total_students"]:
        kpis.append(("Class rank", f"{f['rank']}/{f['total_students']}"))
    x = 20 * mm
    for label, value in kpis:
        c.setFont("Helvetica-Bold", 18)
        c.setFillColor(colors.HexColor("#111111"))
        c.drawString(x, y, value)
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor("#888888"))
        c.drawString(x, y - 6 * mm, label)
        x += 55 * mm
    y -= 18 * mm

    def section(title):
        nonlocal y
        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(colors.HexColor("#111111"))
        c.drawString(20 * mm, y, title)
        y -= 7 * mm

    if f["radar"]:
        section("Subjects")
        c.setFont("Helvetica", 11)
        c.setFillColor(colors.HexColor("#333333"))
        for s in f["radar"]:
            if y < 25 * mm:
                c.showPage(); y = H - 25 * mm
            c.drawString(24 * mm, y, f"{s.get('subject', '')}")
            c.drawRightString(W - 24 * mm, y, f"{s.get('test_avg', 0)}% avg")
            y -= 6 * mm
        y -= 4 * mm

    if f["recent_tests"]:
        section("Recent tests")
        c.setFont("Helvetica", 11)
        c.setFillColor(colors.HexColor("#333333"))
        for t in f["recent_tests"]:
            if y < 25 * mm:
                c.showPage(); y = H - 25 * mm
            c.drawString(24 * mm, y, f"{t.get('test_title', 'Test')}")
            c.drawRightString(W - 24 * mm, y, f"{t.get('score_pct', 0)}%")
            y -= 6 * mm

    c.showPage()
    c.save()
    return buf.getvalue()


def build_report_image(report: dict, lms_name: str = "") -> bytes:
    """Render the report as a PNG card (Pillow)."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as e:  # pragma: no cover
        raise RuntimeError("Pillow is required for image reports") from e

    f = _report_fields(report)
    W, H = 800, 1000
    img = Image.new("RGB", (W, H), "#FAFAF9")
    d = ImageDraw.Draw(img)

    def font(size, bold=False):
        try:
            name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
            return ImageFont.truetype(name, size)
        except Exception:
            return ImageFont.load_default()

    pad = 48
    y = pad
    d.text((pad, y), (lms_name.strip() or "Progress Report"), fill="#111111", font=font(40, True))
    y += 56
    subtitle = f["name"] + (f"  •  {f['standard']}" if f["standard"] else "")
    d.text((pad, y), subtitle, fill="#555555", font=font(24))
    y += 44
    d.line([(pad, y), (W - pad, y)], fill="#EBEAE7", width=2)
    y += 36

    kpis = []
    if f["attendance_pct"] is not None:
        kpis.append(("Attendance", f"{f['attendance_pct']}%"))
    if f["avg_score"] is not None:
        kpis.append(("Avg score", f"{f['avg_score']}%"))
    if f["rank"] and f["total_students"]:
        kpis.append(("Rank", f"{f['rank']}/{f['total_students']}"))
    x = pad
    for label, value in kpis:
        d.text((x, y), value, fill="#111111", font=font(40, True))
        d.text((x, y + 50), label, fill="#888888", font=font(20))
        x += 250
    y += 120

    def section(title):
        nonlocal y
        d.text((pad, y), title, fill="#111111", font=font(26, True))
        y += 42

    if f["radar"]:
        section("Subjects")
        for s in f["radar"]:
            d.text((pad + 16, y), s.get("subject", ""), fill="#333333", font=font(22))
            val = f"{s.get('test_avg', 0)}% avg"
            d.text((W - pad - d.textlength(val, font=font(22)), y), val, fill="#333333", font=font(22))
            y += 34
        y += 24

    if f["recent_tests"]:
        section("Recent tests")
        for t in f["recent_tests"]:
            d.text((pad + 16, y), t.get("test_title", "Test"), fill="#333333", font=font(22))
            val = f"{t.get('score_pct', 0)}%"
            d.text((W - pad - d.textlength(val, font=font(22)), y), val, fill="#333333", font=font(22))
            y += 34

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
