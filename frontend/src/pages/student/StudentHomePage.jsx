import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Calendar, FileText, CheckCircle, MessageSquare, Trophy, Star, ArrowRight, BookOpen, Clock, FileQuestion, Flame, StickyNote, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { Avatar, Skeleton } from '../../components/ui';
import { apiClient, leaderboardApi, testApi, assignmentApi, notesApi, videoApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { useAppCache } from '../../store';
import NotificationBell from '../../components/shared/NotificationBell';
import { fadeUp, staggerChildren } from '../../lib/motion';

export default function StudentHomePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState([]);
  const [myAttempts, setMyAttempts] = useState({});
  const [videos, setVideos] = useState([]);
  const [liveClasses, setLiveClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [recentNotes, setRecentNotes] = useState([]);
  const subjectsCache = useAppCache(s => s.subjects);
  const subjects = subjectsCache || [];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const standardId = user?.standard_id;
        const [testsData, history, vids, livesData, assignsData, broads, lb] = await Promise.all([
          testApi.getTests().catch(() => []),
          testApi.getStudentTestHistory().catch(() => []),
          apiClient('/videos?limit=15').catch(() => []),
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
        setAssignments(Array.isArray(assignsData) ? assignsData : []);
        setBroadcasts((Array.isArray(broads) ? broads : []).filter(b => !b.deleted).reverse());
        setLeaderboard(lb?.leaderboard || []);

        const activeVid = validVids.filter(v => v.progress_secs > 0 && !v.completed).slice(0, 1)[0] || validVids[0];
        if (activeVid?.class_id) {
          const notesData = await notesApi.getByClass(activeVid.class_id).catch(() => []);
          setRecentNotes(Array.isArray(notesData) ? notesData.slice(0, 3) : []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.standard_id]);

  const now = new Date();
  
  // Data Filtering
  const continueWatching = videos.filter(v => v.progress_secs > 0 && !v.completed).slice(0, 1)[0] || videos[0];
  const upcomingLives = liveClasses.filter(l => !l.ended_at && new Date(l.scheduled_for) > new Date(now.getTime() - 2 * 60 * 60 * 1000));
  const liveNow = upcomingLives.filter(l => new Date(l.scheduled_for) <= now);
  const futureLives = upcomingLives.filter(l => new Date(l.scheduled_for) > now);
  
  const activeAssignments = assignments.filter(a => !a.my_submission);
  const submittedAssignments = assignments.filter(a => a.my_submission);
  
  const availableTests = tests.filter(t => {
    if (myAttempts[t.id]) return false;
    if (t.status === 'active') return true;
    if (t.status === 'scheduled') return !t.scheduled_for || new Date(t.scheduled_for) <= now;
    return false;
  });

  const latestBroadcast = broadcasts[0];
  const myRank = leaderboard.find(l => l.id === user?.id);
  const displayName = user?.name?.split(' ')[0] || 'Student';

  const getSubjectName = (classId) => {
    const s = subjects.find(x => x.id === classId);
    return s ? s.name : 'Unknown Subject';
  };

  const CARD_COLORS = [
    { bg: 'bg-[#F8E1FB]', text: 'text-[#872792]', border: 'border-[#F1C2F7]' },
    { bg: 'bg-[#EAF3EB]', text: 'text-[#1D6A2B]', border: 'border-[#C8E4CD]' },
    { bg: 'bg-[#FFF6D8]', text: 'text-[#966B08]', border: 'border-[#FFEAB0]' },
    { bg: 'bg-[#E8F0FE]', text: 'text-[#1A56DB]', border: 'border-[#C6D8FB]' },
  ];

  const [videoThumbnails, setVideoThumbnails] = useState({});

  const heroCandidates = React.useMemo(() => {
    const inProgress = videos.filter(v => v.progress_secs > 0 && !v.completed);
    const notStarted = videos.filter(v => v.progress_secs === 0 && !v.completed);
    return [...inProgress, ...notStarted].slice(0, 5);
  }, [videos]);

  useEffect(() => {
    if (heroCandidates.length === 0) return;
    heroCandidates.forEach(async (v) => {
      if (videoThumbnails[v.id] !== undefined) return;
      try {
        const res = await videoApi.getThumbnail(v.id);
        if (res?.thumbnail_url) {
          setVideoThumbnails(prev => ({ ...prev, [v.id]: res.thumbnail_url }));
        } else {
          setVideoThumbnails(prev => ({ ...prev, [v.id]: null }));
        }
      } catch (e) {
        setVideoThumbnails(prev => ({ ...prev, [v.id]: null }));
      }
    });
  }, [heroCandidates, videoThumbnails]);

  const heroSlides = React.useMemo(() => {
    const gradients = [
      'from-slate-900 to-indigo-900',
      'from-slate-900 to-emerald-900',
      'from-slate-900 to-rose-900',
      'from-slate-900 to-amber-900',
      'from-slate-900 to-purple-900',
    ];

    if (heroCandidates.length === 0) {
      return [{
        id: 'welcome',
        tag: 'WELCOME',
        title: `Ready to learn, ${displayName}?`,
        subtitle: 'Explore your courses below',
        bg: 'from-slate-900 to-indigo-900',
        path: '',
        thumbnail: null
      }];
    }

    return heroCandidates.map((v, idx) => ({
      id: v.id,
      tag: v.progress_secs > 0 ? 'CONTINUE WATCHING' : 'UP NEXT',
      title: v.title,
      subtitle: getSubjectName(v.class_id),
      description: v.description || 'Dive into this comprehensive lesson and continue your learning journey.',
      duration: v.duration_secs ? Math.round(v.duration_secs / 60) + 'm' : '',
      bg: gradients[idx % gradients.length],
      path: `/student/subjects/${v.class_id}/video/${v.id}`,
      progress: v.duration_secs ? (v.progress_secs / v.duration_secs) * 100 : 0,
      thumbnail: videoThumbnails[v.id] || null
    }));
  }, [heroCandidates, subjects, displayName, videoThumbnails]);

  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % heroSlides.length);
    }, 4500); // 4.5 seconds auto scroll
    return () => clearInterval(timer);
  }, [heroSlides.length, currentSlide]);

  const nextSlide = () => setCurrentSlide(prev => (prev + 1) % heroSlides.length);
  const prevSlide = () => setCurrentSlide(prev => (prev - 1 + heroSlides.length) % heroSlides.length);

  if (loading) {
    return (
      <div className="px-5 md:px-8 py-8 max-w-[800px] mx-auto space-y-8 bg-[#F4F7F6] min-h-screen">
        <Skeleton className="h-20 w-full rounded-[2rem]" />
        <Skeleton className="h-[250px] w-full rounded-[2.5rem]" />
        <Skeleton className="h-[400px] w-full rounded-[2.5rem]" />
      </div>
    );
  }

  const tasksPending = activeAssignments.length + availableTests.length;
  const streakDays = myRank?.streak || 0; // Fallback if streak is added to DB

  return (
    <div className="pb-32 bg-[#F4F7F6] min-h-screen font-sans selection:bg-indigo-100 selection:text-indigo-900 flex justify-center">
      <div className="w-full max-w-[1100px] px-5 pt-8">
        <motion.div variants={staggerChildren} initial="hidden" animate="show" className="flex flex-col gap-10 lg:gap-12">
          
          {/* ── 1. WELCOME & STATUS (FULL WIDTH) ── */}
          <div className="flex flex-col gap-6">
            <motion.div variants={fadeUp} className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4">
                <Avatar name={user?.name || '?'} src={user?.avatar_url} size="lg" className="ring-4 ring-white shadow-sm" />
                <div>
                  <p className="text-sm text-neutral-500 font-bold uppercase tracking-widest mb-0.5">{greeting},</p>
                  <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 leading-none">{displayName}</h1>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => navigate('/student/calendar')} className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#EAF3EB] rounded-full transition-colors">
                  <Calendar size={18} />
                </button>
                <NotificationBell />
              </div>
            </motion.div>

            {/* Top Info Badges */}
            <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-[2rem] p-4 flex items-center gap-3 shadow-sm border border-black/5">
                <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                  <Flame size={20} fill="currentColor" />
                </div>
                <div>
                  <p className="text-xs text-neutral-500 font-bold uppercase">Learning Streak</p>
                  <p className="font-extrabold text-neutral-900">{streakDays} Days</p>
                </div>
              </div>
              <div className="bg-white rounded-[2rem] p-4 flex items-center gap-3 shadow-sm border border-black/5">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <CheckCircle size={20} />
                </div>
                <div>
                  <p className="text-xs text-neutral-500 font-bold uppercase">Tasks Pending</p>
                  <p className="font-extrabold text-neutral-900">{tasksPending} Tasks</p>
                </div>
              </div>
              <div className="bg-white rounded-[2rem] p-4 flex items-center gap-3 shadow-sm border border-black/5 col-span-2 sm:col-span-1">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                  <Calendar size={20} />
                </div>
                <div>
                  <p className="text-xs text-neutral-500 font-bold uppercase">Live Classes</p>
                  <p className="font-extrabold text-neutral-900">{liveNow.length + futureLives.length} Today</p>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="flex flex-col lg:flex-row gap-10 lg:gap-12">
            
            {/* ── MAIN COLUMN (LEFT) ── */}
            <div className="flex-1 min-w-0 flex flex-col gap-10 lg:gap-12">
              
              {/* ── HOTSTAR-STYLE HIGHLIGHTS CAROUSEL ── */}
              {heroSlides.length > 0 && (
                <motion.div variants={fadeUp}>
                  <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-2">Watch Next</h2>
                  <div className="relative w-full h-[340px] sm:h-[400px] rounded-3xl overflow-hidden shadow-2xl group bg-[#0f1014] border border-black/10">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentSlide}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.8 }}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.2}
                        onDragEnd={(e, { offset }) => {
                          if (offset.x < -50) nextSlide();
                          else if (offset.x > 50) prevSlide();
                        }}
                        className="absolute inset-0 w-full h-full cursor-pointer flex flex-col justify-end bg-[#0f1014]"
                        onClick={() => heroSlides[currentSlide].path && navigate(heroSlides[currentSlide].path)}
                      >
                        {/* Background Overlay / Thumbnail */}
                        {heroSlides[currentSlide].thumbnail ? (
                          <img 
                            src={heroSlides[currentSlide].thumbnail} 
                            alt={heroSlides[currentSlide].title} 
                            className="absolute right-0 top-0 w-full md:w-[70%] h-full object-cover z-0 pointer-events-none"
                          />
                        ) : (
                          <div className={`absolute right-0 top-0 w-full md:w-[70%] h-full bg-gradient-to-br ${heroSlides[currentSlide].bg} z-0 opacity-80 pointer-events-none`} />
                        )}

                        {/* Hotstar Cinematic Gradients */}
                        <div className="absolute inset-y-0 left-0 w-full sm:w-[75%] bg-gradient-to-r from-[#0f1014] via-[#0f1014]/90 to-transparent z-0 pointer-events-none" />
                        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-[#0f1014] via-[#0f1014]/90 to-transparent z-0 pointer-events-none" />
                        
                        {/* Content Container */}
                        <div className="relative z-10 flex flex-col items-start gap-4 w-full sm:w-[70%] px-6 pb-8 sm:px-10 sm:pb-10">
                          
                          <div className="pointer-events-none">
                            <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold mb-3 tracking-tight leading-[1.1] text-white drop-shadow-md">
                              {heroSlides[currentSlide].title}
                            </h2>
                            
                            {/* Metadata Row */}
                            <div className="flex items-center flex-wrap gap-2 text-white/80 text-[13px] font-bold mb-3 drop-shadow-sm">
                              <span className="text-[#FFCC00] uppercase tracking-widest text-[11px] bg-white/10 px-2 py-0.5 rounded-sm">
                                {heroSlides[currentSlide].tag}
                              </span>
                              <span>{heroSlides[currentSlide].subtitle}</span>
                              {heroSlides[currentSlide].duration && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-white/40" />
                                  <span>{heroSlides[currentSlide].duration}</span>
                                </>
                              )}
                            </div>

                            {/* Description */}
                            <p className="text-white/50 text-sm leading-relaxed line-clamp-2 sm:line-clamp-3 mb-2 max-w-[90%] font-medium">
                              {heroSlides[currentSlide].description}
                            </p>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full mt-2 pointer-events-none">
                            <button className="flex items-center justify-center gap-2 bg-white text-black px-8 py-3.5 rounded-lg font-bold text-[15px] hover:bg-neutral-200 transition-colors pointer-events-auto">
                              <Play size={20} fill="currentColor" />
                              {heroSlides[currentSlide].progress > 0 ? 'Watch Now' : 'Start Watching'}
                            </button>
                          </div>
                        </div>

                        {/* Bottom edge Progress Bar exactly like Hotstar */}
                        {heroSlides[currentSlide].progress > 0 && (
                          <div className="absolute bottom-0 left-0 w-full h-[3px] bg-white/20 z-20 pointer-events-none">
                            <div className="h-full bg-[#1f80e0]" style={{ width: `${heroSlides[currentSlide].progress}%` }} />
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>

                    {/* Left/Right Navigation Arrows (Desktop) */}
                    {heroSlides.length > 1 && (
                      <>
                        <button 
                          onClick={(e) => { e.stopPropagation(); prevSlide(); }}
                          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/40 hover:bg-black/80 text-white rounded-full flex items-center justify-center backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity z-20"
                        >
                          <ChevronLeft size={24} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); nextSlide(); }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/40 hover:bg-black/80 text-white rounded-full flex items-center justify-center backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity z-20"
                        >
                          <ChevronRight size={24} />
                        </button>

                        {/* Hotstar Style Thumb/Dot Indicators */}
                        <div className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 flex gap-1.5 z-20">
                          {heroSlides.map((_, idx) => (
                            <div 
                              key={idx} 
                              onClick={(e) => { e.stopPropagation(); setCurrentSlide(idx); }}
                              className={`h-1.5 rounded-full cursor-pointer transition-all duration-500 ${idx === currentSlide ? 'w-8 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/60'}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── LEARNING ROADMAP ── */}
              {subjects.length > 0 && (
                <motion.div variants={fadeUp} className="relative mt-2 lg:mt-4">
                  <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-8 px-2 text-center">Learning Roadmap</h2>
                  
                  <div className="relative max-w-md mx-auto py-4">
                    <div className="absolute top-0 bottom-0 left-1/2 -ml-[2px] w-1 bg-neutral-200/60 rounded-full" />
                    
                    <div className="space-y-12 relative z-10">
                      {subjects.map((c, i) => {
                        const isLeft = i % 2 === 0;
                        const theme = CARD_COLORS[i % CARD_COLORS.length];
                        const isActive = continueWatching?.class_id === c.id;
                        
                        const CardContent = () => (
                          <div className={`w-full ${theme.bg} ${theme.border} border rounded-[2rem] p-4 sm:p-5 shadow-sm group-hover:shadow-md group-hover:-translate-y-1 transition-all max-w-[220px] ${isLeft ? 'text-right' : 'text-left'}`}>
                            <div className={`flex items-center gap-3 mb-2 ${isLeft ? 'justify-end' : 'justify-start'}`}>
                              {isLeft && isActive && (
                                <span className="bg-white/60 text-black/60 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-widest">Active</span>
                              )}
                              <div className="text-2xl">{c.emoji || '📘'}</div>
                              {!isLeft && isActive && (
                                <span className="bg-white/60 text-black/60 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-widest">Active</span>
                              )}
                            </div>
                            <h3 className={`font-bold text-[15px] leading-tight ${theme.text}`}>{c.name}</h3>
                            <p className="text-[11px] font-bold text-black/40 mt-2 uppercase tracking-widest">
                              {i === 0 ? 'Foundation' : 'Module ' + (i + 1)}
                            </p>
                          </div>
                        );

                        return (
                          <div key={c.id} className="relative w-full grid grid-cols-2 gap-0 cursor-pointer group items-center" onClick={() => navigate(`/student/subjects/${c.id}`)}>
                            {/* The Node Dot */}
                            <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-4 border-[#F4F7F6] shadow-sm z-20 ${isActive ? 'bg-indigo-500 scale-125' : 'bg-neutral-300 group-hover:bg-indigo-400'} transition-all duration-300`} />
                            
                            {/* Left Side */}
                            <div className="col-span-1 flex justify-end pr-6 sm:pr-10">
                              {isLeft && <CardContent />}
                            </div>

                            {/* Right Side */}
                            <div className="col-span-1 flex justify-start pl-6 sm:pl-10">
                              {!isLeft && <CardContent />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* ── SIDEBAR (RIGHT) ── */}
            <div className="w-full lg:w-[400px] flex-shrink-0 flex flex-col gap-10 lg:gap-12">
              
              {/* ── LIVE NOW ── */}
              {liveNow.length > 0 && (
                <motion.div variants={fadeUp}>
                  <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-2">Live Classes</h2>
                  <div className="bg-[#FFE5E5] rounded-[2.5rem] p-6 border border-[#FFD0D0] shadow-sm cursor-pointer hover:shadow-md transition-all relative overflow-hidden" onClick={() => navigate('/student/live')}>
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                      <Calendar size={120} />
                    </div>
                    <div className="relative z-10 flex flex-col items-start gap-5">
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                          <span className="text-[11px] font-extrabold uppercase tracking-widest text-red-600">Live Now</span>
                        </div>
                        <h3 className="text-2xl font-bold text-red-950 mb-1 leading-tight">{liveNow[0].topic}</h3>
                        <p className="text-sm font-bold text-red-800">{getSubjectName(liveNow[0].class_id)}</p>
                      </div>
                      <button className="w-full px-8 py-3.5 bg-red-600 text-white font-bold rounded-full hover:bg-red-700 transition-colors shadow-sm">
                        Join Now
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── TODAY'S TASKS ── */}
              {(activeAssignments.length > 0 || availableTests.length > 0) && (
                <motion.div variants={fadeUp}>
                  <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-2">Today's Tasks</h2>
                  <div className="grid grid-cols-1 gap-4">
                    {activeAssignments.map(a => {
                      const due = a.due_date ? new Date(a.due_date) : null;
                      const isPast = due && due < now;
                      return (
                        <div key={`ass-${a.id}`} onClick={() => navigate(`/student/subjects/${a.class_id}`)} className="bg-white rounded-[2rem] p-5 shadow-sm border border-black/5 flex flex-col items-start gap-4 cursor-pointer hover:shadow-md transition-shadow group">
                          <div className="flex items-center gap-4 w-full">
                            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                              <FileText size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-extrabold text-amber-600 uppercase tracking-widest mb-1">Assignment</p>
                              <h4 className="font-bold text-neutral-900 leading-snug truncate">{a.title}</h4>
                              {due && (
                                <p className={`text-xs font-semibold mt-1 ${isPast ? 'text-red-500' : 'text-neutral-500'}`}>
                                  Due {due.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              )}
                            </div>
                          </div>
                          <button className="w-full px-5 py-2.5 bg-neutral-100 text-neutral-700 font-bold text-sm rounded-full group-hover:bg-amber-100 group-hover:text-amber-800 transition-colors">
                            Open Assignment
                          </button>
                        </div>
                      );
                    })}
                    {availableTests.map(t => (
                      <div key={`test-${t.id}`} onClick={() => navigate(`/student/tests/${t.id}/take`)} className="bg-white rounded-[2rem] p-5 shadow-sm border border-black/5 flex flex-col items-start gap-4 cursor-pointer hover:shadow-md transition-shadow group">
                        <div className="flex items-center gap-4 w-full">
                          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                            <FileQuestion size={20} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-widest mb-1">Test Available</p>
                            <h4 className="font-bold text-neutral-900 leading-snug truncate">{t.title}</h4>
                            <p className="text-xs font-semibold mt-1 text-neutral-500">{t.duration_mins} mins · {t.total_marks} Questions</p>
                          </div>
                        </div>
                        <button className="w-full px-5 py-2.5 bg-neutral-100 text-neutral-700 font-bold text-sm rounded-full group-hover:bg-emerald-100 group-hover:text-emerald-800 transition-colors">
                          Start Test
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ── UPCOMING ── */}
              {futureLives.length > 0 && (
                <motion.div variants={fadeUp}>
                  <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-2">Upcoming</h2>
                  <div className="grid grid-cols-1 gap-4">
                    {futureLives.map(l => (
                      <div key={l.id} className="bg-white rounded-[2rem] p-5 shadow-sm border border-black/5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center flex-shrink-0">
                          <Calendar size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest mb-1">
                            {new Date(l.scheduled_for).toLocaleDateString('en-US', { weekday: 'long' })}
                          </p>
                          <h4 className="font-bold text-neutral-900 leading-snug truncate">Live Class - {l.topic}</h4>
                          <p className="text-xs font-semibold mt-1 text-neutral-500">
                            {new Date(l.scheduled_for).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ── UPDATES: ANNOUNCEMENTS & NOTES ── */}
              <motion.div variants={fadeUp} className="flex flex-col gap-10">
                <div>
                  <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-2">Announcements</h2>
                  <div className="bg-white rounded-[2rem] p-2 shadow-sm border border-black/5 flex flex-col h-full min-h-[160px]">
                    {broadcasts.length > 0 ? broadcasts.slice(0, 3).map((b, i) => (
                      <div key={b.id || i} className="p-4 flex items-start gap-3 border-b border-black/5 last:border-0 hover:bg-neutral-50 rounded-2xl cursor-pointer" onClick={() => navigate('/student/broadcasts')}>
                        <MessageSquare size={16} className="text-blue-500 mt-1 flex-shrink-0" />
                        <div>
                          <p className="font-bold text-sm text-neutral-900 line-clamp-2">{b.message || b.text}</p>
                          <p className="text-[10px] font-extrabold text-neutral-400 mt-1 uppercase tracking-widest">
                            {new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    )) : (
                      <div className="flex-1 flex items-center justify-center p-6 text-center">
                        <p className="text-sm font-bold text-neutral-400">No new announcements</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-2">Recent Notes</h2>
                  <div className="bg-white rounded-[2rem] p-2 shadow-sm border border-black/5 flex flex-col h-full min-h-[160px]">
                    {recentNotes.length > 0 ? recentNotes.map((n, i) => (
                      <div key={n.id || i} className="p-4 flex items-start gap-3 border-b border-black/5 last:border-0 hover:bg-neutral-50 rounded-2xl cursor-pointer" onClick={() => window.open(n.file_url, '_blank')}>
                        <StickyNote size={16} className="text-purple-500 mt-1 flex-shrink-0" />
                        <div>
                          <p className="font-bold text-sm text-neutral-900 line-clamp-1">{n.title}</p>
                          <p className="text-[10px] font-extrabold text-neutral-400 mt-1 uppercase tracking-widest">PDF Document</p>
                        </div>
                      </div>
                    )) : (
                      <div className="flex-1 flex items-center justify-center p-6 text-center">
                        <p className="text-sm font-bold text-neutral-400">No recent notes available</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* ── QUICK STATS ── */}
              <motion.div variants={fadeUp} className="bg-neutral-900 rounded-[2.5rem] p-8 text-white shadow-xl mt-4">
                <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-400 mb-8 flex items-center gap-2">
                  <Activity size={16} /> Quick Stats
                </h2>
                <div className="grid grid-cols-2 gap-y-8 gap-x-4">
                  <div>
                    <p className="text-3xl lg:text-4xl font-extrabold leading-none">{subjects.length}</p>
                    <p className="text-[10px] lg:text-xs font-bold text-neutral-400 uppercase tracking-widest mt-2">Courses Enrolled</p>
                  </div>
                  <div>
                    <p className="text-3xl lg:text-4xl font-extrabold leading-none">{submittedAssignments.length}</p>
                    <p className="text-[10px] lg:text-xs font-bold text-neutral-400 uppercase tracking-widest mt-2">Assignments</p>
                  </div>
                  <div>
                    <p className="text-3xl lg:text-4xl font-extrabold leading-none">{Object.keys(myAttempts).length}</p>
                    <p className="text-[10px] lg:text-xs font-bold text-neutral-400 uppercase tracking-widest mt-2">Tests Taken</p>
                  </div>
                  <div>
                    <p className="text-3xl lg:text-4xl font-extrabold leading-none">{videos.filter(v => v.completed).length}</p>
                    <p className="text-[10px] lg:text-xs font-bold text-neutral-400 uppercase tracking-widest mt-2">Videos Finished</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
