import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function AssignmentSpeedometer({ data = [] }) {
  const safeData = data.length > 0 ? data : [{name:"Submitted",value:25,color:"#67E8F9"},{name:"Pending",value:3,color:"#FDE047"},{name:"Overdue",value:1,color:"#FCA5A5"}];
  // data: [{ name: 'Submitted', value: 40, color: '#67E8F9' }, { name: 'Pending', value: 10, color: '#FDE047' }, { name: 'Overdue', value: 5, color: '#FCA5A5' }]
  return (
    <div className="w-full h-full min-h-[280px] flex flex-col relative pt-4">
      <div className="flex-1 min-h-[280px]">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={safeData}
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
              {safeData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 pointer-events-none">
        <span className="text-3xl font-serif font-black text-[#112B3C]">{safeData[0]?.value ?? 0}/{safeData.reduce((a,b)=>a+b.value,0)}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Submitted</span>
      </div>
    </div>
  );
}
