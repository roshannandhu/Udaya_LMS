import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Copy, ChevronRight } from 'lucide-react';
import { Avatar } from '../../ui';
import InsightSection from './InsightSection';

/**
 * Students whose test answers closely match a topper's — especially identical
 * WRONG answers — combined with anti-cheat events recorded during the attempt.
 * Row click deep-links to the subject's Assess tab with the results sheet open.
 */
export default function CopySuspectsCard({ data }) {
  const navigate = useNavigate();
  if (!data || data.count === 0) return null;
  return (
    <InsightSection icon={Copy} title="Possible answer copying" count={data.count} tone="red">
      {data.items.map((s, i) => (
        <button
          key={`${s.test_id}-${s.student_id}`}
          onClick={() => navigate(`/teacher/standards/${s.standard_id}/subjects/${s.class_id}?tab=assess&test=${s.test_id}`)}
          className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 transition-colors group ${i < data.items.length - 1 ? 'border-b border-[#F2F1EE]' : ''}`}
        >
          <Avatar name={s.student_name} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-sm font-bold text-neutral-900 truncate">{s.student_name}</p>
              {s.flagged && <ShieldAlert size={13} className="text-red-500 shrink-0" title="Anti-cheat flagged" />}
            </div>
            <p className="text-xs text-neutral-500 truncate">
              {s.overlap_pct}% match with {s.matched_with}
              {s.wrong_overlap > 0 ? ` · ${s.wrong_overlap} identical wrong` : ''}
              {s.cheat_event_count > 0 ? ` · ${s.cheat_event_count} cheat event${s.cheat_event_count > 1 ? 's' : ''}` : ''}
            </p>
            <p className="text-[11px] text-neutral-400 truncate mt-0.5">{s.test_title} · {s.subject}</p>
          </div>
          <span className={`text-[10px] font-extrabold uppercase rounded-full px-2 py-1 shrink-0 ${
            s.suspicion === 'high' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
          }`}>
            {s.suspicion}
          </span>
          <ChevronRight size={15} className="text-neutral-300 group-hover:text-neutral-500 shrink-0" />
        </button>
      ))}
    </InsightSection>
  );
}
