import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ChevronRight } from 'lucide-react';
import InsightSection from './InsightSection';

const fmtDue = (iso) => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** Per-assignment submission gaps — who still hasn't turned it in. */
export default function AssignmentStatusCard({ data }) {
  const navigate = useNavigate();
  if (!data || data.count === 0) return null;
  return (
    <InsightSection icon={ClipboardList} title="Assignment submissions" count={data.count} tone="amber">
      {data.items.map((a, i) => {
        const pct = a.total ? Math.round((a.submitted / a.total) * 100) : 0;
        return (
          <button key={a.assignment_id}
            onClick={() => navigate(`/teacher/standards/${a.standard_id}/subjects/${a.class_id}?tab=assess`)}
            className={`w-full px-4 py-3 text-left hover:bg-neutral-50 transition-colors group ${i < data.items.length - 1 ? 'border-b border-[#F2F1EE]' : ''}`}
          >
            <div className="flex items-center gap-2 min-w-0 mb-1.5">
              <p className="flex-1 text-sm font-bold text-neutral-900 truncate">{a.title}</p>
              {a.overdue && (
                <span className="text-[10px] font-extrabold uppercase bg-red-100 text-red-600 rounded-full px-2 py-0.5 shrink-0">
                  Overdue · {a.missing_count} missing
                </span>
              )}
              <ChevronRight size={15} className="text-neutral-300 group-hover:text-neutral-500 shrink-0" />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${a.overdue ? 'bg-red-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-bold text-neutral-500 tabular-nums shrink-0">{a.submitted}/{a.total}</span>
            </div>
            <p className="text-[11px] text-neutral-400 truncate mt-1">
              {a.subject}
              {a.due_date ? ` · due ${fmtDue(a.due_date)}` : ''}
              {a.missing_preview?.length > 0 ? ` · missing: ${a.missing_preview.join(', ')}${a.missing_count > a.missing_preview.length ? '…' : ''}` : ''}
            </p>
          </button>
        );
      })}
    </InsightSection>
  );
}
