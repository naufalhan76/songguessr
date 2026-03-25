'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, getGuestSession, getRoomPlayerId, setRoomPlayerId } from '@/lib/supabase';
import { Room, Player } from '@songguessr/shared';

interface UseRoomReturn {
  room: Room | null;
  players: Player[];
  currentPlayerId: string | null;
  currentPlayerName: string | null;
  isHost: boolean;
  loading: boolean;
  error: string | null;
  joinRoom: (displayName: string) => Promise<Player | null>;
  toggleReady: (ready: boolean) => Promise<boolean>;
  startSelection: () => Promise<boolean>;
  startGame: () => Promise<{ tracks: unknown[] } | null>;
  updateSettings: (settings: Record<string, unknown>) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useRoom(roomCode: string): UseRoomReturn {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [currentPlayerName, setCurrentPlayerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Restore player_id from localStorage on mount
  useEffect(() => {
    const savedPlayerId = getRoomPlayerId(roomCode);
    if (savedPlayerId) {
      setCurrentPlayerId(savedPlayerId);
    }

    const savedSession = getGuestSession();
    if (savedSession) {
      setCurrentPlayerName(savedSession.display_name);
    }
  }, [roomCode]);

  // Fetch room data
  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomCode}`);
      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? 'Failed to load room');
        setLoading(false);
        return;
      }

      setRoom(json.data.room);
      setPlayers(json.data.players);
      setError(null);
    } catch (e) {
      setError('Failed to load room');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [roomCode]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  // Real-time subscription
  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        (payload) => {
          if (payload.new) {
            setRoom(payload.new as unknown as Room);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` },
        (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new) {
            setPlayers((prev) => prev.map((player) => (
              player.id === payload.new.id ? (payload.new as unknown as Player) : player
            )));
            return;
          }

          fetchRoom();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_rounds', filter: `room_id=eq.${room.id}` },
        () => {
          fetchRoom();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_songs', filter: `room_id=eq.${room.id}` },
        () => {
          fetchRoom();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, fetchRoom]);

  const isHost = Boolean(currentPlayerId && room?.host_id === currentPlayerId);

  const joinRoom = useCallback(async (displayName: string): Promise<Player | null> => {
    const res = await fetch(`/api/rooms/${roomCode}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName }),
    });
    const json = await res.json();

    if (!json.success) {
      setError(json.error);
      return null;
    }

    const player = json.data as Player;
    setCurrentPlayerId(player.id);
    setCurrentPlayerName(displayName);
    setRoomPlayerId(roomCode, player.id);
    await fetchRoom();
    return player;
  }, [roomCode, fetchRoom]);

  const toggleReady = useCallback(
    async (ready: boolean) => {
      if (!currentPlayerId) return false;

      const previousPlayers = players;
      setPlayers((prev) => prev.map((player) => (
        player.id === currentPlayerId
          ? { ...player, is_ready: ready }
          : player
      )));

      try {
        const res = await fetch(`/api/rooms/${roomCode}/ready`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_id: currentPlayerId, is_ready: ready }),
        });

        const json = await res.json();
        if (!json.success) {
          setPlayers(previousPlayers);
          setError(json.error ?? 'Failed to update readiness');
          return false;
        }

        return true;
      } catch (error) {
        console.error('Failed to update ready state', error);
        setPlayers(previousPlayers);
        setError('Failed to update readiness');
        return false;
      }
    },
    [currentPlayerId, players, roomCode]
  );

  const startSelection = useCallback(async (): Promise<boolean> => {
    if (!currentPlayerId) return false;

    const res = await fetch(`/api/rooms/${roomCode}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_id: currentPlayerId, status: 'selecting' }),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error);
      return false;
    }
    setRoom(json.data as unknown as Room);
    return true;
  }, [currentPlayerId, roomCode]);

  const startGame = useCallback(async () => {
    if (!currentPlayerId) return null;

    const res = await fetch(`/api/rooms/${roomCode}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_player_id: currentPlayerId }),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error);
      return null;
    }
    return json.data;
  }, [currentPlayerId, roomCode]);

  const updateSettings = useCallback(
    async (settings: Record<string, unknown>): Promise<boolean> => {
      if (!currentPlayerId) return false;

      try {
        const res = await fetch(`/api/rooms/${roomCode}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ host_id: currentPlayerId, ...settings }),
        });
        const json = await res.json();
        if (!json.success) {
          setError(json.error);
          return false;
        }
        setRoom(json.data as unknown as Room);
        return true;
      } catch (e) {
        console.error('Failed to update settings', e);
        return false;
      }
    },
    [currentPlayerId, roomCode]
  );

  return {
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
    startGame,
    updateSettings,
    refetch: fetchRoom,
  };
}
