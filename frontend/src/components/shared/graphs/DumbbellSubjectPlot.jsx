import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// Custom shape to draw the connecting line between class average and student score
const DumbbellShape = (props) => {
  const { cx, cy, payload } = props;
  // payload comes from scatter data. We need a trick: we'll render standard HTML elements 
  // outside recharts for a dumbbell plot because recharts doesn't natively support connecting two values easily.
  return null; 
};

export default function DumbbellSubjectPlot({ data = [] }) {
  if (!data || data.length === 0) return <div className="text-xs text-gray-400 p-4 text-center">No subject data</div>;
  // Alternative custom implementation for mobile
  return (
    <div className="flex flex-col w-full h-full gap-4 pt-4">
      {data.map((item, i) => {
        const minVal = Math.min(item.student, item.classAvg);
        const maxVal = Math.max(item.student, item.classAvg);
        const diff = maxVal - minVal;
        
        return (
          <div key={i} className="flex items-center w-full text-xs font-bold text-[#112B3C]">
            <div className="w-16 truncate">{item.subject}</div>
            <div className="flex-1 relative h-6 mx-2 border-b border-gray-100 flex items-center">
              {/* Connecting line */}
              <div 
                className="absolute h-1 bg-gray-200 rounded-full top-1/2 -translate-y-1/2" 
                style={{ left: `${minVal}%`, width: `${diff}%` }}
              />
              {/* Class Avg Dot */}
              <div 
                className="absolute w-3 h-3 bg-[#FDE047] rounded-full top-1/2 -translate-y-1/2 shadow-sm border-2 border-white"
                style={{ left: `calc(${item.classAvg}% - 6px)` }}
                title={`Class: ${item.classAvg}`}
              />
              {/* Student Dot */}
              <div 
                className="absolute w-4 h-4 bg-[#67E8F9] rounded-full top-1/2 -translate-y-1/2 shadow-md border-2 border-white z-10"
                style={{ left: `calc(${item.student}% - 8px)` }}
                title={`Student: ${item.student}`}
              />
            </div>
            <div className="w-8 text-right text-[#67E8F9]">{item.student}</div>
          </div>
        );
      })}
      <div className="flex justify-center gap-6 mt-4 text-[9px] font-bold uppercase tracking-wider text-gray-500">
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#67E8F9]"></div> Student</div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#FDE047]"></div> Class Avg</div>
      </div>
    </div>
  );
}
