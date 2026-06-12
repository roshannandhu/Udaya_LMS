import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, Users, ClipboardList, Video, FileCheck, CheckCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { Avatar, Skeleton } from '../ui';
import { reportApi } from '../../lib/api';

const PERIODS = [
  { id: 'weekly',  label: 'Weekly'  },
  { id: 'monthly', label: 'Monthly' },
  { id: 'overall', label: 'Overall' },
];

const pctTone = (v) =>
  v >= 80 ? 'bg-emerald-100 text-emerald-700'
  : v >= 40 ? 'bg-neutral-100 text-neutral-700'
  : 'bg-red-100 text-red-700';

function DeltaArrow({ delta }) {
  if (delta == null) return <Minus size={13} className="text-neutral-300" />;
  if (delta > 0) return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600">
      <TrendingUp size={13} /> +{delta}
    </span>
  );
  if (delta < 0) return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-red-500">
      <TrendingDown size={13} /> {delta}
    </span>
  );
  return <Minus size={13} className="text-neutral-300" />;
}

function MiniBar({ label, pct, color }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] font-semibold text-neutral-400 w-9 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-bold text-neutral-500 tabular-nums w-8 text-right shrink-0">{pct}%</span>
    </div>
  );
}

/**
 * Shared weekly/monthly/overall performance panel for the teacher portal.
 * Standard mode (no classId): trend chart + per-student score/attendance rows.
 * Subject mode (classId set): adds per-student video % and assignment % bars.
 * Responses are cached per period so toggling never flickers.
 */
export default function PerformancePanel({ standardId, classId }) {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('weekly');
  const [cache, setCache] = useState({});   // period -> response
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // New standard/subject → drop everything cached for the previous one.
  useEffect(() => { setCache({}); setError(null); }, [standardId, classId]);

  useEffect(() => {
    if (!standardId || cache[period]) return;
    let ignore = false;
    setLoading(true);
    setError(null);
    reportApi.performance({ standardId, classId, period })
      .then(d => { if (!ignore) setCache(c => ({ ...c, [period]: d })); })
      .catch(e => { if (!ignore) setError(e?.message || 'Could not load performance'); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [standardId, classId, period, cache]);

  const data = cache[period];
  const trend = useMemo(() => (data?.trend || []).map(t => ({
    ...t,
    avg_score: t.avg_score ?? null,
    attendance_pct: t.attendance_pct ?? null,
  })), [data]);
  const hasTrend = trend.some(t => t.avg_score != null || t.attendance_pct != null);

  const summary = data?.summary;
  const chips = summary ? [
    { icon: ClipboardList, label: 'Avg score',   value: `${summary.avg_score}%` },
    { icon: CheckCircle,   label: 'Attendance',  value: `${summary.avg_attendance}%` },
    { icon: Users,         label: 'Active',      value: summary.active_students },
    { icon: Video,         label: 'Videos done', value: `${summary.video_completion_pct}%` },
    { icon: FileCheck,     label: 'Assignments', value: `${summary.assignment_completion_pct}%` },
  ] : [];

  return (
    <div className="space-y-4">
      {/* Period toggle */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-0.5 p-1 bg-neutral-100/80 rounded-xl">
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${period === p.id ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {loading && data && <span className="text-[11px] font-bold text-neutral-400">Updating…</span>}
      </div>

      {error ? (
        <div className="text-center py-10 text-sm text-red-500 glass-panel rounded-2xl border border-red-100">{error}</div>
      ) : !data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
          {/* Summary chips */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {chips.map(c => (
              <div key={c.label} className="glass-panel rounded-xl border border-white/60 px-3 py-2.5 min-w-0">
                <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
                  <c.icon size={12} />
                  <span className="text-[10px] font-semibold uppercase tracking-wide truncate">{c.label}</span>
                </div>
                <p className="text-lg font-bold tabular-nums leading-none">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Trend */}
          <div className="glass-panel rounded-2xl border border-white/60 p-4">
            <p className="text-xs font-semibold text-neutral-500 mb-3">
              Score & attendance trend {period === 'weekly' ? '(last 7 days)' : period === 'monthly' ? '(last 4 weeks)' : '(last 8 weeks)'}
            </p>
            <div className="h-52">
              {hasTrend ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#737373' }} dy={8} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#737373' }} />
                    <RechartsTooltip
                      cursor={{ stroke: '#e5e5e5' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                    <Line type="monotone" dataKey="avg_score" name="Avg Score (%)" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="attendance_pct" name="Attendance (%)" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-neutral-400">
                  No activity in this period yet
                </div>
              )}
            </div>
          </div>

          {/* Per-student rows */}
          <div className="glass-panel rounded-2xl border border-white/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EFEDEA] flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-500">Students ({data.students.length})</p>
              {period !== 'overall' && (
                <p className="text-[10px] text-neutral-400">Δ vs previous {period === 'weekly' ? 'week' : 'month'}</p>
              )}
            </div>
            {data.students.length === 0 ? (
              <div className="py-10 text-center text-sm text-neutral-400">No students in this class yet</div>
            ) : (
              <div className="divide-y divide-[#EFEDEA]">
                {data.students.map(s => (
                  <button key={s.student_id} onClick={() => navigate(`/teacher/students/${s.student_id}`)}
                    className="w-full text-left px-4 py-3 hover:bg-white/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar src={s.avatar_url} name={s.name} size="sm" />
                      <p className="flex-1 text-sm font-medium truncate">{s.name}</p>
                      <DeltaArrow delta={s.delta_score} />
                      {s.has_tests ? (
                        <span className={`inline-flex items-center justify-center w-11 h-6 text-xs font-bold rounded-md tabular-nums ${pctTone(s.avg_score)}`}>
                          {Math.round(s.avg_score)}%
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-11 h-6 text-xs font-bold rounded-md bg-neutral-50 text-neutral-400" title="No tests in this period">—</span>
                      )}
                    </div>
                    {classId ? (
                      <div className="mt-2 ml-11 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1">
                        <MiniBar label="Score" pct={s.has_tests ? Math.round(s.avg_score) : 0} color="#6366f1" />
                        <MiniBar label="Video" pct={s.video_pct} color="#0ea5e9" />
                        <MiniBar label="Asgmt" pct={s.assignment_pct} color="#f59e0b" />
                      </div>
                    ) : (
                      <div className="mt-1.5 ml-11 flex items-center gap-4 text-[11px] text-neutral-500">
                        <span>{s.tests_taken} test{s.tests_taken === 1 ? '' : 's'}</span>
                        <span>{s.has_attendance ? `${Math.round(s.attendance_pct)}% attendance` : 'No attendance yet'}</span>
                        <span className="ml-auto font-semibold tabular-nums">{s.points} pts</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
