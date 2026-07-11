# PDF → Test Generator (Groq AI)

> Future feature. Read this before starting implementation.
> Plugs into the existing `NewTestModal` + `POST /api/tests/with-questions` — no DB schema changes needed.

---

## What It Does

Teacher uploads a PDF (textbook chapter, notes, past paper) → AI reads it → generates MCQ questions pre-filled into the existing test editor → teacher reviews/edits → saves normally.

---

## Provider: Groq API

| | |
|---|---|
| Cost | Free |
| Credit card | Not required |
| Free tier | 14,400 requests/day |
| Model | `llama-3.3-70b-versatile` |
| Sign up | https://console.groq.com |
| Docs | https://console.groq.com/docs/openai |

**Why Groq over others:** Free, no card, fast inference (~200 tokens/sec), Llama 3.3 70B is strong enough for MCQ generation from educational content. Gemini is the next-best free alternative (natively reads PDFs but needs Google account).

---

## Implementation Plan

### 1. Backend packages

```bash
pip install pdfplumber groq
```

Add to `backend/requirements.txt`:
```
pdfplumber
groq
```

### 2. Backend `.env` — add one variable

```env
GROQ_API_KEY=gsk_...
```

### 3. New endpoint — `POST /api/tests/generate-from-pdf`

Add to `backend/main.py` near the existing test routes (~line 6793).

**Request:** `multipart/form-data`
- `file` — PDF file (no application-level size cap; images remain capped at 10 MB)
- `num_questions` — integer, how many MCQs to generate (default 10)
- `subject_hint` — optional string (e.g. "Mathematics", "Physics") — improves relevance

**Response:**
```json
{
  "questions": [
    {
      "question": "What is Newton's second law?",
      "options": ["F = ma", "F = mv", "F = m/a", "F = a/m"],
      "correct_idx": 0,
      "order_num": 1
    }
  ],
  "page_count": 12,
  "chars_extracted": 4821
}
```

**Logic (pseudocode):**
```python
@app.post("/api/tests/generate-from-pdf")
async def generate_test_from_pdf(
    file: UploadFile = File(...),
    num_questions: int = Form(10),
    subject_hint: str = Form(""),
    user = Depends(verify_token)
):
    if user["role"] != "teacher":
        raise HTTPException(403, "Teacher only")

    # 1. Extract text
    pdf_bytes = await file.read()
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    text = text[:12000]  # cap to ~3000 tokens context

    if len(text.strip()) < 100:
        raise HTTPException(400, "Could not extract readable text from this PDF")

    # 2. Call Groq
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    prompt = f"""
You are a teacher creating a multiple-choice question paper.
Subject hint: {subject_hint or "general"}

From the content below, generate exactly {num_questions} MCQ questions.
Rules:
- Each question must have exactly 4 options (A/B/C/D)
- Exactly one option is correct
- Options must be plausible (no obviously wrong answers)
- Base questions strictly on the provided content

Return ONLY valid JSON, no explanation:
{{
  "questions": [
    {{
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correct_idx": 0
    }}
  ]
}}

Content:
{text}
"""
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        response_format={"type": "json_object"}
    )

    # 3. Parse and return
    result = json.loads(response.choices[0].message.content)
    questions = result.get("questions", [])
    for i, q in enumerate(questions):
        q["order_num"] = i + 1
        q["correct_idx"] = int(q.get("correct_idx", 0))

    return {"questions": questions, "page_count": len(pdf.pages), "chars_extracted": len(text)}
```

### 4. Frontend — `frontend/src/lib/api.js`

Add to the `testApi` object:

```js
generateFromPdf: async (file, numQuestions = 10, subjectHint = '') => {
  const token = localStorage.getItem('tutoria_token');
  const form = new FormData();
  form.append('file', file);
  form.append('num_questions', numQuestions);
  form.append('subject_hint', subjectHint);
  const res = await fetch(`${API_URL}/tests/generate-from-pdf`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error((await res.json()).detail || 'Generation failed');
  return res.json();
},
```

### 5. Frontend — `NewTestModal.jsx` changes

**Where to add:** Step 2 (questions editor), above the questions list.

Add a "Generate from PDF" section:
- A file input (`accept=".pdf"`)
- A number input for question count (default 10, range 5–30)
- A "Generate" button — shows spinner while loading
- On success: call `setQuestions(data.questions)` to replace/merge into editor
- On error: show inline error message

**State to add:**
```js
const [pdfFile, setPdfFile] = useState(null);
const [pdfCount, setPdfCount] = useState(10);
const [pdfLoading, setPdfLoading] = useState(false);
const [pdfError, setPdfError] = useState('');
```

**Handler:**
```js
const handleGenerateFromPdf = async () => {
  if (!pdfFile) return;
  setPdfLoading(true);
  setPdfError('');
  try {
    const data = await testApi.generateFromPdf(pdfFile, pdfCount, title);
    const mapped = data.questions.map((q, i) => ({
      id: Date.now() + i,
      question: q.question,
      options: q.options,
      correct_idx: q.correct_idx,
      order_num: q.order_num,
    }));
    setQuestions(mapped);
  } catch (err) {
    setPdfError(err.message || 'Failed to generate questions');
  } finally {
    setPdfLoading(false);
  }
};
```

---

## UI Placement in NewTestModal

```
Step 2: Questions
┌─────────────────────────────────────────┐
│  Generate from PDF  (collapsible/card)  │
│  [Choose PDF file...]  [10 questions ▾] │
│  [Generate Questions]                   │
│  ─────────────────────────────────────  │
│  Q1. ________________________________   │
│      (A) ___  (B) ___  (C) ___  (D)___ │
│  Q2. ...                                │
│  [+ Add Question]                       │
└─────────────────────────────────────────┘
```

- Generated questions replace current list (with a confirm if list is non-empty)
- Teacher can still add/edit/delete questions after generation
- Save flow is unchanged — still hits `POST /api/tests/with-questions`

---

## Edge Cases to Handle

| Case | Handling |
|------|----------|
| Scanned PDF (image-only, no text) | pdfplumber returns empty → return 400 "Could not extract text" |
| Large PDF | Spool to disk and process without an application-level size rejection |
| Groq rate limit hit | Return 429 with "AI service busy, try again" |
| Groq returns malformed JSON | Wrap parse in try/catch → return 500 |
| PDF has < 100 chars of text | Return 400 before hitting Groq |
| `GROQ_API_KEY` not set | Return 503 "AI generation not configured" |
| Generated `correct_idx` out of range | Clamp to 0 |

---

## Files to Touch

| File | Change |
|------|--------|
| `backend/requirements.txt` | Add `pdfplumber`, `groq` |
| `backend/.env` | Add `GROQ_API_KEY` |
| `backend/main.py` | Add `POST /api/tests/generate-from-pdf` endpoint |
| `frontend/src/lib/api.js` | Add `testApi.generateFromPdf()` |
| `frontend/src/components/teacher/NewTestModal.jsx` | Add PDF upload UI + handler in Step 2 |

No DB schema changes. No new tables.

---

## Testing Checklist

- [ ] Upload a 2-page textbook PDF → questions appear in editor
- [ ] Upload a scanned/image PDF → shows "Could not extract text" error
- [ ] Upload a past question paper → questions parsed correctly
- [ ] Edit a generated question before saving → saves the edited version
- [ ] Save the test → verifies via `GET /api/tests/{id}/edit` that questions are stored
- [ ] No `GROQ_API_KEY` set → endpoint returns 503, not a crash
- [ ] Generate 5 questions, add 2 manually, save → all 7 stored

---

*Added: July 2026 | Stack: pdfplumber + Groq Llama 3.3 70B | Provider: Groq free tier*
