import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function mostRecentMonth(daysData, fallback) {
  if (daysData && daysData.length > 0) {
    const lastDate = daysData[daysData.length - 1]?.date;
    if (lastDate) return new Date(`${String(lastDate).slice(0, 7)}-01T00:00:00`);
  }
  return fallback instanceof Date
    ? new Date(fallback.getFullYear(), fallback.getMonth(), 1)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
}

function statusColor(status) {
  switch (status) {
    case 'present': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    case 'absent':  return 'bg-rose-50 border-rose-200 text-rose-700';
    case 'late':    return 'bg-amber-50 border-amber-200 text-amber-700';
    default:        return 'bg-white border-slate-200 text-slate-500';
  }
}

export default function AttendanceCalendar({ month, daysData = [], testDaysData = [] }) {
  const [viewMonth, setViewMonth] = useState(() => mostRecentMonth(daysData, month));

  // Reset to most-recent active month whenever data (period) changes
  useEffect(() => {
    setViewMonth(mostRecentMonth(daysData, month));
  }, [daysData, month]);

  const year = viewMonth.getFullYear();
  const monthIndex = viewMonth.getMonth();
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const byDay = new Map();
  daysData.forEach((item) => {
    const date = String(item.date || '');
    if (date && date.slice(0, 7) !== monthKey) return;
    const day = Number(item.dayNumber || date.slice(8, 10));
    if (Number.isFinite(day) && day >= 1 && day <= daysInMonth) byDay.set(day, { attendance: item });
  });
  testDaysData.forEach((item) => {
    const date = String(item.date || '');
    if (date && date.slice(0, 7) !== monthKey) return;
    const day = Number(item.dayNumber || date.slice(8, 10));
    if (!Number.isFinite(day) || day < 1 || day > daysInMonth) return;
    byDay.set(day, { ...(byDay.get(day) || {}), test: item });
  });

  const visibleDays = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ dayNumber: i + 1, ...(byDay.get(i + 1) || {}) })),
  ];

  const prevMonth = () => setViewMonth(new Date(year, monthIndex - 1, 1));
  const nextMonth = () => {
    const next = new Date(year, monthIndex + 1, 1);
    if (next <= new Date()) setViewMonth(next);
  };
  const nextDisabled = new Date(year, monthIndex + 1, 1) > new Date();

  // Determine oldest and newest available months from data
  const allMonths = [...new Set([
    ...daysData.map((r) => String(r.date || '').slice(0, 7)),
    ...testDaysData.map((r) => String(r.date || '').slice(0, 7)),
  ])].filter(Boolean).sort();
  const oldestMonth = allMonths[0] ? new Date(`${allMonths[0]}-01T00:00:00`) : null;
  const prevDisabled = oldestMonth ? viewMonth <= oldestMonth : false;

  return (
    <div className="flex flex-col w-full gap-4">
      {/* Month navigation header */}
      <div className="flex items-center gap-2">
        <button
          onClick={prevMonth}
          disabled={prevDisabled}
          className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${prevDisabled ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-slate-100 text-slate-500'}`}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 text-center text-sm font-black text-slate-900">
          {viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </div>
        <button
          onClick={nextMonth}
          disabled={nextDisabled}
          className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${nextDisabled ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-slate-100 text-slate-500'}`}
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="text-xs font-bold text-slate-400 text-center -mt-2">
        {byDay.size} active day{byDay.size === 1 ? '' : 's'}
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1.5 text-center w-full text-[10px] md:text-xs text-slate-500 font-bold">
        {DAY_HEADERS.map((d, i) => <div key={`${d}-${i}`}>{d}</div>)}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1.5 md:gap-2 text-center w-full text-xs font-bold">
        {visibleDays.map((d, index) => {
          if (!d) return <div key={`blank-${index}`} className="min-h-[54px] md:min-h-[64px]" />;
          const attendance = d.attendance || {};
          const test = d.test || {};
          return (
            <div
              key={d.dayNumber}
              className={`min-h-[54px] md:min-h-[64px] rounded-xl border p-1.5 md:p-2 transition-all ${statusColor(attendance.status)}`}
              title={[attendance.info, test.testName].filter(Boolean).join(' — ')}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-[11px] md:text-xs font-black tabular-nums">{d.dayNumber}</span>
                {test.hasTest && (
                  <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0 mt-0.5" aria-label="Test day" />
                )}
              </div>
              {test.hasTest && (
                <div className="mt-1 text-[9px] md:text-[10px] leading-tight text-left">
                  <div className="font-extrabold text-blue-700 truncate">
                    {test.score != null ? `${test.score}%` : 'Test'}
                  </div>
                  {test.testName && (
                    <div className="font-semibold text-slate-500 truncate">{test.testName}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
        <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-full bg-emerald-100 border border-emerald-200" /> Present</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-full bg-amber-100 border border-amber-200" /> Late</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-full bg-rose-100 border border-rose-200" /> Absent</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-full bg-blue-600" /> Test</span>
      </div>
    </div>
  );
}
