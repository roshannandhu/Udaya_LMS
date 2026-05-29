import React, { useState, useEffect, useMemo } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Loader2, AlertTriangle, TrendingUp, Eye, Calendar, Sparkles, CheckCircle2, Download } from 'lucide-react';
import { Modal, Btn, Avatar } from '../ui';
import { reportApi } from '../../lib/api';

const PERIODS = [
  { id: 'weekly',  label: 'Weekly'  },
  { id: 'monthly', label: 'Monthly' },
  { id: 'overall', label: 'Overall' },
];

const SUBJECT_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];

function HeatmapCalendar({ data, colorFn, emptyColor = 'bg-neutral-100', label }) {
  const map = useMemo(() => {
    const m = {};
    (data || []).forEach(d => { m[d.date] = d; });
    return m;
  }, [data]);

  const dates = data && data.length > 0 ? data.map(d => d.date).sort() : [];
  let cur = new Date();
  let endDate = new Date();
  if (dates.length > 0) {
    cur = new Date(dates[0]);
    endDate = new Date(dates[dates.length - 1]);
  } else {
    cur.setDate(cur.getDate() - 28);
  }
  cur.setDate(cur.getDate() - cur.getDay());
  
  const days = [];
  while (cur <= endDate) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div>
      <div className="flex gap-1 mb-1">
        {DAY_LABELS.map((d, i) => <div key={i} className="w-6 text-center text-[9px] text-neutral-400 font-medium">{d}</div>)}
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day, di) => {
              const entry = map[day];
              const inRange = day >= dates[0] && day <= dates[dates.length - 1];
              return (
                <div key={di} title={entry ? `${day}: ${label(entry)}` : day}
                  className={`w-6 h-6 rounded-sm ${inRange && !entry ? 'bg-neutral-50 border border-neutral-100' : inRange ? colorFn(entry) : 'bg-transparent'}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function generateSuggestions(data) {
  if (!data) return [];
  const tips = [];
  const { subject_radar, topic_map } = data;

  const sorted = [...(subject_radar || [])].filter(s => s.test_count > 0).sort((a, b) => a.test_avg - b.test_avg);
  if (sorted.length > 0 && sorted[0].test_avg < 70)
    tips.push({ type: 'warning', text: `Averaging ${sorted[0].test_avg}% in ${sorted[0].subject}. Needs focused revision.` });

  const weakTopics = (topic_map || []).filter(t => t.video_completed && t.score_pct < 60);
  if (weakTopics.length > 0)
    tips.push({ type: 'insight', text: `Watched "${weakTopics[0].video_title}" but scored ${weakTopics[0].score_pct}% on test.` });

  const unwatchedWithTest = (topic_map || []).filter(t => !t.video_completed);
  if (unwatchedWithTest.length > 0)
    tips.push({ type: 'tip', text: `Taking tests without watching videos first (${unwatchedWithTest.length} topics).` });

  const lowAtt = (subject_radar || []).filter(s => s.att_total > 0 && s.attendance_pct < 75);
  if (lowAtt.length > 0)
    tips.push({ type: 'warning', text: `Attendance in ${lowAtt[0].subject} is ${lowAtt[0].attendance_pct}% — below threshold.` });

  const strong = [...(subject_radar || [])].filter(s => s.test_count > 0 && s.test_avg >= 85);
  if (strong.length > 0)
    tips.push({ type: 'positive', text: `Strong performance in ${strong[0].subject} (${strong[0].test_avg}%).` });

  return tips.slice(0, 5);
}

const ICON = { warning: '⚠️', insight: '🔍', tip: '💡', positive: '🌟' };

export default function StudentReportModal({ open, onClose, studentId }) {
  const [period, setPeriod]   = useState('overall');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  
  const [selSubject, setSelSubject] = useState('all');
  const [attPeriod, setAttPeriod] = useState('month');
  const [vidPeriod, setVidPeriod] = useState('month');
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (!open || !studentId) return;
    setLoading(true); setError(null); setShowSuggestions(false);
    reportApi.getV2(studentId, period)
      .then(d => { setData(d); setSelSubject('all'); })
      .catch(e => setError(e.message || 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [open, studentId, period]);

  const suggestions = useMemo(() => generateSuggestions(data), [data]);

  // BGMI-style fixed 5 metrics for Pentagon Radar Chart
  const pentagonData = useMemo(() => {
    if (!data) return [];
    const s = data.student || {};
    const knowledge = s.avg_score || 0;
    const attendance = s.attendance_pct || 0;
    const subj = data.subject_radar || [];
    const totalVids = subj.reduce((acc, c) => acc + (c.video_total || 0), 0);
    const doneVids = subj.reduce((acc, c) => acc + (c.video_done || 0), 0);
    const activity = totalVids > 0 ? (doneVids / totalVids) * 100 : 0;
    const vhm = data.video_heatmap || [];
    const activeDays = vhm.filter(d => d.minutes > 0).length;
    const consistency = vhm.length > 0 ? (activeDays / vhm.length) * 100 : 0;
    const points = Math.min(100, ((s.points || 0) / 500) * 100);

    return [
      { metric: 'Knowledge', value: Math.round(knowledge) },
      { metric: 'Attendance', value: Math.round(attendance) },
      { metric: 'Activity', value: Math.round(activity) },
      { metric: 'Consistency', value: Math.round(consistency) },
      { metric: 'Points', value: Math.round(points) },
    ];
  }, [data]);

  const { lineData, subjectLines } = useMemo(() => {
    const tl = data?.test_timeline || [];
    const trunc = s => (s && s.length > 16) ? s.slice(0, 16) + '…' : (s || '');
    if (selSubject !== 'all') {
      return {
        lineData: tl.filter(t => t.subject_id === selSubject).map(t => ({
          name: trunc(t.test_title), score: t.score_pct, low: t.score_pct < 60,
        })),
        subjectLines: [],
      };
    }
    const uniqueSubjects = [...new Set(tl.map(t => t.subject).filter(Boolean))];
    const sorted = [...tl].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const seen = new Set();
    const rows = [];
    sorted.forEach(t => {
      const key = t.test_id || `${t.date}_${t.test_title}`;
      if (!seen.has(key)) { seen.add(key); rows.push({ name: trunc(t.test_title), _tests: {} }); }
      const row = rows.find(r => r.name === trunc(t.test_title));
      if (row) row._tests[t.subject] = t.score_pct;
    });
    const composite = rows.map(r => {
      const e = { name: r.name };
      uniqueSubjects.forEach(s => { e[s] = r._tests[s] ?? null; });
      return e;
    });
    return {
      lineData: composite,
      subjectLines: uniqueSubjects.map((s, i) => ({ subject: s, color: SUBJECT_COLORS[i % SUBJECT_COLORS.length] })),
    };
  }, [data, selSubject]);

  const attHeatmap = useMemo(() => {
    const all = data?.attendance_heatmap || [];
    if (attPeriod === 'week') return all.slice(-7);
    if (attPeriod === 'month') return all.slice(-30);
    return all;
  }, [data, attPeriod]);

  const vidHeatmap = useMemo(() => {
    const all = data?.video_heatmap || [];
    if (vidPeriod === 'week') return all.slice(-7);
    if (vidPeriod === 'month') return all.slice(-30);
    return all;
  }, [data, vidPeriod]);

  const attSummary = useMemo(() => {
    const p = attHeatmap.reduce((a, d) => a + (d.present || 0), 0);
    const ab = attHeatmap.reduce((a, d) => a + (d.absent || 0), 0);
    const l = attHeatmap.reduce((a, d) => a + (d.late || 0), 0);
    return { present: p, absent: ab, late: l };
  }, [attHeatmap]);

  const vidSummary = useMemo(() => {
    const days = vidHeatmap.filter(d => d.minutes > 0).length;
    const mins = vidHeatmap.reduce((a, d) => a + (d.minutes || 0), 0);
    return { days, mins: Math.round(mins) };
  }, [vidHeatmap]);

  const handleDownloadPDF = async () => {
    if (!data) return;
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF();
    const s = data.student;
    doc.setFontSize(20); doc.text('Student Report Card', 14, 20);
    doc.setFontSize(12);
    doc.text(`Name: ${s.name}  |  Username: @${s.username}`, 14, 30);
    doc.text(`Period: ${period.charAt(0).toUpperCase() + period.slice(1)}  |  Avg Score: ${s.avg_score || 0}%  |  Attendance: ${s.attendance_pct || 0}%`, 14, 38);

    if (data.subject_radar?.length > 0) {
      doc.setFontSize(14); doc.text('Subject Performance', 14, 52);
      doc.autoTable({
        startY: 56,
        head: [['Subject', 'Avg Score', 'Videos Done', 'Attendance']],
        body: data.subject_radar.map(r => [r.subject, r.test_count > 0 ? `${r.test_avg}%` : '—', r.video_total > 0 ? `${r.video_done}/${r.video_total}` : '—', r.att_total > 0 ? `${r.attendance_pct}%` : '—']),
        theme: 'striped', headStyles: { fillColor: [99, 102, 241] },
      });
    }

    doc.save(`${s.name}_Report_${period}.pdf`);
  };

  if (!open) return null;
  const student = data?.student;

  return (
    <Modal open={open} onClose={onClose} title="" size="xl" className="bg-[#FAFAFA]">
      <div className="space-y-6 pb-6">
        
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 pb-2 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            {student && <Avatar name={student.name} size="md" />}
            <div>
              <h3 className="text-lg font-bold text-neutral-900 uppercase tracking-wide">{student?.name || 'STUDENT NAME'}</h3>
              {student && <p className="text-xs text-neutral-400">@{student.username}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 bg-neutral-100/80 rounded-xl">
              {PERIODS.map(p => (
                <button key={p.id} onClick={() => setPeriod(p.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${period === p.id ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-800'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            {data && <Btn size="sm" variant="default" icon={Download} onClick={handleDownloadPDF}>PDF</Btn>}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-neutral-400" /></div>
        ) : error ? (
          <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
            <AlertTriangle size={16} />{error}
          </div>
        ) : data && (
          <div className="space-y-6">
            
            {/* Radar Spider + Table */}
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="bg-white rounded-2xl p-5 border border-neutral-100 shadow-sm lg:w-[320px] flex-shrink-0 flex flex-col justify-center">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Performance Overview</p>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={pentagonData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#6b7280', fontWeight: 500 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="Student" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} strokeWidth={2.5} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex-1 bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-neutral-100 bg-neutral-50/50">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Table Details</p>
                </div>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-100 bg-white">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Subject</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Avg Score</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Videos</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Att%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-50">
                      {(data?.subject_radar || []).map(s => (
                        <tr key={s.subject_id} className="hover:bg-neutral-50/50 transition-colors">
                          <td className="px-5 py-3 font-medium text-neutral-800">
                            <span className="mr-2 text-base">{s.emoji}</span>{s.subject}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${s.test_avg >= 75 ? 'bg-green-100/50 text-green-700' : s.test_avg >= 50 ? 'bg-amber-100/50 text-amber-700' : 'bg-red-100/50 text-red-600'}`}>
                              {s.test_count > 0 ? `${s.test_avg}%` : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-xs font-medium text-neutral-600">
                            {s.video_total > 0 ? `${s.video_done}/${s.video_total}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${s.att_total === 0 ? 'text-neutral-400 bg-neutral-100' : s.attendance_pct >= 75 ? 'bg-green-100/50 text-green-700' : 'bg-red-100/50 text-red-600'}`}>
                              {s.att_total > 0 ? `${s.attendance_pct}%` : '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(!data?.subject_radar || data.subject_radar.length === 0) && (
                        <tr><td colSpan="4" className="text-center py-6 text-neutral-400 text-sm">No subjects found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Multi-Line Graph */}
            <div className="bg-white rounded-2xl p-6 border border-neutral-100 shadow-sm">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp size={14} /> Scores by Topic
                </p>
                <div className="flex items-center gap-2 bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-100">
                  <span className="text-xs text-neutral-500 font-medium">Subjects</span>
                  <select
                    value={selSubject} onChange={e => setSelSubject(e.target.value)}
                    className="text-xs font-semibold bg-transparent border-none outline-none cursor-pointer text-neutral-800"
                  >
                    <option value="all">All Subjects</option>
                    {(data?.subjects || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {lineData.length === 0 ? (
                <div className="relative">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={[{name: ' ', score: 0}, {name: '  ', score: 0}]} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} dy={10} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} dx={-10} />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center backdrop-blur-[1px]">
                    <p className="text-sm font-bold text-neutral-500 bg-white/90 px-5 py-2.5 rounded-xl border border-neutral-100 shadow-sm">No test data available for this student</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={lineData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} dy={10} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} dx={-10} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #f3f4f6', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', fontSize: 12, padding: '12px' }}
                      formatter={(v, name) => [`${v}%`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: '15px' }} />
                    <ReferenceLine y={60} stroke="#fca5a5" strokeDasharray="4 4" strokeWidth={1} />
                    {selSubject === 'all' ? (
                      subjectLines.map(sl => (
                        <Line
                          key={sl.subject} type="monotone" dataKey={sl.subject} name={sl.subject}
                          stroke={sl.color} strokeWidth={3} connectNulls={false} activeDot={{ r: 6, strokeWidth: 0 }}
                          dot={(props) => {
                            const { cx, cy, value } = props;
                            if (value == null) return null;
                            return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={value < 60 ? 6 : 4} fill={value < 60 ? '#ef4444' : sl.color} stroke="#ffffff" strokeWidth={2} />;
                          }}
                        />
                      ))
                    ) : (
                      <Line
                        type="monotone" dataKey="score" name="Score %" stroke="#6366f1" strokeWidth={3} activeDot={{ r: 6, strokeWidth: 0 }}
                        dot={(props) => {
                          const { cx, cy, payload } = props;
                          return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={payload?.low ? 7 : 5} fill={payload?.low ? '#ef4444' : '#6366f1'} stroke="#ffffff" strokeWidth={2} />;
                        }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Heat Maps Container */}
            <div className="flex flex-col gap-6">
              
              {/* Heat Map 1: Attendance */}
              <div className="bg-white rounded-2xl p-6 border border-neutral-100 shadow-sm">
                <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <Calendar size={14} /> Attendance Calendar
                  </p>
                  <div className="flex items-center gap-2 bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-100">
                    <span className="text-xs text-neutral-500 font-medium">Week/Month</span>
                    <select value={attPeriod} onChange={e => setAttPeriod(e.target.value)}
                      className="text-xs font-semibold bg-transparent border-none outline-none cursor-pointer text-neutral-800">
                      <option value="week">Weekly</option>
                      <option value="month">Monthly</option>
                      <option value="all">Overall</option>
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto pb-4">
                  <HeatmapCalendar
                    data={attHeatmap}
                    colorFn={d => {
                      if (!d || !d.total || d.total === 0) return 'bg-neutral-100';
                      const ratio = (d.present + (d.late || 0) * 0.5) / d.total;
                      return ratio >= 0.9 ? 'bg-emerald-500' : ratio >= 0.5 ? 'bg-amber-400' : 'bg-red-500';
                    }}
                    label={d => `Present: ${d.present}, Absent: ${d.absent}, Late: ${d.late || 0}`}
                  />
                </div>
                <div className="border-t border-neutral-100 pt-4 mt-2">
                  <p className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider mb-2">Details</p>
                  <div className="flex items-center gap-6 text-sm text-neutral-700 font-medium">
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500" /> {attSummary.present} Present</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-400" /> {attSummary.late} Late</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500" /> {attSummary.absent} Absent</span>
                  </div>
                </div>
              </div>

              {/* Heat Map 2: Videos */}
              <div className="bg-white rounded-2xl p-6 border border-neutral-100 shadow-sm">
                <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <Eye size={14} /> Video Watch Activity
                  </p>
                  <div className="flex items-center gap-2 bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-100">
                    <span className="text-xs text-neutral-500 font-medium">Week/Month</span>
                    <select value={vidPeriod} onChange={e => setVidPeriod(e.target.value)}
                      className="text-xs font-semibold bg-transparent border-none outline-none cursor-pointer text-neutral-800">
                      <option value="week">Weekly</option>
                      <option value="month">Monthly</option>
                      <option value="all">Overall</option>
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto pb-4">
                  <HeatmapCalendar
                    data={vidHeatmap}
                    colorFn={d => {
                      const m = d.minutes || 0;
                      return m === 0 ? 'bg-neutral-100' : m < 15 ? 'bg-indigo-200' : m < 30 ? 'bg-indigo-400' : m < 60 ? 'bg-indigo-600' : 'bg-indigo-800';
                    }}
                    label={d => `${Math.round(d.minutes || 0)} min watched`}
                  />
                </div>
                <div className="border-t border-neutral-100 pt-4 mt-2">
                  <p className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider mb-2">Details</p>
                  <div className="flex items-center gap-6 text-sm text-neutral-700 font-medium">
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-indigo-200" /> &lt;15m</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-indigo-400" /> 15-30m</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-indigo-600" /> 30-60m</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-indigo-800" /> 60m+</span>
                  </div>
                </div>
              </div>

            </div>

            {/* AI Suggestion Box */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowSuggestions(!showSuggestions)}
                className="w-full flex items-center justify-between px-6 py-5 hover:bg-neutral-50 transition-colors"
              >
                <span className="flex items-center gap-3 font-bold text-sm tracking-wide text-neutral-900">
                  <Sparkles size={18} className="text-amber-500" /> AI SUGGESTION BOX
                </span>
                <span className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider transition-all ${showSuggestions ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
                  {showSuggestions ? 'Close' : 'Analyze Performance'}
                </span>
              </button>

              {showSuggestions && (
                <div className="border-t border-neutral-100 px-6 py-5 bg-neutral-50/50">
                  <ul className="space-y-4">
                    {suggestions.length === 0 ? (
                      <li className="flex items-center gap-3 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                        <CheckCircle2 size={18} /> Everything looks perfect right now!
                      </li>
                    ) : (
                      suggestions.map((s, i) => (
                        <li key={i} className={`flex items-start gap-3 p-4 rounded-xl text-sm font-medium leading-relaxed shadow-sm ${
                          s.type === 'warning' ? 'bg-red-50 text-red-900 border border-red-100' :
                          s.type === 'positive' ? 'bg-emerald-50 text-emerald-900 border border-emerald-100' :
                          s.type === 'insight' ? 'bg-blue-50 text-blue-900 border border-blue-100' :
                          'bg-amber-50 text-amber-900 border border-amber-100'
                        }`}>
                          <span className="text-lg flex-shrink-0 mt-0.5">{ICON[s.type]}</span><span>{s.text}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </Modal>
  );
}
