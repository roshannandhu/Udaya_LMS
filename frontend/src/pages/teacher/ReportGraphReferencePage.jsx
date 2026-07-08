import React from 'react';
import { motion } from 'framer-motion';

// Import all premium graphs
import GradientAreaTrendChart from '../../components/shared/graphs/GradientAreaTrendChart';
import SubjectRadarChart from '../../components/shared/graphs/SubjectRadarChart';
import DumbbellSubjectPlot from '../../components/shared/graphs/DumbbellSubjectPlot';
import EngagementHeatmap from '../../components/shared/graphs/EngagementHeatmap';
import OverlappingAreaChart from '../../components/shared/graphs/OverlappingAreaChart';
import TimeAllocationDonut from '../../components/shared/graphs/TimeAllocationDonut';
import LearningTreemap from '../../components/shared/graphs/LearningTreemap';
import LiquidFillGauge from '../../components/shared/graphs/LiquidFillGauge';
import NeonProgressGauge from '../../components/shared/graphs/NeonProgressGauge';
import QuizBubbleScatter from '../../components/shared/graphs/QuizBubbleScatter';
import QuizRangeChart from '../../components/shared/graphs/QuizRangeChart';
import AttendanceCalendar from '../../components/shared/graphs/AttendanceCalendar';
import TestCalendar from '../../components/shared/graphs/TestCalendar';
import LeaderboardBumpChart from '../../components/shared/graphs/LeaderboardBumpChart';
import AssignmentSpeedometer from '../../components/shared/graphs/AssignmentSpeedometer';
import TestBellCurve from '../../components/shared/graphs/TestBellCurve';
import TestQuadrantChart from '../../components/shared/graphs/TestQuadrantChart';
import TopicPolarArea from '../../components/shared/graphs/TopicPolarArea';
import ActivityStepper from '../../components/shared/graphs/ActivityStepper';


// Basic Glass Card Wrapper
const GlassCard = ({ title, subtitle, children, colSpan = 1, rowSpan = 1 }) => (
  <div 
    className={`bg-white/80 backdrop-blur-xl border border-white/40 rounded-[32px] p-6 shadow-[0_8px_32px_rgb(0,0,0,0.04)] flex flex-col ${colSpan === 2 ? 'md:col-span-2' : 'col-span-1'} ${rowSpan === 2 ? 'md:row-span-2' : ''}`}
  >
    {(title || subtitle) && (
      <div className="mb-4">
        {title && <h3 className="font-serif font-black text-[18px] text-[#112B3C] tracking-tight">{title}</h3>}
        {subtitle && <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1">{subtitle}</p>}
      </div>
    )}
    <div className="flex-1 flex flex-col justify-center relative">
      {children}
    </div>
  </div>
);

export default function ReportGraphReferencePage() {
  
  // Dummy Data Generators
  const areaData = [
    { name: 'Jan', studentScore: 40, classScore: 50 },
    { name: 'Feb', studentScore: 60, classScore: 55 },
    { name: 'Mar', studentScore: 55, classScore: 60 },
    { name: 'Apr', studentScore: 80, classScore: 65 },
    { name: 'May', studentScore: 75, classScore: 68 },
    { name: 'Jun', studentScore: 92, classScore: 70 },
  ];

  const radarData = [
    { subject: 'Math', student: 92, classAvg: 70 },
    { subject: 'Science', student: 85, classAvg: 75 },
    { subject: 'English', student: 65, classAvg: 80 },
    { subject: 'Social', student: 75, classAvg: 72 },
    { subject: 'IT', student: 98, classAvg: 85 },
  ];

  const overlapData = [
    { day: 'Mon', videos: 40, tests: 20, notes: 10 },
    { day: 'Tue', videos: 30, tests: 40, notes: 15 },
    { day: 'Wed', videos: 60, tests: 10, notes: 30 },
    { day: 'Thu', videos: 20, tests: 50, notes: 5 },
    { day: 'Fri', videos: 80, tests: 30, notes: 40 },
    { day: 'Sat', videos: 100, tests: 80, notes: 20 },
    { day: 'Sun', videos: 10, tests: 0, notes: 0 },
  ];

  const heatmapData = Array.from({length: 28}, (_, i) => ({
    date: `2026-07-${i+1}`,
    count: Math.floor(Math.random() * 8) // 0-7 activities
  }));

  const donutData = [
    { name: 'Videos', value: 400, color: '#00C2C7' },
    { name: 'Tests', value: 300, color: '#7059FF' },
    { name: 'Live Classes', value: 200, color: '#FFC436' },
    { name: 'Assignments', value: 150, color: '#FF6B6B' },
  ];

  const treemapData = [
    { name: 'Videos', size: 400 },
    { name: 'Tests', size: 300 },
    { name: 'Live', size: 200 },
    { name: 'Notes', size: 100 },
    { name: 'HW', size: 50 },
  ];

  const scatterData = [
    { name: 'Q1', dateIndex: 1, score: 85, time: 120 },
    { name: 'Q2', dateIndex: 2, score: 45, time: 200 },
    { name: 'Q3', dateIndex: 3, score: 92, time: 80 },
    { name: 'Q4', dateIndex: 4, score: 75, time: 150 },
    { name: 'Q5', dateIndex: 5, score: 60, time: 180 },
  ];

  const rangeData = [
    { name: 'Math T1', minScore: 30, maxScore: 98, studentScore: 85 },
    { name: 'Sci T1', minScore: 45, maxScore: 100, studentScore: 95 },
    { name: 'Eng T1', minScore: 20, maxScore: 80, studentScore: 45 },
    { name: 'IT T1', minScore: 60, maxScore: 100, studentScore: 98 },
  ];

  const attendanceDays = Array.from({length: 31}, (_, i) => {
    const status = Math.random() > 0.8 ? 'absent' : (Math.random() > 0.9 ? 'late' : 'present');
    return { 
      dayNumber: i+1, 
      status: i===14 ? 'holiday' : status,
      info: i===14 ? 'School Holiday' : (status==='absent' ? 'Missed Science' : 'Attended all')
    };
  });

  
  const bumpData = [
    { week: 'W1', rank: 15 },
    { week: 'W2', rank: 12 },
    { week: 'W3', rank: 6 },
    { week: 'W4', rank: 4 },
  ];

  const assignmentData = [
    { name: 'Submitted', value: 24, color: '#00C2C7' },
    { name: 'Pending', value: 4, color: '#FFC436' },
    { name: 'Overdue', value: 2, color: '#FF6B6B' },
  ];

  const bellData = [
    { scoreBin: 20, count: 1 },
    { scoreBin: 30, count: 2 },
    { scoreBin: 40, count: 5 },
    { scoreBin: 50, count: 12 },
    { scoreBin: 60, count: 18 },
    { scoreBin: 70, count: 24 },
    { scoreBin: 80, count: 15 },
    { scoreBin: 90, count: 8 },
    { scoreBin: 100, count: 3 },
  ];

  const quadrantData = [
    { name: 'Test 1', score: 85, time: 20 },
    { name: 'Test 2', score: 45, time: 20 },
    { name: 'Test 3', score: 92, time: 55 },
    { name: 'Test 4', score: 40, time: 60 },
    { name: 'Test 5', score: 75, time: 30 },
  ];

  const polarData = [
    { topic: 'Algebra', score: 90 },
    { topic: 'Geometry', score: 65 },
    { topic: 'Trigonometry', score: 80 },
    { topic: 'Statistics', score: 45 },
    { topic: 'Calculus', score: 85 },
  ];

  const activityData = [
    { time: '09:00 AM', title: 'Logged In', color: 'bg-green-400' },
    { time: '10:15 AM', title: 'Watched Algebra Video (45m)', color: 'bg-[#00C2C7]' },
    { time: '11:30 AM', title: 'Submitted Assignment', color: 'bg-[#7059FF]' },
    { time: '01:00 PM', title: 'Took Math Quiz (Score: 85%)', color: 'bg-[#FFC436]' },
    { time: '02:30 PM', title: 'Read Science Notes', color: 'bg-[#FF6B6B]' },
  ];

  const testDays = Array.from({length: 31}, (_, i) => {
    const hasTest = Math.random() > 0.85;
    return {
      dayNumber: i+1,
      hasTest,
      score: hasTest ? Math.floor(Math.random()*40 + 60) : null,
      testName: hasTest ? 'Unit Test' : null
    };
  });

  return (
    <div className="min-h-screen bg-[#F4F7F6] pb-24 text-[#333333] font-sans">
      <div className="pt-8 px-6 pb-6 max-w-7xl mx-auto flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-black text-[#112B3C] tracking-tight">Graph Reference</h1>
          <p className="text-sm text-gray-500 font-medium">Udaya Smart Report Card Component Showcase</p>
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 md:px-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-6 md:auto-rows-[160px] grid-flow-dense"
      >
        {/* ROW 1: KPIs & Calendars */}
        <GlassCard title="Attendance" subtitle="Monthly Status">
          <AttendanceCalendar month={new Date()} daysData={attendanceDays} />
        </GlassCard>

        <GlassCard title="Course Progress" subtitle="Overall Completion" rowSpan={2}>
          <div className="flex-1 flex items-center justify-center py-8">
            <LiquidFillGauge percentage={78} size={240} />
          </div>
        </GlassCard>

        <GlassCard title="Exam Schedule" subtitle="Tests this month">
          <TestCalendar month={new Date()} daysData={testDays} />
        </GlassCard>

        <GlassCard title="Live Classes" subtitle="Attendance Rate">
          <div className="flex-1 flex items-center justify-center py-4">
            <NeonProgressGauge percentage={92} label="Attended" color="#FFC436" />
          </div>
        </GlassCard>

        {/* ROW 2: Performance */}
        <GlassCard title="Overall Trend" subtitle="Student vs Class Avg" colSpan={2}>
          <GradientAreaTrendChart data={areaData} classAverageLine={true} />
        </GlassCard>

        <GlassCard title="Subject Strengths" subtitle="Radar Analysis" rowSpan={2}>
          <SubjectRadarChart data={radarData} />
        </GlassCard>

        {/* ROW 3: Engagement */}
        <GlassCard title="Weekly Engagement" subtitle="Github-style Heatmap">
          <EngagementHeatmap data={heatmapData} />
        </GlassCard>

        <GlassCard title="Activity Flow" subtitle="Overlapping areas">
          <OverlappingAreaChart data={overlapData} />
        </GlassCard>

        {/* ROW 4: Allocation & Range */}
        <GlassCard title="Time Allocation" subtitle="Donut Breakdown" colSpan={2}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
            <TimeAllocationDonut data={donutData} />
            <LearningTreemap data={treemapData} />
          </div>
        </GlassCard>

        <GlassCard title="Class Range" subtitle="Student standing in class">
          <QuizRangeChart data={rangeData} />
        </GlassCard>

        <GlassCard title="Quiz Speeds" subtitle="Score vs Time (Bubble)">
          <QuizBubbleScatter data={scatterData} />
        </GlassCard>

        
        {/* ROW 5: Advanced Analytics */}
        <GlassCard title="Rank Progression" subtitle="Leaderboard (Bump Chart)" colSpan={2}>
          <LeaderboardBumpChart data={bumpData} />
        </GlassCard>

        <GlassCard title="Assignments" subtitle="Health (Speedometer)">
          <AssignmentSpeedometer data={assignmentData} />
        </GlassCard>

        <GlassCard title="Topic Mastery" subtitle="Math Breakdown (Polar Area)" rowSpan={2}>
          <TopicPolarArea data={polarData} />
        </GlassCard>

        <GlassCard title="Class Distribution" subtitle="Science Test (Bell Curve)" colSpan={2}>
          <TestBellCurve data={bellData} studentScore={85} />
        </GlassCard>

        <GlassCard title="Test Strategy" subtitle="Time vs Accuracy (Quadrant)" colSpan={2}>
          <TestQuadrantChart data={quadrantData} />
        </GlassCard>

        <GlassCard title="Today's Activity" subtitle="Chronological Stepper" rowSpan={2}>
          <ActivityStepper data={activityData} />
        </GlassCard>

        {/* Mobile Alternative */}
        <GlassCard title="Subject Plot" subtitle="Dumbbell (Mobile friendly)" colSpan={2}>
          <DumbbellSubjectPlot data={radarData} />
        </GlassCard>

      </motion.div>
    </div>
  );
}
