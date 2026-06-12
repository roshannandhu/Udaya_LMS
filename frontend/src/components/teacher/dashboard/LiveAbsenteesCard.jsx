import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, ChevronRight } from 'lucide-react';
import { Avatar } from '../../ui';
import InsightSection from './InsightSection';

/** Students repeatedly missing live classes (ended classes, last 30 days). */
export default function LiveAbsenteesCard({ data }) {
  const navigate = useNavigate();
  if (!data || data.count === 0) return null;
  return (
    <InsightSection icon={Radio} title="Missed live classes" count={data.count} tone="amber">
      {data.items.map((s, i) => (
        <button key={s.student_id} onClick={() => navigate(`/teacher/students/${s.student_id}`)}
          className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 transition-colors group ${i < data.items.length - 1 ? 'border-b border-[#F2F1EE]' : ''}`}
        >
          <Avatar name={s.name} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{s.name}</p>
            <p className="text-[11px] text-neutral-400 truncate">
              {s.standard_name} · missed {s.missed} of {s.total}
              {s.last_missed_title ? ` · last: ${s.last_missed_title}` : ''}
            </p>
          </div>
          <span className={`text-[10px] font-extrabold rounded-full px-2 py-1 tabular-nums shrink-0 ${
            s.miss_pct >= 75 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
          }`}>
            {s.miss_pct}%
          </span>
          <ChevronRight size={15} className="text-neutral-300 group-hover:text-neutral-500 shrink-0" />
        </button>
      ))}
    </InsightSection>
  );
}
