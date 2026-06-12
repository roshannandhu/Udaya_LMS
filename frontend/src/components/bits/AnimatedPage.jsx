import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { staggerChildren, fadeUp } from '../../lib/motion';

// Page-entrance wrapper: children marked with <Item> rise in with a soft
// stagger. Wrap a page's main content once instead of repeating the
// staggerChildren boilerplate on every page.
export default function AnimatedPage({ children, className = '' }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={staggerChildren} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

// A staggered child of AnimatedPage (or any staggerChildren container).
export function Item({ children, className = '', as = 'div', ...rest }) {
  const reduce = useReducedMotion();
  const Tag = reduce ? as : motion[as] || motion.div;
  if (reduce) {
    const Plain = as;
    return <Plain className={className} {...rest}>{children}</Plain>;
  }
  return (
    <Tag className={className} variants={fadeUp} {...rest}>
      {children}
    </Tag>
  );
}
