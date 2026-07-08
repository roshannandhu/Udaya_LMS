import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';

export default function SubjectRadarChart({ data }) {
  // data format: [{ subject: 'Math', student: 90, classAvg: 75 }, ...]
  return (
    <div className="w-full h-full min-h-[280px] pt-2">
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart cx="50%" cy="50%" outerRadius="55%" data={data}>
          <PolarGrid stroke="#E5E7EB" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#112B3C', fontSize: 11, fontWeight: 'bold' }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
          />
          <Radar name="Class Avg" dataKey="classAvg" stroke="#93C5FD" strokeWidth={2} strokeDasharray="4 4" fill="transparent" />
          <Radar name="Student" dataKey="student" stroke="#4F46E5" strokeWidth={3} fill="#4F46E5" fillOpacity={0.4} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
