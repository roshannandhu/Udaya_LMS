import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Calendar, FileText, CheckCircle, MessageSquare, Trophy, Star, ArrowRight, Zap, BookOpen, Clock, AlertCircle, FileQuestion, Flame, StickyNote } from 'lucide-react';
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
  const subjects = useAppCache(s => s.subjects);

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

        // Fetch notes for the subject of the most recently watched video
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
  
  const activeAssignments = assignments.filter(a => !a.my_submission);
  const availableTests = tests.filter(t => {
    if (myAttempts[t.id]) return false;
    if (t.status === 'active') return true;
    if (t.status === 'scheduled') return !t.scheduled_for || new Date(t.scheduled_for) <= now;
    return false;
  });

  const latestBroadcast = broadcasts[0];
  const myRank = leaderboard.find(l => l.id === user?.id);
  const displayName = user?.name?.split(' ')[0] || 'Student';

  const formatTime = (secs) => {
    if (!secs) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getSubjectName = (classId) => {
    const s = subjects.find(x => x.id === classId);
    return s ? s.name : 'Unknown Subject';
  };

  if (loading) {
    return (
      <div className="px-5 md:px-8 py-8 max-w-[1000px] mx-auto space-y-8 bg-[#F8F9FA] min-h-screen">
        <Skeleton className="h-16 w-full rounded-[2rem]" />
        <Skeleton className="h-[200px] w-full rounded-[2.5rem]" />
        <Skeleton className="h-[300px] w-full rounded-[2.5rem]" />
      </div>
    );
  }

  return (
    <div className="pb-24 bg-[#F8F9FA] min-h-screen font-sans selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* ── 1. Top Bar / Welcome Section ── */}
      <div className="bg-[#F8F9FA] pt-6 pb-4 sticky top-0 z-30">
        <div className="max-w-[1000px] mx-auto px-5 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/student/profile')} className="flex-shrink-0 rounded-full hover:scale-105 transition-transform shadow-sm">
              <Avatar name={user?.name || '?'} src={user?.avatar_url} size="md" />
            </button>
            <div className="flex-1">
              <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest mb-0.5">{greeting}</p>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-neutral-900 leading-none">{displayName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {myRank && (
              <div className="hidden sm:flex items-center gap-2 bg-orange-100 text-orange-700 px-3 py-1.5 rounded-full font-bold text-sm shadow-sm cursor-pointer hover:bg-orange-200 transition-colors" onClick={() => navigate('/student/leaderboard')}>
                <Flame size={16} fill="currentColor" />
                {myRank.points} XP
              </div>
            )}
            <NotificationBell />
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 max-w-[1000px] mx-auto mt-4">
        <motion.div variants={staggerChildren} initial="hidden" animate="show" className="flex flex-col gap-8">
          
          {/* ── 2. LIVE NOW BANNER (Highest Priority) ── */}
          {liveNow.length > 0 && (
            <motion.div variants={fadeUp} className="bg-red-600 text-white rounded-[2rem] p-6 shadow-lg shadow-red-500/20 flex flex-col sm:flex-row items-center gap-6 cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate('/student/live')}>
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 animate-pulse">
                <Calendar size={32} className="text-white" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/80">Live Now</span>
                </div>
                <h2 className="text-xl font-bold leading-tight">{liveNow[0].topic}</h2>
                <p className="text-sm text-white/70 mt-1">{getSubjectName(liveNow[0].class_id)}</p>
              </div>
              <button className="px-6 py-3 bg-white text-red-600 font-bold rounded-full w-full sm:w-auto shadow-sm">
                Join Class
              </button>
            </motion.div>
          )}

          {/* ── 3. TODAY'S TASKS (Urgent Actions) ── */}
          {(activeAssignments.length > 0 || availableTests.length > 0) && (
            <motion.div variants={fadeUp}>
              <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-1">Today's Tasks</h2>
              <div className="flex overflow-x-auto gap-4 pb-4 custom-scrollbar snap-x">
                {availableTests.map(t => (
                  <div key={`test-${t.id}`} onClick={() => navigate(`/student/tests/${t.id}/take`)} className="snap-start flex-shrink-0 w-72 bg-emerald-50 rounded-[2rem] p-5 border border-emerald-100 cursor-pointer hover:bg-emerald-100 transition-colors group">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-200 text-emerald-700 flex items-center justify-center">
                        <FileQuestion size={20} />
                      </div>
                      <span className="bg-white text-emerald-700 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full shadow-sm">Test</span>
                    </div>
                    <h3 className="font-bold text-neutral-900 leading-snug line-clamp-2">{t.title}</h3>
                    <p className="text-xs text-emerald-600 font-bold mt-2 flex items-center gap-1"><Clock size={12}/> {t.duration_mins} mins</p>
                  </div>
                ))}

                {activeAssignments.map(a => {
                  const due = a.due_date ? new Date(a.due_date) : null;
                  const isPast = due && due < now;
                  return (
                    <div key={`ass-${a.id}`} onClick={() => navigate(`/student/subjects/${a.class_id}`)} className="snap-start flex-shrink-0 w-72 bg-amber-50 rounded-[2rem] p-5 border border-amber-100 cursor-pointer hover:bg-amber-100 transition-colors group">
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center">
                          <FileText size={20} />
                        </div>
                        <span className="bg-white text-amber-700 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full shadow-sm">Assignment</span>
                      </div>
                      <h3 className="font-bold text-neutral-900 leading-snug line-clamp-2">{a.title}</h3>
                      {due && (
                        <p className={`text-xs font-bold mt-2 flex items-center gap-1 ${isPast ? 'text-red-500' : 'text-amber-600'}`}>
                          <Clock size={12}/> Due {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── 4. CONTINUE LEARNING HERO ── */}
          {continueWatching && (
            <motion.div variants={fadeUp}>
              <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-1">Continue Learning</h2>
              <div 
                className="relative bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-sm border border-neutral-100 cursor-pointer hover:shadow-lg transition-all duration-300 group overflow-hidden"
                onClick={() => navigate(`/student/subjects/${continueWatching.class_id}/video/${continueWatching.id}`)}
              >
                <div className="absolute right-0 top-0 w-1/3 h-full bg-gradient-to-l from-indigo-50 to-transparent pointer-events-none" />
                
                <div className="flex flex-col sm:flex-row gap-6 items-center relative z-10">
                  <div className="w-full sm:w-48 h-32 rounded-2xl overflow-hidden bg-neutral-900 relative shadow-sm flex-shrink-0">
                    {continueWatching.thumbnail_url ? (
                      <img src={continueWatching.thumbnail_url} className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500" alt="Video thumbnail" />
                    ) : (
                      <div className="w-full h-full bg-indigo-500 opacity-90 group-hover:scale-105 transition-transform duration-500" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Play size={20} className="text-white ml-1" fill="currentColor" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex-1 w-full">
                    <p className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-500 mb-2 flex items-center gap-1.5">
                      <BookOpen size={14} /> {getSubjectName(continueWatching.class_id)}
                    </p>
                    <h3 className="text-xl sm:text-2xl font-bold text-neutral-900 leading-tight mb-4" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                      {continueWatching.title}
                    </h3>
                    
                    {continueWatching.progress_secs > 0 ? (
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (continueWatching.progress_secs / continueWatching.duration_secs) * 100)}%` }} />
                        </div>
                        <span className="text-xs font-bold text-neutral-400 w-12 text-right">
                          {Math.round((continueWatching.progress_secs / continueWatching.duration_secs) * 100)}%
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-indigo-600 font-bold text-sm">
                        Start Lesson <ArrowRight size={16} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── 5. LEARNING JOURNEY (Subjects) ── */}
          <motion.div variants={fadeUp}>
            <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-1">Your Courses</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {subjects.map(c => (
                <div key={c.id} onClick={() => navigate(`/student/subjects/${c.id}`)} className="bg-white p-5 rounded-[2rem] border border-neutral-100 shadow-sm cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all flex items-center gap-4 group">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-2xl group-hover:scale-110 group-hover:bg-indigo-100 transition-all">
                    {c.emoji || '📘'}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-neutral-900">{c.name}</h3>
                    <p className="text-xs font-semibold text-neutral-400 mt-0.5">View Modules</p>
                  </div>
                  <ArrowRight size={20} className="text-neutral-300 group-hover:text-indigo-500 transition-colors" />
                </div>
              ))}
            </div>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* ── 6. ANNOUNCEMENTS ── */}
            <motion.div variants={fadeUp}>
              <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-1">Announcements</h2>
              {latestBroadcast ? (
                <div onClick={() => navigate('/student/broadcasts')} className="bg-[#E8F0FE] rounded-[2rem] p-6 sm:p-8 cursor-pointer hover:shadow-md transition-shadow group h-full">
                  <MessageSquare size={24} className="text-blue-500 mb-4" />
                  <p className="font-semibold text-blue-900 leading-relaxed line-clamp-3">
                    "{latestBroadcast.message || latestBroadcast.text}"
                  </p>
                  <p className="text-xs font-bold text-blue-600 mt-4 uppercase tracking-widest">
                    Read more
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-[2rem] p-8 border border-neutral-100 text-center h-full flex flex-col items-center justify-center">
                  <p className="text-sm font-bold text-neutral-400">No recent announcements.</p>
                </div>
              )}
            </motion.div>

            {/* ── 7. RECENT NOTES ── */}
            <motion.div variants={fadeUp}>
              <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-4 px-1">Recent Notes</h2>
              {recentNotes.length > 0 ? (
                <div className="bg-white rounded-[2rem] p-4 border border-neutral-100 shadow-sm flex flex-col gap-2 h-full">
                  {recentNotes.map(n => (
                    <div key={n.id} onClick={() => window.open(n.file_url, '_blank')} className="flex items-start gap-4 p-4 rounded-[1.5rem] hover:bg-neutral-50 cursor-pointer transition-colors group">
                      <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-100 transition-colors">
                        <StickyNote size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm text-neutral-900 truncate">{n.title}</h4>
                        <p className="text-xs font-semibold text-neutral-500 mt-0.5 line-clamp-1">{n.body || 'Attached material'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-[2rem] p-8 border border-neutral-100 text-center h-full flex flex-col items-center justify-center">
                  <p className="text-sm font-bold text-neutral-400">No notes available right now.</p>
                </div>
              )}
            </motion.div>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
