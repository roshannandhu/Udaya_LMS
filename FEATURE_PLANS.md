# FEATURE_PLANS.md

> Planned features not yet built. Each section has full spec, DB changes, and implementation notes.
> Update status here when work begins. Add completed features to FEATURES_STATUS.md.

---

## Status Legend
| Symbol | Meaning |
|--------|---------|
| 🔲 | Not started |
| 🔄 | In progress |
| ✅ | Complete |

---

## Feature 1 — YouTube Unlisted Video Support ✅

**Replaces:** Direct file upload to Supabase Storage / Cloudflare Stream  
**Why:** Teacher uploads video privately to YouTube (Unlisted), pastes the link here. Zero hosting cost. Students watch inside the app — never see the URL.

---

### How it works

```
Teacher pastes YouTube URL
         ↓
App extracts video ID from URL
         ↓
Stores in videos table (source_type='youtube', youtube_video_id)
         ↓
Student opens video → secure token API route validates access
         ↓
YouTube IFrame Player loads inside app (video ID passed as token)
         ↓
Progress tracked every 5 seconds via YT IFrame API events
         ↓
Saved to video_progress table (same as direct upload)
```

---

### YouTube video privacy — critical rule for teachers

| YouTube Setting | Embeds in app? | Discoverable on YouTube? |
|---|---|---|
| Public | ✅ Yes | ✅ Yes — anyone can find it |
| **Unlisted** | ✅ **Yes** | ❌ **No — invisible to search** |
| Private | ❌ No | ❌ No |

**Teachers must set videos to Unlisted.** The app never shows the raw URL — only embeds via the IFrame API. Students in the wrong standard get a 403 from the token route before the player even loads.

---

### Security layers

1. **Token route** (`/api/video/<id>/token`) — server checks student's `standard_id` matches the video's class's standard before returning the YouTube video ID. Called `token` in the response, not `youtube_video_id`.
2. **Client types** — `VideoWithStats` type deliberately excludes `youtube_video_id`. Cannot leak via client-side API calls.
3. **oEmbed preview** — private videos fail oEmbed; teacher sees an error and is told to set Unlisted.
4. **Embed flags** — `rel=0, modestbranding=1` minimize YouTube UI inside the player.

---

### Database changes

```sql
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'upload'
    CHECK (source_type IN ('upload', 'youtube')),
  ADD COLUMN IF NOT EXISTS youtube_video_id TEXT,
  ADD COLUMN IF NOT EXISTS youtube_url TEXT;

-- storage_path is now nullable (only set for source_type='upload')
ALTER TABLE videos ALTER COLUMN storage_path DROP NOT NULL;
```

---

### New API endpoint

**`GET /api/video/<videoId>/token`**

1. Verify auth (student or teacher).
2. Fetch `source_type`, `youtube_video_id`, `class_id` from `videos`.
3. Look up `standard_id` from `subject_classes`.
4. If student: check `students.standard_id` matches and `blocked=false`.
5. If teacher: allow always.
6. Return `{ token: youtube_video_id, source_type, title }` — field named `token` not `youtube_video_id`.
7. 403 if not authorized.

**`GET /api/video/<videoId>/thumbnail`**

Returns `{ thumbnail_url: "https://img.youtube.com/vi/<id>/mqdefault.jpg" }` for YouTube videos. Same auth check.

---

### Frontend changes

**VideoAddModal** (replaces UploadVideoModal):
- Two tabs: **YouTube link** (default) | **Upload file**
- YouTube tab: paste URL → oEmbed preview loads thumbnail + auto-fills title
- Amber info box: "Set video to Unlisted, not Private"
- On submit: inserts row with `source_type='youtube'`, `youtube_video_id`, `youtube_url`

**SubjectDetailPage — Videos tab (teacher):**
- Button label: "Add video" (was "Upload")
- YouTube videos: show thumbnail from `img.youtube.com/vi/<id>/mqdefault.jpg` + red "YT" badge
- Upload videos: gray placeholder (unchanged)
- Delete: YouTube → DB row only; Upload → DB row + Storage delete

**StudentSubjectViewPage — Videos tab:**
- YouTube videos: thumbnail card (aspect-video, play button overlay, progress bar strip at bottom)
- Grid layout: `lg:grid-cols-2`, single column mobile

**StudentVideoPlayerPage:**
- Detects `source_type` on load
- YouTube: calls `/api/video/<id>/token` → loads YT IFrame Player API → creates player with token
- Progress tracking: `getCurrentTime()` every 5 seconds → upsert `video_progress`
- Auto-complete at 90% → `+10 points` toast
- Resumes from saved `progress_secs` on player ready
- Upload: existing Supabase Storage signed URL player (unchanged)

---

### Verification checklist

**Teacher side:**
- [ ] "Add video" button opens modal with two tabs
- [ ] Paste unlisted URL → thumbnail + auto-filled title loads
- [ ] Paste private URL → error shown
- [ ] Add video → appears with YT badge and thumbnail in list
- [ ] Delete YouTube video → no Storage errors

**Student side:**
- [ ] Correct standard: video card with thumbnail shown, plays inside app
- [ ] Wrong standard: 403 shown, player never loads
- [ ] YouTube URL not visible in browser Network tab
- [ ] Progress saves every 5 seconds, resumes on return
- [ ] 90%+ watched → completed + 10 points

---

## Feature 2 — Zoom Live Classes ✅

**What it does:** Teacher schedules a live class inside the app. Zoom meeting is created automatically via API. Students join the class inside the app (no Zoom URL ever shown). Attendance is pulled from Zoom after the class ends.

---

### Full flow

```
Teacher schedules class (title, date, time, duration)
         ↓
Backend calls Zoom REST API → creates meeting automatically
Stores zoom_meeting_id + zoom_join_url + zoom_start_url in DB
         ↓
Students see scheduled class with countdown timer (no URL)
         ↓
At scheduled time: Supabase Edge Function fires → status → 'live'
Student sees "Live now" badge + Join button activates
         ↓
Student clicks Join → /api/live-classes/<id>/join-token returns SDK signature
ZoomMeetingView component opens INSIDE the app (Zoom Web SDK)
         ↓
Teacher clicks Start class → same ZoomMeetingView, role=1 (host)
         ↓
Class ends → teacher clicks End class OR Zoom webhook fires
Backend calls Zoom API for participant list → writes to live_class_attendance
         ↓
Teacher opens attendance sheet → per-student attended/absent + duration
```

---

### Zoom setup (one-time, done by developer)

1. Go to marketplace.zoom.us → Develop → Build App → **Server-to-Server OAuth**
2. Create app. Get: Account ID, Client ID, Client Secret
3. Scopes needed: `meeting:write:admin`, `meeting:read:admin`
4. Create a second app: **SDK App** → get SDK Key + SDK Secret
5. Register webhook endpoint: `https://<your-domain>/api/zoom/webhook`
   - Events: `meeting.ended`, `meeting.participant_joined`, `meeting.participant_left`
6. Add env vars to `backend/.env`:

```env
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_SDK_KEY=
ZOOM_SDK_SECRET=
ZOOM_WEBHOOK_SECRET_TOKEN=
```

---

### Zoom pricing note

| Plan | Duration limit | Cost |
|---|---|---|
| Free | 40 min (3+ people) | $0 |
| **Pro** | Unlimited | **$15/month per host** |
| Daily.co (alternative) | 60 min free tier | $0–$35/month |
| Jitsi Meet (alternative) | Unlimited | Free (open source) |

For a class of 20+ students with 1-hour sessions: **Zoom Pro ($15/month)** is the recommended option. Daily.co is a viable free alternative with nearly identical Web SDK integration.

---

### Database changes

```sql
CREATE TABLE IF NOT EXISTS live_classes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        UUID NOT NULL REFERENCES subject_classes(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  duration_mins   INTEGER NOT NULL DEFAULT 60,
  zoom_meeting_id TEXT,
  zoom_join_url   TEXT,       -- never sent to students
  zoom_start_url  TEXT,       -- only for teacher (host token)
  status          TEXT DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  created_by      UUID REFERENCES teachers(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS live_class_attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_class_id   UUID NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ,
  left_at         TIMESTAMPTZ,
  duration_mins   INTEGER,    -- computed: left_at - joined_at
  attended        BOOLEAN DEFAULT false,
  UNIQUE (live_class_id, student_id)
);

ALTER TABLE live_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_class_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON live_classes USING (false);
CREATE POLICY "service role only" ON live_class_attendance USING (false);
```

---

### New backend endpoints

| Method | Path | Who | What |
|--------|------|-----|------|
| GET | `/live-classes?class_id=` | Teacher | List live classes for a subject |
| POST | `/live-classes` | Teacher | Schedule class → creates Zoom meeting |
| GET | `/live-classes/<id>/join-token` | Teacher + Student | Returns Zoom SDK signature (no URL) |
| POST | `/live-classes/<id>/end` | Teacher | Ends class, pulls Zoom attendance |
| POST | `/live-classes/<id>/cancel` | Teacher | Cancel scheduled class |
| POST | `/zoom/webhook` | Zoom | Webhook: meeting.ended, participant events |

**POST `/live-classes`** — creates Zoom meeting via Server-to-Server OAuth, stores `zoom_meeting_id`, `zoom_join_url`, `zoom_start_url`.

**GET `/live-classes/<id>/join-token`** — validates access (student's standard must match), generates HMAC-SHA256 Zoom SDK signature, returns `{ meeting_id, signature, sdk_key, role, display_name }`. Never returns `zoom_join_url` or `zoom_start_url`.

**POST `/live-classes/<id>/end`** — calls `GET /v2/report/meetings/<zoom_meeting_id>/participants`, matches by name/email to students, writes `live_class_attendance` rows for all students in the standard (attended=true/false).

---

### Frontend changes

**SubjectDetailPage — new "Live Classes" tab (teacher):**
- "Schedule class" button → ScheduleLiveClassModal
- Cards per class: title, date/time, duration, status badge
  - Scheduled (amber): "Start class" button visible 15 min before time + "Cancel"
  - Live (green pulse): "End class" button (red)
  - Ended: "View attendance" button → LiveClassAttendanceSheet
- "Start class" → fetches join-token (role=1) → opens ZoomMeetingView

**ScheduleLiveClassModal:**
- Fields: title, date picker (min: today), time picker, duration dropdown (30/45/60/90/120 min)
- On submit: POST `/live-classes` → success toast "Class scheduled!"

**LiveClassAttendanceSheet:**
- List all students in the standard
- Per row: name, avatar, Attended ✓ (green) or Absent (red), joined time, duration
- Summary line: "22 attended · 6 absent"
- Export CSV button

**StudentSubjectViewPage — new "Live Classes" tab:**
- Cards per class: title, date/time, status
  - Scheduled: countdown "Starts in 2h 30m" — Join button activates 5 min before
  - Live: green pulse "Live now" + Join button always visible
  - Ended: "You attended ✓" or "You missed this class"
- No Zoom URL or meeting ID shown anywhere

**ZoomMeetingView component (shared):**
- Uses `@zoom/meetingsdk` — renders meeting inside the app (not a new tab)
- Full-screen overlay (position fixed, z-50)
- Initializes with `ZoomMtg.init()` then `ZoomMtg.join()` using received signature
- "← Back to class" button overlay calls `ZoomMtg.leaveMeeting()` then `onLeave()`

**Auto-start Edge Function (Supabase):**
- Cron: every 1 minute
- Finds `status='scheduled'` classes where `scheduled_at <= now()` and within 5-minute window
- Updates `status='live'`
- Inserts notifications for all students in the class's standard

---

### Verification checklist

**Zoom setup:**
- [ ] Zoom credentials in backend/.env
- [ ] Webhook URL registered in Zoom marketplace

**Scheduling:**
- [ ] Teacher schedules class → `live_classes` row created with `zoom_meeting_id` populated
- [ ] Student sees class in their Live Classes tab with countdown

**Joining:**
- [ ] At scheduled time: status → `live` (Edge Function or manual trigger)
- [ ] Student Join button activates
- [ ] Student joins → ZoomMeetingView opens inside app, meeting starts
- [ ] Teacher Start class → joins as host inside app
- [ ] Zoom URL never visible in student's network tab

**Attendance:**
- [ ] Teacher End class → attendance data written to `live_class_attendance`
- [ ] Teacher attendance sheet shows correct attended/absent per student
- [ ] Student who joined: `attended=true` with correct `duration_mins`
- [ ] Student who did not join: `attended=false`

---

## Implementation Order

Build Feature 1 first (YouTube videos) — it has no external API dependencies and can be tested immediately. Feature 2 (Zoom) requires Zoom account setup and credentials before any testing is possible.

1. Run Feature 1 SQL migrations
2. Build Feature 1 token API route + VideoAddModal + player
3. Verify all Feature 1 checklist items
4. Set up Zoom account + credentials
5. Run Feature 2 SQL migrations
6. Build Feature 2 backend (Zoom helper, endpoints, webhook)
7. Build Feature 2 frontend (modal, live classes tab, ZoomMeetingView)
8. Set up Supabase Edge Function for auto-start
9. Verify all Feature 2 checklist items
10. Update FEATURES_STATUS.md and PLAN.md when both are complete

---

*Added: May 2026*
