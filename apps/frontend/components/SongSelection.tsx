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
  const [isAdding, setIsAdding] = useState<string | null>(null); // spotify_id being added
  const [addingTrackTitle, setAddingTrackTitle] = useState<string>('');
  const [timeRemaining, setTimeRemaining] = useState(0); // in seconds
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const searchTimeoutRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const isHost = room.host_id === currentPlayerId;
  const selectionTime = room.settings?.selection_time ?? 5; // minutes
  const totalRounds = room.settings?.rounds ?? 10;
  const songsPerPlayer = Math.ceil(totalRounds / Math.max(players.length, 1));
  const mySongs = roomSongs.filter((rs) => rs.player_id === currentPlayerId);
  const myQuotaFilled = mySongs.length >= songsPerPlayer;

  // Initialize timer
  useEffect(() => {
    setTimeRemaining(selectionTime * 60);
  }, [selectionTime]);

  // Countdown timer
  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Timer expired — auto-start game (host triggers)
          if (isHost) {
            handleStartGame();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost]);

  // Fetch room songs
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

  // Real-time subscription for room_songs changes
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

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setSearchResults([]);
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
          setSearchError(null);
        } else {
          setSearchResults([]);
          setSearchError(json.error || 'Gagal mencari lagu.');
        }
      } catch (e) {
        console.error('Search failed', e);
        setSearchError('Connection failed.');
        setSearchResults([]);
      }
      setIsSearching(false);
    }, 800);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

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
        if (json.data?.replacement_message) {
          alert(json.data.replacement_message);
        }
        await fetchRoomSongs();
      }
    } catch (e) {
      console.error('Failed to add song', e);
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
    } catch (e) {
      console.error('Failed to remove song', e);
    }
  };

  const handleStartGame = async () => {
    if (isStartingGame) return;
    setIsStartingGame(true);

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
        setIsStartingGame(false);
      }
    } catch (e) {
      console.error('Failed to start game', e);
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
    } catch (e) {
      console.error('Failed to leave room', e);
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
  const alreadyAdded = new Set(roomSongs.map((rs) => rs.track?.spotify_id).filter(Boolean));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 text-white sm:px-6 lg:px-8">
      {/* Header */}
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
            className="inline-flex h-10 items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-medium text-white transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLeaving ? 'Leaving...' : 'Leave room'}
          </button>
        </div>
      </header>

      {/* Timer bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-violet-400"
          animate={{ width: `${timerBarWidth}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.6fr]">
        {/* Left: Search + Results */}
        <div className="space-y-4">
          {/* Search bar */}
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
              ✓ You&#39;ve added all {songsPerPlayer} songs! Waiting for other players...
            </div>
          )}

          {searchError && (
            <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-center text-sm text-red-300">
              {searchError}
            </div>
          )}

          {/* Search results */}
          <AnimatePresence mode="popLayout">
            {searchResults.map((track, i) => {
              const isAlreadyAdded = alreadyAdded.has(track.spotify_id);
              const isCurrentlyAdding = isAdding === track.spotify_id;

              return (
                <motion.div
                  key={track.spotify_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.07]"
                >
                  {/* Album art */}
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
              No results found. Try a different search.
            </div>
          )}
        </div>

        {/* Right: Room songs + Player progress */}
        <div className="space-y-4">
          {/* Player progress */}
          <Card className="border border-white/10 bg-white/[0.04] shadow-none">
            <Card.Header className="px-5 pt-5">
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-white">Player Progress</h2>
            </Card.Header>
            <Card.Content className="space-y-3 px-5 pb-5">
              {players.map((player) => {
                const playerSongCount = roomSongs.filter((rs) => rs.player_id === player.id).length;
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

          {/* My songs */}
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
                mySongs.map((rs) => (
                  <div
                    key={rs.id}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2.5"
                  >
                    {rs.track?.album_art_url && (
                      <img
                        src={rs.track.album_art_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-lg border border-white/10 object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">{rs.track?.title}</div>
                      <div className="truncate text-xs text-white/50">{rs.track?.artists?.join(', ')}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSong(rs.id)}
                      disabled={!!isAdding}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/40 transition hover:bg-red-400/10 hover:text-red-400"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </Card.Content>
          </Card>

          {/* All room songs */}
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
                roomSongs.map((rs) => (
                  <div
                    key={rs.id}
                    className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/15 p-2"
                  >
                    {rs.track?.album_art_url ? (
                      <img
                        src={rs.track.album_art_url}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 text-[0.6rem] font-bold text-white/40">
                        #{rs.masked_slot}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-white">
                        {rs.player_id === currentPlayerId ? rs.track?.title : rs.masked_label}
                      </div>
                      <div className="truncate text-[0.65rem] text-white/40">
                        {rs.player_id === currentPlayerId
                          ? rs.track?.artists?.join(', ')
                          : 'Title hidden until the match starts'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </Card.Content>
          </Card>

          {/* Start game button (host only) */}
          {isHost && (
            <Button
              variant="primary"
              size="lg"
              className="w-full bg-white text-black"
              onPress={handleStartGame}
              isDisabled={isStartingGame || roomSongs.length < 4}
            >
              {isStartingGame ? 'Starting...' : `Start Game (${roomSongs.length}/${totalRounds} songs)`}
            </Button>
          )}
          {!isHost && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center text-sm text-white/50">
              Waiting for the host to start the game...
            </div>
          )}
        </div>
      </div>

      {/* Leave overlay */}
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
            <div className="mt-4 text-sm font-medium tracking-widest text-white uppercase">Leaving the room...</div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
