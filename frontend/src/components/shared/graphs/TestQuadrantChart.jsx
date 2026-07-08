import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

export default function TestQuadrantChart({ data }) {
  // data: [{ name: 'Test 1', score: 85, time: 20 }, ...]
  return (
    <div className="w-full h-full min-h-[280px] pt-4 pb-2 pr-4">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          {/* Reversed XAxis so Fast is on the right */}
          <XAxis type="number" dataKey="time" name="Time (mins)" reversed tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <YAxis type="number" dataKey="score" name="Score" domain={[0, 100]} tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <Tooltip cursor={{strokeDasharray: '3 3'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
          
          <ReferenceLine y={50} stroke="#A0AAB5" strokeOpacity={0.5} />
          <ReferenceLine x={45} stroke="#A0AAB5" strokeOpacity={0.5} />
          
          <Scatter name="Tests" data={data}>
            {data.map((entry, index) => {
              // Color based on quadrant
              let color = '#FF6B6B'; // Slow & Low (bottom left)
              if (entry.score >= 50 && entry.time <= 45) color = '#00C2C7'; // Fast & High
              else if (entry.score >= 50 && entry.time > 45) color = '#7059FF'; // Slow & High
              else if (entry.score < 50 && entry.time <= 45) color = '#FFC436'; // Fast & Low
              return <Cell key={`cell-${index}`} fill={color} />;
            })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-full h-full relative opacity-20 text-[9px] font-bold uppercase tracking-wider">
          <span className="absolute top-4 left-6 text-[#7059FF]">Methodical</span>
          <span className="absolute top-4 right-6 text-[#00C2C7]">Mastered</span>
          <span className="absolute bottom-6 left-6 text-[#FF6B6B]">Struggling</span>
          <span className="absolute bottom-6 right-6 text-[#FFC436]">Rushing</span>
        </div>
      </div>
    </div>
  );
}
