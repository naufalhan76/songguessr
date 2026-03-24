'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Room, Player, User } from '@songguessr/shared';

interface UseRoomReturn {
  room: Room | null;
  players: Player[];
  currentUser: User | null;
  isHost: boolean;
  loading: boolean;
  error: string | null;
  hasSpotify: boolean;
  joinRoom: () => Promise<void>;
  toggleReady: (ready: boolean) => Promise<void>;
  startGame: () => Promise<{ tracks: unknown[] } | null>;
  refetch: () => Promise<void>;
}

export function useRoom(roomCode: string): UseRoomReturn {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Check current auth user
  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session?.user) {
        // Fetch or create user profile
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          setCurrentUser(profile as unknown as User);
        } else {
          // Create profile
          const newUser: Partial<User> = {
            id: session.user.id,
            email: session.user.email ?? '',
            display_name: session.user.user_metadata?.full_name ?? session.user.email?.split('@')[0] ?? 'Player',
            avatar_url: session.user.user_metadata?.avatar_url ?? null,
            spotify_access_token: session.provider_token ?? null,
            spotify_refresh_token: session.provider_refresh_token ?? null,
            spotify_expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
          };

          await supabase.from('users').upsert(newUser as unknown as User);
          setCurrentUser(newUser as unknown as User);
        }
      }
    };

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;
      if (session?.user) {
        // Update tokens when auth state changes
        const updates: Record<string, unknown> = {
          id: session.user.id,
          email: session.user.email ?? '',
          display_name: session.user.user_metadata?.full_name ?? session.user.email?.split('@')[0] ?? 'Player',
          avatar_url: session.user.user_metadata?.avatar_url ?? null,
        };

        if (session.provider_token) {
          updates.spotify_access_token = session.provider_token;
          updates.spotify_refresh_token = session.provider_refresh_token ?? null;
          updates.spotify_expires_at = session.expires_at
            ? new Date(session.expires_at * 1000).toISOString()
            : null;
        }

        await supabase.from('users').upsert(updates as unknown as User);
        setCurrentUser(updates as unknown as User);
      } else {
        setCurrentUser(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

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
        () => {
          // Re-fetch all players on any change
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
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, fetchRoom]);

  const isHost = Boolean(currentUser?.id && room?.host_id === currentUser.id);
  const hasSpotify = Boolean(currentUser?.spotify_access_token);

  const joinRoom = useCallback(async () => {
    if (!currentUser?.id) return;

    const res = await fetch(`/api/rooms/${roomCode}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id }),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error);
    } else {
      await fetchRoom();
    }
  }, [currentUser?.id, roomCode, fetchRoom]);

  const toggleReady = useCallback(
    async (ready: boolean) => {
      if (!currentUser?.id) return;

      await fetch(`/api/rooms/${roomCode}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, is_ready: ready }),
      });
    },
    [currentUser?.id, roomCode]
  );

  const startGame = useCallback(async () => {
    if (!currentUser?.id) return null;

    const res = await fetch(`/api/rooms/${roomCode}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_id: currentUser.id }),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error);
      return null;
    }
    return json.data;
  }, [currentUser?.id, roomCode]);

  return {
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
    refetch: fetchRoom,
  };
}
