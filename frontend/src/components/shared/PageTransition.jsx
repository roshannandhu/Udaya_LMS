import React from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * PageTransition
 * ─────────────
 * Wraps <Outlet /> (or children) and plays a smooth, premium scale-fade-up
 * on every route change.
 * Uses Framer Motion's AnimatePresence to ensure the old page fades out
 * before the new page enters, avoiding layout jumps or overlapped scrollbars.
 */
export default function PageTransition({ children }) {
  const location = useLocation();

  return (
    // mode="wait" ensures the exit animation finishes before the enter animation starts
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -10 }}
        transition={{ 
          duration: 0.25, 
          ease: [0.22, 1, 0.36, 1] // Matches cubic-bezier for a snappy app feel
        }}
        className="flex-1 flex flex-col min-h-0 min-h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
