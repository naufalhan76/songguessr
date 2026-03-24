'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRoom } from '@/lib/useRoom';
import { signInWithSpotify } from '@/lib/supabase';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, Card, Chip, Separator } from '@heroui/react';

interface RoomLobbyProps {
  roomCode: string;
  onGameStarted: (tracks: unknown[]) => void;
}

export default function RoomLobby({ roomCode, onGameStarted }: RoomLobbyProps) {
  const {
    room,
    players,
    currentUser,
    isHost,
    loading,
    error,
    hasSpotify,
    joinRoom,
    toggleReady,
    startGame,
  } = useRoom(roomCode);

  const [isConnectingSpotify, setIsConnectingSpotify] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [joinBase, setJoinBase] = useState(process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '');

  const roomMasterName = currentUser?.display_name ?? 'Roommaster';
  const readyCount = players.filter((p) => p.is_ready).length;
  const maxPlayerCount = (room?.settings?.max_players) ?? 4;
  const allPlayersReady = readyCount >= 2 && players.every((p) => p.is_ready);
  const readinessPercent = players.length > 0 ? Math.round((readyCount / players.length) * 100) : 0;
  const openSlots = Math.max(maxPlayerCount - players.length, 0);
  const canStartGame = isHost && hasSpotify && allPlayersReady;
  const joinUrl = joinBase ? `${joinBase}/room/${roomCode}` : `/room/${roomCode}`;
  const rounds = room?.settings?.rounds ?? 10;
  const timePerRound = room?.settings?.time_per_round ?? 30;
  const scoring = room?.settings?.point_system ?? 'speed';

  const qrUrl = useMemo(() => {
    if (!joinUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=16&data=${encodeURIComponent(joinUrl)}`;
  }, [joinUrl]);

  useEffect(() => {
    if (!joinBase && typeof window !== 'undefined') {
      setJoinBase(window.location.origin);
    }
  }, [joinBase]);

  // Auto-join room when user is authenticated
  useEffect(() => {
    if (currentUser && room && !loading) {
      const alreadyJoined = players.some((p) => p.user_id === currentUser.id);
      if (!alreadyJoined) {
        joinRoom();
      }
    }
  }, [currentUser, room, loading, players, joinRoom]);

  // Set isReady from player data
  useEffect(() => {
    if (currentUser) {
      const me = players.find((p) => p.user_id === currentUser.id);
      if (me) setIsReady(me.is_ready);
    }
  }, [players, currentUser]);

  // Detect when room status changes to 'active' (started by host or real-time update)
  useEffect(() => {
    if (room?.status === 'active' && countdown === null) {
      // Game started by someone else, transition immediately
      onGameStarted([]);
    }
  }, [room?.status, countdown, onGameStarted]);

  // Countdown effect
  useEffect(() => {
    if (countdown === null) return;

    if (countdown === 0) {
      // Trigger game start
      startGame().then((result) => {
        setCountdown(null);
        if (result) {
          onGameStarted(result.tracks);
        }
      });
      return;
    }

    const timeout = window.setTimeout(() => {
      setCountdown((c) => (c === null ? null : c - 1));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [countdown, startGame, onGameStarted]);

  const handleConnectSpotify = () => {
    setIsConnectingSpotify(true);
    const redirectTo = `${window.location.origin}/auth/callback?next=/room/${roomCode}`;

    signInWithSpotify(redirectTo).catch((err) => {
      console.error('Spotify sign-in failed', err);
      setIsConnectingSpotify(false);
      alert('Failed to start Spotify sign-in. Check your Supabase and Spotify redirect settings.');
    });
  };

  const handleToggleReady = async () => {
    const nextReady = !isReady;
    setIsReady(nextReady);
    await toggleReady(nextReady);
  };

  const handleStartGame = () => {
    if (countdown !== null) return;

    if (!hasSpotify) {
      alert('Roommaster must connect Spotify before starting the room.');
      return;
    }

    if (!allPlayersReady) {
      alert('All players must be ready and at least 2 players needed');
      return;
    }

    setCountdown(5);
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(roomCode);
    alert('Room code copied to clipboard!');
  };

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-5 text-white">
        <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
          <Card.Content className="flex flex-col items-center gap-4 p-10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <div className="text-sm text-white/55">Loading room...</div>
          </Card.Content>
        </Card>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-5 text-white">
        <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
          <Card.Content className="flex flex-col items-center gap-4 p-10 text-center">
            <div className="text-4xl">🚫</div>
            <div>
              <div className="text-xl font-semibold text-white">Room not found</div>
              <p className="mt-2 text-sm text-white/55">{error}</p>
            </div>
            <Button variant="primary" className="bg-white text-black" onPress={() => window.location.href = '/'}>
              Back to home
            </Button>
          </Card.Content>
        </Card>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-5 text-white">
        <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
          <Card.Content className="flex flex-col items-center gap-5 p-10 text-center">
            <Chip variant="soft" className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              Room {roomCode}
            </Chip>
            <div>
              <div className="text-2xl font-semibold text-white">Sign in to join</div>
              <p className="mt-2 max-w-sm text-sm text-white/55">
                Connect your Spotify account to join room {roomCode} and start playing.
              </p>
            </div>
            <button
              type="button"
              onClick={handleConnectSpotify}
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-medium text-black transition hover:scale-[1.01] active:scale-[0.99]"
            >
              {isConnectingSpotify ? 'Connecting...' : 'Sign in with Spotify'}
            </button>
          </Card.Content>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-5 text-white sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Chip variant="tertiary" className="border border-white/10 bg-white/5 text-white/70">
              Room lobby
            </Chip>
            <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/70">
              {readyCount}/{players.length} ready
            </Chip>
            <Chip variant="soft" className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              Roommaster: {roomMasterName}
            </Chip>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
              Room <span className="font-mono text-white/80">{roomCode}</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">
              Share the code, connect Spotify, and wait for the host to start the round.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="border-white/15 text-white" onPress={handleCopyCode}>
            Copy code
          </Button>
          <Button variant="primary" className="bg-white text-black" onPress={() => window.location.href = '/'}>
            Leave room
          </Button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          {/* Game settings (display only, settings come from room creation) */}
          <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
            <Card.Header className="px-6 pt-6">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Game settings</h2>
                <p className="mt-1 text-sm text-white/50">Set by the room host.</p>
              </div>
            </Card.Header>
            <Card.Content className="grid gap-4 px-6 pb-6 md:grid-cols-4">
              <div className="space-y-1 rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-[0.65rem] uppercase tracking-[0.28em] text-white/40">Rounds</div>
                <div className="text-sm font-medium text-white">{rounds}</div>
              </div>
              <div className="space-y-1 rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-[0.65rem] uppercase tracking-[0.28em] text-white/40">Time</div>
                <div className="text-sm font-medium text-white">{timePerRound}s</div>
              </div>
              <div className="space-y-1 rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-[0.65rem] uppercase tracking-[0.28em] text-white/40">Limit</div>
                <div className="text-sm font-medium text-white">{maxPlayerCount} players</div>
              </div>
              <div className="space-y-1 rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-[0.65rem] uppercase tracking-[0.28em] text-white/40">Score</div>
                <div className="text-sm font-medium text-white">{scoring === 'speed' ? 'Speed based' : 'Correct only'}</div>
              </div>
            </Card.Content>
          </Card>

          {/* Players */}
          <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
            <Card.Header className="flex flex-col items-start gap-3 px-6 pt-6">
              <div className="flex w-full items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Players</h2>
                  <p className="mt-1 text-sm text-white/50">
                    Up to {maxPlayerCount} total players including the roommaster.
                  </p>
                </div>
                <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/70">
                  {players.length}/{maxPlayerCount}
                </Chip>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-white" style={{ width: `${readinessPercent}%` }} />
              </div>
            </Card.Header>
            <Card.Content className="space-y-3 px-6 pb-6">
              {players.map((player, index) => {
                const isCurrentUser = player.user_id === currentUser?.id;
                return (
                  <div
                    key={player.id}
                    className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 transition-colors hover:bg-white/[0.05]"
                  >
                    <div className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 font-mono text-sm tracking-[0.2em] text-white/80">
                      {player.user_id.slice(-2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-white">{isCurrentUser ? 'You' : `Player ${index + 1}`}</div>
                        {player.user_id === room?.host_id && (
                          <Chip variant="soft" className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                            Roommaster
                          </Chip>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-white/48">
                        {player.is_ready ? 'Ready to play' : 'Waiting for readiness'}
                      </div>
                    </div>
                    <Chip
                      variant={player.is_ready ? 'primary' : 'secondary'}
                      className={player.is_ready ? 'bg-white text-black' : 'border border-white/10 bg-white/5 text-white/55'}
                    >
                      {player.is_ready ? 'Ready' : 'Waiting'}
                    </Chip>
                  </div>
                );
              })}
              {players.length === 0 && (
                <div className="py-8 text-center text-sm text-white/40">
                  No players yet. Share the room code to invite friends.
                </div>
              )}
            </Card.Content>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Room status */}
          <Card className="border border-white/10 bg-white/[0.04] shadow-none">
            <Card.Header className="px-6 pt-6">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Room status</h2>
                <p className="mt-1 text-sm text-white/50">The room stays readable at a glance.</p>
              </div>
            </Card.Header>
            <Card.Content className="space-y-4 px-6 pb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/50">Room code</span>
                <span className="font-mono text-sm tracking-[0.28em] text-white/85">{roomCode}</span>
              </div>
              <Separator className="bg-white/10" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/50">Mode</span>
                <span className="text-sm text-white">Top tracks</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/50">Status</span>
                <Chip variant="primary" className="bg-white text-black">
                  {room?.status ?? 'waiting'}
                </Chip>
              </div>
              <Separator className="bg-white/10" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/50">Roommaster</span>
                <span className="text-sm text-emerald-300">{roomMasterName}</span>
              </div>
              <Separator className="bg-white/10" />
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">Players ready</span>
                  <span className="text-white">{readyCount}/{players.length}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-white" style={{ width: `${readinessPercent}%` }} />
                </div>
                <div className="flex items-center justify-between text-sm text-white/50">
                  <span>Open slots</span>
                  <span className="text-white">{openSlots}</span>
                </div>
              </div>
            </Card.Content>
          </Card>

          {/* Ready up */}
          <Card className="border border-white/10 bg-white/[0.04] shadow-none">
            <Card.Header className="px-6 pt-6">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Ready up</h2>
                <p className="mt-1 text-sm text-white/50">A single action, no clutter.</p>
              </div>
            </Card.Header>
            <Card.Content className="space-y-5 px-6 pb-6">
              <button
                type="button"
                onClick={handleToggleReady}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-left transition hover:bg-white/[0.05]"
              >
                <div>
                  <div className="text-sm text-white">I'm ready to play</div>
                  <div className="mt-1 text-sm text-white/50">Signal to the host that you are locked in.</div>
                </div>
                <div className={`grid h-10 w-10 place-items-center rounded-full border text-sm transition ${isReady ? 'border-white bg-white text-black' : 'border-white/15 bg-transparent text-white/50'}`}>
                  {isReady ? 'On' : 'Off'}
                </div>
              </button>

              <Button
                variant="primary"
                size="lg"
                className="w-full bg-white text-black"
                onPress={handleStartGame}
                isDisabled={!canStartGame || countdown !== null}
              >
                {countdown !== null
                  ? 'Starting...'
                  : !hasSpotify && isHost
                    ? 'Connect Spotify first'
                    : isHost
                      ? 'Start game'
                      : 'Waiting for host'}
              </Button>

              {isHost && !hasSpotify && (
                <button
                  type="button"
                  onClick={handleConnectSpotify}
                  className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 text-sm font-medium text-emerald-300 transition hover:bg-emerald-400/15"
                >
                  {isConnectingSpotify ? 'Connecting to Spotify' : 'Connect Spotify first'}
                </button>
              )}

              {!hasSpotify && !isHost && (
                <p className="text-center text-sm text-white/45">
                  Waiting for the roommaster to connect Spotify.
                </p>
              )}

              {isHost && hasSpotify && !allPlayersReady && (
                <p className="text-center text-sm text-white/45">
                  {players.length < 2 ? 'Need at least 2 players to start' : 'All players must be ready'}
                </p>
              )}
            </Card.Content>
          </Card>

          {/* QR code */}
          <Card className="border border-white/10 bg-white/[0.04] shadow-none">
            <Card.Header className="px-6 pt-6">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Mobile join</h2>
                <p className="mt-1 text-sm text-white/50">Scan this code to open the room on mobile and join directly.</p>
              </div>
            </Card.Header>
            <Card.Content className="space-y-5 px-6 pb-6">
              <div className="flex items-center justify-center rounded-[2rem] border border-dashed border-white/15 bg-black/20 p-8">
                {qrUrl ? (
                  <div className="rounded-[1.5rem] bg-white p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                    <img src={qrUrl} alt={`QR code to join room ${roomCode}`} className="h-56 w-56 rounded-xl sm:h-64 sm:w-64" />
                  </div>
                ) : (
                  <div className="grid h-56 w-56 place-items-center rounded-[1.5rem] border border-white/10 bg-white/[0.03] text-sm text-white/35 sm:h-64 sm:w-64">
                    QR loading
                  </div>
                )}
              </div>
              <div className="space-y-2 text-center">
                <div className="text-sm font-medium text-white">Tap or scan from mobile</div>
                <div className="text-sm text-white/50">
                  Or visit <span className="font-mono text-white/75">{joinUrl || `/${roomCode}`}</span>
                </div>
              </div>
            </Card.Content>
          </Card>
        </div>
      </div>

      {/* Countdown overlay */}
      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 backdrop-blur-md"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 0.85, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="flex min-w-[280px] flex-col items-center gap-5 rounded-[2rem] border border-white/10 bg-[#0d0d0d]/80 px-10 py-12 text-center shadow-[0_30px_120px_rgba(0,0,0,0.55)]"
            >
              <div className="text-[0.65rem] uppercase tracking-[0.45em] text-white/45">Starting game</div>
              <div className="relative grid place-items-center">
                <div className="absolute inset-0 rounded-full border border-white/10 bg-white/5 blur-2xl" />
                <motion.div
                  key={`count-${countdown}`}
                  initial={{ scale: 0.72, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  className="relative font-mono text-[6.5rem] font-bold tracking-[-0.08em] text-white sm:text-8xl"
                >
                  {countdown}
                </motion.div>
              </div>
              <div className="h-1.5 w-36 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  key={`bar-${countdown}`}
                  initial={{ width: '100%' }}
                  animate={{ width: `${Math.max(countdown, 0) * 20}%` }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                  className="h-full rounded-full bg-white"
                />
              </div>
              <p className="max-w-xs text-sm leading-6 text-white/55">
                Get ready. The round is about to start.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
