import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function OverlappingAreaChart({ data }) {
  // data: [{ day: 'Mon', videos: 40, tests: 20, notes: 30 }]
  return (
    <div className="w-full h-full h-[260px] pt-4 pb-2 pr-4">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
          <defs>
            <linearGradient id="colorVid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00C2C7" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#00C2C7" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorTest" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7059FF" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#7059FF" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorNotes" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FFC436" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#FFC436" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="day" tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <YAxis tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
          <Area type="monotone" dataKey="notes" stroke="#FFC436" fillOpacity={1} fill="url(#colorNotes)" strokeWidth={2} />
          <Area type="monotone" dataKey="videos" stroke="#00C2C7" fillOpacity={1} fill="url(#colorVid)" strokeWidth={2} />
          <Area type="monotone" dataKey="tests" stroke="#7059FF" fillOpacity={1} fill="url(#colorTest)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
