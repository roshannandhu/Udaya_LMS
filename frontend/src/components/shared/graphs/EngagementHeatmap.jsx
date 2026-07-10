import React, { useState } from 'react';
import EmptyChart from './EmptyChart';

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function intensityClass(count) {
  if (count === 0) return 'bg-slate-100 border-slate-200';
  if (count < 3)   return 'bg-teal-100 border-teal-200';
  if (count < 6)   return 'bg-teal-300 border-teal-300';
  return 'bg-teal-600 border-teal-700 shadow-sm shadow-teal-200';
}

export default function EngagementHeatmap({ data = [] }) {
  const [tooltip, setTooltip] = useState(null);

  if (!data.length) {
    return <EmptyChart label="No engagement activity yet" height={260} />;
  }

  // Build a date-keyed lookup
  const countByDate = {};
  data.forEach((d) => {
    if (d.date) countByDate[String(d.date).slice(0, 10)] = d.count || 0;
  });

  // 28-day window ending at the latest date with activity
  const allDates = Object.keys(countByDate).sort();
  const endDateStr = allDates[allDates.length - 1] || localDateKey(new Date());
  const endDate = new Date(`${endDateStr}T00:00:00`);

  // 28 slots, oldest first — 4 columns of 7 rows each
  const slots = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(endDate);
    d.setDate(d.getDate() - (27 - i));
    const key = localDateKey(d);
    return {
      date: key,
      count: countByDate[key] || 0,
      label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    };
  });

  const weeks = [0, 1, 2, 3].map((wi) => slots.slice(wi * 7, (wi + 1) * 7));
  const totalActive = allDates.length;

  return (
    <div className="w-full flex flex-col pt-2 select-none">
      <div className="flex gap-2.5 md:gap-3.5 justify-center">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-2 md:gap-2.5">
            {week.map((slot) => (
              <div
                key={slot.date}
                className={`w-9 h-9 md:w-11 md:h-11 rounded-xl border transition-all cursor-pointer hover:scale-110 active:scale-95 ${intensityClass(slot.count)}`}
                onMouseEnter={() => setTooltip(slot)}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => setTooltip((t) => (t?.date === slot.date ? null : slot))}
                aria-label={`${slot.label}: ${slot.count} activities`}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Tap/hover tooltip */}
      <div className={`mt-3 h-9 flex items-center justify-center transition-opacity duration-150 ${tooltip ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {tooltip && (
          <div className="text-xs font-bold text-slate-700 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100 text-center">
            <span className="text-slate-500">{tooltip.label}</span>
            {' — '}
            <span className={tooltip.count > 0 ? 'text-teal-700' : 'text-slate-400'}>
              {tooltip.count > 0
                ? `${tooltip.count} activit${tooltip.count === 1 ? 'y' : 'ies'}`
                : 'No activity'}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className="text-[11px] font-bold text-slate-400">{totalActive} active day{totalActive === 1 ? '' : 's'} in last 28</span>
        <div className="flex items-center gap-2 text-xs text-slate-500 font-bold">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded bg-slate-100 border border-slate-200" />
            <div className="w-3 h-3 rounded bg-teal-100 border border-teal-200" />
            <div className="w-3 h-3 rounded bg-teal-300" />
            <div className="w-3 h-3 rounded bg-teal-600" />
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
