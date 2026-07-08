import React from 'react';
export default function DumbbellSubjectPlot({ data = [] }) {
  if (!data || data.length === 0) return <div className="text-sm text-slate-500 p-4 text-center">No subject data</div>;
  return (
    <div className="flex flex-col w-full h-full gap-5 pt-2">
      {data.map((item, i) => {
        const minVal = Math.min(item.student, item.classAvg);
        const maxVal = Math.max(item.student, item.classAvg);
        const diff = maxVal - minVal;
        
        return (
          <div key={i} className="grid grid-cols-[88px_1fr_44px] md:grid-cols-[120px_1fr_52px] items-center w-full text-sm font-bold text-slate-800 gap-3">
            <div className="min-w-0 leading-tight break-words">{item.subject}</div>
            <div className="flex-1 relative h-8 rounded-full bg-slate-100 flex items-center overflow-hidden px-1">
              <div 
                className="absolute h-2 bg-blue-200 rounded-full top-1/2 -translate-y-1/2" 
                style={{ left: `${minVal}%`, width: `${diff}%` }}
              />
              <div 
                className="absolute w-4 h-4 bg-amber-500 rounded-full top-1/2 -translate-y-1/2 shadow-sm border-2 border-white"
                style={{ left: `calc(${item.classAvg}% - 6px)` }}
                title={`Class: ${item.classAvg}`}
              />
              <div 
                className="absolute w-5 h-5 bg-blue-600 rounded-full top-1/2 -translate-y-1/2 shadow-md border-2 border-white z-10"
                style={{ left: `calc(${item.student}% - 8px)` }}
                title={`Student: ${item.student}`}
              />
            </div>
            <div className="text-right text-blue-700 tabular-nums">{item.student}%</div>
          </div>
        );
      })}
      <div className="flex flex-wrap justify-center gap-5 mt-3 text-xs font-bold text-slate-500">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-600"></div> Student</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-500"></div> Class average</div>
      </div>
    </div>
  );
}
