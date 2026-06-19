import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, FileQuestion, Trophy, Clock, Lock, CheckCircle, ChevronRight, Loader2, CalendarClock, ClipboardList, Star, Paperclip, ExternalLink, Radio, StickyNote, FileText, Calendar, Pin, BookOpen, Medal } from 'lucide-react';
import { Tag } from '../../components/ui';
import { videoApi, testApi, leaderboardApi, apiClient, assignmentApi, liveClassApi, notesApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { useWhatsNew, isNewSince } from '../../store';
import StudentAssignmentSheet from '../../components/student/StudentAssignmentSheet';
import ZoomMeetingView, { preloadZoomSDK } from '../../components/ZoomMeetingView';
import LiveClassCard from '../../components/cards/LiveClassCard';
import { fadeUp, staggerChildren } from '../../lib/motion';
import SubjectIcon from '../../components/shared/SubjectIcon';

function fmtDateTimeLC(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = d.getHours(), m = d.getMinutes();
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} at ${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}

const TABS = ['Videos', 'Tests', 'Assignments', 'Live', 'Notes', 'Leaderboard'];

const CARD_COLORS = [
  { bg: 'bg-[#F8E1FB]', text: 'text-purple-950', badge: 'bg-white/50 text-purple-900' },
  { bg: 'bg-[#EAF3EB]', text: 'text-green-950', badge: 'bg-white/50 text-green-900' },
  { bg: 'bg-[#FFF6D8]', text: 'text-amber-950', badge: 'bg-white/50 text-amber-900' },
  { bg: 'bg-[#E5F2FE]', text: 'text-blue-950', badge: 'bg-white/50 text-blue-900' },
  { bg: 'bg-[#FFEBE5]', text: 'text-orange-950', badge: 'bg-white/50 text-orange-900' }
];

function fmtTestDate(d) {
  if (!d) return 'Active';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Test card + section live at MODULE scope (stable identity) so a parent re-render
// — e.g. the focus/visibility re-fetch that updates re-attempt status — re-renders
// these in place instead of REMOUNTING them. Defining them inside the page (as
// before) gave them a new function identity every render, so the whole Tests grid
// remounted and replayed the `fadeUp` entrance — the "cards flicker on tab return"
// the user saw. All data is passed in via props instead of being closed over.
function SubjectTestCard({ t, section, idx = 0, subject, myAttempts, prevSeen, navigate }) {
  const cls = subject;
  const attempt = myAttempts[t.id];
  const scorePct = attempt && t.total_marks
    ? Math.round((attempt.score / t.total_marks) * 100)
    : null;
  const theme = CARD_COLORS[idx % CARD_COLORS.length];

  return (
    <motion.div variants={fadeUp} className={`rounded-2xl ${theme.bg} p-5 flex flex-col hover:shadow-md transition-all hover:-translate-y-1`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h4 className={`font-bold text-[17px] leading-tight ${theme.text}`}>{t.title}</h4>
            {section === 'available' && isNewSince(t.created_at, prevSeen.tests) && (
              <span className="bg-indigo-500 text-white text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0">New</span>
            )}
            {t.negative_marking && <span className="bg-red-100 text-red-700 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0">−{t.penalty}</span>}
          </div>
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-black/50 flex-wrap">
             <span className="bg-white/50 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><SubjectIcon value={cls?.emoji} size={12} />{cls?.name || 'Subject'}</span>
             <span className="bg-white/50 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={12}/>{t.duration_mins}m</span>
             <span className="bg-white/50 px-2 py-0.5 rounded-full">{t.total_marks} marks</span>
          </div>
        </div>
        {section === 'available' && <span className="bg-amber-100 text-amber-800 text-[12px] font-bold px-2.5 py-1 rounded-full shadow-sm shrink-0">Open</span>}
        {section === 'completed' && scorePct !== null && (
          <span className={`text-[12px] font-bold px-2.5 py-1 rounded-full shadow-sm shrink-0 ${scorePct >= 75 ? 'bg-green-100 text-green-800' : scorePct >= 50 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>{scorePct}%</span>
        )}
        {section === 'missed' && <span className="bg-red-100 text-red-800 text-[12px] font-bold px-2.5 py-1 rounded-full shadow-sm shrink-0">Missed</span>}
      </div>

      {section === 'available' && (
        <div className="mt-auto pt-3 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-black/40 flex items-center gap-1">
            {t.expires_at ? `Closes ${fmtTestDate(t.expires_at)}` : (t.scheduled_for ? fmtTestDate(t.scheduled_for) : 'Active now')}
          </span>
          <button
            onClick={() => navigate(`/student/tests/${t.id}/take`)}
            className="px-5 py-2 bg-black text-white text-[13px] rounded-full font-bold hover:bg-neutral-800 transition-colors shadow-md">
            Start
          </button>
        </div>
      )}

      {section === 'completed' && attempt && (
        <div className="mt-auto pt-3">
          <div className="flex gap-2 text-[12px] mb-3 flex-wrap bg-white/40 p-2.5 rounded-2xl">
            <div className="flex-1 text-center border-r border-black/5 last:border-0"><div className="text-black/50 text-[10px] uppercase font-bold mb-0.5">Score</div><div className="font-bold text-black">{attempt.score}/{t.total_marks}</div></div>
            <div className="flex-1 text-center border-r border-black/5 last:border-0"><div className="text-black/50 text-[10px] uppercase font-bold mb-0.5">Correct</div><div className="font-bold text-green-700">{attempt.correct_count}</div></div>
            <div className="flex-1 text-center border-r border-black/5 last:border-0"><div className="text-black/50 text-[10px] uppercase font-bold mb-0.5">Wrong</div><div className="font-bold text-red-600">{attempt.wrong_count}</div></div>
            <div className="flex-1 text-center"><div className="text-black/50 text-[10px] uppercase font-bold mb-0.5">Pts</div><div className="font-bold text-amber-600 flex items-center justify-center gap-0.5"><Star size={10} fill="currentColor"/>{attempt.points_earned}</div></div>
          </div>
          <button
            onClick={() => navigate('/student/tests/review', {
              state: {
                source: 'tests-list',
                test_id: t.id,
                result: {
                  test_id: t.id,
                  testTitle: t.title,
                  score: attempt.score,
                  total_marks: t.total_marks,
                  percentage: t.total_marks ? Math.round((attempt.score / t.total_marks) * 100) : 0,
                  correct_count: attempt.correct_count,
                  wrong_count: attempt.wrong_count,
                  marks_deducted: attempt.marks_deducted,
                  points_earned: attempt.points_earned,
                  flagged: attempt.flagged,
                }
              }
            })}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-full text-[13px] font-bold text-black bg-white shadow-sm hover:bg-neutral-50 transition-colors"
          >
            <BookOpen size={14} /> Review
          </button>
        </div>
      )}
    </motion.div>
  );
}

function SubjectTestSection({ title, list, section, emptyMsg, cardProps }) {
  return (
    <div className="mb-8 w-full">
      <h3 className="text-[16px] font-bold text-neutral-800 mb-4">{title} <span className="text-neutral-400 font-semibold ml-1">({list.length})</span></h3>
      {list.length === 0 ? (
        <div className="text-sm text-neutral-500 font-medium text-center py-10 bg-white rounded-2xl shadow-sm w-full">{emptyMsg}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {list.map((t, idx) => <SubjectTestCard key={t.id} t={t} section={section} idx={idx} {...cardProps} />)}
        </div>
      )}
    </div>
  );
}

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
  const [assignReattempt, setAssignReattempt]   = useState({}); // {assignment_id: status}
  const [leaderboardRows, setLeaderboardRows] = useState([]);
  const [leaderboardLoaded, setLeaderboardLoaded] = useState(false);
  const [myAttempts, setMyAttempts] = useState({});
  const [loading, setLoading] = useState(true);
  const [liveClasses, setLiveClasses] = useState([]);
  const [notes, setNotes] = useState([]);
  const [activeJoin, setActiveJoin] = useState(null);
  const [joiningLiveId, setJoiningLiveId] = useState(null);

  // NEW pills compare against the session's seen baseline; opening this page
  // clears the videos nav badge (tests/live clear from their own pages/tabs).
  const prevSeen = useWhatsNew(s => s.prevSeen);
  useEffect(() => { useWhatsNew.getState().markSeen('videos'); }, []);
  useEffect(() => {
    if (tab === 'Tests') useWhatsNew.getState().markSeen('tests');
    if (tab === 'Live') useWhatsNew.getState().markSeen('live');
  }, [tab]);

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
        liveClassApi.getByClass(classId).catch(() => null).then(d => {
          // null = refresh failed — keep the last good list on screen
          if (d === null) return;
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

  // Refresh assignments + re-attempt statuses every time the Assignments tab is
  // opened so grades and teacher approvals are visible without a page reload.
  const loadAssignReattempt = () =>
    assignmentApi.getMyReattemptRequests().then(setAssignReattempt).catch(() => {});

  useEffect(() => {
    if (tab !== 'Assignments') return;
    assignmentApi.getByClass(classId)
      .then(data => setAssignments(data?.assignments || []))
      .catch(() => {});
    loadAssignReattempt();
  }, [tab, classId]);

  // Re-fetch re-attempt status when the student returns to the tab, so a
  // teacher's approve/reject shows up without a manual reload.
  useEffect(() => {
    const onFocus = () => { if (!document.hidden) loadAssignReattempt(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

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
        viewerRole="student"
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
      
      {/* â”€â”€ Compact header (slim on phone AND laptop) â”€â”€ */}
      <div className="relative overflow-hidden bg-white border-b border-neutral-100 shadow-sm">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#e0f7fa] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 translate-x-1/3 -translate-y-1/2 pointer-events-none"></div>

        <div className="max-w-6xl mx-auto px-5 md:px-8 pt-4 pb-3 relative z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/student/subjects')} className="p-2 -ml-2 rounded-full text-neutral-500 hover:text-neutral-900 hover:bg-black/5 transition-colors shrink-0">
              <ArrowLeft size={18} />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-white/70 backdrop-blur border border-neutral-100 shadow-sm flex items-center justify-center text-neutral-700 shrink-0">
              <SubjectIcon value={subject?.emoji} size={26} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight leading-tight truncate" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                {subject?.name || 'Subject'}
              </h1>
              <div className="flex items-center gap-2 mt-1 max-w-xs">
                <div className="flex-1 h-1.5 rounded-full bg-black/5 overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${progressPct}%` }}></div>
                </div>
                <span className="text-[11px] font-bold text-indigo-600 tabular-nums shrink-0">{progressPct}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* â”€â”€ Tabs: wrap into rows instead of horizontal scrolling â”€â”€ */}
        <div className="max-w-6xl mx-auto px-5 md:px-8 pb-4 relative z-10 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-300 ${tab === t ? 'bg-neutral-900 text-white shadow-md' : 'bg-white text-neutral-500 border border-neutral-200 hover:bg-neutral-50 hover:text-neutral-900'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* â”€â”€ BENTO BOX CONTENT AREA â”€â”€ */}
      <div className="px-5 md:px-8 py-6 max-w-6xl mx-auto overflow-x-clip">
        {/* keyed on the tab so switching glides the new content in */}
        <motion.div
          key={tab}
          variants={staggerChildren}
          initial="hidden"
          animate="show"
        >

          {tab === 'Videos' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.length === 0 && <p className="col-span-full text-sm font-bold text-neutral-500 text-center py-12 bg-white rounded-2xl border border-neutral-100 shadow-sm">No videos yet.</p>}
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
                    className="group text-left rounded-2xl overflow-hidden bg-white border border-neutral-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
                  >
                    <div className="relative overflow-hidden bg-neutral-900 w-full" style={{ aspectRatio: '16/9' }}>
                      {/* Gradient base is always rendered, so it shows through whenever the
                          thumbnail is missing or fails to load (no broken-image icon). */}
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 opacity-90 group-hover:scale-105 transition-transform duration-500" />
                      {thumbUrl && (
                        <img
                          src={thumbUrl}
                          alt={v.title}
                          loading="lazy"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 group-hover:opacity-80 transition-all duration-500"
                        />
                      )}
                      
                      {/* Play overlay */}
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors duration-300 flex items-center justify-center pointer-events-none">
                        <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300 shadow-xl">
                          <Play size={24} className="text-white ml-1" fill="white" />
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="absolute top-4 left-4 flex gap-2 pointer-events-none">
                        {!v.my_completed && isNewSince(v.created_at, prevSeen.videos) && (
                          <span className="bg-indigo-500 text-white text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full shadow-md">
                            New
                          </span>
                        )}
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
              if (t.status === 'completed') return false;
              if (t.expires_at && new Date(t.expires_at) <= now) return false;
              if (t.status === 'scheduled') return !t.scheduled_for || new Date(t.scheduled_for) <= now;
              return true;
            };

            const available = tests.filter(t => isOpen(t) && !attempted.has(String(t.id)));
            const upcoming  = tests.filter(t => t.status === 'scheduled' && t.scheduled_for && new Date(t.scheduled_for) > now && !attempted.has(String(t.id)));
            const completed = tests.filter(t => attempted.has(String(t.id)));
            const missed    = tests.filter(t => (t.status === 'completed' || (t.expires_at && new Date(t.expires_at) <= now)) && !attempted.has(String(t.id)));

            const cardProps = { subject, myAttempts, prevSeen, navigate };

            return (
              <div className="flex flex-col w-full">
                {tests.length === 0 ? (
                  <div className="text-sm font-bold text-neutral-500 text-center py-12 bg-white rounded-2xl border border-neutral-100 shadow-sm w-full">No tests yet.</div>
                ) : (
                  <>
                    <SubjectTestSection title="Available now" list={available} section="available" emptyMsg="No tests available right now." cardProps={cardProps} />
                    
                    {upcoming.length > 0 && (
                      <div className="mb-8 w-full">
                        <h3 className="text-[16px] font-bold text-neutral-800 mb-4">Upcoming <span className="text-neutral-400 font-semibold ml-1">({upcoming.length})</span></h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                          {upcoming.map((t, idx) => {
                            const cls = subject;
                            const theme = CARD_COLORS[idx % CARD_COLORS.length];
                            return (
                              <motion.div variants={fadeUp} key={t.id} className={`rounded-2xl ${theme.bg} p-5 opacity-70`}>
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <div className="min-w-0 flex-1">
                                    <h4 className={`font-bold text-[17px] mb-1.5 ${theme.text}`}>
                                      {t.title}
                                      {isNewSince(t.created_at, prevSeen.tests) && (
                                        <span className="ml-2 align-middle bg-indigo-500 text-white text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full">New</span>
                                      )}
                                    </h4>
                                    <p className="text-[12px] font-medium text-black/50 bg-white/50 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><SubjectIcon value={cls?.emoji} size={12} />{cls?.name || 'Subject'} Â· {t.duration_mins} min Â· {t.total_marks} marks</p>
                                  </div>
                                  <span className="bg-black/10 text-black/60 text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0">Upcoming</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[12px] font-bold text-amber-700 pt-3 border-t border-black/5 mt-3">
                                  <CalendarClock size={14} /> Opens {fmtTestDate(t.scheduled_for)}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    <SubjectTestSection title="Completed" list={completed} section="completed" emptyMsg="No tests completed yet." cardProps={cardProps} />
                    <SubjectTestSection title="Missed" list={missed} section="missed" emptyMsg="You haven't missed any tests." cardProps={cardProps} />
                  </>
                )}
              </div>
            );
          })()}

          {tab === 'Assignments' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {assignments.length === 0 && (
                <div className="col-span-full text-center py-16 bg-white rounded-2xl border border-neutral-100 shadow-sm">
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
                  <motion.button variants={fadeUp} key={a.id} onClick={() => setSelectedAssignment(a)} className="text-left bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group flex flex-col">
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
                reattemptStatus={selectedAssignment ? assignReattempt[selectedAssignment.id] : undefined}
                onReattemptRequested={(id) => setAssignReattempt(prev => ({ ...prev, [id]: 'pending' }))}
              />
            </div>
          )}

          {tab === 'Live' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {liveClasses.length === 0 && (
                <div className="col-span-full text-center py-16 bg-white rounded-2xl border border-neutral-100 shadow-sm">
                  <Radio size={32} className="mx-auto mb-4 text-neutral-300" />
                  <p className="text-sm font-bold text-neutral-500">No live classes scheduled yet.</p>
                </div>
              )}
              {liveClasses.map((lc, idx) => {
                const status = lc.status || 'scheduled';
                const isLive = status === 'live';
                const isEnded = status === 'ended';
                return (
                  <motion.div variants={fadeUp} key={lc.id} className="h-full relative">
                    {!isEnded && isNewSince(lc.created_at, prevSeen.live) && (
                      <span className="absolute -top-2 -right-2 z-20 bg-indigo-500 text-white text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full shadow-md pointer-events-none">
                        New
                      </span>
                    )}
                    <LiveClassCard
                      lc={lc}
                      themeIndex={idx}
                      onClick={handleJoinLive}
                      joiningId={joiningLiveId}
                      compact={true}
                      actions={
                        <>
                          {isLive && (
                            <button onClick={(e) => { e.stopPropagation(); handleJoinLive(lc); }} disabled={joiningLiveId === lc.id} className="bg-red-600 text-white px-5 py-2.5 text-sm font-bold uppercase tracking-wider rounded-full hover:bg-red-700 disabled:opacity-60 transition-colors shadow-lg hover:shadow-red-500/30 flex items-center gap-2">
                              {joiningLiveId === lc.id ? <><Loader2 size={16} className="animate-spin"/> Joining…</> : 'Join Live Class'}
                            </button>
                          )}
                          {isEnded && lc.my_attended !== null && lc.my_attended !== undefined && (
                            <span className={`text-[11px] font-extrabold uppercase tracking-widest px-4 py-2 rounded-full shadow-sm ${lc.my_attended ? 'text-emerald-700 bg-emerald-100' : 'text-red-700 bg-red-100'}`}>
                              {lc.my_attended ? 'Attended' : 'Missed'}
                            </span>
                          )}
                        </>
                      }
                    />
                  </motion.div>
                );
              })}
            </div>
          )}

          {tab === 'Notes' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {notes.length === 0 ? (
                <div className="col-span-full text-center py-16 bg-white rounded-2xl border border-neutral-100 shadow-sm">
                  <StickyNote size={32} className="mx-auto mb-4 text-neutral-300" />
                  <p className="text-sm font-bold text-neutral-500">No notes yet. Check back later.</p>
                </div>
              ) : (
                [...notes].sort((a,b) => (b.is_pinned?1:0)-(a.is_pinned?1:0)).map(note => (
                  <motion.div variants={fadeUp} key={note.id} className={`rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group ${note.is_pinned ? 'bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200' : 'bg-white border border-neutral-100'}`}>
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
            <motion.div variants={fadeUp} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-neutral-100">
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
                          {i === 0 ? <Trophy size={22} className="text-amber-400" fill="currentColor" /> : i === 1 ? <Medal size={22} className="text-neutral-400" /> : i === 2 ? <Medal size={22} className="text-amber-700" /> : <span className="text-base font-black text-neutral-400">{i + 1}</span>}
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
