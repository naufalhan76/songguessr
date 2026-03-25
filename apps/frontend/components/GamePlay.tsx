'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Track, Room, Player } from '@songguessr/shared';
import { supabase } from '@/lib/supabase';
import AudioPlayer from '@/components/AudioPlayer';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, Chip } from '@heroui/react';

interface GamePlayProps {
  room: Room;
  players: Player[];
  currentPlayerId: string;
  roomCode: string;
  tracks: Track[];
  onGameEnd: () => void;
}

interface RoundData {
  id: string;
  round_number: number;
  track_id: string;
}

export default function GamePlay({ room, players, currentPlayerId, roomCode, tracks, onGameEnd }: GamePlayProps) {
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(room.settings.time_per_round);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<{ correct: boolean; points: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [roundScores, setRoundScores] = useState<Record<string, number>>({});
  const [showingResults, setShowingResults] = useState(false);
  const timerRef = useRef<number | null>(null);
  const roundStartTimeRef = useRef<number>(Date.now());

  // Fetch game rounds
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
  const correctTrack = currentRound ? tracks.find((t) => t.id === currentRound.track_id) : null;

  // Generate 4 options for current round (1 correct + 3 random distractors)
  const getOptions = useCallback((): Track[] => {
    if (!correctTrack) return [];

    const others = tracks.filter((t) => t.id !== correctTrack.id);
    // Shuffle others
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }

    const distractors = others.slice(0, 3);
    const options = [correctTrack, ...distractors];

    // Shuffle options
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    return options;
  }, [correctTrack, tracks]);

  const [options, setOptions] = useState<Track[]>([]);

  // Reset state for each new round
  useEffect(() => {
    if (!currentRound) return;

    setSelectedAnswer(null);
    setAnswerResult(null);
    setShowingResults(false);
    setTimeRemaining(room.settings.time_per_round);
    roundStartTimeRef.current = Date.now();
    setOptions(getOptions());
  }, [currentRound, room.settings.time_per_round, getOptions]);

  // Countdown timer
  useEffect(() => {
    if (showingResults || !currentRound) return;

    timerRef.current = window.setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Time's up — auto-submit wrong answer if not answered
          if (!selectedAnswer) {
            setShowingResults(true);
            setAnswerResult({ correct: false, points: 0 });
            setTimeout(() => advanceRound(), 3000);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentRound?.id, showingResults]);

  const submitAnswer = async (trackId: string) => {
    if (selectedAnswer || isSubmitting || !currentRound) return;

    setSelectedAnswer(trackId);
    setIsSubmitting(true);

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
        setAnswerResult({
          correct: json.data.is_correct,
          points: json.data.points_awarded,
        });
        setRoundScores((prev) => ({
          ...prev,
          [currentRound.id]: json.data.new_score,
        }));
      } else {
        setAnswerResult({ correct: false, points: 0 });
      }
    } catch {
      setAnswerResult({ correct: false, points: 0 });
    }

    setIsSubmitting(false);
    setShowingResults(true);
    if (timerRef.current) clearInterval(timerRef.current);

    // Auto advance after showing result
    setTimeout(() => advanceRound(), 3000);
  };

  const advanceRound = () => {
    if (currentRoundIndex >= rounds.length - 1) {
      // Game over
      onGameEnd();
    } else {
      setCurrentRoundIndex((prev) => prev + 1);
    }
  };

  // Loading state
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
      {/* Round header */}
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/70">
            Round {currentRound.round_number}/{rounds.length}
          </Chip>
          <Chip variant="soft" className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
            Room {roomCode}
          </Chip>
        </div>
        <div className="flex items-center gap-3">
          <div className={`font-mono text-3xl font-bold ${timerColor} transition-colors`}>
            {timeRemaining}s
          </div>
        </div>
      </header>

      {/* Timer bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-white"
          animate={{ width: `${timerBarWidth}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Audio player */}
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
          />
        </Card.Content>
      </Card>

      {/* Answer options */}
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
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Answer feedback overlay */}
      <AnimatePresence>
        {answerResult && showingResults && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-6"
          >
            <Card className={`border ${answerResult.correct ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-red-400/30 bg-red-400/10'} shadow-[0_20px_80px_rgba(0,0,0,0.5)]`}>
              <Card.Content className="flex items-center gap-4 px-6 py-4">
                <div className={`grid h-12 w-12 place-items-center rounded-full ${answerResult.correct ? 'bg-emerald-400/20 text-emerald-300' : 'bg-red-400/20 text-red-300'}`}>
                  {answerResult.correct ? '✓' : '✗'}
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
                </div>
              </Card.Content>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player scores sidebar (bottom on mobile) */}
      <Card className="border border-white/10 bg-white/[0.04] shadow-none">
        <Card.Content className="flex flex-wrap items-center gap-4 p-4">
          <span className="text-xs uppercase tracking-[0.3em] text-white/40">Scores</span>
          {players.map((player) => (
            <div key={player.id} className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/5 text-xs font-mono text-white/60">
                {(player.display_name || 'P').slice(0, 2).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-white">
                {roundScores[currentRound?.id] && player.id === currentPlayerId
                  ? roundScores[currentRound.id]
                  : player.score}
              </span>
            </div>
          ))}
        </Card.Content>
      </Card>
    </main>
  );
}
