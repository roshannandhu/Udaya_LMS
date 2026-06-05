import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Calendar, FileText, CheckCircle, MessageSquare, Trophy, Star, ArrowRight, Zap, Target, BookOpen } from 'lucide-react';
import { Avatar, Skeleton } from '../../components/ui';
import { apiClient, leaderboardApi, testApi, assignmentApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { useAppCache } from '../../store';
import NotificationBell from '../../components/shared/NotificationBell';
import { fadeUp, staggerChildren, springCard } from '../../lib/motion';

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
        setVideos(Array.isArray(vids) ? vids : []);
        setLiveClasses(Array.isArray(livesData) ? livesData : []);
        setAssignments(Array.isArray(assignsData) ? assignsData : []);
        setBroadcasts((Array.isArray(broads) ? broads : []).filter(b => !b.deleted).reverse());
        setLeaderboard(lb?.leaderboard || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.standard_id]);

  const now = new Date();
  
  // Intelligence Filtering
  const continueWatching = videos.filter(v => v.progress_secs > 0 && !v.completed).slice(0, 1)[0] || videos[0]; // Fallback to newest video if none active
  const newVideos = videos.filter(v => (!v.progress_secs || v.progress_secs === 0) && v.id !== continueWatching?.id).slice(0, 3);
  const upcomingLives = liveClasses.filter(l => !l.ended_at && new Date(l.scheduled_for) > new Date(now.getTime() - 2 * 60 * 60 * 1000));
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

  // Format MM:SS
  const formatTime = (secs) => {
    if (!secs) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getSubjectName = (classId) => {
    const s = subjects.find(x => x.id === classId);
    return s ? s.name : '';
  };

  if (loading) {
    return (
      <div className="px-5 md:px-8 py-8 max-w-[1400px] mx-auto space-y-8">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Skeleton className="h-[400px] lg:col-span-8 rounded-[2.5rem]" />
          <Skeleton className="h-[400px] lg:col-span-4 rounded-[2.5rem]" />
        </div>
      </div>
    );
  }

  // Combine urgent actions into one array for the Action Center
  const actionItems = [
    ...upcomingLives.map(l => ({ id: `live-${l.id}`, type: 'live', title: l.topic, icon: Calendar, color: 'text-sky-500', bg: 'bg-sky-100', link: '/student/live', urgency: new Date(l.scheduled_for) <= now ? 'LIVE NOW' : new Date(l.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })),
    ...activeAssignments.map(a => ({ id: `ass-${a.id}`, type: 'assignment', title: a.title, icon: FileText, color: 'text-amber-500', bg: 'bg-amber-100', link: `/student/subjects/${a.class_id}`, urgency: 'Due soon' })),
    ...availableTests.map(t => ({ id: `test-${t.id}`, type: 'test', title: t.title, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-100', link: `/student/tests/${t.id}/take`, urgency: `${t.duration_mins} mins` }))
  ].slice(0, 4);

  return (
    <div className="pb-24 bg-[#F8F9FA] min-h-screen font-sans selection:bg-pink-100 selection:text-pink-900">
      
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-30 bg-[#F8F9FA] border-b border-black/5">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/student/profile')} className="flex-shrink-0 rounded-full ring-2 ring-white shadow-sm hover:scale-105 transition-transform">
              <Avatar name={user?.name || '?'} src={user?.avatar_url} size="md" />
            </button>
            <div className="flex-1">
              <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest mb-0.5">{greeting}</p>
              <h1 className="text-xl font-extrabold tracking-tight text-neutral-900">{displayName}</h1>
            </div>
          </div>
          <NotificationBell />
        </div>
      </div>

      <div className="px-5 md:px-8 pt-8 max-w-[1400px] mx-auto">
        <motion.div variants={staggerChildren} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-12 gap-6 auto-rows-max">
          
          {/* ── 1. THE VIDEO HUB BENTO ── */}
          <motion.div variants={fadeUp} className="lg:col-span-8 bg-white rounded-[2.5rem] p-6 md:p-8 border border-neutral-100 shadow-sm flex flex-col md:flex-row gap-6 h-auto md:h-[480px]">
            
            {/* Left: Featured Video (Continue Watching) */}
            <div 
              className="flex-1 relative rounded-[1.5rem] md:rounded-[2rem] overflow-hidden group cursor-pointer shadow-sm hover:shadow-xl transition-all duration-500 bg-neutral-900 border border-black/5 min-h-[280px]" 
              onClick={() => continueWatching && navigate(`/student/subjects/${continueWatching.class_id}/video/${continueWatching.id}`)}
            >
              {continueWatching?.thumbnail_url ? (
                <img src={continueWatching.thumbnail_url} className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:scale-105 group-hover:opacity-80 transition-all duration-700" alt="Cover" />
              ) : (
                <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 opacity-90 group-hover:scale-105 transition-all duration-700" />
              )}
              
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              
              <div className="absolute inset-0 p-6 md:p-8 flex flex-col justify-between z-10">
                <div className="flex justify-between items-start">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 backdrop-blur-md rounded-full text-white text-[10px] font-bold uppercase tracking-wider border border-white/20 shadow-lg">
                    <Zap size={12} className="text-yellow-300" fill="currentColor" /> {continueWatching?.progress_secs > 0 ? 'Resume' : 'Start'} Learning
                  </span>
                  
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white text-black flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform duration-300">
                    <Play size={20} fill="currentColor" className="ml-1" />
                  </div>
                </div>

                <div>
                  <p className="text-white/80 font-bold uppercase tracking-widest text-[10px] mb-2 flex items-center gap-1.5">
                    <BookOpen size={12} /> {continueWatching ? getSubjectName(continueWatching.class_id) : 'Next Lesson'}
                  </p>
                  <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-tight mb-4 line-clamp-2" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                    {continueWatching?.title || 'Start your learning journey'}
                  </h2>
                  
                  {continueWatching && continueWatching.progress_secs > 0 && (
                    <div className="flex items-center gap-4">
                      <div className="flex-1 max-w-sm h-1.5 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm border border-white/10">
                        <div className="h-full bg-white rounded-full relative" style={{ width: `${Math.min(100, (continueWatching.progress_secs / continueWatching.duration_secs) * 100)}%` }}>
                        </div>
                      </div>
                      <span className="text-white font-bold text-xs tracking-wider">
                        {formatTime(continueWatching.progress_secs)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Playlist (New / Up Next) */}
            <div className="w-full md:w-64 lg:w-72 flex flex-col gap-4">
              <h3 className="font-bold text-neutral-900 text-sm flex items-center gap-2 px-1">
                <Play size={16} className="text-indigo-500" /> Up Next
              </h3>
              
              <div className="flex-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-2">
                {newVideos.length > 0 ? newVideos.map((vid, i) => (
                  <div 
                    key={vid.id} 
                    onClick={() => navigate(`/student/subjects/${vid.class_id}/video/${vid.id}`)}
                    className="group flex gap-3 p-2.5 rounded-2xl hover:bg-neutral-50 cursor-pointer transition-colors border border-transparent hover:border-neutral-100"
                  >
                    {/* Tiny Thumbnail */}
                    <div className="w-24 h-16 rounded-xl overflow-hidden bg-neutral-200 relative flex-shrink-0">
                      {vid.thumbnail_url ? (
                        <img src={vid.thumbnail_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full bg-indigo-100 flex items-center justify-center">
                          <Play size={16} className="text-indigo-400" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-indigo-500 mb-0.5">
                        {i === 0 ? 'NEW TODAY' : 'UP NEXT'}
                      </span>
                      <h4 className="text-xs font-bold text-neutral-800 line-clamp-2 leading-tight group-hover:text-indigo-600 transition-colors">
                        {vid.title}
                      </h4>
                    </div>
                  </div>
                )) : (
                  <div className="flex-1 flex items-center justify-center opacity-50 bg-neutral-50 rounded-2xl border border-dashed border-neutral-200">
                    <p className="text-xs font-bold text-neutral-500 px-4 text-center">No upcoming videos to watch</p>
                  </div>
                )}
              </div>
            </div>

          </motion.div>

          {/* ── 2. THE ACTION CENTER BENTO ── */}
          <motion.div variants={fadeUp} className="lg:col-span-4 bg-white rounded-[2.5rem] p-8 border border-neutral-100 shadow-sm flex flex-col h-[380px] md:h-[480px]">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                <Target size={20} className="text-pink-500" /> Action Center
              </h2>
              <span className="px-3 py-1 bg-neutral-100 rounded-full text-xs font-bold text-neutral-600">
                {actionItems.length} items
              </span>
            </div>

            {actionItems.length > 0 ? (
              <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                {actionItems.map(item => (
                  <div 
                    key={item.id} 
                    onClick={() => navigate(item.link)}
                    className="group flex items-center gap-4 p-4 rounded-3xl hover:bg-neutral-50 cursor-pointer transition-colors border border-transparent hover:border-neutral-100"
                  >
                    <div className={`w-12 h-12 rounded-2xl ${item.bg} ${item.color} flex items-center justify-center flex-shrink-0 shadow-inner`}>
                      <item.icon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm text-neutral-900 truncate">{item.title}</h3>
                      <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mt-1">{item.type}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-[10px] font-extrabold uppercase px-2 py-1 rounded-full ${item.urgency.includes('LIVE') ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-neutral-100 text-neutral-600'}`}>
                        {item.urgency}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-60">
                <CheckCircle size={48} className="text-neutral-300 mb-4" />
                <p className="font-bold text-neutral-500">You're all caught up!</p>
                <p className="text-xs text-neutral-400 mt-1">No urgent tasks pending.</p>
              </div>
            )}
          </motion.div>

          {/* ── 3. TEACHER UPDATES BENTO ── */}
          <motion.div variants={fadeUp} onClick={() => navigate('/student/broadcasts')} className="lg:col-span-6 bg-[#E8F0FE] rounded-[2.5rem] p-8 border border-blue-100 shadow-sm cursor-pointer hover:-translate-y-1 hover:shadow-md transition-all group relative overflow-hidden">
            <div className="absolute -right-12 -top-12 w-48 h-48 bg-blue-200/50 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
            <div className="relative z-10">
              <h2 className="text-[11px] font-extrabold uppercase tracking-widest text-blue-600 mb-4 flex items-center gap-2">
                <MessageSquare size={14} /> Teacher Broadcast
              </h2>
              {latestBroadcast ? (
                <>
                  <p className="text-xl font-semibold text-blue-950 leading-relaxed line-clamp-3" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                    "{latestBroadcast.message || latestBroadcast.text}"
                  </p>
                  <div className="mt-6 flex items-center gap-2 text-blue-700 font-bold text-sm group-hover:translate-x-2 transition-transform">
                    Read full message <ArrowRight size={16} />
                  </div>
                </>
              ) : (
                <p className="text-blue-800/50 font-medium">No recent broadcasts from your teacher.</p>
              )}
            </div>
          </motion.div>

          {/* ── 4. GAMIFICATION BENTO ── */}
          <motion.div variants={fadeUp} onClick={() => navigate('/student/leaderboard')} className="lg:col-span-6 bg-[#FFF4E5] rounded-[2.5rem] p-8 border border-orange-100 shadow-sm cursor-pointer hover:-translate-y-1 hover:shadow-md transition-all group relative overflow-hidden">
            <div className="absolute -right-12 -top-12 w-48 h-48 bg-orange-200/50 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
            <div className="relative z-10 flex items-center justify-between h-full">
              <div>
                <h2 className="text-[11px] font-extrabold uppercase tracking-widest text-orange-600 mb-4 flex items-center gap-2">
                  <Trophy size={14} /> My Performance
                </h2>
                <div className="flex items-end gap-3">
                  <h3 className="text-5xl font-extrabold text-orange-950 tracking-tight leading-none">
                    #{myRank?.rank || '-'}
                  </h3>
                  <span className="text-lg font-bold text-orange-800 mb-1">Rank</span>
                </div>
                <div className="mt-4 flex items-center gap-2 text-orange-700 font-bold text-sm">
                  <Star size={16} fill="currentColor" /> {myRank?.points || 0} XP
                </div>
              </div>
              
              <div className="w-24 h-24 rounded-full bg-white shadow-xl shadow-orange-500/20 flex items-center justify-center group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">
                <span className="text-5xl">🥇</span>
              </div>
            </div>
          </motion.div>

          {/* ── 5. LEARNING PATHS BENTO (Subjects) ── */}
          <motion.div variants={fadeUp} className="lg:col-span-12 bg-white rounded-[2.5rem] p-8 md:p-10 border border-neutral-100 shadow-sm mt-2">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-neutral-900 flex items-center gap-3" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                <BookOpen size={24} className="text-indigo-500" /> My Subjects
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {subjects.length > 0 ? subjects.map((c, i) => {
                const colors = [
                  'bg-[#FCEEF5] text-[#AD1A72] border-pink-100',
                  'bg-[#EAE4F2] text-[#6940A5] border-purple-100',
                  'bg-[#DFF5EC] text-[#0F7B6C] border-teal-100',
                  'bg-[#E3EFFB] text-[#2383E2] border-blue-100'
                ];
                const bgColors = [
                  'bg-[#AD1A72]', 'bg-[#6940A5]', 'bg-[#0F7B6C]', 'bg-[#2383E2]'
                ];
                const colorClass = colors[i % colors.length];
                const bgClass = bgColors[i % bgColors.length];

                return (
                  <motion.div 
                    whileHover={{ y: -4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={springCard}
                    key={c.id} 
                    onClick={() => navigate(`/student/subjects/${c.id}`)}
                    className={`p-6 rounded-[2rem] border cursor-pointer ${colorClass} group`}
                  >
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-14 h-14 rounded-2xl bg-white/60 backdrop-blur-sm flex items-center justify-center text-2xl shadow-sm">
                        {c.emoji || '📘'}
                      </div>
                      <h3 className="text-lg font-bold leading-tight flex-1" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                        {c.name}
                      </h3>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider opacity-80">View Module</span>
                      <div className={`w-8 h-8 rounded-full ${bgClass} text-white flex items-center justify-center shadow-md group-hover:translate-x-1 transition-transform`}>
                        <ArrowRight size={14} strokeWidth={3} />
                      </div>
                    </div>
                  </motion.div>
                );
              }) : (
                <div className="col-span-full p-8 text-center text-neutral-400 bg-neutral-50 rounded-[2rem] border border-dashed border-neutral-200">
                  <p className="font-bold">No subjects available yet.</p>
                </div>
              )}
            </div>
          </motion.div>

        </motion.div>
      </div>
    </div>
  );
}
