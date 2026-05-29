import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Trophy, BarChart3, Download, AlertTriangle, Users, Star } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Avatar, Tag, SectionHeader, Btn, Skeleton } from '../../components/ui';
import { attendanceApi, apiClient } from '../../lib/api';
import { useAppCache } from '../../store';

export default function ReportsPage() {
  const navigate = useNavigate();

  // Standards + students from global cache (instant from localStorage)
  const standards       = useAppCache(s => s.standards);
  const standardsReady  = useAppCache(s => s.standardsReady);
  const refreshStandards = useAppCache(s => s.refreshStandards);
  const [activeStd, setActiveStd]         = useState(null);
  // Per-standard data loaded fresh when standard is selected
  const [students, setStudents]           = useState([]);
  const [subjects, setSubjects]           = useState([]);
  const [lowAttendance, setLowAttendance] = useState([]);
  const [loadingData, setLoadingData]     = useState(false);
  const loadingStandards = !standardsReady;

  // Set first standard as active once cache is ready
  useEffect(() => {
    if (standards.length > 0 && !activeStd) setActiveStd(standards[0].id);
  }, [standards]);

  // Background refresh
  useEffect(() => {
    refreshStandards();
  }, []);

  // Load per-standard data when standard changes
  useEffect(() => {
    if (!activeStd) return;
    const load = async () => {
      setLoadingData(true);
      try {
        const [studs, subs, lowAtt] = await Promise.all([
          apiClient(`/students?standard_id=${activeStd}`),
          apiClient(`/subjects?standard_id=${activeStd}`),
          attendanceApi.getLowAttendance(activeStd, 75),
        ]);
        setStudents(Array.isArray(studs) ? studs : []);
        setSubjects(Array.isArray(subs)  ? subs  : []);
        setLowAttendance(lowAtt?.students || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, [activeStd]);

  const handleExportAttendance = async () => {
    if (!activeStd) return;
    try {
      await attendanceApi.downloadExport(activeStd);
    } catch (err) {
      alert('Failed to export attendance');
    }
  };

  const exportAttendancePDF = async () => {
    if (!currentStd || lowAttendance.length === 0) return;
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF();
    doc.text('Attendance Report', 14, 16);
    doc.setFontSize(11);
    doc.setTextColor(100);
    // Simulating filter values as requested
    doc.text(`Standard: ${currentStd.name}  |  Threshold: 75%  |  Date: Last 30 Days`, 14, 24);
    doc.setTextColor(0);
    
    doc.autoTable({
      startY: 30,
      head: [['Student', 'Attendance %', 'Absent (30d)']],
      body: lowAttendance.map(r => [r.name, `${r.attendance_pct}%`, r.absent_days ?? '—']),
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38] },
    });
    doc.save(`${currentStd.name.replace(/\s+/g, '_')}_Attendance_Report.pdf`);
  };

  const handleExportPDF = async () => {
    if (!currentStd || students.length === 0) return;
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF();
    const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    doc.setFontSize(20);
    doc.text('Class Report', 14, 18);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`${currentStd.name}  ·  Generated ${now}`, 14, 26);
    doc.setTextColor(0);

    doc.setFontSize(12);
    doc.text(`Students: ${totalStudents}   Avg Score: ${avgScore}%   Avg Attendance: ${avgAttendance}%   Total Points: ${totalPoints}`, 14, 36);

    const rows = [...students]
      .sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0))
      .map((s, i) => [
        i + 1,
        s.name || '—',
        `${Math.round(s.avg_score || 0)}%`,
        `${Math.round(s.attendance_pct || 0)}%`,
        s.points || 0,
      ]);

    doc.autoTable({
      startY: 44,
      head: [['#', 'Name', 'Avg Score', 'Attendance', 'Points']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [23, 23, 23] },
      columnStyles: { 0: { cellWidth: 10 } },
    });

    if (lowAttendance.length > 0) {
      const finalY = doc.lastAutoTable.finalY + 12;
      doc.setFontSize(13);
      doc.text('Students Below 75% Attendance', 14, finalY);
      const laRows = lowAttendance.map(s => [s.name, `${s.attendance_pct}%`, s.absent_days ?? '—']);
      doc.autoTable({
        startY: finalY + 6,
        head: [['Name', 'Attendance', 'Absent Days (30d)']],
        body: laRows,
        theme: 'striped',
        headStyles: { fillColor: [220, 38, 38] },
      });
    }

    doc.save(`${currentStd.name.replace(/\s+/g, '_')}_Report.pdf`);
  };

  // Computed stats
  const totalStudents = students.length;
  const avgScore = students.length
    ? Math.round(students.reduce((s, x) => s + (x.avg_score || 0), 0) / students.length)
    : 0;
  const avgAttendance = students.length
    ? Math.round(students.reduce((s, x) => s + (x.attendance_pct || 0), 0) / students.length)
    : 0;
  const totalPoints = students.reduce((s, x) => s + (x.points || 0), 0);

  const topStudents = [...students]
    .sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0))
    .slice(0, 8);

  const currentStd = standards.find(s => s.id === activeStd);

  // Generate Attendance Distribution Data for Chart
  const attendanceData = [
    { name: '> 90%',    count: students.filter(s => s.attendance_pct != null && s.attendance_pct >= 90).length,                                        fill: '#22c55e' },
    { name: '75%–89%', count: students.filter(s => s.attendance_pct != null && s.attendance_pct >= 75 && s.attendance_pct < 90).length,               fill: '#eab308' },
    { name: '< 75%',   count: students.filter(s => s.attendance_pct != null && s.attendance_pct < 75).length,                                         fill: '#ef4444' },
  ];

  return (
    <div>
      <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate('/teacher/more')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-white/60 rounded-md">
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-base font-semibold flex-1">Reports & Analytics</h1>
          <Btn variant="default" size="sm" icon={Download} onClick={handleExportPDF} disabled={students.length === 0}>
            Class Report
          </Btn>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {/* Standard selector */}
        {loadingStandards ? (
          <div className="flex gap-2 mb-6">
            {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-20 rounded-full" />)}
          </div>
        ) : (
          <div className="flex gap-2 mb-6 flex-wrap">
            {standards.map(s => (
              <button key={s.id} onClick={() => setActiveStd(s.id)}
                className={`px-4 py-1.5 text-sm rounded-full font-medium transition-all border ${
                  activeStd === s.id
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'text-neutral-600 border-white/60 glass-panel hover:bg-white/40'
                }`}>
                {s.emoji} {s.name}
              </button>
            ))}
          </div>
        )}

        {standards.length === 0 && !loadingStandards && (
          <div className="text-center py-16 text-sm text-neutral-500 glass-panel border-dashed border-white/60 rounded-xl">
            No standards created yet. Go to Subjects to create one.
          </div>
        )}

        {activeStd && (
          <>
            {/* Summary cards */}
            {loadingData ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                {[
                  { label: 'Students',     value: totalStudents,     icon: Users,      color: 'text-blue-600' },
                  { label: 'Avg score',    value: `${avgScore}%`,    icon: BarChart3,  color: 'text-green-600' },
                  { label: 'Avg attend.',  value: `${avgAttendance}%`, icon: TrendingUp, color: avgAttendance >= 75 ? 'text-green-600' : 'text-red-500' },
                  { label: 'Total points', value: totalPoints,       icon: Star,       color: 'text-amber-600' },
                ].map((stat, i) => (
                  <div key={i} className="p-4 glass-panel rounded-xl">
                    <stat.icon size={16} className={`${stat.color} mb-2`} />
                    <p className={`text-2xl font-bold tracking-tight ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Class Analytics Charts */}
            {!loadingData && students.length > 0 && (
              <div className="mb-8 glass-panel p-5 rounded-2xl">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <BarChart3 size={16} className="text-neutral-500" /> Attendance Distribution
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={attendanceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#737373' }} />
                      <RechartsTooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Students">
                        {attendanceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Top performers */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Top Performers</h3>
                {topStudents.length > 0 && <Tag color="gray">{totalStudents} total</Tag>}
              </div>
              {loadingData ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
                </div>
              ) : topStudents.length === 0 ? (
                <div className="text-center py-10 text-sm text-neutral-500 glass-panel border-dashed border-white/60 rounded-xl">
                  No students in this standard yet.
                </div>
              ) : (
                <div className="glass-panel rounded-2xl overflow-hidden">
                  {topStudents.map((s, i) => (
                    <button key={s.id} onClick={() => navigate(`/teacher/students/${s.id}`)}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/40 transition-colors text-left ${i > 0 ? 'border-t border-white/40' : ''}`}>
                      <span className="w-6 text-sm font-bold text-center">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-neutral-400">#{i+1}</span>}
                      </span>
                      <Avatar name={s.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        <p className="text-xs text-neutral-500">@{s.username}</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-right">
                        <div>
                          <p className="font-bold text-sm">{Math.round(s.avg_score || 0)}%</p>
                          <p className="text-neutral-400">avg</p>
                        </div>
                        <div>
                          <p className="font-bold text-sm text-amber-600">{s.points || 0}</p>
                          <p className="text-neutral-400">pts</p>
                        </div>
                        <div>
                          <p className={`font-bold text-sm ${(s.attendance_pct || 0) < 75 ? 'text-red-500' : 'text-green-600'}`}>
                            {Math.round(s.attendance_pct || 0)}%
                          </p>
                          <p className="text-neutral-400">att.</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Low Attendance Report */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Below Attendance Threshold (75%)</h3>
                  {lowAttendance.length > 0 && (
                    <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                      {lowAttendance.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Btn variant="default" size="sm" icon={Download} onClick={exportAttendancePDF} disabled={lowAttendance.length === 0}>
                    Export PDF
                  </Btn>
                  <Btn variant="default" size="sm" icon={Download} onClick={handleExportAttendance}>
                    Export CSV
                  </Btn>
                </div>
              </div>

              {loadingData ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
                </div>
              ) : lowAttendance.length === 0 ? (
                <div className="text-center py-10 text-sm text-green-700 bg-green-50/60 border border-green-200 rounded-2xl backdrop-blur-sm">
                  ✅ All students are above the 75% attendance threshold.
                </div>
              ) : (
                <div className="glass-panel rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2 border-b border-white/40 bg-white/20">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Student</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 text-right">Attend %</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 text-right">Absent (30d)</span>
                  </div>
                  {lowAttendance.map((s, i) => (
                    <button key={s.student_id} onClick={() => navigate(`/teacher/students/${s.student_id}`)}
                      className={`w-full grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-3 hover:bg-white/40 transition-colors text-left ${i > 0 ? 'border-t border-white/40' : ''}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          <p className="text-xs text-neutral-400">@{s.username}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-bold ${s.attendance_pct < 50 ? 'text-red-600' : 'text-amber-600'}`}>
                          {s.attendance_pct}%
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-neutral-600">{s.absent_days ?? '—'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
