import React from 'react';

export default function ActivityStepper({ data }) {
  // data: [{ time: '10:00 AM', title: 'Watched Math Video', color: 'bg-cyan-500' }]
  return (
    <div className="w-full flex flex-col gap-4 py-4 px-2 max-h-[300px] overflow-y-auto custom-scrollbar">
      {data.map((item, i) => (
        <div key={i} className="flex items-start gap-4 relative">
          {i !== data.length - 1 && (
            <div className="absolute top-6 left-2.5 bottom-[-16px] w-0.5 bg-gray-100" />
          )}
          <div className={`w-5 h-5 rounded-full mt-0.5 flex-shrink-0 shadow-sm border-2 border-white ${item.color} z-10`} />
          <div className="flex flex-col">
            <span className="text-[12px] font-bold text-[#112B3C]">{item.title}</span>
            <span className="text-[10px] font-bold text-gray-400">{item.time}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
