import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, WifiOff, Wifi, Heart, Loader2, Trash2, AlertTriangle, Clock, Play, Captions, CaptionsOff } from 'lucide-react';
import { MediaPlayer, MediaProvider } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import { Tag } from '../../components/ui';
import { videoApi, apiClient } from '../../lib/api';
import SubjectIcon from '../../components/shared/SubjectIcon';
import { Reveal } from '../../components/bits';
import { useAuthStore } from '../../lib/auth';
import ScreenshotGuard from '../../components/shared/ScreenshotGuard';
import VideoComments from '../../components/student/VideoComments';
import {
  isVideoSaved,
  saveVideoOffline,
  removeVideoOffline,
  getCachedVideoBlobUrl,
  getCachedVideoSize,
  formatBytes,
} from '../../lib/offlineVideos';

function toMmSs(secs) {
  if (secs == null) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function StudentVideoPlayerPage() {
  const { classId, videoId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);

  const playerRef = useRef(null);       // Vidstack player ref (all sources)
  const playerBoxRef = useRef(null);    // container — to reach the YouTube iframe + settings menu

  const [video, setVideo]         = useState(null);
  const [subject, setSubject]     = useState(null);
  const [loading, setLoading]     = useState(true);

  const [completed, setCompleted] = useState(false);

  // Likes (persisted; teacher sees the count)
  const [liked, setLiked]         = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeBusy, setLikeBusy]   = useState(false);

  // Offline state
  const [isOnline, setIsOnline]   = useState(navigator.onLine);
  const [saved, setSaved]         = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saveProgress, setSaveProgress] = useState(null); // 0-100 | null
  const [saveError, setSaveError] = useState('');
  const [cachedSize, setCachedSize] = useState(null);
  const [blobUrl, setBlobUrl]     = useState(null);
  const blobUrlRef = useRef(null);

  // YouTube source needs a per-request token (the raw YT id is never sent in the list)
  const [ytToken, setYtToken]     = useState(null);
  const [ytError, setYtError]     = useState(null);

  // Captions (best-effort toggle on the YouTube embed)
  const [cc, setCc] = useState(false);

  // Playback state (drives chapter highlight + progress save + completion)
  const [chapterActive, setChapterActive] = useState(-1);
  const [watchedPct, setWatchedPct] = useState(0); // genuine coverage, for the completion hint
  const lastSavedRef = useRef(0);   // last progress_secs POSTed
  const resumedRef   = useRef(false); // resume-seek applied once
  const watchedRef   = useRef(0);     // seconds ACTUALLY played (seeks excluded)
  const lastTickRef  = useRef(0);     // previous currentTime, to measure real playback deltas
  const completeFiredRef = useRef(false); // auto-complete fires at most once

  // Track online/offline status
  useEffect(() => {
    const online  = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  // Load video metadata
  useEffect(() => {
    const fetchVid = async () => {
      try {
        const [vids, subs] = await Promise.all([
          videoApi.getVideos(classId),
          apiClient('/subjects'),
        ]);
        const v = (vids || []).find(x => String(x.id) === String(videoId));
        setVideo(v || null);
        if (v?.my_completed) setCompleted(true);
        setLiked(!!v?.my_liked);
        setLikeCount(v?.like_count || 0);
        const sub = (subs || []).find(x => String(x.id) === String(classId));
        setSubject(sub || null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchVid();
  }, [classId, videoId]);

  // Init offline state after video loads
  useEffect(() => {
    if (!video) return;
    const isSaved = isVideoSaved(videoId);
    setSaved(isSaved);
    if (isSaved) {
      getCachedVideoSize(videoId).then(size => { if (size) setCachedSize(formatBytes(size)); });
      if (!navigator.onLine) {
        getCachedVideoBlobUrl(videoId).then(url => {
          if (url) { blobUrlRef.current = url; setBlobUrl(url); }
        });
      }
    }
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [video, videoId]);

  // Fetch YouTube token when source_type is youtube
  useEffect(() => {
    if (video?.source_type !== 'youtube') return;
    apiClient(`/videos/${videoId}/token`)
      .then(res => setYtToken(res.token))
      .catch(err => {
        if (err?.status === 403 || err?.message?.includes('403')) {
          setYtError('You do not have access to this video.');
        } else {
          setYtError('Could not load video. Please try again.');
        }
      });
  }, [video?.source_type, videoId]);

  // When going offline, load blob URL if video is saved
  useEffect(() => {
    if (!isOnline && saved && !blobUrl) {
      getCachedVideoBlobUrl(videoId).then(url => {
        if (url) { blobUrlRef.current = url; setBlobUrl(url); }
      });
    }
  }, [isOnline, saved, blobUrl, videoId]);

  // ── Source-agnostic watch tracking ──────────────────────────────────────────
  // Reset per-video tracking when the video changes (seed coverage from saved
  // progress so a returning student isn't forced to re-watch).
  useEffect(() => {
    resumedRef.current = false;
    completeFiredRef.current = false;
    watchedRef.current = video?.progress_secs || 0;
    lastTickRef.current = 0;
    lastSavedRef.current = 0;
    setWatchedPct(0);
    setCc(false);
  }, [video?.id]);

  // Hide the "Accessibility" item from Vidstack's settings (gear) menu. Vidstack
  // gives no prop/stable class for it and builds the menu lazily on open, so we
  // watch the player subtree (light DOM) and hide any menu item with that label.
  useEffect(() => {
    const box = playerBoxRef.current;
    if (!box) return;
    const hideAccessibility = () => {
      box.querySelectorAll('[role="menuitem"]').forEach(el => {
        if ((el.textContent || '').trim().toLowerCase() === 'accessibility') {
          el.style.display = 'none';
        }
      });
    };
    const obs = new MutationObserver(hideAccessibility);
    obs.observe(box, { childList: true, subtree: true });
    hideAccessibility();
    return () => obs.disconnect();
  }, [video?.id]);

  function markComplete() {
    if (completed || completeFiredRef.current) return;
    completeFiredRef.current = true;
    videoApi.markComplete(video.id)
      .then(() => setCompleted(true))
      .catch(err => { completeFiredRef.current = false; console.error('markComplete failed:', err); });
  }

  // One tick of playback at time `t` (seconds), given total `dur`. Shared by the
  // YouTube poll loop and Vidstack's onTimeUpdate. Accumulates ONLY genuine
  // forward playback (seeks excluded) so skip-to-end can't fake completion.
  function handleTick(t, dur) {
    const delta = t - lastTickRef.current;
    if (delta > 0 && delta < 1.5) watchedRef.current += delta;
    lastTickRef.current = t;

    if (dur > 0) setWatchedPct(Math.min(100, Math.round((watchedRef.current / dur) * 100)));

    if (video?.chapters?.length) {
      let idx = -1;
      for (let i = video.chapters.length - 1; i >= 0; i--) {
        if (t >= video.chapters[i].start_secs) { idx = i; break; }
      }
      setChapterActive(idx);
    }

    if (dur > 0 && !completed && t >= dur * 0.98 && watchedRef.current >= dur * 0.9) {
      markComplete();
    }

    if (isOnline && t - lastSavedRef.current >= 8) {
      lastSavedRef.current = t;
      apiClient('/video-progress', {
        method: 'POST',
        body: JSON.stringify({ video_id: videoId, progress_secs: Math.floor(t) }),
      }).catch(() => {});
    }
  }

  // ── Vidstack callbacks (file sources only) ──────────────────────────────────
  const onCanPlay = () => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const resume = video?.progress_secs || 0;
    if (resume > 10 && playerRef.current) {
      try { playerRef.current.currentTime = resume; lastTickRef.current = resume; } catch { /* ignore */ }
    }
  };
  const onTimeUpdate = () => {
    const p = playerRef.current;
    if (!p) return;
    handleTick(p.currentTime || 0, p.duration || video?.duration_secs || 0);
  };
  const onEnded = () => {
    const dur = playerRef.current?.duration || video?.duration_secs || 0;
    if (!completed && dur > 0 && watchedRef.current >= dur * 0.9) markComplete();
  };

  const isYouTube = video?.source_type === 'youtube';

  // Chapter click → seek whichever player is active.
  const seekTo = (secs) => {
    const p = playerRef.current;
    if (!p) return;
    try { p.currentTime = secs; p.play?.(); } catch { /* ignore */ }
  };

  // Best-effort captions toggle for the YouTube embed. Vidstack's YouTube provider
  // doesn't surface caption tracks, so we drive YouTube's caption module directly
  // via postMessage. Works only when the video actually has captions.
  const toggleCaptions = () => {
    const iframe = playerBoxRef.current?.querySelector('iframe');
    const win = iframe?.contentWindow;
    const next = !cc;
    setCc(next);
    if (!win) return;
    const send = (func, args) => {
      try { win.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch { /* ignore */ }
    };
    if (next) {
      send('loadModule', ['captions']);
      send('setOption', ['captions', 'track', {}]);
    } else {
      send('unloadModule', ['captions']);
    }
  };

  const toggleLike = async () => {
    if (likeBusy) return;
    setLikeBusy(true);
    const next = !liked;
    setLiked(next);
    setLikeCount(c => Math.max(0, c + (next ? 1 : -1)));
    try {
      const res = next ? await videoApi.likeVideo(videoId) : await videoApi.unlikeVideo(videoId);
      if (typeof res?.like_count === 'number') setLikeCount(res.like_count);
      if (typeof res?.liked === 'boolean') setLiked(res.liked);
    } catch {
      // revert on failure
      setLiked(!next);
      setLikeCount(c => Math.max(0, c + (next ? -1 : 1)));
    } finally {
      setLikeBusy(false);
    }
  };

  const handleSaveOffline = async () => {
    if (!video?.allow_download) {
      setSaveError('The teacher has disabled offline saving for this video.');
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaveProgress(0);
    try {
      await saveVideoOffline(videoId, video.cloudflare_video_id, (pct) => setSaveProgress(pct));
      setSaved(true);
      setSaveProgress(100);
      const size = await getCachedVideoSize(videoId);
      if (size) setCachedSize(formatBytes(size));
    } catch (err) {
      setSaveError(err.message || 'Failed to save. Try again.');
      setSaveProgress(null);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOffline = async () => {
    try {
      await removeVideoOffline(videoId);
      setSaved(false);
      setCachedSize(null);
      setSaveProgress(null);
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
      setBlobUrl(null);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-sm text-neutral-500">
        <Loader2 className="animate-spin mr-2" size={18} /> Loading video...
      </div>
    );
  }

  if (!video) {
    return (
      <div className="flex items-center justify-center h-screen text-sm text-neutral-500">
        Video not found.
      </div>
    );
  }

  // ── Resolve the player source by type ────────────────────────────────────────
  const isStorageUrl = video.cloudflare_video_id?.startsWith('https://');
  const showOffline  = !isOnline && blobUrl;

  // Resolve source for Vidstack
  let fileSrc = null;
  if (showOffline) {
    fileSrc = { src: blobUrl, type: 'video/mp4' };
  } else if (isOnline && isStorageUrl) {
    fileSrc = { src: video.cloudflare_video_id, type: 'video/mp4' };
  } else if (isOnline && video.cloudflare_video_id && !isStorageUrl && !isYouTube) {
    fileSrc = { src: `https://videodelivery.net/${video.cloudflare_video_id}/manifest/video.m3u8`, type: 'application/x-mpegurl' };
  } else if (isOnline && isYouTube && ytToken && !ytError) {
    fileSrc = `youtube/${ytToken}`;
  }

  const showYouTubeLoading    = isOnline && isYouTube && !ytToken && !ytError;
  const showOfflineUnavailable = !isOnline && !blobUrl;
  const guardLabel = user?.username || user?.name || 'student';

  return (
    <ScreenshotGuard label={guardLabel}>
    <div className="min-h-screen bg-canvas dark:bg-slate-950" onContextMenu={(e) => e.preventDefault()}>
      {/* Header */}
      <div className="sticky top-0 z-30 bg-canvas/95 dark:bg-slate-950/95 backdrop-blur border-b border-[#EFEDEA] dark:border-slate-800">
        <div className="px-4 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate(`/student/subjects/${classId}`)}
            className="p-2 -ml-2 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-[#F4F2EF] dark:hover:bg-slate-800 rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-base md:text-lg font-semibold flex-1 truncate dark:text-white">{video.title}</h1>
          {completed && <Tag color="green"><CheckCircle2 size={11} className="mr-1 inline" />Done</Tag>}
          {!isOnline && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 rounded-full px-2 py-0.5">
              <WifiOff size={11} /> Offline
            </span>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {/* ── Player (fixed 16/9; same on phone & laptop) ── */}
        {/* The YouTube embed renders its OWN play/pause overlay; taps were reaching
            it AND Vidstack, so two play/pause symbols flashed. Make the iframe
            non-interactive so only Vidstack's controls drive playback.
            Additionally, hide Vidstack's flashing play/pause keyboard action
            display so we don't get duplicate buttons appearing over the video. */}
        <style>{`
          .udaya-player [data-provider="youtube"] iframe, .udaya-player iframe[src*="youtube"] { pointer-events: none !important; }
          .udaya-player .vds-kb-action { display: none !important; }
        `}</style>
        <div ref={playerBoxRef} className="udaya-player relative bg-black w-full overflow-hidden md:rounded-b-xl" style={{ aspectRatio: '16 / 9' }}>
          {fileSrc ? (
            <MediaPlayer
              ref={playerRef}
              src={fileSrc}
              title={video.title}
              poster={video.thumbnail_url || undefined}
              playsInline
              crossOrigin
              aspectRatio="16/9"
              className="absolute inset-0 w-full h-full"
              onCanPlay={onCanPlay}
              onTimeUpdate={onTimeUpdate}
              onEnded={onEnded}
            >
              <MediaProvider />
              <DefaultVideoLayout
                icons={defaultLayoutIcons}
                slots={isYouTube ? {
                  // CC lives INSIDE the player's top controls so it shows in
                  // fullscreen too (an outside overlay would vanish there).
                  topControlsGroupEnd: (
                    <button
                      type="button"
                      className="vds-button"
                      onClick={toggleCaptions}
                      aria-label="Captions"
                      aria-pressed={cc}
                      title={cc ? 'Turn off captions' : 'Turn on captions'}
                    >
                      {cc ? <Captions size={24} /> : <CaptionsOff size={24} />}
                    </button>
                  ),
                } : undefined}
              />
            </MediaPlayer>
          ) : ytError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
              <AlertTriangle size={28} className="text-white/40" />
              <p className="text-white/70 text-sm">{ytError}</p>
              <button onClick={() => navigate(-1)} className="text-white/50 text-xs underline mt-1">Go back</button>
            </div>
          ) : showYouTubeLoading ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-white/60 text-sm">
              <Loader2 className="animate-spin" size={18} /> Loading video…
            </div>
          ) : showOfflineUnavailable ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 px-8 text-center">
              <WifiOff size={40} className="text-white/40" />
              <p className="text-sm font-medium text-white/80">You're offline</p>
              <p className="text-xs text-white/50">
                {saved
                  ? 'Cached video could not be loaded. Try removing and re-saving when online.'
                  : 'Save this video while online to watch it offline.'}
              </p>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/50 text-sm">
              <p>No video available for this lesson.</p>
            </div>
          )}

        </div>

        {/* ── Info panel ── */}
        <div className="px-4 md:px-8 py-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="font-semibold text-lg mb-1 leading-snug dark:text-white">{video.title}</h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 inline-flex items-center gap-1.5">
                <SubjectIcon value={subject?.emoji} size={14} />{subject?.name || 'Subject'}
              </p>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              {/* Like (persisted; teacher sees the count) */}
              <button
                onClick={toggleLike}
                disabled={likeBusy}
                title={liked ? 'Unlike' : 'Like this lesson'}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-60 ${
                  liked ? 'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400' : 'border-[#EFEDEA] dark:border-slate-800 text-neutral-600 dark:text-neutral-300 hover:bg-[#F4F2EF] dark:hover:bg-slate-800'
                }`}
              >
                <Heart size={15} className={liked ? 'fill-rose-500 text-rose-500' : ''} />
                {likeCount > 0 && <span className="tabular-nums">{likeCount}</span>}
              </button>

              {/* Save offline */}
              {!saved && !saving && (
                <button
                  onClick={handleSaveOffline}
                  disabled={!video.cloudflare_video_id || isStorageUrl || !video.allow_download}
                  title={
                    !video.cloudflare_video_id || isStorageUrl
                      ? 'No video to cache'
                      : !video.allow_download
                      ? 'Download disabled by teacher'
                      : 'Save for offline viewing'
                  }
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors border-[#EFEDEA] dark:border-slate-800 text-neutral-600 dark:text-neutral-300 hover:bg-[#F4F2EF] dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <WifiOff size={13} /> Save
                </button>
              )}

              {saving && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#EFEDEA] dark:border-slate-800 text-sm text-neutral-600 dark:text-neutral-300 min-w-[130px]">
                  <Loader2 size={13} className="animate-spin flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs mb-0.5">{saveProgress !== null ? `${saveProgress}%` : 'Downloading…'}</div>
                    <div className="h-1 bg-neutral-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-neutral-800 dark:bg-slate-300 rounded-full transition-all duration-300"
                        style={{ width: saveProgress !== null ? `${saveProgress}%` : '100%' }} />
                    </div>
                  </div>
                </div>
              )}

              {saved && !saving && (
                <div className="flex items-center gap-1">
                  <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                    <Wifi size={13} /> Saved{cachedSize ? ` · ${cachedSize}` : ''}
                  </span>
                  <button onClick={handleRemoveOffline} title="Remove offline copy"
                    className="p-2 rounded-lg border border-[#EFEDEA] dark:border-slate-800 text-neutral-400 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {saveError && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 rounded-lg text-amber-800 dark:text-amber-400 text-sm">
              <AlertTriangle size={15} className="flex-shrink-0" />
              {saveError}
            </div>
          )}

          {saved && !saveError && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800/50 rounded-lg text-green-800 dark:text-green-400 text-sm">
              <CheckCircle2 size={15} className="flex-shrink-0" />
              Video saved to this device. You can watch it without internet.
            </div>
          )}

          {video.description && (
            <Reveal>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-5 leading-relaxed whitespace-pre-wrap">{video.description}</p>
            </Reveal>
          )}

          {/* Chapters */}
          {video?.chapters?.length > 0 && (
            <Reveal className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={13} className="text-neutral-400 dark:text-neutral-500" />
                <p className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Chapters</p>
              </div>
              <div className="glass-panel border-[#EFEDEA] dark:border-slate-800 shadow-sm rounded-xl overflow-hidden divide-y divide-[#EFEDEA] dark:divide-slate-800">
                {[...video.chapters].sort((a, b) => a.start_secs - b.start_secs).map((ch, idx) => (
                  <button key={idx} onClick={() => seekTo(ch.start_secs)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#F4F2EF] dark:hover:bg-slate-800 ${
                      chapterActive === idx ? 'bg-blue-50/60 dark:bg-blue-900/30 border-l-2 border-l-blue-500' : ''
                    }`}>
                    <span className={`text-[11px] font-mono font-medium px-1.5 py-0.5 rounded ${
                      chapterActive === idx ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'bg-neutral-100 dark:bg-slate-800 text-neutral-600 dark:text-neutral-300'
                    }`}>
                      {toMmSs(ch.start_secs)}
                    </span>
                    <span className={`text-sm flex-1 min-w-0 truncate ${
                      chapterActive === idx ? 'font-medium text-blue-800 dark:text-blue-200' : 'text-neutral-700 dark:text-neutral-200'
                    }`}>
                      {ch.title}
                    </span>
                    <Play size={11} className="text-neutral-400 dark:text-neutral-500 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </Reveal>
          )}

          {/* Completion is automatic — marks done once the whole video has actually
              been watched (skipping to the end won't count). */}
          {!completed ? (
            <div className="p-3 bg-neutral-50 dark:bg-slate-900 border border-neutral-200 dark:border-slate-800 rounded-lg">
              <div className="flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                <span className="flex items-center gap-2">
                  <Play size={14} className="text-neutral-400 dark:text-neutral-500" />
                  Watch the full video to complete{!isOnline && ' (syncs when you\'re back online)'}
                </span>
                <span className="font-semibold tabular-nums">{watchedPct}%</span>
              </div>
              <div className="h-1.5 bg-neutral-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-neutral-800 dark:bg-slate-300 rounded-full transition-all duration-300" style={{ width: `${watchedPct}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800/50 rounded-lg text-green-700 dark:text-green-400 text-sm">
              <CheckCircle2 size={16} />
              You've completed this video. Great work!
            </div>
          )}

          {/* Private comments — students see only their own; teacher sees all. */}
          {isOnline && <VideoComments videoId={videoId} />}
        </div>
      </div>
    </div>
    </ScreenshotGuard>
  );
}
