import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function AssignmentSpeedometer({ data }) {
  // data: [{ name: 'Submitted', value: 40, color: '#00C2C7' }, { name: 'Pending', value: 10, color: '#FFC436' }, { name: 'Overdue', value: 5, color: '#FF6B6B' }]
  return (
    <div className="w-full h-full min-h-[220px] flex flex-col relative pt-4">
      <div className="flex-1 min-h-[220px]">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="70%"
              startAngle={180}
              endAngle={0}
              innerRadius="70%"
              outerRadius="100%"
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 pointer-events-none">
        <span className="text-3xl font-serif font-black text-[#112B3C]">{data[0].value}/{data.reduce((a,b)=>a+b.value,0)}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Submitted</span>
      </div>
    </div>
  );
}
