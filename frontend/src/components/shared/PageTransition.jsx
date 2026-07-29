import React from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

export default function PageTransition({ children }) {
  const location = useLocation();

  // Opacity-only fade — deliberately NO transform / no `will-change: transform`.
  // A transform (or will-change:transform) on this wrapper makes it the containing
  // block for every `position: fixed` descendant, so all inline modals/popups
  // (shared Modal, profile edit, AI Mentor, sheets…) anchor to THIS box instead of
  // the viewport and render off-screen — i.e. "popup doesn't open". Keeping this
  // transform-free lets fixed popups anchor to the screen as intended.
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        style={{ willChange: 'opacity' }}
        className="flex-1 flex flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
