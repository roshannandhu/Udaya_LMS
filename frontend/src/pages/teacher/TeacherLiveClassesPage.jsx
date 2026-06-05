import React, { useState, useEffect, useMemo } from 'react';
import { Video, Calendar, Clock, Users, Plus, CheckCircle, AlertCircle, X, Loader2, Trash2 } from 'lucide-react';
import { Modal, Sheet, Btn, Tag, Avatar, Skeleton } from '../../components/ui';
import TopBar from '../../components/shared/TopBar';
import { liveClassApi, apiClient } from '../../lib/api';
import { useAppCache } from '../../store';
import { useAuthStore } from '../../lib/auth';
import ZoomMeetingView, { preloadZoomSDK } from '../../components/ZoomMeetingView';
import LiveClassThumbnail from '../../components/LiveClassThumbnail';
import LiveClassAttendanceSheet from '../../components/teacher/LiveClassAttendanceSheet';

/* ─── Helpers ──────────────────────────────────────── */

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
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    if (!open) return;
    setSubjectId('');
    setTitle('');
    setDate('');
    setTime('');
    setDuration(60);
    setError('');
    setSaving(false);
  }, [open]);

  const handleSubmit = async () => {
    if (!subjectId || !title.trim() || !date || !time) return;
    setSaving(true);
    setError('');
    try {
      await liveClassApi.create({
        class_id: subjectId,
        title: title.trim(),
        scheduled_at: `${date}T${time}:00`,
        duration_mins: duration,
      });
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
    <Modal open={open} onClose={onClose} title="Schedule live class" size="md">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Subject</label>
          <select
            value={subjectId}
            onChange={e => setSubjectId(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-white border border-[#EFEDEA] focus:bg-white/70 focus:border-white/80 focus:ring-2 focus:ring-white/50 shadow-inner outline-none text-sm transition-all"
          >
            <option value="">Select a subject</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.standard_name || `Standard ${s.standard_id}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Chapter 5 — Quadratic Equations"
            className="w-full px-3 py-2 rounded-md bg-white border border-[#EFEDEA] focus:bg-white/70 focus:border-white/80 focus:ring-2 focus:ring-white/50 shadow-inner outline-none text-sm transition-all placeholder:text-neutral-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Date</label>
            <input
              type="date"
              value={date}
              min={today}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-white border border-[#EFEDEA] focus:bg-white/70 focus:border-white/80 focus:ring-2 focus:ring-white/50 shadow-inner outline-none text-sm transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Time</label>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-white border border-[#EFEDEA] focus:bg-white/70 focus:border-white/80 focus:ring-2 focus:ring-white/50 shadow-inner outline-none text-sm transition-all"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Duration</label>
          <select
            value={duration}
            onChange={e => setDuration(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-md bg-white border border-[#EFEDEA] focus:bg-white/70 focus:border-white/80 focus:ring-2 focus:ring-white/50 shadow-inner outline-none text-sm transition-all"
          >
            {[30, 45, 60, 90, 120].map(m => (
              <option key={m} value={m}>{durationLabel(m)}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <Btn
          variant="primary"
          onClick={handleSubmit}
          disabled={!subjectId || !title.trim() || !date || !time || saving}
          className="w-full justify-center"
        >
          {saving ? 'Scheduling...' : 'Schedule class'}
        </Btn>
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
                <div key={lc.id} className={`rounded-[32px] ${theme.bg} flex flex-col transition-transform hover:-translate-y-1 hover:shadow-md`}>
                  <div className="p-2">
                    <LiveClassThumbnail
                      thumbnailUrl={lc.thumbnail_url}
                      textSide={lc.thumbnail_text_side}
                      subjectName={lc.subject?.name}
                      standardName={standardName}
                      topic={lc.title}
                      status={status}
                      scheduledAt={lc.scheduled_at}
                      className="rounded-[24px]"
                    />
                  </div>
                  
                  <div className="px-6 pb-6 pt-2 flex flex-col gap-3 flex-1">
                    <div>
                      <div className="flex items-start gap-2 mb-2">
                        <h3 className={`flex-1 text-[19px] font-bold ${theme.text} leading-tight line-clamp-2`}>{lc.title}</h3>
                        <Tag color={statusColor(status)} className="rounded-full px-2.5 py-0.5 text-[11px] font-bold border-0 shadow-sm bg-white shrink-0">
                          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block mr-1.5 animate-pulse" />}
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Tag>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-black/40">
                        {lc.subject && <span className="bg-white/50 px-2 py-0.5 rounded-full">{lc.subject.name}</span>}
                        {!isCancelled && (
                          <span className="flex items-center gap-1 bg-white/50 px-2 py-0.5 rounded-full">
                            <Calendar size={12} />
                            {fmtDateTime(lc.scheduled_at)}
                          </span>
                        )}
                        {lc.duration_mins > 0 && (
                          <span className="flex items-center gap-1 bg-white/50 px-2 py-0.5 rounded-full">
                            <Clock size={12} />
                            {durationLabel(lc.duration_mins)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons pinned to the bottom */}
                    <div className="mt-auto flex items-center gap-2 flex-wrap pt-3">
                      {isScheduled && (
                        <>
                          <button onClick={() => handleCancelClass(lc)} className="text-[13px] font-semibold text-neutral-500 hover:text-neutral-700 hover:bg-white/40 px-3 py-1.5 rounded-full transition-colors ml-auto">
                            Cancel
                          </button>
                        </>
                      )}
                      {isLive && (
                        <>
                          <button onClick={() => handleWatchClass(lc)} disabled={joiningId === lc.id} className="bg-black text-white px-4 py-2 rounded-full text-[13px] font-semibold shadow-md hover:bg-neutral-800 transition-colors flex items-center gap-1.5">
                            {joiningId === lc.id ? <><Loader2 size={14} className="animate-spin" /> Opening…</> : 'Watch'}
                          </button>
                          <button onClick={() => setAttendanceSheetId(lc.id)} className="bg-white text-black/70 hover:text-black hover:bg-neutral-50 px-3 py-2 rounded-full text-[13px] font-semibold shadow-sm transition-colors flex items-center gap-1.5">
                            <Users size={14} /> {lc.attended_count ?? 0}/{lc.total_registered ?? 0}
                          </button>
                          <button onClick={() => handleEndClass(lc)} className="ml-auto text-red-600 bg-red-100 hover:bg-red-200 px-3 py-2 rounded-full text-[13px] font-semibold transition-colors">
                            End
                          </button>
                        </>
                      )}
                      {isEnded && (
                        <>
                          <button onClick={() => setAttendanceSheetId(lc.id)} className="bg-white text-black/70 hover:text-black hover:bg-neutral-50 px-3 py-2 rounded-full text-[13px] font-semibold shadow-sm transition-colors flex items-center gap-1.5">
                            <Users size={14} /> {lc.attended_count ?? 0}/{lc.total_registered ?? 0}
                          </button>
                        </>
                      )}
                      {!isLive && (
                        <button
                          onClick={() => handleDeleteClass(lc)}
                          title="Delete class"
                          className="ml-auto flex items-center gap-1 text-[13px] font-semibold text-red-600/70 hover:text-red-700 hover:bg-red-50/50 px-3 py-1.5 rounded-full transition-colors"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
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
