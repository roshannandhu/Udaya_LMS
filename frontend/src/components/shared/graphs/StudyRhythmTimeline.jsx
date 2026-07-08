import React from 'react';
import EmptyChart from './EmptyChart';

const maxBarHeight = 132;

export default function StudyRhythmTimeline({ data = [] }) {
  const rows = (data || []).filter((item) => item && item.day);
  const hasActivity = rows.some((item) => Number(item.studyScore || 0) > 0);

  if (!rows.length || !hasActivity) {
    return <EmptyChart label="No study rhythm recorded yet" height={280} />;
  }

  return (
    <div className="w-full min-h-[280px] flex flex-col justify-center">
      <div className="flex items-end justify-between gap-2 md:gap-3 pt-2">
        {rows.map((item, index) => {
          const score = Math.max(0, Math.min(100, Number(item.studyScore || 0)));
          const height = Math.max(10, (score / 100) * maxBarHeight);
          return (
            <div key={`${item.date || item.day}-${index}`} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex h-[148px] w-full items-end justify-center rounded-card bg-slate-50 px-1.5 py-2 ring-1 ring-slate-100">
                <div
                  className="w-full max-w-10 rounded-t-xl bg-gradient-to-t from-blue-700 to-cyan-400 shadow-sm"
                  style={{ height }}
                  title={`${item.day}: ${Math.round(score)} activity score`}
                />
              </div>
              <p className="mt-2 text-xs font-black text-slate-900">{item.day}</p>
              <p className="mt-0.5 text-[10px] font-bold text-slate-400 tabular-nums">
                {Math.round(score)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.slice(-2).map((item, index) => (
          <div key={`detail-${item.date || index}`} className="rounded-card border border-slate-100 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">{item.dayDetail || item.day}</p>
              <p className="text-xs font-black text-blue-700">{Math.round(item.studyScore || 0)} score</p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold text-slate-600">
              <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{item.videoMinutes || 0}m video</span>
              <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">{item.tests || 0} tests</span>
              <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{item.assignments || 0} assignments</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-[11px] font-semibold leading-snug text-slate-500">
        Activity score separates learning actions instead of converting tests and assignments into fake minutes.
      </div>
    </div>
  );
}
