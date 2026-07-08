import React from 'react';

export default function AttendanceCalendar({ month, daysData = [], testDaysData = [] }) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byDay = new Map();
  const viewMonth = month instanceof Date ? month : new Date();
  const year = viewMonth.getFullYear();
  const monthIndex = viewMonth.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  daysData.forEach((item, index) => {
    const day = Number(item.dayNumber || String(item.date || '').slice(8, 10) || index + 1);
    if (Number.isFinite(day)) byDay.set(day, { attendance: item });
  });

  testDaysData.forEach((item, index) => {
    const day = Number(item.dayNumber || String(item.date || '').slice(8, 10) || index + 1);
    if (!Number.isFinite(day)) return;
    const existing = byDay.get(day) || {};
    byDay.set(day, { ...existing, test: item });
  });

  const visibleDays = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const dayNumber = index + 1;
      return { dayNumber, ...(byDay.get(dayNumber) || {}) };
    }),
  ];
  
  const getStatusColor = (status) => {
    switch(status) {
      case 'present': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      case 'absent': return 'bg-rose-50 border-rose-200 text-rose-700';
      case 'late': return 'bg-amber-50 border-amber-200 text-amber-700';
      case 'holiday': return 'bg-slate-100 border-slate-200 text-slate-500';
      default: return 'bg-white border-slate-200 text-slate-500';
    }
  };

  return (
    <div className="flex flex-col w-full gap-4">
      <div className="grid grid-cols-7 gap-1.5 text-center w-full text-[10px] md:text-xs text-slate-500 font-bold">
        {days.map((d, index) => <div key={`${d}-${index}`}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5 md:gap-2 text-center w-full text-xs font-bold">
        {visibleDays.map((d, index) => {
          if (!d) return <div key={`blank-${index}`} className="min-h-[54px] md:min-h-[64px]" />;
          const attendance = d.attendance || {};
          const test = d.test || {};
          return (
            <div key={d.dayNumber} className={`min-h-[54px] md:min-h-[64px] rounded-2xl border p-1.5 md:p-2 transition-all ${getStatusColor(attendance.status)}`} title={[attendance.info, test.testName].filter(Boolean).join(' - ')}>
              <div className="flex items-start justify-between gap-1">
                <span className="text-[11px] md:text-xs font-black tabular-nums">{d.dayNumber}</span>
                {test.hasTest && (
                  <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0 mt-1" aria-label="Test day" />
                )}
              </div>
              {test.hasTest && (
                <div className="mt-1 text-[9px] md:text-[10px] leading-tight text-left">
                  <div className="font-extrabold text-blue-700 truncate">{test.score ? `${test.score}%` : 'Test'}</div>
                  {test.testName && <div className="font-semibold text-slate-500 truncate">{test.testName}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
        <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-full bg-emerald-100 border border-emerald-200" /> Present</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-full bg-amber-100 border border-amber-200" /> Late</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-full bg-rose-100 border border-rose-200" /> Absent</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-full bg-blue-600" /> Test</span>
      </div>
    </div>
  );
}
