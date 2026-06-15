import React from 'react';
import { Play, Calendar } from 'lucide-react';
import { pastelTokens } from './pastel';
import { useTheme } from '../../lib/theme';

export default function HeroCarousel({ items = [], onVideoClick, onLiveClick }) {
  const dark = useTheme(s => s.dark);
  if (!items || items.length === 0) return null;

  // Format MM:SS
  const formatTime = (secs) => {
    if (!secs) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full -mx-5 px-5 md:mx-0 md:px-0">
      {/* Dashed line connecting from above (Roadmap style) */}
      <div className="absolute left-6 top-0 w-0 h-full border-l-2 border-dashed border-green-200 -z-10 hidden md:block"></div>
      
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
        {items.map((item, idx) => {
          const isLive = item.type === 'live';
          const pastel = pastelTokens(isLive ? 'sky' : (idx % 2 === 0 ? 'pink' : 'lavender'), dark);
          const progressPct = item.duration_secs ? Math.min(100, (item.progress_secs / item.duration_secs) * 100) : 0;
          
          return (
            <div 
              key={item.id}
              onClick={() => isLive ? onLiveClick(item) : onVideoClick(item)}
              className="snap-start flex-shrink-0 w-72 md:w-[26rem] h-32 md:h-36 bg-white rounded-3xl p-3 flex gap-4 items-center shadow-sm border border-[#EFEDEA] overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group"
            >
              {/* Left Side: Thumbnail (Inset) */}
              <div className="relative w-28 md:w-40 h-full rounded-2xl overflow-hidden bg-neutral-100 flex-shrink-0">
                {item.thumbnail_url ? (
                  <img src={item.thumbnail_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-black/5">
                    {isLive ? <Calendar size={28} className="text-neutral-400 opacity-60" /> : <Play size={28} className="text-neutral-400 opacity-60" />}
                  </div>
                )}
                
                {/* Image Overlay Container */}
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors p-2 flex flex-col justify-between">
                  {/* Top Right Pill (Watching or Live) */}
                  <div className="self-end">
                    {isLive ? (
                      <span className="bg-red-500/90 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
                      </span>
                    ) : item.progress_secs > 0 ? (
                      <span className="bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-1.5 py-0.5 rounded shadow-sm">
                        {formatTime(item.progress_secs)}
                      </span>
                    ) : null}
                  </div>
                  
                  {/* Center Play Button */}
                  <div className="self-center transform group-hover:scale-110 transition-transform">
                    <Play className="text-white drop-shadow-md" fill="currentColor" size={24} />
                  </div>
                </div>
              </div>

              {/* Right Side: Content */}
              <div className="flex-1 min-w-0 pr-2 py-1 flex flex-col h-full justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1 line-clamp-1" style={{ color: pastel.fgHex }}>
                    {item.subtitle || 'Subject'}
                  </p>
                  <h3 className="text-sm md:text-base font-semibold text-neutral-800 leading-snug line-clamp-2 mb-1" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                    {item.title}
                  </h3>
                </div>

                {/* Progress Bar or Action Text */}
                <div className="mt-auto">
                  {!isLive && item.progress_secs > 0 ? (
                    <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                       <div className="h-full rounded-full" style={{ width: `${progressPct}%`, backgroundColor: pastel.fgHex }}></div>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-neutral-500 group-hover:text-neutral-800 transition-colors">
                      {isLive ? 'Join Session →' : 'Start Lesson →'}
                    </span>
                  )}
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
