import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Loader2, ArrowLeft, Share2, Download } from 'lucide-react';
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
import TestCalendar from './graphs/TestCalendar';
import LeaderboardBumpChart from './graphs/LeaderboardBumpChart';
import AssignmentSpeedometer from './graphs/AssignmentSpeedometer';
import TestBellCurve from './graphs/TestBellCurve';
import TestQuadrantChart from './graphs/TestQuadrantChart';
import TopicPolarArea from './graphs/TopicPolarArea';
import ActivityStepper from './graphs/ActivityStepper';

// Basic Glass Card Wrapper
const GlassCard = ({ title, subtitle, children, className = "", onClick = null }) => (
  <div 
    onClick={onClick}
    className={`bg-white/40 backdrop-blur-xl border border-white/60 rounded-[24px] md:rounded-[32px] p-5 shadow-[0_8px_32px_rgba(31,38,135,0.05)] flex flex-col hover:shadow-[0_8px_32px_rgba(31,38,135,0.1)] transition-all duration-300 w-full relative z-10 overflow-hidden ${className} ${onClick ? 'cursor-pointer hover:scale-[1.02]' : ''}`}
  >
    <div className="mb-3 md:mb-4 shrink-0 pointer-events-none">
      <h3 className="text-[#112B3C] font-black text-base md:text-lg tracking-tight leading-tight truncate">{title}</h3>
      {subtitle && <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5 truncate">{subtitle}</p>}
    </div>
    <div className="w-full flex-1 flex flex-col justify-center relative min-w-0 pointer-events-auto">
      {children}
    </div>
  </div>
);

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
    <div className="w-full bg-[#F4F7F6] pb-24 text-[#333333] font-sans">
      
      {showHeader && (
        <div className="pt-6 md:pt-8 px-4 md:px-6 pb-6 flex justify-between items-center max-w-7xl mx-auto">
          <div className="flex items-center gap-3 md:gap-4">
            <button className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm border border-gray-100"><ArrowLeft size={18} className="text-gray-700" /></button>
            <div>
              <h1 className="text-lg md:text-xl font-serif font-black text-[#112B3C] tracking-tight">{student.name ? student.name.split(' ')[0] : 'Student'}</h1>
              <p className="text-[10px] md:text-xs text-gray-400 font-bold tracking-wider uppercase">{student.username || 'ID'}</p>
            </div>
          </div>
          <div className="flex gap-1 md:gap-2">
            {onPeriodChange && PERIODS.map(p => (
              <button key={p.id} onClick={() => onPeriodChange(p.id)}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-xl border transition-all ${
                  period === p.id
                    ? 'bg-[#112B3C] text-white border-[#112B3C]'
                    : 'bg-white text-gray-500 border-gray-100 hover:border-gray-300'
                }`}>
                {p.label}
              </button>
            ))}
            <button onClick={handleShare} className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white text-gray-600 flex items-center justify-center shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors"><Share2 size={14} /></button>
            <button onClick={handleDownload} className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white text-gray-600 flex items-center justify-center shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors"><Download size={14} /></button>
          </div>
        </div>
      )}

      {/* Ultimate Bento Grid Layout */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-3 md:px-6 max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4 md:gap-6 pb-24"
      >
        
        {/* Dedicated AI Mentor Card */}
        <GlassCard 
          className="col-span-2 md:col-span-4 xl:col-span-6 bg-gradient-to-r from-[#FDE047]/30 to-[#FDE047]/10 border-[#FDE047]/40" 
          title="AI Mentor Insights" 
          subtitle="Generate Personalized Report"
          onClick={handleGenerateAI}
        >
          <div className="flex items-center gap-4 py-2">
            <div className="w-12 h-12 rounded-full bg-[#FDE047] flex items-center justify-center text-white shadow-lg shadow-[#FDE047]/40">
              <Bot size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-[#112B3C]">
                {loadingAi ? 'Generating AI Report...' : aiReport ? 'View AI Mentor Report' : aiError ? 'Retry AI Mentor Report' : 'Tap to generate AI Report'}
              </p>
              <p className="text-xs text-gray-500">
                {aiError || `Deep learning analysis on ${student.name ? student.name.split(' ')[0] : 'this student'}'s performance.`}
              </p>
            </div>
          </div>
        </GlassCard>

        {/* ROW 1 */}
        <GlassCard className="col-span-2 md:col-span-4 xl:col-span-4" title="Overall Trend" subtitle="Student vs Class Avg">
          <GradientAreaTrendChart data={trendData} classAverageLine={true} />
        </GlassCard>
        <GlassCard className="col-span-1 md:col-span-2 xl:col-span-1" title="Course Progress" subtitle="Overall Completion">
          <div className="flex-1 flex items-center justify-center py-4">
            <LiquidFillGauge percentage={student.attendance_pct || 78} size={130} />
          </div>
        </GlassCard>
        <GlassCard className="col-span-1 md:col-span-2 xl:col-span-1" title="Live Classes" subtitle="Attendance Rate">
          <div className="flex-1 flex items-center justify-center py-4">
            <NeonProgressGauge percentage={student.avg_score || 92} label="Attended" color="#FDE047" />
          </div>
        </GlassCard>

        {/* ROW 2 */}
        <GlassCard className="col-span-2 md:col-span-4 xl:col-span-4" title="Subject Progression" subtitle="Test scores over time">
          <SubjectProgressionLineChart data={progressionData.length > 0 ? progressionData : trendData} />
        </GlassCard>
        <GlassCard className="col-span-2 md:col-span-2 xl:col-span-2" title="Assignments" subtitle="Health (Speedometer)">
          <AssignmentSpeedometer data={assignmentData} />
        </GlassCard>

        {/* ROW 3 */}
        <GlassCard className="col-span-2 md:col-span-2 xl:col-span-2" title="Subject Strengths" subtitle="Radar Analysis">
          <SubjectRadarChart data={radarData} />
        </GlassCard>
        <GlassCard className="col-span-2 md:col-span-4 xl:col-span-4" title="Weekly Engagement" subtitle="Github-style Heatmap">
          <EngagementHeatmap data={heatmapData} />
        </GlassCard>
        
        {/* ROW 4 */}
        <GlassCard className="col-span-2 md:col-span-2 xl:col-span-2" title="Time Allocation" subtitle="Donut Breakdown">
          <TimeAllocationDonut data={donutData} />
        </GlassCard>
        <GlassCard className="col-span-2 md:col-span-2 xl:col-span-2" title="Topic Mastery" subtitle="Math Breakdown (Polar Area)">
          <TopicPolarArea data={polarData} />
        </GlassCard>
        <GlassCard className="col-span-2 md:col-span-2 xl:col-span-2" title="Learning Breakdown" subtitle="Content Type (Treemap)">
          <LearningTreemap data={treemapData} />
        </GlassCard>

        {/* ROW 5 */}
        <GlassCard className="col-span-2 md:col-span-2 xl:col-span-3" title="Activity Flow" subtitle="Overlapping areas">
          <OverlappingAreaChart data={overlapData} />
        </GlassCard>
        <GlassCard className="col-span-2 md:col-span-2 xl:col-span-3" title="Class Range" subtitle="Student standing in class">
          <QuizRangeChart data={rangeData} />
        </GlassCard>

        {/* ROW 6 */}
        <GlassCard className="col-span-2 md:col-span-2 xl:col-span-2" title="Test Strategy" subtitle="Time vs Accuracy (Quadrant)">
          <TestQuadrantChart data={quadrantData} />
        </GlassCard>
        <GlassCard className="col-span-2 md:col-span-2 xl:col-span-2" title="Quiz Speeds" subtitle="Score vs Time (Bubble)">
          <QuizBubbleScatter data={scatterData} />
        </GlassCard>
        <GlassCard className="col-span-2 md:col-span-2 xl:col-span-2" title="Class Distribution" subtitle="Score distribution (Bell Curve)">
          <TestBellCurve data={bellData} studentScore={student.avg_score || 75} />
        </GlassCard>

        {/* ROW 7 */}
        <GlassCard className="col-span-2 md:col-span-2 xl:col-span-3" title="Rank Progression" subtitle="Leaderboard (Bump Chart)">
          <LeaderboardBumpChart data={bumpData} />
        </GlassCard>
        <GlassCard className="col-span-2 md:col-span-2 xl:col-span-3" title="Attendance" subtitle="Monthly Status">
          <AttendanceCalendar month={new Date()} daysData={attendanceDays} />
        </GlassCard>

        {/* ROW 8 */}
        <GlassCard className="col-span-2 md:col-span-2 xl:col-span-3" title="Exam Schedule" subtitle="Tests this month">
          <TestCalendar month={new Date()} daysData={testDays} />
        </GlassCard>
        <GlassCard className="col-span-2 md:col-span-2 xl:col-span-3" title="Today's Activity" subtitle="Chronological Stepper">
          <ActivityStepper data={activityData} />
        </GlassCard>

        {/* ROW 9 */}
        <GlassCard className="col-span-2 md:col-span-4 xl:col-span-6" title="Subject Plot" subtitle="Dumbbell (Mobile friendly)">
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
