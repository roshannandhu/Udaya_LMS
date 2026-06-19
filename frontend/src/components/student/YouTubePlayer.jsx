import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Subtitles, Loader2, RotateCcw } from 'lucide-react';

// ── YouTube IFrame API loader (singleton) ───────────────────────────────────
let _ytApiPromise = null;
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (_ytApiPromise) return _ytApiPromise;
  _ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev && prev(); resolve(window.YT); };
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
  return _ytApiPromise;
}

function fmt(secs) {
  if (!secs || secs < 0 || !isFinite(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${(m % 60).toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Branded YouTube player with our OWN controls (controls=0). The YouTube iframe
 * is made non-interactive (pointer-events:none) so none of YouTube's chrome
 * (logo, channel, "Watch on YouTube", context menu, related videos) is ever
 * reachable; we drive playback through the IFrame API. Right-click / long-press
 * copy is blocked. Exposes seekTo() via ref.
 */
const YouTubePlayer = forwardRef(function YouTubePlayer(
  { videoId, resumeSecs = 0, poster, onTick, onEnded }, ref
) {
  const wrapRef   = useRef(null);
  const hostRef   = useRef(null);   // inner div YT replaces with its iframe
  const playerRef = useRef(null);
  const pollRef   = useRef(null);
  const hideTimer = useRef(null);
  const endedFiredRef = useRef(false);

  const [ready, setReady]       = useState(false);
  const [playing, setPlaying]   = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [ended, setEnded]       = useState(false);
  const [muted, setMuted]       = useState(false);
  const [cc, setCc]             = useState(false);
  const [cur, setCur]           = useState(0);
  const [dur, setDur]           = useState(0);
  const [isFs, setIsFs]         = useState(false);
  const [showCtl, setShowCtl]   = useState(true);

  const onTickRef  = useRef(onTick);  onTickRef.current = onTick;
  const onEndedRef = useRef(onEnded); onEndedRef.current = onEnded;

  useImperativeHandle(ref, () => ({
    seekTo: (secs) => {
      try { playerRef.current?.seekTo(secs, true); playerRef.current?.playVideo(); } catch { /* ignore */ }
    },
  }), []);

  // Create the player once per videoId.
  useEffect(() => {
    if (!videoId) return;
    let destroyed = false;
    endedFiredRef.current = false;

    loadYouTubeAPI().then((YT) => {
      if (destroyed || !hostRef.current) return;
      playerRef.current = new YT.Player(hostRef.current, {
        videoId,
        host: 'https://www.youtube-nocookie.com',
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 0, disablekb: 1, modestbranding: 1, rel: 0, iv_load_policy: 3,
          fs: 0, playsinline: 1, enablejsapi: 1, origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            setReady(true);
            setDur(e.target.getDuration() || 0);
            if (resumeSecs > 10) { try { e.target.seekTo(resumeSecs, true); } catch { /* ignore */ } }
          },
          onStateChange: (e) => {
            const S = window.YT.PlayerState;
            if (e.data === S.PLAYING) {
              setPlaying(true); setBuffering(false); setEnded(false);
              setDur(playerRef.current?.getDuration?.() || 0);
              startPoll();
              scheduleHide();
            } else if (e.data === S.PAUSED) {
              setPlaying(false); stopPoll(); showControlsNow();
            } else if (e.data === S.BUFFERING) {
              setBuffering(true);
            } else if (e.data === S.ENDED) {
              setPlaying(false); setEnded(true); setBuffering(false); stopPoll(); showControlsNow();
              if (!endedFiredRef.current) {
                endedFiredRef.current = true;
                onEndedRef.current && onEndedRef.current(playerRef.current?.getDuration?.() || 0);
              }
            }
          },
        },
      });
    });

    return () => {
      destroyed = true;
      stopPoll();
      try { playerRef.current?.destroy?.(); } catch { /* ignore */ }
      playerRef.current = null;
      setReady(false); setPlaying(false); setEnded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const startPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      const t = p.getCurrentTime() || 0;
      const d = p.getDuration() || 0;
      setCur(t); if (d) setDur(d);
      onTickRef.current && onTickRef.current(t, d);
    }, 500);
  };
  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  // Auto-hide controls while playing.
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowCtl(false), 3000);
  }, []);
  const showControlsNow = useCallback(() => {
    setShowCtl(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const togglePlay = () => {
    const p = playerRef.current; if (!p) return;
    if (ended) { try { p.seekTo(0, true); p.playVideo(); } catch { /* ignore */ } return; }
    if (playing) { p.pauseVideo(); } else { p.playVideo(); }
  };

  const toggleMute = () => {
    const p = playerRef.current; if (!p) return;
    if (muted) { p.unMute(); setMuted(false); } else { p.mute(); setMuted(true); }
  };

  // Best-effort captions toggle (YouTube's captions module API).
  const toggleCc = () => {
    const p = playerRef.current; if (!p) return;
    try {
      if (cc) {
        p.setOption('captions', 'track', {});
        setCc(false);
      } else {
        p.loadModule('captions');
        p.setOption('captions', 'reload', true);
        p.setOption('captions', 'track', { languageCode: 'en' });
        setCc(true);
      }
    } catch { /* captions may be unavailable on this video */ }
  };

  const onSeek = (e) => {
    const v = Number(e.target.value);
    setCur(v);
    try { playerRef.current?.seekTo(v, true); } catch { /* ignore */ }
  };

  // Fullscreen: native where supported (desktop/iPad), CSS fill-screen fallback (iPhone).
  const toggleFs = async () => {
    const el = wrapRef.current; if (!el) return;
    const doc = document;
    if (!isFs) {
      try {
        if (el.requestFullscreen) { await el.requestFullscreen(); }
        else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
        else { setIsFs(true); }
      } catch { setIsFs(true); }
      try { await window.screen?.orientation?.lock?.('landscape'); } catch { /* ignore */ }
    } else {
      try {
        if (doc.fullscreenElement && doc.exitFullscreen) { await doc.exitFullscreen(); }
        else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) { doc.webkitExitFullscreen(); }
      } catch { /* ignore */ }
      try { window.screen?.orientation?.unlock?.(); } catch { /* ignore */ }
      setIsFs(false);
    }
  };
  // Keep isFs in sync with the native fullscreen API.
  useEffect(() => {
    const onFsChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      setIsFs(!!fsEl);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const blockCtx = (e) => { e.preventDefault(); return false; };

  return (
    <div
      ref={wrapRef}
      onContextMenu={blockCtx}
      className={`relative bg-black overflow-hidden select-none ${
        isFs && !document.fullscreenElement ? 'fixed inset-0 z-[9999]' : 'w-full h-full'
      }`}
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      {/* Poster until ready */}
      {!ready && poster && (
        <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
      )}

      {/* YT iframe — non-interactive so no YouTube chrome/menu is reachable */}
      <div className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <div ref={hostRef} className="w-full h-full" />
      </div>

      {/* Gesture layer: tap = play/pause + reveal controls; also blocks the iframe's context menu */}
      <button
        type="button"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={() => { showControlsNow(); togglePlay(); if (playing) scheduleHide(); }}
        onMouseMove={showControlsNow}
        onContextMenu={blockCtx}
        className="absolute inset-0 w-full h-full bg-transparent"
      />

      {/* Buffering spinner */}
      {buffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 size={36} className="animate-spin text-white/80" />
        </div>
      )}

      {/* Center play / replay (when paused or ended) */}
      {ready && !buffering && (!playing || ended) && (
        <button
          type="button"
          onClick={() => { showControlsNow(); togglePlay(); }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-black/55 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
          aria-label={ended ? 'Replay' : 'Play'}
        >
          {ended ? <RotateCcw size={26} /> : <Play size={28} className="ml-0.5" />}
        </button>
      )}

      {/* Loading state before ready */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm pointer-events-none">
          <Loader2 className="animate-spin mr-2" size={18} /> Loading…
        </div>
      )}

      {/* Custom control bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 px-3 pb-2 pt-8 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-200 ${
          showCtl || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onMouseMove={showControlsNow}
      >
        {/* Seek bar */}
        <input
          type="range"
          min={0}
          max={dur || 0}
          step="0.1"
          value={Math.min(cur, dur || 0)}
          onChange={onSeek}
          className="udaya-seek w-full h-1 accent-rose-500 cursor-pointer"
          aria-label="Seek"
        />
        <div className="flex items-center gap-3 mt-1.5 text-white">
          <button type="button" onClick={togglePlay} className="hover:text-rose-300 transition-colors" aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button type="button" onClick={toggleMute} className="hover:text-rose-300 transition-colors" aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
          <span className="text-xs tabular-nums text-white/90">{fmt(cur)} / {fmt(dur)}</span>
          <div className="flex-1" />
          <button type="button" onClick={toggleCc} title="Captions"
            className={`transition-colors ${cc ? 'text-rose-400' : 'text-white hover:text-rose-300'}`} aria-label="Captions">
            <Subtitles size={19} />
          </button>
          <button type="button" onClick={toggleFs} className="hover:text-rose-300 transition-colors" aria-label="Fullscreen">
            {isFs ? <Minimize size={19} /> : <Maximize size={19} />}
          </button>
        </div>
      </div>
    </div>
  );
});

export default YouTubePlayer;
