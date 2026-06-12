import React from 'react';
import Card from '../../cards/Card';

/**
 * Section chrome for the dashboard "Class insights" widgets: icon + uppercase
 * title + count pill above a flush Card list — the same visual grammar as the
 * "Needs attention" action center.
 */
export default function InsightSection({ icon: Icon, title, count, tone = 'neutral', children }) {
  const pill = tone === 'red'
    ? 'bg-red-100 text-red-600'
    : tone === 'amber'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-neutral-200/70 text-neutral-600';
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 px-1">
        <Icon size={15} className="text-neutral-500" />
        <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500">{title}</h2>
        {count > 0 && (
          <span className={`text-[11px] font-extrabold rounded-full px-2 py-0.5 tabular-nums ${pill}`}>{count}</span>
        )}
      </div>
      <Card padded={false} className="overflow-hidden">{children}</Card>
    </div>
  );
}
