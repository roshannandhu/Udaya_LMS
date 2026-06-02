import React, { useEffect, useState } from 'react';
import { Video, Clock } from 'lucide-react';

/**
 * Auto-thumbnail for a live class.
 *
 * The teacher uploads ONE universal base image (their face with a blank space on
 * one side). This component composites the per-class text into that blank space at
 * render time — no per-class image is generated. The configured blank side
 * (`textSide` = 'left' | 'right') decides which half holds the text.
 *
 * Layout (matches the requested design): subject + class on top, topic just below.
 * A small live countdown badge sits in the top corner of the card.
 */

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

export default function LiveClassThumbnail({
  thumbnailUrl,
  textSide = 'right',
  subjectName,
  standardName,
  topic,
  status = 'scheduled',
  scheduledAt,
}) {
  const [now, setNow] = useState(Date.now());

  // Tick every second so the countdown is live and smooth.
  useEffect(() => {
    if (status !== 'scheduled') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  const isLive = status === 'live';
  const isEnded = status === 'ended';
  const msUntil = scheduledAt ? new Date(scheduledAt).getTime() - now : 0;
  const countdown = formatCountdown(msUntil);

  const side = textSide === 'left' ? 'left' : 'right';
  const subjectLine = [standardName, subjectName].filter(Boolean).join(' • ');

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-neutral-900 select-none">
      {/* Base image or fallback */}
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-violet-600 to-fuchsia-600 flex items-center justify-center">
          <Video size={40} className="text-white/40" />
        </div>
      )}

      {/* Readability scrim on the text side */}
      <div
        className={`absolute inset-y-0 w-3/5 ${side === 'right' ? 'right-0 bg-gradient-to-l' : 'left-0 bg-gradient-to-r'} from-black/75 via-black/45 to-transparent`}
      />

      {/* Composited text in the blank space */}
      <div
        className={`absolute inset-y-0 w-3/5 ${side === 'right' ? 'right-0 items-end text-right' : 'left-0 items-start text-left'} flex flex-col justify-center gap-1 px-4`}
      >
        {subjectLine && (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-white/80 drop-shadow line-clamp-1">
            {subjectLine}
          </span>
        )}
        {topic && (
          <span className="text-base md:text-lg font-bold leading-tight text-white drop-shadow line-clamp-3">
            {topic}
          </span>
        )}
      </div>

      {/* Countdown / status badge — small box in the top-left corner */}
      <div className="absolute top-2 left-2">
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-[11px] font-bold text-white shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            LIVE
          </span>
        ) : isEnded ? (
          <span className="inline-flex items-center rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white/70 shadow">
            Ended
          </span>
        ) : countdown ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-[11px] font-bold text-white shadow-lg tabular-nums">
            <Clock size={11} className="text-amber-300" />
            {countdown}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-2 py-1 text-[11px] font-bold text-white shadow-lg">
            Starting…
          </span>
        )}
      </div>
    </div>
  );
}
