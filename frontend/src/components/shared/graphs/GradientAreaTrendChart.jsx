import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import EmptyChart from './EmptyChart';

export default function GradientAreaTrendChart({ data = [], classAverageLine = false }) {
  // data format: [{ name: 'Test 1', studentScore: 85, classScore: 72 }, ...]
  if (!data.length) {
    return <EmptyChart label="No test trend yet" height={280} />;
  }
  
  return (
    <div className="w-full h-full min-h-[280px] pt-3 pb-2">
      <ResponsiveContainer width="100%" height={280}>
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
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
            itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
          />
          {classAverageLine && (
             <Area type="monotone" dataKey="classScore" stroke="#D97706" strokeWidth={2.5} strokeDasharray="5 5" fill="none" name="Class Avg" />
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
            activeDot={{ r: 6, stroke: '#fff', strokeWidth: 3, fill: '#2563EB' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
