import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { springCard } from '../../lib/motion';

// Unified tap/hover feedback for clickable cards: springy press on touch,
// small lift on hover. Renders a motion element of the given tag.
export default function Pressable({ children, className = '', as = 'div', lift = true, ...rest }) {
  const reduce = useReducedMotion();
  const Tag = motion[as] || motion.div;
  if (reduce) {
    const Plain = as;
    return <Plain className={className} {...rest}>{children}</Plain>;
  }
  return (
    <Tag
      className={className}
      whileHover={lift ? { y: -3, scale: 1.01 } : undefined}
      whileTap={{ scale: 0.97 }}
      transition={springCard}
      {...rest}
    >
      {children}
    </Tag>
  );
}
