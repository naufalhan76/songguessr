'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useRoom } from '@/lib/useRoom';
import { isAudioPlaybackPrimed, primeAudioPlayback } from '@/lib/audio';
import { clearRoomPlayerId, createGuestSession, getGuestSession, setRoomPlayerId, supabase } from '@/lib/supabase';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, Card, Chip, Separator } from '@heroui/react';

interface RoomLobbyProps {
  roomCode: string;
  onSelectionStarted: () => void;
  onPlayerIdSet: (playerId: string) => void;
}

export default function RoomLobby({ roomCode, onSelectionStarted, onPlayerIdSet }: RoomLobbyProps) {
  const {
    room,
    players,
    currentPlayerId,
    currentPlayerName,
    isHost,
    loading,
    error,
    joinRoom,
    toggleReady,
    startSelection,
    updateSettings,
  } = useRoom(roomCode);

  const [displayName, setDisplayName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [joinBase, setJoinBase] = useState(process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '');

  // Settings editing state
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editRounds, setEditRounds] = useState(10);
  const [editTime, setEditTime] = useState(30);
  const [editMaxPlayers, setEditMaxPlayers] = useState(4);
  const [editScoring, setEditScoring] = useState<'speed' | 'correct_only'>('speed');
  const [editSelectionTime, setEditSelectionTime] = useState(5);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Room name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editRoomName, setEditRoomName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const lobbyChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [audioPrimed, setAudioPrimed] = useState(() => isAudioPlaybackPrimed());

  const readyCount = players.filter((p) => p.is_ready).length;
  const maxPlayerCount = (room?.settings?.max_players) ?? 4;
  const allPlayersReady = readyCount >= 2 && players.every((p) => p.is_ready);
  const readinessPercent = players.length > 0 ? Math.round((readyCount / players.length) * 100) : 0;
  const openSlots = Math.max(maxPlayerCount - players.length, 0);
  const canStartSelection = isHost && allPlayersReady;
  const joinUrl = joinBase ? `${joinBase}/room/${roomCode}` : `/room/${roomCode}`;
  const rounds = room?.settings?.rounds ?? 10;
  const timePerRound = room?.settings?.time_per_round ?? 30;
  const scoring = room?.settings?.point_system ?? 'speed';
  const selectionTime = room?.settings?.selection_time ?? 5;
  const roomDisplayName = room?.room_name ?? null;

  const hasJoined = Boolean(currentPlayerId);

  const qrUrl = useMemo(() => {
    if (!joinUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=16&data=${encodeURIComponent(joinUrl)}`;
  }, [joinUrl]);

  useEffect(() => {
    if (!joinBase && typeof window !== 'undefined') {
      setJoinBase(window.location.origin);
    }
  }, [joinBase]);

  // Pre-fill display name from guest session
  useEffect(() => {
    const session = getGuestSession();
    if (session) {
      setDisplayName(session.display_name);
    }
  }, []);

  // Sync isReady from player data
  useEffect(() => {
    if (currentPlayerId) {
      const me = players.find((p) => p.id === currentPlayerId);
      if (me) setIsReady(me.is_ready);
    }
  }, [players, currentPlayerId]);

  // Detect when room status changes to 'selecting'
  useEffect(() => {
    if (room?.status === 'selecting' && countdown === null) {
      onSelectionStarted();
    }
  }, [room?.status, countdown, onSelectionStarted]);

  // Listen for countdown broadcasts
  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`lobby-events:${room.id}`)
      .on('broadcast', { event: 'start-selection-countdown' }, () => {
        setCountdown(5);
      })
      .subscribe();

    lobbyChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      lobbyChannelRef.current = null;
    };
  }, [room?.id]);

  // Countdown effect
  useEffect(() => {
    if (countdown === null) return;

    if (countdown === 0) {
      if (isHost) {
        startSelection().then((ok) => {
          setCountdown(null);
          if (ok) {
            onSelectionStarted();
          }
        });
      } else {
        setCountdown(null);
      }
      return;
    }

    const timeout = window.setTimeout(() => {
      setCountdown((c) => (c === null ? null : c - 1));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [countdown, isHost, startSelection, onSelectionStarted]);

  const handleJoinRoom = async () => {
    if (!displayName.trim()) return;
    setIsJoining(true);

    // Create guest session
    createGuestSession(displayName.trim());

    const player = await joinRoom(displayName.trim());
    if (player) {
      setRoomPlayerId(roomCode, player.id);
      onPlayerIdSet(player.id);
    }
    setIsJoining(false);
  };

  const handleToggleReady = async () => {
    const nextReady = !isReady;
    setIsReady(nextReady);

    const primePromise = nextReady ? primeAudioPlayback() : Promise.resolve(false);
    const ok = await toggleReady(nextReady);
    if (!ok) {
      setIsReady(!nextReady);
      return;
    }

    const primed = await primePromise;
    if (primed) {
      setAudioPrimed(true);
    }
  };

  const handleStartSelection = () => {
    if (countdown !== null) return;
    if (!allPlayersReady) {
      alert('All players must be ready and at least 2 players needed');
      return;
    }
    
    // Broadcast to other clients
    lobbyChannelRef.current?.send({
      type: 'broadcast',
      event: 'start-selection-countdown',
      payload: {},
    });

    // Also start locally — Supabase broadcast does NOT echo back to the sender
    setCountdown(5);
  };

  const handleShareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'muze.games',
          text: `Join my muze.games room: ${roomDisplayName || roomCode}`,
          url: joinUrl,
        });
        return;
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error('Error sharing:', e);
        }
      }
    }
    
    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(joinUrl);
      alert('Room link copied to clipboard!');
    } catch (e) {
      console.error('Failed to copy', e);
      alert('Failed to copy link');
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoinRoom();
  };

  const handleLeaveRoom = async () => {
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
    } catch (e) {
      console.error('Failed to leave room', e);
    }

    clearRoomPlayerId(roomCode);
    window.location.href = '/';
  };

  // Settings editing handlers
  const handleStartEditSettings = useCallback(() => {
    setEditRounds(rounds);
    setEditTime(timePerRound);
    setEditMaxPlayers(maxPlayerCount);
    setEditScoring(scoring as 'speed' | 'correct_only');
    setEditSelectionTime(selectionTime);
    setIsEditingSettings(true);
  }, [rounds, timePerRound, maxPlayerCount, scoring, selectionTime]);

  const handleCancelEditSettings = () => {
    setIsEditingSettings(false);
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    const ok = await updateSettings({
      rounds: editRounds,
      time_per_round: editTime,
      max_players: editMaxPlayers,
      point_system: editScoring,
      selection_time: editSelectionTime,
    });
    setIsSavingSettings(false);
    if (ok) setIsEditingSettings(false);
  };

  // Room name editing
  const handleStartEditName = useCallback(() => {
    setEditRoomName(roomDisplayName || '');
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [roomDisplayName]);

  const handleCancelEditName = () => { setIsEditingName(false); };

  const handleSaveName = async () => {
    setIsSavingName(true);
    const ok = await updateSettings({ room_name: editRoomName.trim() || null });
    setIsSavingName(false);
    if (ok) setIsEditingName(false);
  };

  const handleNameEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveName();
    if (e.key === 'Escape') handleCancelEditName();
  };

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-3 py-4 text-white sm:px-4 sm:py-5">
        <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
          <Card.Content className="flex flex-col items-center gap-4 p-6 text-center sm:p-10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <div className="text-sm text-white/55">Loading room...</div>
          </Card.Content>
        </Card>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-3 py-4 text-white sm:px-4 sm:py-5">
        <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
          <Card.Content className="flex flex-col items-center gap-4 p-6 text-center sm:p-10">
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

  // Guest join screen — show before player has joined
  if (!hasJoined) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-3 py-4 text-white sm:px-4 sm:py-5">
        <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
          <Card.Content className="flex flex-col items-center gap-5 p-6 text-center sm:p-10">
            <Chip variant="soft" className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              Room {roomCode}
            </Chip>
            <div>
              <div className="text-2xl font-semibold text-white">Join the game</div>
              <p className="mt-2 max-w-sm text-sm text-white/55">
                Enter your name to join room {roomCode} and start playing.
              </p>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-3">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 20))}
                onKeyDown={handleNameKeyDown}
                placeholder="Your display name"
                maxLength={20}
                className="h-12 w-full rounded-2xl border border-white/15 bg-black/30 px-4 text-center text-lg font-medium text-white outline-none transition placeholder:text-white/30 focus:border-white/30"
                autoFocus
              />
              <button
                type="button"
                onClick={handleJoinRoom}
                disabled={!displayName.trim() || isJoining}
                className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-medium text-black transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
              >
                {isJoining ? 'Joining...' : 'Join Room'}
              </button>
            </div>
          </Card.Content>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-3 py-4 text-white sm:gap-8 sm:px-6 lg:px-8">
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
              Host: {currentPlayerName ?? 'Host'}
            </Chip>
          </div>
          <div>
            {isEditingName ? (
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={nameInputRef}
                  value={editRoomName}
                  onChange={(e) => setEditRoomName(e.target.value.slice(0, 50))}
                  onKeyDown={handleNameEditKeyDown}
                  placeholder="Enter room name..."
                  maxLength={50}
                  className="h-12 w-full max-w-md rounded-2xl border border-white/15 bg-black/30 px-4 text-2xl font-semibold tracking-[-0.03em] text-white outline-none transition placeholder:text-white/30 focus:border-white/30 sm:text-3xl"
                />
                <button type="button" onClick={handleSaveName} disabled={isSavingName} className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500/20 px-4 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-50">
                  {isSavingName ? '...' : 'Save'}
                </button>
                <button type="button" onClick={handleCancelEditName} className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white/60 transition hover:bg-white/10">
                  Cancel
                </button>
              </div>
            ) : (
              <h1 className="group flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                {roomDisplayName ? (
                  <>
                    <span>{roomDisplayName}</span>
                    <span className="font-mono text-lg text-white/40 sm:text-2xl">{roomCode}</span>
                  </>
                ) : (
                  <>
                    Room <span className="font-mono text-white/80">{roomCode}</span>
                  </>
                )}
                {isHost && (
                  <button type="button" onClick={handleStartEditName} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/40 opacity-0 transition hover:bg-white/10 hover:text-white/70 group-hover:opacity-100" title="Rename room">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                )}
              </h1>
            )}
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">
              Share the code, ready up, and the host will start song selection.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={handleShareLink}
            className="group flex min-h-14 items-center justify-between rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-3 text-left transition-all hover:border-emerald-300/40 hover:bg-emerald-400/15 hover:shadow-[0_0_30px_rgba(52,211,153,0.12)]"
            title="Share room link"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300 transition group-hover:scale-105 group-hover:bg-emerald-400/20">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Share room link</div>
                <div className="text-xs text-emerald-200/70">Invite friends fast</div>
              </div>
            </div>
            <div className="pl-4 text-xs font-medium uppercase tracking-[0.25em] text-emerald-300/75">
              Share
            </div>
          </button>

          <button
            type="button"
            onClick={handleLeaveRoom}
            disabled={isLeaving}
            className="group flex min-h-14 items-center justify-between rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-3 text-left transition-all hover:border-red-300/40 hover:bg-red-500/15 hover:shadow-[0_0_30px_rgba(248,113,113,0.12)] disabled:cursor-not-allowed disabled:opacity-60"
            title="Leave room"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-400/15 text-red-300 transition group-hover:scale-105 group-hover:bg-red-400/20">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-white">{isLeaving ? 'Leaving room...' : 'Leave room'}</div>
                <div className="text-xs text-red-200/70">Exit this lobby</div>
              </div>
            </div>
            <div className="pl-4 text-xs font-medium uppercase tracking-[0.25em] text-red-300/75">
              Exit
            </div>
          </button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          {/* Game settings */}
          <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
            <Card.Header className="flex items-center justify-between px-6 pt-6">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Game settings</h2>
                <p className="mt-1 text-sm text-white/50">
                  {isHost ? 'Click edit to customize game settings.' : 'Wait for host set the room.'}
                </p>
              </div>
              {isHost && !isEditingSettings && (
                <button type="button" onClick={handleStartEditSettings} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white/60 transition hover:bg-white/10 hover:text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  Edit
                </button>
              )}
            </Card.Header>
            <Card.Content className="px-6 pb-6">
              {isEditingSettings ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <label className="text-[0.65rem] uppercase tracking-[0.28em] text-white/40">Rounds</label>
                      <select value={editRounds} onChange={(e) => setEditRounds(Number(e.target.value))} className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm font-medium text-white outline-none transition focus:border-white/25">
                        {[3, 5, 7, 10, 15, 20].map((v) => <option key={v} value={v}>{v} rounds</option>)}
                      </select>
                    </div>
                    <div className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <label className="text-[0.65rem] uppercase tracking-[0.28em] text-white/40">Time per round</label>
                      <select value={editTime} onChange={(e) => setEditTime(Number(e.target.value))} className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm font-medium text-white outline-none transition focus:border-white/25">
                        {[10, 15, 20, 25, 30, 45, 60].map((v) => <option key={v} value={v}>{v} seconds</option>)}
                      </select>
                    </div>
                    <div className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <label className="text-[0.65rem] uppercase tracking-[0.28em] text-white/40">Max players</label>
                      <select value={editMaxPlayers} onChange={(e) => setEditMaxPlayers(Number(e.target.value))} className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm font-medium text-white outline-none transition focus:border-white/25">
                        {[2, 3, 4, 5, 6, 7, 8].map((v) => <option key={v} value={v}>{v} players</option>)}
                      </select>
                    </div>
                    <div className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <label className="text-[0.65rem] uppercase tracking-[0.28em] text-white/40">Scoring</label>
                      <select value={editScoring} onChange={(e) => setEditScoring(e.target.value as 'speed' | 'correct_only')} className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm font-medium text-white outline-none transition focus:border-white/25">
                        <option value="speed">Speed based</option>
                        <option value="correct_only">Correct only</option>
                      </select>
                    </div>
                    <div className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4 md:col-span-2">
                      <label className="text-[0.65rem] uppercase tracking-[0.28em] text-white/40">Song Selection Time</label>
                      <select value={editSelectionTime} onChange={(e) => setEditSelectionTime(Number(e.target.value))} className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm font-medium text-white outline-none transition focus:border-white/25">
                        <option value={2}>2 minutes</option>
                        <option value={5}>5 minutes</option>
                        <option value={10}>10 minutes</option>
                        <option value={15}>15 minutes</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={handleSaveSettings} disabled={isSavingSettings} className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500/20 px-5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-50">
                      {isSavingSettings ? 'Saving...' : 'Save settings'}
                    </button>
                    <button type="button" onClick={handleCancelEditSettings} className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-white/60 transition hover:bg-white/10">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
                    <div className="text-sm font-medium text-white">{scoring === 'speed' ? 'Speed' : 'Correct'}</div>
                  </div>
                  <div className="space-y-1 rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="text-[0.65rem] uppercase tracking-[0.28em] text-white/40">Selection</div>
                    <div className="text-sm font-medium text-white">{selectionTime} min</div>
                  </div>
                </div>
              )}
            </Card.Content>
          </Card>

          {/* Players */}
          <Card className="border border-white/10 bg-white/[0.04] shadow-[0_20px_80px_rgba(0,0,0,0.38)]">
            <Card.Header className="flex flex-col items-start gap-3 px-6 pt-6">
              <div className="flex w-full items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Players</h2>
                  <p className="mt-1 text-sm text-white/50">Up to {maxPlayerCount} total players.</p>
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
              {players.map((player) => {
                const isMe = player.id === currentPlayerId;
                const isPlayerHost = player.id === room?.host_id;
                return (
                  <div key={player.id} className="flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 transition-colors hover:bg-white/[0.05] sm:flex-row sm:items-center sm:gap-4">
                    <div className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 font-mono text-sm tracking-[0.2em] text-white/80">
                      {(player.display_name || '??').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-white">{player.display_name || 'Player'}</div>
                        {isMe && <Chip variant="soft" className="border border-violet-400/20 bg-violet-400/10 text-violet-300">You</Chip>}
                        {isPlayerHost && <Chip variant="soft" className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">Host</Chip>}
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
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Room status</h2>
            </Card.Header>
            <Card.Content className="space-y-4 px-6 pb-6">
              {roomDisplayName && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/50">Room name</span>
                    <span className="text-sm font-medium text-white">{roomDisplayName}</span>
                  </div>
                  <Separator className="bg-white/10" />
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/50">Room code</span>
                <span className="font-mono text-sm tracking-[0.28em] text-white/85">{roomCode}</span>
              </div>
              <Separator className="bg-white/10" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/50">Status</span>
                <Chip variant="primary" className="bg-white text-black">
                  {room?.status ?? 'waiting'}
                </Chip>
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
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Ready up</h2>
            </Card.Header>
            <Card.Content className="space-y-5 px-6 pb-6">
              <button
                type="button"
                onClick={handleToggleReady}
                className={`group relative flex w-full items-center justify-between overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 ${
                  isReady 
                    ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_30px_-5px_var(--tw-shadow-color)] shadow-emerald-500/20' 
                    : 'border-white/10 bg-black/25 hover:border-white/20 hover:bg-white/[0.05]'
                }`}
              >
                {isReady && (
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/[0.07] to-emerald-500/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                )}
                <div className="relative">
                  <div className={`text-base font-semibold tracking-[-0.01em] transition-colors ${isReady ? 'text-emerald-400' : 'text-white'}`}>
                    {isReady ? 'You are locked in!' : 'Ready to play?'}
                  </div>
                  <div className={`mt-1 text-sm transition-colors ${isReady ? 'text-emerald-400/70' : 'text-white/50'}`}>
                    {isReady ? 'Waiting for others...' : 'Signal to the host that you are ready.'}
                  </div>
                </div>
                <div className="relative flex h-10 items-center justify-center gap-2">
                  <div className={`grid h-10 w-24 place-items-center rounded-xl border text-sm font-bold tracking-wide transition-all duration-300 ${
                    isReady 
                      ? 'scale-105 border-emerald-400 bg-emerald-400 text-black shadow-[0_0_20px_rgba(52,211,153,0.4)]' 
                      : 'border-white/15 bg-transparent text-white/50 group-hover:border-white/30 group-hover:text-white/80'
                  }`}>
                    {isReady ? 'READY' : 'LOCK IN'}
                  </div>
                </div>
              </button>

              <div className={`rounded-2xl border px-4 py-3 text-sm ${
                audioPrimed
                  ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                  : 'border-amber-400/20 bg-amber-400/10 text-amber-100/85'
              }`}>
                <div className="font-semibold text-white">
                  {audioPrimed ? 'Sound unlocked for this device' : 'Prime audio before the match'}
                </div>
                <p className={`mt-1 leading-6 ${audioPrimed ? 'text-emerald-100/75' : 'text-amber-100/75'}`}>
                  {audioPrimed
                    ? 'Android autoplay should have a better chance now. If the browser still blocks YouTube later, one tap on Start sound will resume it.'
                    : 'Tap Ready once on this device before the match starts. We use that gesture to help Android allow music playback when the round begins.'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleStartSelection}
                disabled={!canStartSelection || countdown !== null || !isHost}
                className={`w-full rounded-2xl py-4 text-base font-bold tracking-tight transition-all duration-200 ${
                  countdown !== null
                    ? 'animate-pulse bg-emerald-500 text-white shadow-[0_0_30px_rgba(52,211,153,0.4)]'
                    : canStartSelection && isHost
                      ? 'bg-white text-black shadow-lg shadow-white/10 hover:scale-[1.02] hover:shadow-white/20 active:scale-[0.98]'
                      : 'bg-white/10 text-white/40 cursor-not-allowed'
                }`}
              >
                {countdown !== null
                  ? '✦ Starting...'
                  : isHost
                    ? '▶ Start Song Selection'
                    : 'Waiting for host'}
              </button>

              {isHost && !allPlayersReady && (
                <p className="text-center text-sm text-white/45">
                  {players.length < 2 ? 'Need at least 2 players to start' : 'All players must be ready'}
                </p>
              )}
            </Card.Content>
          </Card>

          {/* QR code */}
          <Card className="border border-white/10 bg-white/[0.04] shadow-none">
            <Card.Header className="px-6 pt-6">
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">Mobile join</h2>
              <p className="mt-1 text-sm text-white/50">Scan to join on mobile.</p>
            </Card.Header>
            <Card.Content className="space-y-5 px-6 pb-6">
              <div className="flex items-center justify-center rounded-[2rem] border border-dashed border-white/15 bg-black/20 p-5 sm:p-8">
                {qrUrl ? (
                  <div className="rounded-[1.5rem] bg-white p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                    <img src={qrUrl} alt={`QR code to join room ${roomCode}`} className="h-40 w-40 rounded-xl sm:h-56 sm:w-56 lg:h-64 lg:w-64" />
                  </div>
                ) : (
                  <div className="grid h-40 w-40 place-items-center rounded-[1.5rem] border border-white/10 bg-white/[0.03] text-sm text-white/35 sm:h-56 sm:w-56 lg:h-64 lg:w-64">
                    QR loading
                  </div>
                )}
              </div>
              <div className="space-y-3 text-center">
                <div className="text-sm font-medium text-white">Tap to copy or share link</div>
                <button 
                  type="button"
                  onClick={handleShareLink}
                  className="group flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
                  title="Share or copy room link"
                >
                  <div className="truncate pr-4 font-mono text-sm text-white/75">
                    {joinUrl || `/${roomCode}`}
                  </div>
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-white transition group-hover:bg-white/20 group-hover:text-emerald-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  </div>
                </button>
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
              className="flex w-full max-w-sm flex-col items-center gap-5 rounded-[1.7rem] border border-white/10 bg-[#0d0d0d]/80 px-6 py-8 text-center shadow-[0_30px_120px_rgba(0,0,0,0.55)] sm:max-w-none sm:min-w-[280px] sm:rounded-[2rem] sm:px-10 sm:py-12"
            >
              <div className="text-[0.65rem] uppercase tracking-[0.45em] text-white/45">Starting song selection</div>
              <div className="relative grid place-items-center">
                <div className="absolute inset-0 rounded-full border border-white/10 bg-white/5 blur-2xl" />
                <motion.div
                  key={`count-${countdown}`}
                  initial={{ scale: 0.72, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  className="relative font-mono text-[5rem] font-bold tracking-[-0.08em] text-white sm:text-8xl"
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
                Get ready to pick your songs!
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leave overlay */}
      <AnimatePresence>
        {isLeaving && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md"
          >
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
            <div className="mt-4 text-sm font-medium tracking-widest text-white uppercase">Leaving the room...</div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

