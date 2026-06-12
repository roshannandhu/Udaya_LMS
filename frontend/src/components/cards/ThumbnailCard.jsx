import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Play, Calendar, FileText, CheckCircle, Clock } from 'lucide-react';
import { Tag } from '../ui';
import { springCard } from '../../lib/motion';

const colorMap = {
  blue: 'bg-blue-50 text-blue-600',
  pink: 'bg-pink-50 text-pink-600',
  green: 'bg-green-50 text-green-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  purple: 'bg-purple-50 text-purple-600',
  orange: 'bg-orange-50 text-orange-600',
  slate: 'bg-slate-50 text-slate-600',
};

const gradientMap = {
  blue: 'from-blue-100 to-sky-50',
  pink: 'from-fuchsia-100 to-pink-50',
  green: 'from-emerald-100 to-teal-50',
  yellow: 'from-amber-100 to-yellow-50',
  purple: 'from-purple-100 to-indigo-50',
  orange: 'from-orange-100 to-amber-50',
  slate: 'from-slate-100 to-neutral-50',
};

export default function ThumbnailCard({ 
  type = 'video', // 'video', 'live', 'assignment', 'test'
  title, 
  subtitle, 
  thumbnailUrl, 
  color = 'blue', 
  overlayText, 
  overlayIcon: OverlayIcon,
  progressPct,
  onClick 
}) {
  const isVideo = type === 'video' || type === 'live';
  const reduce = useReducedMotion();

  return (
    <motion.div
      onClick={onClick}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20px' }}
      whileHover={reduce ? undefined : { y: -4, scale: 1.015 }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={springCard}
      className="flex-shrink-0 w-64 md:w-72 bg-white rounded-3xl shadow-sm border border-neutral-100 overflow-hidden cursor-pointer hover:shadow-md transition-shadow relative group"
    >
      {/* Thumbnail Area */}
      <div className={`h-36 w-full relative overflow-hidden bg-gradient-to-br ${gradientMap[color] || gradientMap.blue}`}>
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center opacity-50">
            {type === 'video' && <Play size={32} className={`mb-2 text-${color}-600`} />}
            {type === 'live' && <Calendar size={32} className={`mb-2 text-${color}-600`} />}
            {type === 'assignment' && <FileText size={32} className={`mb-2 text-${color}-600`} />}
            {type === 'test' && <CheckCircle size={32} className={`mb-2 text-${color}-600`} />}
          </div>
        )}

        {/* Play Button Overlay for Videos */}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg shadow-black/5 group-hover:scale-110 transition-transform">
              <Play className={`fill-${color}-500 text-${color}-500 ml-1`} size={20} />
            </div>
          </div>
        )}

        {/* Top Right Overlay (e.g. Watching 00:30, LIVE) */}
        {overlayText && (
          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-neutral-800 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1.5">
            {OverlayIcon && <OverlayIcon size={12} className={type === 'live' ? 'text-red-500 animate-pulse' : 'text-neutral-500'} />}
            {overlayText}
          </div>
        )}

        {/* Progress Bar overlay */}
        {typeof progressPct === 'number' && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/20">
            <div className={`h-full bg-${color}-500`} style={{ width: `${Math.min(100, progressPct)}%` }} />
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="p-4">
        {subtitle && (
          <div className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-2 ${colorMap[color] || colorMap.blue}`}>
            {subtitle}
          </div>
        )}
        <h3 className="font-semibold text-neutral-800 leading-tight line-clamp-2 text-sm">{title}</h3>
      </div>
    </motion.div>
  );
}
