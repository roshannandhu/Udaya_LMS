import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export default function SubjectProgressionLineChart({ data }) {
  // data: [ { testName: 'T1', Math: 85, Science: 90, English: 70 }, ... ]
  const COLORS = ['#00C2C7', '#7059FF', '#FFC436', '#FF6B6B', '#2DD4BF'];
  
  const [selectedSubject, setSelectedSubject] = useState('All');
  
  // Extract subjects dynamically
  const allSubjects = data && data.length > 0 ? Object.keys(data[0]).filter(k => k !== 'testName') : [];
  const subjectsToRender = selectedSubject === 'All' ? allSubjects : [selectedSubject];

  return (
    <div className="w-full h-full min-h-[220px] pt-4 pb-2 pr-4 relative">
      <div className="absolute top-2 right-4 z-10">
        <select 
          className="text-[10px] uppercase font-black tracking-widest text-[#112B3C] bg-white/60 border border-white/80 backdrop-blur-md rounded-lg px-3 py-1.5 shadow-sm outline-none cursor-pointer hover:bg-white transition-colors"
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
        >
          <option value="All">All Subjects</option>
          {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
          <XAxis dataKey="testName" tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{fontSize: 9, fill: '#888', fontWeight: 700}} axisLine={false} tickLine={false} />
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
            itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
            labelStyle={{ color: '#888', marginBottom: '4px', fontWeight: 'bold' }}
          />
          {subjectsToRender.map((subj, index) => (
            <Line 
              key={subj}
              type="monotone" 
              dataKey={subj} 
              stroke={COLORS[index % COLORS.length]} 
              strokeWidth={3}
              dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
              activeDot={{ r: 6 }}
            />
          ))}
          <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} iconType="circle" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
