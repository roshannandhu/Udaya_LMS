import React from 'react';
import { createRoot } from 'react-dom/client';
import html2pdf from 'html2pdf.js';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import QRCode from 'react-qr-code';
import { useSettingsStore, DEFAULT_LMS_LOGO } from '../store';
import { AlertTriangle, Book, Calendar, CheckCircle, Clock, FileText, Target, Trophy, Video, XCircle, Zap, Activity, PieChart as PieIcon, LayoutGrid } from 'lucide-react';

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

async function waitForAssets(container) {
  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => {});
  }

  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(images.map(async (img) => {
    if (img.complete && img.naturalWidth > 0) return;
    if (img.decode) {
      await img.decode().catch(() => {});
      return;
    }
    await new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
    });
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
    await new Promise(resolve => setTimeout(resolve, 250));
    await generatePdf(container, filename);
  } finally {
    root.unmount();
    document.body.removeChild(host);
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

const Section = ({ title, icon: Icon, color, children, className = '' }) => (
  <div className={`mt-10 ${className}`} style={{ pageBreakInside: 'avoid' }}>
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
  
  const avgForPeriod = period === 'overall' ? s.avg_score : (data.test_timeline?.length ? data.test_timeline.reduce((a, b) => a + (b.score_pct || 0), 0) / data.test_timeline.length : null);
  const grade = gradeFor(avgForPeriod ?? s.avg_score);
  
  const radar = data.subject_radar || [];
  const timeline = data.test_timeline || [];
  const topicMap = data.topic_map || [];
  const heatmap = data.attendance_heatmap || [];

  // Prepare chart data
  const chartData = [...timeline]
    .sort((a,b) => new Date(a.date) - new Date(b.date))
    .map(t => ({ name: t.test_title.substring(0, 10), score: Math.round(t.score_pct) }));

  return (
    <div className="bg-white p-8 font-sans text-gray-900 mx-auto w-[794px]">
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

      <div className="mt-8 grid grid-cols-4 gap-4">
        <KpiCard icon={Target} label="Avg Score" value={`${Math.round(avgForPeriod ?? s.avg_score ?? 0)}%`} color={{ bg: 'bg-indigo-100', text: 'text-indigo-600' }} />
        <KpiCard icon={Calendar} label="Attendance" value={`${Math.round(s.attendance_pct ?? 0)}%`} color={{ bg: 'bg-teal-100', text: 'text-teal-600' }} />
        <KpiCard icon={Trophy} label="Points" value={s.points ?? 0} color={{ bg: 'bg-amber-100', text: 'text-amber-600' }} />
        <KpiCard icon={Video} label="Tests Taken" value={timeline.length} color={{ bg: 'bg-rose-100', text: 'text-rose-600' }} />
      </div>

      {chartData.length >= 2 && (
        <Section title="Score Trend" icon={Activity} color={{ bg: 'bg-blue-100', text: 'text-blue-600' }}>
          <div className="h-56 w-full rounded-xl border border-gray-100 bg-gray-50/50 p-4 pt-6">
            <AreaChart width={710} height={180} data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} domain={[0, 100]} />
              <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" isAnimationActive={false} />
            </AreaChart>
          </div>
        </Section>
      )}

      {heatmap.length > 0 && (
        <Section title="Attendance Calendar" icon={Calendar} color={{ bg: 'bg-teal-100', text: 'text-teal-600' }}>
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm flex justify-center">
            <CalendarHeatmap heatmapData={heatmap} />
          </div>
        </Section>
      )}

      {radar.length > 0 && (
        <Section title="Subject Mastery Profile" icon={Book} color={{ bg: 'bg-violet-100', text: 'text-violet-600' }}>
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
              {radar.map(r => (
                <ProgressBar key={r.subject_id} label={r.subject} value={r.test_avg} color={{ fill: 'bg-violet-500' }} />
              ))}
            </div>
          </div>
        </Section>
      )}

      {topicMap.length > 0 && (
        <Section title="Strengths & Weaknesses (Topic Mastery)" icon={Zap} color={{ bg: 'bg-fuchsia-100', text: 'text-fuchsia-600' }}>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Topic / Concept</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3 text-center">Mastery</th>
                  <th className="px-4 py-3 text-center">Video Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...topicMap].sort((a,b) => (b.score_pct||0) - (a.score_pct||0)).map((t, i) => {
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
        <Section title="Exam History" icon={FileText} color={{ bg: 'bg-amber-100', text: 'text-amber-600' }}>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Exam Name</th>
                  <th className="px-4 py-3 text-center">Score</th>
                  <th className="px-4 py-3 text-center">Rank</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...timeline].sort((a,b) => new Date(b.date) - new Date(a.date)).map((t, i) => (
                  <tr key={i} className="bg-white" style={{ pageBreakInside: 'avoid' }}>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(t.date)}</td>
                    <td className="px-4 py-3 font-medium">{t.test_title}</td>
                    <td className="px-4 py-3 text-center font-bold text-gray-900">{Math.round(t.score_pct)}%</td>
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
    <div className="bg-white p-8 font-sans text-gray-900 mx-auto w-[794px]">
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

// Exporters
export function buildStudentReportPdf({ data, period = 'overall' }) {
  if (!data) return;
  const name = (data.student?.name || 'Student').replace(/\s+/g, '_');
  return mountAndPrint(StudentReportTemplate, { data, period }, `${name}_Report.pdf`);
}

export function buildExamResultPdf({ reviewData, result, student, testMeta }) {
  if (!result) return;
  const name = (student?.name || 'Student').replace(/\s+/g, '_');
  return mountAndPrint(ExamResultTemplate, { reviewData, result, student, testMeta }, `${name}_Exam_Result.pdf`);
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
    <div className="bg-white p-8 font-sans text-gray-900 mx-auto w-[794px]">
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
