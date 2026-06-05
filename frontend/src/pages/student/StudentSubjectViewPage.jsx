import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, FileQuestion, Trophy, Clock, Lock, CheckCircle, ChevronRight, Loader2, CalendarClock, ClipboardList, Star, Paperclip, ExternalLink, Radio, StickyNote, FileText, Calendar, Pin } from 'lucide-react';
import { Tag } from '../../components/ui';
import { videoApi, testApi, leaderboardApi, apiClient, assignmentApi, liveClassApi, notesApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import StudentAssignmentSheet from '../../components/student/StudentAssignmentSheet';
import ZoomMeetingView, { preloadZoomSDK } from '../../components/ZoomMeetingView';
import LiveClassThumbnail from '../../components/LiveClassThumbnail';
import { fadeUp, staggerChildren } from '../../lib/motion';

function fmtDateTimeLC(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = d.getHours(), m = d.getMinutes();
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} at ${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}

const TABS = ['Videos', 'Tests', 'Assignments', 'Live', 'Notes', 'Leaderboard'];

export default function StudentSubjectViewPage() {
  const { classId } = useParams();
  const navigate    = useNavigate();
  const { user }    = useAuthStore();
  const [tab, setTab]           = useState('Videos');
  const [subject, setSubject]   = useState(null);

  const [videos, setVideos] = useState([]);
  const [tests, setTests] = useState([]);
  const [assignments, setAssignments]           = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [leaderboardRows, setLeaderboardRows] = useState([]);
  const [leaderboardLoaded, setLeaderboardLoaded] = useState(false);
  const [myAttempts, setMyAttempts] = useState({});
  const [loading, setLoading] = useState(true);
  const [liveClasses, setLiveClasses] = useState([]);
  const [notes, setNotes] = useState([]);
  const [activeJoin, setActiveJoin] = useState(null);
  const [joiningLiveId, setJoiningLiveId] = useState(null);

  useEffect(() => {
    setLeaderboardLoaded(false);
    setLeaderboardRows([]);
    const fetchData = async () => {
      setLoading(true);
      try {
        const [vids, tsts, hist, subs, assigns, liveData, notesData] = await Promise.all([
          videoApi.getVideos(classId),
          testApi.getTests(classId),
          testApi.getStudentTestHistory(),
          apiClient('/subjects'),
          assignmentApi.getByClass(classId).catch(() => ({ assignments: [] })),
          liveClassApi.getByClass(classId).catch(() => []),
          notesApi.getByClass(classId).catch(() => []),
        ]);
        setVideos(vids || []);
        setTests(tsts || []);
        setAssignments(assigns?.assignments || []);
        setLiveClasses(Array.isArray(liveData) ? liveData.filter(l => l.status !== 'cancelled') : []);
        setNotes(Array.isArray(notesData) ? notesData : []);
        const sub = (subs || []).find(s => String(s.id) === String(classId));
        setSubject(sub || null);
        const attemptsMap = {};
        (hist || []).forEach(a => { attemptsMap[a.test_id] = a; });
        setMyAttempts(attemptsMap);
      } catch(err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [classId]);

  // Refresh live classes every 30s while Live tab is open
  useEffect(() => {
    if (tab !== 'Live') return;
    const id = setInterval(() => {
      if (!document.hidden) {
        liveClassApi.getByClass(classId).catch(() => []).then(d => {
          setLiveClasses(Array.isArray(d) ? d.filter(l => l.status !== 'cancelled') : []);
        });
      }
    }, 30000);
    return () => clearInterval(id);
  }, [tab, classId]);

  const handleJoinLive = async (lc) => {
    if (joiningLiveId) return;
    setJoiningLiveId(lc.id);
    preloadZoomSDK();
    try {
      const res = await liveClassApi.getJoinToken(lc.id);
      setActiveJoin({ ...res, liveClass: lc });
    } catch (err) { alert(err?.message || 'Failed to join class.'); }
    finally { setJoiningLiveId(null); }
  };

  // Refresh assignments every time the Assignments tab is opened so grades
  // set by the teacher are immediately visible without a page reload.
  useEffect(() => {
    if (tab !== 'Assignments') return;
    assignmentApi.getByClass(classId)
      .then(data => setAssignments(data?.assignments || []))
      .catch(() => {});
  }, [tab, classId]);

  // Lazy-load leaderboard only when that tab is opened
  useEffect(() => {
    if (tab !== 'Leaderboard' || leaderboardLoaded) return;
    const loadLb = async () => {
      if (!subject?.standard_id) return;
      const lb = await leaderboardApi.get(subject.standard_id).catch(() => ({ leaderboard: [] }));
      setLeaderboardRows(lb?.leaderboard || []);
      setLeaderboardLoaded(true);
    };
    loadLb();
  }, [tab, subject?.standard_id, leaderboardLoaded]);

  const attempted = new Set(Object.keys(myAttempts));

  if (activeJoin) {
    return (
      <ZoomMeetingView
        meeting_id={activeJoin.meeting_id}
        signature={activeJoin.signature}
        sdk_key={activeJoin.sdk_key}
        role={activeJoin.role ?? 0}
        display_name={user?.name || 'Student'}
        passcode={activeJoin.passcode}
        zak={activeJoin.zak}
        onLeave={() => {
          setActiveJoin(null);
          liveClassApi.getByClass(classId).catch(()=>[]).then(d => setLiveClasses(Array.isArray(d)?d.filter(l=>l.status!=='cancelled'):[]));
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#F8F9FA]">
        <Loader2 className="animate-spin text-pink-400" size={32} />
      </div>
    );
  }

  // Calculate overall progress for the subject based on completed videos
  const completedVideos = videos.filter(v => v.my_completed).length;
  const totalVideos = videos.length;
  const progressPct = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24 font-sans selection:bg-pink-100 selection:text-pink-900">
      
      {/* ── MASSIVE PASTEL HERO SECTION ── */}
      <div className="relative overflow-hidden bg-white border-b border-neutral-100 shadow-sm">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#e0f7fa] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 translate-x-1/3 -translate-y-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#fce4ec] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 -translate-x-1/3 translate-y-1/3 pointer-events-none"></div>
        
        <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-8 relative z-10 flex flex-col items-center text-center">
          <div className="w-full flex items-center justify-between mb-8">
            <button onClick={() => navigate('/student/subjects')} className="w-10 h-10 rounded-full bg-white shadow-sm border border-neutral-100 flex items-center justify-center text-neutral-600 hover:scale-110 transition-transform">
              <ArrowLeft size={20} />
            </button>
            <div className="w-10 h-10"></div> {/* Spacer for balance */}
          </div>

          <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-white/60 backdrop-blur-md border-4 border-white shadow-xl flex items-center justify-center text-5xl md:text-6xl mb-6 transform hover:rotate-12 transition-transform duration-500">
            {subject?.emoji || '📚'}
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold text-neutral-900 tracking-tight leading-none mb-4" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
            {subject?.name || 'Subject Hub'}
          </h1>
          
          <div className="flex flex-col items-center gap-2 w-full max-w-sm">
            <div className="flex items-center justify-between w-full text-xs font-bold uppercase tracking-widest text-neutral-500">
              <span>Overall Progress</span>
              <span className="text-indigo-600">{progressPct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-black/5 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${progressPct}%` }}></div>
            </div>
          </div>
        </div>

        {/* ── FLOATING PILL NAVIGATION ── */}
        <div className="max-w-[1200px] mx-auto px-5 md:px-8 pb-6 relative z-10 overflow-x-auto custom-scrollbar flex gap-3">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-shrink-0 px-6 py-3 rounded-full text-sm font-bold uppercase tracking-wider transition-all duration-300 ${tab === t ? 'bg-neutral-900 text-white shadow-lg scale-105' : 'bg-white text-neutral-500 border border-neutral-200 hover:bg-neutral-50 hover:text-neutral-900'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── BENTO BOX CONTENT AREA ── */}
      <div className="px-5 md:px-8 py-8 max-w-[1200px] mx-auto">
        <motion.div variants={staggerChildren} initial="hidden" animate="show">

          {tab === 'Videos' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.length === 0 && <p className="col-span-full text-sm font-bold text-neutral-500 text-center py-12 bg-white rounded-[2.5rem] border border-neutral-100 shadow-sm">No videos yet.</p>}
              {videos.map(v => {
                const isYT = v.source_type === 'youtube';
                const thumbUrl = v.thumbnail_url || null;
                const progressPct = v.progress_secs && v.duration_secs
                  ? Math.min(100, Math.round((v.progress_secs / v.duration_secs) * 100))
                  : 0;

                return (
                  <motion.button
                    variants={fadeUp}
                    key={v.id}
                    onClick={() => navigate(`/student/subjects/${classId}/video/${v.id}`)}
                    className="group text-left rounded-[2rem] overflow-hidden bg-white border border-neutral-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
                  >
                    <div className="relative overflow-hidden bg-neutral-900 w-full" style={{ aspectRatio: '16/9' }}>
                      {thumbUrl ? (
                        <img src={thumbUrl} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 group-hover:opacity-80 transition-all duration-500" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center opacity-90 group-hover:scale-105 transition-transform duration-500" />
                      )}
                      
                      {/* Play overlay */}
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors duration-300 flex items-center justify-center pointer-events-none">
                        <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300 shadow-xl">
                          <Play size={24} className="text-white ml-1" fill="white" />
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="absolute top-4 left-4 flex gap-2 pointer-events-none">
                        {v.my_completed && (
                          <span className="flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full shadow-md">
                            <CheckCircle size={10} /> Done
                          </span>
                        )}
                        {isYT && (
                          <span className="bg-red-600 text-white text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full shadow-md">
                            YouTube
                          </span>
                        )}
                      </div>

                      {/* Duration */}
                      {v.duration_secs > 0 && (
                        <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-sm pointer-events-none">
                          {Math.floor(v.duration_secs / 60)}:{String(v.duration_secs % 60).padStart(2, '0')}
                        </div>
                      )}

                      {/* Progress Bar */}
                      {progressPct > 0 && !v.my_completed && (
                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
                          <div className="h-full bg-indigo-500 rounded-r-full shadow-[0_0_10px_rgba(99,102,241,0.8)]" style={{ width: `${progressPct}%` }} />
                        </div>
                      )}
                    </div>

                    <div className="p-6 flex-1 flex flex-col">
                      <h3 className="text-base font-bold text-neutral-900 leading-tight mb-2 line-clamp-2">{v.title}</h3>
                      {v.description && <p className="text-xs font-medium text-neutral-500 line-clamp-2 mt-auto">{v.description}</p>}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}

          {tab === 'Tests' && (() => {
            const now = new Date();
            const isOpen = (t) => {
              if (t.status === 'active') return true;
              if (t.status === 'scheduled') return !t.scheduled_for || new Date(t.scheduled_for) <= now;
              return false;
            };
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {tests.length === 0 && <p className="col-span-full text-sm font-bold text-neutral-500 text-center py-12 bg-white rounded-[2.5rem] border border-neutral-100 shadow-sm">No tests yet.</p>}
                {tests.map((t) => {
                  const done = attempted.has(t.id);
                  const attempt = myAttempts[t.id];
                  const scorePct = attempt && t.total_marks > 0 ? ((attempt.score / t.total_marks) * 100).toFixed(0) : '—';
                  const open = isOpen(t);
                  const isFutureScheduled = t.status === 'scheduled' && t.scheduled_for && new Date(t.scheduled_for) > now;
                  return (
                    <motion.div variants={fadeUp} key={t.id} className="bg-white p-6 rounded-[2rem] border border-neutral-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-2 h-full bg-emerald-400 group-hover:bg-emerald-500 transition-colors"></div>
                      
                      <div className="pl-4">
                        <div className="flex items-start justify-between mb-4">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
                            <FileQuestion size={24} />
                          </div>
                          
                          <div className="flex gap-2">
                            {done && (
                              <span className={`px-3 py-1 rounded-full text-xs font-extrabold shadow-sm ${Number(scorePct) >= 75 ? 'bg-emerald-100 text-emerald-700' : Number(scorePct) >= 50 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                Score: {scorePct}%
                              </span>
                            )}
                            {isFutureScheduled && !done && <span className="px-3 py-1 bg-neutral-100 text-neutral-500 text-xs font-bold rounded-full">Upcoming</span>}
                            {t.status === 'completed' && !done && <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">Missed</span>}
                          </div>
                        </div>

                        <h3 className="text-lg font-bold text-neutral-900 mb-1">{t.title}</h3>
                        <p className="text-sm font-medium text-neutral-500 mb-6">
                          {t.duration_mins} mins {t.negative_marking ? ` · −${t.penalty} penalty` : ''}
                        </p>

                        <div className="flex items-center justify-between">
                          {isFutureScheduled ? (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600">
                              <CalendarClock size={14} /> Opens {new Date(t.scheduled_for).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          ) : <div />}

                          {open && !done && (
                            <button onClick={() => navigate(`/student/tests/${t.id}/take`)} className="px-6 py-2.5 bg-neutral-900 text-white text-sm font-bold uppercase tracking-wider rounded-xl hover:bg-neutral-800 transition-colors hover:scale-105 active:scale-95 shadow-md">
                              Start Test
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            );
          })()}

          {tab === 'Assignments' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {assignments.length === 0 && (
                <div className="col-span-full text-center py-16 bg-white rounded-[2.5rem] border border-neutral-100 shadow-sm">
                  <ClipboardList size={32} className="mx-auto mb-4 text-neutral-300" />
                  <p className="text-sm font-bold text-neutral-500">No assignments yet.</p>
                </div>
              )}
              {assignments.map(a => {
                const sub = a.my_submission;
                const isSubmitted = !!sub;
                const isGraded = sub && sub.marks_obtained != null;
                const due = a.due_date ? new Date(a.due_date) : null;
                const now = new Date();
                const isPast = due && due < now;

                return (
                  <motion.button variants={fadeUp} key={a.id} onClick={() => setSelectedAssignment(a)} className="text-left bg-white p-6 rounded-[2rem] border border-neutral-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-colors">
                        <ClipboardList size={24} />
                      </div>
                      <div className="flex-shrink-0">
                        {isGraded ? (
                          <div className="flex flex-col items-end">
                            <span className="inline-flex items-center px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-extrabold uppercase tracking-widest rounded-full shadow-sm mb-1">
                              {sub.marks_obtained}/100
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                              <Star size={10} fill="currentColor" /> {sub.points_earned} pts
                            </span>
                          </div>
                        ) : isSubmitted ? (
                          <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-700 text-xs font-extrabold uppercase tracking-widest rounded-full shadow-sm">
                            Submitted
                          </span>
                        ) : (
                          <span className="inline-flex px-3 py-1 bg-neutral-100 text-neutral-500 text-xs font-extrabold uppercase tracking-widest rounded-full">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-neutral-900 mb-1">{a.title}</h3>
                    {a.description && <p className="text-xs font-medium text-neutral-500 line-clamp-2 mb-4">{a.description}</p>}
                    
                    <div className="mt-auto">
                      {due && (
                        <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border ${isPast ? 'bg-red-50 text-red-600 border-red-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                          <CalendarClock size={14} /> Due {due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
              <StudentAssignmentSheet
                open={!!selectedAssignment}
                onClose={() => setSelectedAssignment(null)}
                assignment={selectedAssignment}
                onSubmitted={(result) => {
                  const updated = { ...selectedAssignment, my_submission: result };
                  setAssignments(prev => prev.map(a => a.id === result.assignment_id ? updated : a));
                  setSelectedAssignment(null);
                }}
                onDeleted={() => {
                  const updated = { ...selectedAssignment, my_submission: null };
                  setAssignments(prev => prev.map(a => a.id === selectedAssignment?.id ? updated : a));
                  setSelectedAssignment(updated);
                }}
              />
            </div>
          )}

          {tab === 'Live' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {liveClasses.length === 0 && (
                <div className="col-span-full text-center py-16 bg-white rounded-[2.5rem] border border-neutral-100 shadow-sm">
                  <Radio size={32} className="mx-auto mb-4 text-neutral-300" />
                  <p className="text-sm font-bold text-neutral-500">No live classes scheduled yet.</p>
                </div>
              )}
              {liveClasses.map(lc => {
                const status = lc.status || 'scheduled';
                const isLive = status === 'live';
                const isEnded = status === 'ended';
                return (
                  <motion.div variants={fadeUp} key={lc.id} className="rounded-[2rem] border border-neutral-100 bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col group">
                    <LiveClassThumbnail thumbnailUrl={lc.thumbnail_url} textSide={lc.thumbnail_text_side} subjectName={subject?.name} topic={lc.title} status={status} scheduledAt={lc.scheduled_at} />
                    <div className="p-6 flex flex-col gap-4 flex-1">
                      <div className="flex items-start gap-3">
                        <h3 className="flex-1 text-base font-bold text-neutral-900 leading-snug line-clamp-2">{lc.title}</h3>
                        {isLive && (
                          <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-white bg-red-600 px-3 py-1.5 rounded-full shadow-md animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-white"/> LIVE
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-neutral-500">
                        {!isEnded && <span className="flex items-center gap-1.5 bg-neutral-50 px-2 py-1 rounded-md border border-neutral-100"><Calendar size={14}/>{fmtDateTimeLC(lc.scheduled_at)}</span>}
                        {lc.duration_mins > 0 && <span className="flex items-center gap-1.5 bg-neutral-50 px-2 py-1 rounded-md border border-neutral-100"><Clock size={14}/>{lc.duration_mins} min</span>}
                      </div>

                      <div className="mt-auto pt-4 flex items-center gap-2">
                        {isLive && (
                          <button onClick={() => handleJoinLive(lc)} disabled={joiningLiveId === lc.id} className="flex-1 py-3 bg-red-600 text-white text-sm font-bold uppercase tracking-wider rounded-xl hover:bg-red-700 disabled:opacity-60 transition-colors shadow-lg hover:shadow-red-500/30">
                            {joiningLiveId === lc.id ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/> Joining…</span> : 'Join Live Class'}
                          </button>
                        )}
                        {status === 'scheduled' && <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Starts soon</span>}
                        {isEnded && lc.my_attended !== null && lc.my_attended !== undefined && (
                          <span className={`text-[10px] font-extrabold uppercase tracking-widest px-3 py-1.5 rounded-full shadow-sm ${lc.my_attended ? 'text-emerald-700 bg-emerald-100' : 'text-red-700 bg-red-100'}`}>
                            {lc.my_attended ? 'Attended' : 'Missed'}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {tab === 'Notes' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {notes.length === 0 ? (
                <div className="col-span-full text-center py-16 bg-white rounded-[2.5rem] border border-neutral-100 shadow-sm">
                  <StickyNote size={32} className="mx-auto mb-4 text-neutral-300" />
                  <p className="text-sm font-bold text-neutral-500">No notes yet. Check back later.</p>
                </div>
              ) : (
                [...notes].sort((a,b) => (b.is_pinned?1:0)-(a.is_pinned?1:0)).map(note => (
                  <motion.div variants={fadeUp} key={note.id} className={`rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group ${note.is_pinned ? 'bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200' : 'bg-white border border-neutral-100'}`}>
                    {note.is_pinned && <div className="absolute top-0 right-0 w-16 h-16 bg-amber-200 rounded-full blur-2xl opacity-50"></div>}
                    <div className="flex items-start gap-3 mb-2 relative z-10">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${note.is_pinned ? 'bg-amber-100 text-amber-600' : 'bg-neutral-50 text-neutral-500'}`}>
                        {note.is_pinned ? <Pin size={20} /> : <StickyNote size={20} />}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-neutral-900 leading-snug">{note.title}</h3>
                        {note.is_pinned && <span className="text-[9px] font-extrabold uppercase tracking-widest text-amber-600">Pinned</span>}
                      </div>
                    </div>
                    {note.body && <p className="text-sm font-medium text-neutral-600 mt-3 whitespace-pre-wrap relative z-10">{note.body}</p>}
                    {note.file_url && (
                      <a href={note.file_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center justify-center w-full gap-2 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-bold uppercase tracking-widest text-neutral-700 hover:bg-neutral-50 hover:text-indigo-600 transition-colors shadow-sm relative z-10">
                        <FileText size={16} /> View Attachment
                      </a>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          )}

          {tab === 'Leaderboard' && (
            <motion.div variants={fadeUp} className="bg-white rounded-[2.5rem] overflow-hidden shadow-sm border border-neutral-100">
              {leaderboardRows.length === 0 ? (
                <div className="text-center py-16">
                  <Trophy size={32} className="mx-auto mb-4 text-neutral-300" />
                  <p className="text-sm font-bold text-neutral-500">No leaderboard data yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {leaderboardRows.map((row, i) => {
                    const isMe = row.id === user?.id;
                    return (
                      <div key={row.id ?? i} className={`flex items-center gap-4 px-6 py-5 transition-colors ${isMe ? 'bg-[#FFF4E5]' : 'hover:bg-neutral-50'}`}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-sm ${i === 0 ? 'bg-amber-100' : i === 1 ? 'bg-neutral-200' : i === 2 ? 'bg-orange-100' : 'bg-white border border-neutral-100'}`}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-base font-black text-neutral-400">{i + 1}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-bold text-neutral-900 truncate">
                            {row.name ?? 'Student'}
                            {isMe && <span className="ml-2 text-[10px] font-extrabold uppercase tracking-widest text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full border border-orange-200">You</span>}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-black text-neutral-900" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>{row.points || 0}</span>
                          <span className="text-xs font-bold text-neutral-400 ml-1">XP</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

        </motion.div>
      </div>
    </div>
  );
}
