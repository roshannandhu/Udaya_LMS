import React from 'react';
import { Play, MoreVertical, Eye } from 'lucide-react';

export default function VideoCard({ video, thumbnail, studentsCount, onView, onMenu }) {
  const watchedCount = video.completed_count ?? 0;
  const watchPct = studentsCount > 0 ? Math.round((watchedCount / studentsCount) * 100) : 0;
  const duration = video.duration_secs
    ? `${Math.floor(video.duration_secs / 60)}:${(video.duration_secs % 60).toString().padStart(2, '0')}`
    : null;

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-neutral-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">
      {/* Thumbnail */}
      <div
        className="relative aspect-video bg-gradient-to-br from-neutral-100 to-neutral-200 overflow-hidden cursor-pointer"
        onClick={() => onView(video)}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={video.title}
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center">
              <Play size={22} className="text-neutral-500 ml-0.5" fill="currentColor" />
            </div>
          </div>
        )}

        {/* Hover play overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg">
            <Play size={18} className="text-neutral-900 ml-0.5" fill="currentColor" />
          </div>
        </div>

        {/* YT badge */}
        {video.source_type === 'youtube' && (
          <span className="absolute top-2 left-2 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-tight z-10">
            YT
          </span>
        )}

        {/* Duration */}
        {duration && (
          <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] px-1.5 py-0.5 rounded-md font-mono leading-tight z-10">
            {duration}
          </span>
        )}

        {/* 3-dot button */}
        <button
          onClick={e => { e.stopPropagation(); onMenu(video.id, e); }}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-black/70 z-10"
        >
          <MoreVertical size={12} />
        </button>
      </div>

      {/* Body */}
      <div className="p-3.5 cursor-pointer" onClick={() => onView(video)}>
        <h4 className="text-sm font-semibold text-neutral-900 mb-2.5 line-clamp-2 leading-snug">
          {video.title}
        </h4>
        {studentsCount > 0 ? (
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="flex items-center gap-1 text-neutral-500">
                <Eye size={11} />
                {watchedCount} / {studentsCount} watched
              </span>
              <span className={`font-semibold tabular-nums ${
                watchPct >= 70 ? 'text-green-600' : watchPct >= 30 ? 'text-amber-600' : 'text-neutral-400'
              }`}>
                {watchPct}%
              </span>
            </div>
            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  watchPct >= 70 ? 'bg-green-500' : watchPct >= 30 ? 'bg-amber-400' : 'bg-neutral-300'
                }`}
                style={{ width: `${watchPct}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-neutral-400">No students yet</p>
        )}
      </div>
    </div>
  );
}
