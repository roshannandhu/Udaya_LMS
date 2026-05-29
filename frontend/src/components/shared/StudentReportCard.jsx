import React, { useState, useMemo, useCallback } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  Trophy, TrendingUp, Calendar, Eye, Sparkles, ChevronDown, ChevronUp,
  Download, Target, BookOpen, Video, CheckCircle2, BarChart3,
} from 'lucide-react';
import { Avatar } from '../ui';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUBJECT_COLORS = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
];

const HEATMAP_PERIODS = [
  { id: 'week',  label: 'Week'    },
  { id: 'month', label: 'Month'   },
  { id: 'all',   label: 'Overall' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n) { return `${Math.round(n || 0)}%`; }

function sliceHeatmap(data, periodId) {
  if (!data || data.length === 0) return [];
  if (periodId === 'week')  return data.slice(-7);
  if (periodId === 'month') return data.slice(-30);
  return data;
}

function buildHeatmapWeeks(rawData) {
  if (!rawData || rawData.length === 0) return { weeks: [], dates: [] };
  const dateMap = {};
  rawData.forEach(d => { dateMap[d.date] = d; });
  const dates = rawData.map(d => d.date).sort();
  let cur = new Date(dates[0]);
  const end = new Date(dates[dates.length - 1]);
  cur.setDate(cur.getDate() - cur.getDay()); // align to Sunday
  const allDays = [];
  while (cur <= end) {
    allDays.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  const weeks = [];
  for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));
  return { weeks, dates, dateMap };
}

// ─── generateSuggestions (client-side, cites real data) ──────────────────────

function generateSuggestions(data) {
  if (!data) return [];
  const tips = [];
  const { subject_radar = [], topic_map = [], student = {}, test_timeline = [] } = data;

  // Weakest subject
  const subjWithTests = subject_radar.filter(s => s.test_count > 0).sort((a, b) => a.test_avg - b.test_avg);
  if (subjWithTests.length > 0) {
    const weak = subjWithTests[0];
    if (weak.test_avg < 60) {
      tips.push({ type: 'warning', text: `Averaging ${weak.test_avg}% in ${weak.subject} across ${weak.test_count} test${weak.test_count > 1 ? 's' : ''}. Needs urgent revision.` });
    } else if (weak.test_avg < 75) {
      tips.push({ type: 'warning', text: `${weak.subject} average is ${weak.test_avg}% — slightly below target. Consider revisiting the weaker topics.` });
    }
  }

  // Video watched but failed test
  const watchedButFailed = topic_map.filter(t => t.video_completed && t.score_pct < 60);
  if (watchedButFailed.length > 0) {
    const t = watchedButFailed[0];
    tips.push({ type: 'insight', text: `Watched "${t.video_title}" but scored only ${Math.round(t.score_pct)}% on the related test. The concept may need re-watching or extra practice.` });
  }

  // Tests taken without watching video
  const noVideo = topic_map.filter(t => !t.video_completed);
  if (noVideo.length > 0) {
    tips.push({ type: 'tip', text: `Attempted ${noVideo.length} topic test${noVideo.length > 1 ? 's' : ''} without completing the corresponding video first. Watch the video before the test for better results.` });
  }

  // Low attendance warning
  const attPct = student.attendance_pct || 0;
  if (attPct < 75) {
    tips.push({ type: 'warning', text: `Overall attendance is ${Math.round(attPct)}% — below the 75% threshold. Frequent absences can directly impact test scores.` });
  }

  // Low attendance in a subject
  const lowAttSubj = subject_radar.filter(s => s.att_total > 0 && s.attendance_pct < 75);
  if (lowAttSubj.length > 0 && attPct >= 75) {
    const s = lowAttSubj[0];
    tips.push({ type: 'warning', text: `Attendance in ${s.subject} is ${s.attendance_pct}% (${s.att_present} of ${s.att_total} sessions). This may be affecting performance.` });
  }

  // Strong subject — positive reinforcement
  const strongSubj = subject_radar.filter(s => s.test_count > 0 && s.test_avg >= 85);
  if (strongSubj.length > 0) {
    const s = strongSubj[0];
    tips.push({ type: 'positive', text: `Excellent performance in ${s.subject} — averaging ${s.test_avg}% across ${s.test_count} test${s.test_count > 1 ? 's' : ''}. Keep it up!` });
  }

  // Video completion gap
  const totalVids = subject_radar.reduce((a, s) => a + (s.video_total || 0), 0);
  const doneVids  = subject_radar.reduce((a, s) => a + (s.video_done  || 0), 0);
  if (totalVids > 0) {
    const vidPct = Math.round((doneVids / totalVids) * 100);
    if (vidPct < 60) {
      tips.push({ type: 'tip', text: `Only ${doneVids} of ${totalVids} videos completed (${vidPct}%). Regular video watching is one of the strongest predictors of test success.` });
    }
  }

  // Topic mastery celebration
  const mastered = topic_map.filter(t => t.score_pct >= 75).length;
  if (mastered >= 3) {
    tips.push({ type: 'positive', text: `Mastered ${mastered} topic${mastered > 1 ? 's' : ''} with ≥75% score. Strong topic-level understanding is a great foundation.` });
  }

  return tips.slice(0, 7);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SUGGESTION_STYLES = {
  warning:  { bg: 'bg-red-50 border-red-100 text-red-900',     icon: '⚠️' },
  insight:  { bg: 'bg-blue-50 border-blue-100 text-blue-900',  icon: '🔍' },
  tip:      { bg: 'bg-amber-50 border-amber-100 text-amber-900', icon: '💡' },
  positive: { bg: 'bg-emerald-50 border-emerald-100 text-emerald-900', icon: '🌟' },
};

function KPICard({ label, value, sub, icon: Icon, color }) {
  const colorMap = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green:  'bg-emerald-50 text-emerald-600',
    blue:   'bg-blue-50 text-blue-600',
    amber:  'bg-amber-50 text-amber-600',
  };
  return (
    <div className="glass-panel border-white/60 shadow-sm rounded-2xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colorMap[color] || colorMap.indigo}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest truncate">{label}</p>
        <p className="text-xl font-black text-neutral-900 leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-neutral-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function HeatmapBlock({ title, icon: Icon, kpiValue, kpiSub, data, colorFn, labelFn, details, localPeriod, setLocalPeriod }) {
  const sliced = sliceHeatmap(data, localPeriod);
  const { weeks, dates, dateMap } = useMemo(() => buildHeatmapWeeks(sliced), [sliced]);
  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="glass-panel border-white/60 shadow-sm rounded-2xl p-5 space-y-4">
      {/* KPI card above heatmap */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center">
            <Icon size={17} className="text-neutral-500" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{title}</p>
            <p className="text-lg font-black text-neutral-900 leading-tight">{kpiValue}</p>
            {kpiSub && <p className="text-[10px] text-neutral-400">{kpiSub}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 p-0.5 bg-neutral-100/80 rounded-lg">
          {HEATMAP_PERIODS.map(p => (
            <button key={p.id} onClick={() => setLocalPeriod(p.id)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${localPeriod === p.id ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      {weeks.length === 0 ? (
        <div className="text-center py-8 text-sm text-neutral-400">No data for this period</div>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="flex gap-1 mb-1">
            {DAY_LABELS.map((d, i) => (
              <div key={i} className="w-5 text-center text-[9px] text-neutral-400 font-medium">{d}</div>
            ))}
          </div>
          <div className="flex gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((day, di) => {
                  const entry = dateMap?.[day];
                  const inRange = dates && dates.length > 0 && day >= dates[0] && day <= dates[dates.length - 1];
                  return (
                    <div key={di} title={entry ? labelFn(entry) : day}
                      className={`w-5 h-5 rounded-sm transition-opacity ${inRange && entry ? colorFn(entry) : inRange ? 'bg-neutral-100' : 'opacity-0'}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Details summary */}
      <div className="border-t border-neutral-100/80 pt-3">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {details.map((d, i) => (
            <span key={i} className="flex items-center gap-1.5 text-xs font-medium text-neutral-600">
              <span className={`w-2.5 h-2.5 rounded-full ${d.color}`} />
              {d.label}: <strong className="text-neutral-900">{d.value}</strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StudentReportCard({ data, period, onPeriodChange, showHeader = true, onDownloadPDF }) {
  const [selSubject, setSelSubject] = useState('all');
  const [attPeriod,  setAttPeriod]  = useState('month');
  const [testPeriod, setTestPeriod] = useState('month');
  const [vidPeriod,  setVidPeriod]  = useState('month');
  const [showSuggestions,   setShowSuggestions]   = useState(false);
  const [showBreakdown,     setShowBreakdown]      = useState(false);
  const [heatmapSubject,    setHeatmapSubject]     = useState('all');

  // ── Derived data ──────────────────────────────────────────────────────────

  const student = data?.student || {};
  const subjects = data?.subjects || [];
  const subjectRadar = data?.subject_radar || [];
  const testTimeline = data?.test_timeline || [];
  const topicMap = data?.topic_map || [];
  const attHeatmapRaw  = data?.attendance_heatmap || [];
  const vidHeatmapRaw  = data?.video_heatmap || [];
  const testHeatmapRaw = data?.test_heatmap || [];

  // Per-subject heatmap data (switched by heatmapSubject selector)
  const attData  = heatmapSubject === 'all'
    ? attHeatmapRaw
    : (data?.attendance_heatmap_by_subject?.[heatmapSubject] || []);
  const vidData  = heatmapSubject === 'all'
    ? vidHeatmapRaw
    : (data?.video_heatmap_by_subject?.[heatmapSubject] || []);
  const testData = heatmapSubject === 'all'
    ? testHeatmapRaw
    : (data?.test_heatmap_by_subject?.[heatmapSubject] || []);

  // KPI values
  const totalVids = subjectRadar.reduce((a, s) => a + (s.video_total || 0), 0);
  const doneVids  = subjectRadar.reduce((a, s) => a + (s.video_done  || 0), 0);
  const videoPct  = totalVids > 0 ? Math.round((doneVids / totalVids) * 100) : 0;
  const rank = data?.rank;
  const totalStudents = data?.total_students || 0;

  // Radar data (6 dimensions)
  const radarData = useMemo(() => {
    const vhm = vidHeatmapRaw;
    const activeDays = vhm.filter(d => d.minutes > 0).length;
    const consistency = vhm.length > 0 ? Math.round((activeDays / vhm.length) * 100) : 0;
    return [
      { metric: 'Test Accuracy',    value: Math.round(student.avg_score || 0),       classAvg: 65 },
      { metric: 'Attendance',       value: Math.round(student.attendance_pct || 0),  classAvg: 75 },
      { metric: 'Video Completion', value: videoPct,                                 classAvg: 60 },
      { metric: 'Consistency',      value: consistency,                              classAvg: 70 },
      { metric: 'Topic Mastery',    value: Math.round(data?.topic_mastery_pct || 0), classAvg: 60 },
      { metric: 'Points',           value: Math.min(100, Math.round(((student.points || 0) / 500) * 100)), classAvg: 50 },
    ];
  }, [data, videoPct]);

  // Weakest topics table (from topic_map + ungrouped tests)
  const weakestTopics = useMemo(() => {
    const rows = topicMap.map(t => ({
      topic:     t.topic,
      subject:   t.subject,
      videoStatus: t.video_completed ? 'Watched' : 'Not Watched',
      score:     t.score_pct,
      status:    t.score_pct >= 75 ? 'Strong' : t.score_pct >= 50 ? 'OK' : 'Weak',
    }));
    // Add tests not in topicMap
    const mappedTests = new Set(topicMap.map(t => t.test_title));
    testTimeline.forEach(t => {
      if (!mappedTests.has(t.test_title)) {
        rows.push({
          topic:       t.test_title,
          subject:     t.subject,
          videoStatus: '—',
          score:       t.score_pct,
          status:      t.score_pct >= 75 ? 'Strong' : t.score_pct >= 50 ? 'OK' : 'Weak',
        });
      }
    });
    return rows.sort((a, b) => a.score - b.score).slice(0, 10);
  }, [topicMap, testTimeline]);

  // Multi-line graph data
  const { lineData, subjectLines } = useMemo(() => {
    const trunc = s => s && s.length > 18 ? s.slice(0, 18) + '…' : (s || '');
    const filtered = selSubject === 'all' ? testTimeline : testTimeline.filter(t => t.subject_id === selSubject || t.subject === subjects.find(s => s.id === selSubject)?.name);
    if (selSubject !== 'all') {
      return {
        lineData: filtered.map(t => ({ name: trunc(t.test_title), score: t.score_pct, low: t.score_pct < 60 })),
        subjectLines: [],
      };
    }
    const uniqueSubjs = [...new Set(filtered.map(t => t.subject).filter(Boolean))];
    const sorted = [...filtered].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const seen = new Set();
    const rows = [];
    sorted.forEach(t => {
      const key = t.test_id || `${t.date}_${t.test_title}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push({ name: trunc(t.test_title), _tests: {} });
      }
      const row = rows.find(r => r.name === trunc(t.test_title));
      if (row) row._tests[t.subject] = t.score_pct;
    });
    const composite = rows.map(r => {
      const e = { name: r.name };
      uniqueSubjs.forEach(s => { e[s] = r._tests[s] ?? null; });
      return e;
    });
    return {
      lineData: composite,
      subjectLines: uniqueSubjs.map((s, i) => ({ subject: s, color: SUBJECT_COLORS[i % SUBJECT_COLORS.length] })),
    };
  }, [data, selSubject]);

  // Attendance heatmap KPI (uses active subject filter)
  const attSliced  = sliceHeatmap(attData, attPeriod);
  const attPresent = attSliced.reduce((a, d) => a + (d.present || 0), 0);
  const attAbsent  = attSliced.reduce((a, d) => a + (d.absent  || 0), 0);
  const attLate    = attSliced.reduce((a, d) => a + (d.late    || 0), 0);
  const attTotal   = attPresent + attAbsent + attLate;
  const attKpi     = attTotal > 0 ? Math.round(((attPresent + attLate * 0.5) / attTotal) * 100) : 0;

  // Test heatmap KPI (uses active subject filter)
  const testSliced     = sliceHeatmap(testData, testPeriod);
  const testsAttempted = testSliced.reduce((a, d) => a + (d.count || 0), 0);
  const totalTestsAvail = data?.total_tests_in_standard || 0;
  const testsMissed    = Math.max(0, totalTestsAvail - testsAttempted);
  const testKpi        = totalTestsAvail > 0 ? Math.round((testsAttempted / totalTestsAvail) * 100) : (testsAttempted > 0 ? 100 : 0);

  // Video heatmap KPI (uses active subject filter)
  const vidSliced = sliceHeatmap(vidData, vidPeriod);
  const vidDays   = vidSliced.filter(d => d.minutes > 0).length;
  const vidMins   = Math.round(vidSliced.reduce((a, d) => a + (d.minutes || 0), 0));

  // AI Suggestions
  const suggestions = useMemo(() => generateSuggestions(data), [data]);

  // Detailed breakdown table
  const breakdownRows = useMemo(() => {
    return subjectRadar.map(s => ({
      subject:    s.subject,
      emoji:      s.emoji,
      testCount:  s.test_count,
      avgScore:   s.test_avg,
      videosDone: s.video_done,
      videosTotal: s.video_total,
      attendance: s.attendance_pct,
      status:     s.test_avg >= 75 ? 'Strong' : s.test_avg >= 50 ? 'OK' : s.test_count === 0 ? '—' : 'Weak',
    }));
  }, [subjectRadar]);

  const handleDownloadPDF = useCallback(async () => {
    if (!data) return;
    if (onDownloadPDF) { onDownloadPDF(data); return; }
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF();
    const s = student;
    doc.setFontSize(20); doc.text('Student Report Card', 14, 20);
    doc.setFontSize(12);
    doc.text(`Name: ${s.name}  |  Username: @${s.username}`, 14, 30);
    doc.text(`Period: ${period.charAt(0).toUpperCase() + period.slice(1)}  |  Avg Score: ${s.avg_score || 0}%  |  Attendance: ${s.attendance_pct || 0}%  |  Rank: ${rank ? `${rank}/${totalStudents}` : 'N/A'}`, 14, 38);
    if (subjectRadar.length > 0) {
      doc.setFontSize(14); doc.text('Subject Performance', 14, 52);
      doc.autoTable({
        startY: 56,
        head: [['Subject', 'Avg Score', 'Videos Done', 'Attendance']],
        body: subjectRadar.map(r => [
          `${r.emoji} ${r.subject}`,
          r.test_count > 0 ? `${r.test_avg}%` : '—',
          r.video_total > 0 ? `${r.video_done}/${r.video_total}` : '—',
          r.att_total > 0 ? `${r.attendance_pct}%` : '—',
        ]),
        theme: 'striped', headStyles: { fillColor: [99, 102, 241] },
      });
    }
    doc.save(`${s.name}_Report_${period}.pdf`);
  }, [data, period, rank, totalStudents, subjectRadar]);

  if (!data) return (
    <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
      <BarChart3 size={32} className="mb-3 opacity-30" />
      <p className="text-sm">No report data available yet.</p>
    </div>
  );

  return (
    <div className="font-sans bg-transparent text-neutral-900">

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      {showHeader && (
        <div className="sticky top-0 z-20 glass-nav border-b border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.04)] px-5 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Avatar name={student.name || 'S'} src={student.avatar_url} size="sm" />
              <div>
                <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wide leading-tight">{student.name || 'Student'}</h2>
                {student.standard_name && (
                  <p className="text-[11px] text-neutral-400">{student.standard_name}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-0.5 p-1 bg-neutral-100/80 rounded-xl">
                {['weekly', 'monthly', 'overall'].map(p => (
                  <button key={p} onClick={() => onPeriodChange?.(p)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all capitalize ${period === p ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}>
                    {p}
                  </button>
                ))}
              </div>
              <button onClick={handleDownloadPDF}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-neutral-200 rounded-xl shadow-sm hover:bg-neutral-50 transition-colors">
                <Download size={13} /> PDF
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-5 space-y-5">

        {/* ── KPI CARDS ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="Avg Score"        value={pct(student.avg_score)}        icon={Target}    color="indigo" />
          <KPICard label="Attendance"        value={pct(student.attendance_pct)}   icon={Calendar}  color="green"  />
          <KPICard label="Video Completion"  value={pct(videoPct)}                 icon={Video}     color="blue"   sub={`${doneVids}/${totalVids} videos`} />
          <KPICard label="Class Rank"        value={rank ? `${rank}` : '—'}        icon={Trophy}    color="amber"  sub={totalStudents > 0 ? `of ${totalStudents} students` : undefined} />
        </div>

        {/* ── RADAR + PERFORMANCE TABLE ──────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-3">Performance Overview</p>
          <div className="flex flex-col lg:flex-row gap-4">

            {/* Radar Chart */}
            <div className="glass-panel border-white/60 shadow-sm rounded-2xl p-5 lg:w-[300px] flex-shrink-0 flex flex-col items-center">
              <p className="text-xs font-semibold text-neutral-500 mb-1">Performance Radar</p>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData} margin={{ top: 10, right: 35, bottom: 10, left: 35 }}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9.5, fill: '#6b7280', fontWeight: 600 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Class Avg" dataKey="classAvg" stroke="#d1d5db" fill="#d1d5db" fillOpacity={0.15} strokeWidth={1.5} strokeDasharray="5 3" />
                  <Radar name="You" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.22} strokeWidth={2.5} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 11, padding: '8px 12px' }}
                    formatter={(v, name) => [`${v}%`, name]}
                  />
                </RadarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 text-[10px] text-neutral-400 font-medium -mt-2">
                <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-indigo-400 rounded" />You</span>
                <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-neutral-300 rounded" />Class Avg</span>
              </div>
            </div>

            {/* Performance Table */}
            <div className="flex-1 glass-panel border-white/60 shadow-sm rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-100/80 bg-neutral-50/50">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Metrics Breakdown</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                    <th className="text-left px-5 py-2.5">Metric</th>
                    <th className="text-center px-4 py-2.5">You</th>
                    <th className="text-center px-4 py-2.5">Class Avg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {radarData.map((row, i) => {
                    const diff = row.value - row.classAvg;
                    return (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/40'}>
                        <td className="px-5 py-2.5 text-xs font-semibold text-neutral-700">{row.metric}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${diff >= 0 ? 'bg-emerald-100/60 text-emerald-700' : 'bg-red-100/60 text-red-700'}`}>
                            {row.value}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs text-neutral-400 font-medium">{row.classAvg}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── WEAKEST TOPICS TABLE ───────────────────────────────────────── */}
        {weakestTopics.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-3">Weakest Topics</p>
            <div className="glass-panel border-white/60 shadow-sm rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider bg-neutral-50/60">
                    <th className="text-left px-5 py-2.5">Topic</th>
                    <th className="text-left px-4 py-2.5 hidden sm:table-cell">Subject</th>
                    <th className="text-center px-4 py-2.5 hidden sm:table-cell">Video</th>
                    <th className="text-center px-4 py-2.5">Score</th>
                    <th className="text-center px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {weakestTopics.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/40'}>
                      <td className="px-5 py-2.5 text-xs font-medium text-neutral-800 max-w-[160px] truncate">{row.topic}</td>
                      <td className="px-4 py-2.5 text-xs text-neutral-500 hidden sm:table-cell">{row.subject}</td>
                      <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                        <span className={`text-[10px] font-semibold ${row.videoStatus === 'Watched' ? 'text-emerald-600' : row.videoStatus === 'Not Watched' ? 'text-red-500' : 'text-neutral-400'}`}>
                          {row.videoStatus}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${row.score >= 75 ? 'bg-emerald-100/60 text-emerald-700' : row.score >= 50 ? 'bg-amber-100/60 text-amber-700' : 'bg-red-100/60 text-red-700'}`}>
                          {Math.round(row.score)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-[10px] font-bold uppercase tracking-wide ${row.status === 'Strong' ? 'text-emerald-600' : row.status === 'OK' ? 'text-amber-600' : 'text-red-500'}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── MULTI-LINE GRAPH ───────────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-3">Topic Performance Over Time</p>
          <div className="glass-panel border-white/60 shadow-sm rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
                <TrendingUp size={14} />
                <span>Score by topic</span>
              </div>
              <div className="flex items-center gap-2 bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-100/80">
                <BookOpen size={12} className="text-neutral-400" />
                <select value={selSubject} onChange={e => setSelSubject(e.target.value)}
                  className="text-xs font-semibold bg-transparent border-none outline-none cursor-pointer text-neutral-800">
                  <option value="all">All Subjects</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
                </select>
              </div>
            </div>

            {lineData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm text-neutral-400">No test data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={lineData} margin={{ top: 8, right: 12, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} dy={8} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} dx={-8} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid #f3f4f6', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', fontSize: 11, padding: '8px 12px' }}
                    formatter={(v, name) => [v != null ? `${v}%` : 'N/A', name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 12 }} />
                  <ReferenceLine y={60} stroke="#fca5a5" strokeDasharray="4 3" strokeWidth={1} label={{ value: '60%', position: 'right', fontSize: 9, fill: '#fca5a5' }} />
                  {selSubject === 'all' ? (
                    subjectLines.map(sl => (
                      <Line key={sl.subject} type="monotone" dataKey={sl.subject} name={sl.subject}
                        stroke={sl.color} strokeWidth={2.5} connectNulls={false} activeDot={{ r: 5, strokeWidth: 0 }}
                        dot={props => {
                          const { cx, cy, value } = props;
                          if (value == null) return null;
                          return <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={value < 60 ? 6 : 4} fill={value < 60 ? '#ef4444' : sl.color} stroke="#fff" strokeWidth={2} />;
                        }}
                      />
                    ))
                  ) : (
                    <Line type="monotone" dataKey="score" name="Score %" stroke="#6366f1" strokeWidth={2.5} activeDot={{ r: 5, strokeWidth: 0 }}
                      dot={props => {
                        const { cx, cy, payload } = props;
                        return <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={payload?.low ? 7 : 4} fill={payload?.low ? '#ef4444' : '#6366f1'} stroke="#fff" strokeWidth={2} />;
                      }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── HEATMAPS: ATTENDANCE / TEST / VIDEO ───────────────────────── */}
        <div>
          {/* Section label + subject filter */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Activity Calendars</p>
            {subjects.length > 0 && (
              <div className="flex items-center gap-2 bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-100/80">
                <Calendar size={12} className="text-neutral-400" />
                <select value={heatmapSubject} onChange={e => setHeatmapSubject(e.target.value)}
                  className="text-xs font-semibold bg-transparent border-none outline-none cursor-pointer text-neutral-800">
                  <option value="all">All Subjects</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <HeatmapBlock
            title="Attendance"
            icon={Calendar}
            kpiValue={`${attKpi}%`}
            kpiSub={`${attPresent} present · ${attAbsent} absent · ${attLate} late`}
            data={attSliced}
            colorFn={d => {
              if (!d || !d.total || d.total === 0) return 'bg-neutral-100';
              const ratio = (d.present + (d.late || 0) * 0.5) / d.total;
              return ratio >= 0.9 ? 'bg-emerald-500' : ratio >= 0.5 ? 'bg-amber-400' : 'bg-red-500';
            }}
            labelFn={d => `Present: ${d.present}, Absent: ${d.absent}, Late: ${d.late || 0}`}
            details={[
              { label: 'Present',    value: attPresent, color: 'bg-emerald-500' },
              { label: 'Late',       value: attLate,    color: 'bg-amber-400'   },
              { label: 'Absent',     value: attAbsent,  color: 'bg-red-500'     },
              { label: 'Attendance', value: `${attKpi}%`, color: 'bg-indigo-500' },
            ]}
            localPeriod={attPeriod}
            setLocalPeriod={setAttPeriod}
          />
        </div>

        {/* ── HEATMAP 2: TEST PARTICIPATION ─────────────────────────────── */}
        <HeatmapBlock
          title="Test Participation"
          icon={Target}
          kpiValue={`${testKpi}%`}
          kpiSub={totalTestsAvail > 0 ? `${testsAttempted} of ${totalTestsAvail} tests taken` : `${testsAttempted} test${testsAttempted !== 1 ? 's' : ''} taken`}
          data={testSliced}
          colorFn={d => d && d.count > 0 ? 'bg-green-500' : 'bg-neutral-100'}
          labelFn={d => `${d.count} test${d.count !== 1 ? 's' : ''} taken`}
          details={[
            { label: 'Attempted', value: testsAttempted,         color: 'bg-green-500'   },
            { label: 'Missed',    value: testsMissed,             color: 'bg-red-400'     },
            { label: 'Available', value: totalTestsAvail || '—', color: 'bg-neutral-300' },
            { label: 'Rate',      value: `${testKpi}%`,           color: 'bg-indigo-500'  },
          ]}
          localPeriod={testPeriod}
          setLocalPeriod={setTestPeriod}
        />

        {/* ── HEATMAP 3: VIDEO WATCHING ──────────────────────────────────── */}
        <HeatmapBlock
          title="Video Watching"
          icon={Eye}
          kpiValue={`${videoPct}%`}
          kpiSub={`${vidDays} active day${vidDays !== 1 ? 's' : ''} · ${vidMins} mins total`}
          data={vidSliced}
          colorFn={d => {
            const m = d?.minutes || 0;
            if (m === 0) return 'bg-neutral-100';
            if (m < 15)  return 'bg-indigo-200';
            if (m < 30)  return 'bg-indigo-400';
            if (m < 60)  return 'bg-indigo-600';
            return 'bg-indigo-800';
          }}
          labelFn={d => `${Math.round(d.minutes || 0)} min watched`}
          details={[
            { label: 'Active Days',  value: vidDays,            color: 'bg-indigo-400' },
            { label: 'Total Mins',   value: vidMins,            color: 'bg-indigo-600' },
            { label: 'Completion',   value: `${videoPct}%`,     color: 'bg-indigo-500' },
          ]}
          localPeriod={vidPeriod}
          setLocalPeriod={setVidPeriod}
        />

        {/* ── AI SUGGESTION BOX ──────────────────────────────────────────── */}
        <div className="glass-panel border-white/60 shadow-sm rounded-2xl overflow-hidden">
          <button onClick={() => setShowSuggestions(s => !s)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/40 transition-colors">
            <span className="flex items-center gap-2.5 text-sm font-bold text-neutral-900">
              <Sparkles size={17} className="text-amber-500" />
              AI Suggestion Box
            </span>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] px-3 py-1 rounded-full font-bold uppercase tracking-wider ${showSuggestions ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
                {showSuggestions ? 'Close' : 'Analyse Performance'}
              </span>
              {showSuggestions ? <ChevronUp size={15} className="text-neutral-400" /> : <ChevronDown size={15} className="text-neutral-400" />}
            </div>
          </button>

          {showSuggestions && (
            <div className="border-t border-neutral-100/80 px-5 py-4 bg-neutral-50/50 space-y-3">
              {suggestions.length === 0 ? (
                <div className="flex items-center gap-3 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                  <CheckCircle2 size={17} /> No significant issues detected — performance looks great!
                </div>
              ) : (
                suggestions.map((s, i) => {
                  const style = SUGGESTION_STYLES[s.type] || SUGGESTION_STYLES.tip;
                  return (
                    <div key={i} className={`flex items-start gap-3 p-4 rounded-xl text-sm font-medium leading-relaxed border ${style.bg}`}>
                      <span className="text-base flex-shrink-0 mt-0.5">{style.icon}</span>
                      <span>{s.text}</span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ── DETAILED TOPIC BREAKDOWN TABLE ─────────────────────────────── */}
        <div>
          <button onClick={() => setShowBreakdown(s => !s)}
            className="w-full flex items-center justify-between px-5 py-3.5 glass-panel border-white/60 shadow-sm rounded-2xl hover:bg-white/60 transition-colors">
            <span className="flex items-center gap-2 text-sm font-bold text-neutral-700">
              <BookOpen size={15} />
              Detailed Subject Breakdown
            </span>
            {showBreakdown ? <ChevronUp size={15} className="text-neutral-400" /> : <ChevronDown size={15} className="text-neutral-400" />}
          </button>

          {showBreakdown && breakdownRows.length > 0 && (
            <div className="mt-2 glass-panel border-white/60 shadow-sm rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider bg-neutral-50/60">
                    <th className="text-left px-5 py-2.5">Subject</th>
                    <th className="text-center px-4 py-2.5">Tests</th>
                    <th className="text-center px-4 py-2.5">Avg Score</th>
                    <th className="text-center px-4 py-2.5 hidden sm:table-cell">Videos</th>
                    <th className="text-center px-4 py-2.5 hidden sm:table-cell">Attendance</th>
                    <th className="text-center px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {breakdownRows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/40'}>
                      <td className="px-5 py-3 font-medium text-neutral-800 text-xs">
                        <span className="mr-1.5">{row.emoji}</span>{row.subject}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-neutral-500">{row.testCount}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${row.testCount === 0 ? 'bg-neutral-100 text-neutral-400' : row.avgScore >= 75 ? 'bg-emerald-100/60 text-emerald-700' : row.avgScore >= 50 ? 'bg-amber-100/60 text-amber-700' : 'bg-red-100/60 text-red-700'}`}>
                          {row.testCount > 0 ? `${row.avgScore}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-neutral-500 hidden sm:table-cell">
                        {row.videosTotal > 0 ? `${row.videosDone}/${row.videosTotal}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className={`text-xs font-bold ${row.attendance >= 75 ? 'text-emerald-600' : row.attendance > 0 ? 'text-red-500' : 'text-neutral-400'}`}>
                          {row.attendance > 0 ? `${row.attendance}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] font-bold uppercase tracking-wide ${row.status === 'Strong' ? 'text-emerald-600' : row.status === 'OK' ? 'text-amber-600' : row.status === '—' ? 'text-neutral-400' : 'text-red-500'}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
