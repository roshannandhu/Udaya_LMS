import React from 'react';

export default function EngagementHeatmap({ data }) {
  // data format: [{ date: '2026-07-01', count: 5 }, ...]
  // This is a simplified GitHub-style grid representation
  const weeks = 4;
  const days = 7;
  
  // Create dummy grid if data isn't perfectly sized
  const grid = Array(weeks).fill().map(() => Array(days).fill(0));
  
  data.forEach((d, i) => {
    const w = Math.floor(i / 7) % weeks;
    const dy = i % 7;
    grid[w][dy] = d.count;
  });

  const getColor = (count) => {
    if (count === 0) return 'bg-slate-100 border-slate-200';
    if (count < 3) return 'bg-blue-100 border-blue-200';
    if (count < 6) return 'bg-blue-300 border-blue-300';
    return 'bg-blue-600 border-blue-600 shadow-sm';
  };

  return (
    <div className="w-full flex flex-col pt-2">
      <div className="flex justify-between text-xs text-slate-500 font-bold mb-3">
        <span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span>
      </div>
      <div className="flex justify-center gap-3 md:gap-4">
        {grid.map((week, w) => (
          <div key={w} className="flex flex-col gap-2.5">
            {week.map((count, d) => (
              <div 
                key={d} 
                className={`w-9 h-9 md:w-12 md:h-12 rounded-xl border transition-all hover:scale-105 cursor-pointer ${getColor(count)}`}
                title={`Activity count: ${count}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex justify-end items-center gap-2 mt-5 text-xs text-slate-500 font-bold">
        <span>Less</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded bg-slate-100 border border-slate-200"></div>
          <div className="w-3 h-3 rounded bg-blue-100 border border-blue-200"></div>
          <div className="w-3 h-3 rounded bg-blue-300"></div>
          <div className="w-3 h-3 rounded bg-blue-600"></div>
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
