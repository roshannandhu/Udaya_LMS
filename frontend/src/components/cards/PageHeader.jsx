import React from 'react';
import { motion } from 'framer-motion';
import { fadeUp } from '../../lib/motion';

/**
 * Large serif page title with optional emoji, subtitle and trailing action.
 * Used inside pages (the global chrome now lives in TopNav).
 */
export default function PageHeader({ title, emoji, subtitle, action, className = '' }) {
  return (
    <motion.div
      variants={fadeUp} initial="hidden" animate="show"
      className={`flex items-end justify-between gap-3 mb-6 ${className}`}
    >
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2"
          style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
          <span className="truncate">{title}</span>
          {emoji && <span className="flex-shrink-0">{emoji}</span>}
        </h1>
        {subtitle && <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </motion.div>
  );
}
