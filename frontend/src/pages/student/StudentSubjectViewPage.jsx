import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, FileQuestion, Trophy, Clock, Lock, CheckCircle2, ChevronRight, Loader2, CalendarClock } from 'lucide-react';
import { Tag } from '../../components/ui';
import { videoApi, testApi, leaderboardApi, apiClient } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
const TABS = ['Videos', 'Tests', 'Leaderboard'];

export default function StudentSubjectViewPage() {
  const { classId } = useParams();
  const navigate    = useNavigate();
  const { user }    = useAuthStore();
  const [tab, setTab]           = useState('Videos');
  const [subject, setSubject]   = useState(null);

  const [videos, setVideos] = useState([]);
  const [tests, setTests] = useState([]);
  const [leaderboardRows, setLeaderboardRows] = useState([]);
  const [myAttempts, setMyAttempts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [vids, tsts, hist, subs] = await Promise.all([
          videoApi.getVideos(classId),
          testApi.getTests().then(res => (res || []).filter(t => String(t.class_id) === String(classId))),
          testApi.getStudentTestHistory(),
          apiClient('/subjects'),
        ]);
        setVideos(vids || []);
        setTests(tsts || []);
        const sub = (subs || []).find(s => String(s.id) === String(classId));
        setSubject(sub || null);
        const attemptsMap = {};
        (hist || []).forEach(a => { attemptsMap[a.test_id] = a; });
        setMyAttempts(attemptsMap);
        // Fetch leaderboard using the subject's standard_id
        if (sub?.standard_id) {
          const lb = await leaderboardApi.get(sub.standard_id).catch(() => ({ leaderboard: [] }));
          setLeaderboardRows(lb?.leaderboard || []);
        }
      } catch(err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [classId]);

  const attempted = new Set(Object.keys(myAttempts));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-neutral-400" size={24} />
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate('/student/subjects')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-white/60 rounded-md"><ArrowLeft size={16} /></button>
          <span className="text-xl">{subject?.emoji || '📚'}</span>
          <h1 className="text-base font-semibold flex-1">{subject?.name || 'Subject'}</h1>
        </div>
        <div className="px-5 md:px-8 flex gap-0 border-t border-white/40">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {loading ? (
          <div className="flex justify-center py-16 text-neutral-400">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : tab === 'Videos' && (
          <div className="space-y-2">
            {videos.length === 0 && <p className="text-sm text-neutral-500 text-center py-12">No videos yet.</p>}
            {videos.map((v, i) => (
              <button key={v.id} onClick={() => navigate(`/student/subjects/${classId}/video/${v.id}`)}
                className="w-full flex items-center gap-3 p-3 glass-panel rounded-xl hover:bg-white/70 transition-colors text-left">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md ${v.my_completed ? 'bg-green-600' : 'bg-neutral-900'}`}>
                  {v.my_completed
                    ? <CheckCircle2 size={16} className="text-white" />
                    : <Play size={14} className="text-white ml-0.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{v.title}</p>
                  <p className="text-xs text-neutral-500 flex items-center gap-1.5 mt-0.5">
                    <Clock size={10} />
                    {v.duration_secs ? `${Math.floor(v.duration_secs / 60)}:${(v.duration_secs % 60).toString().padStart(2, '0')}` : '0:00'}
                    {v.my_completed && <span className="text-green-600 font-medium">· Completed</span>}
                  </p>
                </div>
              </button>
            ))}
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
            <div className="space-y-2">
              {tests.length === 0 && <p className="text-sm text-neutral-500 text-center py-12">No tests yet.</p>}
              {tests.map((t) => {
                const done = attempted.has(t.id);
                const attempt = myAttempts[t.id];
                const scorePct = attempt && t.total_marks > 0 ? ((attempt.score / t.total_marks) * 100).toFixed(0) : '—';
                const open = isOpen(t);
                const isFutureScheduled = t.status === 'scheduled' && t.scheduled_for && new Date(t.scheduled_for) > now;
                return (
                  <div key={t.id} className={`p-4 glass-panel rounded-xl transition-colors ${open && !done ? 'hover:bg-white/70' : ''}`}>
                    <div className="flex items-center gap-3">
                      <FileQuestion size={16} className="text-neutral-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-neutral-500">{t.duration_mins} min{t.negative_marking ? ` · −${t.penalty} penalty` : ''}</p>
                      </div>
                      {done && (
                        <Tag color={Number(scorePct) >= 75 ? 'green' : Number(scorePct) >= 50 ? 'blue' : 'red'}>{scorePct}%</Tag>
                      )}
                      {open && !done && (
                        <button onClick={() => navigate(`/student/tests/${t.id}/take`)}
                          className="px-3 py-1.5 bg-neutral-900 text-white text-xs rounded-md font-medium hover:bg-neutral-700 transition-colors">
                          Start
                        </button>
                      )}
                      {isFutureScheduled && !done && <Tag color="gray">Upcoming</Tag>}
                      {t.status === 'completed' && !done && <Tag color="red">Missed</Tag>}
                    </div>
                    {isFutureScheduled && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700 pt-2 border-t border-white/40 mt-2">
                        <CalendarClock size={11} /> Opens {new Date(t.scheduled_for).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {tab === 'Leaderboard' && (
          <div className="space-y-0 glass-panel rounded-xl overflow-hidden">
            {leaderboardRows.length === 0 && (
              <p className="text-sm text-neutral-500 text-center py-12">No results yet.</p>
            )}
            {leaderboardRows.map((row, i) => {
              const isMe = row.id === user?.id;
              return (
                <div key={row.id ?? i}
                  className={`flex items-center gap-3 px-4 py-3 ${i < leaderboardRows.length - 1 ? 'border-b border-white/40' : ''} ${isMe ? 'bg-white/50' : 'hover:bg-white/30'} transition-colors`}>
                  <span className={`w-6 text-sm font-bold ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-neutral-500' : i === 2 ? 'text-orange-400' : 'text-neutral-400'}`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{row.name ?? 'Student'}{isMe && <span className="text-neutral-400 font-normal"> (you)</span>}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold">{row.points || 0} pts</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
