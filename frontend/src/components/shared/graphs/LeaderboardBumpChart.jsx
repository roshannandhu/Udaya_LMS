import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import EmptyChart from './EmptyChart';

export default function LeaderboardBumpChart({ data = [] }) {
  const safeData = data
    .map((item) => ({ ...item, rank: Number(item.rank) }))
    .filter((item) => Number.isFinite(item.rank) && item.rank > 0);
  if (!safeData.length) return <EmptyChart label="No rank data yet" height={220} />;
  // data: [{ week: 'W1', rank: 15 }, { week: 'W2', rank: 8 }, ...]
  return (
    <div className="w-full h-full min-h-[220px] pt-4 pb-2 pr-4">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={safeData} margin={{ top: 20, right: 30, left: 10, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
          <XAxis dataKey="week" tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          {/* YAxis reversed for rank (1 is highest) */}
          <YAxis reversed domain={[1, 'dataMax']} tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
          <Line 
            type="monotone" 
            dataKey="rank" 
            stroke="#A78BFA" 
            strokeWidth={4} 
            activeDot={{ r: 8, stroke: '#fff', strokeWidth: 2, fill: '#A78BFA' }}
            dot={{ r: 5, fill: '#A78BFA', stroke: '#fff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
