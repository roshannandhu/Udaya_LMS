import React from 'react';

export default function AttendanceCalendar({ month, daysData }) {
  // daysData: [{ date: '2026-07-01', status: 'present'|'absent'|'late'|'holiday', info: 'Maths class' }]
  const days = ['S','M','T','W','T','F','S'];
  
  const getStatusColor = (status) => {
    switch(status) {
      case 'present': return 'bg-[#3B82F6] text-white shadow-sm';
      case 'absent': return 'bg-[#1E40AF] text-white shadow-sm';
      case 'late': return 'bg-[#93C5FD] text-white shadow-sm';
      case 'holiday': return 'bg-gray-200 text-gray-500';
      default: return 'text-[#112B3C] hover:bg-gray-100';
    }
  };

  return (
    <div className="flex flex-col w-full">
      <div className="grid grid-cols-7 gap-1 text-center w-full text-[9px] text-gray-400 font-bold uppercase mb-2">
        {days.map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center w-full text-[11px] font-bold">
        {daysData.map((d, i) => (
          <div key={i} className="flex justify-center items-center relative group cursor-default">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full transition-all ${getStatusColor(d.status)}`}>
              {d.dayNumber || (i % 30) + 1}
            </div>
            {d.info && (
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-10 pointer-events-none shadow-lg">
                {d.info}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
