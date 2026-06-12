import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Shimmer sweep across text (ReactBits "Shiny Text"): a moving light band
// clipped to the glyphs. `base` is the resting text color; the band is a
// brighter tint that glides over it every few seconds.
export default function ShinyText({ children, className = '', base = '#1A1A19', shine = 'rgba(255,255,255,0.95)', duration = 3.2 }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className} style={{ color: base }}>{children}</span>;
  return (
    <motion.span
      className={className}
      style={{
        display: 'inline-block',
        backgroundImage: `linear-gradient(110deg, ${base} 42%, ${shine} 50%, ${base} 58%)`,
        backgroundSize: '220% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
      animate={{ backgroundPosition: ['120% 0%', '-120% 0%'] }}
      transition={{ duration, repeat: Infinity, repeatDelay: 1.6, ease: 'linear' }}
    >
      {children}
    </motion.span>
  );
}
