'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import YouTube, { YouTubePlayer, YouTubeEvent } from 'react-youtube';
import { isAudioPlaybackPrimed, primeAudioPlayback } from '@/lib/audio';

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
  const statusResetRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isYoutubeReady, setIsYoutubeReady] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [audioPrimed] = useState(() => isAudioPlaybackPrimed());
  const [isAttemptingPlayback, setIsAttemptingPlayback] = useState(false);
  const [manualStartAttempts, setManualStartAttempts] = useState(0);
  const [playbackNotice, setPlaybackNotice] = useState<string | null>(null);

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

  const clearPlaybackNotice = useCallback(() => {
    if (statusResetRef.current) {
      window.clearTimeout(statusResetRef.current);
      statusResetRef.current = null;
    }
  }, []);

  const scheduleAutoplayCheck = useCallback((mode: 'auto' | 'manual' = 'auto') => {
    clearAutoplayCheck();
    autoplayCheckRef.current = window.setTimeout(() => {
      let actuallyPlaying = false;

      if (isYoutubeMode && ytPlayerRef.current) {
        try {
          actuallyPlaying = ytPlayerRef.current.getPlayerState() === 1;
        } catch {
          actuallyPlaying = false;
        }
      } else if (!isYoutubeMode && audioRef.current) {
        actuallyPlaying = !audioRef.current.paused;
      }

      if (actuallyPlaying) {
        setAutoplayBlocked(false);
        setIsAttemptingPlayback(false);
        if (mode === 'manual') {
          clearPlaybackNotice();
          setPlaybackNotice('Audio is live. You should hear the song now.');
          statusResetRef.current = window.setTimeout(() => {
            setPlaybackNotice(null);
          }, 1800);
        }
        return;
      }

      if (autoPlay) {
        setAutoplayBlocked(true);
        setIsAttemptingPlayback(false);
        setPlaybackNotice(
          mode === 'manual'
            ? 'Still blocked. Tap Start sound once more or use the play button below.'
            : 'This browser still needs one tap before YouTube audio can start.'
        );
      }
    }, 1400);
  }, [autoPlay, clearAutoplayCheck, clearPlaybackNotice, isYoutubeMode]);

  useEffect(() => {
    clearAutoplayCheck();
    clearPlaybackNotice();
    setAutoplayBlocked(false);
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    setIsYoutubeReady(false);
    setIsAttemptingPlayback(false);
    setPlaybackNotice(null);
    setManualStartAttempts(0);
    hasSeekedRef.current = false;
  }, [clearAutoplayCheck, clearPlaybackNotice, src, youtubeId]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      clearAutoplayCheck();
      clearPlaybackNotice();
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
  }, [clearAutoplayCheck, clearPlaybackNotice]);

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
      setIsAttemptingPlayback(false);
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

  const startPlayback = useCallback(async (mode: 'auto' | 'manual' = 'auto') => {
    clearPlaybackNotice();
    setAutoplayBlocked(false);
    setIsAttemptingPlayback(true);
    if (mode === 'manual') {
      setManualStartAttempts((prev) => prev + 1);
      setPlaybackNotice('Trying to unlock YouTube audio...');
      await primeAudioPlayback().catch(() => false);
    }

    if (isYoutubeMode && ytPlayerRef.current) {
      try {
        const currentTime = ytPlayerRef.current.getCurrentTime?.() || 0;
        const playbackEnded = currentTime >= previewStartRef.current + maxDuration - 0.25;
        if (playbackEnded || currentTime < previewStartRef.current) {
          ytPlayerRef.current.seekTo(previewStartRef.current, true);
        }
        ytPlayerRef.current.playVideo();
        scheduleAutoplayCheck(mode);
      } catch {
        setAutoplayBlocked(true);
        setIsAttemptingPlayback(false);
        setPlaybackNotice('This browser ignored the first tap. Try Start sound again.');
      }
      return;
    }

    if (!isYoutubeMode && audioRef.current) {
      if (audioRef.current.currentTime >= maxDuration - 0.25) {
        audioRef.current.currentTime = 0;
      }
      audioRef.current.play().catch(() => {
        setAutoplayBlocked(true);
        setIsAttemptingPlayback(false);
        setPlaybackNotice('This browser ignored the first tap. Try Start sound again.');
      });
      scheduleAutoplayCheck(mode);
    }
  }, [clearPlaybackNotice, isYoutubeMode, maxDuration, scheduleAutoplayCheck]);

  const togglePlay = () => {
    if (isYoutubeMode && ytPlayerRef.current) {
      try {
        const state = ytPlayerRef.current.getPlayerState();
        if (state === 1) {
          ytPlayerRef.current.pauseVideo();
          setPlaybackNotice(null);
        } else {
          void startPlayback('manual');
        }
      } catch {
        // ignore
      }
      return;
    }

    if (audioRef.current) {
      if (audioRef.current.paused) {
        void startPlayback('manual');
      } else {
        audioRef.current.pause();
        setPlaybackNotice(null);
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
          void startPlayback('auto');
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
      setIsAttemptingPlayback(false);
      setIsPlaying(true);
      requestAnimationFrame(updateProgress);
    } else if (event.data === 2 || event.data === 0) {
      if (event.data === 2) {
        setIsAttemptingPlayback(false);
      }
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

      {(autoplayBlocked || isAttemptingPlayback) && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-center">
          <div className="text-sm font-semibold text-white">
            {isAttemptingPlayback ? 'Starting audio...' : 'Tap once to start audio'}
          </div>
          <p className="mt-1 text-xs leading-5 text-amber-100/75">
            {isAttemptingPlayback
              ? 'Hold on for a second. We are retrying YouTube playback for this device.'
              : audioPrimed
                ? 'This device was already primed in the lobby, but this browser still wants one extra tap for YouTube.'
                : 'Some mobile browsers block autoplay with sound. One tap will start the music.'}
          </p>

          <div className="mt-4 flex items-end justify-center gap-1.5">
            {[0, 1, 2, 3].map((bar) => (
              <div
                key={bar}
                className={`w-2 rounded-full bg-amber-200/85 ${isAttemptingPlayback ? 'animate-pulse' : ''}`}
                style={{
                  height: `${18 + (bar % 2 === 0 ? 10 : 22)}px`,
                  animationDelay: `${bar * 120}ms`,
                }}
              />
            ))}
          </div>

          {playbackNotice && (
            <div className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${
              autoplayBlocked && !isAttemptingPlayback
                ? 'border-amber-200/20 bg-black/15 text-amber-50/90'
                : 'border-emerald-200/20 bg-black/15 text-emerald-50/90'
            }`}>
              {playbackNotice}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => void startPlayback('manual')}
              disabled={isAttemptingPlayback}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-semibold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAttemptingPlayback
                ? 'Starting...'
                : manualStartAttempts > 0
                  ? 'Try start sound again'
                  : 'Start sound'}
            </button>
            <div className="text-[11px] uppercase tracking-[0.24em] text-amber-50/65 sm:self-center">
              or tap play below
            </div>
          </div>
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
