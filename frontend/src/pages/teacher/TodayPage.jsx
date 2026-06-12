import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users, BookOpen, FileQuestion, Calendar, AlertCircle, MessageSquare,
  UserPlus, Activity, Sparkles, Video, ClipboardCheck, Check, Plus,
  ChevronRight, Target, TrendingUp, X, Loader2
} from 'lucide-react';
import { Avatar, Skeleton, Btn } from '../../components/ui';
import StatCard from '../../components/cards/StatCard';
import Card from '../../components/cards/Card';
import EventCard from '../../components/cards/EventCard';
import { dashboardApi, joinRequestApi, reminderApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { useAppCache } from '../../store';
import NotificationBell from '../../components/shared/NotificationBell';
import SubjectIcon from '../../components/shared/SubjectIcon';
import { PASTEL, pastelFor } from '../../components/cards/pastel';
import { fadeUp, staggerChildren } from '../../lib/motion';
import CopySuspectsCard from '../../components/teacher/dashboard/CopySuspectsCard';
import VideoEngagementCard from '../../components/teacher/dashboard/VideoEngagementCard';
import AssignmentStatusCard from '../../components/teacher/dashboard/AssignmentStatusCard';
import LiveAbsenteesCard from '../../components/teacher/dashboard/LiveAbsenteesCard';
import PerformanceSnapshotCard from '../../components/teacher/dashboard/PerformanceSnapshotCard';

// ── sessionStorage warm-cache (instant re-render, no skeleton flash) ──────────
const readCache = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } };
const writeCache = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ── Action Center row ─────────────────────────────────────────────────────────
const ATTN = {
  join:     { icon: UserPlus,       tile: 'bg-sky-50 text-sky-600' },
  grade:    { icon: ClipboardCheck, tile: 'bg-violet-50 text-violet-600' },
  attend:   { icon: AlertCircle,    tile: 'bg-orange-50 text-orange-600' },
};

function ActionRow({ kind, eyebrow, title, meta, onClick, children }) {
  const k = ATTN[kind] || ATTN.grade;
  const Icon = k.icon;
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { onClick } : {})}
      className={`w-full flex items-center gap-4 p-4 text-left border-b border-black/5 last:border-0 transition-colors group ${onClick ? 'hover:bg-neutral-50' : ''}`}
    >
      <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${k.tile}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-widest mb-0.5 text-neutral-400">{eyebrow}</p>
        <h4 className="font-bold text-neutral-900 leading-snug truncate">{title}</h4>
        {meta && <p className="text-xs text-neutral-500 mt-0.5 truncate">{meta}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {children || (onClick && <ChevronRight size={18} className="text-neutral-300 group-hover:text-neutral-500 transition-colors" />)}
      </div>
    </Wrapper>
  );
}

export default function TodayPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const standards        = useAppCache(s => s.standards);
  const subjects         = useAppCache(s => s.subjects);
  const students         = useAppCache(s => s.students);
  const refreshStandards = useAppCache(s => s.refreshStandards);
  const refreshSubjects  = useAppCache(s => s.refreshSubjects);
  const refreshStudents  = useAppCache(s => s.refreshStudents);

  const [overview, setOverview]   = useState(() => readCache('tutoria_dash_overview'));
  const [activities, setActivities] = useState(() => readCache('tutoria_dash_activity') || []);
  const [reminders, setReminders] = useState(() => readCache('tutoria_dash_reminders') || []);
  const [insights, setInsights]   = useState(() => readCache('tutoria_dash_insights'));
  const [loading, setLoading]     = useState(!readCache('tutoria_dash_overview'));
  const [busyJoin, setBusyJoin]   = useState({});      // {requestId: true}
  const [newReminder, setNewReminder] = useState('');
  const [addingReminder, setAddingReminder] = useState(false);

  const now = new Date();
  const displayName = user?.name?.split(' ')[0] || 'Teacher';
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    refreshStandards?.();
    refreshSubjects?.();
    refreshStudents?.();
    (async () => {
      try {
        const [ov, act, rem] = await Promise.all([
          dashboardApi.getOverview(),
          dashboardApi.getActivity().catch(() => ({ activities: [] })),
          reminderApi.list().catch(() => []),
        ]);
        setOverview(ov);             writeCache('tutoria_dash_overview', ov);
        const acts = act?.activities || [];
        setActivities(acts);         writeCache('tutoria_dash_activity', acts);
        const rems = Array.isArray(rem) ? rem : [];
        setReminders(rems);          writeCache('tutoria_dash_reminders', rems);
      } catch (err) {
        console.error('Dashboard error:', err);
      } finally {
        setLoading(false);
      }
    })();
    // The insights endpoint is heavier (answer-similarity etc.) — fetch it
    // independently so the page never blocks on it.
    dashboardApi.getInsights()
      .then(ins => { setInsights(ins); writeCache('tutoria_dash_insights', ins); })
      .catch(err => console.error('Insights error:', err));
  }, []);

  const standardIdForClass = (classId) => subjects.find(s => s.id === classId)?.standard_id;

  // ── Inline actions ──────────────────────────────────────────────────────────
  const handleJoin = async (req, action) => {
    setBusyJoin(prev => ({ ...prev, [req.id]: true }));
    try {
      await joinRequestApi[action](req.id);
      setOverview(prev => {
        if (!prev) return prev;
        const items = prev.join_requests.items.filter(r => r.id !== req.id);
        const next = { ...prev, join_requests: { count: Math.max(0, prev.join_requests.count - 1), items } };
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

  const addReminder = async () => {
    const title = newReminder.trim();
    if (!title) return;
    setAddingReminder(true);
    try {
      const created = await reminderApi.create({ title });
      setReminders(prev => { const n = [created, ...prev]; writeCache('tutoria_dash_reminders', n); return n; });
      setNewReminder('');
    } catch (err) {
      console.error(err);
    } finally {
      setAddingReminder(false);
    }
  };

  const toggleReminder = async (r) => {
    const done = !r.done;
    setReminders(prev => { const n = prev.map(x => x.id === r.id ? { ...x, done } : x); writeCache('tutoria_dash_reminders', n); return n; });
    try {
      await reminderApi.update(r.id, { done });
    } catch (err) {
      console.error(err);
      setReminders(prev => prev.map(x => x.id === r.id ? { ...x, done: !done } : x)); // revert
    }
  };

  const removeReminder = async (r) => {
    setReminders(prev => { const n = prev.filter(x => x.id !== r.id); writeCache('tutoria_dash_reminders', n); return n; });
    try { await reminderApi.remove(r.id); } catch (err) { console.error(err); }
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const counts = overview?.counts || {};
  const perf = overview?.performance || {};
  const joinReqs = overview?.join_requests || { count: 0, items: [] };
  const grading = overview?.grading_queue || { count: 0, items: [] };
  const lowAtt = overview?.low_attendance || { count: 0, items: [] };
  const todayLive = overview?.today_live || [];
  const upcomingTests = overview?.upcoming_tests || [];
  const topStudents = overview?.top_students || [];

  const hasAttention = joinReqs.count > 0 || grading.count > 0 || lowAtt.count > 0;
  const countFor = (sid) => ({
    subjects: subjects.filter(s => s.standard_id === sid).length,
    students: students.filter(s => s.standard_id === sid).length,
  });

  const fmtWhen = (d) => {
    if (!d) return '';
    const date = new Date(d);
    const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
    const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
    if (date.toDateString() === tmr.toDateString()) return `Tomorrow, ${time}`;
    return `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
  };

  const quickActions = [
    { label: 'Create test',    icon: FileQuestion,  to: '/teacher/tests',         color: 'lavender' },
    { label: 'Send broadcast', icon: MessageSquare, to: '/teacher/broadcasts',    color: 'sky' },
    { label: 'Add student',    icon: UserPlus,      to: '/teacher/students',      color: 'peach' },
    { label: 'Schedule live',  icon: Video,         to: '/teacher/live-classes',  color: 'mint' },
    { label: 'Mark attendance',icon: Calendar,      to: '/teacher/attendance',    color: 'cream' },
    { label: 'View reports',   icon: TrendingUp,    to: '/teacher/reports',       color: 'pink' },
  ];

  if (loading && !overview) {
    return (
      <div className="px-5 md:px-8 py-6 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-12 w-64 rounded-card" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-card" />)}</div>
        <Skeleton className="h-56 w-full rounded-card" />
        <div className="grid lg:grid-cols-3 gap-6"><Skeleton className="lg:col-span-2 h-72 rounded-card" /><Skeleton className="h-72 rounded-card" /></div>
      </div>
    );
  }

  return (
    <div>
      {/* Mobile header (desktop uses the TopNav) */}
      <div className="lg:hidden sticky top-0 z-30 bg-canvas">
        <div className="px-5 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-neutral-500">{greeting},</p>
            <h1 className="text-base font-semibold leading-tight">{displayName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/teacher/attendance')} className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-black/5 rounded-full transition-colors">
              <Calendar size={20} />
            </button>
            <NotificationBell />
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-6xl mx-auto">
        <motion.div variants={staggerChildren} initial="hidden" animate="show" className="flex flex-col gap-6">

          {/* ── Header (desktop) ── */}
          <motion.div variants={fadeUp} className="hidden lg:flex items-end justify-between">
            <div>
              <p className="text-sm text-neutral-500">{greeting}, {displayName}</p>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                Here's your day
              </h1>
            </div>
            <p className="text-sm text-neutral-500">{now.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </motion.div>

          {/* ── 1. STAT ROW ── */}
          <motion.div variants={staggerChildren} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard value={counts.students ?? 0} label="Students" icon={Users} color="mint" emphasis />
            <StatCard value={counts.subjects ?? 0} label="Subjects" icon={BookOpen} color="lavender" />
            <StatCard value={counts.scheduled_tests ?? 0} label="Tests scheduled" icon={FileQuestion} color="cream" />
            <StatCard value={perf.avg_score != null ? `${Math.round(perf.avg_score)}%` : '—'} label="Class avg score" icon={Target} color="sky" />
          </motion.div>

          {/* ── 2. ACTION CENTER ── */}
          <motion.div variants={fadeUp}>
            <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-3 px-1 flex items-center gap-2">
              <Sparkles size={15} /> Needs attention
            </h2>
            <div className="bg-white rounded-card shadow-soft border border-[#EFEDEA] overflow-hidden">
              {!hasAttention ? (
                <div className="flex flex-col items-center justify-center text-center py-14 px-6">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-4">
                    <Check size={26} />
                  </div>
                  <p className="font-bold text-neutral-900">You're all caught up 🎉</p>
                  <p className="text-sm text-neutral-500 mt-1">No approvals, grading or alerts right now.</p>
                </div>
              ) : (
                <>
                  {/* Join requests — inline approve/reject */}
                  {joinReqs.items.map(req => (
                    <ActionRow
                      key={`jr-${req.id}`}
                      kind="join"
                      eyebrow="Join request"
                      title={req.student_name}
                      meta={[req.standard_name, req.student_email].filter(Boolean).join(' · ')}
                    >
                      <button
                        disabled={busyJoin[req.id]}
                        onClick={() => handleJoin(req, 'reject')}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                        title="Reject"
                      >
                        <X size={16} />
                      </button>
                      <button
                        disabled={busyJoin[req.id]}
                        onClick={() => handleJoin(req, 'approve')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        {busyJoin[req.id] ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Approve
                      </button>
                    </ActionRow>
                  ))}
                  {joinReqs.count > joinReqs.items.length && (
                    <button onClick={() => navigate('/teacher/students')} className="w-full text-center py-2 text-xs font-bold text-neutral-500 hover:text-neutral-900 border-b border-black/5">
                      +{joinReqs.count - joinReqs.items.length} more requests
                    </button>
                  )}

                  {/* Grading queue */}
                  {grading.count > 0 && (
                    <ActionRow
                      kind="grade"
                      eyebrow="Grading queue"
                      title={`${grading.count} submission${grading.count > 1 ? 's' : ''} to grade`}
                      meta={grading.items.slice(0, 2).map(g => `${g.student_name} · ${g.assignment_title}`).join('  •  ')}
                      onClick={() => {
                        const g = grading.items[0];
                        const sid = g && standardIdForClass(g.class_id);
                        navigate(sid && g ? `/teacher/standards/${sid}/subjects/${g.class_id}` : '/teacher/standards');
                      }}
                    />
                  )}

                  {/* Low attendance */}
                  {lowAtt.count > 0 && (
                    <ActionRow
                      kind="attend"
                      eyebrow="Attendance alert"
                      title={`${lowAtt.count} student${lowAtt.count > 1 ? 's' : ''} below threshold`}
                      meta={lowAtt.items.slice(0, 3).map(s => `${s.name} (${Math.round(s.attendance_pct)}%)`).join(', ')}
                      onClick={() => navigate('/teacher/reports')}
                    />
                  )}
                </>
              )}
            </div>
          </motion.div>

          {/* ── 3. TWO-COLUMN GRID ── */}
          {/* min-w-0 on both grid items: an auto grid track otherwise sizes to its
              content's minimum, so one long student name blows the whole page
              past the phone viewport (grid blowout). */}
          <div className="grid lg:grid-cols-3 gap-6">

            {/* ── LEFT ── */}
            <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">

              {/* Today's schedule */}
              <motion.div variants={fadeUp}>
                <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-3 px-1 flex items-center gap-2">
                  <Calendar size={15} /> Today &amp; upcoming
                </h2>
                {(todayLive.length > 0 || upcomingTests.length > 0) ? (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {todayLive.map(l => (
                      <EventCard
                        key={`live-${l.id}`}
                        color="peach"
                        icon={Video}
                        kicker={l.status === 'live' ? 'Live now' : 'Live class'}
                        date={fmtWhen(l.scheduled_at)}
                        title={l.title}
                        body={l.subject}
                        onClick={() => navigate('/teacher/live-classes')}
                      />
                    ))}
                    {upcomingTests.map(t => (
                      <EventCard
                        key={`test-${t.id}`}
                        color="cream"
                        icon={FileQuestion}
                        kicker={t.status === 'active' ? 'Test live' : 'Test scheduled'}
                        date={t.scheduled_for ? fmtWhen(t.scheduled_for) : ''}
                        title={t.title}
                        body={t.subject}
                        onClick={() => navigate('/teacher/tests')}
                      />
                    ))}
                  </div>
                ) : (
                  <Card className="py-10 text-center text-sm text-neutral-500">Nothing scheduled. Create a test or schedule a live class.</Card>
                )}
              </motion.div>

              {/* Class insights — heavier endpoint, renders independently */}
              <motion.div variants={fadeUp} className="flex flex-col gap-6">
                {!insights ? (
                  <div>
                    <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-3 px-1 flex items-center gap-2">
                      <Target size={15} /> Class insights
                    </h2>
                    <Skeleton className="h-40 w-full rounded-card" />
                  </div>
                ) : (insights.copy_suspects?.count || 0) + (insights.video_laggards?.count || 0) +
                    (insights.cold_videos?.count || 0) + (insights.assignment_status?.count || 0) +
                    (insights.live_absentees?.count || 0) === 0 ? (
                  <div>
                    <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-3 px-1 flex items-center gap-2">
                      <Target size={15} /> Class insights
                    </h2>
                    <Card className="py-8 text-center">
                      <p className="font-bold text-neutral-900">All clear ✨</p>
                      <p className="text-sm text-neutral-500 mt-1">No copying suspicions, video gaps, missing assignments or skipped live classes.</p>
                    </Card>
                  </div>
                ) : (
                  <>
                    <CopySuspectsCard data={insights.copy_suspects} />
                    <AssignmentStatusCard data={insights.assignment_status} />
                    <VideoEngagementCard laggards={insights.video_laggards} coldVideos={insights.cold_videos} />
                    <LiveAbsenteesCard data={insights.live_absentees} />
                  </>
                )}
              </motion.div>

              {/* Recent activity */}
              <motion.div variants={fadeUp}>
                <Card padded={false} className="overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#EFEDEA] flex items-center gap-2">
                    <Activity size={14} className="text-neutral-500" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Recent activity</span>
                  </div>
                  {activities.length > 0 ? activities.slice(0, 5).map((a, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-[#F2F1EE] last:border-0">
                      <Avatar name={a.student} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate"><span className="font-medium">{a.student}</span><span className="text-neutral-500"> {a.detail}</span></p>
                        <p className="text-[11px] text-neutral-400 mt-0.5 truncate">{a.video_title || a.test_title || 'Activity'}</p>
                      </div>
                    </div>
                  )) : (
                    <div className="p-6 text-center text-sm text-neutral-500">No recent activity yet.</div>
                  )}
                </Card>
              </motion.div>
            </div>

            {/* ── RIGHT SIDEBAR ── */}
            <div className="flex flex-col gap-6 min-w-0">

              {/* Quick actions */}
              <motion.div variants={fadeUp}>
                <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-3 px-1">Quick actions</h2>
                <div className="grid grid-cols-2 gap-3">
                  {quickActions.map((a, i) => (
                    <Card key={i} as="button" color={a.color} interactive padded={false}
                      onClick={() => navigate(a.to)} className="p-4 flex flex-col items-start gap-2">
                      <a.icon size={18} style={{ color: PASTEL[a.color]?.fgHex }} />
                      <span className="text-xs font-semibold">{a.label}</span>
                    </Card>
                  ))}
                </div>
              </motion.div>

              {/* To-dos / reminders */}
              <motion.div variants={fadeUp}>
                <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-3 px-1">To-do list</h2>
                <Card padded={false} className="overflow-hidden">
                  <div className="flex items-center gap-2 p-3 border-b border-[#EFEDEA]">
                    <input
                      value={newReminder}
                      onChange={(e) => setNewReminder(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addReminder(); }}
                      placeholder="Add a reminder…"
                      className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-neutral-400"
                    />
                    <button onClick={addReminder} disabled={addingReminder || !newReminder.trim()}
                      className="w-7 h-7 rounded-full bg-ink text-white flex items-center justify-center disabled:opacity-30 flex-shrink-0">
                      {addingReminder ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
                    </button>
                  </div>
                  {reminders.length > 0 ? reminders.slice(0, 6).map(r => (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#F2F1EE] last:border-0 group">
                      <button onClick={() => toggleReminder(r)}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${r.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-neutral-300 hover:border-neutral-400'}`}>
                        {r.done && <Check size={13} />}
                      </button>
                      <span className={`flex-1 text-sm truncate ${r.done ? 'line-through text-neutral-400' : 'text-neutral-800'}`}>{r.title}</span>
                      <button onClick={() => removeReminder(r)} className="opacity-0 group-hover:opacity-100 text-neutral-300 hover:text-red-500 transition-all flex-shrink-0">
                        <X size={14} />
                      </button>
                    </div>
                  )) : (
                    <div className="p-5 text-center text-sm text-neutral-400">No reminders yet.</div>
                  )}
                </Card>
              </motion.div>

              {/* Weekly/monthly snapshot + top students */}
              <motion.div variants={fadeUp}>
                <PerformanceSnapshotCard snapshot={insights?.period_snapshot} topStudents={topStudents} />
              </motion.div>

              {/* Your classes */}
              {standards.length > 0 && (
                <motion.div variants={fadeUp}>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500">Your classes</h2>
                    <button onClick={() => navigate('/teacher/standards')} className="flex items-center gap-1 text-xs font-bold text-neutral-500 hover:text-neutral-900 transition-colors">
                      All <ChevronRight size={13} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {standards.slice(0, 5).map(s => {
                      const c = countFor(s.id);
                      const pastel = PASTEL[pastelFor(s.name)] || PASTEL.sky;
                      return (
                        <button key={s.id} onClick={() => navigate(`/teacher/standards/${s.id}`)}
                          className="flex items-center gap-3 p-3 rounded-card border border-black/5 hover:shadow-soft hover:-translate-y-0.5 transition-all text-left"
                          style={{ background: pastel.hex }}>
                          <div className="w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center flex-shrink-0" style={{ color: pastel.fgHex }}>
                            <SubjectIcon value={s.emoji} size={20} fallback="graduation" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-neutral-900 truncate">{s.name}</p>
                            <p className="text-[11px] font-semibold" style={{ color: pastel.fgHex }}>{c.students} students · {c.subjects} subjects</p>
                          </div>
                          <ChevronRight size={16} className="text-neutral-400 flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
