import React from 'react';

export default function EmptyChart({ label = 'No report data yet', height = 220 }) {
  return (
    <div
      className="w-full rounded-card border border-dashed border-slate-200 bg-slate-50/80 flex items-center justify-center px-6 text-center text-sm font-bold text-slate-400"
      style={{ minHeight: height }}
    >
      {label}
    </div>
  );
}
