import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileQuestion, Clock, CheckCircle2, Loader2, Trophy,
  CalendarClock, BookOpen, ClipboardList, Star, Paperclip, Play, ArrowRight, Activity
} from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { Tag, Skeleton } from '../../components/ui';
import { testApi, assignmentApi } from '../../lib/api';
import { useAppCache } from '../../store';
import StudentAssignmentSheet from '../../components/student/StudentAssignmentSheet';

const CARD_COLORS = [
  { bg: 'bg-[#F8E1FB]', text: 'text-[#872792]', badge: 'bg-[#872792]/10 text-[#872792]' },
  { bg: 'bg-[#EAF3EB]', text: 'text-[#1D6A2B]', badge: 'bg-[#1D6A2B]/10 text-[#1D6A2B]' },
  { bg: 'bg-[#FFF6D8]', text: 'text-[#966B08]', badge: 'bg-[#966B08]/10 text-[#966B08]' },
  { bg: 'bg-[#E8F0FE]', text: 'text-[#1A56DB]', badge: 'bg-[#1A56DB]/10 text-[#1A56DB]' },
];

let testsPageCache = null;

export default function StudentTestsPage() {
  const navigate = useNavigate();

  // ── Tests state ──────────────────────────────────────────────────
  const [allTests, setAllTests]   = useState(testsPageCache?.allTests || []);
  const [myAttempts, setMyAttempts] = useState(testsPageCache?.myAttempts || {});
  const [loading, setLoading]     = useState(!testsPageCache);
  const subjects = useAppCache(s => s.subjects);

  // ── Assignments state ─────────────────────────────────────────────
  const [activeTab, setActiveTab]         = useState('tests');
  const [assignments, setAssignments]     = useState(testsPageCache?.assignments || []);
  const [assignLoading, setAssignLoading] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);

  // Fetch tests on mount
  useEffect(() => {
    const fetchData = async () => {
      if (!testsPageCache) setLoading(true);
      try {
        const [testsRes, historyRes] = await Promise.all([
          testApi.getTests(),
          testApi.getStudentTestHistory(),
        ]);
        const testsData = Array.isArray(testsRes) ? testsRes : [];
        setAllTests(testsData);
        const attemptsMap = {};
        (Array.isArray(historyRes) ? historyRes : []).forEach(a => {
          attemptsMap[a.test_id] = a;
        });
        setMyAttempts(attemptsMap);
        
        testsPageCache = { ...testsPageCache, allTests: testsData, myAttempts: attemptsMap };
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Fetch assignments lazily when Assignments tab is opened
  useEffect(() => {
    if (activeTab === 'assignments') {
      const fetchAssignments = async () => {
        if (!testsPageCache?.assignments) setAssignLoading(true);
        try {
          const data = await assignmentApi.getAllMyAssignments();
          const list = data?.assignments || [];
          setAssignments(list);
          testsPageCache = { ...testsPageCache, assignments: list };
        } catch (err) {
          console.error(err);
        } finally {
          setAssignLoading(false);
        }
      };
      fetchAssignments();
    }
  }, [activeTab]);

  // ── Test helpers ──────────────────────────────────────────────────
  const attemptedIds = new Set(Object.keys(myAttempts));
  const now = new Date();

  const isOpen = (t) => {
    if (t.status === 'completed') return false;
    if (t.expires_at && new Date(t.expires_at) <= now) return false;
    if (t.status === 'scheduled') return !t.scheduled_for || new Date(t.scheduled_for) <= now;
    return true;
  };

  const available = allTests.filter(t => isOpen(t) && !attemptedIds.has(String(t.id)));
  const upcoming  = allTests.filter(t =>
    t.status === 'scheduled' && t.scheduled_for && new Date(t.scheduled_for) > now && !attemptedIds.has(String(t.id))
  );
  const completed = allTests.filter(t => attemptedIds.has(String(t.id)));
  const missed    = allTests.filter(t =>
    (t.status === 'completed' || (t.expires_at && new Date(t.expires_at) <= now)) && !attemptedIds.has(String(t.id))
  );

  function fmtDate(d) {
    if (!d) return 'Active';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  // ── Assignment helpers ────────────────────────────────────────────
  const pending   = assignments.filter(a => !a.my_submission);
  const submitted = assignments.filter(a => a.my_submission && a.my_submission.marks_obtained == null);
  const graded    = assignments.filter(a => a.my_submission && a.my_submission.marks_obtained != null);

  // ── Test card ─────────────────────────────────────────────────────
  const TestCard = ({ t, section, idx = 0 }) => {
    const cls = subjects.find(c => String(c.id) === String(t.class_id));
    const attempt = myAttempts[t.id];
    const scorePct = attempt && t.total_marks
      ? Math.round((attempt.score / t.total_marks) * 100)
      : null;
    const theme = CARD_COLORS[idx % CARD_COLORS.length];

    return (
      <div className={`relative rounded-[2.5rem] ${theme.bg} p-6 sm:p-8 flex flex-col hover:shadow-xl transition-all duration-500 hover:-translate-y-2 group border border-black/5`}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className={`bg-white/70 ${theme.text} px-3.5 py-1.5 rounded-full text-[12px] font-extrabold flex items-center gap-1.5 shadow-sm`}>
                {cls?.emoji} {cls?.name || 'Subject'}
              </span>
              {t.negative_marking && <span className="bg-red-100/90 text-red-700 text-[11px] font-extrabold px-3 py-1.5 rounded-full shrink-0 shadow-sm uppercase tracking-wider">−{t.penalty} Penalty</span>}
            </div>
            <h4 className="font-extrabold text-[22px] sm:text-[24px] leading-[1.15] text-neutral-900 mb-3">{t.title}</h4>
            <div className="flex items-center gap-3 text-[13px] font-bold text-neutral-600 flex-wrap">
               <span className="flex items-center gap-1.5 bg-white/40 px-3 py-1 rounded-lg"><Clock size={14}/>{t.duration_mins} min</span>
               <span className="flex items-center gap-1.5 bg-white/40 px-3 py-1 rounded-lg"><Trophy size={14}/>{t.total_marks} marks</span>
            </div>
          </div>
          {section === 'available' && <span className="bg-amber-100 text-amber-800 text-[12px] font-extrabold px-3 py-1.5 rounded-full shadow-sm shrink-0 uppercase tracking-widest">Open</span>}
          {section === 'completed' && scorePct !== null && (
            <span className={`text-[13px] font-extrabold px-3 py-1.5 rounded-full shadow-sm shrink-0 ${scorePct >= 75 ? 'bg-green-500 text-white' : scorePct >= 50 ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'}`}>{scorePct}%</span>
          )}
          {section === 'missed' && <span className="bg-red-100 text-red-800 text-[12px] font-extrabold px-3 py-1.5 rounded-full shadow-sm shrink-0 uppercase tracking-widest">Missed</span>}
        </div>

        {section === 'available' && (
          <div className="mt-auto pt-6 border-t border-black/5 flex items-center justify-between">
            <span className="text-[13px] font-bold text-neutral-500 flex flex-col">
              <span className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5">Deadline</span>
              {t.expires_at ? fmtDate(t.expires_at) : (t.scheduled_for ? fmtDate(t.scheduled_for) : 'Active now')}
            </span>
            <button
              onClick={() => navigate(`/student/tests/${t.id}/take`)}
              className="px-8 py-3.5 bg-black text-white text-[15px] rounded-full font-bold hover:scale-105 transition-transform shadow-md flex items-center gap-2 group-hover:bg-neutral-800">
              Start <Play size={16} fill="currentColor" />
            </button>
          </div>
        )}

        {section === 'completed' && attempt && (
          <div className="mt-auto pt-5">
            <div className="grid grid-cols-4 gap-2 text-[12px] mb-5 bg-white/50 p-3 rounded-2xl shadow-inner border border-black/5">
              <div className="flex flex-col items-center justify-center border-r border-black/5"><div className="text-black/50 text-[10px] uppercase font-extrabold mb-1 tracking-wider">Score</div><div className="font-extrabold text-[15px] text-black">{attempt.score}/{t.total_marks}</div></div>
              <div className="flex flex-col items-center justify-center border-r border-black/5"><div className="text-black/50 text-[10px] uppercase font-extrabold mb-1 tracking-wider">Correct</div><div className="font-extrabold text-[15px] text-green-600">{attempt.correct_count}</div></div>
              <div className="flex flex-col items-center justify-center border-r border-black/5"><div className="text-black/50 text-[10px] uppercase font-extrabold mb-1 tracking-wider">Wrong</div><div className="font-extrabold text-[15px] text-red-600">{attempt.wrong_count}</div></div>
              <div className="flex flex-col items-center justify-center"><div className="text-black/50 text-[10px] uppercase font-extrabold mb-1 tracking-wider">Pts</div><div className="font-extrabold text-[15px] text-amber-500 flex items-center gap-0.5"><Star size={12} fill="currentColor"/>{attempt.points_earned}</div></div>
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
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full text-[14px] font-bold text-black bg-white shadow-sm hover:shadow-md hover:bg-neutral-50 transition-all border border-black/5"
            >
              <Activity size={18} /> Detailed Report
            </button>
          </div>
        )}
      </div>
    );
  };

  const Section = ({ title, tests, section, emptyMsg, icon: Icon }) => (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-6 pl-2">
        {Icon && <div className="p-2 bg-black/5 rounded-xl"><Icon size={20} className="text-black/60" /></div>}
        <h3 className="text-xl sm:text-2xl font-extrabold text-neutral-900 tracking-tight">{title} <span className="text-neutral-400 font-semibold ml-2 text-lg">({tests.length})</span></h3>
      </div>
      {tests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-[2.5rem] shadow-sm border border-black/5">
          <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400 mb-4">
            <CheckCircle2 size={32} />
          </div>
          <p className="text-neutral-500 font-bold text-lg">{emptyMsg}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tests.map((t, idx) => <TestCard key={t.id} t={t} section={section} idx={idx} />)}
        </div>
      )}
    </div>
  );

  // ── Assignment card ───────────────────────────────────────────────
  const AssignmentCard = ({ a, idx = 0 }) => {
    const sub = a.my_submission;
    const isGraded = sub && sub.marks_obtained != null;
    const due = a.due_date ? new Date(a.due_date) : null;
    const isPast = due && due < now;
    const theme = CARD_COLORS[idx % CARD_COLORS.length];

    return (
      <button
        onClick={() => setSelectedAssignment(a)}
        className={`w-full text-left p-6 sm:p-8 rounded-[2.5rem] ${theme.bg} hover:shadow-xl hover:-translate-y-2 transition-all duration-500 flex flex-col h-full border border-black/5 group`}
      >
        <div className="flex items-start gap-3 flex-1 mb-4">
          <div className="flex-1 min-w-0">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest bg-white/60 ${theme.text} mb-3 shadow-sm`}>
              {a.subject_emoji} {a.subject_name}
            </span>
            <p className={`text-[22px] sm:text-[24px] font-extrabold leading-[1.15] text-neutral-900 mb-3 line-clamp-2`}>{a.title}</p>
            {a.description && (
              <p className="text-[14px] font-medium text-neutral-600 line-clamp-2 mb-4 leading-relaxed">{a.description}</p>
            )}
            
            <div className="flex flex-wrap items-center gap-2 mt-auto">
                {due && (
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-white/50 ${isPast ? 'text-red-700' : 'text-neutral-700'}`}>
                    <CalendarClock size={14} />
                    Due {due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                )}
                {(a.assignment_attachments || []).length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-white/50 text-neutral-700">
                    <Paperclip size={14} />
                    {a.assignment_attachments.length} file{a.assignment_attachments.length !== 1 ? 's' : ''}
                  </span>
                )}
            </div>
          </div>
        </div>
        
        <div className="mt-auto pt-5 border-t border-black/5 flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5 text-[14px] font-bold text-neutral-500 group-hover:text-black transition-colors">
             View Details <ArrowRight size={16} />
          </div>
          <div className="flex-shrink-0">
            {isGraded ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex px-3.5 py-1.5 bg-green-500 text-white text-[13px] font-extrabold rounded-full shadow-sm">
                  {sub.marks_obtained}/100
                </span>
                <span className="flex items-center gap-1 text-[13px] font-extrabold text-amber-700 bg-amber-100 px-3.5 py-1.5 rounded-full shadow-sm">
                  <Star size={14} fill="currentColor" /> {sub.points_earned}
                </span>
              </div>
            ) : sub ? (
              <span className="inline-flex px-4 py-1.5 bg-blue-500 text-white text-[13px] font-extrabold rounded-full shadow-md uppercase tracking-widest">
                Submitted
              </span>
            ) : (
              <span className="inline-flex px-4 py-1.5 bg-white text-black text-[13px] font-extrabold rounded-full shadow-md uppercase tracking-widest border border-black/5">
                Pending
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const AssignSection = ({ title, list, emptyMsg, icon: Icon }) => (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-6 pl-2">
        {Icon && <div className="p-2 bg-black/5 rounded-xl"><Icon size={20} className="text-black/60" /></div>}
        <h3 className="text-xl sm:text-2xl font-extrabold text-neutral-900 tracking-tight">{title} <span className="text-neutral-400 font-semibold ml-2 text-lg">({list.length})</span></h3>
      </div>
      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-[2.5rem] shadow-sm border border-black/5">
          <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400 mb-4">
            <ClipboardList size={32} />
          </div>
          <p className="text-neutral-500 font-bold text-lg">{emptyMsg}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {list.map((a, idx) => <AssignmentCard key={a.id} a={a} idx={idx} />)}
        </div>
      )}
    </div>
  );

  return (
    <div className="pb-28 min-h-screen bg-[#F4F7F6]">
      <TopBar title="Tests & Assignments" showSearch={false} />
      <div className="px-5 md:px-8 py-8 max-w-6xl mx-auto">

        {/* ── Premium Pill tabs ── */}
        <div className="flex bg-white p-2 rounded-full mb-10 shadow-sm border border-black/5 w-full max-w-sm mx-auto md:mx-0">
          {[
            { id: 'tests',       label: 'Online Tests',       icon: FileQuestion },
            { id: 'assignments', label: 'Assignments',  icon: ClipboardList },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-[15px] font-extrabold transition-all duration-300 ${
                activeTab === tab.id
                  ? 'bg-black shadow-md text-white scale-[1.02]'
                  : 'text-neutral-500 hover:text-black hover:bg-black/5'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tests tab ── */}
        {activeTab === 'tests' && (
          loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : (
            <>
              <Section title="Available Now" tests={available} section="available" emptyMsg="No tests available right now." icon={Play} />
              
              {upcoming.length > 0 && (
                <div className="mb-12">
                  <div className="flex items-center gap-3 mb-6 pl-2">
                    <div className="p-2 bg-black/5 rounded-xl"><CalendarClock size={20} className="text-black/60" /></div>
                    <h3 className="text-xl sm:text-2xl font-extrabold text-neutral-900 tracking-tight">Upcoming <span className="text-neutral-400 font-semibold ml-2 text-lg">({upcoming.length})</span></h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {upcoming.map((t, idx) => {
                      const cls = subjects.find(c => String(c.id) === String(t.class_id));
                      const theme = CARD_COLORS[idx % CARD_COLORS.length];
                      return (
                        <div key={t.id} className={`rounded-[2.5rem] ${theme.bg} p-6 sm:p-8 opacity-70 border border-black/5`}>
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="min-w-0 flex-1">
                              <h4 className={`font-extrabold text-[22px] sm:text-[24px] leading-[1.15] text-neutral-900 mb-3`}>{t.title}</h4>
                              <p className="text-[12px] font-extrabold text-black/50 bg-white/60 px-3 py-1.5 rounded-full inline-flex items-center gap-1 shadow-sm uppercase tracking-wider">{cls?.emoji} {cls?.name || 'Subject'} · {t.duration_mins}m</p>
                            </div>
                            <span className="bg-black/10 text-black/60 text-[11px] font-extrabold px-3 py-1.5 rounded-full shrink-0 uppercase tracking-widest">Upcoming</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[14px] font-extrabold text-amber-700 pt-5 border-t border-black/5 mt-auto">
                            <CalendarClock size={16} /> Opens {fmtDate(t.scheduled_for)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              <Section title="Completed" tests={completed} section="completed" emptyMsg="No tests completed yet." icon={CheckCircle2} />
              <Section title="Missed" tests={missed} section="missed" emptyMsg="You haven't missed any tests." />
            </>
          )
        )}

        {/* ── Assignments tab ── */}
        {activeTab === 'assignments' && (
          assignLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : (
            <>
              <AssignSection title="Pending" list={pending} emptyMsg="No pending assignments." icon={Clock} />
              <AssignSection title="Submitted" list={submitted} emptyMsg="No submissions awaiting grading." icon={CheckCircle2} />
              <AssignSection title="Graded" list={graded} emptyMsg="No graded assignments yet." icon={Star} />
            </>
          )
        )}
      </div>

      {/* ── Assignment detail sheet ── */}
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
  );
}
