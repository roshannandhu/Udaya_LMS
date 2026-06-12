import React, { useState } from 'react';
import { TrendingUp, Trophy, Video, FileCheck, ClipboardList } from 'lucide-react';
import { Avatar } from '../../ui';
import Card from '../../cards/Card';

function Bar({ label, value, suffix = '%', color = '#2383E2' }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-neutral-600">{label}</span>
        <span className="text-xs font-extrabold text-neutral-900">{Math.round(value || 0)}{suffix}</span>
      </div>
      <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/**
 * Replaces the old "Class pulse": weekly/monthly activity snapshot from
 * /dashboard/insights (score, attendance, videos, assignments) plus the
 * all-time top students from /dashboard/overview.
 */
export default function PerformanceSnapshotCard({ snapshot, topStudents = [] }) {
  const [period, setPeriod] = useState('weekly');
  const s = snapshot?.[period];

  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 flex items-center gap-2">
          <TrendingUp size={15} /> Class pulse
        </h2>
        {snapshot && (
          <div className="flex items-center gap-0.5 p-0.5 bg-neutral-100/80 rounded-lg">
            {['weekly', 'monthly'].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-2 py-1 text-[11px] font-bold rounded-md capitalize transition-all ${period === p ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'}`}>
                {p === 'weekly' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
        )}
      </div>
      <Card className="flex flex-col gap-4">
        {s ? (
          <>
            <Bar label={`Avg score (${s.attempts} attempt${s.attempts === 1 ? '' : 's'})`} value={s.avg_score} color="#2383E2" />
            <Bar label="Attendance" value={s.attendance_pct} color="#0F7B6C" />
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-pastel-sky border border-black/5 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-pastel-sky-fg mb-0.5"><Video size={12} /><span className="text-[10px] font-extrabold uppercase tracking-wide">Videos</span></div>
                <p className="text-lg font-bold tabular-nums leading-none">{s.videos_completed}</p>
              </div>
              <div className="rounded-xl bg-pastel-cream border border-black/5 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-pastel-cream-fg mb-0.5"><ClipboardList size={12} /><span className="text-[10px] font-extrabold uppercase tracking-wide">Submitted</span></div>
                <p className="text-lg font-bold tabular-nums leading-none">{s.assignments_submitted}</p>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="h-2 rounded-full bg-neutral-100 animate-pulse" />
            <div className="h-2 rounded-full bg-neutral-100 animate-pulse" />
            <div className="h-12 rounded-xl bg-neutral-50 animate-pulse" />
          </div>
        )}
        {topStudents.length > 0 && (
          <div className="pt-1">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400 mb-2 flex items-center gap-1.5">
              <Trophy size={12} /> Top students
            </p>
            <div className="flex flex-col gap-2">
              {topStudents.map((st, i) => (
                // min-w-0 on the row + name: without it a long name's
                // nowrap min-content widens the whole page on phones.
                <div key={st.id} className="flex items-center gap-3 min-w-0">
                  <span className="w-5 text-xs font-extrabold text-neutral-400 text-center flex-shrink-0">{i + 1}</span>
                  <Avatar name={st.name} src={st.avatar_url} size="xs" />
                  <span className="flex-1 min-w-0 text-sm font-medium text-neutral-800 truncate">{st.name}</span>
                  <span className="text-xs font-bold text-neutral-500 flex-shrink-0">{st.points} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
