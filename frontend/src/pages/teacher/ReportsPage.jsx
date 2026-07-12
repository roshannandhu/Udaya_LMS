import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Trophy, Download, AlertTriangle, Users, BookOpen, Clock, CheckCircle, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import QuadrantScatter from '../../components/shared/QuadrantScatter';
import { Avatar, Btn, Skeleton } from '../../components/ui';
import StatCard from '../../components/cards/StatCard';
import { apiClient } from '../../lib/api';
import { useAppCache } from '../../store';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import SubjectIcon from '../../components/shared/SubjectIcon';
import LeaderboardPanel from '../../components/shared/LeaderboardPanel';
import StudentReportModal from '../../components/teacher/StudentReportModal';

export default function ReportsPage() {
  const navigate = useNavigate();

  const standards       = useAppCache(s => s.standards);
  const standardsReady  = useAppCache(s => s.standardsReady);
  const refreshStandards = useAppCache(s => s.refreshStandards);
  
  const [activeStd, setActiveStd] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [reportStudentId, setReportStudentId] = useState(null);

  const loadingStandards = !standardsReady;

  useEffect(() => {
    if (standards.length > 0 && !activeStd) setActiveStd(standards[0].id);
  }, [standards, activeStd]);

  useEffect(() => {
    refreshStandards();
  }, [refreshStandards]);

  useEffect(() => {
    if (!activeStd) return;
    let alive = true;   // ignore responses for a standard the user has already switched away from
    const load = async () => {
      setLoadingData(true);
      setLoadError(null);
      setAnalytics(null);   // never show the previous standard's numbers while loading
      try {
        const data = await apiClient(`/reports/standard/${activeStd}/analytics`);
        if (alive) setAnalytics(data);
      } catch (err) {
        console.error(err);
        if (alive) setLoadError(err?.message || 'Could not load analytics for this standard.');
      } finally {
        if (alive) setLoadingData(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [activeStd]);

  // Live refresh: silently re-pull the current standard's analytics on focus /
  // visibility / data-changed (e.g. students just submitted) — no skeleton flash.
  useAutoRefresh(() => {
    if (!activeStd) return;
    apiClient(`/reports/standard/${activeStd}/analytics`).then(setAnalytics).catch(() => {});
  });

  const handleExportPDF = async () => {
    if (!analytics || !currentStd) return;
    try {
      const { buildClassAnalyticsPdf } = await import('../../lib/reportPdf');
      await buildClassAnalyticsPdf({ analytics, standardName: currentStd.name });
    } catch (e) {
      console.error('Failed to generate PDF', e);
      alert('Failed to generate PDF: ' + e.message);
    }
  };

  const currentStd = standards.find(s => s.id === activeStd);
  const overview = analytics?.overview || { total_students: 0, avg_score: 0, avg_attendance: 0, total_points: 0 };
  const students = analytics?.students || [];
  const subjectPerf = analytics?.subject_performance || [];
  const recentTests = analytics?.recent_tests || [];
  
  // Only students with actual data can be at risk — a brand-new student with no
  // tests and no attendance is "no data yet", not "failing everything".
  const isAtRisk = (s) =>
    (s.has_attendance && (s.attendance_pct || 0) < 75) ||
    (s.has_tests && (s.avg_score || 0) < 40);
  const atRiskCount = students.filter(isAtRisk).length;

  // Score distribution — bucketed by band from existing students array
  const scoreBands = (() => {
    const bands = [
      { band: '< 40%', count: 0, color: '#EF4444' },
      { band: '40–60%', count: 0, color: '#F59E0B' },
      { band: '60–80%', count: 0, color: '#6366F1' },
      { band: '80%+', count: 0, color: '#10B981' },
    ];
    students.filter((s) => s.has_tests).forEach((s) => {
      const score = Math.round(s.avg_score || 0);
      const idx = score < 40 ? 0 : score < 60 ? 1 : score < 80 ? 2 : 3;
      bands[idx].count++;
    });
    return bands;
  })();

  // Performance scatter — score vs attendance per student
  const scatterStudents = students
    .filter((s) => s.has_tests || s.has_attendance)
    .map((s) => ({
      name: s.name,
      x: Math.round(s.attendance_pct || 0),
      y: Math.round(s.avg_score || 0),
      risk: isAtRisk(s),
      id: s.id,
    }));



  return (
    <div>
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-3 md:px-8 py-3 flex items-center gap-3 max-w-6xl mx-auto">
          <button onClick={() => navigate('/teacher/more')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-md transition-colors">
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg md:text-xl font-semibold flex-1">Standard Analytics</h1>
          <Btn variant="default" size="sm" icon={Download} onClick={handleExportPDF} disabled={!analytics}>
            Export PDF
          </Btn>
        </div>
      </div>

      <div className="px-3 md:px-8 py-4 md:py-6 max-w-6xl mx-auto space-y-4 md:space-y-8 pb-20">
        
        {/* Standard Selector */}
        {loadingStandards ? (
          <div className="flex gap-2">
            {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {standards.map(s => (
              <button key={s.id} onClick={() => setActiveStd(s.id)}
                className={`px-4 py-1.5 text-sm rounded-full font-medium transition-all border ${
                  activeStd === s.id
                    ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                    : 'text-neutral-600 border-white/60 glass-panel hover:bg-[#F4F2EF]'
                }`}>
                <span className="inline-flex items-center gap-1.5"><SubjectIcon value={s.emoji} size={14} fallback="graduation" />{s.name}</span>
              </button>
            ))}
          </div>
        )}

        {standards.length === 0 && !loadingStandards && (
          <div className="text-center py-12 text-neutral-400">
            No classes assigned.
          </div>
        )}

        {loadingData ? (
          /* Full-layout skeleton so the page doesn't collapse/jump while loading */
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
              <Skeleton className="md:col-span-2 h-52 md:h-80 rounded-xl md:rounded-2xl" />
              <Skeleton className="h-52 md:h-80 rounded-xl md:rounded-2xl" />
            </div>
            <Skeleton className="h-48 md:h-64 rounded-xl md:rounded-2xl" />
          </>
        ) : loadError ? (
          <div className="text-center py-16 glass-panel rounded-2xl border border-red-100">
            <AlertTriangle size={28} className="mx-auto mb-3 text-red-400" />
            <p className="font-medium text-neutral-700 mb-1">Couldn't load analytics</p>
            <p className="text-sm text-neutral-500 mb-4">{loadError}</p>
            <Btn variant="primary" size="sm" onClick={() => { const std = activeStd; setActiveStd(null); setTimeout(() => setActiveStd(std), 0); }}>
              Try again
            </Btn>
          </div>
        ) : analytics ? (
          <>
            {/* ══ MOBILE MOSAIC LAYOUT ══════════════════════════════════════ */}
            <div className="md:hidden space-y-3">

              {/* 1. KPI chips row — scrollable, compact */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                {[
                  { label: 'Students',   value: overview.total_students,       bg: 'bg-blue-50',    fg: 'text-blue-700' },
                  { label: 'Avg Score',  value: `${overview.avg_score}%`,      bg: 'bg-emerald-50', fg: 'text-emerald-700' },
                  { label: 'Attendance', value: `${overview.avg_attendance}%`, bg: 'bg-violet-50',  fg: 'text-violet-700' },
                  { label: 'At Risk',    value: atRiskCount,                   bg: atRiskCount > 0 ? 'bg-red-50' : 'bg-neutral-100', fg: atRiskCount > 0 ? 'text-red-700' : 'text-neutral-400' },
                ].map(({ label, value, bg, fg }) => (
                  <div key={label} className={`flex-shrink-0 flex flex-col items-center px-4 py-2.5 rounded-2xl ${bg} min-w-[72px]`}>
                    <span className={`text-xl font-bold leading-none ${fg}`}>{value}</span>
                    <span className={`text-[10px] font-medium mt-1 ${fg} opacity-80`}>{label}</span>
                  </div>
                ))}
              </div>

              {/* 2. Subject Performance — full-width */}
              <div className="glass-panel p-3 rounded-xl border border-white/60">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1 bg-indigo-100 text-indigo-600 rounded-lg"><BarChart3 size={14} /></div>
                  <h2 className="font-semibold text-sm">Subject Performance</h2>
                </div>
                <div className="h-44">
                  {subjectPerf.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={subjectPerf} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                        <XAxis dataKey="subject_name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#737373' }} dy={6} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#737373' }} />
                        <RechartsTooltip cursor={{ fill: '#f5f5f5' }} contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 11 }} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                        <Bar dataKey="avg_score" name="Score %" fill="#6366f1" radius={[4,4,0,0]} barSize={24} />
                        <Bar dataKey="avg_attendance" name="Attend %" fill="#14b8a6" radius={[4,4,0,0]} barSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-neutral-400 text-sm">No subject data</div>
                  )}
                </div>
              </div>

              {/* 3. Score Dist + Recent Tests — 2-col equal */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="glass-panel p-2.5 rounded-xl border border-white/60">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="p-1 bg-violet-100 text-violet-600 rounded-md"><BarChart3 size={12} /></div>
                    <h2 className="font-semibold text-[11px]">Score Dist.</h2>
                  </div>
                  <div className="h-28">
                    {students.filter(s => s.has_tests).length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={scoreBands} barSize={28} margin={{ top: 4, right: 2, left: -24, bottom: 0 }}>
                          <XAxis dataKey="band" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#737373' }} />
                          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#737373' }} width={20} />
                          <RechartsTooltip cursor={{ fill: '#f5f5f5' }} contentStyle={{ borderRadius: '8px', border: 'none', fontSize: 10 }} formatter={(v) => [`${v}`, 'Count']} />
                          <Bar dataKey="count" radius={[4,4,0,0]}>
                            {scoreBands.map((band, idx) => <Cell key={idx} fill={band.color} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-neutral-400 text-xs">No data yet</div>
                    )}
                  </div>
                </div>
                <div className="glass-panel p-2.5 rounded-xl border border-white/60 flex flex-col">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="p-1 bg-orange-100 text-orange-600 rounded-md"><Clock size={12} /></div>
                    <h2 className="font-semibold text-[11px]">Recent Tests</h2>
                  </div>
                  {recentTests.length > 0 ? (
                    <div className="flex-1 space-y-1.5 overflow-hidden">
                      {recentTests.slice(0, 3).map(t => (
                        <div key={t.test_id} className="p-1.5 bg-white/50 rounded-lg border border-[#EFEDEA]">
                          <p className="font-medium text-[10px] text-neutral-900 truncate">{t.title}</p>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-[9px] text-neutral-500 truncate">{t.subject_name}</span>
                            {t.avg_score != null ? (
                              <span className={`text-[9px] font-bold px-1 rounded ${t.avg_score >= 70 ? 'bg-emerald-100 text-emerald-700' : t.avg_score >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{t.avg_score}%</span>
                            ) : <span className="text-[9px] text-neutral-400">—</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-neutral-400 text-xs">No tests</div>
                  )}
                </div>
              </div>

              {/* 4. Asymmetric: At-Risk tall left + Scatter+chips stacked right */}
              {students.length > 0 && (
                <div className="flex gap-2.5" style={{ minHeight: 280 }}>
                  {/* Left: At-Risk list (tall, fixed width ~46%) */}
                  <div className="w-[46%] flex-shrink-0 glass-panel p-2.5 rounded-xl border border-red-100 bg-red-50/25 flex flex-col">
                    <div className="flex items-center gap-1 mb-2">
                      <div className="p-1 bg-red-100 text-red-600 rounded-md"><AlertTriangle size={12} /></div>
                      <h2 className="font-semibold text-[11px] text-red-800">At Risk</h2>
                      {atRiskCount > 0 && <span className="ml-auto px-1.5 py-0.5 bg-red-100 text-red-700 text-[9px] font-bold rounded-full">{atRiskCount}</span>}
                    </div>
                    {atRiskCount > 0 ? (
                      <div className="flex-1 space-y-1.5 overflow-hidden">
                        {students.filter(isAtRisk).slice(0, 5).map(s => (
                          <div key={s.id} onClick={() => setReportStudentId(s.id)}
                            className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-red-100 cursor-pointer active:bg-red-50">
                            <Avatar src={s.avatar_url} name={s.name} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-[10px] text-neutral-900 truncate">{s.name}</p>
                              <div className="flex gap-1 mt-0.5 flex-wrap">
                                {s.has_tests && (s.avg_score || 0) < 40 && (
                                  <span className="text-[8px] font-bold px-1 rounded bg-red-100 text-red-700">{Math.round(s.avg_score || 0)}%</span>
                                )}
                                {s.has_attendance && (s.attendance_pct || 0) < 75 && (
                                  <span className="text-[8px] font-bold px-1 rounded bg-orange-100 text-orange-700">{Math.round(s.attendance_pct || 0)}%</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {atRiskCount > 5 && <p className="text-[9px] text-neutral-400 text-center mt-1">+{atRiskCount - 5} more below</p>}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center">
                        <span className="text-2xl mb-1">🎉</span>
                        <p className="text-[10px] text-emerald-700 font-medium text-center">All on track</p>
                      </div>
                    )}
                  </div>

                  {/* Right: Scatter (top, flex-1) + mini-stat chips (bottom, fixed) */}
                  <div className="flex-1 flex flex-col gap-2.5 min-w-0">
                    <div className="flex-1 glass-panel p-2.5 rounded-xl border border-white/60 flex flex-col min-h-0">
                      <div className="flex items-center gap-1 mb-1">
                        <div className="p-1 bg-teal-100 text-teal-600 rounded-md"><Users size={11} /></div>
                        <h2 className="font-semibold text-[11px]">Score vs Attend.</h2>
                      </div>
                      <div className="flex-1" style={{ minHeight: 120 }}>
                        <QuadrantScatter students={scatterStudents} onSelect={(id) => setReportStudentId(id)} compact />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 flex-shrink-0">
                      {[
                        { label: 'Stars',     count: students.filter(s => (s.attendance_pct||0) >= 75 && (s.avg_score||0) >= 40).length, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                        { label: 'Need help', count: students.filter(isAtRisk).length,                                                    color: 'text-orange-700',  bg: 'bg-orange-50' },
                      ].map(({ label, count, color, bg }) => (
                        <div key={label} className={`${bg} rounded-lg px-2 py-1.5 text-center`}>
                          <p className={`text-sm font-bold ${color}`}>{count}</p>
                          <p className={`text-[9px] font-medium ${color} opacity-80`}>{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 5. Leaderboard — full-width */}
              <div className="glass-panel p-3 rounded-xl border border-white/60">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1 bg-amber-100 text-amber-600 rounded-lg"><Trophy size={14} /></div>
                  <h2 className="font-semibold text-sm">Leaderboard</h2>
                </div>
                <LeaderboardPanel standardId={activeStd} onSelect={(s) => setReportStudentId(s.id)} />
              </div>

              {/* 6. Student Roster — card list */}
              <div className="glass-panel rounded-xl border border-white/60 overflow-hidden">
                <div className="p-3 border-b border-[#EFEDEA] flex items-center gap-2">
                  <div className="p-1 bg-rose-100 text-rose-600 rounded-lg"><Users size={14} /></div>
                  <h2 className="font-semibold text-sm">Student Roster</h2>
                  <span className="ml-auto text-xs text-neutral-400">{students.length}</span>
                </div>
                <div className="divide-y divide-[#EFEDEA]">
                  {[...students].sort((a,b) => (b.avg_score||0) - (a.avg_score||0)).map(s => (
                    <div key={s.id} onClick={() => setReportStudentId(s.id)}
                      className="flex items-center gap-3 px-3 py-2.5 active:bg-neutral-50 cursor-pointer">
                      <Avatar src={s.avatar_url} name={s.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-neutral-900 truncate">{s.name}</p>
                        {isAtRisk(s) && <p className="text-[10px] font-semibold text-red-500">Needs attention</p>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {s.has_tests ? (
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${(s.avg_score||0)>=80?'bg-emerald-100 text-emerald-700':(s.avg_score||0)>=40?'bg-neutral-100 text-neutral-600':'bg-red-100 text-red-700'}`}>{Math.round(s.avg_score||0)}%</span>
                        ) : <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-neutral-50 text-neutral-400">—</span>}
                        {s.has_attendance ? (
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${(s.attendance_pct||0)>=90?'bg-emerald-100 text-emerald-700':(s.attendance_pct||0)>=75?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>{Math.round(s.attendance_pct||0)}%</span>
                        ) : <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-neutral-50 text-neutral-400">—</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* ══ DESKTOP LAYOUT ════════════════════════════════════════════ */}
            <div className="hidden md:block md:space-y-8">

              {/* KPI Cards */}
              <motion.div
                className="grid grid-cols-4 gap-4"
                initial="hidden" animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
              >
                {[
                  <StatCard key="students" label="Total Students" value={overview.total_students} icon={Users} color="bg-blue-100 text-blue-700" />,
                  <StatCard key="score" label="Avg Score" value={`${overview.avg_score}%`} icon={Trophy} color="bg-emerald-100 text-emerald-700" />,
                  <StatCard key="attend" label="Avg Attendance" value={`${overview.avg_attendance}%`} icon={CheckCircle} color="bg-violet-100 text-violet-700" />,
                  <div key="risk" className="glass-panel p-4 rounded-2xl flex flex-col justify-between border border-red-100 bg-red-50/30 relative overflow-hidden">
                    <div className="flex items-center justify-between z-10">
                      <p className="text-sm font-medium text-red-800">At-Risk Students</p>
                      <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                        <AlertTriangle size={16} />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold text-red-700 mt-2 z-10">{atRiskCount}</h3>
                  </div>,
                ].map((card, i) => (
                  <motion.div key={i} variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22,1,0.36,1] } } }}>
                    {card}
                  </motion.div>
                ))}
              </motion.div>

              {/* At-risk student cards */}
              {atRiskCount > 0 && (
                <div className="glass-panel p-5 rounded-2xl border border-red-100 bg-red-50/25">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-red-100 text-red-600 rounded-lg"><AlertTriangle size={16} /></div>
                    <h2 className="font-semibold">Requires Attention</h2>
                    <span className="ml-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">{atRiskCount}</span>
                    <span className="ml-auto text-xs text-neutral-400">Click to open student report</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {students.filter(isAtRisk).slice(0, 6).map(s => (
                      <div key={s.id} onClick={() => setReportStudentId(s.id)}
                        className="flex items-center gap-3 p-3 bg-white rounded-xl border border-red-100 cursor-pointer hover:shadow-sm hover:border-red-200 transition-all">
                        <Avatar src={s.avatar_url} name={s.name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-neutral-900 truncate">{s.name}</p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {s.has_tests && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${(s.avg_score||0)<40?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-700'}`}>{Math.round(s.avg_score||0)}% score</span>}
                            {s.has_attendance && (s.attendance_pct||0) < 75 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">{Math.round(s.attendance_pct||0)}% present</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {atRiskCount > 6 && <p className="text-xs text-neutral-400 mt-3 text-center">+{atRiskCount - 6} more in the roster below</p>}
                </div>
              )}

              {/* Subject Performance + Recent Assessments */}
              <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 glass-panel p-5 rounded-2xl border border-white/60">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg"><BarChart3 size={16} /></div>
                    <h2 className="font-semibold">Subject Performance</h2>
                  </div>
                  <div className="h-64">
                    {subjectPerf.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={subjectPerf} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                          <XAxis dataKey="subject_name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} />
                          <RechartsTooltip cursor={{ fill: '#f5f5f5' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                          <Bar dataKey="avg_score" name="Avg Score (%)" fill="#6366f1" radius={[4,4,0,0]} barSize={32} />
                          <Bar dataKey="avg_attendance" name="Avg Attendance (%)" fill="#14b8a6" radius={[4,4,0,0]} barSize={32} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-neutral-400 text-sm">No subject data available</div>
                    )}
                  </div>
                </div>
                <div className="glass-panel p-5 rounded-2xl border border-white/60 flex flex-col">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-orange-100 text-orange-600 rounded-lg"><Clock size={16} /></div>
                    <h2 className="font-semibold">Recent Assessments</h2>
                  </div>
                  {recentTests.length > 0 ? (
                    <div className="flex-1 space-y-4">
                      {recentTests.map(t => (
                        <div key={t.test_id} className="p-3 bg-white/50 rounded-xl border border-[#EFEDEA]">
                          <div className="flex justify-between items-start mb-1">
                            <p className="font-medium text-sm text-neutral-900 truncate pr-2">{t.title}</p>
                            {t.avg_score == null ? (
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 whitespace-nowrap">No attempts</span>
                            ) : (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${t.avg_score>=70?'bg-emerald-100 text-emerald-700':t.avg_score>=40?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>{t.avg_score}% Avg</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-xs text-neutral-500 mt-2">
                            <span className="flex items-center gap-1"><BookOpen size={12}/> {t.subject_name}</span>
                            <span>{t.participation}% Participation</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">No recent tests</div>
                  )}
                </div>
              </div>

              {/* Score Distribution + Scatter */}
              {students.length > 0 && (
                <div className="grid grid-cols-2 gap-6">
                  <div className="glass-panel p-5 rounded-2xl border border-white/60">
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      <div className="p-1.5 bg-violet-100 text-violet-600 rounded-lg"><BarChart3 size={14} /></div>
                      <h2 className="font-semibold">Score Distribution</h2>
                      <span className="ml-auto text-xs text-neutral-400">{students.filter(s => s.has_tests).length} students</span>
                    </div>
                    <div className="h-52">
                      {students.filter(s => s.has_tests).length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={scoreBands} barSize={44} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                            <XAxis dataKey="band" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#737373' }} />
                            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#737373' }} width={28} />
                            <RechartsTooltip cursor={{ fill: '#f5f5f5' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }} formatter={(v) => [`${v} student${v===1?'':'s'}`, 'Count']} />
                            <Bar dataKey="count" radius={[6,6,0,0]}>
                              {scoreBands.map((band, idx) => <Cell key={idx} fill={band.color} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-neutral-400 text-sm">No test data yet</div>
                      )}
                    </div>
                  </div>
                  <div className="glass-panel p-5 rounded-2xl border border-white/60 flex flex-col">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="p-1.5 bg-teal-100 text-teal-600 rounded-lg"><Users size={14} /></div>
                      <h2 className="font-semibold">Score vs Attendance</h2>
                      <span className="text-xs text-neutral-400 ml-1">click a dot to open report</span>
                    </div>
                    <div className="flex-1 min-h-[220px]">
                      <QuadrantScatter students={scatterStudents} onSelect={(id) => setReportStudentId(id)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Leaderboard */}
              <div className="glass-panel p-5 rounded-2xl border border-white/60">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg"><Trophy size={16} /></div>
                  <h2 className="font-semibold">Leaderboard</h2>
                </div>
                <LeaderboardPanel standardId={activeStd} onSelect={(s) => setReportStudentId(s.id)} />
              </div>

              {/* Student Roster — desktop table */}
              <div className="glass-panel rounded-2xl border border-white/60 overflow-hidden">
                <div className="p-5 border-b border-[#EFEDEA] flex items-center gap-2">
                  <div className="p-1.5 bg-rose-100 text-rose-600 rounded-lg"><Users size={16} /></div>
                  <h2 className="font-semibold">Student Roster</h2>
                  <span className="ml-auto text-xs text-neutral-400">{students.length} students</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F8F7F5] border-b border-[#EFEDEA]">
                        <th className="py-3 px-5 text-xs font-semibold text-neutral-500">Student</th>
                        <th className="py-3 px-5 text-xs font-semibold text-neutral-500 text-center">Avg Score</th>
                        <th className="py-3 px-5 text-xs font-semibold text-neutral-500 text-center">Attendance</th>
                        <th className="py-3 px-5 text-xs font-semibold text-neutral-500 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFEDEA]">
                      {[...students].sort((a,b) => (b.avg_score||0) - (a.avg_score||0)).map(s => (
                        <tr key={s.id} onClick={() => setReportStudentId(s.id)}
                          className="hover:bg-white/40 transition-colors cursor-pointer">
                          <td className="py-3 px-5">
                            <div className="flex items-center gap-3">
                              <Avatar src={s.avatar_url} name={s.name} size="sm" />
                              <div>
                                <p className="font-medium text-sm text-neutral-900">{s.name}</p>
                                {isAtRisk(s) && <p className="text-[10px] font-semibold text-red-500">Requires Attention</p>}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-5 text-center">
                            {s.has_tests ? (
                              <span className={`inline-flex items-center justify-center w-10 h-6 text-xs font-bold rounded-md ${(s.avg_score||0)>=80?'bg-emerald-100 text-emerald-700':(s.avg_score||0)>=40?'bg-neutral-100 text-neutral-700':'bg-red-100 text-red-700'}`}>{Math.round(s.avg_score||0)}%</span>
                            ) : <span className="inline-flex items-center justify-center w-10 h-6 text-xs font-bold rounded-md bg-neutral-50 text-neutral-400">—</span>}
                          </td>
                          <td className="py-3 px-5 text-center">
                            {s.has_attendance ? (
                              <span className={`inline-flex items-center justify-center w-10 h-6 text-xs font-bold rounded-md ${(s.attendance_pct||0)>=90?'bg-emerald-100 text-emerald-700':(s.attendance_pct||0)>=75?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-700'}`}>{Math.round(s.attendance_pct||0)}%</span>
                            ) : <span className="inline-flex items-center justify-center w-10 h-6 text-xs font-bold rounded-md bg-neutral-50 text-neutral-400">—</span>}
                          </td>
                          <td className="py-3 px-5 text-right">
                            <span className="text-sm font-semibold text-neutral-700">{s.points || 0}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </>
        ) : null}
      </div>

      <StudentReportModal
        open={!!reportStudentId}
        studentId={reportStudentId}
        onClose={() => setReportStudentId(null)}
      />
    </div>
  );
}
