import React, { useState, useEffect, useMemo } from 'react';
import { Video, Calendar, Clock, Users, Plus, CheckCircle, AlertCircle, X, Loader2, Trash2, Play, MoreHorizontal } from 'lucide-react';
import { Modal, Sheet, Btn, Tag, Avatar, Skeleton } from '../../components/ui';
import TopBar from '../../components/shared/TopBar';
import { liveClassApi, apiClient } from '../../lib/api';
import { useAppCache } from '../../store';
import { useAuthStore } from '../../lib/auth';
import ZoomMeetingView, { preloadZoomSDK } from '../../components/ZoomMeetingView';
import LiveClassAttendanceSheet from '../../components/teacher/LiveClassAttendanceSheet';
import LiveClassCard from '../../components/cards/LiveClassCard';

/* ─── Helpers ──────────────────────────────────────── */

function pad(n) { return String(n).padStart(2, '0'); }

function formatCountdown(ms) {
  if (ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${pad(m)}m`;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function LiveCountdown({ scheduledAt, isLive, isEnded }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (isLive || isEnded) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive, isEnded]);

  if (isLive) return 'Live Now';
  if (isEnded) return 'Ended';

  const msUntil = scheduledAt ? new Date(scheduledAt).getTime() - now : 0;
  if (msUntil <= 0) return 'Starting…';

  return formatCountdown(msUntil) + ' to start';
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} at ${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function statusColor(status) {
  switch (status) {
    case 'scheduled': return 'amber';
    case 'live':      return 'green';
    case 'ended':     return 'gray';
    case 'cancelled': return 'red';
    default:          return 'gray';
  }
}

function durationLabel(mins) {
  if (!mins) return '';
  return `${mins} min`;
}

const CARD_COLORS = [
  { bg: 'bg-[#EAF3EB]', text: 'text-green-950' },
  { bg: 'bg-[#F8E1FB]', text: 'text-purple-950' },
  { bg: 'bg-[#FFF6D8]', text: 'text-amber-950' },
  { bg: 'bg-[#E5F2FE]', text: 'text-blue-950' },
  { bg: 'bg-[#FFEBE5]', text: 'text-orange-950' }
];

/* ─── ScheduleLiveClassModal ────────────────────────── */

function ScheduleLiveClassModal({ open, onClose, subjects, onScheduled }) {
  const [subjectId, setSubjectId]   = useState('');
  const [title, setTitle]           = useState('');
  const [date, setDate]             = useState('');
  const [time, setTime]             = useState('');
  const [duration, setDuration]     = useState(60);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [thumbnailTextSide, setThumbnailTextSide] = useState('right');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    if (!open) return;
    setSubjectId('');
    setTitle('');
    setDate('');
    setTime('');
    setDuration(60);
    setThumbnailUrl('');
    setThumbnailTextSide('right');
    setError('');
    setSaving(false);
  }, [open]);

  const handleSubmit = async () => {
    if (!subjectId || !title.trim() || !date || !time) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        class_id: subjectId,
        title: title.trim(),
        scheduled_at: `${date}T${time}:00`,
        duration_mins: duration,
      };
      if (thumbnailUrl.trim()) {
        payload.thumbnail_url = thumbnailUrl.trim();
        payload.thumbnail_text_side = thumbnailTextSide;
      }
      
      await liveClassApi.create(payload);
      onScheduled();
      onClose();
    } catch (err) {
      setError(err?.message || err?.detail || 'Failed to schedule. Check Zoom credentials.');
    } finally {
      setSaving(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <Modal open={open} onClose={onClose} title="Schedule Live Class" size="md">
      <div className="flex flex-col gap-4 py-2">
        
        {/* Step 1 */}
        <div className="bg-[#F8E1FB] p-5 sm:p-6 rounded-[32px] shadow-sm">
          <label className="text-[14px] font-bold text-purple-950 mb-3 block">1. What are you teaching?</label>
          <div className="space-y-3">
            <select
              value={subjectId}
              onChange={e => setSubjectId(e.target.value)}
              className="w-full bg-white/70 border-0 rounded-2xl px-4 py-3.5 text-[14px] font-semibold text-neutral-800 focus:bg-white focus:ring-4 focus:ring-white/50 outline-none transition-all shadow-inner"
            >
              <option value="">Select a subject...</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.standard_name || `Standard ${s.standard_id}`}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Chapter 5 — Quadratic Equations"
              className="w-full bg-white/70 border-0 rounded-2xl px-4 py-3.5 text-[14px] font-semibold text-neutral-800 focus:bg-white focus:ring-4 focus:ring-white/50 outline-none transition-all shadow-inner placeholder:text-neutral-400"
            />
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-[#EAF3EB] p-5 sm:p-6 rounded-[32px] shadow-sm">
          <label className="text-[14px] font-bold text-green-950 mb-3 block">2. When is it happening?</label>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input
              type="date"
              value={date}
              min={today}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-white/70 border-0 rounded-2xl px-4 py-3.5 text-[14px] font-semibold text-neutral-800 focus:bg-white focus:ring-4 focus:ring-white/50 outline-none transition-all shadow-inner"
            />
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="w-full bg-white/70 border-0 rounded-2xl px-4 py-3.5 text-[14px] font-semibold text-neutral-800 focus:bg-white focus:ring-4 focus:ring-white/50 outline-none transition-all shadow-inner"
            />
          </div>
          <select
            value={duration}
            onChange={e => setDuration(Number(e.target.value))}
            className="w-full bg-white/70 border-0 rounded-2xl px-4 py-3.5 text-[14px] font-semibold text-neutral-800 focus:bg-white focus:ring-4 focus:ring-white/50 outline-none transition-all shadow-inner"
          >
            {[30, 45, 60, 90, 120].map(m => (
              <option key={m} value={m}>{m} minutes</option>
            ))}
          </select>
        </div>

        {/* Step 3 */}
        <div className="bg-[#FFF6D8] p-5 sm:p-6 rounded-[32px] shadow-sm">
          <label className="text-[14px] font-bold text-amber-950 mb-3 block flex items-center gap-2">
            3. Card Appearance <span className="bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider">Optional</span>
          </label>
          <input
            type="url"
            value={thumbnailUrl}
            onChange={e => setThumbnailUrl(e.target.value)}
            placeholder="Image URL (e.g., https://example.com/img.png)"
            className="w-full bg-white/70 border-0 rounded-2xl px-4 py-3.5 text-[14px] font-semibold text-neutral-800 focus:bg-white focus:ring-4 focus:ring-white/50 outline-none transition-all shadow-inner placeholder:text-neutral-400"
          />
          {thumbnailUrl && (
            <div className="mt-4 flex items-center justify-between gap-3 bg-white/40 p-1.5 pl-4 rounded-full">
              <span className="text-[13px] font-bold text-amber-950">Text layout:</span>
              <div className="flex bg-white/60 rounded-full p-1 gap-1">
                <button 
                  type="button" 
                  onClick={() => setThumbnailTextSide('left')} 
                  className={`px-5 py-2 rounded-full text-[12px] font-bold transition-all ${thumbnailTextSide === 'left' ? 'bg-white shadow-md text-amber-950 scale-105' : 'text-amber-900/50 hover:bg-white/40'}`}
                >
                  Left
                </button>
                <button 
                  type="button" 
                  onClick={() => setThumbnailTextSide('right')} 
                  className={`px-5 py-2 rounded-full text-[12px] font-bold transition-all ${thumbnailTextSide === 'right' ? 'bg-white shadow-md text-amber-950 scale-105' : 'text-amber-900/50 hover:bg-white/40'}`}
                >
                  Right
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-4 bg-red-50 border-2 border-red-100 rounded-[24px] text-[13px] font-semibold text-red-700">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!subjectId || !title.trim() || !date || !time || saving}
          className="w-full mt-2 py-4 rounded-[24px] bg-black text-white font-extrabold text-[15px] shadow-xl hover:bg-neutral-800 hover:shadow-2xl transition-all hover:-translate-y-1 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-xl flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : null}
          {saving ? 'Scheduling...' : 'Schedule Live Class'}
        </button>
      </div>
    </Modal>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function TeacherLiveClassesPage() {
  const subjects  = useAppCache(s => s.subjects);
  const standards = useAppCache(s => s.standards);
  const { user } = useAuthStore();

  // Enrich subjects with standard name for the schedule modal dropdown
  const enrichedSubjects = useMemo(() => subjects.map(s => ({
    ...s,
    standard_name: standards.find(std => std.id === s.standard_id)?.name || '',
  })), [subjects, standards]);
  const [liveClasses, setLiveClasses] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showSchedule, setShowSchedule] = useState(false);
  const [activeJoin, setActiveJoin]     = useState(null);
  const [joiningId, setJoiningId]       = useState(null);
  const [attendanceSheetId, setAttendanceSheetId] = useState(null);

  const fetchAll = async () => {
    if (!standards.length) return;
    setLoading(true);
    try {
      // One call per standard instead of one per subject — much faster
      const results = await Promise.allSettled(
        standards.map(std => apiClient(`/live-classes?standard_id=${std.id}`))
      );
      const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s]));
      const all = results.flatMap(r =>
        r.status === 'fulfilled' && Array.isArray(r.value)
          ? r.value.map(lc => ({ ...lc, subject: subjectMap[lc.class_id] || { id: lc.class_id, name: lc.class_name || '' } }))
          : []
      );
      all.sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
      setLiveClasses(all);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [standards]);

  // Warm the Zoom SDK in the background so the first "Watch" click is instant.
  // NOTE: requestIdleCallback/cancelIdleCallback MUST be called bound to window —
  // a detached call (`const r = window.requestIdleCallback; r(fn)`) throws
  // "Illegal invocation" in Chrome and crashes the page on mount.
  useEffect(() => {
    const ric = window.requestIdleCallback
      ? window.requestIdleCallback.bind(window)
      : (fn) => setTimeout(fn, 1500);
    const cancel = window.cancelIdleCallback
      ? window.cancelIdleCallback.bind(window)
      : clearTimeout;
    const id = ric(() => preloadZoomSDK());
    return () => cancel(id);
  }, []);

  // Teachers watch the owner's live feed as a view-only participant. Hosting
  // happens only from the Zoom-credential owner's phone app.
  const handleWatchClass = async (lc) => {
    if (joiningId) return;
    setJoiningId(lc.id);
    preloadZoomSDK();                 // start the 5.6 MB SDK download NOW, in parallel with the token fetch
    try {
      const res = await liveClassApi.getJoinToken(lc.id);
      setActiveJoin({ ...res, liveClass: lc });
    } catch (err) {
      alert(err?.message || 'Could not open the live class.');
    } finally {
      setJoiningId(null);
    }
  };

  const handleEndClass = async (lc) => {
    if (!window.confirm(`End "${lc.title}"? Students will be disconnected.`)) return;
    try {
      await liveClassApi.end(lc.id);
      await fetchAll();
    } catch (err) {
      alert(err?.message || 'Failed to end class.');
    }
  };

  const handleCancelClass = async (lc) => {
    if (!window.confirm(`Cancel "${lc.title}"? This cannot be undone.`)) return;
    try {
      await liveClassApi.cancel(lc.id);
      await fetchAll();
    } catch (err) {
      alert(err?.message || 'Failed to cancel class.');
    }
  };

  const handleDeleteClass = async (lc) => {
    if (!window.confirm(`Delete "${lc.title}" permanently? This removes the class, its attendance records and the Zoom meeting. This cannot be undone.`)) return;
    try {
      await liveClassApi.remove(lc.id);
      await fetchAll();
    } catch (err) {
      alert(err?.message || 'Failed to delete class.');
    }
  };

  /* ── Live view-only watcher (Zoom) ── */
  if (activeJoin) {
    return (
      <ZoomMeetingView
        meeting_id={activeJoin.meeting_id}
        signature={activeJoin.signature}
        sdk_key={activeJoin.sdk_key}
        role={activeJoin.role ?? 0}
        display_name={user?.name || 'Teacher'}
        passcode={activeJoin.passcode}
        onLeave={() => { setActiveJoin(null); fetchAll(); }}
      />
    );
  }

  /* ── Main render ── */
  return (
    <div className="pb-28 min-h-screen bg-[#F4F7F6]">
      <TopBar
        title="Live Classes"
        action={
          <Btn variant="primary" size="sm" icon={Plus} onClick={() => setShowSchedule(true)} className="rounded-full shadow-sm">
            Schedule
          </Btn>
        }
      />

      <div className="px-5 md:px-8 py-8 max-w-6xl mx-auto">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3].map(i => (
              <div key={i} className="rounded-[32px] bg-white p-4 space-y-4 shadow-sm h-72">
                <Skeleton className="h-40 w-full rounded-[24px]" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : liveClasses.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-[32px] shadow-sm">
            <Video size={32} className="mx-auto mb-3 text-neutral-400" />
            <h3 className="font-medium text-neutral-700 mb-1">No live classes yet</h3>
            <p className="text-sm text-neutral-500 mb-4">Schedule your first live class.</p>
            <Btn variant="primary" icon={Plus} onClick={() => setShowSchedule(true)} className="rounded-full">Schedule</Btn>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {liveClasses.map((lc, idx) => {
              const status = lc.status || 'scheduled';
              const isLive = status === 'live';
              const isScheduled = status === 'scheduled';
              const isEnded = status === 'ended';
              const isCancelled = status === 'cancelled';
              const theme = CARD_COLORS[idx % CARD_COLORS.length];

              const standardName = standards.find(std => std.id === lc.subject?.standard_id)?.name;
              return (
                <LiveClassCard
                  key={lc.id}
                  lc={lc}
                  onClick={handleWatchClass}
                  joiningId={joiningId}
                  themeIndex={idx}
                  actions={
                    <>
                      {isScheduled && (
                        <button onClick={() => handleCancelClass(lc)} className="bg-white/60 hover:bg-white text-neutral-700 px-4 py-2.5 rounded-full text-[13px] font-bold shadow-sm transition-all hover:-translate-y-0.5">
                          Cancel
                        </button>
                      )}
                      {isLive && (
                        <button onClick={() => handleEndClass(lc)} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-full text-[13px] font-bold shadow-sm transition-all hover:-translate-y-0.5">
                          End Class
                        </button>
                      )}
                      {!isLive && (
                        <button onClick={() => handleDeleteClass(lc)} className="bg-white/60 hover:bg-white text-red-600 px-4 py-2.5 rounded-full text-[13px] font-bold shadow-sm transition-all hover:-translate-y-0.5">
                          Delete
                        </button>
                      )}
                    </>
                  }
                  avatars={
                    <button 
                      onClick={(e) => { e.stopPropagation(); setAttendanceSheetId(lc.id); }} 
                      className={`flex -space-x-3 hover:scale-105 transition-transform focus:outline-none`}
                      title="View Attendance"
                    >
                      <img src={`https://i.pravatar.cc/100?u=${lc.id}1`} className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-[3px] border-white shadow-sm relative z-[3]" alt="" />
                      <img src={`https://i.pravatar.cc/100?u=${lc.id}2`} className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-[3px] border-white shadow-sm relative z-[2]" alt="" />
                      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-[3px] border-white bg-neutral-900 shadow-sm relative z-[1] flex items-center justify-center text-[12px] font-bold text-white">
                        {lc.attended_count ?? 0}
                      </div>
                    </button>
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      <ScheduleLiveClassModal
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
        subjects={enrichedSubjects}
        onScheduled={fetchAll}
      />

      <LiveClassAttendanceSheet
        liveClassId={attendanceSheetId}
        onClose={() => setAttendanceSheetId(null)}
      />
    </div>
  );
}
