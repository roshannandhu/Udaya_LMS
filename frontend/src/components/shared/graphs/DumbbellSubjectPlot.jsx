import React from 'react';

const trendArrow = (dir) => {
  if (dir === 'up')   return { symbol: '↑', cls: 'text-emerald-600' };
  if (dir === 'down') return { symbol: '↓', cls: 'text-rose-500' };
  return { symbol: '→', cls: 'text-slate-400' };
};

export default function DumbbellSubjectPlot({ data = [] }) {
  if (!data || data.length === 0) return <div className="text-sm text-slate-500 p-4 text-center">No subject data</div>;

  const hasTrend = data.some((d) => d.trendDir && d.trendDir !== 'flat');

  return (
    <div className="flex flex-col w-full h-full gap-4 pt-2">
      {data.map((item, i) => {
        const minVal = Math.min(item.student, item.classAvg);
        const maxVal = Math.max(item.student, item.classAvg);
        const diff = maxVal - minVal;
        const arrow = trendArrow(item.trendDir || 'flat');

        return (
          <div key={i} className={`grid items-center w-full text-sm font-bold text-slate-800 gap-2 ${hasTrend ? 'grid-cols-[80px_1fr_44px_22px] md:grid-cols-[110px_1fr_52px_24px]' : 'grid-cols-[88px_1fr_44px] md:grid-cols-[120px_1fr_52px]'}`}>
            <div className="min-w-0 leading-tight break-words text-xs md:text-sm">{item.subject}</div>
            <div className="flex-1 relative h-8 rounded-full bg-slate-100 flex items-center overflow-hidden px-1">
              <div
                className="absolute h-2 rounded-full top-1/2 -translate-y-1/2"
                style={{
                  left: `${minVal}%`,
                  width: `${Math.max(diff, 2)}%`,
                  backgroundColor: item.student >= item.classAvg ? '#BFDBFE' : '#FECACA',
                }}
              />
              <div
                className="absolute w-4 h-4 bg-amber-500 rounded-full top-1/2 -translate-y-1/2 shadow-sm border-2 border-white"
                style={{ left: `calc(${item.classAvg}% - 6px)` }}
                title={`Class: ${item.classAvg}%`}
              />
              <div
                className="absolute w-5 h-5 bg-blue-600 rounded-full top-1/2 -translate-y-1/2 shadow-md border-2 border-white z-10"
                style={{ left: `calc(${item.student}% - 8px)` }}
                title={`Student: ${item.student}%`}
              />
            </div>
            <div className="text-right text-blue-700 tabular-nums text-xs md:text-sm">{item.student}%</div>
            {hasTrend && (
              <div className={`text-center text-base font-black ${arrow.cls}`} title={`Trend: ${item.trendDir || 'flat'}`}>
                {arrow.symbol}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap justify-center gap-5 mt-3 text-xs font-bold text-slate-500">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-600" /> Student</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-500" /> Class avg</div>
        {hasTrend && (
          <>
            <div className="flex items-center gap-1"><span className="text-emerald-600 font-black">↑</span> Improving</div>
            <div className="flex items-center gap-1"><span className="text-rose-500 font-black">↓</span> Declining</div>
          </>
        )}
      </div>
    </div>
  );
}
