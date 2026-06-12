import React, { useState, useEffect } from 'react';
import { Play, Clock, Loader2, Radio } from 'lucide-react';

function pad(n) { return String(n).padStart(2, '0'); }

function formatCountdown(ms) {
  if (ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${pad(m)}m`;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function LiveCountdown({ scheduledAt, isLive, isEnded }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (isLive || isEnded) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive, isEnded]);

  if (isLive) return 'Streaming Now';
  if (isEnded) return 'Stream Ended';

  const msUntil = scheduledAt ? new Date(scheduledAt).getTime() - now : 0;
  if (msUntil <= 0) return 'Starting soon...';

  return formatCountdown(msUntil) + ' left';
}

const PREMIUM_THEMES = [
  { bg: 'bg-gradient-to-br from-emerald-50 to-teal-100', accent: 'text-teal-600', ring: 'ring-teal-400/40', shadow: 'shadow-teal-500/20' },
  { bg: 'bg-gradient-to-br from-indigo-50 to-purple-100', accent: 'text-purple-600', ring: 'ring-purple-400/40', shadow: 'shadow-purple-500/20' },
  { bg: 'bg-gradient-to-br from-amber-50 to-orange-100', accent: 'text-orange-600', ring: 'ring-orange-400/40', shadow: 'shadow-orange-500/20' },
  { bg: 'bg-gradient-to-br from-blue-50 to-sky-100', accent: 'text-sky-600', ring: 'ring-sky-400/40', shadow: 'shadow-sky-500/20' },
  { bg: 'bg-gradient-to-br from-rose-50 to-pink-100', accent: 'text-pink-600', ring: 'ring-pink-400/40', shadow: 'shadow-pink-500/20' }
];

export default function LiveClassCard({
  lc,
  onClick,
  joiningId,
  themeIndex = 0,
  actions,
  avatars,
  className = "",
  compact = false,
  teacherAvatar,
  thumbnailUrl,
  textSide,
  subjectName,
  standardName,
  topic,
  status: propsStatus,
  scheduledAt
}) {
  const status = propsStatus || lc?.status || 'scheduled';
  const isLive = status === 'live';
  const isEnded = status === 'ended';
  const theme = PREMIUM_THEMES[themeIndex % PREMIUM_THEMES.length];
  
  const thumbUrl = thumbnailUrl || lc?.thumbnail_url;
  const tSide = textSide || lc?.thumbnail_text_side || 'right';
  const hasThumb = !!thumbUrl;
  const side = tSide === 'left' ? 'left' : 'right';

  const subName = [standardName, subjectName || lc?.subject?.name || lc?.class_name].filter(Boolean).join(' • ');
  const titleText = topic || lc?.title;
  const dur = lc?.duration_mins;
  const timeScheduled = scheduledAt || lc?.scheduled_at;
  const tAvatar = teacherAvatar || lc?.teacher_photo_url;

  const minHeight = compact ? 'min-h-[220px]' : 'min-h-[260px] sm:min-h-[300px]';

  // Scheduled cards must stay clickable: the backend join-token endpoint is the
  // only thing that flips status to "live" (it asks Zoom directly), so gating the
  // click on isLive makes a started class unjoinable for everyone.
  const clickable = !!onClick && !isEnded && status !== 'cancelled';

  return (
    <div
      onClick={() => clickable ? onClick(lc) : null}
      className={`relative rounded-[2.5rem] p-6 sm:p-8 flex flex-col justify-between ${minHeight} transition-all duration-500 overflow-hidden group
      ${isLive ? `cursor-pointer hover:-translate-y-2 hover:scale-[1.02] shadow-2xl ${theme.shadow} ring-4 ${theme.ring}` : `${clickable ? 'cursor-pointer' : ''} shadow-lg hover:shadow-xl hover:-translate-y-1 border border-white/50`}
      ${hasThumb ? 'bg-black' : theme.bg} ${className}`}
    >
      {/* Thumbnail & Cinematic Overlays */}
      {hasThumb ? (
        <>
          <img 
            src={thumbUrl} 
            alt="Thumbnail" 
            className="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-[2s] group-hover:scale-110 opacity-90" 
            draggable={false} 
          />
          <div className="absolute inset-0 z-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
          <div className={`absolute inset-0 z-0 ${side === 'left' ? 'bg-gradient-to-r from-black/80 via-black/30' : 'bg-gradient-to-l from-black/80 via-black/30'} to-transparent backdrop-blur-[1px]`} />
        </>
      ) : (
        <div className="absolute inset-0 z-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none" />
      )}

      {/* Top Header Section */}
      <div className="relative z-10 flex justify-between items-start w-full">
        {isLive ? (
          <div className="flex items-center gap-2.5 rounded-full bg-red-500/20 backdrop-blur-xl border border-red-500/40 px-4 py-2 shadow-[0_0_20px_rgba(239,68,68,0.3)]">
            <Radio className="text-red-500 animate-pulse" size={16} />
            <span className="text-xs font-black tracking-widest text-red-500 uppercase drop-shadow-md">LIVE NOW</span>
            {/* Equalizer animation */}
            <div className="flex items-end gap-[2px] h-3 ml-1">
              <div className="w-[3px] h-2 bg-red-500 rounded-full animate-[ping_1s_infinite_0ms]"></div>
              <div className="w-[3px] h-3 bg-red-500 rounded-full animate-[ping_1s_infinite_200ms]"></div>
              <div className="w-[3px] h-1.5 bg-red-500 rounded-full animate-[ping_1s_infinite_400ms]"></div>
            </div>
          </div>
        ) : isEnded ? (
           <div className="inline-flex items-center gap-2 rounded-full bg-neutral-900/40 backdrop-blur-md px-4 py-2 text-xs font-bold text-white/90 border border-white/10">
             Ended
           </div>
        ) : (
           <div className={`inline-flex items-center gap-2 rounded-full backdrop-blur-md px-4 py-2 text-xs font-extrabold shadow-sm border 
             ${hasThumb ? 'bg-white/10 text-white/90 border-white/20' : 'bg-white/50 text-neutral-800 border-white/50'}`}>
             Upcoming
           </div>
        )}

        {/* Floating Play Button */}
        <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full backdrop-blur-xl flex items-center justify-center shadow-xl border transition-all duration-500 
          ${isLive 
            ? 'bg-white text-red-500 border-white group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(239,68,68,0.5)]' 
            : (hasThumb ? 'bg-white/10 border-white/20 text-white group-hover:bg-white/20' : 'bg-white/70 border-white/60 text-neutral-600 group-hover:bg-white')}`}>
          {joiningId === (lc?.id || 'preview') ? (
            <Loader2 size={26} className="animate-spin" />
          ) : (
            <Play fill="currentColor" size={26} className="ml-1 drop-shadow-sm" />
          )}
        </div>
      </div>

      {/* Center Main Content */}
      <div className={`relative z-10 mt-auto pt-10 flex flex-col ${hasThumb && side === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
        {tAvatar && (
          <div className="relative mb-4 group-hover:scale-105 transition-transform">
            <div className="absolute inset-0 rounded-full bg-white blur-md opacity-40"></div>
            <img src={tAvatar} alt="Teacher" className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full border-[3px] border-white shadow-lg object-cover" draggable={false} />
          </div>
        )}
        
        {subName && (
          <p className={`text-xs sm:text-sm font-extrabold uppercase tracking-[0.2em] mb-2 
            ${hasThumb ? 'text-white/70 drop-shadow-md' : `${theme.accent} opacity-80`}`}>
            {subName} {dur && <span className="opacity-70 mx-1">•</span>} {dur && `${dur} MIN`}
          </p>
        )}
        
        <h3 className={`text-2xl sm:text-[34px] font-black leading-[1.1] tracking-tight mb-5 
          ${hasThumb ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]' : 'text-neutral-900'} 
          max-w-[95%] sm:max-w-[85%]`}>
          {titleText}
        </h3>
      </div>

      {/* Bottom Footer Row */}
      <div className={`relative z-10 mt-2 flex flex-col sm:flex-row gap-4 
        ${hasThumb && side === 'right' ? 'sm:flex-row-reverse sm:justify-between' : 'sm:justify-between'} items-start sm:items-center`}>
        
        {/* Actions & Time */}
        <div className={`flex flex-wrap items-center gap-3 ${hasThumb && side === 'right' ? 'flex-row-reverse' : ''}`}>
          <div className={`backdrop-blur-xl rounded-full px-4 py-2.5 flex items-center gap-2.5 shadow-sm border transition-colors
            ${hasThumb ? 'bg-black/30 border-white/10 hover:bg-black/50' : 'bg-white/60 border-white/40 hover:bg-white/80'}`}>
            <Clock size={16} className={`${isLive ? 'text-red-500' : (hasThumb ? 'text-white/60' : 'text-neutral-500')}`} />
            <span className={`text-[13px] sm:text-[14px] font-bold tracking-wide
              ${isLive ? 'text-red-500 drop-shadow-sm' : (hasThumb ? 'text-white/90' : 'text-neutral-800')}`}>
              <LiveCountdown scheduledAt={timeScheduled} isLive={isLive} isEnded={isEnded} />
            </span>
          </div>
          {actions}
        </div>

        {/* Attendee Avatars */}
        {avatars && (
          <div className={`shrink-0 ${hasThumb && side === 'right' ? 'mr-auto' : 'ml-auto'}`}>
            {avatars}
          </div>
        )}
      </div>
    </div>
  );
}
