"""Fixed parent-notification message templates for the Udaya LMS.

These are plain, fully-rendered text bodies (no provider {Named Tag} variables) —
each builder fills the placeholders here and returns a finished string. The router
then hands the string to the existing `_wa_send_and_log()` pipeline as a freeform
message, so logging / cost / opt-out behaviour is identical to every other send.

Subject scores in the report card come from the student's real `subject_radar`
(matched by name), falling back to a dash when a subject isn't present, so the
fixed template stays faithful but never invents data.
"""
from typing import Optional


SIGNATURE = "— Udaya LMS"


def _fmt(val, suffix: str = "", dash: str = "—") -> str:
    """Render a value, or a dash when it's missing/blank."""
    if val is None or val == "":
        return dash
    return f"{val}{suffix}"


def _subject_score(radar: list, *names: str, dash: str = "—") -> str:
    """Find a subject's average in the report radar by (case-insensitive) name.

    `subject_radar` entries look like {"subject": "Mathematics", "test_avg": 82, ...}.
    Accepts a few aliases (e.g. "Maths" for "Mathematics") and returns "82%".
    """
    wanted = {n.strip().lower() for n in names}
    for s in radar or []:
        subj = str(s.get("subject") or "").strip().lower()
        if subj in wanted:
            avg = s.get("test_avg")
            return _fmt(avg, "%", dash) if avg is not None else dash
    return dash


def report_card(*, parent_name: str, student_name: str, term: str,
                radar: list, attendance, grade, pdf_url: str) -> str:
    """REPORT CARD template. `radar` is the report's subject_radar list."""
    maths = _subject_score(radar, "Mathematics", "Maths", "Math")
    science = _subject_score(radar, "Science")
    english = _subject_score(radar, "English")
    return (
        f"Hello {parent_name},\n\n"
        f"📊 *{student_name}'s Report Card — {term}*\n\n"
        f"Mathematics: {maths}\n"
        f"Science: {science}\n"
        f"English: {english}\n"
        f"Attendance: {_fmt(attendance, '%')}\n"
        f"Overall Grade: {_fmt(grade)}\n\n"
        f"View full report: {pdf_url}\n\n"
        f"{SIGNATURE}"
    )


def attendance_alert(*, parent_name: str, student_name: str, date: str,
                     attendance) -> str:
    """ATTENDANCE ALERT template (sent when a student is absent)."""
    return (
        f"Hello {parent_name},\n\n"
        f"⚠️ *Attendance Alert*\n\n"
        f"{student_name} was absent today ({date}).\n"
        f"Current attendance: {_fmt(attendance, '%')}\n\n"
        f"Please contact us if needed.\n"
        f"{SIGNATURE}"
    )


def exam_result(*, parent_name: str, student_name: str, subject: str,
                score, total, grade) -> str:
    """EXAM RESULT template."""
    return (
        f"Hello {parent_name},\n\n"
        f"📝 *Exam Result*\n\n"
        f"Student: {student_name}\n"
        f"Subject: {_fmt(subject)}\n"
        f"Score: {_fmt(score)}/{_fmt(total)}\n"
        f"Grade: {_fmt(grade)}\n\n"
        f"{SIGNATURE}"
    )


def fee_reminder(*, parent_name: str, student_name: str, amount, date: str) -> str:
    """FEE REMINDER template."""
    return (
        f"Hello {parent_name},\n\n"
        f"💰 *Fee Reminder*\n\n"
        f"Student: {student_name}\n"
        f"Amount due: ₹{_fmt(amount)}\n"
        f"Due date: {_fmt(date)}\n\n"
        f"{SIGNATURE}"
    )


def broadcast(*, parent_name: str, message: str) -> str:
    """BROADCAST template (a teacher's free message to all parents)."""
    return (
        f"Hello {parent_name},\n\n"
        f"📢 *Message from Udaya LMS*\n\n"
        f"{message}\n\n"
        f"{SIGNATURE}"
    )
