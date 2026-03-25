// Shared TypeScript types for muze

// Database types (matching Supabase tables)
export interface User {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  spotify_access_token: string | null;
  spotify_refresh_token: string | null;
  spotify_expires_at: string | null;
  created_at: string;
}

export interface Room {
  id: string;
  code: string;
  room_name: string | null;
  host_id: string;
  status: 'waiting' | 'selecting' | 'active' | 'finished';
  settings: RoomSettings;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface RoomSettings {
  rounds: number; // default 10
  time_per_round: number; // seconds, default 30
  max_players: number; // default 4
  allow_skips: boolean;
  point_system: 'speed' | 'correct_only';
  selection_time: number; // minutes, default 5 (options: 5, 10, 15)
}

export interface Player {
  id: string;
  room_id: string;
  user_id: string | null; // nullable for guest players
  display_name: string | null;
  score: number;
  is_ready: boolean;
  joined_at: string;
}

export interface Track {
  id: string;
  spotify_id: string;
  title: string;
  artists: string[];
  album: string;
  preview_url: string | null;
  youtube_id: string | null;
  duration_ms: number;
  popularity: number;
  album_art_url: string;
  cached_at: string;
}

export interface RoomSong {
  id: string;
  room_id: string;
  player_id: string;
  track_id: string;
  added_at: string;
}

export interface GameRound {
  id: string;
  room_id: string;
  round_number: number;
  track_id: string;
  started_at: string;
  ended_at: string | null;
}

export interface PlayerAnswer {
  id: string;
  round_id: string;
  player_id: string;
  selected_track_id: string;
  is_correct: boolean;
  time_taken_ms: number;
  points_awarded: number;
  answered_at: string;
}

// Real-time event types
export type RoomEvent =
  | { type: 'player_joined'; payload: Player }
  | { type: 'player_left'; payload: { player_id: string } }
  | { type: 'player_ready'; payload: { player_id: string; is_ready: boolean } }
  | { type: 'room_started'; payload: { room_id: string } }
  | { type: 'song_added'; payload: RoomSong & { track: Track } }
  | { type: 'song_removed'; payload: { room_song_id: string } }
  | { type: 'selection_started'; payload: { room_id: string; ends_at: string } }
  | { type: 'round_started'; payload: GameRound & { track: Track; options: Track[] } }
  | { type: 'round_ended'; payload: { round_id: string } }
  | { type: 'answer_submitted'; payload: PlayerAnswer }
  | { type: 'score_updated'; payload: { player_id: string; score: number } }
  | { type: 'game_ended'; payload: { room_id: string; final_scores: Array<{ player_id: string; score: number }> } };

// Spotify API types
export interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: { name: string; images: Array<{ url: string }> };
  preview_url: string | null;
  duration_ms: number;
  popularity: number;
}

export interface SpotifySearchResult {
  tracks: SpotifyTrack[];
  total: number;
}

// Guest session (stored in localStorage)
export interface GuestSession {
  id: string; // generated UUID for guest player identification
  display_name: string;
  created_at: string;
}

// Game state types
export interface LobbyState {
  room: Room;
  players: Player[];
  currentPlayerId: string | null;
  isHost: boolean;
}

export interface GameState {
  currentRound: number;
  totalRounds: number;
  timeRemaining: number;
  track: Track | null;
  options: Track[];
  answered: boolean;
  scores: Record<string, number>;
}

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = Record<string, any>;

// Supabase Database Row type for rooms (settings stored as JSONB)
export interface RoomRow {
  id: string;
  code: string;
  room_name: string | null;
  host_id: string;
  status: string;
  settings: Json;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

// Supabase Database types
export type Database = {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Partial<User> & { id: string };
        Update: Partial<User>;
      };
      rooms: {
        Row: RoomRow;
        Insert: Partial<RoomRow> & { code: string; host_id: string };
        Update: Partial<RoomRow>;
      };
      players: {
        Row: Player;
        Insert: Partial<Player> & { room_id: string };
        Update: Partial<Player>;
      };
      tracks: {
        Row: Track;
        Insert: Partial<Track> & { spotify_id: string; title: string; artists: string[]; album: string; duration_ms: number };
        Update: Partial<Track>;
      };
      room_songs: {
        Row: RoomSong;
        Insert: Partial<RoomSong> & { room_id: string; player_id: string; track_id: string };
        Update: Partial<RoomSong>;
      };
      game_rounds: {
        Row: GameRound;
        Insert: Partial<GameRound> & { room_id: string; round_number: number; track_id: string };
        Update: Partial<GameRound>;
      };
      player_answers: {
        Row: PlayerAnswer;
        Insert: Partial<PlayerAnswer> & { round_id: string; player_id: string; selected_track_id: string; is_correct: boolean; time_taken_ms: number; points_awarded: number };
        Update: Partial<PlayerAnswer>;
      };
    };
  };
};
