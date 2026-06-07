import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, CheckCircle2, WifiOff, Wifi, ThumbsUp, Loader2, Trash2, AlertTriangle, Clock, Play } from 'lucide-react';
import { Btn, Tag } from '../../components/ui';
import { videoApi, apiClient } from '../../lib/api';
import SubjectIcon from '../../components/shared/SubjectIcon';
import { useAuthStore } from '../../lib/auth';
import ScreenshotGuard from '../../components/shared/ScreenshotGuard';
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

  const [video, setVideo]         = useState(null);
  const [subject, setSubject]     = useState(null);
  const [loading, setLoading]     = useState(true);

  const [completed, setCompleted] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [liked, setLiked]         = useState(false);

  // Offline state
  const [isOnline, setIsOnline]   = useState(navigator.onLine);
  const [saved, setSaved]         = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saveProgress, setSaveProgress] = useState(null); // 0-100 | null
  const [saveError, setSaveError] = useState('');
  const [cachedSize, setCachedSize] = useState(null);
  const [blobUrl, setBlobUrl]     = useState(null);
  const blobUrlRef = useRef(null);
  const videoRef = useRef(null);
  const iframeRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [ytToken, setYtToken]         = useState(null);
  const [ytPlayerReady, setYtPlayerReady] = useState(false);
  const [ytError, setYtError]         = useState(null);
  const ytPlayerRef   = useRef(null);
  const ytProgressRef = useRef(null);
  const [chapterActive, setChapterActive] = useState(-1);
  const [isPlaying,          setIsPlaying]          = useState(false);
  const [duration,           setDuration]           = useState(0);
  const [volume,             setVolume]             = useState(100);
  const [isMuted,            setIsMuted]            = useState(false);
  const [showControls,       setShowControls]       = useState(true);
  const [playbackRate,       setPlaybackRate]       = useState(1);
  const [quality,            setQuality]            = useState('auto');
  const [availableQualities, setAvailableQualities] = useState([]);
  const [showSpeedMenu,      setShowSpeedMenu]      = useState(false);
  const [showQualityMenu,    setShowQualityMenu]    = useState(false);
  const [seekFeedback,       setSeekFeedback]       = useState(null);
  const [ccEnabled,          setCcEnabled]          = useState(false);
  const [isFullscreen,       setIsFullscreen]       = useState(false);
  const playerContainerRef  = useRef(null);
  const controlsTimerRef    = useRef(null);
  const tapTimerRef         = useRef(null);
  const lastTapRef          = useRef({ time: 0, zone: null });
  const singleTapTimerRef   = useRef(null);

  // Throttled time update (250ms instead of 60fps)
  useEffect(() => {
    let interval;
    const updateTime = () => {
      if (ytPlayerRef.current?.getCurrentTime) {
        const t = ytPlayerRef.current.getCurrentTime();
        setCurrentTime(t);
        const d = ytPlayerRef.current.getDuration?.();
        if (d && d > 0) setDuration(d);
        if (video?.chapters?.length) {
          let idx = -1;
          for (let i = video.chapters.length - 1; i >= 0; i--) {
            if (t >= video.chapters[i].start_secs) { idx = i; break; }
          }
          setChapterActive(idx);
        }
      }
    };
    interval = setInterval(updateTime, 250);
    return () => clearInterval(interval);
  }, [video?.chapters]);

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
      // Get cached size for display
      getCachedVideoSize(videoId).then(size => {
        if (size) setCachedSize(formatBytes(size));
      });

      // If currently offline, load the blob URL so playback works
      if (!navigator.onLine) {
        getCachedVideoBlobUrl(videoId).then(url => {
          if (url) {
            blobUrlRef.current = url;
            setBlobUrl(url);
          }
        });
      }
    }

    return () => {
      // Revoke blob URL on unmount to free memory
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
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
        if (url) {
          blobUrlRef.current = url;
          setBlobUrl(url);
        }
      });
    }
  }, [isOnline, saved, blobUrl, videoId]);

  function startYtProgress(player) {
    stopYtProgress();
    ytProgressRef.current = setInterval(async () => {
      try {
        const currentTime = Math.floor(player.getCurrentTime());
        const duration    = Math.floor(player.getDuration());
        await apiClient('/video-progress', {
          method: 'POST',
          body: JSON.stringify({ video_id: videoId, progress_secs: currentTime }),
        });
        if (duration > 0 && currentTime / duration >= 0.9 && !completed) {
          markComplete();
        }
      } catch { /* silent — do not interrupt playback */ }
    }, 5000);
  }

  function stopYtProgress() {
    if (ytProgressRef.current) {
      clearInterval(ytProgressRef.current);
      ytProgressRef.current = null;
    }
  }

  // Load YouTube IFrame API and init player when token is ready
  useEffect(() => {
    if (!ytToken) return;

    function loadYTApi() {
      return new Promise(resolve => {
        if (window.YT?.Player) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
        window.onYouTubeIframeAPIReady = resolve;
        // Immediate resolve if already loaded
        if (window.YT?.Player) resolve();
      });
    }

    loadYTApi().then(() => {
      ytPlayerRef.current = new window.YT.Player('yt-player-mount', {
        videoId: ytToken,
        playerVars: {
          controls: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          disablekb: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          cc_load_policy: 0,
        },
        events: {
          onReady: e => {
            setYtPlayerReady(true);
            setDuration(e.target.getDuration());
            setVolume(e.target.getVolume());
            setIsMuted(e.target.isMuted());
            const quals = e.target.getAvailableQualityLevels() || [];
            setAvailableQualities(quals);
            const saved = video?.progress_secs || 0;
            if (saved > 30) e.target.seekTo(saved, true);
          },
          onStateChange: e => {
            const S = window.YT.PlayerState;
            setIsPlaying(e.data === S.PLAYING);
            if (e.data === S.PLAYING) {
              startYtProgress(e.target);
              // Refresh quality list once playback starts (more accurate than onReady)
              const quals = e.target.getAvailableQualityLevels?.() || [];
              if (quals.length > 0) setAvailableQualities(quals);
            } else {
              stopYtProgress();
            }
            if (e.data === S.ENDED) markComplete();
          },
          onError: () => setYtError('Video cannot be played. Make sure it is Unlisted on YouTube.'),
        },
      });
    });

    return () => {
      stopYtProgress();
      ytPlayerRef.current?.destroy?.();
    };
  }, [ytToken]);

  const handleTimeUpdate = useCallback(() => {
    const t = videoRef.current?.currentTime;
    if (t == null) return;
    setCurrentTime(t);
    if (video?.chapters?.length) {
      let idx = -1;
      for (let i = video.chapters.length - 1; i >= 0; i--) {
        if (t >= video.chapters[i].start_secs) { idx = i; break; }
      }
      setChapterActive(idx);
    }
  }, [video?.chapters]);

  const seekTo = (secs) => {
    if (videoRef.current) {
      videoRef.current.currentTime = secs;
      videoRef.current.play();
    } else if (iframeRef.current) {
      iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: 'seek', data: secs }), '*');
    } else if (ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(secs);
      ytPlayerRef.current.playVideo();
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  function showControlsTemporarily() {
    setShowControls(true);
    clearTimeout(controlsTimerRef.current);
    if (ytPlayerRef.current?.getPlayerState?.() === 1) {
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }

  function toggleControlsVisibility() {
    setShowControls(prev => {
      clearTimeout(controlsTimerRef.current);
      if (prev) {
        return false;
      } else {
        if (ytPlayerRef.current?.getPlayerState?.() === 1) {
          controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
        }
        return true;
      }
    });
  }

  function seekRelative(secs) {
    const p = ytPlayerRef.current;
    if (!p) return;
    const dur = p.getDuration?.() || 0;
    p.seekTo(Math.max(0, Math.min(p.getCurrentTime() + secs, dur)), true);
    setSeekFeedback({ side: secs > 0 ? 'right' : 'left' });
    clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => setSeekFeedback(null), 700);
  }

  function handleKeyDown(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    const p = ytPlayerRef.current;
    if (!p) return;
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        p.getPlayerState() === 1 ? p.pauseVideo() : p.playVideo();
        break;
      case 'ArrowLeft':  e.preventDefault(); seekRelative(-10); break;
      case 'ArrowRight': e.preventDefault(); seekRelative(10);  break;
      case 'ArrowUp': {
        e.preventDefault();
        const vUp = Math.min(100, (p.getVolume() || 0) + 10);
        p.setVolume(vUp); setVolume(vUp); p.unMute(); setIsMuted(false);
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        const vDn = Math.max(0, (p.getVolume() || 0) - 10);
        p.setVolume(vDn); setVolume(vDn);
        break;
      }
      case 'm':
        p.isMuted() ? (p.unMute(), setIsMuted(false)) : (p.mute(), setIsMuted(true));
        break;
      case 'f':
        toggleFullscreen();
        break;
    }
    showControlsTemporarily();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      playerContainerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  function handlePlayerTap(e) {
    const container = playerContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clientX = e.clientX ?? e.changedTouches?.[0]?.clientX ?? (rect.left + rect.width / 2);
    const pct = (clientX - rect.left) / rect.width;
    const zone = pct < 0.3 ? 'left' : pct > 0.7 ? 'right' : 'center';
    const now = Date.now();
    const last = lastTapRef.current;
    
    clearTimeout(singleTapTimerRef.current);
    
    if (now - last.time < 300 && last.zone === zone) {
      // Double-tap detected
      lastTapRef.current = { time: 0, zone: null };
      if (zone === 'left')       seekRelative(-10);
      else if (zone === 'right') seekRelative(10);
      else                       toggleFullscreen();
    } else {
      // First tap — wait to see if double-tap follows
      lastTapRef.current = { time: now, zone };
      singleTapTimerRef.current = setTimeout(() => {
        // Single tap toggles controls visibility instead of pausing
        toggleControlsVisibility();
      }, 300);
    }
  }

  function toggleCC() {
    const p = ytPlayerRef.current;
    if (!p) return;
    if (ccEnabled) {
      p.setOption('captions', 'track', {});
      setCcEnabled(false);
    } else {
      p.loadModule('captions');
      p.setOption('captions', 'track', { languageCode: 'en' });
      setCcEnabled(true);
    }
  }

  const handleMarkComplete = async () => {
    setIsMarking(true);
    try {
      await videoApi.markComplete(video.id);
      setCompleted(true);
    } catch (err) {
      console.error(err);
      alert('Failed to mark as completed.');
    } finally {
      setIsMarking(false);
    }
  };

  function markComplete() {
    if (completed) return;
    videoApi.markComplete(video.id)
      .then(() => setCompleted(true))
      .catch(err => console.error('markComplete failed:', err));
  }

  const handleSaveOffline = async () => {
    if (!video?.allow_download) {
      setSaveError('The teacher has disabled offline saving for this video.');
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaveProgress(0);
    try {
      await saveVideoOffline(videoId, video.cloudflare_video_id, (pct) => {
        setSaveProgress(pct);
      });
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
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
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

  // Decide what to render in the player area
  const isStorageUrl = video.cloudflare_video_id?.startsWith('https://');
  const isYouTube = video.source_type === 'youtube';
  const showOfflinePlayer = !isOnline && blobUrl;
  const showOfflineUnavailable = !isOnline && !blobUrl;
  const showCloudflarePlayer = isOnline && video.cloudflare_video_id && !isStorageUrl;
  const showStoragePlayer = isOnline && isStorageUrl;
  const showYouTubePlayer = isOnline && isYouTube && ytToken;
  const showYouTubeLoading = isOnline && isYouTube && !ytToken;
  const showNoPlayer = isOnline && !video.cloudflare_video_id && !isYouTube;

  if (video?.source_type === 'youtube') {
    const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const QUALITY_LABELS = {
      hd1080: '1080p', hd720: '720p', large: '480p',
      medium: '360p', small: '240p', tiny: '144p', auto: 'Auto',
    };

    const guardLabel = user?.username || user?.name || 'student';
    return (
      <ScreenshotGuard label={guardLabel} className="min-h-screen bg-black flex flex-col">
      <div className="min-h-screen bg-black flex flex-col">

        {/* Player container */}
        <div
          ref={playerContainerRef}
          className="relative w-full bg-black select-none outline-none"
          style={{ aspectRatio: '16/9' }}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onMouseMove={showControlsTemporarily}
        >
          {/* Empty div — YT.Player constructor injects controlled iframe here */}
          <div id="yt-player-mount" className="w-full h-full" />

          {/* Transparent click interceptor — blocks YouTube overlay UI and handles
              tap gestures: single-center=play/pause, double-left=−10s,
              double-right=+10s, double-center=fullscreen */}
          <div
            className="absolute inset-0"
            style={{ zIndex: 2, touchAction: 'manipulation' }}
            onClick={handlePlayerTap}
          />

          {/* Pause overlay — visually covers YouTube pause screen (logo + copy-link UI) */}
          {!isPlaying && ytPlayerReady && !ytError && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ zIndex: 3, background: 'rgba(0,0,0,0.5)' }}
            >
              <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                <svg width="28" height="28" fill="white" viewBox="0 0 24 24">
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
              </div>
            </div>
          )}

          {/* Loading spinner */}
          {!ytPlayerReady && !ytError && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 5 }}>
              <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* Error */}
          {ytError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center" style={{ zIndex: 5 }}>
              <p className="text-white/70 text-sm">{ytError}</p>
              <button onClick={() => navigate(-1)} className="text-white/50 text-xs underline mt-1">Go back</button>
            </div>
          )}

          {/* Seek feedback flash */}
          {seekFeedback && (
            <div className={`absolute top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center gap-1 ${seekFeedback.side === 'left' ? 'left-8' : 'right-8'}`} style={{ zIndex: 12 }}>
              <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <span className="text-white text-xl font-bold">{seekFeedback.side === 'left' ? '«' : '»'}</span>
              </div>
              <span className="text-white/80 text-xs font-medium">10s</span>
            </div>
          )}

          {/* Back button */}
          <button
            onClick={(e) => { e.stopPropagation(); navigate(-1); }}
            className="absolute top-3 left-3 z-20 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>

          {/* Custom control bar (auto-hides while playing) */}
          <div
            className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{ zIndex: 15 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none rounded-b" />

            <div className="relative px-3 pb-3 pt-8">
              {/* Progress bar */}
              <div className="mb-2">
                <input
                  type="range"
                  min={0} max={duration || 100} step={0.5}
                  value={currentTime}
                  onMouseDown={() => {
                    clearTimeout(controlsTimerRef.current);
                    setShowControls(true);
                  }}
                  onChange={e => {
                    const v = Number(e.target.value);
                    ytPlayerRef.current?.seekTo(v, true);
                    setCurrentTime(v);
                  }}
                  onMouseUp={showControlsTemporarily}
                  onTouchEnd={showControlsTemporarily}
                  className="w-full h-1 accent-white cursor-pointer"
                  style={{ background: `linear-gradient(to right, white ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.3) 0%)` }}
                />
              </div>

              {/* Controls row */}
              <div className="flex items-center gap-2 text-white">
                {/* Play/Pause */}
                <button
                  onClick={() => {
                    const p = ytPlayerRef.current;
                    p?.getPlayerState() === 1 ? p.pauseVideo() : p.playVideo();
                  }}
                  className="p-1 hover:text-white/80 transition-colors flex-shrink-0"
                >
                  {isPlaying ? (
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                      <polygon points="5,3 19,12 5,21"/>
                    </svg>
                  )}
                </button>

                {/* Time */}
                <span className="text-xs font-mono flex-shrink-0 tabular-nums">
                  {toMmSs(currentTime)} / {toMmSs(duration)}
                </span>

                <div className="flex-1" />

                {/* Mute */}
                <button
                  onClick={() => {
                    const p = ytPlayerRef.current;
                    if (!p) return;
                    if (isMuted) { p.unMute(); setIsMuted(false); }
                    else         { p.mute();   setIsMuted(true);  }
                  }}
                  className="p-1 hover:text-white/80 transition-colors flex-shrink-0"
                >
                  {isMuted || volume === 0 ? (
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                      <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                  )}
                </button>

                {/* Speed */}
                <div className="relative">
                  <button
                    onClick={() => { setShowSpeedMenu(prev => !prev); setShowQualityMenu(false); }}
                    className="text-xs font-medium px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    {playbackRate === 1 ? '1×' : `${playbackRate}×`}
                  </button>
                  {showSpeedMenu && (
                    <div className="absolute bottom-8 right-0 bg-black/90 backdrop-blur-sm rounded-lg overflow-hidden min-w-[80px] shadow-xl border border-white/10">
                      {SPEEDS.map(s => (
                        <button key={s} onClick={() => {
                          ytPlayerRef.current?.setPlaybackRate(s);
                          setPlaybackRate(s);
                          setShowSpeedMenu(false);
                        }} className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors ${playbackRate === s ? 'text-white font-semibold' : 'text-white/70'}`}>
                          {s === 1 ? 'Normal' : `${s}×`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quality */}
                <div className="relative">
                  <button
                    onClick={() => { setShowQualityMenu(prev => !prev); setShowSpeedMenu(false); }}
                    className="text-xs font-medium px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    {QUALITY_LABELS[quality] || 'Auto'}
                  </button>
                  {showQualityMenu && (
                    <div className="absolute bottom-8 right-0 bg-black/90 backdrop-blur-sm rounded-lg overflow-hidden min-w-[80px] shadow-xl border border-white/10">
                      {/* Use player-reported qualities when available; fall back to full fixed list */}
                      {(availableQualities.length > 0
                        ? ['auto', ...availableQualities]
                        : ['auto', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny']
                      ).map(q => (
                        <button key={q} onClick={() => {
                          ytPlayerRef.current?.setPlaybackQuality(q);
                          setQuality(q);
                          setShowQualityMenu(false);
                        }} className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors ${quality === q ? 'text-white font-semibold' : 'text-white/70'}`}>
                          {QUALITY_LABELS[q] || q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* CC */}
                <button
                  onClick={toggleCC}
                  className={`text-xs font-bold px-1.5 py-0.5 rounded transition-colors ${ccEnabled ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                >
                  CC
                </button>

                {/* Fullscreen */}
                <button onClick={toggleFullscreen} className="p-1 hover:text-white/80 transition-colors flex-shrink-0">
                  {isFullscreen ? (
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 0 2 2v3"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Info below player */}
        <div className="flex-1 bg-[#FAFAF9] px-4 py-4 space-y-2">
          <h1 className="text-lg md:text-xl font-semibold text-neutral-900">{video.title}</h1>
          {video.description && (
            <p className="text-sm text-neutral-500 leading-relaxed">{video.description}</p>
          )}
          {completed && (
            <div className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
              <CheckCircle size={14} /> Completed · +10 points
            </div>
          )}
        </div>

      </div>
      </ScreenshotGuard>
    );
  }

  const guardLabel = user?.username || user?.name || 'student';
  return (
    <ScreenshotGuard label={guardLabel}>
    <div>
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
        {/* ── Video player area ── */}
        <div className="relative bg-neutral-900 aspect-video flex items-center justify-center">
          {showCloudflarePlayer && (
            <iframe
              ref={iframeRef}
              src={`https://iframe.cloudflarestream.com/${video.cloudflare_video_id}`}
              className="w-full h-full border-0"
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
              allowFullScreen
              title={video.title}
            />
          )}
          {showStoragePlayer && (
            <video
              ref={videoRef}
              src={video.cloudflare_video_id}
              controls
              className="w-full h-full"
              controlsList={video.allow_download ? '' : 'nodownload'}
              title={video.title}
              onTimeUpdate={handleTimeUpdate}
            />
          )}
          {showYouTubeLoading && (
            <div className="flex items-center gap-2 text-white/60 text-sm">
              <Loader2 className="animate-spin" size={18} />
              Loading video...
            </div>
          )}
          {showYouTubePlayer && (
            <div id="yt-player-mount" className="w-full h-full" />
          )}
          {showOfflinePlayer && (
            <video
              ref={videoRef}
              src={blobUrl}
              className="w-full h-full"
              controls
              autoPlay={false}
              title={video.title}
              onTimeUpdate={handleTimeUpdate}
            />
          )}
          {showOfflineUnavailable && (
            <div className="flex flex-col items-center gap-3 text-white/70 px-8 text-center">
              <WifiOff size={40} className="text-white/40" />
              <p className="text-sm font-medium text-white/80">You're offline</p>
              <p className="text-xs text-white/50">
                {saved
                  ? 'Cached video could not be loaded. Try removing and re-saving when online.'
                  : 'Save this video while online to watch it offline.'}
              </p>
            </div>
          )}
          {showNoPlayer && (
            <div className="flex flex-col items-center gap-3 text-white/50 text-sm">
              <p>No video available for this lesson.</p>
            </div>
          )}
        </div>

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
                    <div className="text-xs mb-0.5">
                      {saveProgress !== null ? `${saveProgress}%` : 'Downloading…'}
                    </div>
                    <div className="h-1 bg-neutral-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-neutral-800 rounded-full transition-all duration-300"
                        style={{ width: saveProgress !== null ? `${saveProgress}%` : '100%' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {saved && !saving && (
                <div className="flex items-center gap-1">
                  <span className="flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm border-green-200 bg-green-50 text-green-700">
                    <Wifi size={13} /> Saved{cachedSize ? ` · ${cachedSize}` : ''}
                  </span>
                  <button
                    onClick={handleRemoveOffline}
                    title="Remove offline copy"
                    className="p-2 rounded-md border border-white/60 text-neutral-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Save error */}
          {saveError && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
              <AlertTriangle size={15} className="flex-shrink-0" />
              {saveError}
            </div>
          )}

          {/* Saved offline notice */}
          {saved && !saveError && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
              <CheckCircle2 size={15} className="flex-shrink-0" />
              Video saved to this device. You can watch it without internet.
            </div>
          )}

          {video.description && (
            <p className="text-sm text-neutral-600 mb-5 leading-relaxed">{video.description}</p>
          )}

          {/* Chapters */}
          {video?.chapters?.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={13} className="text-neutral-400" />
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Chapters</p>
              </div>
              <div className="glass-panel border-white/60 shadow-sm rounded-xl overflow-hidden divide-y divide-white/40">
                {video.chapters.sort((a, b) => a.start_secs - b.start_secs).map((ch, idx) => (
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
            </div>
          )}

          {!completed && isOnline && (
            <Btn
              variant="primary"
              onClick={handleMarkComplete}
              icon={CheckCircle2}
              className="w-full justify-center"
              disabled={isMarking}
            >
              {isMarking ? 'Marking...' : 'Mark as completed'}
            </Btn>
          )}
          {!completed && !isOnline && (
            <div className="flex items-center gap-2 p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-500 text-sm">
              <WifiOff size={15} />
              Connect to the internet to mark this video as completed.
            </div>
          )}
          {completed && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              <CheckCircle2 size={16} />
              You've completed this video. Great work!
            </div>
          )}
        </div>
      </div>
    </div>
    </ScreenshotGuard>
  );
}
