import React from 'react';

export default function ActivityStepper({ data = [] }) {
  // data: [{ time: '10:00 AM', title: 'Watched Math Video', color: 'bg-cyan-500' }]
  if (!data || data.length === 0) return <div className="text-sm text-slate-500 p-4 text-center">No recent activity</div>;
  return (
    <div className="w-full flex flex-col gap-4 py-2 px-1 max-h-[340px] overflow-y-auto custom-scrollbar">
      {data.map((item, i) => (
        <div key={i} className="flex items-start gap-4 relative">
          {i !== data.length - 1 && (
            <div className="absolute top-7 left-3 bottom-[-16px] w-0.5 bg-slate-200" />
          )}
          <div className={`w-6 h-6 rounded-full mt-0.5 flex-shrink-0 shadow-sm border-4 border-white ${item.color} z-10`} />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-slate-900 leading-snug">{item.title}</span>
            <span className="text-xs font-bold text-slate-500 mt-0.5">{item.time}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
