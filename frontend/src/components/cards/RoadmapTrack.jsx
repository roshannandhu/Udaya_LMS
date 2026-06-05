import React from 'react';
import { motion } from 'framer-motion';
import { staggerChildren } from '../../lib/motion';

const DOT = {
  completed: '#0F7B6C',
  active: '#AD1A72',
  upcoming: '#CBA94B',
  locked: '#B5B5B2',
};

export default function RoadmapTrack({ children, className = '' }) {
  const items = React.Children.toArray(children);
  
  return (
    <motion.div
      variants={staggerChildren}
      initial="hidden"
      animate="show"
      className={`relative w-full max-w-4xl mx-auto py-8 ${className}`}
    >
      {/* Dotted spine (left on mobile, center on large screens) */}
      <div 
        className="absolute top-12 bottom-12 w-0 border-l-[4px] border-dashed border-neutral-200 z-0" 
        style={{ left: '24px' }}
        aria-hidden 
      />
      {/* We use a media query trick via CSS or just raw Tailwind. 
          Actually, let's use tailwind classes for positioning. */}
      <style>{`
        @media (min-width: 1024px) {
          .spine-line { left: 50% !important; transform: translateX(-50%); }
          .spine-dot { left: 50% !important; transform: translateX(-50%); }
        }
      `}</style>
      <div className="absolute top-12 bottom-12 w-0 border-l-[4px] border-dashed border-neutral-200/60 z-0 spine-line" style={{ left: '24px' }} aria-hidden />

      <div className="space-y-10 lg:space-y-16">
        {items.map((child, i) => {
          const status = child?.props?.status || 'upcoming';
          const isLeft = i % 2 === 0;

          return (
            <div key={child.key ?? i} className={`relative flex w-full flex-col lg:flex-row ${isLeft ? 'lg:justify-start' : 'lg:justify-end'}`}>
              
              {/* Status Dot */}
              <div 
                className="absolute w-5 h-5 rounded-full border-4 border-white shadow-sm z-10 spine-dot"
                style={{ background: DOT[status] || DOT.upcoming, left: '16px', top: '24px' }} 
              />
              
              {/* Card Container */}
              <div className={`w-full lg:w-5/12 pl-16 pr-4 lg:px-0 ${isLeft ? 'lg:pr-10' : 'lg:pl-10'}`}>
                {child}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
