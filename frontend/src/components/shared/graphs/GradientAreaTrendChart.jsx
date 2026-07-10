import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
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

function computeMomentum(data) {
  if (data.length < 4) return null;
  const scores = data.map((d) => d.studentScore);
  const half = Math.ceil(scores.length / 2);
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const delta = Math.round(avg(scores.slice(-half)) - avg(scores.slice(0, half)));
  if (delta > 5) return { emoji: '📈', label: `+${delta}pts`, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (delta < -5) return { emoji: '📉', label: `${delta}pts`, cls: 'text-rose-600 bg-rose-50 border-rose-200' };
  return { emoji: '➡', label: 'Stable', cls: 'text-slate-500 bg-slate-50 border-slate-200' };
}

export default function GradientAreaTrendChart({ data = [], classAverageLine = false }) {
  if (!data.length) {
    return <EmptyChart label="No test trend yet" height={280} />;
  }

  const hasRanks = data.some((d) => d.rank);
  const momentum = computeMomentum(data);

  return (
    <div className="w-full h-full min-h-[280px] pt-3 pb-2">
      {/* Score zone legend + momentum chip */}
      <div className="flex items-center gap-2 mb-2 px-1 flex-wrap">
        <div className="flex items-center gap-3 text-[10px] font-bold uppercase text-slate-400 tracking-wider flex-wrap">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-rose-200" /> &lt;40%</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-amber-100" /> 40–80%</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-emerald-100" /> &gt;80%</span>
        </div>
        {momentum && (
          <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${momentum.cls}`}>
            {momentum.emoji} {momentum.label}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={255}>
        <AreaChart data={data} margin={{ top: 10, right: 34, left: 4, bottom: 42 }}>
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

          {/* Score zone bands */}
          <ReferenceArea y1={0} y2={40} fill="#FEE2E2" fillOpacity={0.5} />
          <ReferenceArea y1={40} y2={80} fill="#FEF9C3" fillOpacity={0.35} />
          <ReferenceArea y1={80} y2={100} fill="#D1FAE5" fillOpacity={0.5} />

          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#CBD5E1" opacity={0.45} />
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
