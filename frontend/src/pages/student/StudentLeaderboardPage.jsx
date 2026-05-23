import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Medal, Crown, Star, Loader2 } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { Avatar, Skeleton } from '../../components/ui';
import { leaderboardApi, apiClient } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';

export default function StudentLeaderboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [standardId, setStandardId] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiClient('/auth/me');
        const sid = me?.standard_id || null;
        setStandardId(sid);
        const data = await leaderboardApi.get(sid);
        setLeaderboard(data?.leaderboard || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const myId = user?.id;
  const myRank = leaderboard.find(l => l.id === myId);

  const rankIcon = (rank) => {
    if (rank === 1) return <Crown size={18} className="text-amber-500" />;
    if (rank === 2) return <Medal size={18} className="text-neutral-400" />;
    if (rank === 3) return <Medal size={18} className="text-amber-700" />;
    return <span className="text-sm font-semibold text-neutral-500 tabular-nums w-[18px] text-center">{rank}</span>;
  };

  const rankBg = (rank) => {
    if (rank === 1) return 'bg-amber-50/80 border-amber-200';
    if (rank === 2) return 'bg-neutral-50/80 border-neutral-200';
    if (rank === 3) return 'bg-orange-50/80 border-orange-200';
    return '';
  };

  return (
    <div>
      <TopBar title="Leaderboard" showSearch={false} />
      <div className="px-5 md:px-8 py-6 max-w-2xl mx-auto">

        {/* My rank badge */}
        {myRank && (
          <div className="glass-panel rounded-2xl p-4 mb-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
              <Trophy size={22} className="text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-neutral-500">Your ranking</p>
              <p className="text-xl font-bold">#{myRank.rank}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-neutral-500">Points</p>
              <p className="text-xl font-bold text-amber-600">{myRank.points}</p>
            </div>
          </div>
        )}

        {/* Top 3 podium */}
        {!loading && leaderboard.length >= 3 && (
          <div className="flex items-end justify-center gap-3 mb-8 px-4">
            {/* 2nd */}
            <div className="flex flex-col items-center flex-1">
              <Avatar name={leaderboard[1]?.name} size="md" />
              <p className="text-xs font-medium mt-2 truncate max-w-[80px] text-center">{leaderboard[1]?.name}</p>
              <div className="mt-2 w-full h-16 glass-panel rounded-t-2xl flex flex-col items-center justify-center border-neutral-200">
                <Medal size={20} className="text-neutral-400 mb-1" />
                <p className="text-sm font-bold">{leaderboard[1]?.points}</p>
              </div>
            </div>
            {/* 1st */}
            <div className="flex flex-col items-center flex-1">
              <Crown size={20} className="text-amber-500 mb-1" />
              <Avatar name={leaderboard[0]?.name} size="lg" />
              <p className="text-xs font-medium mt-2 truncate max-w-[80px] text-center">{leaderboard[0]?.name}</p>
              <div className="mt-2 w-full h-24 bg-amber-50/80 backdrop-blur-md border border-amber-200 rounded-t-2xl flex flex-col items-center justify-center" style={{boxShadow: '-4px -4px 10px rgba(255,255,255,0.8), 4px 4px 10px rgba(0,0,0,0.06)'}}>
                <Star size={18} className="text-amber-500 mb-1" />
                <p className="text-base font-bold text-amber-700">{leaderboard[0]?.points}</p>
              </div>
            </div>
            {/* 3rd */}
            <div className="flex flex-col items-center flex-1">
              <Avatar name={leaderboard[2]?.name} size="md" />
              <p className="text-xs font-medium mt-2 truncate max-w-[80px] text-center">{leaderboard[2]?.name}</p>
              <div className="mt-2 w-full h-10 glass-panel rounded-t-2xl flex flex-col items-center justify-center border-orange-200">
                <p className="text-sm font-bold">{leaderboard[2]?.points}</p>
              </div>
            </div>
          </div>
        )}

        {/* Full list */}
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="text-center py-16 text-sm text-neutral-500 glass-panel rounded-xl border-dashed border-white/60">
            No students on the leaderboard yet. Complete tests to earn points!
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map(s => (
              <div key={s.id}
                className={`flex items-center gap-3 px-4 py-3 glass-panel rounded-xl border ${rankBg(s.rank)} ${s.id === myId ? 'ring-2 ring-blue-300' : ''}`}>
                <div className="flex items-center justify-center w-6 flex-shrink-0">
                  {rankIcon(s.rank)}
                </div>
                <Avatar name={s.name} size="sm" />
                <p className={`flex-1 text-sm font-medium truncate ${s.id === myId ? 'text-blue-700' : ''}`}>
                  {s.name}
                  {s.id === myId && <span className="text-xs font-normal text-blue-500 ml-1">(you)</span>}
                </p>
                <div className="flex items-center gap-1">
                  <Star size={12} className="text-amber-400" />
                  <span className="text-sm font-semibold tabular-nums">{s.points}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
