import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckCircle2, AlertTriangle, Users, Loader2, Calendar as CalendarIcon, Save, ChevronDown
} from 'lucide-react';
import { attendanceApi } from '../../lib/api';
import { Btn, Skeleton, Avatar } from '../ui';

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

// Helper to add days
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export default function AttendanceGrid({ subjectId, onNavigate }) {
  const [activeDate, setActiveDate] = useState(fmt(new Date()));
  const [students, setStudents]     = useState([]);
  const [changesMap, setChangesMap] = useState({}); // student_id -> status ('present', 'absent', 'late', null)
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState('');

  const loadDate = useCallback(async (dateStr) => {
    setLoading(true);
    setError('');
    setChangesMap({}); // clear un-saved changes when switching date
    try {
      const data = await attendanceApi.getSubjectAttendance(subjectId, dateStr);
      setStudents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError('Could not load attendance data.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    loadDate(activeDate);
  }, [activeDate, loadDate]);

  const markStudent = (studentId, status) => {
    setChangesMap(prev => ({ ...prev, [studentId]: status }));
  };

  const markAll = (status) => {
    const newChanges = { ...changesMap };
    students.forEach(s => {
      newChanges[s.student_id] = status;
    });
    setChangesMap(newChanges);
  };

  const save = async () => {
    if (Object.keys(changesMap).length === 0) return;
    
    // Build records array and toDelete array
    const toSave = [];
    const toDelete = [];
    Object.entries(changesMap).forEach(([studentId, status]) => {
      if (status === null || status === '__CLEAR__') {
        toDelete.push(studentId);
      } else {
        toSave.push({ student_id: studentId, status });
      }
    });

    setSaving(true);
    setError('');
    try {
      if (toSave.length > 0) {
        await attendanceApi.markSubjectAttendance(subjectId, { date: activeDate, records: toSave });
      }
      for (const sId of toDelete) {
        try { await attendanceApi.clearAttendanceRecord(subjectId, sId, activeDate); } catch {}
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      setChangesMap({}); // clear local changes
      await loadDate(activeDate); // refresh initial state from server
    } catch (e) {
      setError(e.message || 'Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = Object.keys(changesMap).length > 0;

  // --- Calendar Taskbar Logic ---
  const activeDateObj = useMemo(() => new Date(activeDate + 'T00:00:00'), [activeDate]);
  const monday = useMemo(() => getMonday(activeDateObj), [activeDateObj]);
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(monday, i));
  }, [monday]);

  const monthName = activeDateObj.toLocaleString('default', { month: 'long' });
  const year = activeDateObj.getFullYear();
  const todayStr = fmt(new Date());

  const handleDayClick = (d) => {
    const dateStr = fmt(d);
    // Optional: Prevent selecting future dates if needed, but standard HTML let them select up to today.
    // Actually, in original code `max={fmt(new Date())}` was set. 
    // Let's only allow up to today if we want, or just let them select it. 
    if (dateStr > todayStr) return; // Disallow future attendance marking
    setActiveDate(dateStr);
  };


  // Calculate current effective states for display
  const getEffectiveStatus = (studentId) => {
    if (changesMap[studentId] !== undefined) return changesMap[studentId];
    const s = students.find(s => s.student_id === studentId);
    return s ? s.status : null;
  };

  const presentCount = students.filter(s => getEffectiveStatus(s.student_id) === 'present').length;
  const absentCount = students.filter(s => getEffectiveStatus(s.student_id) === 'absent').length;
  const lateCount = students.filter(s => getEffectiveStatus(s.student_id) === 'late').length;
  const totalCount = students.length;

  return (
    <div className="mt-6 pb-28">

      {/* Calendar Taskbar */}
      <div className="bg-white rounded-[24px] p-5 shadow-sm border border-neutral-100 mb-8">
        <div className="flex justify-between items-center mb-4 relative">
          <label className="flex items-center gap-2 cursor-pointer group relative">
            <input 
              type="date"
              value={activeDate}
              max={todayStr}
              onChange={(e) => {
                if (e.target.value) setActiveDate(e.target.value);
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <span className="text-lg font-bold text-neutral-800">{monthName} {year}</span>
            <CalendarIcon size={18} className="text-neutral-500 group-hover:text-neutral-800 transition-colors" />
          </label>
          <button 
            onClick={() => setActiveDate(todayStr)}
            className="px-4 py-1.5 bg-[#e0f7fa] text-[#00acc1] font-bold rounded-xl text-sm hover:bg-[#b2ebf2] transition-colors"
          >
            Today
          </button>
        </div>

        <div className="flex justify-between items-center px-2 md:px-6">
          {weekDays.map((d, i) => {
            const dStr = fmt(d);
            const isSelected = dStr === activeDate;
            const isToday = dStr === todayStr;
            const isFuture = dStr > todayStr;
            const dayName = d.toLocaleString('default', { weekday: 'short' });
            
            return (
              <button 
                key={dStr}
                onClick={() => handleDayClick(d)}
                disabled={isFuture}
                className={`flex flex-col items-center gap-2 group ${isFuture ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span className={`text-xs font-medium ${isToday ? 'text-[#00acc1]' : 'text-neutral-500'}`}>
                  {dayName}
                </span>
                <div className={`w-10 h-10 flex items-center justify-center rounded-full text-base font-bold transition-all
                  ${isSelected 
                    ? 'bg-[#374151] text-white shadow-md scale-110' 
                    : isToday 
                      ? 'text-[#00acc1] group-hover:bg-neutral-50' 
                      : 'text-neutral-700 group-hover:bg-neutral-50'
                  }`}
                >
                  {d.getDate()}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Actions & Stats mimicking udaya.jpg UI design */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        
        {/* Left side: Quick Actions */}
        <button 
          onClick={() => markAll('present')}
          className="w-full md:w-auto px-6 py-3 bg-[#e5f5e8] text-[#2d7a42] rounded-full text-sm font-bold hover:bg-[#d4ecd9] transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <CheckCircle2 size={18} />
          Mark All Present
        </button>

        {/* Right side: The rounded pill stats from the design */}
        <div className="flex bg-white p-2 rounded-[24px] shadow-sm border border-neutral-100 gap-2 overflow-x-auto scrollbar-hide">
          <div className="flex flex-col items-center justify-center bg-[#e0f7fa] min-w-[80px] py-3 rounded-[20px]">
            <span className="text-2xl font-bold text-[#006064] leading-none mb-1">{totalCount}</span>
            <span className="text-[10px] font-semibold text-[#00838f] uppercase tracking-wider">Total</span>
          </div>
          <div className="flex flex-col items-center justify-center bg-[#e8f5e9] min-w-[80px] py-3 rounded-[20px]">
            <span className="text-2xl font-bold text-[#1b5e20] leading-none mb-1">{presentCount}</span>
            <span className="text-[10px] font-semibold text-[#2e7d32] uppercase tracking-wider">Present</span>
          </div>
          <div className="flex flex-col items-center justify-center bg-[#fce4ec] min-w-[80px] py-3 rounded-[20px]">
            <span className="text-2xl font-bold text-[#880e4f] leading-none mb-1">{absentCount}</span>
            <span className="text-[10px] font-semibold text-[#ad1457] uppercase tracking-wider">Absent</span>
          </div>
        </div>

      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-2xl flex items-center gap-2 text-sm border border-red-100 shadow-sm">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {/* Student List as ultra-rounded floating cards */}
      {loading ? (
        <div className="space-y-4">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20 rounded-[24px]" />)}
        </div>
      ) : !students.length ? (
        <div className="text-center py-14 bg-white/50 border border-white/60 rounded-[32px] text-sm text-neutral-500 shadow-sm mt-6">
          <Users size={28} className="mx-auto mb-2 text-neutral-300" />
          No students enrolled in this subject yet.
        </div>
      ) : (
      <div className="space-y-4">
        {students.map((student) => {
          const currentStatus = getEffectiveStatus(student.student_id);
          
          return (
            <div 
              key={student.student_id} 
              className="bg-white p-3 md:p-4 rounded-[24px] md:rounded-[28px] shadow-sm hover:shadow-md transition-shadow border border-neutral-100 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-5"
            >
              <div 
                className="flex items-center gap-3 md:gap-4 flex-1 cursor-pointer"
                onClick={() => onNavigate && onNavigate(student.student_id)}
              >
                <div className="relative flex-shrink-0">
                  <Avatar src={student.avatar_url} name={student.name} size="lg" className="rounded-[20px]" />
                  {currentStatus === 'present' && <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#4caf50] rounded-full border-2 border-white flex items-center justify-center"><CheckCircle2 size={12} className="text-white"/></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] md:text-base font-bold text-neutral-900 truncate">{student.name}</h3>
                  <p className="text-[11px] md:text-xs font-medium text-neutral-400 mt-0.5 truncate">{student.username}</p>
                </div>
              </div>

              {/* Segmented Toggles styled as soft pills */}
              <div className="flex bg-[#f5f7fa] p-1 md:p-1.5 rounded-[16px] md:rounded-[20px] w-full md:w-auto mt-1 md:mt-0">
                <button
                  onClick={() => markStudent(student.student_id, 'present')}
                  className={`flex-1 md:w-[90px] py-2 md:py-2.5 text-[11px] md:text-xs font-bold rounded-[12px] md:rounded-[16px] transition-all ${
                    currentStatus === 'present' 
                      ? 'bg-[#e8f5e9] text-[#2e7d32] shadow-sm' 
                      : 'text-neutral-500 hover:bg-white/60'
                  }`}
                >
                  Present
                </button>
                <button
                  onClick={() => markStudent(student.student_id, 'late')}
                  className={`flex-1 md:w-[90px] py-2 md:py-2.5 text-[11px] md:text-xs font-bold rounded-[12px] md:rounded-[16px] transition-all ${
                    currentStatus === 'late' 
                      ? 'bg-[#fff8e1] text-[#f57f17] shadow-sm' 
                      : 'text-neutral-500 hover:bg-white/60'
                  }`}
                >
                  Late
                </button>
                <button
                  onClick={() => markStudent(student.student_id, 'absent')}
                  className={`flex-1 md:w-[90px] py-2 md:py-2.5 text-[11px] md:text-xs font-bold rounded-[12px] md:rounded-[16px] transition-all ${
                    currentStatus === 'absent' 
                      ? 'bg-[#fce4ec] text-[#c2185b] shadow-sm' 
                      : 'text-neutral-500 hover:bg-white/60'
                  }`}
                >
                  Absent
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Floating Save Bar styled in UI colors */}
      <div className={`fixed bottom-6 left-0 right-0 z-50 px-4 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${hasChanges || saved ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-24 opacity-0 scale-95'}`}>
        <div className="max-w-md mx-auto bg-white text-neutral-800 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-neutral-100 rounded-full p-2 flex items-center justify-between pl-6">
          
          {saved ? (
             <div className="flex-1 flex items-center justify-center gap-2 text-[#2d7a42] font-bold py-2">
               <CheckCircle2 size={20} /> Attendance Saved Successfully
             </div>
          ) : (
            <>
              <div className="flex gap-4 text-sm font-bold">
                <span className="text-[#2e7d32]">{presentCount} P</span>
                <span className="text-[#f57f17]">{lateCount} L</span>
                <span className="text-[#c2185b]">{absentCount} A</span>
              </div>
              <button 
                onClick={save} 
                disabled={saving}
                className="bg-[#2d7a42] text-white px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-[#1b5e20] transition-colors disabled:opacity-70 shadow-sm"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} strokeWidth={2.5} /> Save</>}
              </button>
            </>
          )}

        </div>
      </div>
      
    </div>
  );
}
