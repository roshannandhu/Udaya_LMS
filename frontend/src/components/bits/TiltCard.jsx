import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

const canHover = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;

// Gentle 3D tilt following the pointer (ReactBits "Tilted Card"), capped at a
// few degrees so pastel cards feel like paper lifting, not a gimmick.
// Touch devices / reduced motion render children flat.
export default function TiltCard({ children, className = '', max = 6, ...rest }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 250, damping: 22 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 250, damping: 22 });

  // Reduced motion / touch → render flat, but still forward motion props (e.g.
  // `variants`) so the card keeps its place in a parent stagger sequence.
  if (reduce || !canHover()) return <motion.div className={className} {...rest}>{children}</motion.div>;

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onMouseLeave={() => { px.set(0.5); py.set(0.5); }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
