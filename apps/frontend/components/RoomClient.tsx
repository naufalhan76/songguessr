'use client';

import { useState, useCallback, useEffect } from 'react';
import { Track, Room, Player } from '@songguessr/shared';
import { supabase } from '@/lib/supabase';
import RoomLobby from '@/components/RoomLobby';
import GamePlay from '@/components/GamePlay';
import Leaderboard from '@/components/Leaderboard';

type GamePhase = 'lobby' | 'playing' | 'finished';

interface RoomClientProps {
  roomCode: string;
}

export default function RoomClient({ roomCode }: RoomClientProps) {
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // Load user
  useEffect(() => {
    const loadUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserId(session.user.id);
      }
    };
    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUserId(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch room and tracks for game/leaderboard phases
  const fetchRoomData = useCallback(async () => {
    const res = await fetch(`/api/rooms/${roomCode}`);
    const json = await res.json();
    if (json.success) {
      setRoom(json.data.room);
      setPlayers(json.data.players);
    }

    // Fetch tracks
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
  }, [roomCode]);

  // Monitor room status for phase transitions
  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`room-phase:${room.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        (payload) => {
          const newRoom = payload.new as unknown as Room;
          setRoom(newRoom);
          if (newRoom.status === 'finished' && phase !== 'finished') {
            setPhase('finished');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, phase]);

  const handleGameStarted = useCallback(async (gameTracks: unknown[]) => {
    await fetchRoomData();
    if (gameTracks && Array.isArray(gameTracks) && gameTracks.length > 0) {
      setTracks(gameTracks as Track[]);
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

  if (phase === 'lobby') {
    return <RoomLobby roomCode={roomCode} onGameStarted={handleGameStarted} />;
  }

  if (phase === 'playing' && room && currentUserId) {
    return (
      <GamePlay
        room={room}
        players={players}
        currentUserId={currentUserId}
        roomCode={roomCode}
        tracks={tracks}
        onGameEnd={handleGameEnd}
      />
    );
  }

  if (phase === 'finished' && room) {
    return (
      <Leaderboard
        room={room}
        players={players}
        currentUserId={currentUserId}
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
