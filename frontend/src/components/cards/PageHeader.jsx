import React from 'react';
import { motion } from 'framer-motion';
import { fadeUp } from '../../lib/motion';
import SubjectIcon from '../shared/SubjectIcon';

/**
 * Large serif page title with optional subject/standard icon, subtitle and trailing action.
 * `icon` is a stored icon value (lucide key or legacy emoji char) resolved via SubjectIcon.
 * Used inside pages (the global chrome now lives in TopNav).
 */
export default function PageHeader({ title, icon, subtitle, action, className = '' }) {
  return (
    <motion.div
      variants={fadeUp} initial="hidden" animate="show"
      className={`flex items-end justify-between gap-3 mb-6 ${className}`}
    >
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2"
          style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
          <span className="truncate">{title}</span>
          {icon && <SubjectIcon value={icon} size={24} className="flex-shrink-0 text-neutral-700" />}
        </h1>
        {subtitle && <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </motion.div>
  );
}
