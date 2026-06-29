import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Save, CheckCircle2, AlertTriangle, Users, Loader2
} from 'lucide-react';
import { attendanceApi } from '../../lib/api';
import { Avatar, Skeleton } from '../ui';

export function fmt(date) {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function getMonday(d) {
  const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/* ── Animated SVG donut ring ───────────────────────────────────────── */
function DonutRing({ present, total }) {
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;
  const stroke = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : pct > 0 ? '#ef4444' : '#e5e7eb';

  return (
    <div className="relative flex items-center justify-center" style={{ width: 70, height: 70 }}>
      <svg width="70" height="70" viewBox="0 0 70 70" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="35" cy="35" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="7" />
        <circle
          cx="35" cy="35" r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.34,1.56,0.64,1), stroke 0.4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[17px] font-black text-neutral-900 leading-none">{pct}%</span>
        <span className="text-[8px] font-bold text-neutral-400 uppercase tracking-wide">present</span>
      </div>
    </div>
  );
}

/* ── Status cycle: null → present → absent → late → null ──────────── */
const STATUS_CYCLE = [null, 'present', 'absent', 'late'];
const STATUS_CFG = {
  null:    { label: 'Mark',    bg: 'bg-neutral-100', text: 'text-neutral-500', dot: 'bg-neutral-300', ring: 'ring-neutral-200' },
  present: { label: 'Present', bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'ring-emerald-300' },
  absent:  { label: 'Absent',  bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500',     ring: 'ring-red-300' },
  late:    { label: 'Late',    bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-400',   ring: 'ring-amber-300' },
};

function StudentRow({ student, status, onChange, onNavigate }) {
  const key = status ?? null;
  const cfg = STATUS_CFG[key];

  const cycleStatus = () => {
    const idx = STATUS_CYCLE.indexOf(key);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    onChange(next);
  };

  return (
    <div className="flex items-center gap-3 bg-white rounded-2xl px-3 py-2.5 shadow-sm border border-neutral-100 transition-transform active:scale-[0.99]">
      <button
        type="button"
        onClick={() => onNavigate && onNavigate(student.student_id)}
        className={`relative flex-shrink-0 rounded-full ring-2 transition-all duration-300 ${cfg.ring}`}
      >
        <Avatar src={student.avatar_url} name={student.name} size="md" />
      </button>
      <button
        type="button"
        onClick={() => onNavigate && onNavigate(student.student_id)}
        className="flex-1 min-w-0 text-left"
      >
        <p className="font-semibold text-[14px] text-neutral-900 truncate leading-snug">{student.name}</p>
        <p className="text-[11px] text-neutral-400 truncate leading-snug">{student.username}</p>
      </button>
      <button
        type="button"
        onClick={cycleStatus}
        className={`flex-shrink-0 w-[82px] py-2 rounded-xl text-[11px] font-bold transition-all duration-200 active:scale-90 flex items-center justify-center gap-1.5 ${cfg.bg} ${cfg.text}`}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
        {cfg.label}
      </button>
    </div>
  );
}

/* ── Main AttendanceGrid ──────────────────────────────────────────── */
export default function AttendanceGrid({ subjectId, onNavigate }) {
  const todayStr = fmt(new Date());

  const [activeDate, setActiveDate] = useState(todayStr);
  const [weekStart, setWeekStart]   = useState(() => fmt(getMonday(new Date())));
  const [students, setStudents]     = useState([]);
  const [changesMap, setChangesMap] = useState({});
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState('');
  const [undoSnap, setUndoSnap]     = useState(null);
  const undoTimer                   = useRef(null);

  const loadDate = useCallback(async (dateStr) => {
    setLoading(true);
    setError('');
    setChangesMap({});
    try {
      const data = await attendanceApi.getSubjectAttendance(subjectId, dateStr);
      setStudents(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load attendance data.');
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => { loadDate(activeDate); }, [activeDate, loadDate]);

  const weekDays = useMemo(() => {
    const monday = new Date(weekStart + 'T00:00:00');
    return Array.from({ length: 7 }).map((_, i) => addDays(monday, i));
  }, [weekStart]);

  const canGoNext = useMemo(() => {
    const m = new Date(weekStart + 'T00:00:00');
    return fmt(addDays(m, 7)) <= todayStr;
  }, [weekStart, todayStr]);

  const prevWeek = () => {
    const m = new Date(weekStart + 'T00:00:00');
    setWeekStart(fmt(addDays(m, -7)));
  };
  const nextWeek = () => {
    if (!canGoNext) return;
    const m = new Date(weekStart + 'T00:00:00');
    setWeekStart(fmt(addDays(m, 7)));
  };

  const getEffectiveStatus = (sid) => {
    if (changesMap[sid] !== undefined) return changesMap[sid];
    const s = students.find(s => s.student_id === sid);
    return s ? s.status : null;
  };

  const markStudent = (sid, status) =>
    setChangesMap(prev => ({ ...prev, [sid]: status }));

  const markAll = (status) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoSnap({ ...changesMap });
    undoTimer.current = setTimeout(() => setUndoSnap(null), 5000);
    const next = {};
    students.forEach(s => { next[s.student_id] = status; });
    setChangesMap(next);
  };

  const undo = () => {
    if (undoSnap !== null) {
      setChangesMap(undoSnap);
      setUndoSnap(null);
      if (undoTimer.current) clearTimeout(undoTimer.current);
    }
  };

  const save = async () => {
    if (!Object.keys(changesMap).length) return;
    const toSave = [], toDelete = [];
    Object.entries(changesMap).forEach(([sid, st]) => {
      if (st === null || st === '__CLEAR__') toDelete.push(sid);
      else toSave.push({ student_id: sid, status: st });
    });
    setSaving(true);
    setError('');
    try {
      if (toSave.length)
        await attendanceApi.markSubjectAttendance(subjectId, { date: activeDate, records: toSave });
      for (const sid of toDelete) {
        try { await attendanceApi.clearAttendanceRecord(subjectId, sid, activeDate); } catch {}
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setChangesMap({});
      await loadDate(activeDate);
    } catch (e) {
      setError(e.message || 'Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges   = Object.keys(changesMap).length > 0;
  const presentCount = students.filter(s => getEffectiveStatus(s.student_id) === 'present').length;
  const absentCount  = students.filter(s => getEffectiveStatus(s.student_id) === 'absent').length;
  const lateCount    = students.filter(s => getEffectiveStatus(s.student_id) === 'late').length;
  const totalCount   = students.length;
  const monthLabel   = new Date(activeDate + 'T00:00:00').toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="mt-2 space-y-3">

      {/* ── Date navigator ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="text-sm font-bold text-neutral-700">{monthLabel}</span>
          <div className="flex items-center gap-1.5">
            <button onClick={prevWeek}
              className="w-7 h-7 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors active:scale-90">
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => { setActiveDate(todayStr); setWeekStart(fmt(getMonday(new Date()))); }}
              className="px-3 h-7 rounded-full bg-neutral-900 text-white text-[11px] font-bold hover:bg-neutral-700 transition-colors">
              Today
            </button>
            <button onClick={nextWeek} disabled={!canGoNext}
              className="w-7 h-7 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors active:scale-90 disabled:opacity-25">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between px-3 pb-3 gap-1">
          {weekDays.map(d => {
            const dStr = fmt(d);
            const isSel   = dStr === activeDate;
            const isToday = dStr === todayStr;
            const isFut   = dStr > todayStr;
            const dayLbl  = d.toLocaleString('default', { weekday: 'narrow' });
            return (
              <button key={dStr} onClick={() => !isFut && setActiveDate(dStr)} disabled={isFut}
                className={`flex flex-col items-center gap-0.5 flex-1 py-1.5 rounded-xl transition-all duration-200 active:scale-90
                  ${isFut ? 'opacity-25 cursor-not-allowed' : 'cursor-pointer'}
                  ${isSel ? 'bg-neutral-900 shadow-md' : 'hover:bg-neutral-50'}`}>
                <span className={`text-[9px] font-bold uppercase
                  ${isSel ? 'text-white/60' : isToday ? 'text-blue-500' : 'text-neutral-400'}`}>
                  {dayLbl}
                </span>
                <span className={`text-[14px] font-black leading-none
                  ${isSel ? 'text-white' : isToday ? 'text-blue-500' : 'text-neutral-700'}`}>
                  {d.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Stats: donut + count tiles ── */}
      <div className="flex items-center gap-3">
        <DonutRing present={presentCount} total={totalCount} />
        <div className="flex-1 grid grid-cols-3 gap-2">
          {[
            { label: 'Present', count: presentCount, bg: 'bg-emerald-50', text: 'text-emerald-700' },
            { label: 'Absent',  count: absentCount,  bg: 'bg-red-50',     text: 'text-red-700' },
            { label: 'Late',    count: lateCount,    bg: 'bg-amber-50',   text: 'text-amber-700' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl py-2 text-center`}>
              <div className={`text-xl font-black ${s.text} leading-none`}>{s.count}</div>
              <div className="text-[8px] font-bold text-neutral-500 uppercase tracking-wide mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Mark All row with undo ── */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide whitespace-nowrap shrink-0">Mark all</span>
        {[
          { s: 'present', label: '✓ Present', cls: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
          { s: 'absent',  label: '✗ Absent',  cls: 'bg-red-100 text-red-700 hover:bg-red-200' },
          { s: 'late',    label: '⏱ Late',    cls: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
        ].map(({ s, label, cls }) => (
          <button key={s} onClick={() => markAll(s)}
            className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition-colors active:scale-95 ${cls}`}>
            {label}
          </button>
        ))}
        {undoSnap !== null && (
          <button onClick={undo}
            className="px-3 py-2 rounded-xl text-[10px] font-bold bg-neutral-900 text-white whitespace-nowrap animate-pulse shrink-0">
            Undo
          </button>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertTriangle size={14} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Student list ── */}
      {loading ? (
        <div className="space-y-2.5">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 rounded-2xl" />)}
        </div>
      ) : !students.length ? (
        <div className="text-center py-12 bg-white border border-dashed border-neutral-200 rounded-2xl">
          <Users size={28} className="mx-auto mb-2 text-neutral-300" />
          <p className="text-sm text-neutral-400">No students enrolled yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {students.map(student => (
            <StudentRow
              key={student.student_id}
              student={student}
              status={getEffectiveStatus(student.student_id)}
              onChange={status => markStudent(student.student_id, status)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}

      {/* ── Inline save bar (NOT fixed — no overlap with BottomNav) ── */}
      <div
        className="overflow-hidden transition-all duration-500"
        style={{ maxHeight: hasChanges || saved ? 80 : 0, opacity: hasChanges || saved ? 1 : 0 }}
      >
        <div className="mt-1 bg-neutral-900 rounded-2xl px-4 py-3 flex items-center justify-between">
          {saved ? (
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mx-auto">
              <CheckCircle2 size={18} /> Saved successfully
            </div>
          ) : (
            <>
              <div className="flex gap-3 text-sm font-bold">
                <span className="text-emerald-400">{presentCount}P</span>
                <span className="text-amber-400">{lateCount}L</span>
                <span className="text-red-400">{absentCount}A</span>
                <span className="text-neutral-500 text-xs self-center">/ {totalCount}</span>
              </div>
              <button onClick={save} disabled={saving}
                className="bg-white text-neutral-900 px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-neutral-100 transition-colors disabled:opacity-60 active:scale-95">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save
              </button>
            </>
          )}
        </div>
      </div>

    </div>
  );
}

