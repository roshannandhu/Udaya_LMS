import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Mic, AlertCircle } from 'lucide-react';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds === Infinity) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VoiceNotePlayer({ src, isSender = false, duration = null }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cur, setCur] = useState(0);        // current time (secs)
  const [dur, setDur] = useState(0);        // finite duration (secs), 0 = unknown
  const [failed, setFailed] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setFailed(false);

    // Pull a finite duration whenever the browser can give us one. Some
    // MediaRecorder webm/opus files only report it after buffering, so we listen
    // on several events rather than doing a fragile seek-to-end (that hack could
    // wedge the element on iOS/iPad and make playback look broken).
    const grabDur = () => {
      const d = audio.duration;
      if (d && d !== Infinity && !isNaN(d)) setDur(d);
    };

    const onTime = () => {
      setCur(audio.currentTime);
      const d = audio.duration;
      setProgress(d && d !== Infinity ? (audio.currentTime / d) * 100 : 0);
    };
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setProgress(0); setCur(0); };
    const onError = () => { setFailed(true); setIsPlaying(false); };

    audio.addEventListener('loadedmetadata', grabDur);
    audio.addEventListener('durationchange', grabDur);
    audio.addEventListener('canplay', grabDur);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('loadedmetadata', grabDur);
      audio.removeEventListener('durationchange', grabDur);
      audio.removeEventListener('canplay', grabDur);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [src]);

  // Play one at a time (like WhatsApp). State follows the real play/pause events.
  const togglePlay = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      document.querySelectorAll('audio').forEach(a => { if (a !== audio) a.pause(); });
      const p = audio.play();
      if (p?.catch) p.catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !audio.duration || audio.duration === Infinity) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * audio.duration;
  };

  // Prefer a passed-in duration, else the resolved one; show elapsed while playing.
  const totalLabel = duration && duration !== '0:00'
    ? duration
    : (dur ? formatTime(dur) : '');
  const timeLabel = isPlaying || cur > 0 ? formatTime(cur) : (totalLabel || '0:00');

  if (failed) {
    return (
      <div className={`flex items-center gap-2 py-1 ${isSender ? 'w-[240px]' : 'w-[220px]'}`}>
        <div className="w-9 h-9 rounded-full bg-neutral-200 text-neutral-500 flex items-center justify-center shrink-0">
          <AlertCircle size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-neutral-500">Voice note unavailable</p>
          <a href={src} target="_blank" rel="noreferrer" className="text-[11px] text-[#00a884] underline">Download</a>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 py-1 ${isSender ? 'w-[240px]' : 'w-[220px]'}`}>
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="relative shrink-0">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center ${isSender ? 'bg-[#35b5a2] text-white' : 'bg-neutral-200 text-neutral-500'}`}>
          <Mic size={20} />
        </div>
      </div>

      <div className="flex-1 flex items-center gap-3">
        <button onClick={togglePlay} className={`text-neutral-500 hover:text-neutral-700 shrink-0 ${isSender ? 'text-[#35b5a2]' : ''}`}>
          {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
        </button>

        <div className="flex-1 flex flex-col justify-center">
          <div className="relative h-2.5 flex items-center cursor-pointer group" onClick={handleSeek}>
            <div className="w-full h-1 rounded-full bg-black/10">
              <div
                className={`h-full rounded-full relative ${isSender ? 'bg-[#35b5a2]' : 'bg-[#00a884]'}`}
                style={{ width: `${progress}%` }}
              >
                <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm ${isSender ? 'bg-[#35b5a2]' : 'bg-[#00a884]'}`}></div>
              </div>
            </div>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-[10px] text-neutral-500 font-medium">{timeLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
