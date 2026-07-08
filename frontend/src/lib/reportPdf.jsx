import React from 'react';
import { createRoot } from 'react-dom/client';
import html2pdf from 'html2pdf.js';
import QRCode from 'react-qr-code';
import { useSettingsStore, DEFAULT_LMS_LOGO } from '../store';
import { AlertTriangle, Book, Calendar, CheckCircle, Clock, FileText, Target, Trophy, Video, XCircle, Zap, Activity, LayoutGrid } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
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
  if (p === 'weekly') { const f = new Date(today); f.setDate(f.getDate() - 7); return `${fmtDate(f)} – ${fmtDate(today)}`; }
  if (p === 'monthly') { const f = new Date(today); f.setDate(f.getDate() - 30); return `${fmtDate(f)} – ${fmtDate(today)}`; }
  return 'All time';
};

// ── PDF Generation Core ─────────────────────────────────────────────────────
async function generatePdf(element, filename) {
  const opt = {
    margin:       [10, 10, 15, 10],
    filename:     filename,
    image:        { type: 'jpeg', quality: 1.0 }, // Max quality
    html2canvas:  { scale: 2, useCORS: true, letterRendering: true, logging: false },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: ['css', 'legacy'] }
  };
  await html2pdf().set(opt).from(element).save();
}

function mountAndPrint(Component, props, filename) {
  const container = document.createElement('div');
  container.style.width = '794px';
  container.style.position = 'absolute';
  container.style.left = '0';
  container.style.top = '0';
  container.style.opacity = '0.01'; // Just enough to render, but practically invisible
  container.style.pointerEvents = 'none';
  container.style.zIndex = '-9999';
  
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(<Component {...props} />);
  
  setTimeout(async () => {
    try {
      await generatePdf(container, filename);
    } finally {
      root.unmount();
      document.body.removeChild(container);
    }
  }, 1000); 
}

// ── Ultra-Premium Pure CSS Components (100% Bug-Free in PDF) ───────────────

const Header = ({ title, subtitle, student, brand, rightStats }) => (
  <div className="relative overflow-hidden rounded-3xl bg-[#0f172a] p-8 text-white shadow-2xl page-break">
    <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
    <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
    
    <div className="relative z-10 flex items-start justify-between">
      <div className="flex gap-6">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-white/10 shadow-inner p-1 border border-white/5">
          {student?.avatar_url ? (
            <img src={student.avatar_url} alt="Profile" className="h-full w-full rounded-[14px] object-cover" crossOrigin="anonymous" />
          ) : (
            <span className="text-5xl font-extrabold text-white">
              {(student?.name || 'S').charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            {brand.logoUrl && <img src={brand.logoUrl} alt="Logo" className="h-5 w-5 rounded bg-white p-0.5" crossOrigin="anonymous" />}
            <span className="text-[10px] font-bold tracking-widest text-indigo-300 uppercase">{brand.name}</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white mb-2">{student?.name || 'Student'}</h1>
          <div className="flex flex-wrap gap-x-4 text-xs font-semibold text-gray-400">
            {student?.student_code && <span>{student.student_code}</span>}
            {student?.standard_name && <span>• {student.standard_name}</span>}
            {student?.username && <span>• @{student.username}</span>}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="rounded-full bg-indigo-500 px-4 py-1 text-xs font-bold text-white shadow-sm">
              {title}
            </div>
            <span className="text-xs font-medium text-gray-400">{subtitle}</span>
          </div>
        </div>
      </div>

      {rightStats && (
        <div className="flex flex-col items-end gap-3">
          {rightStats.map((stat, i) => (
            <div key={i} className="flex flex-col items-end">
              <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">{stat.label}</span>
              <span className="text-3xl font-black text-white">{stat.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

const Section = ({ title, icon: Icon, children }) => (
  <div className="mt-12 page-break">
    <div className="mb-6 flex items-center gap-3 border-b-2 border-gray-100 pb-3">
      <Icon className="h-5 w-5 text-gray-800" strokeWidth={3} />
      <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">{title}</h2>
    </div>
    {children}
  </div>
);

const KpiCard = ({ icon: Icon, label, value, color }) => (
  <div className="flex flex-col rounded-3xl border border-gray-100 bg-white p-6 shadow-sm page-break">
    <div className="mb-4 flex items-center gap-2">
      <div className={`rounded-lg p-2 ${color.bg}`}>
        <Icon className={`h-4 w-4 ${color.text}`} strokeWidth={3} />
      </div>
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
    </div>
    <span className="text-3xl font-black text-gray-900 tracking-tight">{value}</span>
  </div>
);

const PremiumProgressBar = ({ label, value, color }) => {
  const pct = Math.max(0, Math.min(100, value)) || 0;
  return (
    <div className="flex flex-col gap-2 page-break">
      <div className="flex justify-between items-end">
        <span className="text-sm font-bold text-gray-800">{label}</span>
        <span className="text-sm font-black text-gray-900">{Math.round(pct)}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100 shadow-inner">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

// Pure CSS Donut Chart (Zero bugs in PDF)
const CssDonutChart = ({ data, size = 180, centerText }) => {
  // data: [{ color: '#10b981', pct: 60 }, { color: '#ef4444', pct: 30 }, { color: '#9ca3af', pct: 10 }]
  let currentPct = 0;
  const gradientStops = data.map(d => {
    const start = currentPct;
    const end = currentPct + d.pct;
    currentPct = end;
    return `${d.color} ${start}% ${end}%`;
  }).join(', ');

  return (
    <div className="relative flex items-center justify-center rounded-full shadow-md" style={{ width: size, height: size, background: `conic-gradient(${gradientStops})` }}>
      <div className="absolute rounded-full bg-white flex items-center justify-center shadow-inner" style={{ width: size - 40, height: size - 40 }}>
        <span className="text-4xl font-black text-gray-900 tracking-tighter">{centerText}</span>
      </div>
    </div>
  );
};

// Pure CSS Bar Chart for Score Trend (Replacing Recharts AreaChart)
const CssBarChart = ({ data }) => {
  const max = 100;
  return (
    <div className="flex items-end h-48 gap-3 pt-4 w-full">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-2 h-full">
          <span className="text-[10px] font-black text-indigo-600">{d.score}%</span>
          <div className="w-full bg-indigo-50 rounded-t-lg overflow-hidden relative" style={{ height: `${Math.max(5, (d.score/max)*100)}%` }}>
             <div className="absolute bottom-0 w-full bg-indigo-500 h-full opacity-90" />
          </div>
          <span className="text-[9px] font-bold text-gray-400 truncate w-full text-center">{d.name}</span>
        </div>
      ))}
    </div>
  );
};

const CalendarHeatmap = ({ heatmapData }) => {
  if (!heatmapData || heatmapData.length === 0) return null;
  const sorted = [...heatmapData].sort((a,b) => new Date(a.date) - new Date(b.date)).slice(-84);
  const firstDate = new Date(sorted[0].date);
  const startDayOfWeek = firstDate.getDay(); 
  const paddedGrid = Array(startDayOfWeek).fill(null).concat(sorted);
  const columns = [];
  for (let i = 0; i < paddedGrid.length; i += 7) { columns.push(paddedGrid.slice(i, i + 7)); }
  const daysOfWeek = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <div className="flex flex-col gap-1 pr-3 pt-5">
          {daysOfWeek.map((d, i) => <div key={i} className="h-[18px] text-[10px] font-bold text-gray-400 flex items-center justify-end">{i % 2 === 1 ? d : ''}</div>)}
        </div>
        <div className="flex gap-1.5 overflow-hidden">
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-1.5">
              <div className="h-4 text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                {col[0] && new Date(col[0].date).getDate() <= 7 ? new Date(col[0].date).toLocaleString('default', { month: 'short' }) : ''}
              </div>
              {col.map((d, rowIdx) => {
                if (!d) return <div key={rowIdx} className="h-[18px] w-[18px] rounded-md bg-transparent" />;
                const bg = (d.present > 0) ? 'bg-emerald-500' : (d.late > 0) ? 'bg-amber-400' : (d.total > 0) ? 'bg-rose-500' : 'bg-gray-100';
                return <div key={rowIdx} className={`h-[18px] w-[18px] rounded-md ${bg} shadow-sm border border-black/5`} />;
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex gap-5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
        <span className="flex items-center gap-2"><div className="h-3.5 w-3.5 rounded-sm bg-gray-100 border border-black/5" /> No Class</span>
        <span className="flex items-center gap-2"><div className="h-3.5 w-3.5 rounded-sm bg-emerald-500 border border-black/5" /> Present</span>
        <span className="flex items-center gap-2"><div className="h-3.5 w-3.5 rounded-sm bg-amber-400 border border-black/5" /> Late</span>
        <span className="flex items-center gap-2"><div className="h-3.5 w-3.5 rounded-sm bg-rose-500 border border-black/5" /> Absent</span>
      </div>
    </div>
  );
};


// ── Report 1: Student Overall Report ──────────────────────────────────────────
const StudentReportTemplate = ({ data, period }) => {
  const s = data.student || {};
  const brand = getBranding();
  
  const avgForPeriod = period === 'overall' ? s.avg_score : (data.test_timeline?.length ? data.test_timeline.reduce((a, b) => a + (b.score_pct || 0), 0) / data.test_timeline.length : null);
  const grade = gradeFor(avgForPeriod ?? s.avg_score);
  
  const radar = data.subject_radar || [];
  const timeline = data.test_timeline || [];
  const topicMap = data.topic_map || [];
  const heatmap = data.attendance_heatmap || [];

  const chartData = [...timeline]
    .sort((a,b) => new Date(a.date) - new Date(b.date))
    .map(t => ({ name: t.test_title.substring(0, 15), score: Math.round(t.score_pct) }));

  return (
    <div className="pdf-container bg-white p-10 w-[794px] mx-auto text-gray-900">
      <Header 
        title={periodTitle(period)}
        subtitle={periodRange(period)}
        student={s}
        brand={brand}
        rightStats={[
          { label: 'Overall Grade', value: grade.grade },
          ...(data.rank ? [{ label: 'Class Rank', value: `${data.rank} / ${data.total_students}` }] : [])
        ]}
      />

      <div className="mt-10 grid grid-cols-4 gap-5">
        <KpiCard icon={Target} label="Avg Score" value={`${Math.round(avgForPeriod ?? s.avg_score ?? 0)}%`} color={{ bg: 'bg-indigo-50', text: 'text-indigo-600' }} />
        <KpiCard icon={Calendar} label="Attendance" value={`${Math.round(s.attendance_pct ?? 0)}%`} color={{ bg: 'bg-emerald-50', text: 'text-emerald-600' }} />
        <KpiCard icon={Trophy} label="Points" value={s.points ?? 0} color={{ bg: 'bg-amber-50', text: 'text-amber-600' }} />
        <KpiCard icon={Video} label="Tests Taken" value={timeline.length} color={{ bg: 'bg-rose-50', text: 'text-rose-600' }} />
      </div>

      {chartData.length >= 2 && (
        <Section title="Score Trend" icon={Activity}>
          <div className="w-full rounded-3xl border border-gray-100 bg-white p-8 shadow-sm">
            <CssBarChart data={chartData} />
          </div>
        </Section>
      )}

      {radar.length > 0 && (
        <Section title="Subject Mastery Profile" icon={Book}>
          <div className="grid grid-cols-2 gap-x-12 gap-y-10 rounded-3xl border border-gray-100 bg-gray-50/50 p-8 shadow-sm">
            {radar.map(r => (
              <PremiumProgressBar key={r.subject_id} label={r.subject} value={r.test_avg} color="bg-indigo-500" />
            ))}
          </div>
        </Section>
      )}

      {heatmap.length > 0 && (
        <Section title="Attendance Calendar" icon={Calendar}>
          <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm flex justify-center">
            <CalendarHeatmap heatmapData={heatmap} />
          </div>
        </Section>
      )}

      {topicMap.length > 0 && (
        <Section title="Strengths & Weaknesses" icon={Zap}>
          <div className="overflow-hidden rounded-3xl border border-gray-200 shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-5">Topic / Concept</th>
                  <th className="px-6 py-5">Subject</th>
                  <th className="px-6 py-5 text-center">Mastery</th>
                  <th className="px-6 py-5 text-center">Video Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...topicMap].sort((a,b) => (b.score_pct||0) - (a.score_pct||0)).map((t, i) => {
                  const mastery = t.score_pct || 0;
                  const mColor = mastery >= 75 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : mastery >= 50 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-rose-700 bg-rose-50 border-rose-200';
                  return (
                    <tr key={i} className="bg-white page-break">
                      <td className="px-6 py-5 font-bold text-gray-900 text-base">{t.topic || 'Concept'}</td>
                      <td className="px-6 py-5 text-sm font-semibold text-gray-500">{t.subject}</td>
                      <td className="px-6 py-5 text-center">
                        <span className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-black border ${mColor}`}>
                          {Math.round(mastery)}%
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        {t.video_completed 
                          ? <span className="inline-flex items-center text-xs font-bold text-emerald-600"><CheckCircle className="mr-2 h-4 w-4" /> Watched</span>
                          : <span className="inline-flex items-center text-xs font-bold text-gray-400"><XCircle className="mr-2 h-4 w-4" /> Unwatched</span>
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

      {/* Footer */}
      <div className="mt-16 border-t-2 border-gray-100 pt-8 pb-4 flex items-center justify-between page-break">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-black text-gray-900 tracking-tight">{brand.name} LMS</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Report generated securely on {fmtDate(new Date().toISOString())}</span>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right text-[9px] font-black text-gray-400 uppercase tracking-widest leading-relaxed">
            <p>Scan to Verify</p>
            <p>Authenticity</p>
          </div>
          <div className="p-2 bg-white border border-gray-200 rounded-xl shadow-sm">
            <QRCode value={`${brand.url}/verify/${s.id || 'student'}`} size={56} level="L" />
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Report 2: Exam Result Sheet ─────────────────────────────────────────────
const ExamResultTemplate = ({ reviewData, result, student, testMeta }) => {
  const brand = getBranding();
  const score_pct = result.percentage ?? (result.total_marks ? (result.score/result.total_marks)*100 : 0);
  const grade = gradeFor(score_pct);
  const qs = reviewData?.questions || [];
  const ans = reviewData?.answers || {};

  const skippedCount = (result.total || qs.length || 0) - (result.correct_count || 0) - (result.wrong_count || 0);

  // Pure CSS Donut Data Math
  const total = (result.correct_count||0) + (result.wrong_count||0) + (skippedCount||0);
  const donutData = total > 0 ? [
    { color: '#10b981', pct: ((result.correct_count||0)/total)*100 },
    { color: '#f43f5e', pct: ((result.wrong_count||0)/total)*100 },
    { color: '#e5e7eb', pct: (skippedCount/total)*100 }
  ] : [{ color: '#e5e7eb', pct: 100 }];

  return (
    <div className="pdf-container bg-white p-10 w-[794px] mx-auto text-gray-900">
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
        <div className="mt-10 flex items-start gap-5 rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-sm page-break">
          <AlertTriangle className="h-7 w-7 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-extrabold text-rose-900 text-lg">{result.cancelled ? 'Exam Terminated' : 'Integrity Alert'}</h3>
            <p className="mt-1 text-sm font-semibold text-rose-700">
              {result.cancelled 
                ? 'This exam was terminated due to a security violation. Score recorded as 0.' 
                : 'Suspicious activity was detected during this exam. Results flagged for review.'}
            </p>
          </div>
        </div>
      )}

      {/* Visual Analytics Row */}
      <div className="mt-10 grid grid-cols-2 gap-8 page-break">
        {/* Accuracy Donut Chart (Pure CSS) */}
        <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm flex flex-col items-center justify-center">
          <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-8 w-full text-left">Accuracy Breakdown</h3>
          <div className="flex w-full items-center justify-around">
            <CssDonutChart data={donutData} size={160} centerText={`${Math.round(score_pct)}%`} />
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3"><div className="h-4 w-4 rounded-full bg-emerald-500 shadow-sm"/><span className="text-sm font-bold w-16">Correct</span><span className="text-lg font-black">{result.correct_count || 0}</span></div>
              <div className="flex items-center gap-3"><div className="h-4 w-4 rounded-full bg-rose-500 shadow-sm"/><span className="text-sm font-bold w-16">Wrong</span><span className="text-lg font-black">{result.wrong_count || 0}</span></div>
              <div className="flex items-center gap-3"><div className="h-4 w-4 rounded-full bg-gray-200 shadow-sm"/><span className="text-sm font-bold w-16 text-gray-500">Skipped</span><span className="text-lg font-black text-gray-500">{skippedCount > 0 ? skippedCount : 0}</span></div>
            </div>
          </div>
        </div>

        {/* Bubble Sheet Matrix */}
        <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm flex flex-col">
          <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-gray-400" /> Answer Matrix
          </h3>
          <div className="flex flex-wrap gap-2 content-start h-full">
            {qs.map((q, i) => {
              const sAns = ans[String(q.id)];
              const answered = sAns !== undefined && sAns !== null;
              const isCorrect = answered && sAns === q.correct_idx;
              const isSkipped = !answered;
              const bg = isCorrect ? 'bg-emerald-500' : isSkipped ? 'bg-gray-200 text-gray-500' : 'bg-rose-500';
              return (
                <div key={i} className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-black text-white shadow-sm ${bg}`}>
                  {i + 1}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Section title="Detailed Question Review" icon={FileText}>
        <div className="overflow-hidden rounded-3xl border border-gray-200 shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200">
              <tr>
                <th className="w-16 px-6 py-5 text-center">#</th>
                <th className="px-6 py-5">Question</th>
                <th className="px-6 py-5">Your Answer</th>
                <th className="px-6 py-5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {qs.map((q, i) => {
                const sAns = ans[String(q.id)];
                const answered = sAns !== undefined && sAns !== null;
                const isCorrect = answered && sAns === q.correct_idx;
                const isSkipped = !answered;
                return (
                  <tr key={i} className={!isCorrect && !isSkipped ? 'bg-rose-50/40' : 'bg-white'} style={{ pageBreakInside: 'avoid' }}>
                    <td className="px-6 py-5 text-center text-gray-400 font-bold">{i + 1}</td>
                    <td className="px-6 py-5 font-semibold text-gray-900 line-clamp-3 leading-relaxed">{q.question}</td>
                    <td className="px-6 py-5 text-sm font-bold text-gray-600">
                      {isSkipped ? <span className="italic text-gray-400">Skipped</span> : q.options[sAns]}
                    </td>
                    <td className="px-6 py-5 text-center">
                      {isCorrect ? (
                        <span className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">Correct</span>
                      ) : isSkipped ? (
                        <span className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-black text-gray-600">Skipped</span>
                      ) : (
                        <span className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700">Wrong</span>
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
      <div className="mt-16 border-t-2 border-gray-100 pt-8 pb-4 flex items-center justify-between page-break">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-black text-gray-900 tracking-tight">{brand.name} LMS</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Result generated securely on {fmtDate(new Date().toISOString())}</span>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right text-[9px] font-black text-gray-400 uppercase tracking-widest leading-relaxed">
            <p>Scan to Verify</p>
            <p>Authenticity</p>
          </div>
          <div className="p-2 bg-white border border-gray-200 rounded-xl shadow-sm">
            <QRCode value={`${brand.url}/verify/exam/${result.id || 'exam'}`} size={56} level="L" />
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Exporters ───────────────────────────────────────────────────────────────
export function buildStudentReportPdf({ data, period = 'overall' }) {
  if (!data) return;
  const name = (data.student?.name || 'Student').replace(/\s+/g, '_');
  mountAndPrint(StudentReportTemplate, { data, period }, `${name}_Report.pdf`);
}

export function buildExamResultPdf({ reviewData, result, student, testMeta }) {
  if (!result) return;
  const name = (student?.name || 'Student').replace(/\s+/g, '_');
  mountAndPrint(ExamResultTemplate, { reviewData, result, student, testMeta }, `${name}_Exam_Result.pdf`);
}

export function buildClassAnalyticsPdf({ analytics, standardName }) {
  console.log("Class analytics PDF triggered");
}
