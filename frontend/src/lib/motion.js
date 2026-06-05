// Shared Framer Motion variants so pages animate consistently.
// Import these instead of writing ad-hoc transition values.

export const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

export const fade = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.25 } },
};

// Container that staggers its children's entrance.
export const staggerChildren = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } },
};

// Springy hover/tap for interactive cards.
export const springCard = {
  type: 'spring',
  stiffness: 320,
  damping: 26,
};

// Convenience props for an interactive card surface.
export const cardHover = {
  whileHover: { y: -3, scale: 1.01 },
  whileTap: { scale: 0.99 },
  transition: springCard,
};

// Scale-in for modals / sheets.
export const popIn = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.12 } },
};
