import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, ChevronRight } from 'lucide-react';
import { Avatar } from '../../ui';
import InsightSection from './InsightSection';

function MiniBar({ pct }) {
  const tone = pct >= 70 ? '#22c55e' : pct >= 30 ? '#f59e0b' : '#ef4444';
  return (
    <div className="w-16 shrink-0">
      <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: tone }} />
      </div>
    </div>
  );
}

function SubHead({ label }) {
  return (
    <p className="px-4 pt-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">{label}</p>
  );
}

/** Students behind on videos + recently published videos nobody is watching. */
export default function VideoEngagementCard({ laggards, coldVideos }) {
  const navigate = useNavigate();
  const hasLaggards = laggards && laggards.count > 0;
  const hasCold = coldVideos && coldVideos.count > 0;
  if (!hasLaggards && !hasCold) return null;
  const total = (laggards?.count || 0) + (coldVideos?.count || 0);

  return (
    <InsightSection icon={Video} title="Video engagement" count={total} tone="amber">
      {hasLaggards && (
        <>
          <SubHead label="Falling behind on videos" />
          {laggards.items.map(s => (
            <button key={s.student_id} onClick={() => navigate(`/teacher/students/${s.student_id}`)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 transition-colors border-b border-[#F2F1EE] last:border-0">
              <Avatar name={s.name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.name}</p>
                <p className="text-[11px] text-neutral-400 truncate">{s.standard_name} · {s.videos_watched}/{s.videos_total} watched</p>
              </div>
              <MiniBar pct={s.completion_pct} />
              <span className="text-xs font-bold text-neutral-500 tabular-nums w-9 text-right shrink-0">{s.completion_pct}%</span>
            </button>
          ))}
        </>
      )}
      {hasCold && (
        <>
          <SubHead label="Videos nobody's watching" />
          {coldVideos.items.map(v => (
            <button key={v.video_id}
              onClick={() => navigate(`/teacher/standards/${v.standard_id}/subjects/${v.class_id}?tab=learn`)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 transition-colors border-b border-[#F2F1EE] last:border-0 group">
              <div className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                <Video size={15} className="text-neutral-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{v.title}</p>
                <p className="text-[11px] text-neutral-400 truncate">{v.subject} · {v.watched}/{v.total} students watched</p>
              </div>
              <MiniBar pct={v.watch_pct} />
              <ChevronRight size={15} className="text-neutral-300 group-hover:text-neutral-500 shrink-0" />
            </button>
          ))}
        </>
      )}
    </InsightSection>
  );
}
