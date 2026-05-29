import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Target, BookOpen, ChevronRight, Play, MessageSquare, Clock, Loader2, Medal } from 'lucide-react';
import { Tag, Avatar, Skeleton } from '../../components/ui';
import { apiClient, leaderboardApi, testApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { useAppCache } from '../../store';
import NotificationBell from '../../components/shared/NotificationBell';

export default function StudentHomePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState([]);
  const [myAttempts, setMyAttempts] = useState({});
  const [broadcasts, setBroadcasts] = useState([]);
  const [videos, setVideos] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const subjects = useAppCache(s => s.subjects);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Use standard_id from Zustand (set at login) to fire all calls in parallel
        const standardId = user?.standard_id;

        const [testsData, history, broads, vids, lb] = await Promise.all([
          testApi.getTests().catch(() => []),
          testApi.getStudentTestHistory().catch(() => []),
          standardId
            ? apiClient(`/broadcasts?standard_id=${standardId}`).catch(() => [])
            : Promise.resolve([]),
          apiClient('/videos?limit=5').catch(() => []),
          standardId
            ? leaderboardApi.get(standardId).catch(() => ({ leaderboard: [] }))
            : Promise.resolve({ leaderboard: [] }),
        ]);

        setTests(Array.isArray(testsData) ? testsData : []);

        const attemptsMap = {};
        (Array.isArray(history) ? history : []).forEach(a => {
          attemptsMap[a.test_id] = a;
        });
        setMyAttempts(attemptsMap);

        setBroadcasts(
          (Array.isArray(broads) ? broads : []).filter(b => !b.deleted).reverse()
        );
        setVideos(Array.isArray(vids) ? vids : []);
        setLeaderboard(lb?.leaderboard || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const now = new Date();
  const availableTests = tests.filter(t => {
    if (myAttempts[t.id]) return false;
    if (t.status === 'active') return true;
    if (t.status === 'scheduled') return !t.scheduled_for || new Date(t.scheduled_for) <= now;
    return false;
  });
  const latestBroadcast = broadcasts[0];
  const recentVideos = videos.slice(0, 3);
  const myRank = leaderboard.find(l => l.id === user?.id);
  const top3 = leaderboard.slice(0, 3);

  if (loading) {
    return (
      <div>
        <div className="sticky top-0 z-30 glass-nav">
          <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="w-8 h-8 rounded-full ml-auto" />
          </div>
        </div>
        <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  const displayName = user?.name?.split(' ')[0] || 'Student';

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <div className="flex-1">
            <p className="text-xs text-neutral-500">{greeting},</p>
            <h1 className="text-base font-semibold leading-tight">{displayName} 👋</h1>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Avatar name={user?.name || '?'} src={user?.avatar_url} size="sm" />
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Points',    value: user?.points ?? 0,                    icon: Trophy  },
            { label: 'Avg score', value: user?.avg_score ? `${Math.round(user.avg_score)}%` : '—', icon: Target  },
            { label: 'Subjects',  value: subjects.length,                          icon: BookOpen },
          ].map((s, i) => (
            <div key={i} className="p-3 glass-panel rounded-xl text-center">
              <s.icon size={14} className="mx-auto mb-1 text-neutral-500" />
              <p className="text-lg font-semibold tracking-tight">{s.value}</p>
              <p className="text-[11px] text-neutral-600">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Latest broadcast */}
        {latestBroadcast && (
          <button onClick={() => navigate('/student/broadcasts')}
            className="w-full flex items-start gap-3 p-4 glass-panel bg-neutral-900/80 backdrop-blur-md border border-neutral-800 text-white rounded-xl mb-6 text-left hover:bg-neutral-800/90 transition-colors shadow-lg">
            <MessageSquare size={16} className="mt-0.5 flex-shrink-0 text-neutral-400" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-neutral-400 mb-0.5">Latest from teacher</p>
              <p className="text-sm truncate text-white">{latestBroadcast.message || latestBroadcast.text}</p>
            </div>
            <ChevronRight size={14} className="text-neutral-500 mt-0.5" />
          </button>
        )}

        {/* Available tests */}
        {availableTests.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Available tests</p>
              <button onClick={() => navigate('/student/tests')} className="text-xs text-neutral-500 hover:text-neutral-900">See all</button>
            </div>
            <div className="space-y-2">
              {availableTests.slice(0, 2).map(t => (
                <button key={t.id} onClick={() => navigate(`/student/tests/${t.id}/take`)}
                  className="w-full flex items-center gap-3 p-3 glass-panel rounded-xl hover:bg-white/40 transition-colors text-left">
                  <div className="w-8 h-8 rounded-md bg-amber-50/80 border border-amber-200 flex items-center justify-center text-base flex-shrink-0">📋</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-xs text-neutral-600">{t.duration_mins} min</p>
                  </div>
                  <Tag color="amber">Start</Tag>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard mini */}
        {top3.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold flex items-center gap-1.5"><Medal size={14} /> Leaderboard</p>
              {myRank && <span className="text-xs text-neutral-500">Your rank: #{myRank.rank}</span>}
            </div>
            <div className="glass-panel rounded-xl overflow-hidden">
              {top3.map((s, i) => (
                <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${i < 2 ? 'border-b border-white/40' : ''}`}>
                  <span className="text-base w-6 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                  <Avatar name={s.name} src={s.avatar_url} size="sm" />
                  <p className="flex-1 text-sm font-medium truncate">{s.name}</p>
                  <span className="text-sm font-semibold text-amber-700">{s.points} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent videos */}
        {recentVideos.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Continue watching</p>
              <button onClick={() => navigate('/student/subjects')} className="text-xs text-neutral-500 hover:text-neutral-900">See all</button>
            </div>
            <div className="space-y-2">
              {recentVideos.map(v => {
                const cls = subjects.find(c => c.id === v.class_id);
                return (
                  <button key={v.id} onClick={() => navigate(`/student/subjects/${v.class_id}/video/${v.id}`)}
                    className="w-full flex items-center gap-3 p-3 glass-panel rounded-xl hover:bg-white/40 transition-colors text-left">
                    <div className="w-8 h-8 rounded-md bg-white/50 border border-white/60 shadow-sm flex items-center justify-center flex-shrink-0">
                      <Play size={14} className="text-neutral-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{v.title}</p>
                      <p className="text-xs text-neutral-600">{cls?.name || 'Subject'}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Subjects quick access */}
        {subjects.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Your subjects</p>
              <button onClick={() => navigate('/student/subjects')} className="text-xs text-neutral-500 hover:text-neutral-900">See all</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {subjects.slice(0, 4).map(c => (
                <button key={c.id} onClick={() => navigate(`/student/subjects/${c.id}`)}
                  className="flex items-center gap-2 p-3 glass-panel rounded-xl hover:bg-white/40 transition-colors text-left">
                  <span className="text-xl drop-shadow-sm">{c.emoji || '📚'}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-neutral-600">Subject</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
