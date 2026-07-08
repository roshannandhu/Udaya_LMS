import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const RangeBar = (props) => {
  const { x, y, width, height, studentScore, minScore, maxScore } = props;
  
  if (!height || height < 0) return null;
  // Calculate relative position of student score within the min-max range bar
  const range = maxScore - minScore;
  const normalizedScore = range === 0 ? 0.5 : (studentScore - minScore) / range;
  const dotY = y + height - (height * normalizedScore);

  return (
    <g>
      <rect x={x + width/2 - 5} y={y} width={10} height={height} rx={5} fill="#EEF2FF" stroke="#CBD5E1" />
      <circle cx={x + width/2} cy={dotY} r={7} fill="#2563EB" stroke="#fff" strokeWidth={2} className="drop-shadow-sm" />
    </g>
  );
};

export default function QuizRangeChart({ data }) {
  // data: [{ name: 'Test 1', minScore: 40, maxScore: 95, studentScore: 85 }]
  // For Recharts BarChart to simulate a floating bar, we use a stacked bar approach or custom shape.
  // Custom shape is much cleaner here.
  
  const chartData = data.map(d => ({ ...d, range: [d.minScore, d.maxScore] }));

  return (
    <div className="w-full h-full min-h-[260px] pt-3 pb-2">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ top: 20, right: 34, left: 4, bottom: 42 }}>
          <XAxis dataKey="name" interval="preserveStartEnd" tick={{fontSize: 11, fill: '#475569', fontWeight: 700}} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} width={34} tick={{fontSize: 11, fill: '#475569', fontWeight: 700}} axisLine={false} tickLine={false} />
          <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
          <Bar dataKey="range" shape={<RangeBar />} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
