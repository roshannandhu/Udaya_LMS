import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, CheckCircle2, WifiOff, Wifi, ThumbsUp, Loader2, Trash2, AlertTriangle, Clock, Play } from 'lucide-react';
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

// YouTube quality levels (value = YouTube's code, label = what students see).
const YT_QUALITIES = [
  { value: 'default', label: 'Auto' },
  { value: 'hd1080',  label: '1080p' },
  { value: 'hd720',   label: '720p' },
  { value: 'large',   label: '480p' },
  { value: 'medium',  label: '360p' },
];

// Scoped fix for the "two play buttons" bug on YouTube: the cross-origin YouTube
// iframe renders its OWN centre play button (can't be hidden via CSS), so we make
// the iframe non-interactive (all taps go to Vidstack's gesture/controls layer)
// and hide Vidstack's large centre start-button — leaving YouTube's single button
// as the only one, fully driven by Vidstack's control bar.
const PLAYER_FIX_CSS = `
  .udaya-player [data-provider="youtube"] iframe { pointer-events: none !important; }
  .udaya-player media-play-button[data-media-button][data-paused],
  .udaya-player .vds-play-button.vds-big-button { display: none !important; }
`;

export default function StudentVideoPlayerPage() {
  const { classId, videoId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);

  const playerRef = useRef(null);
  const playerBoxRef = useRef(null);

  const [video, setVideo]         = useState(null);
  const [subject, setSubject]     = useState(null);
  const [loading, setLoading]     = useState(true);

  const [completed, setCompleted] = useState(false);
  const [liked, setLiked]         = useState(false);

  // YouTube quality (best-effort: a request to YouTube, which may auto-adjust)
  const [quality, setQuality]     = useState('default');
  const [showQuality, setShowQuality] = useState(false);

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

  // Playback state (drives chapter highlight + progress save + completion)
  const [currentTime, setCurrentTime] = useState(0);
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

  // ── Unified player lifecycle (works for every source via Vidstack) ──────────

  // Reset per-video watch tracking whenever the video changes (and seed coverage
  // from saved progress so a returning student isn't forced to re-watch).
  useEffect(() => {
    resumedRef.current = false;
    completeFiredRef.current = false;
    watchedRef.current = video?.progress_secs || 0;
    lastTickRef.current = 0;
    lastSavedRef.current = 0;
    setWatchedPct(0);
  }, [video?.id]);

  function markComplete() {
    if (completed || completeFiredRef.current) return;
    completeFiredRef.current = true;
    videoApi.markComplete(video.id)
      .then(() => setCompleted(true))
      .catch(err => { completeFiredRef.current = false; console.error('markComplete failed:', err); });
  }

  // Resume from the last saved position once the media is ready to play.
  const onCanPlay = () => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const resume = video?.progress_secs || 0;
    if (resume > 10 && playerRef.current) {
      try { playerRef.current.currentTime = resume; lastTickRef.current = resume; } catch { /* ignore */ }
    }
  };

  // Fires ~4x/sec; we read live values off the player ref (provider-agnostic),
  // update the chapter highlight, accumulate GENUINE watched time (so completion
  // can't be gamed by skipping to the end), throttle the progress POST to ~8s, and
  // auto-complete only when the whole video has actually been watched.
  const onTimeUpdate = () => {
    const p = playerRef.current;
    if (!p) return;
    const t = p.currentTime || 0;
    const dur = p.duration || video?.duration_secs || 0;
    setCurrentTime(t);

    // Accumulate watched seconds only across normal playback steps. A forward seek
    // produces a big delta and a rewind a negative one — both are ignored, so only
    // time the student actually sat through counts toward completion.
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

    // Auto-complete: must have reached the end AND genuinely watched ~all of it.
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
  };

  // Reaching the natural end still requires real coverage (can't skip-to-end).
  const onEnded = () => {
    const dur = playerRef.current?.duration || video?.duration_secs || 0;
    if (!completed && dur > 0 && watchedRef.current >= dur * 0.9) markComplete();
  };

  // Best-effort YouTube quality: post the (deprecated-but-harmless) quality
  // commands straight to the embed iframe. YouTube may honour or auto-adjust it.
  const setYouTubeQuality = (q) => {
    setQuality(q);
    setShowQuality(false);
    const iframe = playerBoxRef.current?.querySelector('iframe');
    const win = iframe?.contentWindow;
    if (!win || q === 'default') return;
    const origin = 'https://www.youtube-nocookie.com';
    try {
      win.postMessage(JSON.stringify({ event: 'command', func: 'setPlaybackQualityRange', args: [q, q] }), origin);
      win.postMessage(JSON.stringify({ event: 'command', func: 'setPlaybackQuality', args: [q] }), origin);
    } catch { /* ignore */ }
  };

  // Chapter click → seek the unified player (works for ALL sources now).
  const seekTo = (secs) => {
    const p = playerRef.current;
    if (!p) return;
    try { p.currentTime = secs; p.play?.(); } catch { /* ignore */ }
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

  // ── Resolve the single player source by type ────────────────────────────────
  const isStorageUrl = video.cloudflare_video_id?.startsWith('https://');
  const isYouTube    = video.source_type === 'youtube';
  const showOffline  = !isOnline && blobUrl;

  let playerSrc = null;
  if (showOffline) {
    playerSrc = { src: blobUrl, type: 'video/mp4' };
  } else if (isYouTube && ytToken) {
    playerSrc = `youtube/${ytToken}`;
  } else if (isOnline && isStorageUrl) {
    playerSrc = { src: video.cloudflare_video_id, type: 'video/mp4' };
  } else if (isOnline && video.cloudflare_video_id && !isStorageUrl && !isYouTube) {
    // Cloudflare Stream UID → HLS manifest
    playerSrc = { src: `https://videodelivery.net/${video.cloudflare_video_id}/manifest/video.m3u8`, type: 'application/x-mpegurl' };
  }

  const showYouTubeLoading    = isOnline && isYouTube && !ytToken && !ytError;
  const showOfflineUnavailable = !isOnline && !blobUrl;
  const guardLabel = user?.username || user?.name || 'student';

  return (
    <ScreenshotGuard label={guardLabel}>
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate(`/student/subjects/${classId}`)}
            className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-md">
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg md:text-xl font-semibold flex-1 truncate">{video.title}</h1>
          {completed && <Tag color="green"><CheckCircle2 size={11} className="mr-1 inline" />Done</Tag>}
          {!isOnline && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              <WifiOff size={11} /> Offline
            </span>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {/* ── Unified player ── (fixed 16/9 box; same on phone & laptop) */}
        <style>{PLAYER_FIX_CSS}</style>
        <div ref={playerBoxRef} className="udaya-player relative bg-black w-full overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
          {playerSrc && !ytError ? (
            <MediaPlayer
              ref={playerRef}
              src={playerSrc}
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
              <DefaultVideoLayout icons={defaultLayoutIcons} />
            </MediaPlayer>
          ) : ytError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
              <AlertTriangle size={28} className="text-white/40" />
              <p className="text-white/70 text-sm">{ytError}</p>
              <button onClick={() => navigate(-1)} className="text-white/50 text-xs underline mt-1">Go back</button>
            </div>
          ) : showYouTubeLoading ? (
            <div className="absolute inset-0 flex items-center gap-2 items-center justify-center text-white/60 text-sm">
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

          {/* YouTube-only best-effort quality picker (top-right). YouTube may
              still auto-adjust — it's a request, not a guarantee. */}
          {isYouTube && playerSrc && !ytError && (
            <div className="absolute top-2 right-2 z-30">
              <button
                onClick={() => setShowQuality(s => !s)}
                className="px-2.5 py-1 rounded-md bg-black/55 backdrop-blur-sm text-white text-[11px] font-semibold hover:bg-black/75 transition-colors"
                title="Video quality (YouTube may auto-adjust)"
              >
                {YT_QUALITIES.find(q => q.value === quality)?.label || 'Auto'}
              </button>
              {showQuality && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowQuality(false)} />
                  <div className="absolute right-0 mt-1 z-20 min-w-[112px] rounded-lg bg-black/90 backdrop-blur-sm border border-white/10 shadow-xl overflow-hidden">
                    <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40 border-b border-white/10">Quality</p>
                    {YT_QUALITIES.map(q => (
                      <button key={q.value} onClick={() => setYouTubeQuality(q.value)}
                        className={`block w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-white/10 ${quality === q.value ? 'text-white font-semibold' : 'text-white/70'}`}>
                        {q.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Info panel ── */}
        <div className="px-5 md:px-8 py-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-lg mb-1">{video.title}</h2>
              <p className="text-sm text-neutral-500 inline-flex items-center gap-1.5"><SubjectIcon value={subject?.emoji} size={14} />{subject?.name || 'Subject'}</p>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setLiked(!liked)}
                className={`p-2 rounded-md border transition-colors ${liked ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-white/60 text-neutral-500 hover:text-neutral-900'}`}
              >
                <ThumbsUp size={15} />
              </button>

              {/* ── Save offline button ── */}
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
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm transition-colors border-white/60 text-neutral-600 hover:bg-[#F4F2EF] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <WifiOff size={13} /> Save offline
                </button>
              )}

              {saving && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-white/60 text-sm text-neutral-600 min-w-[130px]">
                  <Loader2 size={13} className="animate-spin flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs mb-0.5">{saveProgress !== null ? `${saveProgress}%` : 'Downloading…'}</div>
                    <div className="h-1 bg-neutral-200 rounded-full overflow-hidden">
                      <div className="h-full bg-neutral-800 rounded-full transition-all duration-300"
                        style={{ width: saveProgress !== null ? `${saveProgress}%` : '100%' }} />
                    </div>
                  </div>
                </div>
              )}

              {saved && !saving && (
                <div className="flex items-center gap-1">
                  <span className="flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm border-green-200 bg-green-50 text-green-700">
                    <Wifi size={13} /> Saved{cachedSize ? ` · ${cachedSize}` : ''}
                  </span>
                  <button onClick={handleRemoveOffline} title="Remove offline copy"
                    className="p-2 rounded-md border border-white/60 text-neutral-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {saveError && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
              <AlertTriangle size={15} className="flex-shrink-0" />
              {saveError}
            </div>
          )}

          {saved && !saveError && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
              <CheckCircle2 size={15} className="flex-shrink-0" />
              Video saved to this device. You can watch it without internet.
            </div>
          )}

          {video.description && (
            <Reveal>
              <p className="text-sm text-neutral-600 mb-5 leading-relaxed">{video.description}</p>
            </Reveal>
          )}

          {/* Chapters */}
          {video?.chapters?.length > 0 && (
            <Reveal className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={13} className="text-neutral-400" />
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Chapters</p>
              </div>
              <div className="glass-panel border-white/60 shadow-sm rounded-xl overflow-hidden divide-y divide-white/40">
                {[...video.chapters].sort((a, b) => a.start_secs - b.start_secs).map((ch, idx) => (
                  <button key={idx} onClick={() => seekTo(ch.start_secs)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#F4F2EF] ${
                      chapterActive === idx ? 'bg-blue-50/60 border-l-2 border-l-blue-500' : ''
                    }`}>
                    <span className={`text-[11px] font-mono font-medium px-1.5 py-0.5 rounded ${
                      chapterActive === idx ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-600'
                    }`}>
                      {toMmSs(ch.start_secs)}
                    </span>
                    <span className={`text-sm flex-1 min-w-0 truncate ${
                      chapterActive === idx ? 'font-medium text-blue-800' : 'text-neutral-700'
                    }`}>
                      {ch.title}
                    </span>
                    <Play size={11} className="text-neutral-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </Reveal>
          )}

          {/* Completion is automatic — it marks done once the whole video has
              actually been watched (skipping to the end won't count). */}
          {!completed && (
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
              <div className="flex items-center justify-between text-sm text-neutral-600 mb-2">
                <span className="flex items-center gap-2">
                  <Play size={14} className="text-neutral-400" />
                  Watch the full video to complete{!isOnline && ' (syncs when you\'re back online)'}
                </span>
                <span className="font-semibold tabular-nums">{watchedPct}%</span>
              </div>
              <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                <div className="h-full bg-neutral-800 rounded-full transition-all duration-300" style={{ width: `${watchedPct}%` }} />
              </div>
            </div>
          )}
          {completed && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
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
