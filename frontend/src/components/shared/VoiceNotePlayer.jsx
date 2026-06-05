import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

export default function VoiceNotePlayer({ src, isSender = false, duration = null }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState('0:00');
  const [totalTime, setTotalTime] = useState(duration || '0:00');
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      setProgress((audio.currentTime / audio.duration) * 100 || 0);
      setCurrentTime(formatTime(audio.currentTime));
    };

    const handleLoadedMetadata = () => {
      if (!duration || duration === '0:00') {
        if (audio.duration && audio.duration !== Infinity) {
          setTotalTime(formatTime(audio.duration));
        }
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime('0:00');
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [duration]);

  const togglePlay = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    if (!audioRef.current || !audioRef.current.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = percent * audioRef.current.duration;
  };

  return (
    <div className={`flex items-center gap-3 py-1 ${isSender ? 'w-[240px]' : 'w-[220px]'}`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      
      {/* Sender avatar placeholder / Mic icon */}
      <div className="relative shrink-0">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center ${isSender ? 'bg-[#35b5a2] text-white' : 'bg-neutral-200 text-neutral-500'}`}>
           <Mic size={20} />
        </div>
      </div>

      <div className="flex-1 flex items-center gap-3">
        {/* Play/Pause Button */}
        <button onClick={togglePlay} className={`text-neutral-500 hover:text-neutral-700 shrink-0 ${isSender ? 'text-[#35b5a2]' : ''}`}>
          {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
        </button>

        {/* Scrubber & Time */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="relative h-2.5 flex items-center cursor-pointer group" onClick={handleSeek}>
            <div className={`w-full h-1 rounded-full ${isSender ? 'bg-black/10' : 'bg-black/10'}`}>
              <div 
                className={`h-full rounded-full relative ${isSender ? 'bg-[#35b5a2]' : 'bg-[#00a884]'}`} 
                style={{ width: `${progress}%` }}
              >
                <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm ${isSender ? 'bg-[#35b5a2]' : 'bg-[#00a884]'}`}></div>
              </div>
            </div>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-[10px] text-neutral-500 font-medium">
              {isPlaying ? currentTime : totalTime}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
