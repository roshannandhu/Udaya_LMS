import React, { useState, useEffect } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { Avatar, Modal, Skeleton } from '../../ui';
import { apiClient } from '../../../lib/api';

export default function VideoViewersModal({ video, onClose }) {
  const [viewers, setViewers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!video) return;
    setLoading(true);
    setViewers([]);
    apiClient(`/videos/${video.id}/viewers`)
      .then(data => setViewers(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [video?.id]);

  const watched    = viewers.filter(v => v.watched);
  const notWatched = viewers.filter(v => !v.watched);
  const watchPct   = viewers.length > 0 ? Math.round((watched.length / viewers.length) * 100) : 0;

  const fmtTime = (iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  // SVG donut params (viewBox 36×36, r=15.9, circumference ≈ 99.9)
  const stroke = watchPct >= 70 ? '#22c55e' : watchPct >= 30 ? '#f59e0b' : '#94a3b8';

  return (
    <Modal open={!!video} onClose={onClose} title={video?.title || ''} size="md">
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-9 h-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-20" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stats panel */}
          <div className="flex items-center gap-4 p-4 bg-neutral-50 border border-neutral-100 rounded-2xl">
            {/* Donut */}
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3.2" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={stroke} strokeWidth="3.2"
                  strokeDasharray={`${watchPct} ${100 - watchPct}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-neutral-900">{watchPct}%</span>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div className="bg-green-50 border border-green-100 rounded-xl p-2.5 text-center">
                <p className="text-2xl font-bold text-green-700 leading-none mb-0.5">{watched.length}</p>
                <p className="text-xs text-green-600 font-medium">Watched</p>
              </div>
              <div className="bg-white border border-neutral-200 rounded-xl p-2.5 text-center">
                <p className="text-2xl font-bold text-neutral-500 leading-none mb-0.5">{notWatched.length}</p>
                <p className="text-xs text-neutral-400 font-medium">Not yet</p>
              </div>
            </div>
          </div>

          {/* Watched */}
          {watched.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Watched ({watched.length})
              </p>
              <div className="space-y-1.5">
                {watched.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-neutral-100">
                    <Avatar name={s.name} src={s.avatar_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-neutral-400">
                        @{s.username}{s.last_watched_at ? ` · ${fmtTime(s.last_watched_at)}` : ''}
                      </p>
                    </div>
                    {s.completed ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 flex-shrink-0">
                        <CheckCircle2 size={10} /> Done
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 flex-shrink-0">
                        <Clock size={10} /> Partial
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Not watched */}
          {notWatched.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Not yet ({notWatched.length})
              </p>
              <div className="space-y-1.5">
                {notWatched.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                    <Avatar name={s.name} src={s.avatar_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-neutral-600">{s.name}</p>
                      <p className="text-xs text-neutral-400">@{s.username}</p>
                    </div>
                    <span className="text-xs font-medium text-neutral-400 bg-neutral-100 border border-neutral-200 rounded-full px-2 py-0.5 flex-shrink-0">
                      Not watched
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewers.length === 0 && (
            <p className="text-sm text-neutral-500 text-center py-6">No students enrolled yet.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
