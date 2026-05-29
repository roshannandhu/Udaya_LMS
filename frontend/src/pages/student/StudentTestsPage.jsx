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
  const TestCard = ({ t, section }) => {
    const cls = subjects.find(c => String(c.id) === String(t.class_id));
    const attempt = myAttempts[t.id];
    const scorePct = attempt && t.total_marks
      ? Math.round((attempt.score / t.total_marks) * 100)
      : null;

    return (
      <div className="glass-panel rounded-xl p-4 hover:bg-white/40 transition-colors">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className="font-medium text-sm">{t.title}</h4>
              {t.negative_marking && <Tag color="red">−{t.penalty}</Tag>}
            </div>
            <p className="text-xs text-neutral-500">
              {cls?.emoji} {cls?.name || 'Subject'} · {t.duration_mins} min · {t.total_marks} marks
            </p>
          </div>
          {section === 'available' && <Tag color="amber">Open</Tag>}
          {section === 'completed' && scorePct !== null && (
            <Tag color={scorePct >= 75 ? 'green' : scorePct >= 50 ? 'blue' : 'red'}>{scorePct}%</Tag>
          )}
          {section === 'missed' && <Tag color="red">Missed</Tag>}
        </div>

        {section === 'available' && (
          <div className="flex items-center justify-between pt-2 border-t border-white/40 mt-2">
            <span className="text-xs text-amber-700 flex items-center gap-1">
              <Clock size={11} />
              {t.expires_at ? `Closes ${fmtDate(t.expires_at)}` : (t.scheduled_for ? fmtDate(t.scheduled_for) : 'Active now')}
            </span>
            <button
              onClick={() => navigate(`/student/tests/${t.id}/take`)}
              className="px-3 py-1.5 bg-neutral-900 text-white text-xs rounded-full font-medium hover:bg-neutral-700 transition-colors">
              Start test
            </button>
          </div>
        )}

        {section === 'completed' && attempt && (
          <div className="pt-2 border-t border-white/40 mt-2">
            <div className="flex gap-4 text-xs mb-2.5 flex-wrap">
              <div><span className="text-neutral-500">Score </span><span className="font-semibold">{attempt.score}/{t.total_marks}</span></div>
              <div><span className="text-neutral-500">Correct </span><span className="font-semibold text-green-600">{attempt.correct_count}</span></div>
              <div><span className="text-neutral-500">Wrong </span><span className="font-semibold text-red-500">{attempt.wrong_count}</span></div>
              <div className="flex items-center gap-1"><Trophy size={10} className="text-amber-500" /><span className="font-semibold text-amber-700">{attempt.points_earned} pts</span></div>
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
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-neutral-600 bg-white/40 border border-white/60 hover:bg-white/70 transition-colors"
            >
              <BookOpen size={12} /> Review Answers
            </button>
          </div>
        )}
      </div>
    );
  };

  const Section = ({ title, tests, section, emptyMsg }) => (
    <div className="mb-6">
      <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">{title} · {tests.length}</p>
      {tests.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-8 glass-panel border-dashed border-white/60 rounded-xl">{emptyMsg}</p>
      ) : (
        <div className="space-y-2">
          {tests.map(t => <TestCard key={t.id} t={t} section={section} />)}
        </div>
      )}
    </div>
  );

  // ── Assignment card ───────────────────────────────────────────────
  const AssignmentCard = ({ a }) => {
    const sub = a.my_submission;
    const isGraded = sub && sub.marks_obtained != null;
    const due = a.due_date ? new Date(a.due_date) : null;
    const isPast = due && due < now;

    return (
      <button
        onClick={() => setSelectedAssignment(a)}
        className="w-full text-left p-4 glass-panel rounded-xl hover:bg-white/70 transition-colors"
      >
        <div className="flex items-start gap-3">
          <ClipboardList size={16} className="text-neutral-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-neutral-400 mb-0.5">{a.subject_emoji} {a.subject_name}</p>
            <p className="text-sm font-medium truncate">{a.title}</p>
            {a.description && (
              <p className="text-xs text-neutral-500 line-clamp-1 mt-0.5">{a.description}</p>
            )}
            {due && (
              <div className={`flex items-center gap-1 text-xs mt-1 font-medium ${isPast ? 'text-red-500' : 'text-amber-600'}`}>
                <CalendarClock size={11} />
                Due {due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            {(a.assignment_attachments || []).length > 0 && (
              <span className="flex items-center gap-1 text-xs text-neutral-400 mt-1">
                <Paperclip size={10} />
                {a.assignment_attachments.length} file{a.assignment_attachments.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex-shrink-0">
            {isGraded ? (
              <div className="text-right">
                <span className="inline-flex px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                  {sub.marks_obtained}/100
                </span>
                <div className="flex items-center justify-end gap-0.5 text-xs text-amber-600 font-semibold mt-1">
                  <Star size={10} fill="currentColor" /> {sub.points_earned} pts
                </div>
              </div>
            ) : sub ? (
              <span className="inline-flex px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                Submitted
              </span>
            ) : (
              <span className="inline-flex px-2 py-0.5 bg-neutral-100 text-neutral-500 text-xs font-semibold rounded-full">
                Pending
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const AssignSection = ({ title, list, emptyMsg }) => (
    <div className="mb-6">
      <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">{title} · {list.length}</p>
      {list.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-8 glass-panel border-dashed border-white/60 rounded-xl">{emptyMsg}</p>
      ) : (
        <div className="space-y-2">
          {list.map(a => <AssignmentCard key={a.id} a={a} />)}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <TopBar title="Tests & Assignments" showSearch={false} />
      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">

        {/* ── Pill tabs ── */}
        <div className="flex items-center gap-1 p-1 bg-black/5 rounded-xl mb-6">
          {[
            { id: 'tests',       label: 'Tests',       icon: FileQuestion },
            { id: 'assignments', label: 'Assignments',  icon: ClipboardList },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 flex-1 justify-center px-4 py-2 rounded-lg text-sm font-medium transition-all ${
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
                <div className="mb-6">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Upcoming · {upcoming.length}</p>
                  <div className="space-y-2">
                    {upcoming.map(t => {
                      const cls = subjects.find(c => String(c.id) === String(t.class_id));
                      return (
                        <div key={t.id} className="glass-panel rounded-xl p-4 opacity-80">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h4 className="font-medium text-sm mb-1">{t.title}</h4>
                              <p className="text-xs text-neutral-500">{cls?.emoji} {cls?.name || 'Subject'} · {t.duration_mins} min · {t.total_marks} marks</p>
                            </div>
                            <Tag color="gray">Upcoming</Tag>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-amber-700 pt-2 border-t border-white/40 mt-2">
                            <CalendarClock size={11} /> Opens {fmtDate(t.scheduled_for)}
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
