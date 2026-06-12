import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Youtube, ExternalLink } from 'lucide-react';
import { Btn, Modal } from '../../ui';
import { apiClient } from '../../../lib/api';

export default function VideoAddModal({ open, onClose, classId, onAdded }) {
  const [youtubeUrl, setYoutubeUrl]   = useState('');
  const [ytVideoId, setYtVideoId]     = useState(null);
  const [ytPreviewError, setYtPreviewError] = useState(null);
  const [ytTitle, setYtTitle]         = useState('');
  const [ytDescription, setYtDescription] = useState('');
  const [ytAdding, setYtAdding]       = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (open) {
      setYoutubeUrl(''); setYtVideoId(null); setYtPreviewError(null);
      setYtTitle(''); setYtDescription(''); setYtAdding(false);
    }
  }, [open]);

  function extractYouTubeId(url) {
    const patterns = [
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  }

  function onYoutubeUrlChange(e) {
    const url = e.target.value;
    setYoutubeUrl(url);
    setYtPreviewError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!url.trim()) { setYtVideoId(null); return; }
      const id = extractYouTubeId(url.trim());
      if (!id) {
        setYtVideoId(null);
        setYtPreviewError('Invalid YouTube URL. Use youtube.com/watch?v=… or youtu.be/…');
      } else {
        setYtVideoId(id);
      }
    }, 400);
  }

  async function handleAdd() {
    if (!ytVideoId || !ytTitle.trim() || ytAdding) return;
    setYtAdding(true);
    try {
      await apiClient('/videos/youtube', {
        method: 'POST',
        body: JSON.stringify({
          class_id: classId,
          title: ytTitle.trim(),
          description: ytDescription.trim() || null,
          youtube_video_id: ytVideoId,
          youtube_url: youtubeUrl,
        }),
      });
      onAdded();
      onClose();
    } catch (err) {
      setYtPreviewError(err?.message || 'Failed to add video.');
    } finally {
      setYtAdding(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add video" size="md">
      <div className="space-y-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed">
          <strong>Important:</strong> Set your YouTube video to <strong>Unlisted</strong> — not Private.
          Students watch inside this app and never see the URL.
        </div>

        {/* Quick links to YouTube (open in a new tab) */}
        <div>
          <div className="grid grid-cols-2 gap-2">
            <a
              href="https://www.youtube.com/upload"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#EFEDEA] bg-white hover:bg-[#F4F2EF] text-sm font-medium transition-colors"
            >
              <Youtube size={16} className="text-red-600" /> Upload new
              <ExternalLink size={12} className="text-neutral-400" />
            </a>
            <a
              href="https://studio.youtube.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#EFEDEA] bg-white hover:bg-[#F4F2EF] text-sm font-medium transition-colors"
            >
              <Youtube size={16} className="text-red-600" /> My videos
              <ExternalLink size={12} className="text-neutral-400" />
            </a>
          </div>
          <p className="text-[11px] text-neutral-500 mt-1.5 text-center">
            Upload your video as Unlisted on YouTube, then paste its link below.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">YouTube video URL</label>
          <input
            type="url"
            value={youtubeUrl}
            onChange={onYoutubeUrlChange}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400"
          />
        </div>

        {ytPreviewError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{ytPreviewError}</p>
        )}

        {ytVideoId && !ytPreviewError && (
          <div className="flex gap-3 p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
            <img
              src={`https://img.youtube.com/vi/${ytVideoId}/mqdefault.jpg`}
              alt="preview"
              className="w-28 flex-shrink-0 rounded-lg object-cover"
              style={{ aspectRatio: '16/9' }}
            />
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                ✓ Video detected
              </span>
              <p className="text-xs text-neutral-400 mt-1 font-mono break-all">{ytVideoId}</p>
            </div>
          </div>
        )}

        {ytVideoId && !ytPreviewError && (
          <>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5">Title</label>
              <input
                type="text"
                value={ytTitle}
                onChange={e => setYtTitle(e.target.value)}
                placeholder="e.g. Chapter 5 — Quadratic Equations"
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5">Description (optional)</label>
              <textarea
                value={ytDescription}
                onChange={e => setYtDescription(e.target.value)}
                placeholder="What this video covers..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl bg-white resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              />
            </div>
            <Btn
              onClick={handleAdd}
              disabled={!ytVideoId || !ytTitle.trim() || ytAdding}
              className="w-full justify-center"
              variant="primary"
            >
              {ytAdding ? <><Loader2 size={14} className="animate-spin mr-1.5" />Adding…</> : 'Add video'}
            </Btn>
          </>
        )}
      </div>
    </Modal>
  );
}
