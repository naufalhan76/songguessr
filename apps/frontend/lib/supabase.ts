import { createClient } from '@supabase/supabase-js';
import { GuestSession } from '@songguessr/shared';

// Supabase client — used for realtime subscriptions only (no auth)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.com';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Guest session management (localStorage-based)
const GUEST_SESSION_KEY = 'songguessr_guest_session';

/**
 * Get the current guest session, or null if none exists.
 */
export function getGuestSession(): GuestSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(GUEST_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GuestSession;
  } catch {
    return null;
  }
}

/**
 * Create a new guest session with a display name.
 */
export function createGuestSession(displayName: string): GuestSession {
  const session: GuestSession = {
    id: crypto.randomUUID(),
    display_name: displayName.trim(),
    created_at: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session));
  }

  return session;
}

/**
 * Update guest session display name.
 */
export function updateGuestDisplayName(displayName: string): GuestSession | null {
  const session = getGuestSession();
  if (!session) return null;

  session.display_name = displayName.trim();
  if (typeof window !== 'undefined') {
    localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session));
  }
  return session;
}

/**
 * Clear the guest session.
 */
export function clearGuestSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(GUEST_SESSION_KEY);
  }
}

/**
 * Store the player_id for the current room session.
 * This is used to identify the guest player across page reloads within a room.
 */
export function setRoomPlayerId(roomCode: string, playerId: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`songguessr_player_${roomCode}`, playerId);
  }
}

/**
 * Get the player_id for the current room session.
 */
export function getRoomPlayerId(roomCode: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(`songguessr_player_${roomCode}`);
}

/**
 * Clear the room player_id.
 */
export function clearRoomPlayerId(roomCode: string): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(`songguessr_player_${roomCode}`);
  }
}