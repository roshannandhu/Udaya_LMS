import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { CountUp, ProgressRing } from '../../components/shared/Animated';
import {
  Play, Calendar, FileText, ArrowRight, FileQuestion,
  ChevronRight, Video, Target,
  CheckCircle2, ListChecks, Sparkles, Zap,
} from 'lucide-react';
import { Avatar, Skeleton } from '../../components/ui';
import { apiClient, leaderboardApi, testApi, assignmentApi, notesApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { useAppCache, useWhatsNew, isNewSince } from '../../store';
import NotificationBell from '../../components/shared/NotificationBell';
import SubjectIcon from '../../components/shared/SubjectIcon';
import VideoRail from '../../components/student/VideoRail';
import SecureFileViewer from '../../components/shared/SecureFileViewer';
import { pastelFor, pastelTokens } from '../../components/cards/pastel';
import { useTheme } from '../../lib/theme';
import { fadeUp, staggerChildren, springCard } from '../../lib/motion';
import { ShinyText, TiltCard } from '../../components/bits';
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/animate-ui/components/radix/accordion';

let homeCache = null;

// ── Small presentational helpers ──────────────────────────────────────────────

/** Pastel gamified stat tile with count-up. */
function StatTile({ icon: Icon, label, value, display, pastel, ringPct, onClick }) {
  const dark = useTheme(s => s.dark);
  const p = pastelTokens(pastel, dark);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={springCard}
      className="w-full h-full rounded-[1.75rem] p-4 flex items-center gap-3 shadow-card border border-black/5 text-left"
      style={{ background: p.hex }}
    >
      {ringPct != null ? (
        <ProgressRing pct={ringPct} color={p.fgHex}>
          <Target size={16} style={{ color: p.fgHex }} />
        </ProgressRing>
      ) : (
        <div className="w-12 h-12 rounded-full bg-white/70 flex items-center justify-center flex-shrink-0" style={{ color: p.fgHex }}>
          <Icon size={20} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-2xl font-extrabold leading-none" style={{ color: p.fgHex }}>
          {display != null ? display : <CountUp value={value} />}
        </p>
        <p className="text-[10px] font-extrabold uppercase tracking-widest mt-1.5 truncate" style={{ color: p.fgHex, opacity: 0.7 }}>
          {label}
        </p>
      </div>
    </motion.button>
  );
}

const KIND = {
  live:       { icon: Video,        tile: 'bg-red-50 text-red-600',         cta: 'bg-red-600 hover:bg-red-700' },
  test:       { icon: FileQuestion, tile: 'bg-emerald-50 text-emerald-600', cta: 'bg-emerald-600 hover:bg-emerald-700' },
  assignment: { icon: FileText,     tile: 'bg-amber-50 text-amber-600',     cta: 'bg-amber-500 hover:bg-amber-600' },
  video:      { icon: Play,         tile: 'bg-indigo-50 text-indigo-600',   cta: 'bg-indigo-600 hover:bg-indigo-700' },
};

function AgendaRow({ item }) {
  const k = KIND[item.kind] || KIND.test;
  const Icon = k.icon;
  return (
    <motion.button
      onClick={item.onClick}
      variants={fadeUp}
      whileHover={{ x: 4 }}
      transition={springCard}
      className="w-full flex items-center gap-4 p-4 text-left rounded-2xl hover:bg-[#F4F2EF] transition-colors group"
    >
      <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${k.tile}`}>
        {item.live ? (
          <span className="relative flex items-center justify-center">
            <span className="absolute w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <Icon size={18} />
          </span>
        ) : <Icon size={18} />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-widest mb-0.5 text-neutral-400">{item.eyebrow}</p>
        <h4 className="font-bold text-neutral-900 leading-snug truncate">{item.title}</h4>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-500 truncate">
          <span className="font-semibold truncate">{item.subject}</span>
          {item.meta && (<><span className="w-1 h-1 rounded-full bg-neutral-300 flex-shrink-0" /><span className="truncate">{item.meta}</span></>)}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        {item.badge && (
          <span className={`text-[11px] font-extrabold whitespace-nowrap ${item.badge.danger ? 'text-red-600' : 'text-neutral-400'}`}>
            {item.badge.text}
          </span>
        )}
        {item.muted ? (
          <ChevronRight size={18} className="text-neutral-300 group-hover:text-neutral-500 transition-colors" />
        ) : (
          <span className={`hidden sm:inline-flex items-center px-4 py-2 rounded-full text-white text-xs font-bold ${k.cta} transition-colors`}>
            {item.cta}
          </span>
        )}
      </div>
    </motion.button>
  );
}

export default function StudentHomePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const reduceMotion = useReducedMotion();

  // The module cache outlives logins — only trust it for the same account.
  const cache = homeCache && homeCache.userId === user?.id ? homeCache : null;
  const [loading, setLoading] = useState(!cache);
  const [tests, setTests] = useState(cache?.tests || []);
  const [myAttempts, setMyAttempts] = useState(cache?.myAttempts || {});
  const [videos, setVideos] = useState(cache?.videos || []);
  const [liveClasses, setLiveClasses] = useState(cache?.liveClasses || []);
  const [assignments, setAssignments] = useState(cache?.assignments || []);
  const [broadcasts, setBroadcasts] = useState(cache?.broadcasts || []);
  const [leaderboard, setLeaderboard] = useState(cache?.leaderboard || []);
  const [recentNotes, setRecentNotes] = useState(cache?.recentNotes || []);
  const subjectsCache = useAppCache(s => s.subjects);
  const subjects = subjectsCache || [];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greetEmoji = hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙';
  // Eyebrow shows the date so the time-aware greeting itself appears once (in the H1),
  // not duplicated above it.
  const dateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  const [viewerNote, setViewerNote] = useState(null);
  // XP bar fills from 0 → value once content is ready (via the `.bar-fill` CSS
  // transition). Gated on `loading` so it also animates on a cold first load,
  // not just cached navigations.
  const [barReady, setBarReady] = useState(false);
  useEffect(() => {
    if (loading) return;
    const r = requestAnimationFrame(() => setBarReady(true));
    return () => cancelAnimationFrame(r);
  }, [loading]);

  useEffect(() => {
    const handleUpdate = (e) => {
      const { id, status } = e.detail;
      setLiveClasses(prev => prev.map(lc => lc.id === id ? { ...lc, status } : lc));
    };
    window.addEventListener('live-class-update', handleUpdate);
    return () => window.removeEventListener('live-class-update', handleUpdate);
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!(homeCache && homeCache.userId === user?.id)) setLoading(true);
      try {
        const standardId = user?.standard_id;
        const [testsData, history, vids, livesData, assignsData, broads, lb] = await Promise.all([
          testApi.getTests().catch(() => []),
          testApi.getStudentTestHistory().catch(() => []),
          apiClient('/videos?limit=60').catch(() => []),
          standardId ? apiClient(`/live-classes?standard_id=${standardId}`).catch(() => []) : Promise.resolve([]),
          assignmentApi.getAllMyAssignments().catch(() => []),
          standardId ? apiClient(`/broadcasts?standard_id=${standardId}`).catch(() => []) : Promise.resolve([]),
          standardId ? leaderboardApi.get(standardId).catch(() => ({ leaderboard: [] })) : Promise.resolve({ leaderboard: [] })
        ]);

        setTests(Array.isArray(testsData) ? testsData : []);
        const attemptsMap = {};
        (Array.isArray(history) ? history : []).forEach(a => { attemptsMap[a.test_id] = a; });
        setMyAttempts(attemptsMap);

        const validVids = Array.isArray(vids) ? vids : [];
        setVideos(validVids);
        setLiveClasses(Array.isArray(livesData) ? livesData : []);
        // getAllMyAssignments may return a bare array or { assignments: [...] }
        const assignList = Array.isArray(assignsData) ? assignsData : (assignsData?.assignments || []);
        setAssignments(assignList);
        setBroadcasts((Array.isArray(broads) ? broads : []).filter(b => !b.deleted).reverse());
        setLeaderboard(lb?.leaderboard || []);

        const activeVid = validVids.filter(v => v.progress_secs > 0 && !v.completed).slice(0, 1)[0] || validVids[0];
        let fetchedNotes = [];
        if (activeVid?.class_id) {
          const notesData = await notesApi.getByClass(activeVid.class_id).catch(() => []);
          fetchedNotes = Array.isArray(notesData) ? notesData.slice(0, 3) : [];
          setRecentNotes(fetchedNotes);
        }

        homeCache = {
          userId: user?.id,
          tests: Array.isArray(testsData) ? testsData : [],
          myAttempts: attemptsMap,
          videos: validVids,
          liveClasses: Array.isArray(livesData) ? livesData : [],
          assignments: assignList,
          broadcasts: (Array.isArray(broads) ? broads : []).filter(b => !b.deleted).reverse(),
          leaderboard: lb?.leaderboard || [],
          recentNotes: fetchedNotes
        };
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.standard_id]);

  const now = new Date();
  const displayName = user?.name?.split(' ')[0] || 'Student';
  const getSubjectName = (classId) => subjects.find(x => x.id === classId)?.name || 'Lesson';

  // ── Video lists for the rails ────────────────────────────────────────────────
  const continueList = videos.filter(v => v.progress_secs > 0 && !v.completed);
  const upNextList = videos
    .filter(v => (!v.progress_secs || v.progress_secs === 0) && !v.completed)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  // ── Live classes (correct fields: scheduled_at / title / status) ─────────────
  const liveNow = liveClasses.filter(l => l.status === 'live');
  const futureLives = liveClasses
    .filter(l => l.status === 'scheduled' && l.scheduled_at && new Date(l.scheduled_at) > now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  // ── Tests & assignments ──────────────────────────────────────────────────────
  const availableTests = tests.filter(t => {
    if (myAttempts[t.id]) return false;
    if (t.status === 'active') return true;
    if (t.status === 'scheduled') return !t.scheduled_for || new Date(t.scheduled_for) <= now;
    return false;
  });
  const upcomingTests = tests.filter(t =>
    !myAttempts[t.id] && t.status === 'scheduled' && t.scheduled_for && new Date(t.scheduled_for) > now
  );

  const activeAssignments = assignments.filter(a => !a.my_submission);
  const submittedAssignments = assignments.filter(a => a.my_submission);
  const SOON = 3 * 24 * 60 * 60 * 1000; // 3 days
  const soonAssignments = activeAssignments.filter(a => !a.due_date || (new Date(a.due_date) - now) < SOON);
  const laterAssignments = activeAssignments.filter(a => a.due_date && (new Date(a.due_date) - now) >= SOON);

  const latestBroadcasts = broadcasts.slice(0, 3);
  const myRankEntry = leaderboard.find(l => l.id === user?.id);
  const tasksPending = availableTests.length + activeAssignments.length;

  // ── Date helpers ─────────────────────────────────────────────────────────────
  const fmtWhen = (d) => {
    const date = new Date(d);
    const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
    const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
    if (date.toDateString() === tmr.toDateString()) return `Tomorrow, ${time}`;
    return `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
  };
  const dueBadge = (d) => {
    if (!d) return { text: 'No due date', danger: false };
    const diff = new Date(d) - now;
    if (diff < 0) return { text: 'Overdue', danger: true };
    const h = diff / 36e5;
    if (h < 1) return { text: `Due in ${Math.max(1, Math.round(diff / 6e4))} min`, danger: true };
    if (h < 24) return { text: `Due in ${Math.round(h)}h`, danger: h < 6 };
    return { text: `Due ${fmtWhen(d)}`, danger: false };
  };

  // prevSeen marks which videos count as "new" in the Do-now agenda below.
  const prevSeen = useWhatsNew(s => s.prevSeen);

  // ── Build the "What's Next" agenda ───────────────────────────────────────────
  const doNow = [];
  liveNow.forEach(l => doNow.push({
    id: `live-${l.id}`, kind: 'live', live: true,
    eyebrow: 'Live now', title: l.title || l.class_name || 'Live Class',
    subject: l.class_name || getSubjectName(l.class_id),
    badge: { text: 'LIVE', danger: true },
    cta: 'Join Now', onClick: () => navigate('/student/live-classes'),
  }));
  availableTests.forEach(t => doNow.push({
    id: `test-${t.id}`, kind: 'test',
    eyebrow: 'Test available', title: t.title,
    subject: getSubjectName(t.class_id),
    meta: `${t.duration_mins} min · ${t.total_marks} marks`,
    badge: t.expires_at ? { text: `Closes ${fmtWhen(t.expires_at)}`, danger: (new Date(t.expires_at) - now) < 6 * 36e5 } : null,
    cta: 'Start Test', onClick: () => navigate(`/student/tests/${t.id}/take`),
  }));
  soonAssignments.forEach(a => doNow.push({
    id: `ass-${a.id}`, kind: 'assignment',
    eyebrow: 'Assignment', title: a.title,
    subject: a.subject_name || getSubjectName(a.class_id),
    badge: dueBadge(a.due_date),
    cta: 'Submit', onClick: () => navigate(`/student/subjects/${a.class_id}`),
  }));
  // Recently added videos the student hasn't started yet — these stay on the
  // agenda until actually watched (completed), not merely seen in a list.
  videos
    .filter(v => !v.completed && !v.my_completed && (!v.progress_secs || v.progress_secs === 0)
      && isNewSince(v.created_at, prevSeen.videos))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 3)
    .forEach(v => doNow.push({
      id: `vid-${v.id}`, kind: 'video',
      eyebrow: 'New lesson', title: v.title,
      subject: getSubjectName(v.class_id),
      meta: v.duration_secs ? `${Math.max(1, Math.round(v.duration_secs / 60))} min` : null,
      cta: 'Watch', onClick: () => navigate(`/student/subjects/${v.class_id}/video/${v.id}`),
    }));

  const comingUp = [];
  upcomingTests.forEach(t => comingUp.push({
    id: `utest-${t.id}`, kind: 'test', muted: true, date: t.scheduled_for,
    eyebrow: 'Upcoming test', title: t.title, subject: getSubjectName(t.class_id),
    badge: { text: `Opens ${fmtWhen(t.scheduled_for)}`, danger: false },
    onClick: () => navigate(`/student/subjects/${t.class_id}`),
  }));
  futureLives.forEach(l => comingUp.push({
    id: `ulive-${l.id}`, kind: 'live', muted: true, date: l.scheduled_at,
    eyebrow: 'Live class', title: l.title || l.class_name || 'Live Class',
    subject: l.class_name || getSubjectName(l.class_id),
    badge: { text: fmtWhen(l.scheduled_at), danger: false },
    onClick: () => navigate('/student/live-classes'),
  }));
  laterAssignments.forEach(a => comingUp.push({
    id: `uass-${a.id}`, kind: 'assignment', muted: true, date: a.due_date,
    eyebrow: 'Assignment', title: a.title, subject: a.subject_name || getSubjectName(a.class_id),
    badge: { text: `Due ${fmtWhen(a.due_date)}`, danger: false },
    onClick: () => navigate(`/student/subjects/${a.class_id}`),
  }));
  comingUp.sort((a, b) => new Date(a.date) - new Date(b.date));
  const comingUpTop = comingUp.slice(0, 5);

  const dark = useTheme(s => s.dark);
  const greetWords = `${greeting}, ${displayName}!`.split(' ');
  const completedVideos = videos.filter(v => v.completed).length;
  // Course progress = % of lessons completed — drives the XP bar under the greeting.
  const videoPct = videos.length ? Math.round((completedVideos / videos.length) * 100) : 0;

  if (loading) {
    return (
      <div className="px-5 md:px-8 py-8 max-w-[1100px] mx-auto space-y-8 min-h-screen">
        <Skeleton className="h-16 w-full rounded-[2rem]" />
        <Skeleton className="h-[360px] w-full rounded-[2.5rem]" />
        <Skeleton className="h-[220px] w-full rounded-[2.5rem]" />
        <Skeleton className="h-[300px] w-full rounded-[2.5rem]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <div className="w-full max-w-[1100px] mx-auto px-5 pt-8">
        <motion.div variants={staggerChildren} initial="hidden" animate="show" className="flex flex-col gap-6 lg:gap-8 pb-8">

          {/* ── 1. GREETING HERO STRIP ── */}
          <motion.div variants={fadeUp} className="flex items-end justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <motion.div
                className="cursor-pointer flex-shrink-0"
                whileHover={reduceMotion ? undefined : { rotate: [0, -6, 6, 0], scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                transition={{ duration: 0.45 }}
                onClick={() => navigate('/student/profile')}
              >
                <Avatar name={user?.name || '?'} src={user?.avatar_url} size="lg" />
              </motion.div>
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-widest mb-1">
                  <ShinyText base="#737373" shine="#1A1A19" duration={2.6}>{dateLabel}</ShinyText> {greetEmoji}
                </p>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 leading-none truncate">
                  {greetWords.map((w, i) => (
                    <motion.span
                      key={`${w}-${i}`}
                      className="aurora-name inline-block mr-[0.28em]"
                      initial={reduceMotion ? false : { opacity: 0, y: 22, rotate: 3 }}
                      animate={{ opacity: 1, y: 0, rotate: 0 }}
                      transition={{ delay: 0.08 + i * 0.07, type: 'spring', stiffness: 260, damping: 20 }}
                    >
                      {w}
                    </motion.span>
                  ))}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => navigate('/student/calendar')} className="p-2.5 text-neutral-500 hover:text-neutral-900 hover:bg-white rounded-full transition-colors">
                <Calendar size={18} />
              </button>
              <NotificationBell />
            </div>
          </motion.div>

          {/* ── 1b. XP / COURSE-PROGRESS BAR ── */}
          <motion.div variants={fadeUp} className="-mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-neutral-500">
                <Zap size={13} className="text-indigo-500" /> Course progress
              </span>
              <span className="text-[11px] font-extrabold text-neutral-700">
                {completedVideos}/{videos.length} lessons · {videoPct}%
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-black/5 overflow-hidden">
              <div
                className="bar-fill h-full rounded-full"
                style={{
                  width: barReady ? `${videoPct}%` : '0%',
                  background: 'linear-gradient(90deg,#818cf8,#f472b6,#22d3ee)',
                }}
              />
            </div>
          </motion.div>

          {/* ── 2. GAMIFIED STAT TILES ── */}
          <motion.div variants={staggerChildren} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <TiltCard variants={fadeUp} className="h-full">
              <StatTile
                icon={ListChecks} label={tasksPending === 1 ? 'Task pending' : 'Tasks pending'} value={tasksPending} pastel="mint"
                onClick={() => document.getElementById('whats-next')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              />
            </TiltCard>
            <TiltCard variants={fadeUp} className="h-full">
              <StatTile
                icon={FileQuestion} label="Tests open" value={availableTests.length} pastel="sky"
                onClick={() => navigate('/student/tests')}
              />
            </TiltCard>
            <TiltCard variants={fadeUp} className="h-full">
              <StatTile
                icon={Video} label="Live today" value={liveNow.length + futureLives.length} pastel="peach"
                onClick={() => navigate('/student/live-classes')}
              />
            </TiltCard>
            <TiltCard variants={fadeUp} className="h-full">
              <StatTile
                icon={Target} label="Avg score" pastel="lavender"
                ringPct={user?.avg_score != null ? Math.round(user.avg_score) : 0}
                display={user?.avg_score != null ? <><CountUp value={Math.round(user.avg_score)} />%</> : '—'}
                onClick={() => navigate('/student/leaderboard')}
              />
            </TiltCard>
          </motion.div>

          {/* ── 3. WHAT'S NEXT (full-width agenda) ── */}
          <motion.div variants={fadeUp} id="whats-next" className="scroll-mt-24">
            <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-2 flex items-center gap-2">
              <Sparkles size={15} /> What's Next
            </h2>
            <div className="bg-white rounded-[2rem] shadow-card border border-black/5 overflow-hidden p-3">
                {doNow.length === 0 && comingUpTop.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                    <motion.div
                      className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-4"
                      initial={reduceMotion ? false : { scale: 0, rotate: -30 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.2 }}
                    >
                      <CheckCircle2 size={26} />
                    </motion.div>
                    <p className="font-bold text-neutral-900">You're all caught up</p>
                    <p className="text-sm text-neutral-500 mt-1">No pending tasks. Keep watching your lessons!</p>
                  </div>
                ) : (
                  <Accordion type="multiple" defaultValue={['do-now', 'coming-up']}>
                    {doNow.length > 0 && (
                      <AccordionItem value="do-now" className="border-black/5">
                        <AccordionTrigger className="px-3">
                          <span className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest text-neutral-500">
                            Do now
                            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-pastel-mint text-pastel-mint-fg text-[10px] font-extrabold normal-case">
                              {doNow.length}
                            </span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-2">
                          <motion.div variants={staggerChildren} initial="hidden" animate="show">
                            {doNow.map(item => <AgendaRow key={item.id} item={item} />)}
                          </motion.div>
                        </AccordionContent>
                      </AccordionItem>
                    )}
                    {comingUpTop.length > 0 && (
                      <AccordionItem value="coming-up" className="border-black/5">
                        <AccordionTrigger className="px-3">
                          <span className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest text-neutral-500">
                            Coming up
                            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-pastel-sky text-pastel-sky-fg text-[10px] font-extrabold normal-case">
                              {comingUpTop.length}
                            </span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-2">
                          <motion.div variants={staggerChildren} initial="hidden" animate="show">
                            {comingUpTop.map(item => <AgendaRow key={item.id} item={item} />)}
                          </motion.div>
                        </AccordionContent>
                      </AccordionItem>
                    )}
                  </Accordion>
                )}
              </div>
          </motion.div>

          {/* ── 4. CONTINUE WATCHING / JUMP BACK IN RAIL ──
                One rail: resume in-progress lessons, else surface new ones, so the
                home always has a lessons rail (never a blank gap). */}
          {(continueList.length > 0 || upNextList.length > 0) && (
            <motion.div variants={fadeUp}>
              <VideoRail
                title={continueList.length > 0 ? 'Continue Watching' : 'Jump Back In'}
                items={continueList.length > 0 ? continueList : upNextList}
                autoScroll
                getSubjectName={getSubjectName}
                onSeeAll={() => navigate('/student/subjects')}
                onItemClick={(v) => navigate(`/student/subjects/${v.class_id}/video/${v.id}`)}
              />
            </motion.div>
          )}

          {/* ── 5. YOUR SUBJECTS RAIL ── */}
          {subjects.length > 0 && (
            <motion.div variants={fadeUp}>
              <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500">Your Subjects</h2>
                <button onClick={() => navigate('/student/subjects')} className="flex items-center gap-1 text-xs font-bold text-neutral-500 hover:text-neutral-900 transition-colors">
                  See all <ArrowRight size={13} />
                </button>
              </div>
              <motion.div
                variants={staggerChildren} initial="hidden" animate="show"
                className="flex gap-4 overflow-x-auto scrollbar-hide snap-x pb-2 px-2 -mx-2"
              >
                {subjects.map((c, idx) => {
                  const pastel = pastelTokens(pastelFor(c.name), dark);
                  const vidCount = videos.filter(v => v.class_id === c.id).length;
                  return (
                    <motion.button
                      key={c.id}
                      variants={fadeUp}
                      whileHover={reduceMotion ? undefined : { y: -6, rotate: idx % 2 === 0 ? 1.2 : -1.2, scale: 1.03 }}
                      whileTap={{ scale: 0.96 }}
                      transition={springCard}
                      onClick={() => navigate(`/student/subjects/${c.id}`)}
                      className="snap-start flex-shrink-0 w-44 rounded-[1.75rem] p-5 text-left shadow-card border border-black/5"
                      style={{ background: pastel.hex }}
                    >
                      <div className="mb-3" style={{ color: pastel.fgHex }}>
                        <SubjectIcon value={c.emoji} size={28} />
                      </div>
                      <h3 className="font-bold text-[15px] leading-tight" style={{ color: pastel.fgHex }}>{c.name}</h3>
                      <p className="text-[11px] font-extrabold mt-1.5 uppercase tracking-widest" style={{ color: pastel.fgHex, opacity: 0.7 }}>
                        {vidCount} {vidCount === 1 ? 'lesson' : 'lessons'}
                      </p>
                    </motion.button>
                  );
                })}
              </motion.div>
            </motion.div>
          )}

        </motion.div>
      </div>

      <SecureFileViewer
        open={!!viewerNote}
        onClose={() => setViewerNote(null)}
        endpoint={viewerNote ? `/notes/${viewerNote.id}/file` : null}
        offlineKey={viewerNote ? `note-${viewerNote.id}` : null}
        title={viewerNote?.title || 'Note'}
      />
    </div>
  );
}
