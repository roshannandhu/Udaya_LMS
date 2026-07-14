import React from 'react';
import { createRoot } from 'react-dom/client';
import html2pdf from 'html2pdf.js';
import { XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, ReferenceLine } from 'recharts';
import QRCode from 'react-qr-code';
import { useSettingsStore, DEFAULT_LMS_LOGO } from '../store';
import { AlertTriangle, Book, Calendar, CheckCircle, Clock, FileText, Target, Trophy, XCircle, Zap, Activity, LayoutGrid, Award, Brain, ClipboardCheck, Layers, ShieldCheck, TrendingUp, TrendingDown, Minus, ListChecks, Gauge } from 'lucide-react';

const PDF_CANVAS_WIDTH = 720;

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

const gradeDesc = (g) => ({ 'A+': 'Outstanding', A: 'Excellent', 'B+': 'Very Good', B: 'Good', C: 'Average', D: 'Needs Work', E: 'Below Pass' }[g] || '');

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

// Resolves avatar_url (which may be "preset:male", "preset:female", null, or a real URL)
// to a usable <img> src. Always returns a string so the caller never needs a conditional.
const PDF_AVATAR_PRESETS = { 'preset:male': '/avatar-male.svg', 'preset:female': '/avatar-female.svg' };
const resolveAvatarUrl = (src) => src ? (PDF_AVATAR_PRESETS[src] || src) : '/avatar-neutral.svg';

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
      windowWidth: PDF_CANVAS_WIDTH,
    },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: ['css', 'legacy'] }
  };
  await html2pdf().set(opt).from(element).save();
}

const waitForFrame = () => new Promise(resolve => {
  // rAF never fires in hidden/background tabs — fall back so the export can't hang
  const timer = setTimeout(resolve, 300);
  requestAnimationFrame(() => { clearTimeout(timer); resolve(); });
});
const waitForMs = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const withTimeout = (promise, ms) => Promise.race([promise, waitForMs(ms)]);

async function waitForAssets(container) {
  if (document.fonts?.ready) {
    await withTimeout(document.fonts.ready.catch(() => {}), 2500);
  }

  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(images.map(async (img) => {
    if (img.complete && img.naturalWidth > 0) return;

    // Wait for load/decode — swallow errors, we check naturalWidth after
    if (img.decode) {
      await withTimeout(img.decode().catch(() => {}), 1800);
    } else {
      await withTimeout(new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      }), 1800);
    }

    // If image still has no pixels (CORS block, load failure, or SVG without explicit dimensions),
    // fall back to the local neutral avatar so html2canvas never captures a blank avatar box.
    if (img.naturalWidth === 0) {
      const src = img.getAttribute('src') || '';
      if (src !== '/avatar-neutral.svg') {
        img.removeAttribute('crossorigin');
        img.src = '/avatar-neutral.svg';
        await withTimeout(new Promise(r => { img.onload = r; img.onerror = r; }), 1000);
      }
    }
  }));
}

async function mountAndPrint(Component, props, filename) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-9999px',
    top: '0',
    width: `${PDF_CANVAS_WIDTH}px`,
    minHeight: '1123px',
    background: '#ffffff',
    zIndex: '-1',
    pointerEvents: 'none',
  });

  const container = document.createElement('div');
  container.style.width = `${PDF_CANVAS_WIDTH}px`;
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
  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 p-7 text-white shadow-xl" style={{ pageBreakInside: 'avoid' }}>
    <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
    <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-indigo-400/20 blur-3xl" />
    
    <div className="relative z-10">
      <div className="flex gap-5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow-inner p-1">
          <img src={resolveAvatarUrl(student?.avatar_url)} alt="Profile" className="h-full w-full rounded-lg object-cover" crossOrigin="anonymous" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center gap-2">
            {brand.logoUrl && <img src={brand.logoUrl} alt="Logo" className="h-6 w-6 rounded bg-white p-0.5" crossOrigin="anonymous" />}
            <span className="text-xs font-semibold tracking-wider text-indigo-100 uppercase">{brand.name}</span>
          </div>
          <h1 className="break-words text-3xl font-bold tracking-tight text-white">{student?.name || 'Student'}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-indigo-100/90">
            {student?.student_code && <span>{student.student_code}</span>}
            {student?.standard_name && <span>- {student.standard_name}</span>}
            {student?.username && <span>- @{student.username}</span>}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="rounded-full border border-white/20 bg-indigo-950/20 px-3 py-1 text-xs font-semibold text-white">
              {title}
            </div>
            <span className="text-xs text-indigo-200">{subtitle}</span>
          </div>
        </div>
      </div>

      {rightStats && (
        <div className="mt-5 flex flex-wrap gap-3 *:w-[calc(33.333%-8px)]">
          {rightStats.map((stat, i) => (
            <div key={i} className="rounded-xl bg-indigo-950/20 px-4 py-2 text-center">
              <span className="text-xs font-medium text-indigo-200">{stat.label}</span>
              <span className="mt-0.5 block text-lg font-bold text-white">{stat.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

// Empty PageBreak removed
// Empty PageBreak removed
const Section = ({ title, icon: Icon, color, children, className = '', avoidBreak = false, compact = false }) => {
  return (
  <div className={`${compact ? 'mt-6' : 'mt-8'} ${className}`}>
    <div className={`${compact ? 'mb-3' : 'mb-4'} flex items-center gap-2 border-b border-gray-100 pb-2.5`} style={{ pageBreakAfter: 'avoid' }}>
      <div className={`rounded-lg p-1.5 ${color.bg}`}>
        <Icon className={`h-4 w-4 ${color.text}`} strokeWidth={2.5} />
      </div>
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
    </div>
    {children}
  </div>
  );
};

const KpiCard = ({ icon: Icon, label, value, color }) => (
  <div className="flex min-h-[112px] flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm" style={{ pageBreakInside: 'avoid' }}>
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className={`shrink-0 rounded-lg p-2 ${color.bg}`}>
        <Icon className={`h-4 w-4 ${color.text}`} strokeWidth={2.5} />
      </div>
    </div>
    <span className="whitespace-nowrap text-[9px] font-bold uppercase leading-4 text-gray-500">{label}</span>
    <span className="mt-auto break-words text-2xl font-bold leading-tight text-gray-900">{value}</span>
  </div>
);

const ProgressBar = ({ label, value, max = 100, color, valueText, labelClassName = 'w-28' }) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100)) || 0;
  return (
    <div className="flex items-center gap-3" style={{ pageBreakInside: 'avoid' }}>
      <span className={`${labelClassName} break-words text-xs font-semibold leading-snug text-gray-700`}>{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full ${color.fill} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 text-right text-xs font-bold text-gray-900">{valueText || `${Math.round(pct)}%`}</span>
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
    <div className="flex flex-col items-center justify-center text-center" style={{ minWidth: size }}>
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
    <div className={`min-w-0 rounded-xl border p-3 ${tones[tone] || tones.blue}`} style={{ pageBreakInside: 'avoid' }}>
      <div className="mb-2 flex items-start gap-2">
        <Icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        <h3 className="min-w-0 break-words text-xs font-bold leading-4 text-gray-900">{title}</h3>
      </div>
      <p className="break-words text-[11px] leading-5 text-gray-600">{body}</p>
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

const EmptyState = ({ title, body }) => (
  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-center" style={{ pageBreakInside: 'avoid' }}>
    <p className="text-sm font-bold text-gray-800">{title}</p>
    <p className="mt-1 text-xs leading-relaxed text-gray-500">{body}</p>
  </div>
);

// Real month-view attendance calendar: one wall-calendar block per month with
// date numbers, colored by attendance. Flex rows (no CSS grid) — html2canvas
// stretches grids vertically. Shows the last 2 months that contain records.
const MonthCalendar = ({ heatmapData }) => {
  const byDate = new Map(
    (heatmapData || [])
      .filter(row => row?.date)
      .map(row => [String(row.date).slice(0, 10), row])
  );
  const monthKeys = [...new Set(
    [...byDate.keys()].filter(d => !Number.isNaN(new Date(`${d}T00:00:00`).getTime())).map(d => d.slice(0, 7))
  )].sort().slice(-2);
  if (!monthKeys.length) return null;

  const dayColor = (rec) => {
    if (!rec || !safeNumber(rec.total)) return 'bg-gray-100 text-gray-400';
    if (safeNumber(rec.present) > 0) return 'bg-emerald-500 text-white';
    if (safeNumber(rec.late) > 0) return 'bg-amber-400 text-white';
    return 'bg-red-400 text-white';
  };

  const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex justify-center gap-12">
        {monthKeys.map((key) => {
          const [y, m] = key.split('-').map(Number);
          const first = new Date(y, m - 1, 1);
          const daysInMonth = new Date(y, m, 0).getDate();
          const cells = [
            ...Array.from({ length: first.getDay() }, () => null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
          ];
          while (cells.length % 7 !== 0) cells.push(null);
          const weeks = [];
          for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
          return (
            <div key={key}>
              <p className="mb-2 text-center text-xs font-black text-gray-800">
                {first.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
              </p>
              <div className="mb-1 flex gap-1">
                {weekdays.map((d, i) => (
                  <div key={i} className="flex h-5 w-7 items-center justify-center text-[9px] font-bold text-gray-400">{d}</div>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex gap-1">
                    {week.map((day, di) => {
                      if (!day) return <div key={di} className="h-7 w-7" />;
                      const dateKey = `${key}-${String(day).padStart(2, '0')}`;
                      return (
                        <div key={di} className={`flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold ${dayColor(byDate.get(dateKey))}`}>
                          {day}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 text-xs font-medium text-gray-500">
        <div className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-gray-300 bg-gray-100" />No Class</div>
        <div className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 shrink-0 rounded-sm bg-emerald-500" />Present</div>
        <div className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 shrink-0 rounded-sm bg-amber-400" />Late</div>
        <div className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 shrink-0 rounded-sm bg-red-400" />Absent</div>
      </div>
    </div>
  );
};


// ─── Report card building blocks (student report, 4 fixed pages) ────────────
// One color language for the whole report card: green >= 75, amber 50-74, red < 50.
const bandFor = (pct) => {
  const s = clampPct(pct);
  if (s >= 75) return { text: 'text-emerald-700', bg: 'bg-emerald-100', fill: 'bg-emerald-500', hex: '#059669' };
  if (s >= 50) return { text: 'text-amber-700', bg: 'bg-amber-100', fill: 'bg-amber-500', hex: '#d97706' };
  return { text: 'text-red-700', bg: 'bg-red-100', fill: 'bg-red-500', hex: '#dc2626' };
};

const DeltaTag = ({ value, compare, suffix = '%' }) => {
  const c = Number(compare);
  if (!Number.isFinite(c)) return <span className="text-[11px] font-semibold text-gray-400">Class average not available</span>;
  const diff = Math.round(safeNumber(value) - c);
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500">
        <Minus className="h-3 w-3" strokeWidth={3} /> Same as class average
      </span>
    );
  }
  const up = diff > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${up ? 'text-emerald-600' : 'text-red-600'}`}>
      {up ? <TrendingUp className="h-3 w-3" strokeWidth={3} /> : <TrendingDown className="h-3 w-3" strokeWidth={3} />}
      {Math.abs(diff)}{suffix} {up ? 'above' : 'below'} class average
    </span>
  );
};

// Content flows naturally across pages. pageBreakInside: 'avoid' on each atomic
// card prevents mid-card splits. PageStrip acts as a visual section divider.
const PageGroup = ({ children, newPage = false }) => (
  <div style={newPage ? { pageBreakBefore: 'always' } : {}}>
    {children}
  </div>
);

const PageStrip = ({ student, title, period }) => (
  <div className="mt-8 mb-4 border-l-4 border-ink pl-4" style={{ pageBreakInside: 'avoid', pageBreakAfter: 'avoid' }}>
    <p className="text-base font-black text-gray-900">{title}</p>
    <p className="text-[11px] font-semibold text-gray-500">
      {student?.name || 'Student'}{student?.student_code ? ` · ${student.student_code}` : ''} · {periodTitle(period)} · {periodRange(period)}
    </p>
  </div>
);

const ReportCardHeader = ({ student, brand, period, grade, hasScore, scoreBand }) => (
  <div style={{ pageBreakInside: 'avoid' }}>
    {/* Brand bar — same style as ExamResultTemplateV3 */}
    <div className="flex items-center justify-between border-b-2 border-ink pb-4">
      <div className="flex items-center gap-3">
        {brand.logoUrl && (
          <img src={brand.logoUrl} alt="Logo" className="h-10 w-10 rounded-lg bg-white object-contain" crossOrigin="anonymous" />
        )}
        <div>
          <p className="text-lg font-black leading-tight tracking-tight text-gray-950">{brand.name}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Student Report Card</p>
        </div>
      </div>
      <div className="rounded-lg bg-ink px-4 py-2 text-xs font-black uppercase tracking-widest text-white">
        Report Card
      </div>
    </div>
    {/* Identity card — same pattern as V3 identity card */}
    <div className="mt-4 flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-pastel-sky">
        <img src={resolveAvatarUrl(student?.avatar_url)} alt="Student" className="h-full w-full object-cover" crossOrigin="anonymous" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xl font-black leading-7 tracking-tight text-gray-950">{shortText(student?.name || 'Student', 32)}</p>
        <p className="mt-0.5 text-xs font-semibold leading-5 text-gray-500">
          {[student?.student_code, student?.standard_name, student?.username ? `@${student.username}` : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{periodTitle(period)}</p>
        <p className="text-xs font-bold text-gray-700">{periodRange(period)}</p>
        {hasScore && grade && (
          <div className={`mt-2 inline-flex items-center rounded-full px-3 py-0.5 text-xs font-black text-white ${scoreBand?.fill || 'bg-gray-500'}`}>
            Grade {grade.grade}
          </div>
        )}
      </div>
    </div>
  </div>
);

const HeadlineStat = ({ icon: Icon, label, value, band, children, className = '' }) => (
  <div className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ${className}`} style={{ pageBreakInside: 'avoid' }}>
    <div className="flex items-center gap-2">
      <div className={`shrink-0 rounded-lg p-1.5 ${band.bg}`}>
        <Icon className={`h-4 w-4 ${band.text}`} strokeWidth={2.5} />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</span>
    </div>
    <p className="mt-2 text-3xl font-black text-gray-950">{value}</p>
    <div className="mt-1 min-h-[16px]">{children}</div>
  </div>
);

// Report 1: student report card — 4 fixed pages.
// Page 1 verdict, page 2 marks, page 3 effort, page 4 next steps. Every chart
// carries a one-line takeaway; every headline number carries a class comparison.
export const StudentReportTemplate = ({ data, period }) => {
  const s = data.student || {};
  const brand = getBranding();

  const radar = data.subject_radar || [];
  const timeline = data.test_timeline || [];
  const topicMap = data.topic_map || [];
  const heatmap = data.attendance_heatmap || [];
  const assignmentStats = data.assignment_stats || {};
  const liveStats = data.live_classes_stats || {};
  const classAvg = data.class_averages || {};

  // ── Headline numbers ──────────────────────────────────────────────────────
  const periodScores = timeline.map(t => safeNumber(t.score_pct, NaN)).filter(Number.isFinite);
  const avgForPeriod = period === 'overall'
    ? safeNumber(s.avg_score, avgOf(periodScores))
    : (periodScores.length ? avgOf(periodScores) : safeNumber(s.avg_score));
  const scoreValue = clampPct(avgForPeriod);
  const attendanceValue = clampPct(s.attendance_pct);
  const hasScore = timeline.length > 0 || safeNumber(s.avg_score) > 0;
  const grade = gradeFor(scoreValue);
  const scoreBand = bandFor(scoreValue);
  const rankLabel = data.rank && data.total_students ? `${data.rank} of ${data.total_students}` : null;
  const periodPoints = data.period_points ?? s.points ?? 0;

  const submittedAssignments = safeNumber(assignmentStats.submitted);
  const totalAssignments = safeNumber(assignmentStats.total);
  const pendingAssignments = Math.max(0, totalAssignments - submittedAssignments);

  // ── Subjects ──────────────────────────────────────────────────────────────
  const subjectRows = [...radar].sort((a, b) => safeNumber(b.test_avg) - safeNumber(a.test_avg));
  const testedSubjects = subjectRows.filter(r => safeNumber(r.test_count) > 0);
  const strongestSubject = testedSubjects[0];
  const weakestSubject = testedSubjects.length > 1 ? testedSubjects[testedSubjects.length - 1] : null;

  // ── Trend chart + caption ─────────────────────────────────────────────────
  const chartData = [...timeline]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-10)
    .map((t, index) => ({
      name: shortText(t.test_title, 12, `T${index + 1}`),
      score: Math.round(clampPct(t.score_pct)),
      classScore: Math.round(clampPct(t.class_avg_score_pct ?? classAvg.avg_score ?? scoreValue)),
    }));
  const trendDelta = chartData.length >= 2 ? chartData[chartData.length - 1].score - chartData[0].score : null;
  const trendCaption = chartData.length >= 2
    ? `Scores moved from ${chartData[0].score}% to ${chartData[chartData.length - 1].score}% across the last ${chartData.length} tests (${trendDelta >= 0 ? 'up' : 'down'} ${Math.abs(trendDelta)}%). Overall average is ${compareCopy(scoreValue, classAvg.avg_score).toLowerCase()}.`
    : null;
  const recentTests = [...timeline].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

  // ── Attendance summary ────────────────────────────────────────────────────
  const classDays = heatmap.filter(d => safeNumber(d.total) > 0);
  const attendedDays = classDays.filter(d => safeNumber(d.present) > 0 || safeNumber(d.late) > 0).length;
  const attendanceCaption = classDays.length
    ? `Present ${attendedDays} of ${classDays.length} class days (${Math.round(percentOf(attendedDays, classDays.length))}%). ${compareCopy(attendanceValue, classAvg.attendance_pct)}.`
    : null;

  // ── Effort (work completed vs available) ──────────────────────────────────
  const videosCompleted = sumBy(radar, 'video_done');
  const videosAvailable = sumBy(radar, 'video_total');
  const effortRows = [
    { label: 'Tests', done: timeline.length, total: safeNumber(data.total_tests_in_standard), color: { fill: 'bg-neutral-900' } },
    { label: 'Assignments', done: submittedAssignments, total: totalAssignments, color: { fill: 'bg-amber-500' } },
    { label: 'Videos', done: videosCompleted, total: videosAvailable, color: { fill: 'bg-blue-500' } },
    { label: 'Live classes', done: safeNumber(liveStats.attended), total: safeNumber(liveStats.total), color: { fill: 'bg-emerald-500' } },
  ].filter(r => r.total > 0 || r.done > 0);

  // ── Weak topics + action plan ─────────────────────────────────────────────
  const weakTopics = [...topicMap]
    .filter(t => safeNumber(t.score_pct) < 60 || !t.video_completed)
    .sort((a, b) => safeNumber(a.score_pct) - safeNumber(b.score_pct));
  const priorityTopics = (weakTopics.length ? weakTopics : [...topicMap].sort((a, b) => safeNumber(a.score_pct) - safeNumber(b.score_pct))).slice(0, 4);

  const actionPlan = [
    s.attendance_pct !== undefined && s.attendance_pct !== null && attendanceValue < 75
      ? `Attend every scheduled class for the next two weeks to lift attendance from ${Math.round(attendanceValue)}% above 80%.` : null,
    weakestSubject
      ? `Revise ${weakestSubject.subject} basics and retake one practice test to move it from ${pctText(weakestSubject.test_avg)} past ${Math.min(100, Math.round(safeNumber(weakestSubject.test_avg)) + 10)}%.` : null,
    priorityTopics[0] && safeNumber(priorityTopics[0].score_pct) < 60
      ? `Rewatch the "${priorityTopics[0].topic || 'weakest topic'}" video and redo its questions before the next test.` : null,
    pendingAssignments > 0
      ? `Submit the ${pendingAssignments} pending assignment${pendingAssignments > 1 ? 's' : ''} this week.` : null,
    !timeline.length
      ? `Attempt the first available test so the next report can show a real performance baseline.` : null,
  ].filter(Boolean).slice(0, 3);
  if (!actionPlan.length) {
    actionPlan.push('Keep the current rhythm: one revision session, one practice test, and one assignment review every week.');
  }

  // ── Teacher's remark (plain sentences, all traceable to the numbers) ──────
  const firstName = (s.name || 'The student').trim().split(/\s+/)[0];
  const remarkSentences = [];
  if (hasScore) {
    remarkSentences.push(`${firstName} scored an average of ${Math.round(scoreValue)}% (Grade ${grade.grade})${rankLabel ? ` and currently ranks ${rankLabel} in the class` : ''}.`);
  } else {
    remarkSentences.push(`${firstName} has not attempted any tests in this period, so no grade is assigned yet.`);
  }
  if (strongestSubject && weakestSubject && strongestSubject !== weakestSubject) {
    remarkSentences.push(`Strongest subject is ${strongestSubject.subject} at ${pctText(strongestSubject.test_avg)}, while ${weakestSubject.subject} at ${pctText(weakestSubject.test_avg)} needs the most attention.`);
  } else if (strongestSubject) {
    remarkSentences.push(`${strongestSubject.subject} is the strongest subject so far at ${pctText(strongestSubject.test_avg)}.`);
  }
  const effortBits = [];
  if (s.attendance_pct !== undefined && s.attendance_pct !== null) effortBits.push(`attendance is ${Math.round(attendanceValue)}%`);
  if (totalAssignments) effortBits.push(`${submittedAssignments} of ${totalAssignments} assignments submitted`);
  if (videosAvailable) effortBits.push(`${videosCompleted} of ${videosAvailable} videos completed`);
  if (effortBits.length) remarkSentences.push(`On effort, ${effortBits.join(', ')}.`);

  return (
    <div className="mx-auto box-border bg-white font-sans text-gray-900 p-7" style={{ width: PDF_CANVAS_WIDTH }}>

      {/* ── PAGE 1 — The verdict: grade, rank, headline numbers, remark ──── */}
      <PageGroup>
        <ReportCardHeader student={s} brand={brand} period={period} grade={grade} hasScore={hasScore} scoreBand={scoreBand} />

        <div className="mt-6 flex gap-5">
          <div className={`flex w-44 shrink-0 flex-col items-center justify-center rounded-2xl border border-gray-100 p-5 ${hasScore ? scoreBand.bg : 'bg-gray-50'}`} style={{ pageBreakInside: 'avoid' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Overall Grade</p>
            <p className={`mt-1 text-6xl font-black ${hasScore ? scoreBand.text : 'text-gray-300'}`}>{hasScore ? grade.grade : '-'}</p>
            <p className="mt-1 text-[11px] font-semibold text-gray-500">{hasScore ? `${Math.round(scoreValue)}% average` : 'No tests yet'}</p>
          </div>
          <div className="flex flex-1 items-center justify-between rounded-2xl border border-gray-100 bg-white px-6 py-4 shadow-sm" style={{ pageBreakInside: 'avoid' }}>
            <ScoreRing
              value={scoreValue}
              label="Average Score"
              sublabel={hasScore ? compareCopy(scoreValue, classAvg.avg_score) : 'No test attempted yet'}
              color={hasScore ? scoreBand.hex : '#9ca3af'}
              size={128}
            />
            <div className="flex flex-col gap-4 text-right">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Class Rank</p>
                <p className="text-2xl font-black text-gray-950">{rankLabel || '-'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Tests Taken</p>
                <p className="text-2xl font-black text-gray-950">{data.total_tests_in_standard ? `${timeline.length} of ${data.total_tests_in_standard}` : timeline.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-4">
          <HeadlineStat icon={Calendar} className="flex-1" label="Attendance" value={s.attendance_pct !== undefined && s.attendance_pct !== null ? `${Math.round(attendanceValue)}%` : '-'} band={bandFor(attendanceValue)}>
            <DeltaTag value={attendanceValue} compare={classAvg.attendance_pct} />
          </HeadlineStat>
          <HeadlineStat
            icon={ClipboardCheck}
            className="flex-1"
            label="Assignments"
            value={totalAssignments ? `${submittedAssignments}/${totalAssignments}` : '-'}
            band={totalAssignments ? bandFor(percentOf(submittedAssignments, totalAssignments)) : { bg: 'bg-gray-100', text: 'text-gray-500' }}
          >
            <span className="text-[11px] font-bold text-gray-500">{totalAssignments ? `${pendingAssignments} pending` : 'None assigned yet'}</span>
          </HeadlineStat>
          <HeadlineStat icon={Trophy} className="flex-1" label="Points" value={periodPoints} band={{ bg: 'bg-[#E3EFFB]', text: 'text-[#2383E2]' }}>
            <DeltaTag value={periodPoints} compare={classAvg.points} suffix=" pts" />
          </HeadlineStat>
        </div>

        <Section title="Teacher's Remark" icon={FileText} color={{ bg: 'bg-[#EAE4F2]', text: 'text-[#6940A5]' }}>
          <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6" style={{ pageBreakInside: 'avoid' }}>
            <p className="text-sm leading-7 text-gray-700">{remarkSentences.join(' ')}</p>
            <div className="mt-6 flex items-end justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                  <QRCode value={`${brand.url}/verify/${s.id || 'student'}`} size={44} level="L" />
                </div>
                <p className="text-[10px] uppercase leading-4 tracking-widest text-gray-400">Scan to view<br />live report</p>
              </div>
              <div className="text-center">
                <div className="h-10 w-44 border-b border-gray-300" />
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Teacher's Signature & Date</p>
              </div>
            </div>
          </div>
        </Section>
      </PageGroup>

      {/* ── PAGE 2 — Marks: subject table, trend chart ──────────────────── */}
      <PageGroup newPage>
        <PageStrip student={s} title="Marks & Subjects" period={period} />

        <Section title="Subject-wise Performance" icon={Book} color={{ bg: 'bg-violet-100', text: 'text-violet-600' }} compact>
          {subjectRows.length ? (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-left text-sm" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col />
                  <col style={{ width: 76 }} />
                  <col style={{ width: 104 }} />
                  <col style={{ width: 76 }} />
                  <col style={{ width: 116 }} />
                  <col style={{ width: 82 }} />
                </colgroup>
                <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3 text-center">Tests</th>
                    <th className="px-4 py-3 text-center">Avg Score</th>
                    <th className="px-4 py-3 text-center">Grade</th>
                    <th className="px-4 py-3 text-center">Attendance</th>
                    <th className="px-4 py-3 text-center">Videos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {subjectRows.slice(0, 8).map((r, i) => {
                    const tested = safeNumber(r.test_count) > 0;
                    const band = bandFor(r.test_avg);
                    return (
                      <tr key={r.subject_id || r.subject || i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} style={{ pageBreakInside: 'avoid' }}>
                        <td className="px-4 py-3 font-semibold text-gray-800">{shortText(r.subject || 'Subject', 15)}</td>
                        <td className="px-4 py-3 text-center text-gray-500">{safeNumber(r.test_count)}</td>
                        <td className="px-4 py-3 text-center font-bold text-gray-900">{tested ? pctText(r.test_avg) : '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            {tested
                              ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${band.bg} ${band.text}`}>{gradeFor(r.test_avg).grade}</span>
                              : <span className="text-xs text-gray-400">-</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500">{r.attendance_pct !== undefined && r.attendance_pct !== null ? pctText(r.attendance_pct) : '-'}</td>
                        <td className="px-4 py-3 text-center text-gray-500">{safeNumber(r.video_total) ? `${safeNumber(r.video_done)}/${safeNumber(r.video_total)}` : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No subject data yet" body="Subject-wise marks appear here once tests are taken in each subject." />
          )}
        </Section>

        <Section title="Score Trend vs Class" icon={Activity} color={{ bg: 'bg-blue-100', text: 'text-blue-600' }} compact>
          {chartData.length >= 2 ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 pt-6" style={{ pageBreakInside: 'avoid' }}>
              <LineChart width={560} height={200} data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} domain={[0, 100]} />
                <ReferenceLine y={35} stroke="#f59e0b" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="classScore" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="score" stroke="#2383E2" strokeWidth={3} dot={{ r: 4, fill: '#2383E2' }} isAnimationActive={false} />
              </LineChart>
              <div className="mt-1 flex justify-end gap-5 text-[11px] font-semibold text-gray-500">
                <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-[#2383E2]" /> Student</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-slate-400" /> Class avg</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-amber-400" /> Pass line (35%)</span>
              </div>
              <p className="mt-3 border-t border-gray-200 pt-3 text-xs leading-5 text-gray-600">{trendCaption}</p>
            </div>
          ) : chartData.length === 1 ? (
            <div className="flex items-center gap-6 rounded-xl border border-gray-100 bg-gray-50/50 p-5" style={{ pageBreakInside: 'avoid' }}>
              <div className="shrink-0 text-center">
                <p className="text-5xl font-black text-gray-950">{chartData[0].score}%</p>
                <p className="mt-1 text-xs font-semibold text-gray-500">{chartData[0].name}</p>
              </div>
              <p className="text-xs leading-5 text-gray-500">Only one test has been completed so far. A trend line appears once there are two or more results — this will fill in automatically as more tests are taken.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-5 text-center" style={{ pageBreakInside: 'avoid' }}>
              <p className="text-sm font-bold text-gray-700">No tests taken yet</p>
              <p className="mt-1 text-xs text-gray-500">A score trend chart will appear here once the first test is attempted.</p>
            </div>
          )}
        </Section>

      </PageGroup>

      {/* ── PAGE 3 — Test history & discipline: recent tests, attendance ── */}
      <PageGroup newPage>
        <PageStrip student={s} title="Test History & Attendance" period={period} />

        <Section title="Recent Tests" icon={FileText} color={{ bg: 'bg-amber-100', text: 'text-amber-600' }} compact>
          {recentTests.length ? (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-left text-sm" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 122 }} />
                  <col />
                  <col style={{ width: 74 }} />
                  <col style={{ width: 88 }} />
                  <col style={{ width: 84 }} />
                </colgroup>
                <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Test</th>
                    <th className="px-4 py-3 text-center">Score</th>
                    <th className="px-4 py-3 text-center">Cls Avg</th>
                    <th className="px-4 py-3 text-center">Rank</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentTests.map((t, i) => (
                    <tr key={t.test_id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} style={{ pageBreakInside: 'avoid' }}>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(t.date)}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{shortText(t.test_title, 30)}</td>
                      <td className="px-4 py-3 text-center font-bold text-gray-900">{Math.round(clampPct(t.score_pct))}%</td>
                      <td className="px-4 py-3 text-center text-gray-500">{t.class_avg_score_pct !== undefined && t.class_avg_score_pct !== null ? `${Math.round(clampPct(t.class_avg_score_pct))}%` : '-'}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{t.rank ? `${t.rank}/${t.total_attempts}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No tests in this period" body="Test results appear here as soon as an exam is attempted." />
          )}
        </Section>

        <Section title="Attendance Calendar" icon={Calendar} color={{ bg: 'bg-teal-100', text: 'text-teal-600' }} compact>
          {heatmap.length ? (
            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex justify-center">
                <MonthCalendar heatmapData={heatmap} />
              </div>
              {attendanceCaption && <p className="mt-4 border-t border-gray-100 pt-3 text-xs leading-5 text-gray-600">{attendanceCaption}</p>}
            </div>
          ) : s.attendance_pct !== undefined && s.attendance_pct !== null ? (
            <div className="flex items-center gap-6 rounded-xl border border-gray-100 bg-white p-6" style={{ pageBreakInside: 'avoid' }}>
              <div className="shrink-0 text-center">
                <p className={`text-5xl font-black ${bandFor(attendanceValue).text}`}>{Math.round(attendanceValue)}%</p>
                <p className="mt-1 text-xs font-semibold text-gray-500">Overall Attendance</p>
              </div>
              <div className="flex-1">
                <div className="h-4 overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full ${bandFor(attendanceValue).fill}`} style={{ width: `${attendanceValue}%` }} />
                </div>
                <div className="mt-2">
                  <DeltaTag value={attendanceValue} compare={classAvg.attendance_pct} />
                </div>
                <p className="mt-3 text-xs leading-5 text-gray-500">Day-by-day calendar data is not yet available. The percentage above is from the teacher's register. The calendar will appear once daily attendance records are synced.</p>
              </div>
            </div>
          ) : (
            <EmptyState title="No attendance records yet" body="Once attendance is marked, a day-by-day calendar appears here." />
          )}
        </Section>

      </PageGroup>

      {/* ── PAGE 4 — Effort & what next: work done, weak topics, plan ────── */}
      <PageGroup newPage>
        <PageStrip student={s} title="Effort & Next Steps" period={period} />

        <Section title="Work Completed" icon={ClipboardCheck} color={{ bg: 'bg-blue-100', text: 'text-blue-600' }} compact>
          {effortRows.length ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50/40 p-4">
              <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 32, rowGap: 12 }}>
                {effortRows.map(row => (
                  <div key={row.label} style={{ width: effortRows.length >= 2 ? 'calc(50% - 16px)' : '100%' }}>
                    <ProgressBar
                      label={row.label}
                      value={row.total ? percentOf(row.done, row.total) : 100}
                      color={row.color}
                      valueText={row.total ? `${row.done}/${row.total}` : `${row.done}`}
                      labelClassName="w-28"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-3 border-t border-gray-200 pt-2 text-xs leading-5 text-gray-600">
                Each bar shows work completed out of what was available in this period.
              </p>
            </div>
          ) : (
            <EmptyState title="No activity recorded yet" body="Tests, assignments, videos, and live classes will be summarised here." />
          )}
        </Section>

        <Section title="Topics That Need Work" icon={Zap} color={{ bg: 'bg-fuchsia-100', text: 'text-fuchsia-600' }} compact>
          {priorityTopics.length ? (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-left text-sm" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col />
                  <col style={{ width: 118 }} />
                  <col style={{ width: 92 }} />
                  <col style={{ width: 124 }} />
                </colgroup>
                <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Topic</th>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3 text-center">Mastery</th>
                    <th className="px-4 py-3 text-center">Video</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {priorityTopics.map((t, i) => {
                    const band = bandFor(t.score_pct);
                    return (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} style={{ pageBreakInside: 'avoid' }}>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{shortText(t.topic || 'Concept', 30)}</td>
                        <td className="px-4 py-2.5 text-gray-500">{shortText(t.subject || '-', 11)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${band.bg} ${band.text}`}>{Math.round(safeNumber(t.score_pct))}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            {t.video_completed
                              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#059669' }}><CheckCircle className="h-4 w-4" /> Watched</span>
                              : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#9ca3af' }}><XCircle className="h-4 w-4" /> Unwatched</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No topic data yet" body="Topic-level strengths and weaknesses appear once tests with topics are attempted." />
          )}
        </Section>

        <Section title="Action Plan" icon={ListChecks} color={{ bg: 'bg-amber-100', text: 'text-amber-600' }} compact>
          <div className="rounded-2xl border border-gray-100 bg-gray-50/40 p-4">
            <div className="space-y-2.5">
              {actionPlan.map((step, i) => (
                <div key={i} className="flex gap-3 rounded-xl bg-white p-2.5 shadow-sm" style={{ pageBreakInside: 'avoid' }}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-black text-amber-700">{i + 1}</span>
                  <p className="text-sm leading-5 text-gray-700">{step}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-gray-200 pt-2.5 text-center text-[10px] leading-4 text-gray-500">
              Computer-generated report from {brand.name}. Scores, attendance, and activity come directly from LMS records for the stated period.
            </p>
          </div>
        </Section>

        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-3 text-[10px] font-semibold text-gray-400" style={{ pageBreakInside: 'avoid' }}>
          <span>{brand.name} - Student Report Card</span>
          <span>Generated on {fmtDate(new Date().toISOString())}</span>
          <span>Computer-generated · {periodTitle(period)}</span>
        </div>
      </PageGroup>
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
    <div className="mx-auto box-border bg-white p-8 font-sans text-gray-900" style={{ width: PDF_CANVAS_WIDTH }}>
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
        <div className="mt-8 flex items-start gap-4 rounded-xl border border-red-200 bg-red-50 p-5">
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
      <div className="mt-8 flex flex-wrap gap-6 *:w-[calc(50%-12px)]">
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
    <div className="mx-auto box-border bg-white p-8 font-sans text-gray-900" style={{ width: PDF_CANVAS_WIDTH }}>
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
        <div className="mt-8 flex items-start gap-4 rounded-xl border border-red-200 bg-red-50 p-5">
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

      <div className="mt-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
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
            <div className="mt-4 flex flex-wrap gap-3 *:w-[calc(33.333%-8px)]">
              <InsightCard icon={CheckCircle} title="Correct" body={`${correctCount} answer${correctCount === 1 ? '' : 's'} secured marks.`} tone="emerald" />
              <InsightCard icon={XCircle} title="Marks Lost" body={`${wrongCount} wrong, ${skippedCount} skipped, ${deducted} negative marks.`} tone={wrongCount || skippedCount || deducted ? 'red' : 'emerald'} />
              <InsightCard icon={ShieldCheck} title="Integrity" body={result.cancelled ? 'Exam was terminated.' : result.flagged ? 'Flagged for teacher review.' : 'No suspicious activity recorded.'} tone={result.cancelled || result.flagged ? 'red' : 'blue'} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-4 *:w-[calc(25%-12px)]">
        <KpiCard icon={Target} label="Score" value={`${Math.round(scorePct)}%`} color={{ bg: 'bg-indigo-100', text: 'text-indigo-600' }} />
        <KpiCard icon={Gauge} label="Accuracy" value={pctText(accuracyPct)} color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }} />
        <KpiCard icon={Layers} label="Completion" value={pctText(completionPct)} color={{ bg: 'bg-blue-100', text: 'text-blue-600' }} />
        <KpiCard icon={Trophy} label="Rank" value={result.rank ? `${result.rank}/${result.total_attempts || '-'}` : '-'} color={{ bg: 'bg-amber-100', text: 'text-amber-600' }} />
        <KpiCard icon={CheckCircle} label="Correct" value={correctCount} color={{ bg: 'bg-teal-100', text: 'text-teal-600' }} />
        <KpiCard icon={XCircle} label="Wrong" value={wrongCount} color={{ bg: 'bg-red-100', text: 'text-red-600' }} />
        <KpiCard icon={Clock} label="Skipped" value={skippedCount} color={{ bg: 'bg-gray-100', text: 'text-gray-600' }} />
        <KpiCard icon={Zap} label="Points" value={result.points_earned ?? 0} color={{ bg: 'bg-fuchsia-100', text: 'text-fuchsia-600' }} />
      </div>

      <div className="mt-8 flex flex-wrap gap-6 *:w-[calc(50%-12px)]">
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
          <BarChart width={270} height={165} data={benchmarkData} margin={{ top: 8, right: 0, left: -25, bottom: 0 }}>
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
        <div className="flex flex-wrap gap-6 *:w-[calc(50%-12px)]">
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
              <div className="flex flex-wrap gap-3 *:w-[calc(33.333%-8px)] pt-2">
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
        <div className="flex flex-wrap gap-5 *:w-[calc(50%-10px)] rounded-2xl border border-gray-100 bg-gray-50/40 p-6">
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

// ---------------------------------------------------------------------------
// Exam Result V3 — simple 3-page report card.
// Page 1: fixed-height summary a parent can read in 10 seconds.
// Page 2: answer map + plain-language tips. Page 3+: question review table.
// Layout rules for html2canvas: flexbox only (no CSS grid), explicit pixel
// widths on every column, fixed table layout, no line-clamp.
// ---------------------------------------------------------------------------

const V3_PASS_MARK_PCT = 35;
const V3_GRADE_LEGEND = 'Grades: A+ 90-100 · A 80-89 · B+ 70-79 · B 60-69 · C 50-59 · D 35-49 · E below 35 · Pass mark 35%';

const fmtMarks = (n) => {
  const v = safeNumber(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

const v3DefaultRemark = ({ cancelled, flagged, scorePct }) => {
  if (cancelled) return 'This exam was cancelled due to a rule violation during the test. Please contact the teacher to understand the next steps and arrange a re-attempt if applicable.';
  if (flagged) return 'The result is under review because unusual activity was noticed during this exam. Please contact the teacher to clarify.';
  if (scorePct >= 90) return 'Outstanding result — your child has mastered this topic. Encourage them to keep up this study routine and help their classmates where they can.';
  if (scorePct >= 75) return 'Very good performance. A short revision of the wrong answers will make the next result even stronger. Well done!';
  if (scorePct >= 60) return 'Good effort. Reviewing the wrong answers this week and attempting one timed practice test at home will help improve further.';
  if (scorePct >= V3_PASS_MARK_PCT) return 'Passed, but there is clear room to improve. Please encourage your child to review the questions listed on the next pages before the next test.';
  return 'Below the pass mark this time. Please contact the teacher for a personalised revision plan and provide extra study support at home.';
};

const V3StatusChip = ({ state }) => {
  if (state === 'correct') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
      <CheckCircle className="h-3 w-3" strokeWidth={3} /> Correct
    </span>
  );
  if (state === 'skipped') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">
      <Minus className="h-3 w-3" strokeWidth={3} /> Skipped
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
      <XCircle className="h-3 w-3" strokeWidth={3} /> Wrong
    </span>
  );
};

const V3StatTile = ({ icon: Icon, label, value, iconColor, sub }) => (
  <div className="flex-1 rounded-xl border border-gray-200 bg-white p-3 text-center" style={{ pageBreakInside: 'avoid' }}>
    <div className="flex items-center justify-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${iconColor}`} strokeWidth={2.5} />
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</span>
    </div>
    <p className="mt-1.5 text-2xl font-black leading-none text-gray-950">{value}</p>
    {sub && <p className="mt-1 text-[10px] font-semibold text-gray-400">{sub}</p>}
  </div>
);

const V3ParentSummary = ({ name, passed, cancelled, score, totalMarks, scorePct, grade, rank, totalAttempts, wrongCount, skippedCount }) => (
  <div className="mt-4 rounded-xl border-2 border-amber-200 bg-amber-50 p-4" style={{ pageBreakInside: 'avoid' }}>
    <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-amber-700">For Parents</p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ marginTop: 1, fontSize: 13, fontWeight: 900, lineHeight: 1, color: cancelled ? '#c2410c' : passed ? '#059669' : '#dc2626', flexShrink: 0 }}>{cancelled ? '[!]' : passed ? '✓' : '✗'}</span>
        <p style={{ fontSize: 13, fontWeight: 700, lineHeight: '20px', color: '#111827', margin: 0 }}>
          {cancelled
            ? `${name}'s exam was cancelled — a rule violation was detected. Please contact the teacher.`
            : passed
            ? `${name} has PASSED this exam.`
            : `${name} has NOT PASSED. The pass mark is ${V3_PASS_MARK_PCT}%. Further revision is needed.`}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ marginTop: 1, fontSize: 13, lineHeight: 1, color: '#3b82f6', flexShrink: 0 }}>◉</span>
        <p style={{ fontSize: 13, lineHeight: '20px', color: '#374151', margin: 0 }}>
          Scored <strong>{fmtMarks(score)} out of {totalMarks} marks</strong> — {Math.round(scorePct)}% — Grade <strong>{grade.grade}</strong> <span style={{ color: '#9ca3af' }}>({gradeDesc(grade.grade)})</span>
        </p>
      </div>
      {rank ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ marginTop: 1, fontSize: 13, lineHeight: 1, color: '#f59e0b', flexShrink: 0 }}>★</span>
          <p style={{ fontSize: 13, lineHeight: '20px', color: '#374151', margin: 0 }}>
            Ranked <strong>#{rank}</strong>{totalAttempts ? ` in the class (${totalAttempts} students appeared)` : ' in the class'}
          </p>
        </div>
      ) : null}
      {(wrongCount > 0 || skippedCount > 0) ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ marginTop: 1, fontSize: 13, lineHeight: 1, color: '#ef4444', flexShrink: 0 }}>→</span>
          <p style={{ fontSize: 13, lineHeight: '20px', color: '#374151', margin: 0 }}>
            {[wrongCount > 0 && `${wrongCount} question${wrongCount > 1 ? 's' : ''} answered incorrectly`, skippedCount > 0 && `${skippedCount} question${skippedCount > 1 ? 's' : ''} left unanswered`].filter(Boolean).join(' · ')}
            {' — see Page 3 for the detailed question-by-question breakdown.'}
          </p>
        </div>
      ) : null}
    </div>
  </div>
);

const V3CompareBar = ({ label, value, barColor }) => (
  <div className="flex items-center gap-3" style={{ pageBreakInside: 'avoid' }}>
    <span className="w-28 shrink-0 text-xs font-semibold text-gray-600">{label}</span>
    <div className="h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(clampPct(value), 1)}%` }} />
    </div>
    <span className="w-12 shrink-0 text-right text-sm font-bold text-gray-900">{Math.round(clampPct(value))}%</span>
  </div>
);

const V3PageTitle = ({ title, sub, right }) => (
  <div className="mb-5 flex items-end justify-between border-b-2 border-ink pb-3">
    <div>
      <h2 className="text-xl font-black tracking-tight text-gray-950">{title}</h2>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
    {right && <span className="whitespace-nowrap text-right text-[10px] font-bold uppercase leading-4 tracking-widest text-gray-400">{shortText(right, 44)}</span>}
  </div>
);

export const ExamResultTemplateV3 = ({ reviewData, result, student, testMeta }) => {
  const brand = getBranding();

  // ---- derived numbers ----
  const totalMarks = safeNumber(result.total_marks ?? testMeta?.total_marks);
  const score = safeNumber(result.score);
  const scorePct = clampPct(result.percentage ?? (totalMarks ? (score / totalMarks) * 100 : 0));
  const grade = gradeFor(scorePct);
  const cancelled = Boolean(result.cancelled);
  const flagged = Boolean(result.flagged) && !cancelled;
  const passed = !cancelled && scorePct >= V3_PASS_MARK_PCT;

  const qs = Array.isArray(reviewData?.questions) ? reviewData.questions : [];
  const ans = reviewData?.answers || {};
  const correctCount = safeNumber(result.correct_count, qs.filter(q => answerStatus(q, ans).isCorrect).length);
  const wrongCount = safeNumber(result.wrong_count, qs.filter(q => { const s = answerStatus(q, ans); return s.answered && !s.isCorrect; }).length);
  const totalQuestions = qs.length || safeNumber(result.total, correctCount + wrongCount);
  const skippedCount = Math.max(0, totalQuestions - correctCount - wrongCount);
  const answeredCount = correctCount + wrongCount;
  const accuracyPct = answeredCount ? percentOf(correctCount, answeredCount) : 0;
  const completionPct = totalQuestions ? percentOf(answeredCount, totalQuestions) : 0;
  const deducted = safeNumber(result.marks_deducted);

  const durationMins = safeNumber(testMeta?.duration_mins, 0) || null;
  let timeTakenMins = null;
  const startedAt = result.started_at ? new Date(result.started_at) : null;
  const submittedAt = result.submitted_at ? new Date(result.submitted_at) : null;
  if (startedAt && submittedAt && !Number.isNaN(startedAt.getTime()) && !Number.isNaN(submittedAt.getTime()) && submittedAt > startedAt) {
    timeTakenMins = Math.max(1, Math.round((submittedAt - startedAt) / 60000));
    if (durationMins && timeTakenMins > durationMins) timeTakenMins = durationMins;
  }
  const timeSub = timeTakenMins !== null && durationMins ? `of ${durationMins} min` : null;
  const timeText = timeTakenMins !== null
    ? `${timeTakenMins} min`
    : durationMins ? `${durationMins} min` : '-';

  const classAvgPct = result.class_avg_score_pct !== undefined && result.class_avg_score_pct !== null ? clampPct(result.class_avg_score_pct) : undefined;
  const highestPct = result.highest_score_pct !== undefined && result.highest_score_pct !== null ? clampPct(result.highest_score_pct) : undefined;

  const remark = (result.teacher_remark || '').trim() || v3DefaultRemark({ cancelled, flagged, scorePct });

  // ---- answer map (falls back to counts when question data is missing) ----
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

  const plural = (n) => (n === 1 ? '' : 's');
  const tips = [
    wrongCount > 0 ? `Ask your child to try the ${wrongCount} wrong question${plural(wrongCount)} again at home, then check the answers using Page 3 of this report.` : null,
    skippedCount > 0 ? `Your child left ${skippedCount} question${plural(skippedCount)} unanswered${durationMins ? ` in the ${durationMins}-minute test` : ''}. Practising timed tests at home will help improve speed and confidence.` : null,
    deducted > 0 ? `${fmtMarks(deducted)} mark${deducted !== 1 ? 's were' : ' was'} deducted for wrong answers. Encourage your child to skip questions they are unsure about rather than guessing.` : null,
    accuracyPct < 70 && answeredCount > 0 ? `Only ${pctText(accuracyPct)} of attempted questions were correct. A topic revision session before the next test is recommended.` : null,
  ].filter(Boolean).slice(0, 4);
  if (!tips.length) tips.push('Well done! Go through the question review on Page 3 together to stay sharp for the next exam.');

  const examDate = fmtDate(result.submitted_at || testMeta?.scheduled_for || new Date().toISOString());
  const identityRows = [
    { label: 'Student ID', value: student?.student_code || '-' },
    { label: 'Exam date', value: examDate },
    ...(testMeta?.topic_tag ? [{ label: 'Topic', value: shortText(testMeta.topic_tag, 20) }] : []),
    { label: 'Duration', value: durationMins ? `${durationMins} min` : '-' },
  ];

  const footer = (
    <div className="mt-5 border-t border-gray-200 pt-3" style={{ pageBreakInside: 'avoid' }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-800">{brand.name}</p>
          <p className="mt-0.5 text-[10px] font-medium text-gray-400">Result generated on {fmtDate(new Date().toISOString())} · This is a computer-generated document.</p>
          <p className="mt-1 text-[10px] font-semibold text-gray-500">Page 2 — question results map · Page 3 — full question-by-question answer review</p>
          <p className="mt-1 text-[9px] font-medium text-gray-400">{V3_GRADE_LEGEND}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right text-[9px] font-bold uppercase tracking-widest text-gray-400">
            <p>Scan to</p>
            <p>Verify</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-1">
            <QRCode value={`${brand.url}/verify/exam/${result.id || 'exam'}`} size={44} level="L" />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto box-border bg-white px-8 py-6 font-sans text-gray-900" style={{ width: PDF_CANVAS_WIDTH }}>

      {/* ============================== PAGE 1 ============================== */}
      {/* Brand bar */}
      <div className="flex items-center justify-between border-b-2 border-ink pb-4">
        <div className="flex items-center gap-3">
          {brand.logoUrl && (
            <img src={brand.logoUrl} alt="Logo" className="h-10 w-10 rounded-lg bg-white object-contain" crossOrigin="anonymous" />
          )}
          <div>
            <p className="text-lg font-black leading-tight tracking-tight text-gray-950">{brand.name}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Exam Result Report</p>
          </div>
        </div>
        <div className="rounded-lg bg-ink px-4 py-2 text-xs font-black uppercase tracking-widest text-white">
          Exam Result
        </div>
      </div>

      {/* Identity */}
      <div className="mt-4 flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-pastel-sky">
          <img src={resolveAvatarUrl(student?.avatar_url)} alt="Student" className="h-full w-full object-cover" crossOrigin="anonymous" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-black leading-7 tracking-tight text-gray-950">{shortText(student?.name || 'Student', 30)}</p>
          <p className="mt-0.5 text-xs font-semibold leading-5 text-gray-500">
            {shortText([student?.standard_name, testMeta?.subject_name].filter(Boolean).join(' · ') || '-', 50)}
          </p>
          <p className="mt-0.5 text-xs font-bold leading-5 text-gray-700">{shortText(testMeta?.title || 'Exam', 52)}</p>
        </div>
        <div className="w-52 shrink-0">
          {identityRows.map((row, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-[10px] font-bold uppercase leading-4 tracking-wide text-gray-400">{row.label}</span>
              <span className="whitespace-nowrap text-xs font-bold leading-5 text-gray-800">{shortText(row.value, 22)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Parent summary */}
      <V3ParentSummary
        name={shortText(student?.name || 'Your child', 24)}
        passed={passed}
        cancelled={cancelled}
        score={score}
        totalMarks={totalMarks}
        scorePct={scorePct}
        grade={grade}
        rank={result.rank}
        totalAttempts={result.total_attempts}
        wrongCount={wrongCount}
        skippedCount={skippedCount}
      />

      {/* Integrity banner */}
      {(flagged || cancelled) && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4" style={{ pageBreakInside: 'avoid' }}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <div>
            <h3 className="text-sm font-bold text-red-900">{cancelled ? 'Exam Cancelled' : 'Result Under Review'}</h3>
            <p className="mt-0.5 text-xs leading-5 text-red-700">
              {cancelled
                ? 'This exam was cancelled due to a rule violation during the test. The score is recorded as 0. Please contact the teacher.'
                : 'Unusual activity was noticed during this exam, so the result is under teacher review. Please contact the teacher.'}
            </p>
          </div>
        </div>
      )}

      {/* Score hero */}
      <div className="mt-4 flex gap-4" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex-1 rounded-xl border border-[#D2E4F8] bg-pastel-sky p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#2383E2]">Marks Obtained</p>
          <div className="mt-1 flex items-end gap-3">
            <span className="text-5xl font-black leading-none tracking-tight text-gray-950">{fmtMarks(score)}</span>
            <span className="pb-0.5 text-xl font-bold text-gray-400">/ {totalMarks ? fmtMarks(totalMarks) : '-'}</span>
            <span className={`mb-1 ml-1 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white ${cancelled ? 'bg-red-600' : passed ? 'bg-emerald-600' : 'bg-red-600'}`}>
              {cancelled ? 'Cancelled' : passed ? 'Passed' : 'Not Passed'}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-gray-600">{Math.round(scorePct)}% score{deducted > 0 ? ` · −${fmtMarks(deducted)} penalty for wrong answers` : ''} · Pass mark: {V3_PASS_MARK_PCT}%</p>
        </div>
        <div className="flex w-32 shrink-0 flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Grade</span>
          <span className={`mt-1 text-4xl font-black leading-none ${grade.color}`}>{grade.grade}</span>
          <span className="mt-1 text-[10px] font-bold text-gray-400">{gradeDesc(grade.grade)}</span>
        </div>
        <div className="flex w-32 shrink-0 flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Class Rank</span>
          <span className="mt-1 text-4xl font-black leading-none text-gray-950">{result.rank || '-'}</span>
          {result.total_attempts ? <span className="mt-1 text-[10px] font-bold text-gray-400">of {result.total_attempts}</span> : null}
        </div>
      </div>

      {/* Counts row */}
      <div className="mt-4 flex gap-3" style={{ pageBreakInside: 'avoid' }}>
        <V3StatTile icon={CheckCircle} label="Correct" value={correctCount} iconColor="text-emerald-500" />
        <V3StatTile icon={XCircle} label="Wrong" value={wrongCount} iconColor="text-red-500" />
        <V3StatTile icon={Minus} label="Skipped" value={skippedCount} iconColor="text-gray-400" />
        <V3StatTile icon={AlertTriangle} label="Penalty" value={deducted > 0 ? `-${fmtMarks(deducted)}` : '0'} iconColor="text-amber-500" sub={deducted > 0 ? 'wrong answers' : null} />
        <V3StatTile icon={Clock} label="Time Used" value={timeText} iconColor="text-blue-500" sub={timeSub} />
      </div>

      {/* Class comparison */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4" style={{ pageBreakInside: 'avoid' }}>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-800">
          <Trophy className="h-4 w-4 text-amber-500" /> How {shortText(student?.name?.split(' ')[0] || 'your child', 16)} did vs. the class
        </h3>
        <div className="space-y-3">
          <V3CompareBar label={student?.name ? shortText(student.name.split(' ')[0], 14) : 'Student'} value={scorePct} barColor="bg-[#2383E2]" />
          {classAvgPct !== undefined && <V3CompareBar label="Class average" value={classAvgPct} barColor="bg-gray-400" />}
          {highestPct !== undefined && <V3CompareBar label="Class topper" value={highestPct} barColor="bg-emerald-500" />}
        </div>
        {classAvgPct !== undefined && (
          <p className="mt-3 text-xs font-semibold text-gray-500">{shortText(student?.name || 'The student', 24)} scored {compareCopy(scorePct, classAvgPct)}.</p>
        )}
      </div>

      {/* Teacher's note */}
      <div className="mt-4 rounded-xl border-l-4 border-ink bg-gray-50 p-4" style={{ pageBreakInside: 'avoid' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Teacher's Note</p>
        <p className="mt-1 text-sm leading-6 text-gray-700">{remark}</p>
      </div>

      {footer}

      {/* ============================== PAGE 2 ============================== */}
      {!cancelled && matrixItems.length > 0 && (
        <div className="mt-8" style={{ pageBreakBefore: 'always' }}>
          <V3PageTitle
            title="Question Results"
            sub="Every question at a glance — green = correct · red = wrong · grey = not attempted (skipped)"
            right={`${student?.name || 'Student'} · ${shortText(testMeta?.title || 'Exam', 30)}`}
          />

          {/* Matrix + Why marks lost side-by-side */}
          <div className="flex gap-4" style={{ pageBreakInside: 'avoid' }}>
            <div className="flex-1 rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex flex-wrap gap-2">
                {matrixItems.map((item) => {
                  const bg = item.state === 'correct' ? 'bg-emerald-500' : item.state === 'skipped' ? 'bg-gray-300' : 'bg-red-500';
                  return (
                    <div key={item.index} className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ${bg}`}>
                      {item.index + 1}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-5 border-t border-gray-100 pt-3 text-[11px] font-semibold text-gray-500">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-emerald-500" /> Correct ({correctCount})</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-red-500" /> Wrong ({wrongCount})</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-gray-300" /> Skipped ({skippedCount})</span>
              </div>
            </div>
            <div className="w-72 shrink-0 rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-800">
                <Target className="h-4 w-4 text-red-500" /> Why marks were lost
              </h3>
              <div className="space-y-3">
                <V3CompareBar label="Correct rate" value={accuracyPct} barColor="bg-emerald-500" />
                <V3CompareBar label="Attempted" value={completionPct} barColor="bg-blue-500" />
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-500">
                {correctCount} of {answeredCount} attempted were correct. {answeredCount} of {totalQuestions} answered.
              </p>
            </div>
          </div>

          {/* How to Help at Home — full width, tips in 2-column grid for ≥2 tips */}
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5" style={{ pageBreakInside: 'avoid' }}>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-800">
              <Brain className="h-4 w-4 text-[#2383E2]" /> How to Help at Home
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 20, rowGap: 10 }}>
              {tips.map((tip, i) => (
                <div key={i} style={{ width: tips.length > 1 ? 'calc(50% - 10px)' : '100%', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pastel-sky text-[10px] font-black text-[#2383E2]">{i + 1}</span>
                  <p className="text-xs leading-5 text-gray-700">{tip}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================== PAGE 3+ ============================== */}
      {!cancelled && qs.length > 0 && (
        <div className="mt-8" style={{ pageBreakBefore: 'always' }}>
          <V3PageTitle
            title="Question Review"
            sub="Each question with the given answer and the correct answer"
            right={`${student?.name || 'Student'} · ${shortText(testMeta?.title || 'Exam', 30)}`}
          />
          <table className="w-full border-collapse text-left" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 38 }} />
              <col />
              <col style={{ width: 155 }} />
              <col style={{ width: 155 }} />
              <col style={{ width: 92 }} />
            </colgroup>
            <thead>
              <tr className="bg-gray-50 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                <th className="border-b border-gray-200 px-2 py-2.5 text-center">#</th>
                <th className="border-b border-gray-200 px-3 py-2.5">Question</th>
                <th className="border-b border-gray-200 px-3 py-2.5">Given Answer</th>
                <th className="border-b border-gray-200 px-3 py-2.5">Correct Answer</th>
                <th className="border-b border-gray-200 px-2 py-2.5 text-center">Result</th>
              </tr>
            </thead>
            <tbody>
              {qs.map((q, i) => {
                const { studentAnswer, isCorrect, isSkipped } = answerStatus(q, ans);
                const options = Array.isArray(q.options) ? q.options : [];
                const state = isCorrect ? 'correct' : isSkipped ? 'skipped' : 'wrong';
                const givenText = isSkipped ? null : (options[studentAnswer] != null ? String(options[studentAnswer]) : `Option ${safeNumber(studentAnswer) + 1}`);
                const correctText = options[q.correct_idx] != null ? String(options[q.correct_idx]) : `Option ${safeNumber(q.correct_idx) + 1}`;
                return (
                  <tr key={i} style={{ backgroundColor: state === 'wrong' ? '#fff1f2' : '#ffffff', pageBreakInside: 'avoid' }}>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 6px', textAlign: 'center', verticalAlign: 'top', fontSize: 11, fontWeight: 700, color: '#9ca3af', wordBreak: 'break-word' }}>{i + 1}</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 10px', verticalAlign: 'top', fontSize: 11, fontWeight: 500, lineHeight: '18px', color: '#1f2937', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{String(q.question || '')}</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 10px', verticalAlign: 'top', fontSize: 11, lineHeight: '18px', color: '#4b5563', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                      {isSkipped ? <span style={{ fontStyle: 'italic', color: '#9ca3af' }}>Not answered</span> : givenText}
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 10px', verticalAlign: 'top', fontSize: 11, fontWeight: 600, lineHeight: '18px', color: '#059669', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                      {correctText}
                    </td>
                    <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 6px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <V3StatusChip state={state} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── Class Marksheet (teacher view — ranked list + integrity section) ─────────
const V3_PASS_PCT = 35;

const ClassMarksheetTemplate = ({ test, attempts, stats }) => {
  const brand = getBranding();
  const totalM = safeNumber(test?.total_marks || test?.totalMarks, 100);
  const resultsTest = test?._resultsTest || {};
  const subjectName = resultsTest?.subject_classes?.name || test?.subject_name || test?.subject || '';
  const standardName = resultsTest?.subject_classes?.standards?.name || '';

  const sorted = [...(attempts || [])].sort((a, b) => (a.rank || 999) - (b.rank || 999));
  const flagged = sorted.filter(a => a.flagged);
  const passedCount = sorted.filter(a => totalM && (a.score / totalM) * 100 >= V3_PASS_PCT).length;
  const avgPct = totalM && stats?.avg_score != null ? ((stats.avg_score / totalM) * 100).toFixed(1) : '--';
  const highPct = totalM && stats?.highest_score != null ? ((stats.highest_score / totalM) * 100).toFixed(1) : '--';

  return (
    <div className="mx-auto box-border bg-white px-8 py-6 font-sans text-gray-900" style={{ width: PDF_CANVAS_WIDTH }}>

      {/* Brand bar */}
      <div className="flex items-center justify-between border-b-2 border-ink pb-4">
        <div className="flex items-center gap-3">
          {brand.logoUrl && (
            <img src={brand.logoUrl} alt="Logo" className="h-10 w-10 rounded-lg bg-white object-contain" crossOrigin="anonymous" />
          )}
          <div>
            <p className="text-lg font-black leading-tight tracking-tight text-gray-950">{brand.name}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Class Marksheet</p>
          </div>
        </div>
        <div className="rounded-lg bg-ink px-4 py-2 text-xs font-black uppercase tracking-widest text-white">Marksheet</div>
      </div>

      {/* Test identity + summary strip */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4" style={{ pageBreakInside: 'avoid' }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-black tracking-tight text-gray-950">{shortText(test?.title || 'Exam', 58)}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {[subjectName, standardName, test?.duration_mins ? `${test.duration_mins} min` : null, fmtDate(test?.scheduled_for || new Date().toISOString())].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex shrink-0 gap-5 text-center">
            {[
              { label: 'Appeared', value: sorted.length },
              { label: 'Passed', value: passedCount },
              { label: 'Avg %', value: avgPct + '%' },
              { label: 'Highest', value: highPct + '%' },
              { label: 'Flagged', value: flagged.length },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
                <p className="mt-0.5 text-lg font-black leading-none text-gray-900">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ranked results table */}
      <div className="mt-4">
        <table className="w-full border-collapse text-left" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 44 }} />
            <col style={{ width: 86 }} />
            <col />
            <col style={{ width: 64 }} />
            <col style={{ width: 52 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 56 }} />
            <col style={{ width: 50 }} />
            <col style={{ width: 52 }} />
            <col style={{ width: 52 }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-900 text-white text-[9px] font-bold uppercase tracking-wide">
              <th className="px-2 py-2.5 text-center">Rank</th>
              <th className="px-2 py-2.5">Student ID</th>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-2 py-2.5 text-center">Score</th>
              <th className="px-2 py-2.5 text-center">%</th>
              <th className="px-2 py-2.5 text-center">Grade</th>
              <th className="px-2 py-2.5 text-center">Correct</th>
              <th className="px-2 py-2.5 text-center">Wrong</th>
              <th className="px-2 py-2.5 text-center">Neg.</th>
              <th className="px-2 py-2.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a, i) => {
              const student = a.students || {};
              const pct = totalM ? (safeNumber(a.score) / totalM) * 100 : 0;
              const { grade, color } = gradeFor(pct);
              const pass = pct >= V3_PASS_PCT;
              return (
                <tr key={a.id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} style={{ pageBreakInside: 'avoid' }}>
                  <td className="border-b border-gray-100 px-2 py-2 text-center text-xs font-bold text-gray-500">
                    {(a.rank || i + 1)}
                  </td>
                  <td className="border-b border-gray-100 px-2 py-2 text-[10px] font-mono text-gray-500">
                    {shortText(student.student_code || '-', 11)}
                  </td>
                  <td className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-800">
                    {shortText(student.name || 'Unknown', a.flagged ? 14 : 18)}
                    {a.flagged && <span className="ml-1.5 text-[9px] font-bold text-red-600 uppercase">Flag</span>}
                  </td>
                  <td className="border-b border-gray-100 px-2 py-2 text-center text-xs font-bold text-gray-900">
                    {fmtMarks(a.score)}
                  </td>
                  <td className="border-b border-gray-100 px-2 py-2 text-center text-xs font-bold text-gray-900">
                    {pct.toFixed(1)}
                  </td>
                  <td className={`border-b border-gray-100 px-2 py-2 text-center text-xs font-black ${color}`}>{grade}</td>
                  <td className="border-b border-gray-100 px-2 py-2 text-center text-xs font-semibold text-emerald-600">{a.correct_count ?? '-'}</td>
                  <td className="border-b border-gray-100 px-2 py-2 text-center text-xs font-semibold text-red-500">{a.wrong_count ?? '-'}</td>
                  <td className="border-b border-gray-100 px-2 py-2 text-center text-xs font-semibold text-amber-600">
                    {safeNumber(a.marks_deducted) > 0 ? `-${fmtMarks(a.marks_deducted)}` : '—'}
                  </td>
                  <td className="border-b border-gray-100 px-2 py-2 text-center">
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${pass ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {pass ? 'Pass' : 'Fail'}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Integrity Issues section — only if there are flagged students */}
      {flagged.length > 0 && (
        <div style={{ pageBreakBefore: sorted.length > 25 ? 'always' : 'auto' }} className="mt-6">
          <div className="mb-4 flex items-end justify-between border-b-2 border-red-600 pb-3">
            <div>
              <h2 className="text-lg font-black tracking-tight text-gray-950">Integrity Issues</h2>
              <p className="mt-0.5 text-xs text-gray-400">{flagged.length} student{flagged.length !== 1 ? 's' : ''} flagged for suspicious activity during this exam</p>
            </div>
          </div>
          <table className="w-full border-collapse text-left" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: 86 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 56 }} />
              <col style={{ width: 48 }} />
              <col />
            </colgroup>
            <thead>
              <tr className="bg-red-800 text-white text-[9px] font-bold uppercase tracking-wide">
                <th className="px-2 py-2.5 text-center">Rank</th>
                <th className="px-2 py-2.5">Student ID</th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-2 py-2.5 text-center">Score</th>
                <th className="px-2 py-2.5 text-center">%</th>
                <th className="px-2 py-2.5 text-center">Events</th>
                <th className="px-3 py-2.5">Event Details</th>
              </tr>
            </thead>
            <tbody>
              {flagged.map((a, i) => {
                const student = a.students || {};
                const pct = totalM ? ((safeNumber(a.score) / totalM) * 100).toFixed(1) : '--';
                const events = Array.isArray(a.cheat_events) ? a.cheat_events : [];
                const details = events.length
                  ? events.map(e => `${new Date(e.timestamp).toLocaleTimeString()}: ${e.type}`).join(' · ')
                  : (a.terminated ? 'Exam terminated (screenshot/recording detected)' : 'Flagged');
                return (
                  <tr key={a.id || i} className={i % 2 === 0 ? 'bg-red-50' : 'bg-white'} style={{ pageBreakInside: 'avoid' }}>
                    <td className="border-b border-red-100 px-2 py-2 text-center text-xs font-bold text-gray-500">{a.rank || '-'}</td>
                    <td className="border-b border-red-100 px-2 py-2 text-[10px] font-mono text-gray-500">{shortText(student.student_code || '-', 11)}</td>
                    <td className="border-b border-red-100 px-3 py-2 text-xs font-semibold text-gray-800">{shortText(student.name || 'Unknown', 13)}</td>
                    <td className="border-b border-red-100 px-2 py-2 text-center text-xs font-bold">{fmtMarks(a.score)}</td>
                    <td className="border-b border-red-100 px-2 py-2 text-center text-xs font-bold text-red-700">{pct}%</td>
                    <td className="border-b border-red-100 px-2 py-2 text-center text-xs font-bold text-red-700">{events.length || (a.terminated ? 1 : 0)}</td>
                    <td className="border-b border-red-100 px-3 py-2 text-[9px] leading-4 text-gray-600">{shortText(details, 90)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="mt-5 border-t border-gray-200 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-[9px] text-gray-400">
            {brand.name} · Marksheet generated on {fmtDate(new Date().toISOString())} · {sorted.length} student{sorted.length !== 1 ? 's' : ''} · Pass mark: {V3_PASS_PCT}%
          </p>
          <p className="text-[9px] text-gray-400">Computer-generated</p>
        </div>
        <p className="mt-1 text-[9px] text-gray-400">{V3_GRADE_LEGEND}</p>
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
  const clean = (s, max) => String(s || '').trim().replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max);
  const who = clean(student?.student_code, 20) || clean(student?.name, 24) || 'Student';
  const what = clean(testMeta?.title, 40) || 'Exam';
  const when = String(result.submitted_at || new Date().toISOString()).slice(0, 10);
  return mountAndPrint(ExamResultTemplateV3, { reviewData, result, student, testMeta }, `${who}_${what}_${when}.pdf`);
}

export function buildClassMarksheetPdf({ test, attempts, stats }) {
  if (!attempts?.length) return;
  const clean = (s, max) => String(s || '').trim().replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max);
  const what = clean(test?.title, 40) || 'Exam';
  const when = new Date().toISOString().slice(0, 10);
  return mountAndPrint(ClassMarksheetTemplate, { test, attempts, stats }, `${what}_Marksheet_${when}.pdf`);
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
    <div className="mx-auto box-border bg-white p-8 font-sans text-gray-900" style={{ width: PDF_CANVAS_WIDTH }}>
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

      <div className="mt-8" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ width: 'calc(25% - 12px)' }}><KpiCard icon={Trophy} label="Avg Score" value={`${Math.round(overview.avg_score || 0)}%`} color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }} /></div>
        <div style={{ width: 'calc(25% - 12px)' }}><KpiCard icon={CheckCircle} label="Attendance" value={`${Math.round(overview.avg_attendance || 0)}%`} color={{ bg: 'bg-violet-100', text: 'text-violet-600' }} /></div>
        <div style={{ width: 'calc(25% - 12px)' }}><KpiCard icon={Target} label="At Risk" value={atRisk.length} color={{ bg: 'bg-red-100', text: 'text-red-600' }} /></div>
        <div style={{ width: 'calc(25% - 12px)' }}><KpiCard icon={FileText} label="Recent Tests" value={recentTests.length} color={{ bg: 'bg-amber-100', text: 'text-amber-600' }} /></div>
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
            <table className="w-full text-left text-sm" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 112 }} />
                <col style={{ width: 84 }} />
              </colgroup>
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
                    <td className="px-4 py-3 font-medium">{shortText(s.name || 'Student', 40)}</td>
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
