# Remove Student from Standard — Design Spec

**Date:** 2026-06-10  
**Status:** Approved

---

## Problem

The current "Remove from standard" menu action in `StudentDetailPage` calls `DELETE /api/students/{id}`, which permanently destroys the student's DB row and Supabase Auth account. The label is misleading — teachers expect "remove from standard" to mean unenroll, not account deletion. There is no safe way to kick a student out of a class without wiping all their data.

---

## Goal

Add a true **unenroll** action: sets `students.standard_id = NULL`, preserves account and all historical data (scores, attendance, test attempts, video progress). The existing hard-delete remains for permanent removal.

---

## Backend

### New endpoint

```
PATCH /api/students/{student_id}/unenroll
```

- **Auth:** teacher only (`verify_token`)
- **Action:**
  1. Set `students.standard_id = NULL` for `student_id`
  2. Delete row from `student_sessions` for `student_id` (force-logout the device)
- **Response:** `{"message": "Student unenrolled"}`
- **Errors:** 403 if not teacher, 503 if no DB

### Existing endpoint unchanged

`DELETE /api/students/{student_id}` — full hard-delete (DB row + auth account). No changes.

---

## Frontend — `StudentDetailPage`

### Overflow menu (currently one destructive item)

Split into two distinct destructive actions:

```
[Message standard]
[Reset password]
[View password]
[Block / Unblock student]
─────────────────────────
[Remove from standard]    ← NEW: amber warning color (unenroll)
[Delete student]          ← EXISTING: red danger color (hard delete)
```

### New state

Add `confirmUnenroll` boolean state (mirrors existing `confirmRemove`).

### Unenroll confirmation modal

Title: **Remove from standard?**  
Body:  
> Remove **{name}** from **{standard.name}**?  
> They'll lose access to all subjects. Their account and history are preserved.

Actions: `[Cancel]` `[Remove from standard]` (amber/warning button)

### After unenroll

- Navigate back to `/teacher/students`
- Show existing "removed" success screen with updated copy:
  - Heading: `{name} removed from {standard.name}`
  - Sub: `Their account is preserved. You can re-enroll them from any standard.`

### Rename existing action

The existing "Remove from standard" menu item becomes **"Delete student"** (red, `Trash2` icon), matching the actual behavior.

### Cache invalidation

After unenroll: call `useAppCache.getState().invalidateStudents()` and `refreshStudents()` so the list reflects the change immediately.

---

## Files changed

| File | Change |
|------|--------|
| `backend/main.py` | Add `PATCH /api/students/{id}/unenroll` endpoint |
| `frontend/src/pages/teacher/StudentDetailPage.jsx` | Add unenroll state + modal, rename delete action, split menu |

No schema changes — `students.standard_id` is already nullable.

---

## Out of scope

- Re-enroll / transfer flow (teacher can edit the student and set a new standard via the edit form)
- Bulk unenroll
- Student notification on unenroll
