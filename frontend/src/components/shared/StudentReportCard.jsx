import React, { useState, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import {
  Trophy, TrendingUp, Calendar, Eye, Sparkles, ChevronDown, ChevronUp,
  Download, Target, BookOpen, Video, CheckCircle2, BarChart3,
  ClipboardList, Star, Share2, Loader2, Play, Clock, AlertTriangle, Radio
} from 'lucide-react';
import { Avatar } from '../ui';
import { aiApi } from '../../lib/api';

const CARD_COLORS = [
  { bg: 'bg-[#F8E1FB]', text: 'text-[#872792]', badge: 'bg-[#872792]/10 text-[#872792]' },
  { bg: 'bg-[#EAF3EB]', text: 'text-[#1D6A2B]', badge: 'bg-[#1D6A2B]/10 text-[#1D6A2B]' },
  { bg: 'bg-[#FFF6D8]', text: 'text-[#966B08]', badge: 'bg-[#966B08]/10 text-[#966B08]' },
  { bg: 'bg-[#E8F0FE]', text: 'text-[#1A56DB]', badge: 'bg-[#1A56DB]/10 text-[#1A56DB]' },
  { bg: 'bg-[#FFEBE5]', text: 'text-[#9A3B1C]', badge: 'bg-[#9A3B1C]/10 text-[#9A3B1C]' },
];

const SUBJECT_COLORS = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
];

const getHeatmapPeriods = () => {
  const options = [];
  const now = new Date();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    let label = i === 0 ? "This Month" : i === 1 ? "1 Month Ago" : `${i} Months Ago`;
    label += ` (${monthNames[d.getMonth()]})`;
    options.push({ id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label });
  }
  return options;
};

const HEATMAP_PERIODS = getHeatmapPeriods();
function getCurrentMonthId() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return 'Offline';
  const diff = (new Date() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function pct(n) { return `${Math.round(n || 0)}%`; }

function sliceHeatmap(data, periodId) {
  if (!data || data.length === 0) return [];
  return data.filter(d => d.date && d.date.startsWith(periodId));
}

function buildHeatmapWeeksForMonth(rawData, periodId) {
  const dateMap = {};
  if (rawData) rawData.forEach(d => { dateMap[d.date] = d; });
  const [year, month] = periodId.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  let cur = new Date(firstDay);
  cur.setDate(cur.getDate() - cur.getDay());
  let end = new Date(lastDay);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const allDays = [];
  while (cur <= end) {
    allDays.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
    cur.setDate(cur.getDate() + 1);
  }
  const weeks = [];
  for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));
  return { weeks, dateMap };
}

function HeatmapBlock({ title, icon: Icon, kpiValue, kpiSub, data, colorFn, labelFn, details, localPeriod, setLocalPeriod }) {
  const sliced = useMemo(() => sliceHeatmap(data, localPeriod), [data, localPeriod]);
  const { weeks, dateMap } = useMemo(() => buildHeatmapWeeksForMonth(sliced, localPeriod), [sliced, localPeriod]);
  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="bg-white rounded-[2rem] border border-black/5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[1rem] bg-neutral-100 flex items-center justify-center">
            <Icon size={18} className="text-neutral-500" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest">{title}</p>
            <p className="text-xl font-black text-neutral-900 leading-tight">{kpiValue}</p>
            {kpiSub && <p className="text-[10px] font-bold text-neutral-400 mt-0.5">{kpiSub}</p>}
          </div>
        </div>
        <select value={localPeriod} onChange={(e) => setLocalPeriod(e.target.value)} className="text-[11px] font-bold bg-neutral-50 px-2 py-1 rounded-lg border-none outline-none cursor-pointer text-neutral-600">
          {HEATMAP_PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      {weeks.length === 0 ? (
        <div className="text-center py-6 text-xs font-bold text-neutral-400">No data for this period</div>
      ) : (
        <div className="overflow-x-auto pb-1 scrollbar-hide">
          <div className="flex gap-1.5 min-w-max">
            <div className="flex flex-col gap-1.5 mr-1 text-center">
              {DAY_LABELS.map((d, i) => (
                <div key={i} className="h-5 w-3 flex items-center justify-center text-[9px] text-neutral-400 font-extrabold">{i % 2 === 1 ? d : ''}</div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1.5">
                {week.map((day, di) => {
                  const entry = dateMap?.[day];
                  const inRange = day.startsWith(localPeriod);
                  return (
                    <div key={di} title={entry ? labelFn(entry) : day} className={`w-5 h-5 rounded-[4px] transition-all ${inRange && entry ? colorFn(entry) : inRange ? 'bg-neutral-100' : 'opacity-0'}`} />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="border-t border-black/5 pt-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {details.map((d, i) => (
            <span key={i} className="flex items-center gap-1.5 text-[11px] font-extrabold text-neutral-500">
              <span className={`w-2.5 h-2.5 rounded-full ${d.color}`} />
              {d.label}: <strong className="text-neutral-900">{d.value}</strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function radarPath(data, cx, cy, r, valueKey) {
  const n = data.length || 1;
  return data.map((d, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const pct = Math.max(0, Math.min((d[valueKey] || 0) / 100, 1));
    return [cx + r * pct * Math.cos(angle), cy + r * pct * Math.sin(angle)];
  });
}

function pointsToPath(pts) {
  if (!pts || pts.length === 0) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";
}

function CustomRadarChart({ data }) {
  const cx = 135, cy = 135, r = 85, n = data.length || 1, levels = [0.2, 0.4, 0.6, 0.8, 1.0];
  const axisPoints = data.map((_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
  const studentPts = radarPath(data, cx, cy, r, "value"), avgPts = radarPath(data, cx, cy, r, "classAvg");

  return (
    <div className="w-full flex justify-center py-2">
      <svg width="270" height="270" style={{ overflow: "visible" }} className="mx-auto select-none">
        <defs>
          <radialGradient id="youGlowSvg" cx="50%" cy="50%" r="80%">
            <stop offset="0%" stopColor="#1A56DB" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#1A56DB" stopOpacity={0.05} />
          </radialGradient>
        </defs>
        {levels.map((l) => {
          const pts = data.map((_, i) => {
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
            return [cx + r * l * Math.cos(angle), cy + r * l * Math.sin(angle)];
          });
          return <polygon key={l} points={pts.map(p => p.join(",")).join(" ")} fill="none" stroke="#f3f4f6" strokeWidth="1.5" />;
        })}
        {axisPoints.map((pt, i) => <line key={i} x1={cx} y1={cy} x2={pt.x} y2={pt.y} stroke="#f3f4f6" strokeWidth="1.5" />)}
        {data.length > 2 && (
          <>
            <path d={pointsToPath(avgPts)} fill="rgba(156, 163, 175, 0.05)" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="4 4" className="transition-all duration-300" />
            <path d={pointsToPath(studentPts)} fill="url(#youGlowSvg)" stroke="#1A56DB" strokeWidth="3" className="transition-all duration-300" />
          </>
        )}
        {studentPts.map((pt, i) => <circle key={i} cx={pt[0]} cy={pt[1]} r="5" fill="#1A56DB" stroke="#fff" strokeWidth="2" className="transition-all duration-300" />)}
        {data.map((d, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const lx = cx + (r + 18) * Math.cos(angle), ly = cy + (r + 18) * Math.sin(angle);
          const anchor = Math.abs(Math.cos(angle)) < 0.1 ? "middle" : Math.cos(angle) < 0 ? "end" : "start";
          let dy = 4; if (Math.sin(angle) < -0.9) dy = -5; else if (Math.sin(angle) > 0.9) dy = 10;
          return <text key={i} x={lx} y={ly + dy} textAnchor={anchor} fontSize="10" className="fill-neutral-600 font-extrabold">{d.metric}</text>;
        })}
      </svg>
    </div>
  );
}

export function shareReportText(data, period) {
  if (!data) return '';
  const s = data.student || {};
  const pText = period ? (period.charAt(0).toUpperCase() + period.slice(1)) : 'Overall';
  const subjects = data.subject_radar || [];
  let text = `📚 *Student Report Card - ${s.name}*\n*Period:* ${pText}\n*Average Score:* ${Math.round(s.avg_score || 0)}%\n*Attendance:* ${Math.round(s.attendance_pct || 0)}%\n`;
  if (data.rank) text += `*Class Rank:* ${data.rank}/${data.total_students}\n`;
  if (subjects.length > 0) {
    text += `\n*Subject Details:*\n`;
    subjects.forEach(sub => {
      const avg = sub.test_count > 0 ? `${Math.round(sub.test_avg)}%` : '—';
      const att = sub.att_total > 0 ? `${Math.round(sub.attendance_pct)}%` : '—';
      text += `• ${sub.emoji || ''} ${sub.subject}: Avg ${avg} | Att. ${att}\n`;
    });
  }
  return text + `\nGenerated via Udaya LMS.`;
}

export default function StudentReportCard({ data, period, onPeriodChange, showHeader = true, onDownloadPDF }) {
  const [selSubject, setSelSubject] = useState('all');
  const currentMonthId = useMemo(() => getCurrentMonthId(), []);
  const [attPeriod, setAttPeriod] = useState(currentMonthId);
  const [testPeriod, setTestPeriod] = useState(currentMonthId);
  const [vidPeriod, setVidPeriod] = useState(currentMonthId);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState('');
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [heatmapSubject, setHeatmapSubject] = useState('all');
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const text = shareReportText(data, period);
    if (!text) return;
    if (navigator.share) {
      try { 
        await navigator.share({ title: `${data.student?.name || 'Student'} - Report Card`, text }); 
        return; 
      } catch (err) { 
        console.error('Share dialog closed or failed', err); 
        return; // Do not fallback to clipboard if share was cancelled
      }
    }
    // Fallback if navigator.share is not supported
    try { 
      await navigator.clipboard.writeText(text); 
      setCopied(true); 
      setTimeout(() => setCopied(false), 2000); 
    } catch (err) { 
      console.error('Copy fail', err); 
    }
  }, [data, period]);

  const student = data?.student || {}, subjects = data?.subjects || [], subjectRadar = data?.subject_radar || [];
  const testTimeline = data?.test_timeline || [], topicMap = data?.topic_map || [];
  const attHeatmapRaw = data?.attendance_heatmap || [], vidHeatmapRaw = data?.video_heatmap || [], testHeatmapRaw = data?.test_heatmap || [];
  const assignStats = data?.assignment_stats || { total: 0, submitted: 0, graded: 0, avg_marks_pct: 0, total_points_from_assignments: 0 };
  const assignScores = data?.assignment_scores || [];
  const liveStats = data?.live_classes_stats || { total: 0, attended: 0, attendance_pct: 0 };
  
  const attData = heatmapSubject === 'all' ? attHeatmapRaw : (data?.attendance_heatmap_by_subject?.[heatmapSubject] || []);
  const vidData = heatmapSubject === 'all' ? vidHeatmapRaw : (data?.video_heatmap_by_subject?.[heatmapSubject] || []);
  const testData = heatmapSubject === 'all' ? testHeatmapRaw : (data?.test_heatmap_by_subject?.[heatmapSubject] || []);

  const totalVids = subjectRadar.reduce((a, s) => a + (s.video_total || 0), 0);
  const doneVids = subjectRadar.reduce((a, s) => a + (s.video_done || 0), 0);
  const videoPct = totalVids > 0 ? Math.round((doneVids / totalVids) * 100) : 0;
  const rank = data?.rank, totalStudents = data?.total_students || 0;

  const radarData = useMemo(() => {
    const vhm = vidHeatmapRaw, activeDays = vhm.filter(d => d.minutes > 0).length;
    const consistency = vhm.length > 0 ? Math.round((activeDays / vhm.length) * 100) : 0;
    return [
      { metric: 'Accuracy', fullName: 'Test Accuracy', value: Math.round(student.avg_score || 0), classAvg: 65 },
      { metric: 'Attendance', fullName: 'Attendance', value: Math.round(student.attendance_pct || 0), classAvg: 75 },
      { metric: 'Videos', fullName: 'Video Completion', value: videoPct, classAvg: 60 },
      { metric: 'Consistency', fullName: 'Consistency', value: consistency, classAvg: 70 },
      { metric: 'Mastery', fullName: 'Topic Mastery', value: Math.round(data?.topic_mastery_pct || 0), classAvg: 60 },
      { metric: 'Points', fullName: 'Points', value: Math.min(100, Math.round(((student.points || 0) / 500) * 100)), classAvg: 50 },
    ];
  }, [data, videoPct, vidHeatmapRaw, student.avg_score, student.attendance_pct, student.points]);

  const weakestTopics = useMemo(() => {
    const rows = topicMap.map(t => ({ topic: t.topic, subject: t.subject, videoStatus: t.video_completed ? 'Watched' : 'Not Watched', score: t.score_pct, status: t.score_pct >= 75 ? 'Strong' : t.score_pct >= 50 ? 'OK' : 'Weak' }));
    const mappedTests = new Set(topicMap.map(t => t.test_title));
    testTimeline.forEach(t => {
      if (!mappedTests.has(t.test_title)) rows.push({ topic: t.test_title, subject: t.subject, videoStatus: '—', score: t.score_pct, status: t.score_pct >= 75 ? 'Strong' : t.score_pct >= 50 ? 'OK' : 'Weak' });
    });
    return rows.sort((a, b) => a.score - b.score).slice(0, 10);
  }, [topicMap, testTimeline]);

  const { lineData, subjectLines } = useMemo(() => {
    const trunc = s => s && s.length > 18 ? s.slice(0, 18) + '…' : (s || '');
    const filtered = selSubject === 'all' ? testTimeline : testTimeline.filter(t => t.subject_id === selSubject || t.subject === subjects.find(s => s.id === selSubject)?.name);
    if (selSubject !== 'all') return { lineData: filtered.map(t => ({ name: trunc(t.test_title), score: t.score_pct, low: t.score_pct < 60 })), subjectLines: [] };
    const uniqueSubjs = [...new Set(filtered.map(t => t.subject).filter(Boolean))];
    const rows = [], seen = new Set();
    [...filtered].sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(t => {
      const key = t.test_id || `${t.date}_${t.test_title}`;
      if (!seen.has(key)) { seen.add(key); rows.push({ name: trunc(t.test_title), _tests: {} }); }
      const row = rows.find(r => r.name === trunc(t.test_title));
      if (row) row._tests[t.subject] = t.score_pct;
    });
    return { lineData: rows.map(r => { const e = { name: r.name }; uniqueSubjs.forEach(s => { e[s] = r._tests[s] ?? null; }); return e; }), subjectLines: uniqueSubjs.map((s, i) => ({ subject: s, color: SUBJECT_COLORS[i % SUBJECT_COLORS.length] })) };
  }, [data, selSubject, testTimeline, subjects]);

  const breakdownRows = useMemo(() => {
    if (!subjectRadar || subjectRadar.length === 0) return [];
    return subjectRadar.map(r => ({
      subject: r.subject, emoji: r.emoji,
      testCount: r.test_count || 0, avgScore: Math.round(r.test_avg || 0),
      videosDone: r.video_done || 0, videosTotal: r.video_total || 0,
      attendance: Math.round(r.attendance_pct || 0),
      status: r.test_count === 0 ? '—' : r.test_avg >= 75 ? 'Strong' : r.test_avg >= 50 ? 'OK' : 'Weak'
    }));
  }, [subjectRadar]);

  const gradedAssignments = useMemo(() => assignScores.filter(s => s.status === 'Graded' || s.marks_obtained != null).map(s => ({ ...s, marks_obtained: Math.round(s.marks_obtained || 0) })), [assignScores]);

  const attSliced = sliceHeatmap(attData, attPeriod), attPresent = attSliced.reduce((a, d) => a + (d.present || 0), 0), attAbsent = attSliced.reduce((a, d) => a + (d.absent || 0), 0), attLate = attSliced.reduce((a, d) => a + (d.late || 0), 0), attTotal = attPresent + attAbsent + attLate;
  const attKpi = attTotal > 0 ? Math.round(((attPresent + attLate * 0.5) / attTotal) * 100) : 0;
  const testSliced = sliceHeatmap(testData, testPeriod), testsAttempted = testSliced.reduce((a, d) => a + (d.count || 0), 0), totalTestsAvail = data?.total_tests_in_standard || 0, testsMissed = Math.max(0, totalTestsAvail - testsAttempted);
  const testKpi = totalTestsAvail > 0 ? Math.round((testsAttempted / totalTestsAvail) * 100) : (testsAttempted > 0 ? 100 : 0);
  const vidSliced = sliceHeatmap(vidData, vidPeriod), vidDays = vidSliced.filter(d => d.minutes > 0).length, vidMins = Math.round(vidSliced.reduce((a, d) => a + (d.minutes || 0), 0));

  const renderMarkdown = (text) => {
    if (!text || typeof text !== 'string') return null;
    const lines = text.split('\n');
    return lines.map((line, i) => {
      const cursor = (i === lines.length - 1 && isStreaming) ? <span className="animate-pulse text-[#872792] font-black ml-1">▍</span> : null;
      const trimmed = line.trim();
      if (trimmed === '') return <div key={i} className="h-2">{cursor}</div>;
      if (trimmed.match(/Focus of the Week|What's Going Well|What I Noticed|Recommended Actions|Next Level Goal|AI Mentor Message/i)) {
        return <h3 key={i} className="font-black text-[#872792] text-[15px] mt-4 mb-2">{trimmed}{cursor}</h3>;
      }
      const parts = trimmed.split(/(\*\*.*?\*\*)/g).map((p, j) => p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={j} className="font-extrabold text-[#872792]">{p.slice(2, -2)}</strong> : p);
      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        const innerParts = trimmed.substring(2).split(/(\*\*.*?\*\*)/g).map((p, j) => p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={j} className="font-extrabold text-[#872792]">{p.slice(2, -2)}</strong> : p);
        return <li key={i} className="ml-5 list-disc text-[#872792]/80 font-medium mb-1.5 leading-relaxed text-[14px]">{innerParts}{cursor}</li>;
      }
      return <p key={i} className="mb-2 text-[#872792]/80 font-medium leading-relaxed text-[14px]">{parts}{cursor}</p>;
    });
  };

  const handleAnalyzePerformance = useCallback(async () => {
    if (showSuggestions) { setShowSuggestions(false); return; }
    setShowSuggestions(true);
    if (suggestions) return;
    setSuggestionsLoading(true); setSuggestionsError(''); setSuggestions('');
    const subjectBreakdown = subjectRadar.map(s => `${s.subject}: test ${Math.round(s.test_avg || 0)}%, attendance ${Math.round(s.attendance_pct || 0)}%, videos ${s.video_done || 0}/${s.video_total || 0}`).join(' | ') || 'No subject data';
    const recentTests = testTimeline.slice(-5).map(t => `${t.test_title} (${t.subject || ''}) ${Math.round(t.score_pct || 0)}%${t.date ? ` on ${t.date}` : ''}`).join('; ') || 'No recent tests';
    const weakTopicsDetail = weakestTopics.slice(0, 5).map(t => `${t.topic} — ${Math.round(t.score || 0)}% — ${t.videoStatus}`).join('; ') || 'None';
    const stats = { student_name: student.name || 'Student', standard_name: student.standard_name || 'N/A', attendance_data: `Attendance is ${Math.round(student.attendance_pct || 0)}%`, video_progress_data: `Video completion is ${videoPct}% (${doneVids}/${totalVids} videos)`, assignment_data: `Assignment average is ${assignStats.avg_marks_pct}% (submitted ${assignStats.submitted}/${assignStats.total})`, test_data: `Test average is ${Math.round(student.avg_score || 0)}%, attempted ${testsAttempted}, missed ${testsMissed}`, subject_breakdown: subjectBreakdown, recent_tests: recentTests, weak_topics_detail: weakTopicsDetail };
    try {
      let acc = '';
      await aiApi.generateInsightsStream(student.id, stats, (chunk) => { acc += chunk; setSuggestionsLoading(false); setIsStreaming(true); setSuggestions(acc); });
      setSuggestions(acc);
    } catch (e) { setSuggestionsError(e.message || 'Failed to generate insights.'); } finally { setSuggestionsLoading(false); setIsStreaming(false); }
  }, [showSuggestions, suggestions, student, videoPct, doneVids, totalVids, subjectRadar, testTimeline, weakestTopics, testsAttempted, testsMissed, assignStats]);

  const handleDownloadPDF = useCallback(async () => {
    if (!data) return;
    if (onDownloadPDF) { onDownloadPDF(data); return; }
    try {
      const jsPDFModule = await import('jspdf'); 
      await import('jspdf-autotable');
      const JsPDFConstructor = jsPDFModule.default || jsPDFModule.jsPDF;
      const doc = new JsPDFConstructor(); 
      const s = student || {};
      const pText = period ? (period.charAt(0).toUpperCase() + period.slice(1)) : 'Overall';
      
      doc.setFontSize(20); doc.text('Student Report Card', 14, 20); doc.setFontSize(12);
      doc.text(`Name: ${s.name || 'Unknown'}  |  Username: @${s.username || 'unknown'}`, 14, 30);
      doc.text(`Period: ${pText}  |  Avg Score: ${Math.round(s.avg_score || 0)}%  |  Attendance: ${Math.round(s.attendance_pct || 0)}%  |  Rank: ${rank ? `${rank}/${totalStudents}` : 'N/A'}`, 14, 38);
      
      if (subjectRadar && subjectRadar.length > 0) {
        doc.setFontSize(14); doc.text('Subject Performance', 14, 52);
        doc.autoTable({ 
          startY: 56, 
          head: [['Subject', 'Avg Score', 'Videos Done', 'Attendance']], 
          body: subjectRadar.map(r => [
            `${r.emoji || ''} ${r.subject}`, 
            r.test_count > 0 ? `${Math.round(r.test_avg || 0)}%` : '—', 
            r.video_total > 0 ? `${r.video_done}/${r.video_total}` : '—', 
            r.att_total > 0 ? `${Math.round(r.attendance_pct || 0)}%` : '—'
          ]), 
          theme: 'striped', 
          headStyles: { fillColor: [99, 102, 241] } 
        });
      }
      doc.save(`${(s.name || 'Student').replace(/\s+/g, '_')}_Report_${pText}.pdf`);
    } catch (e) {
      console.error("Failed to generate PDF", e);
      alert("Failed to generate PDF. Please ensure you have a stable connection.");
    }
  }, [data, period, rank, totalStudents, subjectRadar, student, onDownloadPDF]);

  if (!data) return (
    <div className="flex flex-col items-center justify-center py-24 text-neutral-400 bg-[#F4F7F6]">
      <BarChart3 size={40} className="mb-4 opacity-30" />
      <p className="text-lg font-bold">No report data available yet.</p>
    </div>
  );

  return (
    <div className={`font-sans ${showHeader ? 'bg-[#F4F7F6]' : 'bg-transparent'} text-neutral-900 min-h-screen`}>
      <div className={`mx-auto ${showHeader ? 'max-w-[1400px] lg:px-4 lg:py-6' : 'w-full'}`}>
        
        {/* CONTAINER */}
        <div className={`${showHeader ? 'bg-white shadow-[0_8px_40px_rgb(0,0,0,0.06)] lg:rounded-[3rem] border border-black/5 overflow-hidden' : ''}`}>
          
          {/* HEADER (Dark Bento Style) */}
          {showHeader && (
            <div className="bg-[#0f1014] text-white px-5 py-6 md:px-8 md:py-8 flex items-center justify-between gap-5 flex-wrap">
              <div className="flex items-center gap-3 md:gap-4">
                <Avatar name={student.name || 'S'} src={student.avatar_url} size="lg" />
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-white tracking-wide leading-tight mb-1">{student.name || 'Student'}</h2>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {student.standard_name && <span className="text-[11px] font-extrabold bg-white/20 text-white px-2.5 py-0.5 rounded-full">{student.standard_name}</span>}
                    <span className="text-[11px] font-bold text-white/50 bg-white/5 px-2.5 py-0.5 rounded-full flex items-center gap-1"><Calendar size={12}/> {period.charAt(0).toUpperCase() + period.slice(1)} Report</span>
                    <span className="text-[11px] font-bold text-[#84cc16] bg-[#84cc16]/10 px-2.5 py-0.5 rounded-full flex items-center gap-1"><Clock size={12}/> {timeAgo(student.last_active_at)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 md:gap-3 w-full sm:w-auto">
                <button onClick={handleShare} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-extrabold bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/10">
                  {copied ? <CheckCircle2 size={15} className="text-emerald-400" /> : <Share2 size={15} />}
                  {copied ? 'Copied' : 'Share'}
                </button>
                <button onClick={handleDownloadPDF} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-extrabold bg-white hover:bg-neutral-100 text-[#0f1014] rounded-full shadow-sm transition-all">
                  <Download size={15} /> Export PDF
                </button>
              </div>
            </div>
          )}

          {/* GRID LAYOUT */}
          <div className={`${showHeader ? 'p-4 md:p-8' : 'p-0'} `}>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 md:gap-8">
              
              {/* LEFT COLUMN: MAIN PERFORMANCE */}
              <div className="xl:col-span-8 space-y-5 md:space-y-8">
                
                {/* 1. TOP STATS (Mini Bento Cards) */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
                  <div className="bg-[#EAF3EB] rounded-[1.5rem] md:rounded-[2rem] p-4 md:p-5 flex flex-col justify-center items-center text-center shadow-sm border border-[#C8E4CD]/50 hover:shadow-md transition-shadow">
                    <p className="text-3xl md:text-3xl font-black text-[#1D6A2B]">{pct(student.avg_score)}</p>
                    <p className="text-[10px] font-black text-[#1D6A2B]/60 uppercase tracking-widest mt-1.5 flex items-center gap-1"><Target size={10}/> Avg Score</p>
                  </div>
                  <div className="bg-[#E8F0FE] rounded-[1.5rem] md:rounded-[2rem] p-4 md:p-5 flex flex-col justify-center items-center text-center shadow-sm border border-[#C6D8FB]/50 hover:shadow-md transition-shadow">
                    <p className="text-3xl md:text-3xl font-black text-[#1A56DB]">{pct(student.attendance_pct)}</p>
                    <p className="text-[10px] font-black text-[#1A56DB]/60 uppercase tracking-widest mt-1.5 flex items-center gap-1"><Calendar size={10}/> Attendance</p>
                  </div>
                  <div className="bg-[#FFF6D8] rounded-[1.5rem] md:rounded-[2rem] p-4 md:p-5 flex flex-col justify-center items-center text-center shadow-sm border border-[#FFEAB0]/50 hover:shadow-md transition-shadow">
                    <p className="text-3xl md:text-3xl font-black text-[#966B08]">{videoPct}%</p>
                    <p className="text-[10px] font-black text-[#966B08]/60 uppercase tracking-widest mt-1.5 flex items-center gap-1"><Video size={10}/> Videos</p>
                  </div>
                  <div className="bg-[#FFEBE5] rounded-[1.5rem] md:rounded-[2rem] p-4 md:p-5 flex flex-col justify-center items-center text-center shadow-sm border border-[#FFD0C2]/50 hover:shadow-md transition-shadow">
                    <p className="text-3xl md:text-3xl font-black text-[#9A3B1C]">{rank ? `${rank}/${totalStudents}` : '—'}</p>
                    <p className="text-[10px] font-black text-[#9A3B1C]/60 uppercase tracking-widest mt-1.5 flex items-center gap-1"><Trophy size={10}/> Rank</p>
                  </div>
                  <div className="col-span-2 md:col-span-1 bg-[#F4E8FF] rounded-[1.5rem] md:rounded-[2rem] p-4 md:p-5 flex flex-col justify-center items-center text-center shadow-sm border border-[#DDB4FC]/50 hover:shadow-md transition-shadow">
                    <p className="text-3xl md:text-3xl font-black text-[#7E22CE]">{liveStats.attendance_pct}%</p>
                    <p className="text-[10px] font-black text-[#7E22CE]/60 uppercase tracking-widest mt-1.5 flex items-center gap-1"><Radio size={10}/> Live Class</p>
                  </div>
                </div>

                {/* 2. VISUAL ANALYTICS (Charts) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="bg-white rounded-[2rem] border border-black/5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-5 md:p-6 flex flex-col items-center text-center">
                    <h4 className="text-[16px] font-black text-neutral-900 mb-0.5">Skill Radar</h4>
                    <p className="text-[10px] font-bold text-neutral-400 mb-4 uppercase tracking-widest">You vs Class Avg</p>
                    <div className="flex-1 w-full flex items-center justify-center">
                      <CustomRadarChart data={radarData} />
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-[2rem] border border-black/5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-5 md:p-6 flex flex-col">
                    <div className="flex justify-between items-start mb-4 gap-2">
                      <div>
                        <h4 className="text-[16px] font-black text-neutral-900 mb-0.5">Score Trend</h4>
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Topic Mastery</p>
                      </div>
                      <select value={selSubject} onChange={e => setSelSubject(e.target.value)}
                        className="text-[10px] font-extrabold bg-neutral-100 px-2.5 py-1 rounded-full border-none outline-none text-neutral-700 cursor-pointer">
                        <option value="all">All Subjects</option>
                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-h-[180px] w-full min-w-0">
                      {lineData.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-xs font-bold text-neutral-400">No test data</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={lineData} margin={{ top: 8, right: 0, left: -25, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 700 }} axisLine={false} tickLine={false} dy={8} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 700 }} axisLine={false} tickLine={false} dx={-8} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', fontSize: 11, fontWeight: 'bold' }} formatter={(v, name) => [v != null ? `${v}%` : 'N/A', name]} labelFormatter={(label, entries) => entries.length > 0 && entries[0].payload.flagged ? `⚠️ Flagged: ${label}` : label} />
                            <ReferenceLine y={60} stroke="#fca5a5" strokeDasharray="4 3" strokeWidth={1} />
                            {selSubject === 'all' ? (
                              subjectLines.map(sl => <Line key={sl.subject} type="monotone" dataKey={sl.subject} name={sl.subject} stroke={sl.color} strokeWidth={2.5} connectNulls={false} dot={props => { const { cx, cy, payload } = props; return payload.flagged ? <svg x={cx-6} y={cy-6} width="12" height="12"><path d="M6 1L1 11h10L6 1z" fill="#ef4444"/><circle cx="6" cy="7" r="1" fill="#fff"/><circle cx="6" cy="9" r="0.5" fill="#fff"/></svg> : <circle cx={cx} cy={cy} r={2} strokeWidth={2} fill="#fff" stroke={sl.color}/>; }} activeDot={{ r: 4, strokeWidth: 0 }} />)
                            ) : (
                              <Line type="monotone" dataKey="score" name="Score %" stroke="#1A56DB" strokeWidth={3} dot={props => { const { cx, cy, payload } = props; return payload.flagged ? <svg x={cx-7} y={cy-7} width="14" height="14"><path d="M7 1L1 13h12L7 1z" fill="#ef4444"/><circle cx="7" cy="8" r="1.5" fill="#fff"/><circle cx="7" cy="11" r="1" fill="#fff"/></svg> : <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={payload?.low ? 4 : 3} fill={payload?.low ? '#ef4444' : '#1A56DB'} stroke="#fff" strokeWidth={2} />; }} activeDot={{ r: 6, strokeWidth: 0 }} />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. ACTIVITY CALENDARS (Heatmaps - Restored Video) */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-neutral-900 tracking-tight">Activity Calendars</h3>
                    {subjects.length > 0 && (
                      <select value={heatmapSubject} onChange={e => setHeatmapSubject(e.target.value)}
                        className="text-[11px] font-extrabold bg-neutral-100 px-3 py-1.5 rounded-full border-none outline-none text-neutral-700 cursor-pointer">
                        <option value="all">All Subjects</option>
                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <HeatmapBlock title="Attendance" icon={Calendar} kpiValue={`${attKpi}%`} kpiSub={`${attPresent} present`} data={attSliced}
                      colorFn={d => { if (!d || !d.total || d.total === 0) return 'bg-neutral-100'; const ratio = (d.present + (d.late || 0) * 0.5) / d.total; return ratio >= 0.9 ? 'bg-[#1D6A2B]' : ratio >= 0.5 ? 'bg-amber-400' : 'bg-red-500'; }}
                      labelFn={d => `Present: ${d.present}, Absent: ${d.absent}`}
                      details={[{ label: 'Present', value: attPresent, color: 'bg-[#1D6A2B]' }, { label: 'Absent', value: attAbsent, color: 'bg-red-500' }]}
                      localPeriod={attPeriod} setLocalPeriod={setAttPeriod}
                    />
                    <HeatmapBlock title="Tests" icon={Target} kpiValue={`${testKpi}%`} kpiSub={`${testsAttempted} taken`} data={testSliced}
                      colorFn={d => d && d.count > 0 ? 'bg-[#1A56DB]' : 'bg-neutral-100'} labelFn={d => `${d.count} tests taken`}
                      details={[{ label: 'Attempted', value: testsAttempted, color: 'bg-[#1A56DB]' }]}
                      localPeriod={testPeriod} setLocalPeriod={setTestPeriod}
                    />
                    <HeatmapBlock title="Videos" icon={Video} kpiValue={`${videoPct}%`} kpiSub={`${vidDays} active days`} data={vidSliced}
                      colorFn={d => { const m = d?.minutes || 0; if (m === 0) return 'bg-neutral-100'; if (m < 15) return 'bg-indigo-200'; if (m < 30) return 'bg-indigo-400'; return 'bg-indigo-600'; }}
                      labelFn={d => `${Math.round(d.minutes || 0)} mins`}
                      details={[{ label: 'Active Days', value: vidDays, color: 'bg-indigo-400' }]}
                      localPeriod={vidPeriod} setLocalPeriod={setVidPeriod}
                    />
                  </div>
                </div>

                {/* 4. AI MENTOR (Moved to Bottom) */}
                <div className="relative bg-[#F8E1FB] rounded-[2rem] p-5 sm:p-6 overflow-hidden shadow-sm border border-[#F1C2F7] transition-all hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[20px] font-black text-[#872792] leading-tight flex items-center gap-2 mb-1">
                        <Sparkles size={20} className="text-[#872792]" /> AI Mentor Analysis
                      </h3>
                      <p className="text-[12px] font-bold text-[#872792]/70 leading-snug">Personalized coaching and behavioral insights based on your learning patterns.</p>
                    </div>
                    <button onClick={handleAnalyzePerformance} className="flex-shrink-0 w-10 h-10 bg-white rounded-full flex items-center justify-center text-[#872792] shadow-sm hover:scale-105 transition-transform border border-[#F1C2F7]/50">
                      {showSuggestions ? <ChevronUp size={18} strokeWidth={3} /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                    </button>
                  </div>
                  
                  {showSuggestions && (
                    <div className="mt-5 pt-4 border-t border-[#872792]/10">
                      {suggestionsLoading ? (
                        <div className="flex items-center gap-2 text-[13px] font-extrabold text-[#872792]/60 animate-pulse">
                          <Loader2 size={16} className="animate-spin" /> Analyzing your metrics...
                        </div>
                      ) : suggestionsError ? (
                        <div className="p-3 bg-white/50 rounded-xl text-[12px] font-bold text-red-600">
                          {suggestionsError}
                        </div>
                      ) : suggestions ? (
                        <div className="ai-content text-[#872792]">
                          {renderMarkdown(suggestions)}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-[13px] font-extrabold text-[#872792]">
                          <CheckCircle2 size={16} /> Looking sharp! Keep up the good work.
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>


              {/* RIGHT COLUMN: SIDEBAR (Focus Areas & Assignments) */}
              <div className="xl:col-span-4 space-y-6 md:space-y-8">
                
                {/* FOCUS AREAS (Weakest Topics rendered as Bento Cards) */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600"><Target size={14} strokeWidth={2.5}/></div>
                    <h3 className="text-[17px] font-black text-neutral-900 tracking-tight">Focus Areas</h3>
                  </div>
                  {weakestTopics.length === 0 ? (
                    <div className="bg-white rounded-[2rem] border border-black/5 p-6 text-center text-neutral-400 text-sm font-bold shadow-sm">No weak topics identified yet. Great job!</div>
                  ) : (
                    <div className="space-y-3">
                      {weakestTopics.slice(0, 5).map((topic, i) => {
                        const theme = CARD_COLORS[i % CARD_COLORS.length];
                        return (
                          <div key={i} className={`${theme.bg} rounded-[1.5rem] p-4 shadow-sm hover:shadow-md transition-shadow border border-black/5 flex flex-col gap-2`}>
                            <div>
                              <p className={`text-[9px] font-black uppercase tracking-widest ${theme.text} opacity-60 mb-0.5`}>{topic.subject}</p>
                              <p className={`text-[14px] font-black leading-tight ${theme.text}`}>{topic.topic}</p>
                            </div>
                            <div className="flex items-center gap-2 mt-auto pt-1">
                               <span className={`bg-white/60 px-2.5 py-1 rounded-full text-[10px] font-black shadow-sm ${theme.text}`}>{Math.round(topic.score)}% Score</span>
                               {topic.videoStatus === 'Watched' ? (
                                 <span className="bg-emerald-100/80 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-black shadow-sm">Watched</span>
                               ) : (
                                 <span className="bg-red-100/80 text-red-700 px-2.5 py-1 rounded-full text-[10px] font-black shadow-sm">Not Watched</span>
                               )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ASSIGNMENTS OVERVIEW (Restored Bar Chart) */}
                {assignStats.total > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600"><ClipboardList size={14} strokeWidth={2.5}/></div>
                      <h3 className="text-[17px] font-black text-neutral-900 tracking-tight">Assignments</h3>
                    </div>
                    <div className="bg-white rounded-[2rem] border border-black/5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Submitted</p>
                          <p className="text-xl font-black text-neutral-900">{assignStats.submitted}<span className="text-xs text-neutral-400">/{assignStats.total}</span></p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Avg Score</p>
                          <p className="text-xl font-black text-neutral-900">{assignStats.avg_marks_pct}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Points</p>
                          <p className="text-xl font-black text-[#872792]">+{assignStats.total_points_from_assignments}</p>
                        </div>
                      </div>
                      
                      {/* Restored Bar Chart */}
                      {gradedAssignments.length > 0 && (
                        <div className="pt-3 border-t border-black/5">
                          <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-3">Scores</p>
                          <ResponsiveContainer width="100%" height={120}>
                            <BarChart data={gradedAssignments} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                              <XAxis dataKey="assignment_title" tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 700 }} tickFormatter={t => t.length > 8 ? t.slice(0, 8) + '…' : t} axisLine={false} tickLine={false} />
                              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 700 }} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', fontSize: 10, fontWeight: 'bold' }} cursor={{fill: '#f3f4f6'}} />
                              <Bar dataKey="marks_obtained" radius={[3, 3, 0, 0]}>
                                {gradedAssignments.map((e, idx) => <Cell key={idx} fill={e.marks_obtained >= 60 ? '#1A56DB' : '#ef4444'} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {subjectRadar.filter(s => (s.assignment_total || 0) > 0).length > 0 && (
                        <div className="space-y-3 pt-3 border-t border-black/5">
                          {subjectRadar.filter(s => (s.assignment_total || 0) > 0).map(s => {
                            const pct = Math.round(((s.assignment_submitted || 0) / (s.assignment_total || 1)) * 100);
                            return (
                              <div key={s.subject_id}>
                                <div className="flex justify-between text-[10px] font-black mb-1.5">
                                  <span className="text-neutral-700">{s.emoji} {s.subject}</span>
                                  <span className="text-neutral-400">{s.assignment_submitted}/{s.assignment_total}</span>
                                </div>
                                <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-[#1A56DB] rounded-full transition-all" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>

              {/* DETAILED SUBJECT BREAKDOWN TABLE (Restored at the bottom) */}
              {breakdownRows.length > 0 && (
                <div className="xl:col-span-12 mt-2 md:mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600"><BookOpen size={14} strokeWidth={2.5}/></div>
                    <h3 className="text-[17px] font-black text-neutral-900 tracking-tight">Detailed Breakdown</h3>
                  </div>
                  <div className="bg-white rounded-[2rem] border border-black/5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] overflow-hidden">
                    <div className="overflow-x-auto scrollbar-hide">
                      <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                          <tr className="bg-neutral-50 border-b border-black/5">
                            <th className="px-5 py-3.5 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Subject</th>
                            <th className="px-5 py-3.5 text-[10px] font-black text-neutral-400 uppercase tracking-widest text-center">Tests</th>
                            <th className="px-5 py-3.5 text-[10px] font-black text-neutral-400 uppercase tracking-widest text-center">Avg Score</th>
                            <th className="px-5 py-3.5 text-[10px] font-black text-neutral-400 uppercase tracking-widest text-center">Videos</th>
                            <th className="px-5 py-3.5 text-[10px] font-black text-neutral-400 uppercase tracking-widest text-center">Attendance</th>
                            <th className="px-5 py-3.5 text-[10px] font-black text-neutral-400 uppercase tracking-widest text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {breakdownRows.map((row, i) => (
                            <tr key={i} className="hover:bg-neutral-50/50 transition-colors">
                              <td className="px-5 py-4 text-[13px] font-black text-neutral-800">
                                <span className="mr-2 text-base">{row.emoji}</span>{row.subject}
                              </td>
                              <td className="px-5 py-4 text-[13px] font-bold text-neutral-500 text-center">{row.testCount}</td>
                              <td className="px-5 py-4 text-center">
                                <span className={`inline-flex px-3 py-1 rounded-full text-[11px] font-black shadow-sm ${row.testCount === 0 ? 'bg-neutral-100 text-neutral-400' : row.avgScore >= 75 ? 'bg-emerald-100/80 text-emerald-700' : row.avgScore >= 50 ? 'bg-amber-100/80 text-amber-700' : 'bg-red-100/80 text-red-700'}`}>
                                  {row.testCount > 0 ? `${row.avgScore}%` : '—'}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-[13px] font-bold text-neutral-500 text-center">
                                {row.videosTotal > 0 ? `${row.videosDone}/${row.videosTotal}` : '—'}
                              </td>
                              <td className="px-5 py-4 text-center">
                                <span className={`text-[12px] font-black ${row.attendance >= 75 ? 'text-[#1D6A2B]' : row.attendance > 0 ? 'text-red-500' : 'text-neutral-400'}`}>
                                  {row.attendance > 0 ? `${row.attendance}%` : '—'}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-center">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${row.status === 'Strong' ? 'text-emerald-600' : row.status === 'OK' ? 'text-amber-600' : row.status === '—' ? 'text-neutral-400' : 'text-red-500'}`}>
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
