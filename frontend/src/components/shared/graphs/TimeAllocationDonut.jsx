import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

export default function TimeAllocationDonut({ data }) {
  // data: [{ name: 'Videos', value: 400, color: '#00C2C7' }]
  return (
    <div className="w-full h-full min-h-[260px] flex flex-col relative">
      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="60%"
              outerRadius="85%"
              paddingAngle={4}
              dataKey="value"
              stroke="none"
              isAnimationActive={true}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} style={{ filter: 'drop-shadow(0px 4px 6px rgba(0,0,0,0.1))' }} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 'bold' }} 
              itemStyle={{ color: '#112B3C' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-4">
        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Mins</span>
        <span className="text-2xl font-serif font-black text-[#112B3C]">
          {data.reduce((a,b) => a + b.value, 0)}
        </span>
      </div>
      <div className="flex flex-wrap justify-center gap-3 mt-4 text-[9px] font-bold uppercase tracking-wider text-gray-500">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: d.color }}></div>
            {d.name}
          </div>
        ))}
      </div>
    </div>
  );
}
