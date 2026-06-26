import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { pastelTokens } from './pastel';
import { useTheme } from '../../lib/theme';
import { fadeUp, springCard } from '../../lib/motion';

/**
 * Pastel event / activity card for the right-hand column (reference "My Events").
 *
 * Props:
 *  - color: pastel name (default 'sky')
 *  - icon: lucide component
 *  - kicker: small label (e.g. "Webinar", "Task")
 *  - date: short date string (right-aligned)
 *  - title / body: content
 *  - footer: optional node (e.g. "Start at 12:30" pill)
 *  - onClick
 */
export default function EventCard({
  color = 'sky', icon: Icon, kicker, date, title, body, footer, onClick, className = '',
}) {
  const dark = useTheme(s => s.dark);
  const pastel = pastelTokens(color, dark);
  const clickable = !!onClick;
  return (
    <motion.div
      variants={fadeUp}
      {...(clickable ? { whileHover: { y: -2 }, whileTap: { scale: 0.99 }, transition: springCard } : {})}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      className={`rounded-card p-4 ${pastel.bg}  ${clickable ? 'cursor-pointer' : ''} ${className}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <span className="w-7 h-7 rounded-full bg-white/70 flex items-center justify-center flex-shrink-0">
              <Icon size={14} style={{ color: pastel.fgHex }} />
            </span>
          )}
          {kicker && <span className="text-sm font-semibold truncate" style={{ color: pastel.fgHex }}>{kicker}</span>}
        </div>
        {date && <span className="text-[11px] text-neutral-500 flex-shrink-0">{date}</span>}
      </div>
      {title && <p className="text-sm font-medium text-neutral-900 leading-snug">{title}</p>}
      {body && <p className="text-xs text-neutral-600 mt-1 leading-relaxed line-clamp-3">{body}</p>}
      {footer && <div className="mt-3">{footer}</div>}
      {clickable && !footer && (
        <div className="flex justify-end mt-2"><ChevronRight size={15} className="text-neutral-400" /></div>
      )}
    </motion.div>
  );
}
