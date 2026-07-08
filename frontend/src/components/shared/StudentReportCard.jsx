import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, AreaChart, Area, ReferenceLine
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { Search, ChevronLeft, ChevronRight, Bot, Loader2 } from 'lucide-react';
import { aiApi } from '../../lib/api';

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
            {entry.name}: {entry.value?.toFixed(1) || entry.value}
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
    className={`bg-white rounded-[24px] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-50 flex flex-col overflow-hidden relative ${
      colSpan === 2 ? 'col-span-2' : 'col-span-1'
    } md:col-span-auto ${className}`}
  >
    {children}
  </motion.div>
);

export default function StudentReportCard({ data, period, onPeriodChange, showHeader = true, autoOpenAI = false }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [aiReport, setAiReport] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [showAiModal, setShowAiModal] = useState(autoOpenAI);

  const student = data?.student || {};
  const testTimeline = data?.test_timeline || [];
  const subjectRadar = data?.subject_radar || [];
  const assignStats = data?.assignment_stats || { total: 0, submitted: 0 };
  const liveStats = data?.live_classes_stats || { total: 0, attended: 0, attendance_pct: 0 };
  const classAvgs = data?.class_averages || {};
  
  const attHeatmap = data?.attendance_heatmap || [];
  const testHeatmap = data?.test_heatmap || [];
  const vidHeatmap = data?.video_heatmap || [];
  
  // 1. Trend Data (Overall Performance)
  const trendData = useMemo(() => {
    return testTimeline.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(t => ({
      name: t.date ? format(parseISO(t.date), 'MMM dd') : 'Test',
      score: t.score_pct || 0,
      title: t.test_title
    }));
  }, [testTimeline]);

  // 2. Recent Quizzes
  const quizData = useMemo(() => {
    return trendData.slice(-7); // Last 7 tests
  }, [trendData]);

  // 3. Subject Performance vs Class Average
  const subjectData = useMemo(() => {
    return subjectRadar.map(s => {
      const classAvg = classAvgs.subject_test_averages?.[s.subject_id] || s.test_avg || 0;
      return {
        subject: s.subject.length > 7 ? s.subject.substring(0,6) + '..' : s.subject,
        diff: (s.test_avg || 0) - classAvg,
        score: s.test_avg || 0
      };
    });
  }, [subjectRadar, classAvgs]);

  // 4. Weekly Engagement (Aggr from heatmaps)
  const weeklyData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const aggr = days.map(day => ({ day, videos: 0, tests: 0, attendance: 0 }));
    
    vidHeatmap.forEach(v => {
      const d = parseISO(v.date).getDay();
      aggr[d].videos += (v.minutes || 0);
    });
    testHeatmap.forEach(t => {
      const d = parseISO(t.date).getDay();
      aggr[d].tests += (t.count || 0) * 30; // approx 30 mins per test
    });
    attHeatmap.forEach(a => {
      const d = parseISO(a.date).getDay();
      aggr[d].attendance += (a.present || 0) * 60; // approx 60 mins per class
    });
    return aggr;
  }, [vidHeatmap, testHeatmap, attHeatmap]);

  // Calendar logic
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({length: daysInMonth}, (_, i) => {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
      const hasTest = testHeatmap.some(t => t.date === dateStr);
      const hasAtt = attHeatmap.some(a => a.date === dateStr && a.present > 0);
      return { day: i + 1, hasTest, hasAtt };
    });
  }, [currentMonth, testHeatmap, attHeatmap]);

  const handleGenerateAI = async () => {
    setShowAiModal(true);
    if (aiReport) return;
    setLoadingAi(true);
    try {
      const res = await aiApi.generateStudentReport(data, period);
      setAiReport(res.report || 'Generated insights.');
    } catch (err) {
      setAiReport('Failed to generate insights.');
    } finally {
      setLoadingAi(false);
    }
  };

  const avgScore = student.avg_score || 0;
  const overallClassAvg = classAvgs?.overall?.avg_score || 0;

  return (
    <div className="min-h-screen bg-[#F4F7F6] pb-24 text-[#333333] font-sans">
      
      {showHeader && (
        <div className="pt-8 px-6 pb-6 flex justify-between items-center max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600 font-bold text-xl uppercase shadow-sm">
              {student.name ? student.name[0] : 'U'}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Hello, {student.name ? student.name.split(' ')[0] : 'User'}!</h1>
              <p className="text-xs text-gray-500">Welcome back to your dashboard</p>
            </div>
          </div>
          <div className="flex gap-2">
            <select 
              value={period} 
              onChange={e => onPeriodChange && onPeriodChange(e.target.value)}
              className="text-[10px] md:text-xs bg-white text-gray-600 rounded-full px-3 py-1.5 border border-gray-200 outline-none shadow-sm"
            >
              <option value="overall">Overall</option>
              <option value="month">This Month</option>
              <option value="week">This Week</option>
            </select>
            <button className="w-10 h-10 rounded-full bg-[#00C2C7] text-white flex items-center justify-center shadow-md shadow-[#00C2C7]/30">
              <Search size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Main Grid Layout - Masonry 2-col mobile, 4-col desktop */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="px-4 md:px-6 max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5 grid-flow-dense"
      >
        
        {/* 1. Main Trend Line */}
        <Card colSpan={2} className="md:col-span-2">
          <div className="mb-4">
            <h3 className="font-bold text-lg text-gray-900">Overall Performance</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Score timeline</p>
          </div>
          <div className="h-40 w-full -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <Line type="monotone" dataKey="score" stroke={theme.tertiary} strokeWidth={3} dot={false} activeDot={{ r: 6, fill: theme.secondary, stroke: '#fff', strokeWidth: 2 }} />
                <Tooltip content={<CustomTooltip />} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 2. Recent Quizzes */}
        <Card>
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-[13px] text-gray-900">Recent Quizzes</h3>
          </div>
          <div className="h-28 w-full mt-4 -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={quizData}>
                <Line type="linear" dataKey="score" stroke={theme.secondary} strokeWidth={2.5} dot={{ r: 4, fill: theme.primary, strokeWidth: 0 }} />
                <Tooltip content={<CustomTooltip />} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 3. Calendar */}
        <Card className="flex flex-col items-center">
          <div className="flex justify-between items-center w-full mb-3">
            <button className="p-1 text-[#00C2C7]" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
            <span className="font-bold text-[13px]">{format(currentMonth, 'MMMM')}</span>
            <button className="p-1 text-[#00C2C7]" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center w-full text-[9px] text-gray-400 font-bold uppercase mb-1">
            {['S','M','T','W','T','F','S'].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-1.5 gap-x-1 text-center w-full text-[11px] font-bold text-gray-700">
            {calendarDays.map((d, i) => (
              <div key={i} className={`flex justify-center items-center h-6 w-6 rounded-full mx-auto relative
                ${d.hasTest ? `border-2 border-[${theme.tertiary}] text-[${theme.tertiary}]` : ''}
                ${d.hasAtt && !d.hasTest ? `border-2 border-[${theme.primary}] text-[${theme.primary}]` : ''}
              `}>
                {d.day}
              </div>
            ))}
          </div>
        </Card>

        {/* 4. Quick Stats */}
        <Card className="flex flex-col justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-gray-800">{assignStats.total}</h2>
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Assignments Done</p>
            <div className="h-6 mt-1 w-full opacity-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData.slice(0, 10)}>
                  <Line type="monotone" dataKey="score" stroke={theme.secondary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-black text-gray-800">{liveStats.attended}</h2>
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Live Classes</p>
            <div className="h-6 mt-1 w-full opacity-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData.slice(-10)}>
                  <Line type="monotone" dataKey="score" stroke={theme.primary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        {/* 6. 75% Radial + Button (spans 2 rows intuitively based on layout order) */}
        <Card className="flex flex-col items-center justify-between py-6 row-span-2">
          <div className="text-center mb-2">
            <h3 className="font-bold text-[13px] text-gray-900">Course Progress</h3>
            <p className="text-[9px] font-bold text-gray-400 uppercase">Overall average</p>
          </div>
          
          <div className="relative w-28 h-28 md:w-36 md:h-36 flex items-center justify-center my-4">
            <svg className="w-full h-full transform -rotate-90 drop-shadow-sm">
              <circle cx="50%" cy="50%" r="42%" stroke="#F4F7F6" strokeWidth="12%" fill="none" />
              <circle cx="50%" cy="50%" r="42%" stroke={theme.primary} strokeWidth="12%" fill="none" strokeDasharray="264%" strokeDashoffset={`${264 - (avgScore/100)*264}%`} className="transition-all duration-1000 ease-out" strokeLinecap="round" />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-3xl font-black text-gray-800">{Math.round(avgScore)}%</span>
            </div>
          </div>

          <p className="text-[10px] text-center text-gray-400 font-medium px-2 leading-relaxed">Generated from your latest academic records.</p>
          
          <button 
            onClick={handleGenerateAI}
            className="mt-4 w-full py-2.5 bg-[#FFC436] hover:bg-yellow-400 transition-colors text-white text-[12px] font-bold rounded-full shadow-lg shadow-yellow-400/40"
          >
            Suscipit (AI Report)
          </button>
        </Card>

        {/* 5. Dual Circular Rings */}
        <Card className="flex justify-around items-center py-6">
          <div className="flex flex-col items-center">
            <div className="relative w-14 h-14 md:w-16 md:h-16 mb-2">
               <svg className="w-full h-full transform -rotate-90 drop-shadow-sm"><circle cx="50%" cy="50%" r="40%" stroke="#F4F7F6" strokeWidth="10%" fill="none" /><circle cx="50%" cy="50%" r="40%" stroke={theme.secondary} strokeWidth="10%" fill="none" strokeDasharray="251%" strokeDashoffset={`${251 - ((liveStats.attendance_pct || 0)/100)*251}%`} strokeLinecap="round" /></svg>
               <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">{Math.round(liveStats.attendance_pct || 0)}%</span>
            </div>
            <span className="font-bold text-[9px] uppercase tracking-wider text-gray-400">Attendance</span>
          </div>
          <div className="flex flex-col items-center">
             <div className="relative w-14 h-14 md:w-16 md:h-16 mb-2">
               <svg className="w-full h-full transform -rotate-90 drop-shadow-sm"><circle cx="50%" cy="50%" r="40%" stroke="#F4F7F6" strokeWidth="10%" fill="none" /><circle cx="50%" cy="50%" r="40%" stroke={theme.tertiary} strokeWidth="10%" fill="none" strokeDasharray="251%" strokeDashoffset={`${251 - ((assignStats.total ? assignStats.submitted/assignStats.total : 0))*251}%`} strokeLinecap="round" /></svg>
               <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">{assignStats.total ? Math.round((assignStats.submitted/assignStats.total)*100) : 0}%</span>
            </div>
            <span className="font-bold text-[9px] uppercase tracking-wider text-gray-400">Submissions</span>
          </div>
        </Card>

        {/* 7. Diverging Bar Chart */}
        <Card colSpan={2} className="md:col-span-2">
          <div className="flex flex-col mb-4">
             <h3 className="font-bold text-[13px] text-gray-900">Subject vs Average</h3>
             <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Deviation from class mean</span>
          </div>
          <div className="h-32 md:h-40 w-full -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="subject" tick={{fontSize: 9, fontWeight: 700, fill: '#888'}} axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: '#f4f7f6'}} content={<CustomTooltip />} />
                <Bar dataKey="diff" radius={[4, 4, 4, 4]} barSize={16}>
                  {subjectData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.diff >= 0 ? theme.primary : theme.secondary} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 8. Multi-Line Comparison Chart */}
        <Card colSpan={2} className="md:col-span-2">
          <div className="flex justify-between items-center mb-2">
             <h3 className="font-bold text-[13px] text-gray-900">Class Comparison</h3>
          </div>
          <div className="h-40 md:h-48 w-full -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={overallClassAvg} stroke={theme.secondary} strokeDasharray="4 4" strokeWidth={2} />
                <Line type="monotone" dataKey="score" stroke={theme.tertiary} strokeWidth={3} dot={{r:3, strokeWidth:0, fill:theme.tertiary}} name="Student" />
              </LineChart>
            </ResponsiveContainer>
          </div>
           <div className="flex justify-center gap-6 mt-1 text-[9px] font-bold uppercase tracking-wider text-gray-500">
             <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#7059FF]"></div> Student</div>
             <div className="flex items-center gap-1.5"><div className="w-2.5 h-1 border-t-2 border-dashed border-[#FFC436]"></div> Class Avg</div>
           </div>
        </Card>

        {/* 9. Horizontal Stacked Bar */}
        <Card className="flex flex-col justify-center py-6">
          <h3 className="font-bold text-[13px] text-gray-900 mb-4">Grade Breakdown</h3>
          <div className="w-full h-2.5 md:h-3 bg-gray-100 rounded-full flex overflow-hidden shadow-inner">
            <div className="bg-[#7059FF]" style={{width: '50%'}}></div>
            <div className="bg-[#00C2C7]" style={{width: '30%'}}></div>
            <div className="bg-[#FFC436]" style={{width: '20%'}}></div>
          </div>
          <div className="flex justify-between mt-4 text-[9px] font-bold uppercase tracking-wider text-gray-500">
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#7059FF]"></div> Exams</div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#00C2C7]"></div> HW</div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#FFC436]"></div> Quiz</div>
          </div>
        </Card>

        {/* 10. Timeline (Recent Tests) */}
        <Card className="flex flex-col justify-center">
          <h3 className="font-bold text-[13px] text-gray-900 mb-6">Recent Activity</h3>
          <div className="relative flex items-center justify-between w-full pb-4">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-100 -translate-y-1/2"></div>
            {testTimeline.slice(-4).reverse().map((t, i) => (
              <div key={i} className="relative z-10 flex flex-col items-center">
                <span className={`absolute ${i%2===0 ? 'bottom-4' : 'top-4'} text-[8px] font-bold text-white px-1.5 py-0.5 rounded shadow ${i%2===0 ? 'bg-[#00C2C7]' : 'bg-[#FFC436]'}`}>
                  {t.score_pct}%
                </span>
                <div className={`w-2.5 h-2.5 rounded-full ring-2 ring-white ${i%2===0 ? 'bg-[#00C2C7] mt-1' : 'bg-[#FFC436] mb-1'}`}></div>
              </div>
            ))}
            {testTimeline.length === 0 && <span className="text-xs text-gray-400 z-10 bg-white px-2">No recent activity</span>}
          </div>
        </Card>

        {/* 11. Grouped Bar Chart (Weekly Engagement) */}
        <Card colSpan={2} className="md:col-span-4">
           <div className="flex flex-col mb-4">
             <h3 className="font-bold text-[13px] text-gray-900">Weekly Engagement</h3>
             <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Time spent per day (Mins)</span>
           </div>
           <div className="h-40 md:h-48 w-full -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="day" tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: '#f4f7f6'}} content={<CustomTooltip />} />
                <Bar dataKey="videos" fill={theme.tertiary} radius={[3, 3, 0, 0]} name="Videos" barSize={12} />
                <Bar dataKey="tests" fill={theme.primary} radius={[3, 3, 0, 0]} name="Tests" barSize={12} />
                <Bar dataKey="attendance" fill={theme.secondary} radius={[3, 3, 0, 0]} name="Classes" barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

      </motion.div>

      {/* AI Mentor Floating FAB (Alternative way to open AI Modal) */}
      <div className="fixed bottom-[80px] right-6 md:bottom-8 md:right-8 z-50">
        <button 
          onClick={handleGenerateAI}
          className="bg-[#FFC436] text-white w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(255,196,54,0.5)] hover:scale-105 hover:bg-yellow-400 transition-all active:scale-95 border-4 border-white/50 group relative"
        >
           <Bot size={28} className="drop-shadow-md group-hover:rotate-12 transition-transform" />
           <span className="absolute top-0 right-0 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500 border border-white"></span>
          </span>
        </button>
      </div>

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
              className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl relative"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-[#FFC436]"><Bot size={20} /></div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">AI Mentor Report</h2>
                  <p className="text-xs text-gray-500">Personalized insights for {student.name}</p>
                </div>
              </div>
              
              <div className="min-h-[200px] max-h-[60vh] overflow-y-auto text-sm text-gray-700 leading-relaxed pr-2">
                {loadingAi ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-400 space-y-3">
                    <Loader2 size={24} className="animate-spin text-[#00C2C7]" />
                    <p className="font-medium text-xs">Analyzing algorithms and generating report...</p>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{aiReport}</div>
                )}
              </div>
              
              <button onClick={() => setShowAiModal(false)} className="mt-6 w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl transition-colors text-sm">
                Close
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
