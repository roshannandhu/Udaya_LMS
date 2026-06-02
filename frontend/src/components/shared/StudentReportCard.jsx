import React, { useState, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import {
  Trophy, TrendingUp, Calendar, Eye, Sparkles, ChevronDown, ChevronUp,
  Download, Target, BookOpen, Video, CheckCircle2, BarChart3,
  ClipboardList, Star, Share2, Loader2,
} from 'lucide-react';
import { Avatar } from '../ui';
import { aiApi } from '../../lib/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUBJECT_COLORS = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
];

const getHeatmapPeriods = () => {
  const options = [];
  const now = new Date();
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    let label = "";
    if (i === 0) label = "This Month";
    else if (i === 1) label = "1 Month Ago";
    else label = `${i} Months Ago`;
    
    label += ` (${monthNames[d.getMonth()]})`;
    
    const yearStr = d.getFullYear();
    const monthStr = String(d.getMonth() + 1).padStart(2, '0');
    const id = `${yearStr}-${monthStr}`;
    options.push({ id, label });
  }
  return options;
};

const HEATMAP_PERIODS = getHeatmapPeriods();

function getCurrentMonthId() {
  const now = new Date();
  const yearStr = now.getFullYear();
  const monthStr = String(now.getMonth() + 1).padStart(2, '0');
  return `${yearStr}-${monthStr}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n) { return `${Math.round(n || 0)}%`; }

function sliceHeatmap(data, periodId) {
  if (!data || data.length === 0) return [];
  return data.filter(d => d.date && d.date.startsWith(periodId));
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

function buildHeatmapWeeksForMonth(rawData, periodId) {
  const dateMap = {};
  if (rawData) {
    rawData.forEach(d => { dateMap[d.date] = d; });
  }

  const [year, month] = periodId.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  let cur = new Date(firstDay);
  cur.setDate(cur.getDate() - cur.getDay());

  let end = new Date(lastDay);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const allDays = [];
  while (cur <= end) {
    const yStr = cur.getFullYear();
    const mStr = String(cur.getMonth() + 1).padStart(2, '0');
    const dStr = String(cur.getDate()).padStart(2, '0');
    allDays.push(`${yStr}-${mStr}-${dStr}`);
    cur.setDate(cur.getDate() + 1);
  }

  const weeks = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  return { weeks, dateMap };
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
  const sliced = useMemo(() => sliceHeatmap(data, localPeriod), [data, localPeriod]);
  const { weeks, dateMap } = useMemo(() => buildHeatmapWeeksForMonth(sliced, localPeriod), [sliced, localPeriod]);
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
        <div className="flex items-center gap-2 bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-100/80">
          <Calendar size={12} className="text-neutral-400" />
          <select
            value={localPeriod}
            onChange={(e) => setLocalPeriod(e.target.value)}
            className="text-xs font-semibold bg-transparent border-none outline-none cursor-pointer text-neutral-800"
          >
            {HEATMAP_PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Calendar grid */}
      {weeks.length === 0 ? (
        <div className="text-center py-8 text-sm text-neutral-400">No data for this period</div>
      ) : (
        <div className="overflow-x-auto pb-1">
          {/* Weeks are columns; days run top→bottom (Sun→Sat). Day labels sit in a
              matching vertical column on the left so each label aligns with its row. */}
          <div className="flex gap-1">
            <div className="flex flex-col gap-1 mr-1">
              {DAY_LABELS.map((d, i) => (
                <div key={i} className="h-5 flex items-center text-[9px] text-neutral-400 font-medium leading-none">
                  {i % 2 === 1 ? d : ''}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((day, di) => {
                  const entry = dateMap?.[day];
                  const inRange = day.startsWith(localPeriod);
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

function radarPath(data, cx, cy, r, valueKey) {
  const n = data.length || 1;
  return data.map((d, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const pct = Math.max(0, Math.min((d[valueKey] || 0) / 100, 1));
    const x = cx + r * pct * Math.cos(angle);
    const y = cy + r * pct * Math.sin(angle);
    return [x, y];
  });
}

function pointsToPath(pts) {
  if (!pts || pts.length === 0) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";
}

function CustomRadarChart({ data }) {
  const cx = 135, cy = 135, r = 90;
  const n = data.length || 1;
  const levels = [0.2, 0.4, 0.6, 0.8, 1.0];

  const axisPoints = data.map((_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  const studentPts = radarPath(data, cx, cy, r, "value");
  const avgPts     = radarPath(data, cx, cy, r, "classAvg");

  return (
    <div className="w-full flex justify-center py-2">
      <svg width="270" height="270" style={{ overflow: "visible" }} className="mx-auto select-none">
        <defs>
          <radialGradient id="youGlowSvg" cx="50%" cy="50%" r="80%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
          </radialGradient>
        </defs>

        {/* Outer Circular levels */}
        {levels.map((l) => {
          const pts = data.map((_, i) => {
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
            return [cx + r * l * Math.cos(angle), cy + r * l * Math.sin(angle)];
          });
          return (
            <polygon
              key={l}
              points={pts.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="1"
            />
          );
        })}

        {/* Axis lines */}
        {axisPoints.map((pt, i) => (
          <line key={i} x1={cx} y1={cy} x2={pt.x} y2={pt.y} stroke="#e5e7eb" strokeWidth="1" />
        ))}

        {/* Radar polygons */}
        {data.length > 2 && (
          <>
            <path
              d={pointsToPath(avgPts)}
              fill="rgba(156, 163, 175, 0.05)"
              stroke="#9ca3af"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              className="transition-all duration-300 ease-in-out"
            />
            <path
              d={pointsToPath(studentPts)}
              fill="url(#youGlowSvg)"
              stroke="#6366f1"
              strokeWidth="2.5"
              className="transition-all duration-300 ease-in-out"
            />
          </>
        )}

        {/* Points for Student */}
        {studentPts.map((pt, i) => (
          <circle
            key={i}
            cx={pt[0]}
            cy={pt[1]}
            r="4"
            fill="#6366f1"
            stroke="#fff"
            strokeWidth="1.5"
            className="transition-all duration-300 ease-in-out"
          />
        ))}

        {/* Axis labels */}
        {data.map((d, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const lx = cx + (r + 15) * Math.cos(angle);
          const ly = cy + (r + 15) * Math.sin(angle);
          const anchor = Math.abs(Math.cos(angle)) < 0.1 ? "middle" : Math.cos(angle) < 0 ? "end" : "start";
          
          let dy = 3;
          if (Math.sin(angle) < -0.9) dy = -5; // Top label
          else if (Math.sin(angle) > 0.9) dy = 10; // Bottom label

          return (
            <text
              key={i}
              x={lx}
              y={ly + dy}
              textAnchor={anchor}
              fontSize="10"
              className="fill-neutral-500 font-bold"
            >
              {d.metric}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function shareReportText(data, period) {
  if (!data) return '';
  const s = data.student || {};
  const pText = period ? (period.charAt(0).toUpperCase() + period.slice(1)) : 'Overall';
  const subjects = data.subject_radar || [];
  
  let text = `📚 *Student Report Card - ${s.name}*\n`;
  text += `*Period:* ${pText}\n`;
  text += `*Average Score:* ${Math.round(s.avg_score || 0)}%\n`;
  text += `*Attendance:* ${Math.round(s.attendance_pct || 0)}%\n`;
  if (data.rank) {
    text += `*Class Rank:* ${data.rank}/${data.total_students}\n`;
  }
  
  if (subjects.length > 0) {
    text += `\n*Subject Details:*\n`;
    subjects.forEach(sub => {
      const avg = sub.test_count > 0 ? `${Math.round(sub.test_avg)}%` : '—';
      const att = sub.att_total > 0 ? `${Math.round(sub.attendance_pct)}%` : '—';
      text += `• ${sub.emoji || ''} ${sub.subject}: Avg ${avg} | Att. ${att}\n`;
    });
  }
  
  text += `\nGenerated via Udaya LMS.`;
  return text;
}

export default function StudentReportCard({ data, period, onPeriodChange, showHeader = true, onDownloadPDF }) {
  const [selSubject, setSelSubject] = useState('all');
  const currentMonthId = useMemo(() => getCurrentMonthId(), []);
  const [attPeriod,  setAttPeriod]  = useState(currentMonthId);
  const [testPeriod, setTestPeriod] = useState(currentMonthId);
  const [vidPeriod,  setVidPeriod]  = useState(currentMonthId);
  const [showSuggestions,       setShowSuggestions]       = useState(false);
  const [suggestions,           setSuggestions]           = useState('');
  const [suggestionsLoading,    setSuggestionsLoading]    = useState(false);
  const [isStreaming,           setIsStreaming]           = useState(false);
  const [suggestionsError,      setSuggestionsError]      = useState('');
  const [showBreakdown,         setShowBreakdown]         = useState(false);
  const [heatmapSubject,    setHeatmapSubject]     = useState('all');
  
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const text = shareReportText(data, period);
    if (!text) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${data.student?.name || 'Student'} - Report Card`,
          text: text,
        });
        return;
      } catch (err) {
        // User cancelled or share failed, fallback to copy
      }
    }
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy report: ', err);
    }
  }, [data, period]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const student = data?.student || {};
  const subjects = data?.subjects || [];
  const subjectRadar = data?.subject_radar || [];
  const testTimeline = data?.test_timeline || [];
  const topicMap = data?.topic_map || [];
  const attHeatmapRaw  = data?.attendance_heatmap || [];
  const vidHeatmapRaw  = data?.video_heatmap || [];
  const testHeatmapRaw = data?.test_heatmap || [];
  const assignStats  = data?.assignment_stats  || { total: 0, submitted: 0, graded: 0, avg_marks_pct: 0, total_points_from_assignments: 0 };
  const assignScores = data?.assignment_scores  || [];
  const assignHeatmapRaw = data?.assignment_heatmap || [];
  const gradedAssignments = assignScores.filter(a => a.marks_obtained != null);

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
      { metric: 'Accuracy',    fullName: 'Test Accuracy',    value: Math.round(student.avg_score || 0),       classAvg: 65 },
      { metric: 'Attendance',  fullName: 'Attendance',       value: Math.round(student.attendance_pct || 0),  classAvg: 75 },
      { metric: 'Videos',      fullName: 'Video Completion', value: videoPct,                                 classAvg: 60 },
      { metric: 'Consistency', fullName: 'Consistency',      value: consistency,                              classAvg: 70 },
      { metric: 'Mastery',     fullName: 'Topic Mastery',    value: Math.round(data?.topic_mastery_pct || 0), classAvg: 60 },
      { metric: 'Points',      fullName: 'Points',           value: Math.min(100, Math.round(((student.points || 0) / 500) * 100)), classAvg: 50 },
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

  // The live SSE stream IS the typing effect — text is appended to `suggestions`
  // as it arrives, so no artificial typewriter is needed.
  const renderMarkdown = (text) => {
    if (!text || typeof text !== 'string') return null;
    const lines = text.split('\n');
    const isTyping = isStreaming;

    return lines.map((line, i) => {
      const isLast = i === lines.length - 1;
      const cursor = (isLast && isTyping) ? <span className="animate-pulse text-amber-500 font-bold ml-1">▍</span> : null;
      
      const trimmed = line.trim();
      if (trimmed === '') return <div key={i} className="h-2">{cursor}</div>;
      
      if (
        trimmed.includes('Focus of the Week') || 
        trimmed.includes('What\'s Going Well') || 
        trimmed.includes('What I Noticed') || 
        trimmed.includes('Recommended Actions') || 
        trimmed.includes('Next Level Goal') || 
        trimmed.includes('AI Mentor Message')
      ) {
        return <h3 key={i} className="font-bold text-neutral-800 text-[15px] mt-4 mb-2">{trimmed}{cursor}</h3>;
      }
      
      const parts = trimmed.split(/(\*\*.*?\*\*)/g).map((part, j) => 
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={j} className="text-neutral-800 font-semibold">{part.slice(2, -2)}</strong> : part
      );
      
      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        const inner = trimmed.substring(2);
        const innerParts = inner.split(/(\*\*.*?\*\*)/g).map((part, j) => 
          part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={j} className="text-neutral-800 font-semibold">{part.slice(2, -2)}</strong> : part
        );
        return <li key={i} className="ml-5 list-disc text-neutral-600 mb-1.5 leading-relaxed text-sm">{innerParts}{cursor}</li>;
      }
      
      return <p key={i} className="mb-2 text-neutral-600 leading-relaxed text-sm">{parts}{cursor}</p>;
    });
  };

  // AI Suggestions
  const handleAnalyzePerformance = useCallback(async () => {
    if (showSuggestions) {
      setShowSuggestions(false);
      return;
    }
    setShowSuggestions(true);
    if (suggestions) return; // already generated

    setSuggestionsLoading(true);
    setSuggestionsError('');
    setSuggestions('');

    // Enriched context — per-subject breakdown, recent test trend, and weak
    // topics with their scores + watched status — so advice is concrete.
    const subjectBreakdown = subjectRadar
      .map(s => `${s.subject}: test ${Math.round(s.test_avg || 0)}%, attendance ${Math.round(s.attendance_pct || 0)}%, videos ${s.video_done || 0}/${s.video_total || 0}`)
      .join(' | ') || 'No subject data';
    const recentTests = testTimeline
      .slice(-5)
      .map(t => `${t.test_title} (${t.subject || ''}) ${Math.round(t.score_pct || 0)}%${t.date ? ` on ${t.date}` : ''}`)
      .join('; ') || 'No recent tests';
    const weakTopicsDetail = weakestTopics
      .slice(0, 5)
      .map(t => `${t.topic} — ${Math.round(t.score || 0)}% — ${t.videoStatus}`)
      .join('; ') || 'None';

    const stats = {
      student_name: student.name || 'Student',
      standard_name: student.standard_name || 'N/A',
      attendance_data: `Attendance is ${Math.round(student.attendance_pct || 0)}%`,
      video_progress_data: `Video completion is ${videoPct}% (${doneVids}/${totalVids} videos)`,
      assignment_data: `Assignment average is ${assignStats.avg_marks_pct}% (submitted ${assignStats.submitted}/${assignStats.total})`,
      test_data: `Test average is ${Math.round(student.avg_score || 0)}%, attempted ${testsAttempted}, missed ${testsMissed}`,
      subject_breakdown: subjectBreakdown,
      recent_tests: recentTests,
      weak_topics_detail: weakTopicsDetail,
    };

    try {
      let acc = '';
      await aiApi.generateInsightsStream(student.id, stats, (chunk) => {
        acc += chunk;
        // First chunk: swap the spinner for live streaming text.
        setSuggestionsLoading(false);
        setIsStreaming(true);
        setSuggestions(acc);
      });
      setSuggestions(acc);
    } catch (e) {
      setSuggestionsError(e.message || 'Failed to generate insights. Is the AI API key configured in Teacher Settings?');
    } finally {
      setSuggestionsLoading(false);
      setIsStreaming(false);
    }
  }, [showSuggestions, suggestions, student, videoPct, doneVids, totalVids, subjectRadar, testTimeline, weakestTopics, testsAttempted, testsMissed, assignStats]);

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
              <div className="flex items-center gap-0.5 p-1">
              </div>
              <button onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-neutral-200 rounded-xl shadow-sm hover:bg-neutral-50 transition-colors">
                {copied ? <CheckCircle2 size={13} className="text-green-600 animate-pulse" /> : <Share2 size={13} />}
                {copied ? 'Copied!' : 'Share'}
              </button>
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
            <div className="glass-panel border-white/60 shadow-sm rounded-2xl p-5 w-full lg:w-[320px] flex-shrink-0 flex flex-col items-center justify-between">
              <p className="text-xs font-semibold text-neutral-500 mb-1">Performance Radar</p>
              <CustomRadarChart data={radarData} />
              <div className="flex items-center gap-4 text-[10px] text-neutral-400 font-medium mt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  You
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border border-dashed border-neutral-400 bg-neutral-100" />
                  Class Avg
                </span>
              </div>
            </div>

            {/* Performance Table */}
            <div className="flex-1 min-w-0 glass-panel border-white/60 shadow-sm rounded-2xl overflow-hidden">
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
                        <td className="px-5 py-2.5 text-xs font-semibold text-neutral-700">{row.fullName}</td>
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

        {/* ── ASSIGNMENT PERFORMANCE ────────────────────────────────────── */}
        {assignStats.total > 0 && (
          <div>
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-3">Assignment Performance</p>

            {/* KPI row */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <KPICard
                icon={ClipboardList}
                color="amber"
                label="Submitted"
                value={`${assignStats.submitted}/${assignStats.total}`}
                sub={`${assignStats.graded} graded`}
              />
              <KPICard
                icon={Target}
                color="blue"
                label="Avg Mark"
                value={`${assignStats.avg_marks_pct}%`}
                sub="of graded"
              />
              <KPICard
                icon={Star}
                color="amber"
                label="Pts Earned"
                value={assignStats.total_points_from_assignments}
                sub="from assignments"
              />
            </div>

            {/* Bar chart of individual assignment scores */}
            {gradedAssignments.length > 0 && (
              <div className="glass-panel border-white/60 shadow-sm rounded-2xl p-5 mb-3">
                <p className="text-xs font-semibold text-neutral-700 mb-4">Assignment Scores</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={gradedAssignments} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="assignment_title"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      tickFormatter={t => t.length > 14 ? t.slice(0, 14) + '…' : t}
                    />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} unit="%" />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 11, padding: '8px 12px' }}
                      formatter={(v, _name, props) => [`${v}/100`, props.payload.subject_name || 'Assignment']}
                      labelFormatter={l => l}
                    />
                    <Bar dataKey="marks_obtained" radius={[4, 4, 0, 0]}>
                      {gradedAssignments.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={entry.marks_obtained >= 60 ? '#f59e0b' : '#ef4444'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-neutral-400 text-center mt-2">
                  Amber ≥ 60% · Red &lt; 60%
                </p>
              </div>
            )}

            {/* Assignment by subject */}
            {subjectRadar.some(s => (s.assignment_total || 0) > 0) && (
              <div className="glass-panel border-white/60 shadow-sm rounded-2xl p-5 mb-3">
                <p className="text-xs font-semibold text-neutral-700 mb-4">Assignments by Subject</p>
                <div className="space-y-3">
                  {subjectRadar.filter(s => (s.assignment_total || 0) > 0).map(s => {
                    const total = s.assignment_total || 0;
                    const submitted = s.assignment_submitted || 0;
                    const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
                    return (
                      <div key={s.subject_id} className="flex items-center gap-3">
                        <span className="text-lg w-6 flex-shrink-0">{s.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-neutral-800 truncate">{s.subject}</span>
                            <span className="text-neutral-500 flex-shrink-0 ml-2">
                              {submitted}/{total}
                              {(s.assignment_avg || 0) > 0 && ` · ${s.assignment_avg}%`}
                            </span>
                          </div>
                          <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Assignment submission heatmap */}
            {assignHeatmapRaw.length > 0 && (() => {
              const { weeks, dateMap, dates } = buildHeatmapWeeks(assignHeatmapRaw);
              const DAY_LABELS = ['S','M','T','W','T','F','S'];
              return (
                <div className="glass-panel border-white/60 shadow-sm rounded-2xl p-5">
                  <p className="text-xs font-semibold text-neutral-700 mb-4">Submission Activity</p>
                  {weeks.length > 0 && (
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
                                <div key={di} title={entry ? `${entry.count} submission${entry.count !== 1 ? 's' : ''}` : day}
                                  className={`w-5 h-5 rounded-sm ${inRange && entry ? 'bg-amber-400' : inRange ? 'bg-neutral-100' : 'opacity-0'}`}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
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
          colorFn={d => d && d.count > 0 ? 'bg-sky-500' : 'bg-neutral-100'}
          labelFn={d => `${d.count} test${d.count !== 1 ? 's' : ''} taken`}
          details={[
            { label: 'Attempted', value: testsAttempted,         color: 'bg-sky-500'     },
            { label: 'Missed',    value: testsMissed,             color: 'bg-rose-500'    },
            { label: 'Available', value: totalTestsAvail || '—', color: 'bg-neutral-300' },
            { label: 'Rate',      value: `${testKpi}%`,           color: 'bg-violet-500'  },
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
          <button onClick={handleAnalyzePerformance}
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
              {suggestionsLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm font-medium text-neutral-500">
                  <Loader2 size={16} className="animate-spin text-amber-500" /> Analyzing performance & generating coaching advice...
                </div>
              ) : suggestionsError ? (
                <div className="p-4 rounded-xl text-sm font-medium bg-red-50 text-red-700 border border-red-100">
                  {suggestionsError}
                </div>
              ) : suggestions ? (
                <div className="p-2 text-neutral-800">
                  {renderMarkdown(suggestions)}
                </div>
              ) : (
                <div className="flex items-center gap-3 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                  <CheckCircle2 size={17} /> No significant issues detected — performance looks great!
                </div>
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
