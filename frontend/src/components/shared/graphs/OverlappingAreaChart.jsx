import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function OverlappingAreaChart({ data }) {
  // data: [{ day: 'Mon', videos: 40, tests: 20, notes: 30 }]
  return (
    <div className="w-full h-full min-h-[220px] pt-4 pb-2 pr-4">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 30 }}>
          <defs>
            <linearGradient id="colorVid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorTest" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorNotes" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#93C5FD" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#93C5FD" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="day" tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <YAxis tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
          <Area type="monotone" dataKey="notes" stroke="#93C5FD" fillOpacity={1} fill="url(#colorNotes)" strokeWidth={2} />
          <Area type="monotone" dataKey="videos" stroke="#3B82F6" fillOpacity={1} fill="url(#colorVid)" strokeWidth={2} />
          <Area type="monotone" dataKey="tests" stroke="#4F46E5" fillOpacity={1} fill="url(#colorTest)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
