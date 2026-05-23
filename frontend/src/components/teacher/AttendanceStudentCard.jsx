import React, { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { attendanceApi } from '../../lib/api';
import { Skeleton } from '../ui';

function Bar({ pct }) {
  const color = pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  const track = pct >= 75 ? 'bg-green-100' : pct >= 50 ? 'bg-amber-100' : 'bg-red-100';
  return (
    <div className={`flex-1 h-2 rounded-full overflow-hidden ${track}`}>
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(2, pct)}%` }} />
    </div>
  );
}

export default function AttendanceStudentCard({ studentId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await attendanceApi.getStudentAttendance(studentId);
        setData(res);
      } catch (err) {
        console.error('Failed to load attendance', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [studentId]);

  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-6 space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (!data || data.overall_pct === null || data.overall_pct === undefined) {
    return (
      <div className="glass-panel rounded-2xl p-6 text-center text-neutral-500 text-sm border-dashed border-white/60">
        No attendance recorded yet.
      </div>
    );
  }

  const overall = parseFloat(data.overall_pct) || 0;
  const isLow = overall < 75;

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Attendance</h3>
        {isLow && (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            <AlertTriangle size={11} /> Below threshold
          </span>
        )}
      </div>

      {isLow && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          Attendance {overall}% is below the 75% threshold.
          Student has been absent <strong>{data.absent_days}</strong> days this month.
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Overall',       value: `${Math.round(overall)}%`, color: isLow ? 'text-red-600' : 'text-green-700', bg: isLow ? 'bg-red-50/60' : 'bg-green-50/60' },
          { label: 'Present total', value: data.by_subject?.reduce((a, s) => a + (s.present || 0), 0) ?? 0, color: 'text-green-700', bg: 'bg-green-50/60' },
          { label: 'Absent (30d)',  value: data.absent_days ?? 0, color: 'text-red-600', bg: 'bg-red-50/60' },
          { label: 'Late (30d)',    value: data.late_days ?? 0, color: 'text-amber-700', bg: 'bg-amber-50/60' },
        ].map((s, i) => (
          <div key={i} className={`${s.bg} border border-white/60 rounded-xl p-3 backdrop-blur-sm`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* By subject */}
      {data.by_subject?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-3">By Subject</h4>
          <div className="space-y-3">
            {data.by_subject.map((sub, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-24 truncate text-xs font-medium text-neutral-700">{sub.subject_name}</span>
                <Bar pct={sub.pct} />
                <span className={`text-xs font-semibold w-10 text-right tabular-nums ${sub.pct < 75 ? 'text-red-600' : 'text-green-700'}`}>{sub.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly trend */}
      {data.by_week?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            Weekly Trend
            {data.by_week.length >= 2 && (
              data.by_week.at(-1).pct > data.by_week.at(-2).pct
                ? <TrendingUp size={14} className="text-green-500" />
                : <TrendingDown size={14} className="text-red-500" />
            )}
          </h4>
          <div className="flex items-end gap-1.5 h-28">
            {data.by_week.map((wk, i) => {
              const barColor = wk.pct >= 75 ? 'bg-green-500' : wk.pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
              const height = `${Math.max(8, wk.pct)}%`;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-neutral-900 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    {wk.pct}%
                  </div>
                  <div className={`w-full rounded-t-sm ${barColor} opacity-80 group-hover:opacity-100 transition-all`} style={{ height }} />
                  <span className="text-[9px] text-neutral-400 mt-1 leading-none">{wk.week}</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-neutral-400 mt-1">
            <span>8 weeks ago</span><span>Latest</span>
          </div>
        </div>
      )}
    </div>
  );
}
