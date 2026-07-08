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
      <rect x={x + width/2 - 4} y={y} width={8} height={height} rx={4} fill="#F4F7F6" stroke="#E5E7EB" />
      <circle cx={x + width/2} cy={dotY} r={6} fill="#4F46E5" stroke="#fff" strokeWidth={2} className="drop-shadow-sm" />
    </g>
  );
};

export default function QuizRangeChart({ data }) {
  // data: [{ name: 'Test 1', minScore: 40, maxScore: 95, studentScore: 85 }]
  // For Recharts BarChart to simulate a floating bar, we use a stacked bar approach or custom shape.
  // Custom shape is much cleaner here.
  
  const chartData = data.map(d => ({ ...d, range: [d.minScore, d.maxScore] }));

  return (
    <div className="w-full h-full min-h-[220px] pt-4 pb-2 pr-4">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 30 }}>
          <XAxis dataKey="name" tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
          <Bar dataKey="range" shape={<RangeBar />} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
