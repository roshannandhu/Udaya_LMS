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
    if (count === 0) return 'bg-gray-100';
    if (count < 3) return 'bg-cyan-200';
    if (count < 6) return 'bg-cyan-400';
    return 'bg-[#00C2C7] shadow-sm';
  };

  return (
    <div className="w-full flex flex-col pt-4">
      <div className="flex justify-between text-[10px] text-gray-400 font-bold mb-2 uppercase">
        <span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span>
      </div>
      <div className="flex gap-2">
        {grid.map((week, w) => (
          <div key={w} className="flex flex-col gap-2 flex-1">
            {week.map((count, d) => (
              <div 
                key={d} 
                className={`w-full aspect-square rounded-md transition-all hover:scale-110 cursor-pointer ${getColor(count)}`}
                title={`Activity count: ${count}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex justify-end items-center gap-2 mt-4 text-[10px] text-gray-400 font-bold">
        <span>Less</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded bg-gray-100"></div>
          <div className="w-3 h-3 rounded bg-cyan-200"></div>
          <div className="w-3 h-3 rounded bg-cyan-400"></div>
          <div className="w-3 h-3 rounded bg-[#00C2C7]"></div>
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
