import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Heart, Loader2, AlertTriangle, Clock, Play } from 'lucide-react';
import { MediaPlayer, MediaProvider } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import { Tag } from '../../components/ui';
import { videoApi, apiClient } from '../../lib/api';
import SubjectIcon from '../../components/shared/SubjectIcon';
import { Reveal } from '../../components/bits';
import { useAuthStore } from '../../lib/auth';
import ScreenshotGuard from '../../components/shared/ScreenshotGuard';
import VideoComments from '../../components/student/VideoComments';

function toMmSs(secs) {
  if (secs == null) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// We play YouTube lessons through **Plyr**, which hides ALL YouTube identity
// (logo, channel name, title bar, "Watch on YouTube", related-video chrome) and
// renders its own custom controls. The YouTube iframe is non-interactive, so
// there's no right-click "Copy video URL"/context menu either — the lesson never
// feels like it's from YouTube. Quality is YouTube-adaptive (Auto) because manual
// quality is only exposed via YouTube's own branded UI, which we deliberately hide.
export default function StudentVideoPlayerPage() {
  const { classId, videoId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);

  const playerRef = useRef(null);       // Vidstack player ref (file sources)
  const plyrRef = useRef(null);         // Plyr instance (youtube source)
  const plyrHostRef = useRef(null);     // div Plyr mounts into

  const [video, setVideo]         = useState(null);
  const [subject, setSubject]     = useState(null);
  const [loading, setLoading]     = useState(true);

  const [completed, setCompleted] = useState(false);

  // Likes (persisted; teacher sees the count)
  const [liked, setLiked]         = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeBusy, setLikeBusy]   = useState(false);

  // YouTube source needs a per-request token (the raw YT id is never sent in the list)
  const [ytToken, setYtToken]     = useState(null);
  const [ytError, setYtError]     = useState(null);

  // Playback state (drives chapter highlight + progress save + completion)
  const [chapterActive, setChapterActive] = useState(-1);
  const [watchedPct, setWatchedPct] = useState(0); // genuine coverage, for the completion hint
  const lastSavedRef = useRef(0);   // last progress_secs POSTed
  const resumedRef   = useRef(false); // resume-seek applied once
  const watchedRef   = useRef(0);     // seconds ACTUALLY played (seeks excluded)
  const lastTickRef  = useRef(0);     // previous currentTime, to measure real playback deltas
  const completeFiredRef = useRef(false); // auto-complete fires at most once

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
  }, [video?.id]);

  function markComplete() {
    if (completed || completeFiredRef.current) return;
    completeFiredRef.current = true;
    videoApi.markComplete(video.id)
      .then(() => setCompleted(true))
      .catch(err => { completeFiredRef.current = false; console.error('markComplete failed:', err); });
  }

  // One tick of playback at time `t` (seconds), given total `dur`. Shared by the
  // Plyr poll loop and Vidstack's onTimeUpdate. Accumulates ONLY genuine forward
  // playback (seeks excluded) so skip-to-end can't fake completion.
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

    if (t - lastSavedRef.current >= 8) {
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

  // The Plyr player is created ONCE, so its event handlers would capture stale
  // state (completed). Route them through refs that always hold the latest
  // handlers so the poll/ENDED callbacks see current values.
  const tickRef  = useRef(() => {});
  const endedRef = useRef(() => {});
  tickRef.current = handleTick;
  endedRef.current = (dur) => {
    if (!completed && dur > 0 && watchedRef.current >= dur * 0.9) markComplete();
  };

  // ── Plyr (YouTube) lifecycle — custom controls, all YouTube branding hidden ──
  const isYouTube = video?.source_type === 'youtube';

  useEffect(() => {
    if (!isYouTube || !ytToken || ytError || !plyrHostRef.current) return;
    let poll = null;

    // Plyr reads the YouTube id from a placeholder div's data-plyr-embed-id.
    const embed = document.createElement('div');
    embed.setAttribute('data-plyr-provider', 'youtube');
    embed.setAttribute('data-plyr-embed-id', ytToken);
    plyrHostRef.current.innerHTML = '';
    plyrHostRef.current.appendChild(embed);

    const player = new Plyr(embed, {
      controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'settings', 'pip', 'fullscreen'],
      settings: ['captions', 'speed'],
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
      youtube: {
        noCookie: true, rel: 0, modestbranding: 1, iv_load_policy: 3,
        playsinline: 1, controls: 0, showinfo: 0, disablekb: 0,
      },
      hideControls: true,
      ratio: '16:9',
    });
    plyrRef.current = player;

    player.on('ready', () => {
      const resume = video?.progress_secs || 0;
      if (resume > 10) { try { player.currentTime = resume; lastTickRef.current = resume; } catch { /* ignore */ } }
    });
    player.on('playing', () => {
      if (poll) clearInterval(poll);
      poll = setInterval(() => {
        if (!plyrRef.current) return;
        tickRef.current(plyrRef.current.currentTime || 0, plyrRef.current.duration || 0);
      }, 750);
    });
    const stop = () => { if (poll) { clearInterval(poll); poll = null; } };
    player.on('pause', stop);
    player.on('ended', () => { stop(); endedRef.current(plyrRef.current?.duration || 0); });

    return () => {
      stop();
      try { player.destroy(); } catch { /* ignore */ }
      plyrRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouTube, ytToken, ytError, video?.id]);

  // Chapter click → seek whichever player is active.
  const seekTo = (secs) => {
    if (isYouTube && plyrRef.current) {
      try { plyrRef.current.currentTime = secs; plyrRef.current.play?.(); } catch { /* ignore */ }
      return;
    }
    const p = playerRef.current;
    if (!p) return;
    try { p.currentTime = secs; p.play?.(); } catch { /* ignore */ }
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
      setLiked(!next);
      setLikeCount(c => Math.max(0, c + (next ? -1 : 1)));
    } finally {
      setLikeBusy(false);
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

  // File-source (non-YouTube) src for Vidstack
  let fileSrc = null;
  if (isStorageUrl) {
    fileSrc = { src: video.cloudflare_video_id, type: 'video/mp4' };
  } else if (video.cloudflare_video_id && !isStorageUrl && !isYouTube) {
    fileSrc = { src: `https://videodelivery.net/${video.cloudflare_video_id}/manifest/video.m3u8`, type: 'application/x-mpegurl' };
  }

  const showYouTubePlayer  = isYouTube && ytToken && !ytError;
  const showYouTubeLoading = isYouTube && !ytToken && !ytError;
  const guardLabel = user?.username || user?.name || 'student';

  return (
    <ScreenshotGuard label={guardLabel}>
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-canvas/95 backdrop-blur border-b border-[#EFEDEA]">
        <div className="px-4 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate(`/student/subjects/${classId}`)}
            className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-base md:text-lg font-semibold flex-1 truncate">{video.title}</h1>
          {completed && <Tag color="green"><CheckCircle2 size={11} className="mr-1 inline" />Done</Tag>}
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {/* Hide every scrap of YouTube identity (logo, channel, title, share,
            "Watch on YouTube", end-screen related videos) and make the iframe
            non-interactive so there's no right-click → Copy URL / context menu.
            Plyr's own controls sit above this and stay fully usable. */}
        <style>{`
          .udaya-yt .plyr__video-embed iframe { pointer-events: none !important; }
          .udaya-yt .plyr { --plyr-color-main: #2563eb; }
          /* YouTube chrome that can bleed through the embed */
          .udaya-yt .ytp-chrome-top,
          .udaya-yt .ytp-show-cards-title,
          .udaya-yt .ytp-watermark,
          .udaya-yt .ytp-youtube-button,
          .udaya-yt .ytp-pause-overlay,
          .udaya-yt .ytp-ce-element,
          .udaya-yt .ytp-gradient-top,
          .udaya-yt .ytp-title,
          .udaya-yt .ytp-chrome-top-buttons { display: none !important; opacity: 0 !important; }
        `}</style>
        {/* ── Player (fixed 16/9; same on phone & laptop) ── */}
        <div
          className="relative bg-black w-full overflow-hidden md:rounded-b-xl"
          style={{ aspectRatio: '16 / 9' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {showYouTubePlayer ? (
            // Wrapper is React-owned; Plyr builds its own DOM inside (incl. the YT
            // iframe), so React never removes a node Plyr swapped (avoids unmount
            // crashes). The branding-hiding CSS lives in the <style> above.
            <div className="absolute inset-0 w-full h-full udaya-yt">
              <div ref={plyrHostRef} className="w-full h-full" />
            </div>
          ) : fileSrc ? (
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
              <DefaultVideoLayout icons={defaultLayoutIcons} />
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
              <h2 className="font-semibold text-lg mb-1 leading-snug">{video.title}</h2>
              <p className="text-sm text-neutral-500 inline-flex items-center gap-1.5">
                <SubjectIcon value={subject?.emoji} size={14} />{subject?.name || 'Subject'}
              </p>
            </div>

            {/* Like (persisted; teacher sees the count) */}
            <button
              onClick={toggleLike}
              disabled={likeBusy}
              title={liked ? 'Unlike' : 'Like this lesson'}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-60 ${
                liked ? 'bg-rose-50 border-rose-200 text-rose-600' : 'border-[#EFEDEA] text-neutral-600 hover:bg-[#F4F2EF]'
              }`}
            >
              <Heart size={15} className={liked ? 'fill-rose-500 text-rose-500' : ''} />
              {likeCount > 0 && <span className="tabular-nums">{likeCount}</span>}
            </button>
          </div>

          {video.description && (
            <Reveal>
              <p className="text-sm text-neutral-600 mb-5 leading-relaxed whitespace-pre-wrap">{video.description}</p>
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

          {/* Completion is automatic — marks done once the whole video has actually
              been watched (skipping to the end won't count). */}
          {!completed ? (
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
              <div className="flex items-center justify-between text-sm text-neutral-600 mb-2">
                <span className="flex items-center gap-2">
                  <Play size={14} className="text-neutral-400" />
                  Watch the full video to complete
                </span>
                <span className="font-semibold tabular-nums">{watchedPct}%</span>
              </div>
              <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                <div className="h-full bg-neutral-800 rounded-full transition-all duration-300" style={{ width: `${watchedPct}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              <CheckCircle2 size={16} />
              You've completed this video. Great work!
            </div>
          )}

          {/* Private comments — students see only their own; teacher sees all. */}
          <VideoComments videoId={videoId} />
        </div>
      </div>
    </div>
    </ScreenshotGuard>
  );
}
