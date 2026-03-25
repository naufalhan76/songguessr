'use client';

import { useState, useCallback, useEffect } from 'react';
import { Track, Room, Player } from '@songguessr/shared';
import { clearRoomPlayerId, supabase, getRoomPlayerId } from '@/lib/supabase';
import RoomLobby from '@/components/RoomLobby';
import SongSelection from '@/components/SongSelection';
import GamePlay from '@/components/GamePlay';
import Leaderboard from '@/components/Leaderboard';

type GamePhase = 'lobby' | 'selecting' | 'playing' | 'finished';

interface RoomClientProps {
  roomCode: string;
}

export default function RoomClient({ roomCode }: RoomClientProps) {
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [distractorTracks, setDistractorTracks] = useState<Array<{ id: string; title: string; artists: string[] }>>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerId, setCurrentPlayerId] = useState<string>('');
  const [leaveNotification, setLeaveNotification] = useState<string | null>(null);

  // Restore player ID from localStorage
  useEffect(() => {
    const savedPlayerId = getRoomPlayerId(roomCode);
    if (savedPlayerId) {
      setCurrentPlayerId(savedPlayerId);
    }
  }, [roomCode]);

  // Fetch room and tracks for game/leaderboard phases
  const fetchRoomData = useCallback(async (forceTrackFetch = false) => {
    const res = await fetch(`/api/rooms/${roomCode}`);
    const json = await res.json();
    if (json.success) {
      setRoom(json.data.room);
      setPlayers(json.data.players);

      // Update phase based on room status
      const status = json.data.room.status;
      if (status === 'selecting' && phase === 'lobby') {
        setPhase('selecting');
      }
    }

    // Fetch tracks for when in game or leaderboard phase, or when forced (e.g. non-host transitioning to active)
    const shouldFetchTracks = forceTrackFetch || phase === 'playing' || phase === 'finished';
    if (json.data?.room?.id && shouldFetchTracks) {
      const { data: rounds } = await supabase
        .from('game_rounds')
        .select('track_id')
        .eq('room_id', json.data.room.id);

      if (rounds && rounds.length > 0) {
        const trackIds = rounds.map((r) => r.track_id);
        const { data: dbTracks } = await supabase
          .from('tracks')
          .select('*')
          .in('id', trackIds);

        if (dbTracks) {
          setTracks(dbTracks as unknown as Track[]);
        }
      }
    }
  }, [roomCode, phase]);

  // Monitor room status for phase transitions
  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`room-phase:${room.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            clearRoomPlayerId(roomCode);
            window.location.href = '/?error=' + encodeURIComponent('Room was closed by the host.');
            return;
          }

          if (payload.eventType === 'UPDATE') {
            const newRoom = payload.new as unknown as Room;
            setRoom(newRoom);

            if (newRoom.status === 'selecting' && phase === 'lobby') {
              setPhase('selecting');
            }
            if (newRoom.status === 'active' && (phase === 'selecting' || phase === 'lobby')) {
              fetchRoomData(true).then(() => setPhase('playing'));
            }
            if (newRoom.status === 'finished' && phase !== 'finished') {
              setPhase('finished');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, phase, fetchRoomData, roomCode]);

  const handleSelectionStarted = useCallback(() => {
    fetchRoomData();
    setPhase('selecting');
  }, [fetchRoomData]);

  const handleGameStarted = useCallback(async (gameTracks: unknown[], gameDistractors?: unknown[]) => {
    await fetchRoomData();
    if (gameTracks && Array.isArray(gameTracks) && gameTracks.length > 0) {
      setTracks(gameTracks as Track[]);
    }
    if (gameDistractors && Array.isArray(gameDistractors)) {
      setDistractorTracks(gameDistractors as Array<{ id: string; title: string; artists: string[] }>);
    }
    setPhase('playing');
  }, [fetchRoomData]);

  const handleGameEnd = useCallback(async () => {
    // Mark room as finished
    if (room?.id) {
      await supabase
        .from('rooms')
        .update({ status: 'finished', ended_at: new Date().toISOString() })
        .eq('id', room.id);
    }
    await fetchRoomData();
    setPhase('finished');
  }, [room?.id, fetchRoomData]);

  // Real-time player leave detection (must be after handleGameEnd declaration)
  useEffect(() => {
    if (!room?.id) return;

    const playerChannel = supabase
      .channel(`player-leave:${room.id}`)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` },
        (payload) => {
          const leavingPlayer = payload.old as unknown as Player;
          const name = leavingPlayer?.display_name || 'A player';

          // Show notification
          setLeaveNotification(`${name} telah meninggalkan pertandingan`);
          setTimeout(() => setLeaveNotification(null), 4000);

          // Refresh player list
          fetchRoomData().then(() => {
            // Check if only 1 player remains during active game — auto-end
            if (phase === 'playing') {
              supabase
                .from('players')
                .select('id')
                .eq('room_id', room.id)
                .then(({ data: remaining }) => {
                  if (remaining && remaining.length <= 1) {
                    handleGameEnd();
                  }
                });
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playerChannel);
    };
  }, [room?.id, phase, fetchRoomData, handleGameEnd]);

  // Update currentPlayerId when it changes
  const handlePlayerIdSet = useCallback((playerId: string) => {
    setCurrentPlayerId(playerId);
  }, []);

  if (phase === 'lobby') {
    return (
      <RoomLobby
        roomCode={roomCode}
        onSelectionStarted={handleSelectionStarted}
        onPlayerIdSet={handlePlayerIdSet}
      />
    );
  }

  if (phase === 'selecting' && room && currentPlayerId) {
    return (
      <SongSelection
        room={room}
        players={players}
        currentPlayerId={currentPlayerId}
        roomCode={roomCode}
        onGameStarted={handleGameStarted}
      />
    );
  }

  if (phase === 'playing' && room && currentPlayerId) {
    return (
      <>
        {leaveNotification && (
          <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 animate-pulse rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm font-medium text-amber-300 shadow-lg backdrop-blur-sm">
            {leaveNotification}
          </div>
        )}
        <GamePlay
          room={room}
          players={players}
          currentPlayerId={currentPlayerId}
          roomCode={roomCode}
          tracks={tracks}
          distractorTracks={distractorTracks}
          onGameEnd={handleGameEnd}
        />
      </>
    );
  }

  if (phase === 'finished' && room) {
    return (
      <Leaderboard
        room={room}
        players={players}
        currentUserId={currentPlayerId}
        roomCode={roomCode}
        tracks={tracks}
      />
    );
  }

  // Fallback loading state
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4 py-5 text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <div className="text-sm text-white/55">Loading...</div>
      </div>
    </main>
  );
}
