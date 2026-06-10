# Remove Student from Standard (Unenroll) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe "Remove from standard" unenroll action that sets `students.standard_id = NULL` (preserving account + history) and splits it from the existing hard-delete in the teacher's student detail page.

**Architecture:** One new backend endpoint (`PATCH /api/students/{id}/unenroll`) nullifies `standard_id` and clears the device session. The frontend splits the overflow menu into two actions — "Remove from standard" (unenroll, amber) and "Delete student" (hard-delete, red) — each with its own confirmation modal.

**Tech Stack:** FastAPI (Python) · Supabase service client · React 18 · Tailwind CSS

---

## File Map

| File | Change |
|------|--------|
| `backend/main.py` | Add `PATCH /api/students/{id}/unenroll` after line 3122 |
| `frontend/src/pages/teacher/StudentDetailPage.jsx` | Add unenroll state + modal; rename delete action; split menu |

---

### Task 1: Backend — unenroll endpoint

**Files:**
- Modify: `backend/main.py:3122` (insert after `delete_student`)

- [ ] **Step 1: Add the endpoint immediately after `delete_student` (after line 3122)**

Open `backend/main.py`. After the closing `return {"message": "Student deleted"}` of `delete_student`, insert:

```python
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
```

- [ ] **Step 2: Verify the server starts without errors**

```bash
cd backend
uvicorn main:app --reload --port 8001
```

Expected: `Application startup complete.` with no import/syntax errors. Stop with Ctrl+C.

- [ ] **Step 3: Smoke-test the endpoint in Swagger**

Visit `http://localhost:8001/docs`, find `PATCH /api/students/{student_id}/unenroll`, and confirm it appears with the correct path. (Actual auth test happens after the frontend is wired up.)

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat: add PATCH /api/students/{id}/unenroll endpoint"
```

---

### Task 2: Frontend — state + unenroll handler

**Files:**
- Modify: `frontend/src/pages/teacher/StudentDetailPage.jsx`

- [ ] **Step 1: Add `confirmUnenroll` state variable**

In `StudentDetailPage.jsx`, find the existing state block (around line 19):

```js
const [confirmRemove, setConfirmRemove] = useState(false);
const [removed, setRemoved] = useState(false);
```

Add one new line directly below `confirmRemove`:

```js
const [confirmRemove, setConfirmRemove] = useState(false);
const [confirmUnenroll, setConfirmUnenroll] = useState(false);
const [removed, setRemoved] = useState(false);
```

- [ ] **Step 2: Add the `handleUnenroll` function**

Find the existing `handleRemove` function (around line 178):

```js
const handleRemove = async () => {
  try {
    await apiClient(`/students/${studentId}`, { method: 'DELETE' });
    setRemoved(true);
    setConfirmRemove(false);
  } catch (err) {
    console.error(err);
  }
};
```

Add `handleUnenroll` directly after it:

```js
const handleUnenroll = async () => {
  try {
    await apiClient(`/students/${studentId}/unenroll`, { method: 'PATCH' });
    useAppCache.getState().invalidateStudents();
    useAppCache.getState().refreshStudents();
    setRemoved(true);
    setConfirmUnenroll(false);
  } catch (err) {
    console.error(err);
  }
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/teacher/StudentDetailPage.jsx
git commit -m "feat: add handleUnenroll state and handler in StudentDetailPage"
```

---

### Task 3: Frontend — split the overflow menu

**Files:**
- Modify: `frontend/src/pages/teacher/StudentDetailPage.jsx`

- [ ] **Step 1: Replace the single destructive menu item with two**

Find the existing single menu item (around line 278):

```jsx
<button onClick={() => { setConfirmRemove(true); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-left text-red-600"><Trash2 size={14} /> Remove from standard</button>
```

Replace it with:

```jsx
<button onClick={() => { setConfirmUnenroll(true); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 text-left text-amber-700"><ShieldOff size={14} /> Remove from standard</button>
<button onClick={() => { setConfirmRemove(true); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-left text-red-600"><Trash2 size={14} /> Delete student</button>
```

Note: `ShieldOff` is already imported at line 3. `Trash2` is also already imported.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/teacher/StudentDetailPage.jsx
git commit -m "feat: split overflow menu into unenroll and delete actions"
```

---

### Task 4: Frontend — unenroll confirmation modal

**Files:**
- Modify: `frontend/src/pages/teacher/StudentDetailPage.jsx`

- [ ] **Step 1: Add the unenroll confirmation modal**

Find the existing `confirmRemove` modal (around line 384):

```jsx
<Modal open={confirmRemove} onClose={() => setConfirmRemove(false)} title="Remove student?" size="sm">
  <p className="text-sm text-neutral-600 mb-2">Remove <strong>{s.name}</strong> from <strong>{standard?.name}</strong>?</p>
  <p className="text-sm text-neutral-600 mb-5">They'll lose access to all subjects.</p>
  <div className="flex gap-2 justify-end">
    <Btn variant="ghost" onClick={() => setConfirmRemove(false)}>Cancel</Btn>
    <Btn variant="dangerSolid" onClick={handleRemove}>Remove</Btn>
  </div>
</Modal>
```

Add the unenroll modal **directly before** that existing modal:

```jsx
<Modal open={confirmUnenroll} onClose={() => setConfirmUnenroll(false)} title="Remove from standard?" size="sm">
  <p className="text-sm text-neutral-600 mb-2">Remove <strong>{s.name}</strong> from <strong>{standard?.name}</strong>?</p>
  <p className="text-sm text-neutral-600 mb-5">They'll lose access to all subjects. Their account and history are preserved.</p>
  <div className="flex gap-2 justify-end">
    <Btn variant="ghost" onClick={() => setConfirmUnenroll(false)}>Cancel</Btn>
    <Btn variant="warningSolid" onClick={handleUnenroll}>Remove from standard</Btn>
  </div>
</Modal>
```

- [ ] **Step 2: Check if `warningSolid` variant exists in `ui.jsx`**

```bash
grep -n "warningSolid" frontend/src/components/ui.jsx
```

If it returns nothing, use `variant="default"` with a manual className instead:

```jsx
<Btn className="bg-amber-500 hover:bg-amber-600 text-white border-transparent" onClick={handleUnenroll}>Remove from standard</Btn>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/teacher/StudentDetailPage.jsx
git commit -m "feat: add unenroll confirmation modal in StudentDetailPage"
```

---

### Task 5: Frontend — update the "removed" success screen copy

**Files:**
- Modify: `frontend/src/pages/teacher/StudentDetailPage.jsx`

- [ ] **Step 1: Update the success screen to reflect unenroll context**

Find the `removed` success screen (around line 220):

```jsx
if (removed) {
  return (
    <div>
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate('/teacher/students')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-md"><ArrowLeft size={16} /></button>
          <h1 className="text-lg md:text-xl font-semibold">Student removed</h1>
        </div>
      </div>
      <div className="px-5 md:px-8 py-16 max-w-5xl mx-auto text-center">
        <CheckCircle2 size={32} className="mx-auto mb-3 text-green-500" />
        <h3 className="font-medium mb-1">{student?.name} has been removed</h3>
        <p className="text-sm text-neutral-500 mb-5">They no longer have access to {standard?.name}.</p>
        <Btn variant="primary" onClick={() => navigate('/teacher/students')}>Back to students</Btn>
      </div>
    </div>
  );
}
```

Replace entirely with:

```jsx
if (removed) {
  return (
    <div>
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate('/teacher/students')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-md"><ArrowLeft size={16} /></button>
          <h1 className="text-lg md:text-xl font-semibold">Done</h1>
        </div>
      </div>
      <div className="px-5 md:px-8 py-16 max-w-5xl mx-auto text-center">
        <CheckCircle2 size={32} className="mx-auto mb-3 text-green-500" />
        <h3 className="font-medium mb-1">{student?.name} removed from {standard?.name}</h3>
        <p className="text-sm text-neutral-500 mb-5">Their account and history are preserved.</p>
        <Btn variant="primary" onClick={() => navigate('/teacher/students')}>Back to students</Btn>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/teacher/StudentDetailPage.jsx
git commit -m "feat: update removed success screen to reflect unenroll context"
```

---

### Task 6: Manual end-to-end verification

- [ ] **Step 1: Start backend and frontend**

```bash
# Terminal 1
cd backend && uvicorn main:app --reload --port 8001

# Terminal 2
cd frontend && npm run dev
```

- [ ] **Step 2: Test unenroll flow**

1. Log in as teacher → Students → open any student detail page
2. Click `⋮` (overflow menu) — verify you see **two** destructive items: "Remove from standard" (amber) and "Delete student" (red)
3. Click "Remove from standard" → confirm the amber modal appears with correct name/standard and the copy "Their account and history are preserved"
4. Click "Remove from standard" in the modal
5. Verify success screen shows `{name} removed from {standard}` with the preserved-account message
6. Click "Back to students" — verify the student no longer shows up under that standard filter (or shows no standard tag)
7. Go to Supabase dashboard → Table Editor → `students` → find the student row — verify `standard_id` is `NULL` and the row still exists
8. Verify `student_sessions` row for that student is gone

- [ ] **Step 3: Test that "Delete student" still works**

1. Open a different student detail page
2. Click `⋮` → "Delete student" → confirm modal still appears
3. Confirm deletion — student row should be gone from `students` table and auth account deleted

- [ ] **Step 4: Final commit if any last tweaks needed, otherwise done**

```bash
git add -p  # stage any final tweaks
git commit -m "fix: unenroll feature final adjustments"
```
