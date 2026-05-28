import React, { useState, useEffect } from 'react';
import { Video, Calendar, Clock, Users, Plus, CheckCircle, AlertCircle, X, Loader2 } from 'lucide-react';
import { Modal, Sheet, Btn, Tag, Avatar, Skeleton } from '../../components/ui';
import TopBar from '../../components/shared/TopBar';
import { liveClassApi } from '../../lib/api';
import { useAppCache } from '../../store';
import { useAuthStore } from '../../lib/auth';
import ZoomMeetingView from '../../components/ZoomMeetingView';

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

function minsUntilStart(iso) {
  return Math.round((new Date(iso) - Date.now()) / 60000);
}

function durationLabel(mins) {
  if (!mins) return '';
  return `${mins} min`;
}

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
            className="w-full px-3 py-2 rounded-md bg-white/40 backdrop-blur-sm border border-white/60 focus:bg-white/70 focus:border-white/80 focus:ring-2 focus:ring-white/50 shadow-inner outline-none text-sm transition-all"
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
            className="w-full px-3 py-2 rounded-md bg-white/40 backdrop-blur-sm border border-white/60 focus:bg-white/70 focus:border-white/80 focus:ring-2 focus:ring-white/50 shadow-inner outline-none text-sm transition-all placeholder:text-neutral-400"
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
              className="w-full px-3 py-2 rounded-md bg-white/40 backdrop-blur-sm border border-white/60 focus:bg-white/70 focus:border-white/80 focus:ring-2 focus:ring-white/50 shadow-inner outline-none text-sm transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Time</label>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-white/40 backdrop-blur-sm border border-white/60 focus:bg-white/70 focus:border-white/80 focus:ring-2 focus:ring-white/50 shadow-inner outline-none text-sm transition-all"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Duration</label>
          <select
            value={duration}
            onChange={e => setDuration(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-md bg-white/40 backdrop-blur-sm border border-white/60 focus:bg-white/70 focus:border-white/80 focus:ring-2 focus:ring-white/50 shadow-inner outline-none text-sm transition-all"
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

/* ─── LiveClassAttendanceSheet ──────────────────────── */

function LiveClassAttendanceSheet({ liveClassId, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!liveClassId) return;
    setLoading(true);
    liveClassApi.getAttendance(liveClassId)
      .then(data => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [liveClassId]);

  const attended = records.filter(r => r.attended);
  const absent   = records.filter(r => !r.attended);

  return (
    <Sheet open={!!liveClassId} onClose={onClose} title="Attendance">
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-5 text-sm">
            <span className="text-green-700 font-medium">{attended.length} attended</span>
            <span className="text-neutral-300">·</span>
            <span className="text-red-600 font-medium">{absent.length} absent</span>
          </div>

          <div className="space-y-2">
            {records.map((r, i) => (
              <div key={r.student_id || i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/40 border border-white/50">
                <Avatar name={r.students?.name} src={r.students?.avatar_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-800 truncate">{r.students?.name || r.students?.username || '—'}</p>
                  {r.attended && (
                    <p className="text-xs text-neutral-500">
                      {r.joined_at && `Joined ${fmtDateTime(r.joined_at)}`}
                      {r.duration_mins > 0 && ` · ${r.duration_mins}m`}
                    </p>
                  )}
                </div>
                {r.attended ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                    <CheckCircle size={10} /> Attended
                  </span>
                ) : (
                  <span className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">Absent</span>
                )}
              </div>
            ))}
          </div>

          {records.length === 0 && (
            <p className="text-sm text-neutral-500 text-center py-8">No attendance records yet.</p>
          )}
        </>
      )}
    </Sheet>
  );
}

/* ─── Main Page ──────────────────────────────────────── */

export default function TeacherLiveClassesPage() {
  const { subjects, standards } = useAppCache();
  const { user } = useAuthStore();

  // Enrich subjects with standard name for the schedule modal dropdown
  const enrichedSubjects = subjects.map(s => ({
    ...s,
    standard_name: standards.find(std => std.id === s.standard_id)?.name || '',
  }));
  const [liveClasses, setLiveClasses] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showSchedule, setShowSchedule] = useState(false);
  const [activeJoin, setActiveJoin]     = useState(null);
  const [attendanceSheetId, setAttendanceSheetId] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        subjects.map(s => liveClassApi.getByClass(s.id).then(data => ({ s, data: Array.isArray(data) ? data : [] })))
      );
      const all = results.flatMap(r =>
        r.status === 'fulfilled'
          ? r.value.data.map(lc => ({ ...lc, subject: r.value.s }))
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

  useEffect(() => { fetchAll(); }, [subjects]);

  const handleStartClass = async (lc) => {
    try {
      const res = await liveClassApi.getJoinToken(lc.id);
      setActiveJoin({ ...res, liveClass: lc });
    } catch (err) {
      alert(err?.message || 'Failed to get join token.');
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

  /* ── Active join (Zoom) view ── */
  if (activeJoin) {
    return (
      <ZoomMeetingView
        meeting_id={activeJoin.meeting_id}
        signature={activeJoin.signature}
        sdk_key={activeJoin.sdk_key}
        role={activeJoin.role ?? 1}
        display_name={user?.name || 'Teacher'}
        onLeave={() => { setActiveJoin(null); fetchAll(); }}
      />
    );
  }

  /* ── Main render ── */
  return (
    <div className="pb-28">
      <TopBar
        title="Live Classes"
        action={
          <Btn variant="primary" size="sm" icon={Plus} onClick={() => setShowSchedule(true)}>
            Schedule
          </Btn>
        }
      />

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="p-4 rounded-xl bg-white/50 border border-white/60 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        ) : liveClasses.length === 0 ? (
          <div className="text-center py-24">
            <Video size={32} className="mx-auto mb-3 text-neutral-400" />
            <h3 className="font-medium text-neutral-700 mb-1">No live classes yet</h3>
            <p className="text-sm text-neutral-500 mb-4">Schedule your first live class.</p>
            <Btn variant="primary" icon={Plus} onClick={() => setShowSchedule(true)}>Schedule</Btn>
          </div>
        ) : (
          <div className="space-y-3">
            {liveClasses.map(lc => {
              const status = lc.status || 'scheduled';
              const isLive = status === 'live';
              const isScheduled = status === 'scheduled';
              const isEnded = status === 'ended';
              const isCancelled = status === 'cancelled';
              const minsLeft = isScheduled ? minsUntilStart(lc.scheduled_at) : 0;

              return (
                <div key={lc.id} className="p-4 rounded-xl glass-panel border-white/60 shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-neutral-900 truncate">{lc.title}</h3>
                        <Tag color={statusColor(status)}>
                          {isLive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block mr-1 animate-pulse" />
                          )}
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Tag>
                      </div>
                      {lc.subject && (
                        <p className="text-xs text-neutral-500 mb-1.5">{lc.subject.name}</p>
                      )}
                      {isScheduled && (
                        <div className="flex items-center gap-3 text-xs text-neutral-500">
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            {fmtDateTime(lc.scheduled_at)}
                          </span>
                          {lc.duration_mins > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock size={11} />
                              {durationLabel(lc.duration_mins)}
                            </span>
                          )}
                        </div>
                      )}
                      {isLive && lc.duration_mins > 0 && (
                        <div className="flex items-center gap-1 text-xs text-neutral-500">
                          <Clock size={11} />
                          Scheduled: {durationLabel(lc.duration_mins)}
                        </div>
                      )}
                      {isEnded && (
                        <div className="flex items-center gap-3 text-xs text-neutral-500">
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            {fmtDateTime(lc.scheduled_at)}
                          </span>
                          {lc.duration_mins > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock size={11} />
                              {durationLabel(lc.duration_mins)}
                            </span>
                          )}
                        </div>
                      )}
                      {isCancelled && (
                        <p className="text-xs text-red-500">Cancelled</p>
                      )}
                    </div>

                    {isEnded && (
                      <button
                        onClick={() => setAttendanceSheetId(lc.id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 bg-white/50 border border-white/60 px-2.5 py-1.5 rounded-md hover:bg-white/80 transition-colors flex-shrink-0"
                      >
                        <Users size={12} />
                        {lc.attended_count ?? 0}/{lc.total_registered ?? 0} attended
                      </button>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    {isScheduled && minsLeft <= 15 && (
                      <>
                        <Btn size="sm" variant="primary" onClick={() => handleStartClass(lc)}>
                          Start class
                        </Btn>
                        <Btn size="sm" variant="ghost" onClick={() => handleCancelClass(lc)}>
                          Cancel
                        </Btn>
                      </>
                    )}
                    {isScheduled && minsLeft > 15 && (
                      <>
                        <span className="text-xs text-neutral-500">Starts in {minsLeft} min</span>
                        <Btn size="sm" variant="ghost" onClick={() => handleCancelClass(lc)}>
                          Cancel
                        </Btn>
                      </>
                    )}
                    {isLive && (
                      <>
                        <Btn size="sm" variant="primary" onClick={() => handleStartClass(lc)}>
                          Join class
                        </Btn>
                        <Btn size="sm" variant="dangerSolid" onClick={() => handleEndClass(lc)}>
                          End class
                        </Btn>
                      </>
                    )}
                    {isEnded && (
                      <Btn size="sm" variant="ghost" onClick={() => setAttendanceSheetId(lc.id)}>
                        View attendance
                      </Btn>
                    )}
                    {isCancelled && (
                      <span className="text-xs text-neutral-400">This class was cancelled</span>
                    )}
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
