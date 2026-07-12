import React from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

export default function PageTransition({ children }) {
  const location = useLocation();

  // Broadcast pages use overflow-y:hidden to hold the chat layout, which clips
  // y-transforms. Use opacity-only animation there so the fade is always visible.
  const isBroadcast = location.pathname.includes('/broadcasts');
  const initial = isBroadcast ? { opacity: 0 } : { opacity: 0, y: 20 };
  const exit    = isBroadcast ? { opacity: 0 } : { opacity: 0, y: -8 };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={initial}
        animate={{ opacity: 1, y: 0 }}
        exit={exit}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        style={{ willChange: 'opacity, transform' }}
        className="flex-1 flex flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
