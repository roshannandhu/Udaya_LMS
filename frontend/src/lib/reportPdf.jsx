import React from 'react';
import { createRoot } from 'react-dom/client';
import html2pdf from 'html2pdf.js';
import { useSettingsStore, DEFAULT_LMS_LOGO } from '../store';
import { AlertTriangle, Award, Book, Calendar, CheckCircle, Clock, FileText, Target, Trophy, Video, XCircle, Zap } from 'lucide-react';

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
    margin:       10,
    filename:     filename,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: ['css', 'legacy'] }
  };
  await html2pdf().set(opt).from(element).save();
}

function mountAndPrint(Component, props, filename) {
  const container = document.createElement('div');
  // Fixed width for A4 (approx 794px at 96dpi) to ensure perfect rendering
  container.style.width = '794px';
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  document.body.appendChild(container);

  const root = createRoot(container);
  
  // Render and wait for images
  root.render(<Component {...props} />);
  
  setTimeout(async () => {
    try {
      await generatePdf(container, filename);
    } finally {
      root.unmount();
      document.body.removeChild(container);
    }
  }, 1500); // 1.5s delay to let fonts and images load
}


// ── Shared UI Components ────────────────────────────────────────────────────
const Header = ({ title, subtitle, student, brand, rightStats }) => (
  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 p-8 text-white shadow-xl">
    {/* Decorative blur circles */}
    <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
    <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-indigo-400/20 blur-3xl" />
    
    <div className="relative z-10 flex items-start justify-between">
      <div className="flex gap-6">
        {/* Photo / Initial */}
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
          {/* Brand Row */}
          <div className="mb-3 flex items-center gap-2">
            {brand.logoUrl && <img src={brand.logoUrl} alt="Logo" className="h-6 w-6 rounded bg-white p-0.5" crossOrigin="anonymous" />}
            <span className="text-xs font-semibold tracking-wider text-indigo-100 uppercase">{brand.name}</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-white">{student?.name || 'Student'}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-indigo-100/90">
            {student?.student_code && <span>{student.student_code}</span>}
            {student?.standard_name && <span>• {student.standard_name}</span>}
            {student?.username && <span>• @{student.username}</span>}
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
  <div className="flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow">
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
    <div className="flex items-center gap-4">
      <span className="w-32 text-sm font-semibold text-gray-700 truncate">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full ${color.fill} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-sm font-bold text-gray-900">{valueText || `${Math.round(pct)}%`}</span>
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

  return (
    <div className="bg-white p-8 font-sans text-gray-900">
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

      {radar.length > 0 && (
        <Section title="Subject Performance" icon={Book} color={{ bg: 'bg-violet-100', text: 'text-violet-600' }}>
          <div className="grid grid-cols-2 gap-x-12 gap-y-6">
            {radar.map(r => (
              <ProgressBar key={r.subject_id} label={r.subject} value={r.test_avg} color={{ fill: 'bg-violet-500' }} />
            ))}
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
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
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

      {heatmap.length > 0 && (
        <Section title="Attendance Overview" icon={Calendar} color={{ bg: 'bg-teal-100', text: 'text-teal-600' }}>
          <div className="flex gap-2 flex-wrap">
            {heatmap.slice(-30).map((d, i) => {
              const bg = (d.present > 0) ? 'bg-emerald-500' : (d.late > 0) ? 'bg-amber-500' : (d.total > 0) ? 'bg-red-500' : 'bg-gray-200';
              return (
                <div key={i} className={`h-8 w-8 rounded-md ${bg} flex items-center justify-center text-[9px] text-white font-bold shadow-sm`}>
                  {new Date(d.date).getDate()}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex gap-4 text-xs font-medium text-gray-500">
            <span className="flex items-center gap-1"><div className="h-3 w-3 rounded bg-emerald-500" /> Present</span>
            <span className="flex items-center gap-1"><div className="h-3 w-3 rounded bg-amber-500" /> Late</span>
            <span className="flex items-center gap-1"><div className="h-3 w-3 rounded bg-red-500" /> Absent</span>
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
                  <tr key={i} className="bg-white">
                    <td className="px-4 py-3 text-gray-500">{fmtDate(t.date)}</td>
                    <td className="px-4 py-3 font-medium">{t.test_title}</td>
                    <td className="px-4 py-3 text-center font-bold text-gray-900">{Math.round(t.score_pct)}%</td>
                    <td className="px-4 py-3 text-center text-gray-500">{t.rank ? `${t.rank}/${t.total_attempts}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Footer */}
      <div className="mt-12 border-t border-gray-100 pt-6 text-center text-xs text-gray-400 font-medium tracking-wide">
        Report generated on {fmtDate(new Date().toISOString())} · {brand.name} LMS
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

  return (
    <div className="bg-white p-8 font-sans text-gray-900">
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

      <div className="mt-8 grid grid-cols-4 gap-4">
        <KpiCard icon={CheckCircle} label="Correct" value={result.correct_count || 0} color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }} />
        <KpiCard icon={XCircle} label="Wrong" value={result.wrong_count || 0} color={{ bg: 'bg-rose-100', text: 'text-rose-600' }} />
        <KpiCard icon={Clock} label="Questions" value={result.total || qs.length || 0} color={{ bg: 'bg-blue-100', text: 'text-blue-600' }} />
        <KpiCard icon={Trophy} label="Points" value={result.points_earned || 0} color={{ bg: 'bg-amber-100', text: 'text-amber-600' }} />
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
                  <tr key={i} className={!isCorrect && !isSkipped ? 'bg-red-50/50' : 'bg-white'}>
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
      <div className="mt-12 border-t border-gray-100 pt-6 text-center text-xs text-gray-400 font-medium tracking-wide">
        Result generated on {fmtDate(new Date().toISOString())} · {brand.name} LMS
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
  // Can be fully implemented using similar Tailwind structure. For now, graceful fallback or basic template.
  console.log("Class analytics PDF triggered");
}
