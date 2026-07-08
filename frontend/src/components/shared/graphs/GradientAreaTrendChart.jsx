import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function GradientAreaTrendChart({ data, classAverageLine = false }) {
  // data format: [{ name: 'Test 1', studentScore: 85, classScore: 72 }, ...]
  
  return (
    <div className="w-full h-full min-h-[260px] pt-4 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
          <defs>
            <linearGradient id="colorStudent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00C2C7" stopOpacity={0.6}/>
              <stop offset="95%" stopColor="#00C2C7" stopOpacity={0}/>
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" opacity={0.5} />
          <XAxis dataKey="name" tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <YAxis tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} domain={[0, 100]} />
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
            itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
          />
          {classAverageLine && (
             <Area type="monotone" dataKey="classScore" stroke="#A0AAB5" strokeWidth={2} strokeDasharray="4 4" fill="none" name="Class Avg" />
          )}
          <Area 
            type="monotone" 
            dataKey="studentScore" 
            stroke="#00C2C7" 
            strokeWidth={4} 
            fillOpacity={1} 
            fill="url(#colorStudent)" 
            name="Student" 
            filter="url(#glow)"
            activeDot={{ r: 6, stroke: '#fff', strokeWidth: 3, fill: '#00C2C7' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
