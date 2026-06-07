import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Calendar, FileText, MessageSquare, ArrowRight, FileQuestion,
  StickyNote, Activity, ChevronLeft, ChevronRight, Video, Trophy, Target,
  CheckCircle2, ListChecks, Sparkles
} from 'lucide-react';
import { Avatar, Skeleton } from '../../components/ui';
import { apiClient, leaderboardApi, testApi, assignmentApi, notesApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { useAppCache } from '../../store';
import NotificationBell from '../../components/shared/NotificationBell';
import SubjectIcon from '../../components/shared/SubjectIcon';
import VideoRail from '../../components/student/VideoRail';
import { PASTEL, pastelFor } from '../../components/cards/pastel';
import { fadeUp, staggerChildren } from '../../lib/motion';

let homeCache = null;

// ── Small presentational helpers ──────────────────────────────────────────────
function StatChip({ icon: Icon, label, value, tint }) {
  return (
    <div className="bg-white rounded-[1.75rem] p-4 flex items-center gap-3 shadow-card border border-black/5">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${tint}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-widest truncate">{label}</p>
        <p className="font-extrabold text-neutral-900 leading-tight">{value}</p>
      </div>
    </div>
  );
}

const KIND = {
  live:       { icon: Video,        tile: 'bg-red-50 text-red-600',         cta: 'bg-red-600 hover:bg-red-700' },
  test:       { icon: FileQuestion, tile: 'bg-emerald-50 text-emerald-600', cta: 'bg-emerald-600 hover:bg-emerald-700' },
  assignment: { icon: FileText,     tile: 'bg-amber-50 text-amber-600',     cta: 'bg-amber-500 hover:bg-amber-600' },
};

function AgendaRow({ item }) {
  const k = KIND[item.kind] || KIND.test;
  const Icon = k.icon;
  return (
    <button
      onClick={item.onClick}
      className="w-full flex items-center gap-4 p-4 text-left border-b border-black/5 last:border-0 hover:bg-neutral-50 transition-colors group"
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
    </button>
  );
}

export default function StudentHomePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(!homeCache);
  const [tests, setTests] = useState(homeCache?.tests || []);
  const [myAttempts, setMyAttempts] = useState(homeCache?.myAttempts || {});
  const [videos, setVideos] = useState(homeCache?.videos || []);
  const [liveClasses, setLiveClasses] = useState(homeCache?.liveClasses || []);
  const [assignments, setAssignments] = useState(homeCache?.assignments || []);
  const [broadcasts, setBroadcasts] = useState(homeCache?.broadcasts || []);
  const [leaderboard, setLeaderboard] = useState(homeCache?.leaderboard || []);
  const [recentNotes, setRecentNotes] = useState(homeCache?.recentNotes || []);
  const subjectsCache = useAppCache(s => s.subjects);
  const subjects = subjectsCache || [];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const [currentSlide, setCurrentSlide] = useState(0);
  const [videoThumbnails, setVideoThumbnails] = useState({});

  useEffect(() => {
    const load = async () => {
      if (!homeCache) setLoading(true);
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

  // ── Hero ─────────────────────────────────────────────────────────────────────
  const heroCandidates = React.useMemo(() => {
    const inProgress = videos.filter(v => v.progress_secs > 0 && !v.completed);
    const notStarted = videos.filter(v => (!v.progress_secs || v.progress_secs === 0) && !v.completed);
    return [...inProgress, ...notStarted].slice(0, 5);
  }, [videos]);

  useEffect(() => {
    if (heroCandidates.length === 0) return;
    setVideoThumbnails(prev => {
      let changed = false;
      const next = { ...prev };
      heroCandidates.forEach(v => {
        if (next[v.id] === undefined) { next[v.id] = v.thumbnail_url || null; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [heroCandidates]);

  const heroSlides = React.useMemo(() => {
    const gradients = [
      'from-slate-900 to-indigo-900', 'from-slate-900 to-emerald-900',
      'from-slate-900 to-rose-900', 'from-slate-900 to-amber-900', 'from-slate-900 to-purple-900',
    ];
    if (heroCandidates.length === 0) {
      return [{
        id: 'welcome', tag: 'WELCOME', title: `Ready to learn, ${displayName}?`,
        subtitle: 'Explore your lessons below',
        description: 'Pick up a lesson, take a test, or check what is due — everything you need is right here.',
        bg: 'from-slate-900 to-indigo-900', path: '', thumbnail: null, progress: 0,
      }];
    }
    return heroCandidates.map((v, idx) => ({
      id: v.id,
      tag: v.progress_secs > 0 ? 'CONTINUE WATCHING' : 'UP NEXT',
      title: v.title,
      subtitle: getSubjectName(v.class_id),
      description: v.description || 'Dive into this lesson and continue your learning journey.',
      duration: v.duration_secs ? Math.round(v.duration_secs / 60) + 'm' : '',
      bg: gradients[idx % gradients.length],
      path: `/student/subjects/${v.class_id}/video/${v.id}`,
      progress: v.duration_secs ? (v.progress_secs / v.duration_secs) * 100 : 0,
      thumbnail: videoThumbnails[v.id] || null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroCandidates, subjects, displayName, videoThumbnails]);

  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const timer = setInterval(() => setCurrentSlide(prev => (prev + 1) % heroSlides.length), 5000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  const nextSlide = () => setCurrentSlide(prev => (prev + 1) % heroSlides.length);
  const prevSlide = () => setCurrentSlide(prev => (prev - 1 + heroSlides.length) % heroSlides.length);
  const slide = heroSlides[Math.min(currentSlide, heroSlides.length - 1)] || heroSlides[0];

  if (loading) {
    return (
      <div className="px-5 md:px-8 py-8 max-w-[1100px] mx-auto space-y-8 bg-[#F4F7F6] min-h-screen">
        <Skeleton className="h-16 w-full rounded-[2rem]" />
        <Skeleton className="h-[360px] w-full rounded-[2.5rem]" />
        <Skeleton className="h-[220px] w-full rounded-[2.5rem]" />
        <Skeleton className="h-[300px] w-full rounded-[2.5rem]" />
      </div>
    );
  }

  return (
    <div className="pb-32 bg-[#F4F7F6] min-h-screen font-sans selection:bg-indigo-100 selection:text-indigo-900 flex justify-center">
      <div className="w-full max-w-[1100px] px-5 pt-8">
        <motion.div variants={staggerChildren} initial="hidden" animate="show" className="flex flex-col gap-10 lg:gap-12">

          {/* ── 1. HEADER ── */}
          <motion.div variants={fadeUp} className="flex items-center justify-between">
            <div className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate('/student/profile')}>
              <Avatar name={user?.name || '?'} src={user?.avatar_url} size="lg" />
              <div>
                <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest mb-0.5">{greeting},</p>
                <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 leading-none">{displayName}</h1>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => navigate('/student/calendar')} className="p-2.5 text-neutral-500 hover:text-neutral-900 hover:bg-white rounded-full transition-colors">
                <Calendar size={18} />
              </button>
              <NotificationBell />
            </div>
          </motion.div>

          {/* ── 2. STAT CHIPS ── */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatChip icon={ListChecks} label="Tasks pending" value={`${tasksPending} ${tasksPending === 1 ? 'task' : 'tasks'}`} tint="bg-indigo-100 text-indigo-600" />
            <StatChip icon={FileQuestion} label="Tests open" value={`${availableTests.length} live`} tint="bg-emerald-100 text-emerald-600" />
            <StatChip icon={Video} label="Live today" value={`${liveNow.length + futureLives.length}`} tint="bg-red-100 text-red-600" />
            <StatChip icon={Target} label="Avg score" value={user?.avg_score != null ? `${Math.round(user.avg_score)}%` : '—'} tint="bg-amber-100 text-amber-600" />
          </motion.div>

          {/* ── 3. CINEMATIC HERO ── */}
          {slide && (
            <motion.div variants={fadeUp}>
              <div className="relative w-full h-[340px] sm:h-[420px] rounded-[2rem] overflow-hidden shadow-2xl group bg-[#0f1014] border border-black/10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentSlide}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }}
                    drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2}
                    onDragEnd={(e, { offset }) => { if (offset.x < -50) nextSlide(); else if (offset.x > 50) prevSlide(); }}
                    className="absolute inset-0 w-full h-full cursor-pointer flex flex-col justify-end bg-[#0f1014]"
                    onClick={() => slide.path && navigate(slide.path)}
                  >
                    {slide.thumbnail ? (
                      <img
                        src={slide.thumbnail} alt={slide.title} loading="lazy"
                        onError={() => setVideoThumbnails(prev => ({ ...prev, [slide.id]: null }))}
                        className="absolute right-0 top-0 w-full md:w-[70%] h-full object-cover z-0 pointer-events-none"
                      />
                    ) : (
                      <div className={`absolute right-0 top-0 w-full md:w-[70%] h-full bg-gradient-to-br ${slide.bg} z-0 opacity-80 pointer-events-none`} />
                    )}
                    <div className="absolute inset-y-0 left-0 w-full sm:w-[75%] bg-gradient-to-r from-[#0f1014] via-[#0f1014]/90 to-transparent z-0 pointer-events-none" />
                    <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-[#0f1014] via-[#0f1014]/90 to-transparent z-0 pointer-events-none" />

                    <div className="relative z-10 flex flex-col items-start gap-4 w-full sm:w-[72%] px-6 pb-8 sm:px-10 sm:pb-10">
                      <div className="pointer-events-none">
                        <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold mb-3 tracking-tight leading-[1.1] text-white drop-shadow-md">
                          {slide.title}
                        </h2>
                        <div className="flex items-center flex-wrap gap-2 text-white/80 text-[13px] font-bold mb-3 drop-shadow-sm">
                          <span className="text-[#FFCC00] uppercase tracking-widest text-[11px] bg-white/10 px-2 py-0.5 rounded-sm">{slide.tag}</span>
                          <span>{slide.subtitle}</span>
                          {slide.duration && (<><span className="w-1 h-1 rounded-full bg-white/40" /><span>{slide.duration}</span></>)}
                        </div>
                        <p className="text-white/50 text-sm leading-relaxed line-clamp-2 sm:line-clamp-3 mb-2 max-w-[90%] font-medium">{slide.description}</p>
                      </div>
                      {slide.path && (
                        <button className="flex items-center justify-center gap-2 bg-white text-black px-8 py-3.5 rounded-xl font-bold text-[15px] hover:bg-neutral-200 transition-colors pointer-events-auto">
                          <Play size={20} fill="currentColor" />
                          {slide.progress > 0 ? 'Resume Watching' : 'Start Watching'}
                        </button>
                      )}
                    </div>

                    {slide.progress > 0 && (
                      <div className="absolute bottom-0 left-0 w-full h-[3px] bg-white/20 z-20 pointer-events-none">
                        <div className="h-full bg-[#1f80e0]" style={{ width: `${slide.progress}%` }} />
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                {heroSlides.length > 1 && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); prevSlide(); }} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/40 hover:bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <ChevronLeft size={24} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); nextSlide(); }} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/40 hover:bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <ChevronRight size={24} />
                    </button>
                    <div className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 flex gap-1.5 z-20">
                      {heroSlides.map((_, idx) => (
                        <div key={idx} onClick={(e) => { e.stopPropagation(); setCurrentSlide(idx); }}
                          className={`h-1.5 rounded-full cursor-pointer transition-all duration-500 ${idx === currentSlide ? 'w-8 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/60'}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* ── 4. CONTINUE WATCHING RAIL ── */}
          {continueList.length > 0 && (
            <motion.div variants={fadeUp}>
              <VideoRail
                title="Continue Watching"
                items={continueList}
                autoScroll
                getSubjectName={getSubjectName}
                onItemClick={(v) => navigate(`/student/subjects/${v.class_id}/video/${v.id}`)}
              />
            </motion.div>
          )}

          {/* ── 5. UP NEXT / NEW LESSONS RAIL ── */}
          {upNextList.length > 0 && (
            <motion.div variants={fadeUp}>
              <VideoRail
                title="Up Next · New Lessons"
                items={upNextList}
                autoScroll
                getSubjectName={getSubjectName}
                onSeeAll={() => navigate('/student/subjects')}
                onItemClick={(v) => navigate(`/student/subjects/${v.class_id}/video/${v.id}`)}
              />
            </motion.div>
          )}

          {/* ── 6. WHAT'S NEXT (agenda + updates) ── */}
          <motion.div variants={fadeUp}>
            <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-2 flex items-center gap-2">
              <Sparkles size={15} /> What's Next
            </h2>
            <div className="grid lg:grid-cols-3 gap-5">
              {/* Primary agenda */}
              <div className="lg:col-span-2 bg-white rounded-[2rem] shadow-card border border-black/5 overflow-hidden">
                {doNow.length === 0 && comingUpTop.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                    <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-4">
                      <CheckCircle2 size={26} />
                    </div>
                    <p className="font-bold text-neutral-900">You're all caught up</p>
                    <p className="text-sm text-neutral-500 mt-1">No pending tasks. Keep watching your lessons!</p>
                  </div>
                ) : (
                  <>
                    {doNow.length > 0 && (
                      <div>
                        <p className="px-5 pt-5 pb-1 text-[11px] font-extrabold uppercase tracking-widest text-neutral-400">Do now</p>
                        {doNow.map(item => <AgendaRow key={item.id} item={item} />)}
                      </div>
                    )}
                    {comingUpTop.length > 0 && (
                      <div className={doNow.length > 0 ? 'border-t-4 border-[#F4F7F6]' : ''}>
                        <p className="px-5 pt-5 pb-1 text-[11px] font-extrabold uppercase tracking-widest text-neutral-400">Coming up</p>
                        {comingUpTop.map(item => <AgendaRow key={item.id} item={item} />)}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Secondary: announcements + notes */}
              <div className="flex flex-col gap-5">
                <div className="bg-white rounded-[2rem] p-2 shadow-card border border-black/5 flex flex-col min-h-[150px]">
                  <p className="px-3 pt-3 pb-1 text-[11px] font-extrabold uppercase tracking-widest text-neutral-400">Announcements</p>
                  {latestBroadcasts.length > 0 ? latestBroadcasts.map((b, i) => (
                    <div key={b.id || i} className="p-3 flex items-start gap-3 rounded-2xl cursor-pointer hover:bg-neutral-50" onClick={() => navigate('/student/broadcasts')}>
                      <MessageSquare size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-neutral-900 line-clamp-2">{b.message || b.text}</p>
                        <p className="text-[10px] font-extrabold text-neutral-400 mt-1 uppercase tracking-widest">
                          {b.created_at ? new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                        </p>
                      </div>
                    </div>
                  )) : (
                    <div className="flex-1 flex items-center justify-center p-6 text-center"><p className="text-sm font-bold text-neutral-400">No new announcements</p></div>
                  )}
                </div>

                <div className="bg-white rounded-[2rem] p-2 shadow-card border border-black/5 flex flex-col min-h-[120px]">
                  <p className="px-3 pt-3 pb-1 text-[11px] font-extrabold uppercase tracking-widest text-neutral-400">Recent Notes</p>
                  {recentNotes.length > 0 ? recentNotes.map((n, i) => (
                    <div key={n.id || i} className="p-3 flex items-start gap-3 rounded-2xl cursor-pointer hover:bg-neutral-50" onClick={() => n.file_url && window.open(n.file_url, '_blank')}>
                      <StickyNote size={16} className="text-purple-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-neutral-900 line-clamp-1">{n.title}</p>
                        <p className="text-[10px] font-extrabold text-neutral-400 mt-1 uppercase tracking-widest">{n.file_type || 'Document'}</p>
                      </div>
                    </div>
                  )) : (
                    <div className="flex-1 flex items-center justify-center p-6 text-center"><p className="text-sm font-bold text-neutral-400">No recent notes</p></div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── 7. YOUR SUBJECTS RAIL ── */}
          {subjects.length > 0 && (
            <motion.div variants={fadeUp}>
              <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500">Your Subjects</h2>
                <button onClick={() => navigate('/student/subjects')} className="flex items-center gap-1 text-xs font-bold text-neutral-500 hover:text-neutral-900 transition-colors">
                  See all <ArrowRight size={13} />
                </button>
              </div>
              <div className="flex gap-4 overflow-x-auto scrollbar-hide snap-x pb-2 px-2 -mx-2">
                {subjects.map(c => {
                  const pastel = PASTEL[pastelFor(c.name)] || PASTEL.sky;
                  const vidCount = videos.filter(v => v.class_id === c.id).length;
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/student/subjects/${c.id}`)}
                      className="snap-start flex-shrink-0 w-44 rounded-[1.75rem] p-5 text-left shadow-card border border-black/5 hover:shadow-lift hover:-translate-y-0.5 transition-all"
                      style={{ background: pastel.hex }}
                    >
                      <div className="mb-3" style={{ color: pastel.fgHex }}>
                        <SubjectIcon value={c.emoji} size={28} />
                      </div>
                      <h3 className="font-bold text-[15px] leading-tight" style={{ color: pastel.fgHex }}>{c.name}</h3>
                      <p className="text-[11px] font-extrabold mt-1.5 uppercase tracking-widest" style={{ color: pastel.fgHex, opacity: 0.7 }}>
                        {vidCount} {vidCount === 1 ? 'lesson' : 'lessons'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── 8. QUICK STATS ── */}
          <motion.div variants={fadeUp} className="bg-neutral-900 rounded-[2.5rem] p-8 text-white shadow-xl">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                <Activity size={16} /> Your Progress
              </h2>
              {myRankEntry?.rank && (
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-300 bg-white/5 px-3 py-1.5 rounded-full">
                  <Trophy size={13} /> Rank #{myRankEntry.rank}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-8 gap-x-4">
              <div>
                <p className="text-3xl lg:text-4xl font-extrabold leading-none">{subjects.length}</p>
                <p className="text-[10px] lg:text-xs font-bold text-neutral-400 uppercase tracking-widest mt-2">Subjects</p>
              </div>
              <div>
                <p className="text-3xl lg:text-4xl font-extrabold leading-none">{submittedAssignments.length}</p>
                <p className="text-[10px] lg:text-xs font-bold text-neutral-400 uppercase tracking-widest mt-2">Assignments done</p>
              </div>
              <div>
                <p className="text-3xl lg:text-4xl font-extrabold leading-none">{Object.keys(myAttempts).length}</p>
                <p className="text-[10px] lg:text-xs font-bold text-neutral-400 uppercase tracking-widest mt-2">Tests taken</p>
              </div>
              <div>
                <p className="text-3xl lg:text-4xl font-extrabold leading-none">{videos.filter(v => v.completed).length}</p>
                <p className="text-[10px] lg:text-xs font-bold text-neutral-400 uppercase tracking-widest mt-2">Videos finished</p>
              </div>
            </div>
          </motion.div>

        </motion.div>
      </div>
    </div>
  );
}
