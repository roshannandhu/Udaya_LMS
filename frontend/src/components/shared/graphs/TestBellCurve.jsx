import React from 'react';
import { AreaChart, Area, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import EmptyChart from './EmptyChart';

export default function TestBellCurve({ data = [], studentScore }) {
  // data: [{ scoreBin: 40, count: 2 }, { scoreBin: 50, count: 5 }, ...]
  if (!data.length) {
    return <EmptyChart label="No class distribution yet" height={220} />;
  }

  return (
    <div className="w-full h-full min-h-[220px] pt-4 pb-2 pr-4">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 30 }}>
          <defs>
            <linearGradient id="bellGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#A78BFA" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#A78BFA" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="scoreBin" tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <YAxis hide={true} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
          <Area type="monotone" dataKey="count" stroke="#A78BFA" strokeWidth={3} fillOpacity={1} fill="url(#bellGrad)" />
          <ReferenceLine 
            x={studentScore} 
            stroke="#67E8F9" 
            strokeWidth={3} 
            strokeDasharray="4 4"
            label={{ position: 'top', value: 'You', fill: '#67E8F9', fontSize: 12, fontWeight: 'bold' }} 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
