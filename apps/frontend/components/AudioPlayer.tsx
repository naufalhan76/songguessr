'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import YouTube, { YouTubePlayer, YouTubeEvent } from 'react-youtube';

interface AudioPlayerProps {
  src: string | null;
  youtubeId?: string | null;
  autoPlay?: boolean;
  onEnded?: () => void;
  maxDuration?: number;
  durationMs?: number;
  startRatio?: number;
}

export default function AudioPlayer({
  src,
  youtubeId,
  autoPlay = true,
  onEnded,
  maxDuration = 30,
  durationMs,
  startRatio = 0.4,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<YouTubePlayer | null>(null);
  const animRef = useRef<number>(0);
  const previewStartRef = useRef(0);
  const hasSeekedRef = useRef(false);
  const autoplayCheckRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isYoutubeReady, setIsYoutubeReady] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const forceYoutube = true;
  const isYoutubeMode = forceYoutube ? !!youtubeId : (!src && !!youtubeId);

  const getPreviewStartSeconds = useCallback((fallbackDuration = 0) => {
    const totalDuration = durationMs ? Math.floor(durationMs / 1000) : Math.floor(fallbackDuration);
    if (!isYoutubeMode || totalDuration <= 0) return 0;

    const rawStart = Math.floor(totalDuration * startRatio);
    const latestSafeStart = Math.max(0, totalDuration - maxDuration);
    return Math.min(rawStart, latestSafeStart);
  }, [durationMs, isYoutubeMode, maxDuration, startRatio]);

  const clearAutoplayCheck = useCallback(() => {
    if (autoplayCheckRef.current) {
      window.clearTimeout(autoplayCheckRef.current);
      autoplayCheckRef.current = null;
    }
  }, []);

  const scheduleAutoplayCheck = useCallback(() => {
    clearAutoplayCheck();
    autoplayCheckRef.current = window.setTimeout(() => {
      setAutoplayBlocked((prev) => (isPlaying ? false : prev || autoPlay));
    }, 1400);
  }, [autoPlay, clearAutoplayCheck, isPlaying]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      clearAutoplayCheck();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.stopVideo();
        } catch {
          // ignore
        }
      }
    };
  }, [clearAutoplayCheck]);

  const updateProgress = useCallback(() => {
    let time = 0;
    let playing = false;

    if (isYoutubeMode && ytPlayerRef.current) {
      try {
        time = ytPlayerRef.current.getCurrentTime() || 0;
        playing = ytPlayerRef.current.getPlayerState() === 1;
      } catch {
        // ignore
      }
    } else if (!isYoutubeMode && audioRef.current) {
      time = audioRef.current.currentTime;
      playing = !audioRef.current.paused;
    }

    const elapsedTime = Math.max(0, time - previewStartRef.current);
    setCurrentTime(elapsedTime);
    setProgress(Math.min((elapsedTime / maxDuration) * 100, 100));

    if (elapsedTime >= maxDuration) {
      setIsPlaying(false);
      if (isYoutubeMode && ytPlayerRef.current) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {
          // ignore
        }
      } else if (audioRef.current) {
        audioRef.current.pause();
      }
      onEnded?.();
      return;
    }

    if (playing) {
      animRef.current = requestAnimationFrame(updateProgress);
    }
  }, [isYoutubeMode, maxDuration, onEnded]);

  useEffect(() => {
    if (isYoutubeMode) return;

    const audio = new Audio(src || '');
    audioRef.current = audio;

    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setAutoplayBlocked(false);
      requestAnimationFrame(updateProgress);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    if (autoPlay && src) {
      audio.play().catch(() => {
        setAutoplayBlocked(true);
      });
      scheduleAutoplayCheck();
    }

    return () => {
      clearAutoplayCheck();
      cancelAnimationFrame(animRef.current);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.pause();
      audio.src = '';
    };
  }, [autoPlay, clearAutoplayCheck, isYoutubeMode, onEnded, scheduleAutoplayCheck, src, updateProgress]);

  useEffect(() => {
    if (isPlaying) {
      animRef.current = requestAnimationFrame(updateProgress);
    } else {
      cancelAnimationFrame(animRef.current);
    }

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, updateProgress]);

  const startPlayback = useCallback(() => {
    setAutoplayBlocked(false);

    if (isYoutubeMode && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.playVideo();
      } catch {
        setAutoplayBlocked(true);
      }
      return;
    }

    if (!isYoutubeMode && audioRef.current) {
      audioRef.current.play().catch(() => {
        setAutoplayBlocked(true);
      });
    }
  }, [isYoutubeMode]);

  const togglePlay = () => {
    if (isYoutubeMode && ytPlayerRef.current) {
      try {
        const state = ytPlayerRef.current.getPlayerState();
        if (state === 1) {
          ytPlayerRef.current.pauseVideo();
        } else {
          startPlayback();
        }
      } catch {
        // ignore
      }
      return;
    }

    if (audioRef.current) {
      if (audioRef.current.paused) {
        startPlayback();
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
    hasSeekedRef.current = false;

    const syncPreviewStart = () => {
      const player = event.target;
      const previewStart = getPreviewStartSeconds(player.getDuration?.() || 0);
      previewStartRef.current = previewStart;

      if (!hasSeekedRef.current) {
        hasSeekedRef.current = true;
        if (previewStart > 0) {
          player.seekTo(previewStart, true);
        }
      }

      if (autoPlay) {
        try {
          player.playVideo();
        } catch {
          setAutoplayBlocked(true);
        }
      }
    };

    syncPreviewStart();
    window.setTimeout(syncPreviewStart, 350);
    if (autoPlay) {
      scheduleAutoplayCheck();
    }
  };

  const onYoutubeStateChange = (event: YouTubeEvent) => {
    if (event.data === 1) {
      clearAutoplayCheck();
      setAutoplayBlocked(false);
      setIsPlaying(true);
      requestAnimationFrame(updateProgress);
    } else if (event.data === 2 || event.data === 0) {
      setIsPlaying(false);
      if (event.data === 0) {
        onEnded?.();
      }
    }
  };

  return (
    <div className="relative w-full space-y-3">
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
                start: getPreviewStartSeconds(),
              },
            }}
            onReady={onYoutubeReady}
            onStateChange={onYoutubeStateChange}
          />
        </div>
      )}

      {autoplayBlocked && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-center">
          <div className="text-sm font-semibold text-white">Tap once to start audio</div>
          <p className="mt-1 text-xs leading-5 text-amber-100/75">
            Some mobile browsers block autoplay with sound. One tap will start the music.
          </p>
          <button
            type="button"
            onClick={startPlayback}
            className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-semibold text-black transition hover:bg-amber-200"
          >
            Start sound
          </button>
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
            <div className="flex items-center gap-2">
              {isYoutubeMode && <span className="text-[10px] font-bold uppercase text-red-500">YouTube</span>}
              <span>{formatTime(maxDuration)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
