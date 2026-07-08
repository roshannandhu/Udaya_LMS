import React from 'react';
import EmptyChart from './EmptyChart';

const toneFallbacks = ['#2563EB', '#7C3AED', '#D97706', '#059669'];

export default function LearningSignalBars({ data = [] }) {
  const rows = (data || []).filter((item) => item && item.name);
  const hasAnySignal = rows.some((item) => Number(item.percent || 0) > 0 || item.valueText);

  if (!rows.length || !hasAnySignal) {
    return <EmptyChart label="No learning signals recorded yet" height={280} />;
  }

  return (
    <div className="w-full min-h-[280px] flex flex-col justify-center gap-3">
      {rows.map((item, index) => {
        const pct = Math.max(0, Math.min(100, Number(item.percent || 0)));
        const color = item.color || toneFallbacks[index % toneFallbacks.length];
        return (
          <div
            key={item.key || item.name}
            className="rounded-card border border-slate-100 bg-slate-50/70 p-3 md:p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-950 leading-snug">{item.name}</p>
                {item.caption && (
                  <p className="mt-1 text-[11px] font-semibold text-slate-500 leading-snug">
                    {item.caption}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-black tabular-nums text-slate-950 leading-none">
                  {item.valueText || `${Math.round(pct)}%`}
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {item.unitLabel || 'ready'}
                </p>
              </div>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-slate-100">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
