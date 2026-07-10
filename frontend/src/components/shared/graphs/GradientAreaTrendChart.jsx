import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import EmptyChart from './EmptyChart';

const medalColor = (rank) => {
  if (rank === 1) return '#F59E0B';
  if (rank === 2) return '#94A3B8';
  if (rank === 3) return '#B45309';
  return '#6366F1';
};

const RankDot = (props) => {
  const { cx, cy, payload, index } = props;
  if (!cx || !cy) return null;
  if (!payload?.rank) {
    return <circle key={`dot-${index}`} cx={cx} cy={cy} r={4} fill="#2563EB" stroke="#fff" strokeWidth={2} />;
  }
  const rank = payload.rank;
  const color = medalColor(rank);
  return (
    <g key={`rankdot-${index}`}>
      <circle cx={cx} cy={cy} r={10} fill={color} stroke="#fff" strokeWidth={2.5} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#fff">
        {rank <= 9 ? rank : '★'}
      </text>
    </g>
  );
};

const RankTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const entry = payload.find((p) => p.dataKey === 'studentScore');
  const rank = entry?.payload?.rank;
  const total = entry?.payload?.totalAttempts;
  return (
    <div style={{ borderRadius: 14, border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', background: '#fff', padding: '10px 14px', minWidth: 140 }}>
      <p style={{ fontWeight: 800, fontSize: 12, color: '#1E293B', marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, fontWeight: 700, fontSize: 12, margin: '2px 0' }}>
          {p.name}: {p.value}%
        </p>
      ))}
      {rank && total ? (
        <p style={{ fontSize: 11, fontWeight: 700, color: medalColor(rank), marginTop: 6 }}>
          {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅'} Rank {rank} of {total}
        </p>
      ) : null}
    </div>
  );
};

export default function GradientAreaTrendChart({ data = [], classAverageLine = false }) {
  if (!data.length) {
    return <EmptyChart label="No test trend yet" height={280} />;
  }

  const hasRanks = data.some((d) => d.rank);

  return (
    <div className="w-full h-full min-h-[280px] pt-3 pb-2">
      {hasRanks && (
        <div className="flex items-center gap-3 mb-2 px-1 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-amber-400" /> #1</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-slate-400" /> #2</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-amber-700" /> #3</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-indigo-400" /> Other</span>
          <span className="ml-auto text-slate-300">Dot = your rank in class</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={hasRanks ? 260 : 280}>
        <AreaChart data={data} margin={{ top: 20, right: 34, left: 4, bottom: 42 }}>
          <defs>
            <linearGradient id="colorStudent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563EB" stopOpacity={0.45}/>
              <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#CBD5E1" opacity={0.55} />
          <XAxis dataKey="name" interval="preserveStartEnd" tick={{fontSize: 11, fill: '#475569', fontWeight: 700}} axisLine={false} tickLine={false} />
          <YAxis tick={{fontSize: 11, fill: '#475569', fontWeight: 700}} axisLine={false} tickLine={false} domain={[0, 100]} width={34} />
          <Tooltip content={<RankTooltip />} />
          {classAverageLine && (
            <Area type="monotone" dataKey="classScore" stroke="#D97706" strokeWidth={2.5} strokeDasharray="5 5" fill="none" name="Class Avg" dot={false} activeDot={false} />
          )}
          <Area
            type="monotone"
            dataKey="studentScore"
            stroke="#2563EB"
            strokeWidth={4}
            fillOpacity={1}
            fill="url(#colorStudent)"
            name="Student"
            filter="url(#glow)"
            dot={hasRanks ? <RankDot /> : { r: 4, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 8, stroke: '#fff', strokeWidth: 3, fill: '#2563EB' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
