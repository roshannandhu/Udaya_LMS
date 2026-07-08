import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export default function SubjectProgressionLineChart({ data }) {
  // data: [ { testName: 'T1', Math: 85, Science: 90, English: 70 }, ... ]
  const COLORS = ['#2563EB', '#7C3AED', '#D97706', '#059669', '#E11D48'];
  
  const [selectedSubject, setSelectedSubject] = useState('All');
  
  // Extract subjects dynamically
  const allSubjects = data && data.length > 0 ? Object.keys(data[0]).filter(k => k !== 'testName') : [];
  const subjectsToRender = selectedSubject === 'All' ? allSubjects : [selectedSubject];

  return (
    <div className="w-full h-full min-h-[280px] pt-12 pb-2 relative">
      <div className="absolute top-0 right-0 z-10">
        <select 
          className="min-h-10 text-xs font-extrabold text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm outline-none cursor-pointer hover:bg-blue-50 transition-colors"
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
        >
          <option value="All">All Subjects</option>
          {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 20, right: 34, left: 4, bottom: 42 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#CBD5E1" />
          <XAxis dataKey="testName" interval="preserveStartEnd" tick={{fontSize: 11, fill: '#475569', fontWeight: 700}} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} width={34} tick={{fontSize: 11, fill: '#475569', fontWeight: 700}} axisLine={false} tickLine={false} />
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
          <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: 8 }} iconType="circle" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
