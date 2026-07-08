import React from 'react';

export default function NeonProgressGauge({ percentage, label, color = '#FFC436' }) {
  const size = 120;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  
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
            stroke="#E5E7EB" strokeWidth={strokeWidth} fill="#F9FAFB" 
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
          <span className="text-2xl font-serif font-black text-[#112B3C]">{Math.round(percentage)}%</span>
        </div>
      </div>
      <span className="mt-4 font-bold text-[10px] uppercase tracking-wider text-gray-400">{label}</span>
    </div>
  );
}
