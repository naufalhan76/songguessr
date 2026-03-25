'use client';

import { useState, useCallback, useEffect } from 'react';
import { Track, Room, Player } from '@songguessr/shared';
import { clearRoomPlayerId, getRoomPlayerId, supabase } from '@/lib/supabase';
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

  useEffect(() => {
    const savedPlayerId = getRoomPlayerId(roomCode);
    if (savedPlayerId) {
      setCurrentPlayerId(savedPlayerId);
    }
  }, [roomCode]);

  const fetchRoomData = useCallback(async (forceTrackFetch = false) => {
    const res = await fetch(`/api/rooms/${roomCode}`);
    const json = await res.json();

    if (!json.success) {
      return;
    }

    setRoom(json.data.room);
    setPlayers(json.data.players);

    const status = json.data.room.status as Room['status'];
    if (status === 'selecting' && phase === 'lobby') {
      setPhase('selecting');
    }

    const shouldFetchTracks = forceTrackFetch || phase === 'playing' || phase === 'finished';
    if (json.data.room.id && shouldFetchTracks) {
      const { data: rounds } = await supabase
        .from('game_rounds')
        .select('track_id')
        .eq('room_id', json.data.room.id);

      if (rounds && rounds.length > 0) {
        const trackIds = rounds.map((round) => round.track_id);
        const { data: dbTracks } = await supabase
          .from('tracks')
          .select('*')
          .in('id', trackIds);

        if (dbTracks) {
          setTracks(dbTracks as unknown as Track[]);
        }
      }
    }
  }, [phase, roomCode]);

  useEffect(() => {
    if (!room?.id) return;

    const roomChannel = supabase
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

          if (payload.eventType !== 'UPDATE') return;

          const newRoom = payload.new as unknown as Room;
          setRoom(newRoom);

          if (newRoom.status === 'selecting' && phase === 'lobby') {
            setPhase('selecting');
          }

          if (newRoom.status === 'active' && (phase === 'selecting' || phase === 'lobby')) {
            fetchRoomData(true).then(() => setPhase('playing'));
          }

          if (newRoom.status === 'finished' && phase !== 'finished') {
            fetchRoomData(true).then(() => setPhase('finished'));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(roomChannel);
    };
  }, [fetchRoomData, phase, room?.id, roomCode]);

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

          setLeaveNotification(`${name} telah meninggalkan pertandingan`);
          setTimeout(() => setLeaveNotification(null), 4000);
          fetchRoomData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playerChannel);
    };
  }, [fetchRoomData, room?.id]);

  const handleSelectionStarted = useCallback(() => {
    fetchRoomData();
    setPhase('selecting');
  }, [fetchRoomData]);

  const handleGameStarted = useCallback(async (gameTracks: unknown[], gameDistractors?: unknown[]) => {
    await fetchRoomData();
    if (Array.isArray(gameTracks) && gameTracks.length > 0) {
      setTracks(gameTracks as Track[]);
    }
    if (Array.isArray(gameDistractors)) {
      setDistractorTracks(gameDistractors as Array<{ id: string; title: string; artists: string[] }>);
    }
    setPhase('playing');
  }, [fetchRoomData]);

  const handleGameEnd = useCallback(async () => {
    if (room?.id) {
      await supabase
        .from('rooms')
        .update({ status: 'finished', ended_at: new Date().toISOString() })
        .eq('id', room.id);
    }
    await fetchRoomData(true);
    setPhase('finished');
  }, [fetchRoomData, room?.id]);

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
          <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 animate-pulse rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm font-medium text-amber-300 shadow-lg backdrop-blur-sm">
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4 py-5 text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <div className="text-sm text-white/55">Loading...</div>
      </div>
    </main>
  );
}
