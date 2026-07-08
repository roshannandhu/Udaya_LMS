import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

export default function QuizBubbleScatter({ data }) {
  // data: [{ name: 'Test 1', dateIndex: 1, score: 85, time: 20 }, ...]
  return (
    <div className="w-full h-full min-h-[260px] pt-4 pb-2 pr-4">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
          <XAxis type="number" dataKey="dateIndex" name="Quiz" tick={false} axisLine={false} tickLine={false} />
          <YAxis type="number" dataKey="score" name="Score" domain={[0, 100]} tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <ZAxis type="number" dataKey="time" range={[60, 400]} name="Speed" />
          <Tooltip cursor={{strokeDasharray: '3 3'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
          <Scatter name="Quizzes" data={data}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.score >= 80 ? '#00C2C7' : entry.score >= 50 ? '#FFC436' : '#FF6B6B'} opacity={0.8} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
