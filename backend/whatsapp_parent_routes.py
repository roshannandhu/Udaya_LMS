"""Parent WhatsApp notification endpoints (additive, official pipeline).

These routes send report cards, attendance alerts, exam results, bulk reports and
broadcasts to a student's PARENT (students.parent_phone), reusing the existing
Meta/WANotifier send pipeline in main.py — `_wa_send_and_log()`, the background
batch helpers, opt-out handling, cost + whatsapp_messages logging — so nothing is
duplicated. main.py declares all `_wa_*` helpers (and `verify_token`) before it
includes this router, so we lazy-import main inside the auth dependency and each
handler to avoid a circular import at load time.

Transport is pluggable via `whatsapp.get_provider()`. When the active provider is
`baileys`, sends route through the Node microservice (whatsapp-service/) over
`whatsapp_client`; this module also surfaces that service's live connection + QR in
`/status`, lets the teacher switch it on via `/enable-baileys`, and buffers sends to
`whatsapp_outbox.json` when the Node service is briefly unreachable. See
README-WHATSAPP.md.
"""
import asyncio
import os
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

import whatsapp as wa
import parent_templates as T

router = APIRouter(prefix="/api/whatsapp", tags=["parent-whatsapp"])


# ── Auth (lazy — verify_token lives in main, imported at request time) ──────────
def current_teacher(authorization: Optional[str] = Header(None)) -> dict:
    import main
    user = main.verify_token(authorization)
    if user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teacher only")
    if not main.service_supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    return user


# ── Config / small helpers ─────────────────────────────────────────────────────
def _daily_limit() -> int:
    try:
        return max(0, int(os.getenv("DAILY_MESSAGE_LIMIT", "50")))
    except (TypeError, ValueError):
        return 50


def normalize_in(raw: Optional[str]) -> str:
    """Normalise an Indian phone number to digits-with-country-code (e.g. 9198…).
    Auto-prepends 91 for a bare 10-digit number; strips a leading 0 / +."""
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        return ""
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        digits = "91" + digits
    return digits


def _grade(pct) -> str:
    """A simple letter grade from a percentage (mirrors common Indian banding)."""
    try:
        p = float(pct)
    except (TypeError, ValueError):
        return ""
    if p >= 90:
        return "A+"
    if p >= 80:
        return "A"
    if p >= 70:
        return "B"
    if p >= 60:
        return "C"
    if p >= 40:
        return "D"
    return "E"


def _today_count(main, teacher_id: str) -> int:
    """Number of whatsapp_messages this teacher has logged today (UTC)."""
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        rows = main.service_supabase.table("whatsapp_messages").select(
            "id, created_at").eq("teacher_id", teacher_id).gte(
            "created_at", start.isoformat()).execute().data or []
        return len(rows)
    except Exception:
        return 0


def _enforce_daily_cap(main, teacher_id: str):
    limit = _daily_limit()
    if limit and _today_count(main, teacher_id) >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily WhatsApp limit reached ({limit}). Try again tomorrow "
                   f"or raise DAILY_MESSAGE_LIMIT.")


def _teacher_standard_ids(main, teacher_id: str) -> set:
    rows = main.service_supabase.table("standards").select("id").eq(
        "teacher_id", teacher_id).execute().data or []
    return {r["id"] for r in rows}


def _load_student_for_teacher(main, teacher_id: str, student_id: str) -> dict:
    """Fetch a student and verify it belongs to one of this teacher's standards."""
    res = main.service_supabase.table("students").select(
        "id, name, parent_phone, standard_id, whatsapp_opt_out, attendance_pct, avg_score"
    ).eq("id", student_id).single().execute()
    s = res.data
    if not s:
        raise HTTPException(status_code=404, detail="Student not found")
    if s.get("standard_id") not in _teacher_standard_ids(main, teacher_id):
        raise HTTPException(status_code=403, detail="Not your student")
    return s


def _parent_recipient(student: dict, standard_name: str = "") -> Optional[dict]:
    """Build the recipient dict `_wa_send_and_log` expects, addressed to the PARENT.
    Returns None when the parent can't/shouldn't be messaged (opted out / no phone)."""
    if student.get("whatsapp_opt_out"):
        return None
    phone = normalize_in(student.get("parent_phone")) or normalize_in(student.get("phone"))
    if not phone:
        return None
    return {
        "id": student["id"],
        "name": student.get("name") or "",
        "phone": phone,
        "standard_id": student.get("standard_id"),
        "standard_name": standard_name,
        "attendance_pct": student.get("attendance_pct") or 0,
        "avg_score": student.get("avg_score") or 0,
    }


def _resolve_parents(main, teacher_id: str, standard_id: str) -> list:
    """All messageable parents in one of the teacher's standards."""
    if standard_id not in _teacher_standard_ids(main, teacher_id):
        raise HTTPException(status_code=403, detail="Not your standard")
    std = main.service_supabase.table("standards").select("name").eq(
        "id", standard_id).single().execute().data or {}
    std_name = std.get("name") or ""
    students = main.service_supabase.table("students").select(
        "id, name, parent_phone, standard_id, whatsapp_opt_out, attendance_pct, avg_score"
    ).eq("standard_id", standard_id).execute().data or []
    out = []
    for s in students:
        r = _parent_recipient(s, std_name)
        if r:
            out.append(r)
    return out


# ── Report-card builder (shared by single + bulk) ──────────────────────────────
async def _send_report_card(main, provider, teacher_id, user, student, term,
                            standard_name="", batch_id=None):
    recip = _parent_recipient(student, standard_name)
    if not recip:
        return {"student_id": student.get("id"), "status": "skipped",
                "error": "no parent_phone or opted out", "cost": 0}

    report = main.get_student_report_v2(student["id"], "overall", user)
    fields = wa._report_fields(report)
    lms = main._wa_branding_name()

    pdf_url = ""
    try:
        pdf = await asyncio.to_thread(wa.build_report_pdf, report, lms, None)
        pdf_url = await main._wa_upload_bytes(pdf, ".pdf", "application/pdf")
    except Exception as e:
        print(f"[parent-wa] report PDF build/upload failed for {student['id']}: {e}")

    body = T.report_card(
        parent_name="Parent",
        student_name=fields.get("name") or recip["name"] or "your child",
        term=term,
        radar=report.get("subject_radar") or [],
        attendance=fields.get("attendance_pct"),
        grade=_grade(fields.get("avg_score")),
        pdf_url=pdf_url or "(report unavailable)",
    )
    res = await main._wa_send_and_log(
        provider, teacher_id, recip, mode="freeform", body_text=body,
        media_url=pdf_url or None, media_type="application/pdf" if pdf_url else None,
        category="utility", standard_id=recip["standard_id"])
    main._wa_batch_track(batch_id, res)
    return res


# ── Request bodies (all-optional → path endpoints work with no body too) ────────
class ReportBody(BaseModel):
    term: Optional[str] = None


class AttendanceBody(BaseModel):
    date: Optional[str] = None


class BulkReportsBody(BaseModel):
    standard_id: str
    term: Optional[str] = None


class BroadcastBody(BaseModel):
    standard_id: str
    message: str


# ── Endpoints ──────────────────────────────────────────────────────────────────
@router.post("/send-report/{student_id}")
async def send_report(student_id: str, body: Optional[ReportBody] = None,
                      user=Depends(current_teacher)):
    import main
    _enforce_daily_cap(main, user["teacher_id"])
    student = _load_student_for_teacher(main, user["teacher_id"], student_id)
    term = (body.term if body else None) or datetime.now().strftime("%B %Y")
    provider = wa.get_provider()
    res = await _send_report_card(main, provider, user["teacher_id"], user, student, term)
    return {"result": res, "configured": provider.configured}


@router.post("/send-attendance-alert/{student_id}")
async def send_attendance_alert(student_id: str, body: Optional[AttendanceBody] = None,
                                user=Depends(current_teacher)):
    import main
    _enforce_daily_cap(main, user["teacher_id"])
    student = _load_student_for_teacher(main, user["teacher_id"], student_id)
    recip = _parent_recipient(student)
    if not recip:
        raise HTTPException(status_code=400, detail="Parent has no phone or opted out")
    date = (body.date if body else None) or datetime.now().strftime("%d %b %Y")
    provider = wa.get_provider()
    body_text = T.attendance_alert(
        parent_name="Parent", student_name=recip["name"] or "your child",
        date=date, attendance=student.get("attendance_pct"))
    res = await main._wa_send_and_log(
        provider, user["teacher_id"], recip, mode="freeform", body_text=body_text,
        category="utility", standard_id=recip["standard_id"])
    return {"result": res, "configured": provider.configured}


@router.post("/send-exam-result/{exam_id}/{student_id}")
async def send_exam_result(exam_id: str, student_id: str,
                           user=Depends(current_teacher)):
    import main
    _enforce_daily_cap(main, user["teacher_id"])
    student = _load_student_for_teacher(main, user["teacher_id"], student_id)
    recip = _parent_recipient(student)
    if not recip:
        raise HTTPException(status_code=400, detail="Parent has no phone or opted out")

    # Exam meta (title, total, subject) + this student's attempt.
    test = main.service_supabase.table("tests").select(
        "id, title, total_marks, class_id").eq("id", exam_id).single().execute().data
    if not test:
        raise HTTPException(status_code=404, detail="Exam not found")
    subject = ""
    if test.get("class_id"):
        sc = main.service_supabase.table("subject_classes").select("name").eq(
            "id", test["class_id"]).single().execute().data or {}
        subject = sc.get("name") or ""
    attempt = (main.service_supabase.table("test_attempts").select("score").eq(
        "test_id", exam_id).eq("student_id", student_id).limit(1).execute().data or [])
    if not attempt:
        raise HTTPException(status_code=404, detail="No attempt for this student/exam")
    score = attempt[0].get("score")
    total = test.get("total_marks")
    pct = (float(score) / float(total) * 100) if score is not None and total else None

    provider = wa.get_provider()
    body_text = T.exam_result(
        parent_name="Parent", student_name=recip["name"] or "your child",
        subject=subject or test.get("title") or "", score=score, total=total,
        grade=_grade(pct))
    # test_id ties into the existing exam-result dedup (12h window + test_id column).
    res = await main._wa_send_and_log(
        provider, user["teacher_id"], recip, mode="freeform", body_text=body_text,
        category="utility", standard_id=recip["standard_id"], test_id=exam_id)
    return {"result": res, "configured": provider.configured}


@router.post("/send-bulk-reports")
async def send_bulk_reports(body: BulkReportsBody, user=Depends(current_teacher)):
    import main
    _enforce_daily_cap(main, user["teacher_id"])
    teacher_id = user["teacher_id"]
    recips = _resolve_parents(main, teacher_id, body.standard_id)
    if not recips:
        raise HTTPException(status_code=400, detail="No parents with a phone number")
    term = body.term or datetime.now().strftime("%B %Y")
    provider = wa.get_provider()
    std_name = recips[0].get("standard_name") or ""

    # Re-fetch full student rows for the report builder (recips are trimmed).
    ids = [r["id"] for r in recips]
    rows = main.service_supabase.table("students").select(
        "id, name, parent_phone, standard_id, whatsapp_opt_out, attendance_pct, avg_score"
    ).in_("id", ids).execute().data or []
    students = {s["id"]: s for s in rows}

    async def run(batch_id=None):
        results = []
        for r in recips:
            try:
                s = students.get(r["id"])
                if not s:
                    continue
                res = await _send_report_card(main, provider, teacher_id, user, s, term,
                                              std_name, batch_id)
                results.append(res)
            except Exception as e:
                print(f"[wa] skipping report for {r.get('id')}: {e}")
                err_res = {"student_id": r.get("id"), "status": "failed", "error": f"Internal error: {str(e)}"}
                results.append(err_res)
                main._wa_batch_track(batch_id, err_res)
        return results

    if len(recips) > main.WA_BATCH_THRESHOLD:
        batch_id = main._wa_new_batch(len(recips), "parent-reports")
        asyncio.create_task(main._wa_run_batch(run, batch_id))
        return {"queued": True, "batch_id": batch_id, "total": len(recips),
                "configured": provider.configured}

    results = await run()
    sent = sum(1 for x in results if x["status"] not in ("failed", "not_configured", "skipped"))
    return {"results": results, "sent": sent,
            "total_cost": round(sum(x.get("cost") or 0 for x in results), 2),
            "configured": provider.configured}


@router.post("/send-broadcast-to-parents")
async def send_broadcast_to_parents(body: BroadcastBody, user=Depends(current_teacher)):
    import main
    _enforce_daily_cap(main, user["teacher_id"])
    teacher_id = user["teacher_id"]
    if not (body.message or "").strip():
        raise HTTPException(status_code=400, detail="Message is empty")
    recips = _resolve_parents(main, teacher_id, body.standard_id)
    if not recips:
        raise HTTPException(status_code=400, detail="No parents with a phone number")
    provider = wa.get_provider()

    async def run(batch_id=None):
        results = []
        for r in recips:
            try:
                text = T.broadcast(parent_name="Parent", message=body.message.strip())
                res = await main._wa_send_and_log(
                    provider, teacher_id, r, mode="freeform", body_text=text,
                    category="utility", standard_id=r["standard_id"])
                main._wa_batch_track(batch_id, res)
                results.append(res)
            except Exception as e:
                print(f"[wa] skipping broadcast for {r.get('id')}: {e}")
                err_res = {"student_id": r.get("id"), "status": "failed", "error": f"Internal error: {str(e)}"}
                results.append(err_res)
                main._wa_batch_track(batch_id, err_res)
        return results

    if len(recips) > main.WA_BATCH_THRESHOLD:
        batch_id = main._wa_new_batch(len(recips), "parent-broadcast")
        asyncio.create_task(main._wa_run_batch(run, batch_id))
        return {"queued": True, "batch_id": batch_id, "total": len(recips),
                "configured": provider.configured}

    results = await run()
    sent = sum(1 for x in results if x["status"] not in ("failed", "not_configured"))
    return {"results": results, "sent": sent,
            "total_cost": round(sum(x.get("cost") or 0 for x in results), 2),
            "configured": provider.configured}


@router.get("/status")
async def status(user=Depends(current_teacher)):
    import main
    teacher_id = user["teacher_id"]
    cfg = wa.get_wa_config()

    # Queue length: messages still in-flight across running batches.
    queue_length = 0
    for b in main._wa_batches.values():
        if not b.get("done"):
            queue_length += max(0, (b.get("total") or 0) - (b.get("sent") or 0) - (b.get("failed") or 0))

    recent = []
    try:
        rows = main.service_supabase.table("whatsapp_messages").select(
            "to_phone, template_name, body_text, status, created_at").eq(
            "teacher_id", teacher_id).order("created_at", desc=True).limit(20).execute().data or []
        for r in rows:
            body = (r.get("body_text") or "").replace("\n", " ")
            recent.append({
                "to_phone": r.get("to_phone"),
                "template_name": r.get("template_name"),
                "preview": (body[:80] + "…") if len(body) > 80 else body,
                "status": r.get("status"),
                "created_at": r.get("created_at"),
            })
    except Exception as e:
        print(f"[parent-wa] recent fetch failed: {e}")

    provider = (cfg.get("provider") or "").lower()
    out = {
        "connected": main._wa_is_configured(cfg),
        "provider": provider,
        "qr": None,
        "today_count": _today_count(main, teacher_id),
        "daily_limit": _daily_limit(),
        "queue_length": queue_length,
        "warmup_limit": None,
        "recent": recent,
    }

    # Baileys transport: overlay the Node service's live connection + QR + counters.
    if provider == "baileys":
        import whatsapp_client as client
        try:
            svc = await client.status()
            out["connected"] = bool(svc.get("connected"))
            out["qr"] = svc.get("qr")  # data-URL while pairing, else null
            out["today_count"] = svc.get("today_count", out["today_count"])
            out["queue_length"] = svc.get("queue_length", out["queue_length"])
            out["warmup_limit"] = svc.get("warmup_limit")
        except client.ServiceDownError:
            out["connected"] = False
            out["service_down"] = True
        except Exception as e:
            print(f"[parent-wa] baileys status failed: {e}")
            out["connected"] = False
    return out


# ── Baileys: enable + connection ────────────────────────────────────────────────
@router.post("/enable-baileys")
async def enable_baileys(user=Depends(current_teacher)):
    """Switch the active WhatsApp provider to the Baileys transport so the QR
    pairing flow + parent sends route through the Node microservice."""
    import whatsapp_client as client
    if not client.is_enabled():
        raise HTTPException(
            status_code=503,
            detail="WHATSAPP_SERVICE_URL is not set — the Baileys service isn't wired up.")
    cfg = wa.get_wa_config()
    cfg["provider"] = "baileys"
    wa.save_wa_config(cfg)
    return {"success": True, "provider": "baileys"}


# Node-down buffering lives in whatsapp_outbox.py: BaileysProvider appends there
# when the microservice is briefly unreachable, and a background loop drains it
# once /health recovers. Nothing else to wire here.
