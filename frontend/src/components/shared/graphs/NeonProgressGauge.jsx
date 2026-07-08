import React from 'react';

export default function NeonProgressGauge({ percentage, label, color = '#FDE047' }) {
  const pct = Math.max(0, Math.min(100, Number(percentage) || 0));
  const size = 120;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (pct / 100) * circumference;
  
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90 w-full h-full drop-shadow-2xl">
          <defs>
            <filter id={`neon-glow-${color.replace('#','')}`}>
              <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          {/* Dark inner track */}
          <circle 
            cx={size/2} cy={size/2} r={radius} 
            stroke="#CBD5E1" strokeWidth={strokeWidth} fill="#F8FAFC" 
          />
          {/* Glowing bright ring */}
          <circle 
            cx={size/2} cy={size/2} r={radius} 
            stroke={color} strokeWidth={strokeWidth} fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            filter={`url(#neon-glow-${color.replace('#','')})`}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-slate-950 tabular-nums">{Math.round(pct)}%</span>
        </div>
      </div>
      <span className="mt-4 font-bold text-xs text-slate-500">{label}</span>
    </div>
  );
}
