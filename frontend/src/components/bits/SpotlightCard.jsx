import React, { useCallback, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

const canHover = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;

// Pointer-tracked radial sheen over a card — the ReactBits "Spotlight Card"
// effect, tuned soft so it reads as light moving across pastel paper.
// Touch devices and reduced-motion users get the children untouched.
export default function SpotlightCard({ children, className = '', color = 'rgba(255,255,255,0.65)', size = 320 }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const enabled = !reduce && canHover();

  const onMove = useCallback((e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  }, []);

  if (!enabled) return <div className={`relative ${className}`}>{children}</div>;

  return (
    <div
      ref={ref}
      className={`relative ${className}`}
      onMouseMove={onMove}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{
          opacity: pos ? 1 : 0,
          background: pos
            ? `radial-gradient(${size}px circle at ${pos.x}px ${pos.y}px, ${color}, transparent 65%)`
            : 'none',
          mixBlendMode: 'soft-light',
        }}
      />
    </div>
  );
}
