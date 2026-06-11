import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useTransform, useSpring, useReducedMotion } from 'framer-motion';

const MotionLink = motion(Link);

const DOCK_SPRING = { mass: 0.1, stiffness: 150, damping: 12 };

/**
 * macOS-dock magnifying nav item (React Bits Dock mechanics).
 * `mouseX` is a shared MotionValue holding the pointer's clientX over the
 * dock container (Infinity when the pointer leaves). Each item magnifies
 * based on its distance from the pointer and springs back to `baseSize`.
 *
 * Renders a <button> by default, or a router <Link> when `to` is given.
 * Visual styling is fully owned by `className` — only width/height animate.
 */
export default function DockItem({
  mouseX,
  baseSize = 42,
  magnification = 60,
  distance = 110,
  className,
  to,
  onClick,
  title,
  children,
}) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();

  const dist = useTransform(mouseX, (val) => {
    if (val === Infinity) return Infinity;
    const r = ref.current?.getBoundingClientRect() ?? { x: 0, width: baseSize };
    return val - r.x - r.width / 2;
  });

  const sizeTarget = useTransform(
    dist,
    [-distance, 0, distance],
    [baseSize, magnification, baseSize]
  );
  const size = useSpring(sizeTarget, DOCK_SPRING);
  const iconScale = useTransform(size, (s) => s / baseSize);

  const style = reduceMotion
    ? { width: baseSize, height: baseSize }
    : { width: size, height: size };

  const inner = (
    <motion.span
      className="flex items-center justify-center"
      style={reduceMotion ? undefined : { scale: iconScale }}
    >
      {children}
    </motion.span>
  );

  const shared = {
    ref,
    style,
    className,
    title,
    onClick,
    ...(reduceMotion ? {} : { whileTap: { scale: 0.88 } }),
  };

  if (to) {
    return (
      <MotionLink to={to} {...shared}>
        {inner}
      </MotionLink>
    );
  }
  return (
    <motion.button type="button" {...shared}>
      {inner}
    </motion.button>
  );
}
