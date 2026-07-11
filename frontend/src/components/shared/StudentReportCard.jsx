import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, Bot, CalendarDays, Download, Loader2, RefreshCw, Share2, Sparkles, TrendingUp, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { aiApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import MentorReportView from './MentorReportView';

// --- Premium Graph Imports ---
import SubjectProgressionLineChart from './graphs/SubjectProgressionLineChart';
import GradientAreaTrendChart from './graphs/GradientAreaTrendChart';
import SubjectRadarChart from './graphs/SubjectRadarChart';
import DumbbellSubjectPlot from './graphs/DumbbellSubjectPlot';
import EngagementHeatmap from './graphs/EngagementHeatmap';
import LearningSignalBars from './graphs/LearningSignalBars';
import StudyRhythmTimeline from './graphs/StudyRhythmTimeline';
import LiquidFillGauge from './graphs/LiquidFillGauge';
import NeonProgressGauge from './graphs/NeonProgressGauge';
import QuizBubbleScatter from './graphs/QuizBubbleScatter';
import QuizRangeChart from './graphs/QuizRangeChart';
import AttendanceCalendar from './graphs/AttendanceCalendar';
import LeaderboardBumpChart from './graphs/LeaderboardBumpChart';
import AssignmentSpeedometer from './graphs/AssignmentSpeedometer';
import TestBellCurve from './graphs/TestBellCurve';
import TestQuadrantChart from './graphs/TestQuadrantChart';
import TopicPolarArea from './graphs/TopicPolarArea';
import ActivityStepper from './graphs/ActivityStepper';
import TimeAllocationDonut from './graphs/TimeAllocationDonut';

function useMidnightCountdown() {
  const [text, setText] = useState('');
  useEffect(() => {
    function tick() {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const ms = midnight - now;
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setText(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return text;
}

const AI_LOADING_STEPS = [
  'Reading your scores and attendance...',
  'Comparing you with the class...',
  'Spotting strengths and weak topics...',
  'Building your weekly study plan...',
  'Writing your mentor report...',
];

function AiLoadingState() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep(s => Math.min(s + 1, AI_LOADING_STEPS.length - 1)), 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="py-6">
      <div className="flex flex-col items-center gap-3 mb-8 text-center">
        <Loader2 size={30} className="animate-spin text-cyan-500" />
        <p className="font-extrabold text-sm text-slate-700" aria-live="polite">{AI_LOADING_STEPS[step]}</p>
        <p className="text-[11px] font-bold text-slate-400">Usually takes 10–20 seconds</p>
      </div>
      <div className="space-y-5" aria-hidden="true">
        {[0, 1, 2].map(i => (
          <div key={i} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-100 animate-pulse" />
              <div className="h-3 w-36 rounded-full bg-slate-100 animate-pulse" />
            </div>
            <div className="h-10 rounded-xl bg-slate-50 border border-slate-100 animate-pulse" />
            <div className="h-10 rounded-xl bg-slate-50 border border-slate-100 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

const cardTone = {
  blue: 'border-l-[#2563EB]',
  amber: 'border-l-[#D97706]',
  emerald: 'border-l-[#059669]',
  violet: 'border-l-[#7C3AED]',
  rose: 'border-l-[#E11D48]',
  cyan: 'border-l-[#0891B2]',
};

class ReportSectionBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Student report section failed:', error, info);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full min-h-[220px] rounded-card border border-dashed border-slate-200 bg-slate-50/80 flex items-center justify-center px-6 text-center text-sm font-bold text-slate-400">
          This report section is unavailable right now.
        </div>
      );
    }
    return this.props.children;
  }
}

const GlassCard = ({ title, subtitle, children, className = "", onClick = null, tone = "blue", tall = false }) => (
  <div 
    onClick={onClick}
    className={`bg-white border border-white/90 border-l-4 ${cardTone[tone] || cardTone.blue} rounded-card p-4 md:p-5 shadow-soft flex flex-col transition-all duration-200 w-full relative z-10 overflow-hidden ${tall ? 'min-h-[340px]' : 'min-h-[280px]'} ${className} ${onClick ? 'cursor-pointer hover:shadow-lift active:scale-[0.995]' : ''}`}
  >
    <div className="mb-3 md:mb-4 shrink-0 pointer-events-none">
      <h3 className="text-slate-950 font-extrabold text-base md:text-lg tracking-tight leading-snug">{title}</h3>
      {subtitle && <p className="text-xs font-semibold text-slate-500 mt-1 leading-snug max-w-[62ch]">{subtitle}</p>}
    </div>
    <div className="w-full flex-1 flex flex-col justify-center relative min-w-0 pointer-events-auto">
      <ReportSectionBoundary>{children}</ReportSectionBoundary>
    </div>
  </div>
);

const MetricTile = ({ icon: Icon, label, value, accent = "blue" }) => {
  const styles = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
  };
  return (
    <div className={`rounded-card p-4 ring-1 bg-white shadow-soft ${styles[accent] || styles.blue}`}>
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
        <Icon size={15} />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl md:text-3xl font-black text-slate-950 tabular-nums leading-none">{value}</div>
    </div>
  );
};

const SectionTitle = ({ eyebrow, title }) => (
  <div className="md:col-span-6 xl:col-span-12 mt-4 first:mt-0">
    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">{eyebrow}</p>
    <h2 className="mt-1 text-xl md:text-2xl font-black text-slate-950 tracking-tight">{title}</h2>
  </div>
);

function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const n = Number(target);
    if (!Number.isFinite(n) || n === 0) { setValue(0); return; }
    let current = 0;
    const step = n / (duration / 16);
    const timer = setInterval(() => {
      current += step;
      if (current >= n) { setValue(n); clearInterval(timer); }
      else setValue(Math.round(current));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

export default function StudentReportCard({ data, period, onPeriodChange, onDownloadPDF, showHeader = true, autoOpenAI = false }) {
  const [aiResult, setAiResult] = useState({ key: null, report: '', error: '', generatedAt: null });
  const [loadingAiKey, setLoadingAiKey] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [showAiModal, setShowAiModal] = useState(autoOpenAI);
  const aiRequestRef = useRef(0);
  const autoOpenTriggeredRef = useRef(false);
  const [tokens, setTokens] = useState(null); // { remaining, limit, unlimited }
  const { user } = useAuthStore();
  const isStudent = (user?.role ?? localStorage.getItem('tutoria_user_role')) === 'student';

  const {
    student = {},
    trendData = [],
    progressionData = [],
    radarData = [],
    polarData = [],
    scatterData = [],
    rangeData = [],
    heatmapData = [],
    learningSignalData = [],
    activityFlowData = [],
    attendanceDays = [],
    testDays = [],
    bumpData = [],
    assignmentData = [],
    bellData = [],
    quadrantData = [],
    activityData = [],
    donutData = [],
    streakData = {},
    badges = [],
    insightChips = [],
    classPercentile = null,
    classSize = 0,
    periodAvgScore = null,
    periodAttendancePct = null,
  } = data || {};
  const studentId = student?.id;
  const reportPeriod = period || 'overall';
  const aiKey = studentId ? `${studentId}:${reportPeriod}` : '';
  const aiReport = aiResult.key === aiKey ? aiResult.report : '';
  const aiError = aiResult.key === aiKey ? aiResult.error : '';
  const aiGeneratedAt = aiResult.key === aiKey ? aiResult.generatedAt : null;
  const loadingAi = loadingAiKey === aiKey;
  const isLimitError = !!aiError && aiError.toLowerCase().includes('daily limit');
  const midnightCountdown = useMidnightCountdown();

  const PERIODS = [
    { id: 'overall', label: 'Overall' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'weekly',  label: 'Weekly'  },
  ];
  const avgScore = Math.round(periodAvgScore ?? student.avg_score ?? 0);
  const attendancePct = Math.round(periodAttendancePct ?? student.attendance_pct ?? 0);
  const firstName = student.name ? student.name.split(' ')[0] : 'Student';
  const animatedScore = useCountUp(avgScore);
  const animatedAttendance = useCountUp(attendancePct);
  const animatedStreak = useCountUp(streakData?.current || 0);

  const handleShare = async () => {
    const text = `Udaya LMS Report for ${student.name || 'Student'} (${period}). Score: ${avgScore ?? 'N/A'}% | Attendance: ${attendancePct ?? 'N/A'}%`;
    if (navigator.share) {
      try { await navigator.share({ title: `${student.name || 'Student'} - Report Card`, text }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  const handleDownload = async () => {
    if (onDownloadPDF) { onDownloadPDF(data); return; }
    try {
      const { buildStudentReportPdf } = await import('../../lib/reportPdf');
      await buildStudentReportPdf({ data, period });
    } catch (e) { alert('Failed to generate PDF: ' + e.message); }
  };

  // Fresh generation — streams the report in live, section by section.
  // Falls back to the non-streaming endpoint if the stream fails before any
  // text arrives. Consumes one daily token (backend enforces the limit).
  const startGenerate = useCallback(async () => {
    if (!studentId) return;
    const requestId = aiRequestRef.current + 1;
    aiRequestRef.current = requestId;
    setLoadingAiKey(aiKey);
    setAiResult({ key: aiKey, report: '', error: '', generatedAt: null });

    let acc = '';
    const onChunk = (delta) => {
      if (aiRequestRef.current !== requestId) return;
      acc += delta;
      setLoadingAiKey(null);
      setStreaming(true);
      setAiResult({ key: aiKey, report: acc, error: '', generatedAt: null });
    };

    try {
      try {
        await aiApi.generateInsightsStream(studentId, { period: reportPeriod }, onChunk);
      } catch (streamErr) {
        const m = (streamErr?.message || '').toLowerCase();
        // Real rejections (limit reached, generation in flight) and partial
        // output are not retried — only a clean pre-stream failure falls back.
        if (acc || m.includes('daily limit') || m.includes('busy') || m.includes('already being generated')) {
          throw streamErr;
        }
        const res = await aiApi.generateStudentReport(data, reportPeriod);
        acc = res.report || '';
      }
      if (aiRequestRef.current !== requestId) return;
      setAiResult({
        key: aiKey,
        report: acc || 'Generated insights.',
        error: '',
        generatedAt: new Date().toISOString(),
      });
      // Decrement local token count after a successful call
      setTokens(prev => prev && !prev.unlimited
        ? { ...prev, remaining: Math.max(0, (prev.remaining ?? 1) - 1) }
        : prev
      );
    } catch (err) {
      if (aiRequestRef.current !== requestId) return;
      const msg = err?.message || 'Failed to generate insights.';
      if (acc) {
        // Stream broke mid-way — keep what we have rather than discarding it.
        setAiResult({ key: aiKey, report: acc, error: '', generatedAt: new Date().toISOString() });
      } else {
        setAiResult({ key: aiKey, report: '', error: msg, generatedAt: null });
        // If the backend rejected with the daily limit, zero out the counter
        if (msg.toLowerCase().includes('daily limit')) {
          setTokens(prev => prev
            ? { ...prev, remaining: 0 }
            : { remaining: 0, limit: 3, unlimited: false }
          );
        }
      }
    } finally {
      if (aiRequestRef.current === requestId) {
        setLoadingAiKey(null);
        setStreaming(false);
      }
    }
  }, [aiKey, data, reportPeriod, studentId]);

  const handleGenerateAI = useCallback(async () => {
    setShowAiModal(true);
    if (!studentId) {
      setAiResult({
        key: aiKey,
        report: '',
        error: 'Report data is still loading. Please try again in a moment.',
        generatedAt: null,
      });
      return;
    }
    if (loadingAi || aiReport) return;

    // Cache-first: reopening the mentor is instant and spends no daily token.
    // A fresh generation only happens on first-ever open or via Regenerate.
    setLoadingAiKey(aiKey);
    try {
      const cached = await aiApi.getCachedInsights(studentId, reportPeriod);
      if (cached?.insights) {
        setAiResult({ key: aiKey, report: cached.insights, error: '', generatedAt: cached.generated_at || null });
        setLoadingAiKey(null);
        return;
      }
    } catch {
      // cache miss / endpoint failure — fall through to a fresh generation
    }
    await startGenerate();
  }, [aiKey, aiReport, loadingAi, reportPeriod, startGenerate, studentId]);

  useEffect(() => {
    if (!autoOpenAI || !studentId || autoOpenTriggeredRef.current) return;
    autoOpenTriggeredRef.current = true;
    setShowAiModal(true);
    handleGenerateAI();
  }, [autoOpenAI, handleGenerateAI, studentId]);

  // Fetch remaining AI token count for students on mount
  useEffect(() => {
    if (!isStudent) return;
    aiApi.getTokens().then(t => setTokens(t)).catch(() => {});
  }, [isStudent]);

  return (
    <div className="w-full bg-canvas pb-24 text-slate-900 font-sans">
      
      {showHeader && (
        <div className="pt-6 md:pt-8 px-4 md:px-6 pb-5 flex flex-col md:flex-row justify-between md:items-center gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-950 tracking-tight leading-tight">Report Card</h1>
              <p className="text-sm text-slate-600 font-semibold mt-1 truncate">{student.name || 'Student'} {student.username ? `- ${student.username}` : ''}</p>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
            {onPeriodChange && PERIODS.map(p => (
              <button key={p.id} onClick={() => onPeriodChange(p.id)}
                className={`min-h-10 px-4 py-2 text-xs font-extrabold rounded-pill border transition-all whitespace-nowrap ${
                  period === p.id
                    ? 'bg-blue-700 text-white border-blue-700 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-200'
                }`}>
                {p.label}
              </button>
            ))}
            <button onClick={handleShare} aria-label="Share report" className="w-10 h-10 rounded-full bg-white text-slate-700 flex items-center justify-center shadow-sm border border-slate-200 hover:bg-blue-50 transition-colors flex-shrink-0"><Share2 size={17} /></button>
            <button onClick={handleDownload} aria-label="Download report PDF" className="w-10 h-10 rounded-full bg-white text-slate-700 flex items-center justify-center shadow-sm border border-slate-200 hover:bg-blue-50 transition-colors flex-shrink-0"><Download size={17} /></button>
          </div>
        </div>
      )}

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 md:px-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-4 md:gap-5 pb-24"
      >
        <div
          className={`md:col-span-6 xl:col-span-8 rounded-card bg-gradient-to-br from-[#14B8A6] via-[#22C7C9] to-[#635BFF] text-white p-5 md:p-6 shadow-soft min-h-[220px] flex flex-col justify-between ${isLimitError ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}
          onClick={isLimitError ? undefined : handleGenerateAI}
        >
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill bg-white/15 text-xs font-bold mb-5">
              <Sparkles size={15} />
              AI Mentor
              {isStudent && tokens && !tokens.unlimited && (
                <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-black ${tokens.remaining === 0 ? 'bg-red-400/90 text-white' : 'bg-white/30 text-white'}`}>
                  {tokens.remaining}/{tokens.limit} left today
                </span>
              )}
            </div>
            <h2 className="text-2xl md:text-4xl font-black leading-tight tracking-tight">
              {loadingAi
                ? 'Generating insights...'
                : aiReport
                  ? 'Open mentor report'
                  : isLimitError
                    ? 'Daily limit reached'
                    : aiError
                      ? 'Something went wrong'
                      : `Learning snapshot for ${firstName}`}
            </h2>
            <p className="mt-3 max-w-2xl text-sm md:text-base text-blue-50 leading-relaxed">
              {isLimitError
                ? `You've used all ${tokens?.limit ?? 3} AI insights for today. Resets in ${midnightCountdown}.`
                : aiError
                  ? aiError
                  : `Scores, attendance, activity, and subject progress are combined into one focused report.`}
            </p>
          </div>
          <button
            disabled={isLimitError}
            className={`mt-5 self-start inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-sm font-black ${isLimitError ? 'text-gray-400 cursor-not-allowed' : 'text-blue-700'}`}
          >
            <Bot size={16} />
            {aiReport ? 'View AI report' : isLimitError ? 'Try again tomorrow' : 'Generate AI report'}
          </button>
        </div>

        <div className="md:col-span-6 xl:col-span-4 grid grid-cols-2 gap-3 md:gap-4">
          <MetricTile icon={TrendingUp} label="Avg Score" value={`${animatedScore}%`} accent={avgScore === 0 ? 'blue' : avgScore >= 80 ? 'emerald' : avgScore >= 40 ? 'amber' : 'rose'} />
          <MetricTile icon={CalendarDays} label="Attendance" value={`${animatedAttendance}%`} accent={attendancePct === 0 ? 'blue' : attendancePct >= 90 ? 'emerald' : attendancePct >= 75 ? 'amber' : 'rose'} />
          <MetricTile icon={Award} label={`Rank · ${PERIODS.find(p => p.id === reportPeriod)?.label || 'Overall'}`} value={data?.rank ? `#${data.rank}` : '--'} accent="amber" />
          <div className="rounded-card p-4 ring-1 bg-gradient-to-br from-orange-50 to-amber-50 ring-orange-100 shadow-soft">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-orange-400">
              <span>🔥</span> Streak
            </div>
            <div className="mt-2 text-2xl md:text-3xl font-black text-slate-950 tabular-nums leading-none">
              {animatedStreak}
              <span className="text-sm font-bold text-orange-300 ml-1">days</span>
            </div>
            {(streakData?.best || 0) > 0 && (
              <div className="text-[11px] font-bold text-slate-400 mt-1">Best {streakData.best}d</div>
            )}
          </div>
        </div>

        {badges.length > 0 && (
          <div className="md:col-span-6 xl:col-span-12 flex gap-2 flex-wrap">
            {badges.map((b, i) => (
              <div key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-100 shadow-soft text-sm font-bold text-slate-700">
                <span>{b.emoji}</span> {b.label}
              </div>
            ))}
          </div>
        )}

        {insightChips.length > 0 && (
          <div className="md:col-span-6 xl:col-span-12 grid grid-cols-2 md:grid-cols-4 gap-3">
            {insightChips.map((chip, i) => (
              <div key={i} className="rounded-card p-4 bg-white border border-slate-100 shadow-soft flex flex-col gap-1.5">
                <span className="text-xl">{chip.emoji}</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{chip.title}</span>
                <span className="text-sm font-extrabold text-slate-800 leading-snug">{chip.desc}</span>
              </div>
            ))}
          </div>
        )}

        <SectionTitle eyebrow="Performance" title="Scores, subjects, and class benchmark" />

        <GlassCard className="md:col-span-6 xl:col-span-8" title="Overall Trend" subtitle="Student score compared with class average" tone="blue" tall>
          <GradientAreaTrendChart data={trendData} classAverageLine={true} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-4" title="Subject Strengths" subtitle="Performance profile across subjects" tone="violet" tall>
          <SubjectRadarChart data={radarData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-7" title="Subject Progression" subtitle="How scores moved across recent tests" tone="cyan" tall>
          <SubjectProgressionLineChart data={progressionData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-5" title="Subject Gap Analysis" subtitle="Student level compared with class benchmark" tone="violet" tall>
          <DumbbellSubjectPlot data={radarData} />
        </GlassCard>

        <SectionTitle eyebrow="Consistency" title="Attendance, calendar, and learning activity" />

        <GlassCard className="md:col-span-6 xl:col-span-7" title="Learning Calendar" subtitle="One calendar only: attendance and test days for the current month" tone="emerald" tall>
          <AttendanceCalendar month={new Date()} daysData={attendanceDays} testDaysData={testDays} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-5" title="Learning Engagement" subtitle="Daily activity intensity across the last four weeks" tone="emerald" tall>
          <EngagementHeatmap data={heatmapData} />
        </GlassCard>
        <GlassCard className="md:col-span-3 xl:col-span-3" title="Attendance" subtitle="Present days and consistency" tone="emerald">
          <div className="flex-1 flex items-center justify-center py-4">
            <LiquidFillGauge percentage={attendancePct} size={150} />
          </div>
        </GlassCard>
        <GlassCard className="md:col-span-3 xl:col-span-3" title="Score Health" subtitle="Current academic average" tone="amber">
          <div className="flex-1 flex items-center justify-center py-4">
            <NeonProgressGauge percentage={avgScore} label="Average" color="#D97706" />
          </div>
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-6" title="Recent Activity" subtitle="Latest learning events" tone="blue">
          <ActivityStepper data={activityData} />
        </GlassCard>

        <SectionTitle eyebrow="Assessments" title="Test behavior and class position" />

        {classPercentile !== null && classSize > 1 && (
          <div className="md:col-span-6 xl:col-span-12 rounded-card p-4 md:p-5 bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-100 shadow-soft flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-violet-500">Class percentile</p>
              <p className="text-base md:text-lg font-black text-slate-900 mt-1 leading-snug">
                You scored higher than <span className="text-violet-600">{classPercentile}%</span> of your class
                {classSize > 0 && <span className="text-slate-400 font-bold text-sm ml-1">({classSize} student{classSize === 1 ? '' : 's'})</span>}
              </p>
            </div>
            <div className="text-4xl md:text-5xl font-black text-violet-600 tabular-nums flex-shrink-0">
              {classPercentile}<span className="text-2xl">%</span>
            </div>
          </div>
        )}

        <GlassCard className="md:col-span-6 xl:col-span-6" title="Class Range" subtitle="Student score position inside class spread" tone="blue">
          <QuizRangeChart data={rangeData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-6" title="Test Strategy" subtitle="Time spent versus accuracy" tone="rose">
          <TestQuadrantChart data={quadrantData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-4" title="Quiz Speed" subtitle="Score and time pattern by attempt" tone="cyan">
          <QuizBubbleScatter data={scatterData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-4" title="Class Distribution" subtitle="Score distribution with student marker" tone="amber">
          <TestBellCurve data={bellData} studentScore={avgScore || 75} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-4" title="Rank Progression" subtitle="Movement on the leaderboard" tone="amber">
          <LeaderboardBumpChart data={bumpData} />
        </GlassCard>

        <SectionTitle eyebrow="Learning Signals" title="Engagement balance, topics, and work completion" />

        <GlassCard className="md:col-span-6 xl:col-span-8" title="Engagement Balance" subtitle="Completion and participation by evidence type" tone="cyan" tall>
          <LearningSignalBars data={learningSignalData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-4" title="Activity Mix" subtitle="How you spent your learning time across all activity types" tone="blue" tall>
          <TimeAllocationDonut data={donutData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-4" title="Topic Mastery" subtitle="Strong and weak learning areas" tone="amber" tall>
          <TopicPolarArea data={polarData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-4" title="Assignments" subtitle="Submitted, pending, and overdue work" tone="violet" tall>
          <AssignmentSpeedometer data={assignmentData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-4" title="Study Rhythm" subtitle="Daily activity score with raw video, test, and assignment counts" tone="emerald" tall>
          <StudyRhythmTimeline data={activityFlowData} />
        </GlassCard>

      </motion.div>

      {/* AI Modal */}
      <AnimatePresence>
        {showAiModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center sm:p-4"
            onClick={() => setShowAiModal(false)}
          >
            <motion.div
              initial={{ y: 60, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 60, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              onClick={e => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-label="AI Mentor Report"
              className="bg-white rounded-t-[28px] sm:rounded-[28px] w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[92dvh] sm:max-h-[85vh] overflow-hidden"
            >
              {/* Branded header */}
              <div className="flex-shrink-0 bg-gradient-to-r from-[#14B8A6] via-[#22C7C9] to-[#635BFF] px-5 md:px-7 pt-5 pb-4 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Bot size={22} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg md:text-xl font-black tracking-tight leading-tight">AI Mentor Report</h2>
                      <p className="text-[11px] font-bold text-white/80 uppercase tracking-widest mt-0.5 truncate">
                        {student.name ? student.name.split(' ')[0] : 'Student'} · {PERIODS.find(p => p.id === reportPeriod)?.label || 'Overall'}
                        {aiGeneratedAt && !streaming && !loadingAi && (
                          <span className="normal-case tracking-normal"> · updated {formatDistanceToNow(new Date(aiGeneratedAt), { addSuffix: true })}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAiModal(false)}
                    aria-label="Close AI Mentor report"
                    className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-5 md:px-7 py-5">
                {loadingAi ? (
                  <AiLoadingState />
                ) : isLimitError ? (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
                    <span className="text-4xl">⏳</span>
                    <p className="font-black text-base text-amber-900">Daily limit reached</p>
                    <p className="text-sm text-amber-700 leading-relaxed">
                      You've used all <strong>{tokens?.limit ?? 3}</strong> AI insights for today.
                    </p>
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 border border-amber-200 text-amber-800 text-xs font-black">
                      <span>⏱</span> Resets in <span className="tabular-nums">{midnightCountdown}</span>
                    </div>
                  </div>
                ) : aiError ? (
                  <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-700">
                    <p className="font-bold text-sm">Could not generate insights.</p>
                    <p className="text-sm">{aiError}</p>
                    <button onClick={handleGenerateAI} className="mt-1 px-4 py-2 bg-white hover:bg-red-100 text-red-700 font-black rounded-xl transition-colors text-xs uppercase tracking-widest border border-red-200">
                      Try Again
                    </button>
                  </div>
                ) : (
                  <MentorReportView report={aiReport} streaming={streaming} />
                )}
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 px-5 md:px-7 py-4 border-t border-slate-100 bg-white">
                <div className="flex gap-2.5">
                  {aiReport && !loadingAi && (
                    <button
                      onClick={startGenerate}
                      disabled={streaming || (isStudent && tokens && !tokens.unlimited && tokens.remaining === 0)}
                      className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-3.5 rounded-2xl border border-slate-200 bg-white text-slate-700 font-black text-sm transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99]"
                    >
                      <RefreshCw size={15} className={streaming ? 'animate-spin' : ''} />
                      Regenerate
                    </button>
                  )}
                  <button onClick={() => setShowAiModal(false)} className="flex-1 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-2xl transition-colors text-sm active:scale-[0.99]">
                    Close Report
                  </button>
                </div>
                {aiReport && !loadingAi && isStudent && tokens && !tokens.unlimited && (
                  <p className="mt-2 text-center text-[10px] font-bold text-slate-400">
                    Regenerate uses 1 AI credit · {tokens.remaining} of {tokens.limit} left today
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

export const shareReportText = (data, period) => {
  return "Student Report: View the detailed dashboard for insights.";
};
