
import React, { useState, useEffect } from 'react';
import { reportApi, teacherApi, studentApi } from '../../lib/api';

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
const GlassCard = ({ title, subtitle, children }) => (
  <div className="break-inside-avoid bg-white/40 backdrop-blur-xl border border-white/60 rounded-[32px] p-6 shadow-[0_8px_32px_rgba(31,38,135,0.05)] flex flex-col hover:shadow-[0_8px_32px_rgba(31,38,135,0.1)] transition-all duration-300 w-full mb-6 relative z-10">
    <div className="mb-4">
      <h3 className="text-[#112B3C] font-black text-lg tracking-tight">{title}</h3>
      {subtitle && <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{subtitle}</p>}
    </div>
    <div className="w-full flex-1 flex flex-col justify-center relative">
      {children}
    </div>
  </div>
);

export default function ReportGraphReferencePage() {

  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);

  useEffect(() => {
    // Fetch a student to test with
    const fetchStudents = async () => {
      try {
        const res = await studentApi.list();
        if (res && res.length > 0) {
          setStudents(res);
          setSelectedStudent(res[0].id);
        }
      } catch (err) {
        console.error("Failed to load students", err);
      }
    };
    fetchStudents();
  }, []);

  useEffect(() => {
    if (!selectedStudent) return;
    const fetchReport = async () => {
      setLoading(true);
      try {
        const data = await reportApi.getSmartReport(selectedStudent);
        setReportData(data);
      } catch (err) {
        console.error("Failed to fetch smart report", err);
      }
      setLoading(false);
    };
    fetchReport();
  }, [selectedStudent]);
  
  // Dummy Data Generators
  
  const areaData = reportData?.trendData || [
    { name: 'Jan', studentScore: 45, classScore: 60 },
    { name: 'Feb', studentScore: 55, classScore: 62 },
    { name: 'Mar', studentScore: 82, classScore: 64 },
    { name: 'Apr', studentScore: 78, classScore: 65 },
    { name: 'May', studentScore: 92, classScore: 68 },
    { name: 'Jun', studentScore: 88, classScore: 70 },
  ];

  const radarData = reportData?.radarData || [
    { subject: 'Math', student: 85, classAvg: 70 },
    { subject: 'Science', student: 95, classAvg: 75 },
    { subject: 'English', student: 45, classAvg: 65 },
    { subject: 'Social', student: 75, classAvg: 80 },
    { subject: 'IT', student: 98, classAvg: 85 },
  ];

  const overlapData = reportData?.overlapData || [
    { day: 'Mon', videos: 40, tests: 20, notes: 10 },
    { day: 'Tue', videos: 30, tests: 40, notes: 15 },
    { day: 'Wed', videos: 60, tests: 10, notes: 30 },
    { day: 'Thu', videos: 20, tests: 50, notes: 5 },
    { day: 'Fri', videos: 80, tests: 30, notes: 40 },
    { day: 'Sat', videos: 100, tests: 80, notes: 20 },
    { day: 'Sun', videos: 10, tests: 0, notes: 0 },
  ];

  const heatmapData = reportData?.heatmapData || Array.from({length: 28}, (_, i) => ({
    date: `2026-07-${i+1}`,
    count: Math.floor(Math.random() * 8)
  }));

  const donutData = reportData?.donutData || [
    { name: 'Videos', value: 400, color: '#00C2C7' },
    { name: 'Tests', value: 300, color: '#7059FF' },
    { name: 'Live Classes', value: 200, color: '#FFC436' },
    { name: 'Assignments', value: 150, color: '#FF6B6B' },
  ];

  const treemapData = reportData?.treemapData || [
    { name: 'Videos', size: 400 },
    { name: 'Tests', size: 300 },
    { name: 'Live', size: 200 },
    { name: 'Notes', size: 100 },
    { name: 'HW', size: 50 },
  ];

  const scatterData = reportData?.scatterData || [
    { name: 'Q1', dateIndex: 1, score: 85, time: 120 },
    { name: 'Q2', dateIndex: 2, score: 45, time: 200 },
    { name: 'Q3', dateIndex: 3, score: 92, time: 80 },
    { name: 'Q4', dateIndex: 4, score: 75, time: 150 },
    { name: 'Q5', dateIndex: 5, score: 60, time: 180 },
  ];

  const rangeData = reportData?.rangeData || [
    { name: 'Math T1', minScore: 30, maxScore: 98, studentScore: 85 },
    { name: 'Sci T1', minScore: 45, maxScore: 100, studentScore: 95 },
    { name: 'Eng T1', minScore: 20, maxScore: 80, studentScore: 45 },
    { name: 'IT T1', minScore: 60, maxScore: 100, studentScore: 98 },
  ];

  const attendanceDays = reportData?.attendanceDays || Array.from({length: 31}, (_, i) => {
    const status = Math.random() > 0.8 ? 'absent' : (Math.random() > 0.9 ? 'late' : 'present');
    return { dayNumber: i+1, status: i===14 ? 'holiday' : status, info: i===14 ? 'School Holiday' : status };
  });

  const bumpData = reportData?.bumpData || [
    { week: 'W1', rank: 15 },
    { week: 'W2', rank: 12 },
    { week: 'W3', rank: 6 },
    { week: 'W4', rank: 4 },
  ];

  const assignmentData = reportData?.assignmentData || [
    { name: 'Submitted', value: 24, color: '#00C2C7' },
    { name: 'Pending', value: 4, color: '#FFC436' },
    { name: 'Overdue', value: 2, color: '#FF6B6B' },
  ];

  const bellData = reportData?.bellData || [
    { scoreBin: 20, count: 1 }, { scoreBin: 30, count: 2 }, { scoreBin: 40, count: 5 },
    { scoreBin: 50, count: 12 }, { scoreBin: 60, count: 18 }, { scoreBin: 70, count: 24 },
    { scoreBin: 80, count: 15 }, { scoreBin: 90, count: 8 }, { scoreBin: 100, count: 3 },
  ];

  const quadrantData = reportData?.quadrantData || [
    { name: 'Test 1', score: 85, time: 20 },
    { name: 'Test 2', score: 45, time: 20 },
    { name: 'Test 3', score: 92, time: 55 },
    { name: 'Test 4', score: 40, time: 60 },
    { name: 'Test 5', score: 75, time: 30 },
  ];

  const polarData = reportData?.polarData || [
    { topic: 'Algebra', score: 90 }, { topic: 'Geometry', score: 65 }, { topic: 'Trigonometry', score: 80 },
    { topic: 'Statistics', score: 45 }, { topic: 'Calculus', score: 85 },
  ];

  const activityData = reportData?.activityData || [
    { time: '09:00 AM', title: 'Logged In', color: 'bg-green-400' },
    { time: '10:15 AM', title: 'Watched Algebra Video', color: 'bg-[#00C2C7]' },
    { time: '11:30 AM', title: 'Submitted Assignment', color: 'bg-[#7059FF]' },
  ];

  const testDays = reportData?.testDays || Array.from({length: 31}, (_, i) => {
    const hasTest = Math.random() > 0.85;
    return { dayNumber: i+1, hasTest, score: hasTest ? Math.floor(Math.random()*40 + 60) : null, testName: hasTest ? 'Unit Test' : null };
  });

  return (
    <div className="min-h-screen bg-[#F4F7F6] pb-24 text-[#333333] font-sans">
      
      <div className="pt-8 px-6 pb-6 max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-black text-[#112B3C] tracking-tight">Graph Reference</h1>
          <p className="text-sm text-gray-500 font-medium">Udaya Smart Report Card Component Showcase</p>
        </div>
        <div className="flex items-center gap-4">
          {loading && <span className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Loading live data...</span>}
          <select 
            className="px-4 py-2 bg-white/50 border border-gray-200 rounded-xl text-sm font-bold text-[#112B3C] outline-none focus:ring-2 focus:ring-cyan-400"
            value={selectedStudent}
            onChange={(e) => setSelectedStudent(e.target.value)}
          >
            <option value="" disabled>Select Student to test API</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.username})</option>
            ))}
          </select>
        </div>
      </div>


      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 md:px-6 max-w-7xl mx-auto columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6 pb-24"
      >
        {/* ROW 1: KPIs & Calendars */}
        <GlassCard title="Attendance" subtitle="Monthly Status">
          <AttendanceCalendar month={new Date()} daysData={attendanceDays} />
        </GlassCard>

        <GlassCard title="Course Progress" subtitle="Overall Completion">
          <div className="flex-1 flex items-center justify-center py-8">
            <LiquidFillGauge percentage={reportData?.student?.attendance_pct || 78} size={240} />
          </div>
        </GlassCard>

        <GlassCard title="Exam Schedule" subtitle="Tests this month">
          <TestCalendar month={new Date()} daysData={testDays} />
        </GlassCard>

        <GlassCard title="Live Classes" subtitle="Attendance Rate">
          <div className="flex-1 flex items-center justify-center py-4">
            <NeonProgressGauge percentage={reportData?.student?.avg_score || 92} label="Attended" color="#FFC436" />
          </div>
        </GlassCard>

        {/* ROW 2: Performance */}
        <GlassCard title="Overall Trend" subtitle="Student vs Class Avg">
          <GradientAreaTrendChart data={areaData} classAverageLine={true} />
        </GlassCard>

        <GlassCard title="Subject Strengths" subtitle="Radar Analysis">
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
        <GlassCard title="Time Allocation" subtitle="Donut Breakdown">
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
        <GlassCard title="Rank Progression" subtitle="Leaderboard (Bump Chart)">
          <LeaderboardBumpChart data={bumpData} />
        </GlassCard>

        <GlassCard title="Assignments" subtitle="Health (Speedometer)">
          <AssignmentSpeedometer data={assignmentData} />
        </GlassCard>

        <GlassCard title="Topic Mastery" subtitle="Math Breakdown (Polar Area)">
          <TopicPolarArea data={polarData} />
        </GlassCard>

        <GlassCard title="Class Distribution" subtitle="Science Test (Bell Curve)">
          <TestBellCurve data={bellData} studentScore={85} />
        </GlassCard>

        <GlassCard title="Test Strategy" subtitle="Time vs Accuracy (Quadrant)">
          <TestQuadrantChart data={quadrantData} />
        </GlassCard>

        <GlassCard title="Today's Activity" subtitle="Chronological Stepper">
          <ActivityStepper data={activityData} />
        </GlassCard>

        {/* Mobile Alternative */}
        <GlassCard title="Subject Plot" subtitle="Dumbbell (Mobile friendly)">
          <DumbbellSubjectPlot data={radarData} />
        </GlassCard>

      </motion.div>
    </div>
  );
}
