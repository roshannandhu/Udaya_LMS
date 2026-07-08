import React from 'react';

export default function LiquidFillGauge({ percentage, size = 160 }) {
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  
  // Calculate wave offset based on percentage
  // At 0%, water is at bottom. At 100%, water is at top.
  const waterHeight = (percentage / 100) * (r * 2);
  const yOffset = cy + r - waterHeight;
  
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-lg">
        <defs>
          <clipPath id={`circle-clip-${size}`}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
          <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00E5FF"/>
            <stop offset="100%" stopColor="#0083B0"/>
          </linearGradient>
        </defs>
        
        {/* Background track */}
        <circle cx={cx} cy={cy} r={r} fill="#F4F7F6" stroke="#E5E7EB" strokeWidth="2" />
        
        {/* Animated Water */}
        <g clipPath={`url(#circle-clip-${size})`}>
          <path 
            d={`M 0,${yOffset} Q ${size/4},${yOffset-15} ${size/2},${yOffset} T ${size},${yOffset} L ${size},${size} L 0,${size} Z`}
            fill="url(#waterGrad)"
            opacity="0.8"
            className="animate-[wave_3s_ease-in-out_infinite_alternate]"
          />
          <path 
            d={`M 0,${yOffset+5} Q ${size/4},${yOffset+20} ${size/2},${yOffset+5} T ${size},${yOffset+5} L ${size},${size} L 0,${size} Z`}
            fill="url(#waterGrad)"
            opacity="0.5"
            className="animate-[wave_4s_ease-in-out_infinite_alternate-reverse]"
          />
        </g>
        
        {/* Outer glowing ring */}
        <circle cx={cx} cy={cy} r={r+6} fill="none" stroke="#00C2C7" strokeWidth="4" strokeOpacity="0.2" />
      </svg>
      
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none drop-shadow-md">
        <span className="text-4xl font-serif font-black text-[#112B3C] mix-blend-overlay">{Math.round(percentage)}%</span>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes wave {
          0% { transform: translateX(-5%); }
          100% { transform: translateX(5%); }
        }
      `}} />
    </div>
  );
}
