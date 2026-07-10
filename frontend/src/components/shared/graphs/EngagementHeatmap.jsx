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

const WEEKS = 12;
const DAYS = WEEKS * 7;

export default function EngagementHeatmap({ data = [] }) {
  const [tooltip, setTooltip] = useState(null);

  if (!data.length) {
    return <EmptyChart label="No engagement activity yet" height={220} />;
  }

  // Date-keyed lookup
  const countByDate = {};
  data.forEach((d) => {
    if (d.date) countByDate[String(d.date).slice(0, 10)] = d.count || 0;
  });

  // 84-day window (12 weeks) ending at latest active date
  const allDates = Object.keys(countByDate).sort();
  const endDateStr = allDates[allDates.length - 1] || localDateKey(new Date());
  const endDate = new Date(`${endDateStr}T00:00:00`);

  const slots = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(endDate);
    d.setDate(d.getDate() - (DAYS - 1 - i));
    const key = localDateKey(d);
    return {
      date: key,
      count: countByDate[key] || 0,
      label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      monthAbbr: d.toLocaleDateString(undefined, { month: 'short' }),
      dayOfMonth: d.getDate(),
    };
  });

  const weeks = Array.from({ length: WEEKS }, (_, wi) => slots.slice(wi * 7, (wi + 1) * 7));

  // Show month label on the week that contains the 1st of a new month
  const weekMonthLabel = weeks.map((week) => {
    const monthStart = week.find((s) => s.dayOfMonth === 1);
    return monthStart ? monthStart.monthAbbr : '';
  });

  const totalActive = allDates.filter((d) => (countByDate[d] || 0) > 0).length;

  return (
    <div className="w-full flex flex-col pt-1 select-none">
      <div className="overflow-x-auto pb-1 -mx-1">
        <div className="px-1" style={{ minWidth: '320px' }}>
          {/* Month labels row */}
          <div className="flex gap-1.5 mb-1">
            {weeks.map((_, wi) => (
              <div key={wi} className="w-6 md:w-7 text-[8px] font-black uppercase text-slate-400 text-center leading-none h-3">
                {weekMonthLabel[wi]}
              </div>
            ))}
          </div>

          {/* Heatmap grid — 12 columns × 7 rows */}
          <div className="flex gap-1.5">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1.5">
                {week.map((slot) => (
                  <div
                    key={slot.date}
                    className={`w-6 h-6 md:w-7 md:h-7 rounded-md border transition-all cursor-pointer hover:scale-110 active:scale-95 ${intensityClass(slot.count)}`}
                    onMouseEnter={() => setTooltip(slot)}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => setTooltip((t) => (t?.date === slot.date ? null : slot))}
                    aria-label={`${slot.label}: ${slot.count} activities`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tap/hover tooltip */}
      <div className={`mt-2 h-8 flex items-center justify-center transition-opacity duration-150 ${tooltip ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {tooltip && (
          <div className="text-xs font-bold text-slate-700 bg-slate-50 rounded-xl px-3 py-1.5 border border-slate-100 text-center">
            <span className="text-slate-500">{tooltip.label}</span>
            {' — '}
            <span className={tooltip.count > 0 ? 'text-teal-700' : 'text-slate-400'}>
              {tooltip.count > 0 ? `${tooltip.count} activit${tooltip.count === 1 ? 'y' : 'ies'}` : 'No activity'}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] font-bold text-slate-400">{totalActive} active day{totalActive === 1 ? '' : 's'} in last 12 weeks</span>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-2.5 h-2.5 rounded bg-slate-100 border border-slate-200" />
            <div className="w-2.5 h-2.5 rounded bg-teal-100 border border-teal-200" />
            <div className="w-2.5 h-2.5 rounded bg-teal-300" />
            <div className="w-2.5 h-2.5 rounded bg-teal-600" />
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
