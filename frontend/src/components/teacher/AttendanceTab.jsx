import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2, CheckCircle2, Save, Users, AlertTriangle } from 'lucide-react';
import { attendanceApi } from '../../lib/api';
import { Btn, Skeleton } from '../ui';

function formatDate(date) {
  const d = new Date(date);
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();
  const year = d.getFullYear();
  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;
  return [year, month, day].join('-');
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function getWeekArray(start) {
  const arr = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    arr.push(d);
  }
  return arr;
}

const STATUS_CONFIG = {
  present: { char: 'P', bg: 'bg-green-100 text-green-700 border-green-200', label: 'Present' },
  absent:  { char: 'A', bg: 'bg-red-100 text-red-600 border-red-200',     label: 'Absent'  },
  late:    { char: 'L', bg: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Late'   },
};

function StatusDot({ status }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return <div className="w-8 h-8 rounded-full border border-white/60 bg-white/20" />;
  return (
    <div className={`w-8 h-8 rounded-full border text-xs font-bold flex items-center justify-center ${cfg.bg}`}>
      {cfg.char}
    </div>
  );
}

export default function AttendanceTab({ subjectId, onNavigateToStudent }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [activeDate, setActiveDate] = useState(formatDate(new Date()));
  const [students, setStudents] = useState([]);
  const [changes, setChanges] = useState({});
  const [error, setError] = useState('');

  const loadWeek = async (start) => {
    setLoading(true);
    setError('');
    try {
      const startStr = formatDate(start);
      const data = await attendanceApi.getSubjectAttendanceWeek(subjectId, startStr);
      setStudents(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Failed to load attendance data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWeek(weekStart);
    setChanges({});
  }, [weekStart, subjectId]);

  const weekArray = getWeekArray(weekStart);

  const cycleStatus = (current) => {
    if (!current) return 'present';
    if (current === 'present') return 'absent';
    if (current === 'absent') return 'late';
    return null;
  };

  const handleToggle = (studentId, currentStatus) => {
    const next = cycleStatus(currentStatus);
    setChanges(prev => ({ ...prev, [studentId]: next }));
  };

  const handleMarkAll = (status) => {
    const newChanges = {};
    students.forEach(s => { newChanges[s.student_id] = status; });
    setChanges(newChanges);
  };

  const handleSave = async () => {
    const records = Object.entries(changes)
      .filter(([, status]) => status !== null)
      .map(([student_id, status]) => ({ student_id, status }));

    if (records.length === 0) return;

    setSaving(true);
    setError('');
    try {
      await attendanceApi.markSubjectAttendance(subjectId, { date: activeDate, records });
      setChanges({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await loadWeek(weekStart);
    } catch (err) {
      setError('Failed to save. Please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = Object.keys(changes).length > 0;

  const presentCount = students.filter(s => {
    const status = changes[s.student_id] !== undefined ? changes[s.student_id] : s.days[activeDate];
    return status === 'present';
  }).length;

  const absentCount = students.filter(s => {
    const status = changes[s.student_id] !== undefined ? changes[s.student_id] : s.days[activeDate];
    return status === 'absent';
  }).length;

  if (loading) {
    return (
      <div className="mt-4 space-y-2">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="mt-4 text-center py-16 glass-panel border-dashed border-white/60 rounded-xl text-neutral-500 text-sm">
        <Users size={28} className="mx-auto mb-3 text-neutral-400" />
        No students enrolled. Add students from the standard page.
      </div>
    );
  }

  const today = formatDate(new Date());

  return (
    <div className="mt-4">
      {/* Week nav + save bar */}
      <div className="glass-panel rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={() => {
              const prev = new Date(weekStart);
              prev.setDate(prev.getDate() - 7);
              setWeekStart(prev);
              setActiveDate(formatDate(prev));
            }} className="p-1.5 hover:bg-white/60 rounded-lg transition-colors">
              <ChevronLeft size={18} className="text-neutral-600" />
            </button>
            <span className="text-sm font-medium text-neutral-800">
              {weekArray[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              {' – '}
              {weekArray[6].toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <button onClick={() => {
              const next = new Date(weekStart);
              next.setDate(next.getDate() + 7);
              setWeekStart(next);
              setActiveDate(formatDate(next));
            }} className="p-1.5 hover:bg-white/60 rounded-lg transition-colors">
              <ChevronRight size={18} className="text-neutral-600" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Mark all shortcuts */}
            <button onClick={() => handleMarkAll('present')}
              className="px-2.5 py-1 text-xs rounded-full bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors">
              All P
            </button>
            <button onClick={() => handleMarkAll('absent')}
              className="px-2.5 py-1 text-xs rounded-full bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">
              All A
            </button>

            {saved ? (
              <span className="flex items-center gap-1 text-xs text-green-600 font-medium px-3">
                <CheckCircle2 size={14} /> Saved!
              </span>
            ) : (
              <Btn variant="primary" size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : 'Save'}
              </Btn>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
            <AlertTriangle size={13} /> {error}
          </div>
        )}

        {/* Day tabs */}
        <div className="flex gap-1 mt-4 flex-wrap">
          {weekArray.map((date, i) => {
            const dateStr = formatDate(date);
            const isActive = activeDate === dateStr;
            const isToday = dateStr === today;
            return (
              <button key={i} onClick={() => { setActiveDate(dateStr); setChanges({}); }}
                className={`flex-1 min-w-[48px] flex flex-col items-center py-2 px-1 rounded-xl text-xs font-medium transition-all border
                  ${isActive
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : isToday
                    ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                    : 'text-neutral-500 border-white/60 hover:bg-white/40'}`}>
                <span className="uppercase text-[9px] tracking-wide opacity-70">
                  {date.toLocaleDateString('en-IN', { weekday: 'short' })}
                </span>
                <span className="font-semibold text-sm">{date.getDate()}</span>
              </button>
            );
          })}
        </div>

        {/* Summary for active date */}
        <div className="flex gap-3 mt-3 text-xs text-neutral-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{presentCount} present</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{absentCount} absent</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-neutral-300 inline-block" />{students.length - presentCount - absentCount} unmarked</span>
        </div>
      </div>

      {/* Student list */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_auto_auto] md:grid-cols-[1fr_repeat(7,32px)_auto] items-center gap-2 px-4 py-2 border-b border-white/40 bg-white/30">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Student</span>
          <div className="hidden md:flex gap-2">
            {weekArray.map((date, i) => {
              const dateStr = formatDate(date);
              const isActive = activeDate === dateStr;
              return (
                <span key={i} className={`w-8 text-center text-[10px] font-medium ${isActive ? 'text-neutral-900 font-bold' : 'text-neutral-400'}`}>
                  {date.toLocaleDateString('en-IN', { weekday: 'narrow' })}
                </span>
              );
            })}
          </div>
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider text-right">Overall</span>
        </div>

        {students.map((student, idx) => {
          const overall = student.overall_pct ?? 0;
          const barColor = overall >= 75 ? 'bg-green-500' : overall >= 50 ? 'bg-amber-500' : 'bg-red-500';
          const isLow = overall > 0 && overall < 75;

          return (
            <div key={student.student_id}
              className={`grid grid-cols-[1fr_auto_auto] md:grid-cols-[1fr_repeat(7,32px)_auto] items-center gap-2 px-4 py-3 transition-colors hover:bg-white/30 ${idx > 0 ? 'border-t border-white/40' : ''}`}>

              {/* Name */}
              <button onClick={() => onNavigateToStudent?.(student.student_id)}
                className="text-sm font-medium text-left truncate hover:text-blue-600 transition-colors flex items-center gap-1.5">
                {isLow && <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />}
                {student.student_name}
              </button>

              {/* Week dots (desktop only) */}
              <div className="hidden md:flex gap-2 items-center">
                {weekArray.map((date, i) => {
                  const dateStr = formatDate(date);
                  const isEditing = activeDate === dateStr;
                  const status = isEditing && changes[student.student_id] !== undefined
                    ? changes[student.student_id]
                    : student.days[dateStr] || null;
                  return (
                    <button key={i} disabled={!isEditing}
                      onClick={() => isEditing && handleToggle(student.student_id, status)}
                      className={`w-8 h-8 rounded-full border flex items-center justify-center text-[10px] font-bold transition-all
                        ${isEditing ? 'cursor-pointer hover:scale-110 ring-2 ring-offset-1 ring-neutral-900/20' : 'cursor-default'}
                        ${STATUS_CONFIG[status]?.bg || 'bg-white/30 border-white/60 text-transparent'}`}>
                      {STATUS_CONFIG[status]?.char || '·'}
                    </button>
                  );
                })}
              </div>

              {/* Mobile: today's dot only */}
              <div className="flex md:hidden items-center">
                {(() => {
                  const status = changes[student.student_id] !== undefined
                    ? changes[student.student_id]
                    : student.days[activeDate] || null;
                  return (
                    <button onClick={() => handleToggle(student.student_id, status)}
                      className={`w-9 h-9 rounded-full border text-xs font-bold flex items-center justify-center transition-all hover:scale-110
                        ${STATUS_CONFIG[status]?.bg || 'bg-white/30 border-white/60 text-neutral-400'}`}>
                      {STATUS_CONFIG[status]?.char || '?'}
                    </button>
                  );
                })()}
              </div>

              {/* Overall % */}
              <div className="flex items-center gap-2 justify-end">
                <div className="w-16 h-1.5 rounded-full bg-white/40 overflow-hidden hidden sm:block">
                  <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${overall}%` }} />
                </div>
                <span className={`text-xs font-semibold tabular-nums w-9 text-right ${isLow ? 'text-red-600' : 'text-neutral-700'}`}>
                  {Math.round(overall)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3 text-xs text-neutral-500 px-1">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`w-4 h-4 rounded-full border ${cfg.bg} flex items-center justify-center text-[9px] font-bold`}>{cfg.char}</span>
            {cfg.label}
          </span>
        ))}
        <span className="flex items-center gap-1 text-neutral-400 italic">Tap to cycle P → A → L → clear</span>
      </div>
    </div>
  );
}
