import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, AreaChart, Area, RadialBarChart, RadialBar, PieChart, Pie
} from 'recharts';
import { format, subDays, addDays, startOfWeek, isSameDay } from 'date-fns';
import { Search, ChevronLeft, ChevronRight, Bot } from 'lucide-react';

// --- Theme Colors ---
const theme = {
  primary: '#00C2C7', // Cyan
  secondary: '#FFC436', // Yellow
  tertiary: '#7059FF', // Purple
  bg: '#F4F7F6',
  card: '#FFFFFF',
  textMain: '#333333',
  textMuted: '#888888',
};

// --- Mock Data Generators based on LMS Logic ---
const generateTrendData = () => Array.from({ length: 30 }).map((_, i) => ({ day: i, score: 60 + Math.random() * 40 }));
const generateQuizData = () => Array.from({ length: 7 }).map((_, i) => ({ name: `Q${i+1}`, score: 70 + Math.random() * 30 }));
const generateComparisonData = () => Array.from({ length: 12 }).map((_, i) => ({ week: `W${i+1}`, student: 50 + Math.random()*50, class: 50 + Math.random()*40 }));
const generateSubjectData = () => [
  { subject: 'Math', diff: 12 }, { subject: 'Science', diff: -5 }, 
  { subject: 'History', diff: 8 }, { subject: 'English', diff: 15 }, { subject: 'Art', diff: -2 }
];
const generateWeeklyEngagement = () => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
  day, videos: Math.random() * 60, quizzes: Math.random() * 40, classes: Math.random() * 30
}));

// --- Animation Variants ---
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

// --- Custom Tooltips ---
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2 rounded shadow-lg border border-gray-100 text-sm z-50">
        <p className="font-semibold text-gray-800">{label}</p>
        {payload.map((entry, index) => (
          <p key={`item-${index}`} style={{ color: entry.color }}>
            {entry.name}: {entry.value.toFixed(1)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// --- Reusable Card Wrapper ---
const Card = ({ children, className = '', colSpan = 1 }) => (
  <motion.div 
    variants={itemVariants}
    className={`bg-white rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-50 flex flex-col ${
      colSpan === 2 ? 'col-span-2' : 'col-span-1'
    } md:col-span-auto ${className}`}
  >
    {children}
  </motion.div>
);

export default function ReportCardDashboard({ studentId, isTeacherView = false }) {
  // In a real app, fetch data based on studentId here using Zustand or React Query.
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Memos for performance
  const trendData = useMemo(() => generateTrendData(), []);
  const quizData = useMemo(() => generateQuizData(), []);
  const comparisonData = useMemo(() => generateComparisonData(), []);
  const subjectData = useMemo(() => generateSubjectData(), []);
  const weeklyData = useMemo(() => generateWeeklyEngagement(), []);

  return (
    <div className="min-h-screen bg-[#F4F7F6] pb-24 text-[#333333] font-sans">
      
      {/* Top Header */}
      <div className="pt-8 px-6 pb-6 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600 font-bold text-xl">
            {/* Avatar Placeholder */}
            U
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{isTeacherView ? "Student Report" : "Hello, User!"}</h1>
            <p className="text-xs text-gray-500">{isTeacherView ? "Analytics and insights" : "Welcome back to your dashboard"}</p>
          </div>
        </div>
        <button className="w-10 h-10 rounded-full bg-[#00C2C7] text-white flex items-center justify-center shadow-md shadow-[#00C2C7]/30">
          <Search size={18} />
        </button>
      </div>

      {/* Main Grid Layout */}
      {/* 
        Mobile: grid-cols-2 with dense packing to achieve the "filled feel no gaps".
        Desktop: grid-cols-4 or 12 for wider displays.
      */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="px-4 md:px-6 max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4 md:gap-6 grid-flow-dense"
      >
        
        {/* 1. Main Trend Line (Spans full width on mobile, half on desktop) */}
        <Card colSpan={2} className="md:col-span-2">
          <div className="mb-4">
            <h3 className="font-bold text-lg">Overall Performance</h3>
            <p className="text-xs text-gray-400">Rolling 30-day average score</p>
          </div>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <Line type="monotone" dataKey="score" stroke={theme.tertiary} strokeWidth={3} dot={false} activeDot={{ r: 6, fill: theme.secondary }} />
                <Tooltip content={<CustomTooltip />} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 2. Recent Quizzes (Left column) */}
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-sm">Recent Quizzes</h3>
              <select className="text-[10px] bg-gray-50 text-gray-600 rounded p-1 border-none outline-none">
                <option>Week</option>
                <option>Month</option>
              </select>
            </div>
            <div className="h-28 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={quizData}>
                  <Line type="linear" dataKey="score" stroke={theme.secondary} strokeWidth={2} dot={{ r: 4, fill: theme.primary }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        {/* 3. Calendar (Right column) */}
        <Card className="flex flex-col items-center">
          <div className="flex justify-between items-center w-full mb-4">
            <button className="p-1 text-cyan-500"><ChevronLeft size={16} /></button>
            <span className="font-bold text-sm">{format(currentMonth, 'MMMM')}</span>
            <button className="p-1 text-cyan-500"><ChevronRight size={16} /></button>
          </div>
          {/* Calendar Grid Mockup */}
          <div className="grid grid-cols-7 gap-1 text-center w-full text-[10px] text-gray-500 mb-2 font-bold">
            {['S','M','T','W','T','F','S'].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center w-full text-xs font-medium">
            {/* Mock days */}
            {Array.from({length: 30}).map((_, i) => (
              <div key={i} className={`flex justify-center items-center h-5 w-5 md:h-6 md:w-6 rounded-full mx-auto
                ${i === 13 ? `border border-[${theme.primary}] text-[${theme.primary}]` : ''}
                ${i === 24 ? `border border-[${theme.tertiary}] text-[${theme.tertiary}]` : ''}
              `}>
                {i + 1}
              </div>
            ))}
          </div>
        </Card>

        {/* 4. Quick Stats (Left Column) */}
        <Card className="flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-gray-800">1205</h2>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Assignments</p>
            <div className="h-8 mt-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData.slice(0, 10)}>
                  <Line type="monotone" dataKey="score" stroke={theme.secondary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-black text-gray-800">840</h2>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Live Classes</p>
            <div className="h-8 mt-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData.slice(10, 20)}>
                  <Line type="monotone" dataKey="score" stroke={theme.primary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        {/* 6. 75% Radial + Button (Right Column, spans 2 rows intuitively based on height) */}
        <Card className="flex flex-col items-center justify-between py-6 row-span-2">
          <div className="text-center mb-2">
            <h3 className="font-bold text-sm">Course Progress</h3>
            <p className="text-[10px] text-gray-400">Total completion rate</p>
          </div>
          
          <div className="relative w-28 h-28 md:w-32 md:h-32 flex items-center justify-center my-4">
            <svg className="w-full h-full transform -rotate-90 drop-shadow-md">
              <circle cx="50%" cy="50%" r="45%" stroke="#E5E7EB" strokeWidth="10%" fill="none" />
              <circle cx="50%" cy="50%" r="45%" stroke={theme.primary} strokeWidth="10%" fill="none" strokeDasharray="283%" strokeDashoffset="70.75%" className="transition-all duration-1000 ease-out" strokeLinecap="round" />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-3xl font-black text-gray-800">75%</span>
            </div>
          </div>

          <p className="text-[10px] text-center text-gray-400 mt-2 px-2 leading-relaxed">Generated by automated algorithms tracking your milestones.</p>
          
          <button className="mt-4 w-full py-2.5 bg-[#FFC436] hover:bg-yellow-400 transition-colors text-white text-sm font-bold rounded-full shadow-lg shadow-yellow-400/40">
            Suscipit
          </button>
        </Card>

        {/* 5. Dual Circular Rings (Left Column) */}
        <Card className="flex justify-around items-center py-6">
          <div className="flex flex-col items-center">
            <div className="relative w-14 h-14 md:w-16 md:h-16 mb-2">
               <svg className="w-full h-full transform -rotate-90 drop-shadow-sm"><circle cx="50%" cy="50%" r="40%" stroke="#E5E7EB" strokeWidth="8%" fill="none" /><circle cx="50%" cy="50%" r="40%" stroke={theme.secondary} strokeWidth="8%" fill="none" strokeDasharray="251%" strokeDashoffset="62%" strokeLinecap="round" /></svg>
               <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">25K</span>
            </div>
            <span className="font-bold text-[10px] text-gray-500">Attendance</span>
          </div>
          <div className="flex flex-col items-center">
             <div className="relative w-14 h-14 md:w-16 md:h-16 mb-2">
               <svg className="w-full h-full transform -rotate-90 drop-shadow-sm"><circle cx="50%" cy="50%" r="40%" stroke="#E5E7EB" strokeWidth="8%" fill="none" /><circle cx="50%" cy="50%" r="40%" stroke={theme.tertiary} strokeWidth="8%" fill="none" strokeDasharray="251%" strokeDashoffset="25%" strokeLinecap="round" /></svg>
               <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">90K</span>
            </div>
            <span className="font-bold text-[10px] text-gray-500">Submissions</span>
          </div>
        </Card>

        {/* 7. Diverging Bar Chart (Full Width on mobile if needed, but let's make it col-span-2) */}
        <Card colSpan={2} className="md:col-span-2">
          <div className="flex flex-col mb-4">
             <h3 className="font-bold text-sm">Subject Performance vs Average</h3>
             <span className="text-[10px] text-gray-400">Deviation from class mean</span>
          </div>
          <div className="h-32 md:h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="subject" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: '#f3f4f6'}} content={<CustomTooltip />} />
                <Bar dataKey="diff" radius={[4, 4, 4, 4]}>
                  {subjectData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.diff > 0 ? theme.primary : theme.secondary} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 8. Multi-Line Comparison Chart (Full width on mobile) */}
        <Card colSpan={2} className="md:col-span-2">
          <div className="flex justify-between items-center mb-4">
             <h3 className="font-bold text-sm">Class Comparison</h3>
             <select className="text-[10px] bg-gray-50 text-gray-600 rounded p-1 border-none outline-none">
                <option>All time</option>
              </select>
          </div>
          <div className="h-40 md:h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="week" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="student" stroke={theme.tertiary} strokeWidth={3} dot={{r:3}} name="Student" />
                <Line type="monotone" dataKey="class" stroke={theme.secondary} strokeWidth={3} dot={{r:3}} name="Class Avg" />
              </LineChart>
            </ResponsiveContainer>
          </div>
           {/* Legend */}
           <div className="flex justify-center gap-6 mt-2 text-[10px] font-bold text-gray-600">
             <div className="flex items-center gap-1.5"><div className="w-2.5 h-1 rounded-full bg-[#7059FF]"></div> Student</div>
             <div className="flex items-center gap-1.5"><div className="w-2.5 h-1 rounded-full bg-[#FFC436]"></div> Class Avg</div>
           </div>
        </Card>

        {/* 9. Horizontal Stacked Bar (Left half on mobile) */}
        <Card className="flex flex-col justify-center">
          <h3 className="font-bold text-sm mb-4">Grade Breakdown</h3>
          <div className="w-full h-2.5 md:h-3 bg-gray-100 rounded-full flex overflow-hidden">
            <div className="bg-[#7059FF] h-full transition-all duration-1000" style={{width: '30%'}}></div>
            <div className="bg-[#00C2C7] h-full transition-all duration-1000" style={{width: '45%'}}></div>
            <div className="bg-[#FFC436] h-full transition-all duration-1000" style={{width: '25%'}}></div>
          </div>
          <div className="flex justify-between mt-4 text-[9px] md:text-[10px] font-bold text-gray-500">
            <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-[#7059FF]"></div> Exams</div>
            <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-[#00C2C7]"></div> HW</div>
            <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-[#FFC436]"></div> Quizzes</div>
          </div>
        </Card>

        {/* 10. Timeline (Right half) */}
        <Card className="flex flex-col justify-center">
          <h3 className="font-bold text-sm mb-6 md:mb-8">Upcoming</h3>
          <div className="relative flex items-center justify-between w-full pb-4">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-100 -translate-y-1/2"></div>
            
            {/* Node 1 */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FFC436] mb-1 ring-2 ring-white"></div>
              <span className="absolute top-4 text-[8px] md:text-[9px] font-bold bg-gray-800 text-white px-1.5 py-0.5 rounded shadow">Quiz</span>
            </div>
            {/* Node 2 */}
            <div className="relative z-10 flex flex-col items-center">
              <span className="absolute bottom-4 text-[8px] md:text-[9px] font-bold bg-[#00C2C7] text-white px-1.5 py-0.5 rounded shadow">Live</span>
              <div className="w-2.5 h-2.5 rounded-full bg-[#00C2C7] mt-1 ring-2 ring-white"></div>
            </div>
            {/* Node 3 */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FFC436] mb-1 ring-2 ring-white"></div>
              <span className="absolute top-4 text-[8px] md:text-[9px] font-bold bg-gray-800 text-white px-1.5 py-0.5 rounded shadow">HW</span>
            </div>
             {/* Node 4 */}
             <div className="relative z-10 flex flex-col items-center">
              <span className="absolute bottom-4 text-[8px] md:text-[9px] font-bold bg-[#7059FF] text-white px-1.5 py-0.5 rounded shadow">Exam</span>
              <div className="w-2.5 h-2.5 rounded-full bg-[#7059FF] mt-1 ring-2 ring-white"></div>
            </div>
          </div>
        </Card>

        {/* 11. Grouped Bar Chart (Bottom Full Width) */}
        <Card colSpan={2} className="md:col-span-4">
           <div className="flex flex-col mb-4">
             <h3 className="font-bold text-sm">Weekly Engagement</h3>
             <span className="text-[10px] text-gray-400">Time spent per day</span>
           </div>
           <div className="h-40 md:h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: '#f3f4f6'}} content={<CustomTooltip />} />
                <Bar dataKey="videos" fill={theme.tertiary} radius={[2, 2, 0, 0]} name="Videos (mins)" />
                <Bar dataKey="quizzes" fill={theme.primary} radius={[2, 2, 0, 0]} name="Quizzes (mins)" />
                <Bar dataKey="classes" fill={theme.secondary} radius={[2, 2, 0, 0]} name="Classes (mins)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

      </motion.div>

      {/* AI Mentor Floating Integration */}
      <div className="fixed bottom-[80px] right-6 md:bottom-8 md:right-8 z-50">
        <button className="bg-[#FFC436] text-white w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(255,196,54,0.5)] hover:scale-105 hover:bg-yellow-400 transition-all active:scale-95 border-4 border-white/50 group relative">
           <Bot size={28} className="drop-shadow-md group-hover:rotate-12 transition-transform" />
           {/* Notification ping */}
           <span className="absolute top-0 right-0 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500 border border-white"></span>
          </span>
        </button>
      </div>

    </div>
  );
}
