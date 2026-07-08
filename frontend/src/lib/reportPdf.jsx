import React from 'react';
import { createRoot } from 'react-dom/client';
import html2pdf from 'html2pdf.js';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart, Bar, LineChart, Line, ReferenceLine } from 'recharts';
import QRCode from 'react-qr-code';
import { useSettingsStore, DEFAULT_LMS_LOGO } from '../store';
import { AlertTriangle, Book, Calendar, CheckCircle, Clock, FileText, Target, Trophy, Video, XCircle, Zap, Activity, LayoutGrid, Award, Brain, ClipboardCheck, Layers, ShieldCheck, TrendingUp, ListChecks, Gauge } from 'lucide-react';

// Helpers
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const gradeFor = (score) => {
  const s = Math.round(score || 0);
  if (s >= 90) return { grade: 'A+', color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
  if (s >= 80) return { grade: 'A',  color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
  if (s >= 70) return { grade: 'B+', color: 'text-blue-500', bg: 'bg-blue-500/10' };
  if (s >= 60) return { grade: 'B',  color: 'text-blue-500', bg: 'bg-blue-500/10' };
  if (s >= 50) return { grade: 'C',  color: 'text-amber-500', bg: 'bg-amber-500/10' };
  if (s >= 35) return { grade: 'D',  color: 'text-orange-500', bg: 'bg-orange-500/10' };
  return { grade: 'E', color: 'text-red-500', bg: 'bg-red-500/10' };
};

const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clampPct = (value) => Math.max(0, Math.min(100, safeNumber(value)));

const pctText = (value, fallback = 0) => `${Math.round(clampPct(value ?? fallback))}%`;

const shortText = (value, max = 28, fallback = '-') => {
  const text = String(value || fallback).trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
};

const avgOf = (items) => {
  const values = items.map(v => safeNumber(v, NaN)).filter(Number.isFinite);
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
};

const sumBy = (items, key) => (items || []).reduce((sum, item) => sum + safeNumber(item?.[key]), 0);

const percentOf = (part, total) => {
  const t = safeNumber(total);
  return t > 0 ? (safeNumber(part) / t) * 100 : 0;
};

const weightedHealth = (parts) => {
  const usable = parts.filter(p => p && p.has !== false && Number.isFinite(Number(p.value)) && Number(p.weight) > 0);
  const totalWeight = usable.reduce((sum, p) => sum + p.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(usable.reduce((sum, p) => sum + clampPct(p.value) * p.weight, 0) / totalWeight);
};

const healthLabel = (score) => {
  const s = clampPct(score);
  if (s >= 85) return { title: 'Excellent momentum', text: 'Strong performance across learning signals.', color: '#059669', tone: 'emerald' };
  if (s >= 70) return { title: 'Healthy progress', text: 'Good base with a few clear upgrade areas.', color: '#2563eb', tone: 'blue' };
  if (s >= 50) return { title: 'Needs steady practice', text: 'Focus and consistency can lift the next report quickly.', color: '#d97706', tone: 'amber' };
  return { title: 'Recovery plan needed', text: 'Prioritize attendance, basics, and missed work first.', color: '#dc2626', tone: 'red' };
};

const compareCopy = (studentValue, classValue, unit = '%') => {
  if (classValue === undefined || classValue === null) return 'Class baseline unavailable';
  const diff = Math.round(safeNumber(studentValue) - safeNumber(classValue));
  if (diff === 0) return `Equal to class average (${Math.round(classValue)}${unit})`;
  return `${Math.abs(diff)}${unit} ${diff > 0 ? 'above' : 'below'} class average`;
};

const answerStatus = (question, answers) => {
  const studentAnswer = answers?.[String(question.id)];
  const answered = studentAnswer !== undefined && studentAnswer !== null;
  const isCorrect = answered && studentAnswer === question.correct_idx;
  const isSkipped = !answered;
  return { studentAnswer, answered, isCorrect, isSkipped };
};

const getBranding = () => {
  const s = useSettingsStore.getState();
  return {
    name: (s.lmsName || '').trim() || 'Udaya',
    logoUrl: s.lmsLogo || DEFAULT_LMS_LOGO,
    url: window.location.origin
  };
};

const periodTitle = (p) => p === 'weekly' ? 'Weekly Report' : p === 'monthly' ? 'Monthly Report' : 'Overall Report';
const periodRange = (p) => {
  const today = new Date();
  if (p === 'weekly') { const f = new Date(today); f.setDate(f.getDate() - 7); return `${fmtDate(f)} - ${fmtDate(today)}`; }
  if (p === 'monthly') { const f = new Date(today); f.setDate(f.getDate() - 30); return `${fmtDate(f)} - ${fmtDate(today)}`; }
  return 'All time';
};

const localDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// PDF generation core
async function generatePdf(element, filename) {
  const opt = {
    margin:       [10, 10, 15, 10], // top, left, bottom, right
    filename:     filename,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  {
      scale: 2,
      useCORS: true,
      letterRendering: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 794,
    },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: ['css', 'legacy'] }
  };
  await html2pdf().set(opt).from(element).save();
}

const waitForFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
const waitForMs = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const withTimeout = (promise, ms) => Promise.race([promise, waitForMs(ms)]);

async function waitForAssets(container) {
  if (document.fonts?.ready) {
    await withTimeout(document.fonts.ready.catch(() => {}), 2500);
  }

  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(images.map(async (img) => {
    if (img.complete && img.naturalWidth > 0) return;
    if (img.decode) {
      await withTimeout(img.decode().catch(() => {}), 1800);
      return;
    }
    await withTimeout(new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
    }), 1800);
  }));
}

async function mountAndPrint(Component, props, filename) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '794px',
    minHeight: '1123px',
    background: '#ffffff',
    zIndex: '2147483647',
    pointerEvents: 'none',
  });

  const container = document.createElement('div');
  container.style.width = '794px';
  container.style.background = '#ffffff';
  host.appendChild(container);
  document.body.appendChild(host);

  const root = createRoot(container);

  try {
    root.render(<Component {...props} />);
    await waitForFrame();
    await waitForFrame();
    await waitForAssets(container);
    await waitForMs(250);
    const rect = container.getBoundingClientRect();
    const hasRenderableContent = (container.textContent || '').trim().length > 0 || container.querySelector('svg,img,canvas');
    if (!hasRenderableContent || rect.width < 100 || rect.height < 100) {
      throw new Error('PDF content did not render before capture.');
    }
    await generatePdf(container, filename);
  } finally {
    root.unmount();
    if (host.parentNode) host.parentNode.removeChild(host);
  }
}


// Shared UI components
const Header = ({ title, subtitle, student, brand, rightStats }) => (
  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 p-8 text-white shadow-xl" style={{ pageBreakInside: 'avoid' }}>
    <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
    <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-indigo-400/20 blur-3xl" />
    
    <div className="relative z-10 flex items-start justify-between">
      <div className="flex gap-6">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow-inner backdrop-blur-sm p-1">
          {student?.avatar_url ? (
            <img src={student.avatar_url} alt="Profile" className="h-full w-full rounded-lg object-cover" crossOrigin="anonymous" />
          ) : (
            <span className="text-4xl font-bold text-white shadow-sm">
              {(student?.name || 'S').charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            {brand.logoUrl && <img src={brand.logoUrl} alt="Logo" className="h-6 w-6 rounded bg-white p-0.5" crossOrigin="anonymous" />}
            <span className="text-xs font-semibold tracking-wider text-indigo-100 uppercase">{brand.name}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">{student?.name || 'Student'}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-indigo-100/90">
            {student?.student_code && <span>{student.student_code}</span>}
            {student?.standard_name && <span>- {student.standard_name}</span>}
            {student?.username && <span>- @{student.username}</span>}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
              {title}
            </div>
            <span className="text-xs text-indigo-200">{subtitle}</span>
          </div>
        </div>
      </div>

      {rightStats && (
        <div className="flex flex-col items-end gap-3">
          {rightStats.map((stat, i) => (
            <div key={i} className="flex flex-col items-end rounded-xl bg-white/10 px-4 py-2 text-right backdrop-blur-md">
              <span className="text-xs font-medium text-indigo-200">{stat.label}</span>
              <span className="text-lg font-bold text-white">{stat.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

const Section = ({ title, icon: Icon, color, children, className = '', avoidBreak = true }) => (
  <div className={`mt-10 ${className}`} style={avoidBreak ? { pageBreakInside: 'avoid' } : undefined}>
    <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-3">
      <div className={`rounded-lg p-2 ${color.bg}`}>
        <Icon className={`h-5 w-5 ${color.text}`} strokeWidth={2.5} />
      </div>
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
    </div>
    {children}
  </div>
);

const KpiCard = ({ icon: Icon, label, value, color }) => (
  <div className="flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm" style={{ pageBreakInside: 'avoid' }}>
    <div className="mb-3 flex items-center gap-3">
      <div className={`rounded-lg p-2 ${color.bg}`}>
        <Icon className={`h-4 w-4 ${color.text}`} strokeWidth={2.5} />
      </div>
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
    </div>
    <span className="text-2xl font-bold text-gray-900">{value}</span>
  </div>
);

const ProgressBar = ({ label, value, max = 100, color, valueText }) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100)) || 0;
  return (
    <div className="flex items-center gap-4" style={{ pageBreakInside: 'avoid' }}>
      <span className="w-32 text-sm font-semibold text-gray-700 truncate">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full ${color.fill} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-sm font-bold text-gray-900">{valueText || `${Math.round(pct)}%`}</span>
    </div>
  );
};

const ScoreRing = ({ value, label, sublabel, color = '#4f46e5', size = 136 }) => {
  const pct = clampPct(value);
  const radius = 46;
  const stroke = 12;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  return (
    <div className="flex flex-col items-center justify-center text-center" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black tracking-tight text-gray-950">{Math.round(pct)}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">/ 100</span>
        </div>
      </div>
      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-700">{label}</p>
      {sublabel && <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{sublabel}</p>}
    </div>
  );
};

const InsightCard = ({ icon: Icon, title, body, tone = 'blue' }) => {
  const tones = {
    blue: 'border-blue-100 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    red: 'border-red-100 bg-red-50 text-red-700',
    violet: 'border-violet-100 bg-violet-50 text-violet-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.blue}`} style={{ pageBreakInside: 'avoid' }}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <p className="text-xs leading-relaxed text-gray-600">{body}</p>
    </div>
  );
};

const BenchmarkBar = ({ label, value, compare, valueLabel = 'Student', compareLabel = 'Class', color = 'bg-indigo-500' }) => (
  <div className="space-y-2" style={{ pageBreakInside: 'avoid' }}>
    <div className="flex items-center justify-between text-xs font-bold text-gray-700">
      <span>{label}</span>
      <span>{Math.round(safeNumber(value))}{label === 'Points' ? '' : '%'}</span>
    </div>
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-16 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{valueLabel}</span>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${label === 'Points' ? Math.min(100, percentOf(value, Math.max(value, compare || 0, 1))) : clampPct(value)}%` }} />
        </div>
      </div>
      {compare !== undefined && compare !== null && (
        <div className="flex items-center gap-2">
          <span className="w-16 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{compareLabel}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-gray-400" style={{ width: `${label === 'Points' ? Math.min(100, percentOf(compare, Math.max(value, compare, 1))) : clampPct(compare)}%` }} />
          </div>
        </div>
      )}
    </div>
  </div>
);

const ActivitySquares = ({ rows, valueKey = 'count', color = 'bg-indigo-500', empty = 'bg-gray-100', label }) => {
  const slice = [...(rows || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).slice(-28);
  if (!slice.length) return null;
  const max = Math.max(1, ...slice.map(row => safeNumber(row?.[valueKey])));
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm" style={{ pageBreakInside: 'avoid' }}>
      {label && <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>}
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
        {slice.map((row, index) => {
          const value = safeNumber(row?.[valueKey]);
          const strength = value <= 0 ? 0 : Math.max(30, Math.round((value / max) * 100));
          return (
            <div
              key={`${row.date || index}-${index}`}
              className={`h-4 w-4 rounded-sm border border-black/5 ${value > 0 ? color : empty}`}
              style={value > 0 ? { opacity: strength / 100 } : undefined}
              title={`${row.date || ''}: ${value}`}
            />
          );
        })}
      </div>
    </div>
  );
};

const EmptyState = ({ title, body }) => (
  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-center" style={{ pageBreakInside: 'avoid' }}>
    <p className="text-sm font-bold text-gray-800">{title}</p>
    <p className="mt-1 text-xs leading-relaxed text-gray-500">{body}</p>
  </div>
);

// Realistic GitHub-style calendar heatmap
const CalendarHeatmap = ({ heatmapData }) => {
  if (!heatmapData || heatmapData.length === 0) return null;
  
  // Sort data and slice last 12 weeks (84 days) for a neat 12-column grid
  const sorted = [...heatmapData].sort((a,b) => new Date(a.date) - new Date(b.date)).slice(-84);
  
  // Pad the beginning so it aligns with the correct day of week (0=Sun, 6=Sat)
  const firstDate = new Date(sorted[0].date);
  const startDayOfWeek = firstDate.getDay(); 
  
  const paddedGrid = Array(startDayOfWeek).fill(null).concat(sorted);
  
  // Create columns of 7 days
  const columns = [];
  for (let i = 0; i < paddedGrid.length; i += 7) {
    columns.push(paddedGrid.slice(i, i + 7));
  }

  const daysOfWeek = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {/* Y-Axis Labels */}
        <div className="flex flex-col gap-1 pr-2 pt-5">
          {daysOfWeek.map((d, i) => (
            <div key={i} className="h-4 text-[10px] font-medium text-gray-400 flex items-center justify-end">{i % 2 === 1 ? d : ''}</div>
          ))}
        </div>
        
        {/* Grid */}
        <div className="flex gap-1 overflow-hidden">
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-1">
              {/* Month label approximation above the column */}
              <div className="h-4 text-[10px] font-medium text-gray-500">
                {col[0] && new Date(col[0].date).getDate() <= 7 
                  ? new Date(col[0].date).toLocaleString('default', { month: 'short' }) 
                  : ''}
              </div>
              {col.map((d, rowIdx) => {
                if (!d) return <div key={rowIdx} className="h-4 w-4 rounded-sm bg-transparent" />;
                const bg = (d.present > 0) ? 'bg-emerald-500' : (d.late > 0) ? 'bg-amber-400' : (d.total > 0) ? 'bg-red-400' : 'bg-gray-100';
                return <div key={rowIdx} className={`h-4 w-4 rounded-sm ${bg} shadow-sm border border-black/5`} />;
              })}
            </div>
          ))}
        </div>
      </div>
      
      {/* Legend */}
      <div className="mt-2 flex gap-4 text-xs font-medium text-gray-500">
        <span className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-sm bg-gray-100 border border-black/5" /> No Class</span>
        <span className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-sm bg-emerald-500 border border-black/5" /> Present</span>
        <span className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-sm bg-amber-400 border border-black/5" /> Late</span>
        <span className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-sm bg-red-400 border border-black/5" /> Absent</span>
      </div>
    </div>
  );
};


// Report 1: student overall report
const StudentReportTemplate = ({ data, period }) => {
  const s = data.student || {};
  const brand = getBranding();

  const radar = data.subject_radar || [];
  const timeline = data.test_timeline || [];
  const topicMap = data.topic_map || [];
  const heatmap = data.attendance_heatmap || [];
  const videoHeatmap = data.video_heatmap || [];
  const testHeatmap = data.test_heatmap || [];
  const assignmentHeatmap = data.assignment_heatmap || [];
  const assignmentStats = data.assignment_stats || {};
  const liveStats = data.live_classes_stats || {};
  const classAvg = data.class_averages || {};

  const periodScores = timeline.map(t => safeNumber(t.score_pct, NaN)).filter(Number.isFinite);
  const avgForPeriod = period === 'overall'
    ? safeNumber(s.avg_score, avgOf(periodScores))
    : (periodScores.length ? avgOf(periodScores) : safeNumber(s.avg_score));
  const scoreValue = clampPct(avgForPeriod);
  const attendanceValue = clampPct(s.attendance_pct);
  const grade = gradeFor(scoreValue);
  const rankLabel = data.rank && data.total_students ? `${data.rank} / ${data.total_students}` : '-';
  const periodPoints = data.period_points ?? s.points ?? 0;

  const assignmentCompletion = percentOf(assignmentStats.submitted, assignmentStats.total);
  const assignmentSignal = assignmentStats.total ? assignmentCompletion : safeNumber(assignmentStats.avg_marks_pct, NaN);
  const topicMastery = data.topic_mastery_pct ?? percentOf(topicMap.filter(t => safeNumber(t.score_pct) >= 60).length, topicMap.length);
  const videoCompletion = avgOf(radar.filter(r => safeNumber(r.video_total) > 0).map(r => r.video_pct));
  const liveAttendance = safeNumber(liveStats.attendance_pct, NaN);
  const testParticipation = data.total_tests_in_standard ? percentOf(timeline.length, data.total_tests_in_standard) : NaN;

  const health = weightedHealth([
    { value: scoreValue, weight: 0.36, has: periodScores.length || s.avg_score !== undefined },
    { value: attendanceValue, weight: 0.18, has: s.attendance_pct !== undefined },
    { value: topicMastery, weight: 0.14, has: topicMap.length > 0 },
    { value: assignmentSignal, weight: 0.12, has: assignmentStats.total > 0 || Number.isFinite(assignmentSignal) },
    { value: videoCompletion, weight: 0.10, has: radar.some(r => safeNumber(r.video_total) > 0) },
    { value: liveAttendance, weight: 0.06, has: Number.isFinite(liveAttendance) && safeNumber(liveStats.total) > 0 },
    { value: testParticipation, weight: 0.04, has: Number.isFinite(testParticipation) },
  ]);
  const healthMeta = healthLabel(health);

  const totalVideoMinutes = Math.round(sumBy(videoHeatmap, 'minutes'));
  const videoSessions = sumBy(videoHeatmap, 'count');
  const submittedAssignments = safeNumber(assignmentStats.submitted);
  const totalAssignments = safeNumber(assignmentStats.total);
  const pendingAssignments = Math.max(0, totalAssignments - submittedAssignments);
  const liveLabel = liveStats.total ? `${liveStats.attended || 0}/${liveStats.total}` : '-';

  // Prepare chart data
  const chartData = [...timeline]
    .sort((a,b) => new Date(a.date) - new Date(b.date))
    .slice(-10)
    .map((t, index) => ({
      name: shortText(t.test_title, 12, `T${index + 1}`),
      score: Math.round(clampPct(t.score_pct)),
      classScore: Math.round(clampPct(t.class_avg_score_pct ?? classAvg.avg_score ?? scoreValue)),
    }));

  const subjectRows = [...radar].sort((a, b) => safeNumber(b.test_avg) - safeNumber(a.test_avg));
  const strongestSubject = subjectRows.find(r => safeNumber(r.test_count) > 0);
  const weakestSubject = [...radar]
    .filter(r => safeNumber(r.test_count) > 0)
    .sort((a, b) => safeNumber(a.test_avg) - safeNumber(b.test_avg))[0];
  const weakTopics = [...topicMap]
    .filter(t => safeNumber(t.score_pct) < 60 || !t.video_completed)
    .sort((a, b) => safeNumber(a.score_pct) - safeNumber(b.score_pct));
  const priorityTopics = weakTopics.length ? weakTopics : [...topicMap].sort((a, b) => safeNumber(a.score_pct) - safeNumber(b.score_pct));
  const recentDelta = chartData.length >= 2 ? chartData[chartData.length - 1].score - chartData[0].score : null;

  const insights = [
    {
      icon: TrendingUp,
      title: 'Score direction',
      body: recentDelta === null
        ? compareCopy(scoreValue, classAvg.avg_score)
        : `${recentDelta >= 0 ? '+' : ''}${recentDelta}% across recent tests. ${compareCopy(scoreValue, classAvg.avg_score)}`,
      tone: recentDelta === null ? 'blue' : recentDelta >= 0 ? 'emerald' : 'amber',
    },
    {
      icon: Gauge,
      title: 'Learning balance',
      body: `Attendance ${pctText(attendanceValue)}, topic mastery ${pctText(topicMastery)}, video completion ${pctText(videoCompletion)}.`,
      tone: health >= 70 ? 'emerald' : health >= 50 ? 'amber' : 'red',
    },
    {
      icon: ClipboardCheck,
      title: 'Work completion',
      body: totalAssignments
        ? `${submittedAssignments}/${totalAssignments} assignments submitted with ${pctText(assignmentStats.avg_marks_pct)} average marks.`
        : `${timeline.length} tests, ${totalVideoMinutes} video minutes, ${liveStats.attended || 0} live classes tracked.`,
      tone: !totalAssignments || assignmentCompletion >= 75 ? 'violet' : 'amber',
    },
  ];

  const actionPlan = [
    attendanceValue < 75 ? `Attendance reset: attend the next 3 scheduled classes and keep the weekly attendance above 80%.` : null,
    weakestSubject ? `Subject focus: improve ${weakestSubject.subject} from ${pctText(weakestSubject.test_avg)} to the next 10% band.` : null,
    weakTopics[0] ? `Revision target: redo ${weakTopics[0].topic || weakTopics[0].test_title || 'the weakest topic'} and finish the linked video before the next test.` : null,
    pendingAssignments > 0 ? `Assignment catch-up: submit ${pendingAssignments} pending assignment${pendingAssignments > 1 ? 's' : ''} before taking another mock test.` : null,
    videoCompletion < 70 && radar.some(r => safeNumber(r.video_total) > 0) ? `Video practice: complete unfinished concept videos in the lowest scoring subject.` : null,
    !timeline.length ? `Start with the first available exam so the LMS can build a stronger performance baseline.` : null,
  ].filter(Boolean).slice(0, 5);
  if (!actionPlan.length) {
    actionPlan.push('Maintain the current rhythm: one revision block, one practice test, and one assignment review each week.');
  }

  const videosCompleted = sumBy(radar, 'video_done');
  const videosAvailable = sumBy(radar, 'video_total');
  const videoSignalPct = videosAvailable ? percentOf(videosCompleted, videosAvailable) : clampPct(totalVideoMinutes / 3);
  const testSignalPct = Number.isFinite(testParticipation) ? testParticipation : (timeline.length ? 100 : 0);
  const assignmentSignalPct = totalAssignments ? assignmentCompletion : (submittedAssignments ? 100 : 0);
  const liveSignalPct = safeNumber(liveStats.total) ? percentOf(liveStats.attended, liveStats.total) : (safeNumber(liveStats.attended) ? 100 : 0);
  const signalRows = [
    {
      label: 'Concept videos',
      value: videoSignalPct,
      display: videosAvailable ? `${videosCompleted}/${videosAvailable}` : `${totalVideoMinutes} min`,
      note: `${totalVideoMinutes} watched minutes across ${videoSessions} session${videoSessions === 1 ? '' : 's'}`,
      color: { fill: 'bg-blue-500' },
    },
    {
      label: 'Tests attempted',
      value: testSignalPct,
      display: data.total_tests_in_standard ? `${timeline.length}/${data.total_tests_in_standard}` : `${timeline.length}`,
      note: data.total_tests_in_standard ? 'Attempt rate from available exams' : 'Completed exam attempts in this period',
      color: { fill: 'bg-violet-500' },
    },
    {
      label: 'Assignments',
      value: assignmentSignalPct,
      display: totalAssignments ? `${submittedAssignments}/${totalAssignments}` : `${submittedAssignments}`,
      note: `${pendingAssignments} pending assignment${pendingAssignments === 1 ? '' : 's'}`,
      color: { fill: 'bg-amber-500' },
    },
    {
      label: 'Live classes',
      value: liveSignalPct,
      display: liveLabel,
      note: safeNumber(liveStats.total) ? 'Scheduled live sessions attended' : 'No scheduled baseline yet',
      color: { fill: 'bg-emerald-500' },
    },
  ];
  const videoByDate = Object.fromEntries(videoHeatmap.map((r) => [String(r.date || '').slice(0, 10), safeNumber(r.minutes)]));
  const testByDate = Object.fromEntries(testHeatmap.map((r) => [String(r.date || '').slice(0, 10), safeNumber(r.count)]));
  const assignmentByDate = Object.fromEntries(assignmentHeatmap.map((r) => [String(r.date || '').slice(0, 10), safeNumber(r.count)]));
  const sourceRhythmDates = [...new Set([
    ...Object.keys(videoByDate),
    ...Object.keys(testByDate),
    ...Object.keys(assignmentByDate),
  ])].sort();
  const endRhythmDate = sourceRhythmDates.length
    ? new Date(`${sourceRhythmDates[sourceRhythmDates.length - 1]}T00:00:00`)
    : null;
  const rhythmDates = endRhythmDate
    ? Array.from({ length: 7 }, (_, index) => {
        const d = new Date(endRhythmDate);
        d.setDate(d.getDate() - (6 - index));
        return localDateKey(d);
      })
    : [];
  const rhythmRows = rhythmDates.map((date) => {
    const videoMinutes = safeNumber(videoByDate[date]);
    const tests = safeNumber(testByDate[date]);
    const assignments = safeNumber(assignmentByDate[date]);
    const score = Math.min(100, Math.round(
      Math.min(videoMinutes / 45, 1) * 40 +
      Math.min(tests / 2, 1) * 35 +
      Math.min(assignments / 2, 1) * 25
    ));
    const parsed = new Date(`${date}T00:00:00`);
    return {
      date,
      day: Number.isNaN(parsed.getTime()) ? date.slice(5) : parsed.toLocaleDateString('en-IN', { weekday: 'short' }),
      detail: Number.isNaN(parsed.getTime()) ? date.slice(5) : parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      videoMinutes: Math.round(videoMinutes),
      tests,
      assignments,
      score,
    };
  });

  return (
    <div className="bg-white p-8 font-sans text-gray-900 mx-auto w-[794px] box-border">
      <Header 
        title={`Student Growth ${periodTitle(period)}`}
        subtitle={periodRange(period)}
        student={s}
        brand={brand}
        rightStats={[
          { label: 'Health', value: `${health}/100` },
          { label: 'Grade', value: grade.grade },
          ...(data.rank ? [{ label: 'Class Rank', value: rankLabel }] : [])
        ]}
      />

      <div className="mt-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex gap-7">
          <ScoreRing value={health} label="Learning Health" sublabel={healthMeta.title} color={healthMeta.color} />
          <div className="flex-1">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-500">Learning Passport</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-gray-950">{healthMeta.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-gray-500">{healthMeta.text}</p>
              </div>
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Period Points</p>
                <p className="text-2xl font-black text-gray-950">{periodPoints}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {insights.map((item, i) => <InsightCard key={i} {...item} />)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-4 gap-4">
        <KpiCard icon={Target} label="Avg Score" value={`${Math.round(avgForPeriod ?? s.avg_score ?? 0)}%`} color={{ bg: 'bg-indigo-100', text: 'text-indigo-600' }} />
        <KpiCard icon={Calendar} label="Attendance" value={`${Math.round(s.attendance_pct ?? 0)}%`} color={{ bg: 'bg-teal-100', text: 'text-teal-600' }} />
        <KpiCard icon={Trophy} label="Rank" value={rankLabel} color={{ bg: 'bg-amber-100', text: 'text-amber-600' }} />
        <KpiCard icon={Video} label="Tests Taken" value={data.total_tests_in_standard ? `${timeline.length}/${data.total_tests_in_standard}` : timeline.length} color={{ bg: 'bg-rose-100', text: 'text-rose-600' }} />
        <KpiCard icon={ClipboardCheck} label="Assignments" value={totalAssignments ? `${submittedAssignments}/${totalAssignments}` : '-'} color={{ bg: 'bg-blue-100', text: 'text-blue-600' }} />
        <KpiCard icon={Book} label="Topic Mastery" value={topicMap.length ? pctText(topicMastery) : '-'} color={{ bg: 'bg-violet-100', text: 'text-violet-600' }} />
        <KpiCard icon={Clock} label="Video Time" value={totalVideoMinutes ? `${totalVideoMinutes}m` : '-'} color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }} />
        <KpiCard icon={Zap} label="Live Classes" value={liveLabel} color={{ bg: 'bg-fuchsia-100', text: 'text-fuchsia-600' }} />
      </div>

      <Section title="Class Benchmark" icon={Award} color={{ bg: 'bg-slate-100', text: 'text-slate-700' }}>
        <div className="grid grid-cols-2 gap-6 rounded-2xl border border-gray-100 bg-gray-50/40 p-6">
          <div className="space-y-5">
            <BenchmarkBar label="Score" value={scoreValue} compare={classAvg.avg_score} color="bg-indigo-500" />
            <BenchmarkBar label="Attendance" value={attendanceValue} compare={classAvg.attendance_pct} color="bg-teal-500" />
            <BenchmarkBar label="Points" value={periodPoints} compare={classAvg.points} color="bg-amber-500" />
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Benchmark Reading</p>
            <p className="mt-3 text-sm leading-7 text-gray-600">
              Score is {compareCopy(scoreValue, classAvg.avg_score)}. Attendance is {compareCopy(attendanceValue, classAvg.attendance_pct)}.
              {data.rank && data.total_students ? ` Current points rank is ${data.rank} out of ${data.total_students} students.` : ' Rank will appear once class points are available.'}
            </p>
          </div>
        </div>
      </Section>

      {chartData.length >= 2 && (
        <Section title="Score Trend vs Class" icon={Activity} color={{ bg: 'bg-blue-100', text: 'text-blue-600' }}>
          <div className="h-64 w-full rounded-xl border border-gray-100 bg-gray-50/50 p-4 pt-6">
            <LineChart width={710} height={205} data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} domain={[0, 100]} />
              <ReferenceLine y={35} stroke="#f59e0b" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="classScore" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, fill: '#4f46e5' }} isAnimationActive={false} />
            </LineChart>
            <div className="mt-1 flex justify-end gap-5 text-[11px] font-semibold text-gray-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-indigo-600" /> Student</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-slate-400" /> Class avg</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-amber-400" /> Pass line</span>
            </div>
          </div>
        </Section>
      )}

      {radar.length > 0 && (
        <Section title="Subject Mastery X-Ray" icon={Book} color={{ bg: 'bg-violet-100', text: 'text-violet-600' }}>
          <div className="flex gap-8 items-center rounded-xl border border-gray-100 bg-gray-50/30 p-6">
            <div className="flex-1 flex justify-center">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" width={300} height={250} data={radar}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#4b5563', fontSize: 10, fontWeight: 600 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Performance" dataKey="test_avg" stroke="#8b5cf6" strokeWidth={2} fill="#8b5cf6" fillOpacity={0.4} isAnimationActive={false} />
              </RadarChart>
            </div>
            <div className="flex-1 flex flex-col gap-4 pr-6">
              <h3 className="text-sm font-bold text-gray-800 border-b border-gray-200 pb-2">Score Distribution</h3>
              {subjectRows.slice(0, 6).map(r => (
                <ProgressBar key={r.subject_id || r.subject} label={r.subject} value={r.test_avg} color={{ fill: 'bg-violet-500' }} />
              ))}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            {subjectRows.slice(0, 6).map(r => {
              const assignPct = r.assignment_total ? percentOf(r.assignment_submitted, r.assignment_total) : null;
              return (
                <div key={`sub-${r.subject_id || r.subject}`} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm" style={{ pageBreakInside: 'avoid' }}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-black text-gray-900">{r.subject || 'Subject'}</h3>
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">{pctText(r.test_avg)}</span>
                  </div>
                  <div className="space-y-2">
                    <ProgressBar label="Tests" value={r.test_avg} color={{ fill: 'bg-violet-500' }} />
                    <ProgressBar label="Attendance" value={r.attendance_pct} color={{ fill: 'bg-teal-500' }} />
                    <ProgressBar label="Videos" value={r.video_pct} color={{ fill: 'bg-blue-500' }} />
                    {assignPct !== null && <ProgressBar label="Assignments" value={assignPct} color={{ fill: 'bg-amber-500' }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Learning Signals & Study Rhythm" icon={Gauge} color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }}>
        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-sm font-black text-gray-900">Evidence Balance</h3>
              <p className="mt-1 text-xs leading-5 text-gray-500">Progress is shown by its own unit, not by mixing minutes with counts.</p>
            </div>
            <div className="space-y-4">
              {signalRows.map((row) => (
                <div key={row.label}>
                  <ProgressBar label={row.label} value={row.value} color={row.color} valueText={row.display} />
                  <p className="ml-36 mt-1 text-[11px] leading-4 text-gray-500">{row.note}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h3 className="text-sm font-black text-gray-900">7-Day Study Rhythm</h3>
              <p className="mt-1 text-xs leading-5 text-gray-500">Activity score combines video, test, and assignment evidence as a consistency indicator.</p>
            </div>
            {rhythmRows.length > 0 ? (
              <div>
                <div className="flex items-end gap-2">
                  {rhythmRows.map((row) => (
                    <div key={row.date} className="flex-1 text-center">
                      <div className="flex h-28 items-end justify-center rounded-lg bg-gray-50 px-1 py-2">
                        <div
                          className="w-full rounded-t-md bg-gradient-to-t from-blue-600 to-cyan-400"
                          style={{ height: `${Math.max(8, row.score)}%` }}
                        />
                      </div>
                      <p className="mt-2 text-[11px] font-black text-gray-800">{row.day}</p>
                      <p className="text-[10px] font-bold text-gray-400">{row.score}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-semibold text-gray-600">
                  {rhythmRows.slice(-2).map((row) => (
                    <div key={`rhythm-${row.date}`} className="rounded-lg bg-gray-50 p-2">
                      <p className="font-black text-gray-800">{row.detail}</p>
                      <p>{row.videoMinutes}m video - {row.tests} tests - {row.assignments} assignments</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState title="Study rhythm not available" body="Once videos, tests, and assignments are recorded, this area becomes a consistency map." />
            )}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-4">
          {testHeatmap.length > 0 && <ActivitySquares rows={testHeatmap} valueKey="count" color="bg-violet-500" label="Test activity, last 28 days" />}
          {videoHeatmap.length > 0 && <ActivitySquares rows={videoHeatmap} valueKey="minutes" color="bg-blue-500" label="Video minutes, last 28 days" />}
          {assignmentHeatmap.length > 0 && <ActivitySquares rows={assignmentHeatmap} valueKey="count" color="bg-amber-500" label="Assignments, last 28 days" />}
          {!testHeatmap.length && !videoHeatmap.length && !assignmentHeatmap.length && (
            <EmptyState title="Activity rhythm not available" body="Once videos, tests, and assignments are recorded, this area becomes a habit map." />
          )}
        </div>
      </Section>

      {heatmap.length > 0 && (
        <Section title="Attendance Calendar" icon={Calendar} color={{ bg: 'bg-teal-100', text: 'text-teal-600' }}>
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm flex justify-center">
            <CalendarHeatmap heatmapData={heatmap} />
          </div>
        </Section>
      )}

      <Section title="Next Action Plan" icon={ListChecks} color={{ bg: 'bg-amber-100', text: 'text-amber-600' }}>
        <div className="grid grid-cols-2 gap-5 rounded-2xl border border-gray-100 bg-gray-50/40 p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Priority</p>
            <h3 className="mt-1 text-xl font-black text-gray-950">{weakestSubject ? weakestSubject.subject : strongestSubject?.subject || 'Learning consistency'}</h3>
            <p className="mt-2 text-sm leading-7 text-gray-600">
              {weakestSubject
                ? `${weakestSubject.subject} is the fastest improvement opportunity at ${pctText(weakestSubject.test_avg)}. Pair revision with the linked videos and one practice attempt.`
                : `No weak subject pattern is visible yet. Continue building data through regular tests and video completion.`}
            </p>
          </div>
          <div className="space-y-3">
            {actionPlan.map((step, i) => (
              <div key={i} className="flex gap-3 rounded-xl bg-white p-3 shadow-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-black text-amber-700">{i + 1}</span>
                <p className="text-sm leading-6 text-gray-700">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {topicMap.length > 0 && (
        <Section title="Topic Mastery Map" icon={Zap} color={{ bg: 'bg-fuchsia-100', text: 'text-fuchsia-600' }} avoidBreak={false}>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Priority Topic</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3 text-center">Mastery</th>
                  <th className="px-4 py-3 text-center">Video Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {priorityTopics.map((t, i) => {
                  const mastery = t.score_pct || 0;
                  const mColor = mastery >= 75 ? 'text-emerald-600 bg-emerald-50' : mastery >= 50 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
                  return (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} style={{ pageBreakInside: 'avoid' }}>
                      <td className="px-4 py-3 font-medium">{t.topic || 'Concept'}</td>
                      <td className="px-4 py-3 text-gray-500">{t.subject}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${mColor}`}>
                          {Math.round(mastery)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {t.video_completed 
                          ? <span className="inline-flex items-center text-emerald-600"><CheckCircle className="mr-1 h-4 w-4" /> Watched</span>
                          : <span className="inline-flex items-center text-gray-400"><XCircle className="mr-1 h-4 w-4" /> Unwatched</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {timeline.length > 0 && (
        <Section title="Exam History" icon={FileText} color={{ bg: 'bg-amber-100', text: 'text-amber-600' }} avoidBreak={false}>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Exam Name</th>
                  <th className="px-4 py-3 text-center">Score</th>
                  <th className="px-4 py-3 text-center">Class Avg</th>
                  <th className="px-4 py-3 text-center">Rank</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...timeline].sort((a,b) => new Date(b.date) - new Date(a.date)).map((t, i) => (
                  <tr key={i} className="bg-white" style={{ pageBreakInside: 'avoid' }}>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(t.date)}</td>
                    <td className="px-4 py-3 font-medium">{t.test_title}</td>
                    <td className="px-4 py-3 text-center font-bold text-gray-900">{Math.round(t.score_pct)}%</td>
                    <td className="px-4 py-3 text-center text-gray-500">{t.class_avg_score_pct !== undefined ? `${Math.round(t.class_avg_score_pct)}%` : '-'}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{t.rank ? `${t.rank}/${t.total_attempts}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Footer */}
      <div className="mt-12 border-t border-gray-100 pt-8 pb-4 flex items-center justify-between" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-gray-800">{brand.name} Learning Management System</span>
          <span className="text-xs text-gray-400 font-medium tracking-wide">Report generated securely on {fmtDate(new Date().toISOString())}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-[10px] text-gray-400 uppercase tracking-widest">
            <p>Scan to Verify</p>
            <p>Authenticity</p>
          </div>
          <div className="p-1 bg-white border border-gray-200 rounded-lg shadow-sm">
            <QRCode value={`${brand.url}/verify/${s.id || 'student'}`} size={48} level="L" />
          </div>
        </div>
      </div>
    </div>
  );
};

// Report 2: exam result sheet
const ExamResultTemplate = ({ reviewData, result, student, testMeta }) => {
  const brand = getBranding();
  const score_pct = result.percentage ?? (result.total_marks ? (result.score/result.total_marks)*100 : 0);
  const grade = gradeFor(score_pct);
  const qs = reviewData?.questions || [];
  const ans = reviewData?.answers || {};

  const skippedCount = (result.total || qs.length || 0) - (result.correct_count || 0) - (result.wrong_count || 0);

  const pieData = [
    { name: 'Correct', value: result.correct_count || 0, color: '#10b981' },
    { name: 'Wrong', value: result.wrong_count || 0, color: '#ef4444' },
    { name: 'Skipped', value: skippedCount > 0 ? skippedCount : 0, color: '#9ca3af' }
  ].filter(d => d.value > 0);

  return (
    <div className="bg-white p-8 font-sans text-gray-900 mx-auto w-[794px] box-border">
      <Header 
        title={testMeta?.title || result.testTitle || 'Exam'}
        subtitle={testMeta?.subject_name || 'Subject'}
        student={student}
        brand={brand}
        rightStats={[
          { label: 'Score', value: `${Math.round(score_pct)}%` },
          { label: 'Grade', value: grade.grade },
        ]}
      />

      {(result.flagged || result.cancelled) && (
        <div className="mt-8 flex items-start gap-4 rounded-xl border border-red-200 bg-red-50 p-5" style={{ pageBreakInside: 'avoid' }}>
          <AlertTriangle className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-red-900">{result.cancelled ? 'Exam Terminated' : 'Integrity Alert'}</h3>
            <p className="mt-1 text-sm text-red-700">
              {result.cancelled 
                ? 'This exam was terminated due to a security violation. Score recorded as 0.' 
                : 'Suspicious activity was detected during this exam. Results flagged for review.'}
            </p>
          </div>
        </div>
      )}

      {/* Visual Analytics Row */}
      <div className="mt-8 grid grid-cols-2 gap-6" style={{ pageBreakInside: 'avoid' }}>
        {/* Accuracy Donut Chart */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm flex items-center justify-between">
          <div className="relative flex items-center justify-center h-[160px] w-[160px]">
            <PieChart width={160} height={160}>
              <Pie data={pieData} innerRadius={55} outerRadius={75} paddingAngle={3} dataKey="value" stroke="none" isAnimationActive={false}>
                {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
              </Pie>
            </PieChart>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-gray-900">{Math.round(score_pct)}%</span>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {pieData.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-sm font-medium text-gray-600 w-16">{d.name}</span>
                <span className="text-sm font-bold text-gray-900">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bubble Sheet Matrix */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm overflow-hidden flex flex-col">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-indigo-500" /> Answer Matrix
          </h3>
          <div className="flex flex-wrap gap-1.5 content-start h-full">
            {qs.map((q, i) => {
              const sAns = ans[String(q.id)];
              const answered = sAns !== undefined && sAns !== null;
              const isCorrect = answered && sAns === q.correct_idx;
              const isSkipped = !answered;
              const bg = isCorrect ? 'bg-emerald-500' : isSkipped ? 'bg-gray-300' : 'bg-red-500';
              return (
                <div key={i} className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm ${bg}`}>
                  {i + 1}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Section title="Detailed Question Review" icon={FileText} color={{ bg: 'bg-indigo-100', text: 'text-indigo-600' }}>
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="w-12 px-4 py-3 text-center">#</th>
                <th className="px-4 py-3">Question</th>
                <th className="px-4 py-3">Your Answer</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {qs.map((q, i) => {
                const sAns = ans[String(q.id)];
                const answered = sAns !== undefined && sAns !== null;
                const isCorrect = answered && sAns === q.correct_idx;
                const isSkipped = !answered;
                return (
                  <tr key={i} className={!isCorrect && !isSkipped ? 'bg-red-50/50' : 'bg-white'} style={{ pageBreakInside: 'avoid' }}>
                    <td className="px-4 py-3 text-center text-gray-500 font-medium">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 line-clamp-2">{q.question}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {isSkipped ? <span className="italic text-gray-400">Skipped</span> : q.options[sAns]}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isCorrect ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">Correct</span>
                      ) : isSkipped ? (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-600">Skipped</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">Wrong</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      
      {/* Footer */}
      <div className="mt-12 border-t border-gray-100 pt-8 pb-4 flex items-center justify-between" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-gray-800">{brand.name} Learning Management System</span>
          <span className="text-xs text-gray-400 font-medium tracking-wide">Result generated securely on {fmtDate(new Date().toISOString())}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-[10px] text-gray-400 uppercase tracking-widest">
            <p>Scan to Verify</p>
            <p>Authenticity</p>
          </div>
          <div className="p-1 bg-white border border-gray-200 rounded-lg shadow-sm">
            <QRCode value={`${brand.url}/verify/exam/${result.id || 'exam'}`} size={48} level="L" />
          </div>
        </div>
      </div>
    </div>
  );
};

const ExamResultTemplateV2 = ({ reviewData, result, student, testMeta }) => {
  const brand = getBranding();
  const totalMarks = safeNumber(result.total_marks ?? testMeta?.total_marks);
  const score = safeNumber(result.score);
  const scorePct = clampPct(result.percentage ?? (totalMarks ? (score / totalMarks) * 100 : 0));
  const grade = gradeFor(scorePct);
  const qs = Array.isArray(reviewData?.questions) ? reviewData.questions : [];
  const ans = reviewData?.answers || {};

  const derivedCorrect = qs.filter(q => answerStatus(q, ans).isCorrect).length;
  const derivedWrong = qs.filter(q => {
    const status = answerStatus(q, ans);
    return status.answered && !status.isCorrect;
  }).length;
  const totalQuestions = safeNumber(result.total || qs.length || (result.correct_count || 0) + (result.wrong_count || 0), qs.length);
  const correctCount = safeNumber(result.correct_count, derivedCorrect);
  const wrongCount = safeNumber(result.wrong_count, derivedWrong);
  const skippedCount = Math.max(0, totalQuestions - correctCount - wrongCount);
  const answeredCount = correctCount + wrongCount;
  const accuracyPct = answeredCount ? percentOf(correctCount, answeredCount) : 0;
  const completionPct = totalQuestions ? percentOf(answeredCount, totalQuestions) : 0;
  const deducted = safeNumber(result.marks_deducted);
  const integrityScore = result.cancelled ? 0 : result.flagged ? 45 : 100;
  const examHealth = weightedHealth([
    { value: scorePct, weight: 0.50, has: true },
    { value: accuracyPct, weight: 0.22, has: answeredCount > 0 },
    { value: completionPct, weight: 0.16, has: totalQuestions > 0 },
    { value: integrityScore, weight: 0.12, has: true },
  ]);
  const healthMeta = healthLabel(examHealth);

  const pieData = [
    { name: 'Correct', value: correctCount, color: '#10b981' },
    { name: 'Wrong', value: wrongCount, color: '#ef4444' },
    { name: 'Skipped', value: skippedCount > 0 ? skippedCount : 0, color: '#9ca3af' }
  ].filter(d => d.value > 0);
  const safePieData = pieData.length ? pieData : [{ name: 'No answers', value: 1, color: '#e5e7eb' }];

  const classAvgPct = result.class_avg_score_pct ?? (result.class_avg_score !== undefined && totalMarks ? (result.class_avg_score / totalMarks) * 100 : undefined);
  const highestPct = result.highest_score_pct ?? (result.highest_score !== undefined && totalMarks ? (result.highest_score / totalMarks) * 100 : undefined);
  const benchmarkData = [
    { name: 'Student', value: scorePct, color: '#4f46e5' },
    ...(classAvgPct !== undefined ? [{ name: 'Class Avg', value: clampPct(classAvgPct), color: '#64748b' }] : []),
    ...(highestPct !== undefined ? [{ name: 'Highest', value: clampPct(highestPct), color: '#059669' }] : []),
  ];

  const matrixItems = totalQuestions > 0
    ? Array.from({ length: totalQuestions }).map((_, index) => {
        const q = qs[index];
        if (q) {
          const status = answerStatus(q, ans);
          return { index, state: status.isCorrect ? 'correct' : status.isSkipped ? 'skipped' : 'wrong' };
        }
        const state = index < correctCount ? 'correct' : index < correctCount + wrongCount ? 'wrong' : 'skipped';
        return { index, state };
      })
    : [];

  const missedQuestions = qs
    .map((q, index) => ({ q, index, status: answerStatus(q, ans) }))
    .filter(item => !item.status.isCorrect)
    .slice(0, 8);

  const revisionPlan = [
    wrongCount > 0 ? `Redo ${wrongCount} wrong answer${wrongCount > 1 ? 's' : ''} without seeing the options first.` : null,
    skippedCount > 0 ? `Practice time management: ${skippedCount} question${skippedCount > 1 ? 's were' : ' was'} skipped.` : null,
    deducted > 0 ? `Negative marking cost ${deducted} mark${deducted === 1 ? '' : 's'}; attempt only after eliminating at least two choices.` : null,
    accuracyPct < 70 && answeredCount > 0 ? `Accuracy is ${pctText(accuracyPct)}; revise concepts before increasing attempt speed.` : null,
    completionPct < 90 ? `Completion is ${pctText(completionPct)}; plan the next mock with fixed time per question.` : null,
  ].filter(Boolean);
  if (!revisionPlan.length) {
    revisionPlan.push('Performance is stable. Keep one quick revision and one timed practice before the next exam.');
  }

  return (
    <div className="bg-white p-8 font-sans text-gray-900 mx-auto w-[794px] box-border">
      <Header
        title={testMeta?.title || result.testTitle || 'Exam'}
        subtitle={testMeta?.subject_name || 'Subject'}
        student={student}
        brand={brand}
        rightStats={[
          { label: 'Score', value: `${Math.round(scorePct)}%` },
          { label: 'Grade', value: grade.grade },
          ...(result.rank ? [{ label: 'Rank', value: `${result.rank}${result.total_attempts ? ` / ${result.total_attempts}` : ''}` }] : []),
        ]}
      />

      {(result.flagged || result.cancelled) && (
        <div className="mt-8 flex items-start gap-4 rounded-xl border border-red-200 bg-red-50 p-5" style={{ pageBreakInside: 'avoid' }}>
          <AlertTriangle className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-red-900">{result.cancelled ? 'Exam Terminated' : 'Integrity Alert'}</h3>
            <p className="mt-1 text-sm text-red-700">
              {result.cancelled
                ? 'This exam was terminated due to a security violation. Score recorded as 0.'
                : 'Suspicious activity was detected during this exam. Results flagged for review.'}
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex gap-7">
          <ScoreRing value={scorePct} label="Exam Score" sublabel={`${score} / ${totalMarks || '-'} marks`} color={healthMeta.color} />
          <ScoreRing value={examHealth} label="Exam Health" sublabel={healthMeta.title} color={healthMeta.color} size={126} />
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-500">Exam Intelligence</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-gray-950">{healthMeta.title}</h2>
            <p className="mt-2 text-sm leading-7 text-gray-600">
              Accuracy {pctText(accuracyPct)}, completion {pctText(completionPct)}, and integrity {result.cancelled ? 'terminated' : result.flagged ? 'flagged' : 'clear'}.
              {classAvgPct !== undefined ? ` Score is ${compareCopy(scorePct, classAvgPct)}.` : ' Class benchmark was not available for this view.'}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <InsightCard icon={CheckCircle} title="Correct" body={`${correctCount} answer${correctCount === 1 ? '' : 's'} secured marks.`} tone="emerald" />
              <InsightCard icon={XCircle} title="Marks Lost" body={`${wrongCount} wrong, ${skippedCount} skipped, ${deducted} negative marks.`} tone={wrongCount || skippedCount || deducted ? 'red' : 'emerald'} />
              <InsightCard icon={ShieldCheck} title="Integrity" body={result.cancelled ? 'Exam was terminated.' : result.flagged ? 'Flagged for teacher review.' : 'No suspicious activity recorded.'} tone={result.cancelled || result.flagged ? 'red' : 'blue'} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-4 gap-4">
        <KpiCard icon={Target} label="Score" value={`${Math.round(scorePct)}%`} color={{ bg: 'bg-indigo-100', text: 'text-indigo-600' }} />
        <KpiCard icon={Gauge} label="Accuracy" value={pctText(accuracyPct)} color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }} />
        <KpiCard icon={Layers} label="Completion" value={pctText(completionPct)} color={{ bg: 'bg-blue-100', text: 'text-blue-600' }} />
        <KpiCard icon={Trophy} label="Rank" value={result.rank ? `${result.rank}/${result.total_attempts || '-'}` : '-'} color={{ bg: 'bg-amber-100', text: 'text-amber-600' }} />
        <KpiCard icon={CheckCircle} label="Correct" value={correctCount} color={{ bg: 'bg-teal-100', text: 'text-teal-600' }} />
        <KpiCard icon={XCircle} label="Wrong" value={wrongCount} color={{ bg: 'bg-red-100', text: 'text-red-600' }} />
        <KpiCard icon={Clock} label="Skipped" value={skippedCount} color={{ bg: 'bg-gray-100', text: 'text-gray-600' }} />
        <KpiCard icon={Zap} label="Points" value={result.points_earned ?? 0} color={{ bg: 'bg-fuchsia-100', text: 'text-fuchsia-600' }} />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6" style={{ pageBreakInside: 'avoid' }}>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm flex items-center justify-between">
          <div className="relative flex items-center justify-center h-[160px] w-[160px]">
            <PieChart width={160} height={160}>
              <Pie data={safePieData} innerRadius={55} outerRadius={75} paddingAngle={3} dataKey="value" stroke="none" isAnimationActive={false}>
                {safePieData.map((entry, index) => <Cell key={`exam-cell-${index}`} fill={entry.color} />)}
              </Pie>
            </PieChart>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-gray-900">{Math.round(scorePct)}%</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Score</span>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {safePieData.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-sm font-medium text-gray-600 w-16">{d.name}</span>
                <span className="text-sm font-bold text-gray-900">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-500" /> Class Position
          </h3>
          <BarChart width={310} height={165} data={benchmarkData} margin={{ top: 8, right: 0, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} domain={[0, 100]} />
            <ReferenceLine y={35} stroke="#f59e0b" strokeDasharray="4 4" />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} isAnimationActive={false}>
              {benchmarkData.map((entry, index) => <Cell key={`exam-bar-${index}`} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </div>
      </div>

      <Section title="Answer Matrix & Marks Leakage" icon={LayoutGrid} color={{ bg: 'bg-indigo-100', text: 'text-indigo-600' }}>
        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm overflow-hidden flex flex-col">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-indigo-500" /> Answer Matrix
            </h3>
            {matrixItems.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-1.5 content-start h-full">
                  {matrixItems.map((item) => {
                    const bg = item.state === 'correct' ? 'bg-emerald-500' : item.state === 'skipped' ? 'bg-gray-300' : 'bg-red-500';
                    return (
                      <div key={item.index} className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm ${bg}`}>
                        {item.index + 1}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex gap-4 text-[11px] font-semibold text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-emerald-500" /> Correct</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-red-500" /> Wrong</span>
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-gray-300" /> Skipped</span>
                </div>
              </>
            ) : (
              <EmptyState title="Answer matrix unavailable" body="Question-level review data was not returned, so only summary metrics are shown." />
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" /> Marks Leakage
            </h3>
            <div className="space-y-4">
              <BenchmarkBar label="Accuracy" value={accuracyPct} compare={100} valueLabel="Actual" compareLabel="Target" color="bg-emerald-500" />
              <BenchmarkBar label="Completion" value={completionPct} compare={100} valueLabel="Actual" compareLabel="Target" color="bg-blue-500" />
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-gray-400">Wrong</p>
                  <p className="text-xl font-black text-red-600">{wrongCount}</p>
                </div>
                <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-gray-400">Skipped</p>
                  <p className="text-xl font-black text-gray-600">{skippedCount}</p>
                </div>
                <div className="rounded-xl bg-white p-3 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-gray-400">Penalty</p>
                  <p className="text-xl font-black text-amber-600">{deducted}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Revision Plan" icon={Brain} color={{ bg: 'bg-fuchsia-100', text: 'text-fuchsia-600' }}>
        <div className="grid grid-cols-2 gap-5 rounded-2xl border border-gray-100 bg-gray-50/40 p-6">
          <div className="space-y-3">
            {revisionPlan.map((item, i) => (
              <div key={i} className="flex gap-3 rounded-xl bg-white p-3 shadow-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-100 text-xs font-black text-fuchsia-700">{i + 1}</span>
                <p className="text-sm leading-6 text-gray-700">{item}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Question focus</p>
            {missedQuestions.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {missedQuestions.map(({ index, status }) => (
                  <span key={index} className={`rounded-full px-3 py-1 text-xs font-bold ${status.isSkipped ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-700'}`}>
                    Q{index + 1} {status.isSkipped ? 'Skipped' : 'Wrong'}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-7 text-gray-600">No incorrect question was available in the review data.</p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Detailed Question Review" icon={FileText} color={{ bg: 'bg-indigo-100', text: 'text-indigo-600' }} avoidBreak={false}>
        {qs.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="w-12 px-4 py-3 text-center">#</th>
                  <th className="px-4 py-3">Question</th>
                  <th className="px-4 py-3">Your Answer</th>
                  <th className="px-4 py-3">Correct Answer</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {qs.map((q, i) => {
                  const { studentAnswer, isCorrect, isSkipped } = answerStatus(q, ans);
                  const options = Array.isArray(q.options) ? q.options : [];
                  return (
                    <tr key={i} className={!isCorrect && !isSkipped ? 'bg-red-50/50' : 'bg-white'} style={{ pageBreakInside: 'avoid' }}>
                      <td className="px-4 py-3 text-center text-gray-500 font-medium">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 line-clamp-2">{q.question}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {isSkipped ? <span className="italic text-gray-400">Skipped</span> : (options[studentAnswer] ?? `Option ${safeNumber(studentAnswer) + 1}`)}
                      </td>
                      <td className="px-4 py-3 text-emerald-700">
                        {options[q.correct_idx] ?? `Option ${safeNumber(q.correct_idx) + 1}`}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isCorrect ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">Correct</span>
                        ) : isSkipped ? (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-600">Skipped</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">Wrong</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Question-level review unavailable" body="The PDF still includes score, accuracy, completion, rank, integrity, and marks leakage from the attempt summary." />
        )}
      </Section>

      <div className="mt-12 border-t border-gray-100 pt-8 pb-4 flex items-center justify-between" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-gray-800">{brand.name} Learning Management System</span>
          <span className="text-xs text-gray-400 font-medium tracking-wide">Result generated securely on {fmtDate(new Date().toISOString())}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-[10px] text-gray-400 uppercase tracking-widest">
            <p>Scan to Verify</p>
            <p>Authenticity</p>
          </div>
          <div className="p-1 bg-white border border-gray-200 rounded-lg shadow-sm">
            <QRCode value={`${brand.url}/verify/exam/${result.id || 'exam'}`} size={48} level="L" />
          </div>
        </div>
      </div>
    </div>
  );
};

// Exporters
export function buildStudentReportPdf({ data, period = 'overall' }) {
  if (!data) return;
  const name = (data.student?.name || 'Student').replace(/\s+/g, '_');
  return mountAndPrint(StudentReportTemplate, { data, period }, `${name}_Report.pdf`);
}

export function buildExamResultPdf({ reviewData, result, student, testMeta }) {
  if (!result) return;
  const name = (student?.name || 'Student').replace(/\s+/g, '_');
  return mountAndPrint(ExamResultTemplateV2, { reviewData, result, student, testMeta }, `${name}_Exam_Result.pdf`);
}

const ClassAnalyticsTemplate = ({ analytics, standardName }) => {
  const brand = getBranding();
  const overview = analytics?.overview || {};
  const students = analytics?.students || [];
  const subjectPerf = analytics?.subject_performance || [];
  const recentTests = analytics?.recent_tests || [];
  const atRisk = students.filter(s =>
    (s.has_attendance && (s.attendance_pct || 0) < 75) ||
    (s.has_tests && (s.avg_score || 0) < 40)
  );

  return (
    <div className="bg-white p-8 font-sans text-gray-900 mx-auto w-[794px] box-border">
      <div className="rounded-2xl bg-neutral-900 p-8 text-white" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex items-center justify-between gap-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              {brand.logoUrl && <img src={brand.logoUrl} alt="Logo" className="h-7 w-7 rounded bg-white p-0.5" crossOrigin="anonymous" />}
              <span className="text-xs font-semibold tracking-wider text-neutral-300 uppercase">{brand.name}</span>
            </div>
            <h1 className="text-3xl font-bold">{standardName || 'Standard'} Analytics</h1>
            <p className="mt-2 text-sm text-neutral-300">Generated on {fmtDate(new Date().toISOString())}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-neutral-400">Students</p>
            <p className="text-4xl font-bold">{overview.total_students || students.length || 0}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-4 gap-4">
        <KpiCard icon={Trophy} label="Avg Score" value={`${Math.round(overview.avg_score || 0)}%`} color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }} />
        <KpiCard icon={CheckCircle} label="Attendance" value={`${Math.round(overview.avg_attendance || 0)}%`} color={{ bg: 'bg-violet-100', text: 'text-violet-600' }} />
        <KpiCard icon={Target} label="At Risk" value={atRisk.length} color={{ bg: 'bg-red-100', text: 'text-red-600' }} />
        <KpiCard icon={FileText} label="Recent Tests" value={recentTests.length} color={{ bg: 'bg-amber-100', text: 'text-amber-600' }} />
      </div>

      {subjectPerf.length > 0 && (
        <Section title="Subject Performance" icon={Book} color={{ bg: 'bg-indigo-100', text: 'text-indigo-600' }}>
          <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50/40 p-6">
            {subjectPerf.map((s, i) => (
              <div key={s.subject_id || s.subject_name || i} className="space-y-2" style={{ pageBreakInside: 'avoid' }}>
                <div className="flex justify-between text-sm font-semibold">
                  <span>{s.subject_name || 'Subject'}</span>
                  <span>{Math.round(s.avg_score || 0)}% score / {Math.round(s.avg_attendance || 0)}% attendance</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(0, Math.min(100, s.avg_score || 0))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {students.length > 0 && (
        <Section title="Student Roster" icon={Trophy} color={{ bg: 'bg-amber-100', text: 'text-amber-600' }}>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3 text-center">Avg Score</th>
                  <th className="px-4 py-3 text-center">Attendance</th>
                  <th className="px-4 py-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...students].sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0)).map((s, i) => (
                  <tr key={s.id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} style={{ pageBreakInside: 'avoid' }}>
                    <td className="px-4 py-3 font-medium">{s.name || 'Student'}</td>
                    <td className="px-4 py-3 text-center font-bold">{s.has_tests ? `${Math.round(s.avg_score || 0)}%` : '-'}</td>
                    <td className="px-4 py-3 text-center font-bold">{s.has_attendance ? `${Math.round(s.attendance_pct || 0)}%` : '-'}</td>
                    <td className="px-4 py-3 text-right">{s.points || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
};

export function buildClassAnalyticsPdf({ analytics, standardName }) {
  if (!analytics) return;
  const name = (standardName || 'Standard').replace(/\s+/g, '_');
  return mountAndPrint(ClassAnalyticsTemplate, { analytics, standardName }, `${name}_Analytics.pdf`);
}
