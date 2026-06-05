import React from 'react';
import { motion } from 'framer-motion';
import { PASTEL } from './pastel';
import { springCard } from '../../lib/motion';

/**
 * Large rounded surface. The base building block of the new design system.
 *
 * Props:
 *  - color: pastel name ('mint'|'pink'|...) → pastel fill. Omit for white.
 *  - interactive: adds hover-lift + tap motion (use for clickable cards).
 *  - as: 'div' | 'button'  (default 'div')
 *  - padded: include default padding (default true)
 */
export default function Card({
  color,
  interactive = false,
  as = 'div',
  padded = true,
  className = '',
  children,
  ...rest
}) {
  const pastel = color ? PASTEL[color] : null;
  const base = pastel
    ? `${pastel.bg} border border-black/5`
    : 'bg-white border border-[#EFEDEA] shadow-soft';
  const Comp = motion[as] || motion.div;

  return (
    <Comp
      {...(interactive ? { whileHover: { y: -3, scale: 1.01 }, whileTap: { scale: 0.99 }, transition: springCard } : {})}
      className={`rounded-card ${padded ? 'p-5' : ''} ${base} ${interactive ? 'cursor-pointer' : ''} text-left ${className}`}
      {...rest}
    >
      {children}
    </Comp>
  );
}
