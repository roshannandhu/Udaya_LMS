import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle, BookOpen, Calendar, Check, ChevronRight, ClipboardCheck,
  FileQuestion, Loader2, Plus, UserPlus, Video, X,
  MessageCircle, Edit3, CheckCircle, Activity, LayoutDashboard
} from 'lucide-react';
import { Skeleton, Btn } from '../../components/ui';
import { dashboardApi, joinRequestApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { useAppCache } from '../../store';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import { useShallow } from 'zustand/react/shallow';
import NotificationBell from '../../components/shared/NotificationBell';
import SubjectIcon from '../../components/shared/SubjectIcon';
import { pastelFor, pastelTokens } from '../../components/cards/pastel';
import { useTheme } from '../../lib/theme';
import { fadeUp, staggerChildren } from '../../lib/motion';
import PendingReattemptsCard from '../../components/teacher/PendingReattemptsCard';

// ── sessionStorage warm-cache ──────────
const readCache = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } };
const writeCache = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };

const getStdNum = (name = '') => { const m = String(name).match(/\d+/); return m ? m[0] : ''; };

const fmtWhen = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
};

// ── Components ──────────────────────────

function ActionDockItem({ icon: Icon, label, colorClass, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 group shrink-0 w-full md:w-[76px]">
      <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl md:rounded-3xl flex items-center justify-center shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-active:scale-95 ${colorClass}`}>
        <Icon size={22} strokeWidth={2.5} />
      </div>
      <span className="text-[10px] md:text-[11px] font-bold text-neutral-500 dark:text-neutral-400 text-center leading-tight group-hover:text-neutral-800 dark:group-hover:text-neutral-200 transition-colors">{label}</span>
    </button>
  );
}

function AttentionCard({ icon: Icon, tint, title, sub, onClick, actionNode }) {
  return (
    <div 
      onClick={onClick}
      className="flex-shrink-0 w-64 bg-white dark:bg-neutral-900 border border-[#EFEDEA] dark:border-neutral-800 rounded-[24px] p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col gap-3 relative overflow-hidden"
    >
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${tint}`}>
          <Icon size={22} strokeWidth={2.5} />
        </div>
        {actionNode && <div onClick={e => e.stopPropagation()}>{actionNode}</div>}
      </div>
      <div>
        <h4 className="text-[15px] font-bold text-neutral-800 dark:text-white leading-snug mb-1">{title}</h4>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">{sub}</p>
      </div>
    </div>
  );
}

function NeedsAttentionSection({ overview, onJoin, busyJoin, navigate }) {
  const joinItems  = overview?.join_requests?.items || [];
  const gradeItems = overview?.grading_queue?.items || [];
  const liveItems  = overview?.today_live || [];
  const testItems  = overview?.upcoming_tests || [];
  const lowItems   = overview?.low_attendance?.items || [];

  const items = [];

  joinItems.forEach(req => {
    items.push(
      <AttentionCard 
        key={`join-${req.id}`}
        icon={UserPlus} tint="bg-sky-50 dark:bg-sky-500/10 text-sky-500"
        title={`${req.student_name} wants to join`}
        sub={req.standard_name}
        actionNode={
          <div className="flex gap-1.5">
            <button disabled={busyJoin[req.id]} onClick={() => onJoin(req, 'reject')} className="w-8 h-8 rounded-full flex items-center justify-center bg-red-50 dark:bg-red-500/10 text-red-500 hover:bg-red-100 dark:hover:bg-red-500/20 disabled:opacity-50 transition-colors"><X size={16} strokeWidth={3} /></button>
            <button disabled={busyJoin[req.id]} onClick={() => onJoin(req, 'approve')} className="w-8 h-8 rounded-full flex items-center justify-center bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50 transition-colors">{busyJoin[req.id] ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}</button>
          </div>
        }
      />
    );
  });

  liveItems.forEach(l => {
    items.push(
      <AttentionCard key={`live-${l.id}`} icon={Video} tint="bg-rose-50 dark:bg-rose-500/10 text-rose-500" title={`Live: ${l.subject || l.title || 'Class'}`} sub={l.status === 'live' ? 'Happening now' : fmtWhen(l.scheduled_at)} onClick={() => navigate('/teacher/live-classes')} />
    );
  });

  testItems.forEach(t => {
    items.push(
      <AttentionCard key={`test-${t.id}`} icon={FileQuestion} tint="bg-amber-50 dark:bg-amber-500/10 text-amber-500" title={`Test: ${t.title}`} sub={t.status === 'active' ? 'Running now' : fmtWhen(t.scheduled_for)} onClick={() => navigate('/teacher/tests')} />
    );
  });

  if (gradeItems.length > 0) {
    items.push(
      <AttentionCard key="grade" icon={ClipboardCheck} tint="bg-violet-50 dark:bg-violet-500/10 text-violet-500" title={`${gradeItems.length} answer${gradeItems.length === 1 ? '' : 's'} to check`} sub={gradeItems[0] ? `${gradeItems[0].student_name} · ${gradeItems[0].assignment_title}` : ''} onClick={() => navigate(gradeItems[0]?.class_id ? `/teacher/standards/${gradeItems[0].standard_id}/subjects/${gradeItems[0].class_id}` : '/teacher/standards')} />
    );
  }

  if (lowItems.length > 0) {
    items.push(
      <AttentionCard key="attend" icon={AlertCircle} tint="bg-orange-50 dark:bg-orange-500/10 text-orange-500" title={`${lowItems.length} student${lowItems.length === 1 ? '' : 's'} missing classes`} sub={lowItems.slice(0, 2).map(x => x.name).join(', ')} onClick={() => navigate('/teacher/reports')} />
    );
  }

  if (items.length === 0) return null;

  return (
    <motion.div variants={fadeUp} className="mb-2 -mx-5 md:mx-0">
      <div className="px-5 md:px-0 mb-3 flex items-center justify-between">
        <h2 className="text-[12px] font-extrabold uppercase tracking-[0.15em] text-neutral-400">Needs Attention</h2>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 px-5 md:px-1 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        {items.map((item, i) => (
          <div key={i} className="snap-start">{item}</div>
        ))}
      </div>
    </motion.div>
  );
}

function NewClassCard({ std, sid, studentCount, subjectCount, navigate, dark, overview }) {
  const num = getStdNum(std.name);
  const pastel = pastelTokens(pastelFor(std.name), dark);
  
  const healthScore = Math.floor(Math.random() * 20) + 80;
  
  // High contrast text colors for extreme mode
  const isLight = !dark;
  const textColor = isLight ? 'text-neutral-900' : 'text-white';
  const subTextColor = isLight ? 'text-neutral-700' : 'text-white/80';
  
  return (
    <motion.div variants={fadeUp} 
      onClick={() => navigate(`/teacher/standards/${sid}`)}
      className="relative rounded-2xl md:rounded-[24px] shadow-sm hover:shadow-xl overflow-hidden cursor-pointer group transition-all duration-300 md:col-span-1"
      style={{ backgroundColor: pastel.hex }}
    >
      {/* Decorative large number/emoji watermarks */}
      <div className="absolute -bottom-4 -right-4 md:-bottom-6 md:-right-6 text-7xl md:text-9xl font-black opacity-10 pointer-events-none transform group-hover:scale-110 transition-transform duration-500" style={{ color: isLight ? '#000' : '#fff' }}>
        {num || <SubjectIcon value={std.emoji} fallback="graduation" />}
      </div>
      
      {/* Laptop Layout (md:flex-row), Phone layout (just compact square) */}
      <div className="p-4 md:p-6 relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6 h-full">
        
        {/* Left Side: Icon & Details */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-16 md:h-16 rounded-[14px] md:rounded-3xl flex items-center justify-center text-lg md:text-3xl font-black shadow-sm" style={{ backgroundColor: isLight ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.3)', color: pastel.fgHex }}>
            {num || <SubjectIcon value={std.emoji} fallback="graduation" />}
          </div>
          
          <div>
            <h3 className={`text-[16px] md:text-[22px] font-black leading-tight truncate mb-0.5 md:mb-1 ${textColor}`} style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
              {std.name}
            </h3>
            {/* Hide stats on mobile */}
            <p className={`hidden md:block text-[13px] font-bold uppercase tracking-wider ${subTextColor}`}>
              {studentCount} Student{studentCount === 1 ? '' : 's'} <span className="opacity-50 mx-1">•</span> {subjectCount} Subject{subjectCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* Right Side: Health Widget - hidden on mobile */}
        <div className="hidden md:block self-start md:self-auto flex-shrink-0">
          <div className={`flex items-center gap-1.5 px-4 py-2 rounded-full ${isLight ? 'bg-white/60' : 'bg-black/30'} backdrop-blur-md shadow-sm border ${isLight ? 'border-white/50' : 'border-white/10'}`}>
            <Activity size={14} className={textColor} strokeWidth={3} />
            <span className={`text-sm font-black ${textColor}`}>{healthScore}%</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function TodayPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const dark = useTheme(s => s.dark);
  const { standards, subjects, students, standardsReady, refreshStandards, refreshSubjects, refreshStudents } =
    useAppCache(useShallow(s => ({
      standards:        s.standards,
      subjects:         s.subjects,
      students:         s.students,
      standardsReady:   s.standardsReady,
      refreshStandards: s.refreshStandards,
      refreshSubjects:  s.refreshSubjects,
      refreshStudents:  s.refreshStudents,
    })));

  const [overview, setOverview] = useState(() => readCache('tutoria_dash_overview'));
  const [loading, setLoading]   = useState(!readCache('tutoria_dash_overview'));
  const [busyJoin, setBusyJoin] = useState({});

  const now = new Date();
  const displayName = user?.name?.split(' ')[0] || 'Teacher';
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  const loadDashboard = useCallback(async () => {
    refreshStandards?.();
    refreshSubjects?.();
    refreshStudents?.();
    try {
      const ov = await dashboardApi.getOverview();
      setOverview(ov);
      writeCache('tutoria_dash_overview', ov);
    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }, [refreshStandards, refreshSubjects, refreshStudents]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useAutoRefresh(loadDashboard);

  const handleJoin = async (req, action) => {
    setBusyJoin(prev => ({ ...prev, [req.id]: true }));
    try {
      await joinRequestApi[action](req.id);
      setOverview(prev => {
        if (!prev) return prev;
        const items = (prev.join_requests?.items || []).filter(r => r.id !== req.id);
        const next = { ...prev, join_requests: { count: Math.max(0, (prev.join_requests?.count || 1) - 1), items } };
        writeCache('tutoria_dash_overview', next);
        return next;
      });
      if (action === 'approve') refreshStudents?.();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Action failed');
    } finally {
      setBusyJoin(prev => { const n = { ...prev }; delete n[req.id]; return n; });
    }
  };

  const getBriefing = () => {
    const live = overview?.today_live?.length || 0;
    const joins = overview?.join_requests?.items?.length || 0;
    if (live > 0 && joins > 0) return `You have ${live} live class${live > 1 ? 'es' : ''} today and ${joins} student${joins > 1 ? 's' : ''} waiting to join.`;
    if (live > 0) return `You have ${live} live class${live > 1 ? 'es' : ''} scheduled for today.`;
    if (joins > 0) return `You have ${joins} student${joins > 1 ? 's' : ''} waiting to join your classes.`;
    return "Your schedule is completely clear right now. Great job!";
  };

  if (loading && !overview) {
    return (
      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto space-y-8">
        <Skeleton className="h-[120px] rounded-[24px]" />
        <Skeleton className="h-24 rounded-2xl w-full" />
        <div className="grid grid-cols-2 lg:grid-cols-2 gap-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 md:h-40 rounded-[24px]" />)}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas dark:bg-neutral-950 pb-24 lg:pb-8 transition-colors duration-300">
      {/* Mobile header */}
      <div className="lg:hidden sticky top-0 z-30 pt-[max(env(safe-area-inset-top),1rem)] bg-canvas/80 dark:bg-neutral-950/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5">
        <div className="px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-black text-sm shadow-sm">
              {displayName.charAt(0)}
            </div>
            <div>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase tracking-[0.2em] font-extrabold">{greeting}</p>
              <h1 className="text-[16px] font-black leading-tight text-neutral-900 dark:text-white">{displayName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate('/teacher/attendance')} className="p-2 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors">
              <Calendar size={22} strokeWidth={2.5} />
            </button>
            <NotificationBell />
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        <motion.div variants={staggerChildren} initial="hidden" animate="show" className="flex flex-col gap-8 md:gap-10">

          {/* Desktop Header */}
          <motion.div variants={fadeUp} className="hidden lg:flex items-end justify-between">
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 font-black mb-1 uppercase tracking-widest">{greeting},</p>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-neutral-900 dark:text-white" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                {displayName}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-[13px] font-black text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-900 px-5 py-2.5 rounded-full shadow-sm border border-neutral-100 dark:border-neutral-800">
                {now.toLocaleDateString('en-IN', { weekday: 'short', month: 'long', day: 'numeric' })}
              </p>
              <NotificationBell />
            </div>
          </motion.div>

          {/* Assistant Briefing Banner */}
          <motion.div variants={fadeUp} className="bg-gradient-to-br from-emerald-600 to-teal-700 dark:from-emerald-800 dark:to-teal-900 rounded-[28px] p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-white opacity-10 rounded-full blur-2xl"></div>
            <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-32 h-32 bg-white opacity-10 rounded-full blur-xl"></div>
            
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-emerald-100 dark:text-emerald-300 text-[11px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                  <Activity size={16} strokeWidth={3} /> Today's Briefing
                </h2>
                <p className="text-2xl md:text-3xl font-bold leading-snug max-w-2xl" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                  {getBriefing()}
                </p>
              </div>
              <button 
                onClick={() => navigate('/teacher/live-classes')}
                className="self-start md:self-auto px-8 py-4 bg-white text-emerald-800 dark:bg-emerald-400 dark:text-emerald-950 font-black rounded-full text-sm hover:scale-105 active:scale-95 transition-all shadow-md whitespace-nowrap"
              >
                View Schedule
              </button>
            </div>
          </motion.div>

          {/* Quick Action Dock - Grid on Mobile, Flex on Desktop */}
          <motion.div variants={fadeUp} className="bg-white/70 dark:bg-neutral-900/70 backdrop-blur-md border border-neutral-100 dark:border-neutral-800 rounded-[28px] p-4 md:p-5 shadow-sm">
             <div className="grid grid-cols-4 gap-2 md:flex md:justify-around items-start">
               <ActionDockItem icon={MessageCircle} label="Broadcast" colorClass="bg-blue-50 dark:bg-blue-500/10 text-blue-500" onClick={() => navigate('/teacher/broadcasts')} />
               <ActionDockItem icon={Edit3} label="New Test" colorClass="bg-amber-50 dark:bg-amber-500/10 text-amber-500" onClick={() => navigate('/teacher/tests')} />
               <ActionDockItem icon={Video} label="Live Class" colorClass="bg-rose-50 dark:bg-rose-500/10 text-rose-500" onClick={() => navigate('/teacher/live-classes')} />
               <ActionDockItem icon={CheckCircle} label="Attendance" colorClass="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500" onClick={() => navigate('/teacher/attendance')} />
             </div>
          </motion.div>

          {/* Pending Reattempts */}
          <PendingReattemptsCard />

          {/* Needs Attention Carousel */}
          <NeedsAttentionSection overview={overview} onJoin={handleJoin} busyJoin={busyJoin} navigate={navigate} />

          {/* My Classes Grid */}
          <motion.div variants={fadeUp}>
            {/* Centered My Classes Header with proper spacing */}
            <div className="grid grid-cols-3 items-center mb-6">
              <div className="col-span-1"></div>
              <h2 className="col-span-1 text-center text-[24px] md:text-[28px] font-black tracking-tight text-neutral-900 dark:text-white whitespace-nowrap" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                My Classes
              </h2>
              <div className="col-span-1 flex justify-end">
                <button 
                  onClick={() => navigate('/teacher/standards')} 
                  className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 px-3 py-1.5 md:px-4 md:py-2 rounded-full flex items-center gap-1 transition-colors"
                >
                  <Plus size={14} strokeWidth={3} /> <span className="hidden md:inline">Add</span>
                </button>
              </div>
            </div>
            
            {standards.length === 0 ? (
              standardsReady ? (
                <div className="bg-white dark:bg-neutral-900 rounded-[32px] shadow-sm border border-[#EFEDEA] dark:border-neutral-800 flex flex-col items-center text-center py-20 px-6">
                  <div className="w-24 h-24 rounded-[32px] bg-sky-50 dark:bg-sky-500/10 text-sky-500 flex items-center justify-center mb-6">
                    <BookOpen size={48} strokeWidth={2} />
                  </div>
                  <p className="text-2xl font-black text-neutral-900 dark:text-white mb-3">No classes yet</p>
                  <p className="text-[16px] text-neutral-500 dark:text-neutral-400 mb-8 max-w-sm">Create your first class to start managing students, tests, and live sessions.</p>
                  <Btn variant="primary" onClick={() => navigate('/teacher/standards')} className="rounded-full px-8 py-4 shadow-lg text-[15px]">
                    <Plus size={20} strokeWidth={2.5} className="mr-2" /> Create First Class
                  </Btn>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-2 gap-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32 md:h-40 rounded-[28px]" />)}</div>
              )
            ) : (
              // 1-column grid on mobile, 2/3-column wide on desktop
              <motion.div variants={staggerChildren} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-5 items-start">
                {standards.map(std => {
                  const studentCount = students.filter(s => s.standard_id === std.id).length;
                  const subjectCount = subjects.filter(c => c.standard_id === std.id).length;
                  return (
                    <NewClassCard 
                      key={std.id} 
                      std={std} 
                      sid={std.id} 
                      studentCount={studentCount}
                      subjectCount={subjectCount}
                      navigate={navigate} 
                      dark={dark} 
                      overview={overview}
                    />
                  );
                })}
              </motion.div>
            )}
          </motion.div>

        </motion.div>
      </div>
    </div>
  );
}
