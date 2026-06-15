import React from 'react';
import { motion } from 'framer-motion';
import { Play, Check, Lock, Clock, Calendar, FileText, ArrowRight } from 'lucide-react';
import { pastelFor, pastelTokens } from './pastel';
import { useTheme } from '../../lib/theme';
import { fadeUp, springCard } from '../../lib/motion';

const STATUS = {
  completed: { label: 'Completed', tag: 'mint',  icon: Check },
  active:    { label: 'Continue',  tag: 'pink', icon: Play },
  upcoming:  { label: 'Upcoming',  tag: 'cream', icon: Clock },
  locked:    { label: 'Locked',    tag: 'gray',  icon: Lock },
};

export default function RoadmapNode({
  title, subtitle, type = 'subject', status = 'upcoming', color,
  progressPct, onClick, overlayText
}) {
  const dark = useTheme(s => s.dark);
  const s = STATUS[status] || STATUS.upcoming;
  const isActive = status === 'active';
  const pastelName = color || (isActive ? 'pink' : pastelFor(title));
  const pastel = pastelTokens(pastelName || 'lavender', dark);
  
  let TypeIcon = FileText;
  if (type === 'video') TypeIcon = Play;
  if (type === 'live') TypeIcon = Calendar;
  if (type === 'test') TypeIcon = Check;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      variants={fadeUp}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={springCard}
      className={`group relative w-full text-left p-6 sm:p-8 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow border border-black/5`}
      style={{ 
        backgroundColor: pastel.hex,
        borderRadius: '2rem', // Large 32px corners
      }}
    >
      <div className="flex justify-between items-start mb-6">
        {/* Type Icon Badge */}
        <div className="w-14 h-14 rounded-2xl bg-white/70 backdrop-blur-md flex items-center justify-center shadow-sm" style={{ color: pastel.fgHex }}>
          <TypeIcon size={28} />
        </div>
        
        {/* Overlay Text (e.g. Due Date, Live) */}
        {overlayText && (
          <div className="px-3 py-1 bg-white/80 backdrop-blur-sm rounded-full text-[11px] font-bold uppercase tracking-wider shadow-sm" style={{ color: pastel.fgHex }}>
            {overlayText}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest mb-2 opacity-80" style={{ color: pastel.fgHex }}>
          {subtitle || 'Lesson'}
        </p>
        <h3 className="text-xl sm:text-[1.35rem] font-bold text-neutral-900 leading-snug mb-4" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
          {title}
        </h3>
        
        <div className="flex items-center justify-between mt-8">
          {/* Progress or Status */}
          <div className="flex items-center gap-2">
            {typeof progressPct === 'number' && progressPct > 0 ? (
              <div className="flex items-center gap-3">
                <div className="w-24 h-2 bg-black/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${progressPct}%`, backgroundColor: pastel.fgHex }}></div>
                </div>
                <span className="text-xs font-bold" style={{ color: pastel.fgHex }}>{Math.round(progressPct)}%</span>
              </div>
            ) : (
              <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/60" style={{ color: pastel.fgHex }}>
                <s.icon size={12} className="inline mr-1" /> {s.label}
              </span>
            )}
          </div>

          {/* CTA Button */}
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform" style={{ color: pastel.fgHex }}>
            <ArrowRight size={20} strokeWidth={2.5} />
          </div>
        </div>
      </div>
    </motion.button>
  );
}
