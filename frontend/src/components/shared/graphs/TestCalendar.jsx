import React from 'react';

export default function TestCalendar({ month, daysData }) {
  // Similar to Attendance, but marks tests with badges
  const days = ['S','M','T','W','T','F','S'];
  
  return (
    <div className="flex flex-col w-full">
      <div className="grid grid-cols-7 gap-1 text-center w-full text-[9px] text-gray-400 font-bold uppercase mb-2">
        {days.map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-3 gap-x-1 text-center w-full text-[11px] font-bold text-[#112B3C]">
        {daysData.map((d, i) => (
          <div key={i} className="flex justify-center items-center relative group">
            <div className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all ${d.hasTest ? 'bg-purple-50 text-[#7059FF] ring-1 ring-[#7059FF]/30' : 'hover:bg-gray-100'}`}>
              {d.dayNumber || (i % 30) + 1}
            </div>
            {d.hasTest && d.score && (
              <span className="absolute -bottom-2 -right-1 bg-[#7059FF] text-white text-[7px] px-1 rounded-sm shadow-sm">
                {d.score}%
              </span>
            )}
            {d.testName && (
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#112B3C] text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-10 pointer-events-none shadow-lg">
                {d.testName} {d.score ? `(${d.score}%)` : '(Upcoming)'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
