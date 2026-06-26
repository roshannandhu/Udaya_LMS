import React from 'react';
import { motion } from 'framer-motion';
import { pastelTokens } from './pastel';
import { useTheme } from '../../lib/theme';
import { fadeUp } from '../../lib/motion';

/**
 * Big-number stat tile (the "26 / 2 / 23" row in the reference).
 *
 * Props:
 *  - value, label
 *  - icon: lucide component (optional)
 *  - color: pastel name → tinted tile (optional; default white)
 *  - emphasis: bool → larger/bordered "current" treatment
 */
export default function StatCard({ value, label, icon: Icon, color, emphasis = false, className = '' }) {
  const dark = useTheme(s => s.dark);
  const pastel = color ? pastelTokens(color, dark) : null;
  const surface = pastel
    ? `${pastel.bg} ${emphasis ? 'ring-2 ring-black/10' : ''}`
    : `bg-white border ${emphasis ? 'border-neutral-300 shadow-lift' : 'border-[#EFEDEA] shadow-soft'}`;

  return (
    <motion.div variants={fadeUp} className={`rounded-card p-4 ${surface} ${className}`}>
      {Icon && (
        <Icon size={16} className="mb-2" style={pastel ? { color: pastel.fgHex } : undefined} />
      )}
      <p className="text-2xl md:text-3xl font-semibold tracking-tight leading-none" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
        {value}
      </p>
      <p className="text-xs text-neutral-600 mt-1.5">{label}</p>
    </motion.div>
  );
}
