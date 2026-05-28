import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, CheckCircle2, WifiOff, Wifi, ThumbsUp, Loader2, Trash2, AlertTriangle, Clock, Play } from 'lucide-react';
import { Btn, Tag } from '../../components/ui';
import { videoApi, apiClient } from '../../lib/api';
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
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, modestbranding: 1, fs: 1, iv_load_policy: 3, controls: 1 },
        events: {
          onReady: e => {
            setYtPlayerReady(true);
            const saved = video?.progress_secs || 0;
            if (saved > 30) e.target.seekTo(saved, true);
          },
          onStateChange: e => {
            const S = window.YT.PlayerState;
            if (e.data === S.PLAYING) startYtProgress(e.target);
            else stopYtProgress();
            if (e.data === S.ENDED) markComplete();
          },
          onError: () => {
            setYtError('Video cannot be played. Make sure the video is Unlisted on YouTube.');
          },
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
    return (
      <div className="min-h-screen bg-black flex flex-col">

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 z-20 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white"
        >
          <ArrowLeft size={18} />
        </button>

        {/* Player container */}
        <div className="w-full bg-black" style={{ aspectRatio: '16/9', position: 'relative' }}>
          {ytError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
              <p className="text-white/70 text-sm">{ytError}</p>
              <button onClick={() => navigate(-1)} className="text-white/50 text-xs underline mt-1">Go back</button>
            </div>
          ) : (
            <>
              {!ytPlayerReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              )}
              <div id="yt-player-mount" className="w-full h-full" />
            </>
          )}
        </div>

        {/* Info below player */}
        <div className="flex-1 bg-[#FAFAF9] px-4 py-4 space-y-2">
          <h1 className="text-base font-semibold text-neutral-900">{video.title}</h1>
          {video.description && (
            <p className="text-sm text-neutral-500 leading-relaxed">{video.description}</p>
          )}
          {completed && (
            <div className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
              <CheckCircle size={14} />
              Completed · +10 points
            </div>
          )}
        </div>

      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate(`/student/subjects/${classId}`)}
            className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-white/60 rounded-md">
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-base font-semibold flex-1 truncate">{video.title}</h1>
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
              <p className="text-sm text-neutral-500">{subject?.emoji} {subject?.name || 'Subject'}</p>
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
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm transition-colors border-white/60 text-neutral-600 hover:bg-white/40 disabled:opacity-40 disabled:cursor-not-allowed"
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
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/40 ${
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
  );
}
