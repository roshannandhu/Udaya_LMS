import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, Clock, CheckCircle2, Loader2, Trophy, CalendarClock } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { Tag, Skeleton } from '../../components/ui';
import { testApi, apiClient } from '../../lib/api';

export default function StudentTestsPage() {
  const navigate = useNavigate();

  const [allTests, setAllTests] = useState([]);
  const [myAttempts, setMyAttempts] = useState({});
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [testsRes, historyRes, subsRes] = await Promise.all([
          testApi.getTests(),
          testApi.getStudentTestHistory(),
          apiClient('/subjects'),
        ]);

        setAllTests(Array.isArray(testsRes) ? testsRes : []);
        setSubjects(Array.isArray(subsRes) ? subsRes : []);

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

  const attemptedIds = new Set(Object.keys(myAttempts));
  const now = new Date();

  const isOpen = (t) => {
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
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  const TestCard = ({ t, section }) => {
    const cls = subjects.find(c => String(c.id) === String(t.class_id));
    const attempt = myAttempts[t.id];
    // attempt.score is raw marks, compute %
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
          <div className="flex gap-4 text-xs pt-2 border-t border-white/40 mt-2 flex-wrap">
            <div><span className="text-neutral-500">Score </span><span className="font-semibold">{attempt.score}/{t.total_marks}</span></div>
            <div><span className="text-neutral-500">Correct </span><span className="font-semibold text-green-600">{attempt.correct_count}</span></div>
            <div><span className="text-neutral-500">Wrong </span><span className="font-semibold text-red-500">{attempt.wrong_count}</span></div>
            <div className="flex items-center gap-1"><Trophy size={10} className="text-amber-500" /><span className="font-semibold text-amber-700">{attempt.points_earned} pts</span></div>
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

  return (
    <div>
      <TopBar title="Tests" showSearch={false} />
      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
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
            <Section title="Completed"    tests={completed} section="completed" emptyMsg="No tests completed yet." />
            <Section title="Missed"       tests={missed}    section="missed"    emptyMsg="You haven't missed any tests." />
          </>
        )}
      </div>
    </div>
  );
}
