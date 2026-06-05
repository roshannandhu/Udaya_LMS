import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileQuestion, Clock, CheckCircle2, Loader2, Trophy,
  CalendarClock, BookOpen, ClipboardList, Star, Paperclip,
} from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { Tag, Skeleton } from '../../components/ui';
import { testApi, assignmentApi } from '../../lib/api';
import { useAppCache } from '../../store';
import StudentAssignmentSheet from '../../components/student/StudentAssignmentSheet';

const CARD_COLORS = [
  { bg: 'bg-[#F8E1FB]', text: 'text-purple-950', badge: 'bg-white/50 text-purple-900' },
  { bg: 'bg-[#EAF3EB]', text: 'text-green-950', badge: 'bg-white/50 text-green-900' },
  { bg: 'bg-[#FFF6D8]', text: 'text-amber-950', badge: 'bg-white/50 text-amber-900' },
  { bg: 'bg-[#E5F2FE]', text: 'text-blue-950', badge: 'bg-white/50 text-blue-900' },
  { bg: 'bg-[#FFEBE5]', text: 'text-orange-950', badge: 'bg-white/50 text-orange-900' }
];

export default function StudentTestsPage() {
  const navigate = useNavigate();

  // ── Tests state ──────────────────────────────────────────────────
  const [allTests, setAllTests]   = useState([]);
  const [myAttempts, setMyAttempts] = useState({});
  const [loading, setLoading]     = useState(true);
  const subjects = useAppCache(s => s.subjects);

  // ── Assignments state ─────────────────────────────────────────────
  const [activeTab, setActiveTab]         = useState('tests');
  const [assignments, setAssignments]     = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);

  // Fetch tests on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [testsRes, historyRes] = await Promise.all([
          testApi.getTests(),
          testApi.getStudentTestHistory(),
        ]);
        setAllTests(Array.isArray(testsRes) ? testsRes : []);
        const attemptsMap = {};
        (Array.isArray(historyRes) ? historyRes : []).forEach(a => {
          attemptsMap[a.test_id] = a;
        });
        setMyAttempts(attemptsMap);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Fetch assignments lazily when Assignments tab is opened (always fresh)
  useEffect(() => {
    if (activeTab !== 'assignments') return;
    setAssignLoading(true);
    assignmentApi.getAllMyAssignments()
      .then(data => setAssignments(data?.assignments || []))
      .catch(() => {})
      .finally(() => setAssignLoading(false));
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
      <div className={`rounded-[32px] ${theme.bg} p-5 flex flex-col hover:shadow-md transition-all hover:-translate-y-1`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <h4 className={`font-bold text-[17px] leading-tight ${theme.text}`}>{t.title}</h4>
              {t.negative_marking && <span className="bg-red-100 text-red-700 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0">−{t.penalty}</span>}
            </div>
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-black/50 flex-wrap">
               <span className="bg-white/50 px-2 py-0.5 rounded-full">{cls?.emoji} {cls?.name || 'Subject'}</span>
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
              {t.expires_at ? `Closes ${fmtDate(t.expires_at)}` : (t.scheduled_for ? fmtDate(t.scheduled_for) : 'Active now')}
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
      </div>
    );
  };

  const Section = ({ title, tests, section, emptyMsg }) => (
    <div className="mb-8">
      <h3 className="text-[16px] font-bold text-neutral-800 mb-4">{title} <span className="text-neutral-400 font-semibold ml-1">({tests.length})</span></h3>
      {tests.length === 0 ? (
        <div className="text-sm text-neutral-500 font-medium text-center py-10 bg-white rounded-[32px] shadow-sm">{emptyMsg}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
        className={`w-full text-left p-5 rounded-[32px] ${theme.bg} hover:shadow-md hover:-translate-y-1 transition-all flex flex-col h-full`}
      >
        <div className="flex items-start gap-3 flex-1">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-black/50 mb-1.5">{a.subject_emoji} {a.subject_name}</p>
            <p className={`text-[18px] font-bold ${theme.text} leading-tight mb-2 line-clamp-2`}>{a.title}</p>
            {a.description && (
              <p className="text-[13px] font-medium text-black/60 line-clamp-2 mb-3">{a.description}</p>
            )}
            
            <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                {due && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/50 ${isPast ? 'text-red-600' : 'text-amber-700'}`}>
                    <CalendarClock size={12} />
                    Due {due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                )}
                {(a.assignment_attachments || []).length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/50 text-black/60">
                    <Paperclip size={12} />
                    {a.assignment_attachments.length} file{a.assignment_attachments.length !== 1 ? 's' : ''}
                  </span>
                )}
            </div>
          </div>
        </div>
        
        <div className="mt-4 pt-3 border-t border-black/5 flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-black/40">
             <ClipboardList size={14} /> Assignment
          </div>
          <div className="flex-shrink-0">
            {isGraded ? (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex px-2.5 py-1 bg-green-100 text-green-800 text-[12px] font-bold rounded-full">
                  {sub.marks_obtained}/100
                </span>
                <span className="flex items-center gap-0.5 text-[12px] font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                  <Star size={12} fill="currentColor" /> {sub.points_earned}
                </span>
              </div>
            ) : sub ? (
              <span className="inline-flex px-3 py-1 bg-blue-100 text-blue-800 text-[12px] font-bold rounded-full shadow-sm">
                Submitted
              </span>
            ) : (
              <span className="inline-flex px-3 py-1 bg-white text-black text-[12px] font-bold rounded-full shadow-sm">
                Pending
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const AssignSection = ({ title, list, emptyMsg }) => (
    <div className="mb-8">
      <h3 className="text-[16px] font-bold text-neutral-800 mb-4">{title} <span className="text-neutral-400 font-semibold ml-1">({list.length})</span></h3>
      {list.length === 0 ? (
        <div className="text-sm text-neutral-500 font-medium text-center py-10 bg-white rounded-[32px] shadow-sm">{emptyMsg}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((a, idx) => <AssignmentCard key={a.id} a={a} idx={idx} />)}
        </div>
      )}
    </div>
  );

  return (
    <div className="pb-28 min-h-screen bg-[#F4F7F6]">
      <TopBar title="Tests & Assignments" showSearch={false} />
      <div className="px-5 md:px-8 py-8 max-w-6xl mx-auto">

        {/* ── Pill tabs ── */}
        <div className="flex items-center gap-2 p-1.5 bg-black/5 rounded-[20px] mb-8 w-max mx-auto md:mx-0">
          {[
            { id: 'tests',       label: 'Tests',       icon: FileQuestion },
            { id: 'assignments', label: 'Assignments',  icon: ClipboardList },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-6 py-2 rounded-full text-sm font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-white shadow-sm text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <tab.icon size={14} />
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
              <Section title="Available now" tests={available} section="available" emptyMsg="No tests available right now." />
              {upcoming.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-[16px] font-bold text-neutral-800 mb-4">Upcoming <span className="text-neutral-400 font-semibold ml-1">({upcoming.length})</span></h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {upcoming.map((t, idx) => {
                      const cls = subjects.find(c => String(c.id) === String(t.class_id));
                      const theme = CARD_COLORS[idx % CARD_COLORS.length];
                      return (
                        <div key={t.id} className={`rounded-[32px] ${theme.bg} p-5 opacity-70`}>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="min-w-0 flex-1">
                              <h4 className={`font-bold text-[17px] mb-1.5 ${theme.text}`}>{t.title}</h4>
                              <p className="text-[12px] font-medium text-black/50 bg-white/50 px-2 py-0.5 rounded-full inline-block">{cls?.emoji} {cls?.name || 'Subject'} · {t.duration_mins} min · {t.total_marks} marks</p>
                            </div>
                            <span className="bg-black/10 text-black/60 text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0">Upcoming</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[12px] font-bold text-amber-700 pt-3 border-t border-black/5 mt-3">
                            <CalendarClock size={14} /> Opens {fmtDate(t.scheduled_for)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <Section title="Completed"  tests={completed} section="completed" emptyMsg="No tests completed yet." />
              <Section title="Missed"     tests={missed}    section="missed"    emptyMsg="You haven't missed any tests." />
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
              <AssignSection title="Pending"   list={pending}   emptyMsg="No pending assignments." />
              <AssignSection title="Submitted" list={submitted} emptyMsg="No submissions awaiting grading." />
              <AssignSection title="Graded"    list={graded}    emptyMsg="No graded assignments yet." />
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
