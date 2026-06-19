import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, ChevronLeft, ChevronRight, Clock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { pastelFor, pastelTokens } from '../cards/pastel';
import { useTheme } from '../../lib/theme';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const fmtDuration = (secs) => {
  if (!secs) return null;
  const m = Math.round(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

/**
 * Hotstar-style horizontal video rail.
 * - snap scrolling + hidden scrollbar (`.scrollbar-hide`)
 * - desktop hover arrows that scroll ~85% of the viewport width
 * - optional pausable auto-scroll (pauses on hover / touch / focus, off under reduced-motion)
 */
export default function VideoRail({
  title,
  items = [],
  onItemClick,
  getSubjectName = () => '',
  autoScroll = false,
  seeAllTo,
  onSeeAll,
}) {
  const trackRef = useRef(null);
  const pausedRef = useRef(false);
  const dark = useTheme(s => s.dark);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [updateArrows, items.length]);

  const scrollByDir = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: 'smooth' });
  };

  // Pausable auto-scroll: advance one card width every 3.5s, loop to start at the end.
  useEffect(() => {
    if (!autoScroll || items.length < 3 || prefersReducedMotion()) return;
    const el = trackRef.current;
    if (!el) return;
    const tick = () => {
      if (pausedRef.current || !el) return;
      const card = el.firstElementChild;
      const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.85;
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 8) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: step, behavior: 'smooth' });
      }
    };
    const id = setInterval(tick, 3500);
    return () => clearInterval(id);
  }, [autoScroll, items.length]);

  if (!items || items.length === 0) return null;

  const pause = () => { pausedRef.current = true; };
  const resume = () => { pausedRef.current = false; };

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-2">
        <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">{title}</h2>
        {(seeAllTo || onSeeAll) && (
          <button
            onClick={onSeeAll}
            className="flex items-center gap-1 text-xs font-bold text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            See all <ArrowRight size={13} />
          </button>
        )}
      </div>

      {/* Group wrapper so arrows reveal on hover */}
      <div
        className="relative group"
        onMouseEnter={pause}
        onMouseLeave={resume}
        onTouchStart={pause}
        onFocusCapture={pause}
        onBlurCapture={resume}
      >
        {/* Left arrow (desktop) */}
        {canLeft && (
          <button
            aria-label="Scroll left"
            onClick={() => scrollByDir(-1)}
            className="hidden md:flex absolute left-1 top-[78px] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white dark:bg-slate-800 text-neutral-700 dark:text-neutral-300 shadow-lift border border-[#EFEDEA] dark:border-slate-700 items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-neutral-50 dark:hover:bg-slate-700 transition-opacity"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {/* Right arrow (desktop) */}
        {canRight && (
          <button
            aria-label="Scroll right"
            onClick={() => scrollByDir(1)}
            className="hidden md:flex absolute right-1 top-[78px] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white dark:bg-slate-800 text-neutral-700 dark:text-neutral-300 shadow-lift border border-[#EFEDEA] dark:border-slate-700 items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-neutral-50 dark:hover:bg-slate-700 transition-opacity"
          >
            <ChevronRight size={20} />
          </button>
        )}

        {/* Scroll track */}
        <div
          ref={trackRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-3 px-2 -mx-2 scroll-px-2"
        >
          {items.map((v) => {
            const pct = v.duration_secs ? Math.min(100, (v.progress_secs / v.duration_secs) * 100) : 0;
            const subject = getSubjectName(v.class_id) || v.subject_name || 'Lesson';
            const pastel = pastelTokens(pastelFor(subject), dark);
            const dur = fmtDuration(v.duration_secs);
            return (
              <button
                key={v.id || v.video_id}
                onClick={() => onItemClick?.(v)}
                className="snap-start flex-shrink-0 w-60 md:w-72 text-left group/card focus:outline-none"
              >
                {/* Thumbnail */}
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-neutral-900 shadow-card border border-black/5 dark:border-white/5">
                  {v.thumbnail_url ? (
                    <img
                      src={v.thumbnail_url}
                      alt={v.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${pastel.hex}, ${dark ? '#11122a' : '#ffffff'})` }}
                    >
                      <Play size={30} style={{ color: pastel.fgHex }} className="opacity-70" />
                    </div>
                  )}

                  {/* Hover scrim + play */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity">
                    <span className="w-12 h-12 rounded-full bg-white/95 flex items-center justify-center shadow-lift">
                      <Play size={20} className="text-neutral-900 ml-0.5" fill="currentColor" />
                    </span>
                  </div>

                  {/* Top-right badge: completed or duration */}
                  {v.completed ? (
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                      <CheckCircle2 size={11} /> Done
                    </span>
                  ) : dur ? (
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                      <Clock size={10} /> {dur}
                    </span>
                  ) : null}

                  {/* Progress bar */}
                  {pct > 0 && !v.completed && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/25">
                      <div className="h-full bg-[#1f80e0]" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>

                {/* Meta */}
                <div className="mt-2.5 px-0.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest mb-1 line-clamp-1" style={{ color: pastel.fgHex }}>
                    {subject}
                  </p>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white leading-snug line-clamp-2">{v.title}</h3>
                  {pct > 0 && !v.completed && (
                    <p className="text-[11px] font-semibold text-neutral-400 mt-1">{Math.round(pct)}% watched</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
