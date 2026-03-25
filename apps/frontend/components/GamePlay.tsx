'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Track, Room, Player } from '@muze/shared';
import { isAudioPlaybackPrimed } from '@/lib/audio';
import { clearRoomPlayerId, supabase } from '@/lib/supabase';
import AudioPlayer from '@/components/AudioPlayer';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, Chip } from '@heroui/react';

interface GamePlayProps {
  room: Room;
  players: Player[];
  currentPlayerId: string;
  roomCode: string;
  tracks: Track[];
  distractorTracks?: Array<{ id: string; title: string; artists: string[] }>;
  onGameEnd: () => void;
}

interface RoundData {
  id: string;
  round_number: number;
  track_id: string;
}

interface AnswerResult {
  correct: boolean;
  points: number;
  streakCount: number;
  streakBonus: number;
}

const PREVIEW_START_RATIOS = [0.3, 0.45, 0.65, 0.75] as const;

function pickPreviewStartRatio() {
  return PREVIEW_START_RATIOS[Math.floor(Math.random() * PREVIEW_START_RATIOS.length)];
}

export default function GamePlay({
  room,
  players,
  currentPlayerId,
  roomCode,
  tracks,
  distractorTracks = [],
  onGameEnd,
}: GamePlayProps) {
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(room.settings.time_per_round);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isConfirmingLeave, setIsConfirmingLeave] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [roundScores, setRoundScores] = useState<Record<string, number>>({});
  const [showingResults, setShowingResults] = useState(false);
  const [answeredPlayerIds, setAnsweredPlayerIds] = useState<string[]>([]);
  const [isRoundComplete, setIsRoundComplete] = useState(false);
  const [syncedPlayerIds, setSyncedPlayerIds] = useState<string[]>([]);
  const [scheduledStartAt, setScheduledStartAt] = useState<string | null>(null);
  const [syncNow, setSyncNow] = useState(() => Date.now());
  const [audioPrimed] = useState(() => isAudioPlaybackPrimed());
  const [currentStreak, setCurrentStreak] = useState(0);
  const [intermissionCountdown, setIntermissionCountdown] = useState<number | null>(null);
  const [previewStartRatio, setPreviewStartRatio] = useState(() => pickPreviewStartRatio());

  const timerRef = useRef<number | null>(null);
  const roundAdvanceTimeoutRef = useRef<number | null>(null);
  const roundStartTimeRef = useRef<number>(Date.now());
  const syncChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const syncStartedRef = useRef(false);
  const isHost = room.host_id === currentPlayerId;

  useEffect(() => {
    const fetchRounds = async () => {
      const { data } = await supabase
        .from('game_rounds')
        .select('*')
        .eq('room_id', room.id)
        .order('round_number', { ascending: true });

      if (data) {
        setRounds(data as unknown as RoundData[]);
      }
    };

    fetchRounds();
  }, [room.id]);

  const currentRound = rounds[currentRoundIndex];
  const correctTrack = currentRound ? tracks.find((track) => track.id === currentRound.track_id) : null;
  const questionsRemaining = currentRound ? Math.max(rounds.length - currentRound.round_number, 0) : rounds.length;
  const displayedScores = players.map((player) => ({
    id: player.id,
    score: player.id === currentPlayerId && currentRound && roundScores[currentRound.id] !== undefined
      ? roundScores[currentRound.id]
      : player.score,
  }));
  const rankedScores = [...displayedScores].sort((a, b) => b.score - a.score);
  const recentRank = rankedScores.findIndex((entry) => entry.id === currentPlayerId) + 1;
  const isClientLoaded = rounds.length > 0 && tracks.length > 0;
  const allPlayersSynced = players.length > 0 && players.every((player) => syncedPlayerIds.includes(player.id));
  const scheduledStartMs = scheduledStartAt ? new Date(scheduledStartAt).getTime() : null;
  const hasMatchStarted = scheduledStartMs !== null && syncNow >= scheduledStartMs;
  const syncCountdown = scheduledStartMs === null ? null : Math.max(0, Math.ceil((scheduledStartMs - syncNow) / 1000));

  const markPlayerSynced = useCallback((playerId: string) => {
    setSyncedPlayerIds((prev) => (
      prev.includes(playerId) ? prev : [...prev, playerId]
    ));
  }, []);

  const markPlayerAnswered = useCallback((playerId: string) => {
    setAnsweredPlayerIds((prev) => (
      prev.includes(playerId) ? prev : [...prev, playerId]
    ));
  }, []);

  const getOptions = useCallback((): Track[] => {
    if (!correctTrack) return [];

    const otherGameTracks = tracks.filter((track) => track.id !== correctTrack.id);
    for (let i = otherGameTracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [otherGameTracks[i], otherGameTracks[j]] = [otherGameTracks[j], otherGameTracks[i]];
    }

    const shuffledExternal = [...distractorTracks];
    for (let i = shuffledExternal.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledExternal[i], shuffledExternal[j]] = [shuffledExternal[j], shuffledExternal[i]];
    }

    const availableGameDistractorCounts = [1, 2, 3].filter((count) => count <= otherGameTracks.length);
    const desiredGameDistractorCount = availableGameDistractorCounts.length > 0
      ? availableGameDistractorCounts[Math.floor(Math.random() * availableGameDistractorCounts.length)]
      : 0;
    const gameDistractors = otherGameTracks.slice(0, desiredGameDistractorCount);
    const neededExternal = Math.max(0, 3 - gameDistractors.length);

    const externalPicks = shuffledExternal.slice(0, neededExternal).map((track) => ({
      ...track,
      album: '',
      album_art_url: '',
      preview_url: null,
      youtube_id: null,
      duration_ms: 0,
      popularity: 0,
      spotify_id: track.id,
      cached_at: '',
      score: 0,
    })) as unknown as Track[];

    let allDistractors = [...gameDistractors, ...externalPicks];
    if (allDistractors.length < 3) {
      const remainingGameTracks = otherGameTracks.filter((track) => !gameDistractors.some((picked) => picked.id === track.id));
      const moreGameTracks = remainingGameTracks.slice(0, 3 - allDistractors.length);
      allDistractors = [...allDistractors, ...moreGameTracks];
    }

    const options = [correctTrack, ...allDistractors.slice(0, 3)];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    return options;
  }, [correctTrack, distractorTracks, tracks]);

  const [options, setOptions] = useState<Track[]>([]);

  const getIntermissionCopy = useCallback(() => {
    if (!answerResult) {
      return {
        eyebrow: 'Round locked',
        title: questionsRemaining > 0 ? 'Next song is loading...' : 'Final scoreboard is loading...',
        body: 'Stay ready, we are syncing everyone before moving on.',
      };
    }

    if (answerResult.correct) {
      return {
        eyebrow: answerResult.streakCount >= 2 ? `Hot streak x${answerResult.streakCount}` : 'Nice hit',
        title: questionsRemaining > 0 ? 'Mantap, lanjut gas lagi.' : 'Strong finish.',
        body: answerResult.streakBonus > 0
          ? `Kamu dapet bonus streak +${answerResult.streakBonus}.`
          : 'Jawaban kamu masuk dan score sudah di-update.',
      };
    }

    return {
      eyebrow: 'Round complete',
      title: questionsRemaining > 0 ? 'Ambil napas, round berikutnya bentar lagi.' : 'Round terakhir selesai.',
      body: `Jawaban yang benar: "${correctTrack?.title}" by ${correctTrack?.artists.join(', ')}`,
    };
  }, [answerResult, correctTrack?.artists, correctTrack?.title, questionsRemaining]);

  const getRankLabel = useCallback(() => {
    if (recentRank <= 0) return '-';
    const suffix = recentRank === 1 ? 'st' : recentRank === 2 ? 'nd' : recentRank === 3 ? 'rd' : 'th';
    return `${recentRank}${suffix} / ${players.length}`;
  }, [players.length, recentRank]);

  const advanceRound = useCallback(() => {
    if (currentRoundIndex >= rounds.length - 1) {
      onGameEnd();
    } else {
      setCurrentRoundIndex((prev) => prev + 1);
    }
  }, [currentRoundIndex, onGameEnd, rounds.length]);

  const finalizeRound = useCallback(() => {
    if (isRoundComplete) return;

    setIsRoundComplete(true);
    setShowingResults(true);
    setIntermissionCountdown(5);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (roundAdvanceTimeoutRef.current) {
      clearTimeout(roundAdvanceTimeoutRef.current);
    }
    roundAdvanceTimeoutRef.current = window.setTimeout(() => {
      advanceRound();
    }, 5000);
  }, [advanceRound, isRoundComplete]);

  useEffect(() => {
    return () => {
      if (roundAdvanceTimeoutRef.current) {
        clearTimeout(roundAdvanceTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isRoundComplete || intermissionCountdown === null) return;
    if (intermissionCountdown <= 1) return;

    const timeout = window.setTimeout(() => {
      setIntermissionCountdown((prev) => (prev === null ? null : prev - 1));
    }, 1000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [intermissionCountdown, isRoundComplete]);

  useEffect(() => {
    if (!room?.id || !currentPlayerId) return;

    const channel = supabase
      .channel(`match-sync:${room.id}`)
      .on('broadcast', { event: 'player-ready' }, ({ payload }) => {
        const playerId = typeof payload?.playerId === 'string' ? payload.playerId : null;
        if (playerId) {
          markPlayerSynced(playerId);
        }
      })
      .on('broadcast', { event: 'match-start' }, ({ payload }) => {
        const startsAt = typeof payload?.startsAt === 'string' ? payload.startsAt : null;
        if (startsAt) {
          syncStartedRef.current = true;
          setScheduledStartAt((prev) => prev ?? startsAt);
        }
      })
      .subscribe();

    syncChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      syncChannelRef.current = null;
      syncStartedRef.current = false;
    };
  }, [currentPlayerId, markPlayerSynced, room?.id]);

  useEffect(() => {
    if (!currentPlayerId || !isClientLoaded || scheduledStartAt) return;

    const sendReady = () => {
      markPlayerSynced(currentPlayerId);
      syncChannelRef.current?.send({
        type: 'broadcast',
        event: 'player-ready',
        payload: { playerId: currentPlayerId },
      });
    };

    sendReady();
    const interval = window.setInterval(sendReady, 1500);

    return () => {
      window.clearInterval(interval);
    };
  }, [currentPlayerId, isClientLoaded, markPlayerSynced, scheduledStartAt]);

  useEffect(() => {
    if (!isHost || !isClientLoaded || scheduledStartAt || syncStartedRef.current || !allPlayersSynced) return;

    const startsAt = new Date(Date.now() + 4000).toISOString();
    syncStartedRef.current = true;
    setScheduledStartAt(startsAt);
    syncChannelRef.current?.send({
      type: 'broadcast',
      event: 'match-start',
      payload: { startsAt },
    });
  }, [allPlayersSynced, isClientLoaded, isHost, scheduledStartAt]);

  useEffect(() => {
    if (!scheduledStartAt) return;

    setSyncNow(Date.now());
    const interval = window.setInterval(() => {
      setSyncNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [scheduledStartAt]);

  useEffect(() => {
    if (!isHost || !scheduledStartAt || hasMatchStarted) return;

    const rebroadcast = window.setInterval(() => {
      syncChannelRef.current?.send({
        type: 'broadcast',
        event: 'match-start',
        payload: { startsAt: scheduledStartAt },
      });
    }, 1000);

    return () => {
      window.clearInterval(rebroadcast);
    };
  }, [hasMatchStarted, isHost, scheduledStartAt]);

  useEffect(() => {
    if (!currentRound?.id || !hasMatchStarted) return;

    const fetchAnsweredPlayers = async () => {
      const { data } = await supabase
        .from('player_answers')
        .select('player_id')
        .eq('round_id', currentRound.id);

      if (data) {
        setAnsweredPlayerIds(Array.from(new Set(data.map((answer) => answer.player_id))));
      }
    };

    fetchAnsweredPlayers();
    const pollInterval = window.setInterval(fetchAnsweredPlayers, 900);

    const channel = supabase
      .channel(`round-answers:${currentRound.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'player_answers', filter: `round_id=eq.${currentRound.id}` },
        (payload) => {
          const answer = payload.new as { player_id?: string };
          if (answer.player_id) {
            markPlayerAnswered(answer.player_id);
          }
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [currentRound?.id, hasMatchStarted, markPlayerAnswered]);

  useEffect(() => {
    if (!currentRound || !hasMatchStarted) return;

    setSelectedAnswer(null);
    setAnswerResult(null);
    setShowingResults(false);
    setAnsweredPlayerIds([]);
    setIsRoundComplete(false);
    setIntermissionCountdown(null);
    setTimeRemaining(room.settings.time_per_round);
    setPreviewStartRatio(pickPreviewStartRatio());
    roundStartTimeRef.current = Date.now();
    setOptions(getOptions());
    if (roundAdvanceTimeoutRef.current) {
      clearTimeout(roundAdvanceTimeoutRef.current);
    }
  }, [currentRound, getOptions, hasMatchStarted, room.settings.time_per_round]);

  useEffect(() => {
    if (!hasMatchStarted || !currentRound || isRoundComplete) return;

    timerRef.current = window.setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
          }
          if (!selectedAnswer) {
            setCurrentStreak(0);
            setAnswerResult({ correct: false, points: 0, streakCount: 0, streakBonus: 0 });
          }
          finalizeRound();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentRound?.id, finalizeRound, hasMatchStarted, isRoundComplete, selectedAnswer]);

  useEffect(() => {
    if (!currentRound || isRoundComplete) return;
    if (players.length > 0 && answeredPlayerIds.length >= players.length) {
      finalizeRound();
    }
  }, [answeredPlayerIds.length, currentRound, finalizeRound, isRoundComplete, players.length]);

  const submitAnswer = async (trackId: string) => {
    if (selectedAnswer || isSubmitting || !currentRound) return;

    setSelectedAnswer(trackId);
    setIsSubmitting(true);
    setShowingResults(true);

    const timeTakenMs = Date.now() - roundStartTimeRef.current;

    try {
      const res = await fetch(`/api/rooms/${roomCode}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: currentPlayerId,
          round_id: currentRound.id,
          selected_track_id: trackId,
          time_taken_ms: timeTakenMs,
        }),
      });

      const json = await res.json();
      if (json.success) {
        markPlayerAnswered(currentPlayerId);
        setCurrentStreak(json.data.streak_count ?? 0);
        setAnswerResult({
          correct: json.data.is_correct,
          points: json.data.points_awarded,
          streakCount: json.data.streak_count ?? 0,
          streakBonus: json.data.streak_bonus ?? 0,
        });
        setRoundScores((prev) => ({
          ...prev,
          [currentRound.id]: json.data.new_score,
        }));
      } else {
        setCurrentStreak(0);
        setAnswerResult({ correct: false, points: 0, streakCount: 0, streakBonus: 0 });
      }
    } catch {
      setCurrentStreak(0);
      setAnswerResult({ correct: false, points: 0, streakCount: 0, streakBonus: 0 });
    }

    setIsSubmitting(false);
  };

  const handleLeaveRoom = async () => {
    setIsConfirmingLeave(false);
    if (!currentPlayerId) {
      clearRoomPlayerId(roomCode);
      window.location.href = '/';
      return;
    }

    setIsLeaving(true);
    try {
      await fetch(`/api/rooms/${roomCode}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: currentPlayerId }),
      });
    } catch (error) {
      console.error('Failed to leave room', error);
    }
    clearRoomPlayerId(roomCode);
    window.location.href = '/';
  };

  if (!hasMatchStarted) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center gap-6 px-4 py-5 text-white sm:px-6">
        <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
          <Card.Content className="space-y-8 p-8 sm:p-10">
            <div className="space-y-3 text-center">
              <Chip variant="soft" className="mx-auto border border-amber-400/20 bg-amber-400/10 text-amber-300">
                Match sync
              </Chip>
              <div className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
                {scheduledStartAt ? 'Everyone is in. Starting together...' : 'Waiting for all players to load'}
              </div>
              <p className="mx-auto max-w-xl text-sm leading-6 text-white/55 sm:text-base">
                {scheduledStartAt
                  ? 'The match is locked and about to begin. Stay on this screen while everyone is synchronized.'
                  : 'We are preparing the first round and making sure every player has loaded the match before it starts.'}
              </p>
            </div>

            <div className="rounded-[2rem] border border-amber-400/20 bg-amber-400/10 p-6 text-center shadow-[0_0_40px_rgba(251,191,36,0.08)]">
              <div className="text-[0.7rem] uppercase tracking-[0.4em] text-amber-200/75">Sound check</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
                Turn your volume up now
              </h2>
              <p className="mt-3 text-sm leading-6 text-amber-100/80 sm:text-base">
                Music will autoplay as soon as the match starts, and the preview jumps straight into the song.
                Biar nggak kelewatan, gedein volume atau pakai headset dulu sebelum countdown habis.
              </p>
              <p className="mt-2 text-xs leading-5 text-amber-100/60 sm:text-sm">
                {audioPrimed
                  ? 'This device was already primed from the Ready button, so autoplay has a better chance on Android.'
                  : 'If Android still blocks autoplay, one tap on Start sound will unlock the round audio.'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {players.map((player) => {
                const isSynced = syncedPlayerIds.includes(player.id);
                const isMe = player.id === currentPlayerId;

                return (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-4 ${
                      isSynced
                        ? 'border-emerald-400/25 bg-emerald-400/10'
                        : 'border-white/10 bg-black/20'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-white">
                          {isMe ? 'You' : (player.display_name || 'Player')}
                        </span>
                        {isMe && (
                          <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/65">
                            This device
                          </Chip>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-white/45">
                        {isSynced ? 'Loaded and ready' : 'Still loading match'}
                      </div>
                    </div>
                    <Chip
                      variant="soft"
                      className={isSynced
                        ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                        : 'border border-white/10 bg-white/5 text-white/55'}
                    >
                      {isSynced ? 'Ready' : 'Waiting'}
                    </Chip>
                  </div>
                );
              })}
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-6 text-center">
              {scheduledStartAt ? (
                <>
                  <div className="text-[0.65rem] uppercase tracking-[0.45em] text-white/45">Starts in</div>
                  <div className="mt-3 font-mono text-6xl font-bold tracking-[-0.08em] text-white">
                    {syncCountdown ?? 0}
                  </div>
                  <p className="mt-3 text-sm text-white/55">
                    Audio starts automatically. Keep your sound on.
                  </p>
                </>
              ) : (
                <>
                  <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
                  <div className="mt-4 text-sm text-white/55">
                    {isClientLoaded
                      ? `${syncedPlayerIds.length}/${players.length} players ready`
                      : 'Loading rounds and tracks...'}
                  </div>
                </>
              )}
            </div>
          </Card.Content>
        </Card>
      </main>
    );
  }

  if (rounds.length === 0 || !currentRound || !correctTrack) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4 py-5 text-white">
        <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
          <Card.Content className="flex flex-col items-center gap-4 p-10">
            <div className="text-[0.65rem] uppercase tracking-[0.45em] text-white/45">Loading round...</div>
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </Card.Content>
        </Card>
      </main>
    );
  }

  const timerColor = timeRemaining <= 5 ? 'text-red-400' : timeRemaining <= 10 ? 'text-amber-400' : 'text-white';
  const timerBarWidth = (timeRemaining / room.settings.time_per_round) * 100;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-5 text-white sm:px-6">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/70">
            Round {currentRound.round_number}/{rounds.length}
          </Chip>
          <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/70">
            {questionsRemaining} soal lagi
          </Chip>
          <Chip variant="soft" className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
            Room {roomCode}
          </Chip>
          {currentStreak >= 2 && (
            <Chip variant="soft" className="border border-amber-400/20 bg-amber-400/10 text-amber-300">
              Streak x{currentStreak}
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className={`font-mono text-3xl font-bold ${timerColor} transition-colors`}>
            {timeRemaining}s
          </div>
          <button
            type="button"
            onClick={() => setIsConfirmingLeave(true)}
            disabled={isLeaving}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-medium text-white transition hover:bg-red-500/20 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLeaving ? 'Leaving...' : 'Leave room'}
          </button>
        </div>
      </header>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-white"
          animate={{ width: `${timerBarWidth}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
        <Card.Content className="p-6">
          <div className="mb-3 text-center">
            <div className="text-[0.65rem] uppercase tracking-[0.45em] text-white/45">Now playing</div>
            <p className="mt-1 text-sm text-white/55">Listen carefully and pick the correct song</p>
          </div>
          <AudioPlayer
            src={correctTrack.preview_url}
            youtubeId={correctTrack.youtube_id}
            autoPlay
            maxDuration={room.settings.time_per_round}
            durationMs={correctTrack.duration_ms}
            startRatio={previewStartRatio}
          />
        </Card.Content>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <AnimatePresence mode="wait">
          {options.map((track, index) => {
            const isSelected = selectedAnswer === track.id;
            const isCorrectTrack = track.id === correctTrack.id;
            const showCorrectHighlight = showingResults && isCorrectTrack;
            const showWrongHighlight = showingResults && isSelected && !isCorrectTrack;

            let borderColor = 'border-white/10';
            let bgColor = 'bg-white/[0.04]';

            if (showCorrectHighlight) {
              borderColor = 'border-emerald-400/50';
              bgColor = 'bg-emerald-400/10';
            } else if (showWrongHighlight) {
              borderColor = 'border-red-400/50';
              bgColor = 'bg-red-400/10';
            } else if (isSelected && isSubmitting) {
              borderColor = 'border-violet-400/50';
              bgColor = 'bg-violet-400/10';
            } else if (isSelected) {
              borderColor = 'border-white/30';
              bgColor = 'bg-white/10';
            }

            return (
              <motion.button
                key={track.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                type="button"
                onClick={() => submitAnswer(track.id)}
                disabled={!!selectedAnswer || showingResults}
                className={`flex items-center gap-4 rounded-2xl border ${borderColor} ${bgColor} p-4 text-left transition-all hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:hover:bg-transparent`}
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/30 font-mono text-sm text-white/60">
                  {String.fromCharCode(65 + index)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-white">{track.title}</div>
                  <div className="mt-0.5 truncate text-sm text-white/50">{track.artists.join(', ')}</div>
                </div>
                {showCorrectHighlight && (
                  <Chip variant="soft" className="shrink-0 border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                    Correct
                  </Chip>
                )}
                {showWrongHighlight && (
                  <Chip variant="soft" className="shrink-0 border-red-400/20 bg-red-400/10 text-red-300">
                    Wrong
                  </Chip>
                )}
                {isSelected && isSubmitting && (
                  <Chip variant="soft" className="shrink-0 border-violet-400/20 bg-violet-400/10 text-violet-300">
                    Locked in
                  </Chip>
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isSubmitting && selectedAnswer && !answerResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-6"
          >
            <Card className="border border-violet-400/30 bg-violet-400/10 shadow-[0_20px_80px_rgba(0,0,0,0.5)]">
              <Card.Content className="flex items-center gap-4 px-6 py-4">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-violet-400/20 text-violet-300">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-200/25 border-t-violet-200" />
                </div>
                <div>
                  <div className="font-semibold text-white">Jawaban terkunci</div>
                  <div className="text-sm text-white/55">
                    Lagi cek jawaban kamu ke server...
                  </div>
                </div>
              </Card.Content>
            </Card>
          </motion.div>
        )}
        {answerResult && showingResults && !isRoundComplete && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-6"
          >
            <Card className={`border ${answerResult.correct ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-red-400/30 bg-red-400/10'} shadow-[0_20px_80px_rgba(0,0,0,0.5)]`}>
              <Card.Content className="flex items-center gap-4 px-6 py-4">
                <div className={`grid h-12 w-12 place-items-center rounded-full ${answerResult.correct ? 'bg-emerald-400/20 text-emerald-300' : 'bg-red-400/20 text-red-300'}`}>
                  {answerResult.correct ? '✓' : '✕'}
                </div>
                <div>
                  <div className="font-semibold text-white">
                    {answerResult.correct ? 'Correct!' : 'Wrong!'}
                  </div>
                  <div className="text-sm text-white/55">
                    {answerResult.correct
                      ? `+${answerResult.points} points`
                      : `The answer was "${correctTrack.title}" by ${correctTrack.artists.join(', ')}`}
                  </div>
                  {answerResult.correct && answerResult.streakBonus > 0 && (
                    <div className="mt-1 text-xs uppercase tracking-[0.22em] text-amber-200/80">
                      Streak bonus +{answerResult.streakBonus}
                    </div>
                  )}
                  {!isRoundComplete && (
                    <div className="mt-1 text-xs uppercase tracking-[0.22em] text-white/40">
                      Waiting for other players...
                    </div>
                  )}
                </div>
              </Card.Content>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isRoundComplete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-6 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.98, y: -8 }}
              className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-[#0b0d12]/95 p-8 text-center shadow-[0_30px_120px_rgba(0,0,0,0.55)]"
            >
              <div className="text-[0.65rem] uppercase tracking-[0.4em] text-white/40">
                {getIntermissionCopy().eyebrow}
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
                {getIntermissionCopy().title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/60 sm:text-base">
                {getIntermissionCopy().body}
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                  <div className="text-[0.65rem] uppercase tracking-[0.28em] text-white/35">Points</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {answerResult?.correct ? `+${answerResult.points}` : '+0'}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                  <div className="text-[0.65rem] uppercase tracking-[0.28em] text-white/35">Streak</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    x{answerResult?.streakCount ?? currentStreak}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                  <div className="text-[0.65rem] uppercase tracking-[0.28em] text-white/35">Recent rank</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {getRankLabel()}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-white/10 bg-black/25 px-6 py-5">
                <div className="text-[0.65rem] uppercase tracking-[0.38em] text-white/40">
                  {questionsRemaining > 0 ? 'Next round in' : 'Winner screen in'}
                </div>
                <div className="mt-2 font-mono text-5xl font-bold tracking-[-0.08em] text-white">
                  {intermissionCountdown ?? 0}
                </div>
                <div className="mt-3 text-sm text-white/50">
                  {questionsRemaining > 0
                    ? `${questionsRemaining} soal lagi setelah ini.`
                    : 'Abis ini langsung ke winner screen.'}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="border border-white/10 bg-white/[0.04] shadow-none">
        <Card.Content className="flex flex-wrap items-center gap-4 p-4">
          <span className="text-xs uppercase tracking-[0.3em] text-white/40">Scores</span>
          {players.map((player) => (
            <div key={player.id} className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/5 text-xs font-mono text-white/60">
                {(player.display_name || 'P').slice(0, 2).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-white">
                {roundScores[currentRound.id] && player.id === currentPlayerId
                  ? roundScores[currentRound.id]
                  : player.score}
              </span>
            </div>
          ))}
        </Card.Content>
      </Card>

      <AnimatePresence>
        {isConfirmingLeave && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm space-y-6 rounded-3xl border border-white/10 bg-black/80 px-6 py-8 text-center shadow-2xl"
            >
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-500/20 text-xl text-red-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-white">Leave match?</h3>
                <p className="mt-2 text-sm text-white/60">Are you sure you want to leave the game? Your progress will be lost.</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsConfirmingLeave(false)}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLeaveRoom}
                  className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-medium text-white transition hover:bg-red-600"
                >
                  Leave
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isLeaving && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md"
          >
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
            <div className="mt-4 text-sm font-medium uppercase tracking-widest text-white">Leaving the room...</div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

