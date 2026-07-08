import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, Bot, CalendarDays, Download, Loader2, Share2, Sparkles, TrendingUp } from 'lucide-react';
import { aiApi } from '../../lib/api';

// --- Premium Graph Imports ---
import SubjectProgressionLineChart from './graphs/SubjectProgressionLineChart';
import GradientAreaTrendChart from './graphs/GradientAreaTrendChart';
import SubjectRadarChart from './graphs/SubjectRadarChart';
import DumbbellSubjectPlot from './graphs/DumbbellSubjectPlot';
import EngagementHeatmap from './graphs/EngagementHeatmap';
import OverlappingAreaChart from './graphs/OverlappingAreaChart';
import TimeAllocationDonut from './graphs/TimeAllocationDonut';
import LearningTreemap from './graphs/LearningTreemap';
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

const cardTone = {
  blue: 'border-t-[#2563EB]',
  amber: 'border-t-[#D97706]',
  emerald: 'border-t-[#059669]',
  violet: 'border-t-[#7C3AED]',
  rose: 'border-t-[#E11D48]',
  cyan: 'border-t-[#0891B2]',
};

const GlassCard = ({ title, subtitle, children, className = "", onClick = null, tone = "blue", tall = false }) => (
  <div 
    onClick={onClick}
    className={`bg-white border border-slate-200/80 border-t-4 ${cardTone[tone] || cardTone.blue} rounded-3xl p-5 md:p-6 shadow-[0_18px_45px_rgba(15,23,42,0.07)] flex flex-col transition-all duration-300 w-full relative z-10 overflow-hidden ${tall ? 'min-h-[360px]' : 'min-h-[300px]'} ${className} ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_22px_55px_rgba(15,23,42,0.12)] active:scale-[0.99]' : ''}`}
  >
    <div className="mb-4 md:mb-5 shrink-0 pointer-events-none">
      <h3 className="text-slate-950 font-extrabold text-lg md:text-xl tracking-tight leading-snug">{title}</h3>
      {subtitle && <p className="text-xs font-semibold text-slate-500 mt-1 leading-snug">{subtitle}</p>}
    </div>
    <div className="w-full flex-1 flex flex-col justify-center relative min-w-0 pointer-events-auto">
      {children}
    </div>
  </div>
);

const MetricTile = ({ icon: Icon, label, value, accent = "blue" }) => {
  const styles = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  };
  return (
    <div className={`rounded-2xl p-4 ring-1 ${styles[accent] || styles.blue}`}>
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
        <Icon size={15} />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl md:text-3xl font-black text-slate-950 tabular-nums leading-none">{value}</div>
    </div>
  );
};

export default function StudentReportCard({ data, period, onPeriodChange, onDownloadPDF, showHeader = true, autoOpenAI = false }) {
  const [aiResult, setAiResult] = useState({ key: null, report: '', error: '' });
  const [loadingAiKey, setLoadingAiKey] = useState(null);
  const [showAiModal, setShowAiModal] = useState(autoOpenAI);
  const aiRequestRef = useRef(0);
  const autoOpenTriggeredRef = useRef(false);

  const { 
    student = {}, 
    trendData = [], 
    progressionData = [],
    radarData = [], 
    polarData = [], 
    scatterData = [], 
    rangeData = [], 
    heatmapData = [], 
    overlapData = [], 
    donutData = [], 
    treemapData = [], 
    attendanceDays = [], 
    testDays = [], 
    bumpData = [], 
    assignmentData = [], 
    bellData = [], 
    quadrantData = [],
    activityData = [] 
  } = data || {};
  const studentId = student?.id;
  const reportPeriod = period || 'overall';
  const aiKey = studentId ? `${studentId}:${reportPeriod}` : '';
  const aiReport = aiResult.key === aiKey ? aiResult.report : '';
  const aiError = aiResult.key === aiKey ? aiResult.error : '';
  const loadingAi = loadingAiKey === aiKey;

  const PERIODS = [
    { id: 'overall', label: 'Overall' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'weekly',  label: 'Weekly'  },
  ];
  const avgScore = Math.round(student.avg_score || 0);
  const attendancePct = Math.round(student.attendance_pct || 0);
  const firstName = student.name ? student.name.split(' ')[0] : 'Student';

  const handleShare = async () => {
    const text = `Udaya LMS Report for ${student.name || 'Student'} (${period}). Score: ${student.avg_score ?? 'N/A'}% | Attendance: ${student.attendance_pct ?? 'N/A'}%`;
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
    } catch (e) { alert('Failed to generate PDF.'); }
  };

  const handleGenerateAI = useCallback(async () => {
    setShowAiModal(true);
    if (!studentId) {
      setAiResult({
        key: aiKey,
        report: '',
        error: 'Report data is still loading. Please try again in a moment.',
      });
      return;
    }
    if (loadingAi || aiReport) return;

    const requestId = aiRequestRef.current + 1;
    aiRequestRef.current = requestId;
    setLoadingAiKey(aiKey);
    setAiResult({ key: aiKey, report: '', error: '' });

    try {
      const res = await aiApi.generateStudentReport(data, reportPeriod);
      if (aiRequestRef.current !== requestId) return;
      setAiResult({
        key: aiKey,
        report: res.report || 'Generated insights.',
        error: '',
      });
    } catch (err) {
      if (aiRequestRef.current !== requestId) return;
      setAiResult({
        key: aiKey,
        report: '',
        error: err?.message || 'Failed to generate insights.',
      });
    } finally {
      if (aiRequestRef.current === requestId) {
        setLoadingAiKey(null);
      }
    }
  }, [aiKey, aiReport, data, loadingAi, reportPeriod, studentId]);

  useEffect(() => {
    if (!autoOpenAI || !studentId || autoOpenTriggeredRef.current) return;
    autoOpenTriggeredRef.current = true;
    setShowAiModal(true);
    handleGenerateAI();
  }, [autoOpenAI, handleGenerateAI, studentId]);

  return (
    <div className="w-full bg-[radial-gradient(circle_at_top_left,#DBEAFE_0,#F8FAFC_32%,#F1F5F9_100%)] pb-24 text-slate-900 font-sans">
      
      {showHeader && (
        <div className="pt-6 md:pt-8 px-4 md:px-6 pb-6 flex flex-col md:flex-row justify-between md:items-center gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            <div>
              <h1 className="text-2xl md:text-4xl font-black text-slate-950 tracking-tight leading-tight">Report Card</h1>
              <p className="text-sm text-slate-600 font-semibold mt-1 truncate">{student.name || 'Student'} {student.username ? `- ${student.username}` : ''}</p>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
            {onPeriodChange && PERIODS.map(p => (
              <button key={p.id} onClick={() => onPeriodChange(p.id)}
                className={`min-h-11 px-4 py-2 text-xs font-extrabold rounded-full border transition-all whitespace-nowrap ${
                  period === p.id
                    ? 'bg-blue-700 text-white border-blue-700 shadow-lg shadow-blue-700/20'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-200'
                }`}>
                {p.label}
              </button>
            ))}
            <button onClick={handleShare} aria-label="Share report" className="w-11 h-11 rounded-full bg-white text-slate-700 flex items-center justify-center shadow-sm border border-slate-200 hover:bg-blue-50 transition-colors flex-shrink-0"><Share2 size={17} /></button>
            <button onClick={handleDownload} aria-label="Download report PDF" className="w-11 h-11 rounded-full bg-white text-slate-700 flex items-center justify-center shadow-sm border border-slate-200 hover:bg-blue-50 transition-colors flex-shrink-0"><Download size={17} /></button>
          </div>
        </div>
      )}

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 md:px-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-5 md:gap-6 pb-24"
      >
        
        <GlassCard
          className="md:col-span-6 xl:col-span-12 min-h-[unset] bg-white"
          title={`Learning Snapshot for ${firstName}`}
          subtitle="Key outcomes, strengths, and AI mentorship in one view"
          tone="blue"
          onClick={handleGenerateAI}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.9fr] gap-5 items-stretch">
            <div className="rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 text-white p-5 md:p-6 overflow-hidden relative">
              <div className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-white/15" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 text-xs font-bold mb-5">
                  <Sparkles size={15} />
                  AI Mentor Ready
                </div>
                <h2 className="text-3xl md:text-4xl font-black leading-tight tracking-tight">
                  {loadingAi ? 'Generating insights...' : aiReport ? 'Open mentor report' : aiError ? 'Retry mentor report' : 'Generate mentor insights'}
                </h2>
                <p className="mt-3 text-sm md:text-base text-blue-50 leading-relaxed">
                  {aiError || `Personalized guidance based on ${firstName}'s scores, attendance, activity, and subject progress.`}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
              <MetricTile icon={TrendingUp} label="Avg Score" value={`${avgScore}%`} accent="blue" />
              <MetricTile icon={CalendarDays} label="Attendance" value={`${attendancePct}%`} accent="emerald" />
              <MetricTile icon={Award} label="Rank" value={data?.rank ? `#${data.rank}` : '--'} accent="amber" />
              <MetricTile icon={Bot} label="AI Status" value={aiReport ? 'Ready' : loadingAi ? '...' : 'Tap'} accent="violet" />
            </div>
          </div>
        </GlassCard>

        <GlassCard className="md:col-span-6 xl:col-span-8" title="Overall Trend" subtitle="Student score compared with class average" tone="blue" tall>
          <GradientAreaTrendChart data={trendData} classAverageLine={true} />
        </GlassCard>
        <GlassCard className="md:col-span-3 xl:col-span-2" title="Attendance" subtitle="Present days and consistency" tone="emerald">
          <div className="flex-1 flex items-center justify-center py-4">
            <LiquidFillGauge percentage={student.attendance_pct || 0} size={170} />
          </div>
        </GlassCard>
        <GlassCard className="md:col-span-3 xl:col-span-2" title="Score Health" subtitle="Current academic average" tone="amber">
          <div className="flex-1 flex items-center justify-center py-4">
            <NeonProgressGauge percentage={student.avg_score || 0} label="Average" color="#D97706" />
          </div>
        </GlassCard>

        <GlassCard className="md:col-span-6 xl:col-span-8" title="Subject Progression" subtitle="How scores moved across recent tests" tone="cyan" tall>
          <SubjectProgressionLineChart data={progressionData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-4" title="Assignments" subtitle="Submitted, pending, and overdue work" tone="violet" tall>
          <AssignmentSpeedometer data={assignmentData} />
        </GlassCard>

        <GlassCard className="md:col-span-6 xl:col-span-4" title="Subject Strengths" subtitle="Performance profile across subjects" tone="violet" tall>
          <SubjectRadarChart data={radarData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-8" title="Learning Engagement" subtitle="Daily activity intensity across the last four weeks" tone="emerald" tall>
          <EngagementHeatmap data={heatmapData} />
        </GlassCard>
        
        <GlassCard className="md:col-span-3 xl:col-span-4" title="Time Allocation" subtitle="Where learning time is spent" tone="blue" tall>
          <TimeAllocationDonut data={donutData} />
        </GlassCard>
        <GlassCard className="md:col-span-3 xl:col-span-4" title="Topic Mastery" subtitle="Strong and weak learning areas" tone="amber" tall>
          <TopicPolarArea data={polarData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-4" title="Learning Breakdown" subtitle="Content mix by activity type" tone="cyan" tall>
          <LearningTreemap data={treemapData} />
        </GlassCard>

        <GlassCard className="md:col-span-6 xl:col-span-6" title="Activity Flow" subtitle="Videos, tests, and assignments over time" tone="emerald">
          <OverlappingAreaChart data={overlapData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-6" title="Class Range" subtitle="Student score position inside class spread" tone="blue">
          <QuizRangeChart data={rangeData} />
        </GlassCard>

        <GlassCard className="md:col-span-3 xl:col-span-4" title="Test Strategy" subtitle="Time spent versus accuracy" tone="rose">
          <TestQuadrantChart data={quadrantData} />
        </GlassCard>
        <GlassCard className="md:col-span-3 xl:col-span-4" title="Quiz Speed" subtitle="Score and time pattern by attempt" tone="cyan">
          <QuizBubbleScatter data={scatterData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-4" title="Class Distribution" subtitle="Score distribution with student marker" tone="amber">
          <TestBellCurve data={bellData} studentScore={student.avg_score || 75} />
        </GlassCard>

        <GlassCard className="md:col-span-6 xl:col-span-5" title="Rank Progression" subtitle="Movement on the leaderboard" tone="amber">
          <LeaderboardBumpChart data={bumpData} />
        </GlassCard>
        <GlassCard className="md:col-span-6 xl:col-span-7" title="Learning Calendar" subtitle="Attendance and test days in one clear calendar" tone="emerald" tall>
          <AttendanceCalendar month={new Date()} daysData={attendanceDays} testDaysData={testDays} />
        </GlassCard>

        <GlassCard className="md:col-span-6 xl:col-span-5" title="Recent Activity" subtitle="Latest learning events" tone="blue">
          <ActivityStepper data={activityData} />
        </GlassCard>

        <GlassCard className="md:col-span-6 xl:col-span-7" title="Subject Gap Analysis" subtitle="Student level compared with class benchmark" tone="violet" tall>
          <DumbbellSubjectPlot data={radarData} />
        </GlassCard>

      </motion.div>

      {/* AI Modal */}
      <AnimatePresence>
        {showAiModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setShowAiModal(false)}
          >
            <motion.div 
              initial={{ y: 50, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 50, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-[32px] p-6 md:p-8 w-full max-w-lg shadow-2xl relative"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center text-[#FDE047]"><Bot size={24} /></div>
                <div>
                  <h2 className="text-xl font-black text-[#112B3C] tracking-tight">AI Mentor Report</h2>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Personalized insights for {student.name ? student.name.split(' ')[0] : 'Student'}</p>
                </div>
              </div>
              
              <div className="min-h-[200px] max-h-[60vh] overflow-y-auto text-sm text-gray-700 leading-relaxed pr-2">
                {loadingAi ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-400 space-y-4">
                    <Loader2 size={32} className="animate-spin text-[#FDE047]" />
                    <p className="font-bold text-xs uppercase tracking-widest">Analyzing algorithms...</p>
                  </div>
                ) : aiError ? (
                  <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-700">
                    <p className="font-bold text-sm">Could not generate insights.</p>
                    <p>{aiError}</p>
                    <button onClick={handleGenerateAI} className="mt-1 px-4 py-2 bg-white hover:bg-red-100 text-red-700 font-black rounded-xl transition-colors text-xs uppercase tracking-widest border border-red-200">
                      Try Again
                    </button>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{aiReport}</div>
                )}
              </div>
              
              <button onClick={() => setShowAiModal(false)} className="mt-6 w-full py-4 bg-gray-50 hover:bg-gray-100 text-[#112B3C] font-black rounded-xl transition-colors text-sm uppercase tracking-widest border border-gray-200">
                Close Report
              </button>
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
