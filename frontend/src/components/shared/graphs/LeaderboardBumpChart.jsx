import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function LeaderboardBumpChart({ data }) {
  // data: [{ week: 'W1', rank: 15 }, { week: 'W2', rank: 8 }, ...]
  return (
    <div className="w-full h-full min-h-[240px] pt-4 pb-2 pr-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
          <XAxis dataKey="week" tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          {/* YAxis reversed for rank (1 is highest) */}
          <YAxis reversed domain={[1, 'dataMax']} tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
          <Line 
            type="monotone" 
            dataKey="rank" 
            stroke="#7059FF" 
            strokeWidth={4} 
            activeDot={{ r: 8, stroke: '#fff', strokeWidth: 2, fill: '#7059FF' }}
            dot={{ r: 5, fill: '#7059FF', stroke: '#fff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
