import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Scroll reveal for sections on long pages: blur + fade + rise the first time
// the block scrolls into view (ReactBits "Fade Content"/"Blur Text" feel).
export default function Reveal({ children, className = '', delay = 0, y = 18 }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
