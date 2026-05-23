import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, CheckCircle2, Save, AlertTriangle,
  Users, Loader2, Info
} from 'lucide-react';
import { attendanceApi } from '../../lib/api';
import { Btn, Skeleton, Avatar } from '../ui';

/* ─── Date helpers ───────────────────────────────────────────── */
export function fmt(date) {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

export function weekDays(start) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function isFutureDate(dateStr) {
  return dateStr > fmt(new Date());
}

/* ─── Status config ──────────────────────────────────────────── */
export const STATUS = {
  present: { char: 'P', cls: 'bg-green-100 text-green-700 border-green-300', label: 'Present' },
  absent:  { char: 'A', cls: 'bg-red-100   text-red-600   border-red-300',   label: 'Absent'  },
  late:    { char: 'L', cls: 'bg-amber-100 text-amber-700 border-amber-300', label: 'Late'    },
};

const CYCLE = { null: 'present', present: 'absent', absent: 'late', late: null };

/* ─── AttendanceGrid ─────────────────────────────────────────── */
export default function AttendanceGrid({ subjectId, onNavigate }) {
  const [weekStart, setWeekStart]   = useState(() => getMonday(new Date()));
  const [activeDate, setActiveDate] = useState(fmt(new Date()));
  const [students, setStudents]     = useState([]);
  const [changesMap, setChangesMap] = useState({});
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [savedDate, setSavedDate]   = useState(null);
  const [error, setError]           = useState('');

  const today = fmt(new Date());
  const days  = weekDays(weekStart);

  const loadWeek = useCallback(async (start) => {
    setLoading(true);
    setError('');
    try {
      const data = await attendanceApi.getSubjectAttendanceWeek(subjectId, fmt(start));
      setStudents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError('Could not load attendance data. Check your connection.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    loadWeek(weekStart);
  }, [weekStart, subjectId, loadWeek]);

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };

  const toggle = (studentId, currentStatus) => {
    const next = CYCLE[currentStatus ?? 'null'];
    setChangesMap(prev => {
      const dateCopy = { ...(prev[activeDate] || {}) };
      dateCopy[studentId] = next === null ? '__CLEAR__' : next;
      return { ...prev, [activeDate]: dateCopy };
    });
  };

  const markAll = (status) => {
    if (isFutureDate(activeDate)) return;
    const newDateChanges = {};
    students.forEach(s => { newDateChanges[s.student_id] = status; });
    setChangesMap(prev => ({ ...prev, [activeDate]: newDateChanges }));
  };

  const getStatus = (studentId, dateStr) => {
    const change = changesMap[dateStr]?.[studentId];
    if (change === '__CLEAR__') return null;
    if (change !== undefined) return change;
    const student = students.find(s => s.student_id === studentId);
    return student?.days[dateStr] || null;
  };

  const save = async () => {
    const dateChanges = changesMap[activeDate] || {};
    const toSave = [];
    const toDelete = [];
    Object.entries(dateChanges).forEach(([studentId, status]) => {
      if (status === '__CLEAR__' || status === null) toDelete.push(studentId);
      else toSave.push({ student_id: studentId, status });
    });
    if (toSave.length === 0 && toDelete.length === 0) return;
    setSaving(true); setError('');
    try {
      if (toSave.length > 0) {
        await attendanceApi.markSubjectAttendance(subjectId, { date: activeDate, records: toSave });
      }
      for (const studentId of toDelete) {
        try { await attendanceApi.clearAttendanceRecord(subjectId, studentId, activeDate); } catch {}
      }
      setChangesMap(prev => { const u = { ...prev }; delete u[activeDate]; return u; });
      setSavedDate(activeDate);
      setTimeout(() => setSavedDate(null), 2500);
      await loadWeek(weekStart);
    } catch (e) {
      setError(e.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const activeDateChanges = changesMap[activeDate] || {};
  const hasChanges = Object.keys(activeDateChanges).length > 0;

  const countStatus = (status) => students.filter(s => getStatus(s.student_id, activeDate) === status).length;
  const presentCount  = countStatus('present');
  const absentCount   = countStatus('absent');
  const lateCount     = countStatus('late');
  const unmarkedCount = students.length - presentCount - absentCount - lateCount;
  const pendingDays   = Object.keys(changesMap).filter(d => Object.keys(changesMap[d] || {}).length > 0);

  if (loading) {
    return (
      <div className="space-y-2 mt-4">
        {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </div>
    );
  }

  if (!students.length) {
    return (
      <div className="mt-6 text-center py-14 glass-panel border-dashed border-white/60 rounded-2xl text-sm text-neutral-500">
        <Users size={28} className="mx-auto mb-2 text-neutral-300" />
        No students enrolled in this subject yet.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {/* ── Control panel ── */}
      <div className="glass-panel rounded-2xl p-4">
        {/* Week navigator + save */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-1">
            <button onClick={prevWeek} className="p-2 hover:bg-white/60 rounded-lg transition-colors">
              <ChevronLeft size={18} className="text-neutral-600" />
            </button>
            <span className="text-sm font-semibold px-1">
              {days[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              {' – '}
              {days[6].toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <button onClick={nextWeek} className="p-2 hover:bg-white/60 rounded-lg transition-colors">
              <ChevronRight size={18} className="text-neutral-600" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => markAll('present')} disabled={isFutureDate(activeDate)}
              className="px-2.5 py-1 text-xs rounded-full bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed">
              All P
            </button>
            <button onClick={() => markAll('absent')} disabled={isFutureDate(activeDate)}
              className="px-2.5 py-1 text-xs rounded-full bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed">
              All A
            </button>
            <button onClick={() => markAll('late')} disabled={isFutureDate(activeDate)}
              className="px-2.5 py-1 text-xs rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed">
              All L
            </button>

            {savedDate === activeDate ? (
              <span className="flex items-center gap-1 text-xs text-green-600 font-medium px-3 py-1.5 bg-green-50 rounded-full border border-green-200">
                <CheckCircle2 size={13} /> Saved!
              </span>
            ) : (
              <Btn variant="primary" size="sm" onClick={save}
                disabled={!hasChanges || saving || isFutureDate(activeDate)}>
                {saving
                  ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                  : <><Save size={13} /> Save{hasChanges ? ` (${Object.keys(activeDateChanges).length})` : ''}</>
                }
              </Btn>
            )}
          </div>
        </div>

        {pendingDays.length > 1 && (
          <div className="mb-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
            <Info size={13} className="flex-shrink-0" />
            You have unsaved changes on {pendingDays.length} days. Each day must be saved separately.
          </div>
        )}

        {/* Day tabs */}
        <div className="flex gap-1">
          {days.map((d, i) => {
            const ds       = fmt(d);
            const isActive = ds === activeDate;
            const isToday  = ds === today;
            const isFuture = isFutureDate(ds);
            const hasPending = Object.keys(changesMap[ds] || {}).length > 0;
            return (
              <button key={i} onClick={() => setActiveDate(ds)}
                className={`relative flex-1 flex flex-col items-center py-2 rounded-xl border text-xs font-medium transition-all
                  ${isActive ? 'bg-neutral-900 text-white border-neutral-900'
                  : isToday  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : isFuture ? 'border-white/40 text-neutral-300 cursor-default'
                  : 'border-white/60 text-neutral-500 hover:bg-white/40'}`}>
                <span className="text-[9px] uppercase tracking-wide opacity-70">
                  {d.toLocaleDateString('en-IN', { weekday: 'narrow' })}
                </span>
                <span className="font-bold mt-0.5">{d.getDate()}</span>
                {hasPending && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />}
              </button>
            );
          })}
        </div>

        {isFutureDate(activeDate) && (
          <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500 bg-white/30 rounded-xl p-2.5 border border-white/60">
            <Info size={12} className="flex-shrink-0" /> Cannot mark attendance for future dates.
          </div>
        )}

        {!isFutureDate(activeDate) && (
          <div className="flex gap-4 mt-3 text-xs text-neutral-500 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" />{presentCount} present</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />{absentCount} absent</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />{lateCount} late</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-neutral-300" />{unmarkedCount} unmarked</span>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-2.5">
            <AlertTriangle size={13} className="flex-shrink-0" /> {error}
          </div>
        )}
      </div>

      {/* ── Student list ── */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="flex items-center px-4 py-2.5 border-b border-white/40 bg-white/20">
          <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Student</span>
          <div className="hidden md:flex gap-1.5 mr-3">
            {days.map((d, i) => {
              const ds = fmt(d);
              return (
                <span key={i} className={`w-8 text-center text-[10px] font-bold transition-colors ${ds === activeDate ? 'text-neutral-900' : 'text-neutral-400'}`}>
                  {d.toLocaleDateString('en-IN', { weekday: 'narrow' })}
                </span>
              );
            })}
          </div>
          <span className="md:hidden text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mr-3">
            {new Date(activeDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 w-12 text-right">Overall</span>
        </div>

        {students.map((st, idx) => {
          const overall  = st.overall_pct ?? 0;
          const isLow    = overall > 0 && overall < 75;
          const barColor = overall >= 75 ? 'bg-green-500' : overall >= 50 ? 'bg-amber-500' : 'bg-red-500';
          return (
            <div key={st.student_id}
              className={`flex items-center gap-3 px-4 py-3.5 hover:bg-white/25 transition-colors ${idx > 0 ? 'border-t border-white/40' : ''}`}>
              <button onClick={() => onNavigate?.(st.student_id)}
                className="flex items-center gap-2 flex-1 min-w-0 text-left group">
                <Avatar name={st.student_name} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-blue-600 transition-colors">
                    {isLow && <AlertTriangle size={11} className="inline mr-1 text-amber-500" />}
                    {st.student_name}
                  </p>
                </div>
              </button>

              {/* Desktop: full week dots */}
              <div className="hidden md:flex gap-1.5 items-center mr-3">
                {days.map((d, i) => {
                  const ds = fmt(d);
                  const isEditing = ds === activeDate && !isFutureDate(ds);
                  const status    = getStatus(st.student_id, ds);
                  const cfg       = STATUS[status];
                  const isPending = changesMap[ds]?.[st.student_id] !== undefined;
                  return (
                    <button key={i} disabled={!isEditing}
                      onClick={() => isEditing && toggle(st.student_id, status)}
                      title={cfg?.label || 'Unmarked'}
                      className={`w-8 h-8 rounded-full border text-[10px] font-bold flex items-center justify-center select-none transition-all
                        ${isEditing ? 'cursor-pointer hover:scale-110 ring-2 ring-offset-1 ring-neutral-200' : 'cursor-default'}
                        ${isPending ? 'ring-2 ring-amber-300 ring-offset-1' : ''}
                        ${cfg ? cfg.cls : 'bg-white/30 border-white/60 text-neutral-300'}`}>
                      {cfg ? cfg.char : '·'}
                    </button>
                  );
                })}
              </div>

              {/* Mobile: active date dot */}
              <div className="flex md:hidden mr-2">
                {(() => {
                  const status  = getStatus(st.student_id, activeDate);
                  const cfg     = STATUS[status];
                  const canEdit = !isFutureDate(activeDate);
                  return (
                    <button onClick={() => canEdit && toggle(st.student_id, status)} disabled={!canEdit}
                      className={`w-10 h-10 rounded-full border text-xs font-bold flex items-center justify-center transition-all
                        ${canEdit ? 'hover:scale-110 active:scale-95 cursor-pointer' : 'cursor-default opacity-50'}
                        ${cfg ? cfg.cls : 'bg-white/30 border-white/60 text-neutral-400'}`}>
                      {cfg ? cfg.char : '?'}
                    </button>
                  );
                })()}
              </div>

              {/* Overall % */}
              <div className="flex items-center gap-2 w-14 justify-end">
                <div className="hidden sm:block w-10 h-1.5 rounded-full bg-white/40 overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${overall}%` }} />
                </div>
                <span className={`text-xs font-bold tabular-nums ${isLow ? 'text-red-600' : 'text-neutral-700'}`}>
                  {Math.round(overall)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 px-1 text-xs text-neutral-400 flex-wrap">
        {Object.entries(STATUS).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] font-bold ${cfg.cls}`}>{cfg.char}</span>
            {cfg.label}
          </span>
        ))}
        <span className="italic">Tap cell to cycle • amber dot = unsaved</span>
      </div>
    </div>
  );
}
