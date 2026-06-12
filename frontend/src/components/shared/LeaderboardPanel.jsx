import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Trophy, Medal, Crown, Star, Loader2 } from 'lucide-react';
import { Avatar, Skeleton } from '../ui';
import { leaderboardApi } from '../../lib/api';
import { staggerChildren, fadeUp } from '../../lib/motion';

// Podium columns rise in sequence (3rd → 2nd → 1st), then the crown pops.
function PodiumSlot({ children, order, reduce }) {
  if (reduce) return <div className="flex flex-col items-center flex-1 min-w-0">{children}</div>;
  return (
    <motion.div
      className="flex flex-col items-center flex-1 min-w-0"
      initial={{ opacity: 0, y: 36, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 20, delay: order * 0.15 }}
    >
      {children}
    </motion.div>
  );
}

const PERIODS = [
  { id: 'weekly',  label: 'Weekly'   },
  { id: 'monthly', label: 'Monthly'  },
  { id: 'overall', label: 'All-time' },
];

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

/**
 * Shared leaderboard: period tabs (weekly / monthly / all-time) + top-3 podium +
 * full ranked list. Used by the student leaderboard page and the teacher reports
 * page. Pass `highlightId` to ring the viewer's own row and show the "Your
 * ranking" badge (student portal). Pass `onSelect` (teacher portal only) to make
 * rows clickable — e.g. opening the student's report card.
 */
export default function LeaderboardPanel({ standardId, highlightId, defaultPeriod = 'overall', onSelect }) {
  const reduce = useReducedMotion();
  const [period, setPeriod] = useState(defaultPeriod);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let ignore = false; // drop out-of-order responses on rapid period switches
    setLoading(true);
    leaderboardApi.get(standardId, period)
      .then(d => { if (!ignore) { setLeaderboard(d?.leaderboard || []); setLoaded(true); } })
      .catch(err => { if (!ignore) console.error(err); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [standardId, period]);

  const myRank = highlightId ? leaderboard.find(l => l.id === highlightId) : null;
  const podium = leaderboard.length >= 3;

  return (
    <div>
      {/* Period tabs */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-0.5 p-1 bg-neutral-100/80 rounded-xl">
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${period === p.id ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {loading && loaded && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-neutral-400">
            <Loader2 size={12} className="animate-spin" /> Updating…
          </span>
        )}
      </div>

      <div className={`transition-opacity duration-200 ${loading && loaded ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* My rank badge (student portal) */}
        {myRank && (
          <div className="rounded-card p-4 mb-6 flex items-center gap-4 bg-pastel-cream border border-black/5">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-soft">
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

        {/* Top 3 podium — builds 3rd → 2nd → 1st, crown pops last */}
        {!loading && podium && (
          <div key={period} className="flex items-end justify-center gap-3 mb-8 px-4">
            {/* 2nd */}
            <PodiumSlot order={1} reduce={reduce}>
              <Avatar name={leaderboard[1]?.name} src={leaderboard[1]?.avatar_url} size="md" />
              <p className="text-xs font-medium mt-2 truncate max-w-[80px] text-center">{leaderboard[1]?.name}</p>
              <div className="mt-2 w-full h-16 glass-panel rounded-t-2xl flex flex-col items-center justify-center border-neutral-200">
                <Medal size={20} className="text-neutral-400 mb-1" />
                <p className="text-sm font-bold">{leaderboard[1]?.points}</p>
              </div>
            </PodiumSlot>
            {/* 1st */}
            <PodiumSlot order={2} reduce={reduce}>
              {reduce ? <Crown size={20} className="text-amber-500 mb-1" /> : (
                <motion.span initial={{ scale: 0, rotate: -25 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 12, delay: 0.55 }} className="mb-1 inline-flex">
                  <Crown size={20} className="text-amber-500" />
                </motion.span>
              )}
              <Avatar name={leaderboard[0]?.name} src={leaderboard[0]?.avatar_url} size="lg" />
              <p className="text-xs font-medium mt-2 truncate max-w-[80px] text-center">{leaderboard[0]?.name}</p>
              <div className="mt-2 w-full h-24 bg-amber-50 border border-amber-200 rounded-t-2xl flex flex-col items-center justify-center shadow-card">
                <Star size={18} className="text-amber-500 mb-1" />
                <p className="text-base font-bold text-amber-700">{leaderboard[0]?.points}</p>
              </div>
            </PodiumSlot>
            {/* 3rd */}
            <PodiumSlot order={0} reduce={reduce}>
              <Avatar name={leaderboard[2]?.name} src={leaderboard[2]?.avatar_url} size="md" />
              <p className="text-xs font-medium mt-2 truncate max-w-[80px] text-center">{leaderboard[2]?.name}</p>
              <div className="mt-2 w-full h-10 glass-panel rounded-t-2xl flex flex-col items-center justify-center border-orange-200">
                <p className="text-sm font-bold">{leaderboard[2]?.points}</p>
              </div>
            </PodiumSlot>
          </div>
        )}

        {/* Full list */}
        {loading && !loaded ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="text-center py-16 text-sm text-neutral-500 glass-panel rounded-xl border-dashed border-[#D8D6D2]">
            No points earned {period === 'overall' ? 'yet' : `this ${period === 'weekly' ? 'week' : 'month'}`}. Tests, assignments and videos all count!
          </div>
        ) : (
          <motion.div key={`list-${period}`} className="space-y-2"
            variants={reduce ? undefined : staggerChildren}
            initial={reduce ? false : 'hidden'} animate={reduce ? false : 'show'}>
            {leaderboard.map(s => {
              const isMe = s.id === highlightId;
              return (
                <motion.div key={s.id} variants={reduce ? undefined : fadeUp}>
                  {/* inner div carries the one-time "that's you" glow so it never
                      fights the entrance variants on the outer element */}
                  <motion.div
                    animate={!reduce && isMe ? { boxShadow: ['0 0 0 0 rgba(147,197,253,0)', '0 0 0 6px rgba(147,197,253,0.35)', '0 0 0 0 rgba(147,197,253,0)'] } : undefined}
                    transition={!reduce && isMe ? { duration: 1.4, delay: 0.8, times: [0, 0.5, 1] } : undefined}
                    onClick={onSelect ? () => onSelect(s) : undefined}
                    className={`flex items-center gap-3 px-4 py-3 glass-panel rounded-xl border ${rankBg(s.rank)} ${isMe ? 'ring-2 ring-blue-300' : ''} ${onSelect ? 'cursor-pointer hover:bg-white/60' : ''}`}>
                    <div className="flex items-center justify-center w-6 flex-shrink-0">
                      {rankIcon(s.rank)}
                    </div>
                    <Avatar name={s.name} src={s.avatar_url} size="sm" />
                    <p className={`flex-1 text-sm font-medium truncate ${isMe ? 'text-blue-700' : ''}`}>
                      {s.name}
                      {isMe && <span className="text-xs font-normal text-blue-500 ml-1">(you)</span>}
                    </p>
                    <div className="flex items-center gap-1">
                      <Star size={12} className="text-amber-400" />
                      <span className="text-sm font-semibold tabular-nums">{s.points}</span>
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
