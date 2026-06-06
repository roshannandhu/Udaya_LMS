import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Calendar, FileText, CheckCircle, MessageSquare, Trophy, Star, ArrowRight, BookOpen, Clock, FileQuestion, Flame, StickyNote, Activity } from 'lucide-react';
import { Avatar, Skeleton } from '../../components/ui';
import { apiClient, leaderboardApi, testApi, assignmentApi, notesApi } from '../../lib/api';
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
      <div className="w-full max-w-[700px] px-5 pt-8">
        <motion.div variants={staggerChildren} initial="hidden" animate="show" className="flex flex-col gap-10">
          
          {/* ── 1. WELCOME & STATUS ── */}
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

          {/* ── 2. CONTINUE LEARNING ── */}
          {continueWatching && (
            <motion.div variants={fadeUp}>
              <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-2">Continue Learning</h2>
              <div 
                className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-black/5 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
                onClick={() => navigate(`/student/subjects/${continueWatching.class_id}/video/${continueWatching.id}`)}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <BookOpen size={20} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">{getSubjectName(continueWatching.class_id)}</p>
                  </div>
                </div>

                <h3 className="text-2xl font-extrabold text-neutral-900 leading-tight mb-6 pr-4" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                  {continueWatching.title}
                </h3>
                
                <div className="bg-neutral-50 rounded-[1.5rem] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border border-neutral-100">
                  <div className="flex-1 w-full">
                    {continueWatching.progress_secs > 0 ? (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2.5 bg-neutral-200 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${continueWatching.duration_secs ? Math.min(100, (continueWatching.progress_secs / continueWatching.duration_secs) * 100) : 0}%` }} />
                        </div>
                        <span className="text-xs font-extrabold text-neutral-500 w-10 text-right">
                          {continueWatching.duration_secs ? Math.round((continueWatching.progress_secs / continueWatching.duration_secs) * 100) : 0}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-neutral-500">Not started yet</span>
                    )}
                  </div>
                  <button className="w-full sm:w-auto px-6 py-2.5 bg-neutral-900 text-white font-bold rounded-full text-sm group-hover:bg-indigo-600 transition-colors">
                    Continue Learning
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── 3. LEARNING ROADMAP ── */}
          {subjects.length > 0 && (
            <motion.div variants={fadeUp} className="relative mt-4">
              <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-8 px-2 text-center">Learning Roadmap</h2>
              
              <div className="relative max-w-md mx-auto py-4">
                <div className="absolute top-0 bottom-0 left-1/2 -ml-[2px] w-1 bg-neutral-200/60 rounded-full" />
                
                <div className="space-y-12 relative z-10">
                  {subjects.map((c, i) => {
                    const isLeft = i % 2 === 0;
                    const theme = CARD_COLORS[i % CARD_COLORS.length];
                    const isActive = continueWatching?.class_id === c.id;
                    
                    return (
                      <div key={c.id} className="relative w-full flex items-center justify-center cursor-pointer group" onClick={() => navigate(`/student/subjects/${c.id}`)}>
                        <div className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-4 border-[#F4F7F6] shadow-sm z-20 ${isActive ? 'bg-indigo-500 scale-125' : 'bg-neutral-300 group-hover:bg-indigo-400'} transition-all duration-300`} />
                        
                        <div className={`w-1/2 ${isLeft ? 'pr-8 sm:pr-12 text-right' : 'pl-8 sm:pl-12 text-left absolute right-0'}`}>
                          <div className={`inline-block ${theme.bg} ${theme.border} border rounded-[2rem] p-4 sm:p-5 shadow-sm group-hover:shadow-md group-hover:-translate-y-1 transition-all max-w-[220px] text-left`}>
                            <div className="flex items-center gap-3 mb-2">
                              <div className="text-2xl">{c.emoji || '📘'}</div>
                              {isActive && (
                                <span className="bg-white/60 text-black/60 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-widest">Active</span>
                              )}
                            </div>
                            <h3 className={`font-bold text-[15px] leading-tight ${theme.text}`}>{c.name}</h3>
                            <p className="text-[11px] font-bold text-black/40 mt-2 uppercase tracking-widest">
                              {i === 0 ? 'Foundation' : 'Module ' + (i + 1)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── 4. LIVE NOW ── */}
          {liveNow.length > 0 && (
            <motion.div variants={fadeUp}>
              <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-2">Live Classes</h2>
              <div className="bg-[#FFE5E5] rounded-[2.5rem] p-6 border border-[#FFD0D0] shadow-sm cursor-pointer hover:shadow-md transition-all relative overflow-hidden" onClick={() => navigate('/student/live')}>
                <div className="absolute top-0 right-0 p-6 opacity-10">
                  <Calendar size={120} />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                      <span className="text-[11px] font-extrabold uppercase tracking-widest text-red-600">Live Now</span>
                    </div>
                    <h3 className="text-2xl font-bold text-red-950 mb-1 leading-tight">{liveNow[0].topic}</h3>
                    <p className="text-sm font-bold text-red-800">{getSubjectName(liveNow[0].class_id)}</p>
                  </div>
                  <button className="w-full md:w-auto px-8 py-3.5 bg-red-600 text-white font-bold rounded-full hover:bg-red-700 transition-colors shadow-sm">
                    Join Now
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── 5. TODAY'S TASKS ── */}
          {(activeAssignments.length > 0 || availableTests.length > 0) && (
            <motion.div variants={fadeUp}>
              <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-2">Today's Tasks</h2>
              <div className="grid grid-cols-1 gap-4">
                {activeAssignments.map(a => {
                  const due = a.due_date ? new Date(a.due_date) : null;
                  const isPast = due && due < now;
                  return (
                    <div key={`ass-${a.id}`} onClick={() => navigate(`/student/subjects/${a.class_id}`)} className="bg-white rounded-[2rem] p-5 shadow-sm border border-black/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:shadow-md transition-shadow group">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                          <FileText size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-extrabold text-amber-600 uppercase tracking-widest mb-1">Assignment</p>
                          <h4 className="font-bold text-neutral-900 leading-snug">{a.title}</h4>
                          {due && (
                            <p className={`text-xs font-semibold mt-1 ${isPast ? 'text-red-500' : 'text-neutral-500'}`}>
                              Due {due.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                      </div>
                      <button className="w-full sm:w-auto px-5 py-2 bg-neutral-100 text-neutral-700 font-bold text-sm rounded-full group-hover:bg-amber-100 group-hover:text-amber-800 transition-colors">
                        Open Assignment
                      </button>
                    </div>
                  );
                })}
                {availableTests.map(t => (
                  <div key={`test-${t.id}`} onClick={() => navigate(`/student/tests/${t.id}/take`)} className="bg-white rounded-[2rem] p-5 shadow-sm border border-black/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:shadow-md transition-shadow group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                        <FileQuestion size={20} />
                      </div>
                      <div>
                        <p className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-widest mb-1">Test Available</p>
                        <h4 className="font-bold text-neutral-900 leading-snug">{t.title}</h4>
                        <p className="text-xs font-semibold mt-1 text-neutral-500">{t.duration_mins} mins · {t.total_marks} Questions</p>
                      </div>
                    </div>
                    <button className="w-full sm:w-auto px-5 py-2 bg-neutral-100 text-neutral-700 font-bold text-sm rounded-full group-hover:bg-emerald-100 group-hover:text-emerald-800 transition-colors">
                      Start Test
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── 6. UPCOMING ── */}
          {futureLives.length > 0 && (
            <motion.div variants={fadeUp}>
              <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-2">Upcoming</h2>
              <div className="grid grid-cols-1 gap-4">
                {futureLives.map(l => (
                  <div key={l.id} className="bg-white rounded-[2rem] p-5 shadow-sm border border-black/5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center flex-shrink-0">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest mb-1">
                        {new Date(l.scheduled_for).toLocaleDateString('en-US', { weekday: 'long' })}
                      </p>
                      <h4 className="font-bold text-neutral-900 leading-snug">Live Class - {l.topic}</h4>
                      <p className="text-xs font-semibold mt-1 text-neutral-500">
                        {new Date(l.scheduled_for).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── 7. UPDATES: ANNOUNCEMENTS & NOTES ── */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-8">
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

          {/* ── 8. QUICK STATS ── */}
          <motion.div variants={fadeUp} className="bg-neutral-900 rounded-[2.5rem] p-8 sm:p-10 text-white shadow-xl">
            <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-400 mb-8 flex items-center gap-2">
              <Activity size={16} /> Quick Stats
            </h2>
            <div className="grid grid-cols-2 gap-y-8 gap-x-4">
              <div>
                <p className="text-4xl font-extrabold leading-none">{subjects.length}</p>
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mt-2">Courses Enrolled</p>
              </div>
              <div>
                <p className="text-4xl font-extrabold leading-none">{submittedAssignments.length}</p>
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mt-2">Assignments Submitted</p>
              </div>
              <div>
                <p className="text-4xl font-extrabold leading-none">{Object.keys(myAttempts).length}</p>
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mt-2">Tests Completed</p>
              </div>
              <div>
                <p className="text-4xl font-extrabold leading-none">{videos.filter(v => v.completed).length}</p>
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mt-2">Videos Watched</p>
              </div>
            </div>
          </motion.div>

        </motion.div>
      </div>
    </div>
  );
}
