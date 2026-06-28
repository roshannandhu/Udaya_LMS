import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy, Download, AlertTriangle, Users, BookOpen, Clock, CheckCircle, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
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
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    doc.setFontSize(20);
    doc.text('Class Analytics Report', 14, 18);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`${currentStd.name}  ·  Generated ${now}`, 14, 26);
    doc.setTextColor(0);

    const overview = analytics.overview;
    doc.setFontSize(12);
    doc.text(`Students: ${overview.total_students}   Avg Score: ${overview.avg_score}%   Avg Attendance: ${overview.avg_attendance}%   Total Points: ${overview.total_points}`, 14, 36);

    const rows = [...analytics.students]
      .sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0))
      .map((s, i) => [
        i + 1,
        s.name || '—',
        s.has_tests ? `${Math.round(s.avg_score || 0)}%` : '—',
        s.has_attendance ? `${Math.round(s.attendance_pct || 0)}%` : '—',
        s.points || 0,
      ]);

    autoTable(doc, {
      startY: 44,
      head: [['#', 'Name', 'Avg Score', 'Attendance', 'Points']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [23, 23, 23] },
      columnStyles: { 0: { cellWidth: 10 } },
    });

    if (analytics.subject_performance.length > 0) {
      const finalY = doc.lastAutoTable.finalY + 12;
      doc.setFontSize(13);
      doc.text('Subject Performance', 14, finalY);
      const subRows = analytics.subject_performance.map(s => [s.subject_name, `${s.avg_score}%`, `${s.avg_attendance}%`]);
      autoTable(doc, {
        startY: finalY + 6,
        head: [['Subject', 'Avg Score', 'Avg Attendance']],
        body: subRows,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
      });
    }

    doc.save(`${currentStd.name.replace(/\s+/g, '_')}_Analytics_Report.pdf`);
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

  return (
    <div>
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-6xl mx-auto">
          <button onClick={() => navigate('/teacher/more')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-md transition-colors">
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg md:text-xl font-semibold flex-1">Standard Analytics</h1>
          <Btn variant="default" size="sm" icon={Download} onClick={handleExportPDF} disabled={!analytics}>
            Export PDF
          </Btn>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-6xl mx-auto space-y-8 pb-20">
        
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Skeleton className="lg:col-span-2 h-80 rounded-2xl" />
              <Skeleton className="h-80 rounded-2xl" />
            </div>
            <Skeleton className="h-64 rounded-2xl" />
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
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Total Students" value={overview.total_students} icon={Users} color="bg-blue-100 text-blue-700" />
              <StatCard title="Avg Score" value={`${overview.avg_score}%`} icon={Trophy} color="bg-emerald-100 text-emerald-700" />
              <StatCard title="Avg Attendance" value={`${overview.avg_attendance}%`} icon={CheckCircle} color="bg-violet-100 text-violet-700" />
              <div className="glass-panel p-4 rounded-2xl flex flex-col justify-between border border-red-100 bg-red-50/30 relative overflow-hidden">
                <div className="flex items-center justify-between z-10">
                  <p className="text-sm font-medium text-red-800">At-Risk Students</p>
                  <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                    <AlertTriangle size={16} />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-red-700 mt-2 z-10">{atRiskCount}</h3>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Chart */}
              <div className="lg:col-span-2 glass-panel p-5 rounded-2xl border border-white/60">
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
                        <RechartsTooltip 
                          cursor={{ fill: '#f5f5f5' }}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Bar dataKey="avg_score" name="Avg Score (%)" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={32} />
                        <Bar dataKey="avg_attendance" name="Avg Attendance (%)" fill="#14b8a6" radius={[4, 4, 0, 0]} barSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-neutral-400 text-sm">No subject data available</div>
                  )}
                </div>
              </div>

              {/* Recent Assessments */}
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
                          <p className="font-medium text-sm text-neutral-900 truncate pr-2" title={t.title}>{t.title}</p>
                          {t.avg_score == null ? (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 whitespace-nowrap">No attempts</span>
                          ) : (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${t.avg_score >= 70 ? 'bg-emerald-100 text-emerald-700' : t.avg_score >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                              {t.avg_score}% Avg
                            </span>
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

            {/* Leaderboard — weekly / monthly / all-time class rankings */}
            <div className="glass-panel p-5 rounded-2xl border border-white/60">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg"><Trophy size={16} /></div>
                <h2 className="font-semibold">Leaderboard</h2>
              </div>
              <LeaderboardPanel standardId={activeStd} onSelect={(s) => setReportStudentId(s.id)} />
            </div>

            {/* Student Roster */}
            <div className="glass-panel rounded-2xl border border-white/60 overflow-hidden">
              <div className="p-5 border-b border-[#EFEDEA] flex items-center gap-2">
                <div className="p-1.5 bg-rose-100 text-rose-600 rounded-lg"><Users size={16} /></div>
                <h2 className="font-semibold">Student Roster</h2>
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
                    {[...students].sort((a,b) => (b.avg_score||0) - (a.avg_score||0)).map((s) => (
                      <tr key={s.id} onClick={() => setReportStudentId(s.id)}
                        className="hover:bg-white/40 transition-colors cursor-pointer">
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-3">
                            <Avatar src={s.avatar_url} name={s.name} size="sm" />
                            <div>
                              <p className="font-medium text-sm text-neutral-900">{s.name}</p>
                              {isAtRisk(s) && (
                                <p className="text-[10px] font-semibold text-red-500">Requires Attention</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-5 text-center">
                          {s.has_tests ? (
                            <span className={`inline-flex items-center justify-center w-10 h-6 text-xs font-bold rounded-md ${
                              (s.avg_score||0) >= 80 ? 'bg-emerald-100 text-emerald-700' :
                              (s.avg_score||0) >= 40 ? 'bg-neutral-100 text-neutral-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {Math.round(s.avg_score||0)}%
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-10 h-6 text-xs font-bold rounded-md bg-neutral-50 text-neutral-400" title="No tests taken yet">—</span>
                          )}
                        </td>
                        <td className="py-3 px-5 text-center">
                          {s.has_attendance ? (
                            <span className={`inline-flex items-center justify-center w-10 h-6 text-xs font-bold rounded-md ${
                              (s.attendance_pct||0) >= 90 ? 'bg-emerald-100 text-emerald-700' :
                              (s.attendance_pct||0) >= 75 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {Math.round(s.attendance_pct||0)}%
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-10 h-6 text-xs font-bold rounded-md bg-neutral-50 text-neutral-400" title="No attendance marked yet">—</span>
                          )}
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
