'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Track, Room, Player } from '@songguessr/shared';
import { clearRoomPlayerId, supabase } from '@/lib/supabase';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, Chip, Button } from '@heroui/react';

interface SongSelectionProps {
  room: Room;
  players: Player[];
  currentPlayerId: string;
  roomCode: string;
  onGameStarted: (tracks: unknown[], distractors?: unknown[]) => void;
}

interface RoomSongEntry {
  id: string;
  player_id: string;
  player_name: string;
  track: Track | null;
  masked_label: string;
  masked_slot: number;
  order: number;
  added_at: string;
}

interface SearchResult {
  spotify_id: string;
  title: string;
  artists: string[];
  album: string;
  album_art_url: string;
  preview_url: string | null;
  has_preview: boolean;
  youtube_id?: string;
  duration_ms: number;
  popularity: number;
}

export default function SongSelection({
  room,
  players,
  currentPlayerId,
  roomCode,
  onGameStarted,
}: SongSelectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [roomSongs, setRoomSongs] = useState<RoomSongEntry[]>([]);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [addingTrackTitle, setAddingTrackTitle] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [autoStartAt, setAutoStartAt] = useState<string | null>(null);
  const [autoStartNow, setAutoStartNow] = useState(() => Date.now());
  const searchTimeoutRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const selectionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const autoStartTriggeredRef = useRef(false);

  const isHost = room.host_id === currentPlayerId;
  const selectionTime = room.settings?.selection_time ?? 5;
  const totalRounds = room.settings?.rounds ?? 10;
  const songsPerPlayer = Math.ceil(totalRounds / Math.max(players.length, 1));
  const mySongs = roomSongs.filter((song) => song.player_id === currentPlayerId);
  const myQuotaFilled = mySongs.length >= songsPerPlayer;
  const playerSongCounts = players.reduce<Record<string, number>>((acc, player) => {
    acc[player.id] = roomSongs.filter((song) => song.player_id === player.id).length;
    return acc;
  }, {});
  const allPlayersFilled = players.length > 0
    && players.every((player) => (playerSongCounts[player.id] ?? 0) >= songsPerPlayer);
  const autoStartCountdown = autoStartAt
    ? Math.max(0, Math.ceil((new Date(autoStartAt).getTime() - autoStartNow) / 1000))
    : null;

  useEffect(() => {
    setTimeRemaining(selectionTime * 60);
  }, [selectionTime]);

  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
          }
          if (isHost) {
            handleStartGame();
          }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost]);

  const fetchRoomSongs = useCallback(async () => {
    const res = await fetch(`/api/rooms/${roomCode}/songs?player_id=${encodeURIComponent(currentPlayerId)}`);
    const json = await res.json();
    if (json.success) {
      setRoomSongs(json.data);
    }
  }, [currentPlayerId, roomCode]);

  useEffect(() => {
    fetchRoomSongs();
  }, [fetchRoomSongs]);

  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`selection-events:${room.id}`)
      .on('broadcast', { event: 'auto-start-countdown' }, ({ payload }) => {
        const startsAt = typeof payload?.startsAt === 'string' ? payload.startsAt : null;
        if (startsAt) {
          autoStartTriggeredRef.current = true;
          setAutoStartAt(startsAt);
        }
      })
      .on('broadcast', { event: 'auto-start-cancel' }, () => {
        autoStartTriggeredRef.current = false;
        setAutoStartAt(null);
      })
      .subscribe();

    selectionChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      selectionChannelRef.current = null;
      autoStartTriggeredRef.current = false;
    };
  }, [room?.id]);

  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`room-songs:${room.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_songs', filter: `room_id=eq.${room.id}` },
        () => {
          fetchRoomSongs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, fetchRoomSongs]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    searchTimeoutRef.current = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(searchQuery.trim())}&limit=10`);
        const json = await res.json();
        if (json.success) {
          setSearchResults(json.data);
          setSearchError(json.data.length === 0 ? 'Lagu tidak ditemukan.' : null);
        } else {
          setSearchResults([]);
          setSearchError('Lagu tidak ditemukan.');
        }
      } catch (error) {
        console.error('Search failed', error);
        setSearchError('Connection failed.');
        setSearchResults([]);
      }
      setIsSearching(false);
    }, 800);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  useEffect(() => {
    if (!autoStartAt) return;

    setAutoStartNow(Date.now());
    const interval = window.setInterval(() => {
      setAutoStartNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [autoStartAt]);

  useEffect(() => {
    if (!isHost || isStartingGame) return;

    if (allPlayersFilled && !autoStartAt && !autoStartTriggeredRef.current) {
      const startsAt = new Date(Date.now() + 10000).toISOString();
      autoStartTriggeredRef.current = true;
      setAutoStartAt(startsAt);
      selectionChannelRef.current?.send({
        type: 'broadcast',
        event: 'auto-start-countdown',
        payload: { startsAt },
      });
      return;
    }

    if (!allPlayersFilled && autoStartAt) {
      autoStartTriggeredRef.current = false;
      setAutoStartAt(null);
      selectionChannelRef.current?.send({
        type: 'broadcast',
        event: 'auto-start-cancel',
        payload: {},
      });
    }
  }, [allPlayersFilled, autoStartAt, isHost, isStartingGame]);

  useEffect(() => {
    if (!isHost || !autoStartAt || isStartingGame) return;
    if ((autoStartCountdown ?? 1) > 0) return;

    handleStartGame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartAt, autoStartCountdown, isHost, isStartingGame]);

  const handleAddSong = async (track: SearchResult) => {
    if (isAdding || myQuotaFilled) return;

    setIsAdding(track.spotify_id);
    setAddingTrackTitle(track.title);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: currentPlayerId,
          track: {
            spotify_id: track.spotify_id,
            title: track.title,
            artists: track.artists,
            album: track.album,
            album_art_url: track.album_art_url,
            preview_url: track.preview_url,
            youtube_id: track.youtube_id || null,
            duration_ms: track.duration_ms,
            popularity: track.popularity,
          },
        }),
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.error);
      } else {
        await fetchRoomSongs();
      }
    } catch (error) {
      console.error('Failed to add song', error);
    }
    setIsAdding(null);
    setAddingTrackTitle('');
  };

  const handleRemoveSong = async (roomSongId: string) => {
    try {
      await fetch(`/api/rooms/${roomCode}/songs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: currentPlayerId,
          room_song_id: roomSongId,
        }),
      });
      await fetchRoomSongs();
    } catch (error) {
      console.error('Failed to remove song', error);
    }
  };

  const handleStartGame = async () => {
    if (isStartingGame) return;
    setIsStartingGame(true);
    setAutoStartAt(null);

    try {
      const res = await fetch(`/api/rooms/${roomCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_player_id: currentPlayerId }),
      });
      const json = await res.json();
      if (json.success) {
        onGameStarted(json.data.tracks ?? [], json.data.distractor_tracks ?? []);
      } else {
        alert(json.error);
        autoStartTriggeredRef.current = false;
        setIsStartingGame(false);
      }
    } catch (error) {
      console.error('Failed to start game', error);
      autoStartTriggeredRef.current = false;
      setIsStartingGame(false);
    }
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
    } catch (error) {
      console.error('Failed to leave room', error);
    }
    clearRoomPlayerId(roomCode);
    window.location.href = '/';
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const timerColor = timeRemaining <= 30 ? 'text-red-400' : timeRemaining <= 60 ? 'text-amber-400' : 'text-white';
  const timerBarWidth = (timeRemaining / (selectionTime * 60)) * 100;
  const alreadyAdded = new Set(roomSongs.map((song) => song.track?.spotify_id).filter(Boolean));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 text-white sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Chip variant="soft" className="border border-violet-400/20 bg-violet-400/10 text-violet-300">
              Song Selection
            </Chip>
            <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/70">
              Room {roomCode}
            </Chip>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
            Pick your songs
          </h1>
          <p className="text-sm text-white/55">
            Search and add {songsPerPlayer} songs. When the timer runs out, missing slots will be auto-filled.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`font-mono text-3xl font-bold ${timerColor} transition-colors`}>
            {formatTime(timeRemaining)}
          </div>
          <button
            type="button"
            onClick={handleLeaveRoom}
            disabled={isLeaving}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-medium text-white transition hover:bg-red-500/20 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLeaving ? 'Leaving...' : 'Leave room'}
          </button>
        </div>
      </header>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-violet-400"
          animate={{ width: `${timerBarWidth}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {allPlayersFilled && (
        <div className="rounded-[2rem] border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-center shadow-[0_0_40px_rgba(52,211,153,0.08)]">
          <div className="text-[0.65rem] uppercase tracking-[0.35em] text-emerald-200/75">All picks locked</div>
          <div className="mt-2 text-xl font-semibold tracking-[-0.03em] text-white sm:text-2xl">
            {autoStartAt
              ? `Game starts automatically in ${autoStartCountdown ?? 0}s`
              : 'All songs are ready'}
          </div>
          <p className="mt-2 text-sm leading-6 text-emerald-100/75">
            {isHost
              ? 'Kalau belum kamu mulai manual, room akan auto-start setelah 10 detik.'
              : 'Semua lagu sudah masuk. Tunggu host atau countdown auto-start selesai.'}
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_0.6fr]">
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a song..."
              className="h-14 w-full rounded-2xl border border-white/15 bg-black/30 px-5 pr-12 text-base text-white outline-none transition placeholder:text-white/30 focus:border-white/30"
              disabled={myQuotaFilled || !!isAdding}
            />
            {isSearching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              </div>
            )}
          </div>

          {myQuotaFilled && (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-center text-sm text-emerald-300">
              Kamu sudah isi semua {songsPerPlayer} lagu. Tunggu pemain lain atau countdown start.
            </div>
          )}

          {searchError && (
            <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-center text-sm text-red-300">
              {searchError}
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {searchResults.map((track, index) => {
              const isAlreadyAdded = alreadyAdded.has(track.spotify_id);
              const isCurrentlyAdding = isAdding === track.spotify_id;

              return (
                <motion.div
                  key={track.spotify_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: index * 0.04 }}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.07]"
                >
                  {track.album_art_url && (
                    <img
                      src={track.album_art_url}
                      alt={track.album}
                      className="h-14 w-14 shrink-0 rounded-xl border border-white/10 object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-white">{track.title}</div>
                    <div className="mt-0.5 truncate text-sm text-white/50">{track.artists.join(', ')}</div>
                    <div className="mt-0.5 truncate text-xs text-white/30">{track.album}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!track.has_preview && (
                      <Chip variant="soft" className="border border-amber-400/20 bg-amber-400/10 text-amber-300">
                        No preview
                      </Chip>
                    )}
                    {isAlreadyAdded ? (
                      <Chip variant="soft" className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                        Added
                      </Chip>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddSong(track)}
                        disabled={!track.has_preview || myQuotaFilled || !!isAdding}
                        className="inline-flex h-9 items-center rounded-xl bg-white/10 px-4 text-sm font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isCurrentlyAdding ? '...' : '+ Add'}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {searchQuery && !isSearching && searchResults.length === 0 && (
            <div className="py-8 text-center text-sm text-white/40">
              Lagu tidak ditemukan.
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="border border-white/10 bg-white/[0.04] shadow-none">
            <Card.Header className="px-5 pt-5">
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-white">Player Progress</h2>
            </Card.Header>
            <Card.Content className="space-y-3 px-5 pb-5">
              {players.map((player) => {
                const playerSongCount = playerSongCounts[player.id] ?? 0;
                const isMe = player.id === currentPlayerId;
                const progress = Math.min((playerSongCount / songsPerPlayer) * 100, 100);
                const isFull = playerSongCount >= songsPerPlayer;

                return (
                  <div key={player.id} className="space-y-1.5 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {player.display_name || 'Player'}
                        </span>
                        {isMe && (
                          <Chip variant="soft" className="border border-violet-400/20 bg-violet-400/10 text-violet-300">
                            You
                          </Chip>
                        )}
                      </div>
                      <span className={`text-sm font-medium ${isFull ? 'text-emerald-300' : 'text-white/60'}`}>
                        {playerSongCount}/{songsPerPlayer}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${isFull ? 'bg-emerald-400' : 'bg-violet-400'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </Card.Content>
          </Card>

          <Card className="border border-white/10 bg-white/[0.04] shadow-none">
            <Card.Header className="flex items-center justify-between px-5 pt-5">
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-white">My Songs</h2>
              <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/60">
                {mySongs.length}/{songsPerPlayer}
              </Chip>
            </Card.Header>
            <Card.Content className="space-y-2 px-5 pb-5">
              {mySongs.length === 0 ? (
                <div className="py-6 text-center text-sm text-white/40">
                  Search and add songs to get started
                </div>
              ) : (
                mySongs.map((roomSong) => (
                  <div
                    key={roomSong.id}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2.5"
                  >
                    {roomSong.track?.album_art_url && (
                      <img
                        src={roomSong.track.album_art_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-lg border border-white/10 object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">{roomSong.track?.title}</div>
                      <div className="truncate text-xs text-white/50">{roomSong.track?.artists?.join(', ')}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSong(roomSong.id)}
                      disabled={!!isAdding}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/40 transition hover:bg-red-400/10 hover:text-red-400"
                      title="Remove"
                    >
                      x
                    </button>
                  </div>
                ))
              )}
            </Card.Content>
          </Card>

          <Card className="border border-white/10 bg-white/[0.04] shadow-none">
            <Card.Header className="flex items-center justify-between px-5 pt-5">
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-white">All Songs</h2>
              <Chip variant="soft" className="border border-white/10 bg-white/5 text-white/60">
                {roomSongs.length}/{totalRounds}
              </Chip>
            </Card.Header>
            <Card.Content className="max-h-64 space-y-1.5 overflow-y-auto px-5 pb-5">
              {roomSongs.length === 0 ? (
                <div className="py-4 text-center text-sm text-white/40">
                  No songs yet
                </div>
              ) : (
                roomSongs.map((roomSong) => (
                  <div
                    key={roomSong.id}
                    className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/15 p-2"
                  >
                    {roomSong.track?.album_art_url ? (
                      <img
                        src={roomSong.track.album_art_url}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 text-[0.6rem] font-bold text-white/40">
                        #{roomSong.masked_slot}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-white">
                        {roomSong.player_id === currentPlayerId ? roomSong.track?.title : roomSong.masked_label}
                      </div>
                      <div className="truncate text-[0.65rem] text-white/40">
                        {roomSong.player_id === currentPlayerId
                          ? roomSong.track?.artists?.join(', ')
                          : 'Title hidden until the match starts'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </Card.Content>
          </Card>

          {isHost && (
            <Button
              variant="primary"
              size="lg"
              className="w-full bg-white text-black"
              onPress={handleStartGame}
              isDisabled={isStartingGame || roomSongs.length < 4}
            >
              {isStartingGame
                ? 'Starting...'
                : autoStartAt
                  ? `Start Now (${autoStartCountdown ?? 0}s)`
                  : `Start Game (${roomSongs.length}/${totalRounds} songs)`}
            </Button>
          )}
          {!isHost && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center text-sm text-white/50">
              Wait for host set the room and start the game.
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[115] flex items-center justify-center bg-black/65 px-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.98, y: -6 }}
              className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#090b12]/95 p-8 text-center shadow-[0_30px_120px_rgba(0,0,0,0.55)]"
            >
              <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full border border-violet-400/20 bg-violet-400/10">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-300/20 border-t-violet-300" />
              </div>
              <div className="text-[0.65rem] uppercase tracking-[0.45em] text-white/40">Adding song</div>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                Saving to pick list...
              </h3>
              <p className="mt-3 text-sm leading-6 text-white/55">
                {addingTrackTitle
                  ? `"${addingTrackTitle}" lagi dimasukin ke daftar lagu room. Tunggu sebentar ya.`
                  : 'Lagu kamu lagi ditambahin ke daftar room. Tunggu sebentar ya.'}
              </p>
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/8">
                <motion.div
                  className="h-full rounded-full bg-violet-400"
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
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
