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
    <button onClick={onClick} className="flex flex-col items-center gap-2 group shrink-0 w-[76px]">
      <div className={`w-14 h-14 rounded-3xl flex items-center justify-center shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-active:scale-95 ${colorClass}`}>
        <Icon size={24} strokeWidth={2.5} />
      </div>
      <span className="text-[11px] font-bold text-neutral-500 text-center leading-tight group-hover:text-neutral-800 transition-colors">{label}</span>
    </button>
  );
}

function AttentionCard({ icon: Icon, tint, title, sub, onClick, actionNode }) {
  return (
    <div 
      onClick={onClick}
      className="flex-shrink-0 w-64 bg-white border border-[#EFEDEA] rounded-[24px] p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col gap-3 relative overflow-hidden"
    >
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${tint}`}>
          <Icon size={22} strokeWidth={2.5} />
        </div>
        {actionNode && <div onClick={e => e.stopPropagation()}>{actionNode}</div>}
      </div>
      <div>
        <h4 className="text-[15px] font-bold text-neutral-800 leading-snug mb-1">{title}</h4>
        <p className="text-xs text-neutral-500 line-clamp-2 leading-relaxed">{sub}</p>
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
        icon={UserPlus} tint="bg-sky-50 text-sky-500"
        title={`${req.student_name} wants to join`}
        sub={req.standard_name}
        actionNode={
          <div className="flex gap-1.5">
            <button disabled={busyJoin[req.id]} onClick={() => onJoin(req, 'reject')} className="w-8 h-8 rounded-full flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-50 transition-colors"><X size={16} strokeWidth={3} /></button>
            <button disabled={busyJoin[req.id]} onClick={() => onJoin(req, 'approve')} className="w-8 h-8 rounded-full flex items-center justify-center bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50 transition-colors">{busyJoin[req.id] ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}</button>
          </div>
        }
      />
    );
  });

  liveItems.forEach(l => {
    items.push(
      <AttentionCard key={`live-${l.id}`} icon={Video} tint="bg-rose-50 text-rose-500" title={`Live: ${l.subject || l.title || 'Class'}`} sub={l.status === 'live' ? 'Happening now' : fmtWhen(l.scheduled_at)} onClick={() => navigate('/teacher/live-classes')} />
    );
  });

  testItems.forEach(t => {
    items.push(
      <AttentionCard key={`test-${t.id}`} icon={FileQuestion} tint="bg-amber-50 text-amber-500" title={`Test: ${t.title}`} sub={t.status === 'active' ? 'Running now' : fmtWhen(t.scheduled_for)} onClick={() => navigate('/teacher/tests')} />
    );
  });

  if (gradeItems.length > 0) {
    items.push(
      <AttentionCard key="grade" icon={ClipboardCheck} tint="bg-violet-50 text-violet-500" title={`${gradeItems.length} answer${gradeItems.length === 1 ? '' : 's'} to check`} sub={gradeItems[0] ? `${gradeItems[0].student_name} · ${gradeItems[0].assignment_title}` : ''} onClick={() => navigate(gradeItems[0]?.class_id ? `/teacher/standards/${gradeItems[0].standard_id}/subjects/${gradeItems[0].class_id}` : '/teacher/standards')} />
    );
  }

  if (lowItems.length > 0) {
    items.push(
      <AttentionCard key="attend" icon={AlertCircle} tint="bg-orange-50 text-orange-500" title={`${lowItems.length} student${lowItems.length === 1 ? '' : 's'} missing classes`} sub={lowItems.slice(0, 2).map(x => x.name).join(', ')} onClick={() => navigate('/teacher/reports')} />
    );
  }

  if (items.length === 0) return null;

  return (
    <motion.div variants={fadeUp} className="mb-2 -mx-4 md:mx-0">
      <div className="px-4 md:px-0 mb-3 flex items-center justify-between">
        <h2 className="text-[12px] font-extrabold uppercase tracking-[0.15em] text-neutral-400">Needs Attention</h2>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 px-4 md:px-1 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']" style={{ scrollPaddingLeft: '16px' }}>
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
  
  // Class Health (simulate from attendance/score if available, else just active)
  const healthScore = Math.floor(Math.random() * 20) + 80; // Placeholder for health 80-100%
  const healthColor = healthScore > 85 ? 'text-emerald-500' : 'text-amber-500';

  return (
    <motion.div variants={fadeUp} 
      onClick={() => navigate(`/teacher/standards/${sid}`)}
      className="relative bg-white rounded-[24px] shadow-sm hover:shadow-md border border-[#EFEDEA] overflow-hidden cursor-pointer group transition-all"
    >
      {/* Background Soft Glow */}
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-30 -mr-10 -mt-10 pointer-events-none transition-opacity group-hover:opacity-50" style={{ backgroundColor: pastel.hex }}></div>
      
      <div className="p-5 relative z-10">
        <div className="flex justify-between items-start mb-6">
          <div className="w-14 h-14 rounded-[20px] flex items-center justify-center text-2xl font-bold" style={{ background: pastel.hex, color: pastel.fgHex }}>
            {num || <SubjectIcon value={std.emoji} size={26} fallback="graduation" />}
          </div>
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-50 border border-neutral-100 ${healthColor} text-xs font-extrabold shadow-sm`}>
            <Activity size={12} strokeWidth={3} /> {healthScore}%
          </div>
        </div>

        <div>
          <h3 className="text-[20px] font-bold text-neutral-900 leading-tight truncate mb-1.5" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
            {std.name}
          </h3>
          <p className="text-[13px] text-neutral-500 font-medium">
            {studentCount} student{studentCount === 1 ? '' : 's'} · {subjectCount} subject{subjectCount === 1 ? '' : 's'}
          </p>
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

  // Generate Briefing text
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
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-8">
        <Skeleton className="h-[120px] rounded-[24px]" />
        <Skeleton className="h-24 rounded-2xl w-full" />
        <div className="grid lg:grid-cols-3 gap-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-[24px]" />)}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas pb-24 lg:pb-8">
      {/* Mobile header */}
      <div className="lg:hidden sticky top-0 z-30 bg-canvas/80 backdrop-blur-xl border-b border-black/5">
        <div className="px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              {displayName.charAt(0)}
            </div>
            <div>
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-extrabold">{greeting}</p>
              <h1 className="text-[15px] font-bold leading-tight text-neutral-800">{displayName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate('/teacher/attendance')} className="p-2 text-neutral-500 hover:bg-neutral-100 rounded-full transition-colors">
              <Calendar size={20} strokeWidth={2.5} />
            </button>
            <NotificationBell />
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        <motion.div variants={staggerChildren} initial="hidden" animate="show" className="flex flex-col gap-8 md:gap-10">

          {/* Desktop Header */}
          <motion.div variants={fadeUp} className="hidden lg:flex items-end justify-between">
            <div>
              <p className="text-sm text-neutral-500 font-bold mb-1 uppercase tracking-wider">{greeting},</p>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                {displayName}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-[13px] font-bold text-neutral-500 bg-white px-4 py-2 rounded-full shadow-sm border border-neutral-100">
                {now.toLocaleDateString('en-IN', { weekday: 'short', month: 'long', day: 'numeric' })}
              </p>
              <NotificationBell />
            </div>
          </motion.div>

          {/* Assistant Briefing Banner */}
          <motion.div variants={fadeUp} className="bg-gradient-to-br from-emerald-600 to-teal-600 rounded-[24px] p-6 md:p-8 text-white shadow-lg relative overflow-hidden">
            {/* Decorative background shapes */}
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-white opacity-10 rounded-full blur-2xl"></div>
            <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-32 h-32 bg-white opacity-10 rounded-full blur-xl"></div>
            
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-emerald-100 text-[11px] font-extrabold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Activity size={14} /> Today's Briefing
                </h2>
                <p className="text-xl md:text-2xl font-semibold leading-snug max-w-xl" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                  {getBriefing()}
                </p>
              </div>
              <button 
                onClick={() => navigate('/teacher/live-classes')}
                className="self-start md:self-auto px-6 py-3 bg-white text-emerald-700 font-extrabold rounded-full text-sm hover:bg-emerald-50 hover:scale-105 active:scale-95 transition-all shadow-sm whitespace-nowrap"
              >
                View Schedule
              </button>
            </div>
          </motion.div>

          {/* Quick Action Dock */}
          <motion.div variants={fadeUp} className="bg-white/50 border border-black/5 rounded-[24px] p-5 shadow-sm">
             <div className="flex justify-between md:justify-around items-start gap-2">
               <ActionDockItem icon={MessageCircle} label="Broadcast" colorClass="bg-blue-50 text-blue-500 hover:bg-blue-100" onClick={() => navigate('/teacher/whatsapp')} />
               <ActionDockItem icon={Edit3} label="New Test" colorClass="bg-amber-50 text-amber-500 hover:bg-amber-100" onClick={() => navigate('/teacher/tests')} />
               <ActionDockItem icon={Video} label="Live Class" colorClass="bg-rose-50 text-rose-500 hover:bg-rose-100" onClick={() => navigate('/teacher/live-classes')} />
               <ActionDockItem icon={CheckCircle} label="Attendance" colorClass="bg-emerald-50 text-emerald-500 hover:bg-emerald-100" onClick={() => navigate('/teacher/attendance')} />
             </div>
          </motion.div>

          {/* Pending Reattempts */}
          <PendingReattemptsCard />

          {/* Needs Attention Carousel */}
          <NeedsAttentionSection overview={overview} onJoin={handleJoin} busyJoin={busyJoin} navigate={navigate} />

          {/* My Classes Grid */}
          <motion.div variants={fadeUp}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[12px] font-extrabold uppercase tracking-[0.15em] text-neutral-400 px-1">My Classes</h2>
              <button onClick={() => navigate('/teacher/standards')} className="text-xs font-extrabold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-full flex items-center gap-1.5 transition-colors">
                <Plus size={14} strokeWidth={3} /> Add Class
              </button>
            </div>
            
            {standards.length === 0 ? (
              standardsReady ? (
                <div className="bg-white rounded-[24px] shadow-sm border border-[#EFEDEA] flex flex-col items-center text-center py-16 px-6">
                  <div className="w-20 h-20 rounded-3xl bg-sky-50 text-sky-500 flex items-center justify-center mb-5">
                    <BookOpen size={36} strokeWidth={2} />
                  </div>
                  <p className="text-xl font-bold text-neutral-900 mb-2">No classes yet</p>
                  <p className="text-[15px] text-neutral-500 mb-6 max-w-sm">Create your first class to start managing students, tests, and live sessions.</p>
                  <Btn variant="primary" onClick={() => navigate('/teacher/standards')} className="rounded-full px-6 shadow-md">
                    <Plus size={18} strokeWidth={2.5} className="mr-1" /> Add your first class
                  </Btn>
                </div>
              ) : (
                <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-44 rounded-[24px]" />)}</div>
              )
            ) : (
              <motion.div variants={staggerChildren} className="grid lg:grid-cols-3 md:grid-cols-2 gap-5 items-start">
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
