'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import YouTube, { YouTubePlayer, YouTubeEvent } from 'react-youtube';

interface AudioPlayerProps {
  src: string | null;
  youtubeId?: string | null;
  autoPlay?: boolean;
  onEnded?: () => void;
  maxDuration?: number; // in seconds, default 30
}

export default function AudioPlayer({ src, youtubeId, autoPlay = true, onEnded, maxDuration = 30 }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<YouTubePlayer | null>(null);
  const animRef = useRef<number>(0);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isYoutubeReady, setIsYoutubeReady] = useState(false);

  // Force YouTube playback to avoid Spotify Premium errors. Can be disabled later for hybrid mode.
  const forceYoutube = true;
  const isYoutubeMode = forceYoutube ? !!youtubeId : (!src && !!youtubeId);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.stopVideo();
        } catch { /* ignore */ }
      }
    };
  }, []);

  const updateProgress = useCallback(() => {
    let time = 0;
    let playing = false;

    if (isYoutubeMode && ytPlayerRef.current) {
      try {
        time = ytPlayerRef.current.getCurrentTime() || 0;
        playing = ytPlayerRef.current.getPlayerState() === 1; // 1 = playing
      } catch { /* ignore */ }
    } else if (!isYoutubeMode && audioRef.current) {
      time = audioRef.current.currentTime;
      playing = !audioRef.current.paused;
    }

    setCurrentTime(time);
    setProgress(Math.min((time / maxDuration) * 100, 100));

    if (time >= maxDuration) {
      setIsPlaying(false);
      if (isYoutubeMode && ytPlayerRef.current) {
         try { ytPlayerRef.current.pauseVideo(); } catch { /* ignore */ }
      } else if (audioRef.current) {
         audioRef.current.pause();
      }
      onEnded?.();
      return;
    }

    if (playing) {
      animRef.current = requestAnimationFrame(updateProgress);
    }
  }, [maxDuration, onEnded, isYoutubeMode]);

  // Handle native audio playback
  useEffect(() => {
    if (isYoutubeMode) return;
    
    const audio = new Audio(src || '');
    audioRef.current = audio;

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      onEnded?.();
    });

    audio.addEventListener('play', () => {
      setIsPlaying(true);
      requestAnimationFrame(updateProgress);
    });
    
    audio.addEventListener('pause', () => setIsPlaying(false));

    if (autoPlay && src) {
      audio.play().catch(() => { /* Autoplay blocked */ });
    }

    return () => {
      cancelAnimationFrame(animRef.current);
      audio.pause();
      audio.src = '';
    };
  }, [src, autoPlay, onEnded, isYoutubeMode, updateProgress]);

  // Restart frame loop when playing state changes (for youtube primarily)
  useEffect(() => {
    if (isPlaying) {
      animRef.current = requestAnimationFrame(updateProgress);
    } else {
      cancelAnimationFrame(animRef.current);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, updateProgress]);

  const togglePlay = () => {
    if (isYoutubeMode && ytPlayerRef.current) {
      try {
        const state = ytPlayerRef.current.getPlayerState();
        if (state === 1) { // playing
          ytPlayerRef.current.pauseVideo();
        } else {
          ytPlayerRef.current.playVideo();
        }
      } catch { /* ignore */ }
    } else if (!isYoutubeMode && audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play().catch(() => { /* ignore */ });
      } else {
        audioRef.current.pause();
      }
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const onYoutubeReady = (event: YouTubeEvent) => {
    ytPlayerRef.current = event.target;
    setIsYoutubeReady(true);
    if (autoPlay) {
      event.target.playVideo();
    }
  };

  const onYoutubeStateChange = (event: YouTubeEvent) => {
    // 1 = playing, 2 = paused, 0 = ended
    if (event.data === 1) {
      setIsPlaying(true);
      requestAnimationFrame(updateProgress);
    } else if (event.data === 2 || event.data === 0) {
      setIsPlaying(false);
      if (event.data === 0) onEnded?.();
    }
  };

  return (
    <div className="w-full space-y-3">
      {isYoutubeMode && (
        <div className="pointer-events-none absolute opacity-0">
          <YouTube
            videoId={youtubeId as string}
            opts={{
              height: '10',
              width: '10',
              playerVars: {
                autoplay: autoPlay ? 1 : 0,
                controls: 0,
                disablekb: 1,
                fs: 0,
                playsinline: 1,
                start: 0,
              },
            }}
            onReady={onYoutubeReady}
            onStateChange={onYoutubeStateChange}
          />
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={togglePlay}
          disabled={isYoutubeMode && !isYoutubeReady}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/10 disabled:opacity-50"
        >
          {isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
            </svg>
          )}
        </button>
        <div className="flex-1 space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-200 ${isYoutubeMode ? 'bg-red-500' : 'bg-white'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-white/40">
            <span>{formatTime(currentTime)}</span>
            <div className="flex gap-2 items-center">
              {isYoutubeMode && <span className="text-[10px] font-bold text-red-500 uppercase">YouTube</span>}
              <span>{formatTime(maxDuration)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
